/**
 * 定时调度器 — 让数字员工 7×24 小时值班
 * 基于 cron 表达式（5 段：分 时 日 月 周），每 30 秒轮询一次
 */
const { CronExpressionParser } = require('cron-parser');
const { all, get, run, log } = require('../db');
const { enqueue } = require('./runner');

const INTERVAL_MS = 30 * 1000;
let timer = null;

/** 计算某个 schedule 下一次触发时间（ISO 字符串） */
function nextCronTime(cronExpr, after = new Date()) {
  try {
    const interval = CronExpressionParser.parse(cronExpr, { currentDate: after });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

function recalc(schedule) {
  const next = nextCronTime(schedule.cron);
  if (next) {
    run('UPDATE schedules SET next_run_at = ? WHERE id = ?',
      [next.toISOString().replace('T', ' ').slice(0, 19), schedule.id]);
  }
}

/** 启动轮询 */
function start() {
  if (timer) return;
  // 启动时校准所有启用中的调度
  for (const s of all('SELECT * FROM schedules WHERE enabled = 1')) recalc(s);
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref?.();
  log('info', `调度器已启动（每 ${INTERVAL_MS / 1000} 秒巡检）`);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

function tick() {
  const now = new Date();
  const nowStr = now.toISOString().replace('T', ' ').slice(0, 19);
  const due = all(
    'SELECT * FROM schedules WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?',
    [nowStr]
  );
  for (const s of due) {
    // 防止重复触发（同一秒内再次读到）
    run('UPDATE schedules SET last_run_at = ?, next_run_at = NULL WHERE id = ? AND last_run_at IS NOT ?',
      [nowStr, s.id, nowStr]);
    const changed = get('SELECT id FROM schedules WHERE id = ? AND last_run_at = ?', [s.id, nowStr]);
    if (!changed) continue;

    const emp = s.employee_id ? get('SELECT * FROM employees WHERE id = ?', [s.employee_id]) : null;
    if (s.employee_id && (!emp || emp.status === 'offline')) {
      log('warn', `调度「${s.title}」跳过：员工${emp ? `「${emp.name}」` : ''}已离线`, { employeeId: s.employee_id });
      recalc(s);
      continue;
    }

    const r = run(
      `INSERT INTO tasks (employee_id, employee_name, title, description, skill, status, scheduled, schedule_id)
       VALUES (?, ?, ?, ?, ?, 'pending', 1, ?)`,
      [s.employee_id, emp?.name || null, s.title, s.description, s.skill, s.id]
    );
    log('info', `调度触发：创建任务「${s.title}」#${r.lastInsertRowid}`, { taskId: r.lastInsertRowid, employeeId: s.employee_id });
    enqueue(r.lastInsertRowid);
    recalc(s);
  }
}

module.exports = { start, stop, nextCronTime, recalc };
