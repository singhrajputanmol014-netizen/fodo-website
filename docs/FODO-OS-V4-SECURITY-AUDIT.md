# FODO OS V4: security audit (Phase 0 audit, part 4)

Scope: the live v47.6.2 code, read against OWASP ASVS themes and the V4 requirements (sections 2.5, 36, 39.4). Findings are rated Pass / Gap / Risk. No penetration test was run; this is a code and configuration review plus the existing security suites.

## 1. What is in place (Pass)

| Control | Evidence |
|---|---|
| Session management | `acct_sessions` with hashed tokens, 30-day expiry, cookie `HttpOnly; Secure; SameSite=Lax`; test-login only when `XRAY_TEST_MODE=1` |
| CSRF | every non-GET in every catch-all requires same origin + JSON content type (raw uploads need `x-fodo-upload: 1`); covered by security suites |
| Rate limiting | KV `count()` on login codes, chat, leads, uploads, calendar feeds, payouts, Brain |
| Authorization (marketplace) | `rolesOf()` + `can()` on every staff route; project / quote / contract / file reads check the party (IDOR suites: v40, v471 to v476) |
| Tenant isolation (Builder) | `siteFor()` rule, `docs/tenant-security.md`, isolation tests |
| Client organizations | outsider reads return 404 (v476 tests) |
| Owner-only settings | pricing, badge rules, commission, staff roles, act-on-behalf, Brain permissions: `isOwner()` on the server |
| Money | provider confirmation before state change, `UPDATE ... WHERE status=?` idempotent guards, webhook signatures (Razorpay / Cashfree), append-only ledger with triggers, Brain level 2 for money, Brain never pays out |
| Files | private, type sniffed from bytes (HTML / SVG / scripts refused), session-signed access, no public URLs, multipart size and part checks |
| Secrets | only Cloudflare secrets; `scripts/check.mjs` greps `js/` for key patterns; CI runs it |
| Headers | HSTS, nosniff, Permissions-Policy, CSP **report-only** on the site, enforced CSP on `/website-builder/*`, `X-Frame-Options: DENY` + no-store on `/owner-brain/*`, noindex on account / brain |
| Audit | `biz_audit` for marketplace staff actions, `brain_audit` for every tool call, job dead-letter audit, 13 exports audited |
| Privacy | export JSON, delete with blockers, `privacy_log`; login codes never stored or shown |
| XSS | all user text rendered through `esc()` helpers in the SPAs; Builder sanitises embeds (`wb` suites) |
| SQL injection | every query uses bound parameters (`.bind(...)`); no string-built values found in `functions/` |

## 2. Gaps against V4 (Gap)

| # | Gap | V4 section | Risk if unaddressed | Fix (phase) |
|---|---|---|---|---|
| S1 | No permission + scope registry; authorization is role-list membership | 2.5, 32 | an employee role cannot be restricted to assigned projects; "viewer" sees everything staff see | Phase 1: `authorize()` with object relation |
| S2 | No deny-by-default for new modules: a new route is open to any signed-in user until a `can()` is added by hand | 32.3 | human error on every new endpoint | Phase 1: the `/api/os` router calls `authorize()` before any module function; a static check fails CI if an `os/` handler lacks it |
| S3 | Admin ≈ broad: `acct_admins.role=admin` gets admin + moderator + finance in the marketplace | 69 (V3), 32 | finance data visible to every admin | Phase 1: `admin` template without `payout.approve` / `system.*`; finance view needs `finance.view` |
| S4 | No per-user session revocation, no "last active", no forced logout on suspension | 12.4, 36 | an offboarded person keeps a valid cookie for up to 30 days | Phase 1: `revokeSessions()`, suspension deletes sessions |
| S5 | No impersonation path: owner debugging a client's view has no audited way | 51 (V3) | ad-hoc workarounds | Phase 1: read-only view-as, KV token, 30 min, audited, writes refused |
| S6 | CSP on the marketing site is **report-only** (inline scripts are used by generated pages) | 36 | an injected script on the public site would run | Phase 8: move the public site's inline scripts to files with nonces, then enforce; Builder already enforced |
| S7 | The `viewer` staff role is "read everything staff see": `can(R, ["admin","finance","viewer"])` guards invoices, payouts, catalog rates, settlements (13 call sites). A read-only role therefore reads finance | 91 (V3), 11, 40 (V3) | a viewer reads margins, rates and payouts through the API | Phase 1: viewer template without `finance.view`; `cleanFor()` strips cost / commission / net at the data layer; test "viewer never receives finance fields" |
| S8 | Audit payloads are free text (`biz_audit.detail`); no before / after, no reason, no session / ip | 4 (V3), 36 | hard to answer "who changed what" | Phase 1: `os_audit` structured; legacy audit kept |
| S9 | No consent records, retention policy, rights-request or grievance workflow (DPDP Act / Rules 2025) | 36 | compliance claim impossible | Phase 7: consent + retention + requests; **legal review required**, the code only provides the workflow |
| S10 | AI tools run with the owner's full identity; no per-tool permission declaration; no cost / token limits per agent; no emergency stop beyond disabling keys | 26.5 | an over-broad prompt could read anything the owner can | Phase 6: tools declare permissions, `authorize()` per call, `os_agents` with limits, kill switch |
| S11 | No idempotency key on client-initiated money / approval writes (payouts have it; quote accept and contract sign rely on status guards) | 14.5, 34 | double submit creates duplicates in new approval / expense flows | Phase 1: `Idempotency-Key` header stored 24 h in KV for every OS write that creates records |
| S12 | Webhook endpoints verify signatures but do not store a replay guard beyond provider id uniqueness | 36 | replay of an old payment event (bounded by unique provider refs today) | Phase 4: `os_webhook_events (provider, event_id UNIQUE)` |
| S13 | No breach / incident procedure documented; no incident log | 29 | no agreed response | Phase 7: risk register + incident log + written procedure (owner signs off) |
| S14 | Production safety: nothing stops a cron key or test mode from being set on production by mistake | 107 (V3) | test-login exposed if `XRAY_TEST_MODE=1` leaks into prod | Phase 1: health probe reports test mode on; `/api/account/test-login` additionally refuses when the host is `www.fodo.co.in` |

## 3. Risks found in the current code (Risk)

| # | Risk | Severity | Note |
|---|---|---|---|
| R1 | `viewer` staff role reads finance lists (S7) | Medium | by design today (owners add viewers knowingly); no money can be moved; information exposure only |
| R2 | 30-day sessions with no revocation (S4) | Medium | mitigated by suspension not existing today (nobody is suspended by code) |
| R3 | Report-only CSP on the public site (S6) | Low | no user-generated HTML is rendered on the public site; the bot escapes output |
| R4 | `help_tickets.token` grants ticket access by link | Low | 40-char random token, single ticket scope, intended for guests |
| R5 | Calendar feed URL is the credential (by design, documented, regenerate / switch off exist) | Low | same model as Google Calendar private URLs |

No critical finding. No evidence of secrets in the repository (`check.mjs` clean, 507 files).

## 4. Security test plan for V4 (added per phase)

- Permission matrix: role × resource × action, allow / 403.
- Negative cases: employee → finance; Pro → internal notes; client → margins; employee edits own role; manager → other department; member → other organization (404); self-approval; granting a permission not held; view-as write; suspended member; disabled module.
- IDOR on every new object kind (task, approval, expense, deliverable, document, ticket, vendor, workflow run).
- Session: revoke-all logs out; suspension invalidates; view-as expires at 30 min.
- Money: idempotency key replay returns the first result; webhook replay ignored; payout blocked while refund unresolved (exists, re-run).
- AI: Brain tool without permission → refused and audited; assistant cannot read finance for a designer; emergency stop blocks every tool.
- Files: context file inherits parent permission; signed URL expiry.
- Existing suites rerun every phase (IDOR, CSRF, rate limits, tenant isolation, Brain levels).
