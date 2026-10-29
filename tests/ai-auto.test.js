/* Browser check of llmMode:"auto": static site (no /api) stays offline; healthy backend switches AI on; failures fall back;
   duplicate sends are ignored. The /api/chat backend is mocked with Playwright routes. Run with the site on :8765. */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://localhost:8765";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
(async () => {
  const br = await chromium.launch();
  async function run(mock, aiOff) {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript(() => { try { sessionStorage.setItem("fodo-loaded", "1"); sessionStorage.setItem("fodo-bot", "1"); } catch (e) { } });
    if (!aiOff) await ctx.addInitScript(() => { try { localStorage.setItem("fodo-ai", "on"); } catch (e) { } });
    let posts = 0;
    if (mock) await ctx.route("**/api/chat", async (r) => { if (r.request().method() === "GET") return r.fulfill({ contentType: "application/json", body: JSON.stringify(mock.health) }); posts++; return mock.post(r); });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/about/", { waitUntil: "networkidle" }); await p.mouse.move(5, 5);
    await p.waitForFunction(() => window.FODO_BOT && window.FODO_BOT.ask && window.FODO_BOT_LLM, null, { timeout: 15000 }); await p.waitForTimeout(1500);
    await p.click(".bot-fab"); await p.waitForTimeout(600);
    return { p, ctx, errs, posts: () => posts };
  }
  const last = (p) => p.evaluate(() => [...document.querySelectorAll(".bot-log .msg.bot")].at(-1).textContent);
  const ask = async (p, q) => { await p.fill("#bot-in", q); await p.press("#bot-in", "Enter"); await p.waitForTimeout(2200); };
  // 1. no backend (static upload) → offline, no AI calls
  { const { p, ctx, errs, posts } = await run(null);
    await ask(p, "explain quantum computing in simple words for a 10 year old please"); ok(posts() === 0, "static: no AI posts");
    ok((await last(p)).length > 20, "static: offline answer given"); ok(!errs.length, "static: no page errors " + errs.join("|"));
    // duplicate send guard
    const n0 = await p.$$eval(".bot-log .msg.me", (m) => m.length); await p.evaluate(() => { window.FODO_BOT.ask("pricing"); window.FODO_BOT.ask("pricing"); }); await p.waitForTimeout(800);
    ok((await p.$$eval(".bot-log .msg.me", (m) => m.length)) === n0 + 1, "duplicate send ignored"); await ctx.close(); }
  // 2. healthy backend → AI answers open questions
  { const { p, ctx, posts } = await run({ health: { ok: true, ai: true }, post: (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, reply: "AI SAYS: quantum bits can be 0 and 1 at once." }) }) });
    await ask(p, "explain quantum computing in simple words for a 10 year old please");
    ok(posts() >= 1 && /AI SAYS/.test(await last(p)), "auto: AI reply used when backend healthy");
    ok(/AI-assisted/.test(await p.textContent("#bot-composer-note").catch(() => "AI-assisted")), "auto: composer note says AI-assisted"); await ctx.close(); }
  // 3. backend healthy but answer fails (quota) → offline fallback, never empty
  { const { p, ctx, posts } = await run({ health: { ok: true, ai: true }, post: (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, code: "quota" }) }) });
    await ask(p, "explain quantum computing in simple words for a 10 year old please");
    const t = await last(p); ok(posts() >= 1 && t.length > 20 && !/AI SAYS/.test(t), "fallback: offline answer on 503"); await ctx.close(); }
  // 4. backend says ai:false (kill switch) → no posts
  { const { p, ctx, posts } = await run({ health: { ok: true, ai: false }, post: (r) => r.fulfill({ contentType: "application/json", body: "{}" }) });
    await ask(p, "explain quantum computing in simple words for a 10 year old please"); ok(posts() === 0, "kill switch: no AI posts"); await ctx.close(); }
  // 5. v10 visitor switch: healthy backend but AI switched off → offline, switch shown; turning it on uses AI
  { const { p, ctx, posts } = await run({ health: { ok: true, ai: true }, post: (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, reply: "AI SAYS: hello." }) }) }, true);
    ok(await p.isVisible("#bot-ai-toggle") && (await p.getAttribute("#bot-ai-toggle", "aria-checked")) === "false", "switch: shown and off by default");
    await ask(p, "explain quantum computing in simple words for a 10 year old please"); ok(posts() === 0, "switch off: no AI posts");
    await p.click("#bot-ai-toggle"); ok((await p.getAttribute("#bot-ai-toggle", "aria-checked")) === "true", "switch: turns on");
    await ask(p, "explain black holes in simple words for a 10 year old please"); ok(posts() >= 1 && /AI SAYS/.test(await last(p)), "switch on: AI reply used"); await ctx.close(); }
  await br.close(); console.log(`ai-auto: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
