#!/usr/bin/env python3
"""FODO SEO audit — reads the BUILT site (run build_pages.py first) and writes docs/SEO-AUDIT-REPORT.md.
Checks only what can be verified from files: titles, descriptions, H1s, canonicals, robots meta, Open Graph/Twitter,
JSON-LD validity and banned schema, internal links, image alt text, orphan pages, sitemap coverage and robots.txt.
Anything that needs the live site (indexing, rankings, Core Web Vitals field data, redirects at the edge) is listed as
NOT VERIFIED. Exit code 1 if any ERROR is found.   Usage: python3 scripts/seo_audit.py
"""
import os, re, json, sys, html, datetime
from urllib.parse import urljoin, urlparse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from seo_config import SITE, NOINDEX

SKIP = ("/node_modules", "/tests", "/scripts", "/functions", "/.git", "/docs")
pages = {}
for d, _, fs in os.walk(ROOT):
    if any(x in d.replace(ROOT, "") for x in SKIP): continue
    for f in fs:
        if f.endswith(".html"):
            p = os.path.join(d, f); rel = "/" + os.path.relpath(p, ROOT).replace("\\", "/")
            rel = rel[:-10] if rel.endswith("/index.html") else rel
            rel = rel or "/"
            if rel == "/index.html": rel = "/"
            pages[rel if rel.endswith(("/", ".html")) else rel + "/"] = open(p, encoding="utf8").read()

issues = []   # (level, url, message)
def add(level, url, msg): issues.append((level, url, msg))
rows = []; titles = {}; descs = {}; inbound = {u: 0 for u in pages}
BANNED = re.compile(r'"(aggregateRating|review|Review|award|ratingValue)"')
for u, h in sorted(pages.items()):
    g = lambda rx: (re.search(rx, h, re.S | re.I) or [None, None])[1]
    t = html.unescape(g(r"<title>(.*?)</title>") or ""); d = html.unescape(g(r'<meta name="description" content="([^"]*)"') or "")
    can = g(r'<link rel="canonical" href="([^"]*)"') or ""; rob = g(r'<meta name="robots" content="([^"]*)"') or ""
    h1 = len(re.findall(r"<h1[\s>]", h)); og = len(re.findall(r'property="og:', h)); tw = len(re.findall(r'name="twitter:', h))
    lds = re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S); types = []
    for j in lds:
        try:
            o = json.loads(j); objs = o.get("@graph", [o]) if isinstance(o, dict) else o
            types += [x.get("@type", "?") for x in objs]
        except Exception as e: add("ERROR", u, f"JSON-LD does not parse: {e}")
        if BANNED.search(j): add("ERROR", u, "schema contains rating/review/award markup — not allowed without real, verified data")
    body = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", h.split('<main id="main">')[-1].split("</main>")[0], flags=re.S)
    words = len(html.unescape(re.sub(r"<[^>]+>", " ", body)).split())
    noidx = "noindex" in rob
    if u in NOINDEX:
        if not noidx: add("ERROR", u, "should be noindex")
    else:
        if noidx: add("ERROR", u, "indexable page is marked noindex")
        if not t: add("ERROR", u, "missing <title>")
        elif not 25 <= len(t) <= 60: add("WARN", u, f"title length {len(t)} (aim 30–60)")
        if not d: add("ERROR", u, "missing meta description")
        elif not 110 <= len(d) <= 160: add("WARN", u, f"description length {len(d)} (aim 110–160)")
        if can != SITE + u: add("ERROR", u, f"canonical {can!r} ≠ {SITE + u!r}")
        if h1 != 1: add("ERROR", u, f"{h1} <h1> tags (need exactly 1)")
        if og < 6: add("WARN", u, "incomplete Open Graph tags")
        if tw < 4: add("WARN", u, "incomplete Twitter card tags")
        if "BreadcrumbList" not in types and u != "/": add("WARN", u, "no BreadcrumbList schema")
        if words < 150: add("INFO", u, f"thin static text ({words} words in HTML; the rest is rendered by scripts)")
        titles.setdefault(t, []).append(u); descs.setdefault(d, []).append(u)
    for m in re.finditer(r"<img\b[^>]*>", h):
        if not re.search(r"\balt=", m.group(0)): add("ERROR", u, "image without alt: " + m.group(0)[:80])
    for m in re.finditer(r'href="([^"#?]*)', h):
        l = html.unescape(m.group(1))
        if not l or re.match(r"(https?:|mailto:|tel:|javascript:|data:)", l) or l.startswith("{"): continue
        tp = urlparse(urljoin("https://x" + u, l)).path
        fp = os.path.join(ROOT, tp.lstrip("/")); fp = os.path.join(fp, "index.html") if tp.endswith("/") else fp
        if not os.path.exists(fp): add("ERROR", u, f"broken internal link → {l}")
        if tp in inbound and tp != u: inbound[tp] += 1
    rows.append((u, len(t), len(d), h1, words, ",".join(sorted(set(types))) or "—", t))
for t, us in titles.items():
    if len(us) > 1: add("ERROR", us[0], f"duplicate title shared with {us[1:]}")
for d, us in descs.items():
    if len(us) > 1: add("ERROR", us[0], f"duplicate description shared with {us[1:]}")
for u, n in inbound.items():
    if n == 0 and u not in NOINDEX and u != "/": add("WARN", u, "orphan page (no static internal links)")
# sitemap + robots
sm = open(os.path.join(ROOT, "sitemap.xml")).read(); locs = re.findall(r"<loc>(.*?)</loc>", sm)
if len(re.findall(r"<lastmod>", sm)) != len(locs): add("ERROR", "/sitemap.xml", "every URL needs <lastmod>")
for u in pages:
    if u in NOINDEX:
        if SITE + u in locs: add("ERROR", "/sitemap.xml", f"noindex page listed: {u}")
    elif SITE + u not in locs: add("ERROR", "/sitemap.xml", f"missing {u}")
for l in locs:
    if not l.startswith(SITE + "/"): add("ERROR", "/sitemap.xml", f"non-canonical host: {l}")
rb = open(os.path.join(ROOT, "robots.txt")).read()
if f"Sitemap: {SITE}/sitemap.xml" not in rb: add("ERROR", "/robots.txt", "missing Sitemap line")
if re.search(r"Disallow:\s*/(css|js|assets)\b", rb): add("ERROR", "/robots.txt", "blocks CSS/JS/assets needed for rendering")

errs = [i for i in issues if i[0] == "ERROR"]; warns = [i for i in issues if i[0] == "WARN"]; infos = [i for i in issues if i[0] == "INFO"]
os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
L = [f"# FODO — SEO audit report", "", f"Generated {datetime.date.today().isoformat()} by `scripts/seo_audit.py` from the built files. Canonical host: `{SITE}`.", "",
     f"**{len(pages)} HTML pages · {len(locs)} sitemap URLs · {len(errs)} errors · {len(warns)} warnings · {len(infos)} notes**", "",
     "## Issues", ""]
L += [f"- **{lv}** `{u}` — {m}" for lv, u, m in errs + warns + infos] or ["- None."]
L += ["", "## Pages", "", "| URL | Title len | Desc len | H1 | Static words | Schema | Title |", "|---|---|---|---|---|---|---|"]
L += [f"| `{u}` | {a} | {b} | {c} | {w} | {s} | {html.escape(t)} |" for u, a, b, c, w, s, t in rows]
L += ["", "## NOT VERIFIED (needs the live site or account access)", "",
      "- Apex `fodo.co.in` → `https://www.fodo.co.in` 301 redirect (a Cloudflare Redirect Rule, not in this code).",
      "- Which GA4 property receives data and how it is installed (no GA4 ID is set in `js/config.js`).",
      "- Search Console verification method, indexing status, coverage and rankings.",
      "- Core Web Vitals field data (CrUX). Lab numbers in the release notes are from a local test server without compression or CDN.",
      "- Whether `_headers` rules are applied by Cloudflare Pages as expected (check response headers after deploy).", ""]
open(os.path.join(ROOT, "docs", "SEO-AUDIT-REPORT.md"), "w").write("\n".join(L))
print(f"SEO audit: {len(pages)} pages, {len(errs)} errors, {len(warns)} warnings, {len(infos)} notes → docs/SEO-AUDIT-REPORT.md")
for lv, u, m in errs + warns: print(f"  {lv} {u} — {m}")
sys.exit(1 if errs else 0)
