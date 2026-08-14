/** 任务中心 API — 派单、执行、取消 */
const express = require('express');
const { all, get, run, log } = require('../db');
const { enqueue } = require('../engine/runner');

const router = express.Router();

const STATUS_FILTERS = ['pending', 'running', 'completed', 'failed', 'cancelled'];

// 任务列表（支持状态过滤 + 分页）
router.get('/', (req, res) => {
  const { status, limit = 100, offset = 0 } = req.query;
  const where = [];
  const params = [];
  if (status && STATUS_FILTERS.includes(status)) { where.push('status = ?'); params.push(status); }
  const rows = all(
    `SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const total = get(`SELECT COUNT(*) AS n FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`, params).n;
  res.json({ tasks: rows, total });
});

// 任务详情（含日志与节点）
router.get('/:id', (req, res) => {
  const t = get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
  if (!t) return res.status(404).json({ error: '任务不存在' });
  t.logs = all('SELECT * FROM logs WHERE task_id = ? ORDER BY id ASC', [req.params.id]);
  try { t.nodes = JSON.parse(t.nodes || '[]'); } catch { t.nodes = []; }
  try { t.node_results = JSON.parse(t.node_results || '[]'); } catch { t.node_results = []; }
  res.json(t);
});

// 创建任务（派单，支持多节点编排）
router.post('/', (req, res) => {
  const { employee_id, title, description, skill, priority, input, nodes } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: '任务标题不能为空' });

  const emp = employee_id ? get('SELECT * FROM employees WHERE id = ?', [employee_id]) : null;
  if (employee_id && !emp) return res.status(404).json({ error: '员工不存在' });
  if (emp && emp.status === 'offline') return res.status(400).json({ error: `员工「${emp.name}」已离线，无法派单` });

  // 校验节点（可选）：至少要有名称
  let nodeList = [];
  if (Array.isArray(nodes) && nodes.length) {
    nodeList = nodes.map((n, i) => ({
      id: `n${i + 1}`,
      name: String(n.name || `节点 ${i + 1}`).slice(0, 40),
      skill: n.skill || '',
      model: n.model || 'auto',
      prompt: String(n.prompt || '').slice(0, 4000),
    }));
  }

  const r = run(
    `INSERT INTO tasks (employee_id, employee_name, title, description, skill, priority, input, nodes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [emp?.id ?? null, emp?.name ?? null, String(title).trim(), String(description || ''),
      skill || null, priority || 'normal', JSON.stringify(input || {}),
      nodeList.length ? JSON.stringify(nodeList) : '[]']
  );
  log('info', `新任务派发：「${title}」→ ${emp ? emp.name : '自动分派'}${nodeList.length ? `（${nodeList.length} 节点编排）` : ''}`, { taskId: r.lastInsertRowid, employeeId: emp?.id });
  enqueue(r.lastInsertRowid);
  res.status(201).json(get('SELECT * FROM tasks WHERE id = ?', [r.lastInsertRowid]));
});

// 立即重新执行（重建任务）
router.post('/:id/retry', (req, res) => {
  const t = get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
  if (!t) return res.status(404).json({ error: '任务不存在' });
  const r = run(
    `INSERT INTO tasks (employee_id, employee_name, title, description, skill, priority, input, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [t.employee_id, t.employee_name, t.title, t.description, t.skill, t.priority, t.input]
  );
  log('info', `任务「${t.title}」重新执行 #${r.lastInsertRowid}`, { taskId: r.lastInsertRowid, employeeId: t.employee_id });
  enqueue(r.lastInsertRowid);
  res.status(201).json(get('SELECT * FROM tasks WHERE id = ?', [r.lastInsertRowid]));
});

// 取消任务
router.post('/:id/cancel', (req, res) => {
  const t = get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
  if (!t) return res.status(404).json({ error: '任务不存在' });
  if (!['pending', 'running'].includes(t.status)) return res.status(400).json({ error: '当前状态不可取消' });
  run('UPDATE tasks SET status = \'cancelled\', error = ?, finished_at = datetime(\'now\', \'localtime\') WHERE id = ?',
    ['已由管理员取消', req.params.id]);
  log('warn', `任务「${t.title}」已被取消`, { taskId: t.id, employeeId: t.employee_id });
  res.json(get('SELECT * FROM tasks WHERE id = ?', [req.params.id]));
});

module.exports = router;
