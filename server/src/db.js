/**
 * 数据库层 — 基于 Node 24 内置 node:sqlite，零外部依赖
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'digital-employees.db'));

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS employees (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT '普通员工',
  avatar        TEXT NOT NULL DEFAULT '🤖',
  status        TEXT NOT NULL DEFAULT 'active',        -- active | paused | offline
  model         TEXT NOT NULL DEFAULT 'auto',          -- auto | sonnet | opus | haiku | mock
  system_prompt TEXT NOT NULL DEFAULT '',
  skills        TEXT NOT NULL DEFAULT '[]',            -- JSON 数组: 绑定的技能 id
  workload      INTEGER NOT NULL DEFAULT 0,            -- 累计执行任务数
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  last_active_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  employee_name TEXT,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  skill        TEXT,                                    -- 指定技能 id，可为空(自动匹配)
  status       TEXT NOT NULL DEFAULT 'pending',         -- pending | running | completed | failed | cancelled
  progress     INTEGER NOT NULL DEFAULT 0,              -- 0-100
  priority     TEXT NOT NULL DEFAULT 'normal',          -- low | normal | high | urgent
  input        TEXT DEFAULT '{}',                       -- JSON 参数
  output       TEXT,
  error        TEXT,
  scheduled    INTEGER NOT NULL DEFAULT 0,              -- 是否定时任务派生的
  schedule_id  INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  started_at   TEXT,
  finished_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_employee ON tasks(employee_id);

CREATE TABLE IF NOT EXISTS conversations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '新对话',
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,                        -- user | employee | system
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS schedules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  skill         TEXT,
  cron          TEXT NOT NULL,                          -- cron 表达式 5 段
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_run_at   TEXT,
  next_run_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER,
  employee_id INTEGER,
  level       TEXT NOT NULL DEFAULT 'info',             -- info | warn | error | success
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`);

// 兼容旧库迁移（必须在建表之后执行）
const taskCols = db.prepare("PRAGMA table_info(tasks)").all();
if (!taskCols.some((c) => c.name === 'nodes')) {
  db.exec('ALTER TABLE tasks ADD COLUMN nodes TEXT DEFAULT \'[]\'');
}
if (!taskCols.some((c) => c.name === 'node_results')) {
  db.exec('ALTER TABLE tasks ADD COLUMN node_results TEXT DEFAULT \'[]\'');
}

/** 通用查询辅助 */
function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}
function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}
function run(sql, params = []) {
  const r = db.prepare(sql).run(...params);
  return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
}

/** 写日志（同步防丢） */
function log(level, message, { taskId, employeeId } = {}) {
  run(
    'INSERT INTO logs (task_id, employee_id, level, message) VALUES (?, ?, ?, ?)',
    [taskId ?? null, employeeId ?? null, level, message]
  );
}

module.exports = { db, all, get, run, log, DATA_DIR };
