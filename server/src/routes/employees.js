/** 数字员工管理 API */
const express = require('express');
const { all, get, run, log } = require('../db');

const router = express.Router();

function serialize(row) {
  if (!row) return null;
  return {
    ...row,
    skills: safeJson(row.skills, []),
  };
}
function safeJson(str, def) {
  try { return JSON.parse(str); } catch { return def; }
}

// 员工列表
router.get('/', (req, res) => {
  const rows = all('SELECT * FROM employees ORDER BY created_at ASC');
  res.json(rows.map(serialize));
});

// 员工详情（含最近任务）
router.get('/:id', (req, res) => {
  const emp = serialize(get('SELECT * FROM employees WHERE id = ?', [req.params.id]));
  if (!emp) return res.status(404).json({ error: '员工不存在' });
  emp.recent_tasks = all('SELECT id, title, status, created_at FROM tasks WHERE employee_id = ? ORDER BY id DESC LIMIT 10', [req.params.id]);
  res.json(emp);
});

// 新建员工
router.post('/', (req, res) => {
  const { name, role, avatar, model, system_prompt, skills: skillIds } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: '员工姓名不能为空' });
  const r = run(
    `INSERT INTO employees (name, role, avatar, model, system_prompt, skills)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      String(name).trim(),
      String(role || '普通员工').trim(),
      String(avatar || '🤖'),
      String(model || 'auto'),
      String(system_prompt || ''),
      JSON.stringify(Array.isArray(skillIds) ? skillIds : []),
    ]
  );
  log('success', `新员工入职：${name}（${role || '普通员工'}）`);
  res.status(201).json(get('SELECT * FROM employees WHERE id = ?', [r.lastInsertRowid]));
});

// 更新员工
router.patch('/:id', (req, res) => {
  const emp = get('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!emp) return res.status(404).json({ error: '员工不存在' });
  const b = req.body || {};
  const fields = [];
  const vals = [];
  const map = { name: 'name', role: 'role', avatar: 'avatar', status: 'status', model: 'model', system_prompt: 'system_prompt' };
  for (const [k, col] of Object.entries(map)) {
    if (b[k] !== undefined) { fields.push(`${col} = ?`); vals.push(String(b[k])); }
  }
  if (b.skills !== undefined) { fields.push('skills = ?'); vals.push(JSON.stringify(b.skills)); }
  if (!fields.length) return res.json(emp);
  vals.push(req.params.id);
  run(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`, vals);
  res.json(get('SELECT * FROM employees WHERE id = ?', [req.params.id]));
});

// 删除员工
router.delete('/:id', (req, res) => {
  const emp = get('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!emp) return res.status(404).json({ error: '员工不存在' });
  run('DELETE FROM employees WHERE id = ?', [req.params.id]);
  log('warn', `员工离职：${emp.name}`);
  res.json({ ok: true });
});

module.exports = router;
