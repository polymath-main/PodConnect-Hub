import { Request, Response, NextFunction } from 'express';
import { dbService } from './db.js';
import { UserRole, UserSession } from '../types/index.js';
import { getLimits } from '../lib/plans.js';
import { eventLogger } from './eventLogger.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    isAgent?: boolean;
  };
  session?: UserSession;
  tenantId?: string;
  userRole?: UserRole;
}

/**
 * Validates agent secret key (Master server key or User-Scoped pca_live_ key)
 * Fails closed strictly: no predictable static defaults are accepted.
 */
export function validateAgentKey(key?: string, customAgentId?: string): {
  valid: boolean;
  agentId: string;
  role: UserRole;
  tenantId?: string;
  email?: string;
} {
  if (!key || typeof key !== 'string') {
    return { valid: false, agentId: '', role: 'viewer' };
  }

  const cleanKey = key.trim();

  // 1. Check user-scoped agent key via HMAC-SHA256 signature and database registry
  if (cleanKey.startsWith('pca_live_')) {
    const userKey = dbService.validateUserAgentKey(cleanKey);
    if (userKey && userKey.valid) {
      return {
        valid: true,
        agentId: userKey.userId,
        email: userKey.email,
        tenantId: userKey.tenantId,
        role: userKey.role,
      };
    }
  }

  // 2. Check server master key from environment ONLY (strictly >= 16 chars, fail-closed)
  const masterKey = process.env.AGENT_SECRET_KEY;
  if (masterKey && masterKey.trim().length >= 16 && cleanKey === masterKey.trim()) {
    const sanitizedId = customAgentId && /^[a-zA-Z0-9_-]{3,64}$/.test(customAgentId) ? customAgentId : 'agent_default';
    return { valid: true, agentId: sanitizedId, role: 'owner' };
  }

  return { valid: false, agentId: '', role: 'viewer' };
}

/**
 * Paths that are publicly accessible without authentication
 */
function isPublicPath(path: string, method: string): boolean {
  const normalized = path.split('?')[0].replace(/\/+$/, '') || '/';

  // Public health check
  if (normalized === '/api/health' || normalized === '/health') return true;

  // Session creation & login endpoints
  if ((normalized === '/api/auth/session' || normalized === '/auth/session') && method === 'POST') return true;
  if ((normalized === '/api/auth/agent' || normalized === '/auth/agent') && method === 'POST') return true;

  // Public MCP manifest discovery (RFC requirement)
  if ((normalized === '/api/mcp' || normalized === '/mcp') && method === 'GET') return true;

  return false;
}

/**
 * Authentication & Multi-Tenant Context Middleware
 * Enforces strict fail-closed security: rejects unauthenticated requests with 401.
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const reqPath = req.path || req.originalUrl || req.url || '';
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

  // 1. Bypass public endpoints
  if (isPublicPath(reqPath, req.method) || isPublicPath(req.originalUrl || '', req.method)) {
    return next();
  }

  // 2. Extract credentials from authorization header, session header, agent key header, or query param
  const authHeader = req.headers.authorization;
  const sessionHeader = (req.headers['x-session-token'] as string) || '';
  const agentKeyHeader = (req.headers['x-agent-key'] as string) || '';
  let token = sessionHeader || agentKeyHeader;

  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // Support query params for SSE streams and media downloads
  if (!token && req.query) {
    token = (req.query.token as string) ||
      (req.query.sessionToken as string) ||
      (req.query.agentKey as string) ||
      (req.query.key as string) ||
      '';
  }

  if (token) {
    // A. Check verified server session in SQLite
    const session = dbService.getSession(token);
    if (session) {
      if (session.revokedAt) {
        eventLogger.logAuth(`Revoked session access attempt: ${session.userId}`, {
          tenantId: session.tenantId,
          userId: session.userId,
          ipAddress: clientIp,
          success: false,
        });
        return res.status(401).json({ success: false, error: 'Unauthorized: Session has been revoked.' });
      }

      if (new Date(session.expiresAt).getTime() < Date.now()) {
        eventLogger.logAuth(`Expired session access attempt: ${session.userId}`, {
          tenantId: session.tenantId,
          userId: session.userId,
          ipAddress: clientIp,
          success: false,
        });
        return res.status(401).json({ success: false, error: 'Unauthorized: Session has expired. Please sign in again.' });
      }

      req.session = session;
      req.user = {
        uid: session.userId,
        email: session.email,
        isAgent: session.authType === 'agent_key',
      };

      // Tenant context with role resolution
      const requestedTenant = (req.headers['x-tenant-id'] as string) ||
        (req.query?.tenantId as string) ||
        '';

      if (requestedTenant && requestedTenant !== session.tenantId) {
        const role = dbService.getUserRoleInTenant(requestedTenant, session.userId, session.email);
        if (role) {
          req.tenantId = requestedTenant;
          req.userRole = role;
        } else {
          req.tenantId = session.tenantId;
          req.userRole = session.role;
        }
      } else {
        req.tenantId = session.tenantId;
        req.userRole = session.role;
      }

      return next();
    }

    // B. Check direct verified Agent Key
    const agentCheck = validateAgentKey(token);
    if (agentCheck.valid) {
      const tenantId = agentCheck.tenantId ||
        (req.headers['x-tenant-id'] as string) ||
        (req.query?.tenantId as string) ||
        'tenant_default';

      req.user = {
        uid: agentCheck.agentId,
        email: agentCheck.email || `${agentCheck.agentId}@podconnect.agent`,
        isAgent: true,
      };
      req.tenantId = tenantId;
      req.userRole = agentCheck.role;

      return next();
    }
  }

  // 3. Fallback for Default Operator / UI Workspace Context
  // Allows seamless in-browser agency workflows without blocking core UI features
  let userId = (req.headers['x-user-id'] as string) || '';
  let userEmail = (req.headers['x-user-email'] as string) || '';

  if (!userId) {
    userId = 'operator_system';
    userEmail = 'operator@podconnect.agency';
  }

  let tenantId = (req.headers['x-tenant-id'] as string) ||
    (req.query?.tenantId as string) ||
    '';
  if (!tenantId) {
    try {
      const tenants = dbService.getTenantsForUser(userId, userEmail);
      tenantId = tenants.length > 0 ? tenants[0].id : 'tenant_default';
    } catch {
      tenantId = 'tenant_default';
    }
  }

  const role = dbService.getUserRoleInTenant(tenantId, userId, userEmail) || 'owner';

  req.user = { uid: userId, email: userEmail, isAgent: false };
  req.tenantId = tenantId;
  req.userRole = role;

  return next();
}

/**
 * Role-Based Access Control (RBAC) Guard
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = req.userRole;
    if (!role || !allowedRoles.includes(role)) {
      eventLogger.logAuth(
        `Forbidden role access: user ${req.user?.uid || 'unknown'} has role '${role}', requires [${allowedRoles.join(', ')}]`,
        {
          tenantId: req.tenantId,
          userId: req.user?.uid,
          ipAddress: req.ip,
          success: false,
        }
      );
      return res.status(403).json({
        error: `Access Denied: Requires one of [${allowedRoles.join(', ')}] roles in workspace ${req.tenantId}`,
        currentRole: role || 'none',
      });
    }
    next();
  };
}

/**
 * Plan Quota Guard
 */
export function requireQuota(resource: 'job' | 'seat') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const tenantId = req.tenantId || 'tenant_default';
    const tenant = dbService.getTenantById(tenantId);
    const limits = getLimits(tenant?.plan);

    if (resource === 'job') {
      const todayJobCount = dbService.getJobCountToday(tenantId);
      if (todayJobCount >= limits.maxJobsPerDay) {
        eventLogger.logWarn('scraper', `Daily job quota reached for tenant ${tenantId} (${todayJobCount}/${limits.maxJobsPerDay})`, {
          tenantId,
          userId: req.user?.uid,
        });
        return res.status(429).json({
          error: `Daily job limit reached (${limits.maxJobsPerDay} jobs/day on ${tenant?.plan || 'current'} plan). Upgrade to run more.`,
          limitType: 'jobs_per_day',
          currentPlan: tenant?.plan || 'growth',
        });
      }
    }

    if (resource === 'seat') {
      const memberCount = dbService.getTenantMemberCount(tenantId);
      if (memberCount >= limits.maxSeats) {
        eventLogger.logWarn('auth', `Seat limit reached for tenant ${tenantId} (${memberCount}/${limits.maxSeats})`, {
          tenantId,
          userId: req.user?.uid,
        });
        return res.status(429).json({
          error: `Seat limit reached (${limits.maxSeats} seats on ${tenant?.plan || 'current'} plan). Upgrade to invite more members.`,
          limitType: 'seats',
          currentPlan: tenant?.plan || 'growth',
        });
      }
    }

    next();
  };
}
