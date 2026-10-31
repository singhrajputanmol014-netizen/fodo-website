# Deployment system (v28)

| Unit | What | How it changes |
|---|---|---|
| FODO Production | www.fodo.co.in (Pages project `fodo-website`) | merge to `main` only (owner confirms; QA must not be failing) |
| FODO Preview | `<branch>.fodo-website.pages.dev` | every `brain/*` pull request |
| Client Production | `sites.fodo.co.in/<slug>/` + custom domains (Pages project `fodo-sites`, root `sites/`) | **Publish** in the builder = a new published snapshot in D1 (no code deploy) |
| Client Preview | the builder canvas / Preview button (sandboxed) | every edit |

- A client website is never deployed into FODO's codebase. It is data rendered by the sites project.
- **Rollback.**
  - FODO: Engineer → Rollback (a revert PR).
  - Clients: Versions → Restore, then Publish.
- **QA / Operator** run on GitHub Actions (`.github/workflows/fodo-engineer.yml`).
