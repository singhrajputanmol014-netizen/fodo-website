# Owner Brain in v34

## Unchanged protections

- **Access:** owner-only (validated on the server); members only get the permissions an owner grants.
- **Tools:** only registered tools, with no raw SQL, shell or arbitrary fetch.
- **Confirmation levels:**

  | Level | Meaning |
  |---|---|
  | 0 | read |
  | 1 | low-risk write |
  | 2 | external |
  | 3 | financial |
  | 4 | destructive |
  | 5 | never |

  Levels 2 and up need a confirmation card.
- **Logging:** audit log on every tool call; secrets are redacted.
- **Self-modification:** the Brain never changes its own production code by itself.

This maps to the four classes in the brief: READ = 0, LOW-RISK WRITE = 1, HIGH-RISK WRITE = 2–3, DESTRUCTIVE = 4 (always confirmed).

## Brain and the Website Builder (structured APIs only)

| Ask | Tool | Level |
|---|---|---|
| "Create a services page" / "Add an FAQ" / "Make the hero more premium" (on an existing site) | `eng_site_edit`: AI ops validated by the builder (`add` / `update` / `theme` …), saved as a DRAFT version; raw HTML and other sites are rejected | 1 |
| "Run a website health audit" | `eng_site_audit`: the 7-score audit (v32) | 0 |
| "Fix what can be fixed" | `eng_site_fix`: the audit's safe auto-fixes, saved as a draft | 1 |
| "Is this site working / slow?" | `eng_site_check`: live HTTP, quality checks, domain / SSL | 0 |
| "Publish it" | `eng_site_publish`, after the quality checks | 2, confirmation required |

Responsive measuring needs a real browser, so "fix the mobile layout" is not a Brain tool. Use Make Responsive or Responsive
health in the builder.

## Voice (v33 fixes, still in v34)

- **Mic button = mute:** the live session stays open and sends `audioStreamEnd`. "End" closes it.
- **Microphone:** the mic opens once per tap (no doubled audio).
- **Connecting:** the first connection is retried once, and a phone that needed the plain session goes straight to it.
- **Orb:** the voice orb always gets a fresh canvas, so the old 2-D animation no longer appears.
