/** 对话系统 API — 与数字员工在线沟通 */
const express = require('express');
const { all, get, run, log } = require('../db');
const { generate } = require('../llm');

const router = express.Router();

// 会话列表
router.get('/', (req, res) => {
  const rows = all(
    `SELECT c.*, e.name AS employee_name, e.avatar AS employee_avatar,
            (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_message,
            (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS message_count
     FROM conversations c LEFT JOIN employees e ON e.id = c.employee_id
     ORDER BY c.updated_at DESC`
  );
  res.json(rows);
});

// 会话详情（含消息）
router.get('/:id', (req, res) => {
  const conv = get('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: '会话不存在' });
  conv.messages = all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC', [req.params.id]);
  res.json(conv);
});

// 新建会话（可附带首条消息）
router.post('/', (req, res) => {
  const { employee_id, title, message } = req.body || {};
  const emp = employee_id ? get('SELECT * FROM employees WHERE id = ?', [employee_id]) : null;
  const r = run('INSERT INTO conversations (employee_id, title) VALUES (?, ?)',
    [emp?.id ?? null, String(title || (emp ? `与${emp.name}的对话` : '新对话'))]);
  const convId = r.lastInsertRowid;
  if (message) {
    run('INSERT INTO messages (conversation_id, role, content) VALUES (?, \'user\', ?)', [convId, String(message)]);
    reply(convId, res); // 立即让员工回复
    return;
  }
  res.status(201).json(get('SELECT * FROM conversations WHERE id = ?', [convId]));
});

// 发送消息（支持多模态图片）
router.post('/:id/messages', async (req, res) => {
  const conv = get('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: '会话不存在' });
  const { content, images } = req.body || {};
  const text = String(content || '').trim();
  const imgList = Array.isArray(images) ? images.filter((i) => typeof i === 'string') : [];
  if (!text && !imgList.length) return res.status(400).json({ error: '消息内容不能为空' });
  reply(conv.id, res, text, imgList);
});

/** 核心：触发员工回复并落库 */
async function reply(convId, res, userText, images) {
  const conv = get('SELECT * FROM conversations WHERE id = ?', [convId]);
  const emp = conv.employee_id ? get('SELECT * FROM employees WHERE id = ?', [conv.employee_id]) : null;
  const imgCount = (images || []).length;
  if (userText || imgCount) {
    const content = imgCount ? `${userText ? userText + '\n' : ''}[图片附件 ×${imgCount}]` : userText;
    run('INSERT INTO messages (conversation_id, role, content) VALUES (?, \'user\', ?)', [convId, content]);
    run('UPDATE conversations SET updated_at = datetime(\'now\', \'localtime\') WHERE id = ?', [convId]);
  }

  const history = all(
    'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 20',
    [convId]
  ).reverse();

  // 会话标题自动取首条用户消息
  if (!userText && conv.title === '新对话' || conv.title.startsWith('与')) {
    run('UPDATE conversations SET title = ? WHERE id = ?',
      [String(userText || (imgCount ? '图片对话' : '新对话')).slice(0, 30), convId]);
  }

  /** 落库并返回员工回复 */
  const finish = (content, model, mock) => {
    run('INSERT INTO messages (conversation_id, role, content) VALUES (?, \'employee\', ?)', [convId, content]);
    run('UPDATE conversations SET updated_at = datetime(\'now\', \'localtime\') WHERE id = ?', [convId]);
    if (emp) {
      run('UPDATE employees SET last_active_at = datetime(\'now\', \'localtime\'), workload = workload + 1 WHERE id = ?', [emp.id]);
    }
    const msg = get('SELECT * FROM messages ORDER BY id DESC LIMIT 1');
    res.status(201).json({ message: msg, model, mock });
  };

  let result;
  try {
    result = await generate({
      employee: emp || undefined,
      userText,
      images,
      history: history.map((m) => ({ role: m.role, content: m.content })),
    });
  } catch (err) {
    // 无 Key 降级模拟回复，保证对话可用
    if (String(err.message).includes('NO_API_KEY')) {
      const mock = await generate({ employee: emp || undefined, userText, forceMock: true });
      return finish(mock.content, mock.model, true);
    }
    log('error', `对话回复失败: ${err.message}`, { employeeId: emp?.id });
    res.status(500).json({ error: String(err.message || err).slice(0, 300) });
    return;
  }
  finish(result.content, result.model, result.mock);
}

module.exports = router;
