# Template system and license engine (v28)

- **Client library.** Only FODO-original templates (`sites/lib/templates.js`, license "FODO Original": commercial ✓, client work ✓, attribution ✗, redistribution ✗). They are built from the builder's own sections, so every template is fully editable and responsive.
- **License record** for every template: `source`, `author`, `license`, `commercial_allowed`, `client_use_allowed`, `attribution_required`, `modification_allowed`, `redistribution_allowed`, `last_verified`. `clientAllowed()` hides anything not cleared for client work.
- **Third-party source registry** (`SOURCES`): Start Bootstrap (MIT), HTML5 UP (CC BY 3.0 — attribution required), BootstrapMade free (client work not allowed → never in the client library), TemplateMo, uiCookies, ThemeWagon, Tooplate, Cruip. The last five are marked *verify* until an owner checks the license page; `last_verified` stays empty until then.
- **Search and recommendation.** Words are matched against name, category, tags, mode and fonts, and each result says why it fits. Semantic or screenshot search is planned.
- **Planned ingestion pipeline** (owner-only, not built yet):
  1. discover
  2. verify the license
  3. download into a quarantine
  4. scan (remove scripts and third-party trackers)
  5. normalise into sections
  6. index
  7. preview

  Nothing is embedded from third-party sites.
