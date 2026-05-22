# Hoziri 🏮

**LAN file sharing web app** — upload, preview, download, and manage files across devices on your local network. No cloud, no internet dependency. Just a browser and a local network.

---

## Features

| Feature | Description |
|---|---|
| **Upload** | Drag & drop or browse to upload files. Folder upload supported via toggle. |
| **Clipboard Paste** | Press Ctrl+V to paste screenshots/images directly from clipboard. |
| **Thumbnails** | Auto-generated image thumbnails (200px) via Sharp on upload. |
| **Preview** | Inline preview for images (double-click zoom), video, audio, PDF, text/code. |
| **Search & Filter** | Real-time search by filename, sort by 6 criteria, filter by device. |
| **Pagination** | Server-side paginated file listing for large collections. |
| **Multi-Select** | **Mobile:** press & hold, then tap to select. **Desktop:** Ctrl+click. Floating toolbar or right-click context menu for batch download/delete. |
| **Batch Trash** | Select multiple files and move to trash in one action. |
| **Trash / Undo** | Soft-delete moves files to trash with configurable auto-purge (default 30 days). Restore from trash. |
| **QR Code** | Scan to open the upload page on another device (auto-detects LAN IP, filters VPN/virtual adapters). Hidden on mobile. |
| **Dark Mode** | Toggle dark/light mode. Persists in localStorage. Respects system `prefers-color-scheme`. |
| **Device Detection** | Automatically tags uploads with device info (Windows, macOS, iPhone, Android, etc.) from user-agent. |
| **Device Filter** | Filter files by which device uploaded them. |
| **Copy Link** | Optional per-file copy-to-clipboard link (disabled by default, enable via `COPY_LINK_ENABLED=true`). |
| **Upload Progress** | Per-file upload progress bar with transfer speed (MB/s). |
| **File Stats** | Live file count and total size badge in toolbar. |

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- npm

### Setup

```bash
git clone https://github.com/hornley/hoziri_sls.git
cd hoziri_sls
npm install
```

### Run

```bash
npm start
```

Open **http://localhost:3000** in your browser. Other devices on the same network can access it via the LAN IP shown in the console (e.g., `http://192.168.1.42:3000`).

---

## Configuration

Copy `.env` and adjust values:

```env
PORT=3000              # Server port
HOST=0.0.0.0           # Bind address (0.0.0.0 for all interfaces)
UPLOAD_DIR=uploads     # File storage directory
MAX_FILE_SIZE=1073741824  # Max upload size in bytes (1 GB)
DB_PATH=data/files.db  # SQLite database path
COPY_LINK_ENABLED=false  # Enable copy-link buttons on file cards
TRASH_DAYS=30          # Default trash retention (overridable via UI)
```

Trash retention can also be changed at runtime via the **Settings** gear icon ⚙️ in the web UI header.

---

## Project Structure

```
hoziri_sls/
├── server.js             # Express entry point, mounts routes & middleware
├── package.json
├── .env                  # Environment configuration
├── .gitignore
├── data/
│   └── database.js       # SQLite: files & trash tables, config, paginated queries
├── middleware/
│   └── upload.js         # Multer config: device-slug filenames, folder support
├── routes/
│   └── files.js          # All API routes: CRUD, pagination, trash, config, batch
├── utils/
│   └── fileHelpers.js    # formatSize, buildMetadata, generateThumbnail (Sharp)
├── public/
│   ├── index.html        # Main UI
│   ├── style.css         # Light/dark theme, responsive, all component styles
│   └── app.js            # Client logic: upload, preview, multi-select, pagination
└── uploads/
    ├── .thumbnails/      # Auto-generated image thumbnails
    └── _trash/           # Soft-deleted files
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| **GET** | `/api/files` | Paginated file listing. Query params: `page`, `limit`, `search`, `sort`, `device` |
| **GET** | `/api/files/devices` | List of distinct device names |
| **GET** | `/api/files/:storedName` | Download a file |
| **POST** | `/api/upload` | Upload a file (multipart/form-data via multer) |
| **DELETE** | `/api/files/:storedName` | Soft-delete → move to trash |
| **POST** | `/api/files/batch-delete` | Permanent batch delete |
| **POST** | `/api/files/batch-trash` | Soft-delete batch → move to trash |
| **GET** | `/api/trash` | List trash items |
| **POST** | `/api/trash/:storedName/restore` | Restore from trash |
| **DELETE** | `/api/trash/:storedName` | Permanently delete from trash |
| **DELETE** | `/api/trash` | Empty trash |
| **GET** | `/api/config` | Public config (e.g., `copyLinkEnabled`) |
| **GET** | `/api/config/settings` | User settings (trashDays) |
| **PUT** | `/api/config/settings` | Update settings |
| **GET** | `/api/network-info` | LAN IP for QR code generation |

---

## Multi-Select Usage

### Mobile
Press & hold a file card for ~500ms to enter multi-select mode. Tap other files to toggle selection. A floating toolbar appears at the bottom with **Download All**, **Move to Trash**, and **Cancel**.

### Desktop
- **Ctrl+click** on files to toggle selection.
- **Right-click** any selected file for a context menu with Download / Delete / Cancel.
- The floating toolbar works on desktop too.
- Press **Escape** to exit multi-select mode.

---

## Tech Stack

- **Backend:** Node.js, Express 5, better-sqlite3, multer, Sharp
- **Frontend:** Vanilla HTML/CSS/JS (no build step), QRCode.js (CDN)
- **Database:** SQLite (WAL mode)

---

## License

MIT
