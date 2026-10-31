/* v20.3, the "Ask FODO" bot knows everything built on the site, with live data, and paying members get a personal assistant.
   Real site pages + real bot chain in Chromium; the APIs answer with the real help articles, prices and Growth Lab catalog.
   Run: node tests/v203-bot.test.js */
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png" };
(async () => {
  const kbMod = await import(path.join(ROOT, "functions/_lib/helpkb.js")), help = await import(path.join(ROOT, "functions/_lib/help.js")), lab = await import(path.join(ROOT, "functions/api/lab/[[path]].js"));
  const KB = { ok: true, cats: kbMod.HELP_CATS, articles: kbMod.HELP_KB, prices: help.priceFacts(), support: "support@fodo.co.in" }, CAT = lab.catalog({});
  const FREE = null, PAID = { email: "rohit@shop.in", plan: "Growth", planUntil: "2026-11-29", paid: true, xraysLeft: { thisMonth: 27, packs: 5, free: 0 }, toolRuns: ["Competitor War Room: 1"], openTickets: [],
    latestXray: { website: "expocitytravels.com", date: "2026-10-30", link: "/business-x-ray/?r=abcdefghij0123456789", score: "61/100", areas: ["Website 86", "Search Visibility 40"],
      topActions: [{ priority: "P0", problem: "No testimonials or reviews on the site", fix: "Add 3–6 named testimonials or embed real Google reviews near the CTAs." }, { priority: "P0", problem: "Headline doesn't say who it's for", fix: "Name the audience in the hero." }] } };
  let me = FREE, chatBodies = [], chatCookies = [];
  const srv = http.createServer((req, res) => {
    const u = req.url.split("?")[0], send = (o, s) => { res.writeHead(s || 200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (u === "/api/help/kb") return send(KB);
    if (u === "/api/lab/catalog") return send(CAT);
    if (u === "/api/help/me") return send({ ok: true, facts: me });
    if (u === "/api/chat" && req.method === "GET") return send({ ok: true, ai: true, member: me ? { plan: me.plan, paid: me.paid } : null });
    if (u === "/api/chat" && req.method === "POST") { let b = ""; req.on("data", (c) => b += c); req.on("end", () => { chatBodies.push(JSON.parse(b)); chatCookies.push(req.headers.cookie || ""); send({ ok: true, reply: "AI coach: start with **testimonials** on [your report](/business-x-ray/?r=abcdefghij0123456789)." }); }); return; }
    let p = decodeURIComponent(u); if (p.endsWith("/")) p += "index.html"; const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, r)); const BASE = "http://localhost:" + srv.address().port;
  const b = await chromium.launch(), ctx = await b.newContext(); await ctx.addCookies([{ name: "fodo_s", value: "sess123", url: BASE }]);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const boot = async () => { await p.goto(BASE + "/", { waitUntil: "load" }); await p.mouse.move(5, 5); await p.waitForFunction(() => window.FODO_BOT_PRODUCT && window.FODO_BOT_LLM, null, { timeout: 20000 }); await p.waitForTimeout(500); };
  const ask = (q) => p.evaluate((q) => window.FODO_BOT.answerAsync(q), q);
  const text = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  /* ---------- a visitor ---------- */
  await boot();   // a visitor: AI replies stay off until they switch them on
  let a = await ask("plans kitne ke hain?");
  ok(/Starter: ₹499\/month/.test(text(a)) && /Agency: ₹9,999\/month/.test(text(a)) && /plans\//.test(a), "Growth Lab plans with live prices + link (Hinglish question)");
  a = await ask("What is the Competitor War Room?");
  ok(/Competitor War Room/.test(a) && /₹299/.test(a) && /growth-lab\/war-room\//.test(a), "a Pro tool: what it does, its one-run price, its page");
  a = await ask("free tools kya hai?");
  ok(/Growth Score/.test(a) && /Competitor Finder/.test(a) && /marketing-budget\//.test(a), "free tools listed with links");
  a = await ask("refund kaise milega?");
  ok(/refund/i.test(a) && /help\//.test(a), "refund question → FODO's own refund article + ticket link");
  a = await ask("x-ray kya hai");
  ok(/Business X-Ray|X-Ray/.test(a) && /business-x-ray\//.test(a), "what the Business X-Ray is");
  a = await ask("mera plan kya hai?");
  ok(/log in/i.test(text(a)) && /account\/\?login=1/.test(a), "logged out: 'my plan' asks them to log in (never guesses)");
  a = await ask("how much do you charge?");
  ok(/fixed price|scope/i.test(text(a)) && /Growth Lab/.test(a) && /Starter: ₹499/.test(text(a)), "general pricing: the agency answer stays, self-serve prices are added under it");
  a = await ask("seo kya hai");
  ok(/SEO/.test(a) && !/Growth Lab/.test(a), "marketing questions still go to the marketing brain");
  a = await ask("where can I find the roi calculator?");
  ok(/roi-calculator\//.test(a), "'where is …' finds the page from the site index");

  /* ---------- a paying member ---------- */
  me = PAID;
  await p.evaluate(() => { localStorage.removeItem("fodo-ai"); sessionStorage.clear(); });
  await ctx.clearCookies(); await ctx.addCookies([{ name: "fodo_s", value: "paid456", url: BASE }]);
  await boot();
  await p.waitForFunction(() => window.FODO_BOT_LLM.member() && window.FODO_BOT_LLM.member().paid, null, { timeout: 8000 }).catch(() => {});
  ok(await p.evaluate(() => !!(window.FODO_BOT_LLM.member() && window.FODO_BOT_LLM.member().paid && window.FODO_BOT_LLM.aiOn())), "paid member: AI replies switch on by themselves");
  a = await ask("kitne x-ray bache hai?");
  ok(/Growth/.test(a) && /27/.test(text(a)) && /expocitytravels\.com/.test(a) && /61\/100/.test(a), "own account: plan, X-Rays left, latest X-Ray with score");
  a = await ask("What is the Competitor War Room?");
  ok(/Your Growth plan includes it/.test(text(a)), "a tool already in their plan → 'no need to buy it'");
  a = await ask("What should I fix first in my X-Ray?");
  ok(/AI coach/.test(text(a)) && chatBodies.length === 1, "coaching question → the AI, which sees their report");
  ok(/paid456/.test(chatCookies[0]), "the AI request carries the login cookie (so the server reads their own plan and report)");
  await p.evaluate(() => localStorage.setItem("fodo-ai", "off"));
  a = await ask("What should I fix first in my X-Ray?");
  ok(/No testimonials/.test(a) && /Add 3–6 named testimonials/.test(text(a)) && /business-x-ray\/\?r=abcdefghij0123456789/.test(a), "AI off → coaching straight from their latest X-Ray's top actions");
  await p.click(".bot-fab").catch(() => {}); await p.waitForTimeout(400);
  ok(await p.evaluate(() => { const x = document.getElementById("bot-member"); return !!x && /Growth/.test(x.textContent); }), "member badge in the bot header");
  ok(!errs.length, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
  await b.close(); srv.close();
  console.log("\nv20.3 bot: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
})();
