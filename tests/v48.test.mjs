// v48 Workspace Design 2.0: the design layer, grouped navigation with icons, dark / light switch on every app page,
// guided empty states, the new Overview + Pro home, Brand Kit preview. Checks wiring and data, nothing is estimated.
// Run: node --no-warnings tests/v48.test.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const WS = fs.readFileSync("js/workspace.js", "utf8"), CSS = fs.readFileSync("css/workspace-2.css", "utf8"), BP = fs.readFileSync("scripts/build_pages.py", "utf8");
ok(/html\[data-theme="light"\]\{/.test(CSS) && /:root,html\[data-theme="dark"\]\{/.test(CSS), "design layer: dark and light token sets");
ok(/--ac-grow|--ac-hire|--ac-biz|--ac-money|--ac-pro|--ac-admin/.test(CSS) && /body\[data-area="hire"\]/.test(CSS), "one accent per area, switched by body[data-area]");
ok(/document\.body\.setAttribute\("data-area", AREA\[v\]/.test(WS), "the router sets the area on every page change");
ok(/var GROUPS = MODE === "pro" \?/.test(WS) && /\["Grow", \["xray", "growth", "content", "studio"\]\]/.test(WS) && /\["Hire", \["project-builder", "pros", "quotes", "projects"\]\]/.test(WS) && /function navHtml\(\)/.test(WS), "grouped sidebar (Grow / Hire / Business / Account; Work / You for Pros)");
ok(/var ICN = \{/.test(WS) && (WS.match(/<path d=|<circle cx=|<rect x=/g) || []).length > 20 && /ICN\[n\.id\] \? SVG\(ICN\[n\.id\]\)/.test(WS), "line icons for every navigation item (inline SVG, no unicode glyphs)");
ok(/id="ws-theme"/.test(WS) && /function setTheme\(t\)/.test(WS) && /localStorage\.setItem\("fodo-theme", t\)/.test(WS), "theme switch in the Workspace / Pros sidebar, saved under the same key as the public site");
ok(/wbh-theme/.test(fs.readFileSync("js/wb-home.js", "utf8")) && /id="wb-theme"/.test(fs.readFileSync("js/website-builder.js", "utf8")) && /id="ob-theme"/.test(fs.readFileSync("js/owner-brain.js", "utf8")), "theme switch in the Website Builder (home + editor) and the Owner Brain too");
ok(/workspace-2\.css/.test(BP) && (BP.match(/workspace-2\.css/g) || []).length === 2 && /workspace-2\.css/.test(fs.readFileSync("workspace/index.html", "utf8")) && /workspace-2\.css/.test(fs.readFileSync("fodo-pros/index.html", "utf8")), "the layer is loaded by the Workspace and the Pros shells");
ok(/var ORB = /.test(WS) && /ws-guide/.test(WS) && /ws-chipbar/.test(WS) && /var empty = function \(t, sub, cta, steps, chips\)/.test(WS), "empty() renders the orbit mark, a 3-step guide and search chips");
for (const k of ["No projects yet", "No content yet", "No campaign plans yet", "No requests yet", "No approved FODO Pros yet"]) ok(WS.indexOf(k) > -1, "guided empty state: " + k);
ok(/\[data-chip\]/.test(WS) && /\$\("#mk-q"\)\.value = b\.dataset\.chip; go\(\)/.test(WS), "Hire Pros chips run a search");
ok(/ws-wel/.test(WS) && /Set up in 5 steps/.test(WS) && /ws-ring/.test(WS) && /What FODO can do for you/.test(WS) && /hasData \?/.test(WS), "Overview: welcome, setup ring, feature tiles, stat cards only once there is data");
ok(/function \(NX\) \{ return NX\.length \?/.test(WS), "Next best actions is hidden when empty");
ok(/This week/.test(WS) && /ws-week/.test(WS) && /j\.badges && j\.badges\.length/.test(WS) && /Waiting for you/.test(WS), "Pro home: this-week strip, badges, waiting / active / earned");
ok(/ws-adhead/.test(WS) && !/\["Funded \(held\)", inr\(o\.money\.funded\)\]/.test(WS), "Admin: status line instead of ten zero cards");
ok(/ws-bk/.test(WS) && /id="bk-prev"/.test(WS) && /1 · Identity/.test(WS) && /3 · Voice/.test(WS), "Brand Kit: three steps + live preview card");
ok(/var avatar = function/.test(WS) && /--av1:hsl\(/.test(WS), "gradient avatars from the name");
ok(/ws-promo/.test(WS) && /ME\.roles\.indexOf\("admin"\) < 0/.test(WS), "Become a FODO Pro promo card for clients (not for staff)");
const B = fs.readFileSync("functions/_lib/biz.js", "utf8"); ok(/brand: !!brand, crm: await safe/.test(B) && /badges: await \(async \(\) => \{ try \{ return \(await \(await import\("\.\/proapps\.js"\)\)\.badgeMap/.test(B), "dashboard data: brand / crm / xray flags, Pro badges");
ok(CSS.indexOf("—") < 0 && WS.indexOf("—") < 0 && !/\b[Ww]orkers?\b/.test(CSS), "no long dash, no 'worker'");
ok(/@media \(max-width:860px\)\{\.ws-app\{grid-template-columns:1fr\}/.test(CSS), "mobile: single column");
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
