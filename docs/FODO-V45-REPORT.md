# FODO v45: CRM + AI Studio

The Workspace's "Leads" page is now a full **CRM**, and there is a new **AI Studio** for captions, reel scripts, ad copy and UTM links.

## CRM (Workspace → CRM)

The CRM has four tabs: **Contacts · Pipeline · Follow-ups · Website leads**.

**Contacts**
- **Fields:** name, company, email, phone, title, city, tags, notes and source.
- **Clean data:**
  - Emails are checked and saved in lower case.
  - Phones are normalised; a 10-digit number gets +91.
  - Tags are de-duplicated.
- **Duplicates:**
  - The same email or phone is refused as a duplicate, and the answer points to the existing contact.
  - **Find duplicates** shows groups with the same email, phone, or name + company. **Merge** fills empty fields, joins tags and moves deals and activity.
- **Search and filters:** search by name, email, phone or company, with tag filters and counts.
- **Contact page:**
  - Call, WhatsApp and Email buttons.
  - Deals with a stage selector.
  - Activity timeline: note, call, email, meeting, WhatsApp, follow-up.
  - Edit and delete. Delete also removes the contact's deals and activity, after a confirmation.

**Website leads → contacts**
- **Add all to Contacts** turns website form enquiries into contacts.
  - A matching email or phone is added to the existing person.
  - Enquiries without contact details are skipped.
  - Each form is imported only once.
  - The enquiry message goes onto the contact's timeline.
- The old Leads list with statuses and notes is still there, as the **Website leads** tab.

**Pipeline**
- **Stages:** Lead 10 % → Qualified 30 % → Proposal sent 50 % → Negotiation 70 % → Won / Lost.
- **Moving deals:** drag a card to another stage, or use the selector. A stage change is logged on the contact. Lost deals can have a reason.
- **Numbers shown:**
  - Open pipeline.
  - Weighted forecast: value × probability, labelled as an **estimate**.
  - Won in the last 30 days.
  - Win rate over 30 days.

**Follow-ups**
- A follow-up is a dated to-do on a contact.
- The tab lists the next 7 days, overdue first, and you tick them off there.
- Overdue and today's follow-ups also appear in the Workspace **Next best action**.

**CSV**
- **Import:** up to 2 MB and 5,000 rows.
  - Headers are recognised automatically: Name / Full name / First + Last, Email, Phone / Mobile / WhatsApp, Company, City, Tags, Notes, Source.
  - Duplicates and invalid rows are counted and reported.
- **Export:** contacts and deals.
  - A cell that starts with `=`, `+`, `-` or `@` gets a leading `'`, so a spreadsheet can't run a formula from it.
  - Files include a BOM so Excel shows ₹ and Hindi correctly.

**Privacy and search**
- Every row belongs to one user and every query is scoped to it. Another account gets 404.
- Contacts appear in the Workspace search (Ctrl+K).

## AI Studio (Workspace → AI Studio)

| Tab | What it makes |
|---|---|
| Captions | 3 options per request, in the Brand Kit's tone |
| Reel script | A script for a 9:16 video |
| Ad copy | Ad text fitted to one platform's limits |
| UTM links | A tracked landing-page link (no AI) |

**Captions**
- **Choices:** platform (Instagram, Facebook, LinkedIn, X, YouTube, WhatsApp, Threads), format, language (English, Hindi, Hinglish), call to action and offer.
- **Limits:** every option fits the platform: X 280, Instagram 2,200, LinkedIn 3,000, and so on.
- **Hashtags:** cleaned and capped per platform, with a live character count.

**Reel script**
- 15 to 90 seconds.
- Hook, then scenes (time, visual, voice-over, on-screen text), call to action, shot list and music mood.

**Ad copy**

| Platform | Limits |
|---|---|
| Meta | primary 125, headline 40, description 30 |
| Google RSA | headlines 30 (up to 15), descriptions 90 (up to 4) |
| LinkedIn | intro 150, headline 70 |
| TikTok | 100 |

- **Too long:** an ad line that is too long is **dropped, never cut mid-sentence**, and the answer says how many were dropped.
- **Duplicates** are removed.
- **Google minimum:** if Google gets fewer than 3 headlines or 2 descriptions, you are warned.

**Policy check**
- Fixed rules flag:
  - "guaranteed" / 100 % claims;
  - superlatives ("best", "#1", "cheapest");
  - personal-attribute wording ("Are you overweight?", which Meta rejects);
  - health and weight-loss promises;
  - fake urgency;
  - shouting caps;
  - income claims;
  - phone numbers or links inside Google ads.
- These are warnings shown under "Check before you publish". They are not a platform review.

**UTM links**
- Built from the landing page, source, medium, campaign and content.
- Values are cleaned, the page's existing query is kept, and only https links are accepted.

**Save**
- A chosen draft can be saved onto your content item or ad plan in Content & Ads.

**Honest by design**
- The prompts forbid invented prices, offers, awards, numbers and reviews.
- The AI's text is cleaned: no HTML, no markup.
- **Nothing is posted:** ad drafts say "Draft only" and are published from your own ad account.
- **Daily limit:** 30 AI drafts a day per person (owners 300), shown as "X of 30 used today". A failed or refused draft doesn't count.
- **When the AI is down:** the page says so ("AI writing isn't available right now"). An unusable AI answer is an error, never canned text.
- **AI sources:** Workers AI (Llama 3.3 70B, then 3.1 8B), with Groq as a fallback when `GROQ_API_KEY` is set.

## Also in v45
- Content and ad-plan answers no longer include the internal user id.
- Navigation: "Leads / CRM" is now **CRM**, and there is a new **AI Studio** item.

## Files
- **New:**
  - `functions/_lib/crm.js`.
  - `functions/_lib/studio.js`.
  - `tests/v45.test.mjs` (63 checks).
- **Changed:**
  - `functions/api/biz/[[path]].js`: `crm/*`, `studio/*`.
  - `functions/_lib/biz.js`: navigation, Next best action, search, no user ids.
  - `js/workspace.js`, `css/workspace.css`.
  - `tests/run.mjs`.
- **Database:**
  - New tables: `crm_contacts`, `crm_deals`, `crm_acts`.
  - New columns: `copy` on content and ad plans.
  - Everything is created automatically.

## Next (roadmap)
- v46: payout adapters, admin analytics, Brain tools, DPDP privacy (export / delete my data), notification preferences, enforced CSP, migration version table, Firefox / Safari testing.
