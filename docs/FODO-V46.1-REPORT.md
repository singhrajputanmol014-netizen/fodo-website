# FODO v46.1: Privacy (DPDP), notification settings, migration table, admin analytics

The first half of the v46 hardening phase.

## 1. Settings & privacy (Workspace → Settings & privacy)

The page is available to clients and FODO Pros.

**Download my data**
- Gives you one JSON file with everything FODO keeps about you:
  - account and events;
  - payments (orders, ledger, subscriptions);
  - X-Rays and tool runs, monitoring;
  - websites (full content), their form submissions and orders;
  - Brand Kit, content, ad plans, shortlist, notifications and notification settings;
  - FODO Pro profile, packages, portfolio, payouts;
  - projects with **your own** messages, the files list, CRM, support tickets, and the privacy log.
- **Not in the file:**
  - no secrets, no session or login-code data, and no other people's emails;
  - file contents are not inside the JSON; download them from Files.
- **Limits:** 5 downloads a day, same-origin only, and every download is logged.

**Delete my account**
- **Confirmation:** you type DELETE, then confirm once more.
- **Erased:**
  - CRM, Brand Kit, content, ad plans, shortlist, notifications, notification settings, X-Ray action lists, Search Console link, monitoring;
  - personal files (bytes and rows).
- **Websites:** taken offline and removed, with their content and form submissions (the visitors' data).
- **Removed or anonymised:**
  - your project messages are replaced with "Message removed (account deleted)"; the other person keeps the project;
  - the FODO Pro profile is anonymised and archived;
  - support tickets lose your name and email;
  - the email log loses your address;
  - you are signed out everywhere.
- **Kept by tax law, without your name, email or phone:** payments, invoices, payouts and refunds. The account row stays only as an anonymous key (`deleted+<id>@deleted.fodo.invalid`, blocked).
- **A deletion waits while:**
  - a paid milestone is in progress;
  - a refund to you is processing;
  - FODO still owes you a payout (so you don't lose money);
  - a dispute is open;
  - auto-renew is on.

  The page lists these reasons before you try. Owner accounts can't be deleted.
- **After deleting:**
  - a confirmation email goes to the old address, and the deletion is in the privacy log;
  - signing up again with the same email starts a fresh, empty account.

## 2. Notification settings

| Category | Default |
|---|---|
| Projects | Email right away |
| Payments & refunds | Email right away |
| Messages & files | Daily summary |
| CRM follow-ups | Daily summary |
| Account & profile | Email right away |
| FODO news | In the app only |

- **Choices:** for each category, "Email right away", "Daily summary" or "In the app only". Everything always stays in the 🔔 bell.
- **Instant emails:** sent through Resend (only when `RESEND_API_KEY` is set). They include a link to the item and a link to these settings. They are limited to 20 an hour per person; anything above that waits for the bell and the digest.
- **Daily summary:** one email a day per person, from the existing scheduler (`POST /api/monitor/tick`, after the monitoring run). It includes unread updates in "daily" categories plus CRM follow-ups that are due or overdue. It runs once per day, and deleted or blocked accounts get nothing.

## 3. Migration version table
- **What changed:** every database change (ALTER, index) now runs **once** and is recorded in `schema_migrations`. Before, the whole list was retried on every server start.
- **Errors:**
  - "Duplicate column" or "already exists" counts as applied.
  - Any other error, such as a missing table, is retried next time.
- **Where it is used:** accounts, Website Builder, store and Workspace (biz) migrations.
- **Result:** faster cold starts and fewer database calls.

## 4. Admin analytics (Workspace → Marketplace admin → Analytics, now the first tab)

The tab is for owners, admins, finance and viewers. It is computed live from FODO's own tables; nothing is estimated, and a part that isn't used yet shows 0.

- **People:**
  - accounts, with +N this week;
  - new in 30 days;
  - active in 7 days;
  - paying now;
  - deleted accounts are counted separately.
- **Money (30 days):**
  - plan and tool sales, by kind;
  - marketplace GMV;
  - commission;
  - refunds and open refunds;
  - held in escrow;
  - owed to pros.
- **Charts:** 30-day bars for sign-ups, sales and GMV, with every day present.
- **Funnel:** of the people who signed up in 30 days, how many used a tool and how many paid.
- **Products:**
  - websites (live, new) and website leads;
  - X-Rays;
  - CRM contacts and how many people use it;
  - CRM open deal value;
  - AI drafts today;
  - private files (count and MB);
  - new projects.

## Files
- **New:**
  - `functions/_lib/privacy.js`, `alerts.js`, `analytics.js`.
  - `tests/v46.test.mjs` (46 checks).
- **Changed:**
  - `functions/_lib/accounts.js`: `migrateOnce`, `acct_users.deleted_at`.
  - `biz.js`: `notify` sends email per settings; Settings nav; `migrateOnce`.
  - `sites.js`, `shop.js`: `migrateOnce`.
  - `functions/api/biz/[[path]].js`: `settings/notify`, `privacy`, `privacy/export`, `privacy/delete`, `admin/analytics`.
  - `functions/api/monitor/tick.js`: daily digest.
  - `js/workspace.js`, `css/workspace.css`.
  - `helpkb.js`: help article "my-data".
- **Database:** new tables `privacy_log`, `biz_notify_prefs`, `schema_migrations`, all created automatically.

## Next: v46.2
Payout adapters (Razorpay Route / Cashfree Payouts), Brain tools (refunds, payouts, disputes, analytics), enforced CSP, Firefox / Safari testing.
