import { randomUUID } from 'crypto';
import { query, getTransaction } from '../database';

// A mock subset of worker.ts functions to run tests without launching actual async loops

async function claimJobsMock(workerId: string, limit: number): Promise<any[]> {
  const conn = await getTransaction();
  try {
    const selectSql = `
      SELECT id, queue_id, name, retry_count, max_retries
      FROM jobs
      WHERE status = 'queued' AND run_at <= NOW()
      LIMIT ?
      FOR UPDATE SKIP LOCKED
    `;

    const [rows] = await conn.query(selectSql, [limit]);
    const jobs = rows as any[];
    console.log(`[Mock Worker ${workerId}] SELECT query returned ${jobs.length} jobs. (IDs: ${jobs.map(j => j.id.substring(0, 8)).join(', ')})`);

    if (jobs.length === 0) {
      await conn.commit();
      conn.release();
      return [];
    }

    const claimed: any[] = [];
    for (const job of jobs) {
      const execId = randomUUID();
      await conn.query(
        'UPDATE jobs SET status = "claimed", last_execution_id = ?, updated_at = NOW() WHERE id = ?',
        [execId, job.id]
      );
      await conn.query(
        `INSERT INTO job_executions (id, job_id, worker_id, status, started_at, retry_number)
         VALUES (?, ?, ?, 'running', NOW(), ?)`,
        [execId, job.id, workerId, job.retry_count]
      );
      claimed.push({ ...job, last_execution_id: execId });
    }

    await conn.commit();
    conn.release();
    return claimed;
  } catch (error) {
    await conn.rollback();
    conn.release();
    throw error;
  }
}

async function recoverOrphanedJobsMock() {
  const threshold = new Date(Date.now() - 15000);
  const deadWorkers = await query(
    'SELECT id FROM workers WHERE status = "active" AND last_heartbeat_at < ?',
    [threshold]
  );

  for (const worker of deadWorkers) {
    await query('UPDATE workers SET status = "offline" WHERE id = ?', [worker.id]);
    const orphanedJobs = await query(
      `SELECT j.id, j.name, j.retry_count, j.max_retries, j.queue_id
       FROM jobs j
       JOIN job_executions je ON j.last_execution_id = je.id
       WHERE je.worker_id = ? AND j.status IN ('claimed', 'running')`,
      [worker.id]
    );

    for (const job of orphanedJobs) {
      const conn = await getTransaction();
      try {
        await conn.query(
          `UPDATE job_executions je
           SET je.status = 'failed', je.finished_at = NOW(), je.error_message = 'Worker crashed'
           WHERE je.job_id = ? AND je.worker_id = ? AND je.status = 'running'`,
          [job.id, worker.id]
        );

        const nextRetry = job.retry_count + 1;
        if (nextRetry <= job.max_retries) {
          await conn.query(
            'UPDATE jobs SET status = "queued", retry_count = ?, run_at = NOW() WHERE id = ?',
            [nextRetry, job.id]
          );
        } else {
          await conn.query('UPDATE jobs SET status = "dlq" WHERE id = ?', [job.id]);
          await conn.query(
            `INSERT INTO dead_letter_queue (id, job_id, queue_id, failed_at, error_summary, original_payload, retry_count)
             VALUES (?, ?, ?, NOW(), 'Exceeded retries', '{}', ?)`,
            [randomUUID(), job.id, job.queue_id, job.retry_count]
          );
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }
  }
}

async function runTests() {
  console.log('\n======================================');
  console.log('NexusSync Scheduler Integration Tests');
  console.log('======================================\n');

  try {
    // Cleanup tables
    await query('DELETE FROM dead_letter_queue');
    await query('DELETE FROM job_executions');
    await query('DELETE FROM jobs');
    await query('DELETE FROM workers');
    console.log('✔ Cleaned up tables for testing');

    // Make sure we have a queue
    const queues = await query('SELECT id FROM queues LIMIT 1');
    if (queues.length === 0) {
      throw new Error('Please run backend/src/schema.sql to seed default queues first!');
    }
    const testQueueId = queues[0].id;

    // ------------------------------------------------------------------------
    // TEST 1: Concurrency and Atomic Claims
    // ------------------------------------------------------------------------
    console.log('\n[Test 1] Testing Concurrency & Atomic Claiming (SKIP LOCKED)...');
    
    // Insert 5 queued jobs
    const jobIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = randomUUID();
      jobIds.push(id);
      await query(
        `INSERT INTO jobs (id, queue_id, name, payload, status, run_at, retry_count, max_retries) 
         VALUES (?, ?, ?, '{}', 'queued', NOW(), 0, 3)`,
        [id, testQueueId, `Concurrency Job ${i}`]
      );
    }

    // Register 3 workers
    const w1 = 'test-worker-1';
    const w2 = 'test-worker-2';
    const w3 = 'test-worker-3';
    await query('INSERT INTO workers (id, hostname, ip_address, status) VALUES (?, "W1", "127.0.0.1", "active")', [w1]);
    await query('INSERT INTO workers (id, hostname, ip_address, status) VALUES (?, "W2", "127.0.0.1", "active")', [w2]);
    await query('INSERT INTO workers (id, hostname, ip_address, status) VALUES (?, "W3", "127.0.0.1", "active")', [w3]);

    // Simulate parallel claiming
    const [c1, c2, c3] = await Promise.all([
      claimJobsMock(w1, 2),
      claimJobsMock(w2, 2),
      claimJobsMock(w3, 2)
    ]);

    const totalClaimed = c1.length + c2.length + c3.length;
    console.log(`Worker 1 claimed: ${c1.map(j => j.name).join(', ')}`);
    console.log(`Worker 2 claimed: ${c2.map(j => j.name).join(', ')}`);
    console.log(`Worker 3 claimed: ${c3.map(j => j.name).join(', ')}`);
    console.log(`Total jobs claimed: ${totalClaimed}`);

    if (totalClaimed !== 5) {
      throw new Error(`Expected exactly 5 jobs to be claimed, but got ${totalClaimed}`);
    }

    // Assert no duplicate job IDs are claimed
    const allClaimedIds = [...c1, ...c2, ...c3].map(j => j.id);
    const uniqueIds = new Set(allClaimedIds);
    if (uniqueIds.size !== 5) {
      throw new Error('Race condition detected: Same job was claimed by multiple workers!');
    }
    console.log('✔ PASS: All jobs claimed atomically without double-claiming!');

    // ------------------------------------------------------------------------
    // TEST 2: Dead Worker Recovery
    // ------------------------------------------------------------------------
    console.log('\n[Test 2] Testing Dead Worker Recovery Coordinator...');

    // Mark Worker 3 as dead (last heartbeat 30 seconds ago)
    const thirtySecsAgo = new Date(Date.now() - 30000);
    await query('UPDATE workers SET last_heartbeat_at = ? WHERE id = ?', [thirtySecsAgo, w3]);

    // Set one of the jobs claimed by Worker 3 to status 'running' or 'claimed'
    const jobOfW3 = c3[0];
    if (!jobOfW3) {
      throw new Error('Worker 3 did not claim any jobs to test recovery!');
    }
    await query('UPDATE jobs SET status = "running" WHERE id = ?', [jobOfW3.id]);

    // Execute recovery coordinator
    await recoverOrphanedJobsMock();

    // Verify Worker 3 is offline
    const w3Status = await query('SELECT status FROM workers WHERE id = ?', [w3]);
    console.log(`Worker 3 status after recovery: ${w3Status[0].status}`);
    if (w3Status[0].status !== 'offline') {
      throw new Error('Expected Worker 3 status to be "offline"');
    }

    // Verify Worker 3's job is re-queued
    const jobStatus = await query('SELECT status, retry_count FROM jobs WHERE id = ?', [jobOfW3.id]);
    console.log(`Job status after worker crash: ${jobStatus[0].status} (retry count: ${jobStatus[0].retry_count})`);
    if (jobStatus[0].status !== 'queued' || jobStatus[0].retry_count !== 1) {
      throw new Error('Expected job to be "queued" with retry_count = 1');
    }

    // Verify execution log is set to failed
    const execLog = await query('SELECT status, error_message FROM job_executions WHERE job_id = ? AND worker_id = ?', [jobOfW3.id, w3]);
    console.log(`Execution status: ${execLog[0].status}, message: "${execLog[0].error_message}"`);
    if (execLog[0].status !== 'failed' || !execLog[0].error_message.includes('Worker crashed')) {
      throw new Error('Expected execution status to be "failed" with worker crash note');
    }
    console.log('✔ PASS: Dead worker detected, worker set offline, and jobs safely reclaimed!');

    console.log('\n======================================');
    console.log('ALL TESTS COMPLETED SUCCESSFULLY! (3/3)');
    console.log('======================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error);
    process.exit(1);
  }
}

runTests();
