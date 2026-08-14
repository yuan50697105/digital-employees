import React, { useEffect, useState, useContext } from 'react';
import { api, fmtTime } from '../api.js';
import { ToastCtx } from '../App.jsx';

const TYPE_ICON = { md: '📄', csv: '📊', txt: '📃', json: '🧾' };

function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function Workbench() {
  const toast = useContext(ToastCtx);
  const [arts, setArts] = useState([]);
  const [inputs, setInputs] = useState([]);
  const [preview, setPreview] = useState(null);
  const [tab, setTab] = useState('outputs');

  const load = () => {
    api.get('/artifacts').then((d) => setArts(d.artifacts)).catch(() => {});
    api.get('/artifacts/inputs').then((d) => setInputs(d.inputs)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const openPreview = async (a) => {
    try {
      const c = await api.get(`/artifacts/content?name=${encodeURIComponent(a.name)}`);
      setPreview(c);
    } catch (e) { toast(e.message, 'err'); }
  };

  const remove = async (a) => {
    if (!confirm(`确认删除成果「${a.name}」？`)) return;
    try {
      await api.del(`/artifacts?name=${encodeURIComponent(a.name)}`);
      toast('成果已删除', 'err');
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const totalSize = arts.reduce((s, a) => s + a.size, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">工作台</div>
          <div className="page-desc">数字员工的成果文件库 · 共 {arts.length} 份成果（{fmtSize(totalSize)}）</div>
        </div>
        <button className="btn btn-ghost" onClick={load}>🔄 刷新</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`tag-btn ${tab === 'outputs' ? 'active' : ''}`} onClick={() => setTab('outputs')}>📦 成果文件 ({arts.length})</button>
        <button className={`tag-btn ${tab === 'inputs' ? 'active' : ''}`} onClick={() => setTab('inputs')}>📥 输入素材 ({inputs.length})</button>
      </div>

      {tab === 'outputs' && (
        <div className="grid grid-3">
          {arts.map((a) => (
            <div className="card" key={a.name} style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{TYPE_ICON[a.type] || '📎'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.name}>{a.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {fmtSize(a.size)} · {a.mtime.slice(0, 16)}
                  </div>
                </div>
                <span className="badge badge-purple" style={{ flexShrink: 0 }}>.{a.type}</span>
              </div>
              {a.task_title && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  📋 来自任务：{a.task_title}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => openPreview(a)}>👁 预览</button>
                <a className="btn btn-sm btn-primary" href={a.download} download>⬇ 下载</a>
                <button className="btn btn-sm btn-danger" style={{ marginLeft: 'auto' }} onClick={() => remove(a)}>删除</button>
              </div>
            </div>
          ))}
          {!arts.length && <div className="card empty" style={{ gridColumn: 'span 3' }}>
            <div className="big">📦</div>暂无成果文件，去「任务中心」派发一个任务吧（如：文件整理、数据整理）
          </div>}
        </div>
      )}

      {tab === 'inputs' && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.8, color: 'var(--text-2)', marginBottom: 12 }}>
            这里是数字员工的<b>工作素材输入区</b>（<span className="mono">server/data/inputs/</span>）。把真实文件放进该目录，
            然后给数字员工派发「文件整理」「数据整理」等任务，即可让它读取并加工这些素材，产出成果文件。
          </div>
          <table className="tbl">
            <thead><tr><th>文件名</th><th>大小</th><th>更新时间</th></tr></thead>
            <tbody>
              {inputs.map((f) => (
                <tr key={f.name}>
                  <td style={{ fontWeight: 600 }}>📄 {f.name}</td>
                  <td>{fmtSize(f.size)}</td>
                  <td style={{ color: 'var(--text-2)' }}>{f.mtime}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!inputs.length && <div className="empty" style={{ padding: 20 }}>暂无素材，请将文件放入 server/data/inputs/ 目录</div>}
        </div>
      )}

      {/* 预览弹窗 */}
      {preview && (
        <div className="modal-mask" onClick={() => setPreview(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span>{TYPE_ICON[preview.type] || '📎'} {preview.name}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <a className="btn btn-sm btn-primary" href={`/api/artifacts/download?name=${encodeURIComponent(preview.name)}`} download>⬇ 下载</a>
                <button className="modal-close" onClick={() => setPreview(null)}>✕</button>
              </div>
            </div>
            <div style={{ maxHeight: '62vh', overflowY: 'auto', background: '#f8f9fd', borderRadius: 10, padding: 16 }}>
              {preview.type === 'csv' ? (
                <table className="tbl" style={{ background: '#fff' }}>
                  <tbody>
                    {preview.content.split('\n').filter(Boolean).map((row, i) => {
                      const cells = row.split(',').map((c) => c.replace(/^"|"$/g, ''));
                      return (
                        <tr key={i}>
                          {cells.map((c, j) => <td key={j} style={{ borderBottom: '1px solid #f0f2f9', fontSize: 12.5 }}>{c}</td>)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <pre className="md-out" style={{ margin: 0 }}>{preview.content}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
