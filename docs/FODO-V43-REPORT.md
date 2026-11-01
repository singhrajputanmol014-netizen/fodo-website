# FODO v43: Private files in the FODO Workspace

Projects, deliverables and personal files now have real private storage. Before v43, professionals could only paste https links.

## What works

**Where files live**
- **Workspace → Files:** your own files, such as logos, contracts and briefs. The page also lists "Files in your projects". It is in both the client menu and the FODO Pros menu.
- **Inside every project, a Files box:**
  - Drag and drop or choose files, with an upload progress bar.
  - Who uploaded each file (client or professional).
  - Open (images, PDF, audio, video) or Download.
  - New version and Delete.
  - Earlier versions are folded under the latest one.
- **Submit work (professional):** a dialog for a note to the client, the delivered files (tick existing ones or upload new ones there) and Submit for review. The client sees 📎 links on the milestone.

**Who can open what (checked on the server on every download)**
- **Project files:** only that project's client, its professional, and FODO staff. Staff means admin, moderator or finance, read-only. Staff downloads are audited.
- **Personal files:** only their owner. Not even a FODO owner account can open them.
- **Everyone else gets 404.** No answer reveals that a file exists.
- **No public links:** there is no public URL and the storage key never leaves the server.

**Safety**
- **Type checked from the bytes (magic numbers), never the name.**
  - Allowed: JPG, PNG, GIF, WebP, PDF / AI, PSD, MP4 / MOV / WebM, MP3 / M4A / WAV, ZIP, DOCX / XLSX / PPTX, TXT / CSV / SRT.
  - Refused: SVG, HTML, scripts, executables. An HTML file renamed to `.png` is still refused.
- **File names are cleaned.**
- **Download headers:** `nosniff`, a sandbox CSP (PDFs excepted, so the browser's viewer can open them), `no-store`, `no-referrer`, same-origin only, and `attachment`. Only images, PDF, audio and video may open inline. Text always downloads.
- **Upload protection:** same-origin plus a custom header, so a cross-site form can't upload. Upload limits are 120 uploads an hour and 300 a day.
- **Evidence rules:**
  - Files of approved work can't be deleted.
  - Files under client review can't be deleted until the client answers.
  - During a dispute only a FODO admin can remove a project file (for example for abuse), and it is audited.
- **Permission rules:**
  - Only the uploader deletes a file or adds a new version.
  - Only the professional uploads deliverables.
  - Submitting work links only the professional's own files.
- **Audit log:** upload, delete and staff download.

**Storage**

| Mode | When | Per file | Per person |
|---|---|---:|---:|
| Private R2 | `FILES` bucket bound | 95 MB | 2 GB |
| Small-file (KV) | until R2 is connected | 10 MB | 100 MB |

- **Video seeking:** with R2, Range requests work, so video previews can seek.
- **FODO owners** get 5× the quota.
- **Honest wording:** clients are told that bigger files will come when full storage is switched on. Only owners see the technical hint.

## Your setup (to switch on R2)
1. Cloudflare → R2 → Create bucket **`fodo-files`**. Keep it **private**: no public access and no r2.dev URL.
2. In `wrangler.toml`, remove the `# ` in front of the three `FILES` lines at the bottom, then deploy.

Until then, everything works in small-file mode.

## Files
- **New:**
  - `functions/_lib/files.js`.
  - `tests/v43.test.mjs`: 83 checks, run in both KV and R2 mode.
- **Changed:**
  - `functions/api/biz/[[path]].js`: routes `files`, `files/storage`, `files/upload`, `files/<id>/download`, `DELETE files/<id>`.
  - `functions/_lib/biz.js`: Files nav, `projectFor` exported, submit attaches files, project includes `files`.
  - `js/workspace.js`: Files page, project Files box, submit dialog, milestone 📎.
  - `css/workspace.css`.
  - `functions/_lib/helpkb.js`: help article "workspace-files".
  - `wrangler.toml`: R2 instructions.
  - `tests/run.mjs`.
- **Database:** one new table, `biz_files`, created automatically. No change to existing tables.

## Next (not in v43)
- v44: Projects 2.0 (several pros per project, tasks, change requests, refunds, hourly / retainer, time slots).
- File previews / thumbnails and virus scanning would need an outside service. They are not faked.
