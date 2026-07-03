import React, { useState, useEffect } from 'react';
import { 
  Pause, 
  Play, 
  Plus, 
  Settings,
  X,
  Layers,
  ArrowRightLeft
} from 'lucide-react';

interface Queue {
  id: string;
  name: string;
  project_id: string;
  priority: number;
  concurrency_limit: number;
  retry_policy_id: string;
  retry_policy_name: string;
  retry_strategy: string;
  max_retries: number;
  is_paused: number;
  queued_count: string;
  scheduled_count: string;
  running_count: string;
  completed_count: string;
  failed_count: string;
}

interface Project {
  id: string;
  name: string;
}

interface RetryPolicy {
  id: string;
  name: string;
  strategy: string;
  max_retries: number;
}

export default function QueueManager({ token, refreshTrigger }: { token: string; refreshTrigger: number }) {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [policies, setPolicies] = useState<RetryPolicy[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [queueName, setQueueName] = useState('');
  const [concurrency, setConcurrency] = useState(5);
  const [priority, setPriority] = useState(1);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = async () => {
    try {
      const qRes = await fetch('/api/queues', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const qData = await qRes.json();
      setQueues(qData);

      const pRes = await fetch('/api/projects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const pData = await pRes.json();
      setProjects(pData);
      if (pData.length > 0 && !selectedProject) {
        setSelectedProject(pData[0].id);
      }

      const rpRes = await fetch('/api/retry-policies', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const rpData = await rpRes.json();
      setPolicies(rpData);
      if (rpData.length > 0 && !selectedPolicy) {
        setSelectedPolicy(rpData[0].id);
      }
    } catch (err) {
      console.error('Failed to load queue settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token, refreshTrigger]);

  const handlePauseToggle = async (queue: Queue) => {
    const action = queue.is_paused ? 'resume' : 'pause';
    try {
      const res = await fetch(`/api/queues/${queue.id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setQueues(queues.map(q => q.id === queue.id ? { ...q, is_paused: queue.is_paused ? 0 : 1 } : q));
      }
    } catch (err) {
      console.error(`Error toggling pause state for ${queue.name}:`, err);
    }
  };

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!queueName) {
      setErrorMsg('Queue name is required');
      return;
    }

    try {
      const res = await fetch('/api/queues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: queueName,
          projectId: selectedProject,
          priority: Number(priority),
          concurrencyLimit: Number(concurrency),
          retryPolicyId: selectedPolicy
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create queue');
      }

      setIsModalOpen(false);
      setQueueName('');
      loadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const getPriorityLabel = (priority: number) => {
    if (priority === 1) return { text: 'Low', color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.04)' };
    if (priority === 2) return { text: 'Medium', color: 'var(--accent-primary)', bg: 'rgba(59, 130, 246, 0.1)' };
    return { text: 'High', color: 'var(--accent-warning)', bg: 'rgba(245, 158, 11, 0.1)' };
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title-desc">
          <h1 className="page-title">Queue Manager</h1>
          <p className="page-subtitle">Inspect throughput rates, pause workers, and tune concurrency settings</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} />
          <span>New Queue</span>
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>Syncing queues...</div>
      ) : (
        <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
          <div className="table-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Queue Name</th>
                  <th>Priority</th>
                  <th>Concurrency</th>
                  <th>Retry Policy</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Jobs (Q / R / F / C)</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {queues.length > 0 ? (
                  queues.map((q) => {
                    const priorityConfig = getPriorityLabel(q.priority);
                    return (
                      <tr key={q.id}>
                        <td style={{ fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Layers size={16} style={{ color: 'var(--accent-primary)' }} />
                            <span>{q.name}</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ 
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            fontSize: '0.75rem', 
                            fontWeight: 600,
                            color: priorityConfig.color, 
                            background: priorityConfig.bg 
                          }}>
                            {priorityConfig.text}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>
                          {q.concurrency_limit} parallel workers
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span>{q.retry_policy_name}</span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                              {q.retry_strategy} (max {q.max_retries} retries)
                            </span>
                          </div>
                        </td>
                        <td>
                          <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: q.is_paused ? 'var(--accent-warning)' : 'var(--accent-success)'
                          }}>
                            <span style={{ 
                              width: '6px', 
                              height: '6px', 
                              borderRadius: '50%', 
                              background: q.is_paused ? 'var(--accent-warning)' : 'var(--accent-success)' 
                            }} />
                            {q.is_paused ? 'Paused' : 'Active'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 500 }}>
                          <span style={{ color: 'var(--accent-warning)' }} title="Queued">{q.queued_count}</span>
                          <span style={{ color: 'var(--text-muted)' }}> / </span>
                          <span style={{ color: 'var(--accent-primary)' }} title="Running">{q.running_count}</span>
                          <span style={{ color: 'var(--text-muted)' }}> / </span>
                          <span style={{ color: 'var(--accent-error)' }} title="Failed">{q.failed_count}</span>
                          <span style={{ color: 'var(--text-muted)' }}> / </span>
                          <span style={{ color: 'var(--accent-success)' }} title="Completed">{q.completed_count}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            className={`btn ${q.is_paused ? 'btn-success' : 'btn-danger'}`}
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                            onClick={() => handlePauseToggle(q)}
                          >
                            {q.is_paused ? <Play size={12} /> : <Pause size={12} />}
                            <span>{q.is_paused ? 'Resume' : 'Pause'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                      No queues registered. Create one to begin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE QUEUE MODAL */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={20} style={{ color: 'var(--accent-primary)' }} />
                <span>Create Queue</span>
              </h2>
              <div style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </div>
            </div>

            <form onSubmit={handleCreateQueue}>
              <div className="form-group">
                <label className="form-label">Queue Identifier (Unique)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. email-dispatch-queue" 
                  value={queueName} 
                  onChange={e => setQueueName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Project Domain</label>
                <select 
                  className="form-select" 
                  value={selectedProject} 
                  onChange={e => setSelectedProject(e.target.value)}
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Queue Priority</label>
                  <select 
                    className="form-select" 
                    value={priority} 
                    onChange={e => setPriority(Number(e.target.value))}
                  >
                    <option value={1}>Low priority (1)</option>
                    <option value={2}>Medium priority (2)</option>
                    <option value={3}>High priority (3)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Concurrency Limit</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min={1} 
                    max={50} 
                    value={concurrency} 
                    onChange={e => setConcurrency(Number(e.target.value))} 
                    required 
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Retry Failure Strategy</label>
                <select 
                  className="form-select" 
                  value={selectedPolicy} 
                  onChange={e => setSelectedPolicy(e.target.value)}
                >
                  {policies.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.strategy} strategy - {p.max_retries} max)
                    </option>
                  ))}
                </select>
              </div>

              {errorMsg && (
                <div style={{ color: 'var(--accent-error)', fontSize: '0.85rem', marginBottom: '16px', textAlign: 'center' }}>
                  ⚠️ {errorMsg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Queue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
