import React, { useEffect, useState, useContext } from 'react';
import { api, fmtTime } from '../api.js';
import { ToastCtx } from '../App.jsx';

export default function Settings() {
  const toast = useContext(ToastCtx);
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ llm_api_key: '', llm_base_url: '', llm_model: '', notify_webhook: '', notify_type: 'dingtalk' });
  const [showKey, setShowKey] = useState(false);
  const [logs, setLogs] = useState([]);
  const [skills, setSkills] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.settings().then((d) => {
      setData(d);
      setForm({
        llm_api_key: d.settings.llm_api_key || '',
        llm_base_url: d.settings.llm_base_url || d.effective.base_url,
        llm_model: d.settings.llm_model || d.effective.model,
        notify_webhook: d.settings.notify_webhook || '',
        notify_type: d.settings.notify_type || 'dingtalk',
      });
    }).catch(() => {});
    api.logs(80).then(setLogs).catch(() => {});
    api.skills().then(setSkills).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const pickProvider = (p) => {
    setForm((f) => ({ ...f, llm_base_url: p.baseUrl }));
    if (p.models?.length) setForm((f) => ({ ...f, llm_model: p.models[0] }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.saveSettings(form);
      toast('配置已保存，立即生效');
      load();
      setData((d) => ({ ...d, effective: r.effective }));
    } catch (e) { toast(e.message, 'err'); }
    setSaving(false);
  };

  if (!data) return <div className="empty">加载中…</div>;
  const { providers, effective } = data;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">系统设置</div>
          <div className="page-desc">模型大脑配置（国产模型）· 运行日志</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🧠 模型大脑</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 16 }}>
            OpenAI 兼容协议 · 支持 DeepSeek / 通义千问 / Kimi / 智谱 GLM 及任意兼容端点
          </div>

          <div className="field">
            <label>模型供应商</label>
            <div>
              {Object.entries(providers).map(([key, p]) => (
                <button key={key} className={`tag-btn ${form.llm_base_url === p.baseUrl ? 'active' : ''}`}
                  onClick={() => pickProvider(p)}>{p.name}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>API Base URL</label>
            <input className="input mono" value={form.llm_base_url}
              onChange={(e) => setForm({ ...form, llm_base_url: e.target.value })}
              placeholder="https://api.deepseek.com" />
          </div>

          <div className="form-row">
            <div className="field">
              <label>默认模型</label>
              <input className="input mono" value={form.llm_model}
                onChange={(e) => setForm({ ...form, llm_model: e.target.value })}
                placeholder="deepseek-chat" />
            </div>
            <div className="field">
              <label>API Key</label>
              <input className="input mono" type={showKey ? 'text' : 'password'} value={form.llm_api_key}
                onChange={(e) => setForm({ ...form, llm_api_key: e.target.value })}
                placeholder="sk-…" style={{ paddingRight: 60 }} />
              <button className="tag-btn" style={{ position: 'absolute', marginTop: -32, right: 12 }} onClick={() => setShowKey(!showKey)}>{showKey ? '隐藏' : '显示'}</button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存配置'}</button>
            {effective.api_key_set
              ? <span className="badge badge-green"><span className="dot" style={{ background: 'var(--green)' }} />已配置 · 模型 {effective.model}</span>
              : <span className="badge badge-amber"><span className="dot" style={{ background: 'var(--amber)' }} />未配置 Key · 当前为模拟模式</span>}
          </div>
          <div className="cron-hint" style={{ marginTop: 12 }}>
            也可通过环境变量配置：<span className="mono">LLM_API_KEY</span>、<span className="mono">LLM_BASE_URL</span>、<span className="mono">LLM_MODEL</span>（优先级：环境变量 &gt; 此处设置）
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>📜 系统运行日志</div>
          <div style={{ maxHeight: 430, overflowY: 'auto', paddingRight: 6 }}>
            {logs.map((l) => (
              <div className="log-line" key={l.id}>
                <span className={`lv lv-${l.level}`}>{l.level.toUpperCase()}</span>
                <span className="log-msg">{l.message}</span>
                <span className="log-time" style={{ marginLeft: 'auto' }}>{fmtTime(l.created_at).slice(5, 19)}</span>
              </div>
            ))}
            {!logs.length && <div className="empty">暂无日志</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🔔 通知渠道</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 16 }}>
            让数字员工把任务结果主动推送到真实聊天群（钉钉 / 企业微信 / 飞书机器人）
          </div>
          <div className="field">
            <label>渠道类型</label>
            <div>
              {[['dingtalk', '钉钉'], ['wecom', '企业微信'], ['feishu', '飞书'], ['custom', '自定义']].map(([v, label]) => (
                <button key={v} className={`tag-btn ${form.notify_type === v ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, notify_type: v })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Webhook 地址</label>
            <input className="input mono" value={form.notify_webhook}
              onChange={(e) => setForm({ ...form, notify_webhook: e.target.value })}
              placeholder="https://oapi.dingtalk.com/robot/send?access_token=…" />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存配置'}</button>
            <span className="badge" style={{ background: '#f2f4fb', color: '#555e8f' }}>
              {form.notify_webhook ? '✅ 已配置 · 员工可用「通知推送」技能' : '未配置 · 通知内容将存档为成果文件'}
            </span>
          </div>
          <div className="cron-hint" style={{ marginTop: 12 }}>
            提示：在钉钉/企微/飞书群里添加「自定义机器人」即可获得 Webhook 地址。配置后派发带「通知推送」技能的任务即可验证。
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🧰 技能库</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 14 }}>
            数字员工的十八般武艺 —— 工具类技能真实执行动作，不依赖大模型
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {skills.map((sk) => (
              <div key={sk.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: '#f8f9fd', borderRadius: 10 }}>
                <span style={{ fontSize: 19 }}>{sk.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {sk.name}
                    {sk.tool && <span className="badge badge-green" style={{ marginLeft: 8, fontSize: 10.5 }}>🔧 真实执行</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{sk.desc}</div>
                  <div style={{ marginTop: 4 }}>
                    {(sk.keywords || []).map((k) => <span key={k} className="skill-chip" style={{ marginRight: 4 }}>{k}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 22, marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>ℹ️ 关于系统</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 2 }}>
          <b>数字员工系统</b> v1.0.0 · AI Digital Employee Platform
          <br />- 员工大脑：国产大模型（OpenAI 兼容协议），未配置 Key 时自动降级内置规则引擎
          <br />- 任务引擎：派单 → 技能匹配 → 大模型生成 → 产出归档，失败自动重试/降级
          <br />- 定时调度：cron 驱动 7×24 值班，任务产出自动同步到员工对话汇报
          <br />- 数据存储：SQLite 单文件，位于 server/data 目录，可随时备份迁移
        </div>
      </div>
    </div>
  );
}
