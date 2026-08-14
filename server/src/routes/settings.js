/** 系统设置 API — 模型配置（国产模型） */
const express = require('express');
const { all, get, run } = require('../db');
const { PROVIDERS, getConfig } = require('../llm');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = all('SELECT key, value FROM settings');
  const kv = {};
  for (const r of rows) kv[r.key] = r.value;
  res.json({
    settings: kv,
    providers: PROVIDERS,
    effective: {
      api_key_set: !!getConfig().apiKey,
      base_url: getConfig().baseUrl,
      model: getConfig().model,
    },
  });
});

router.put('/', (req, res) => {
  const { llm_api_key, llm_base_url, llm_model, notify_webhook, notify_type } = req.body || {};
  const sets = [];
  if (llm_api_key !== undefined) { sets.push(['llm_api_key', String(llm_api_key).trim()]); }
  if (llm_base_url !== undefined) { sets.push(['llm_base_url', String(llm_base_url).trim()]); }
  if (llm_model !== undefined) { sets.push(['llm_model', String(llm_model).trim()]); }
  if (notify_webhook !== undefined) { sets.push(['notify_webhook', String(notify_webhook).trim()]); }
  if (notify_type !== undefined) { sets.push(['notify_type', String(notify_type).trim()]); }
  for (const [k, v] of sets) {
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, v]);
  }
  res.json({ ok: true, effective: { api_key_set: !!getConfig().apiKey, base_url: getConfig().baseUrl, model: getConfig().model } });
});

module.exports = router;
