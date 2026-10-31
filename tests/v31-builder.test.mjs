// v31 Website Builder: template library (37 FODO-original templates), motion graphics (subtle / lively / none, reduced-motion safe,
// never in the editor), theme validation. Run: node --no-warnings tests/v31-builder.test.mjs
import { TEMPLATES, clientAllowed, searchTemplates } from "../sites/lib/templates.js";
import { renderPage, checkSite, MOTIONS } from "../sites/lib/render.js";
import { validateDoc } from "../functions/_lib/sites.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
ok(TEMPLATES.length >= 35 && new Set(TEMPLATES.map((t) => t.id)).size === TEMPLATES.length, TEMPLATES.length + " templates, unique ids");
ok(TEMPLATES.every((t) => clientAllowed(t.license) && t.license.license === "FODO Original"), "all FODO-original (commercial + client use)");
ok(new Set(TEMPLATES.map((t) => t.category)).size >= 30, "30+ business categories");
ok(TEMPLATES.every((t) => t.pages.every((p) => (renderPage({ theme: t.theme, pages: t.pages }, p.slug).match(/<h1[\s>]/g) || []).length === 1)), "every page of every template has exactly one H1");
const crit = TEMPLATES.map((t) => [t.id, checkSite({ theme: t.theme, pages: t.pages, settings: { business: { name: "X" }, notifyEmail: "a@b.co", store: { cod: true } } }).issues.filter((i) => i.level === "critical" && !/Placeholder/.test(i.msg))]).filter((x) => x[1].length);
ok(!crit.length, "no broken links / empty pages in any template" + (crit.length ? ": " + JSON.stringify(crit) : ""));
ok(!TEMPLATES.some((t) => /“[^”]{20,}”\s*—\s*[A-Z][a-z]+/.test(JSON.stringify(t))), "no invented testimonials in templates");
const rec = (q) => (typeof searchTemplates === "function" ? searchTemplates(q, { client: true })[0].id : "");
ok(rec("cafe coffee") === "cafe-cozy" && rec("chartered accountant gst") === "ca-firm" && rec("wedding planner") === "wedding-planner" && rec("pet grooming") === "pet-care", "recommendations find the new templates (café, CA, wedding, pets)");
const site = (motion) => ({ theme: Object.assign({}, TEMPLATES[0].theme, { motion }), pages: TEMPLATES[0].pages, settings: { business: { name: "X" } } });
const sub = renderPage(site("subtle"), "home"), liv = renderPage(site("lively"), "home"), none = renderPage(site("none"), "home"), ed = renderPage(site("lively"), "home", { edit: true });
ok(/IntersectionObserver/.test(sub) && /@keyframes fu/.test(sub) && !/m-prog/.test(sub), "subtle motion: scroll reveal + hero entrance");
ok(/m-prog/.test(liv) && /floaty/.test(liv) && /logo-row/.test(liv), "lively motion: floating hero art, scroll progress, logo marquee");
ok(!/IntersectionObserver/.test(none) && !/@keyframes fu/.test(none), "motion none: no animation at all");
ok(!/IntersectionObserver/.test(ed), "the editor canvas stays still (no motion script while editing)");
ok(/prefers-reduced-motion:reduce\)\{\*\{transition:none!important;animation:none!important/.test(sub) && /matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches;if\(R\)return/.test(sub), "reduced-motion users get no motion");
const d = validateDoc({ theme: { motion: "lively" }, settings: {}, pages: [{ slug: "home", title: "Home", sections: [{ type: "hero", props: { title: "Hi" } }] }] });
const d2 = validateDoc({ theme: { motion: "<script>" }, settings: {}, pages: [{ slug: "home", title: "Home", sections: [{ type: "hero", props: { title: "Hi" } }] }] });
ok(d.theme.motion === "lively" && !d2.theme.motion && MOTIONS.join() === "subtle,lively,none", "motion setting saved; anything else dropped");
console.log("\nv31 builder: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
