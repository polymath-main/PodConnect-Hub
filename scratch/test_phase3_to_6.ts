import { dbService } from '../src/server/db.js';
import { emailService } from '../src/server/email.js';
import { getLimits, PLAN_LIMITS } from '../src/lib/plans.js';

console.log('--- RUNNING TEST SUITE: PHASES 3 - 6 ---');

// 1. TEST PLAN LIMITS & QUOTA DEFINITIONS
console.log('\n[1] Testing Plan Limits...');
const starterLimits = getLimits('starter');
if (starterLimits.maxJobsPerDay !== 3 || starterLimits.maxSeats !== 1) {
  throw new Error(`Starter limits incorrect: ${JSON.stringify(starterLimits)}`);
}
const growthLimits = getLimits('growth');
if (growthLimits.maxJobsPerDay !== 10 || growthLimits.maxSeats !== 3) {
  throw new Error(`Growth limits incorrect: ${JSON.stringify(growthLimits)}`);
}
console.log('✓ Plan limits resolved accurately for all tiers.');

// 2. TEST EMAIL ENCODING & RATE LIMITER
console.log('\n[2] Testing EmailService Encoding & Rate Limiter...');
const encoded = emailService.encodeEmail({
  to: 'host@podconnect.agency',
  subject: 'Guest Pitch: Scaling AI Vector DBs',
  body: 'Hi Host, would love to join your show to discuss AI agent infrastructure.',
});
if (!encoded || typeof encoded !== 'string' || encoded.includes('+') || encoded.includes('/')) {
  throw new Error(`Email base64url encoding failed: ${encoded}`);
}
console.log('✓ Email RFC 2822 base64url encoding valid.');

// Test sliding window rate limiter (10 max per minute per tenant)
const testTenant = 'test_rate_limit_tenant';
for (let i = 0; i < 10; i++) {
  const allowed = emailService.checkRateLimit(testTenant);
  if (!allowed) throw new Error(`Dispatch ${i + 1} unexpectedly rate limited!`);
}
const eleventhDispatch = emailService.checkRateLimit(testTenant);
if (eleventhDispatch) {
  throw new Error('Eleventh dispatch should have been rejected by sliding window rate limiter!');
}
console.log('✓ Email rate limiter successfully throttles at 10 dispatches/minute.');

// 3. TEST DATABASE QUOTA HELPERS & LEAD SCOPING
console.log('\n[3] Testing DB Scoping & Quota Helpers...');
const createdTenant = dbService.createTenant(
  'Alpha Podcast Studio',
  'alpha-studio',
  'user_tester_99',
  'tester@alpha.com',
  'starter'
);

const memberCount = dbService.getTenantMemberCount(createdTenant.id);
if (memberCount !== 1) {
  throw new Error(`Expected memberCount 1, got ${memberCount}`);
}

const jobCount = dbService.getJobCountToday(createdTenant.id);
if (typeof jobCount !== 'number') {
  throw new Error(`Expected numeric jobCount, got ${jobCount}`);
}

// Stage a lead and import to test getLeadById
dbService.saveStagedLead(createdTenant.id, {
  clientId: 'C001',
  showName: 'The AI Breakdown Show',
  hostName: 'Nathan',
  platform: 'Apple Podcasts',
  showUrl: 'https://podcasts.apple.com/show/123',
  email: 'nathan@aibreakdown.com',
  subscribers: 50000,
  niche: 'AI & Tech',
  score: 9.5,
});

const staged = dbService.getStagedLeads(createdTenant.id);
if (staged.length === 0) throw new Error('Staged leads empty');

const imported = dbService.importStagedLeads(createdTenant.id, [staged[0].id]);
if (imported.length === 0) throw new Error('Importing staged lead failed');

const retrievedLead = dbService.getLeadById(createdTenant.id, imported[0].id);
if (!retrievedLead || retrievedLead.showName !== 'The AI Breakdown Show') {
  throw new Error(`getLeadById failed: ${JSON.stringify(retrievedLead)}`);
}

// Cross-tenant isolation check: different tenant cannot retrieve this lead
const crossTenantLead = dbService.getLeadById('different_tenant_id', imported[0].id);
if (crossTenantLead !== null) {
  throw new Error('Cross-tenant data leak! Different tenant retrieved isolated lead!');
}
console.log('✓ getLeadById and cross-tenant isolation verified.');

console.log('\n=========================================');
console.log('ALL PHASE 3 - 6 TEST ASSERTIONS PASSED! ✓');
console.log('=========================================');
