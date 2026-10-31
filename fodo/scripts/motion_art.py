"""v6.2 motion graphics: animated SVG scenes for the six concept cases and the redesigned teardown mockups.
Pure SVG + CSS (classes animated in css/studio.css §27). currentColor = ink, var(--accent) = violet.
Everything is decorative (aria-hidden) and stops under prefers-reduced-motion."""

A = "var(--accent,#5B3DF5)"
F = 'font-family="Inter Tight,sans-serif"'

def _wrap(inner, label):
    return (f'<svg class="mg" viewBox="0 0 400 250" aria-hidden="true" focusable="false">'
            f'<defs><linearGradient id="mgfade-{label}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="{A}" stop-opacity=".22"/><stop offset="1" stop-color="{A}" stop-opacity="0"/></linearGradient></defs>'
            f'<pattern id="mgdots-{label}" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="currentColor" opacity=".12"/></pattern>'
            f'<rect x="0" y="0" width="400" height="250" fill="url(#mgdots-{label})"/>'
            f'{inner}<text x="388" y="240" text-anchor="end" font-size="8" letter-spacing="1.6" fill="currentColor" opacity=".45" {F}>EXAMPLE</text></svg>')


# 1 — D2C funnel: traffic dots fall through the funnel, one leaks out at the cart stage
def _d2c():
    bars = [(60, 300, "VISIT", "100"), (90, 240, "PRODUCT", "42"), (120, 180, "CART", "18"), (150, 120, "BUY", "6")]
    s = ""
    for i, (y, w, lab, pct) in enumerate(bars):
        x = 200 - w / 2
        s += (f'<rect x="{x}" y="{y + 34}" width="{w}" height="22" rx="11" fill="currentColor" opacity="{.06 + i * .03}"/>'
              f'<rect class="mg-grow" style="animation-delay:{i * .35}s" x="{x}" y="{y + 34}" width="{w}" height="22" rx="11" fill="{A}" opacity="{.18 + i * .16}"/>'
              f'<text x="{x - 8}" y="{y + 49}" text-anchor="end" font-size="9" letter-spacing="1.2" fill="currentColor" opacity=".7" {F}>{lab}</text>'
              f'<text x="{x + w + 8}" y="{y + 49}" font-size="10" font-weight="700" fill="currentColor" {F}>{pct}%</text>')
    flow = "".join(f'<circle class="mg-fall" style="animation-delay:{d:.2f}s" cx="{cx}" cy="70" r="3.2" fill="{A}"/>' for cx, d in [(176, 0), (200, .5), (224, 1), (188, 1.5), (212, 2), (200, 2.5)])
    leak = (f'<circle class="mg-leak" cx="262" cy="166" r="3.4" fill="#FF5A36"/><circle class="mg-leak" style="animation-delay:1.3s" cx="262" cy="166" r="3.4" fill="#FF5A36"/>'
            f'<g class="mg-pulse" style="transform-origin:336px 214px"><rect x="296" y="203" width="80" height="22" rx="11" fill="#FF5A36"/><text x="336" y="218" text-anchor="middle" font-size="9" font-weight="700" letter-spacing="1" fill="#fff" {F}>CART LEAK</text></g>'
            '<path d="M262 170 q24 16 34 38" fill="none" stroke="#FF5A36" stroke-width="1.5" stroke-dasharray="3 3"/>')
    bottles = (f'<g opacity=".9"><rect x="28" y="40" width="16" height="34" rx="5" fill="currentColor" opacity=".16"/><rect x="32" y="32" width="8" height="10" rx="2" fill="currentColor" opacity=".35"/>'
               f'<rect x="50" y="52" width="22" height="22" rx="6" fill="currentColor" opacity=".12"/><rect x="50" y="48" width="22" height="7" rx="3" fill="{A}" opacity=".6"/></g>')
    return _wrap(bottles + s + flow + leak + f'<text x="28" y="230" font-size="9" letter-spacing="1.4" fill="currentColor" opacity=".6" {F}>FIX THE LEAK → THEN SCALE ADS</text>', "d2c")

# 2 — B2B LinkedIn: a scrolling post feed on the left, a pulse moving through the pipeline on the right
def _b2b():
    cards = ""
    for i in range(8):
        y = 20 + i * 62
        cards += (f'<g><rect x="24" y="{y}" width="132" height="52" rx="10" fill="currentColor" opacity=".07"/>'
                  f'<circle cx="40" cy="{y + 16}" r="8" fill="{A}" opacity="{.35 + .15 * (i % 2)}"/><rect x="54" y="{y + 10}" width="60" height="5" rx="2.5" fill="currentColor" opacity=".35"/>'
                  f'<rect x="54" y="{y + 19}" width="38" height="4" rx="2" fill="currentColor" opacity=".2"/><rect x="34" y="{y + 32}" width="110" height="4" rx="2" fill="currentColor" opacity=".18"/>'
                  f'<rect x="34" y="{y + 40}" width="80" height="4" rx="2" fill="currentColor" opacity=".18"/></g>')
    feed = f'<clipPath id="mgclipfeed"><rect x="20" y="16" width="140" height="218" rx="12"/></clipPath><g clip-path="url(#mgclipfeed)"><g class="mg-feed">{cards}</g></g>'
    nodes = [(196, "REACH"), (250, "ENGAGE"), (304, "MEETING"), (358, "PIPELINE")]
    pipe = f'<path d="M196 92 H358" stroke="currentColor" stroke-width="2" opacity=".2"/><path class="mg-dash" d="M196 92 H358" stroke="{A}" stroke-width="2" stroke-dasharray="6 8"/>'
    for i, (x, lab) in enumerate(nodes):
        last = i == 3
        pipe += (f'<circle cx="{x}" cy="92" r="{13 if last else 10}" fill="{A if last else "var(--surface,#fff)"}" stroke="{A}" stroke-width="2"/>'
                 f'<text x="{x}" y="122" text-anchor="middle" font-size="8.5" letter-spacing="1" fill="currentColor" opacity=".7" {F}>{lab}</text>')
    pipe += f'<circle class="mg-travel" cx="196" cy="92" r="5" fill="{A}"/>'
    bars = "".join(f'<rect class="mg-bar" style="animation-delay:{i * .18}s;transform-origin:{206 + i * 26}px 222px" x="{196 + i * 26}" y="{222 - h}" width="18" height="{h}" rx="4" fill="{A}" opacity="{.3 + i * .12}"/>' for i, h in enumerate([22, 34, 30, 48, 62, 76]))
    return _wrap(feed + pipe + bars + f'<text x="196" y="146" font-size="9" letter-spacing="1.4" fill="currentColor" opacity=".6" {F}>MEETINGS BOOKED / MONTH</text>', "b2b")

# 3 — Local SEO: a street map with three branch pins pinging, and a map-pack list with a moving highlight
def _clinic():
    roads = ('<g fill="none" stroke="currentColor" stroke-linecap="round" opacity=".16"><path d="M0 70 C80 60 140 90 250 70" stroke-width="10"/><path d="M0 170 C90 160 150 190 250 175" stroke-width="7"/>'
             '<path d="M70 0 C80 80 60 150 80 250" stroke-width="7"/><path d="M175 0 C160 90 190 160 170 250" stroke-width="10"/></g>'
             '<g fill="currentColor" opacity=".07"><rect x="96" y="96" width="56" height="50" rx="8"/><rect x="12" y="92" width="44" height="54" rx="8"/><rect x="196" y="100" width="40" height="54" rx="8"/></g>')
    pins = ""
    for i, (x, y) in enumerate([(124, 58), (48, 196), (206, 150)]):
        pins += (f'<circle class="mg-ping" style="animation-delay:{i * .7}s;transform-origin:{x}px {y + 18}px" cx="{x}" cy="{y + 18}" r="16" fill="none" stroke="{A}" stroke-width="2"/>'
                 f'<path d="M{x} {y - 4}c-9 0-15 6-15 14 0 11 15 24 15 24s15-13 15-24c0-8-6-14-15-14z" fill="{A}"/><circle cx="{x}" cy="{y + 10}" r="5" fill="#fff"/>')
    card = (f'<rect x="262" y="26" width="120" height="196" rx="14" fill="var(--surface,#fff)" stroke="currentColor" stroke-opacity=".12"/>'
            f'<text x="276" y="48" font-size="9" font-weight="700" letter-spacing="1.2" fill="currentColor" {F}>MAP PACK</text>'
            f'<rect class="mg-hl" x="268" y="58" width="108" height="46" rx="10" fill="{A}" opacity=".14"/>')
    for i in range(3):
        y = 62 + i * 52
        card += (f'<circle cx="284" cy="{y + 14}" r="7" fill="{A}" opacity="{.9 - i * .25}"/><rect x="298" y="{y + 6}" width="62" height="5" rx="2.5" fill="currentColor" opacity=".4"/>'
                 f'<text x="298" y="{y + 28}" font-size="9" fill="#E8A317" {F}>★★★★★</text><rect x="298" y="{y + 33}" width="40" height="4" rx="2" fill="currentColor" opacity=".18"/>')
    return _wrap(roads + pins + card + f'<text x="12" y="240" font-size="9" letter-spacing="1.4" fill="currentColor" opacity=".6" {F}>3 BRANCHES · 3 ACCURATE LISTINGS</text>', "clinic")

# 4 — Restaurant reels: a phone playing a reel (progress bar, spinning plate), hearts floating up
def _reels():
    side = ('<g opacity=".35"><rect x="62" y="40" width="70" height="140" rx="14" fill="currentColor" opacity=".18"/><rect x="268" y="40" width="70" height="140" rx="14" fill="currentColor" opacity=".18"/></g>'
            '<g opacity=".5"><circle cx="97" cy="104" r="20" fill="currentColor" opacity=".18"/><circle cx="303" cy="104" r="20" fill="currentColor" opacity=".18"/></g>')
    phone = (f'<rect x="150" y="18" width="100" height="196" rx="18" fill="#0B0B0C"/><rect x="156" y="26" width="88" height="180" rx="13" fill="#17171B"/>'
             f'<rect x="164" y="34" width="72" height="3" rx="1.5" fill="#fff" opacity=".25"/><rect class="mg-progress" x="164" y="34" width="72" height="3" rx="1.5" fill="#fff"/>'
             f'<g class="mg-spin" style="transform-origin:200px 112px"><circle cx="200" cy="112" r="30" fill="#F4F4F2" opacity=".92"/><circle cx="200" cy="112" r="22" fill="none" stroke="#E2E2DE" stroke-width="2"/>'
             f'<circle cx="190" cy="104" r="7" fill="#E8A317"/><circle cx="209" cy="108" r="6" fill="#C2410C"/><circle cx="198" cy="121" r="6" fill="#4D7C0F"/><circle cx="211" cy="122" r="4" fill="#E8A317"/></g>'
             f'<rect x="166" y="158" width="52" height="6" rx="3" fill="#fff" opacity=".8"/><rect x="166" y="170" width="36" height="5" rx="2.5" fill="#fff" opacity=".45"/>'
             f'<circle cx="236" cy="150" r="5" fill="#fff" opacity=".7"/><circle cx="236" cy="166" r="5" fill="#fff" opacity=".7"/><circle cx="236" cy="182" r="5" fill="{A}"/>')
    hearts = "".join(f'<path class="mg-heart" style="animation-delay:{d}s" d="M{x} 190c-4-4-10-7-10-12a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 5-6 8-10 12z" fill="{c}"/>'
                     for x, d, c in [(262, 0, "#FF5A6E"), (276, .9, A), (258, 1.8, "#FF5A6E"), (284, 2.6, A)])
    labels = "".join(f'<text x="{x}" y="236" text-anchor="middle" font-size="9" letter-spacing="1.4" fill="currentColor" opacity="{o}" {F}>{t}</text>' for x, t, o in [(97, "HOOK · 1.5s", .6), (200, "REEL", .9), (303, "SAVE · SHARE", .6)])
    return _wrap(side + phone + hearts + labels, "reels")

# 5 — Real estate: a lit skyline; enquiry dots fall, only qualified (violet) ones pass the filter
def _realestate():
    sky = ""
    for i, (x, w, h) in enumerate([(14, 40, 90), (58, 30, 130), (92, 46, 70), (300, 36, 120), (340, 46, 84)]):
        sky += f'<rect x="{x}" y="{240 - h}" width="{w}" height="{h}" rx="3" fill="currentColor" opacity=".13"/>'
        for r in range(int(h // 18)):
            for c in range(int(w // 12)):
                sky += f'<rect class="mg-win" style="animation-delay:{((r * 7 + c * 3 + i) % 9) * .4:.1f}s" x="{x + 5 + c * 12}" y="{240 - h + 8 + r * 18}" width="5" height="7" rx="1" fill="#E8B84A"/>'
    filt = (f'<path d="M150 118 H262" stroke="currentColor" stroke-width="2" opacity=".3"/><g fill="currentColor" opacity=".35">' + "".join(f'<rect x="{152 + i * 14}" y="114" width="8" height="8" rx="2"/>' for i in range(8)) + '</g>'
            f'<text x="206" y="106" text-anchor="middle" font-size="8.5" letter-spacing="1.2" fill="currentColor" opacity=".7" {F}>BUDGET · AREA · TIMELINE</text>')
    dots = ""
    for i, (x, q) in enumerate([(162, 0), (178, 1), (194, 0), (210, 0), (226, 1), (242, 0), (186, 0), (234, 1)]):
        cls = "mg-pass" if q else "mg-drop"
        dots += f'<circle class="{cls}" style="animation-delay:{i * .45:.2f}s" cx="{x}" cy="40" r="4" fill="{A if q else "currentColor"}" opacity="{1 if q else .35}"/>'
    tray = (f'<rect x="166" y="182" width="80" height="34" rx="10" fill="{A}" opacity=".14" stroke="{A}" stroke-opacity=".5"/>'
            f'<text x="206" y="203" text-anchor="middle" font-size="9" font-weight="700" letter-spacing="1.2" fill="currentColor" {F}>QUALIFIED</text>')
    return _wrap(sky + filt + dots + tray, "re")

# 6 — Founder brand: orbiting content around one clear position, authority line drawing on the right
def _founder():
    rings = (f'<circle cx="130" cy="122" r="96" fill="none" stroke="currentColor" opacity=".1"/><circle cx="130" cy="122" r="66" fill="none" stroke="currentColor" opacity=".16"/>'
             f'<circle cx="130" cy="122" r="36" fill="url(#mgfade-founder)" stroke="{A}" stroke-opacity=".6"/>'
             f'<circle cx="130" cy="112" r="10" fill="{A}"/><path d="M112 140c3-12 33-12 36 0" fill="{A}"/>')
    orbit = (f'<g class="mg-orbit" style="transform-origin:130px 122px"><rect x="186" y="110" width="20" height="24" rx="4" fill="{A}"/><rect x="54" y="60" width="18" height="18" rx="4" fill="currentColor" opacity=".35"/></g>'
             f'<g class="mg-orbit rev" style="transform-origin:130px 122px"><rect x="122" y="18" width="18" height="18" rx="4" fill="currentColor" opacity=".3"/><circle cx="62" cy="182" r="9" fill="{A}" opacity=".7"/><rect x="200" y="176" width="16" height="16" rx="4" fill="currentColor" opacity=".25"/></g>')
    chart = (f'<rect x="250" y="40" width="134" height="150" rx="14" fill="var(--surface,#fff)" stroke="currentColor" stroke-opacity=".12"/>'
             f'<text x="264" y="62" font-size="9" font-weight="700" letter-spacing="1.2" fill="currentColor" {F}>AUTHORITY</text>'
             f'<g stroke="currentColor" opacity=".1"><path d="M264 100H370M264 130H370M264 160H370"/></g>'
             f'<path d="M264 170 L290 160 L312 150 L334 124 L352 112 L370 84 L370 176 L264 176Z" fill="url(#mgfade-founder)"/>'
             f'<path class="mg-draw" d="M264 170 L290 160 L312 150 L334 124 L352 112 L370 84" fill="none" stroke="{A}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
             f'<circle class="mg-pulse" style="transform-origin:370px 84px" cx="370" cy="84" r="4.5" fill="{A}"/>')
    return _wrap(rings + orbit + chart + f'<text x="34" y="240" font-size="9" letter-spacing="1.4" fill="currentColor" opacity=".6" {F}>ONE CLEAR POSITION</text>', "founder")

WORK_MOTION = {"d2c-skincare-funnel": _d2c(), "b2b-saas-linkedin": _b2b(), "clinic-local-seo": _clinic(),
               "restaurant-social-reels": _reels(), "realestate-lead-quality": _realestate(), "founder-brand-reposition": _founder()}

# ---------- teardown mockups ----------
def _mk(n, good, where=""):
    """numbered marker; where = '' (inline after text) or a corner class: tl, tr, bl, br"""
    return f'<span class="mk {"ok" if good else "bad"}{" at " + where if where else " in"}">{n}</span>'

def _post_head(name, light):
    return (f'<div class="ig-head"><span class="ig-av{" l" if light else ""}">C</span><span class="ig-name"><b>{name}</b><small>Sponsored</small></span><span class="ig-dots">•••</span></div>')

CUP = (f'<svg class="td-cup" viewBox="0 0 200 170" aria-hidden="true" focusable="false">'
       f'<circle cx="100" cy="92" r="70" fill="{A}" opacity=".16"/><circle class="mg-ring" cx="100" cy="92" r="78" fill="none" stroke="{A}" stroke-width="3" stroke-dasharray="490" stroke-linecap="round" transform="rotate(-90 100 92)"/>'
       f'<g class="steam" fill="none" stroke="#F4F4F2" stroke-width="3" stroke-linecap="round" opacity=".7"><path class="st1" d="M82 64c-8-10 8-16 0-28"/><path class="st2" d="M100 60c-8-10 8-16 0-28"/><path class="st3" d="M118 64c-8-10 8-16 0-28"/></g>'
       '<path d="M64 76h72l-8 62a10 10 0 0 1-10 9H82a10 10 0 0 1-10-9z" fill="#B4532A"/><path d="M64 76h72l-2 12H66z" fill="#8F3E1D"/><ellipse cx="100" cy="76" rx="36" ry="7" fill="#C98A4B"/>'
       '<path d="M70 98h60" stroke="#D9784A" stroke-width="3" opacity=".6"/><ellipse cx="100" cy="150" rx="46" ry="6" fill="#000" opacity=".35"/></svg>')

AD_BEFORE = ('<div class="ad ad2 ad-before" aria-hidden="true">' + _post_head("chaicorner_official_page", True) +
  '<div class="ad2-img busy"><span class="bz b1">20% OFF!!' + _mk(2, 0, 'br') + '</span><span class="bz b2">BUY 1 GET 1*</span><span class="bz b3">NEW MENU</span><span class="bz b4">FRANCHISE<br>AVAILABLE</span>'
  '<b class="busy-h">CHAI CORNER' + _mk(1, 0) + '</b><span class="busy-s">Best Chai · Snacks · Combos · Maggi · Sandwich · Party Orders</span><span class="busy-t">*T&amp;C apply · Free delivery* · Call now · Visit today · Open 7 days</span>' + _mk(3, 0, 'br') + '</div>'
  '<div class="ad2-cap"><b>chaicorner_official_page</b> Welcome to Chai Corner!! We are the best chai shop since 2015 offering many items at best prices with good quality and hygiene… <span>more</span></div>'
  '<div class="ad2-cta grey">Contact us' + _mk(4, 0) + '</div>'
  + '<span class="ad-x">EXAMPLE</span></div>')

AD_AFTER = ('<div class="ad ad2 ad-after" aria-hidden="true">' + _post_head("chaicorner.janakpuri", False) +
  f'<div class="ad2-img clean"><span class="ad-kicker">CHAI CORNER · JANAKPURI</span>{CUP}<span class="timer"><b>10</b><small>MIN</small></span>' + _mk(3, 1, 'tr') + '</div>'
  '<b class="ad-h1">Hot chai in 10 minutes.' + _mk(1, 1) + '</b>'
  '<div class="ad2-row"><span class="offer">Free biscuit on your first order</span><span class="proof">★ 4.6 · example rating</span>' + _mk(2, 1) + '</div>'
  '<div class="ad2-cta wa">Order on WhatsApp →' + _mk(4, 1) + '</div>'
  + '<span class="ad-x">EXAMPLE</span></div>')

LP_BEFORE = ('<div class="ad lp2 ad-before" aria-hidden="true">'
  '<div class="lp-nav"><b>LOGO</b><span>Home</span><span>About</span><span>Services</span><span>Gallery</span><span>Blog</span><span>Careers</span><span>Contact</span></div>'
  '<div class="lp-stock"><svg viewBox="0 0 120 60" aria-hidden="true" focusable="false"><path d="M0 60 L34 22 L56 44 L76 28 L120 60Z" fill="#C9C9C4"/><circle cx="94" cy="16" r="8" fill="#C9C9C4"/></svg><small>stock-photo.jpg</small>' + _mk(2, 0, 'tr') + '</div>'
  '<b class="ad-h1">Welcome to our clinic' + _mk(1, 0) + '</b><p class="lp-p">We are a leading clinic with years of experience and a passion for care. Our team of professionals is dedicated to providing quality services to all.</p>'
  '<div class="lp-form">' + "".join(f'<span>{f}</span>' for f in ["Name", "Email", "Phone", "Age", "Address", "City", "Message", "How did you hear about us?"]) + '<i>Submit' + _mk(4, 0) + '</i>' + _mk(3, 0, 'tl') + '</div>'
  + '<span class="ad-x">EXAMPLE</span></div>')

CAL = (f'<svg class="td-cal" viewBox="0 0 220 120" aria-hidden="true" focusable="false"><rect x="1" y="1" width="218" height="118" rx="14" fill="#17171B" stroke="#2A2A30"/>'
       f'<text x="16" y="24" font-size="11" font-weight="700" fill="#F4F4F2" {F}>Today · pick a slot</text>'
       + "".join(f'<rect x="{16 + (i % 3) * 66}" y="{36 + (i // 3) * 38}" width="58" height="28" rx="8" fill="#232329"/><text x="{45 + (i % 3) * 66}" y="{54 + (i // 3) * 38}" text-anchor="middle" font-size="10.5" fill="#C9C9CF" {F}>{t}</text>'
                 for i, t in enumerate(["11:00", "12:30", "2:00", "4:30", "6:00", "8:00"]))
       + f'<g class="mg-slot"><rect x="16" y="36" width="58" height="28" rx="8" fill="{A}"/><text x="45" y="54" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff" {F}>✓ Booked</text></g></svg>')

LP_AFTER = ('<div class="ad lp2 ad-after" aria-hidden="true">'
  '<span class="ad-kicker">DENTAL CLINIC · DWARKA</span><b class="ad-h1">Tooth pain? Same-day appointments.' + _mk(1, 1) + '</b>'
  '<div class="lp-trust"><span>Open till 9 pm</span><span>★ 4.8 Google · example</span><span>Real clinic photos</span>' + _mk(2, 1) + '</div>'
  + CAL +
  '<div class="lp-form2"><span>Your name</span><span>Phone number</span>' + _mk(3, 1, 'tr') + '</div><div class="ad2-cta wa">Book on WhatsApp →' + _mk(4, 1) + '</div>'
  + '<span class="ad-x">EXAMPLE</span></div>')
