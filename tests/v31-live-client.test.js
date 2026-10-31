/* v31 FODO Brain live voice client (js/owner-brain-live.js) in Chromium with a fake Gemini WebSocket + fake microphone:
   resumption handle → seamless reconnect on goAway (same conversation), automatic reconnect after a drop, lite fallback when a
   newer feature is refused, group mode ("only when I say FODO") drops talk not meant for FODO + follow-up window, tool calls
   blocked when not addressed, transcript turns, your voice can interrupt while FODO speaks (adaptive echo gate).
   Run: node tests/v31-live-client.test.js */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const SRC = fs.readFileSync(path.join(__dirname, "../js/owner-brain-live.js"), "utf8");
const HARNESS = `
window.__ws = []; window.__tok = [];
window.FodoVoice = { _h: {}, start: () => Promise.resolve(true), context: () => (window.__ac || (window.__ac = new AudioContext())), pauseVad: () => {}, on: (n, f) => { (FodoVoice._h[n] = FodoVoice._h[n] || []).push(f); },
  frame: (rms) => { const f = new Float32Array(1600).fill(rms); (FodoVoice._h.frame || []).forEach((g) => g({ f, sr: 16000, rms })); } };
window.fetch = (u) => { window.__tok.push(String(u)); const q = new URL(u, "https://x.test").searchParams; const lite = q.get("lite") === "1";
  return Promise.resolve({ json: () => Promise.resolve({ ok: true, ws: "wss://fake/" + window.__tok.length, tier: lite ? "basic" : "rich", model: "models/test", setup: { model: "models/test" } }) }); };
class FakeWS { constructor(u) { this.u = u; this.sent = []; this.readyState = 0; window.__ws.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 5); }
  send(x) { this.sent.push(JSON.parse(x)); } close(code, r) { this.readyState = 3; this.closed = code || 1000; }
  srv(m) { this.onmessage && this.onmessage({ data: JSON.stringify(m) }); } drop(code, reason) { this.readyState = 3; this.onclose && this.onclose({ code, reason }); } }
window.WebSocket = FakeWS;
window.__ev = []; `;
(async () => {
  const b = await chromium.launch(), p = await b.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.setContent("<html><body></body></html>"); await p.addScriptTag({ content: HARNESS }); await p.addScriptTag({ content: SRC });
  await p.evaluate(() => { ["state", "turn", "ignored", "reconnect", "error", "closed", "brain"].forEach((n) => FodoLive.on(n, (x) => __ev.push([n, x]))); });
  const W = (i) => p.evaluate((i) => { const w = __ws[i]; return { u: w.u, sent: w.sent, closed: w.closed }; }, i);
  const srv = (i, m) => p.evaluate(([i, m]) => __ws[i].srv(m), [i, m]);
  const pcm = Buffer.alloc(4800).toString("base64"), audio = { serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: pcm } }] } } };

  /* 1. conversation mode, resumption + goAway */
  await p.evaluate(() => FodoLive.start({ mode: "chat", voice: "Kore", tool: (q) => Promise.resolve({ answer: "42 users today" }) }).then((x) => (window.__started = x)));
  await p.waitForFunction(() => __ws.length === 1 && __ws[0].sent.length === 1);
  let w0 = await W(0); ok(w0.sent[0].setup && /mode=chat/.test(await p.evaluate(() => __tok[0])) && /voice=Kore/.test(await p.evaluate(() => __tok[0])), "token asked with mode + chosen voice; setup sent");
  await srv(0, { setupComplete: {} }); await srv(0, { sessionResumptionUpdate: { newHandle: "HANDLE_abc12345", resumable: true } });
  await p.evaluate(() => { for (let i = 0; i < 3; i++) FodoVoice.frame(0.03); });
  w0 = await W(0); ok(w0.sent.some((m) => m.realtimeInput && m.realtimeInput.audio), "microphone audio streams after setup");
  await srv(0, { serverContent: { inputTranscription: { text: "aaj kitne users aaye" } } }); await srv(0, audio); await srv(0, { serverContent: { outputTranscription: { text: "Aaj 42 users." } } }); await srv(0, { serverContent: { turnComplete: true } });
  let ev = await p.evaluate(() => __ev.filter((e) => e[0] === "turn").map((e) => e[1]));
  ok(ev.length === 2 && ev[0].role === "you" && /users/.test(ev[0].text) && ev[1].role === "fodo" && /42/.test(ev[1].text), "transcript turns (you + FODO) for the panel and chat history");
  await srv(0, { goAway: { timeLeft: "10s" } }); await p.waitForFunction(() => __ws.length === 2 && __ws[1].sent.length === 1, null, { timeout: 3000 });
  ok(/handle=HANDLE_abc12345/.test(await p.evaluate(() => __tok[1])) && (await W(0)).closed === 1000 && (await p.evaluate(() => __ev.some((e) => e[0] === "reconnect"))), "goAway → seamless reconnect with the resumption handle (same conversation)");
  await srv(1, { setupComplete: {} });
  ok(!(await p.evaluate(() => __ev.some((e) => e[0] === "closed" || e[0] === "error"))), "no 'closed'/'error' shown to the user during the handover");
  await p.evaluate(() => __ws[1].drop(1011, "internal")); await p.waitForFunction(() => __ws.length === 3, null, { timeout: 3000 });
  ok(/handle=HANDLE_abc12345/.test(await p.evaluate(() => __tok[2])), "unexpected drop mid-conversation → automatic reconnect, conversation kept");
  await srv(2, { setupComplete: {} });

  /* 2. barge-in: while FODO speaks, normal speech gets through, quiet speaker leak doesn't */
  await srv(2, audio); await p.evaluate(() => { for (let i = 0; i < 40; i++) FodoVoice.frame(0.012); });
  const leak = await p.evaluate(() => __ws[2].sent.filter((m) => m.realtimeInput && m.realtimeInput.audio).map((m) => atob(m.realtimeInput.audio.data)).some((s) => /[^\0]/.test(s)));
  await p.evaluate(() => { for (let i = 0; i < 3; i++) FodoVoice.frame(0.045); });
  const voice = await p.evaluate(() => __ws[2].sent.filter((m) => m.realtimeInput && m.realtimeInput.audio).slice(-2).map((m) => atob(m.realtimeInput.audio.data)).some((s) => /[^\0]/.test(s)));
  ok(!leak && voice, "while FODO talks: speaker leak is held back, but a normal speaking voice (0.045) gets through to interrupt (old gate needed 0.055)");
  await p.evaluate(() => FodoLive.stop());

  /* 3. group mode */
  await p.evaluate(() => { __ev.length = 0; return FodoLive.start({ mode: "wake", tool: (q) => { window.__toolQ = q; return Promise.resolve({ answer: "done" }); } }); });
  await p.waitForFunction(() => __ws.length === 4 && __ws[3].sent.length === 1); await srv(3, { setupComplete: {} });
  ok(/mode=wake/.test(await p.evaluate(() => __tok[3])), "group mode token");
  await srv(3, { serverContent: { inputTranscription: { text: "bhaiya chai le aao" } } }); await srv(3, audio); await srv(3, { serverContent: { outputTranscription: { text: "Sure" } } });
  ok(!(await p.evaluate(() => FodoLive.isSpeaking())), "group mode: talk not meant for FODO is NOT spoken");
  await srv(3, { toolCall: { functionCalls: [{ id: "t1", name: "fodo_brain", args: { request: "chai" } }] } });
  ok(!(await p.evaluate(() => window.__toolQ)) && (await W(3)).sent.some((m) => m.toolResponse && /Stay silent/.test(m.toolResponse.functionResponses[0].response.result)), "…and no FODO Brain action is run for it");
  await srv(3, { serverContent: { turnComplete: true } });
  ok(await p.evaluate(() => __ev.some((e) => e[0] === "ignored") && __ev.some((e) => e[0] === "turn" && e[1].ignored)), "ignored turn is marked (shown faded, not saved)");
  await srv(3, { serverContent: { inputTranscription: { text: "FODO, aaj ka revenue batao" } } }); await srv(3, audio);
  ok(await p.evaluate(() => FodoLive.isSpeaking()), "“FODO, …” in the middle of a conversation → FODO answers");
  await srv(3, { serverContent: { outputTranscription: { text: "Aaj ₹4,000." } } }); await srv(3, { serverContent: { turnComplete: true } });
  await p.evaluate(() => FodoLive.interrupt());
  await srv(3, { serverContent: { inputTranscription: { text: "aur kal ka?" } } }); await srv(3, audio);
  ok(await p.evaluate(() => FodoLive.isSpeaking()), "a follow-up right after FODO answered works without saying FODO again");
  await p.evaluate(() => FodoLive.stop());

  /* 4. a newer feature refused → plain session */
  await p.evaluate(() => FodoLive.start({ mode: "chat" })); await p.waitForFunction(() => __ws.length === 5 && __ws[4].sent.length === 1);
  await p.evaluate(() => __ws[4].drop(1007, "Invalid argument: proactivity")); await p.waitForFunction(() => __ws.length === 6, null, { timeout: 3000 });
  ok(/lite=1/.test(await p.evaluate(() => __tok[5])) && !(await p.evaluate(() => __ev.some((e) => e[0] === "error"))), "setup refused → retried as a plain session automatically (no error)");
  await p.evaluate(() => FodoLive.stop());
  ok(!errs.length, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
  await b.close();
  console.log("\nv31 live client: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("FAIL crashed: " + e.message); process.exit(1); });
