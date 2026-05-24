# Hoziri

LAN file sharing web app — upload, preview, download, and organize files across devices on your local network. No cloud, no internet dependency.

## Features

- Upload files, folders, and clipboard images
- Inline previews for images, video, audio, PDF, and text
- Search, sort, filters (device, date, metadata)
- Drag-select and multi-select actions
- Move-to-folder with breadcrumb navigation
- Context menu actions (rename, download, delete)
- Batch trash, restore, and auto-purge
- QR code to open on another device
- Live updates without refresh
- Optional copy-link buttons and dark mode

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

Open **http://localhost:3000** in your browser. Other devices on the same network can access it via the LAN IP shown in the console.

### Tray App (Windows, optional)

Run the server from the system tray without keeping a console open.

```bash
pip install pystray pillow
pythonw tools\hoziri_tray.py
```

If `npm` is not on PATH, set `NPM_PATH` to your npm executable before launching. Logs are written to `logs\tray.log`.

## Configuration

Copy `.env` and adjust values:

```env
PORT=3000
HOST=0.0.0.0
UPLOAD_DIR=uploads
MAX_FILE_SIZE=1073741824
DB_PATH=data/files.db
COPY_LINK_ENABLED=false
TRASH_DAYS=30
```

Trash retention can also be changed at runtime via the Settings gear icon in the web UI.

## Project Structure

```
hoziri_sls/
├── server.js
├── package.json
├── .env
├── data/
├── middleware/
├── routes/
├── utils/
├── public/
└── uploads/
```

## API

Key endpoints:

- `GET /api/files`
- `POST /api/upload`
- `GET /api/files/:storedName`
- `DELETE /api/files/:storedName`
- `GET /api/trash`
- `POST /api/trash/:storedName/restore`
- `GET /api/config`
- `GET /api/network-info`

## Tech Stack

- Backend: Node.js, Express 5, better-sqlite3, multer, Sharp
- Frontend: Vanilla HTML/CSS/JS
- Database: SQLite (WAL mode)
