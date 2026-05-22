require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('./data/database');
const uploadMiddleware = require('./middleware/upload');
const filesRoute = require('./routes/files');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const DB_PATH = process.env.DB_PATH || 'data/files.db';

const uploadsAbsolute = path.resolve(UPLOAD_DIR);
if (!fs.existsSync(uploadsAbsolute)) {
  fs.mkdirSync(uploadsAbsolute, { recursive: true });
}

const thumbDir = path.join(uploadsAbsolute, '.thumbnails');
if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

const trashDir = path.join(uploadsAbsolute, '_trash');
if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });

db.init(DB_PATH);

// Generate missing thumbnails for existing images on startup
const sharp = require('sharp');
function generateMissingThumbnails() {
  const files = db.getAllFiles();
  let count = 0;
  for (const f of files) {
    if (!f.isImage) continue;
    const thumbPath = path.join(thumbDir, f.storedName);
    if (fs.existsSync(thumbPath)) continue;
    const fp = f.folderPath ? path.join(uploadsAbsolute, f.folderPath, f.storedName) : path.join(uploadsAbsolute, f.storedName);
    if (!fs.existsSync(fp)) continue;
    sharp(fp).resize(200, 200, { fit: 'cover', withoutEnlargement: true }).toFile(thumbPath).catch(() => {});
    count++;
  }
  if (count > 0) console.log(`Generating ${count} missing thumbnail(s)...`);
}
generateMissingThumbnails();

function autoPurgeTrash() {
  const trashDays = parseInt(db.getConfig('trashDays'), 10) || 30;
  const expired = db.deleteTrashOlderThan(trashDays);
  if (expired.length > 0) {
    console.log(`Cleaned ${expired.length} expired trash item(s) (retention: ${trashDays}d)`);
  }
}
autoPurgeTrash();
setInterval(autoPurgeTrash, 24 * 60 * 60 * 1000);

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

const upload = uploadMiddleware.configure(UPLOAD_DIR);
filesRoute.setUploadDir(UPLOAD_DIR);

app.post('/api/upload', upload.single('file'));
app.use('/api', filesRoute.router);

app.use('/uploads', express.static(uploadsAbsolute));
app.use(express.static(path.resolve('public')));

app.use((err, req, res, next) => {
  if (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
  next();
});

function getNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

app.listen(PORT, HOST, () => {
  const ip = getNetworkIP();
  console.log(`Server running at http://${HOST}:${PORT}`);
  if (ip) {
    console.log(`Network access: http://${ip}:${PORT}`);
  }
  console.log(`Uploads directory: ${uploadsAbsolute}`);
});
