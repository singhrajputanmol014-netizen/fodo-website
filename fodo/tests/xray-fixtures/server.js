#!/usr/bin/env node
/* Offline world for the Business X-Ray end-to-end tests.
   One HTTP server on PORT serves:
     /<host>/<path>      five fictional business websites (+ their competitors) — every name here is made up for testing
     /_serper/search     a stand-in for Serper.dev (Google results) — POST {q, gl}; checks the API key header
     /_psi/...           a stand-in for Google PageSpeed Insights
   The site's functions reach these through XRAY_TEST_MODE + XRAY_TEST_MAP (see functions/_lib/xray-core.js → outbound()). */
const http = require("http");
const PORT = +process.env.PORT || 9300, KEY = process.env.SERPER_KEY || "sk-test-SECRET-123";
const calls = { serper: [], psi: [], pages: [], mails: [], cf: [], opr: [], ext: [] }, ORDERS = {};

const page = (o) => `<!doctype html><html lang="en"><head><meta charset="utf-8">${o.viewport === false ? "" : '<meta name="viewport" content="width=device-width,initial-scale=1">'}<title>${o.title || ""}</title>${o.desc ? `<meta name="description" content="${o.desc}">` : ""}${o.canonical ? `<link rel="canonical" href="${o.canonical}">` : ""}${o.robots ? `<meta name="robots" content="${o.robots}">` : ""}${o.og ? `<meta property="og:title" content="${o.og}"><meta property="og:image" content="https://cdn.example/og.png"><meta property="og:site_name" content="${o.site || ""}">` : ""}${(o.ld || []).map((x) => `<script type="application/ld+json">${typeof x === "string" ? x : JSON.stringify(x)}</script>`).join("")}</head>
<body><header><nav>${(o.nav || []).map(([h, t]) => `<a href="${h}">${t}</a>`).join(" ")}</nav></header><main>${o.body || ""}</main><footer>${o.footer || ""}</footer></body></html>`;

const words = (n, seed) => { const w = (seed || "quality service team customers results experience local trusted fresh fast friendly expert").split(" "); let s = []; for (let i = 0; i < n; i++) s.push(w[i % w.length]); return s.join(" ") + "."; };

/* ---------------- five businesses ---------------- */
const SITES = {
  /* 1. local restaurant, Delhi — good basics, prices, testimonials; a broken link, a redirect chain, an unsafe redirect, robots-blocked admin, schema phone mismatch */
  "spicehub.test": {
    robots: "User-agent: *\nDisallow: /admin\nSitemap: https://spicehub.test/sitemap.xml\n",
    sitemap: ["/", "/menu", "/about", "/contact", "/catering", "/admin/panel", "/private-events"],
    redirects: { "/specials": "/offers-old", "/offers-old": "/offers", "/go-internal": "http://169.254.169.254/latest/meta-data" },
    pages: {
      "/": { title: "Spice Hub | North Indian Restaurant in Dwarka, New Delhi", desc: "Spice Hub serves slow-cooked North Indian food in Dwarka, New Delhi. Order online or book a table — family dining since 2012.", canonical: "https://spicehub.test/", og: "Spice Hub", site: "Spice Hub",
        ld: [{ "@context": "https://schema.org", "@type": "Restaurant", name: "Spice Hub", telephone: "+91 11 4000 9999", address: { "@type": "PostalAddress", streetAddress: "Plot 7, Sector 12", addressLocality: "Dwarka", addressRegion: "New Delhi", postalCode: "110075" } }],
        nav: [["/", "Home"], ["/menu", "Menu"], ["/catering", "Catering"], ["/about", "About"], ["/contact", "Contact"]],
        body: `<section><h1>North Indian food for families in Dwarka, delivered hot in 30 minutes</h1><p>Slow-cooked curries, tandoor breads and biryani. Since 2012. Free delivery within 5 km.</p><a class="btn" href="/contact">Book a table</a> <a href="https://wa.me/919800000001">WhatsApp to order</a> <a href="tel:+919800000001">Call +91 98000 00001</a></section>
        <section><h2>What our guests say</h2><blockquote>“Best butter chicken in West Delhi, delivery was on time.” — Priya</blockquote><blockquote>“Great value for money, friendly staff.” — Arjun</blockquote></section>
        <section><h2>Our kitchen</h2><p>${words(120, "fresh spices tandoor biryani curry family dining dwarka delivery")}</p><img src="/img/biryani.jpg" alt="Chicken biryani"><img src="/img/naan.jpg"><img src="/img/hall.jpg"></section>
        <a href="/old-menu">Old menu</a> <a href="/specials">Specials</a> <a href="/go-internal">Partner offer</a> <a href="/private-events">Private events</a>`,
        footer: "Spice Hub, Plot 7, Sector 12, Dwarka, New Delhi 110075 · +91 98000 00001 · hello@spicehub.test · <a href='https://instagram.com/spicehubtest'>Instagram</a> <a href='https://facebook.com/spicehubtest'>Facebook</a> <a href='/privacy'>Privacy</a>" },
      "/menu": { title: "Menu & Prices | Spice Hub Dwarka", desc: "Full menu with prices: curries from ₹249, biryani from ₹299, thalis from ₹349.", canonical: "https://spicehub.test/menu", nav: [["/", "Home"], ["/contact", "Contact"]], body: `<h1>Menu</h1><h2>Curries</h2><p>Butter chicken ₹349 · Dal makhani ₹249 · Paneer tikka masala ₹299</p><h2>Biryani</h2><p>Chicken biryani ₹299 · Mutton biryani ₹399</p><p>${words(150, "curry biryani thali naan tandoor price menu")}</p><a class="btn" href="/contact">Order now</a>` },
      "/catering": { title: "Catering Services in Dwarka | Spice Hub", desc: "Party and office catering in Dwarka and West Delhi.", canonical: "https://spicehub.test/catering", body: `<h1>Catering for parties and offices</h1><p>${words(220, "catering party office wedding menu delivery dwarka")}</p><h2>FAQ</h2><h3>Do you cater for 200 guests?</h3><p>Yes.</p><h3>How early should I book?</h3><p>3 days.</p><h3>Do you provide staff?</h3><p>Yes.</p><a class="btn" href="/contact">Get a catering quote</a>` },
      "/about": { title: "About Spice Hub | Family Restaurant Since 2012", desc: "The Sharma family has run Spice Hub in Dwarka since 2012.", canonical: "https://spicehub.test/about", body: `<h1>About us</h1><p>Established in 2012. 10+ years of experience. Trusted by 5,000+ customers. FSSAI licensed.</p><p>${words(200)}</p>` },
      "/contact": { title: "Contact Spice Hub | Book a Table in Dwarka", desc: "Call, WhatsApp or book a table online.", canonical: "https://spicehub.test/contact", body: `<h1>Contact</h1><form action="/book" method="post"><label for="n">Name</label><input id="n" name="name" required><label for="p">Phone</label><input id="p" name="phone" type="tel" required><label for="g">Guests</label><input id="g" name="guests"><button type="submit">Book a table</button></form><p>Plot 7, Sector 12, Dwarka, New Delhi 110075</p>` },
      "/offers": { title: "Offers | Spice Hub", desc: "Weekday lunch offer: 20% off.", canonical: "https://spicehub.test/offers", body: `<h1>Offers</h1><p>Weekday lunch: 20% off. ${words(80)}</p>` },
      "/private-events": { title: "Private Events | Spice Hub", desc: "Host private events.", robots: "noindex", body: `<h1>Private events</h1><p>${words(60)}</p>` },
      "/privacy": { title: "Privacy Policy | Spice Hub", desc: "How we handle your data.", body: `<h1>Privacy policy</h1><p>${words(150)}</p>` },
      "/admin/panel": { title: "Admin", body: "<h1>Admin</h1>" },
    },
  },
  /* 2. SaaS — strong offer, pricing, FAQ schema, blog; no address, no testimonials */
  "flowdesk.test": {
    robots: "User-agent: *\nAllow: /\nSitemap: https://flowdesk.test/sitemap.xml\n",
    sitemap: ["/", "/pricing", "/features", "/blog", "/blog/automate-invoices", "/blog/crm-tips", "/signup"],
    pages: {
      "/": { title: "Flowdesk | Workflow Automation Software for Small Businesses", desc: "Automate invoices, follow-ups and approvals without code. Start a 14-day free trial — no card needed.", canonical: "https://flowdesk.test/", og: "Flowdesk", site: "Flowdesk",
        ld: [{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Flowdesk", applicationCategory: "BusinessApplication" }, { "@context": "https://schema.org", "@type": "Organization", name: "Flowdesk" }],
        nav: [["/features", "Features"], ["/pricing", "Pricing"], ["/blog", "Blog"], ["/signup", "Start free trial"]],
        body: `<h1>Stop wasting hours on manual follow-ups: workflow automation for small businesses</h1><p>Save 10 hours a week. Connect your CRM, email and invoices in minutes. No code. 2,000+ teams use Flowdesk.</p><a class="btn" href="/signup">Start free trial</a><h2>Integrations</h2><p>${words(250, "automation workflow integrations crm invoices approvals dashboard api software")}</p>`,
        footer: "© Flowdesk · <a href='/privacy'>Privacy</a> · <a href='https://linkedin.com/company/flowdesktest'>LinkedIn</a> · support@flowdesk.test" },
      "/pricing": { title: "Pricing | Flowdesk Workflow Automation", desc: "Plans from $19/month. Free trial on every plan.", canonical: "https://flowdesk.test/pricing", ld: [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Is there a free trial?", acceptedAnswer: { "@type": "Answer", text: "Yes, 14 days." } }] }],
        body: `<h1>Simple pricing</h1><p>Starter $19/month · Growth $49/month · Scale $99/month</p><h2>FAQ</h2><h3>Is there a free trial?</h3><h3>Can I cancel anytime?</h3><h3>Do you offer refunds?</h3><p>${words(200, "pricing plans trial cancel refund automation")}</p><a class="btn" href="/signup">Start free trial</a>` },
      "/features": { title: "Features | Flowdesk", desc: "Approvals, reminders, invoice automation and reports.", canonical: "https://flowdesk.test/features", body: `<h1>Features</h1><p>${words(300, "approvals reminders invoices automation reports integrations api workflow")}</p><a class="btn" href="/signup">Try it free</a>` },
      "/blog": { title: "Blog | Flowdesk", desc: "Guides on automating small-business admin.", canonical: "https://flowdesk.test/blog", body: `<h1>Blog</h1><a href="/blog/automate-invoices">How to automate invoices</a> <a href="/blog/crm-tips">CRM tips</a><p>${words(120)}</p>` },
      "/blog/automate-invoices": { title: "How to Automate Invoices in 2026 | Flowdesk Blog", desc: "A step-by-step guide.", canonical: "https://flowdesk.test/blog/automate-invoices", body: `<h1>How to automate invoices</h1><p>${words(600, "invoice automation steps guide small business")}</p>` },
      "/blog/crm-tips": { title: "7 CRM Tips | Flowdesk Blog", desc: "CRM tips for small teams.", canonical: "https://flowdesk.test/blog/crm-tips", body: `<h1>7 CRM tips</h1><p>${words(500, "crm tips pipeline follow-up")}</p>` },
      "/signup": { title: "Start Your Free Trial | Flowdesk", desc: "Create your account.", canonical: "https://flowdesk.test/signup", body: `<h1>Start your free trial</h1><form><input name="email" type="email" required placeholder="Work email"><input name="company" placeholder="Company"><button>Create account</button></form>` },
      "/privacy": { title: "Privacy | Flowdesk", desc: "Privacy policy.", body: `<h1>Privacy</h1><p>${words(120)}</p>` },
    },
  },
  /* 3. e-commerce D2C — products with schema, cart; no testimonials/FAQ/contact form; PageSpeed fails for this one */
  "aromaco.test": {
    robots: "User-agent: *\nDisallow: /cart\nDisallow: /checkout\n",
    sitemap: null,
    pages: {
      "/": { title: "Aroma Co — Hand-Poured Soy Candles, Diffusers, Gift Sets and Home Fragrance Online Store India", desc: "Shop soy candles and gift sets. Free shipping over ₹999.", og: "Aroma Co",
        nav: [["/collections/candles", "Candles"], ["/collections/gifts", "Gift sets"], ["/about", "About"], ["/cart", "Cart"]],
        body: `<h1>Hand-poured soy candles</h1><p>Free shipping over ₹999 · Cash on delivery available</p><a class="btn" href="/collections/candles">Shop now</a><p>${words(90, "candles soy fragrance gift home")}</p><img src="/i/1.jpg"><img src="/i/2.jpg"><img src="/i/3.jpg"><img src="/i/4.jpg">`, footer: "Aroma Co · care@aromaco.test · <a href='https://instagram.com/aromacotest'>Instagram</a>" },
      "/collections/candles": { title: "Candles | Aroma Co", desc: "", body: `<h1>Candles</h1><a href="/products/lavender-candle">Lavender candle ₹599</a> <a href="/products/sandalwood-candle">Sandalwood candle ₹649</a><p>${words(60)}</p>` },
      "/collections/gifts": { title: "Candles | Aroma Co", desc: "", body: `<h1>Gift sets</h1><a href="/products/gift-box">Gift box ₹1,499</a><p>${words(40)}</p>` },
      "/products/lavender-candle": { title: "Lavender Soy Candle | Aroma Co", desc: "Lavender soy candle, 40 hour burn.", ld: [{ "@context": "https://schema.org", "@type": "Product", name: "Lavender Soy Candle", offers: { "@type": "Offer", price: "599", priceCurrency: "INR" } }], body: `<h1>Lavender Soy Candle</h1><p>₹599</p><button>Add to cart</button><p>${words(120, "lavender soy candle burn time fragrance")}</p>` },
      "/products/sandalwood-candle": { title: "Sandalwood Soy Candle | Aroma Co", desc: "Sandalwood soy candle.", ld: [{ "@context": "https://schema.org", "@type": "Product", name: "Sandalwood Soy Candle" }], body: `<h1>Sandalwood Soy Candle</h1><p>₹649</p><button>Add to cart</button><p>${words(110)}</p>` },
      "/products/gift-box": { title: "Gift Box | Aroma Co", desc: "Gift box.", ld: ["{ broken json"], body: `<h1>Gift box</h1><p>₹1,499</p><button>Add to cart</button><p>${words(80)}</p>` },
      "/about": { title: "About | Aroma Co", desc: "Our story.", body: `<h1>About</h1><p>${words(150)}</p>` },
      "/cart": { title: "Cart", body: "<h1>Cart</h1>" },
    },
  },
  /* 4. marketing agency, Mumbai — generic headline, no prices, long form, case studies; not #1 for own name */
  "brightpixel.test": {
    robots: "User-agent: *\nAllow: /\n",
    sitemap: ["/", "/services", "/services/seo", "/services/social-media", "/work", "/contact", "/about"],
    pages: {
      "/": { title: "Home", desc: "", og: "",
        nav: [["/services", "Services"], ["/work", "Work"], ["/about", "About"], ["/contact", "Contact"]],
        body: `<h1>Welcome</h1><p>We are a creative digital marketing agency.</p><a href="/services">Learn more</a> <button>Submit</button><p>${words(140, "digital marketing seo social media branding creative agency mumbai")}</p>`, footer: "BrightPixel · Mumbai · +91 22 5555 0101 · hi@brightpixel.test" },
      "/services": { title: "Services | BrightPixel", desc: "SEO, social media and branding.", body: `<h1>Services</h1><a href="/services/seo">SEO</a> <a href="/services/social-media">Social media</a><p>${words(160, "seo social media branding performance marketing")}</p>` },
      "/services/seo": { title: "SEO Services in Mumbai | BrightPixel", desc: "SEO for brands.", body: `<h1>SEO services</h1><p>${words(260, "seo rankings keywords technical audit content links")}</p>` },
      "/services/social-media": { title: "Social Media Marketing | BrightPixel", desc: "Social media for brands.", body: `<h1>Social media marketing</h1><p>${words(240, "social media instagram reels content calendar")}</p>` },
      "/work": { title: "Our Work & Case Studies | BrightPixel", desc: "Case studies.", body: `<h1>Case studies</h1><p>${words(200, "case study results client brand growth")}</p>` },
      "/about": { title: "About BrightPixel", desc: "About us.", body: `<h1>About</h1><p>${words(140)}</p>` },
      "/contact": { title: "Contact | BrightPixel", desc: "Contact us.", body: `<h1>Contact</h1><form>${["Name", "Email", "Phone", "Company", "Website", "Budget", "Industry", "City", "Service", "Timeline", "Message"].map((f) => `<label for="${f}">${f}</label><input id="${f}" name="${f.toLowerCase()}" required>`).join("")}<button>Submit</button></form>` },
    },
  },
  /* 5. dental clinic, Bengaluru — plain HTTP, important page noindex, no sitemap/robots, no viewport; search provider FAILS for this business */
  "smilecare.test": {
    robots: null, sitemap: null,
    pages: {
      "/": { title: "SmileCare Dental Clinic Bengaluru", desc: "Dental clinic in Indiranagar, Bengaluru: root canal, implants, braces.", viewport: false,
        ld: [{ "@context": "https://schema.org", "@type": "Dentist", name: "SmileCare Dental Clinic", address: { "@type": "PostalAddress", addressLocality: "Bengaluru" } }],
        nav: [["/treatments", "Treatments"], ["/contact", "Contact"]],
        body: `<h1>Painless dental care for families in Bengaluru</h1><p>Root canal, implants and braces by certified dentists. 15 years of experience.</p><a href="/contact">Book appointment</a><p>${words(130, "dental dentist root canal implants braces clinic bengaluru")}</p>`, footer: "SmileCare, 100 Feet Road, Indiranagar, Bengaluru 560038 · 080 4111 2222" },
      "/treatments": { title: "Dental Treatments | SmileCare", desc: "Our treatments.", robots: "noindex, nofollow", body: `<h1>Treatments</h1><p>${words(220, "root canal implants braces whitening cleaning")}</p>` },
      "/contact": { title: "Contact SmileCare", desc: "Book an appointment.", body: `<h1>Contact</h1><p>Call 080 4111 2222</p>` },
    },
  },
};
SITES["shyco.test"] = { robots: "User-agent: *\nAllow: /\n", sitemap: null, pages: { "/": { title: "ShyCo | Handmade Leather Bags", desc: "Handmade leather bags from Jaipur.", body: "<h1>Handmade leather bags that last 20 years</h1><p>" + words(150, "leather bags handmade jaipur wallet") + "</p>" } } };
/* competitor homepages (made up) */
const COMP = {
  "tandoortales.test": { title: "Tandoor Tales | Restaurant in Dwarka", h1: "Dwarka's favourite tandoor kitchen — 4.6★ from 1,200 families", body: "North Indian restaurant in Dwarka, New Delhi. Butter chicken, biryani, naan. Prices from ₹199. Free delivery. Testimonials from our guests. FAQ. Since 2010.", pricing: true, testi: true },
  "curryhouse.test": { title: "Curry House Dwarka — Order Online", h1: "Curries delivered in Dwarka", body: "Curry, biryani and thali delivery in Dwarka, New Delhi. Order online. WhatsApp us.", wa: true },
  "autotask.test": { title: "AutoTask — Workflow Automation for Teams", h1: "Automate your workflow for small businesses in minutes", body: "Workflow automation software. Pricing from $15/month. Free trial. Testimonials: rated 4.8 by 900 customers. Blog. FAQ.", pricing: true, testi: true, blog: true },
  "zapflow.test": { title: "Zapflow | No-code automation platform", h1: "No-code automation for growing companies", body: "Automation platform with 500 integrations. Start free trial. Enterprise security. Workflow software.", blog: true },
  "glowcandles.test": { title: "Glow Candles — Soy Candles Online India", h1: "Clean-burning soy candles, gifted with love", body: "Soy candles and gift sets. Free shipping. 10,000+ happy customers. Reviews. FAQ. Prices from ₹449. Cash on delivery.", pricing: true, testi: true },
  "growthlabs.test": { title: "GrowthLabs — Performance Marketing Agency Mumbai", h1: "More leads for D2C brands in 90 days", body: "Digital marketing agency in Mumbai: SEO, social media, performance marketing. Case studies. Packages from ₹40,000/month. Free audit. Testimonials.", pricing: true, testi: true },
  "adcraft.test": { title: "AdCraft Studio | Branding & Social Media", h1: "Creative digital marketing agency", body: "Branding, social media and SEO agency in Mumbai. We are a creative digital marketing agency.", },
};
Object.keys(COMP).forEach((h) => { const c = COMP[h]; SITES[h] = { robots: "User-agent: *\nAllow: /\n", sitemap: null, pages: { "/": { title: c.title, desc: c.body.slice(0, 150), og: c.title.split(/ [|—-] /)[0], site: c.title.split(/ [|—-] /)[0], nav: [["/", "Home"], ["/contact", "Contact"]],
  body: `<h1>${c.h1}</h1><p>${c.body}</p>${c.pricing ? "<h2>Pricing</h2><p>Plans and prices shown.</p>" : ""}${c.testi ? "<h2>What our customers say</h2><blockquote>Great!</blockquote>" : ""}${c.blog ? '<a href="/blog">Blog</a>' : ""}${c.wa ? '<a href="https://wa.me/910000000000">WhatsApp</a>' : ""}<a class="btn" href="/contact">Get started</a><p>${words(150, c.body.toLowerCase().replace(/[^a-z ]/g, ""))}</p>`,
  ld: [{ "@context": "https://schema.org", "@type": "Organization", name: c.title.split(/ [|—-] /)[0] }] }, "/contact": { title: "Contact | " + c.title, desc: "Contact", body: "<h1>Contact</h1>" } } }; });

/* ---------------- search stand-in ---------------- */
const IND = [
  [/blockedco|quickbite/i, { own: "blockedco.test", comps: ["tandoortales.test", "curryhouse.test"], dirs: ["zomato.com", "justdial.com"], brand: "QuickBite", ownTitle: "QuickBite — Online Food Delivery in Delhi | Order Now", ownSnippet: "Order food online from 2,000+ restaurants in Delhi and Gurugram. Fast delivery, live tracking." }],
  [/spice|restaurant|dwarka|curry|biryani|north indian|food|catering/i, { own: "spicehub.test", comps: ["tandoortales.test", "curryhouse.test"], dirs: ["zomato.com", "justdial.com", "tripadvisor.in"], brand: "Spice Hub", rating: [4.4, 230] }],
  [/flowdesk|workflow|automation|software|saas|invoice/i, { own: "flowdesk.test", comps: ["autotask.test", "zapflow.test"], dirs: ["g2.com", "capterra.com"], brand: "Flowdesk" }],
  [/aroma|candle|gift|fragrance|soy/i, { own: "aromaco.test", comps: ["glowcandles.test"], dirs: ["amazon.in", "flipkart.com"], brand: "Aroma Co" }],
  [/brightpixel|marketing|agency|seo|social media|branding|creative/i, { own: "brightpixel.test", comps: ["growthlabs.test", "adcraft.test"], dirs: ["clutch.co", "justdial.com"], brand: "BrightPixel", ownPos: 4 }],
  [/smile|dental|dentist|clinic|root canal/i, { fail: true }],
];
function serper(q) {
  const m = IND.find(([re]) => re.test(q)); if (!m) return { organic: [] };
  const d = m[1]; if (d.fail) return null;
  const brand = q.indexOf(d.brand) > -1 || q.toLowerCase().indexOf(d.own.split(".")[0]) > -1, reddit = /reddit/i.test(q), reviews = /reviews?/i.test(q);
  const org = [];
  if (reddit) org.push({ title: "Any good options? : r/delhi", link: "https://www.reddit.com/r/test/comments/abc/any_good/", snippet: "Looking for a reliable place, affordable and fast. The last one I tried was too expensive and the delivery was late by an hour. Is it worth the money?" },
    { title: "Which one is better? — Quora", link: "https://www.quora.com/Which-is-better-test", snippet: "I need a trusted option near me. Staff were rude and there were hidden charges at one place. Great value for money at another." });
  if (reviews) org.push({ title: "Reviews — Justdial", link: "https://www.justdial.com/test-reviews", snippet: "Rated 4.3 out of 5 by customers. Excellent food, friendly staff, but slow service on weekends and parking is difficult. Value for money.", rating: 4.3, ratingCount: 510 });
  if (brand && !d.ownPos) org.push({ title: d.ownTitle || d.brand + " — official site", link: "https://" + d.own + "/", snippet: d.ownSnippet || d.brand + " official website.", rating: d.rating ? d.rating[0] : undefined, ratingCount: d.rating ? d.rating[1] : undefined });
  d.dirs.forEach((x) => org.push({ title: d.brand + " and others on " + x, link: "https://www." + x + "/listing/" + encodeURIComponent(q.slice(0, 20)), snippet: (brand ? d.brand + " " : "") + "listing, ratings and contact details." }));
  d.comps.forEach((c, i) => { if (!(brand && i > 0)) org.push({ title: COMP[c].title, link: "https://" + c + "/", snippet: COMP[c].body.slice(0, 140) }); });
  if (brand && d.ownPos) org.splice(Math.min(org.length, d.ownPos - 1), 0, { title: d.brand + " — creative agency", link: "https://" + d.own + "/", snippet: d.brand });
  if (!brand && /best|price|pricing|alternatives/i.test(q) && d.own === "flowdesk.test") org.splice(1, 0, { title: "Flowdesk pricing", link: "https://flowdesk.test/pricing", snippet: "Plans from $19/month." });
  const out = { searchParameters: { q }, organic: org.slice(0, 10).map((r, i) => Object.assign({ position: i + 1 }, r)), peopleAlsoAsk: [{ question: "How much does it cost?", snippet: "Prices usually start around a few hundred rupees; it depends on the provider.", link: "https://example-faq.test/a" }], relatedSearches: [{ query: q + " near me" }] };
  if (/dwarka|delhi/i.test(q) && brand) out.places = [{ title: "Spice Hub", address: "Sector 12, Dwarka, New Delhi", rating: 4.4, ratingCount: 230, cid: "123" }];
  return out;
}
const psi = (url) => ({ lighthouseResult: { requestedUrl: url, finalUrl: url, fetchTime: new Date().toISOString(), configSettings: { formFactor: "mobile" },
  categories: { performance: { score: /flowdesk/.test(url) ? 0.91 : 0.47 }, seo: { score: 0.83 }, accessibility: { score: 0.78 }, "best-practices": { score: 0.92 } },
  audits: { "largest-contentful-paint": { id: "largest-contentful-paint", title: "Largest Contentful Paint", score: 0.3, displayValue: "4.8 s", scoreDisplayMode: "numeric" }, "cumulative-layout-shift": { id: "cumulative-layout-shift", title: "Cumulative Layout Shift", score: 0.9, displayValue: "0.05", scoreDisplayMode: "numeric" },
    "uses-optimized-images": { id: "uses-optimized-images", title: "Efficiently encode images", score: 0.2, displayValue: "Potential savings of 900 KiB", scoreDisplayMode: "metricSavings" } } },
  loadingExperience: /spicehub/.test(url) ? { overall_category: "AVERAGE", metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3100, category: "AVERAGE" }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 8 }, INTERACTION_TO_NEXT_PAINT: { percentile: 240 } } } : {} });

/* ---------------- server ---------------- */
const send = (res, code, type, body, headers) => { res.writeHead(code, Object.assign({ "content-type": type }, headers || {})); res.end(body); };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"), parts = u.pathname.split("/"), first = parts[1];
  if (first === "_calls") return send(res, 200, "application/json", JSON.stringify(calls));
  /* v13 stand-ins: outgoing-link targets, Resend (email), Cashfree (orders), Open PageRank */
  if (first === "_ext200" || first === "_ext404") { calls.ext.push(first + u.pathname); return send(res, first === "_ext200" ? 200 : 404, "text/html", "<h1>ext</h1>"); }
  const body = (f) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { let j = null; try { j = JSON.parse(b); } catch (e) {} f(j); }); };
  if (first === "_resend") return body((j) => { if (req.headers.authorization !== "Bearer re_test_KEY") return send(res, 401, "application/json", '{"message":"bad key"}'); calls.mails.push(j); send(res, 200, "application/json", '{"id":"mail_' + calls.mails.length + '"}'); });
  if (first === "_cf") {
    const cors = { "access-control-allow-origin": "*" };
    if (parts[2] === "pay") { const o = ORDERS[u.searchParams.get("order")]; if (o) o.order_status = u.searchParams.get("fail") ? "ACTIVE" : "PAID"; return send(res, o ? 200 : 404, "application/json", '{"ok":true}', cors); }
    if (req.headers["x-client-id"] !== "CF_TEST_APP" || req.headers["x-client-secret"] !== "CF_TEST_SECRET") return send(res, 401, "application/json", '{"message":"authentication failed"}');
    if (parts[3] === "orders" && req.method === "POST") return body((j) => { calls.cf.push(j); ORDERS[j.order_id] = Object.assign({ order_status: "ACTIVE", cf_order_id: 5000 + calls.cf.length, payment_session_id: "sess_" + j.order_id }, j); send(res, 200, "application/json", JSON.stringify(ORDERS[j.order_id])); });
    if (parts[3] === "orders" && parts[4]) { const o = ORDERS[decodeURIComponent(parts[4])]; return send(res, o ? 200 : 404, "application/json", JSON.stringify(o || { message: "order not found" })); }
    return send(res, 404, "application/json", "{}");
  }
  /* v14: stand-in for Workers AI — answers the FODO Edge prompts with JSON built from the data it was sent (plus one made-up page,
     competitor and opportunity id each, which the server must drop) */
  if (first === "_ai") return body((j) => {
    const sys = (j && j.messages && j.messages[0].content) || "", user = (j && j.messages && j.messages[1] && j.messages[1].content) || "";
    let d = {}; try { d = JSON.parse(user.slice(user.indexOf("{"))); } catch (e) {}
    calls.ai = (calls.ai || []).concat([sys.slice(0, 40)]);
    let out = "Here are some well-known options: Tandoor Tales and Curry House.";
    if (/copywriter/.test(sys)) out = JSON.stringify({ pages: (d.pages || []).map((p) => ({ url: p.url, title: "Better title for " + (p.title || "").slice(0, 30), meta: "A clearer meta description that says who it is for and what to do next. Order online or book a table today.", h1: "Clear headline for " + (p.h1 || "this page").slice(0, 40) })).concat([{ url: "https://invented.test/x", title: "x", meta: "x", h1: "x" }]), headlines: ["Headline one", "Headline two", "Headline three"], faq: [{ q: "Do you deliver?", a: "Yes, as stated on the site." }], cta: "Book a table" });
    else if (/competitive strategist/.test(sys)) out = "Sure! " + JSON.stringify({ cards: (d.competitors || []).map((c) => ({ domain: c.domain, theyWinOn: ["Prices shown"], youWinOn: ["Testimonials"], howToWin: ["Show prices", "Add reviews", "Speed up"], talkTrack: "We show our menu and prices openly." })).concat([{ domain: "invented-rival.test", theyWinOn: ["x"], youWinOn: [], howToWin: [], talkTrack: "x" }]) });
    else if (/growth consultant/.test(sys)) { const ids = (d.opportunities || []).map((o) => o.id); out = JSON.stringify({ months: [1, 2, 3].map((m) => ({ month: m, goal: "Goal " + m, weeks: [1, 2, 3, 4].map((w) => ({ week: w, focus: "Focus " + w, tasks: ["Task a", "Task b"], opportunities: [ids[(m * 4 + w) % Math.max(1, ids.length)], "O999"], kpi: "Leads" })) })) }); }
    else if (/agency founder/.test(sys)) { const ids = (d.opportunities || []).map((o) => o.id); out = JSON.stringify({ subject: "3 quick wins for " + ((d.business || {}).name || "you"), email: "Hi,\n\nI ran an X-Ray of your website.\n\nThanks", findings: [{ text: "Finding one", opportunity: ids[0] }, { text: "Finding two", opportunity: "O999" }], proposal: [{ phase: "Fix", what: "Fix basics", outcome: "Clearer site" }] }); }
    send(res, 200, "application/json", JSON.stringify({ response: out }));
  });
  if (first === "_opr") { if (req.headers["api-opr"] !== "opr_test_KEY") return send(res, 401, "application/json", "{}"); const ds = u.searchParams.getAll("domains[]"); calls.opr.push(ds);
    return send(res, 200, "application/json", JSON.stringify({ status_code: 200, response: ds.map((d, i) => ({ status_code: 200, domain: d, page_rank_decimal: (4.5 - i * 0.7).toFixed(2), rank: String(100000 * (i + 1)) })) })); }
  /* v17 stand-ins: Serper places (Google Maps), Groq, Gemini (with Google Search grounding), Google OAuth + Search Console */
  if (first === "_serper" && parts[2] === "places") return body((j) => {
    if (req.headers["x-api-key"] !== KEY) return send(res, 403, "application/json", '{"message":"bad key"}');
    const q = (j && j.q) || ""; calls.places = (calls.places || []).concat([q]);
    const P = [{ title: "Tandoor Tales", address: "Sector 10, Dwarka, New Delhi", rating: 4.5, ratingCount: 640, category: "North Indian restaurant", website: "https://tandoortales.test/", phoneNumber: "+91 98100 00001", cid: "901" },
      { title: "Curry House", address: "Sector 6, Dwarka, New Delhi", rating: 4.3, ratingCount: 410, category: "Indian restaurant", website: "https://curryhouse.test/", cid: "902" },
      { title: "Spice Hub", address: "Sector 12, Dwarka, New Delhi", rating: 4.1, ratingCount: 180, category: "Indian restaurant", website: "https://spicehub.test/", cid: "123" },
      { title: "Dhaba Corner", address: "Sector 7, Dwarka, New Delhi", rating: 4.0, ratingCount: 95, category: "Dhaba", cid: "903" }];
    if (/spice hub/i.test(q)) return send(res, 200, "application/json", JSON.stringify({ places: [P[2]] }));
    if (/dwarka|delhi/i.test(q)) return send(res, 200, "application/json", JSON.stringify({ places: P }));
    send(res, 200, "application/json", '{"places":[]}');
  });
  if (first === "_groq") return body((j) => {
    if (req.headers.authorization !== "Bearer groq_test_KEY") return send(res, 401, "application/json", '{"error":{"message":"bad key"}}');
    const q = ((j && j.messages) || []).map((m) => m.content).pop() || ""; calls.groq = (calls.groq || []).concat([q]);
    const t = /value/i.test(q) ? "For good value, Spice Hub in Dwarka and Curry House are popular choices." : "Popular options include Tandoor Tales and Curry House.";
    send(res, 200, "application/json", JSON.stringify({ choices: [{ message: { role: "assistant", content: t } }], usage: { total_tokens: 120 } }));
  });
  if (first === "_gemini") return body((j) => {
    if (req.headers["x-goog-api-key"] !== "gem_test_KEY") return send(res, 403, "application/json", '{"error":{"code":403}}');
    const q = (((j && j.contents) || [])[0] || { parts: [{}] }).parts[0].text || "", grounded = !!(j && j.tools); calls.gemini = (calls.gemini || []).concat([(grounded ? "G:" : "") + q]);
    send(res, 200, "application/json", JSON.stringify({ candidates: [{ content: { parts: [{ text: "Based on Google results: Tandoor Tales (tandoortales.test) and Spice Hub are well reviewed in Dwarka." }] }, groundingMetadata: grounded ? { webSearchQueries: [q.slice(0, 40)], groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/a", title: "tandoortales.test" } }, { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/b", title: "spicehub.test" } }] } : undefined }], usageMetadata: { totalTokenCount: 300 } }));
  });
  if (first === "_gtoken") { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { const f = new URLSearchParams(b); calls.gtoken = (calls.gtoken || []).concat([f.get("grant_type") || parts[2] || ""]);
    if (parts[2] === "revoke") return send(res, 200, "application/json", "{}");
    if (f.get("client_secret") !== "gsecret_test") return send(res, 401, "application/json", '{"error":"invalid_client"}');
    if (f.get("grant_type") === "authorization_code" && f.get("code") === "code_ok") return send(res, 200, "application/json", JSON.stringify({ access_token: "at_test", refresh_token: "rt_test", expires_in: 3600, scope: "https://www.googleapis.com/auth/webmasters.readonly" }));
    if (f.get("grant_type") === "refresh_token" && f.get("refresh_token") === "rt_test") return send(res, 200, "application/json", JSON.stringify({ access_token: "at_test", expires_in: 3600 }));
    send(res, 400, "application/json", '{"error":"invalid_grant"}'); }); return; }
  if (first === "_psi" && /\/webmasters\/v3\//.test(u.pathname)) return body((j) => {
    if (req.headers.authorization !== "Bearer at_test") return send(res, 401, "application/json", "{}");
    calls.gsc = (calls.gsc || []).concat([u.pathname.replace(/^\/_psi/, "") + (j && j.dimensions ? ":" + j.dimensions.join(",") : "")]);
    if (/\/sites$/.test(u.pathname)) return send(res, 200, "application/json", JSON.stringify({ siteEntry: [{ siteUrl: "sc-domain:spicehub.test", permissionLevel: "siteOwner" }, { siteUrl: "https://other.test/", permissionLevel: "siteFullUser" }] }));
    const dim = j && j.dimensions ? j.dimensions[0] : null, R = (k, c, i, p) => ({ keys: [k], clicks: c, impressions: i, ctr: i ? c / i : 0, position: p });
    const rows = !dim ? [{ clicks: 420, impressions: 18500, ctr: 0.0227, position: 14.2 }]
      : dim === "query" ? [R("spice hub dwarka", 180, 900, 1.2), R("biryani dwarka", 22, 2600, 4.1), R("best restaurant dwarka", 9, 3100, 7.8), R("north indian food delhi", 4, 1900, 13.5), R("veg thali near me", 31, 700, 3.2)]
      : dim === "page" ? [R("https://spicehub.test/", 300, 9000, 6.1), R("https://spicehub.test/menu", 90, 6000, 9.4)]
      : dim === "device" ? [R("MOBILE", 330, 14000, 13.1), R("DESKTOP", 90, 4500, 17.9)]
      : dim === "country" ? [R("ind", 410, 18000, 14) ] : [R("2026-10-01", 14, 600, 14), R("2026-10-02", 15, 620, 13.8)];
    send(res, 200, "application/json", JSON.stringify({ rows }));
  });
  if (first === "_serper") {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      if (req.headers["x-api-key"] !== KEY) return send(res, 403, "application/json", '{"message":"bad key"}');
      let q = ""; try { q = JSON.parse(b).q; } catch (e) {} calls.serper.push(q);
      const r = serper(q); if (!r) return send(res, 500, "application/json", '{"message":"upstream error"}');
      send(res, 200, "application/json", JSON.stringify(r));
    }); return;
  }
  if (first === "_psi") { const url = u.searchParams.get("url") || ""; calls.psi.push(url); if (/aromaco/.test(url)) return send(res, 429, "application/json", '{"error":{"code":429}}'); return send(res, 200, "application/json", JSON.stringify(psi(url))); }
  if (first === "blockedco.test") { calls.pages.push("blockedco:" + (req.headers["user-agent"] || "")); return send(res, 520, "text/html", "<html><body>error code: 520</body></html>"); }
  if (first === "shyco.test" && !/compatible/.test(req.headers["user-agent"] || "")) { calls.pages.push("shyco-403"); return send(res, 403, "text/html", "<h1>Forbidden</h1>"); }
  const site = SITES[first]; if (!site) return send(res, 404, "text/plain", "no such fixture host");
  const path = "/" + parts.slice(2).join("/"), p = path.replace(/\/+$/, "") || "/";
  calls.pages.push(first + p);
  if (p === "/robots.txt") return site.robots ? send(res, 200, "text/plain", site.robots) : send(res, 404, "text/html", "<h1>404</h1>");
  if (p === "/sitemap.xml") return site.sitemap ? send(res, 200, "application/xml", '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + site.sitemap.map((x) => "<url><loc>https://" + first + x + "</loc></url>").join("") + "</urlset>") : send(res, 404, "text/html", "<h1>404</h1>");
  if (site.redirects && site.redirects[p]) return send(res, 301, "text/html", "", { location: site.redirects[p] });
  const pg = site.pages[p]; if (!pg) return send(res, 404, "text/html", page({ title: "Page not found", body: "<h1>404</h1>" }));
  send(res, 200, "text/html; charset=utf-8", page(pg));
}).listen(PORT, "127.0.0.1", () => console.log("fixtures on " + PORT));
module.exports = { SITES };
