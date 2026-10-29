import { dbService } from './db.js';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'AUTH' | 'AUDIT' | 'MCP';
export type LogCategory = 'auth' | 'api' | 'scraper' | 'email' | 'database' | 'mcp' | 'system';

export interface SystemLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  tenantId: string;
  userId?: string;
  ipAddress?: string;
  metadata?: any;
}

export interface SystemLogFilter {
  level?: string;
  category?: string;
  search?: string;
  tenantId?: string;
  limit?: number;
  offset?: number;
}

class EventLoggerService {
  private inMemoryRingBuffer: SystemLogEntry[] = [];
  private readonly maxBufferSize = 1000;

  /**
   * Records a structured system event log
   */
  public log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    options?: {
      tenantId?: string;
      userId?: string;
      ipAddress?: string;
      metadata?: any;
    }
  ): SystemLogEntry {
    const entry: SystemLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message: message.trim(),
      tenantId: options?.tenantId || 'tenant_default',
      userId: options?.userId,
      ipAddress: options?.ipAddress,
      metadata: options?.metadata,
    };

    // 1. Maintain in-memory ring buffer
    this.inMemoryRingBuffer.unshift(entry);
    if (this.inMemoryRingBuffer.length > this.maxBufferSize) {
      this.inMemoryRingBuffer.pop();
    }

    // 2. Persist to SQLite table asynchronously/safely
    try {
      dbService.saveSystemLog(entry);
    } catch (err) {
      // In-memory buffer still preserves the entry
    }

    return entry;
  }

  // Quick helper methods
  public logInfo(category: LogCategory, message: string, opts?: any) {
    return this.log('INFO', category, message, opts);
  }

  public logWarn(category: LogCategory, message: string, opts?: any) {
    return this.log('WARN', category, message, opts);
  }

  public logError(category: LogCategory, message: string, opts?: any) {
    return this.log('ERROR', category, message, opts);
  }

  public logAuth(message: string, opts?: { tenantId?: string; userId?: string; ipAddress?: string; success?: boolean; metadata?: any }) {
    const level: LogLevel = opts?.success === false ? 'ERROR' : 'AUTH';
    return this.log(level, 'auth', message, opts);
  }

  public logAudit(message: string, opts?: any) {
    return this.log('AUDIT', 'system', message, opts);
  }

  public logMcp(toolName: string, message: string, opts?: any) {
    return this.log('MCP', 'mcp', `[${toolName}] ${message}`, {
      ...opts,
      metadata: { toolName, ...(opts?.metadata || {}) },
    });
  }

  /**
   * Queries system logs with multi-field filtering
   */
  public getLogs(filters: SystemLogFilter): { logs: SystemLogEntry[]; total: number } {
    try {
      // Attempt to load from database first for complete pagination
      const dbResult = dbService.querySystemLogs(filters);
      if (dbResult && dbResult.logs.length > 0) {
        return dbResult;
      }
    } catch {
      // Fallback to in-memory buffer
    }

    let filtered = [...this.inMemoryRingBuffer];

    if (filters.tenantId && filters.tenantId !== 'ALL') {
      filtered = filtered.filter(
        (l) => l.tenantId === filters.tenantId || l.tenantId === 'tenant_default'
      );
    }

    if (filters.level && filters.level !== 'ALL') {
      filtered = filtered.filter((l) => l.level.toLowerCase() === filters.level!.toLowerCase());
    }

    if (filters.category && filters.category !== 'ALL') {
      filtered = filtered.filter((l) => l.category.toLowerCase() === filters.category!.toLowerCase());
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.message.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q) ||
          (l.userId && l.userId.toLowerCase().includes(q)) ||
          (l.metadata && JSON.stringify(l.metadata).toLowerCase().includes(q))
      );
    }

    const total = filtered.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    const paginated = filtered.slice(offset, offset + limit);

    return { logs: paginated, total };
  }

  /**
   * Exports logs formatted as JSON or CSV
   */
  public exportLogs(filters: SystemLogFilter, format: 'json' | 'csv'): { content: string; contentType: string; filename: string } {
    const { logs } = this.getLogs({ ...filters, limit: 1000, offset: 0 });
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (format === 'csv') {
      const headers = ['Timestamp', 'Level', 'Category', 'TenantID', 'UserID', 'IPAddress', 'Message', 'Metadata'];
      const escapeCsv = (str: any) => {
        if (str === null || str === undefined) return '""';
        const s = typeof str === 'object' ? JSON.stringify(str) : String(str);
        return `"${s.replace(/"/g, '""')}"`;
      };

      const rows = logs.map((l) => [
        escapeCsv(l.timestamp),
        escapeCsv(l.level),
        escapeCsv(l.category),
        escapeCsv(l.tenantId),
        escapeCsv(l.userId || ''),
        escapeCsv(l.ipAddress || ''),
        escapeCsv(l.message),
        escapeCsv(l.metadata || ''),
      ].join(','));

      const csvContent = [headers.join(','), ...rows].join('\r\n');
      return {
        content: csvContent,
        contentType: 'text/csv; charset=utf-8',
        filename: `podconnect_audit_logs_${timestampStr}.csv`,
      };
    }

    // Default JSON export
    const jsonContent = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        totalLogs: logs.length,
        filters,
        logs,
      },
      null,
      2
    );

    return {
      content: jsonContent,
      contentType: 'application/json; charset=utf-8',
      filename: `podconnect_audit_logs_${timestampStr}.json`,
    };
  }

  /**
   * Clears logs for a tenant
   */
  public clearLogs(tenantId: string) {
    this.inMemoryRingBuffer = this.inMemoryRingBuffer.filter((l) => l.tenantId !== tenantId);
    try {
      dbService.clearSystemLogs(tenantId);
    } catch {}
  }
}

export const eventLogger = new EventLoggerService();
