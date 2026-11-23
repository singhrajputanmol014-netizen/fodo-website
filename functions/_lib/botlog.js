/* v55.17 one conversation log for every FODO Bot channel (website chat, Instagram, Facebook, WhatsApp), shown in
   Admin ▸ Lead Intelligence ▸ Sent & replies ▸ Bot conversations.
   One KV key per person ("dm:cv:<platform>:<id>", 30 days). The value keeps the last 30 messages; the metadata (read by one
   KV list) keeps who, the last message each way, when, how many, and whether the bot or a person is answering.
   It never blocks or changes a reply. */
const CV_TTL = 30 * 86400, CV_KEEP = 30;
export const BOT_PLATFORMS = ["website", "instagram", "facebook", "whatsapp"];
export async function logConvo(env, platform, id, o) {
  try {
    if (!env || !env.CHAT_KV || !id || BOT_PLATFORMS.indexOf(platform) < 0) return;
    o = o || {};
    const key = "dm:cv:" + platform + ":" + String(id).replace(/[^\w.+-]/g, "").slice(0, 80);
    const cur = env.CHAT_KV.getWithMetadata ? await env.CHAT_KV.getWithMetadata(key) : { value: await env.CHAT_KV.get(key), metadata: null };
    let msgs = []; try { msgs = cur && cur.value ? JSON.parse(cur.value) : []; } catch (e) { msgs = []; }
    const m = (cur && cur.metadata) || {}, t = new Date().toISOString();
    let name = m.n || "";
    if (!name && o.name) name = o.name;
    else if (!name && !m.nt && typeof o.lookupName === "function") { try { name = await o.lookupName(); } catch (e) { name = ""; } }
    if (o.in) msgs.push({ r: "in", t, x: String(o.in).slice(0, 600) });
    if (o.out) msgs.push({ r: o.by === "human" ? "human" : "bot", t, x: String(o.out).slice(0, 900) });
    msgs = msgs.slice(-CV_KEEP);
    const meta = { p: platform, n: String(name || "").slice(0, 90), nt: 1, li: o.in ? String(o.in).slice(0, 140) : m.li || "", lo: o.out ? String(o.out).slice(0, 140) : m.lo || "",
      at: t, c: (m.c || 0) + (o.in ? 1 : 0), st: o.state || m.st || "bot", ld: o.lead || m.ld || "" };
    await env.CHAT_KV.put(key, JSON.stringify(msgs), { expirationTtl: CV_TTL, metadata: meta });
  } catch (e) { /* the log never blocks a reply */ }
}
