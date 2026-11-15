# FODO v51.3 report: co-founder Rohit Saini on the website

Owner asked (15 Nov 2026) to add Rohit Saini as co-founder with his LinkedIn
(https://www.linkedin.com/in/rohit-saini-7748a6280), phone +91 89014 92884 and email rohit@fodo.co.in.
LinkedIn could not be opened from this session (the browser extension's safety check kept failing), so the bio uses
the background Rohit has stated directly (marketing across consumer appliances, agribusiness / Agricul, corporate
travel; web, e-commerce, HRMS, CRM, analytics and AI automation; MBA Marketing + IT; B.Tech ECE). If the LinkedIn
wording should be mirrored more closely, it is a one-line copy edit in `scripts/build_pages.py`.

Where he now appears:
- **/about/**: section renamed "Founders"; a full co-founder block (`#cofounder`) below Anmol's, with bio,
  Background panel, LinkedIn / email / call buttons; Person JSON-LD for both founders (seo_chunk).
  Title: "About FODO: Founders Anmol Singh & Rohit Saini".
- **Home**: sec 05 lead now "Anmol Singh, Founder · Rohit Saini, Co-founder" with a line on what Rohit brings;
  "Meet the founders"; the home ProfessionalService LD lists both founders.
- **/contact/**: Rohit's email, phone and LinkedIn added to the contact card under "Rohit Saini · Co-founder".
- **Entity graph** (`seo_config.py`): `cofounder_person()` (#cofounder) with email/phone/sameAs; Organization
  `founder` is now both people; a second sales ContactPoint carries Rohit's email and phone.
- **js/config.js**: coFounderName / Title / Email / Phone / LinkedinUrl (single source of truth).
- **Site bot** (`js/bot-kb.js`): "Who runs FODO?" now names both.

Tests after the change, all green: check.mjs OK (604 files) · v5-pages 668/668 · v9-seo 137/137 ·
bot-regression 547/547 · design-smoke 23/23 · v6-features 40/40 · seo_audit: same 11 pre-existing shell
errors as v51.1, none on changed pages. No backend change, SCHEMA_VERSION untouched. No test deleted or skipped.


## v51.3 addendum: both numbers for call AND WhatsApp
Owner follow-up: Anmol and Rohit both reachable by call and WhatsApp everywhere contact details appear.
- Footer (static `STATIC_FOOTER` and the JS footer in `js/main.js`, kept in sync): "Anmol · +91 7827007676" +
  "WhatsApp Anmol" and "Rohit · +91 89014 92884" + "WhatsApp Rohit", plus both emails in the static footer.
- /contact/ card: WhatsApp Rohit link added next to his call link.
- /about/ co-founder block: WhatsApp Rohit button added.
- `js/config.js`: coFounderWhatsappNumber.
- Test updated for the intentional change: `design-smoke` "WhatsApp links point to FODO number" now accepts
  either founder's number (was Anmol-only). All suites re-run green: v5-pages 668/668, v9-seo 137/137,
  v6-features 40/40, design-smoke 23/23, bot-regression 547/547, check.mjs OK (605 files).
