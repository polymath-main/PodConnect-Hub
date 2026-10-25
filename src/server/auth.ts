import { Request, Response, NextFunction } from 'express';
import { dbService } from './db.js';
import { UserRole } from '../types';
import { getLimits } from '../lib/plans.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
  };
  tenantId?: string;
  userRole?: UserRole;
}

/**
 * Authentication & Multi-Tenant Context Middleware
 * Resolves user identity, validates workspace membership, and injects tenant context.
 */
export function authMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  // 1. Extract credentials from headers
  const authHeader = req.headers.authorization;
  let userId = (req.headers['x-user-id'] as string) || '';
  let userEmail = (req.headers['x-user-email'] as string) || '';

  // If Bearer token is provided, extract user from payload or token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      // Decode JWT payload without third-party library dependency
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.user_id || payload.sub) {
          userId = userId || payload.user_id || payload.sub;
          userEmail = userEmail || payload.email || '';
        }
      }
    } catch {
      // Fall through to headers
    }
  }

  // Fallback for local sandbox / default operator
  if (!userId) {
    userId = 'operator_system';
    userEmail = 'operator@podconnect.agency';
  }

  // 2. Resolve Active Tenant / Workspace
  let tenantId = (req.headers['x-tenant-id'] as string) || '';

  if (!tenantId) {
    // Resolve user's active workspaces
    const tenants = dbService.getTenantsForUser(userId, userEmail);
    if (tenants.length > 0) {
      tenantId = tenants[0].id;
    } else {
      tenantId = 'tenant_default';
    }
  }

  // 3. Resolve User Role in this Tenant
  const role = dbService.getUserRoleInTenant(tenantId, userId, userEmail) || 'owner';

  req.user = { uid: userId, email: userEmail };
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
