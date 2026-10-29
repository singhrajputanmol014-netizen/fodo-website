"""FODO — central SEO configuration (one place for the brand entity, canonical host and page metadata).

Rules this file follows (from the SEO brief):
  * One canonical host: https://www.fodo.co.in (HTTPS + www) — used by canonical, sitemap, Open Graph and schema.
  * NAP only from confirmed data (js/config.js). No invented offices, phone numbers, reviews, ratings, awards or clients.
  * One primary search intent per URL, so pages do not compete with each other (keyword map below).
build_pages.py imports this file; scripts/seo_audit.py checks the built site against it.
"""

SITE = "https://www.fodo.co.in"
BRAND = "FODO"
LEGAL_NAME = "FODO — Fear Of Digitally Out ?"
TAGLINE = "Fear Of Digitally Out ?"
POSITIONING = "Based in New Delhi. Built for ambitious brands worldwide."
LOCALE = "en_IN"
OG_IMAGE = SITE + "/assets/og-fodo.jpg"
LOGO = SITE + "/assets/favicon-512.png"

# Confirmed contact data (same values as js/config.js)
EMAIL = "anmol@fodo.co.in"
PHONE = "+917827007676"
ADDRESS = {"@type": "PostalAddress", "streetAddress": "65 M Block, New Roshanpura, Najafgarh", "addressLocality": "New Delhi",
           "addressRegion": "Delhi", "postalCode": "110043", "addressCountry": "IN"}
INSTAGRAM = "https://instagram.com/fodo.co.in"
FOUNDER = "Anmol Singh"
FOUNDER_LINKEDIN = "https://www.linkedin.com/in/anmol-singh-43720724a"

ORG_ID, BIZ_ID, SITE_ID, FOUNDER_ID = SITE + "/#organization", SITE + "/#business", SITE + "/#website", SITE + "/about/#founder"
AREA_SERVED = [{"@type": "Country", "name": n} for n in
               ["India", "United Arab Emirates", "United Kingdom", "United States", "Canada", "Australia", "Singapore"]]
KNOWS_ABOUT = ["Digital marketing", "Search engine optimisation", "Local SEO", "Google Ads", "Meta Ads", "LinkedIn Ads", "Content marketing",
               "Social media marketing", "Short-form video", "Brand strategy", "Brand identity", "Web design", "Landing pages",
               "Conversion rate optimisation", "Marketing automation", "Marketing analytics"]

def org_graph():
    """Organization + ProfessionalService + WebSite + founder Person — the home page's entity graph."""
    org = {"@type": "Organization", "@id": ORG_ID, "name": BRAND, "legalName": LEGAL_NAME, "alternateName": ["Fear Of Digitally Out", "FODO Digital"],
           "slogan": TAGLINE, "url": SITE + "/", "logo": {"@type": "ImageObject", "url": LOGO}, "image": OG_IMAGE, "email": EMAIL,
           "telephone": PHONE, "address": ADDRESS, "founder": {"@id": FOUNDER_ID}, "sameAs": [INSTAGRAM],
           "contactPoint": [{"@type": "ContactPoint", "contactType": "sales", "email": EMAIL, "telephone": PHONE,
                             "availableLanguage": ["English", "Hindi"], "areaServed": "Worldwide"}],
           "areaServed": AREA_SERVED, "knowsAbout": KNOWS_ABOUT}
    biz = {"@type": "ProfessionalService", "@id": BIZ_ID, "name": LEGAL_NAME, "url": SITE + "/", "image": OG_IMAGE, "logo": LOGO,
           "email": EMAIL, "telephone": PHONE, "address": ADDRESS, "parentOrganization": {"@id": ORG_ID},
           "description": "Remote-first digital growth agency headquartered in New Delhi, India: SEO, paid media, content, social, brand, web and automation for brands in India and worldwide.",
           "areaServed": AREA_SERVED, "knowsAbout": KNOWS_ABOUT}
    web = {"@type": "WebSite", "@id": SITE_ID, "name": BRAND, "alternateName": LEGAL_NAME, "url": SITE + "/", "inLanguage": "en",
           "publisher": {"@id": ORG_ID},
           "potentialAction": {"@type": "SearchAction", "target": {"@type": "EntryPoint", "urlTemplate": SITE + "/?q={search_term_string}"},
                               "query-input": "required name=search_term_string"}}
    return {"@context": "https://schema.org", "@graph": [org, biz, web, person()]}

def person():
    return {"@type": "Person", "@id": FOUNDER_ID, "name": FOUNDER, "jobTitle": "Founder", "worksFor": {"@id": ORG_ID},
            "url": SITE + "/about/#founder", "sameAs": [FOUNDER_LINKEDIN]}

def provider_ref():
    """Short reference used by Service / location schema so every page points at the same entity."""
    return {"@type": "ProfessionalService", "@id": BIZ_ID, "name": LEGAL_NAME, "url": SITE + "/", "telephone": PHONE, "address": ADDRESS}

# ---------------------------------------------------------------------------------------------------------------
# Keyword map — one primary intent per URL. (route: (title ≤60, description 120–160)). Pages not listed keep the
# title/description written next to their content in build_pages.py.
# ---------------------------------------------------------------------------------------------------------------
PAGE_META = {
 "/": ("FODO — Digital Marketing & Growth Agency, India & Worldwide",
       "FODO is a digital growth agency headquartered in New Delhi — SEO, paid ads, content, social, brand and web for ambitious brands across India and worldwide."),
 "/services/": ("Digital Marketing Services — SEO, Ads, Content & Web | FODO",
       "20 digital marketing services for brands in India and worldwide — paid ads, SEO, content, social, brand, web and automation. Open any service for details."),
 "/about/": ("About FODO — Founder Anmol Singh & How We Work",
       "Why FODO exists, the six-stage Growth System that keeps every activity accountable, and Anmol Singh, the founder clients work with directly."),
 "/industries/": ("Industries We Serve — Marketing by Sector | FODO",
       "How FODO approaches growth for e-commerce and D2C, healthcare, real estate, startups, SaaS, local businesses and personal brands — challenges, channels, KPIs."),
 "/work/": ("Work — Concept Case Studies | FODO",
       "Six concept case studies that show how FODO plans growth: D2C funnels, clinic local SEO, B2B LinkedIn, real estate and more. Clearly marked CONCEPT."),
 "/insights/": ("Digital Marketing Insights & Guides | FODO",
       "Practical guides by Anmol Singh on growth, landing pages, SEO, paid media, social content, dashboards and lead follow-up. No invented statistics."),
 "/contact/": ("Contact FODO — Free Growth Audit & Strategy Call",
       "Request a free growth audit, book a strategy call or message FODO on WhatsApp. Headquartered in New Delhi, working remote-first with brands worldwide."),
 "/reviews/": ("FODO Reviews — Verified Client Feedback",
       "Client reviews for FODO, a remote-first digital growth agency. Every review is published only with the client's written approval — nothing invented."),
 "/growth-score/": ("Free Marketing Growth Score — 10-Question Check | FODO",
       "Answer 10 questions and get a 0–100 growth score across brand, traffic, content, SEO, paid media, conversion and analytics — plus your biggest gap."),
 "/roi-calculator/": ("Marketing ROI Calculator — Leads, Sales & Payback | FODO",
       "Estimate leads, customers, revenue and return from ad spend with an illustrative marketing ROI calculator. Live maths as you type — no sign-up."),
 "/fodo-challenge/": ("The FODO Challenge — A 2-Minute Marketing Game",
       "Four quick rounds on ads, SEO, brand and conversion. Play the FODO Challenge in about two minutes and see how your growth instincts score."),
 "/marketing-quiz/": ("Digital Marketing Quiz — Test Your Instincts | FODO",
       "Ten questions on ads, SEO, brand, conversion and analytics, with an explanation for every answer. A quick, free digital marketing quiz."),
 "/resources/": ("Free Marketing Checklists & Resources | FODO",
       "Five free, practical checklists — general marketing, ad audit, SEO, landing page and social media audit. Use them to review your own marketing today."),
 "/legal/": ("Privacy Policy, Cookies, Terms & Disclaimer | FODO",
       "How FODO collects and uses personal data, which cookies the site uses and why, and the terms and disclaimers that apply to this website and its free tools."),
 "/faq/": ("FAQ — Services, Process & Pricing Approach | FODO",
       "Answers about FODO's services, process, ads, SEO, websites, reporting, contracts, the free growth audit and the tools — plus how work is scoped and priced."),
}

def service_title(base):
    """'SEO Agency' -> 'SEO Agency in India & Worldwide | FODO' (falls back to shorter forms to stay ≤60)."""
    for t in (f"{base} in India & Worldwide | FODO", f"{base} — India & Worldwide | FODO", f"{base} in India | FODO", f"{base} | FODO"):
        if len(t) <= 60: return t
    return base[:53] + " | FODO"

# Insights article -> the service page it supports (content cluster)
ARTICLE_SERVICE = {"Growth": "cro", "Paid Media": "paid-advertising", "SEO": "seo", "Social": "social-media", "Strategy": "analytics",
                   "Brand": "brand-strategy", "Content": "content-marketing", "AI": "marketing-automation"}
ARTICLE_UPDATED = "2026-10-28"   # date the articles were last reviewed (shown as dateModified)

NOINDEX = {"/thank-you/", "/404.html", "/account/"}
