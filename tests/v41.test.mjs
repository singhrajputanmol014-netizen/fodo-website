// v41: Website Builder element-level design (per-element styles, breakpoints, visibility, motion, a11y, layers) with full
// backward compatibility. Run: node --no-warnings tests/v41.test.mjs
import fs from "node:fs";
import { renderPage, cleanEl, EL_TAGS } from "../sites/lib/render.js";
import { TEMPLATES, templateById } from "../sites/lib/templates.js";
import { validateDoc } from "../functions/_lib/sites.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const siteOf = (t) => ({ theme: t.theme, settings: { business: { name: "Test Biz" } }, pages: JSON.parse(JSON.stringify(t.pages)), components: t.components });

/* 1. old documents render exactly as before (no `el` → no change at all) */
let same = 0; for (const t of TEMPLATES) { const s = siteOf(t), h = renderPage(s, "home", { base: "/" }); if (!/data-x=|\/\* elements \*\//.test(h)) same++; }
ok(same === TEMPLATES.length, "all " + TEMPLATES.length + " templates without element styles render with no element markers or CSS (old websites unchanged)");

/* 2. validation: only known keys, numbers in range, hex colours, listed keywords */
const dirty = { "h1-0": { name: "Hero <script>", st: { fs: 72, c: "#FF5500", bg: "red;}body{display:none", p: "10 20", m: "0 0 999", fw: 950, ta: "middle", ff: "Comic<", sh: "lg", op: 2 }, t: { fs: 48 }, m: { fs: 36, ta: "center" }, hide: { m: 1, x: 1 }, anim: "fade-up", hover: "spin", aria: 'Say "hi"<img>' },
  "div-0": { st: { fs: 20 } }, "p-1": { st: { c: "#00aa88" }, lock: true }, "h2-9999": { st: { fs: 20 } }, "__proto__": { st: { fs: 10 } } };
const c = cleanEl(dirty);
ok(c["h1-0"].st.fs === 72 && c["h1-0"].st.c === "#ff5500" && !c["h1-0"].st.bg && c["h1-0"].st.p === "10 20" && !c["h1-0"].st.m && !c["h1-0"].st.fw && !c["h1-0"].st.ta && !c["h1-0"].st.ff && c["h1-0"].st.sh === "lg" && !("op" in c["h1-0"].st), "styles validated: bad colour, margin, weight, align, font and opacity dropped");
ok(c["h1-0"].name === "Hero script" && c["h1-0"].aria === "Say hiimg" && c["h1-0"].anim === "fade-up" && !c["h1-0"].hover && c["h1-0"].hide.m && !c["h1-0"].hide.x, "name / aria cleaned of markup; unknown motion and keys dropped");
ok(!c["div-0"] && !c["h2-9999"] && c["p-1"].lock && Object.keys(c).length === 2, "only real element keys (" + EL_TAGS.join(", ") + ") are kept");

/* 3. rendering: styles, breakpoints, visibility, motion, aria, live vs editor */
const t = templateById("cafe-cozy"), s = siteOf(t); s.pages[0].sections[1].el = c;
const live = renderPage(s, "home", { base: "/" }), ed = renderPage(s, "home", { base: "/", edit: true });
ok(/\[data-x="1-h1-0"\]\{font-size:72px!important;color:#ff5500!important;padding:10px 20px!important;box-shadow:[^}]+\}/.test(live), "desktop styles become scoped CSS");
ok(/@media \(max-width:1024px\)\{\[data-x="1-h1-0"\]\{font-size:48px!important\}\}/.test(live) && /@media \(max-width:767px\)\{\[data-x="1-h1-0"\]\{font-size:36px!important;text-align:center!important\}\}/.test(live), "tablet and mobile overrides cascade without touching desktop");
ok(/@media \(max-width:767px\)\{\[data-x="1-h1-0"\]\{display:none!important\}\}/.test(live), "hide on mobile");
ok(/data-x="1-h1-0" aria-label="Say hiimg" data-ea="fade-up"/.test(live) && /animation-timeline:view\(\)/.test(live) && /prefers-reduced-motion:reduce\)\{\[data-ea\]\{animation:none/.test(live), "aria-label + scroll entrance, off for reduced motion");
ok((live.match(/<[a-z0-9]+ data-x=/g) || []).length === 2 && (ed.match(/<[a-z0-9]+ data-x=/g) || []).length > 10, "live site marks only styled elements; the editor marks every element");
ok(!/<script>steal|display:none\}body|Comic</.test(live), "nothing injected into the page");
ok((live.match(/<h1[\s>]/g) || []).length === 1, "still exactly one H1");

/* 4. the server keeps clean element styles when saving and drops bad ones */
const doc = { theme: t.theme, settings: { business: { name: "Test Biz" } }, pages: JSON.parse(JSON.stringify(t.pages)) }; doc.pages[0].sections[1].el = dirty;
const v = validateDoc(doc, { pages: 20 }); ok(JSON.stringify(v.pages[0].sections[1].el) === JSON.stringify(c), "validateDoc stores exactly the cleaned element styles");
const doc2 = { theme: t.theme, settings: {}, pages: JSON.parse(JSON.stringify(t.pages)) }; doc2.pages[0].sections[1].el = { "x-1": { st: { fs: 1 } } }; ok(!("el" in validateDoc(doc2, { pages: 20 }).pages[0].sections[1]), "a section with only invalid element data gets no `el`");

/* 5. editor wiring */
const js = (p) => fs.readFileSync(new URL("../js/" + p, import.meta.url), "utf8");
ok(/EL\.panel\(rp\)/.test(js("website-builder.js")) && /EL\.BRIDGE/.test(js("website-builder.js")) && /EL\.key\(e\)/.test(js("website-builder.js")) && /EL\.onFrame\(d\)/.test(js("website-builder.js")), "editor: element panel, canvas bridge, keyboard and frame messages wired");
ok(/Layers in this section/.test(js("wb-elements.js")) && /shift/.test(js("wb-elements.js")) && /Copy style/.test(js("wb-elements.js")) && /Hide on/.test(js("wb-elements.js")) && /Lock/.test(js("wb-elements.js")), "layers, multi-select, copy/paste style, visibility and lock");
console.log(`\nv41: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
