const path = require('path');
const fs = require('fs');

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

function getExtension(filename) {
  return path.extname(filename).toLowerCase();
}

function isImage(mimeType) {
  return mimeType && mimeType.startsWith('image/');
}

const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff'];

function isImageByExt(ext) {
  return imageExtensions.includes(ext);
}

function buildMetadata(file, deviceInfo, storedName, urlPath) {
  const ext = getExtension(file.originalname);
  return {
    originalName: file.originalname,
    storedName: storedName,
    size: file.size,
    sizeFormatted: formatSize(file.size),
    mimeType: file.mimetype,
    extension: ext,
    isImage: isImage(file.mimetype),
    url: urlPath + storedName,
    deviceInfo: deviceInfo || 'unknown',
  };
}

async function generateThumbnail(filePath, thumbDir) {
  const sharp = require('sharp');
  const fileName = path.basename(filePath);
  const thumbPath = path.join(thumbDir, fileName);
  if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir, { recursive: true });
  }
  await sharp(filePath)
    .resize(200, 200, { fit: 'cover', withoutEnlargement: true })
    .toFile(thumbPath);
  return thumbPath;
}

module.exports = { formatSize, getExtension, isImage, isImageByExt, buildMetadata, generateThumbnail };
