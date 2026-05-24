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

// Filters state
let filterDraft = null;
let filterState = {
  dateSource: 'uploaded',
  dateFrom: '',
  dateTo: '',
  metaLocation: '',
  metaCamera: '',
  tags: '',
  fileType: '',
  fileExtension: '',
};

let metadataOptions = {
  dateSources: [],
  locations: [],
  cameras: [],
  tags: [],
  fileTypes: [],
  fileExtensions: [],
};

// Multi-select state
let selectedFiles = new Set();
let selectedFolders = new Set();
let multiSelectActive = false;
let longPressTimer = null;
let dragSelecting = false;
let dragStart = null;
let dragLastPoint = null;
let dragRafId = null;
let selectionBox = null;
let dragMoveActive = false;
let dragMoveIds = [];
let dragMoveTouchId = null;
let dragMoveTargetFolder = null;
let dragMoveStart = null;
let dragMoveCandidate = null;
let dragMoveMouseStart = null;
let dragMoveSkipClick = false;

let trashState = { items: [] };
let moveContext = null;

let allDevices = [];
let allFolders = [];
let currentFolder = '';
let realtimeSource = null;
let realtimeDebounce = null;
let pollIntervalId = null;
let lastScrollY = 0;
let uploadConcurrency = (() => {
  const stored = localStorage.getItem('uploadConcurrency');
  if (stored) return parseInt(stored, 10);
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 2 : 4;
})();
let uploadActiveSet = new Set();
let oversizeAllowSet = new Set();

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
  } catch { config = { copyLinkEnabled: false, maxFileSize: 1073741824 }; }
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

function setupSidebar() {
  const allFilesBtn = document.getElementById('sidebar-all-files');
  const trashBtn = document.getElementById('sidebar-trash');
  const uploadBtn = document.getElementById('sidebar-upload');

  function clearActive() {
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  }

  function hideUpload() {
    document.getElementById('upload-section').style.display = 'none';
  }

  allFilesBtn.addEventListener('click', () => {
    clearActive();
    allFilesBtn.classList.add('active');
    hideUpload();
    if (currentFolder) { currentFolder = ''; currentPage = 1; }
    if (showingTrash) hideTrash();
    else fetchFiles();
  });

  trashBtn.addEventListener('click', () => {
    hideUpload();
    clearActive();
    trashBtn.classList.add('active');
    if (showingTrash) {
      hideTrash();
      allFilesBtn.classList.add('active');
    } else {
      showTrash();
    }
  });

  uploadBtn.addEventListener('click', () => {
    const section = document.getElementById('upload-section');
    const isVisible = section.style.display !== 'none';
    if (showingTrash) hideTrash();
    clearActive();
    uploadBtn.classList.add('active');
    section.style.display = isVisible ? 'none' : 'block';
  });
}

function setMobileNavActive(action) {
  const buttons = document.querySelectorAll('.mobile-nav-item');
  buttons.forEach(btn => btn.classList.remove('active'));
  const target = document.querySelector(`.mobile-nav-item[data-action="${action}"]`);
  if (target) target.classList.add('active');
}

function setupMobileNav() {
  const nav = document.getElementById('mobile-nav');
  if (!nav) return;

  const allBtn = document.getElementById('mobile-nav-all');
  const uploadBtn = document.getElementById('mobile-nav-upload');
  const trashBtn = document.getElementById('mobile-nav-trash');

  if (allBtn) {
    allBtn.addEventListener('click', () => {
      if (currentFolder) { currentFolder = ''; currentPage = 1; }
      if (showingTrash) hideTrash();
      document.getElementById('upload-section').style.display = 'none';
      setMobileNavActive('all');
      fetchFiles();
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      if (showingTrash) hideTrash();
      const section = document.getElementById('upload-section');
      const isVisible = section.style.display !== 'none';
      section.style.display = isVisible ? 'none' : 'block';
      setMobileNavActive('upload');
    });
  }

  if (trashBtn) {
    trashBtn.addEventListener('click', () => {
      document.getElementById('upload-section').style.display = 'none';
      if (showingTrash) {
        hideTrash();
        setMobileNavActive('all');
      } else {
        showTrash();
        setMobileNavActive('trash');
      }
    });
  }
}

function setupMobileNavAutoHide() {
  const nav = document.getElementById('mobile-nav');
  const content = document.getElementById('main-content');
  if (!nav || !content) return;

  lastScrollY = content.scrollTop;
  let ticking = false;

  function onScroll() {
    const currentY = content.scrollTop;
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const delta = currentY - lastScrollY;
        if (Math.abs(delta) > 8) {
          if (delta > 0) nav.classList.add('hidden');
          else nav.classList.remove('hidden');
          lastScrollY = currentY;
        }
        ticking = false;
      });
      ticking = true;
    }
  }

  content.addEventListener('scroll', onScroll, { passive: true });
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
  if (currentFolder) params.set('folder', currentFolder);
  if (filterState.dateSource && filterState.dateSource !== 'uploaded') params.set('dateSource', filterState.dateSource);
  if (filterState.dateFrom) params.set('dateFrom', filterState.dateFrom);
  if (filterState.dateTo) params.set('dateTo', filterState.dateTo);
  if (filterState.metaLocation) params.set('metaLocation', filterState.metaLocation);
  if (filterState.metaCamera) params.set('metaCamera', filterState.metaCamera);
  if (filterState.tags) params.set('tags', filterState.tags);
  if (filterState.fileType) params.set('fileType', filterState.fileType);
  if (filterState.fileExtension) params.set('fileExtension', filterState.fileExtension);
  return params;
}

async function fetchFiles() {
  try {
    const params = getQueryParams();
    const [filesRes, foldersRes] = await Promise.all([
      fetch('/api/files?' + params.toString()),
      fetch('/api/files/folders')
    ]);
    filesState = await filesRes.json();
    const foldersData = await foldersRes.json();
    allFolders = foldersData.folders || [];
    const totalSize = filesState.files.reduce((s, f) => s + f.size, 0);
    const total = filesState.total;
    const stats = document.getElementById('file-stats');
    const sidebarStats = document.getElementById('sidebar-stats');
    stats.textContent = total + ' file' + (total !== 1 ? 's' : '') + ' · ' + formatSize(totalSize);
    if (sidebarStats) sidebarStats.textContent = total + ' file' + (total !== 1 ? 's' : '') + ' · ' + formatSize(totalSize);
    if (!showingTrash) {
      renderFileGrid(filesState.files);
      renderPagination();
      renderFolderTree();
    }
    fetchTotals();
  } catch { showToast('Failed to load files', 'error'); }
}

function formatTotalSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

async function fetchTotals() {
  try {
    const res = await fetch('/api/totals');
    const data = await res.json();
    const el = document.getElementById('total-stats');
    if (el) {
      el.textContent = 'All folders: ' + data.totalFiles + ' file' + (data.totalFiles !== 1 ? 's' : '') + ' · ' + formatTotalSize(data.totalSize);
    }
  } catch {}
}

function renderFileGrid(files) {
  const grid = document.getElementById('file-grid');

  if (!currentFolder && allFolders.length === 0 && files.length === 0) {
    grid.innerHTML = '<div class="empty-state">No files match</div>';
    return;
  }

  let html = '';

  // Toolbar breadcrumb when viewing a folder
  const breadcrumb = document.getElementById('breadcrumb');
  if (breadcrumb) {
    if (currentFolder) {
      breadcrumb.innerHTML = `<div class="breadcrumb-inner"><button class="folder-back-btn" data-action="back">← Back to root</button><span class="breadcrumb-current">📁 ${escapeHtml(currentFolder)}</span></div>`;
    } else {
      breadcrumb.innerHTML = '';
    }
  }

  // Up folder card
  if (currentFolder) {
    html += `
      <div class="file-card folder-up-card" data-action="up">
        <div class="folder-card-icon">📁</div>
        <div class="file-name">..</div>
        <div class="folder-card-hint">Up one level</div>
      </div>
    `;
  }

  // Folder cards — show all at root, or sub-folders inside a folder
  const visibleFolders = currentFolder
    ? allFolders.filter(f => f.startsWith(currentFolder + '/') && !f.slice(currentFolder.length + 1).includes('/'))
    : allFolders.filter(f => !f.includes('/'));
  if (visibleFolders.length > 0) {
    for (const folder of visibleFolders) {
      const displayName = currentFolder ? folder.slice(currentFolder.length + 1) : folder;
      const isSelected = selectedFolders.has(folder);
      const selectedClass = isSelected ? ' selected' : '';
      html += `
        <div class="file-card folder-card${selectedClass}" data-folder="${escapeHtml(folder)}">
          <div class="folder-card-icon">📁</div>
          <div class="file-name">${escapeHtml(displayName)}</div>
          <div class="folder-card-hint">Click to open</div>
        </div>
      `;
    }
  }

  // File cards
  for (const file of files) {
    const isSelected = selectedFiles.has(file.storedName);
    const icon = getFileIcon(file.extension, file.mimeType);
    const preview = file.isImage
      ? `<img class="preview" src="${file.thumbnailUrl || file.url}" alt="${file.originalName}" loading="lazy" onerror="this.onerror=null;this.src='${file.url}';this.style.objectFit='contain'">`
      : (icon ? `<div class="file-icon">${icon}</div>` : `<div class="file-icon">📄</div>`);
    const copyBtn = config.copyLinkEnabled
      ? `<button class="copy-btn" data-url="${file.url}">Copy Link</button>`
      : '';
    const selectedClass = isSelected ? ' selected' : '';
    html += `
      <div class="file-card${selectedClass}" data-stored="${escapeHtml(file.storedName)}">
        <div class="check-overlay">✓</div>
        ${preview}
        <div class="file-name">${escapeHtml(file.originalName)}</div>
        <div class="file-meta">${file.sizeFormatted} &middot; ${file.deviceInfo}</div>
        ${copyBtn ? `<div class="file-actions">${copyBtn}</div>` : ''}
      </div>
    `;
  }
  grid.innerHTML = html;

  grid.querySelectorAll('.file-card').forEach(card => {
    const stored = card.dataset.stored;
    if (!stored) return; // folder cards handled by .folder-card loop

    // Long press for mobile
    let holdTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    card.addEventListener('touchstart', (e) => {
      if (dragMoveActive) return;
      touchStartX = (e.touches[0] || {}).clientX || 0;
      touchStartY = (e.touches[0] || {}).clientY || 0;
      touchMoved = false;
      holdTimer = setTimeout(() => {
        holdTimer = null;
        e.preventDefault();
        enterMultiSelect();
        toggleFileSelection(stored);
      }, 500);
    }, { passive: true });
    card.addEventListener('touchend', () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    });
    card.addEventListener('touchmove', (e) => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (!touchMoved && touchStartX && touchStartY) {
        const t = (e.touches[0] || {});
        const dx = (t.clientX || 0) - touchStartX;
        const dy = (t.clientY || 0) - touchStartY;
        if (Math.hypot(dx, dy) > 8) touchMoved = true;
      }
    });

    card.addEventListener('click', (e) => {
      if (touchMoved) {
        touchMoved = false;
        return;
      }
      if (e.target.closest('.file-actions')) return;
      if (dragMoveActive || dragMoveSkipClick) {
        dragMoveSkipClick = false;
        return;
      }
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
      const file = filesState.files.find(f => f.storedName === stored);
      hideContextMenu();
      showContextMenu(e.clientX, e.clientY, { type: 'file', storedName: stored, file });
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

  // Folder up card
  const upCard = grid.querySelector('.folder-up-card');
  if (upCard) {
    upCard.addEventListener('click', () => {
      document.getElementById('upload-section').style.display = 'none';
      if (currentFolder.includes('/')) {
        currentFolder = currentFolder.slice(0, currentFolder.lastIndexOf('/'));
      } else {
        currentFolder = '';
      }
      currentPage = 1;
      exitMultiSelect();
      document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
      const allFilesBtn = document.getElementById('sidebar-all-files');
      if (allFilesBtn) allFilesBtn.classList.add('active');
      fetchFiles();
    });
  }

  // Folder card clicks
  grid.querySelectorAll('.folder-card').forEach(card => {
    if (card.classList.contains('folder-up-card')) return;
    const folderPath = card.dataset.folder;
    card.addEventListener('touchstart', (e) => {
      if (dragMoveActive) return;
      const startX = (e.touches[0] || {}).clientX || 0;
      const startY = (e.touches[0] || {}).clientY || 0;
      card._touchMoved = false;
      let holdTimer = setTimeout(() => {
        holdTimer = null;
        e.preventDefault();
        enterMultiSelect();
        toggleFolderSelection(folderPath);
      }, 500);
      card.addEventListener('touchend', () => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
      }, { once: true });
      card.addEventListener('touchmove', (ev) => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        if (!card._touchMoved && startX && startY) {
          const t = (ev.touches[0] || {});
          const dx = (t.clientX || 0) - startX;
          const dy = (t.clientY || 0) - startY;
          if (Math.hypot(dx, dy) > 8) card._touchMoved = true;
        }
      }, { once: true });
    }, { passive: true });
    card.addEventListener('click', (e) => {
      if (card._touchMoved) {
        card._touchMoved = false;
        return;
      }
      if (dragMoveActive || dragMoveSkipClick) {
        dragMoveSkipClick = false;
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        enterMultiSelect();
        toggleFolderSelection(folderPath);
        return;
      }
      if (multiSelectActive) {
        toggleFolderSelection(folderPath);
        return;
      }
      currentFolder = folderPath;
      currentPage = 1;
      exitMultiSelect();
      fetchFiles();
    });
    card.addEventListener('touchstart', (e) => {
      if (dragMoveActive) return;
      let holdTimer = setTimeout(() => {
        holdTimer = null;
        e.preventDefault();
        enterMultiSelect();
        toggleFolderSelection(folderPath);
      }, 500);
      card.addEventListener('touchend', () => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
      }, { once: true });
      card.addEventListener('touchmove', () => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
      }, { once: true });
    }, { passive: true });
    card.addEventListener('contextmenu', (e) => {
      hideContextMenu();
      showContextMenu(e.clientX, e.clientY, { type: 'folder', folderPath: card.dataset.folder });
      e.preventDefault();
    });
  });


  // Folder breadcrumb back button
  const backBtn = document.querySelector('.folder-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      document.getElementById('upload-section').style.display = 'none';
      currentFolder = '';
      currentPage = 1;
      exitMultiSelect();
      document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
      const allFilesBtn = document.getElementById('sidebar-all-files');
      if (allFilesBtn) allFilesBtn.classList.add('active');
      fetchFiles();
    });
  }

  // Mobile long-press on empty space
  grid.addEventListener('touchstart', (e) => {
    if (e.target.closest('.file-card, .folder-card')) return;
    let holdTimer = setTimeout(() => {
      holdTimer = null;
      const touch = e.touches[0];
      if (!touch) return;
      hideContextMenu();
      showContextMenu(touch.clientX, touch.clientY, { type: 'empty' });
    }, 500);
    grid.addEventListener('touchend', () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    }, { once: true });
    grid.addEventListener('touchmove', () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    }, { once: true });
  }, { passive: true });
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

function renderFolderTree() {
  const container = document.getElementById('folder-tree');

  container.innerHTML = allFolders.map(folder => `
    <button class="folder-item${currentFolder === folder ? ' active' : ''}" data-folder="${escapeHtml(folder)}">
      <span class="fi-icon">📁</span>
      <span>${escapeHtml(folder)}</span>
    </button>
  `).join('');

  if (allFolders.length === 0 && !currentFolder) {
    container.innerHTML = '<div style="padding:8px 10px;font-size:11px;color:var(--text-muted)">No folders yet</div>';
  }

  container.querySelectorAll('.folder-item').forEach(item => {
    item.addEventListener('click', () => {
      if (showingTrash) hideTrash();
      document.getElementById('upload-section').style.display = 'none';
      currentFolder = item.dataset.folder;
      currentPage = 1;
      exitMultiSelect();
      document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
      fetchFiles();
    });

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      hideContextMenu();
      showContextMenu(e.clientX, e.clientY, { type: 'folder', folderPath: item.dataset.folder });
    });
  });
}

// Multi-select
function enterMultiSelect() {
  if (multiSelectActive) return;
  multiSelectActive = true;
  document.body.classList.add('multiselect-active');
  document.getElementById('multi-toolbar').classList.add('visible');
  updateMultiToolbarForContext();
}

function exitMultiSelect() {
  multiSelectActive = false;
  selectedFiles.clear();
  selectedFolders.clear();
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

function toggleFolderSelection(folderPath) {
  if (selectedFolders.has(folderPath)) selectedFolders.delete(folderPath);
  else selectedFolders.add(folderPath);
  updateMultiUI();
}

function updateMultiUI(options = {}) {
  const { skipRender = false } = options;
  const count = selectedFiles.size + selectedFolders.size;
  const toolbar = document.getElementById('multi-toolbar');
  document.getElementById('multi-count').textContent = count + ' item' + (count !== 1 ? 's' : '') + ' selected';
  if (count === 0 && !dragSelecting) {
    toolbar.classList.remove('visible');
    document.body.classList.remove('multiselect-active');
    multiSelectActive = false;
  }
  updateMultiToolbarForContext();
  if (skipRender || dragSelecting) {
    syncCardSelectionClasses();
    return;
  }
  // Re-render file grid to update check overlays without losing page
  if (showingTrash) renderTrashGrid(trashState.items);
  else renderFileGrid(filesState.files);
}

function syncCardSelectionClasses() {
  const cards = getSelectableCards();
  cards.forEach(card => {
    card.classList.toggle('selected', selectedFiles.has(card.dataset.stored));
  });
  const folders = getSelectableFolders();
  folders.forEach(card => {
    card.classList.toggle('selected', selectedFolders.has(card.dataset.folder));
  });
}

function setupMultiToolbar() {
  document.getElementById('multi-download-btn').addEventListener('click', async () => {
    if (showingTrash) restoreSelectedFromTrash();
    else downloadSelectedFiles();
  });

  document.getElementById('multi-move-btn').addEventListener('click', () => {
    if (selectedFiles.size === 0) {
      showToast('Select files to move', 'info');
      return;
    }
    if (selectedFolders.size > 0) {
      showToast('Folders cannot be moved yet', 'info');
    }
    openMoveModal({ ids: Array.from(selectedFiles) });
  });

  document.getElementById('multi-delete-btn').addEventListener('click', async () => {
    if (showingTrash) permanentlyDeleteSelectedFromTrash();
    else if (selectedFolders.size > 0 && selectedFiles.size === 0) {
      showConfirmModal('Delete ' + selectedFolders.size + ' folder(s) and all files inside?', async () => {
        batchDeleteFolders(Array.from(selectedFolders));
      });
    } else if (selectedFolders.size > 0) {
      showConfirmModal('Move ' + selectedFiles.size + ' file(s) to trash and delete ' + selectedFolders.size + ' folder(s)?', async () => {
        batchDeleteFilesAndFolders(Array.from(selectedFiles), Array.from(selectedFolders));
      });
    } else moveSelectedFilesToTrash();
  });

  document.getElementById('multi-cancel-btn').addEventListener('click', exitMultiSelect);
}

function updateMultiToolbarForContext() {
  const downloadBtn = document.getElementById('multi-download-btn');
  const deleteBtn = document.getElementById('multi-delete-btn');
  if (!downloadBtn || !deleteBtn) return;
  const moveBtn = document.getElementById('multi-move-btn');
  if (moveBtn) moveBtn.disabled = selectedFiles.size === 0;
  if (showingTrash) {
    downloadBtn.textContent = 'Restore';
    deleteBtn.textContent = 'Delete';
    downloadBtn.disabled = selectedFiles.size === 0;
    deleteBtn.disabled = selectedFiles.size === 0;
    if (moveBtn) moveBtn.disabled = true;
  } else {
    downloadBtn.textContent = 'Download';
    deleteBtn.textContent = selectedFolders.size > 0 && selectedFiles.size === 0 ? 'Delete' : 'Trash';
    downloadBtn.disabled = selectedFiles.size === 0;
    deleteBtn.disabled = selectedFiles.size === 0 && selectedFolders.size === 0;
    if (moveBtn) moveBtn.disabled = selectedFiles.size === 0;
  }
}

async function downloadSelectedFiles() {
  const ids = Array.from(selectedFiles);
  if (ids.length === 0) return;
  if (await downloadAsZip(ids)) {
    showToast('Downloaded ' + ids.length + ' file(s)', 'success');
    exitMultiSelect();
  }
}

function moveSelectedFilesToTrash() {
  const ids = Array.from(selectedFiles);
  if (ids.length === 0) return;
  if (selectedFolders.size > 0) showToast('Folders cannot be moved to trash yet', 'info');
  showConfirmModal('Move ' + ids.length + ' file(s) to trash?', async () => {
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
}

function restoreSelectedFromTrash() {
  const ids = Array.from(selectedFiles);
  if (ids.length === 0) return;
  showConfirmModal('Restore ' + ids.length + ' file(s) from trash?', async () => {
    let restored = 0;
    await Promise.all(ids.map(async (id) => {
      try {
        const res = await fetch('/api/trash/' + id + '/restore', { method: 'POST' });
        if (res.ok) restored += 1;
      } catch {}
    }));
    showToast('Restored ' + restored + ' file(s)', 'success');
    exitMultiSelect();
    showTrash();
    fetchFiles();
  });
}

function permanentlyDeleteSelectedFromTrash() {
  const ids = Array.from(selectedFiles);
  if (ids.length === 0) return;
  showConfirmModal('Permanently delete ' + ids.length + ' file(s)?', async () => {
    let deleted = 0;
    await Promise.all(ids.map(async (id) => {
      try {
        const res = await fetch('/api/trash/' + id, { method: 'DELETE' });
        if (res.ok) deleted += 1;
      } catch {}
    }));
    showToast('Deleted ' + deleted + ' file(s)', 'info');
    exitMultiSelect();
    showTrash();
  });
}

async function batchDeleteFolders(folderPaths) {
  let deleted = 0;
  await Promise.all(folderPaths.map(async (path) => {
    try {
      const res = await fetch('/api/folders?path=' + encodeURIComponent(path), { method: 'DELETE' });
      if (res.ok) deleted += 1;
      else console.error('Delete folder', path, 'returned', res.status);
    } catch (e) { console.error('Delete folder', path, 'failed:', e); }
  }));
  showToast('Deleted ' + deleted + ' folder(s)', 'info');
  exitMultiSelect();
  fetchFiles();
}

async function batchDeleteFilesAndFolders(ids, folderPaths) {
  try {
    const res = await fetch('/api/files/batch-trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    if (!res.ok) console.error('batch-trash returned', res.status);
  } catch (e) { console.error('batch-trash failed:', e); }
  let deleted = 0;
  await Promise.all(folderPaths.map(async (path) => {
    try {
      const res = await fetch('/api/folders?path=' + encodeURIComponent(path), { method: 'DELETE' });
      if (res.ok) deleted += 1;
      else console.error('Delete folder', path, 'returned', res.status);
    } catch (e) { console.error('Delete folder', path, 'failed:', e); }
  }));
  showToast('Moved ' + ids.length + ' file(s) and deleted ' + deleted + ' folder(s)', 'info');
  exitMultiSelect();
  fetchFiles();
}

// Context menu
function showContextMenu(x, y, ctx) {
  const menu = document.getElementById('context-menu');
  const isFile = ctx.type === 'file';
  const isFolder = ctx.type === 'folder';
  const file = ctx.file;
  const isText = file && isTextFile(file);
  const hasFileSelection = selectedFiles.size > 0;
  const hasFolderSelection = selectedFolders.size > 0;

  let items = '';

  if (multiSelectActive) {
    // Multi-select mode — only group actions
    const hasAnySelectable = hasFileSelection || hasFolderSelection;
    items = `
      <button class="ctx-item" data-action="download" ${hasFileSelection ? '' : 'disabled'}>⬇️ Download</button>
      <button class="ctx-item" data-action="delete" ${hasAnySelectable ? '' : 'disabled'}>🗑 ${hasFolderSelection && !hasFileSelection ? 'Delete' : 'Move to Trash'}</button>
      <div class="ctx-divider"></div>
      <button class="ctx-item" data-action="move" ${hasFileSelection ? '' : 'disabled'}>📂 Move to folder</button>
      <div class="ctx-divider"></div>
      <button class="ctx-item" data-action="cancel">✕ Cancel</button>
    `;
  } else if (isFile) {
    // Single file
    items = `
      <button class="ctx-item" data-action="preview">👁️ View / Preview</button>
      <button class="ctx-item" data-action="download">⬇️ Download</button>
      <button class="ctx-item" data-action="delete">🗑 Move to Trash</button>
      <div class="ctx-divider"></div>
      <button class="ctx-item" data-action="rename">✏️ Rename</button>
      ${isText ? `<button class="ctx-item ctx-placeholder" data-action="edit">📝 Edit</button>` : ''}
      <button class="ctx-item ctx-placeholder" data-action="tags">🏷️ Tags</button>
      <button class="ctx-item" data-action="move">📂 Move to folder</button>
      <div class="ctx-divider"></div>
      <button class="ctx-item" data-action="cancel">✕ Cancel</button>
    `;
  } else if (isFolder) {
    // Folder
    items = `
      <button class="ctx-item" data-action="open">📂 Open</button>
      <button class="ctx-item" data-action="download">⬇️ Download</button>
      <button class="ctx-item" data-action="delete">🗑 Delete</button>
      <div class="ctx-divider"></div>
      <button class="ctx-item" data-action="rename">✏️ Rename</button>
      <button class="ctx-item ctx-placeholder" data-action="tags">🏷️ Tags</button>
      <button class="ctx-item ctx-placeholder" data-action="move">📂 Move to folder</button>
      <div class="ctx-divider"></div>
      <button class="ctx-item" data-action="cancel">✕ Cancel</button>
    `;
  } else if (ctx.type === 'empty') {
    items = `
      <button class="ctx-item" data-action="create-folder">📁 Create new folder</button>
      <div class="ctx-divider"></div>
      <button class="ctx-item" data-action="upload-files">⬆ Upload file/s</button>
      <button class="ctx-item" data-action="upload-folders">⬆ Upload folder/s</button>
    `;
  }

  menu.innerHTML = items;
  menu.style.display = 'block';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  // Keep menu within viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';

  menu.querySelectorAll('.ctx-item').forEach(item => {
    item.addEventListener('click', async () => {
      const action = item.dataset.action;
      if (item.disabled) {
        const message = action === 'move' ? 'Select files to move' : 'Select files first';
        showToast(message, 'info');
        hideContextMenu();
        return;
      }

      if (action === 'preview' && file) {
        openPreview(file);
      } else if (action === 'open' && isFolder) {
        currentFolder = ctx.folderPath;
        currentPage = 1;
        exitMultiSelect();
        fetchFiles();
      } else if (action === 'download') {
        if (multiSelectActive) {
          const ids = Array.from(selectedFiles);
          if (ids.length > 0 && await downloadAsZip(ids)) {
            showToast('Downloaded ' + ids.length + ' file(s)', 'success');
            exitMultiSelect();
          }
        } else if (isFolder) {
          const res = await fetch('/api/files?folder=' + encodeURIComponent(ctx.folderPath) + '&limit=200');
          const data = await res.json();
          const ids = data.files.map(f => f.storedName);
          await downloadAsZip(ids, ctx.folderPath.replace(/[/\\]/g, '_') + '.zip');
        } else {
          const a = document.createElement('a');
          a.href = '/api/files/' + ctx.storedName;
          a.download = '';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else if (action === 'delete') {
        if (multiSelectActive) {
          const ids = Array.from(selectedFiles);
          const folderPaths = Array.from(selectedFolders);
          if (ids.length > 0 && folderPaths.length > 0) {
            showConfirmModal('Move ' + ids.length + ' file(s) and delete ' + folderPaths.length + ' folder(s) to trash?', async () => {
              await batchDeleteFilesAndFolders(ids, folderPaths);
            });
          } else if (ids.length > 0) {
            showConfirmModal('Move ' + ids.length + ' file(s) to trash?', async () => {
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
          } else if (folderPaths.length > 0) {
            showConfirmModal('Delete ' + folderPaths.length + ' folder(s) and all files inside?', async () => {
              await batchDeleteFolders(folderPaths);
            });
          }
        } else if (isFolder) {
          showConfirmModal('Delete this folder and all files inside?', async () => {
            try {
              const res = await fetch('/api/folders?path=' + encodeURIComponent(ctx.folderPath), { method: 'DELETE' });
              if (res.ok) {
                showToast('Folder moved to trash', 'info');
                fetchFiles();
              } else {
                showToast('Failed to delete folder', 'error');
              }
            } catch { showToast('Failed to delete folder', 'error'); }
          });
        } else {
          showConfirmModal('Delete this file?', async () => {
            await fetch('/api/files/' + ctx.storedName, { method: 'DELETE' });
            showToast('File moved to trash', 'info');
            fetchFiles();
          });
        }
      } else if (action === 'rename') {
        if (file) openRenameModal({ type: 'file', file });
        else if (isFolder) openRenameModal({ type: 'folder', folderPath: ctx.folderPath });
        else showToast('Coming soon', 'info');
      } else if (action === 'move') {
        if (multiSelectActive) {
          if (selectedFiles.size === 0) {
            showToast('Select files to move', 'info');
          } else {
            openMoveModal({ ids: Array.from(selectedFiles) });
          }
        } else if (isFile && file) {
          openMoveModal({ ids: [file.storedName] });
        } else {
          showToast('Select files to move', 'info');
        }
      } else if (action === 'create-folder') {
        openCreateFolderModal();
      } else if (action === 'upload-files') {
        document.getElementById('upload-section').style.display = 'block';
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.mode-btn[data-mode="files"]').classList.add('active');
        uploadMode = 'files';
        const input = document.getElementById('file-input');
        input.removeAttribute('webkitdirectory');
        input.removeAttribute('directory');
        input.setAttribute('multiple', '');
        input.value = '';
        input.click();
      } else if (action === 'upload-folders') {
        document.getElementById('upload-section').style.display = 'block';
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.mode-btn[data-mode="folder"]').classList.add('active');
        uploadMode = 'folder';
        const input = document.getElementById('file-input');
        input.removeAttribute('multiple');
        input.setAttribute('webkitdirectory', '');
        input.setAttribute('directory', '');
        input.value = '';
        input.click();
      } else if (action === 'cancel') {
        // just close
      } else if (item.classList.contains('ctx-placeholder')) {
        showToast('Coming soon', 'info');
      }

      hideContextMenu();
    });
  });

  setTimeout(() => {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 0);
}

async function downloadAsZip(ids, filename) {
  if (!ids || ids.length === 0) return false;
  try {
    const res = await fetch('/api/files/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    if (!res.ok) {
      console.error('downloadAsZip: server returned', res.status, res.statusText);
      showToast('Download failed', 'error');
      return false;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'files.zip';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch (err) {
    console.error('downloadAsZip: exception', err);
    showToast('Download failed', 'error');
    return false;
  }
}

function hideContextMenu() {
  document.getElementById('context-menu').style.display = 'none';
}

// ── Preview / Slideshow ──
let previewImages = [];
let previewIndex = -1;

function renderPreview(file) {
  const body = document.getElementById('preview-body');
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

function updateSlideshowNav() {
  const prevBtn = document.getElementById('preview-prev');
  const nextBtn = document.getElementById('preview-next');
  const counter = document.getElementById('preview-counter');
  const isSlideshow = previewImages.length > 1;
  if (isSlideshow) {
    prevBtn.disabled = previewIndex <= 0;
    nextBtn.disabled = previewIndex >= previewImages.length - 1;
    counter.textContent = (previewIndex + 1) + ' / ' + previewImages.length;
    counter.style.display = 'block';
    prevBtn.style.display = 'flex';
    nextBtn.style.display = 'flex';
  } else {
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
    counter.style.display = 'none';
  }
}

function openPreview(file) {
  const modal = document.getElementById('preview-modal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  if (showingTrash) {
    previewImages = [];
    previewIndex = -1;
  } else {
    previewImages = filesState.files.filter(f => f.isImage);
    previewIndex = previewImages.findIndex(f => f.storedName === file.storedName);
  }

  renderPreview(file);
  updateSlideshowNav();
}

function navigatePreview(delta) {
  const newIdx = previewIndex + delta;
  if (newIdx < 0 || newIdx >= previewImages.length) return;
  previewIndex = newIdx;
  renderPreview(previewImages[previewIndex]);
  updateSlideshowNav();
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
  document.getElementById('preview-prev').addEventListener('click', () => navigatePreview(-1));
  document.getElementById('preview-next').addEventListener('click', () => navigatePreview(1));
  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('preview-modal');
    if (modal.style.display !== 'flex') return;
    if (e.key === 'Escape') { closePreview(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); navigatePreview(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); navigatePreview(1); }
  });
}

function closePreview() {
  document.getElementById('preview-modal').style.display = 'none';
  document.getElementById('preview-body').innerHTML = '';
  document.body.style.overflow = '';
  previewImages = [];
  previewIndex = -1;
}

// ── Trash ──
async function showTrash() {
  showingTrash = true;
  trashState.items = [];
  document.getElementById('pagination').style.display = 'none';
  document.getElementById('upload-section').style.display = 'none';
  document.getElementById('trash-section').style.display = 'block';
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  const trashSidebarBtn = document.getElementById('sidebar-trash');
  if (trashSidebarBtn) trashSidebarBtn.classList.add('active');
  updateMultiToolbarForContext();
  try {
    const res = await fetch('/api/trash');
    const items = await res.json();
    trashState.items = items;
    document.getElementById('trash-count').textContent = items.length + ' file' + (items.length !== 1 ? 's' : '') + ' in trash';
    renderTrashGrid(items);
  } catch { showToast('Failed to load trash', 'error'); }
}

function renderTrashGrid(items) {
  const grid = document.getElementById('file-grid');
  grid.style.display = 'grid';
  if (items.length === 0) {
    grid.innerHTML = '<div class="empty-state">Trash is empty</div>';
    return;
  }
  grid.innerHTML = items.map(item => {
    const isSelected = selectedFiles.has(item.storedName);
    const icon = getFileIcon(item.extension, item.mimeType);
    const preview = item.isImage
      ? `<img class="preview" src="${item.url}" alt="${item.originalName}" loading="lazy">`
      : (icon ? `<div class="file-icon">${icon}</div>` : `<div class="file-icon">📄</div>`);
    const selectedClass = isSelected ? ' selected' : '';
    return `
      <div class="file-card trash-card${selectedClass}" data-stored="${escapeHtml(item.storedName)}">
        <div class="check-overlay">✓</div>
        ${preview}
        <div class="file-name">${escapeHtml(item.originalName)}</div>
        <div class="file-meta">${item.sizeFormatted} &middot; ${item.deviceInfo}</div>
        <div class="file-actions trash-actions">
          <button class="restore-btn" data-stored="${escapeHtml(item.storedName)}">Restore</button>
          <button class="perm-delete-btn" data-stored="${escapeHtml(item.storedName)}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.restore-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await fetch('/api/trash/' + btn.dataset.stored + '/restore', { method: 'POST' });
      showToast('File restored', 'success');
      showTrash();
      fetchFiles();
    });
  });
  grid.querySelectorAll('.perm-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const stored = btn.dataset.stored;
      showConfirmModal('Permanently delete this file?', async () => {
        await fetch('/api/trash/' + stored, { method: 'DELETE' });
        showToast('File permanently deleted', 'info');
        showTrash();
      });
    });
  });
  // Click on trash card to open preview
  grid.querySelectorAll('.trash-card').forEach(card => {
    const stored = card.dataset.stored;
    let holdTimer = null;
    let tsX = 0, tsY = 0;
    let tsMoved = false;
    card.addEventListener('touchstart', (e) => {
      if (dragMoveActive) return;
      if (e.target.closest('.trash-actions')) return;
      tsX = (e.touches[0] || {}).clientX || 0;
      tsY = (e.touches[0] || {}).clientY || 0;
      tsMoved = false;
      holdTimer = setTimeout(() => {
        holdTimer = null;
        e.preventDefault();
        enterMultiSelect();
        toggleFileSelection(stored);
      }, 500);
    }, { passive: true });
    card.addEventListener('touchend', () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    });
    card.addEventListener('touchmove', (e) => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (!tsMoved && tsX && tsY) {
        const t = (e.touches[0] || {});
        const dx = (t.clientX || 0) - tsX;
        const dy = (t.clientY || 0) - tsY;
        if (Math.hypot(dx, dy) > 8) tsMoved = true;
      }
    });

    card.addEventListener('click', (e) => {
      if (tsMoved) {
        tsMoved = false;
        return;
      }
      if (e.target.closest('.trash-actions')) return;
      if (dragMoveActive || dragMoveSkipClick) {
        dragMoveSkipClick = false;
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        enterMultiSelect();
        toggleFileSelection(stored);
        return;
      }
      if (multiSelectActive) {
        toggleFileSelection(stored);
        return;
      }
      const item = items.find(f => f.storedName === stored);
      if (item) openPreview(item);
    });
  });
  // Empty area context menu in trash
  grid.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.trash-card')) return;
    e.preventDefault();
    hideContextMenu();
    showContextMenu(e.clientX, e.clientY, { type: 'empty' });
  });
}

function hideTrash() {
  showingTrash = false;
  document.getElementById('trash-section').style.display = 'none';
  document.getElementById('file-grid').style.display = '';
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  const allFilesBtn = document.getElementById('sidebar-all-files');
  if (allFilesBtn) allFilesBtn.classList.add('active');
  setMobileNavActive('all');
  updateMultiToolbarForContext();
  fetchFiles();
}

function setupTrash() {
  document.getElementById('trash-empty-btn').addEventListener('click', async () => {
    showConfirmModal('Permanently delete all files in trash?', async () => {
      await fetch('/api/trash', { method: 'DELETE' });
      showToast('Trash emptied', 'info');
      showTrash();
    });
  });
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function isModalOpen() {
  const modalIds = [
    'preview-modal',
    'confirm-modal',
    'rename-modal',
    'settings-modal',
    'qr-modal',
    'filters-modal',
    'move-modal',
    'oversize-modal'
  ];
  return modalIds.some(id => {
    const el = document.getElementById(id);
    return el && el.style.display === 'flex';
  });
}

function getSelectableCards() {
  const grid = document.getElementById('file-grid');
  if (!grid) return [];
  return Array.from(grid.querySelectorAll('.file-card[data-stored]'));
}

function getSelectableFolders() {
  const grid = document.getElementById('file-grid');
  if (!grid) return [];
  return Array.from(grid.querySelectorAll('.folder-card[data-folder]'));
}

function ensureSelectionBox() {
  if (selectionBox) return selectionBox;
  const grid = document.getElementById('file-grid');
  if (!grid) return null;
  selectionBox = document.createElement('div');
  selectionBox.className = 'selection-box';
  grid.appendChild(selectionBox);
  return selectionBox;
}

function clearSelectionBox() {
  if (selectionBox && selectionBox.parentNode) {
    selectionBox.parentNode.removeChild(selectionBox);
  }
  selectionBox = null;
}

function buildSelectionRect(start, current) {
  const x1 = Math.min(start.x, current.x);
  const y1 = Math.min(start.y, current.y);
  const x2 = Math.max(start.x, current.x);
  const y2 = Math.max(start.y, current.y);
  return { left: x1, top: y1, right: x2, bottom: y2 };
}

function rectsIntersect(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function updateSelectionBoxPosition(rect) {
  const grid = document.getElementById('file-grid');
  if (!grid || !selectionBox) return;
  const gridRect = grid.getBoundingClientRect();
  const left = rect.left - gridRect.left;
  const top = rect.top - gridRect.top;
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
}

function applySelectionFromRect(rect) {
  const cards = getSelectableCards();
  const folders = showingTrash ? [] : getSelectableFolders();
  selectedFiles.clear();
  selectedFolders.clear();
  cards.forEach(card => {
    const cardRect = card.getBoundingClientRect();
    if (rectsIntersect(rect, cardRect)) selectedFiles.add(card.dataset.stored);
  });
  folders.forEach(card => {
    const cardRect = card.getBoundingClientRect();
    if (rectsIntersect(rect, cardRect)) selectedFolders.add(card.dataset.folder);
  });
  updateMultiUI({ skipRender: true });
}

function scheduleDragUpdate() {
  if (dragRafId) return;
  dragRafId = window.requestAnimationFrame(() => {
    dragRafId = null;
    if (!dragSelecting || !dragStart || !dragLastPoint) return;
    const rect = buildSelectionRect(dragStart, dragLastPoint);
    updateSelectionBoxPosition(rect);
    applySelectionFromRect(rect);
  });
}

function startDragSelect(e) {
  if (e.button !== 0) return;
  if (isModalOpen()) return;
  if (e.target.closest('.file-card, .folder-card, .trash-actions')) return;
  dragSelecting = true;
  dragStart = { x: e.clientX, y: e.clientY };
  dragLastPoint = { x: e.clientX, y: e.clientY };
  enterMultiSelect();
  ensureSelectionBox();
  const rect = buildSelectionRect(dragStart, dragLastPoint);
  updateSelectionBoxPosition(rect);
  applySelectionFromRect(rect);
  document.body.classList.add('drag-selecting');
  e.preventDefault();
}

function updateDragSelect(e) {
  if (!dragSelecting) return;
  dragLastPoint = { x: e.clientX, y: e.clientY };
  scheduleDragUpdate();
}

function finishDragSelect() {
  if (!dragSelecting) return;
  dragSelecting = false;
  if (dragRafId) {
    window.cancelAnimationFrame(dragRafId);
    dragRafId = null;
  }
  if (dragStart && dragLastPoint) {
    const rect = buildSelectionRect(dragStart, dragLastPoint);
    updateSelectionBoxPosition(rect);
    applySelectionFromRect(rect);
  }
  dragStart = null;
  dragLastPoint = null;
  clearSelectionBox();
  document.body.classList.remove('drag-selecting');
  updateMultiUI({ skipRender: true });
}

function setupGridContextMenu() {
  const grid = document.getElementById('file-grid');
  if (!grid) return;
  grid.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.file-card')) return;
    e.preventDefault();
    hideContextMenu();
    showContextMenu(e.clientX, e.clientY, { type: 'empty' });
  });
}

function setupDragSelect() {
  const grid = document.getElementById('file-grid');
  if (!grid) return;
  grid.addEventListener('mousedown', startDragSelect);
  grid.addEventListener('mousemove', updateDragSelect);
  document.addEventListener('mouseup', finishDragSelect);
}

function getDragMoveIds() {
  if (selectedFiles.size > 0) return Array.from(selectedFiles);
  return [];
}

function startDragMoveFromCard(e, storedName) {
  if (showingTrash) return;
  if (e.button !== undefined && e.button !== 0) return;
  if (selectedFolders.size > 0) {
    showToast('Folders cannot be moved yet', 'info');
    return;
  }
  if (e.target && e.target.closest && e.target.closest('.folder-card')) return;
  const ids = getDragMoveIds();
  if (ids.length === 0) {
    ids.push(storedName);
    selectedFiles.clear();
    selectedFolders.clear();
    ids.forEach(id => selectedFiles.add(id));
    enterMultiSelect();
    updateMultiUI({ skipRender: true });
  }
  dragMoveActive = true;
  dragMoveIds = ids;
  dragMoveTargetFolder = null;
  document.body.classList.add('drag-move-active');
}

function updateDragMoveTarget(x, y) {
  if (!dragMoveActive) return;
  const el = document.elementFromPoint(x, y);
  const folderCard = el ? el.closest('.folder-card') : null;
  const nextTarget = folderCard ? folderCard.dataset.folder : null;
  if (dragMoveTargetFolder === nextTarget) return;
  dragMoveTargetFolder = nextTarget;
  document.querySelectorAll('.folder-card').forEach(card => {
    card.classList.toggle('drag-target', card.dataset.folder === dragMoveTargetFolder);
  });
}

async function finishDragMove() {
  if (!dragMoveActive) return;
  const target = dragMoveTargetFolder;
  dragMoveActive = false;
  dragMoveIds = [];
  dragMoveTargetFolder = null;
  document.body.classList.remove('drag-move-active');
  document.querySelectorAll('.folder-card').forEach(card => card.classList.remove('drag-target'));
  if (!target) return;
  const ids = Array.from(selectedFiles);
  if (ids.length === 0) return;
  if (ids.length > 1) {
    showConfirmModal('Move ' + ids.length + ' file(s) to ' + target + '?', async () => {
      await moveFilesToFolder(ids, target);
    });
    return;
  }
  await moveFilesToFolder(ids, target);
}

function setupDragMove() {
  const grid = document.getElementById('file-grid');
  if (!grid) return;

  grid.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.file-card[data-stored]');
    if (!card) return;
    e.preventDefault();
  });

  grid.addEventListener('mousedown', (e) => {
    const card = e.target.closest('.file-card[data-stored]');
    if (!card || e.target.closest('.file-actions')) return;
    if (showingTrash) return;
    if (selectedFolders.size > 0) return;
    if (e.ctrlKey || e.metaKey) return;
    if (dragSelecting) return;
    dragMoveCandidate = card.dataset.stored;
    dragMoveMouseStart = { x: e.clientX, y: e.clientY };
  });

  grid.addEventListener('mousemove', (e) => {
    if (dragMoveCandidate && !dragMoveActive && dragMoveMouseStart) {
      const dx = e.clientX - dragMoveMouseStart.x;
      const dy = e.clientY - dragMoveMouseStart.y;
      if (Math.hypot(dx, dy) > 6) {
        startDragMoveFromCard(e, dragMoveCandidate);
        dragMoveCandidate = null;
        dragMoveMouseStart = null;
        dragMoveSkipClick = true;
      }
    }
    if (dragMoveActive) updateDragMoveTarget(e.clientX, e.clientY);
  });

  document.addEventListener('mouseup', () => {
    dragMoveCandidate = null;
    dragMoveMouseStart = null;
    finishDragMove();
  });

  grid.addEventListener('touchstart', (e) => {
    const card = e.target.closest('.file-card[data-stored]');
    if (!card || e.target.closest('.file-actions')) return;
    if (dragSelecting) return;
    if (showingTrash) return;
    if (e.target.closest('.folder-card')) return;
    if (selectedFolders.size > 0) return;
    dragMoveTouchId = e.changedTouches[0].identifier;
    dragMoveStart = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  }, { passive: true });

  grid.addEventListener('touchmove', (e) => {
    if (dragMoveTouchId === null) return;
    const touch = Array.from(e.changedTouches).find(t => t.identifier === dragMoveTouchId);
    if (!touch) return;
    const dx = touch.clientX - dragMoveStart.x;
    const dy = touch.clientY - dragMoveStart.y;
    const dist = Math.hypot(dx, dy);
    if (!dragMoveActive && dist > 8) {
      const card = e.target.closest('.file-card[data-stored]');
      if (!card) return;
      startDragMoveFromCard(e, card.dataset.stored);
      document.body.style.overflow = 'hidden';
      dragMoveSkipClick = true;
    }
    if (dragMoveActive) {
      updateDragMoveTarget(touch.clientX, touch.clientY);
      e.preventDefault();
    }
  }, { passive: false });

  grid.addEventListener('touchend', () => {
    if (dragMoveTouchId === null) return;
    dragMoveTouchId = null;
    dragMoveStart = null;
    if (dragMoveActive) {
      document.body.style.overflow = '';
      finishDragMove();
    }
    if (dragMoveSkipClick) {
      setTimeout(() => { dragMoveSkipClick = false; }, 0);
    }
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target) || isModalOpen()) return;
    const isSelectAll = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a';
    if (isSelectAll) {
      e.preventDefault();
      const cards = getSelectableCards();
      selectedFiles.clear();
      selectedFolders.clear();
      cards.forEach(card => selectedFiles.add(card.dataset.stored));
      if (!showingTrash) {
        const folders = getSelectableFolders();
        folders.forEach(card => selectedFolders.add(card.dataset.folder));
      }
      if (selectedFiles.size > 0 || selectedFolders.size > 0) enterMultiSelect();
      updateMultiUI();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFiles.size > 0) {
      e.preventDefault();
      if (showingTrash) permanentlyDeleteSelectedFromTrash();
      else moveSelectedFilesToTrash();
    }
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
    if (settings.maxFileSize) {
      const sizeMB = Math.round(parseInt(settings.maxFileSize, 10) / (1024 * 1024));
      document.getElementById('settings-max-file-size').value = sizeMB;
    }
  } catch {}

  const concurrencySlider = document.getElementById('concurrency-slider');
  const concurrencyValue = document.getElementById('concurrency-value');
  if (concurrencySlider) {
    const stored = parseInt(localStorage.getItem('uploadConcurrency'), 10);
    const current = Number.isFinite(stored) && stored >= 1 && stored <= 8
      ? stored
      : (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 2 : 4);
    concurrencySlider.value = current;
    if (concurrencyValue) concurrencyValue.textContent = current;
    uploadConcurrency = current;

    concurrencySlider.addEventListener('input', () => {
      const value = parseInt(concurrencySlider.value, 10);
      if (concurrencyValue) concurrencyValue.textContent = value;
      uploadConcurrency = value;
      localStorage.setItem('uploadConcurrency', String(value));
    });
  }

  const modal = document.getElementById('settings-modal');
  document.getElementById('settings-toggle').addEventListener('click', () => {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  });
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('settings-overlay').addEventListener('click', closeSettings);

  document.getElementById('settings-save').addEventListener('click', async () => {
    const trashDays = document.getElementById('settings-trash-days').value;
    const maxFileSizeMB = document.getElementById('settings-max-file-size').value;
    const body = { trashDays: parseInt(trashDays, 10) };
    if (maxFileSizeMB) body.maxFileSize = parseInt(maxFileSizeMB, 10);
    try {
      const res = await fetch('/api/config/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const updated = await res.json();
        if (updated.maxFileSize !== undefined) {
          config.maxFileSize = updated.maxFileSize * 1024 * 1024;
        }
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

// ── Rename modal ──
let renameContext = null;

function nameWithoutExt(filename, ext) {
  if (!ext) return filename;
  if (filename.endsWith(ext)) {
    const base = filename.slice(0, -ext.length);
    return base || filename;
  }
  return filename;
}

function openRenameModal(ctx) {
  const title = document.getElementById('rename-title');
  const input = document.getElementById('rename-input');
  if (ctx.type === 'file') {
    renameContext = { type: 'file', storedName: ctx.file.storedName, extension: ctx.file.extension };
    title.textContent = 'Rename file';
    input.value = nameWithoutExt(ctx.file.originalName, ctx.file.extension);
  } else if (ctx.type === 'folder') {
    const folderName = ctx.folderPath.replace(/\\/g, '/').split('/').pop();
    renameContext = { type: 'folder', oldPath: ctx.folderPath.replace(/\\/g, '/') };
    title.textContent = 'Rename folder';
    input.value = folderName;
  }
  document.getElementById('rename-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  input.focus();
  input.select();
}

function openCreateFolderModal() {
  document.getElementById('rename-title').textContent = 'Create new folder';
  document.getElementById('rename-input').value = '';
  document.getElementById('rename-input').placeholder = 'Folder name';
  renameContext = { type: 'create-folder', parentFolder: currentFolder };
  document.getElementById('rename-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.getElementById('rename-input').focus();
}

function closeRenameModal() {
  renameContext = null;
  document.getElementById('rename-modal').style.display = 'none';
  document.body.style.overflow = '';
}

function setupRenameModal() {
  document.getElementById('rename-save-btn').addEventListener('click', async () => {
    if (!renameContext) return;
    let name = document.getElementById('rename-input').value.trim();
    if (!name) { showToast('Name cannot be empty', 'error'); return; }
    try {
      let res;
      if (renameContext.type === 'create-folder') {
        const folderPath = renameContext.parentFolder ? renameContext.parentFolder + '/' + name : name;
        res = await fetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath })
        });
        if (!res.ok) { showToast('Failed to create folder', 'error'); return; }
        showToast('Folder created', 'success');
        closeRenameModal();
        fetchFiles();
        return;
      } else if (renameContext.type === 'file') {
        name = name + (renameContext.extension || '');
        res = await fetch('/api/files/' + renameContext.storedName + '/rename', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
      } else {
        res = await fetch('/api/folders/rename', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPath: renameContext.oldPath, name })
        });
      }
      if (!res.ok) { showToast('Rename failed', 'error'); return; }
      showToast(renameContext.type === 'file' ? 'File renamed' : 'Folder renamed', 'success');
      closeRenameModal();
      fetchFiles();
    } catch { showToast('Rename failed', 'error'); }
  });
  document.getElementById('rename-cancel-btn').addEventListener('click', closeRenameModal);
  document.getElementById('rename-overlay').addEventListener('click', closeRenameModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('rename-modal').style.display === 'flex') closeRenameModal();
    if (e.key === 'Enter' && document.getElementById('rename-modal').style.display === 'flex') {
      document.getElementById('rename-save-btn').click();
    }
  });
}

function openMoveModal(ctx) {
  moveContext = ctx;
  const select = document.getElementById('move-target');
  const input = document.getElementById('move-new');
  const options = ['__ROOT__'].concat(allFolders);
  select.innerHTML = options.map(folder => {
    if (folder === '__ROOT__') return '<option value="__ROOT__">(Root)</option>';
    return `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`;
  }).join('');
  select.value = '__ROOT__';
  input.value = '';
  document.getElementById('move-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  input.focus();
}

function closeMoveModal() {
  moveContext = null;
  document.getElementById('move-modal').style.display = 'none';
  document.body.style.overflow = '';
}

function sanitizeFolderName(name) {
  return String(name || '').trim().replace(/[/\\]/g, '');
}

async function moveFilesToFolder(ids, folderPath) {
  if (!ids || ids.length === 0) return;
  const res = await fetch('/api/files/batch-move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, folderPath })
  });
  if (!res.ok) {
    showToast('Failed to move files', 'error');
    return;
  }
  const data = await res.json();
  if (data.moved && data.moved.length > 0) {
    showToast('Moved ' + data.moved.length + ' file(s)', 'success');
  }
  if (data.failed && data.failed.length > 0) {
    showToast(data.failed.length + ' file(s) failed to move', 'error');
  }
  exitMultiSelect();
  fetchFiles();
}

function setupMoveModal() {
  document.getElementById('move-cancel-btn').addEventListener('click', closeMoveModal);
  document.getElementById('move-overlay').addEventListener('click', closeMoveModal);
  document.getElementById('move-save-btn').addEventListener('click', async () => {
    if (!moveContext) return;
    const select = document.getElementById('move-target');
    const input = document.getElementById('move-new');
    const newName = sanitizeFolderName(input.value);
    let target = select.value || '';
    if (newName && target) {
      showToast('Choose a folder or enter a new one, not both', 'info');
      return;
    }
    if (newName) {
      try {
        const folderPath = currentFolder ? currentFolder + '/' + newName : newName;
        const res = await fetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath })
        });
        if (!res.ok) {
          showToast('Failed to create folder', 'error');
          return;
        }
        target = folderPath;
        allFolders = Array.from(new Set(allFolders.concat(target))).sort();
      } catch { showToast('Failed to create folder', 'error'); return; }
    }
    if (target === '__ROOT__') target = '';
    const ids = moveContext.ids;
    closeMoveModal();
    await moveFilesToFolder(ids, target);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('move-modal').style.display === 'flex') closeMoveModal();
    if (e.key === 'Enter' && document.getElementById('move-modal').style.display === 'flex') {
      document.getElementById('move-save-btn').click();
    }
  });
}

// ── Confirm modal ──
function showConfirmModal(message, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  document.getElementById('confirm-message').textContent = message;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  function cleanup() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    document.getElementById('confirm-ok-btn').removeEventListener('click', onOk);
    document.getElementById('confirm-cancel-btn').removeEventListener('click', onCancel);
    document.getElementById('confirm-overlay').removeEventListener('click', onCancel);
  }

  function onOk() { cleanup(); if (onConfirm) onConfirm(); }
  function onCancel() { cleanup(); }

  document.getElementById('confirm-ok-btn').addEventListener('click', onOk);
  document.getElementById('confirm-cancel-btn').addEventListener('click', onCancel);
  document.getElementById('confirm-overlay').addEventListener('click', onCancel);
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
    const key = f.name + '|' + f.size + '|' + f.lastModified;
    const isActive = uploadActiveSet.has(key);
    const icon = f.type && f.type.startsWith('image/') ? '🖼' : '📄';
    const nameHtml = isActive
      ? `<span class="pf-name"><span class="spinner"></span>${escapeHtml(f.name)}</span>`
      : `<span class="pf-name">${escapeHtml(f.name)}</span>`;
    const removeBtn = isActive ? '' : `<button class="remove-btn" data-index="${i}">&times;</button>`;
    const statusClass = isActive ? ' uploading' : '';
    return `<div class="pending-file${statusClass}"><span>${icon}</span>${nameHtml}<span class="pf-size">${formatSize(f.size)}</span>${removeBtn}</div>`;
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
    let uploadFolder = currentFolder ? currentFolder.replace(/\\/g, '/') : '';
    if (file.webkitRelativePath) {
      const parts = file.webkitRelativePath.split('/');
      parts.pop();
      const relPath = parts.join('/');
      if (uploadFolder && relPath) uploadFolder = uploadFolder + '/' + relPath;
      else if (relPath) uploadFolder = relPath;
    }
    if (uploadFolder) formData.append('folderPath', uploadFolder);
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
    const fileKey = file.name + '|' + file.size + '|' + file.lastModified;
    if (oversizeAllowSet.has(fileKey)) {
      xhr.setRequestHeader('X-Allow-Oversize', 'true');
    }
    xhr.send(formData);
  });
}

async function uploadPending() {
  const uploadBtn = document.getElementById('upload-btn');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const files = [...pendingFiles];
  const total = files.length;
  let done = 0;
  let failed = 0;
  let activeCount = 0;

  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';
  progressContainer.style.display = 'flex';
  uploadActiveSet.clear();

  const cap = uploadConcurrency;
  const remaining = [...files];
  const active = new Set();

  function updateProgress() {
    progressBar.value = total > 0 ? Math.round(((done + failed) / total) * 100) : 0;
    progressText.textContent = `${done} / ${total} uploaded` + (activeCount > 0 ? ` (${activeCount} active)` : '');
    uploadBtn.textContent = `Uploading ${done + activeCount} / ${total}...`;
  }

  function tryNext() {
    while (remaining.length > 0 && active.size < cap) {
      const file = remaining.shift();
      const key = file.name + '|' + file.size + '|' + file.lastModified;

      activeCount = active.size + 1;
      uploadActiveSet.add(key);
      renderPending();

      const promise = uploadFile(file).then(() => {
        done++;
        const idx = pendingFiles.findIndex(f =>
          f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
        );
        if (idx !== -1) { pendingFiles.splice(idx, 1); }
      }).catch(() => {
        failed++;
        showToast('Failed: ' + file.name, 'error');
      }).finally(() => {
        uploadActiveSet.delete(key);
        active.delete(promise);
        activeCount = active.size;
        updateProgress();
        renderPending();
        if (remaining.length === 0 && active.size === 0) {
          uploadActiveSet.clear();
          oversizeAllowSet.clear();
          uploadBtn.disabled = false;
          uploadBtn.textContent = 'Upload';
          progressContainer.style.display = 'none';
          showToast(done + ' uploaded' + (failed > 0 ? ', ' + failed + ' failed' : ''), done > 0 ? 'success' : 'error');
          fetchFiles();
        } else {
          tryNext();
        }
      });

      active.add(promise);
      updateProgress();
    }
  }

  tryNext();
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

function getOversizedFiles() {
  const maxSize = config.maxFileSize || 1073741824;
  return pendingFiles.filter(f => f.size > maxSize);
}

function showOversizeModal() {
  const oversizeList = getOversizedFiles();
  if (oversizeList.length === 0) return false;

  const maxSize = config.maxFileSize || 1073741824;
  const maxSizeMB = Math.round(maxSize / (1024 * 1024));
  const modal = document.getElementById('oversize-modal');
  const info = document.getElementById('oversize-info');
  const list = document.getElementById('oversize-list');

  info.textContent = `Limit: ${maxSizeMB} MB. Choose which files to upload anyway.`;

  const toggleStates = new Map();
  oversizeList.forEach(f => {
    const key = f.name + '|' + f.size + '|' + f.lastModified;
    toggleStates.set(key, false);
  });

  function renderList() {
    list.innerHTML = oversizeList.map(f => {
      const key = f.name + '|' + f.size + '|' + f.lastModified;
      const allowed = toggleStates.get(key);
      const sizeStr = f.size >= 1073741824
        ? (f.size / 1073741824).toFixed(1) + ' GB'
        : (f.size / 1048576).toFixed(1) + ' MB';
      return `
        <div class="oversize-item">
          <span class="os-name">${escapeHtml(f.name)}</span>
          <span class="os-size">${sizeStr}</span>
          <button class="os-toggle${allowed ? ' allow' : ''}" data-key="${escapeHtml(key)}">${allowed ? 'Upload anyway' : 'Skip'}</button>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.os-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const next = !toggleStates.get(key);
        toggleStates.set(key, next);
        renderList();
      });
    });
  }

  renderList();

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  return new Promise((resolve) => {
    function cleanup() {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      document.getElementById('oversize-upload-btn').removeEventListener('click', onUpload);
      document.getElementById('oversize-cancel-btn').removeEventListener('click', onCancel);
      document.getElementById('oversize-overlay').removeEventListener('click', onCancel);
    }

    function onUpload() {
      cleanup();
      oversizeAllowSet.clear();
      const skippedKeys = new Set();
      toggleStates.forEach((allowed, key) => {
        if (allowed) {
          oversizeAllowSet.add(key);
        } else {
          skippedKeys.add(key);
        }
      });
      if (skippedKeys.size > 0) {
        for (let i = pendingFiles.length - 1; i >= 0; i--) {
          const f = pendingFiles[i];
          const key = f.name + '|' + f.size + '|' + f.lastModified;
          if (skippedKeys.has(key)) pendingFiles.splice(i, 1);
        }
        renderPending();
      }
      resolve('upload');
    }

    function onCancel() {
      cleanup();
      oversizeAllowSet.clear();
      pendingFiles = [];
      renderPending();
      resolve('cancel');
    }

    document.getElementById('oversize-upload-btn').addEventListener('click', onUpload);
    document.getElementById('oversize-cancel-btn').addEventListener('click', onCancel);
    document.getElementById('oversize-overlay').addEventListener('click', onCancel);

    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onEsc);
        onCancel();
      }
    });
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
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pendingFiles.length === 0) return;
    const oversized = getOversizedFiles();
    if (oversized.length > 0) {
      const result = await showOversizeModal();
      if (result === 'cancel') return;
    }
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

function scheduleRefresh() {
  clearTimeout(realtimeDebounce);
  realtimeDebounce = setTimeout(() => {
    if (showingTrash) showTrash();
    else fetchFiles();
    fetchDevices();
    populateDeviceFilter();
  }, 300);
}

function setupRealtime() {
  if (!window.EventSource) return;
  realtimeSource = new EventSource('/api/stream');

  realtimeSource.addEventListener('open', () => {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  });

  realtimeSource.addEventListener('error', () => {
    if (!pollIntervalId) {
      pollIntervalId = setInterval(() => {
        if (!showingTrash) fetchFiles();
      }, 8000);
    }
  });

  realtimeSource.addEventListener('files', scheduleRefresh);
  realtimeSource.addEventListener('trash', scheduleRefresh);
}

function highlightActiveFilters() {
  const toggle = document.getElementById('filters-toggle');
  if (!toggle) return;
  if (hasActiveFilters()) toggle.classList.add('active');
  else toggle.classList.remove('active');
}

function setFilterDraftFromState() {
  filterDraft = { ...filterState };
}

function normalizeFilterValue(value) {
  return (value || '').trim();
}

function normalizeTags(value) {
  const parts = String(value || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
  return parts.join(',');
}

function formatDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatDateValue(date);
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function applyDatePreset(preset) {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let start = new Date(end.getTime());

  if (preset === 'today') {
    // keep start as today
  } else if (preset === 'last7') {
    start.setUTCDate(start.getUTCDate() - 6);
  } else if (preset === 'last30') {
    start.setUTCDate(start.getUTCDate() - 29);
  } else if (preset === 'thisyear') {
    start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
  }

  filterDraft.dateFrom = formatDateValue(start);
  filterDraft.dateTo = formatDateValue(end);
  document.getElementById('filter-date-from').value = filterDraft.dateFrom;
  document.getElementById('filter-date-to').value = filterDraft.dateTo;
}

function syncFilterUIFromDraft() {
  const dateSource = document.querySelectorAll('input[name="date-source"]');
  dateSource.forEach(input => {
    input.checked = input.value === filterDraft.dateSource;
  });

  document.getElementById('filter-date-from').value = formatDateInput(filterDraft.dateFrom);
  document.getElementById('filter-date-to').value = formatDateInput(filterDraft.dateTo);

  document.getElementById('filter-location').value = filterDraft.metaLocation;
  document.getElementById('filter-camera').value = filterDraft.metaCamera;
  document.getElementById('filter-tags').value = filterDraft.tags;

  document.getElementById('filter-extension-custom').value = filterDraft.fileExtension;

  const fileTypeItems = document.querySelectorAll('#filter-filetypes input[type="radio"]');
  fileTypeItems.forEach(input => {
    input.checked = input.value === filterDraft.fileType;
  });

  const extButtons = document.querySelectorAll('#filter-extensions .filters-pill');
  extButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === filterDraft.fileExtension);
  });
}

function captureFilterDraftFromUI() {
  const selectedSource = document.querySelector('input[name="date-source"]:checked');
  filterDraft.dateSource = selectedSource ? selectedSource.value : 'uploaded';
  filterDraft.dateFrom = normalizeFilterValue(document.getElementById('filter-date-from').value);
  filterDraft.dateTo = normalizeFilterValue(document.getElementById('filter-date-to').value);
  filterDraft.metaLocation = normalizeFilterValue(document.getElementById('filter-location').value);
  filterDraft.metaCamera = normalizeFilterValue(document.getElementById('filter-camera').value);
  filterDraft.tags = normalizeTags(document.getElementById('filter-tags').value);
  filterDraft.fileType = normalizeFilterValue(document.querySelector('#filter-filetypes input[type="radio"]:checked')?.value || '');
  const customExtension = normalizeFilterValue(document.getElementById('filter-extension-custom').value);
  const pillExtension = document.querySelector('#filter-extensions .filters-pill.active')?.dataset.value || '';
  filterDraft.fileExtension = customExtension || pillExtension;
}

function hasActiveFilters() {
  const { dateSource, ...rest } = filterState;
  const hasOtherFilters = Object.values(rest).some(value => value);
  if (hasOtherFilters) return true;
  return dateSource && dateSource !== 'uploaded';
}

function renderFilterChips() {
  const container = document.getElementById('filter-chips');
  if (!container) return;

  const chips = [];
  if (filterState.dateFrom || filterState.dateTo) {
    const from = filterState.dateFrom || 'Any';
    const to = filterState.dateTo || 'Any';
    chips.push({ key: 'date', label: `Date ${from} → ${to}` });
  }
  if (filterState.dateSource && filterState.dateSource !== 'uploaded') {
    chips.push({ key: 'dateSource', label: `Date source: ${filterState.dateSource}` });
  }
  if (filterState.metaLocation) chips.push({ key: 'metaLocation', label: `Location: ${filterState.metaLocation}` });
  if (filterState.metaCamera) chips.push({ key: 'metaCamera', label: `Camera: ${filterState.metaCamera}` });
  if (filterState.tags) chips.push({ key: 'tags', label: `Tags: ${filterState.tags}` });
  if (filterState.fileType) chips.push({ key: 'fileType', label: `Type: ${filterState.fileType}` });
  if (filterState.fileExtension) chips.push({ key: 'fileExtension', label: `Ext: ${filterState.fileExtension}` });

  container.innerHTML = chips.map(chip => {
    return `<button class="filter-chip" data-key="${chip.key}"><span>${escapeHtml(chip.label)}</span><span class="chip-remove">×</span></button>`;
  }).join('');

  container.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (key === 'date') {
        filterState.dateFrom = '';
        filterState.dateTo = '';
      } else if (key === 'dateSource') {
        filterState.dateSource = 'uploaded';
      } else {
        filterState[key] = '';
      }
      currentPage = 1;
      exitMultiSelect();
      renderFilterChips();
      fetchFiles();
    });
  });

  if (!hasActiveFilters()) container.innerHTML = '';
  highlightActiveFilters();
}

function openFiltersModal() {
  setFilterDraftFromState();
  syncFilterUIFromDraft();
  const modal = document.getElementById('filters-modal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeFiltersModal() {
  document.getElementById('filters-modal').style.display = 'none';
  document.body.style.overflow = '';
}

async function fetchMetadataOptions() {
  try {
    const res = await fetch('/api/files/metadata-options');
    metadataOptions = await res.json();
  } catch {
    metadataOptions = { dateSources: [], locations: [], cameras: [], tags: [], fileTypes: [], fileExtensions: [] };
  }
}

function ensureUnknownOption(list) {
  const normalized = Array.isArray(list) ? [...list] : [];
  if (!normalized.includes('unknown')) normalized.push('unknown');
  return normalized;
}

function populateFilterOptions() {
  const locationSelect = document.getElementById('filter-location');
  const cameraSelect = document.getElementById('filter-camera');
  const tagList = document.getElementById('filter-tags-list');
  const fileTypeContainer = document.getElementById('filter-filetypes');
  const extensionContainer = document.getElementById('filter-extensions');

  locationSelect.innerHTML = '<option value="">Any location</option>' +
    ensureUnknownOption(metadataOptions.locations || []).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');

  cameraSelect.innerHTML = '<option value="">Any camera</option>' +
    ensureUnknownOption(metadataOptions.cameras || []).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');

  tagList.innerHTML = (metadataOptions.tags || []).map(tag => `<option value="${escapeHtml(tag)}"></option>`).join('');
  if (!tagList.querySelector('option[value="unknown"]')) {
    tagList.insertAdjacentHTML('beforeend', '<option value="unknown"></option>');
  }

  const fileTypes = ensureUnknownOption(metadataOptions.fileTypes || []);
  const fileTypeOptions = [''].concat(fileTypes);
  fileTypeContainer.innerHTML = fileTypeOptions.map((type, idx) => {
    const labelMap = {
      image: 'Picture',
      video: 'Video',
      audio: 'Audio',
      pdf: 'PDF',
      text: 'Text',
      other: 'Other',
      unknown: 'Unknown',
      '': 'Any',
    };
    const label = labelMap[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Any');
    return `
      <label class="filters-checkbox">
        <input type="radio" name="filter-filetype" value="${escapeHtml(type)}" ${idx === 0 ? 'checked' : ''}>
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }).join('');

  extensionContainer.innerHTML = (metadataOptions.fileExtensions || []).map(ext => {
    const value = ext.startsWith('.') ? ext : '.' + ext;
    return `<button class="filters-pill" type="button" data-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`;
  }).join('');
}

function setupFiltersModal() {
  const toggleBtn = document.getElementById('filters-toggle');
  const closeBtn = document.getElementById('filters-close');
  const overlay = document.getElementById('filters-overlay');
  const applyBtn = document.getElementById('filter-apply-btn');
  const clearBtn = document.getElementById('filter-clear-btn');

  toggleBtn.addEventListener('click', openFiltersModal);
  closeBtn.addEventListener('click', closeFiltersModal);
  overlay.addEventListener('click', closeFiltersModal);

  document.querySelectorAll('.filters-pill[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyDatePreset(btn.dataset.preset);
    });
  });

  document.getElementById('filter-extensions').addEventListener('click', (e) => {
    const btn = e.target.closest('.filters-pill');
    if (!btn) return;
    if (filterDraft.fileExtension === btn.dataset.value) {
      filterDraft.fileExtension = '';
    } else {
      filterDraft.fileExtension = btn.dataset.value;
    }
    document.getElementById('filter-extension-custom').value = '';
    syncFilterUIFromDraft();
  });

  document.getElementById('filter-extension-custom').addEventListener('input', (e) => {
    const value = normalizeFilterValue(e.target.value);
    if (value) {
      filterDraft.fileExtension = value;
      document.querySelectorAll('#filter-extensions .filters-pill').forEach(btn => btn.classList.remove('active'));
      return;
    }
    filterDraft.fileExtension = '';
    syncFilterUIFromDraft();
  });

  applyBtn.addEventListener('click', () => {
    captureFilterDraftFromUI();
    filterState = { ...filterDraft };
    currentPage = 1;
    exitMultiSelect();
    renderFilterChips();
    fetchFiles();
    closeFiltersModal();
  });

  clearBtn.addEventListener('click', () => {
    filterDraft = {
      dateSource: 'uploaded',
      dateFrom: '',
      dateTo: '',
      metaLocation: '',
      metaCamera: '',
      tags: '',
      fileType: '',
      fileExtension: '',
    };
    filterState = { ...filterDraft };
    currentPage = 1;
    exitMultiSelect();
    renderFilterChips();
    fetchFiles();
    syncFilterUIFromDraft();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('filters-modal').style.display === 'flex') {
      closeFiltersModal();
    }
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
  setupSidebar();
  setupMobileNav();
  setupMobileNavAutoHide();
  setupPreviewModal();
  setupTrash();
  setupSettings();
  setupMultiToolbar();
  setupRenameModal();
  setupMoveModal();
  setupFiltersModal();
  setupGridContextMenu();
  setupDragSelect();
  setupDragMove();
  setupKeyboardShortcuts();
  // Global keydown for Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (multiSelectActive) exitMultiSelect();
    }
  });
  await fetchDevices();
  populateDeviceFilter();
  await fetchMetadataOptions();
  populateFilterOptions();
  setFilterDraftFromState();
  syncFilterUIFromDraft();
  fetchFiles();
  renderFilterChips();
  setupRealtime();
  pollIntervalId = setInterval(() => {
    if (!showingTrash) fetchFiles();
  }, 8000);
});
