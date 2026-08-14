/**
 * 任务执行引擎 — 数字员工的大脑中枢（v3：节点编排 + 多模态）
 *
 * 执行流：pending → running(进度推进) → completed | failed | cancelled
 *
 * 单节点任务（nodes 为空）：技能匹配 → 真实工具执行 / 大模型生成 → 成果落盘
 * 多节点任务（nodes 非空）：按顺序执行节点链，每节点可独立配置 技能 + 模型
 *   - 节点输入 = 任务描述 + 节点指令 + 上一节点输出（上下文传递）
 *   - 工具类节点真实执行（files/web/notify/vision/doc…），文案类节点走大模型
 *   - 各节点产出文件全部归档，任务输出为节点结果汇总
 */
const { get, run, log } = require('../db');
const { generate } = require('../llm');
const { skills, matchSkill } = require('../skills');
const { saveArtifact } = require('../artifacts');
const { resolve, toDataUri } = require('../attachments');
const fs = require('node:fs');

const CONCURRENCY = 4;
let running = 0;
const queue = [];

function enqueue(taskId) {
  queue.push(taskId);
  pump();
}

function pump() {
  while (running < CONCURRENCY && queue.length > 0) {
    const taskId = queue.shift();
    running++;
    runTask(taskId)
      .catch((err) => {
        log('error', `任务 #${taskId} 执行器异常: ${err.message}`, { taskId });
        try {
          run('UPDATE tasks SET status = ?, error = ?, finished_at = datetime(\'now\', \'localtime\') WHERE id = ?',
            ['failed', String(err.message || err).slice(0, 500), taskId]);
        } catch {}
      })
      .finally(() => { running--; pump(); });
  }
}

function buildInput(task) {
  let input = task.description || '';
  try {
    const extra = JSON.parse(task.input || '{}');
    if (extra.content) input = `${input}\n${extra.content}`;
    if (extra.params && typeof extra.params === 'object') {
      const { files: _f, ...rest } = extra.params;
      if (Object.keys(rest).length) input = `${input}\n参数：${JSON.stringify(rest)}`;
    }
  } catch {}
  return input;
}

/** 解析任务附件为可执行文件列表 */
function resolveAttachments(task) {
  try {
    const params = JSON.parse(task.input || '{}').params || {};
    const files = params.files || [];
    const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
    return files
      .map((f) => {
        const r = resolve(f.stored || '');
        if (!r) return null;
        return { ...r, name: f.name || f.stored, stored: f.stored, size: fs.statSync(r.absPath).size, type: IMAGE_MIME[r.ext] ? 'image' : 'doc' };
      })
      .filter(Boolean);
  } catch { return []; }
}

function saveFiles(task, files, prefix) {
  const meta = (files || []).map((f) => saveArtifact({ taskId: task.id, title: `${prefix}${f.title}`, content: f.content, type: f.type })).filter(Boolean);
  return meta;
}

function linkText(meta) {
  return meta.length ? `\n\n📎 成果文件：${meta.map((f) => `[${f.name}](${f.download})`).join('、')}` : '';
}

async function runTask(taskId) {
  const task = get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task || task.status !== 'pending') return;

  const emp = task.employee_id ? get('SELECT * FROM employees WHERE id = ?', [task.employee_id]) : null;
  if (task.employee_id && (!emp || emp.status === 'offline')) {
    fail(taskId, '该员工已离线/被停用，无法执行任务', task);
    return;
  }

  run('UPDATE tasks SET status = \'running\', started_at = datetime(\'now\', \'localtime\'), progress = 3 WHERE id = ?', [taskId]);
  log('info', `开始执行任务「${task.title}」${emp ? `（执行人：${emp.name}）` : ''}`, { taskId, employeeId: task.employee_id });
  if (emp) run('UPDATE employees SET last_active_at = datetime(\'now\', \'localtime\') WHERE id = ?', [emp.id]);

  let nodes = [];
  try { nodes = JSON.parse(task.nodes || '[]'); } catch {}

  try {
    if (nodes.length > 0) {
      await runNodeChain(task, emp, nodes);
    } else {
      await runSingle(task, emp);
    }

    if (emp) run('UPDATE employees SET workload = workload + 1, last_active_at = datetime(\'now\', \'localtime\') WHERE id = ?', [emp.id]);
    log('success', `任务「${task.title}」完成 ✓`, { taskId, employeeId: task.employee_id });

    // 产出同步为员工对话汇报
    try {
      const finalTask = get('SELECT * FROM tasks WHERE id = ?', [taskId]);
      const conv = get('SELECT id FROM conversations WHERE employee_id = ? ORDER BY updated_at DESC LIMIT 1', [task.employee_id]);
      if (conv && finalTask) {
        run('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
          [conv.id, 'employee', `📋 **任务汇报**：「${finalTask.title}」\n\n${(finalTask.output || '').slice(0, 2000)}`]);
      }
    } catch {}
  } catch (err) {
    fail(taskId, err.message, task);
  }
}

/* ================= 单节点（原有流程） ================= */

async function runSingle(task, emp) {
  const taskId = task.id;
  let skill = pickSkill(task);
  log('info', skill ? `匹配技能：${skill.name}（${skill.icon}）${skill.run ? ' · 真实工具执行' : ''}` : '未匹配到专用技能，采用通用执行模式', { taskId, employeeId: task.employee_id });

  const input = buildInput(task);
  const attachments = resolveAttachments(task);
  run('UPDATE tasks SET progress = 35 WHERE id = ?', [taskId]);

  let output;
  const files = [];
  if (skill?.run) {
    const r = await skill.run({ input, taskId, files: attachments });
    output = r.text;
    if (Array.isArray(r.files)) files.push(...r.files);
  } else {
    const prompt = skill ? skill.buildPrompt(input) : input;
    try {
      const result = await generate({ employee: emp || undefined, prompt, images: attachments.filter((a) => a.type === 'image').map((a) => toDataUri(a.absPath, a.mime)), maxTokens: 3000 });
      output = result.content;
      log('success', `大模型（${result.model}）生成完成，${result.mock ? '（模拟模式）' : ''}`, { taskId, employeeId: task.employee_id });
    } catch (err) {
      if (String(err.message).includes('NO_API_KEY')) {
        output = skill ? skill.mockOutput(input) : mockGeneric(input);
        log('warn', '未配置 API Key，已降级为规则引擎完成本次任务', { taskId, employeeId: task.employee_id });
      } else {
        throw err;
      }
    }
    files.push({ title: task.title, content: output, type: 'md' });
  }

  run('UPDATE tasks SET progress = 75 WHERE id = ?', [taskId]);
  const meta = saveFiles(task, files, '');
  if (meta.length) log('success', `成果已归档 ${meta.length} 份：${meta.map((m) => m.name).join('、')}`, { taskId, employeeId: task.employee_id });

  const finalText = output + linkText(meta);
  run('UPDATE tasks SET status = \'completed\', output = ?, progress = 100, finished_at = datetime(\'now\', \'localtime\') WHERE id = ?', [finalText, taskId]);
}

/* ================= 多节点编排 ================= */

function pickSkill(task, nodeSkill) {
  if (nodeSkill && skills[nodeSkill]) return skills[nodeSkill];
  return matchSkill(task.title + ' ' + task.description);
}

async function runNodeChain(task, emp, nodes) {
  const taskId = task.id;
  const attachments = resolveAttachments(task);
  const baseInput = buildInput(task);
  const nodeResults = [];
  let allFiles = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const progress = 8 + Math.round(((i + 1) / nodes.length) * 85);
    run('UPDATE tasks SET progress = ? WHERE id = ?', [Math.min(progress, 96), taskId]);

    // 1. 组装节点输入：任务描述 + 节点指令 + 上一节点输出（{prev} 占位符）
    const prevOutput = nodeResults.length ? nodeResults[nodeResults.length - 1].output : '';
    let nodePrompt = (node.prompt || node.description || '').trim() || `执行「${node.name}」节点的工作`;
    if (nodePrompt.includes('{prev}')) {
      nodePrompt = nodePrompt.replace(/\{prev\}/g, prevOutput || '（无上一节点输出）');
    } else if (prevOutput && /前(一|置|序)|上一(节点|步|流程)|上一步/.test(nodePrompt)) {
      nodePrompt += `\n\n【上一节点输出】\n${prevOutput.slice(0, 3000)}`;
    }
    const input = `${baseInput}\n${nodePrompt}`.trim();

    // 2. 选择技能（节点指定 or 自动匹配）
    const skill = node.skill && skills[node.skill] ? skills[node.skill] : matchSkill(input);
    const modelTag = node.model && node.model !== 'auto' ? node.model : '跟随全局';
    log('info', `▶ 节点 ${i + 1}/${nodes.length}「${node.name}」｜${skill ? `${skill.icon} ${skill.name}` : '通用执行'}｜模型：${modelTag}`, { taskId, employeeId: task.employee_id });

    let output;
    const nodeFiles = [];
    try {
      if (skill?.run) {
        const r = await skill.run({ input, taskId, files: attachments, nodeIndex: i });
        output = r.text;
        if (Array.isArray(r.files)) nodeFiles.push(...r.files);
      } else {
        const prompt = skill ? skill.buildPrompt(input) : input;
        const result = await generate({ employee: emp || undefined, prompt, model: node.model, maxTokens: 3000 });
        output = result.content;
        log('info', `节点 ${i + 1} 由模型「${result.model}」完成${result.mock ? '（模拟）' : ''}`, { taskId, employeeId: task.employee_id });
        nodeFiles.push({ title: `节点${i + 1}-${node.name}`, content: output, type: 'md' });
      }
    } catch (err) {
      if (String(err.message).includes('NO_API_KEY') && !skill?.run) {
        output = skill ? skill.mockOutput(input) : mockGeneric(input);
        nodeFiles.push({ title: `节点${i + 1}-${node.name}`, content: output, type: 'md' });
        log('warn', `节点 ${i + 1} 无 Key 降级规则引擎`, { taskId, employeeId: task.employee_id });
      } else {
        throw new Error(`节点「${node.name}」执行失败：${err.message}`);
      }
    }

    // 3. 节点产出落盘
    const meta = saveFiles(task, nodeFiles, `节点${i + 1}-`);
    allFiles = allFiles.concat(meta);
    nodeResults.push({
      name: node.name,
      skill: skill ? skill.id : null,
      model: node.model || 'auto',
      output: output.slice(0, 5000),
      files: meta.map((m) => m.name),
    });
    log('success', `节点 ${i + 1}「${node.name}」完成${meta.length ? `，产出 ${meta.length} 份成果` : ''}`, { taskId, employeeId: task.employee_id });
  }

  // 4. 汇总输出
  const summary = nodeResults.map((n, i) =>
    `## 节点 ${i + 1}：${n.name}\n${n.files.length ? `📎 产出：${n.files.join('、')}\n\n` : ''}${n.output}`
  ).join('\n\n---\n\n');
  const finalText = `# 任务「${task.title}」执行汇总\n\n${summary}` + linkText(allFiles);

  run('UPDATE tasks SET status = \'completed\', output = ?, progress = 100, node_results = ?, finished_at = datetime(\'now\', \'localtime\') WHERE id = ?',
    [finalText, JSON.stringify(nodeResults), taskId]);
}

function fail(taskId, message, task) {
  log('error', `任务 #${taskId} 执行失败: ${message}`, { taskId, employeeId: task?.employee_id });
  run('UPDATE tasks SET status = \'failed\', error = ?, finished_at = datetime(\'now\', \'localtime\') WHERE id = ?', [String(message).slice(0, 500), taskId]);
}

function mockGeneric(input) {
  return `【执行结果 · 模拟模式】\n\n任务内容：${(input || '').slice(0, 200)}\n\n（未配置 API Key，由规则引擎代执行。配置模型 Key 后可获得完整智能输出。）`;
}

module.exports = { enqueue, runTask };
