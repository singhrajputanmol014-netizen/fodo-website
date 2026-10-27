# ==================================================================================================================
# v9 SEO layer — executed by build_pages.py (exec) right before the pages are written, so it can use every helper.
# Adds: location pages (Delhi HQ, India cities, international), static Insights articles, crawlable hub links,
# central titles/descriptions, entity schema. Nothing here changes the visual design.
# ==================================================================================================================
import re as _r9
from seo_config import (PAGE_META, service_title, ARTICLE_SERVICE, ARTICLE_UPDATED, org_graph, person, provider_ref,
                        ORG_ID, BIZ_ID, FOUNDER_ID, FOUNDER, OG_IMAGE)
from seo_markets import MARKETS, INDIA_CITIES, INTERNATIONAL

def _strip(h): return _r9.sub(r"\s+", " ", _h.unescape(_r9.sub(r"<[^>]+>", " ", h))).strip()

# ---------- location pages for markets ----------
def market_page(slug):
    m = MARKETS[slug]; place = m["place"]
    trail = [("Home", "/"), ("Locations", "/locations/"), (place, f"/locations/{slug}/")]
    svc_links = "".join(f'<li><a href="../../services/{s}/">{X(SVC_NAME[s])}</a> — {X(SENT(next(x["h"] for x in SERVICES if x["slug"] == s)))}</li>' for s in m["svcs"])
    if m["kind"] == "hq":
        rel_h, rel = "Delhi NCR areas we cover", " · ".join(f'<a href="../{k}/">{X(LOCATIONS[k][0])}</a>' for k in m["related"] if k in LOCATIONS)
    else:
        rel_h, rel = ("Other Indian cities we work with" if m["kind"] == "city" else "Other markets we work with"), " · ".join(f'<a href="../{k}/">{X(MARKETS[k]["place"])}</a>' for k in m["related"] if k in MARKETS)
    where = "New Delhi, India · HQ" if m["kind"] == "hq" else "HQ New Delhi · remote-first"
    notes = "".join(f'<h3>{X(h)}</h3><p>{X(t)}</p>' for h, t in m["notes"])
    body = (hero(f"Location · {place}", X(m["h1"]), X(m["lead"]), CTA2,
                 visual=ASIDE("Businesses we help", [(x, "") for x in m["mix"]]),
                 index=IDX([("Based in", where), ("Serving", place if m["kind"] != "country" else m.get("long", place)), ("Start with", "A free growth audit")]))
            + f'<section><div class="container">{crumbs_nav(trail, 2)}<article class="detail">'
            + f'<h2 style="font-size:clamp(28px,4vw,48px)">Growing a business in {X(m.get("long", place))}</h2><p>{X(m["intro"])}</p>'
            + f'<h3>How customers search and buy</h3><p>{X(m["market"])}</p>'
            + f'<h3>What usually works</h3><p>{X(m["works"])}</p>'
            + notes
            + f'<h3>Services we usually start with</h3><ul>{svc_links}</ul>'
            + '<h3>How we work</h3><p>Every engagement starts with the free growth audit: a human review of your website, Google profile, ads, social, content, follow-up and tracking. You get three priorities in order. Then we scope the work, agree the measures and report weekly in plain language. Ad spend always stays in your own accounts.</p>'
            + f'<h3>{X(rel_h)}</h3><p>{rel} · <a href="../">All locations</a></p>'
            + f'<h3>FAQs</h3>{faq_block(m["faqs"], "mf")}'
            + f'<p class="muted"><em>General guidance, not guarantees. Results depend on your offer, market, budget and execution.</em></p>'
            + f'<div class="btn-row">{CTA2}</div></article></div></section>')
    svc = {"@context": "https://schema.org", "@type": "Service", "name": f"Digital marketing for businesses in {m.get('long', place)}", "serviceType": "Digital marketing",
           "url": SITE + f"/locations/{slug}/", "provider": provider_ref(), "areaServed": m["area"]}
    return ("location", f"/locations/{slug}/", T(m["title"]), D_(m["desc"]), body, 2, LD(svc, crumbs_ld(trail), faq_ld(m["faqs"])), ())
for _k in MARKETS:
    pages["mkt-" + _k] = market_page(_k)

# ---------- locations hub: crawlable links to every location page ----------
def _loc_links(keys, src):
    return "".join(f'<li><a href="{k}/">{X(src[k]["place"] if src is MARKETS else src[k][0])}</a></li>' for k in keys)
_hub = list(pages["locations"])
_extra = sec("02", "India", '<div class="panel hud reveal"><p class="muted" style="margin-top:0">Our home market. Delhi is where our headquarters is; every other city is served remote-first.</p><ul class="loc-links cols">' + _loc_links(INDIA_CITIES, MARKETS) + '</ul></div>', cls="loc-hub-india")
_extra += sec("03", "International", '<div class="panel hud reveal"><p class="muted" style="margin-top:0">FODO has one office — our New Delhi headquarters. Everywhere else we work remotely, and we say so on every page.</p><ul class="loc-links cols">'
              + _loc_links(INTERNATIONAL, MARKETS) + '</ul></div>')
_b = _hub[4]; _cut = _b.rfind("<section")
_hub[4] = (_b[:_cut] + _extra + _b[_cut:]) if _cut > 0 else _b + _extra
_hub[4] = _hub[4].replace('<section><div class="container"><div class="section-head reveal"><h2>India</h2>', '<section id="india"><div class="container"><div class="section-head reveal"><h2>India</h2>', 1)
pages["locations"] = tuple(_hub)

# ---------- Delhi NCR area pages sit under the Delhi page ----------
for _k in LOCATIONS:
    _p = list(pages["loc-" + _k])
    _p[4] = _p[4].replace('<a href="../../locations/">Locations</a> / ', '<a href="../../locations/">Locations</a> / <a href="../../locations/delhi/">Delhi NCR</a> / ', 1)
    _p[6] = _p[6].replace('{"@type": "ListItem", "position": 3,', '{"@type": "ListItem", "position": 3, "name": "Delhi NCR", "item": "' + SITE + '/locations/delhi/"}, {"@type": "ListItem", "position": 4,', 1)
    pages["loc-" + _k] = tuple(_p)

# ---------- Insights: one static, crawlable page per article ----------
ART_TITLES = {"traffic-vs-customers": "Why More Traffic Doesn't Mean More Customers", "diagnose-landing-page": "How to Diagnose a Landing Page Before Scaling Ads",
              "small-business-seo-foundation": "Small Business SEO: A Practical Foundation", "social-content-pillars": "How to Choose Social Media Content Pillars",
              "useful-marketing-dashboard": "What a Useful Marketing Dashboard Should Answer", "first-paid-media-experiment": "How to Structure Your First Paid Media Test",
              "positioning-and-conversion": "How Brand Positioning Affects Conversion", "simple-lead-follow-up-system": "A Simple Follow-Up System for Inbound Leads"}
ART_DESC = {"positioning-and-conversion": "Positioning is a conversion lever, not just branding. The clearer visitors are about what you are and who you are for, the faster they decide."}
import datetime as _dt9
def _nice(d): return _dt9.date.fromisoformat(d).strftime("%-d %B %Y")
def _desc_from(body):
    first = " ".join(_strip(x) for x in _r9.findall(r"<p>(.*?)</p>", body, _r9.S)[:3]); out = ""
    for s in _r9.split(r"(?<=[.!?])\s+", first):
        if len(out) + len(s) + 1 > 158: break
        out = (out + " " + s).strip()
    return out or first[:155].rsplit(" ", 1)[0] + "…"
ARTS = _D["articles"]
def article_page(a):
    slug = a["slug"]; url = f"/insights/{slug}/"; words = len(_strip(a["body"]).split()); mins = max(1, round(words / 220))
    title = ART_TITLES.get(slug, a["title"]) + " | FODO"; desc = ART_DESC.get(slug) or _desc_from(a["body"])
    trail = [("Home", "/"), ("Insights", "/insights/"), (a["title"], url)]
    svc = ARTICLE_SERVICE.get(a["cat"], "cro")
    rel = [x for x in ARTS if x["slug"] != slug and x["cat"] == a["cat"]] + [x for x in ARTS if x["slug"] != slug and x["cat"] != a["cat"]]
    body_html = _r9.sub(r"<(/?)h3>", r"<\1h2>", a["body"])
    body = (hero(f"Insights · {X(a['cat'])}", X(a["title"]), X(desc), "")
            + f'<section><div class="container">{crumbs_nav(trail, 2)}<article class="detail art">'
            + f'<p class="mono muted art-by">By <a href="../../about/#founder">{X(FOUNDER)}</a>, Founder of FODO · <time datetime="{a["date"]}">{_nice(a["date"])}</time> · {mins} min read</p>'
            + f'<div class="prose art-body">{body_html}</div>'
            + f'<div class="panel hud art-author"><h2>About the author</h2><p>{X(FOUNDER)} is the founder of FODO, a digital growth agency headquartered in New Delhi. His background spans film and media production, content creation, business development and marketing. <a href="../../about/#founder">More about Anmol</a>.</p></div>'
            + f'<h2 class="art-h">Keep reading</h2><ul>' + "".join(f'<li><a href="../{x["slug"]}/">{X(x["title"])}</a></li>' for x in rel[:3]) + '</ul>'
            + f'<h2 class="art-h">Related service</h2><p><a href="../../services/{svc}/">{X(SVC_NAME[svc])}</a> — {X(SENT(next(x["h"] for x in SERVICES if x["slug"] == svc)))}</p>'
            + f'<div class="btn-row">{CTA2}</div></article></div></section>')
    art = {"@context": "https://schema.org", "@type": "Article", "headline": a["title"][:110], "description": desc, "datePublished": a["date"], "dateModified": max(a["date"], ARTICLE_UPDATED),
           "author": {"@type": "Person", "@id": FOUNDER_ID, "name": FOUNDER, "url": SITE + "/about/#founder"}, "publisher": {"@id": ORG_ID, "@type": "Organization", "name": "FODO", "logo": {"@type": "ImageObject", "url": SITE + "/assets/apple-touch-icon.png"}},
           "mainEntityOfPage": SITE + url, "image": OG_IMAGE, "articleSection": a["cat"], "wordCount": words, "inLanguage": "en"}
    return ("article", url, T(title), D_(desc), body, 2, LD(art, crumbs_ld(trail)) + f'<meta property="article:published_time" content="{a["date"]}"><meta property="article:author" content="{FOUNDER}">', ())
for _a in ARTS:
    pages["art-" + _a["slug"]] = article_page(_a)

# ---------- hubs: static, crawlable cards (the scripts replace them with the same cards, so nothing changes visually) ----------
def _fill(key, grid_id, html):
    p = list(pages[key]); p[4] = p[4].replace(f'id="{grid_id}"></div>', f'id="{grid_id}">{html}</div>', 1); pages[key] = tuple(p)
_fill("insights", "insights-grid", "".join(f'<a class="panel" href="{x["slug"]}/" data-slug="{x["slug"]}" data-cat="{X(x["cat"])}"><span class="tag">{X(x["cat"])}</span><h3 style="margin-top:12px;font-size:20px">{X(x["title"])}</h3><p class="muted" style="margin:0;font-size:13px">{x["date"]}</p><span class="panel-line"></span></a>' for x in ARTS))
_fill("industries", "industries-grid", "".join(f'<a class="panel hud spot" href="{i["slug"]}/"><span class="tag">Industry</span><h3 style="margin-top:12px">{X(i["name"])}</h3><p class="muted" style="margin:0;font-size:14px">{X(i["h"])}</p><span class="panel-line"></span></a>' for i in _D["industries"]))
_fill("work", "work-grid", "".join(f'<a class="panel hud work-card spot" href="{c["slug"]}/"><span class="tag warn">CONCEPT ENGAGEMENT</span><h3 style="margin-top:12px">{X(c["title"])}</h3><p class="muted" style="margin:0;font-size:14px">{X(" · ".join(c["tags"]))} · {X(c["industry"])}</p><span class="panel-line"></span></a>' for c in _D["cases"]))

# ---------- central titles & descriptions (keyword map) ----------
for _key, _p in list(pages.items()):
    _p = list(_p)
    if _p[1] in PAGE_META:
        _p[2], _p[3] = T(PAGE_META[_p[1]][0]), D_(PAGE_META[_p[1]][1])
    elif _p[0] in ("service",) or (_p[1].startswith("/services/") and _p[1] != "/services/"):
        _p[2] = T(service_title(_h.unescape(_p[2]).split(" | ")[0]))
    elif _p[1].startswith("/industries/") and _p[1] != "/industries/":
        _p[2] = T(service_title(_h.unescape(_p[2]).split(" | ")[0]))
    pages[_key] = tuple(_p)

# ---------- entity schema: home graph, founder on About ----------
_LDRE = _r9.compile(r'<script type="application/ld\+json">.*?</script>', _r9.S)
_hp = list(pages["home"]); _hp[6] = _LDRE.sub("", _hp[6]) + LD(org_graph()); pages["home"] = tuple(_hp)
_ab = list(pages["about"]); _ab[6] = _LDRE.sub("", _ab[6]) + LD(dict(person(), **{"@context": "https://schema.org", "description": "Founder of FODO, a digital growth agency headquartered in New Delhi, India."}), crumbs_ld([("Home", "/"), ("About", "/about/")])); pages["about"] = tuple(_ab)

# ---------- breadcrumbs (schema) for top-level pages that had none ----------
for _key, _p in list(pages.items()):
    if _p[1] in ("/", "/thank-you/") or "BreadcrumbList" in _p[6]: continue
    _name = _h.unescape(_p[2]).split(" — ")[0].split(" | ")[0].replace("FODO ", "").strip()
    _parts = [x for x in _p[1].strip("/").split("/") if x]
    _trail = [("Home", "/")]
    if len(_parts) > 1:
        _parent = "/" + _parts[0] + "/"; _pp = next((v for v in pages.values() if v[1] == _parent), None)
        if _pp: _trail.append((_h.unescape(_pp[2]).split(" — ")[0].split(" | ")[0], _parent))
    _trail.append((_name, _p[1]))
    _p = list(_p); _p[6] = _p[6] + LD(crumbs_ld(_trail)); pages[_key] = tuple(_p)

# ---------- FAQ + checklists: pre-rendered (scripts replace them with identical markup) ----------
def _swap(key, old, new):
    p = list(pages[key])
    for i in (4, 6):
        if old in p[i]: p[i] = p[i].replace(old, new, 1); pages[key] = tuple(p); return
    raise SystemExit(f"seo_chunk: placeholder not found in {key}: {old}")
_FQ = _D["faqs"]
_swap("faq", '<div id="faq-list"></div>', '<div id="faq-list">' + "".join(f'<div class="acc" data-cat="{X(f["c"])}"><button type="button" aria-expanded="false" aria-controls="fq{i}">{X(f["q"])}</button><div class="acc-body" id="fq{i}" hidden>{X(f["a"])}</div></div>' for i, f in enumerate(_FQ)) + '</div>')
_swap("faq", '<script type="application/ld+json" id="faq-ld"></script>', '<script type="application/ld+json" id="faq-ld">' + json.dumps(faq_ld([(f["q"], f["a"]) for f in _FQ]), ensure_ascii=False) + '</script>')
_swap("resources", '<div class="container grid g2" id="checklists"></div>', '<div class="container grid g2" id="checklists">' + "".join(
    f'<section class="panel hud checklist" id="{c["id"]}" style="padding-top:24px"><h3>{X(c["name"])}</h3><ul>' + "".join(f'<li>{X(it)}</li>' for it in c["items"]) + '</ul></section>' for c in _D["checklists"]) + '</div>')
# empty JSON-LD placeholder on the hub (articles now have their own pages) is invalid structured data
_ins = list(pages["insights"]); _ins[6] = _r9.sub(r'<script type="application/ld\+json" id="article-ld"></script>', "", _ins[6]); _ins[4] = _r9.sub(r'<script type="application/ld\+json" id="article-ld"></script>', "", _ins[4]); pages["insights"] = tuple(_ins)
