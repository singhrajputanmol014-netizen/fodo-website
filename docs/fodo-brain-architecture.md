# FODO Brain — architecture (v28)

Two worlds that never mix:

```
WORLD 1 — FODO INTERNAL                          WORLD 2 — CUSTOMER
owner → /owner-brain → /api/owner-brain/*        customer → /website-builder → /api/sites/*
        (owner session, audited)                          (session, only their own websites)
        ├ Command center, chat, memory, tasks,          └ their website(s) only
        │ social, connectors, automations
        ├ Website Engineer  (FODO's code via GitHub PRs) — docs/website-engineer.md
        ├ Web Operator      (real browser steps on GitHub Actions)
        ├ Research          (web_search, deep_research tools)
        ├ Business X-Ray / Growth Lab tools (existing, called as tools)
        └ Websites          (every builder website: list, check, AI-edit, publish — eng_sites/eng_site_*)
```

- Server code: `functions/api/owner-brain/[[path]].js` → `functions/_lib/brain/*` (orchestrator, tools, models, memory, github, engineer, voice, live, social, google, access, store).
- Every tool has a risk level (0 read · 1 low · 2 external · 3 financial · 4 destructive · 5 never). Level 2 and above return a confirmation card, signed with a server token. Every call is written to `brain_audit`.
- **Success is only reported after real execution.** A tool ran, the change persisted, tests passed, and the expected behaviour was verified (QA, Operator). Plans and previews are labelled as plans and previews.
- **Expected vs actual.** QA and the Web Operator report, for every step, what should happen, what happened and the difference.
- **Follow-ups.** The chat uses the thread history (for example "make the homepage better" followed by "do it"). Anything at level 2 or above still needs a tap on its confirmation card. The card's token is stored only as a hash, so it can't be confirmed by typing.
