/* FODO v45 Content & Ad Studio: AI drafts for captions, reel scripts and ad copy, written from the Brand Kit, checked
   against each platform's real limits and against common ad-policy problems, plus a UTM link builder.
   Honest rules: the AI writes DRAFTS (nothing is posted or published), text that doesn't fit a platform limit is trimmed at a
   word boundary or dropped (and the answer says so), policy flags are warnings from fixed rules (not a platform review),
   usage is limited per day, and when no AI is available the answer says so instead of returning canned text. */
import { nowIso, count, isOwner, db as adb } from "./accounts.js";
import { bdb, err, getBrand } from "./biz.js";
import { groqChat } from "./aivis.js";

export const LANGS = ["English", "Hindi", "Hinglish"];
export const CAPTION = { Instagram: { max: 2200, tags: 10 }, Facebook: { max: 5000, tags: 5 }, LinkedIn: { max: 3000, tags: 5 }, X: { max: 280, tags: 2 }, YouTube: { max: 5000, tags: 8, title: 100 }, WhatsApp: { max: 1000, tags: 0 }, Threads: { max: 500, tags: 3 } };
export const ADS = {
  Meta: { primary: [125, 3], headline: [40, 5], description: [30, 3], note: "Primary text: 125 characters show before “See more”. Headline 40, description 30." },
  Google: { headline: [30, 15], description: [90, 4], note: "Responsive search ad: up to 15 headlines (30 characters) and 4 descriptions (90 characters). Google needs at least 3 headlines and 2 descriptions." },
  LinkedIn: { primary: [150, 3], headline: [70, 5], note: "Intro text: 150 characters show before “see more”. Headline 70." },
  TikTok: { primary: [100, 5], note: "Ad text: up to 100 characters." },
};
export const DAILY = 30, DAILY_OWNER = 300;
const MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"];
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, n);
const int = (v, lo, hi) => { const n = Math.round(+v); return isFinite(n) && n >= lo && n <= hi ? n : null; };
/* AI text is untrusted: no markup, no control characters */
const clean = (s, n) => clip(String(s == null ? "" : s).replace(/<[^>]*>/g, "").replace(/[<>]/g, "").replace(/\*\*/g, ""), n || 3000);

export const aiOn = (env) => !!((env.AI && typeof env.AI.run === "function") || env.GROQ_API_KEY);
async function ai(env, system, user, max) {
  const msgs = [{ role: "system", content: system }, { role: "user", content: user }];
  if (env.AI && typeof env.AI.run === "function") for (const m of MODELS) { try { const r = await Promise.race([env.AI.run(m, { messages: msgs, max_tokens: max || 1200, temperature: 0.7 }), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 25000))]);
    const t = typeof r === "string" ? r : (r && (r.response || (r.result && r.result.response))) || ""; if (t) return { text: String(t), model: m }; } catch (e) {} }
  if (env.GROQ_API_KEY) { try { const g = await groqChat(env, msgs, max || 1200, 25000); return { text: g.text, model: g.model }; } catch (e) {} }
  throw err("AI writing isn't available right now. Please try again in a minute.", 503);
}
/* the first JSON object in the answer (models sometimes wrap it in text or ``` fences) */
export function jsonOf(t) { const s = String(t || ""), a = s.indexOf("{"), b = s.lastIndexOf("}"); if (a < 0 || b <= a) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; } }
/* fit text into a limit: cut at a word boundary only if most of it stays, otherwise drop it */
export function fit(s, max, noTrim) { s = clean(s, 5000).replace(/\s+/g, " "); if (!s) return null; if (s.length <= max) return { text: s, trimmed: false }; if (noTrim) return null; const head = s.slice(0, max + 1), sp = head.lastIndexOf(" "); if (sp < 1) return null; const cut = head.slice(0, sp).replace(/[\s,;:–-]+$/, ""); return cut.length >= max * 0.7 ? { text: cut, trimmed: true } : null; }   // ads: short fields are dropped, never cut mid-sentence

/* fixed-rule policy checks (warnings, not a platform decision) */
const RULES = [
  [/\bguarantee(d|s)?\b|\b100\s?%/i, "Absolute claims (“guaranteed”, “100%”) need proof; ad platforms often reject them."],
  [/\b(the )?best\b|\bno\.?\s?1\b|#1\b|\bnumber one\b|\bcheapest\b|\blowest price\b/i, "Superlatives (“best”, “#1”, “cheapest”) need proof you can show."],
  [/\b(are you|you are|you're|struggling with your)\b[^.?!]{0,40}\b(overweight|fat|obese|diabet\w*|depress\w*|bald\w*|in debt|single|divorced|pregnan\w*|acne|anxious)\b/i, "Don't imply you know the reader's personal attributes (health, finances, relationships). Meta rejects this."],
  [/\b(lose|lost) \d+\s?(kg|kilos?|pounds|lbs)\b|\bweight[- ]loss\b|\bcures?\b|\bmiracle\b|\bpermanent(ly)? (cure|fix)\b/i, "Health / weight-loss promises are restricted on every ad platform."],
  [/\b(only today|last chance|ends tonight|hurry)\b/i, "Urgency is fine only if the deadline is real."],
  [/!!|\b[A-Z]{4,}\b(?:\s+\b[A-Z]{4,}\b){1,}/, "Too many capitals or exclamation marks look like spam (Google limits them)."],
  [/\b(free money|get rich|earn \d+.{0,10}(daily|per day))\b/i, "Income claims are restricted."],
];
export function policy(texts, platform) {
  const all = texts.filter(Boolean).join(" \n "), out = [];
  RULES.forEach((r) => { if (r[0].test(all)) out.push(r[1]); });
  if (platform === "Google" && /\+?\d[\d\s-]{8,}\d/.test(all)) out.push("Google ads don't allow phone numbers in the ad text (use a call asset).");
  if (platform === "Google" && /https?:\/\/|www\./i.test(all)) out.push("Google ads don't allow links in the ad text.");
  return out;
}

async function quota(env, u) { const lim = isOwner(u) ? DAILY_OWNER : DAILY; if (await count(env, "studio:" + u.id, lim, 86400)) { await giveBack(env, u); throw err("You've used today's " + lim + " AI drafts. More tomorrow.", 429); } }
/* a draft that failed (AI down, unusable answer) or was refused doesn't count */
async function giveBack(env, u) { try { await (await adb(env)).prepare("UPDATE acct_counters SET n = MAX(0, n - 1) WHERE k=?1").bind("studio:" + u.id).run(); } catch (e) {} }
const counted = (fn) => async (env, u, b) => { await quota(env, u); try { return await fn(env, u, b); } catch (e) { await giveBack(env, u); throw e; } };
async function brandLine(env, u) { const b = await getBrand(env, u); if (!b) return { brand: null, text: "No Brand Kit saved yet: write in a clear, friendly, professional voice." };
  return { brand: b, text: "Brand: " + (b.name || "") + (b.tagline ? " (" + b.tagline + ")" : "") + ". Tone: " + (b.tone || "clear and friendly") + (b.voice && b.voice.length ? ". Voice words: " + b.voice.join(", ") : "") + (b.audience ? ". Audience: " + b.audience : "") + (b.dos ? ". Do: " + b.dos : "") + (b.donts ? ". Don't: " + b.donts : "") + "." }; }
const langLine = (l) => (l === "Hindi" ? "Write in Hindi (Devanagari script)." : l === "Hinglish" ? "Write in Hinglish (Hindi in Latin script mixed with English), the way people in India write on social media." : "Write in English (Indian audience).");
const facts = (b) => "Use only facts given here; never invent prices, offers, awards, numbers, reviews or testimonials. If something isn't given, leave it out.";

/* ---------- captions ---------- */
export const caption = counted(async (env, u, b) => {
  const platform = CAPTION[b.platform] ? b.platform : "Instagram", L = CAPTION[platform], lang = LANGS.indexOf(b.language) > -1 ? b.language : "English", topic = clip(b.topic, 600);
  if (topic.length < 5) throw err("Describe the post (what it's about, 5+ characters)."); const br = await brandLine(env, u);
  const sys = "You write social media captions for small businesses in India. " + facts() + " Return ONLY JSON: {\"variants\":[{\"hook\":\"first line that stops the scroll\",\"caption\":\"full caption without hashtags\",\"hashtags\":[\"#tag\"],\"cta\":\"call to action\"}]} with exactly 3 different variants.";
  const usr = br.text + "\nPlatform: " + platform + " (max " + L.max + " characters" + (L.title ? "; also keep it suitable as a video description" : "") + ", up to " + L.tags + " hashtags). Format: " + clip(b.format, 30) + ".\nPost: " + topic + (b.offer ? "\nOffer (only if real): " + clip(b.offer, 200) : "") + (b.cta ? "\nCall to action: " + clip(b.cta, 100) : "") + "\n" + langLine(lang);
  const r = await ai(env, sys, usr, 1500), j = jsonOf(r.text) || {}, V = Array.isArray(j.variants) ? j.variants : [];
  const variants = V.slice(0, 3).map((v) => { const tags = (Array.isArray(v.hashtags) ? v.hashtags : []).map((t) => "#" + clean(t, 40).replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")).filter((t) => t.length > 1).slice(0, L.tags);
    const tagText = tags.length ? "\n\n" + tags.join(" ") : "", body = [clean(v.hook, 300), clean(v.caption, L.max), clean(v.cta, 200)].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join("\n\n"), room = L.max - tagText.length, f = fit(body, Math.max(40, room));
    return f ? { hook: clean(v.hook, 300), text: f.text + tagText, hashtags: tags, chars: (f.text + tagText).length, trimmed: f.trimmed } : null; }).filter(Boolean);
  if (!variants.length) throw err("The AI answer couldn't be used. Please try again.", 502);
  return { platform, limit: L.max, variants, flags: policy(variants.map((v) => v.text)), model: r.model, brandUsed: !!br.brand };
});

/* ---------- reel / short video script ---------- */
export const script = counted(async (env, u, b) => {
  const sec = [15, 30, 45, 60, 90].indexOf(+b.seconds) > -1 ? +b.seconds : 30, lang = LANGS.indexOf(b.language) > -1 ? b.language : "English", topic = clip(b.topic, 600);
  if (topic.length < 5) throw err("Describe the video (5+ characters)."); const br = await brandLine(env, u);
  const sys = "You write short vertical video scripts (Reels / Shorts) for small businesses in India. " + facts() + " Return ONLY JSON: {\"hook\":\"0-3 s hook line\",\"scenes\":[{\"t\":\"0-3s\",\"visual\":\"what we see\",\"voiceover\":\"what is said\",\"onscreen\":\"text on screen\"}],\"cta\":\"closing call to action\",\"shots\":[\"shot list item\"],\"music\":\"music mood\"}";
  const usr = br.text + "\nLength: " + sec + " seconds, 9:16. Platform: " + clip(b.platform, 30) + ".\nVideo: " + topic + "\n" + langLine(lang);
  const r = await ai(env, sys, usr, 1500), j = jsonOf(r.text) || {};
  const scenes = (Array.isArray(j.scenes) ? j.scenes : []).slice(0, 12).map((s) => ({ t: clean(s.t, 20), visual: clean(s.visual, 300), voiceover: clean(s.voiceover, 400), onscreen: clean(s.onscreen, 120) })).filter((s) => s.visual || s.voiceover);
  if (!scenes.length) throw err("The AI answer couldn't be used. Please try again.", 502);
  return { seconds: sec, hook: clean(j.hook, 200), scenes, cta: clean(j.cta, 200), shots: (Array.isArray(j.shots) ? j.shots : []).slice(0, 15).map((x) => clean(x, 160)).filter(Boolean), music: clean(j.music, 120), flags: policy([j.hook, j.cta].concat(scenes.map((s) => s.voiceover + " " + s.onscreen))), model: r.model };
});

/* ---------- ad copy, fitted to the platform ---------- */
export const ads = counted(async (env, u, b) => {
  const platform = ADS[b.platform] ? b.platform : "Meta", S = ADS[platform], lang = LANGS.indexOf(b.language) > -1 ? b.language : "English", product = clip(b.product, 400);
  if (product.length < 5) throw err("Describe what you're advertising (5+ characters)."); const br = await brandLine(env, u);
  const want = Object.keys(S).filter((k) => k !== "note"), shape = "{" + want.map((k) => "\"" + k + "\":[" + S[k][1] + " strings, each max " + S[k][0] + " characters]").join(",") + "}";
  const sys = "You write paid ad copy for small businesses in India that follows Meta, Google, LinkedIn and TikTok ad policies (no personal-attribute targeting language, no unprovable claims, no excessive capitals). " + facts() + " Return ONLY JSON shaped like " + shape + ". Respect every character limit.";
  const usr = br.text + "\nPlatform: " + platform + ". Objective: " + clip(b.objective, 80) + ".\nProduct / service: " + product + (b.audience ? "\nAudience: " + clip(b.audience, 200) : "") + (b.offer ? "\nOffer (only if real): " + clip(b.offer, 200) : "") + "\n" + langLine(lang);
  const r = await ai(env, sys, usr, 1500), j = jsonOf(r.text) || {}, out = {}; let dropped = 0, trimmed = 0;
  want.forEach((k) => { const seen = new Set(); out[k] = (Array.isArray(j[k]) ? j[k] : []).map((s) => fit(s, S[k][0], true)).filter((x) => { if (!x) { dropped++; return false; } const key = x.text.toLowerCase(); if (seen.has(key)) return false; seen.add(key); if (x.trimmed) trimmed++; return true; }).slice(0, S[k][1]).map((x) => x.text); });
  if (!want.some((k) => out[k].length)) throw err("The AI answer couldn't be used. Please try again.", 502);
  const warn = []; if (platform === "Google" && (out.headline.length < 3 || out.description.length < 2)) warn.push("Google needs at least 3 headlines and 2 descriptions: generate again or write more yourself.");
  return { platform, spec: S, copy: out, dropped, trimmed, warnings: warn, flags: policy(want.reduce((a, k) => a.concat(out[k]), []), platform), model: r.model, publishing: "Draft only. Ads are published from your ad account; FODO doesn't run ads for you here." };
});

/* ---------- UTM links (no AI) ---------- */
const slug = (s) => clip(s, 80).toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
export function utm(b) {
  let u; try { u = new URL(clip(b.url, 1000)); } catch (e) { throw err("Enter the full landing page link (https://…)."); } if (u.protocol !== "https:") throw err("Use an https:// link.");
  const p = { utm_source: slug(b.source), utm_medium: slug(b.medium), utm_campaign: slug(b.campaign), utm_content: slug(b.content), utm_term: slug(b.term) };
  if (!p.utm_source || !p.utm_medium || !p.utm_campaign) throw err("Source, medium and campaign are needed (for example instagram / paid_social / diwali_sale).");
  Object.keys(p).forEach((k) => { if (p[k]) u.searchParams.set(k, p[k]); else u.searchParams.delete(k); }); return { url: u.toString() };
}

/* ---------- save a chosen draft onto a content item or an ad plan (YOUR rows only) ---------- */
export async function save(env, u, b) {
  const d = await bdb(env), copy = JSON.stringify(b.copy == null ? "" : b.copy).slice(0, 12000); if (copy.length < 3) throw err("Nothing to save.");
  for (const q of ["ALTER TABLE biz_content ADD COLUMN copy TEXT", "ALTER TABLE biz_campaigns ADD COLUMN copy TEXT"]) { try { await d.prepare(q).run(); } catch (e) {} }
  const r = b.contentId ? await d.prepare("UPDATE biz_content SET copy=?3, updated_at=?4 WHERE id=?1 AND user_id=?2").bind(clip(b.contentId, 40), u.id, copy, nowIso()).run()
    : b.campaignId ? await d.prepare("UPDATE biz_campaigns SET copy=?3, updated_at=?4 WHERE id=?1 AND user_id=?2").bind(clip(b.campaignId, 40), u.id, copy, nowIso()).run() : null;
  if (!r || !r.meta.changes) throw err("Pick one of your content items or ad plans.", 404); return { ok: true };
}
export async function usage(env, u) { let used = 0; try { const r = await (await adb(env)).prepare("SELECT n, exp FROM acct_counters WHERE k=?1").bind("studio:" + u.id).first(); used = r && r.exp > Date.now() ? Math.max(0, r.n) : 0; } catch (e) {} return { ai: aiOn(env), used, limit: isOwner(u) ? DAILY_OWNER : DAILY, languages: LANGS, captionPlatforms: Object.keys(CAPTION), adPlatforms: Object.keys(ADS), adSpecs: ADS }; }
