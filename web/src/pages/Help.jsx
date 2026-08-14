import React, { useState } from 'react';

/* ===== 帮助中心内容（精编自 docs/操作手册.md） ===== */

const SECTIONS = [
  {
    id: 'start', title: '🚀 快速上手', icon: '🚀',
    blocks: [
      { t: 'h', v: '第 1 步 · 配置模型大脑' },
      { t: 'p', v: '系统设置 → 模型大脑：点击供应商快捷按钮（DeepSeek / 通义千问 / Kimi / 智谱 GLM）→ 填入 API Key → 保存。视觉任务建议配置 qwen-vl-max 等视觉模型。未配置 Key 时系统自动进入模拟模式，全流程可演示。' },
      { t: 'h', v: '第 2 步 · 认识团队' },
      { t: 'p', v: '系统预置 4 名数字员工：✍️ 小文（文案）、📊 小析（数据）、🌐 小译（翻译）、🛡️ 小安（值班）。仪表盘可看全员状态与效能。' },
      { t: 'h', v: '第 3 步 · 派第一个任务' },
      { t: 'p', v: '任务中心 → ＋派发任务 → 标题"整理工作台素材" → 技能选「文件整理」→ 立即派发。约 1 秒完成，到工作台下载 CSV 成果。' },
      { t: 'tip', v: '任务描述技巧：背景 + 目标 + 输入材料 + 输出要求，描述质量决定产出质量。' },
    ],
  },
  {
    id: 'emp', title: '👥 员工与任务', icon: '👥',
    blocks: [
      { t: 'h', v: '招聘员工' },
      { t: 'p', v: '员工管理 → ＋招聘新员工。关键字段：人设指令（定义性格/专长/行为准则，决定工作质量）、绑定技能、模型偏好（auto 跟随全局 / 指定模型 / mock 规则引擎）。' },
      { t: 'code', v: '人设指令示例：\n你是资深市场分析师，负责行业情报收集与趋势研判。\n工作风格：数据优先、结论明确，输出专业简洁。' },
      { t: 'h', v: '员工排班' },
      { t: 'p', v: '暂停（暂不接单）/ 恢复 / 档案（人设与产出记录）/ 离职。注意：离线员工无法派单。' },
      { t: 'h', v: '任务生命周期' },
      { t: 'p', v: '排队中 → 执行中 → 已完成/失败/已取消。排队中/执行中可取消，失败可一键重试。任务详情可查看完整执行日志。' },
    ],
  },
  {
    id: 'flow', title: '🔗 节点编排', icon: '🔗',
    blocks: [
      { t: 'h', v: '核心能力' },
      { t: 'p', v: '派发任务时切换「🔗 节点编排」：把复杂任务拆成节点链按顺序执行，每个节点独立配置 技能 + 模型——按任务类型选最优模型，质量与成本双优化。' },
      { t: 'h', v: '上下文传递 {prev}' },
      { t: 'code', v: '方式一（显式引用）：\n指令：提取合同中的金额与交付周期，{prev}\n\n方式二（自然语言触发）：\n指令：基于上一节点的结果做风险分析' },
      { t: 'h', v: '模型选择建议' },
      { t: 'table', head: ['节点任务', '建议模型'], rows: [
        ['视觉/图像', 'qwen-vl-max、glm-4v-plus'],
        ['文档提取', 'auto（提取本身无需模型）'],
        ['深度推理', 'deepseek-reasoner'],
        ['日常文案', 'deepseek-chat、qwen-plus'],
        ['零成本稳定', 'mock（规则引擎）'],
      ] },
      { t: 'code', v: '流水线示例：合同解析与汇报\n 节点1 解析文档 [文档解析] qwen-plus    解析上传的合同\n 节点2 整理要点 [数据整理] auto          把{prev}整理成清单\n 节点3 生成简报 [报告撰写] deepseek-chat 基于{prev}生成简报\n 节点4 通知送达 [通知推送] auto          把简报要点推送给大家' },
    ],
  },
  {
    id: 'mm', title: '🖼️ 多模态', icon: '🖼️',
    blocks: [
      { t: 'h', v: '上传素材' },
      { t: 'p', v: '任务表单底部「素材附件」上传（图片：PNG/JPG/WebP/GIF/BMP；文档：PDF/DOCX/XLSX/TXT/CSV/MD/JSON，≤15MB）。聊天框 🖼️ 按钮可直接发图。' },
      { t: 'h', v: '图像分析' },
      { t: 'p', v: '派发「图像分析」任务 + 上传图片 → 产出分析报告（内容描述/识别信息/结论）。无视觉模型 Key 时降级为"图像登记"（输出图片真实元数据）。' },
      { t: 'h', v: '文档解析' },
      { t: 'p', v: '派发「文档解析」任务 + 上传文档 → 真实提取文本（PDF 逐页 / Word/Excel 解包），产出解析笔记。文本提取不依赖大模型，无 Key 也能得到真实内容。' },
    ],
  },
  {
    id: 'wb', title: '📦 工作台', icon: '📦',
    blocks: [
      { t: 'h', v: '成果文件' },
      { t: 'p', v: '所有任务产出自动落盘（server/data/outputs/），工作台可预览（Markdown 渲染、CSV 表格化）、下载、删除。命名：task-{任务号}-{产出名}.{格式}。' },
      { t: 'h', v: '输入素材区（关键用法）' },
      { t: 'p', v: '把真实文件放入 server/data/inputs/（客户反馈、销售数据、待办清单…），派发「文件整理/数据整理」任务，员工即可读取加工，产出成果。' },
      { t: 'tip', v: '备份 = 复制整个 server/data/ 目录（数据库 + 素材 + 成果全在其中）。' },
    ],
  },
  {
    id: 'sched', title: '⏰ 定时与通知', icon: '⏰',
    blocks: [
      { t: 'h', v: '定时调度' },
      { t: 'p', v: '定时调度页 → ＋新建调度：选值班员工、填任务内容、选技能、配 cron（或点快捷模板）。触发后自动创建任务并执行，产出自动归档 + 对话汇报。' },
      { t: 'table', head: ['模板', 'cron'], rows: [
        ['每 10 分钟', '*/10 * * * *'],
        ['每小时', '0 * * * *'],
        ['每天 9:00', '0 9 * * *'],
        ['每周一 9:00', '0 9 * * 1'],
        ['工作日 8:30', '30 8 * * 1-5'],
      ] },
      { t: 'h', v: '通知推送（钉钉/企微/飞书）' },
      { t: 'p', v: '设置 → 通知渠道：选渠道类型 → 粘贴群机器人 Webhook 地址 → 保存。然后派发「通知推送」技能任务即可送达群内。未配置 Webhook 时通知内容自动存档为成果文件。' },
    ],
  },
  {
    id: 'skills', title: '🧰 技能大全', icon: '🧰',
    blocks: [
      { t: 'table', head: ['技能', '类型', '产出', '依赖'], rows: [
        ['🖼️ 图像分析', '多模态', '分析报告', '视觉模型（无 Key 登记元数据）'],
        ['📑 文档解析', '多模态', '解析笔记', '无（文本提取无需模型）'],
        ['📂 文件整理', '工具', 'CSV 清单', '无'],
        ['📊 数据整理', '工具', 'CSV 数据', '无'],
        ['🕸️ 信息收集', '工具', '信息笔记', '可访问的网络'],
        ['🔔 通知推送', '工具', '送达回执', 'Webhook 配置'],
        ['🛡️ 值班巡检', '工具', '巡检日志', '无'],
        ['📝 报告撰写', '文案', 'Markdown 报告', '大模型（无 Key 规则降级）'],
        ['📄 内容总结', '文案', '摘要', '大模型（无 Key 规则降级）'],
        ['🌐 翻译助手', '文案', '译文', '大模型（无 Key 规则降级）'],
        ['✉️ 邮件起草', '文案', '邮件草稿', '大模型（无 Key 规则降级）'],
      ] },
      { t: 'tip', v: '任务描述命中关键词自动匹配技能（如"报告/日报/周报"→报告撰写），也可在表单手动指定。' },
    ],
  },
  {
    id: 'faq', title: '🩺 排障与 FAQ', icon: '🩺',
    blocks: [
      { t: 'table', head: ['现象', '处理'], rows: [
        ['回复带"（模拟模式）"', '设置页填入有效 API Key'],
        ['模型报错 401/403', 'Key 错误或过期，检查供应商余额'],
        ['模型报错 404', '模型名不在当前端点（视觉模型需通义/智谱）'],
        ['任务失败"员工已离线"', '员工管理 → 恢复在岗，或改派'],
        ['通知显示"未配置 Webhook"', '设置 → 通知渠道填地址（未配置则存档）'],
        ['图像分析只有"登记"', '配置视觉模型（qwen-vl-max / glm-4v-plus）'],
        ['信息收集抓取失败', '目标站反爬/不可达，换 URL'],
        ['上传被拒', '类型不支持或超 15MB'],
        ['端口被占用', 'PORT=8888 npm start 换端口'],
        ['控制台白屏', 'npm run build -w web 后重启'],
      ] },
      { t: 'h', v: 'FAQ' },
      { t: 'p', v: 'Q：必须配置 Key 才能用吗？ A：不需要。无 Key 时工具/多模态技能照常真实干活，文案类由规则引擎生成；配置后自动升级。' },
      { t: 'p', v: 'Q：任务能并行吗？ A：可以，执行引擎内置 4 路并发池。' },
      { t: 'p', v: 'Q：能接入公司内部系统吗？ A：素材放 data/inputs/ 供加工；「信息收集」技能可抓取可达的 HTTP 接口/页面。' },
      { t: 'p', v: '排障第一入口：系统设置 → 系统运行日志（全操作轨迹，时间倒序）。' },
    ],
  },
];

/* ===== 渲染 ===== */

function Block({ b }) {
  switch (b.t) {
    case 'h': return <div style={{ fontWeight: 700, fontSize: 13.5, margin: '16px 0 6px', color: 'var(--text)' }}>{b.v}</div>;
    case 'p': return <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 4 }}>{b.v}</div>;
    case 'tip': return (
      <div style={{ background: '#fef4e4', color: '#92630a', borderRadius: 9, padding: '10px 14px', fontSize: 12.5, lineHeight: 1.7, margin: '8px 0' }}>
        💡 {b.v}
      </div>
    );
    case 'code': return (
      <pre style={{ background: '#1e2350', color: '#d5d9f5', borderRadius: 10, padding: '12px 14px', fontSize: 12, lineHeight: 1.7, overflowX: 'auto', margin: '8px 0', whiteSpace: 'pre-wrap' }}>{b.v}</pre>
    );
    case 'table': return (
      <table className="tbl" style={{ margin: '8px 0', background: '#fff' }}>
        <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
        ))}</tbody>
      </table>
    );
    default: return null;
  }
}

export default function Help() {
  const [active, setActive] = useState('start');
  const sec = SECTIONS.find((s) => s.id === active);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">帮助中心</div>
          <div className="page-desc">数字员工系统操作指南 · 完整手册见 docs/操作手册.md</div>
        </div>
      </div>
      <div className="grid grid-2" style={{ gridTemplateColumns: '200px 1fr', alignItems: 'start' }}>
        <div className="card" style={{ padding: 10, position: 'sticky', top: 0 }}>
          {SECTIONS.map((s) => (
            <div key={s.id} className={`chat-item ${active === s.id ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setActive(s.id)}>
              <span>{s.icon}</span><span style={{ fontSize: 13, fontWeight: active === s.id ? 700 : 500 }}>{s.title}</span>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: '20px 24px', minHeight: 400 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{sec.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>章节：{SECTIONS.findIndex((s) => s.id === active) + 1} / {SECTIONS.length}</div>
          {sec.blocks.map((b, i) => <Block key={i} b={b} />)}
        </div>
      </div>
    </div>
  );
}
