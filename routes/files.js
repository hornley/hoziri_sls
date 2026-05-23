const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const db = require('../data/database');
const { buildMetadata, generateThumbnail } = require('../utils/fileHelpers');
const { initSSE, broadcast } = require('../utils/realtime');

const router = express.Router();
let uploadDir = 'uploads';
let thumbDir = '';
const THUMBNAILS_ENABLED = false;

function setUploadDir(dir) {
  uploadDir = dir;
  thumbDir = path.join(dir, '.thumbnails');
}

function recordToResponse(record) {
  const sizeFormatted = record.size >= 1073741824
    ? (record.size / 1073741824).toFixed(1) + ' GB'
    : record.size >= 1048576
      ? (record.size / 1048576).toFixed(1) + ' MB'
      : record.size >= 1024
        ? (record.size / 1024).toFixed(1) + ' KB'
        : record.size + ' B';

  const folderPath = record.folderPath || '';
  const urlPath = folderPath ? '/uploads/' + folderPath + '/' : '/uploads/';

  return {
    id: record.id,
    originalName: record.originalName,
    storedName: record.storedName,
    folderPath,
    size: record.size,
    sizeFormatted,
    mimeType: record.mimeType,
    extension: record.extension,
    isImage: record.isImage === 1,
    url: urlPath + record.storedName,
    thumbnailUrl: undefined,
    deviceInfo: record.deviceInfo,
    uploadedAt: record.uploadedAt,
  };
}

function recordToTrashResponse(record) {
  const sizeFormatted = record.size >= 1073741824
    ? (record.size / 1073741824).toFixed(1) + ' GB'
    : record.size >= 1048576
      ? (record.size / 1048576).toFixed(1) + ' MB'
      : record.size >= 1024
        ? (record.size / 1024).toFixed(1) + ' KB'
        : record.size + ' B';
  const folderPath = record.folderPath || '';
  return {
    id: record.id,
    originalName: record.originalName,
    storedName: record.storedName,
    size: record.size,
    sizeFormatted,
    mimeType: record.mimeType,
    extension: record.extension,
    isImage: record.isImage === 1,
    folderPath,
    deviceInfo: record.deviceInfo,
    deletedAt: record.deletedAt,
    url: '/uploads/_trash/' + record.storedName,
  };
}

function getNetworkIP() {
  const interfaces = os.networkInterfaces();
  let fallback = null;
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const addr = iface.address;
      if (/VMware|VirtualBox|Radmin|VPN|vEthernet|Hyper-V|docker/i.test(name)) {
        if (!fallback) fallback = addr;
        continue;
      }
      if (addr.startsWith('192.168.') || addr.startsWith('10.') ||
          (addr.startsWith('172.') && parseInt(addr.split('.')[1]) >= 16 && parseInt(addr.split('.')[1]) <= 31)) {
        return addr;
      }
      if (!fallback) fallback = addr;
    }
  }
  return fallback;
}

function getFilePath(record) {
  const fp = record.folderPath || '';
  return fp ? path.resolve(uploadDir, fp, record.storedName) : path.resolve(uploadDir, record.storedName);
}

router.get('/config', (req, res) => {
  res.json({ copyLinkEnabled: process.env.COPY_LINK_ENABLED === 'true' });
});

router.get('/config/settings', (req, res) => {
  res.json(db.getAllConfig());
});

router.put('/config/settings', (req, res) => {
  const { trashDays } = req.body;
  if (trashDays !== undefined) {
    const n = parseInt(trashDays, 10);
    if (isNaN(n) || n < 1) return res.status(400).json({ error: 'trashDays must be a positive number' });
    db.setConfig('trashDays', String(n));
    const expired = db.deleteTrashOlderThan(n);
    return res.json({ trashDays: n, cleaned: expired.length });
  }
  res.json({ error: 'No valid settings provided' });
});

router.get('/network-info', (req, res) => {
  res.json({ ip: getNetworkIP() });
});

router.get('/files', (req, res) => {
  const { page, limit, search, sort, device, folder } = req.query;
  const result = db.getFilesFiltered({ page, limit, search, sort, device, folder });
  result.files = result.files.map(recordToResponse);
  res.json(result);
});

router.get('/files/folders', (req, res) => {
  res.json({ folders: db.getAllFolders() });
});

router.get('/files/devices', (req, res) => {
  res.json({ devices: db.getAllDevices() });
});

router.post('/upload', async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const deviceInfo = req.headers['x-device-info'] || 'unknown';
  const storedName = req.file.filename;
  const folderPath = req.body.folderPath || '';
  const urlPath = folderPath ? '/uploads/' + folderPath + '/' : '/uploads/';

  const meta = buildMetadata(req.file, deviceInfo, storedName, urlPath);

  const record = {
    id: crypto.randomUUID(),
    originalName: meta.originalName,
    storedName: meta.storedName,
    size: meta.size,
    mimeType: meta.mimeType,
    extension: meta.extension,
    isImage: meta.isImage ? 1 : 0,
    deviceInfo: meta.deviceInfo,
    folderPath,
    uploadedAt: new Date().toISOString(),
  };

  db.insertFile(record);

  if (THUMBNAILS_ENABLED && meta.isImage && meta.size > 10240 && thumbDir) {
    const filePath = folderPath
      ? path.resolve(uploadDir, folderPath, storedName)
      : path.resolve(uploadDir, storedName);
    generateThumbnail(filePath, thumbDir).catch(err => console.error('Thumbnail error:', err));
  }

  broadcast('files', { action: 'upload', storedName: record.storedName });

  res.status(201).json(recordToResponse(record));
});

router.post('/files/download', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids must be a non-empty array' });

  const archiver = require('archiver');
  const archive = archiver('zip', { zlib: { level: 5 } });

  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500).json({ error: 'Zip failed' });
    else res.end();
  });
  res.attachment('files.zip');
  archive.pipe(res);

  for (const storedName of ids) {
    const record = db.getFileByStoredName(storedName);
    if (!record) continue;
    const filePath = getFilePath(record);
    if (!fs.existsSync(filePath)) continue;
    archive.file(filePath, { name: record.originalName });
  }

  await archive.finalize();
});

router.post('/files/batch-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids must be a non-empty array' });
  const deleted = [], notFound = [];
  for (const storedName of ids) {
    const record = db.getFileByStoredName(storedName);
    if (!record) { notFound.push(storedName); continue; }
    const filePath = getFilePath(record);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.deleteFileByStoredName(storedName);
    deleted.push(storedName);
  }
  res.json({ deleted, notFound });
  if (deleted.length > 0) broadcast('files', { action: 'batch' });
});

// Batch soft-delete (move to trash)
router.post('/files/batch-trash', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids must be a non-empty array' });
  const moved = [], notFound = [];
  const trashDir = path.join(uploadDir, '_trash');
  if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
  for (const storedName of ids) {
    const record = db.getFileByStoredName(storedName);
    if (!record) { notFound.push(storedName); continue; }
    const filePath = getFilePath(record);
    const trashFilePath = path.join(trashDir, storedName);
    try {
      if (fs.existsSync(filePath)) fs.renameSync(filePath, trashFilePath);
    } catch {}
    const trashRecord = {
      id: record.id,
      originalName: record.originalName,
      storedName: record.storedName,
      size: record.size,
      mimeType: record.mimeType,
      extension: record.extension,
      isImage: record.isImage,
      deviceInfo: record.deviceInfo,
      folderPath: record.folderPath || '',
      deletedAt: new Date().toISOString(),
    };
    db.deleteFileByStoredName(storedName);
    db.insertTrash(trashRecord);
    moved.push(storedName);
  }
  res.json({ moved, notFound });
  if (moved.length > 0) broadcast('files', { action: 'batch' });
  if (moved.length > 0) broadcast('trash', { action: 'batch' });
});

router.get('/files/:id', (req, res) => {
  const record = db.getFileByStoredName(req.params.id);
  if (!record) return res.status(404).json({ error: 'File not found' });
  const filePath = getFilePath(record);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
  res.download(filePath, record.originalName);
});

router.delete('/files/:id', (req, res) => {
  const record = db.getFileByStoredName(req.params.id);
  if (!record) return res.status(404).json({ error: 'File not found' });

  const filePath = getFilePath(record);
  const trashRecord = {
    id: record.id,
    originalName: record.originalName,
    storedName: record.storedName,
    size: record.size,
    mimeType: record.mimeType,
    extension: record.extension,
    isImage: record.isImage,
    deviceInfo: record.deviceInfo,
    folderPath: record.folderPath || '',
    deletedAt: new Date().toISOString(),
  };

  const trashDir = path.join(uploadDir, '_trash');
  if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
  const trashFilePath = path.join(trashDir, record.storedName);
  try {
    if (fs.existsSync(filePath)) fs.renameSync(filePath, trashFilePath);
  } catch {}

  db.deleteFileByStoredName(record.storedName);
  db.insertTrash(trashRecord);
  res.json({ success: true, movedToTrash: true });
  broadcast('files', { action: 'delete', storedName: record.storedName });
  broadcast('trash', { action: 'move', storedName: record.storedName });
});

router.put('/files/:id/rename', (req, res) => {
  const record = db.getFileByStoredName(req.params.id);
  if (!record) return res.status(404).json({ error: 'File not found' });
  let { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  name = path.basename(name.trim());
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (name.length > 255) return res.status(400).json({ error: 'Name too long' });
  db.renameFile(record.storedName, name);
  record.originalName = name;
  res.json(recordToResponse(record));
  broadcast('files', { action: 'rename', storedName: record.storedName });
});

router.put('/folders/rename', (req, res) => {
  const { oldPath, name } = req.body;
  if (!oldPath || !name) return res.status(400).json({ error: 'oldPath and name are required' });
  const newName = name.trim().replace(/[/\\]/g, '');
  if (!newName) return res.status(400).json({ error: 'Invalid folder name' });
  if (newName === '.' || newName === '..') return res.status(400).json({ error: 'Invalid folder name' });
  const parentDir = path.posix.dirname(oldPath.replace(/\\/g, '/'));
  const newPath = parentDir === '.' ? newName : parentDir + '/' + newName;
  const oldDir = path.join(uploadDir, oldPath);
  const newDir = path.join(uploadDir, newPath);
  if (!fs.existsSync(oldDir)) return res.status(404).json({ error: 'Folder not found' });
  if (fs.existsSync(newDir)) return res.status(409).json({ error: 'Target folder already exists' });
  try {
    fs.renameSync(oldDir, newDir);
  } catch {
    return res.status(500).json({ error: 'Failed to rename folder' });
  }
  db.renameFolder(oldPath.replace(/\\/g, '/'), newPath);
  res.json({ success: true, oldPath: oldPath.replace(/\\/g, '/'), newPath });
  broadcast('files', { action: 'batch' });
});

router.post('/folders', (req, res) => {
  let { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Name is required' });
  name = name.trim().replace(/[/\\]/g, '');
  if (!name) return res.status(400).json({ error: 'Invalid folder name' });
  if (name === '.' || name === '..') return res.status(400).json({ error: 'Invalid folder name' });
  if (name.length > 255) return res.status(400).json({ error: 'Name too long' });
  const folderPath = name;
  const dir = path.join(uploadDir, folderPath);
  if (fs.existsSync(dir)) return res.status(409).json({ error: 'Folder already exists' });
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return res.status(500).json({ error: 'Failed to create folder' });
  }
  db.createFolder(name, folderPath);
  res.json({ success: true, folderPath });
  broadcast('files', { action: 'batch' });
});

// ── Trash endpoints ──
router.get('/trash', (req, res) => {
  const items = db.getAllTrash();
  res.json(items.map(recordToTrashResponse));
});

router.post('/trash/:id/restore', (req, res) => {
  const trashRecord = db.getTrashByStoredName(req.params.id);
  if (!trashRecord) return res.status(404).json({ error: 'Not found in trash' });

  const trashDir = path.join(uploadDir, '_trash');
  const trashFilePath = path.join(trashDir, trashRecord.storedName);
  const destPath = getFilePath(trashRecord);
  if (fs.existsSync(trashFilePath)) {
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.renameSync(trashFilePath, destPath);
  }

  const record = {
    id: trashRecord.id,
    originalName: trashRecord.originalName,
    storedName: trashRecord.storedName,
    size: trashRecord.size,
    mimeType: trashRecord.mimeType,
    extension: trashRecord.extension,
    isImage: trashRecord.isImage,
    deviceInfo: trashRecord.deviceInfo,
    folderPath: trashRecord.folderPath || '',
    uploadedAt: trashRecord.deletedAt,
  };
  db.insertFile(record);
  db.deleteTrashByStoredName(trashRecord.storedName);
  res.json({ success: true });
  broadcast('trash', { action: 'delete', storedName: trashRecord.storedName });
  broadcast('files', { action: 'upload', storedName: record.storedName });
});

router.delete('/trash/:id', (req, res) => {
  const trashRecord = db.getTrashByStoredName(req.params.id);
  if (!trashRecord) return res.status(404).json({ error: 'Not found in trash' });
  const trashDir = path.join(uploadDir, '_trash');
  const trashFilePath = path.join(trashDir, trashRecord.storedName);
  if (fs.existsSync(trashFilePath)) fs.unlinkSync(trashFilePath);
  const thumbPath = thumbDir ? path.join(thumbDir, trashRecord.storedName) : null;
  if (thumbPath && fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  db.deleteTrashByStoredName(trashRecord.storedName);
  res.json({ success: true });
  broadcast('trash', { action: 'delete', storedName: trashRecord.storedName });
});

router.delete('/trash', (req, res) => {
  const items = db.getAllTrash();
  const trashDir = path.join(uploadDir, '_trash');
  for (const item of items) {
    const trashFilePath = path.join(trashDir, item.storedName);
    if (fs.existsSync(trashFilePath)) fs.unlinkSync(trashFilePath);
    const thumbPath = thumbDir ? path.join(thumbDir, item.storedName) : null;
    if (thumbPath && fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  }
  db.deleteAllTrash();
  res.json({ success: true, deleted: items.length });
  if (items.length > 0) broadcast('trash', { action: 'batch' });
});

module.exports = { router, setUploadDir };
router.get('/stream', (req, res) => {
  initSSE(req, res);
});
