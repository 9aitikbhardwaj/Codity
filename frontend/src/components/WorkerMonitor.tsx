import React, { useState, useEffect } from 'react';
import { Cpu, RefreshCw, Activity, Calendar } from 'lucide-react';

interface Worker {
  id: string;
  hostname: string;
  ip_address: string;
  status: 'active' | 'offline';
  concurrency_slots: number;
  active_slots: number;
  last_heartbeat_at: string;
}

export default function WorkerMonitor({ token, refreshTrigger }: { token: string; refreshTrigger: number }) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWorkers = async () => {
    try {
      const res = await fetch('/api/workers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setWorkers(data || []);
    } catch (err) {
      console.error('Failed to load workers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkers();
  }, [token, refreshTrigger]);

  const isWorkerOffline = (worker: Worker) => {
    if (worker.status === 'offline') return true;
    const heartbeatTime = new Date(worker.last_heartbeat_at).getTime();
    const threshold = Date.now() - 15000; // 15 seconds threshold
    return heartbeatTime < threshold;
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title-desc">
          <h1 className="page-title">Workers Monitor</h1>
          <p className="page-subtitle">Inspect worker nodes load, check concurrency capacity, and monitor cluster connectivity</p>
        </div>
        <button className="btn btn-secondary" onClick={loadWorkers}>
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>Syncing workers node registry...</div>
      ) : (
        <div>
          {workers.length > 0 ? (
            <div className="worker-grid">
              {workers.map((w) => {
                const offline = isWorkerOffline(w);
                const pct = Math.round((w.active_slots / w.concurrency_slots) * 100);
                
                return (
                  <div key={w.id} className="card worker-card">
                    <div className="worker-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Cpu size={18} style={{ color: offline ? 'var(--text-muted)' : 'var(--accent-primary)' }} />
                        <span className="worker-title" style={{ color: offline ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                          {w.hostname}
                        </span>
                      </div>
                      
                      <span className={`badge ${offline ? 'badge-failed' : 'badge-completed'}`}>
                        {offline ? 'Offline' : 'Active'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      ID: {w.id.substring(0, 16)}...
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--card-border)', paddingTop: '12px' }}>
                      <div className="worker-details-row">
                        <span>IP Address</span>
                        <span style={{ color: 'var(--text-primary)' }}>{w.ip_address}</span>
                      </div>

                      <div className="worker-details-row">
                        <span>Heartbeat</span>
                        <span style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={12} />
                          {new Date(w.last_heartbeat_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>

                    {!offline && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                        <div className="worker-details-row">
                          <span>Concurrency Slots</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                            {w.active_slots} / {w.concurrency_slots} ({pct}%)
                          </span>
                        </div>
                        <div className="slot-progress-bar">
                          <div className="slot-progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
              <Cpu size={40} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
              <h3 style={{ marginBottom: '8px' }}>No Worker Nodes Registered</h3>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '450px', margin: '0 auto' }}>
                Run the worker process in the background (`npm run worker`) to start claiming and processing tasks.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
