import React, { useEffect, useState, useContext } from 'react';
import { api } from '../api.js';
import { ToastCtx } from '../App.jsx';

const STATUS_BADGE = {
  active: <span className="badge badge-green"><span className="dot" style={{ background: 'var(--green)' }} />在岗</span>,
  paused: <span className="badge badge-amber"><span className="dot" style={{ background: 'var(--amber)' }} />暂休</span>,
  offline: <span className="badge badge-gray"><span className="dot" style={{ background: '#9ca3af' }} />离线</span>,
};

const AVATARS = ['🤖', '✍️', '📊', '🌐', '🛡️', '🎨', '💼', '🔍', '🧮', '📣'];

export default function Employees() {
  const toast = useContext(ToastCtx);
  const [list, setList] = useState([]);
  const [skills, setSkills] = useState([]);
  const [editing, setEditing] = useState(null); // null | {} 新建 | 员工对象 编辑
  const [confirmDel, setConfirmDel] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = () => api.employees().then(setList).catch(() => {});
  useEffect(() => { load(); api.skills().then(setSkills).catch(() => {}); }, []);

  const save = async (form) => {
    try {
      if (form.id) await api.updateEmployee(form.id, form);
      else await api.createEmployee(form);
      toast(form.id ? '员工档案已更新' : `新员工 ${form.name} 入职成功`);
      setEditing(null);
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const setStatus = async (e, status) => {
    try {
      await api.updateEmployee(e.id, { status });
      toast(`「${e.name}」已${status === 'active' ? '恢复在岗' : status === 'paused' ? '暂停休息' : '下线'}`);
      load();
    } catch (err) { toast(err.message, 'err'); }
  };

  const remove = async (id) => {
    try {
      await api.deleteEmployee(id);
      toast('员工已离职', 'err');
      setConfirmDel(null);
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const openDetail = async (e) => {
    setDetail(await api.get(`/employees/${e.id}`).catch(() => null));
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">员工管理</div>
          <div className="page-desc">共 {list.length} 名数字员工 · 创建、调岗、排班管理</div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>＋ 招聘新员工</button>
      </div>

      <div className="grid grid-3">
        {list.map((e) => (
          <div className="card emp-card" key={e.id}>
            <div className="emp-actions">
              <button className="btn btn-sm btn-ghost" onClick={() => setEditing(e)}>✏️</button>
              <button className="btn btn-sm btn-danger" onClick={() => setConfirmDel(e)}>✕</button>
            </div>
            <div className="emp-avatar">{e.avatar}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="emp-name">{e.name}</span>
              {STATUS_BADGE[e.status] || <span className="badge badge-gray">{e.status}</span>}
            </div>
            <div className="emp-role">{e.role}</div>
            <div className="emp-skills">
              {(e.skills || []).map((sid) => {
                const sk = skills.find((x) => x.id === sid);
                return sk ? <span className="skill-chip" key={sid}>{sk.icon} {sk.name}</span> : null;
              })}
              {!e.skills?.length && <span className="skill-chip">通用执行</span>}
            </div>
            <div className="emp-meta">
              <span>📦 {e.workload} 件产出</span>
              <span>🕐 {e.last_active_at ? e.last_active_at.slice(5, 16) : '暂无活跃'}</span>
              <span style={{ marginLeft: 'auto' }}>
                <button className="btn btn-sm btn-ghost" onClick={() => openDetail(e)}>档案</button>
                {e.status === 'active'
                  ? <button className="btn btn-sm btn-ghost" style={{ marginLeft: 6 }} onClick={() => setStatus(e, 'paused')}>暂停</button>
                  : <button className="btn btn-sm btn-ghost" style={{ marginLeft: 6 }} onClick={() => setStatus(e, 'active')}>恢复</button>}
              </span>
            </div>
          </div>
        ))}
      </div>
      {!list.length && <div className="card empty"><div className="big">🏢</div>还没有数字员工，点击右上角「招聘新员工」</div>}

      {/* 员工档案抽屉 */}
      {detail && (
        <div className="modal-mask" onClick={() => setDetail(null)}>
          <div className="modal" style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span>{detail.avatar} {detail.name} · 员工档案</span>
              <button className="modal-close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <table className="tbl">
              <tbody>
                <tr><td style={{ width: 120, color: 'var(--text-3)' }}>角色</td><td>{detail.role}</td></tr>
                <tr><td style={{ color: 'var(--text-3)' }}>状态</td><td>{STATUS_BADGE[detail.status]}</td></tr>
                <tr><td style={{ color: 'var(--text-3)' }}>模型偏好</td><td className="mono">{detail.model === 'auto' ? 'auto（跟随全局）' : detail.model}</td></tr>
                <tr><td style={{ color: 'var(--text-3)' }}>累计产出</td><td>{detail.workload} 件</td></tr>
                <tr><td style={{ color: 'var(--text-3)' }}>入职时间</td><td>{detail.created_at}</td></tr>
                <tr><td style={{ color: 'var(--text-3)' }}>最近活跃</td><td>{detail.last_active_at || '—'}</td></tr>
                <tr><td style={{ color: 'var(--text-3)', verticalAlign: 'top' }}>人设指令</td><td style={{ whiteSpace: 'pre-wrap' }}>{detail.system_prompt || '（无）'}</td></tr>
              </tbody>
            </table>
            <div style={{ fontWeight: 700, margin: '14px 0 8px' }}>最近任务</div>
            {detail.recent_tasks?.length ? (
              detail.recent_tasks.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f0f2f9', fontSize: 13 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{t.title}</span>
                  <span className="badge badge-gray">{t.status}</span>
                </div>
              ))
            ) : <div className="empty" style={{ padding: '20px 0' }}>暂无任务记录</div>}
          </div>
        </div>
      )}

      {/* 新建/编辑弹窗 */}
      {editing && (
        <EmployeeForm
          initial={editing}
          skills={skills}
          avatars={AVATARS}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}

      {/* 离职确认 */}
      {confirmDel && (
        <div className="modal-mask" onClick={() => setConfirmDel(null)}>
          <div className="modal" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title"><span>确认离职</span><button className="modal-close" onClick={() => setConfirmDel(null)}>✕</button></div>
            <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
              确定让 <b>{confirmDel.avatar} {confirmDel.name}</b>（{confirmDel.role}）离职吗？
              <br />该员工的历史任务记录将保留，但不可再执行新任务。
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>取消</button>
              <button className="btn btn-danger" onClick={() => remove(confirmDel.id)}>确认离职</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeForm({ initial, skills, avatars, onClose, onSave }) {
  const [form, setForm] = useState({
    id: initial.id,
    name: initial.name || '',
    role: initial.role || '普通员工',
    avatar: initial.avatar || '🤖',
    model: initial.model || 'auto',
    system_prompt: initial.system_prompt || '',
    skills: initial.skills || [],
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.name.trim()) return alert('请填写员工姓名');
    onSave(form);
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <span>{form.id ? `编辑 ${form.name}` : '招聘新员工'}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="field">
          <label>头像</label>
          <div>
            {avatars.map((a) => (
              <button key={a} className={`tag-btn ${form.avatar === a ? 'active' : ''}`} style={{ fontSize: 18, padding: '5px 12px' }}
                onClick={() => setForm((f) => ({ ...f, avatar: a }))}>{a}</button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>姓名 *</label>
            <input className="input" value={form.name} onChange={set('name')} placeholder="如：小文" />
          </div>
          <div className="field">
            <label>岗位角色</label>
            <input className="input" value={form.role} onChange={set('role')} placeholder="如：文案策划" />
          </div>
        </div>

        <div className="field">
          <label>人设指令（系统提示词）</label>
          <textarea className="textarea" value={form.system_prompt} onChange={set('system_prompt')}
            placeholder="定义员工的性格、专长、行为准则…" />
        </div>

        <div className="field">
          <label>绑定技能</label>
          <div>
            {skills.map((sk) => (
              <button key={sk.id} className={`tag-btn ${form.skills.includes(sk.id) ? 'active' : ''}`}
                onClick={() => setForm((f) => ({
                  ...f,
                  skills: f.skills.includes(sk.id) ? f.skills.filter((x) => x !== sk.id) : [...f.skills, sk.id],
                }))}>
                {sk.icon} {sk.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>模型偏好</label>
          <select className="input" value={form.model} onChange={set('model')}>
            <option value="auto">auto（跟随全局默认）</option>
            <option value="mock">mock（强制模拟模式）</option>
            <option value="deepseek-chat">deepseek-chat</option>
            <option value="deepseek-reasoner">deepseek-reasoner</option>
            <option value="qwen-plus">qwen-plus</option>
            <option value="qwen-max">qwen-max</option>
            <option value="kimi-k2-0711-preview">kimi-k2-0711-preview</option>
            <option value="glm-4-plus">glm-4-plus</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={submit}>{form.id ? '保存修改' : '录用上岗'}</button>
        </div>
      </div>
    </div>
  );
}
