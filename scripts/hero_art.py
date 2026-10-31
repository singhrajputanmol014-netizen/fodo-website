"""Art-directed hero visuals for every FODO page.
One visual language: glass objects (the same material as the home-page lens) arranged into ONE idea per page,
drawn in HTML/CSS + inline SVG. Every label shown comes from the site's real content (no fake numbers, no fake UI data).
"""
import html as _h

def _e(s): return _h.escape(str(s), quote=True)

def g(x, y, w, h, cls="", inner="", r=None, d=0):
    """A glass object positioned in % of the square art box. d = entrance order."""
    cls = " ".join("g-" + c for c in cls.split())
    st = f"left:{x}%;top:{y}%;width:{w}%;height:{h}%;--d:{d}"
    if r is not None: st += f";--gr:{r}"
    return f'<span class="g {cls}" style="{st}">{inner}</span>'

def t(s, cls=""): return f'<span class="gt{"" if not cls else " gt-" + cls}">{_e(s)}</span>'

ICON = {
    "check": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    "play": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    "lock": '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    "search": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4.2-4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    "quote": '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 30c0-9 5-15 13-17l1.5 3.4C17.8 18 15.6 21 15.4 24H21v12H8zm19 0c0-9 5-15 13-17l1.5 3.4C36.8 18 34.6 21 34.4 24H40v12H27z" fill="currentColor"/></svg>',
    "pin": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" fill="currentColor"/><circle cx="12" cy="10" r="2.4" fill="#fff"/></svg>',
    "bolt": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" fill="currentColor"/></svg>',
}

def art(kind, **k):
    parts = []
    if kind == "orbit":            # Services, 20 services, 7 pillars, one connected system
        pillars = k.get("pillars", [])
        parts.append('<span class="ring" style="--s:92%"></span><span class="ring" style="--s:64%"></span><span class="ring" style="--s:36%"></span>')
        import math
        n = max(1, len(pillars))
        for i, p in enumerate(pillars):
            a = -math.pi / 2 + i * 2 * math.pi / n
            x, y = 50 + 46 * math.cos(a), 50 + 46 * math.sin(a)
            parts.append(g(x - 15, y - 5.5, 30, 11, "pill", t(p), r="999px", d=i + 2))
        parts.append(g(34, 34, 32, 32, "disc ink", t("One system", "big"), r="50%", d=1))
    elif kind == "steps":          # About, the six-stage Growth System, rising
        for i, s in enumerate(k.get("steps", [])):
            h = 16 + i * 11
            parts.append(g(4 + i * 15.6, 88 - h, 13.5, h, "col" + (" ink" if i == len(k["steps"]) - 1 else ""), t(s, "vert"), r="16px", d=i + 1))
        parts.append('<span class="base"></span>')
    elif kind == "stack":          # Work, three concept case studies, fanned
        cs = k.get("cases", [])[:3]
        for i, c in enumerate(cs):
            head, _, tail = c.partition(": ")
            parts.append(g(8 + i * 9, 10 + i * 17, 70, 44, "card tilt%d" % i + (" front" if i == len(cs) - 1 else ""),
                           f'<span class="tag-g">Concept</span><span class="gt gt-h">{_e(head)}</span><span class="gt gt-s">{_e(tail)}</span>', r="22px", d=i + 1))
    elif kind == "quote":          # Reviews, verified client words only
        parts.append(g(14, 16, 72, 58, "card big-quote", f'<span class="qi">{ICON["quote"]}</span>' + t("Real clients. Written approval. Nothing else.", "q"), r="30px", d=1))
        parts.append(g(52, 66, 38, 13, "pill ink", t("Verified only"), r="999px", d=2))
    elif kind == "dial":           # Growth Score, a 0–100 dial
        parts.append(g(10, 10, 80, 80, "disc dial", '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" class="trk"/><circle cx="50" cy="50" r="40" class="arc"/></svg>' + t("0–100", "big") + t("10 questions", "sub"), r="50%", d=1))
        parts.append(g(62, 74, 34, 12, "pill", t("Your biggest opportunity"), r="999px", d=2))
    elif kind == "sliders":        # ROI calculator, inputs you move
        for i, (lab, pos) in enumerate([("Ad spend", 38), ("Visitors", 62), ("Conversion", 24)]):
            parts.append(g(8, 14 + i * 24, 84, 16, "track", t(lab, "lab") + f'<span class="knob" style="--p:{pos}%"></span>', r="999px", d=i + 1))
        parts.append(g(40, 82, 52, 12, "pill ink", t("Scenario, not a promise"), r="999px", d=4))
    elif kind == "play":           # Game, four rounds
        parts.append(g(22, 14, 56, 56, "disc ink play", f'<span class="pi">{ICON["play"]}</span>', r="50%", d=1))
        for i, s in enumerate(["Spot", "Fix", "Save", "Grow"]):
            parts.append(g(4 + i * 24, 78, 20, 12, "pill", t(s), r="999px", d=i + 2))
    elif kind == "quiz":           # Quiz, one question, three answers
        parts.append(g(8, 8, 84, 30, "card", t("Question 7 of 10", "s") + t("GA4 shows double the conversions of your CRM. Likely issue?", "h"), r="22px", d=1))
        for i, (s, on) in enumerate([("Tag firing twice", 1), ("CRM is wrong", 0), ("Ignore it", 0)]):
            parts.append(g(8, 44 + i * 16, 84, 12.5, "pill" + (" ink" if on else ""), t(s), r="999px", d=i + 2))
    elif kind == "checklist":      # Resources, tick, copy, print
        for i, (s, done) in enumerate([("Headline repeats the ad promise", 1), ("One primary call to action", 1), ("Loads fast on mobile data", 0), ("Every event tracked", 0)]):
            parts.append(g(8, 10 + i * 20, 84, 15, "row" + (" done" if done else ""), f'<span class="tick">{ICON["check"] if done else ""}</span>' + t(s), r="18px", d=i + 1))
    elif kind == "page":           # Insights, an article, not a feed
        parts.append(g(16, 6, 62, 80, "sheet", t("Insight", "s") + t("Why more traffic does not mean more customers", "h") + '<span class="ln"></span><span class="ln"></span><span class="ln short"></span>', r="20px", d=1))
        parts.append(g(56, 60, 34, 34, "disc lensy", f'<span class="pi">{ICON["search"]}</span>', r="50%", d=2))
    elif kind == "cloud":          # Industries, seven playbooks
        pos = [(2, 8), (50, 8), (10, 28), (56, 28), (0, 48), (46, 48), (18, 68)]
        for i, (name, (x, y)) in enumerate(zip(k.get("names", []), pos)):
            parts.append(g(x, y, 44, 13, "pill" + (" ink" if i == 0 else ""), t(name), r="999px", d=i + 1))
    elif kind == "bubbles":        # FAQ, questions answered plainly
        parts.append(g(6, 10, 66, 30, "bubble l", t("Who controls the ad budget?"), r="26px", d=1))
        parts.append(g(28, 46, 66, 34, "bubble r ink", t("You do. Spend stays in your own ad accounts."), r="26px", d=2))
    elif kind == "shield":         # Legal, your data, plainly protected
        parts.append(g(22, 10, 56, 66, "shield", f'<span class="pi">{ICON["lock"]}</span>', r="28px", d=1))
        parts.append(g(14, 80, 72, 12, "pill", t("Drafts for lawyer review"), r="999px", d=2))
    elif kind == "pin":            # Contact: HQ New Delhi, working worldwide
        parts.append('<span class="ring" style="--s:90%"></span><span class="ring" style="--s:58%"></span>')
        parts.append(g(38, 30, 24, 24, "disc ink", f'<span class="pi">{ICON["pin"]}</span>', r="50%", d=1))
        parts.append(g(26, 60, 48, 12, "pill", t("Remote-first · worldwide"), r="999px", d=2))
        for i, (s, x, y) in enumerate([("India", 2, 18), ("UAE", 70, 22), ("UK", 6, 80), ("USA", 66, 80)]):
            parts.append(g(x, y, 28, 10, "pill sm", t(s), r="999px", d=i + 3))
    elif kind == "check":          # Thank-you
        parts.append(g(26, 18, 48, 48, "disc ink", f'<span class="pi">{ICON["check"]}</span>', r="50%", d=1))
        parts.append(g(20, 74, 60, 12, "pill", t("We reply on WhatsApp or email"), r="999px", d=2))
    elif kind == "target":         # Paid media services
        parts.append('<span class="ring" style="--s:92%"></span><span class="ring" style="--s:66%"></span><span class="ring" style="--s:40%"></span>')
        parts.append(g(39, 39, 22, 22, "disc ink", f'<span class="pi">{ICON["bolt"]}</span>', r="50%", d=1))
        for i, s in enumerate(k.get("chips", [])[:3]):
            parts.append(g([4, 60, 30][i], [14, 30, 80][i], 36, 11, "pill", t(s), r="999px", d=i + 2))
    elif kind == "search":         # SEO services
        parts.append(g(6, 12, 88, 15, "pill search", f'<span class="si">{ICON["search"]}</span>' + t(k.get("query", "")), r="999px", d=1))
        for i in range(3):
            parts.append(g(6, 34 + i * 20, 88, 15, "row" + (" ink" if i == 0 else ""), t(["Your page, answering it", "Competitor", "Directory listing"][i]), r="16px", d=i + 2))
    elif kind == "flow":           # Automation services, follow-up while you sleep
        for i, s in enumerate(["New lead", "Instant reply", "Reminder", "Booked"]):
            parts.append(g(14 + (i % 2) * 38, 8 + i * 22, 48, 14, "pill" + (" ink" if i == 3 else ""), t(s), r="999px", d=i + 1))
        parts.append('<svg class="wire" viewBox="0 0 100 100" aria-hidden="true"><path d="M38 22 C60 22,60 30,62 37 M62 52 C40 52,40 60,38 67 M38 82 C55 82,60 88,62 90"/></svg>')
    elif kind == "browser":        # Web & CRO services
        parts.append(g(6, 10, 88, 70, "window", '<span class="hx-bar"><i></i><i></i><i></i></span>' + t(k.get("headline", "One page. One offer. One action."), "h") + '<span class="ln"></span><span class="ln short"></span>', r="20px", d=1))
        parts.append(g(50, 66, 40, 14, "pill ink", t(k.get("cta", "Book a call")), r="999px", d=2))
    elif kind == "prism":          # Brand services
        parts.append(g(10, 18, 46, 56, "card tilt0", t("Who it's for", "s") + t("Positioning", "h"), r="24px", d=1))
        parts.append(g(44, 30, 46, 56, "card tilt2 front ink", t("Why believe it", "s") + t("Proof", "h"), r="24px", d=2))
    elif kind == "chat":           # Social / content services
        parts.append(g(10, 6, 52, 84, "phone", '<span class="ln"></span><span class="ln short"></span><span class="ph"></span>', r="30px", d=1))
        parts.append(g(48, 20, 46, 14, "pill", t(k.get("a", "Hook in 2 seconds")), r="999px", d=2))
        parts.append(g(44, 58, 50, 14, "pill ink", t(k.get("b", "Clear next step")), r="999px", d=3))
    return '<div class="ha-visual" aria-hidden="true"><div class="ha-box">' + "".join(parts) + "</div></div>"

def index_list(items, seq=False):
    if not items: return ""
    tag = "ol" if seq else "ul"
    return f'<{tag} class="hero-index{"" if seq else " plain"}">' + "".join(f"<li><b>{_e(a)}</b><span>{_e(b)}</span></li>" for a, b in items) + f"</{tag}>"
