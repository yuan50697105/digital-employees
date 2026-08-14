/**
 * 产出物系统 — 数字员工的「成果文件」
 *
 * 每个任务完成的产出不再只是数据库里的文本，而是真实落盘的成果文件
 * （Markdown 报告、CSV 数据表、笔记…），可从工作台查看、下载、管理。
 * 目录：server/data/outputs/  ← 备份该目录即备份全部工作成果
 */
const path = require('node:path');
const fs = require('node:fs');
const { get } = require('./db');

const OUTPUTS_DIR = path.join(__dirname, '..', 'data', 'outputs');
const INPUTS_DIR = path.join(__dirname, '..', 'data', 'inputs');
if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
if (!fs.existsSync(INPUTS_DIR)) fs.mkdirSync(INPUTS_DIR, { recursive: true });

/** 文件名净化：保留中文与常规字符 */
function slugify(name) {
  const cleaned = String(name)
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return cleaned || 'output';
}

/**
 * 保存一份产出文件
 * @param {object} opts { taskId, title(文件名，不含扩展名), content, type: 'md'|'csv'|'txt'|'json' }
 * @returns {{ name: string, absPath: string, size: number } | null}
 */
function saveArtifact({ taskId, title, content, type = 'md' }) {
  if (content === undefined || content === null || content === '') return null;
  const ext = String(type).replace(/^\./, '') || 'md';
  const name = `task-${taskId}-${slugify(title || '产出')}.${ext}`;
  const absPath = path.join(OUTPUTS_DIR, name);
  try {
    fs.writeFileSync(absPath, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf-8');
    return { name, absPath, size: fs.statSync(absPath).size, download: `/api/artifacts/download?name=${encodeURIComponent(name)}` };
  } catch (e) {
    console.error('[artifacts] 保存失败:', e.message);
    return null;
  }
}

/** 列出全部成果文件（带任务信息） */
function listArtifacts() {
  const files = [];
  for (const name of fs.readdirSync(OUTPUTS_DIR)) {
    if (name.startsWith('.')) continue;
    const absPath = path.join(OUTPUTS_DIR, name);
    const stat = fs.statSync(absPath);
    const m = name.match(/^task-(\d+)-(.+)\.(\w+)$/);
    let task = null;
    if (m) task = get('SELECT id, title, status, finished_at FROM tasks WHERE id = ?', [Number(m[1])]);
    files.push({
      name,
      size: stat.size,
      mtime: stat.mtime.toISOString().replace('T', ' ').slice(0, 19),
      type: m ? m[3] : path.extname(name).replace('.', ''),
      task_id: m ? Number(m[1]) : null,
      task_title: task ? task.title : null,
      task_status: task ? task.status : null,
      download: `/api/artifacts/download?name=${encodeURIComponent(name)}`,
    });
  }
  return files.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

/** 读取成果文件内容（文本类） */
function readArtifact(name) {
  const absPath = path.join(OUTPUTS_DIR, path.basename(name)); // 防目录穿越
  if (!fs.existsSync(absPath)) return null;
  const content = fs.readFileSync(absPath, 'utf-8');
  return { name: path.basename(name), absPath, content, size: Buffer.byteLength(content, 'utf-8') };
}

function deleteArtifact(name) {
  const absPath = path.join(OUTPUTS_DIR, path.basename(name));
  if (!fs.existsSync(absPath)) return false;
  fs.unlinkSync(absPath);
  return true;
}

/** 扫描输入目录（数字员工可读取的真实工作素材） */
function listInputs() {
  return fs.readdirSync(INPUTS_DIR)
    .filter((n) => !n.startsWith('.'))
    .map((n) => {
      const absPath = path.join(INPUTS_DIR, n);
      const stat = fs.statSync(absPath);
      return { name: n, size: stat.size, mtime: stat.mtime.toISOString().replace('T', ' ').slice(0, 19) };
    })
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

module.exports = { OUTPUTS_DIR, INPUTS_DIR, saveArtifact, listArtifacts, readArtifact, deleteArtifact, listInputs };
