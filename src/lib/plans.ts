export type Plan = 'starter' | 'growth' | 'agency' | 'enterprise';

export interface PlanLimits {
  name: string;
  maxSeats: number;
  maxLeadsPerMonth: number;
  maxConcurrentJobs: number;
  maxJobsPerDay: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  starter: {
    name: 'Starter',
    maxSeats: 1,
    maxLeadsPerMonth: 50,
    maxConcurrentJobs: 1,
    maxJobsPerDay: 3,
  },
  growth: {
    name: 'Growth',
    maxSeats: 3,
    maxLeadsPerMonth: 500,
    maxConcurrentJobs: 2,
    maxJobsPerDay: 10,
  },
  agency: {
    name: 'Agency Scale',
    maxSeats: 10,
    maxLeadsPerMonth: 2000,
    maxConcurrentJobs: 2,
    maxJobsPerDay: 30,
  },
  enterprise: {
    name: 'Enterprise',
    maxSeats: 999,
    maxLeadsPerMonth: 99999,
    maxConcurrentJobs: 2,
    maxJobsPerDay: 999,
  },
};

/**
 * Get limits for a given plan name (defaults to 'growth' if unrecognized)
 */
export function getLimits(plan?: string | null): PlanLimits {
  if (!plan) return PLAN_LIMITS.growth;
  const key = plan.toLowerCase() as Plan;
  return PLAN_LIMITS[key] || PLAN_LIMITS.growth;
}
