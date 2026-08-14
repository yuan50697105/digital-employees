/** 附件上传 API — 多模态素材 */
const express = require('express');
const { saveUpload, list } = require('../attachments');
const { log } = require('../db');

const router = express.Router();

// 上传（base64 JSON）
router.post('/', (req, res) => {
  const { name, data } = req.body || {};
  const r = saveUpload({ name, data });
  if (r.error) return res.status(400).json({ error: r.error });
  log('info', `附件上传：${r.name}（${(r.size / 1024).toFixed(1)} KB）`);
  res.status(201).json(r);
});

// 附件列表
router.get('/', (req, res) => {
  res.json({ files: list() });
});

module.exports = router;
