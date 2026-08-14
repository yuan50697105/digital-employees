import React, { useEffect, useState, useRef, useContext } from 'react';
import { api, fmtTime } from '../api.js';
import { ToastCtx } from '../App.jsx';

export default function Chat() {
  const toast = useContext(ToastCtx);
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null);   // 会话对象（含 messages）
  const [employees, setEmployees] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [newConv, setNewConv] = useState(false);
  const [pendingImgs, setPendingImgs] = useState([]); // 待发送图片 dataUri
  const imgRef = useRef(null);
  const bodyRef = useRef(null);

  const loadConvs = () => api.conversations().then(setConvs).catch(() => {});

  useEffect(() => { loadConvs(); api.employees().then(setEmployees).catch(() => {}); }, []);

  useEffect(() => {
    if (active) api.conversation(active.id).then((c) => setActive((prev) => prev && prev.id === c.id ? { ...c, messages: c.messages } : prev)).catch(() => {});
    // eslint-disable-next-line
  }, [convs.length]);

  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight }); }, [active?.messages?.length]);

  const open = async (id) => setActive(await api.conversation(id).catch(() => null));

  const pickImage = async (e) => {
    const list = Array.from(e.target.files || []).slice(0, 3);
    for (const f of list) {
      const uri = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      setPendingImgs((p) => [...p, uri]);
    }
    e.target.value = '';
  };

  const send = async () => {
    const msg = text.trim();
    const imgs = pendingImgs;
    if ((!msg && !imgs.length) || busy) return;
    setText('');
    setPendingImgs([]);
    setBusy(true);
    const shown = msg || (imgs.length ? `[图片 ×${imgs.length}]` : '');
    setActive((c) => c ? { ...c, messages: [...c.messages, { id: `t${Date.now()}`, role: 'user', content: shown }] } : c);
    try {
      const r = await api.post(`/conversations/${active.id}/messages`, { content: msg, images: imgs });
      setActive((c) => c ? { ...c, messages: [...c.messages, r.message] } : c);
      if (r.mock) toast('模拟模式回复（未配置 API Key）');
      loadConvs();
    } catch (e) {
      toast(e.message, 'err');
    }
    setBusy(false);
  };

  const createConv = async (employeeId, firstMessage) => {
    try {
      const c = await api.createConversation({ employee_id: employeeId || null, message: firstMessage });
      setNewConv(false);
      loadConvs();
      open(c.id);
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">在线沟通</div>
          <div className="page-desc">与数字员工实时对话 · 任务一键转派单</div>
        </div>
        <button className="btn btn-primary" onClick={() => setNewConv(true)}>＋ 新建会话</button>
      </div>

      <div className="card chat-layout">
        <div className="chat-list" style={{ borderRight: '1px solid var(--border)' }}>
          {convs.map((c) => (
            <div key={c.id} className={`chat-item ${active?.id === c.id ? 'active' : ''}`} onClick={() => open(c.id)}>
              <div className="chat-item-title">{c.employee_avatar || '🤖'} {c.title}</div>
              <div className="chat-item-prev">{c.last_message || '（空会话）'}</div>
            </div>
          ))}
          {!convs.length && <div className="empty" style={{ padding: 30 }}>暂无会话</div>}
        </div>

        <div className="chat-main">
          {active ? (
            <>
              <div className="chat-head">
                <div className="emp-avatar-mini">{active.employee_avatar || '🤖'}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{active.employee_name || '系统助手'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{active.message_count || 0} 条消息</div>
                </div>
              </div>
              <div className="chat-body" ref={bodyRef}>
                {active.messages.map((m) => (
                  <div key={m.id} className={`msg ${m.role}`}>
                    {m.content}
                    <div className="msg-time">{fmtTime(m.created_at).slice(5, 19)}</div>
                  </div>
                ))}
              </div>
              <div className="chat-input">
                <input ref={imgRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={pickImage} />
                <button className="btn btn-ghost" title="发送图片（多模态）" disabled={busy}
                  onClick={() => imgRef.current?.click()}>🖼️</button>
                <textarea rows={1} placeholder={`给${active.employee_name || '员工'}发消息…（Enter 发送，Shift+Enter 换行）`}
                  value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <button className="btn btn-primary" disabled={busy || (!text.trim() && !pendingImgs.length)} onClick={send}>{busy ? '思考中…' : '发送'}</button>
              </div>
            </>
          ) : (
            <div className="chat-empty">
              <div style={{ fontSize: 44 }}>💬</div>
              <div>选择一个会话，或新建会话开始沟通</div>
            </div>
          )}
        </div>
      </div>

      {newConv && (
        <div className="modal-mask" onClick={() => setNewConv(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title"><span>新建会话</span><button className="modal-close" onClick={() => setNewConv(false)}>✕</button></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {employees.filter((e) => e.status === 'active').map((e) => (
                <div key={e.id} className="emp-card card" style={{ cursor: 'pointer' }} onClick={() => createConv(e.id, null)}>
                  <div className="emp-avatar" style={{ width: 44, height: 44, fontSize: 22, marginBottom: 8 }}>{e.avatar}</div>
                  <div className="emp-name" style={{ fontSize: 14 }}>{e.name}</div>
                  <div className="emp-role">{e.role}</div>
                </div>
              ))}
              <div className="emp-card card" style={{ cursor: 'pointer' }} onClick={() => createConv(null, null)}>
                <div className="emp-avatar" style={{ width: 44, height: 44, fontSize: 22, marginBottom: 8, background: '#8b91c0' }}>🤖</div>
                <div className="emp-name" style={{ fontSize: 14 }}>系统助手</div>
                <div className="emp-role">通用问答</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
