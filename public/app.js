let pendingFiles = [];
let uploadMode = 'files';
let config = {};
let showingTrash = false;

// Pagination state
let filesState = { files: [], total: 0, page: 1, limit: 50, totalPages: 0 };
let currentSearch = '';
let currentSort = 'newest';
let currentDevice = '';
let currentPage = 1;
let searchDebounceTimer = null;

// Multi-select state
let selectedFiles = new Set();
let multiSelectActive = false;
let longPressTimer = null;

let allDevices = [];

function getDeviceSlug() {
  const ua = navigator.userAgent;
  const platform = navigator.platform;
  if (platform) {
    if (platform.startsWith('Win')) return 'Windows';
    if (platform.startsWith('Mac')) return 'macOS';
    if (platform.startsWith('Linux')) return 'Linux';
    if (platform.startsWith('iPhone')) return 'iPhone';
    if (platform.startsWith('iPad')) return 'iPad';
    if (platform.startsWith('iPod')) return 'iPod';
  }
  if (/Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'Mobile-Unknown';
  return 'Desktop-Unknown';
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getFileIcon(ext, mimeType) {
  if (mimeType && mimeType.startsWith('image/')) return null;
  const map = {
    '.pdf': '📕',
    '.mp4': '🎬', '.webm': '🎬', '.mov': '🎬', '.avi': '🎬', '.mkv': '🎬', '.m4v': '🎬',
    '.mp3': '🎵', '.wav': '🎵', '.flac': '🎵', '.aac': '🎵', '.ogg': '🎵', '.m4a': '🎵',
    '.zip': '📦', '.rar': '📦', '.7z': '📦', '.tar': '📦', '.gz': '📦',
    '.js': '📄', '.ts': '📄', '.py': '📄', '.java': '📄', '.cpp': '📄', '.go': '📄', '.rs': '📄', '.rb': '📄', '.php': '📄', '.swift': '📄', '.kt': '📄',
    '.html': '🌐', '.css': '🌐', '.jsx': '🌐', '.tsx': '🌐', '.vue': '🌐', '.svelte': '🌐',
    '.doc': '📝', '.docx': '📝',
    '.xls': '📊', '.xlsx': '📊',
    '.ppt': '📽', '.pptx': '📽',
    '.json': '📋', '.xml': '📋', '.yaml': '📋', '.toml': '📋', '.yml': '📋',
    '.md': '📝', '.txt': '📝', '.csv': '📊',
    '.exe': '⚙️', '.msi': '⚙️', '.dmg': '⚙️', '.apk': '⚙️',
    '.iso': '💿', '.img': '💿',
  };
  return map[ext] || '📄';
}

function showToast(message, type) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
}

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    config = await res.json();
  } catch { config = { copyLinkEnabled: false }; }
}

async function generateQR() {
  const container = document.getElementById('qr-code');
  const urlEl = document.getElementById('qr-url');
  try {
    const res = await fetch('/api/network-info');
    const data = await res.json();
    const url = 'http://' + data.ip + ':' + (location.port || '3000');
    container.innerHTML = '';
    new QRCode(container, { text: url, width: 200, height: 200 });
    urlEl.textContent = url;
  } catch { showToast('Could not detect network IP', 'error'); }
}

function setupQR() {
  const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) {
    document.getElementById('qr-toggle').style.display = 'none';
    return;
  }
  const modal = document.getElementById('qr-modal');
  document.getElementById('qr-toggle').addEventListener('click', () => {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    generateQR();
  });
  document.getElementById('qr-close').addEventListener('click', closeQR);
  document.getElementById('qr-overlay').addEventListener('click', closeQR);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') closeQR();
  });
}

function closeQR() {
  document.getElementById('qr-modal').style.display = 'none';
  document.body.style.overflow = '';
}

function setupTheme() {
  const btn = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.dataset.theme = 'dark';
    btn.textContent = '☀️';
  } else {
    document.documentElement.dataset.theme = saved || 'light';
    btn.textContent = saved === 'dark' ? '☀️' : '🌙';
  }
  btn.addEventListener('click', () => {
    const isDark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    btn.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
}

function setupFolderMode() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      uploadMode = btn.dataset.mode;
      const input = document.getElementById('file-input');
      if (uploadMode === 'folder') {
        input.removeAttribute('multiple');
        input.setAttribute('webkitdirectory', '');
        input.setAttribute('directory', '');
      } else {
        input.removeAttribute('webkitdirectory');
        input.removeAttribute('directory');
        input.setAttribute('multiple', '');
      }
      input.value = '';
    });
  });
}

async function fetchDevices() {
  try {
    const res = await fetch('/api/files/devices');
    const data = await res.json();
    allDevices = data.devices || [];
  } catch { allDevices = []; }
}

function populateDeviceFilter() {
  const select = document.getElementById('device-filter');
  const current = select.value;
  select.innerHTML = '<option value="">All devices</option>' +
    allDevices.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  select.value = current;
}

function getQueryParams() {
  const params = new URLSearchParams();
  params.set('page', currentPage);
  params.set('limit', filesState.limit);
  if (currentSearch) params.set('search', currentSearch);
  params.set('sort', currentSort);
  if (currentDevice) params.set('device', currentDevice);
  return params;
}

async function fetchFiles() {
  try {
    const params = getQueryParams();
    const res = await fetch('/api/files?' + params.toString());
    filesState = await res.json();
    const totalSize = filesState.files.reduce((s, f) => s + f.size, 0);
    const total = filesState.total;
    const stats = document.getElementById('file-stats');
    stats.textContent = total + ' file' + (total !== 1 ? 's' : '') + ' · ' + formatSize(totalSize);
    if (!showingTrash) {
      renderFileGrid(filesState.files);
      renderPagination();
    }
  } catch { showToast('Failed to load files', 'error'); }
}

function renderFileGrid(files) {
  const grid = document.getElementById('file-grid');
  if (files.length === 0) {
    grid.innerHTML = '<div class="empty-state">No files match</div>';
    return;
  }
  const groups = {};
  for (const f of files) {
    const key = f.folderPath || '__root__';
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  }
  let html = '';
  const keys = Object.keys(groups).sort((a, b) => {
    if (a === '__root__') return -1;
    if (b === '__root__') return 1;
    return a.localeCompare(b);
  });
  for (const key of keys) {
    const group = groups[key];
    if (key !== '__root__') {
      html += `<div class="folder-header">📁 ${escapeHtml(key)}</div>`;
    }
    for (const file of group) {
      const isSelected = selectedFiles.has(file.storedName);
      const icon = getFileIcon(file.extension, file.mimeType);
      const thumbUrl = file.thumbnailUrl || file.url;
      const preview = file.isImage
        ? `<img class="preview" src="${thumbUrl}" alt="${file.originalName}" loading="lazy" onerror="this.onerror=null;this.src='${file.url}';this.style.objectFit='contain'">`
        : (icon ? `<div class="file-icon">${icon}</div>` : `<div class="file-icon">📄</div>`);
      const copyBtn = config.copyLinkEnabled
        ? `<button class="copy-btn" data-url="${file.url}">Copy Link</button>`
        : '';
      const folderLabel = file.folderPath ? `<div class="file-folder-path">📁 ${escapeHtml(file.folderPath)}</div>` : '';
      const selectedClass = isSelected ? ' selected' : '';
      html += `
        <div class="file-card${selectedClass}" data-stored="${escapeHtml(file.storedName)}">
          <div class="check-overlay">✓</div>
          ${preview}
          <div class="file-name">${escapeHtml(file.originalName)}</div>
          ${folderLabel}
          <div class="file-meta">${file.sizeFormatted} &middot; ${file.deviceInfo}</div>
          <div class="file-actions">
            <a class="download-btn" href="/api/files/${file.storedName}" download>Download</a>
            ${copyBtn}
            <button class="delete-btn" data-stored="${file.storedName}">Delete</button>
          </div>
        </div>
      `;
    }
  }
  grid.innerHTML = html;

  grid.querySelectorAll('.file-card').forEach(card => {
    const stored = card.dataset.stored;

    // Long press for mobile
    let holdTimer = null;
    card.addEventListener('touchstart', (e) => {
      holdTimer = setTimeout(() => {
        holdTimer = null;
        e.preventDefault();
        enterMultiSelect();
        toggleFileSelection(stored);
      }, 500);
    });
    card.addEventListener('touchend', () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    });
    card.addEventListener('touchmove', () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    });

    card.addEventListener('click', (e) => {
      if (e.target.closest('.file-actions')) return;
      if (e.ctrlKey || e.metaKey) {
        enterMultiSelect();
        toggleFileSelection(stored);
        return;
      }
      if (multiSelectActive) {
        toggleFileSelection(stored);
        return;
      }
      const file = filesState.files.find(f => f.storedName === stored);
      if (file) openPreview(file);
    });

    card.addEventListener('contextmenu', (e) => {
      if (multiSelectActive && !selectedFiles.has(stored)) {
        selectedFiles.add(stored);
      }
      if (!multiSelectActive) {
        enterMultiSelect();
        selectedFiles.add(stored);
      }
      updateMultiUI();
      showContextMenu(e.clientX, e.clientY);
      e.preventDefault();
    });
  });

  grid.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = window.location.origin + btn.dataset.url;
      try { await navigator.clipboard.writeText(url); showToast('Link copied', 'success'); }
      catch { showToast('Failed to copy', 'error'); }
    });
  });
  grid.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this file?')) return;
      const stored = btn.dataset.stored;
      await fetch('/api/files/' + stored, { method: 'DELETE' });
      showToast('File moved to trash', 'info');
      fetchFiles();
    });
  });
}

function renderPagination() {
  const el = document.getElementById('pagination');
  const { page, totalPages } = filesState;
  if (totalPages <= 1) { el.style.display = 'none'; return; }
  el.style.display = 'flex';

  let html = '';
  html += `<button class="pg-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>« Prev</button>`;

  const maxVisible = 7;
  let start = Math.max(1, page - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1);
  }

  if (start > 1) {
    html += `<button class="pg-btn" data-page="1">1</button>`;
    if (start > 2) html += `<span class="pg-info">…</span>`;
  }
  for (let i = start; i <= end; i++) {
    html += `<button class="pg-btn${i === page ? ' active' : ''}" data-page="${i}">${i}</button>`;
  }
  if (end < totalPages) {
    if (end < totalPages - 1) html += `<span class="pg-info">…</span>`;
    html += `<button class="pg-btn" data-page="${totalPages}">${totalPages}</button>`;
  }

  html += `<button class="pg-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next »</button>`;

  el.innerHTML = html;
  el.querySelectorAll('.pg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      goToPage(parseInt(btn.dataset.page));
    });
  });
}

function goToPage(page) {
  if (page < 1 || page > filesState.totalPages) return;
  currentPage = page;
  fetchFiles();
}

// Multi-select
function enterMultiSelect() {
  if (multiSelectActive) return;
  multiSelectActive = true;
  document.body.classList.add('multiselect-active');
  document.getElementById('multi-toolbar').classList.add('visible');
}

function exitMultiSelect() {
  multiSelectActive = false;
  selectedFiles.clear();
  document.body.classList.remove('multiselect-active');
  document.getElementById('multi-toolbar').classList.remove('visible');
  hideContextMenu();
  updateMultiUI();
}

function toggleFileSelection(storedName) {
  if (selectedFiles.has(storedName)) selectedFiles.delete(storedName);
  else selectedFiles.add(storedName);
  updateMultiUI();
}

function updateMultiUI() {
  const count = selectedFiles.size;
  const toolbar = document.getElementById('multi-toolbar');
  document.getElementById('multi-count').textContent = count + ' file' + (count !== 1 ? 's' : '') + ' selected';
  if (count === 0) {
    toolbar.classList.remove('visible');
    document.body.classList.remove('multiselect-active');
    multiSelectActive = false;
  }
  // Re-render file grid to update check overlays without losing page
  if (!showingTrash) renderFileGrid(filesState.files);
}

function setupMultiToolbar() {
  document.getElementById('multi-download-btn').addEventListener('click', async () => {
    for (const stored of selectedFiles) {
      const a = document.createElement('a');
      a.href = '/api/files/' + stored;
      a.download = '';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      await new Promise(r => setTimeout(r, 200));
    }
    showToast('Downloaded ' + selectedFiles.size + ' file(s)', 'success');
    exitMultiSelect();
  });

  document.getElementById('multi-delete-btn').addEventListener('click', async () => {
    const ids = Array.from(selectedFiles);
    if (!confirm('Move ' + ids.length + ' file(s) to trash?')) return;
    try {
      const res = await fetch('/api/files/batch-trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json();
      showToast('Moved ' + data.moved.length + ' file(s) to trash', 'info');
    } catch { showToast('Failed to move files', 'error'); }
    exitMultiSelect();
    fetchFiles();
  });

  document.getElementById('multi-cancel-btn').addEventListener('click', exitMultiSelect);
}

// Context menu
function showContextMenu(x, y) {
  const menu = document.getElementById('context-menu');
  menu.innerHTML = `
    <button class="ctx-item" data-action="download">⬇️ Download</button>
    <button class="ctx-item" data-action="delete">🗑 Move to Trash</button>
    <div class="ctx-divider"></div>
    <button class="ctx-item" data-action="cancel">✕ Cancel selection</button>
  `;
  menu.style.display = 'block';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  // Keep menu within viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';

  menu.querySelectorAll('.ctx-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      if (action === 'download') document.getElementById('multi-download-btn').click();
      else if (action === 'delete') document.getElementById('multi-delete-btn').click();
      else if (action === 'cancel') exitMultiSelect();
      hideContextMenu();
    });
  });

  setTimeout(() => {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 0);
}

function hideContextMenu() {
  document.getElementById('context-menu').style.display = 'none';
}

// ── Preview ──
function openPreview(file) {
  const modal = document.getElementById('preview-modal');
  const body = document.getElementById('preview-body');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  if (file.isImage) {
    const img = document.createElement('img');
    img.src = file.url;
    img.alt = file.originalName;
    img.style.touchAction = 'pinch-zoom';
    img.style.cursor = 'zoom-in';
    let zoomed = false;
    img.addEventListener('dblclick', () => {
      zoomed = !zoomed;
      img.style.transform = zoomed ? 'scale(2)' : '';
      img.style.cursor = zoomed ? 'zoom-out' : 'zoom-in';
    });
    body.innerHTML = '';
    body.appendChild(img);
  } else if (file.mimeType && file.mimeType.startsWith('video/')) {
    body.innerHTML = `<video src="${file.url}" controls autoplay></video>`;
  } else if (file.mimeType && file.mimeType.startsWith('audio/')) {
    body.innerHTML = `<audio src="${file.url}" controls autoplay></audio>`;
  } else if (file.extension === '.pdf') {
    body.innerHTML = `<embed src="${file.url}" type="application/pdf">`;
  } else if (isTextFile(file)) {
    fetch(file.url).then(r => r.text())
      .then(text => { body.innerHTML = `<pre>${escapeHtml(text)}</pre>`; })
      .catch(() => { body.innerHTML = previewInfoHtml(file); });
  } else {
    body.innerHTML = previewInfoHtml(file);
  }
}

function isTextFile(file) {
  if (file.mimeType && file.mimeType.startsWith('text/')) return true;
  const textExts = ['.js','.ts','.py','.java','.cpp','.h','.c','.go','.rs','.rb','.php','.swift','.kt',
    '.html','.css','.jsx','.tsx','.vue','.svelte','.json','.xml','.yaml','.yml','.toml',
    '.md','.txt','.csv','.log','.sh','.bat','.ps1','.env','.gitignore','.sql','.ini','.cfg'];
  return textExts.includes(file.extension);
}

function previewInfoHtml(file) {
  return `
    <div class="preview-info">
      <div class="file-icon" style="font-size:3rem;">${getFileIcon(file.extension, file.mimeType) || '📄'}</div>
      <div class="file-name">${escapeHtml(file.originalName)}</div>
      <div class="file-details">${file.sizeFormatted} · ${file.mimeType}</div>
      <a class="download-btn" href="/api/files/${file.storedName}" download>Download</a>
    </div>
  `;
}

function setupPreviewModal() {
  document.getElementById('preview-close').addEventListener('click', closePreview);
  document.getElementById('preview-overlay').addEventListener('click', closePreview);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePreview(); });
}

function closePreview() {
  document.getElementById('preview-modal').style.display = 'none';
  document.getElementById('preview-body').innerHTML = '';
  document.body.style.overflow = '';
}

// ── Trash ──
async function showTrash() {
  showingTrash = true;
  document.getElementById('file-grid').style.display = 'none';
  document.getElementById('pagination').style.display = 'none';
  const section = document.getElementById('trash-section');
  section.style.display = 'block';
  document.getElementById('trash-toggle').textContent = '📁';
  try {
    const res = await fetch('/api/trash');
    const items = await res.json();
    const list = document.getElementById('trash-list');
    document.getElementById('trash-count').textContent = items.length + ' file' + (items.length !== 1 ? 's' : '') + ' in trash';
    if (items.length === 0) {
      list.innerHTML = '<div class="empty-state">Trash is empty</div>';
      return;
    }
    list.innerHTML = items.map(item => `
      <div class="trash-item">
        <span class="ti-name">${escapeHtml(item.originalName)}</span>
        <span class="ti-meta">${item.sizeFormatted} · ${item.deviceInfo}</span>
        <div class="ti-actions">
          <button class="restore-btn" data-stored="${escapeHtml(item.storedName)}">Restore</button>
          <button class="perm-delete-btn" data-stored="${escapeHtml(item.storedName)}">Delete</button>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.restore-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await fetch('/api/trash/' + btn.dataset.stored + '/restore', { method: 'POST' });
        showToast('File restored', 'success');
        showTrash();
        fetchFiles();
      });
    });
    list.querySelectorAll('.perm-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Permanently delete this file?')) return;
        await fetch('/api/trash/' + btn.dataset.stored, { method: 'DELETE' });
        showToast('File permanently deleted', 'info');
        showTrash();
      });
    });
  } catch { showToast('Failed to load trash', 'error'); }
}

function hideTrash() {
  showingTrash = false;
  document.getElementById('trash-section').style.display = 'none';
  document.getElementById('file-grid').style.display = '';
  document.getElementById('trash-toggle').textContent = '🗑';
  fetchFiles();
}

function setupTrash() {
  document.getElementById('trash-toggle').addEventListener('click', () => {
    if (showingTrash) hideTrash();
    else showTrash();
  });
  document.getElementById('trash-empty-btn').addEventListener('click', async () => {
    if (!confirm('Permanently delete all files in trash?')) return;
    await fetch('/api/trash', { method: 'DELETE' });
    showToast('Trash emptied', 'info');
    showTrash();
  });
}

// ── Settings ──
async function setupSettings() {
  try {
    const res = await fetch('/api/config/settings');
    const settings = await res.json();
    if (settings.trashDays) {
      document.getElementById('settings-trash-days').value = settings.trashDays;
    }
  } catch {}

  const modal = document.getElementById('settings-modal');
  document.getElementById('settings-toggle').addEventListener('click', () => {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  });
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('settings-overlay').addEventListener('click', closeSettings);

  document.getElementById('settings-save').addEventListener('click', async () => {
    const trashDays = document.getElementById('settings-trash-days').value;
    try {
      const res = await fetch('/api/config/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashDays: parseInt(trashDays, 10) })
      });
      if (res.ok) {
        showToast('Settings saved', 'success');
        closeSettings();
      } else {
        showToast('Failed to save settings', 'error');
      }
    } catch { showToast('Failed to save settings', 'error'); }
  });
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
  document.body.style.overflow = '';
}

// ── Upload ──
function addFiles(fileList) {
  for (const file of fileList) {
    const dup = pendingFiles.some(f =>
      f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
    );
    if (!dup) pendingFiles.push(file);
  }
  renderPending();
}

function removeFile(index) {
  pendingFiles.splice(index, 1);
  renderPending();
}

function renderPending() {
  const section = document.getElementById('pending-section');
  const list = document.getElementById('pending-list');
  const summary = document.getElementById('pending-summary');
  const uploadBtn = document.getElementById('upload-btn');
  uploadBtn.disabled = pendingFiles.length === 0;
  if (pendingFiles.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  list.innerHTML = pendingFiles.map((f, i) => {
    const icon = f.type && f.type.startsWith('image/') ? '🖼' : '📄';
    return `<div class="pending-file"><span>${icon}</span><span class="pf-name">${escapeHtml(f.name)}</span><span class="pf-size">${formatSize(f.size)}</span><button class="remove-btn" data-index="${i}">&times;</button></div>`;
  }).join('');
  list.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeFile(parseInt(btn.dataset.index)));
  });
  const totalSize = pendingFiles.reduce((acc, f) => acc + f.size, 0);
  summary.textContent = `${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''} · ${formatSize(totalSize)} total`;
}

function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    if (file.webkitRelativePath) {
      const parts = file.webkitRelativePath.split('/');
      parts.pop();
      formData.append('folderPath', parts.join('/'));
    }
    formData.append('file', file);
    const xhr = new XMLHttpRequest();
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const startTime = Date.now();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0.1 ? (e.loaded / elapsed) / (1024 * 1024) : 0;
        progressBar.value = pct;
        progressText.textContent = pct + '%' + (speed > 0 ? ' (' + speed.toFixed(1) + ' MB/s)' : '');
      }
    });
    xhr.addEventListener('load', () => { if (xhr.status === 201) resolve(); else reject(new Error('Upload failed: ' + xhr.status)); });
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
    xhr.open('POST', '/api/upload');
    xhr.setRequestHeader('X-Device-Info', getDeviceSlug());
    xhr.send(formData);
  });
}

async function uploadPending() {
  const uploadBtn = document.getElementById('upload-btn');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const files = [...pendingFiles];
  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';
  progressContainer.style.display = 'flex';
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    progressBar.value = 0;
    progressText.textContent = `0% (${i + 1}/${files.length})`;
    uploadBtn.textContent = `Uploading ${i + 1}/${files.length}...`;
    try {
      await uploadFile(file);
      showToast(file.name + ' uploaded', 'success');
      const idx = pendingFiles.findIndex(f =>
        f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
      );
      if (idx !== -1) { pendingFiles.splice(idx, 1); renderPending(); }
    } catch (err) { showToast('Failed: ' + file.name, 'error'); }
  }
  uploadBtn.disabled = false;
  uploadBtn.textContent = 'Upload';
  progressContainer.style.display = 'none';
  fetchFiles();
}

function setupToolbar() {
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      currentSearch = searchInput.value;
      currentPage = 1;
      exitMultiSelect();
      fetchFiles();
    }, 300);
  });
  document.getElementById('sort-select').addEventListener('change', () => {
    currentSort = document.getElementById('sort-select').value;
    currentPage = 1;
    exitMultiSelect();
    fetchFiles();
  });
  document.getElementById('device-filter').addEventListener('change', () => {
    currentDevice = document.getElementById('device-filter').value;
    currentPage = 1;
    exitMultiSelect();
    fetchFiles();
  });
}

function setupUpload() {
  const form = document.getElementById('upload-form');
  const fileInput = document.getElementById('file-input');
  const dropZone = document.getElementById('drop-zone');
  const uploadBtn = document.getElementById('upload-btn');
  uploadBtn.disabled = true;
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) { addFiles(fileInput.files); fileInput.value = ''; }
  });
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (pendingFiles.length === 0) return;
    uploadPending();
  });
}

// ── Paste from clipboard ──
function setupPaste() {
  document.addEventListener('paste', (e) => {
    const files = e.clipboardData && e.clipboardData.files;
    if (!files || files.length === 0) return;
    const imageFiles = [];
    for (const file of files) {
      if (file.type && file.type.startsWith('image/')) {
        imageFiles.push(file);
      }
    }
    if (imageFiles.length === 0) return;
    e.preventDefault();
    addFiles(imageFiles);
    showToast(imageFiles.length + ' image(s) pasted from clipboard', 'info');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await fetchConfig();
  setupUpload();
  setupPaste();
  setupToolbar();
  setupQR();
  setupTheme();
  setupFolderMode();
  setupPreviewModal();
  setupTrash();
  setupSettings();
  setupMultiToolbar();
  // Global keydown for Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (multiSelectActive) exitMultiSelect();
    }
  });
  await fetchDevices();
  populateDeviceFilter();
  fetchFiles();
  setInterval(() => {
    if (!showingTrash) fetchFiles();
  }, 8000);
});
