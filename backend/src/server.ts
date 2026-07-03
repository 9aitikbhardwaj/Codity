import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

import { query } from './database';
import { authenticateJWT, AuthRequest, requireAdmin } from './middleware/auth';
import { setSocketIO, emitEvent } from './eventBus';

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

setSocketIO(io);

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_distributed_scheduler_jwt_key_2026';

// -------------------------------------------------------------
// AUTH ROUTES
// -------------------------------------------------------------

app.post('/api/auth/register', async (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    const role = 'member'; // Default role

    await query(
      'INSERT INTO users (id, email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, ?)',
      [id, email, passwordHash, firstName, lastName, role]
    );

    const token = jwt.sign({ id, email, role }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ token, user: { id, email, firstName, lastName, role } });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Database error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const users = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
      expiresIn: '24h',
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const users = await query('SELECT id, email, first_name, last_name, role FROM users WHERE id = ?', [
      req.user?.id,
    ]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = users[0];
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
    });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// -------------------------------------------------------------
// PROJECT ROUTES
// -------------------------------------------------------------

app.get('/api/projects', authenticateJWT, async (req, res) => {
  try {
    const projects = await query('SELECT * FROM projects ORDER BY name ASC');
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

app.post('/api/projects', authenticateJWT, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });

  try {
    // Get first organization or create one
    let orgId = 'org-123456';
    const id = randomUUID();
    await query('INSERT INTO projects (id, name, organization_id) VALUES (?, ?, ?)', [
      id,
      name,
      orgId,
    ]);
    const project = { id, name, organization_id: orgId };
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// -------------------------------------------------------------
// QUEUE ROUTES
// -------------------------------------------------------------

app.get('/api/queues', authenticateJWT, async (req, res) => {
  try {
    const queues = await query(`
      SELECT 
        q.*, 
        rp.name as retry_policy_name,
        rp.strategy as retry_strategy,
        rp.max_retries,
        COALESCE(SUM(CASE WHEN j.status = 'queued' THEN 1 ELSE 0 END), 0) as queued_count,
        COALESCE(SUM(CASE WHEN j.status = 'scheduled' THEN 1 ELSE 0 END), 0) as scheduled_count,
        COALESCE(SUM(CASE WHEN j.status = 'claimed' OR j.status = 'running' THEN 1 ELSE 0 END), 0) as running_count,
        COALESCE(SUM(CASE WHEN j.status = 'completed' THEN 1 ELSE 0 END), 0) as completed_count,
        COALESCE(SUM(CASE WHEN j.status = 'failed' OR j.status = 'dlq' THEN 1 ELSE 0 END), 0) as failed_count
      FROM queues q
      LEFT JOIN retry_policies rp ON q.retry_policy_id = rp.id
      LEFT JOIN jobs j ON q.id = j.queue_id
      GROUP BY q.id, rp.id
    `);
    res.json(queues);
  } catch (error) {
    console.error('Fetch queues error:', error);
    res.status(500).json({ error: 'Failed to fetch queues' });
  }
});

app.post('/api/queues', authenticateJWT, async (req, res) => {
  const { name, projectId, priority, concurrencyLimit, retryPolicyId } = req.body;
  if (!name || !projectId || !retryPolicyId) {
    return res.status(400).json({ error: 'Missing required queue details' });
  }

  try {
    const id = randomUUID();
    await query(
      'INSERT INTO queues (id, name, project_id, priority, concurrency_limit, retry_policy_id, is_paused) VALUES (?, ?, ?, ?, ?, ?, 0)',
      [id, name, projectId, priority || 1, concurrencyLimit || 5, retryPolicyId]
    );
    res.status(201).json({ id, name, project_id: projectId, priority, concurrency_limit: concurrencyLimit, retry_policy_id: retryPolicyId });
    emitEvent('queue:created', { id, name });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Queue name already exists in this project' });
    }
    res.status(500).json({ error: 'Failed to create queue' });
  }
});

app.put('/api/queues/:id', authenticateJWT, async (req, res) => {
  const { priority, concurrencyLimit, isPaused } = req.body;
  try {
    await query(
      'UPDATE queues SET priority = COALESCE(?, priority), concurrency_limit = COALESCE(?, concurrency_limit), is_paused = COALESCE(?, is_paused) WHERE id = ?',
      [priority, concurrencyLimit, isPaused !== undefined ? (isPaused ? 1 : 0) : null, req.params.id]
    );
    res.json({ success: true });
    emitEvent('queue:updated', { id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update queue' });
  }
});

app.post('/api/queues/:id/pause', authenticateJWT, async (req, res) => {
  try {
    await query('UPDATE queues SET is_paused = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true, is_paused: true });
    emitEvent('queue:updated', { id: req.params.id, is_paused: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to pause queue' });
  }
});

app.post('/api/queues/:id/resume', authenticateJWT, async (req, res) => {
  try {
    await query('UPDATE queues SET is_paused = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true, is_paused: false });
    emitEvent('queue:updated', { id: req.params.id, is_paused: false });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resume queue' });
  }
});

app.get('/api/retry-policies', authenticateJWT, async (req, res) => {
  try {
    const policies = await query('SELECT * FROM retry_policies');
    res.json(policies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch retry policies' });
  }
});

// -------------------------------------------------------------
// JOB ROUTES
// -------------------------------------------------------------

app.get('/api/jobs', authenticateJWT, async (req, res) => {
  const { queueId, status, search, limit = '20', offset = '0', batchId } = req.query;

  try {
    let sql = `
      SELECT j.*, q.name as queue_name, q.priority as queue_priority
      FROM jobs j
      JOIN queues q ON j.queue_id = q.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (queueId) {
      sql += ' AND j.queue_id = ?';
      params.push(queueId);
    }
    if (status) {
      sql += ' AND j.status = ?';
      params.push(status);
    }
    if (batchId) {
      sql += ' AND j.batch_id = ?';
      params.push(batchId);
    }
    if (search) {
      sql += ' AND (j.name LIKE ? OR j.id = ?)';
      params.push(`%${search}%`, search);
    }

    sql += ' ORDER BY j.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(offset as string));

    const jobs = await query(sql, params);

    // Get count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM jobs j WHERE 1=1';
    const countParams: any[] = [];
    if (queueId) {
      countSql += ' AND j.queue_id = ?';
      countParams.push(queueId);
    }
    if (status) {
      countSql += ' AND j.status = ?';
      countParams.push(status);
    }
    if (batchId) {
      countSql += ' AND j.batch_id = ?';
      countParams.push(batchId);
    }
    if (search) {
      countSql += ' AND (j.name LIKE ? OR j.id = ?)';
      countParams.push(`%${search}%`, search);
    }
    const [{ total }] = await query(countSql, countParams);

    res.json({ jobs, total });
  } catch (error) {
    console.error('Fetch jobs error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

app.post('/api/jobs', authenticateJWT, async (req, res) => {
  const { name, queueId, payload, priorityOverride, runAt, cronExpression, maxRetries, batchId, dependencies } = req.body;

  if (!name || !queueId) {
    return res.status(400).json({ error: 'Job name and queueId are required' });
  }

  try {
    const queue = await query('SELECT * FROM queues WHERE id = ?', [queueId]);
    if (queue.length === 0) {
      return res.status(404).json({ error: 'Queue not found' });
    }

    // Default policy
    const policy = await query('SELECT rp.max_retries FROM queues q JOIN retry_policies rp ON q.retry_policy_id = rp.id WHERE q.id = ?', [queueId]);
    const maxRetriesDefault = policy[0]?.max_retries || 3;

    const id = randomUUID();
    const finalStatus = cronExpression ? 'scheduled' : (dependencies && dependencies.length > 0 ? 'scheduled' : 'queued');
    const finalRunAt = runAt ? new Date(runAt) : new Date();

    await query(
      `INSERT INTO jobs (id, queue_id, name, payload, status, priority_override, run_at, cron_expression, retry_count, max_retries, batch_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        queueId,
        name,
        JSON.stringify(payload || {}),
        finalStatus,
        priorityOverride || null,
        finalRunAt,
        cronExpression || null,
        maxRetries !== undefined ? maxRetries : maxRetriesDefault,
        batchId || null
      ]
    );

    // If there are workflow dependencies, insert them
    if (dependencies && Array.isArray(dependencies)) {
      for (const parentId of dependencies) {
        // verify parent exists
        const parent = await query('SELECT id, status FROM jobs WHERE id = ?', [parentId]);
        if (parent.length > 0) {
          const depId = randomUUID();
          await query(
            'INSERT INTO job_dependencies (id, parent_job_id, child_job_id, status) VALUES (?, ?, ?, ?)',
            [depId, parentId, id, parent[0].status === 'completed' ? 'completed' : 'pending']
          );
        }
      }

      // If any dependency is pending, ensure job is marked as scheduled
      const pendingDeps = await query('SELECT id FROM job_dependencies WHERE child_job_id = ? AND status != "completed"', [id]);
      if (pendingDeps.length > 0) {
        await query('UPDATE jobs SET status = "scheduled" WHERE id = ?', [id]);
      } else if (!cronExpression) {
        // All dependencies are already complete (or none were pending)
        await query('UPDATE jobs SET status = "queued" WHERE id = ?', [id]);
      }
    }

    res.status(201).json({ id, name, status: finalStatus });
    emitEvent('job:created', { id, name, queueId, status: finalStatus });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

app.get('/api/jobs/:id', authenticateJWT, async (req, res) => {
  try {
    const jobs = await query(`
      SELECT j.*, q.name as queue_name
      FROM jobs j
      JOIN queues q ON j.queue_id = q.id
      WHERE j.id = ?
    `, [req.params.id]);

    if (jobs.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get executions history
    const executions = await query(`
      SELECT je.*, w.hostname 
      FROM job_executions je
      LEFT JOIN workers w ON je.worker_id = w.id
      WHERE je.job_id = ?
      ORDER BY je.started_at DESC
    `, [req.params.id]);

    // Get workflow dependencies
    const parentDependencies = await query(`
      SELECT jd.*, j.name as parent_job_name, j.status as parent_job_status
      FROM job_dependencies jd
      JOIN jobs j ON jd.parent_job_id = j.id
      WHERE jd.child_job_id = ?
    `, [req.params.id]);

    const childDependencies = await query(`
      SELECT jd.*, j.name as child_job_name, j.status as child_job_status
      FROM job_dependencies jd
      JOIN jobs j ON jd.child_job_id = j.id
      WHERE jd.parent_job_id = ?
    `, [req.params.id]);

    res.json({
      job: jobs[0],
      executions,
      dependencies: {
        parents: parentDependencies,
        children: childDependencies
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job details' });
  }
});

app.post('/api/jobs/:id/retry', authenticateJWT, async (req, res) => {
  try {
    const jobs = await query('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
    if (jobs.length === 0) return res.status(404).json({ error: 'Job not found' });
    
    const job = jobs[0];
    if (job.status !== 'failed' && job.status !== 'dlq' && job.status !== 'cancelled') {
      return res.status(400).json({ error: 'Only failed, dlq, or cancelled jobs can be retried' });
    }

    // Put job back into queue
    await query(
      'UPDATE jobs SET status = "queued", retry_count = 0, run_at = NOW() WHERE id = ?',
      [req.params.id]
    );

    // Remove from DLQ table if exists
    await query('DELETE FROM dead_letter_queue WHERE job_id = ?', [req.params.id]);

    res.json({ success: true, status: 'queued' });
    emitEvent('job:updated', { id: req.params.id, status: 'queued' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retry job' });
  }
});

app.post('/api/jobs/:id/cancel', authenticateJWT, async (req, res) => {
  try {
    const jobs = await query('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
    if (jobs.length === 0) return res.status(404).json({ error: 'Job not found' });
    
    const job = jobs[0];
    if (job.status !== 'queued' && job.status !== 'scheduled') {
      return res.status(400).json({ error: 'Only queued or scheduled jobs can be cancelled' });
    }

    await query('UPDATE jobs SET status = "cancelled" WHERE id = ?', [req.params.id]);
    res.json({ success: true, status: 'cancelled' });
    emitEvent('job:updated', { id: req.params.id, status: 'cancelled' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

// -------------------------------------------------------------
// WORKER MONITOR ROUTES
// -------------------------------------------------------------

app.get('/api/workers', authenticateJWT, async (req, res) => {
  try {
    const workers = await query(`
      SELECT 
        w.*,
        COALESCE((
          SELECT COUNT(*) 
          FROM job_executions je 
          JOIN jobs j ON je.job_id = j.id
          WHERE je.worker_id = w.id AND je.status = 'running' AND j.status = 'running'
        ), 0) as active_slots
      FROM workers w
      ORDER BY w.status ASC, w.last_heartbeat_at DESC
    `);
    res.json(workers);
  } catch (error) {
    console.error('Fetch workers error:', error);
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

// -------------------------------------------------------------
// LOGS & SYSTEM METRICS
// -------------------------------------------------------------

app.get('/api/executions/:id/logs', authenticateJWT, async (req, res) => {
  try {
    const execs = await query('SELECT stdout_logs, stderr_logs FROM job_executions WHERE id = ?', [req.params.id]);
    if (execs.length === 0) return res.status(404).json({ error: 'Execution logs not found' });
    res.json(execs[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

app.get('/api/metrics', authenticateJWT, async (req, res) => {
  try {
    // 1. Worker status summary
    const workersSummary = await query(`
      SELECT 
        SUM(CASE WHEN status = 'active' AND last_heartbeat_at >= NOW() - INTERVAL 15 SECOND THEN 1 ELSE 0 END) as active,
        COUNT(*) as total
      FROM workers
    `);

    // 2. Jobs execution count in last 24h
    const jobStats = await query(`
      SELECT 
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' OR status = 'dlq' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'running' OR status = 'claimed' THEN 1 END) as running,
        COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued
      FROM jobs
      WHERE updated_at >= NOW() - INTERVAL 24 HOUR
    `);

    // 3. Throughput hourly metrics (last 12 hours)
    const throughput = await query(`
      SELECT 
        DATE_FORMAT(finished_at, '%Y-%m-%d %H:00:00') as hour,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
      FROM job_executions
      WHERE finished_at >= NOW() - INTERVAL 12 HOUR
      GROUP BY hour
      ORDER BY hour ASC
    `);

    // 4. Queue performance metrics
    const queueMetrics = await query(`
      SELECT 
        q.name as queue_name,
        AVG(je.duration_ms) as avg_duration_ms,
        COUNT(je.id) as total_runs,
        SUM(CASE WHEN je.status = 'failed' THEN 1 ELSE 0 END) as failed_runs
      FROM job_executions je
      JOIN jobs j ON je.job_id = j.id
      JOIN queues q ON j.queue_id = q.id
      WHERE je.started_at >= NOW() - INTERVAL 24 HOUR
      GROUP BY q.id
    `);

    res.json({
      workers: workersSummary[0] || { active: 0, total: 0 },
      jobs24h: jobStats[0] || { completed: 0, failed: 0, running: 0, queued: 0 },
      throughput,
      queueMetrics,
    });
  } catch (error) {
    console.error('Fetch metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Scheduler API and Socket.io Server listening on port ${PORT}`);
});
export default server;
