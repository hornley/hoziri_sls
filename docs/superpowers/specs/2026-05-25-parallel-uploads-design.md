# Parallel Client-Side Upload Queue

## Architecture

- New `UploadPool` module in `public/app.js` — a concurrency-limited promise pool
- Existing `POST /api/upload` server endpoint — no changes
- New setting in existing Settings modal — slider for concurrency cap (1–8, default 4)
- Setting persisted to `localStorage` under key `uploadConcurrency`

## UploadPool Module

| Item | Detail |
|------|--------|
| `queue` | Remaining files to upload |
| `active` | In-flight requests (capped by concurrency) |
| `completed` / `failed` | Counters for final toast |
| `enqueue(files, folder)` | Add to pool, start dispatch loop |
| `setCap(n)` | Change concurrency on the fly |
| `cancelAll()` | Abort all in-flight, clear queue |
| `onProgress(done, total)` | Callback to update UI |

Internal loop: while `queue.length > 0` and `active.size < cap`, shift a file, create `FormData` POST to `/api/upload`, track the promise. On resolve/reject, increment counters, update UI, dispatch next.

## UI Changes

### Settings modal
- New row: `<input type="range" min="1" max="8">` + numeric display `<span>4</span>`
- Auto-saves to `localStorage` on change

### Upload progress area
- Replace single "X of Y" text with "Uploading X of Y (Z active)"
- Show in-progress file names with spinners
- Final toast: "N uploaded, M failed"

## Files Changed

- `public/app.js` — add UploadPool class, replace upload loop, wire settings
- `public/index.html` — add concurrency slider to settings modal
- `public/style.css` — minimal new styles for progress queue

## No Changes

- `server.js`
- `routes/files.js`
- `middleware/upload.js`
- `utils/fileHelpers.js`
