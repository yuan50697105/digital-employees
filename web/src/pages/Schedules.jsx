import React, { useEffect, useState, useContext } from 'react';
import { api } from '../api.js';
import { ToastCtx } from '../App.jsx';

const PRESETS = [
  { label: '每 10 分钟', cron: '*/10 * * * *' },
  { label: '每 30 分钟', cron: '*/30 * * * *' },
  { label: '每小时', cron: '0 * * * *' },
  { label: '每天 9:00', cron: '0 9 * * *' },
  { label: '每天 18:00', cron: '0 18 * * *' },
  { label: '每周一 9:00', cron: '0 9 * * 1' },
  { label: '每月 1 日 8:00', cron: '0 8 1 * *' },
];

export default function Schedules() {
  const toast = useContext(ToastCtx);
  const [list, setList] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [skills, setSkills] = useState([]);
  const [creating, setCreating] = useState(false);

  const load = () => api.schedules().then(setList).catch(() => {});
  useEffect(() => {
    load();
    api.employees().then(setEmployees).catch(() => {});
    api.skills().then(setSkills).catch(() => {});
  }, []);

  const toggle = async (s) => {
    try {
      await api.updateSchedule(s.id, { enabled: !s.enabled });
      toast(s.enabled ? `调度「${s.title}」已停用` : `调度「${s.title}」已启用`);
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const remove = async (s) => {
    if (!confirm(`确认删除调度「${s.title}」？`)) return;
    try {
      await api.deleteSchedule(s.id);
      toast('调度已删除', 'err');
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">定时调度</div>
          <div className="page-desc">让数字员工 7×24 自动值班 · cron 表达式（分 时 日 月 周）</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>＋ 新建调度</button>
      </div>

      <div className="grid grid-3">
        {list.map((s) => (
          <div className="card" key={s.id} style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>⏰</span>
              <span style={{ fontWeight: 700, fontSize: 14.5 }}>{s.title}</span>
              {s.enabled
                ? <span className="badge badge-green" style={{ marginLeft: 'auto' }}>运行中</span>
                : <span className="badge badge-gray" style={{ marginLeft: 'auto' }}>已停用</span>}
            </div>
            <div className="emp-meta" style={{ marginTop: 10 }}>
              <span>👤 {s.employee_id ? employees.find((e) => e.id === s.employee_id)?.name || `#${s.employee_id}` : '自动分派'}</span>
              {s.skill && <span className="skill-chip">{skills.find((x) => x.id === s.skill)?.icon} {skills.find((x) => x.id === s.skill)?.name || s.skill}</span>}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.8 }}>
              <div>表达式：<span className="mono" style={{ background: '#f2f4fb', padding: '2px 8px', borderRadius: 6 }}>{s.cron}</span></div>
              {s.description && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>说明：{s.description}</div>}
              <div>上次执行：{s.last_run_at ? s.last_run_at.slice(5, 16) : '—'}</div>
              <div>下次触发：{s.next_run_at ? s.next_run_at.slice(5, 16) : '—'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className={`btn btn-sm ${s.enabled ? 'btn-ghost' : 'btn-primary'}`} onClick={() => toggle(s)}>
                {s.enabled ? '⏸ 停用' : '▶ 启用'}
              </button>
              <button className="btn btn-sm btn-danger" style={{ marginLeft: 'auto' }} onClick={() => remove(s)}>删除</button>
            </div>
          </div>
        ))}
      </div>
      {!list.length && <div className="card empty"><div className="big">⏰</div>暂无定时调度，创建后数字员工将自动值班</div>}

      {creating && (
        <ScheduleForm employees={employees} skills={skills}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }} />
      )}
    </div>
  );
}

function ScheduleForm({ employees, skills, onClose, onCreated }) {
  const toast = useContext(ToastCtx);
  const [form, setForm] = useState({ employee_id: '', title: '', description: '', skill: '', cron: '0 9 * * *' });

  const submit = async () => {
    if (!form.title.trim()) return toast('请填写调度名称', 'err');
    try {
      await api.createSchedule({ ...form, employee_id: form.employee_id ? Number(form.employee_id) : null });
      toast('定时调度已创建');
      onCreated();
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title"><span>新建定时调度</span><button className="modal-close" onClick={onClose}>✕</button></div>

        <div className="field">
          <label>值班员工</label>
          <select className="input" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">🤖 自动分派</option>
            {employees.filter((e) => e.status === 'active').map((e) => (
              <option key={e.id} value={e.id}>{e.avatar} {e.name}（{e.role}）</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>调度名称 *</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：每日晨间巡检" />
        </div>

        <div className="field">
          <label>任务内容（每次触发时执行）</label>
          <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="每次触发时向员工下达的任务指令…" />
        </div>

        <div className="form-row">
          <div className="field">
            <label>技能</label>
            <select className="input" value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })}>
              <option value="">✨ 自动匹配</option>
              {skills.map((sk) => <option key={sk.id} value={sk.id}>{sk.icon} {sk.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>cron 表达式 *</label>
            <input className="input mono" value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} />
          </div>
        </div>

        <div className="field">
          <label>快捷模板</label>
          <div>
            {PRESETS.map((p) => (
              <button key={p.cron} className={`tag-btn ${form.cron === p.cron ? 'active' : ''}`} onClick={() => setForm({ ...form, cron: p.cron })}>{p.label}</button>
            ))}
          </div>
          <div className="cron-hint">格式：<b>分 时 日 月 周</b>，如 <span className="mono">0 9 * * *</span> = 每天 9:00；<span className="mono">*/10 * * * *</span> = 每 10 分钟</div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={submit}>创建调度</button>
        </div>
      </div>
    </div>
  );
}
