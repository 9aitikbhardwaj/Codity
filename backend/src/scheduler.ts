import cronParser from 'cron-parser';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

import { query, getTransaction } from './database';
import { emitEvent } from './eventBus';

dotenv.config({ path: path.join(__dirname, '../.env') });

let running = true;

async function runScheduler() {
  console.log('Scheduler background service started.');

  while (running) {
    try {
      await processCronSchedules();
      await processWorkflowDependencies();
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error('Error in scheduler loop:', error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Scans for recurring jobs (cron) that are due and schedules their next instance.
 */
async function processCronSchedules() {
  const now = new Date();
  
  // Find all scheduled jobs with a cron expression whose run_at has passed
  const cronJobs = await query(
    'SELECT * FROM jobs WHERE status = "scheduled" AND cron_expression IS NOT NULL AND run_at <= ?',
    [now]
  );

  for (const job of cronJobs) {
    const conn = await getTransaction();
    try {
      // Calculate next run time
      const parser = cronParser.parseExpression(job.cron_expression);
      const nextRunAt = parser.next().toDate();

      // Create a concrete queued execution job
      const queuedJobId = randomUUID();
      const jobName = `${job.name} (Run: ${now.toISOString().substring(0, 16)})`;
      
      // Inherit payload, queue, retry configurations from the template cron job
      await conn.query(
        `INSERT INTO jobs (id, queue_id, name, payload, status, priority_override, run_at, cron_expression, retry_count, max_retries, batch_id)
         VALUES (?, ?, ?, ?, 'queued', ?, ?, NULL, 0, ?, ?)`,
        [
          queuedJobId,
          job.queue_id,
          jobName,
          JSON.stringify(job.payload),
          job.priority_override,
          now,
          job.max_retries,
          job.batch_id
        ]
      );

      // Update the cron template job with its next run time
      await conn.query(
        'UPDATE jobs SET run_at = ?, updated_at = NOW() WHERE id = ?',
        [nextRunAt, job.id]
      );

      await conn.commit();
      console.log(`[Scheduler] Spawned cron run: "${jobName}" (${queuedJobId}), next run scheduled for ${nextRunAt.toISOString()}`);
      
      emitEvent('job:created', { id: queuedJobId, name: jobName, queueId: job.queue_id, status: 'queued' });
      emitEvent('job:updated', { id: job.id, status: 'scheduled', run_at: nextRunAt });
    } catch (err) {
      await conn.rollback();
      console.error(`[Scheduler] Failed to process cron job ${job.id}:`, err);
    } finally {
      conn.release();
    }
  }
}

/**
 * Scans for jobs with status = 'scheduled' that have dependencies.
 * If all of their parent dependencies are completed, transition them to 'queued'.
 */
async function processWorkflowDependencies() {
  // Find all scheduled jobs that do not have a cron expression (as cron is handled separately)
  const scheduledJobs = await query(
    'SELECT id, name, queue_id FROM jobs WHERE status = "scheduled" AND cron_expression IS NULL'
  );

  for (const job of scheduledJobs) {
    // Check if this job has parent dependencies
    const dependencies = await query(
      'SELECT parent_job_id, status FROM job_dependencies WHERE child_job_id = ?',
      [job.id]
    );

    // If it has dependencies, evaluate if they are all completed
    if (dependencies.length > 0) {
      // Refresh dependency statuses from the parent jobs directly to be consistent
      const parentIds = dependencies.map((d: any) => d.parent_job_id);
      
      const parentJobs = await query(
        `SELECT id, status FROM jobs WHERE id IN (${parentIds.map(() => '?').join(',')})`,
        parentIds
      );

      const allCompleted = parentJobs.length === parentIds.length && parentJobs.every((pj: any) => pj.status === 'completed');
      const anyFailed = parentJobs.some((pj: any) => pj.status === 'failed' || pj.status === 'dlq' || pj.status === 'cancelled');

      if (allCompleted) {
        // Update dependency statuses inside job_dependencies table
        await query(
          'UPDATE job_dependencies SET status = "completed" WHERE child_job_id = ?',
          [job.id]
        );
        // Transition job to queued
        await query(
          'UPDATE jobs SET status = "queued", run_at = NOW(), updated_at = NOW() WHERE id = ?',
          [job.id]
        );
        console.log(`[Scheduler] All dependencies satisfied for "${job.name}" (${job.id}). Transitioned to queued.`);
        emitEvent('job:updated', { id: job.id, status: 'queued' });
      } else if (anyFailed) {
        // If any parent job failed or was cancelled, this child job cannot run and becomes failed/cancelled
        await query(
          'UPDATE job_dependencies SET status = "failed" WHERE child_job_id = ? AND parent_job_id IN (SELECT id FROM jobs WHERE status IN ("failed", "dlq", "cancelled"))',
          [job.id]
        );
        await query(
          'UPDATE jobs SET status = "cancelled", updated_at = NOW() WHERE id = ?',
          [job.id]
        );
        console.log(`[Scheduler] Dependency failed for "${job.name}" (${job.id}). Cancelled job.`);
        emitEvent('job:updated', { id: job.id, status: 'cancelled' });
      }
    } else {
      // It has no dependencies, wait... if it is in 'scheduled' status and has no dependencies and no cron, 
      // it might be a delayed job whose run_at has now passed, or a regular scheduled job.
      // Scan and transition to queued if its run_at has passed.
      const jobsToQueue = await query(
        'SELECT id, name, queue_id FROM jobs WHERE id = ? AND run_at <= NOW()',
        [job.id]
      );
      if (jobsToQueue.length > 0) {
        await query('UPDATE jobs SET status = "queued" WHERE id = ?', [job.id]);
        console.log(`[Scheduler] Delayed job "${job.name}" (${job.id}) run_at has passed. Transitioned to queued.`);
        emitEvent('job:updated', { id: job.id, status: 'queued' });
      }
    }
  }
}

// Handle graceful shutdown signals
process.on('SIGINT', () => {
  console.log('Scheduler shutting down gracefully...');
  running = false;
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Scheduler shutting down gracefully...');
  running = false;
  process.exit(0);
});

// Run scheduler
runScheduler();
