const path = require('path');
const fs = require('fs');
const exifr = require('exifr');

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
const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'];
const textExtensions = ['.txt', '.md', '.csv', '.log', '.json', '.xml', '.yaml', '.yml', '.toml', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.sh', '.bat', '.ps1', '.env', '.ini', '.cfg', '.sql', '.rtf', '.odt', '.ods', '.odp', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pages', '.numbers', '.key', '.epub', '.mobi'];

function isImageByExt(ext) {
  return imageExtensions.includes(ext);
}

function getFileTypeFromExtension(ext) {
  if (imageExtensions.includes(ext)) return 'image';
  if (videoExtensions.includes(ext)) return 'video';
  if (audioExtensions.includes(ext)) return 'audio';
  if (ext === '.pdf') return 'pdf';
  if (textExtensions.includes(ext)) return 'text';
  return 'other';
}

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

async function buildMetadata(file, deviceInfo, storedName, urlPath, filePath) {
  const ext = getExtension(file.originalname);
  const fileExtension = ext.startsWith('.') ? ext.slice(1) : ext;
  const fileType = getFileTypeFromExtension(ext || '');
  const imageLike = isImage(file.mimetype) || isImageByExt(ext);
  let metadataDate = null;
  let metadataLocation = null;
  let metadataCamera = null;

  if (filePath && imageLike) {
    try {
      const exif = await exifr.parse(filePath, {
        pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'Model', 'Make', 'LensModel', 'GPSLatitude', 'GPSLongitude'],
      });
      if (exif) {
        metadataDate = toIsoDate(exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate) || null;
        if (Number.isFinite(exif.GPSLatitude) && Number.isFinite(exif.GPSLongitude)) {
          metadataLocation = `${exif.GPSLatitude.toFixed(6)}, ${exif.GPSLongitude.toFixed(6)}`;
        }
        if (exif.Make || exif.Model) {
          metadataCamera = [exif.Make, exif.Model].filter(Boolean).join(' ');
        } else if (exif.LensModel) {
          metadataCamera = exif.LensModel;
        }
      }
    } catch (err) {
      const message = err && err.message ? err.message : err;
      console.warn('EXIF parse failed:', message, 'path:', filePath);
    }
  }

  return {
    originalName: file.originalname,
    storedName: storedName,
    size: file.size,
    sizeFormatted: formatSize(file.size),
    mimeType: file.mimetype,
    extension: ext,
    fileExtension,
    fileType,
    isImage: isImage(file.mimetype),
    url: urlPath + storedName,
    deviceInfo: deviceInfo || 'unknown',
    metadataDate,
    metadataLocation,
    metadataCamera,
    tags: null,
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
