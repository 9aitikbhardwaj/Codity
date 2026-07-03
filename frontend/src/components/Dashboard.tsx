import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Cpu, 
  CheckCircle, 
  AlertTriangle,
  Clock,
  RefreshCw,
  Terminal
} from 'lucide-react';

interface Metrics {
  workers: { active: number; total: number };
  jobs24h: { completed: number; failed: number; running: number; queued: number };
  throughput: Array<{ hour: string; completed_count: number; failed_count: number }>;
  queueMetrics: Array<{ queue_name: string; avg_duration_ms: number; total_runs: number; failed_runs: number }>;
}

export default function Dashboard({ token, refreshTrigger }: { token: string; refreshTrigger: number }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);

  const fetchMetrics = async () => {
    try {
      const metricsRes = await fetch('/api/metrics', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const metricsData = await metricsRes.json();
      setMetrics(metricsData);

      // Also get recent jobs for logs activity
      const jobsRes = await fetch('/api/jobs?limit=5', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const jobsData = await jobsRes.json();
      setRecentJobs(jobsData.jobs || []);
    } catch (error) {
      console.error('Error loading dashboard metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [token, refreshTrigger]);

  if (loading || !metrics) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', gap: '12px' }}>
        <RefreshCw size={24} style={{ animation: 'pulse-glow 1.5s infinite' }} />
        <span>Syncing metrics system...</span>
      </div>
    );
  }

  // Calculate success rate
  const total24h = metrics.jobs24h.completed + metrics.jobs24h.failed;
  const successRate = total24h > 0 ? Math.round((metrics.jobs24h.completed / total24h) * 100) : 100;

  // Custom SVG Chart calculation
  const maxThroughput = Math.max(...metrics.throughput.map(t => Math.max(t.completed_count, t.failed_count, 1)), 5);
  const chartWidth = 500;
  const chartHeight = 160;
  const padding = 15;

  const pointsCompleted = metrics.throughput.map((t, idx) => {
    const x = padding + (idx / Math.max(metrics.throughput.length - 1, 1)) * (chartWidth - padding * 2);
    const y = chartHeight - padding - (t.completed_count / maxThroughput) * (chartHeight - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  const pointsFailed = metrics.throughput.map((t, idx) => {
    const x = padding + (idx / Math.max(metrics.throughput.length - 1, 1)) * (chartWidth - padding * 2);
    const y = chartHeight - padding - (t.failed_count / maxThroughput) * (chartHeight - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div>
      <div className="page-header">
        <div className="page-title-desc">
          <h1 className="page-title">Scheduler Dashboard</h1>
          <p className="page-subtitle">Real-time status overview of queues, jobs, and worker cluster</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchMetrics}>
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-icon-container" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-primary)' }}>
            <Cpu size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Active Workers</span>
            <span className="kpi-value">{metrics.workers.active} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ {metrics.workers.total}</span></span>
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-icon-container" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-warning)' }}>
            <Activity size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Running Slots</span>
            <span className="kpi-value">{metrics.jobs24h.running} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>active</span></span>
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-icon-container" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-success)' }}>
            <CheckCircle size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Completed (24h)</span>
            <span className="kpi-value">{metrics.jobs24h.completed}</span>
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-icon-container" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-error)' }}>
            <AlertTriangle size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Success Rate</span>
            <span className="kpi-value" style={{ color: successRate > 90 ? 'var(--accent-success)' : 'var(--accent-warning)' }}>{successRate}%</span>
          </div>
        </div>
      </div>

      {/* Charts & Main Panels */}
      <div className="dashboard-grid">
        {/* Throughput Graphic */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h2 style={{ fontSize: '1.2rem' }}>Throughput Analysis (Last 12 Hours)</h2>
          <div className="chart-container" style={{ flex: 1, minHeight: '180px' }}>
            {metrics.throughput.length > 0 ? (
              <svg className="svg-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.25"/>
                    <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0"/>
                  </linearGradient>
                  <linearGradient id="chart-gradient-fail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-error)" stopOpacity="0.2"/>
                    <stop offset="100%" stopColor="var(--accent-error)" stopOpacity="0"/>
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = padding + ratio * (chartHeight - padding * 2);
                  return (
                    <line key={idx} x1={padding} y1={y} x2={chartWidth - padding} y2={y} className="chart-grid-line" />
                  );
                })}

                {/* Area filled gradients under lines */}
                {metrics.throughput.length > 1 && (
                  <>
                    <path 
                      d={`M ${padding},${chartHeight - padding} L ${pointsCompleted} L ${chartWidth - padding},${chartHeight - padding} Z`} 
                      fill="url(#chart-gradient)" 
                    />
                    <path 
                      d={`M ${padding},${chartHeight - padding} L ${pointsFailed} L ${chartWidth - padding},${chartHeight - padding} Z`} 
                      fill="url(#chart-gradient-fail)" 
                    />
                  </>
                )}

                {/* Line plots */}
                {metrics.throughput.length > 1 && (
                  <>
                    <polyline points={pointsCompleted} className="chart-line" />
                    <polyline points={pointsFailed} className="chart-line" style={{ stroke: 'var(--accent-error)' }} />
                  </>
                )}

                {/* Data point glowing markers */}
                {metrics.throughput.map((t, idx) => {
                  const x = padding + (idx / Math.max(metrics.throughput.length - 1, 1)) * (chartWidth - padding * 2);
                  const yComp = chartHeight - padding - (t.completed_count / maxThroughput) * (chartHeight - padding * 2);
                  return (
                    <circle key={idx} cx={x} cy={yComp} r={4} fill="var(--accent-primary)" stroke="white" strokeWidth={1} style={{ filter: 'drop-shadow(0 0 4px var(--accent-primary))' }} />
                  );
                })}
              </svg>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
                No executions recorded in this timeframe
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '3px', background: 'var(--accent-primary)', borderRadius: '2px' }} />
              <span>Jobs Completed Successfully</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '3px', background: 'var(--accent-error)', borderRadius: '2px' }} />
              <span>Failed Execution Retries</span>
            </div>
          </div>
        </div>

        {/* Queue Health List */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h2 style={{ fontSize: '1.2rem' }}>Queue Speed Index</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
            {metrics.queueMetrics.length > 0 ? (
              metrics.queueMetrics.map((q, idx) => (
                <div key={idx} style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{q.queue_name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total executions: {q.total_runs}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', fontSize: '0.9rem', fontWeight: 600 }}>
                      <Clock size={14} style={{ color: 'var(--accent-primary)' }} />
                      <span>{Math.round(q.avg_duration_ms)}ms</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: q.failed_runs > 0 ? 'var(--accent-error)' : 'var(--accent-success)' }}>
                      {q.failed_runs} failures
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No active performance metrics. Run some jobs to inspect latency.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live System Activity Feed */}
      <div className="card" style={{ marginTop: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={18} style={{ color: 'var(--accent-primary)' }} />
          <span>Real-Time Scheduling Feed</span>
        </h2>
        
        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Job Name</th>
                <th>Queue</th>
                <th>Status</th>
                <th>Execution Time</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.length > 0 ? (
                recentJobs.map((job) => (
                  <tr key={job.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {job.id.substring(0, 8)}...
                    </td>
                    <td style={{ fontWeight: 500 }}>{job.name}</td>
                    <td>{job.queue_name}</td>
                    <td>
                      <span className={`badge badge-${job.status}`}>{job.status}</span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {new Date(job.run_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                    No jobs currently scheduled. Create jobs using the REST API or Dashboard.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
