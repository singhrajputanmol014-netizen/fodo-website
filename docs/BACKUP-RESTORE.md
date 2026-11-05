# FODO backup and restore (v50.8)

FODO keeps its data in one Cloudflare D1 database (`fodo-xray`, binding `XRAY_DB`), small state in KV (`CHAT_KV`: sessions,
rate limits, caches; nothing that cannot be rebuilt) and large files in R2 when the `FILES` binding is set (the `biz_files`
table lists every file). The tool is `scripts/backup.mjs`. Nothing in it writes to production.

## Weekly backup (owner or developer, 5 minutes)
1. Create a Cloudflare API token with **D1: Read** for the FODO account. Keep it on your computer only:
   `export CLOUDFLARE_API_TOKEN=...` (never in the repository, never in chat).
2. From the `fodo` folder: `node scripts/backup.mjs export` writes `backups/fodo-xray-<date>.sql` (schema + every row).
3. `node scripts/backup.mjs manifest` writes `backups/files-<date>.json`: id, size and SHA-256 of every file R2 must hold.
4. `node scripts/backup.mjs verify backups/fodo-xray-<date>.sql` restores the export into a scratch SQLite file on your
   computer and prints the integrity check and the row count of every table. It must say `"integrity": "ok"`.
5. Store both files outside the laptop (encrypted drive or a private bucket). They contain personal data: treat them like the
   database itself (DPDP), and delete old copies under the retention you agreed with your lawyer.
6. In the Workspace open **Monitoring → Record a backup** (owner) with the file name and the row total. Monitoring warns when
   the last recorded backup is more than 7 days old.
`backups/` is in `.gitignore`: a backup must never be committed.

Cloudflare also keeps D1 "Time Travel" (point-in-time restore: 30 days on the Workers Paid plan, 7 days on Free): `wrangler d1 time-travel info fodo-xray`.
It is the fastest way back from a bad change made today; the weekly export is for everything else (account loss, a mistake
noticed late, moving providers).

## Restore (decide first, then act)
A restore replaces live data. An owner decides, in writing (Decisions in the Workspace), and the team is told to stop working.
1. **Today's mistake:** `wrangler d1 time-travel restore fodo-xray --timestamp=<ISO time before the mistake>`. Cloudflare
   prints a bookmark of the state before the restore, so this step can itself be undone.
2. **From an export:** create a new database (`wrangler d1 create fodo-xray-restore`), load the file
   (`wrangler d1 execute fodo-xray-restore --remote --file backups/fodo-xray-<date>.sql`), check it with a few queries, then point
   the `XRAY_DB` binding of the Pages project at the new database (Cloudflare dashboard → Pages → fodo-website → Settings →
   Bindings) and redeploy. The old database stays untouched until you delete it.
3. **Files:** compare R2 with `backups/files-<date>.json` (same ids and sizes). A missing file cannot be rebuilt from D1; the
   manifest tells you which client and project to ask for a copy.
4. Sessions live in KV: after a restore everybody signs in again. That is expected.
5. Record what happened as an incident (Risks & incidents) and update the continuity procedure.

## Rehearsal (done for v50.8)
`node scripts/backup.mjs rehearse --state <local wrangler state>` runs the whole drill on a local copy: dump → restore into a
fresh file → compare every table → integrity check.
| Where | Tables | Rows | Result |
| --- | ---: | ---: | --- |
| Local Cloudflare runtime (wrangler pages dev, owner signed in, OS tables created, a task and a procedure written) | 124 | 2,461 | identical, integrity ok, 54 ms |
| Test database of `tests/v508.test.mjs` (every FODO table, 10,000 projects, 50,000 tasks) | 164 | 67,549 | identical, integrity ok (runs in the suite) |

Not rehearsed here: `export` / `manifest` / Time Travel against the production account (this environment has no Cloudflare
access). Run steps 1 to 4 of the weekly backup once yourself and record it in Monitoring; that is the real first rehearsal.
