/**
 * 数字员工系统 — 服务入口
 * API 地址：http://localhost:8787/api
 */
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const { all, log } = require('./db');
const { seed } = require('./seed'); // 首次启动自动初始化（幂等）
const { start: startScheduler } = require('./engine/scheduler');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// API 路由
app.use('/api/employees', require('./routes/employees'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/artifacts', require('./routes/artifacts'));
app.use('/api/uploads', require('./routes/uploads'));

// 系统日志
app.get('/api/logs', (req, res) => {
  const { limit = 100 } = req.query;
  res.json(all('SELECT * FROM logs ORDER BY id DESC LIMIT ?', [Number(limit)]));
});

// 运行信息
app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: '数字员工系统', version: '1.0.0', time: new Date().toISOString() });
});

// 静态托管前端（构建产物存在时）
const dist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

seed(); // 幂等：空库时预置 4 名数字员工 + 素材样例 + 示例任务 + 定时调度

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  log('success', `数字员工系统启动，地址：http://localhost:${PORT}`);
  console.log(`\n  🤖 数字员工系统已启动`);
  console.log(`  ➜ API:   http://localhost:${PORT}/api`);
  console.log(`  ➜ 控制台: http://localhost:${PORT}\n`);
  startScheduler();
});
