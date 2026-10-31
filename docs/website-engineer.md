# Website Engineer

Full design: [FODO-WEBSITE-ENGINEER-ARCHITECTURE.md](FODO-WEBSITE-ENGINEER-ARCHITECTURE.md).

**Flow:** plan → build (diff + security review) → PR + Cloudflare preview → GitHub Actions QA (8 screen sizes, before/after) → automatic repair (up to 3) → owner deploys → rollback.

**v28 adds:**
- The Web Operator: real browser steps with expected vs actual.
- A **Websites** tab: every builder website, with check / edit / publish.
