/**
 * LLM 大脑层 — OpenAI 兼容协议，面向国产模型
 *
 * 支持模型（可在「设置」页切换，环境变量兜底）：
 *   - DeepSeek   默认   deepseek-chat / deepseek-reasoner   https://api.deepseek.com
 *   - 通义千问 Qwen          qwen-plus / qwen-max            https://dashscope.aliyuncs.com/compatible-mode
 *   - Kimi 月之暗面          kimi-k2-0711-preview            https://api.moonshot.cn
 *   - 智谱 GLM               glm-4-plus                      https://open.bigmodel.cn/api/paas
 *   - 任意 OpenAI 兼容端点（自定义 baseUrl + model）
 *
 * 配置优先级：设置表(运行时) > 环境变量 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
 * 未配置 Key 时自动降级为模拟模式（mock），保证系统全流程可演示。
 */
const { get } = require('./db');

const DEFAULT_MODEL = 'deepseek-chat';

// 常用国产模型快捷配置（baseUrl 均为 OpenAI 兼容格式）
const PROVIDERS = {
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'] },
  qwen: { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', models: ['qwen-plus', 'qwen-max', 'qwen-turbo'] },
  kimi: { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', models: ['kimi-k2-0711-preview', 'moonshot-v1-8k'] },
  glm: { name: '智谱GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4-flash'] },
  custom: { name: '自定义', baseUrl: '', models: [] },
};

function getConfig() {
  const row = (k) => get('SELECT value FROM settings WHERE key = ?', [k]);
  const apiKey = process.env.LLM_API_KEY || row('llm_api_key')?.value || '';
  const baseUrl = process.env.LLM_BASE_URL || row('llm_base_url')?.value || PROVIDERS.deepseek.baseUrl;
  const model = process.env.LLM_MODEL || row('llm_model')?.value || DEFAULT_MODEL;
  return { apiKey, baseUrl, model };
}

/** 员工上的 model 字段：'auto' → 全局默认；'mock' → 强制模拟；其他 → 视为具体模型名 */
function resolveModel(requested, globalModel) {
  if (requested === 'mock') return 'mock';
  if (requested && requested !== 'auto') return requested;
  return globalModel;
}

/**
 * 调用 LLM（OpenAI 兼容，支持多模态）
 * content 可为字符串，或数组 [{type:'text',text},{type:'image_url',image_url:{url:'data:…'}}]
 */
async function callLLM({ model, system, messages, maxTokens = 3000, temperature = 0.7 }) {
  const { apiKey, baseUrl } = getConfig();
  if (!apiKey) throw new Error('NO_API_KEY');

  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages) msgs.push({ role: m.role, content: m.content });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);

  try {
    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: msgs, max_tokens: maxTokens, temperature }),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`LLM API ${resp.status}: ${text.slice(0, 300)}`);
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return { content, model: data.model || model, mock: false };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- 模拟模式：无 Key 时的规则引擎 ---------------- */

function mockReply(userText, role) {
  const t = userText || '';
  const name = role || '数字员工';
  const lines = [];

  if (/报告|汇总|总结/.test(t)) {
    lines.push('【工作简报】');
    lines.push(`根据您提供的需求，我已整理出${t.includes('报告') ? '完整报告框架' : '内容摘要'}，要点如下：`);
    lines.push('1. 目标拆解：将任务按优先级划分为核心目标与支撑项；');
    lines.push('2. 数据要点：已提取关键信息并完成归类，建议关注其中的量化指标；');
    lines.push('3. 风险提示：执行过程中需留意时效性，建议设置检查节点。');
    lines.push('如您需要，我可以进一步生成 Markdown 格式的正式文稿。');
  } else if (/翻译/.test(t)) {
    lines.push('【翻译服务】');
    lines.push('我已收到待翻译内容。当前处于模拟模式（未配置 API Key），无法调用大模型进行高质量翻译。');
    lines.push('提示：在「设置」页填入模型 API Key 后，我即可提供专业的双语互译服务。');
  } else if (/数据|报表|统计|分析/.test(t)) {
    lines.push('【数据分析】');
    lines.push('已对输入数据完成初检：');
    lines.push('• 记录数/字段数已核对，未发现缺项异常；');
    lines.push('• 建议输出：按时间维度汇总 + 关键指标环比；');
    lines.push('• 下一步：可接入真实数据源后自动生成可视化报表。');
  } else if (/邮件/.test(t)) {
    lines.push('【邮件草稿】');
    lines.push('邮件草稿已生成：主题、称呼、正文要点、结尾落款均已就绪。');
    lines.push('（模拟模式生成，配置 API Key 后可输出完整正式邮件。）');
  } else if (/你好|您好|hello|hi/.test(t)) {
    lines.push(`您好！我是${name}，随时为您服务。`);
    lines.push('我可以帮您：撰写报告、整理数据、翻译内容、起草邮件、执行定时任务等。');
    lines.push('您可以直接告诉我需求，或者到「任务中心」给我派活。');
  } else if (/天气|时间|几点了/.test(t)) {
    lines.push('【工具信息】');
    lines.push(`当前系统时间：${new Date().toLocaleString('zh-CN')}`);
  } else {
    lines.push(`收到您的需求：「${t.slice(0, 60)}」`);
    lines.push('我已理解任务方向。当前处于**模拟模式**（未配置 API Key），回复由内置规则引擎生成。');
    lines.push('建议在「设置」页配置模型 API Key（如 DeepSeek / 通义千问），我将调用大模型提供更智能的服务。');
  }

  return `（模拟模式 · ${name}）\n\n${lines.join('\n')}`;
}

/**
 * 生成回复（对话 / 任务 / 节点 统一入口）
 * @param {object} opts
 *   employee   员工（人设）
 *   userText   对话文本
 *   history    对话历史 [{role, content}]
 *   prompt     任务指令（单轮）
 *   images     [dataUri] 图片数组（多模态，拼入当前输入）
 *   model      模型覆盖（节点级配置，优先级最高）
 *   forceMock  强制模拟
 *   maxTokens  上限
 * @returns {Promise<{content:string, model:string, mock:boolean}>}
 */
async function generate(opts) {
  const { employee, userText, history, prompt, images, maxTokens, forceMock, model: modelOverride } = opts;
  const globalModel = getConfig().model;
  const model = modelOverride && modelOverride !== 'auto'
    ? (modelOverride === 'mock' ? 'mock' : modelOverride)
    : resolveModel(employee?.model || 'auto', globalModel);

  if (forceMock || model === 'mock') {
    return {
      content: mockReply(userText || prompt || '', employee?.role),
      model: 'mock',
      mock: true,
    };
  }

  const system = employee?.system_prompt
    ? `你是数字员工「${employee.name}」（${employee.role}）。\n${employee.system_prompt}\n要求：使用简体中文回复，条理清晰，可直接执行。`
    : '你是企业数字员工助手。使用简体中文回复，条理清晰，可直接执行。';

  // 多模态：把图片拼进最后一条用户消息
  const withImages = (text) => {
    if (!images || !images.length) return text;
    return [
      { type: 'text', text },
      ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
    ];
  };

  if (prompt) {
    // 任务/节点模式：单轮完成指令
    return callLLM({ model, system, messages: [{ role: 'user', content: withImages(prompt) }], maxTokens: maxTokens || 3000 });
  }

  // 对话模式：携带历史
  const messages = [...(history || []), { role: 'user', content: withImages(userText) }];
  return callLLM({ model, system, messages, maxTokens: maxTokens || 1500 });
}

module.exports = { generate, callLLM, resolveModel, getConfig, PROVIDERS, DEFAULT_MODEL };
