/** 仪表盘统计 API */
const express = require('express');
const { all, get } = require('../db');
const { getConfig } = require('../llm');

const router = express.Router();

router.get('/', (req, res) => {
  const count = (sql, ...p) => get(sql, p).n;

  const today = new Date().toISOString().replace('T', ' ').slice(0, 10);
  const stats = {
    employees: {
      total: count('SELECT COUNT(*) AS n FROM employees'),
      active: count('SELECT COUNT(*) AS n FROM employees WHERE status = \'active\''),
      paused: count('SELECT COUNT(*) AS n FROM employees WHERE status = \'paused\''),
      offline: count('SELECT COUNT(*) AS n FROM employees WHERE status = \'offline\''),
    },
    tasks: {
      total: count('SELECT COUNT(*) AS n FROM tasks'),
      running: count('SELECT COUNT(*) AS n FROM tasks WHERE status = \'running\''),
      pending: count('SELECT COUNT(*) AS n FROM tasks WHERE status = \'pending\''),
      completed: count('SELECT COUNT(*) AS n FROM tasks WHERE status = \'completed\''),
      failed: count('SELECT COUNT(*) AS n FROM tasks WHERE status = \'failed\''),
      today_completed: count(`SELECT COUNT(*) AS n FROM tasks WHERE status = 'completed' AND created_at LIKE ?`, `${today}%`),
      today_created: count(`SELECT COUNT(*) AS n FROM tasks WHERE created_at LIKE ?`, `${today}%`),
    },
    conversations: count('SELECT COUNT(*) AS n FROM conversations'),
    total_workload: count('SELECT COALESCE(SUM(workload), 0) AS n FROM employees'),
    llm: {
      api_key_set: !!getConfig().apiKey,
      model: getConfig().model,
      base_url: getConfig().baseUrl,
    },
  };

  // 成功率
  const done = stats.tasks.completed + stats.tasks.failed;
  stats.tasks.success_rate = done ? Math.round((stats.tasks.completed / done) * 100) : 100;

  res.json({
    stats,
    recent_tasks: all('SELECT * FROM tasks ORDER BY id DESC LIMIT 8'),
    top_employees: all(
      `SELECT id, name, role, avatar, status, workload FROM employees ORDER BY workload DESC LIMIT 5`
    ),
  });
});

module.exports = router;
