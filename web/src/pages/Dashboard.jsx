import React, { useEffect, useState } from 'react';
import { api, fmtTime } from '../api.js';

const STATUS_BADGE = {
  running: <span className="badge badge-blue"><span className="dot" style={{ background: 'var(--blue)' }} />执行中</span>,
  pending: <span className="badge badge-amber"><span className="dot" style={{ background: 'var(--amber)' }} />排队中</span>,
  completed: <span className="badge badge-green"><span className="dot" style={{ background: 'var(--green)' }} />已完成</span>,
  failed: <span className="badge badge-red"><span className="dot" style={{ background: 'var(--red)' }} />失败</span>,
  cancelled: <span className="badge badge-gray">已取消</span>,
};

export default function Dashboard({ go }) {
  const [d, setD] = useState(null);

  useEffect(() => {
    let t;
    const load = () => api.dashboard().then(setD).catch(() => {});
    load();
    t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  if (!d) return <div className="empty">加载中…</div>;
  const s = d.stats;

  const stats = [
    { ico: '👥', cls: 'ico-indigo', num: s.employees.total, label: '数字员工', sub: `${s.employees.active} 在岗 · ${s.employees.paused} 暂休 · ${s.employees.offline} 离线` },
    { ico: '⚡', cls: 'ico-amber', num: s.tasks.running + s.tasks.pending, label: '进行中任务', sub: `${s.tasks.running} 执行中 · ${s.tasks.pending} 排队中` },
    { ico: '✅', cls: 'ico-green', num: s.tasks.today_completed, label: '今日完成', sub: `今日新增 ${s.tasks.today_created} 项` },
    { ico: '🎯', cls: 'ico-purple', num: `${s.tasks.success_rate}%`, label: '任务成功率', sub: `累计 ${s.tasks.total} 项 · 员工总产出 ${s.total_workload}` },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">运营总览</div>
          <div className="page-desc">数字员工团队实时运行态势 · {new Date().toLocaleString('zh-CN', { hour12: false })}</div>
        </div>
        <button className="btn btn-primary" onClick={() => go('tasks')}>＋ 派发新任务</button>
      </div>

      <div className="grid grid-4">
        {stats.map((st) => (
          <div key={st.label} className="card stat">
            <div className={`stat-ico ${st.cls}`}>{st.ico}</div>
            <div>
              <div className="stat-num">{st.num}</div>
              <div className="stat-label">{st.label}</div>
              <div className="stat-sub">{st.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div style={{ padding: '16px 20px 4px', fontWeight: 700 }}>最近任务</div>
          <div className="row-list">
            {d.recent_tasks.map((t) => (
              <div className="row-item" key={t.id} style={{ cursor: 'pointer' }} onClick={() => go('tasks')}>
                {STATUS_BADGE[t.status] || <span className="badge badge-gray">{t.status}</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {t.employee_name ? `${t.employee_name} 执行` : '自动分派'} · {fmtTime(t.created_at)}
                  </div>
                </div>
                <div className="progress" style={{ width: 90 }}>
                  <div style={{ width: `${t.progress}%` }} />
                </div>
              </div>
            ))}
            {!d.recent_tasks.length && <div className="empty">暂无任务，去任务中心派发一个吧</div>}
          </div>
        </div>

        <div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>员工效能榜</div>
            {d.top_employees.map((e, i) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <span style={{ width: 18, color: i < 3 ? 'var(--amber)' : 'var(--text-3)', fontWeight: 800 }}>{i + 1}</span>
                <span style={{ fontSize: 18 }}>{e.avatar}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{e.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{e.role}</div>
                </div>
                <span className="badge badge-indigo" style={{ background: '#eef0ff', color: 'var(--primary)' }}>{e.workload} 件</span>
              </div>
            ))}
            {!d.top_employees.length && <div className="empty">暂无员工</div>}
          </div>

          <div className="card" style={{ padding: '16px 20px', marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>大脑状态（国产模型）</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 2 }}>
              <div>模型：<span className="mono">{s.llm.model}</span></div>
              <div style={{ wordBreak: 'break-all' }}>端点：<span className="mono">{s.llm.base_url}</span></div>
              <div style={{ marginTop: 6 }}>
                {s.llm.api_key_set
                  ? <span className="badge badge-green"><span className="dot" style={{ background: 'var(--green)' }} />API Key 已配置</span>
                  : <span className="badge badge-amber"><span className="dot" style={{ background: 'var(--amber)' }} />模拟模式（未配置 Key）</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
