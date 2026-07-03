import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  LayoutDashboard, 
  Layers, 
  Play, 
  Cpu, 
  LogOut, 
  Shield, 
  Mail, 
  Lock, 
  User as UserIcon,
  RefreshCw,
  Plus
} from 'lucide-react';

import Dashboard from './components/Dashboard';
import QueueManager from './components/QueueManager';
import JobExplorer from './components/JobExplorer';
import WorkerMonitor from './components/WorkerMonitor';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  
  // Auth Form State
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [authError, setAuthError] = useState('');

  // Socket state
  const [socket, setSocket] = useState<Socket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fetch current user details if token exists
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => {
          if (!res.ok) throw new Error('Session expired');
          return res.json();
        })
        .then(data => setUser(data))
        .catch(() => {
          handleLogout();
        });
    } else {
      localStorage.removeItem('token');
      setUser(null);
    }
  }, [token]);

  // Connect to socket.io
  useEffect(() => {
    if (!token) return;
    
    // Connect to server (proxied)
    const newSocket = io({
      auth: { token }
    });

    newSocket.on('connect', () => {
      setWsConnected(true);
      console.log('Real-time updates socket connected');
    });

    newSocket.on('disconnect', () => {
      setWsConnected(false);
    });

    // Listen for events to trigger UI refresh
    const handleUpdate = () => {
      setRefreshTrigger(prev => prev + 1);
    };

    newSocket.on('job:created', handleUpdate);
    newSocket.on('job:updated', handleUpdate);
    newSocket.on('queue:created', handleUpdate);
    newSocket.on('queue:updated', handleUpdate);
    newSocket.on('worker:heartbeat', handleUpdate);
    newSocket.on('dlq:new', handleUpdate);

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const body = isLogin 
      ? { email, password }
      : { email, password, firstName, lastName };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      setToken(data.token);
      setUser(data.user);
      
      // Clear forms
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    if (socket) {
      socket.disconnect();
    }
  };

  // If not logged in, show beautiful auth screen
  if (!token || !user) {
    return (
      <div className="auth-wrapper">
        <div className="card auth-card">
          <div className="auth-header">
            <div className="auth-logo">⚡</div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', marginBottom: '8px' }}>NexusSync</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Distributed Asynchronous Job Scheduler
            </p>
          </div>

          <form onSubmit={handleAuthSubmit}>
            {!isLogin && (
              <>
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <div style={{ position: 'relative' }}>
                    <UserIcon size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
                    <input 
                      type="text" 
                      className="form-input" 
                      style={{ paddingLeft: '40px' }}
                      value={firstName} 
                      onChange={e => setFirstName(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <div style={{ position: 'relative' }}>
                    <UserIcon size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
                    <input 
                      type="text" 
                      className="form-input" 
                      style={{ paddingLeft: '40px' }}
                      value={lastName} 
                      onChange={e => setLastName(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
                <input 
                  type="email" 
                  className="form-input" 
                  style={{ paddingLeft: '40px' }}
                  placeholder="name@company.com"
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
                <input 
                  type="password" 
                  className="form-input" 
                  style={{ paddingLeft: '40px' }}
                  placeholder="••••••••"
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                />
              </div>
            </div>

            {authError && (
              <div style={{ color: 'var(--accent-error)', fontSize: '0.85rem', marginBottom: '16px', textAlign: 'center' }}>
                ⚠️ {authError}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '8px' }}>
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {isLogin ? "Don't have an account?" : 'Already have an account?'} {' '}
            <span 
              style={{ color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => { setIsLogin(!isLogin); setAuthError(''); }}
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="brand">
          <div className="brand-logo">⚡</div>
          <div className="brand-name">NexusSync</div>
        </div>

        <div className="nav-menu">
          <div 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </div>
          
          <div 
            className={`nav-item ${activeTab === 'queues' ? 'active' : ''}`}
            onClick={() => setActiveTab('queues')}
          >
            <Layers size={18} />
            <span>Queues</span>
          </div>

          <div 
            className={`nav-item ${activeTab === 'jobs' ? 'active' : ''}`}
            onClick={() => setActiveTab('jobs')}
          >
            <Play size={18} />
            <span>Job Explorer</span>
          </div>

          <div 
            className={`nav-item ${activeTab === 'workers' ? 'active' : ''}`}
            onClick={() => setActiveTab('workers')}
          >
            <Cpu size={18} />
            <span>Workers</span>
          </div>
        </div>

        {/* Live sync indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', fontSize: '0.75rem', color: varNameColor(wsConnected) }}>
          <span style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            background: wsConnected ? 'var(--accent-success)' : 'var(--accent-error)',
            boxShadow: wsConnected ? '0 0 8px var(--accent-success)' : 'none'
          }} />
          <span>{wsConnected ? 'Live Connection Active' : 'Connecting Real-Time...'}</span>
        </div>

        <div className="user-profile-section">
          <div className="avatar">
            {user.firstName[0]}{user.lastName[0]}
          </div>
          <div className="user-info">
            <span className="user-name">{user.firstName} {user.lastName}</span>
            <span className="user-email">{user.email}</span>
          </div>
          <div 
            style={{ marginLeft: 'auto', cursor: 'pointer', color: 'var(--text-muted)', transition: 'var(--transition-fast)' }}
            onClick={handleLogout}
            title="Log Out"
          >
            <LogOut size={16} />
          </div>
        </div>
      </div>

      {/* Main Panel */}
      <div className="main-content">
        {activeTab === 'dashboard' && <Dashboard token={token} refreshTrigger={refreshTrigger} />}
        {activeTab === 'queues' && <QueueCard tab="queues" token={token} refreshTrigger={refreshTrigger} />}
        {activeTab === 'jobs' && <QueueCard tab="jobs" token={token} refreshTrigger={refreshTrigger} />}
        {activeTab === 'workers' && <QueueCard tab="workers" token={token} refreshTrigger={refreshTrigger} />}
      </div>
    </div>
  );
}

// Subwrapper to pass props
function QueueCard({ tab, token, refreshTrigger }: { tab: string; token: string; refreshTrigger: number }) {
  if (tab === 'queues') return <QueueManager token={token} refreshTrigger={refreshTrigger} />;
  if (tab === 'jobs') return <JobExplorer token={token} refreshTrigger={refreshTrigger} />;
  return <WorkerMonitor token={token} refreshTrigger={refreshTrigger} />;
}

function varNameColor(connected: boolean): string {
  return connected ? 'var(--accent-success)' : 'var(--text-muted)';
}
