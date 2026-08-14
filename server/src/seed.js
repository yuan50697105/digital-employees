/**
 * 种子数据（v2）
 *  - ensureAssets(): 幂等准备输入素材样例（真实文件，files 技能开箱即用）
 *  - seed(): 空库时预置 4 名数字员工 + 示例任务 + 定时调度
 */
const fs = require('node:fs');
const path = require('node:path');
const { db, get, run, log, DATA_DIR } = require('./db');
const { INPUTS_DIR } = require('./artifacts');
const { enqueue } = require('./engine/runner');

const EMPLOYEES = [
  {
    name: '小文', role: '文案策划', avatar: '✍️', status: 'active',
    system_prompt: '你是资深文案策划，擅长撰写工作报告、日报周报、项目总结与会议纪要。文风专业精炼，结构清晰，注重数据支撑与行动建议。',
    skills: ['report', 'summarize', 'email'],
  },
  {
    name: '小析', role: '数据分析师', avatar: '📊', status: 'active',
    system_prompt: '你是数据分析师，擅长把散乱的数据整理成结构化表格、生成统计结论与可视化建议。输出规范、可读性强，给出明确洞察与建议。',
    skills: ['data', 'files'],
  },
  {
    name: '小译', role: '翻译专员', avatar: '🌐', status: 'active',
    system_prompt: '你是专业翻译，擅长中英互译与多语言转换。译文自然流畅、忠实原意，注意术语准确性与语境得体。',
    skills: ['translate'],
  },
  {
    name: '小安', role: '值班巡检员', avatar: '🛡️', status: 'active',
    system_prompt: '你是 7×24 值班巡检员，负责定时巡检、生成值班日志与运行报告。输出规范的值班日志，包含时间、检查项、状态与结论。',
    skills: ['duty', 'files', 'notify'],
  },
];

/** 输入素材样例（真实文件，供数字员工读取加工） */
function ensureAssets() {
  const samples = {
    '客户反馈汇总.txt': `客户反馈汇总（2026年8月第一周）
1. 希望增加批量导出功能，目前只能单条导出
2. 首页加载速度偏慢，首屏约 3 秒
3. 希望能支持深色模式，夜间使用太刺眼
4. 订阅价格偏高，建议增加家庭套餐
5. 客服响应及时，问题解决率高，点赞
6. 移动端表格操作不方便，建议优化手势
7. 希望增加数据对比功能，看趋势变化
8. 文档教程很详细，帮助很大
9. 部分地区访问不稳定，希望增加节点
10. 积分商城商品太少，建议丰富品类`,
    '销售数据.csv': `月份,销售额(万),订单数,退款率
1月,86.5,1240,2.1%
2月,72.3,1080,1.8%
3月,91.2,1310,2.4%
4月,105.6,1560,2.0%
5月,98.4,1430,1.9%
6月,112.8,1680,2.3%
7月,124.5,1820,2.2%`,
  };
  let created = 0;
  for (const [name, content] of Object.entries(samples)) {
    const p = path.join(INPUTS_DIR, name);
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, content, 'utf-8');
      created++;
    }
  }
  if (created) console.log(`  ✅ 输入素材就绪：${created} 份样例文件已放入 data/inputs/`);
}

function seed() {
  ensureAssets();

  const count = get('SELECT COUNT(*) AS n FROM employees').n;
  if (count > 0) {
    console.log(`已存在 ${count} 名员工，跳过员工初始化。`);
    return;
  }

  const insert = db.prepare(
    'INSERT INTO employees (name, role, avatar, status, system_prompt, skills) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const e of EMPLOYEES) {
    insert.run(e.name, e.role, e.avatar, e.status, e.system_prompt, JSON.stringify(e.skills));
    console.log(`  新员工入职：${e.avatar} ${e.name}（${e.role}）`);
  }

  const ids = Object.fromEntries(db.prepare('SELECT id, name FROM employees').all().map((e) => [e.name, e.id]));

  // 示例对话：与值班员小安对话
  const conv = db.prepare('INSERT INTO conversations (employee_id, title) VALUES (?, ?)');
  const convId = conv.run(ids['小安'], '值班安排').lastInsertRowid;
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, \'user\', ?)')
    .run(convId, '今天你值班，帮我留意系统状态，做个简单的巡检安排。');
  console.log('  已创建示例对话');

  // 示例任务（真实干活：文件整理 → CSV 成果）
  const t1 = run(
    `INSERT INTO tasks (employee_id, employee_name, title, description, skill, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
    [ids['小析'], '小析', '整理工作台素材', '把工作台输入目录（data/inputs/）里的文件盘点整理成清单，重点关注内容用途分类。', 'files']
  );
  enqueue(t1.lastInsertRowid);
  console.log(`  示例任务 #${t1.lastInsertRowid}：文件整理（真实执行中…）`);

  const t2 = run(
    `INSERT INTO tasks (employee_id, employee_name, title, description, skill, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
    [ids['小文'], '小文', '撰写项目周报', '请帮我撰写本周工作总结周报，重点涵盖：项目进度、问题风险、下周计划。', 'report']
  );
  enqueue(t2.lastInsertRowid);

  // 定时调度：每天 9:00 数据晨报 + 每 10 分钟值班巡检
  db.prepare('INSERT INTO schedules (employee_id, title, description, skill, cron, enabled) VALUES (?, ?, ?, ?, ?, 1)')
    .run(ids['小析'], '每日数据晨报', '每天 9:00 盘点工作台素材，生成数据晨报', 'files', '0 9 * * *');
  db.prepare('INSERT INTO schedules (employee_id, title, description, skill, cron, enabled) VALUES (?, ?, ?, ?, ?, 1)')
    .run(ids['小安'], '日常值班巡检', '每 10 分钟生成一次值班巡检日志', 'duty', '*/10 * * * *');
  console.log('  已创建定时调度：每日数据晨报 9:00 / 值班巡检每 10 分钟');

  log('success', '种子数据初始化完成：4 名数字员工 + 素材样例 + 2 个示例任务 + 2 个定时调度');
  console.log('✅ 种子初始化完成');
}

// 直接运行（node src/seed.js）时手动执行；被服务导入时由 index.js 启动时调用（幂等）
if (require.main === module) seed();

module.exports = { seed, ensureAssets };
