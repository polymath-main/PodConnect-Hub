import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { Tenant, TenantMember, UserRole, ScrapeJob, StagedLead, Lead, JobLogEntry } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../podconnect_leads.db');

export class DatabaseService {
  private db: DatabaseSync;

  constructor(dbPath: string = DB_PATH) {
    this.db = new DatabaseSync(dbPath);
    this.init();
  }

  private init() {
    this.db.exec('PRAGMA journal_mode = WAL;');

    // 1. Tenants table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        plan TEXT DEFAULT 'growth',
        owner_user_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Tenant Members table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, user_id)
      );
    `);

    // 3. Staged leads table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS staged_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT,
        show_name TEXT,
        host_name TEXT,
        platform TEXT,
        show_url TEXT,
        feed_url TEXT,
        email TEXT,
        subscribers INTEGER,
        niche TEXT,
        tags TEXT,
        score REAL,
        location TEXT,
        date_scraped TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(client_id, show_name)
      );
    `);

    // 4. Core Leads table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT,
        show_name TEXT,
        host_name TEXT,
        platform TEXT,
        show_url TEXT,
        feed_url TEXT,
        email TEXT,
        subscribers INTEGER,
        niche TEXT,
        score REAL,
        status TEXT DEFAULT 'Imported',
        date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tags TEXT,
        notes TEXT,
        location TEXT,
        UNIQUE(client_id, show_name)
      );
    `);

    // 5. Jobs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        job_type TEXT NOT NULL DEFAULT 'scraper',
        niche TEXT NOT NULL,
        min_subs INTEGER NOT NULL DEFAULT 1000,
        target_count INTEGER NOT NULL DEFAULT 10,
        status TEXT NOT NULL DEFAULT 'pending',
        progress INTEGER NOT NULL DEFAULT 0,
        found_count INTEGER NOT NULL DEFAULT 0,
        staged_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP
      );
    `);

    // 6. Job logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS job_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT
      );
    `);

    // Migrations: Add tenant_id to staged_leads and leads if not present
    this.runMigrations();

    // Ensure default system workspace exists
    const defaultTenant = this.db.prepare('SELECT id FROM tenants WHERE id = ?').get('tenant_default');
    if (!defaultTenant) {
      this.db.prepare(`
        INSERT INTO tenants (id, name, slug, plan, owner_user_id)
        VALUES ('tenant_default', 'Primary Agency Workspace', 'primary-workspace', 'agency', 'system')
      `).run();
    }
  }

  private runMigrations() {
    // Check staged_leads columns
    const stagedCols = (this.db.prepare('PRAGMA table_info(staged_leads)').all() as any[]).map((c) => c.name);
    if (!stagedCols.includes('tenant_id')) {
      try {
        this.db.exec("ALTER TABLE staged_leads ADD COLUMN tenant_id TEXT DEFAULT 'tenant_default'");
        this.db.exec("UPDATE staged_leads SET tenant_id = 'tenant_default' WHERE tenant_id IS NULL");
      } catch (err) {
        console.warn('Migration note on staged_leads:', err);
      }
    }

    // Check leads columns
    const leadCols = (this.db.prepare('PRAGMA table_info(leads)').all() as any[]).map((c) => c.name);
    if (!leadCols.includes('tenant_id')) {
      try {
        this.db.exec("ALTER TABLE leads ADD COLUMN tenant_id TEXT DEFAULT 'tenant_default'");
        this.db.exec("UPDATE leads SET tenant_id = 'tenant_default' WHERE tenant_id IS NULL");
      } catch (err) {
        console.warn('Migration note on leads:', err);
      }
    }
    if (!leadCols.includes('tags')) {
      try { this.db.exec('ALTER TABLE leads ADD COLUMN tags TEXT'); } catch {}
    }
    if (!leadCols.includes('notes')) {
      try { this.db.exec('ALTER TABLE leads ADD COLUMN notes TEXT'); } catch {}
    }
    if (!leadCols.includes('location')) {
      try { this.db.exec('ALTER TABLE leads ADD COLUMN location TEXT'); } catch {}
    }

    // Create helpful indices
    try {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id, client_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_staged_tenant ON staged_leads(tenant_id, client_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id, status)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_job_logs_job ON job_logs(job_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_members_user ON tenant_members(user_id)');
    } catch {}
  }

  // ==========================================
  // TENANT & MEMBERS MANAGEMENT
  // ==========================================

  public getTenantsForUser(userId: string, userEmail?: string): Tenant[] {
    const query = `
      SELECT t.id, t.name, t.slug, t.plan, t.owner_user_id, t.created_at,
             tm.role as currentRole,
             (SELECT COUNT(*) FROM tenant_members WHERE tenant_id = t.id) as memberCount
      FROM tenants t
      JOIN tenant_members tm ON t.id = tm.tenant_id
      WHERE tm.user_id = ? OR tm.email = ?
      ORDER BY t.created_at ASC
    `;
    const rows = this.db.prepare(query).all(userId, userEmail || '') as any[];

    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        plan: r.plan,
        ownerUserId: r.owner_user_id,
        createdAt: r.created_at,
        currentRole: r.currentRole,
        memberCount: Number(r.memberCount || 1),
      }));
    }

    // Auto-provision personal workspace on first visit if user is provided
    if (userId && userId !== 'anonymous') {
      const personalSlug = `workspace-${userId.slice(0, 8).toLowerCase()}`;
      const newTenant = this.createTenant(
        'My Agency Workspace',
        personalSlug,
        userId,
        userEmail || `${userId}@user.local`,
        'growth'
      );
      return [newTenant];
    }

    // Fallback: return default workspace with owner role for demo/local mode
    const def = this.db.prepare('SELECT * FROM tenants WHERE id = ?').get('tenant_default') as any;
    if (def) {
      return [{
        id: def.id,
        name: def.name,
        slug: def.slug,
        plan: def.plan,
        ownerUserId: def.owner_user_id,
        createdAt: def.created_at,
        currentRole: 'owner',
        memberCount: 1,
      }];
    }
    return [];
  }

  public getTenantById(tenantId: string): Tenant | null {
    const row = this.db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      plan: row.plan,
      ownerUserId: row.owner_user_id,
      createdAt: row.created_at,
    };
  }

  public createTenant(name: string, slug: string, ownerUserId: string, ownerEmail: string, plan: string = 'growth'): Tenant {
    const tenantId = `tenant_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const uniqueSlug = `${slug.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${Date.now().toString(36).slice(-4)}`;

    this.db.prepare(`
      INSERT INTO tenants (id, name, slug, plan, owner_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(tenantId, name, uniqueSlug, plan, ownerUserId);

    this.db.prepare(`
      INSERT INTO tenant_members (tenant_id, user_id, email, role)
      VALUES (?, ?, ?, 'owner')
    `).run(tenantId, ownerUserId, ownerEmail);

    return {
      id: tenantId,
      name,
      slug: uniqueSlug,
      plan: plan as any,
      ownerUserId,
      createdAt: new Date().toISOString(),
      currentRole: 'owner',
      memberCount: 1,
    };
  }

  public getTenantMembers(tenantId: string): TenantMember[] {
    const rows = this.db.prepare(`
      SELECT id, tenant_id, user_id, email, role, created_at
      FROM tenant_members
      WHERE tenant_id = ?
      ORDER BY id ASC
    `).all(tenantId) as any[];

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      userId: r.user_id,
      email: r.email,
      role: r.role,
      createdAt: r.created_at,
    }));
  }

  public getTenantMemberCount(tenantId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM tenant_members WHERE tenant_id = ?'
    ).get(tenantId) as any;
    return Number(row?.count || 0);
  }

  public addTenantMember(tenantId: string, email: string, role: UserRole, userId?: string): TenantMember {
    const uid = userId || `invited_${Date.now().toString(36)}`;
    this.db.prepare(`
      INSERT INTO tenant_members (tenant_id, user_id, email, role)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(tenant_id, user_id) DO UPDATE SET role = excluded.role, email = excluded.email
    `).run(tenantId, uid, email, role);

    const row = this.db.prepare('SELECT * FROM tenant_members WHERE tenant_id = ? AND email = ?').get(tenantId, email) as any;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
    };
  }

  public getUserRoleInTenant(tenantId: string, userId: string, userEmail?: string): UserRole | null {
    // Check if user is the direct owner of tenant
    const tenant = this.db.prepare('SELECT owner_user_id FROM tenants WHERE id = ?').get(tenantId) as any;
    if (tenant && (tenant.owner_user_id === userId || tenant.owner_user_id === 'system')) {
      return 'owner';
    }

    const member = this.db.prepare(`
      SELECT role FROM tenant_members
      WHERE tenant_id = ? AND (user_id = ? OR email = ?)
    `).get(tenantId, userId, userEmail || '') as any;

    if (member) return member.role as UserRole;
    return null;
  }

  // ==========================================
  // STAGED LEADS (HOLDING AREA)
  // ==========================================

  public getStagedLeads(tenantId: string, clientId?: string): StagedLead[] {
    let query = 'SELECT * FROM staged_leads WHERE (tenant_id = ? OR tenant_id IS NULL)';
    const params: any[] = [tenantId];

    if (clientId && clientId !== 'ALL') {
      query += ' AND client_id = ?';
      params.push(clientId);
    }
    query += ' ORDER BY id DESC';

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id || tenantId,
      clientId: r.client_id,
      showName: r.show_name,
      hostName: r.host_name,
      platform: r.platform,
      showUrl: r.show_url,
      feedUrl: r.feed_url,
      email: r.email,
      subscribers: r.subscribers || 0,
      niche: r.niche,
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : r.tags || [],
      score: r.score,
      location: r.location,
      notes: r.notes,
      dateScraped: r.date_scraped,
    }));
  }

  public saveStagedLead(tenantId: string, lead: any): boolean {
    const tagsJson = JSON.stringify(lead.tags || []);
    try {
      this.db.prepare(`
        INSERT INTO staged_leads (
          tenant_id, client_id, show_name, host_name, platform, show_url, feed_url,
          email, subscribers, niche, tags, score, location
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(client_id, show_name) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          email = CASE WHEN excluded.email != '' THEN excluded.email ELSE staged_leads.email END,
          score = excluded.score,
          tags = excluded.tags,
          subscribers = excluded.subscribers
      `).run(
        tenantId,
        lead.client_id || lead.clientId || 'C001',
        lead.show_name || lead.showName,
        lead.host_name || lead.hostName || 'Host',
        lead.platform || 'Apple Podcasts',
        lead.show_url || lead.showUrl || '',
        lead.feed_url || lead.feedUrl || '',
        lead.email || '',
        lead.subscribers || 2500,
        lead.niche || '',
        tagsJson,
        lead.score || 8.0,
        lead.location || 'Global / Online'
      );
      return true;
    } catch (err) {
      console.error('Failed to save staged lead:', err);
      return false;
    }
  }

  public updateStagedLead(tenantId: string, id: number, data: any): boolean {
    const updates: string[] = [];
    const values: any[] = [];

    const fieldMap: Record<string, string> = {
      showName: 'show_name',
      hostName: 'host_name',
      platform: 'platform',
      showUrl: 'show_url',
      email: 'email',
      subscribers: 'subscribers',
      niche: 'niche',
      score: 'score',
      location: 'location',
      notes: 'notes',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in data) {
        updates.push(`${col} = ?`);
        values.push(data[key]);
      } else if (col in data) {
        updates.push(`${col} = ?`);
        values.push(data[col]);
      }
    }

    if ('tags' in data) {
      updates.push('tags = ?');
      values.push(JSON.stringify(data.tags || []));
    }

    if (updates.length === 0) return true;

    values.push(id, tenantId);
    const query = `UPDATE staged_leads SET ${updates.join(', ')} WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`;
    this.db.prepare(query).run(...values);
    return true;
  }

  public deleteStagedLead(tenantId: string, id: number): boolean {
    this.db.prepare('DELETE FROM staged_leads WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)').run(id, tenantId);
    return true;
  }

  public importStagedLeads(tenantId: string, stagedIds: number[]): Lead[] {
    if (stagedIds.length === 0) return [];

    const placeholders = stagedIds.map(() => '?').join(',');
    const stagedRows = this.db.prepare(`
      SELECT * FROM staged_leads WHERE id IN (${placeholders}) AND (tenant_id = ? OR tenant_id IS NULL)
    `).all(...stagedIds, tenantId) as any[];

    const imported: Lead[] = [];

    for (const row of stagedRows) {
      this.db.prepare(`
        INSERT INTO leads (
          tenant_id, client_id, show_name, host_name, platform, show_url, feed_url,
          email, subscribers, niche, score, status, tags, location
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Imported', ?, ?)
        ON CONFLICT(client_id, show_name) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          status = 'Imported',
          email = CASE WHEN excluded.email != '' THEN excluded.email ELSE leads.email END,
          subscribers = excluded.subscribers,
          tags = excluded.tags
      `).run(
        tenantId,
        row.client_id,
        row.show_name,
        row.host_name,
        row.platform,
        row.show_url,
        row.feed_url,
        row.email,
        row.subscribers,
        row.niche,
        row.score,
        row.tags,
        row.location
      );

      // Remove from staging
      this.db.prepare('DELETE FROM staged_leads WHERE id = ?').run(row.id);

      // Fetch newly created lead
      const created = this.db.prepare('SELECT * FROM leads WHERE client_id = ? AND show_name = ?').get(row.client_id, row.show_name) as any;
      if (created) {
        imported.push({
          id: created.id,
          tenantId: created.tenant_id,
          clientId: created.client_id,
          showName: created.show_name,
          hostName: created.host_name,
          platform: created.platform,
          showUrl: created.show_url,
          feedUrl: created.feed_url,
          email: created.email,
          subscribers: created.subscribers,
          niche: created.niche,
          tags: typeof created.tags === 'string' ? JSON.parse(created.tags || '[]') : created.tags || [],
          score: created.score,
          status: created.status,
          dateAdded: created.date_added,
          notes: created.notes,
          location: created.location,
        });
      }
    }

    return imported;
  }

  // ==========================================
  // CORE LEADS REPOSITORY
  // ==========================================

  public getLeads(tenantId: string, filters: {
    clientId?: string;
    niche?: string;
    tag?: string;
    status?: string;
    search?: string;
  } = {}): Lead[] {
    let query = 'SELECT * FROM leads WHERE (tenant_id = ? OR tenant_id IS NULL)';
    const params: any[] = [tenantId];

    if (filters.clientId && filters.clientId !== 'ALL') {
      query += ' AND client_id = ?';
      params.push(filters.clientId);
    }
    if (filters.niche) {
      query += ' AND niche LIKE ?';
      params.push(`%${filters.niche}%`);
    }
    if (filters.tag) {
      query += ' AND tags LIKE ?';
      params.push(`%${filters.tag}%`);
    }
    if (filters.status && filters.status !== 'ALL') {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.search) {
      query += ' AND (show_name LIKE ? OR host_name LIKE ? OR email LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    query += ' ORDER BY id DESC';

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id || tenantId,
      clientId: r.client_id,
      showName: r.show_name,
      hostName: r.host_name,
      platform: r.platform,
      showUrl: r.show_url,
      feedUrl: r.feed_url,
      email: r.email,
      subscribers: r.subscribers || 0,
      niche: r.niche,
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : r.tags || [],
      score: r.score,
      status: r.status,
      dateAdded: r.date_added,
      notes: r.notes,
      location: r.location,
    }));
  }

  public getLeadById(tenantId: string, id: number): Lead | null {
    const r = this.db.prepare('SELECT * FROM leads WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)').get(id, tenantId) as any;
    if (!r) return null;
    return {
      id: r.id,
      tenantId: r.tenant_id,
      clientId: r.client_id,
      showName: r.show_name,
      hostName: r.host_name,
      platform: r.platform,
      showUrl: r.show_url,
      feedUrl: r.feed_url,
      email: r.email,
      subscribers: r.subscribers || 0,
      niche: r.niche,
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : r.tags || [],
      score: r.score,
      status: r.status,
      dateAdded: r.date_added,
      notes: r.notes,
      location: r.location,
    };
  }

  public updateLead(tenantId: string, id: number, data: any): boolean {
    const updates: string[] = [];
    const values: any[] = [];

    const fieldMap: Record<string, string> = {
      showName: 'show_name',
      hostName: 'host_name',
      platform: 'platform',
      showUrl: 'show_url',
      email: 'email',
      subscribers: 'subscribers',
      niche: 'niche',
      score: 'score',
      status: 'status',
      location: 'location',
      notes: 'notes',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in data) {
        updates.push(`${col} = ?`);
        values.push(data[key]);
      } else if (col in data) {
        updates.push(`${col} = ?`);
        values.push(data[col]);
      }
    }

    if ('tags' in data) {
      updates.push('tags = ?');
      values.push(JSON.stringify(data.tags || []));
    }

    if (updates.length === 0) return true;

    values.push(id, tenantId);
    const query = `UPDATE leads SET ${updates.join(', ')} WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`;
    this.db.prepare(query).run(...values);
    return true;
  }

  public deleteLead(tenantId: string, id: number): boolean {
    this.db.prepare('DELETE FROM leads WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)').run(id, tenantId);
    return true;
  }

  public assignLeadToClient(tenantId: string, leadId: number, targetClientId: string): boolean {
    const lead = this.db.prepare('SELECT * FROM leads WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)').get(leadId, tenantId) as any;
    if (!lead) return false;

    this.db.prepare(`
      INSERT INTO leads (
        tenant_id, client_id, show_name, host_name, platform, show_url, feed_url,
        email, subscribers, niche, tags, score, status, location
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Imported', ?)
      ON CONFLICT(client_id, show_name) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        client_id = excluded.client_id
    `).run(
      tenantId,
      targetClientId,
      lead.show_name,
      lead.host_name,
      lead.platform,
      lead.show_url,
      lead.feed_url,
      lead.email,
      lead.subscribers,
      lead.niche,
      lead.tags,
      lead.score,
      lead.location
    );
    return true;
  }

  public updateLeadStatus(tenantId: string, id: number, status: string): boolean {
    this.db.prepare('UPDATE leads SET status = ? WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)').run(status, id, tenantId);
    return true;
  }

  // ==========================================
  // JOBS & AUDIT LOGS
  // ==========================================

  public createJob(job: ScrapeJob): ScrapeJob {
    this.db.prepare(`
      INSERT INTO jobs (
        id, tenant_id, user_id, client_id, job_type, niche, min_subs,
        target_count, status, progress, found_count, staged_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.tenantId,
      job.userId,
      job.clientId,
      job.jobType,
      job.niche,
      job.minSubs,
      job.targetCount,
      job.status,
      job.progress,
      job.foundCount,
      job.stagedCount
    );
    return job;
  }

  public updateJob(jobId: string, updates: Partial<ScrapeJob>): boolean {
    const fields: string[] = [];
    const values: any[] = [];

    const map: Record<string, string> = {
      status: 'status',
      progress: 'progress',
      foundCount: 'found_count',
      stagedCount: 'staged_count',
      errorMessage: 'error_message',
      startedAt: 'started_at',
      completedAt: 'completed_at',
    };

    for (const [key, col] of Object.entries(map)) {
      if (key in updates) {
        fields.push(`${col} = ?`);
        values.push((updates as any)[key]);
      }
    }

    if (fields.length === 0) return true;

    values.push(jobId);
    this.db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return true;
  }

  public getJobs(tenantId: string): ScrapeJob[] {
    const rows = this.db.prepare(`
      SELECT * FROM jobs
      WHERE tenant_id = ? OR tenant_id = 'tenant_default'
      ORDER BY created_at DESC
      LIMIT 50
    `).all(tenantId) as any[];

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      userId: r.user_id,
      clientId: r.client_id,
      jobType: r.job_type,
      niche: r.niche,
      minSubs: r.min_subs,
      targetCount: r.target_count,
      status: r.status,
      progress: r.progress,
      foundCount: r.found_count,
      stagedCount: r.staged_count,
      errorMessage: r.error_message,
      createdAt: r.created_at,
      startedAt: r.started_at,
      completedAt: r.completed_at,
    }));
  }

  public getJobCountToday(tenantId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM jobs
      WHERE tenant_id = ? AND date(created_at) = date('now')
    `).get(tenantId) as any;
    return Number(row?.count || 0);
  }

  public getJobById(jobId: string): ScrapeJob | null {
    const r = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as any;
    if (!r) return null;
    return {
      id: r.id,
      tenantId: r.tenant_id,
      userId: r.user_id,
      clientId: r.client_id,
      jobType: r.job_type,
      niche: r.niche,
      minSubs: r.min_subs,
      targetCount: r.target_count,
      status: r.status,
      progress: r.progress,
      foundCount: r.found_count,
      stagedCount: r.staged_count,
      errorMessage: r.error_message,
      createdAt: r.created_at,
      startedAt: r.started_at,
      completedAt: r.completed_at,
    };
  }

  public getPendingJobCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'").get() as any;
    return Number(row?.count || 0);
  }

  public getNextPendingJob(): ScrapeJob | null {
    const r = this.db.prepare(`
      SELECT * FROM jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
    `).get() as any;

    if (!r) return null;
    return {
      id: r.id,
      tenantId: r.tenant_id,
      userId: r.user_id,
      clientId: r.client_id,
      jobType: r.job_type,
      niche: r.niche,
      minSubs: r.min_subs,
      targetCount: r.target_count,
      status: r.status,
      progress: r.progress,
      foundCount: r.found_count,
      stagedCount: r.staged_count,
      errorMessage: r.error_message,
      createdAt: r.created_at,
      startedAt: r.started_at,
      completedAt: r.completed_at,
    };
  }

  public appendJobLog(jobId: string, level: string, message: string, metadata?: any) {
    this.db.prepare(`
      INSERT INTO job_logs (job_id, level, message, metadata)
      VALUES (?, ?, ?, ?)
    `).run(jobId, level, message, metadata ? JSON.stringify(metadata) : null);
  }

  public getJobLogs(jobId: string): JobLogEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM job_logs
      WHERE job_id = ?
      ORDER BY id ASC
    `).all(jobId) as any[];

    return rows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      timestamp: r.timestamp,
      level: r.level as any,
      message: r.message,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }
}

// Singleton database instance
export const dbService = new DatabaseService();
