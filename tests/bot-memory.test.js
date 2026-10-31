#!/usr/bin/env node
/* FODO Bot, memory, follow-up routing and "opens only on click" checks.
 * Needs the site served on http://localhost:8765 (e.g. `python3 -m http.server 8765` from the fodo folder).
 * /api/chat is mocked here, so no Cloudflare account is needed. */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8765";
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await b.newContext({ viewport: vp }); await ctx.addInitScript(() => { try { localStorage.setItem("fodo-ai", "on"); } catch (e) {} });  // v10: AI replies are a visitor switch, on for this test
    const posts = [];
    await ctx.route("**/api/chat", async (route) => {
      const r = route.request();
      if (r.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ai: true, kv: true }) });
      const body = JSON.parse(r.postData() || "{}"); posts.push(body);
      const reply = /^haan$/i.test(body.message) ? "Great, here is your 3-step plan for the cafe." : "Want me to make a plan for your cafe?";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, reply }) });
    });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    const tag = vp.width + "px";
    await p.goto(BASE + "/", { waitUntil: "load" });
    await p.waitForTimeout(4500);
    ok(await p.evaluate(() => document.querySelector(".bot-panel").hidden === true), `${tag} chat stays closed on page load`);
    await p.mouse.move(5, 5);
    await p.waitForFunction(() => window.FODO_BOT_LLM && window.FODO_BOT && window.FODO_BOT.ask, null, { timeout: 20000 });
    await p.waitForTimeout(900); // probe
    await p.click(".bot-fab");
    ok(await p.evaluate(() => document.querySelector(".bot-panel").hidden === false), `${tag} chat opens on click`);
    await p.fill("#bot-in", "I run a cafe in Noida, how do I get more customers?"); await p.press("#bot-in", "Enter");
    await p.waitForFunction(() => /plan for your cafe/.test(document.querySelector("#bot-log").textContent), null, { timeout: 15000 });
    await p.fill("#bot-in", "haan"); await p.press("#bot-in", "Enter");
    await p.waitForFunction(() => /3-step plan/.test(document.querySelector("#bot-log").textContent), null, { timeout: 15000 });
    const last = posts[posts.length - 1];
    ok(last && last.message === "haan" && last.history.length >= 2 && /plan for your cafe/.test(last.history[last.history.length - 1].content), `${tag} "haan" goes to the AI with the previous turns`);
    // navigate: transcript + AI memory survive
    await p.goto(BASE + "/services/", { waitUntil: "load" });
    await p.waitForTimeout(3000);
    ok(await p.evaluate(() => document.querySelector(".bot-panel").hidden === true), `${tag} chat closed after navigating`);
    await p.mouse.move(5, 5);
    await p.waitForFunction(() => window.FODO_BOT_LLM && window.FODO_BOT.ask, null, { timeout: 20000 });
    await p.click(".bot-fab");
    const logTxt = await p.evaluate(() => document.querySelector("#bot-log").textContent);
    ok(/I run a cafe in Noida/.test(logTxt) && /3-step plan/.test(logTxt), `${tag} earlier conversation is shown on the next page`);
    ok((await p.evaluate(() => window.FODO_BOT_LLM.state().history)) >= 4, `${tag} AI memory kept across pages`);
    await p.fill("#bot-in", "ok"); await p.press("#bot-in", "Enter");
    await p.waitForTimeout(1500);
    ok(posts[posts.length - 1].message === "ok" && posts[posts.length - 1].history.length >= 4, `${tag} follow-up on the new page still has the history`);
    // new chat clears
    await p.click(".bot-new");
    await p.waitForTimeout(800);
    const after = await p.evaluate(() => ({ t: document.querySelector("#bot-log").textContent, h: window.FODO_BOT_LLM.state().history, s: sessionStorage.getItem("fodo-bot-log") }));
    ok(!/cafe in Noida/.test(after.t) && after.h === 0, `${tag} "New chat" clears the conversation`);
    // name statement must not trigger the bot-identity line offline
    const nameAns = await p.evaluate(() => window.FODO_BOT.answer("mera name Rohit hai"));
    ok(!/not human/i.test(nameAns), `${tag} "mera name Rohit hai" does not trigger "I'm not human"`);
    ok(!errs.length, `${tag} no page errors ${errs.join(" | ")}`);
    await ctx.close();
  }
  await b.close();
  console.log(`\nbot memory: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
