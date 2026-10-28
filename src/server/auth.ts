import { Request, Response, NextFunction } from 'express';
import { dbService } from './db.js';
import { UserRole, UserSession } from '../types';
import { getLimits } from '../lib/plans.js';

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
 * Validates agent secret key
 */
export function validateAgentKey(key?: string): { valid: boolean; agentId: string; role: UserRole } {
  if (!key) return { valid: false, agentId: '', role: 'viewer' };
  const expectedKey = process.env.AGENT_SECRET_KEY || 'agent_secret_default_podconnect';
  const isDev = process.env.NODE_ENV !== 'production';

  if (key === expectedKey || (isDev && key === 'agent_test_key_podconnect')) {
    return { valid: true, agentId: 'agent_default', role: 'owner' };
  }
  return { valid: false, agentId: '', role: 'viewer' };
}

/**
 * Authentication & Multi-Tenant Context Middleware
 * Resolves user/agent identity, validates active sessions, and injects workspace context.
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // 1. Extract bearer token or custom session header
  const authHeader = req.headers.authorization;
  const sessionHeader = (req.headers['x-session-token'] as string) || '';
  let token = sessionHeader;

  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // 2. If token present, check SQLite sessions table
  if (token) {
    const session = dbService.getSession(token);
    if (session) {
      if (session.revokedAt) {
        return res.status(401).json({ error: 'Unauthorized: Session has been revoked.' });
      }
      if (new Date(session.expiresAt).getTime() < Date.now()) {
        return res.status(401).json({ error: 'Unauthorized: Session has expired. Please sign in again.' });
      }

      req.session = session;
      req.user = {
        uid: session.userId,
        email: session.email,
        isAgent: session.authType === 'agent_key',
      };

      // Tenant override via header if permitted
      const requestedTenant = (req.headers['x-tenant-id'] as string) || '';
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

    // Check direct agent key
    const agentCheck = validateAgentKey(token);
    if (agentCheck.valid) {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'tenant_default';
      req.user = {
        uid: agentCheck.agentId,
        email: `${agentCheck.agentId}@podconnect.agent`,
        isAgent: true,
      };
      req.tenantId = tenantId;
      req.userRole = agentCheck.role;
      return next();
    }
  }

  // 3. Fallback: Parse user from legacy custom headers or JWT payload (for local dev/sandbox)
  let userId = (req.headers['x-user-id'] as string) || '';
  let userEmail = (req.headers['x-user-email'] as string) || '';

  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.user_id || payload.sub) {
          userId = userId || payload.user_id || payload.sub;
          userEmail = userEmail || payload.email || '';
        }
      }
    } catch {
      // Ignore invalid JWT format
    }
  }

  // Fallback for local sandbox / default operator
  if (!userId) {
    userId = 'operator_system';
    userEmail = 'operator@podconnect.agency';
  }

  // 4. Resolve Active Tenant / Workspace
  let tenantId = (req.headers['x-tenant-id'] as string) || '';
  if (!tenantId) {
    const tenants = dbService.getTenantsForUser(userId, userEmail);
    tenantId = tenants.length > 0 ? tenants[0].id : 'tenant_default';
  }

  // 5. Resolve User Role in this Tenant
  const role = dbService.getUserRoleInTenant(tenantId, userId, userEmail) || 'owner';

  req.user = { uid: userId, email: userEmail, isAgent: false };
  req.tenantId = tenantId;
  req.userRole = role;

  next();
}

/**
 * Role-Based Access Control (RBAC) Guard
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = req.userRole;
    if (!role || !allowedRoles.includes(role)) {
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
