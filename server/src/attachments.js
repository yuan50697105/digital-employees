/**
 * 附件系统 — 多模态素材管理
 *
 * 上传的文件（图片/文档）存入 server/data/attachments/，
 * 数字员工可读取并处理（vision 图像分析 / doc 文档解析）。
 * 与 inputs/ 区别：attachments 是任务即时上传的素材，inputs 是常驻工作台素材。
 */
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const ATT_DIR = path.join(__dirname, '..', 'data', 'attachments');
if (!fs.existsSync(ATT_DIR)) fs.mkdirSync(ATT_DIR, { recursive: true });

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
const DOC_EXT = new Set(['.txt', '.md', '.csv', '.json', '.docx', '.xlsx', '.pdf', '.log']);
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.json': 'application/json',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf': 'application/pdf', '.log': 'text/plain',
};

/**
 * 保存上传文件（base64 → 磁盘）
 * @param {object} { name, data(base64), maxBytes }
 * @returns {null | {name, relPath, absPath, ext, type: 'image'|'doc'|'other', size, mime}}
 */
function saveUpload({ name, data }) {
  if (!name || !data) return { error: '缺少文件名或内容' };
  const ext = path.extname(name).toLowerCase();
  if (!(IMAGE_EXT.has(ext) || DOC_EXT.has(ext))) {
    return { error: `暂不支持该文件类型「${ext || '无扩展名'}」，支持：图片(png/jpg/webp) 与文档(txt/md/csv/json/docx/xlsx/pdf)` };
  }
  const buf = Buffer.from(String(data).replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!buf.length) return { error: '文件内容为空' };
  if (buf.length > 15 * 1024 * 1024) return { error: '文件超过 15MB 上限' };

  const safe = path.basename(name).replace(/[\\/:*?"<>|]/g, '_');
  const stored = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`;
  const absPath = path.join(ATT_DIR, stored);
  fs.writeFileSync(absPath, buf);
  return {
    name: safe,
    stored: stored,
    relPath: path.join('attachments', stored).replace(/\\/g, '/'),
    absPath,
    ext,
    type: IMAGE_EXT.has(ext) ? 'image' : 'doc',
    size: buf.length,
    mime: MIME[ext] || 'application/octet-stream',
  };
}

/** 读取附件为 base64 Data URI（图片，供多模态 API 使用） */
function toDataUri(absPath, mime) {
  const buf = fs.readFileSync(absPath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** 按存储名定位附件 */
function resolve(storedName) {
  const absPath = path.join(ATT_DIR, path.basename(storedName));
  if (!fs.existsSync(absPath)) return null;
  const ext = path.extname(absPath).toLowerCase();
  return { absPath, ext, mime: MIME[ext] || 'application/octet-stream' };
}

function list() {
  return fs.readdirSync(ATT_DIR)
    .filter((n) => !n.startsWith('.'))
    .map((n) => {
      const st = fs.statSync(path.join(ATT_DIR, n));
      const m = n.match(/^\d+-\w+-(.+)$/);
      return { stored: n, name: m ? m[1] : n, size: st.size, time: st.mtime.toISOString().replace('T', ' ').slice(0, 19) };
    })
    .sort((a, b) => (a.time < b.time ? 1 : -1));
}

module.exports = { ATT_DIR, IMAGE_EXT, DOC_EXT, saveUpload, toDataUri, resolve, list };
