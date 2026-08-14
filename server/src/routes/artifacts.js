/** 工作台 API — 成果文件管理 */
const express = require('express');
const { listArtifacts, readArtifact, deleteArtifact, listInputs } = require('../artifacts');

const router = express.Router();

// 成果列表
router.get('/', (req, res) => {
  res.json({ artifacts: listArtifacts() });
});

// 成果内容（文本预览）
router.get('/content', (req, res) => {
  const a = readArtifact(req.query.name || '');
  if (!a) return res.status(404).json({ error: '成果文件不存在' });
  res.json(a);
});

// 下载成果
router.get('/download', (req, res) => {
  const a = readArtifact(req.query.name || '');
  if (!a) return res.status(404).json({ error: '成果文件不存在' });
  res.setHeader('content-type', 'application/octet-stream');
  res.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}`);
  res.send(a.content);
});

// 删除成果
router.delete('/', (req, res) => {
  const ok = deleteArtifact(req.query.name || '');
  if (!ok) return res.status(404).json({ error: '成果文件不存在' });
  res.json({ ok: true });
});

// 输入素材列表（数字员工可读取的真实工作素材）
router.get('/inputs', (req, res) => {
  res.json({ inputs: listInputs() });
});

module.exports = router;
