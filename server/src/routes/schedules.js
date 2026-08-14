/** 定时调度 API */
const express = require('express');
const { all, get, run, log } = require('../db');
const { nextCronTime, recalc } = require('../engine/scheduler');
const { skills, list: listSkills } = require('../skills');

const router = express.Router();

function serialize(s) {
  const next = nextCronTime(s.cron);
  return { ...s, cron_valid: !!next };
}

// 调度列表
router.get('/', (req, res) => {
  res.json(all('SELECT * FROM schedules ORDER BY id DESC').map(serialize));
});

// 创建调度
router.post('/', (req, res) => {
  const { employee_id, title, description, skill, cron } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: '调度名称不能为空' });
  if (!cron || !nextCronTime(cron)) return res.status(400).json({ error: 'cron 表达式无效（格式：分 时 日 月 周）' });
  const emp = employee_id ? get('SELECT * FROM employees WHERE id = ?', [employee_id]) : null;
  if (employee_id && !emp) return res.status(404).json({ error: '员工不存在' });

  const r = run(
    'INSERT INTO schedules (employee_id, title, description, skill, cron) VALUES (?, ?, ?, ?, ?)',
    [emp?.id ?? null, String(title).trim(), String(description || ''), skill || null, cron]
  );
  const created = get('SELECT * FROM schedules WHERE id = ?', [r.lastInsertRowid]);
  recalc(created);
  log('success', `新增定时调度：「${title}」（${cron}）`);
  res.status(201).json(serialize(get('SELECT * FROM schedules WHERE id = ?', [r.lastInsertRowid])));
});

// 更新调度
router.patch('/:id', (req, res) => {
  const s = get('SELECT * FROM schedules WHERE id = ?', [req.params.id]);
  if (!s) return res.status(404).json({ error: '调度不存在' });
  const b = req.body || {};
  const fields = [];
  const vals = [];
  if (b.title !== undefined) { fields.push('title = ?'); vals.push(String(b.title)); }
  if (b.description !== undefined) { fields.push('description = ?'); vals.push(String(b.description)); }
  if (b.skill !== undefined) { fields.push('skill = ?'); vals.push(b.skill || null); }
  if (b.cron !== undefined) {
    if (!nextCronTime(b.cron)) return res.status(400).json({ error: 'cron 表达式无效' });
    fields.push('cron = ?'); vals.push(String(b.cron));
  }
  if (b.enabled !== undefined) { fields.push('enabled = ?'); vals.push(b.enabled ? 1 : 0); }
  if (b.employee_id !== undefined) { fields.push('employee_id = ?'); vals.push(b.employee_id || null); }
  if (fields.length) {
    vals.push(req.params.id);
    run(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`, vals);
  }
  const updated = get('SELECT * FROM schedules WHERE id = ?', [req.params.id]);
  recalc(updated);
  res.json(serialize(updated));
});

// 删除调度
router.delete('/:id', (req, res) => {
  const s = get('SELECT * FROM schedules WHERE id = ?', [req.params.id]);
  if (!s) return res.status(404).json({ error: '调度不存在' });
  run('DELETE FROM schedules WHERE id = ?', [req.params.id]);
  log('warn', `删除定时调度：「${s.title}」`);
  res.json({ ok: true });
});

// 技能列表（供前端下拉，含工具/多模态标记）
router.get('/skills/list', (req, res) => {
  res.json(listSkills());
});

module.exports = router;
