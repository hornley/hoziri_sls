const Database = require('better-sqlite3');
const path = require('path');

let db;

function init(dbPath) {
  const resolvedPath = path.resolve(dbPath || 'data/files.db');
  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id            TEXT PRIMARY KEY,
      originalName  TEXT NOT NULL,
      storedName    TEXT NOT NULL UNIQUE,
      size          INTEGER NOT NULL,
      mimeType      TEXT NOT NULL,
      extension     TEXT NOT NULL,
      isImage       INTEGER NOT NULL DEFAULT 0,
      deviceInfo    TEXT DEFAULT 'unknown',
      folderPath    TEXT DEFAULT '',
      uploadedAt    TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS trash (
      id            TEXT PRIMARY KEY,
      originalName  TEXT NOT NULL,
      storedName    TEXT NOT NULL,
      size          INTEGER NOT NULL,
      mimeType      TEXT NOT NULL,
      extension     TEXT NOT NULL,
      isImage       INTEGER NOT NULL DEFAULT 0,
      deviceInfo    TEXT DEFAULT 'unknown',
      folderPath    TEXT DEFAULT '',
      deletedAt     TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      folderPath  TEXT NOT NULL UNIQUE,
      createdAt   TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  let cols = db.pragma('table_info(files)').map(c => c.name);
  if (!cols.includes('folderPath')) {
    db.exec('ALTER TABLE files ADD COLUMN folderPath TEXT DEFAULT ""');
  }
  cols = db.pragma('table_info(trash)').map(c => c.name);
  if (!cols.includes('folderPath')) {
    db.exec('ALTER TABLE trash ADD COLUMN folderPath TEXT DEFAULT ""');
  }
  const existingTrashDays = getConfig('trashDays');
  if (!existingTrashDays) {
    setConfig('trashDays', process.env.TRASH_DAYS || '30');
  }
  return db;
}

function getAllFiles() {
  return db.prepare('SELECT * FROM files ORDER BY uploadedAt DESC').all();
}

function getFileByStoredName(storedName) {
  return db.prepare('SELECT * FROM files WHERE storedName = ?').get(storedName);
}

function getFileById(id) {
  return db.prepare('SELECT * FROM files WHERE id = ?').get(id);
}

function insertFile(record) {
  const stmt = db.prepare(`
    INSERT INTO files (id, originalName, storedName, size, mimeType, extension, isImage, deviceInfo, folderPath, uploadedAt)
    VALUES (@id, @originalName, @storedName, @size, @mimeType, @extension, @isImage, @deviceInfo, @folderPath, @uploadedAt)
  `);
  stmt.run(record);
}

function deleteFileByStoredName(storedName) {
  db.prepare('DELETE FROM files WHERE storedName = ?').run(storedName);
}

function deleteFilesByStoredNames(names) {
  const txn = db.transaction((names) => {
    const stmt = db.prepare('DELETE FROM files WHERE storedName = ?');
    for (const name of names) stmt.run(name);
  });
  txn(names);
}

// ── Paginated filtered query ──
function getFilesFiltered({ page = 1, limit = 50, search = '', sort = 'newest', device = '', folder = '' }) {
  page = Math.max(1, parseInt(page, 10) || 1);
  limit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const offset = (page - 1) * limit;

  const clauses = [];
  const params = [];

  if (device) {
    clauses.push('deviceInfo = ?');
    params.push(device);
  }
  if (search) {
    clauses.push('originalName LIKE ?');
    params.push('%' + search.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%');
  }
  if (folder) {
    clauses.push('folderPath = ?');
    params.push(folder);
  } else {
    clauses.push('(folderPath = ? OR folderPath IS NULL)');
    params.push('');
  }

  const where = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';

  const sortMap = {
    newest: 'ORDER BY uploadedAt DESC',
    oldest: 'ORDER BY uploadedAt ASC',
    'name-asc': 'ORDER BY originalName ASC',
    'name-desc': 'ORDER BY originalName DESC',
    smallest: 'ORDER BY size ASC',
    largest: 'ORDER BY size DESC',
  };
  const orderBy = sortMap[sort] || 'ORDER BY uploadedAt DESC';

  const countRow = db.prepare('SELECT COUNT(*) as total FROM files ' + where).get(...params);
  const total = countRow.total;

  const rows = db.prepare('SELECT * FROM files ' + where + ' ' + orderBy + ' LIMIT ? OFFSET ?').all(...params, limit, offset);

  return {
    files: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

function getAllFolders() {
  return db.prepare("SELECT DISTINCT folderPath FROM files WHERE folderPath != '' AND folderPath IS NOT NULL UNION SELECT folderPath FROM folders ORDER BY folderPath").all().map(r => r.folderPath);
}

function createFolder(name, folderPath) {
  db.prepare('INSERT INTO folders (name, folderPath) VALUES (?, ?)').run(name, folderPath);
}

function deleteFolder(folderPath) {
  db.prepare('DELETE FROM folders WHERE folderPath = ?').run(folderPath);
}

function renameFolder(oldPath, newPath) {
  const txn = db.transaction(() => {
    db.prepare('UPDATE files SET folderPath = ? WHERE folderPath = ?').run(newPath, oldPath);
    db.prepare("UPDATE files SET folderPath = ? || substr(folderPath, ?) WHERE folderPath LIKE ?").run(newPath, oldPath.length + 1, oldPath + '/%');
  });
  txn();
}

// ── Config ──
function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, String(value));
}

function getAllConfig() {
  const rows = db.prepare('SELECT key, value FROM config').all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}

// ── Trash ──
function getAllTrash() {
  return db.prepare('SELECT * FROM trash ORDER BY deletedAt DESC').all();
}

function insertTrash(record) {
  const stmt = db.prepare(`
    INSERT INTO trash (id, originalName, storedName, size, mimeType, extension, isImage, deviceInfo, folderPath, deletedAt)
    VALUES (@id, @originalName, @storedName, @size, @mimeType, @extension, @isImage, @deviceInfo, @folderPath, @deletedAt)
  `);
  stmt.run(record);
}

function getTrashByStoredName(storedName) {
  return db.prepare('SELECT * FROM trash WHERE storedName = ?').get(storedName);
}

function deleteTrashByStoredName(storedName) {
  db.prepare('DELETE FROM trash WHERE storedName = ?').run(storedName);
}

function deleteAllTrash() {
  db.prepare('DELETE FROM trash').run();
}

function deleteTrashOlderThan(days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const items = db.prepare('SELECT * FROM trash WHERE deletedAt < ?').all(cutoff);
  db.prepare('DELETE FROM trash WHERE deletedAt < ?').run(cutoff);
  return items;
}

function renameFile(storedName, newName) {
  db.prepare('UPDATE files SET originalName = ? WHERE storedName = ?').run(newName, storedName);
}

function getAllDevices() {
  return db.prepare('SELECT DISTINCT deviceInfo FROM files ORDER BY deviceInfo').all().map(r => r.deviceInfo);
}

function close() {
  if (db) db.close();
}

module.exports = { init, getAllFiles, getFilesFiltered, getFileByStoredName, getFileById, insertFile, renameFile, deleteFileByStoredName, deleteFilesByStoredNames, renameFolder, getConfig, setConfig, getAllConfig, getAllDevices, getAllFolders, createFolder, deleteFolder, getAllTrash, insertTrash, getTrashByStoredName, deleteTrashByStoredName, deleteAllTrash, deleteTrashOlderThan, close };
