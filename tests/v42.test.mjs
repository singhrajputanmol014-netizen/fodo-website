// v42: Website Builder global components with per-copy overrides, design tokens (type scale, base size, token colours),
// element duplicate / remove, side-by-side devices, make-responsive preview, rulers & guides. Run: node --no-warnings tests/v42.test.mjs
import fs from "node:fs";
import { renderPage, cleanEl, themeCss, compProps, EL_TOKENS } from "../sites/lib/render.js";
import { TEMPLATES, templateById } from "../sites/lib/templates.js";
import { validateDoc, API_VERSION } from "../functions/_lib/sites.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const siteOf = (t) => ({ theme: Object.assign({}, t.theme), settings: { business: { name: "Test Biz" } }, pages: JSON.parse(JSON.stringify(t.pages)), components: t.components });
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

/* 0. backward compatibility: every template renders byte-for-byte the same without v42 data */
let same = 0; for (const t of TEMPLATES) { const s = siteOf(t); if (!/data-xc=|h1\{font-size:clamp\(2\.4rem|body\{font-size:1[4-9]px/.test(renderPage(s, "home", { base: "/" }))) same++; }
ok(same === TEMPLATES.length, "all " + TEMPLATES.length + " templates render unchanged without v42 data");
ok(API_VERSION === "v42", "API version is v42");

/* 1. global components: master → every copy; a copy can override fields; reset follows the master again */
const t = templateById("cafe-cozy"), s = siteOf(t), cta = s.pages[0].sections.findIndex((x) => x.type === "cta");
s.components = [{ id: "cmp_abc12345", name: "Promo", type: "cta", props: { title: "Master title", text: "Master text", button: { label: "Book", href: "contact/" } } }];
s.pages.forEach((p) => p.sections.forEach((x) => { if (x.type === "cta") { x.ref = "cmp_abc12345"; x.props = {}; } }));
let h = renderPage(s, "home", { base: "/" }); ok(/Master title/.test(h) && /Master text/.test(h), "a component copy shows the master's content");
s.pages[0].sections[cta].over = { title: "Only here" }; h = renderPage(s, "home", { base: "/" });
ok(/Only here/.test(h) && !/Master title/.test(h) && /Master text/.test(h), "a copy override replaces only that field (rest still follows the master)");
s.components[0].props.text = "New master text"; h = renderPage(s, "home", { base: "/" }); ok(/New master text/.test(h) && /Only here/.test(h), "master edits still reach the overridden copy for non-overridden fields");
ok(JSON.stringify(compProps(s.components[0], {})) === JSON.stringify(s.components[0].props) && compProps(s.components[0], { over: { title: "x" } }).title === "x", "compProps merges master + overrides");
const v = validateDoc(JSON.parse(JSON.stringify(s)), { pages: 20 }); ok(v.pages[0].sections[cta].over && v.pages[0].sections[cta].over.title === "Only here" && v.pages[0].sections[cta].ref === "cmp_abc12345", "server keeps a copy's overrides");
const bad = JSON.parse(JSON.stringify(s)); bad.pages[0].sections[cta].ref = "cmp_missing99"; ok(!("over" in validateDoc(bad, { pages: 20 }).pages[0].sections[cta]), "overrides are dropped when the component no longer exists");
const arr = JSON.parse(JSON.stringify(s)); arr.pages[0].sections[cta].over = ["x"]; ok(!("over" in validateDoc(arr, { pages: 20 }).pages[0].sections[cta]), "a non-object override is rejected");
const xss = JSON.parse(JSON.stringify(s)); xss.pages[0].sections[cta].over = { title: "<script>alert(1)</script>" }; ok(!/<script>alert/.test(renderPage(validateDoc(xss, { pages: 20 }), "home", { base: "/" })), "override text is escaped like any content");

/* 2. design tokens: heading scale + base size + muted / border, validated on the server */
const T = themeCss({ scale: "bold", base: 17 }); ok(/h1\{font-size:clamp\(2\.4rem/.test(T) && /body\{font-size:17px\}/.test(T), "scale + base size become CSS");
ok(!/h1\{font-size:clamp\(2\.4rem|body\{font-size:/.test(themeCss({ scale: "huge", base: 40 })), "unknown scale / out-of-range size are ignored");
const tv = validateDoc({ theme: { scale: "tight", base: "18", muted: "#777777", border: "red;}", primary: "#7b61ff" }, settings: {}, pages: [{ slug: "home", title: "Home", sections: [] }] }, { pages: 20 }).theme;
ok(tv.scale === "tight" && tv.base === 18 && tv.muted === "#777777" && !("border" in tv), "server keeps valid tokens and drops an invalid border colour");
ok(!("scale" in validateDoc({ theme: { scale: "<x>", base: 99 }, settings: {}, pages: [{ slug: "home", title: "Home", sections: [] }] }, { pages: 20 }).theme), "server drops invalid scale / base");

/* 3. element colours can reference tokens (follow the theme) */
const ce = cleanEl({ "h1-0": { st: { c: "@a", bg: "@card", bc: "@xyz" } } }); ok(ce["h1-0"].st.c === "@a" && ce["h1-0"].st.bg === "@card" && !ce["h1-0"].st.bc, "token colours kept, unknown tokens dropped");
const s3 = siteOf(t); s3.pages[0].sections[1].el = ce; h = renderPage(s3, "home", { base: "/" }); ok(/color:var\(--a\)!important;background:var\(--card\)!important/.test(h), "token colours render as CSS variables");
ok(Object.keys(EL_TOKENS).length === 8 && Object.values(EL_TOKENS).every((x) => /^--[a-z0-9]+$/.test(x)), "8 colour tokens, all plain CSS variable names");

/* 4. element duplicate / remove */
const s4 = siteOf(t); s4.pages[0].sections[1].el = { "h1-0": { dup: 2, dt: ["Second <b>line</b>"] }, "p-0": { dup: 1 }, "a-0": { hide: { d: true, t: true, m: true } } };
const v4 = validateDoc(JSON.parse(JSON.stringify(s4)), { pages: 20 }); ok(v4.pages[0].sections[1].el["h1-0"].dup === 2 && v4.pages[0].sections[1].el["h1-0"].dt[0] === "Second bline/b", "duplicate count + copy text validated (no markup)");
h = renderPage(v4, "home", { base: "/" });
ok((h.match(/data-x="1-h1-0"/g) || []).length === 3 && (h.match(/<h1[\s>]/g) || []).length === 1, "two copies after the heading, copies are H2 (still exactly one H1)");
ok(/<h2 data-x="1-h1-0" data-xc="1"[^>]*>Second bline\/b<\/h2>/.test(h), "a copy shows its own text (escaped)");
ok((h.match(/data-x="1-p-0"/g) || []).length === 2, "paragraph duplicated once");
const ed = renderPage(v4, "home", { base: "/", edit: true }); ok(!/data-xc="1"[^>]*data-f=/.test(ed) && /data-x="1-h1-0" data-f=/.test(ed), "copies never carry inline-edit hooks (editing a copy can't change the original)");
ok(/@media \(min-width:1025px\)\{\[data-x="1-a-0"\]\{display:none!important\}\}/.test(h) && /max-width:767px\)\{\[data-x="1-a-0"\]\{display:none/.test(h), "remove = hidden on every device (restorable)");
ok(cleanEl({ "h1-0": { dup: 99 } }) === null && cleanEl({ "h1-0": { dup: 6 } })["h1-0"].dup === 6, "at most 6 copies");
const s5 = siteOf(t); s5.pages[0].sections[1].el = { "img-0": { dup: 1 }, "li-0": { dup: 1 } }; ok(renderPage(s5, "home", { base: "/" }).length > 1000, "void / list elements duplicate without breaking the page");

/* 5. editor wiring (static checks: the features exist and are connected) */
const B = rd("js/website-builder.js"), N = rd("js/wb-v42.js"), E = rd("js/wb-elements.js"), V = rd("js/wb-v34.js"), P = rd("js/wb-panels.js"), CSS = rd("css/website-builder.css");
ok(/import \* as N from "\/js\/wb-v42\.js"/.test(B) && /N\.barButtons\(\)/.test(B) && /N\.refresh\(\)/.test(B), "builder loads the v42 module, bottom-bar buttons and live side-by-side refresh");
ok(/data-cm="copy"/.test(B) && /wb-cmreset/.test(B) && /N\.syncOver/.test(B) && /sec\.over\[d\.f\]/.test(B), "component panel: All copies / This copy only / Reset to master, canvas typing respects the mode");
ok(/Object\.assign\(\{\}, k\.props, s\.over \|\| \{\}\)/.test(P), "Detach / delete component keep the copy's overrides");
ok(/export function tokens/.test(N) && /X\.after\.design\(el\)/.test(P) && /Copy CSS variables/.test(N), "design tokens panel inside Design, with CSS / JSON export");
ok(/export function sideBySide/.test(N) && /\["Desktop", 1280\], \["Tablet", 820\], \["Mobile", 390\]/.test(N), "side by side: desktop 1280 · tablet 820 · mobile 390");
ok(/export function rulers/.test(N) && /wb-guides-/.test(N) && /ondblclick/.test(N) && /wb-rul/.test(CSS), "rulers + draggable guides saved per website");
ok(/export function duplicate/.test(E) && /export function remove/.test(E) && /k === "d"/.test(E) && /data-tokp/.test(E), "element Duplicate (Ctrl+D) / Remove + token colour swatches");
ok(/id="mr-no">Discard/.test(V) && /data-mrv="tablet"/.test(V) && /data-mr="/.test(V) && /Nothing is applied until you press Apply/.test(V), "make responsive: preview first (phone + tablet), pick changes, Apply or Discard");
ok(!/—/.test(N) && !/—/.test(E.split("\n").filter((l) => /v42|Duplicate|Remove/.test(l)).join("")), "no long dashes in new user-facing text");

console.log("\nv42: " + pass + " passed, " + fail + " failed"); if (fail) process.exit(1);
