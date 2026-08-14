import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import Employees from './pages/Employees.jsx';
import Tasks from './pages/Tasks.jsx';
import Workbench from './pages/Workbench.jsx';
import Chat from './pages/Chat.jsx';
import Schedules from './pages/Schedules.jsx';
import Settings from './pages/Settings.jsx';
import { api } from './api.js';

const NAV = [
  { id: 'dashboard', label: '仪表盘', ico: '📊' },
  { id: 'employees', label: '员工管理', ico: '👥' },
  { id: 'tasks', label: '任务中心', ico: '📋' },
  { id: 'workbench', label: '工作台', ico: '📦' },
  { id: 'chat', label: '在线沟通', ico: '💬' },
  { id: 'schedules', label: '定时调度', ico: '⏰' },
  { id: 'settings', label: '系统设置', ico: '⚙️' },
];

export const ToastCtx = React.createContext(() => {});

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [toasts, setToasts] = useState([]);
  const [health, setHealth] = useState(null);

  const toast = useCallback((msg, type = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  useEffect(() => {
    api.get('/health').then(setHealth).catch(() => {});
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-logo">🤖</div>
            <div>
              <div className="brand-name">数字员工系统</div>
              <div className="brand-sub">Digital Employee Platform</div>
            </div>
          </div>
          <nav className="nav">
            {NAV.map((n) => (
              <div key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
                <span className="ico">{n.ico}</span>{n.label}
              </div>
            ))}
          </nav>
          <div className="sidebar-foot">
            <span className="dot" />服务运行中{health ? ` · v${health.version}` : ''}
          </div>
        </aside>
        <main className="main">
          {page === 'dashboard' && <Dashboard go={setPage} />}
          {page === 'employees' && <Employees />}
          {page === 'tasks' && <Tasks />}
          {page === 'workbench' && <Workbench />}
          {page === 'chat' && <Chat />}
          {page === 'schedules' && <Schedules />}
          {page === 'settings' && <Settings />}
        </main>
      </div>
      <div className="toast-wrap">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.type === 'err' ? 'err' : ''}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
