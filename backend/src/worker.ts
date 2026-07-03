import os from 'os';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

import { query, getTransaction } from './database';
import { emitEvent } from './eventBus';

dotenv.config({ path: path.join(__dirname, '../.env') });

const WORKER_ID = `worker-${os.hostname()}-${process.pid}-${randomUUID().substring(0, 8)}`;
const HOSTNAME = os.hostname();
const IP_ADDRESS = '127.0.0.1'; // Simple local IP mock
const CONCURRENCY_SLOTS = 5; // Configurable worker capacity

let running = true;
let activeJobCount = 0;

async function startWorker() {
  console.log(`Worker service starting. Worker ID: ${WORKER_ID}`);
  
  // Register worker
  await registerWorker();

  // Start heartbeat loop (every 5 seconds)
  const heartbeatInterval = setInterval(sendHeartbeat, 5000);
  
  // Start recovery loop (every 10 seconds - only one coordinator role needed, but all can run it safely)
  const recoveryInterval = setInterval(recoverOrphanedJobs, 10000);

  // Polling loop
  while (running) {
    try {
      if (activeJobCount < CONCURRENCY_SLOTS) {
        const availableSlots = CONCURRENCY_SLOTS - activeJobCount;
        const claimedJobs = await claimJobs(availableSlots);
        
        for (const job of claimedJobs) {
          activeJobCount++;
          // Run job asynchronously (don't await here, so we continue polling other slots)
          runJob(job).catch(err => {
            console.error(`Error in outer runJob handler:`, err);
          }).finally(() => {
            activeJobCount--;
          });
        }
      }
      
      // Delay before next polling iteration
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error in worker polling loop:', error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  // Graceful shutdown cleaning
  clearInterval(heartbeatInterval);
  clearInterval(recoveryInterval);
  await unregisterWorker();
  console.log(`Worker ${WORKER_ID} has shut down.`);
  process.exit(0);
}

// -------------------------------------------------------------
// WORKER REGISTRATION & HEARTBEAT
// -------------------------------------------------------------

async function registerWorker() {
  await query(
    `INSERT INTO workers (id, hostname, ip_address, status, concurrency_slots, last_heartbeat_at)
     VALUES (?, ?, ?, 'active', ?, NOW())
     ON DUPLICATE KEY UPDATE status='active', last_heartbeat_at=NOW(), concurrency_slots=?`,
    [WORKER_ID, HOSTNAME, IP_ADDRESS, CONCURRENCY_SLOTS, CONCURRENCY_SLOTS]
  );
  console.log(`Registered worker in database: ${WORKER_ID}`);
}

async function sendHeartbeat() {
  try {
    await query(
      'UPDATE workers SET last_heartbeat_at = NOW(), status = "active" WHERE id = ?',
      [WORKER_ID]
    );
    emitEvent('worker:heartbeat', { id: WORKER_ID, last_heartbeat_at: new Date() });
  } catch (error) {
    console.error('Failed to send worker heartbeat:', error);
  }
}

async function unregisterWorker() {
  try {
    await query(
      'UPDATE workers SET status = "offline", updated_at = NOW() WHERE id = ?',
      [WORKER_ID]
    );
    console.log(`Worker set to offline: ${WORKER_ID}`);
  } catch (error) {
    console.error('Failed to unregister worker:', error);
  }
}

// -------------------------------------------------------------
// ATOMIC JOB CLAIMING (SKIP LOCKED)
// -------------------------------------------------------------

interface ClaimedJob {
  id: string;
  queue_id: string;
  name: string;
  payload: any;
  retry_count: number;
  max_retries: number;
  retry_policy_id: string;
  strategy: 'fixed' | 'linear' | 'exponential';
  base_delay_ms: number;
  max_delay_ms: number;
}

async function claimJobs(limit: number): Promise<ClaimedJob[]> {
  // 1. Fetch active, unpaused queues
  const activeQueues = await query('SELECT id FROM queues WHERE is_paused = 0');
  if (activeQueues.length === 0) {
    return [];
  }
  const queueIds = activeQueues.map((q: any) => q.id);

  const conn = await getTransaction();
  try {
    // 2. Select and lock the candidate jobs from active queues using SKIP LOCKED (no joins!)
    const placeholders = queueIds.map(() => '?').join(',');
    const selectSql = `
      SELECT id, queue_id, name, payload, retry_count, max_retries
      FROM jobs
      WHERE status = 'queued' AND run_at <= NOW() AND queue_id IN (${placeholders})
      LIMIT ?
      FOR UPDATE SKIP LOCKED
    `;

    const [rows] = await conn.query(selectSql, [...queueIds, limit]);
    const jobs = rows as any[];

    if (jobs.length === 0) {
      await conn.commit();
      conn.release();
      return [];
    }

    const claimedJobs: ClaimedJob[] = [];

    // 3. Mark each job as claimed and insert execution entry in database
    for (const job of jobs) {
      const execId = randomUUID();
      
      await conn.query(
        'UPDATE jobs SET status = "claimed", last_execution_id = ?, updated_at = NOW() WHERE id = ?',
        [execId, job.id]
      );

      await conn.query(
        `INSERT INTO job_executions (id, job_id, worker_id, status, started_at, retry_number)
         VALUES (?, ?, ?, 'running', NOW(), ?)`,
        [execId, job.id, WORKER_ID, job.retry_count]
      );

      claimedJobs.push({
        ...job,
        last_execution_id: execId
      } as any);

      emitEvent('job:updated', { id: job.id, status: 'claimed' });
    }

    await conn.commit();
    conn.release();

    // 4. Fetch retry policy parameters for the claimed jobs' queues (non-locking)
    const claimedQueueIds = [...new Set(claimedJobs.map(j => j.queue_id))];
    const queuePlaceholders = claimedQueueIds.map(() => '?').join(',');
    const policyRows = await query(`
      SELECT q.id as queue_id, rp.strategy, rp.base_delay_ms, rp.max_delay_ms
      FROM queues q
      JOIN retry_policies rp ON q.retry_policy_id = rp.id
      WHERE q.id IN (${queuePlaceholders})
    `, claimedQueueIds);

    const policyMap = new Map<string, any>(policyRows.map((r: any) => [r.queue_id, r]));

    // Map policies back to claimed jobs
    return claimedJobs.map(job => {
      const policy = policyMap.get(job.queue_id) || { strategy: 'fixed', base_delay_ms: 1000, max_delay_ms: 30000 };
      return {
        ...job,
        strategy: policy.strategy,
        base_delay_ms: policy.base_delay_ms,
        max_delay_ms: policy.max_delay_ms
      } as ClaimedJob;
    });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('Error claiming jobs transaction:', error);
    return [];
  }
}

// -------------------------------------------------------------
// DYNAMIC JOB EXECUTION SIMULATOR
// -------------------------------------------------------------

async function runJob(job: any) {
  const execId = job.last_execution_id;
  const startedAt = Date.now();
  let stdoutLogs = `[Worker ${WORKER_ID}] Claimed job "${job.name}" (${job.id})\n`;
  let stderrLogs = '';
  let status: 'completed' | 'failed' = 'completed';
  let errorMessage = '';

  console.log(`[Worker] Starting job: "${job.name}" (${job.id})`);

  // Transition job status to 'running'
  try {
    await query('UPDATE jobs SET status = "running", updated_at = NOW() WHERE id = ?', [job.id]);
    emitEvent('job:updated', { id: job.id, status: 'running' });
    stdoutLogs += `[${new Date().toISOString()}] Job state changed to RUNNING\n`;
  } catch (err) {
    console.error('Failed to set job running:', err);
  }

  // Execute job task based on its name (mocking production operations)
  try {
    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    stdoutLogs += `[${new Date().toISOString()}] Processing payload: ${JSON.stringify(payload)}\n`;
    
    // Simulate dynamic execution work based on job category
    const jobNameLower = job.name.toLowerCase();
    
    if (jobNameLower.includes('email')) {
      stdoutLogs += `[${new Date().toISOString()}] Initializing SMTP gateway client...\n`;
      await new Promise(r => setTimeout(r, 1000));
      stdoutLogs += `[${new Date().toISOString()}] Preparing email body to <${payload.recipient || 'customer@example.com'}>...\n`;
      await new Promise(r => setTimeout(r, 1500));
      
      if (payload.recipient === 'fail@fail.com' || payload.fail === true) {
        throw new Error('SMTP connection timed out: 554 Delivery error.');
      }
      stdoutLogs += `[${new Date().toISOString()}] Email successfully dispatched message-id: ${randomUUID()}\n`;
    } 
    else if (jobNameLower.includes('report') || jobNameLower.includes('pdf')) {
      stdoutLogs += `[${new Date().toISOString()}] Fetching database metrics for quarterly PDF report...\n`;
      await new Promise(r => setTimeout(r, 1500));
      stdoutLogs += `[${new Date().toISOString()}] Assembling layout grids and SVG charts...\n`;
      await new Promise(r => setTimeout(r, 2000));
      stdoutLogs += `[${new Date().toISOString()}] Rendering PDF buffer (12 pages generated)...\n`;
      await new Promise(r => setTimeout(r, 1000));
      
      if (payload.fail === true) {
        throw new Error('Heap allocation limit exceeded during PDF rasterization');
      }
      stdoutLogs += `[${new Date().toISOString()}] PDF Report written to static s3://acme-bucket/reports/rep-${randomUUID().substring(0, 8)}.pdf\n`;
    } 
    else if (jobNameLower.includes('image') || jobNameLower.includes('compress')) {
      stdoutLogs += `[${new Date().toISOString()}] Downloading source image file: ${payload.imageUrl || 'https://images.example.com/src.png'}...\n`;
      await new Promise(r => setTimeout(r, 1000));
      stdoutLogs += `[${new Date().toISOString()}] Loading sharp image manipulation engine...\n`;
      await new Promise(r => setTimeout(r, 1000));
      stdoutLogs += `[${new Date().toISOString()}] Applying lanczos-3 resampling downscale (1920x1080 -> 640x360)...\n`;
      await new Promise(r => setTimeout(r, 1500));
      
      if (payload.fail === true) {
        throw new Error('Corrupt file structure: JPEG SOI marker not found');
      }
      stdoutLogs += `[${new Date().toISOString()}] Compression complete. Saved 1.8MB -> 245KB (86% size reduction).\n`;
    } 
    else if (jobNameLower.includes('webhook') || jobNameLower.includes('api')) {
      const url = payload.webhookUrl || 'https://api.external.service/webhook';
      stdoutLogs += `[${new Date().toISOString()}] Sending POST webhook payload to external endpoint: ${url}\n`;
      await new Promise(r => setTimeout(r, 1500));
      
      if (payload.fail === true || url.includes('invalid')) {
        throw new Error('HTTP Post request failed. Status Code: 503 Service Unavailable');
      }
      stdoutLogs += `[${new Date().toISOString()}] Webhook response received. Status: 200 OK. Body: {"status":"accepted"}\n`;
    } 
    else {
      // Default execution fallback
      stdoutLogs += `[${new Date().toISOString()}] Commencing general scheduled background operation...\n`;
      const steps = payload.steps || 3;
      for (let i = 1; i <= steps; i++) {
        await new Promise(r => setTimeout(r, 1000));
        stdoutLogs += `[${new Date().toISOString()}] Executed step ${i}/${steps} (progress ${Math.round((i/steps)*100)}%)\n`;
      }
      
      if (payload.fail === true) {
        throw new Error('Task runtime error: general failure triggered in payload parameters.');
      }
    }
    
    stdoutLogs += `[${new Date().toISOString()}] Job completed successfully.\n`;
    status = 'completed';
  } catch (error: any) {
    status = 'failed';
    errorMessage = error.message || 'Unknown runtime error';
    stderrLogs += `[${new Date().toISOString()}] Job execution failed:\n`;
    stderrLogs += `Error: ${errorMessage}\n`;
    stderrLogs += `${error.stack || ''}\n`;
  }

  // Update Execution and Job states upon completion/failure
  const durationMs = Date.now() - startedAt;
  await finalizeJob(job, execId, status, durationMs, stdoutLogs, stderrLogs, errorMessage);
}

async function finalizeJob(
  job: any,
  execId: string,
  status: 'completed' | 'failed',
  durationMs: number,
  stdoutLogs: string,
  stderrLogs: string,
  errorMessage: string
) {
  const conn = await getTransaction();
  try {
    // 1. Update job_executions record
    await conn.query(
      `UPDATE job_executions 
       SET status = ?, finished_at = NOW(), duration_ms = ?, stdout_logs = ?, stderr_logs = ?, error_message = ?
       WHERE id = ?`,
      [status, durationMs, stdoutLogs, stderrLogs, errorMessage || null, execId]
    );

    if (status === 'completed') {
      // Job completed successfully
      await conn.query(
        'UPDATE jobs SET status = "completed", updated_at = NOW() WHERE id = ?',
        [job.id]
      );
      await conn.commit();
      conn.release();
      console.log(`[Worker] Job completed: "${job.name}" (${job.id}) in ${durationMs}ms`);
      emitEvent('job:updated', { id: job.id, status: 'completed' });
    } else {
      // Job failed - evaluate retries
      const nextRetryCount = job.retry_count + 1;
      
      if (nextRetryCount <= job.max_retries) {
        // Compute backoff delay based on retry policy strategy
        let delayMs = job.base_delay_ms;
        if (job.strategy === 'linear') {
          delayMs = job.base_delay_ms * nextRetryCount;
        } else if (job.strategy === 'exponential') {
          delayMs = job.base_delay_ms * Math.pow(2, nextRetryCount - 1);
        }
        // Clamp to max delay
        delayMs = Math.min(delayMs, job.max_delay_ms);
        
        const runAt = new Date(Date.now() + delayMs);
        
        await conn.query(
          'UPDATE jobs SET status = "queued", retry_count = ?, run_at = ?, updated_at = NOW() WHERE id = ?',
          [nextRetryCount, runAt, job.id]
        );
        
        await conn.commit();
        conn.release();
        console.log(`[Worker] Job "${job.name}" failed, scheduling retry #${nextRetryCount} in ${delayMs}ms (at ${runAt.toISOString()})`);
        emitEvent('job:updated', { id: job.id, status: 'queued', retry_count: nextRetryCount, run_at: runAt });
      } else {
        // Permanent failure -> Move to Dead Letter Queue (DLQ)
        await conn.query(
          'UPDATE jobs SET status = "dlq", updated_at = NOW() WHERE id = ?',
          [job.id]
        );

        const dlqId = randomUUID();
        await conn.query(
          `INSERT INTO dead_letter_queue (id, job_id, queue_id, failed_at, error_summary, original_payload, retry_count)
           VALUES (?, ?, ?, NOW(), ?, ?, ?)`,
          [
            dlqId,
            job.id,
            job.queue_id,
            errorMessage,
            JSON.stringify(job.payload),
            job.retry_count
          ]
        );

        await conn.commit();
        conn.release();
        console.log(`[Worker] Job "${job.name}" failed permanently after ${job.retry_count} retries. Moved to DLQ.`);
        emitEvent('job:updated', { id: job.id, status: 'dlq' });
        emitEvent('dlq:new', { id: dlqId, job_id: job.id, error_summary: errorMessage });
      }
    }
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error(`Failed to finalize job ${job.id}:`, error);
  }
}

// -------------------------------------------------------------
// DEAD WORKER RECOVERY COORDINATOR
// -------------------------------------------------------------

async function recoverOrphanedJobs() {
  try {
    // 1. Find workers that haven't sent a heartbeat in over 15 seconds
    const threshold = new Date(Date.now() - 15000);
    const deadWorkers = await query(
      'SELECT id, hostname FROM workers WHERE status = "active" AND last_heartbeat_at < ?',
      [threshold]
    );

    for (const worker of deadWorkers) {
      console.log(`[Recovery Coordinator] Worker ${worker.id} (${worker.hostname}) is dead! Marking offline...`);
      
      // Update worker status to offline
      await query(
        'UPDATE workers SET status = "offline", updated_at = NOW() WHERE id = ?',
        [worker.id]
      );
      
      // Find jobs locked by this worker that are in claimed or running status
      const orphanedJobs = await query(
        `SELECT j.id, j.name, j.retry_count, j.max_retries, j.queue_id, j.payload
         FROM jobs j
         JOIN job_executions je ON j.last_execution_id = je.id
         WHERE je.worker_id = ? AND j.status IN ('claimed', 'running')`,
        [worker.id]
      );

      for (const job of orphanedJobs) {
        console.log(`[Recovery Coordinator] Recovering orphaned job "${job.name}" (${job.id})...`);
        
        const conn = await getTransaction();
        try {
          // Finalize the failed running execution log
          const errorMsg = 'Worker node crashed or failed to send heartbeat.';
          await conn.query(
            `UPDATE job_executions je
             SET je.status = 'failed', je.finished_at = NOW(), je.error_message = ?, 
                 je.stderr_logs = CONCAT(COALESCE(je.stderr_logs, ''), '\n[Recovery Coordinator] Worker heartbeat timeout. Execution aborted.')
             WHERE je.job_id = ? AND je.worker_id = ? AND je.status = 'running'`,
            [errorMsg, job.id, worker.id]
          );

          const nextRetry = job.retry_count + 1;
          if (nextRetry <= job.max_retries) {
            // Re-queue the job immediately
            await conn.query(
              'UPDATE jobs SET status = "queued", retry_count = ?, run_at = NOW(), updated_at = NOW() WHERE id = ?',
              [nextRetry, job.id]
            );
            console.log(`[Recovery Coordinator] Re-queued job "${job.name}" (${job.id})`);
            emitEvent('job:updated', { id: job.id, status: 'queued', retry_count: nextRetry });
          } else {
            // Move to DLQ
            await conn.query(
              'UPDATE jobs SET status = "dlq", updated_at = NOW() WHERE id = ?',
              [job.id]
            );

            const dlqId = randomUUID();
            await conn.query(
              `INSERT INTO dead_letter_queue (id, job_id, queue_id, failed_at, error_summary, original_payload, retry_count)
               VALUES (?, ?, ?, NOW(), ?, ?, ?)`,
              [
                dlqId,
                job.id,
                job.queue_id,
                errorMsg,
                JSON.stringify(job.payload),
                job.retry_count
              ]
            );
            console.log(`[Recovery Coordinator] Job "${job.name}" exceeded retries. Moved to DLQ.`);
            emitEvent('job:updated', { id: job.id, status: 'dlq' });
          }

          await conn.commit();
        } catch (err) {
          await conn.rollback();
          console.error(`Failed to recover job ${job.id}:`, err);
        } finally {
          conn.release();
        }
      }
    }
  } catch (error) {
    console.error('Failed to run recoverOrphanedJobs coordinator cycle:', error);
  }
}

// -------------------------------------------------------------
// SHUTDOWN LIFECYCLE
// -------------------------------------------------------------

function shutdownGracefully() {
  console.log('Worker received shutdown signal. Stopping polling and finishing current jobs...');
  running = false;
}

process.on('SIGINT', shutdownGracefully);
process.on('SIGTERM', shutdownGracefully);

// Run worker
startWorker();
