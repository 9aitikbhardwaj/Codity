import React, { useState, useEffect } from 'react';
import { Terminal, AlertCircle, RefreshCw } from 'lucide-react';

export default function LogViewer({ executionId, token }: { executionId: string; token: string }) {
  const [logs, setLogs] = useState<{ stdout_logs: string; stderr_logs: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/executions/${executionId}/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (executionId) {
      loadLogs();
    }
  }, [executionId, token]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', gap: '8px' }}>
        <RefreshCw size={16} style={{ animation: 'pulse-glow 1.5s infinite' }} />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Retrieving terminal output buffer...</span>
      </div>
    );
  }

  if (!logs) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Failed to load logs.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Terminal size={14} />
          <span>StdOut / StdErr Console Buffer</span>
        </span>
        <button 
          className="btn btn-secondary" 
          style={{ padding: '4px 8px', fontSize: '0.75rem' }} 
          onClick={loadLogs}
        >
          Reload
        </button>
      </div>

      <div className="logs-console">
        {logs.stdout_logs ? logs.stdout_logs : '[No stdout logs logged]\n'}
        
        {logs.stderr_logs && (
          <div style={{ color: '#f87171', borderTop: '1px dashed rgba(248, 113, 113, 0.2)', paddingTop: '8px', marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, marginBottom: '4px' }}>
              <AlertCircle size={14} />
              <span>Standard Error Log Output:</span>
            </div>
            {logs.stderr_logs}
          </div>
        )}
      </div>
    </div>
  );
}
