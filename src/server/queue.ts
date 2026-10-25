import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { Response } from 'express';
import { dbService } from './db.js';
import { ScrapeJob } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRAPER_SCRIPT_PATH = path.resolve(__dirname, '../../scraper.py');

interface ActiveWorker {
  process: ChildProcess;
  job: ScrapeJob;
}

export class JobQueueManager {
  private maxConcurrency: number;
  private activeWorkers: Map<string, ActiveWorker> = new Map();
  private jobSubscribers: Map<string, Response[]> = new Map();
  private tenantSubscribers: Map<string, Response[]> = new Map();

  constructor(maxConcurrency: number = 2) {
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Subscribe an SSE client to updates for a specific job
   */
  public subscribeJob(jobId: string, res: Response) {
    if (!this.jobSubscribers.has(jobId)) {
      this.jobSubscribers.set(jobId, []);
    }
    this.jobSubscribers.get(jobId)!.push(res);

    // Initial handshake
    res.write(`data: ${JSON.stringify({ type: 'connected', jobId })}\n\n`);
  }

  public unsubscribeJob(jobId: string, res: Response) {
    const list = this.jobSubscribers.get(jobId);
    if (list) {
      this.jobSubscribers.set(jobId, list.filter((c) => c !== res));
    }
  }

  /**
   * Subscribe an SSE client to updates across all jobs for a tenant
   */
  public subscribeTenant(tenantId: string, res: Response) {
    if (!this.tenantSubscribers.has(tenantId)) {
      this.tenantSubscribers.set(tenantId, []);
    }
    this.tenantSubscribers.get(tenantId)!.push(res);

    // Initial handshake
    res.write(`data: ${JSON.stringify({ type: 'connected', tenantId })}\n\n`);
  }

  public unsubscribeTenant(tenantId: string, res: Response) {
    const list = this.tenantSubscribers.get(tenantId);
    if (list) {
      this.tenantSubscribers.set(tenantId, list.filter((c) => c !== res));
    }
  }

  /**
   * Broadcast message to job and tenant subscribers
   */
  private broadcast(job: ScrapeJob, eventData: any) {
    const message = `data: ${JSON.stringify(eventData)}\n\n`;

    // Job specific clients
    const jobClients = this.jobSubscribers.get(job.id) || [];
    jobClients.forEach((client) => {
      try { client.write(message); } catch {}
    });

    // Tenant specific clients
    const tenantClients = this.tenantSubscribers.get(job.tenantId) || [];
    tenantClients.forEach((client) => {
      try { client.write(message); } catch {}
    });
  }

  /**
   * Enqueue a new scraping job
   */
  public enqueueJob(params: {
    tenantId: string;
    userId: string;
    clientId: string;
    niche: string;
    minSubs?: number;
    targetCount?: number;
    jobType?: 'scraper' | 'search_grounding';
  }): ScrapeJob {
    const jobId = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const job: ScrapeJob = {
      id: jobId,
      tenantId: params.tenantId,
      userId: params.userId,
      clientId: params.clientId || 'C001',
      jobType: params.jobType || 'scraper',
      niche: params.niche,
      minSubs: params.minSubs || 1000,
      targetCount: params.targetCount || 10,
      status: 'pending',
      progress: 0,
      foundCount: 0,
      stagedCount: 0,
      createdAt: new Date().toISOString(),
    };

    dbService.createJob(job);
    dbService.appendJobLog(job.id, 'INFO', `Job queued for client ${job.clientId} (${job.niche})`);

    this.broadcast(job, {
      type: 'job_queued',
      job,
      message: `Scraper job queued: ${job.niche}`,
    });

    // Attempt to run if worker slot is available
    this.processNext();

    return job;
  }

  /**
   * Process next pending job if concurrency limit allows
   */
  public processNext() {
    if (this.activeWorkers.size >= this.maxConcurrency) {
      return;
    }

    const job = dbService.getNextPendingJob();
    if (!job) return;

    this.startWorker(job);
  }

  /**
   * Spawn worker process for a job
   */
  private startWorker(job: ScrapeJob) {
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    job.progress = 5;

    dbService.updateJob(job.id, {
      status: 'running',
      startedAt: job.startedAt,
      progress: job.progress,
    });

    dbService.appendJobLog(job.id, 'INFO', `Worker started for job ${job.id}`);
    this.broadcast(job, {
      type: 'job_started',
      job,
      message: `Worker started for ${job.niche}`,
    });

    const py = spawn('python3', [
      SCRAPER_SCRIPT_PATH,
      '--tenant-id',
      job.tenantId,
      '--job-id',
      job.id,
      '--client',
      job.clientId,
      '--niche',
      job.niche,
      '--min-subs',
      job.minSubs.toString(),
      '--limit',
      job.targetCount.toString(),
    ]);

    this.activeWorkers.set(job.id, { process: py, job });

    py.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line.trim());

          // Track progress if reported
          if (parsed.progress !== undefined) {
            job.progress = Math.min(100, Math.max(job.progress, parsed.progress));
            dbService.updateJob(job.id, { progress: job.progress });
          }

          // Track staged leads count if reported
          if (parsed.lead) {
            job.foundCount++;
            job.stagedCount++;
            dbService.updateJob(job.id, {
              foundCount: job.foundCount,
              stagedCount: job.stagedCount,
            });
          }

          dbService.appendJobLog(job.id, parsed.level || 'INFO', parsed.message || '', parsed.lead);

          this.broadcast(job, {
            type: 'job_log',
            jobId: job.id,
            log: {
              timestamp: parsed.timestamp || new Date().toISOString(),
              level: parsed.level || 'INFO',
              message: parsed.message || '',
              lead: parsed.lead,
            },
            job,
          });
        } catch {
          dbService.appendJobLog(job.id, 'RAW', line.trim());
          this.broadcast(job, {
            type: 'job_log',
            jobId: job.id,
            log: {
              timestamp: new Date().toISOString(),
              level: 'RAW',
              message: line.trim(),
            },
            job,
          });
        }
      }
    });

    py.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        dbService.appendJobLog(job.id, 'WARN', text);
        this.broadcast(job, {
          type: 'job_log',
          jobId: job.id,
          log: {
            timestamp: new Date().toISOString(),
            level: 'WARN',
            message: text,
          },
          job,
        });
      }
    });

    py.on('close', (code) => {
      this.activeWorkers.delete(job.id);

      const isSuccess = code === 0;
      job.status = isSuccess ? 'completed' : 'failed';
      job.progress = isSuccess ? 100 : job.progress;
      job.completedAt = new Date().toISOString();
      if (!isSuccess && !job.errorMessage) {
        job.errorMessage = `Process exited with code ${code}`;
      }

      dbService.updateJob(job.id, {
        status: job.status,
        progress: job.progress,
        completedAt: job.completedAt,
        errorMessage: job.errorMessage,
      });

      dbService.appendJobLog(
        job.id,
        isSuccess ? 'SUCCESS' : 'ERROR',
        `Job finished with status: ${job.status} (exit code ${code})`
      );

      this.broadcast(job, {
        type: isSuccess ? 'job_completed' : 'job_failed',
        job,
        message: `Job ${job.status}: ${job.niche}`,
      });

      // Dispatch next pending job in queue
      this.processNext();
    });
  }

  /**
   * Cancel an active or queued job
   */
  public cancelJob(jobId: string): boolean {
    const active = this.activeWorkers.get(jobId);
    if (active) {
      active.process.kill('SIGTERM');
      this.activeWorkers.delete(jobId);

      const job = active.job;
      job.status = 'cancelled';
      job.completedAt = new Date().toISOString();
      dbService.updateJob(jobId, { status: 'cancelled', completedAt: job.completedAt });
      dbService.appendJobLog(jobId, 'WARN', 'Job cancelled by operator');

      this.broadcast(job, {
        type: 'job_cancelled',
        job,
        message: `Job ${jobId} was cancelled by operator`,
      });

      this.processNext();
      return true;
    }

    const job = dbService.getJobById(jobId);
    if (job && job.status === 'pending') {
      job.status = 'cancelled';
      job.completedAt = new Date().toISOString();
      dbService.updateJob(jobId, { status: 'cancelled', completedAt: job.completedAt });
      dbService.appendJobLog(jobId, 'WARN', 'Pending job cancelled from queue');

      this.broadcast(job, {
        type: 'job_cancelled',
        job,
        message: `Job ${jobId} was cancelled from queue`,
      });
      return true;
    }

    return false;
  }

  /**
   * Get count of running jobs
   */
  public getActiveCount(): number {
    return this.activeWorkers.size;
  }

  /**
   * Get list of active running job IDs
   */
  public getActiveJobIds(): string[] {
    return Array.from(this.activeWorkers.keys());
  }

  /**
   * Get count of pending queued jobs
   */
  public getQueuedCount(): number {
    return dbService.getPendingJobCount();
  }
}

// Global queue manager instance
export const jobQueue = new JobQueueManager(2);
