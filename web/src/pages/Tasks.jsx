import React, { useEffect, useState, useContext, useCallback, useRef } from 'react';
import { api, fmtTime } from '../api.js';
import { ToastCtx } from '../App.jsx';

const TABS = [
  { id: '', label: '全部' },
  { id: 'running', label: '执行中' },
  { id: 'pending', label: '排队中' },
  { id: 'completed', label: '已完成' },
  { id: 'failed', label: '失败' },
  { id: 'cancelled', label: '已取消' },
];

const PRIORITY = { urgent: '🔴 紧急', high: '🟠 高', normal: '⚪ 普通', low: '⚪ 低' };

const MODEL_OPTIONS = [
  ['auto', '✨ 跟随全局默认'],
  ['mock', '🛠️ mock（规则引擎）'],
  ['deepseek-chat', 'DeepSeek Chat'],
  ['deepseek-reasoner', 'DeepSeek Reasoner'],
  ['qwen-plus', '通义千问 Plus'],
  ['qwen-max', '通义千问 Max'],
  ['qwen-vl-max', '通义千问 VL-Max（视觉）'],
  ['glm-4-plus', '智谱 GLM-4-Plus'],
  ['glm-4v-plus', '智谱 GLM-4V-Plus（视觉）'],
  ['kimi-k2-0711-preview', 'Kimi K2'],
];

function StatusBadge({ s }) {
  const map = {
    running: <span className="badge badge-blue"><span className="dot" style={{ background: 'var(--blue)' }} />执行中</span>,
    pending: <span className="badge badge-amber"><span className="dot" style={{ background: 'var(--amber)' }} />排队中</span>,
    completed: <span className="badge badge-green"><span className="dot" style={{ background: 'var(--green)' }} />已完成</span>,
    failed: <span className="badge badge-red"><span className="dot" style={{ background: 'var(--red)' }} />失败</span>,
    cancelled: <span className="badge badge-gray">已取消</span>,
  };
  return map[s] || <span className="badge badge-gray">{s}</span>;
}

export default function Tasks() {
  const toast = useContext(ToastCtx);
  const [tab, setTab] = useState('');
  const [data, setData] = useState({ tasks: [], total: 0 });
  const [employees, setEmployees] = useState([]);
  const [skills, setSkills] = useState([]);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    api.tasks(`?status=${tab}&limit=200`).then(setData).catch(() => {});
  }, [tab]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.employees().then(setEmployees).catch(() => {});
    api.skills().then(setSkills).catch(() => {});
  }, []);

  const cancel = async (t) => {
    try {
      await api.cancelTask(t.id);
      toast(`任务「${t.title}」已取消`);
      load();
      if (detail?.id === t.id) setDetail(await api.task(t.id));
    } catch (e) { toast(e.message, 'err'); }
  };

  const retry = async (t) => {
    try {
      const nt = await api.retryTask(t.id);
      toast(`已重新派发任务 #${nt.id}`);
      load();
      setDetail(nt);
    } catch (e) { toast(e.message, 'err'); }
  };

  const openDetail = async (t) => setDetail(await api.task(t.id).catch(() => null));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">任务中心</div>
          <div className="page-desc">共 {data.total} 项任务 · 快速派单 / 多节点编排（每节点可选模型）</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>＋ 派发任务</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.id} className={`tag-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th><th>任务</th><th>执行人</th><th>状态</th><th>优先级</th><th>创建时间</th><th></th>
            </tr>
          </thead>
          <tbody>
            {data.tasks.map((t) => (
              <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(t)}>
                <td className="mono" style={{ color: 'var(--text-3)' }}>#{t.id}</td>
                <td style={{ maxWidth: 300 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                    {t.scheduled ? <span className="skill-chip">⏰ 定时</span> : null}
                    {(t.nodes && JSON.parse(t.nodes).length) ? <span className="skill-chip">🔗 {JSON.parse(t.nodes).length} 节点</span> : null}
                  </div>
                </td>
                <td>{t.employee_name ? `👤 ${t.employee_name}` : <span style={{ color: 'var(--text-3)' }}>自动分派</span>}</td>
                <td><StatusBadge s={t.status} /></td>
                <td style={{ fontSize: 12 }}>{PRIORITY[t.priority]}</td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{fmtTime(t.created_at).slice(5, 16)}</td>
                <td>
                  {t.status === 'running' && <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); cancel(t); }}>取消</button>}
                  {t.status === 'failed' && <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); retry(t); }}>重试</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.tasks.length && <div className="empty"><div className="big">📭</div>该状态下暂无任务</div>}
      </div>

      {detail && <TaskDetail t={detail} skills={skills} onClose={() => setDetail(null)} onCancel={() => cancel(detail)} onRetry={() => retry(detail)} />}

      {creating && (
        <TaskForm employees={employees} skills={skills}
          onClose={() => setCreating(false)}
          onCreated={(nt) => { setCreating(false); load(); openDetail(nt); }} />
      )}
    </div>
  );
}

/* ================= 任务详情（含节点结果） ================= */

function TaskDetail({ t, skills, onClose, onCancel, onRetry }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <span>任务 #{t.id} · {t.title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <StatusBadge s={t.status} />
          <span className="badge badge-gray">执行人：{t.employee_name || '自动分派'}</span>
          <span className="badge badge-gray">创建：{fmtTime(t.created_at)}</span>
          {t.finished_at && <span className="badge badge-gray">完成：{fmtTime(t.finished_at)}</span>}
          {t.nodes?.length ? <span className="badge badge-purple">🔗 {t.nodes.length} 节点编排</span> : null}
        </div>

        {/* 节点编排展示 */}
        {t.nodes?.length > 0 && (
          <div className="field">
            <label>节点流水线</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {t.nodes.map((n, i) => {
                const r = t.node_results?.[i];
                const sk = skills.find((x) => x.id === n.skill);
                return (
                  <div key={n.id || i} style={{ background: '#f8f9fd', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="badge" style={{ background: 'var(--grad)', color: '#fff' }}>节点 {i + 1}</span>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{n.name}</span>
                      {sk ? <span className="skill-chip">{sk.icon} {sk.name}</span> : <span className="skill-chip">通用执行</span>}
                      <span className="skill-chip" style={{ marginLeft: 'auto' }}>模型：{n.model === 'auto' ? '跟随全局' : n.model}</span>
                      {r?.files?.length ? <span className="badge badge-green">📎 {r.files.length} 份产出</span> : null}
                    </div>
                    {n.prompt && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{n.prompt}</div>}
                    {r?.output && (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ fontSize: 12, color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}>节点输出</summary>
                        <pre className="md-out" style={{ background: '#fff', borderRadius: 8, padding: 10, marginTop: 6, maxHeight: 200, overflowY: 'auto' }}>{r.output}</pre>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {t.description && !t.nodes?.length && (
          <div className="field"><label>任务需求</label>
            <div style={{ fontSize: 13, color: 'var(--text-2)', background: '#f8f9fd', borderRadius: 9, padding: '10px 14px', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{t.description}</div>
          </div>
        )}

        {t.error && (
          <div className="field"><label style={{ color: 'var(--red)' }}>失败原因</label>
            <div style={{ fontSize: 12.5, color: 'var(--red)', background: '#fef4f4', borderRadius: 9, padding: '10px 14px', wordBreak: 'break-all' }}>{t.error}</div>
          </div>
        )}

        {t.output && (
          <div className="field"><label>执行产出</label>
            <div style={{ background: '#f8f9fd', borderRadius: 9, padding: '14px 16px', maxHeight: 300, overflowY: 'auto' }}>
              <pre className="md-out" style={{ margin: 0 }}>{t.output}</pre>
            </div>
          </div>
        )}

        {t.logs?.length > 0 && (
          <div className="field"><label>执行日志</label>
            <div style={{ maxHeight: 180, overflowY: 'auto', padding: '4px 14px', background: '#f8f9fd', borderRadius: 9 }}>
              {t.logs.map((l) => (
                <div className="log-line" key={l.id}>
                  <span className={`lv lv-${l.level}`}>{l.level.toUpperCase()}</span>
                  <span className="log-msg">{l.message}</span>
                  <span className="log-time" style={{ marginLeft: 'auto' }}>{fmtTime(l.created_at).slice(11, 19)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {t.status === 'running' && <button className="btn btn-danger" onClick={onCancel}>取消任务</button>}
          {t.status === 'failed' && <button className="btn btn-primary" onClick={onRetry}>重新执行</button>}
          <button className="btn btn-ghost" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}

/* ================= 附件上传组件 ================= */

function AttachUpload({ files, onChange }) {
  const toast = useContext(ToastCtx);
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const list = Array.from(e.target.files || []);
    if (!list.length) return;
    setBusy(true);
    for (const f of list) {
      try {
        const b64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });
        const up = await api.upload(f.name, b64);
        onChange([...files, { stored: up.stored, name: up.name }]);
      } catch (err) { toast(err.message, 'err'); }
    }
    setBusy(false);
    e.target.value = '';
  };

  return (
    <div>
      <input ref={inputRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.txt,.md,.csv,.json,.docx,.xlsx,.pdf,.log" style={{ display: 'none' }} onChange={pick} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? '上传中…' : '📎 上传素材'}
        </button>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>图片 / PDF / Word / Excel / TXT（≤15MB）</span>
      </div>
      {files.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {files.map((f, i) => (
            <span key={i} className="skill-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}>
              {/\.(png|jpg|jpeg|webp|gif)$/i.test(f.name) ? '🖼️' : '📄'} {f.name}
              <span style={{ cursor: 'pointer', color: 'var(--red)', fontWeight: 700 }} onClick={() => onChange(files.filter((_, j) => j !== i))}>✕</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= 派单表单（快速 / 编排双模式） ================= */

function TaskForm({ employees, skills, onClose, onCreated }) {
  const toast = useContext(ToastCtx);
  const [mode, setMode] = useState('quick');
  const [form, setForm] = useState({ employee_id: '', title: '', description: '', skill: '', priority: 'normal' });
  const [nodes, setNodes] = useState([{ name: '', skill: '', model: 'auto', prompt: '' }]);
  const [attachments, setAttachments] = useState([]);
  const [busy, setBusy] = useState(false);

  const setNode = (i, k, v) => setNodes(nodes.map((n, j) => (j === i ? { ...n, [k]: v } : n)));
  const addNode = () => setNodes([...nodes, { name: '', skill: '', model: 'auto', prompt: '' }]);
  const removeNode = (i) => setNodes(nodes.filter((_, j) => j !== i));
  const moveNode = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= nodes.length) return;
    const copy = [...nodes];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setNodes(copy);
  };

  const submit = async () => {
    if (!form.title.trim()) return toast('请填写任务标题', 'err');
    setBusy(true);
    try {
      const body = {
        ...form,
        employee_id: form.employee_id ? Number(form.employee_id) : null,
        input: { params: { files: attachments } },
      };
      if (mode === 'flow') {
        const valid = nodes.filter((n) => n.name.trim() || n.skill || n.prompt.trim());
        if (!valid.length) return toast('请至少配置一个节点', 'err');
        body.nodes = valid;
        body.skill = undefined;
      }
      const t = await api.createTask(body);
      toast(mode === 'flow' ? `任务 #${t.id} 已派发（${validCount} 节点编排）` : `任务 #${t.id} 已派发`);
      onCreated(t);
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const validCount = nodes.filter((n) => n.name.trim() || n.skill || n.prompt.trim()).length;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <span>派发新任务</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`tag-btn ${mode === 'quick' ? 'active' : ''}`} onClick={() => setMode('quick')}>⚡ 快速任务</button>
            <button className={`tag-btn ${mode === 'flow' ? 'active' : ''}`} onClick={() => setMode('flow')}>🔗 节点编排</button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {mode === 'quick' && (
          <>
            <div className="field"><label>执行员工</label>
              <select className="input" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">🤖 自动分派（智能匹配）</option>
                {employees.filter((e) => e.status === 'active').map((e) => (
                  <option key={e.id} value={e.id}>{e.avatar} {e.name}（{e.role}）</option>
                ))}
              </select>
            </div>
            <div className="field"><label>任务标题 *</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：撰写项目周报" />
            </div>
            <div className="field"><label>任务需求描述</label>
              <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="详细描述任务目标、输入材料、输出要求…" />
            </div>
            <div className="form-row">
              <div className="field"><label>技能</label>
                <select className="input" value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })}>
                  <option value="">✨ 自动匹配</option>
                  {skills.map((sk) => <option key={sk.id} value={sk.id}>{sk.icon} {sk.name}</option>)}
                </select>
              </div>
              <div className="field"><label>优先级</label>
                <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="normal">普通</option><option value="high">高</option><option value="urgent">紧急</option><option value="low">低</option>
                </select>
              </div>
            </div>
          </>
        )}

        {mode === 'flow' && (
          <>
            <div className="field"><label>任务标题 *</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：合同解析与汇报流程" />
            </div>
            <div className="field"><label>执行员工</label>
              <select className="input" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">🤖 自动分派</option>
                {employees.filter((e) => e.status === 'active').map((e) => (
                  <option key={e.id} value={e.id}>{e.avatar} {e.name}（{e.role}）</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>节点流水线（按顺序执行，每节点可选技能与模型，支持 {`{prev}`} 引用上一节点输出）</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {nodes.map((n, i) => (
                  <div key={i} style={{ background: '#f8f9fd', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span className="badge" style={{ background: 'var(--grad)', color: '#fff' }}>节点 {i + 1}</span>
                      <input className="input" style={{ flex: 1, padding: '6px 10px', fontSize: 13 }} placeholder="节点名称（如：解析合同）"
                        value={n.name} onChange={(e) => setNode(i, 'name', e.target.value)} />
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-ghost" disabled={i === 0} onClick={() => moveNode(i, -1)}>↑</button>
                        <button className="btn btn-sm btn-ghost" disabled={i === nodes.length - 1} onClick={() => moveNode(i, 1)}>↓</button>
                        <button className="btn btn-sm btn-danger" onClick={() => removeNode(i)}>✕</button>
                      </div>
                    </div>
                    <div className="form-row" style={{ marginBottom: 8 }}>
                      <div className="field" style={{ marginBottom: 0 }}><label>技能</label>
                        <select className="input" style={{ padding: '6px 10px', fontSize: 13 }} value={n.skill} onChange={(e) => setNode(i, 'skill', e.target.value)}>
                          <option value="">✨ 自动匹配</option>
                          {skills.map((sk) => <option key={sk.id} value={sk.id}>{sk.icon} {sk.name}</option>)}
                        </select>
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}><label>模型（本节点）</label>
                        <input className="input" list="model-options" style={{ padding: '6px 10px', fontSize: 13, fontFamily: 'monospace' }}
                          value={n.model} onChange={(e) => setNode(i, 'model', e.target.value)} />
                        <datalist id="model-options">
                          {MODEL_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </datalist>
                      </div>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}><label>节点指令（{`{prev}`} 注入上一节点输出）</label>
                      <textarea className="textarea" style={{ minHeight: 54, fontSize: 13 }} value={n.prompt} onChange={(e) => setNode(i, 'prompt', e.target.value)}
                        placeholder="如：提取合同中的金额与交付周期，{prev}" />
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={addNode}>＋ 添加节点</button>
            </div>
          </>
        )}

        {/* 附件（两种模式共用） */}
        <div className="field">
          <label>素材附件（图片/文档，供视觉与解析技能使用）</label>
          <AttachUpload files={attachments} onChange={setAttachments} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? '派发中…' : mode === 'flow' ? `立即派发（${validCount} 节点）` : '立即派发'}
          </button>
        </div>
      </div>
    </div>
  );
}
