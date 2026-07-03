import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Play, 
  XCircle, 
  RotateCcw, 
  Info,
  Calendar,
  Layers,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Code,
  FileText
} from 'lucide-react';
import LogViewer from './LogViewer';

interface Job {
  id: string;
  queue_id: string;
  queue_name: string;
  name: string;
  payload: any;
  status: string;
  priority_override: number | null;
  run_at: string;
  cron_expression: string | null;
  retry_count: number;
  max_retries: number;
  last_execution_id: string | null;
  batch_id: string | null;
  created_at: string;
}

interface Queue {
  id: string;
  name: string;
}

export default function JobExplorer({ token, refreshTrigger }: { token: string; refreshTrigger: number }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [selectedQueue, setSelectedQueue] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  // New Job Modal States
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);
  const [newJobName, setNewJobName] = useState('');
  const [newJobQueue, setNewJobQueue] = useState('');
  const [payloadTemplate, setPayloadTemplate] = useState('email');
  const [payloadText, setPayloadText] = useState(JSON.stringify({ recipient: 'user@acme.com', subject: 'Welcome!', body: 'Hello!' }, null, 2));
  const [priorityOverride, setPriorityOverride] = useState('');
  const [scheduleType, setScheduleType] = useState('immediate');
  const [delayTime, setDelayTime] = useState('');
  const [cronExpression, setCronExpression] = useState('*/5 * * * *');
  const [selectedParentJobs, setSelectedParentJobs] = useState<string[]>([]);
  const [availableParentJobs, setAvailableParentJobs] = useState<Job[]>([]);
  const [newJobError, setNewJobError] = useState('');

  // Job Details Modal States
  const [inspectedJob, setInspectedJob] = useState<any | null>(null);
  const [isInspectOpen, setIsInspectOpen] = useState(false);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const statusParam = statusTab !== 'all' ? `&status=${statusTab}` : '';
      const queueParam = selectedQueue ? `&queueId=${selectedQueue}` : '';
      const searchParam = search ? `&search=${search}` : '';
      const offset = (page - 1) * limit;

      const res = await fetch(`/api/jobs?limit=${limit}&offset=${offset}${statusParam}${queueParam}${searchParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setJobs(data.jobs || []);
      setTotalJobs(data.total || 0);

      // Load queues for dropdown filter
      const qRes = await fetch('/api/queues', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const qData = await qRes.json();
      setQueues(qData);
      if (qData.length > 0 && !newJobQueue) {
        setNewJobQueue(qData[0].id);
      }
    } catch (err) {
      console.error('Failed to load jobs list:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load parent candidate jobs
  useEffect(() => {
    if (isNewJobOpen) {
      // Find jobs that are in scheduled, queued, or completed state to act as dependencies
      fetch('/api/jobs?limit=50', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setAvailableParentJobs(data.jobs || []))
        .catch(err => console.error(err));
    }
  }, [isNewJobOpen, token]);

  useEffect(() => {
    loadJobs();
  }, [token, refreshTrigger, statusTab, selectedQueue, page]);

  // Handle Search Input Debouncing / Submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadJobs();
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        loadJobs();
        if (isInspectOpen && inspectedJob?.job.id === jobId) {
          handleInspectJob(jobId);
        }
      }
    } catch (err) {
      console.error('Failed to retry job:', err);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        loadJobs();
        if (isInspectOpen && inspectedJob?.job.id === jobId) {
          handleInspectJob(jobId);
        }
      }
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  };

  const handleInspectJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setInspectedJob(data);
      setIsInspectOpen(true);
      // Select latest execution by default
      if (data.executions && data.executions.length > 0) {
        setSelectedExecutionId(data.executions[0].id);
      } else {
        setSelectedExecutionId(null);
      }
    } catch (err) {
      console.error('Failed to inspect job details:', err);
    }
  };

  const handlePayloadTemplateChange = (template: string) => {
    setPayloadTemplate(template);
    if (template === 'email') {
      setPayloadText(JSON.stringify({ recipient: 'user@acme.com', subject: 'Account Verified', body: 'Your account is active!' }, null, 2));
    } else if (template === 'report') {
      setPayloadText(JSON.stringify({ reportType: 'Q2_Revenue', format: 'pdf', charts: true }, null, 2));
    } else if (template === 'image') {
      setPayloadText(JSON.stringify({ imageUrl: 'https://cdn.acme.com/assets/banner.png', targetWidth: 1080, quality: 85 }, null, 2));
    } else if (template === 'webhook') {
      setPayloadText(JSON.stringify({ webhookUrl: 'https://api.acme.com/webhooks/listener', retryOnFail: true }, null, 2));
    } else {
      setPayloadText(JSON.stringify({ steps: 5, debugMode: false }, null, 2));
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewJobError('');

    if (!newJobName) {
      setNewJobError('Job name is required');
      return;
    }

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch (err) {
      setNewJobError('Invalid JSON format in payload text');
      return;
    }

    let runAtDate = null;
    if (scheduleType === 'delayed') {
      if (!delayTime) {
        setNewJobError('Please select a delayed run time');
        return;
      }
      runAtDate = new Date(delayTime).toISOString();
    }

    try {
      const body: any = {
        name: newJobName,
        queueId: newJobQueue,
        payload: parsedPayload,
        priorityOverride: priorityOverride ? Number(priorityOverride) : undefined,
        dependencies: selectedParentJobs
      };

      if (scheduleType === 'delayed') {
        body.runAt = runAtDate;
      } else if (scheduleType === 'recurring') {
        body.cronExpression = cronExpression;
      }

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to trigger job');
      }

      setIsNewJobOpen(false);
      setNewJobName('');
      setSelectedParentJobs([]);
      setPage(1);
      loadJobs();
    } catch (err: any) {
      setNewJobError(err.message);
    }
  };

  const toggleParentJob = (jobId: string) => {
    if (selectedParentJobs.includes(jobId)) {
      setSelectedParentJobs(selectedParentJobs.filter(id => id !== jobId));
    } else {
      setSelectedParentJobs([...selectedParentJobs, jobId]);
    }
  };

  const totalPages = Math.ceil(totalJobs / limit);

  return (
    <div>
      <div className="page-header">
        <div className="page-title-desc">
          <h1 className="page-title">Job Explorer</h1>
          <p className="page-subtitle">Search background workloads, view logs, schedule delayed executions, and manage workflows</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsNewJobOpen(true)}>
          <Play size={16} />
          <span>Trigger Job</span>
        </button>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="card" style={{ marginBottom: '24px', padding: '16px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '260px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              className="form-input" 
              style={{ paddingLeft: '40px' }} 
              placeholder="Search by job name or exact ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div style={{ width: '220px' }}>
            <select 
              className="form-select"
              value={selectedQueue}
              onChange={e => { setSelectedQueue(e.target.value); setPage(1); }}
            >
              <option value="">All Job Queues</option>
              {queues.map(q => (
                <option key={q.id} value={q.id}>{q.name}</option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn btn-secondary">
            <Filter size={16} />
            <span>Apply filters</span>
          </button>
        </form>
      </div>

      {/* STATUS TABS */}
      <div className="tabs-header">
        {['all', 'queued', 'scheduled', 'running', 'completed', 'failed', 'dlq', 'cancelled'].map(tab => (
          <div 
            key={tab}
            className={`tab-btn ${statusTab === tab ? 'active' : ''}`}
            onClick={() => { setStatusTab(tab); setPage(1); }}
          >
            {tab}
          </div>
        ))}
      </div>

      {/* JOBS TABLE LIST */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>Syncing workloads database...</div>
      ) : (
        <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
          <div className="table-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Name</th>
                  <th>Queue</th>
                  <th>Status</th>
                  <th>Execution Schedule</th>
                  <th>Retries</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length > 0 ? (
                  jobs.map((job) => (
                    <tr key={job.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {job.id.substring(0, 8)}...
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>{job.name}</span>
                          {job.cron_expression && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent-purple)', fontWeight: 500 }}>
                              ↻ Cron: {job.cron_expression}
                            </span>
                          )}
                          {job.batch_id && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Batch: {job.batch_id.substring(0, 8)}...
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                          <Layers size={14} style={{ color: 'var(--text-muted)' }} />
                          <span>{job.queue_name}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${job.status}`}>{job.status}</span>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {new Date(job.run_at).toLocaleString()}
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {job.retry_count} / {job.max_retries}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          {(job.status === 'failed' || job.status === 'dlq' || job.status === 'cancelled') && (
                            <button 
                              className="btn btn-success" 
                              style={{ padding: '6px 10px', borderRadius: '8px' }}
                              onClick={() => handleRetryJob(job.id)}
                              title="Retry Execution"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}

                          {(job.status === 'queued' || job.status === 'scheduled') && (
                            <button 
                              className="btn btn-danger" 
                              style={{ padding: '6px 10px', borderRadius: '8px' }}
                              onClick={() => handleCancelJob(job.id)}
                              title="Cancel Execution"
                            >
                              <XCircle size={14} />
                            </button>
                          )}

                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '6px 10px', borderRadius: '8px' }}
                            onClick={() => handleInspectJob(job.id)}
                            title="Inspect Details & Logs"
                          >
                            <Info size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                      No jobs match the active filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION CONTROL */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid var(--card-border)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Showing page {page} of {totalPages} ({totalJobs} total jobs)
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '8px 12px' }}
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                >
                  <ChevronLeft size={16} />
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '8px 12px' }}
                  disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TRIGGER NEW JOB MODAL */}
      {isNewJobOpen && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Play size={20} style={{ color: 'var(--accent-primary)' }} />
                <span>Trigger Job</span>
              </h2>
              <div style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => setIsNewJobOpen(false)}>
                <XCircle size={20} />
              </div>
            </div>

            <form onSubmit={handleCreateJob}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Job Name / Description</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Email Dispatch Task" 
                    value={newJobName}
                    onChange={e => setNewJobName(e.target.value)}
                    required 
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Target Queue</label>
                  <select 
                    className="form-select"
                    value={newJobQueue}
                    onChange={e => setNewJobQueue(e.target.value)}
                    required
                  >
                    {queues.map(q => (
                      <option key={q.id} value={q.id}>{q.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* PAYLOAD TEMPLATE PRESets */}
              <div className="form-group">
                <label className="form-label">Job Payload Preset Template</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {['email', 'report', 'image', 'webhook', 'generic'].map(temp => (
                    <button
                      key={temp}
                      type="button"
                      className={`btn ${payloadTemplate === temp ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '6px 12px', fontSize: '0.8rem', textTransform: 'capitalize' }}
                      onClick={() => handlePayloadTemplateChange(temp)}
                    >
                      {temp}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Job Execution Payload (JSON)</label>
                <textarea 
                  className="form-textarea" 
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', height: '120px' }}
                  value={payloadText}
                  onChange={e => setPayloadText(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Schedule Type</label>
                  <select 
                    className="form-select"
                    value={scheduleType}
                    onChange={e => setScheduleType(e.target.value)}
                  >
                    <option value="immediate">Run Immediately</option>
                    <option value="delayed">Delayed Execution</option>
                    <option value="recurring">Recurring Schedule (Cron)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Priority Override (Optional)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="Queue priority default"
                    value={priorityOverride}
                    onChange={e => setPriorityOverride(e.target.value)}
                  />
                </div>
              </div>

              {scheduleType === 'delayed' && (
                <div className="form-group">
                  <label className="form-label">Schedule Execution Time</label>
                  <input 
                    type="datetime-local" 
                    className="form-input" 
                    value={delayTime}
                    onChange={e => setDelayTime(e.target.value)}
                    required
                  />
                </div>
              )}

              {scheduleType === 'recurring' && (
                <div className="form-group">
                  <label className="form-label">Cron Schedule Pattern</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. */5 * * * *" 
                    value={cronExpression}
                    onChange={e => setCronExpression(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Standard 5-field cron: min hour day-of-month month day-of-week
                  </span>
                </div>
              )}

              {/* WORKFLOW DEPENDENCIES */}
              <div className="form-group" style={{ borderTop: '1px solid var(--card-border)', paddingTop: '16px', marginTop: '16px' }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Workflow Dependencies (Optional)</span>
                </label>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>
                  Select jobs that MUST successfully finish before this job begins. (Creates a DAG sequence)
                </span>
                
                <div style={{ maxHeight: '100px', overflowY: 'auto', border: '1px solid var(--card-border)', padding: '8px', borderRadius: '8px', background: 'var(--bg-primary)' }}>
                  {availableParentJobs.length > 0 ? (
                    availableParentJobs.filter(j => j.status !== 'cancelled').map(parentJob => (
                      <label key={parentJob.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedParentJobs.includes(parentJob.id)}
                          onChange={() => toggleParentJob(parentJob.id)}
                        />
                        <span style={{ fontWeight: 500 }}>{parentJob.name}</span>
                        <span className={`badge badge-${parentJob.status}`} style={{ transform: 'scale(0.8)', padding: '2px 6px' }}>
                          {parentJob.status}
                        </span>
                      </label>
                    ))
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      No dependency candidates available.
                    </span>
                  )}
                </div>
              </div>

              {newJobError && (
                <div style={{ color: 'var(--accent-error)', fontSize: '0.85rem', margin: '16px 0', textAlign: 'center' }}>
                  ⚠️ {newJobError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsNewJobOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Queue Workload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSPECT DETAIL & LOG VIEW MODAL */}
      {isInspectOpen && inspectedJob && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={20} style={{ color: 'var(--accent-primary)' }} />
                <span>Job Inspector</span>
              </h2>
              <div style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => setIsInspectOpen(false)}>
                <XCircle size={20} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', marginBottom: '24px' }}>
              {/* Job Metadata Column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Job Name</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{inspectedJob.job.name}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</span>
                    <div><span className={`badge badge-${inspectedJob.job.status}`}>{inspectedJob.job.status}</span></div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Target Queue</span>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{inspectedJob.job.queue_name}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current Retries</span>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{inspectedJob.job.retry_count} / {inspectedJob.job.max_retries}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Batch Identifier</span>
                    <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {inspectedJob.job.batch_id ? inspectedJob.job.batch_id.substring(0, 12) + '...' : 'None'}
                    </div>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Scheduled Execution</span>
                  <div style={{ fontSize: '0.9rem' }}>{new Date(inspectedJob.job.run_at).toLocaleString()}</div>
                </div>
              </div>

              {/* Payload Parameters JSON Column */}
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                  Payload Arguments (JSON)
                </span>
                <div style={{ 
                  background: 'var(--bg-primary)', 
                  border: '1px solid var(--card-border)', 
                  borderRadius: '10px', 
                  padding: '12px', 
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-mono)',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  color: '#34d399'
                }}>
                  {JSON.stringify(JSON.parse(inspectedJob.job.payload), null, 2)}
                </div>
              </div>
            </div>

            {/* Workflow Dependencies (DAG View) */}
            {(inspectedJob.dependencies.parents.length > 0 || inspectedJob.dependencies.children.length > 0) && (
              <div style={{ borderTop: '1px solid var(--card-border)', padding: '16px 0' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                  Workflow Dependencies
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {inspectedJob.dependencies.parents.map((p: any) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Parent Job:</span>
                      <span style={{ fontWeight: 600 }}>{p.parent_job_name}</span>
                      <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                      <span className={`badge badge-${p.parent_job_status}`} style={{ transform: 'scale(0.8)' }}>{p.parent_job_status}</span>
                    </div>
                  ))}
                  {inspectedJob.dependencies.children.map((c: any) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Child Job:</span>
                      <span style={{ fontWeight: 600 }}>{c.child_job_name}</span>
                      <span className={`badge badge-${c.child_job_status}`} style={{ transform: 'scale(0.8)', marginLeft: 'auto' }}>{c.child_job_status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Executions Logs Segment */}
            <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '20px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', display: 'block' }}>
                Executions Log Terminal History
              </span>

              {inspectedJob.executions.length > 0 ? (
                <div style={{ display: 'flex', gap: '20px' }}>
                  {/* Execution list left */}
                  <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {inspectedJob.executions.map((exec: any) => (
                      <div 
                        key={exec.id} 
                        style={{ 
                          padding: '10px', 
                          background: selectedExecutionId === exec.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)', 
                          border: `1px solid ${selectedExecutionId === exec.id ? 'var(--accent-primary)' : 'var(--card-border)'}`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}
                        onClick={() => setSelectedExecutionId(exec.id)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                          <span>Run #{exec.retry_number}</span>
                          <span style={{ color: exec.status === 'completed' ? 'var(--accent-success)' : 'var(--accent-error)' }}>
                            {exec.status}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          {new Date(exec.started_at).toLocaleTimeString()}
                        </span>
                        {exec.duration_ms && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            Duration: {exec.duration_ms}ms
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Log Console Viewer right */}
                  <div style={{ flex: 1 }}>
                    {selectedExecutionId ? (
                      <LogViewer executionId={selectedExecutionId} token={token} />
                    ) : (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Select a run timeline on the left to read stdout outputs
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '36px', textAlign: 'center', border: '1px dashed var(--card-border)', borderRadius: '12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No execution attempts recorded yet (job is waiting in the queue).
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
              {(inspectedJob.job.status === 'failed' || inspectedJob.job.status === 'dlq' || inspectedJob.job.status === 'cancelled') && (
                <button 
                  className="btn btn-success" 
                  onClick={() => handleRetryJob(inspectedJob.job.id)}
                >
                  <RotateCcw size={16} />
                  <span>Retry Job</span>
                </button>
              )}

              {(inspectedJob.job.status === 'queued' || inspectedJob.job.status === 'scheduled') && (
                <button 
                  className="btn btn-danger" 
                  onClick={() => handleCancelJob(inspectedJob.job.id)}
                >
                  <XCircle size={16} />
                  <span>Cancel Job</span>
                </button>
              )}

              <button className="btn btn-secondary" onClick={() => setIsInspectOpen(false)}>
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
