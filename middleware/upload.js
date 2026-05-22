const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let uploadDir = 'uploads';

function configure(storageDir) {
  uploadDir = storageDir;

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const folderPath = (req.body && req.body.folderPath) || '';
      const dest = folderPath ? path.join(uploadDir, folderPath) : uploadDir;
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const deviceInfo = req.headers['x-device-info'] || 'unknown';
      const deviceSlug = deviceInfo.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
      const now = new Date();
      const dateStr = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0');
      const random = crypto.randomBytes(2).toString('hex');
      const ext = path.extname(file.originalname).toLowerCase();
      const storedName = `${deviceSlug}-${dateStr}-${random}${ext}`;
      cb(null, storedName);
    }
  });

  return multer({
    storage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 1073741824 }
  });
}

module.exports = { configure };
