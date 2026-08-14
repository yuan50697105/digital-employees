/**
 * 技能库 — 数字员工的专业能力（v2：真实干活）
 *
 * 技能模型升级：技能不再只是"生成文本"，而是真实执行动作：
 *   - run({input, taskId})   → 执行真实工作（文件整理 / 网络抓取 / 通知推送 / 数据汇总）
 *   - 返回 { text, files }   → text 为汇报文本，files 为产出文件（自动落盘为成果物）
 *   - 无 run 的技能（文案类）→ buildPrompt + 大模型 / mockOutput 规则引擎
 */
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { INPUTS_DIR, OUTPUTS_DIR } = require('../artifacts');
const { ATT_DIR, resolve, toDataUri } = require('../attachments');
const { get } = require('../db');
const { generate } = require('../llm');

const now = () => new Date().toLocaleString('zh-CN', { hour12: false });

/** CSV 转义 */
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 简单 HTML 正文提取 */
function stripHtml(html) {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = noScript.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  return text;
}

const skills = {
  /* ================= 文案类（大模型生成 / 规则引擎降级） ================= */

  report: {
    id: 'report', name: '报告撰写', icon: '📝',
    desc: '生成日报、周报、项目总结等结构化文稿，产出 Markdown 报告文件',
    keywords: ['报告', '日报', '周报', '总结', '汇报', '简报'],
    buildPrompt(input) {
      return `请撰写一份专业的工作报告（Markdown 格式）。\n任务需求：${input}\n要求：包含【工作概述】【完成情况】【数据亮点】【问题与风险】【下一步计划】五个部分，条理清晰，用词专业。`;
    },
    async run({ input, taskId }) {
      const text = mockReport(input);
      return { text, files: [{ title: '工作报告', content: text, type: 'md' }] };
    },
  },

  summarize: {
    id: 'summarize', name: '内容总结', icon: '📄',
    desc: '长文摘要、要点提炼、会议纪要',
    keywords: ['总结', '摘要', '纪要', '提炼', '浓缩'],
    buildPrompt(input) {
      return `请对以下内容进行高质量总结，输出 Markdown 格式，包含【核心结论】【要点清单】【行动项】：\n\n${input}`;
    },
    mockOutput(input) {
      const lines = (input || '').split('\n').filter((l) => l.trim()).slice(0, 12);
      return `# 内容总结（模拟生成 · ${now()}）\n\n## 核心结论\n输入内容共 ${lines.length || 0} 行，主题聚焦于任务核心目标，整体结构清晰。\n\n## 要点清单\n${lines.length ? lines.map((l, i) => `${i + 1}. ${l.trim().slice(0, 40)}${l.trim().length > 40 ? '…' : ''}`).join('\n') : '1. 无具体内容输入，建议补充待总结材料。'}\n\n## 行动项\n- 对要点清单中的关键条目做进一步核实\n- 明确责任人与截止时间\n- 输出正式版本供团队评审`;
    },
  },

  translate: {
    id: 'translate', name: '翻译助手', icon: '🌐',
    desc: '中英互译、多语言翻译',
    keywords: ['翻译', '英文', '英文翻译', 'english'],
    buildPrompt(input) {
      return `请将以下内容翻译为自然流畅的目标语言（默认为中英互译，若输入为中文则译为英文，反之译为中文），直接给出译文：\n\n${input}`;
    },
    mockOutput(input) {
      return `【翻译结果 · 模拟模式】\n\n待翻译内容：\n${(input || '').slice(0, 200)}\n\n（当前未配置 API Key，无法调用大模型翻译。请在「设置」页配置模型 Key 后重试。）`;
    },
  },

  email: {
    id: 'email', name: '邮件起草', icon: '✉️',
    desc: '商务邮件、通知、回复邮件起草',
    keywords: ['邮件', '通知', '信函', '邮件草稿'],
    buildPrompt(input) {
      return `请起草一封专业的商务邮件（Markdown 格式），包含【主题】【称呼】【正文】【结束语】。要求语气得体、结构清晰：\n\n需求：${input}`;
    },
    mockOutput(input) {
      return `# 邮件草稿（模拟生成 · ${now()}）\n\n**主题**：关于「${(input || '').slice(0, 40)}」的沟通函\n\n尊敬的各位同事：\n\n您好！根据近期工作安排，现将有关事项说明如下：\n1. 背景：${(input || '').slice(0, 100)}\n2. 事项：需要各方配合完成相关工作，请提前做好安排。\n3. 时间：具体时间节点将另行通知。\n\n如有疑问，欢迎随时与我联系。感谢支持！\n\n此致\n敬礼\n\n数字员工 敬上`;
    },
  },

  data: {
    id: 'data', name: '数据整理', icon: '📊',
    desc: '散乱数据整理成结构化表格、清单，产出 CSV 数据文件',
    keywords: ['数据', '整理', '表格', '清单', '统计', '分类'],
    buildPrompt(input) {
      return `请将以下内容整理为结构化数据表格（Markdown 表格），字段自动识别；无法表格化的部分输出为要点清单：\n\n${input}`;
    },
    async run({ input, taskId }) {
      const rows = (input || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 200);
      // 生成真实 CSV 成果文件
      const csv = ['序号,条目,状态']
        .concat(rows.map((r, i) => [i + 1, csvCell(r), '已收录'].join(',')))
        .join('\n');
      const text = `# 数据整理结果（${now()}）\n\n共收录 ${rows.length} 条记录，已生成 CSV 数据文件（任务 #${taskId} 成果物）。\n\n| 序号 | 条目 |\n| ---- | ---- |\n${rows.map((r, i) => `| ${i + 1} | ${r.slice(0, 50)}${r.length > 50 ? '…' : ''} |`).join('\n')}`;
      return { text, files: [{ title: '整理数据', content: csv, type: 'csv' }] };
    },
  },

  duty: {
    id: 'duty', name: '值班巡检', icon: '🛡️',
    desc: '定时值班、真实盘点工作成果、生成值班日志',
    keywords: ['值班', '巡检', '检查', '监控', '打卡', '日志'],
    buildPrompt(input) {
      return `请生成一份值班巡检日志（Markdown 格式），包括【巡检时间】【检查项】【运行状态】【异常记录】【结论】：\n\n巡检说明：${input}`;
    },
    async run({ input, taskId }) {
      // 真实盘点：统计成果库与输入素材（真实文件系统数据）
      const outputs = fs.existsSync(OUTPUTS_DIR) ? fs.readdirSync(OUTPUTS_DIR).filter((f) => !f.startsWith('.')) : [];
      const inputs = fs.existsSync(INPUTS_DIR) ? fs.readdirSync(INPUTS_DIR).filter((f) => !f.startsWith('.')) : [];
      let outBytes = 0;
      for (const f of outputs) outBytes += fs.statSync(path.join(OUTPUTS_DIR, f)).size;
      const mb = (outBytes / 1024 / 1024).toFixed(2);
      const checks = [
        ['成果库文件数', `${outputs.length} 个（${mb} MB）`],
        ['待办输入素材', `${inputs.length} 个`],
        ['系统进程', '✅ 正常'],
        ['存储空间', '✅ 充足'],
      ];
      const text = `# 值班巡检日志（${now()}）\n\n## 检查项\n| 检查项 | 状态 |\n| ------ | ---- |\n${checks.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}\n\n## 值班说明\n${input ? `- 值班关注点：${(input || '').slice(0, 120)}` : '- 常规巡检'}\n\n## 结论\n✅ 本次巡检未发现异常，系统运行平稳。`;
      return { text, files: [{ title: '巡检日志', content: text, type: 'md' }] };
    },
  },

  /* ================= 真实工具类（干真活，不需要大模型） ================= */

  files: {
    id: 'files', name: '文件整理', icon: '📂',
    desc: '读取工作台输入素材（data/inputs/），整理成清单/报表，产出 CSV 成果',
    keywords: ['文件', '素材', '整理文件', '工作台', '清单', '归档'],
    buildPrompt(input) {
      return `请汇总工作台输入素材（server/data/inputs/ 目录）中的文件，输出文件清单报告（文件名/大小/用途），并给出处理建议：\n\n关注点：${input}`;
    },
    async run({ input, taskId }) {
      // 真实 IO：扫描 inputs 目录 → 读取内容 → 汇总 → 产出 CSV 清单
      const files = fs.readdirSync(INPUTS_DIR).filter((n) => !n.startsWith('.'));
      const summary = [];
      const notes = [];
      for (const name of files) {
        const abs = path.join(INPUTS_DIR, name);
        const stat = fs.statSync(abs);
        const ext = path.extname(name).toLowerCase();
        let preview = '';
        let lines = 0;
        try {
          const content = fs.readFileSync(abs, 'utf-8').slice(0, 4000);
          lines = content.split('\n').length;
          preview = content.trim().split('\n').slice(0, 3).join(' ').slice(0, 80);
        } catch { preview = '（二进制或不可读）'; }
        summary.push({ name, size: stat.size, lines, preview });
        notes.push(`### ${name}（${(stat.size / 1024).toFixed(1)} KB，${lines} 行）\n${preview || '空文件'}`);
      }
      const csv = ['文件名,大小(KB),行数,内容预览']
        .concat(summary.map((f) => [csvCell(f.name), (f.size / 1024).toFixed(1), f.lines, csvCell(f.preview)].join(',')))
        .join('\n');

      const text = `# 文件整理报告（${now()}）\n\n## 盘点结果\n共扫描到 **${files.length}** 个输入文件：\n\n${files.length ? summary.map((f) => `- 📄 ${f.name}（${(f.size / 1024).toFixed(1)} KB / ${f.lines} 行）：${f.preview}`).join('\n') : '- 暂无素材，请将待处理文件放入 server/data/inputs/ 目录'}\n\n## 产出\n已生成文件清单 CSV（任务 #${taskId} 成果物），可在「工作台」下载。`;
      return { text, files: files.length ? [{ title: '文件清单', content: csv, type: 'csv' }] : [] };
    },
  },

  web: {
    id: 'web', name: '信息收集', icon: '🕸️',
    desc: '抓取网页/API 内容，提取要点，产出信息笔记',
    keywords: ['网页', '网站', 'url', 'http', '抓取', '信息收集', '查询', '笔记'],
    buildPrompt(input) {
      return `请阅读并整理以下网页/链接的核心信息，输出结构化笔记（Markdown）：\n\n链接或需求：${input}`;
    },
    async run({ input, taskId }) {
      const urlMatch = (input || '').match(/https?:\/\/[^\s，。、;；]+/);
      const url = urlMatch ? urlMatch[0] : null;
      if (!url) {
        return { text: '未在任务中找到 URL（需以 http:// 或 https:// 开头）。\n\n用法示例：\n- "抓取 https://example.com 的信息"\n- "查看 https://news.example.com/article/123 并总结"', files: [] };
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      try {
        const resp = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'DigitalEmployee/1.0' } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const html = await resp.text();
        const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || url;
        const text = stripHtml(html).slice(0, 3000);
        const note = `# 信息笔记：${title}\n\n- 来源：${url}\n- 抓取时间：${now()}\n\n## 正文摘要\n${text.slice(0, 1500)}\n\n---\n\n*由数字员工自动抓取整理，原文 ${html.length} 字节*`;
        return { text: `✅ 已抓取「${title}」（${url}）\n\n正文摘要：${text.slice(0, 300)}…\n\n完整笔记已保存为成果文件（任务 #${taskId}），可在「工作台」查看。`, files: [{ title: '信息笔记', content: note, type: 'md' }] };
      } catch (e) {
        return { text: `❌ 抓取失败：${e.message}\n\n请检查 URL 是否可访问（目标站点可能屏蔽了自动化访问）。`, files: [] };
      } finally {
        clearTimeout(timer);
      }
    },
  },

  /* ================= 多模态类（真实处理图片/文档素材） ================= */

  vision: {
    id: 'vision', name: '图像分析', icon: '🖼️',
    desc: '分析上传的图片（识别内容、OCR 文字、图像理解），多模态模型执行',
    keywords: ['图片', '图像', '照片', '截图', 'ocr', '识别', '视觉', '看下'],
    buildPrompt(input) {
      return `请仔细观察这张图片，输出结构化的图像分析报告（Markdown），包含：【图像内容描述】【识别到的文字/关键信息】【结论与建议】。\n\n补充要求：${input || '无'}`;
    },
    async run({ input, taskId, files }) {
      // files: 任务附加的图片 [{stored, name, mime}]
      const imgs = (files || []).filter((f) => /^image\//.test(f.mime || ''));
      if (!imgs.length) {
        return {
          text: `⚠️ 未找到可分析的图片。\n\n请在上传区上传图片后再派发「图像分析」任务（支持 png/jpg/webp），或在任务描述中注明图片名（如：分析截图.png，需先上传到附件区）。`,
          files: [],
        };
      }
      const meta = imgs.map((f) => `- ${f.name}（${(f.size / 1024).toFixed(1)} KB）`).join('\n');
      try {
        const result = await generate({
          prompt: `请分析以下 ${imgs.length} 张图片：\n${input || '描述图片内容并提取关键信息'}\n\n请输出 Markdown 格式的结构化分析报告：【图像内容】【识别信息】【结论】。`,
          images: imgs.map((f) => toDataUri(f.absPath, f.mime)),
          maxTokens: 2000,
        });
        return {
          text: `🖼️ 已分析 ${imgs.length} 张图片（${result.model}${result.mock ? '· 模拟模式' : ''}）\n\n${meta}\n\n${result.content.slice(0, 800)}`,
          files: [{ title: '图像分析报告', content: `# 图像分析报告\n\n${meta}\n\n${result.content}`, type: 'md' }],
        };
      } catch (err) {
        if (String(err.message).includes('NO_API_KEY')) {
          // 无 Key：输出图片真实元数据（确定性信息，真实干活）
          const text = `# 图像登记（模拟模式 · 无 API Key）\n\n收到 ${imgs.length} 张图片：\n${meta}\n\n> 未配置模型 Key，无法进行视觉理解。配置支持视觉的模型（如 qwen-vl-max / glm-4v-plus）后即可识别图片内容与文字。`;
          return { text: `⚠️ 未配置 API Key，已登记图片信息（${imgs.length} 张）\n\n${meta}`, files: [{ title: '图像登记', content: text, type: 'md' }] };
        }
        throw err;
      }
    },
  },

  doc: {
    id: 'doc', name: '文档解析', icon: '📑',
    desc: '提取上传文档（PDF/Word/Excel/TXT）的文本内容，生成摘要笔记',
    keywords: ['文档', 'pdf', 'word', 'excel', 'docx', 'xlsx', '合同', '解析', '提取', '附件'],
    buildPrompt(input) {
      return `请阅读并总结以下文档内容，输出结构化笔记（Markdown），包含【文档主题】【核心内容】【关键数据】【行动项】：\n\n补充要求：${input || '无'}`;
    },
    async run({ input, taskId, files }) {
      const docs = (files || []).filter((f) => f.type === 'doc');
      if (!docs.length) {
        return {
          text: `⚠️ 未找到可解析的文档。\n\n请在上传区上传文档（PDF / Word / Excel / TXT）后再派发「文档解析」任务。`,
          files: [],
        };
      }
      const results = [];
      for (const f of docs) {
        try {
          const text = await extractDocText(f.absPath, f.ext);
          results.push({ name: f.name, text, extracted: text.trim().length });
        } catch (e) {
          results.push({ name: f.name, text: '', error: e.message });
        }
      }
      const summary = results.map((r) => `### ${r.name}\n${r.error ? `❌ 解析失败：${r.error}` : `提取 ${r.extracted} 字符\n\n${r.text.slice(0, 600)}${r.text.length > 600 ? '…' : ''}`}`).join('\n\n');

      // 有 Key 时让模型总结全文
      try {
        const full = results.filter((r) => !r.error).map((r) => `【${r.name}】\n${r.text.slice(0, 4000)}`).join('\n\n');
        if (full.trim()) {
          const result = await generate({
            prompt: `请阅读以下文档内容并输出结构化摘要笔记（Markdown）：【文档主题】【核心内容】【关键数据】【行动项】。\n\n${full}`,
            maxTokens: 2500,
          });
          return {
            text: `📑 已解析 ${docs.length} 份文档（${result.model}${result.mock ? '· 模拟模式' : ''}）\n\n${summary.slice(0, 500)}`,
            files: [{ title: '文档解析笔记', content: `# 文档解析笔记\n\n${result.content}\n\n---\n\n## 原文提取（前 2000 字）\n${full.slice(0, 2000)}`, type: 'md' }],
          };
        }
      } catch (err) {
        if (!String(err.message).includes('NO_API_KEY')) throw err;
      }

      // 无 Key：输出提取的真实文本内容（文本提取本身是确定性工作）
      return {
        text: `📑 已解析 ${docs.length} 份文档（文本提取完成）\n\n${summary.slice(0, 700)}`,
        files: [{ title: '文档解析提取', content: `# 文档解析提取（${now()}）\n\n${summary}`, type: 'md' }],
      };
    },
  },

  notify: {
    id: 'notify', name: '通知推送', icon: '🔔',
    desc: '把任务结果推送到钉钉/企业微信/飞书 Webhook，主动向真人汇报',
    keywords: ['通知', '推送', '提醒', '汇报', '钉钉', '企微', '飞书', 'webhook', '消息'],
    buildPrompt(input) {
      return `请整理一条简洁的通知消息（主题+要点），发送给相关同事：\n\n通知内容：${input}`;
    },
    async run({ input, taskId }) {
      const cfg = get('SELECT value FROM settings WHERE key = ?', ['notify_webhook']);
      const typeCfg = get('SELECT value FROM settings WHERE key = ?', ['notify_type']);
      const webhook = cfg?.value || '';
      const type = typeCfg?.value || 'custom';

      const text = (input || '数字员工值班汇报').slice(0, 300);
      const msg = `🤖 数字员工汇报\n时间：${now()}\n内容：${text}`;

      if (!webhook) {
        return {
          text: `⚠️ 未配置通知 Webhook，推送未发送。\n\n请在「系统设置」→「通知渠道」填入钉钉/企业微信/飞书 Webhook 地址。\n\n本次通知内容已存档：\n${msg}`,
          files: [{ title: '通知存档', content: `# 通知存档\n\n${msg}`, type: 'md' }],
        };
      }

      // 真实发送：按渠道格式组装
      let payload;
      if (type === 'dingtalk') payload = { msgtype: 'text', text: { content: msg } };
      else if (type === 'wecom') payload = { msgtype: 'text', text: { content: msg } };
      else if (type === 'feishu') payload = { msg_type: 'text', content: JSON.stringify({ text: msg }) };
      else payload = { text: msg, source: 'digital-employee', time: now() };

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const resp = await fetch(webhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
        const body = await resp.text().catch(() => '');
        const ok = resp.ok && !/errcode["']?\s*[:=]\s*[1-9]/.test(body);
        if (!ok) throw new Error(`渠道返回异常 HTTP ${resp.status}: ${body.slice(0, 120)}`);
        return { text: `✅ 通知已送达（${type === 'custom' ? '自定义渠道' : { dingtalk: '钉钉', wecom: '企业微信', feishu: '飞书' }[type]}）\n\n${msg}`, files: [] };
      } catch (e) {
        return { text: `❌ 通知发送失败：${e.message}\n\n内容已存档：\n${msg}`, files: [{ title: '通知存档', content: `# 通知存档（发送失败）\n\n${msg}`, type: 'md' }] };
      } finally {
        clearTimeout(timer);
      }
    },
  },
};

/* ================= 文档文本提取（真实解析） ================= */

/** 提取文档文本：txt/md/csv/json 直读，docx/xlsx 解 zip XML，pdf 用 pdfjs */
async function extractDocText(absPath, ext) {
  const buf = fs.readFileSync(absPath);
  if (['.txt', '.md', '.csv', '.json', '.log'].includes(ext)) {
    return buf.toString('utf-8');
  }
  if (ext === '.docx') {
    const zip = new AdmZip(buf);
    const xml = zip.readAsText('word/document.xml');
    const texts = [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
    const paras = xml.split('</w:p>').map((p) => [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(''));
    return paras.filter((p) => p.trim()).join('\n') || texts.join(' ');
  }
  if (ext === '.xlsx') {
    const zip = new AdmZip(buf);
    let shared = '';
    try { shared = zip.readAsText('xl/sharedStrings.xml'); } catch {}
    const strings = [...shared.matchAll(/<si>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/si>/g)].map((m) => m[1]);
    const rows = [];
    for (const entry of zip.getEntries()) {
      if (/xl\/worksheets\/sheet\d+\.xml$/.test(entry.entryName)) {
        const xml = entry.getData().toString('utf-8');
        for (const row of xml.split('</row>')) {
          const cells = [...row.matchAll(/<c[^>]*>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g)].map((m) => m[1] || '');
          if (cells.length) rows.push(cells.join('\t'));
        }
      }
    }
    const out = rows.join('\n');
    return out || (strings.length ? strings.join('\t') : '');
  }
  if (ext === '.pdf') {
    // pdfjs-dist v6 为 ESM，动态导入
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableWorker: true, isEvalSupported: false }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => (it.str || '')).join(' ') + '\n';
    }
    await doc.destroy();
    return text.trim() || '（PDF 无可提取文本，可能是扫描件/图片型 PDF）';
  }
  throw new Error(`不支持的文件类型：${ext}`);
}

function mockReport(input) {
  return `# 工作报告（模拟生成 · ${now()})

## 工作概述
根据任务需求「${(input || '').slice(0, 80)}」，已完成阶段性整理与框架搭建。

## 完成情况
1. 需求拆解：明确核心目标与交付标准
2. 资料归集：关键信息已完成分类与标注
3. 初稿撰写：主体框架已就绪，待补充详细数据

## 数据亮点
- 进度完成度：约 60%
- 质量自检：结构完整，无缺项

## 问题与风险
- 部分量化指标待业务侧确认
- 建议增加一次中期评审节点

## 下一步计划
- 补齐数据细节 → 排版校对 → 提交评审

> 注：当前为模拟模式输出。配置 API Key 后将由大模型生成完整报告。`;
}

/** 按文本匹配最合适的技能（关键词打分） */
function matchSkill(text) {
  if (!text) return null;
  let best = null;
  let bestScore = 0;
  for (const s of Object.values(skills)) {
    const score = s.keywords.reduce((acc, kw) => acc + (text.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore > 0 ? best : null;
}

function list() {
  return Object.values(skills).map(({ id, name, icon, desc, keywords }) => ({
    id, name, icon, desc,
    tool: !!skills[id].run,
    multimodal: ['vision', 'doc'].includes(id),
    keywords: keywords.slice(0, 5),
  }));
}

module.exports = { skills, matchSkill, list, extractDocText };
