/* FODO BRAIN — social media: connect Facebook Pages + Instagram (Meta), LinkedIn (profile; company pages once LinkedIn approves
   the Community Management API), X, YouTube (through the Google connector), post ONE upload everywhere, and read the numbers.
   Official APIs only. Tokens are AES-GCM encrypted in D1 (brain_social). Files are sent exactly as uploaded — FODO never resizes
   or re-encodes them; each platform then applies its own processing (that part is outside anyone's control).
   Publishing is a resumable state machine: every call to runPost() does as much as fits in its time budget (one upload part,
   one container check…) and saves where it is, so big videos and slow platforms never time out. The Social page keeps calling
   it while open; the hourly tick finishes anything left and publishes scheduled posts.
   Secrets: META_APP_ID, META_APP_SECRET · LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET (+ LINKEDIN_ORG_APPROVED=1 after approval)
            X_CLIENT_ID, X_CLIENT_SECRET · YouTube uses GOOGLE_CLIENT_ID/SECRET. Optional: META_GRAPH_VERSION, LINKEDIN_VERSION. */
import { brainDb, nowIso, rid, clip, clean, sha } from "./store.js";
import { seal, unseal, makeState, checkState } from "../gsc.js";
import { outbound } from "../xray-core.js";
import * as MD from "./media.js";
import * as G from "./google.js";

const MV = (env) => env.META_GRAPH_VERSION || "v23.0", LV = (env) => env.LINKEDIN_VERSION || "202608";
export const metaOn = (env) => !!(env.META_APP_ID && env.META_APP_SECRET), liOn = (env) => !!(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET), xOn = (env) => !!(env.X_CLIENT_ID && env.X_CLIENT_SECRET);
export const PLATFORMS = {
  facebook: { name: "Facebook Page", needs: "META_APP_ID + META_APP_SECRET", text: true, images: 10, video: 1 },
  instagram: { name: "Instagram", needs: "META_APP_ID + META_APP_SECRET (Instagram professional account linked to a Facebook Page)", text: false, images: 10, video: 1 },
  linkedin: { name: "LinkedIn profile", needs: "LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET", text: true, images: 20, video: 1 },
  linkedin_org: { name: "LinkedIn company page", needs: "LinkedIn Community Management API approval → LINKEDIN_ORG_APPROVED=1", text: true, images: 20, video: 1 },
  x: { name: "X", needs: "X_CLIENT_ID + X_CLIENT_SECRET (pay-per-use API)", text: true, images: 4, video: 1, chars: 280 },
  youtube: { name: "YouTube", needs: "Google connected with YouTube upload ticked", text: false, images: 0, video: 1 },
};
export function available(env) { return { facebook: metaOn(env), instagram: metaOn(env), linkedin: liOn(env), linkedin_org: liOn(env) && env.LINKEDIN_ORG_APPROVED === "1", x: xOn(env), youtube: G.googleOn(env) }; }
const redirect = (origin, p) => origin + "/api/owner-brain/connect/" + p + "/callback";

async function http(env, url, opt, who) {
  opt = opt || {}; const r = await outbound(env)(url, { method: opt.method || "GET", headers: opt.headers || {}, body: opt.body, signal: AbortSignal.timeout(opt.timeout || 30000) });
  const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch (e) { j = { raw: txt.slice(0, 200) }; }
  if (!r.ok) { const m = (j.error && (j.error.error_user_msg || j.error.message)) || j.message || j.detail || j.title || (j.errors && j.errors[0] && (j.errors[0].message || j.errors[0].detail)) || j.error_description || j.raw || ""; const e = new Error((who || "Platform") + " " + r.status + ": " + clip(String(m), 220)); e.status = r.status; throw e; }
  return opt.full ? { j, h: r.headers, status: r.status } : j;
}
const form = (o) => new URLSearchParams(Object.keys(o).filter((k) => o[k] != null).reduce((a, k) => { a[k] = typeof o[k] === "object" ? JSON.stringify(o[k]) : String(o[k]); return a; }, {})).toString();
const FORM = { "content-type": "application/x-www-form-urlencoded" };
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function pkce(env, state) { const verifier = (await sha("x-pkce|" + (env.X_CLIENT_SECRET || "") + "|" + state)) + "Fv"; return { verifier, challenge: b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))) }; }

/* ---------------- connect ---------------- */
export async function connectUrl(env, platform, origin, userId) {
  const st = platform + "~" + (await makeState(env, userId));
  if (platform === "meta") { if (!metaOn(env)) throw new Error("Add META_APP_ID and META_APP_SECRET first.");
    return "https://www.facebook.com/" + MV(env) + "/dialog/oauth?" + new URLSearchParams({ client_id: env.META_APP_ID, redirect_uri: redirect(origin, "meta"), state: st, response_type: "code", scope: "pages_show_list,pages_read_engagement,pages_manage_posts,read_insights,instagram_basic,instagram_content_publish,instagram_manage_insights,business_management" }); }
  if (platform === "linkedin") { if (!liOn(env)) throw new Error("Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET first.");
    return "https://www.linkedin.com/oauth/v2/authorization?" + new URLSearchParams({ response_type: "code", client_id: env.LINKEDIN_CLIENT_ID, redirect_uri: redirect(origin, "linkedin"), state: st, scope: "openid profile email w_member_social" + (env.LINKEDIN_ORG_APPROVED === "1" ? " w_organization_social r_organization_social rw_organization_admin" : "") }); }
  if (platform === "x") { if (!xOn(env)) throw new Error("Add X_CLIENT_ID and X_CLIENT_SECRET first."); const p = await pkce(env, st);
    return "https://x.com/i/oauth2/authorize?" + new URLSearchParams({ response_type: "code", client_id: env.X_CLIENT_ID, redirect_uri: redirect(origin, "x"), scope: "tweet.read tweet.write users.read offline.access media.write", state: st, code_challenge: p.challenge, code_challenge_method: "S256" }); }
  throw new Error("Unknown platform.");
}
async function upsert(env, a, by) {
  const d = await brainDb(env), id = a.platform + ":" + a.ext_id;
  await d.prepare("INSERT INTO brain_social (id, platform, ext_id, name, handle, avatar, token, refresh, expires_at, meta, connected_by, connected_at, status, last_error) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'ok',NULL) ON CONFLICT(id) DO UPDATE SET name=?4, handle=?5, avatar=?6, token=?7, refresh=?8, expires_at=?9, meta=?10, connected_by=?11, connected_at=?12, status='ok', last_error=NULL")
    .bind(id, a.platform, String(a.ext_id), clip(a.name || "", 120), clip(a.handle || "", 80), clip(a.avatar || "", 400), a.token ? await seal(env, a.token) : null, a.refresh ? await seal(env, a.refresh) : null, a.expires_at || null, JSON.stringify(a.meta || {}), by || "", nowIso()).run();
  return id;
}
export async function finishConnect(env, platform, origin, userId, code, state, by) {
  const s = String(state || ""), i = s.indexOf("~"); if (s.slice(0, i) !== platform || !(await checkState(env, s.slice(i + 1), userId))) throw new Error("The sign-in link expired — try Connect again.");
  const got = [];
  if (platform === "meta") {
    const v = MV(env), t = await http(env, "https://graph.facebook.com/" + v + "/oauth/access_token?" + new URLSearchParams({ client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: redirect(origin, "meta"), code }), {}, "Facebook");
    const ll = await http(env, "https://graph.facebook.com/" + v + "/oauth/access_token?" + new URLSearchParams({ grant_type: "fb_exchange_token", client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: t.access_token }), {}, "Facebook");
    const pages = await http(env, "https://graph.facebook.com/" + v + "/me/accounts?limit=50&fields=id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}&access_token=" + encodeURIComponent(ll.access_token), {}, "Facebook");
    if (!(pages.data || []).length) throw new Error("No Facebook Page was shared with FODO. Connect again and select your Page (and its Instagram account).");
    for (const p of pages.data) {
      got.push(await upsert(env, { platform: "facebook", ext_id: p.id, name: p.name, avatar: p.picture && p.picture.data && p.picture.data.url, token: p.access_token, meta: {} }, by));
      const ig = p.instagram_business_account; if (ig) got.push(await upsert(env, { platform: "instagram", ext_id: ig.id, name: ig.username, handle: "@" + ig.username, avatar: ig.profile_picture_url, token: p.access_token, meta: { page: p.id } }, by));
    }
  } else if (platform === "linkedin") {
    const t = await http(env, "https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", headers: FORM, body: form({ grant_type: "authorization_code", code, redirect_uri: redirect(origin, "linkedin"), client_id: env.LINKEDIN_CLIENT_ID, client_secret: env.LINKEDIN_CLIENT_SECRET }) }, "LinkedIn");
    const exp = new Date(Date.now() + (+t.expires_in || 5184000) * 1000).toISOString();
    const me = await http(env, "https://api.linkedin.com/v2/userinfo", { headers: { authorization: "Bearer " + t.access_token } }, "LinkedIn");
    got.push(await upsert(env, { platform: "linkedin", ext_id: me.sub, name: me.name || [me.given_name, me.family_name].join(" "), handle: me.email || "", avatar: me.picture, token: t.access_token, refresh: t.refresh_token, expires_at: exp, meta: {} }, by));
    if (env.LINKEDIN_ORG_APPROVED === "1") { try {
      const acl = await http(env, "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED", { headers: liH(env, t.access_token) }, "LinkedIn");
      for (const e of acl.elements || []) { const oid = String(e.organization || e.organizationTarget || "").split(":").pop(); if (!oid) continue; let nm = "Company page " + oid; try { nm = (await http(env, "https://api.linkedin.com/rest/organizations/" + oid, { headers: liH(env, t.access_token) }, "LinkedIn")).localizedName || nm; } catch (x) {}
        got.push(await upsert(env, { platform: "linkedin_org", ext_id: oid, name: nm, token: t.access_token, expires_at: exp, meta: {} }, by)); }
    } catch (e) {} }
  } else if (platform === "x") {
    const p = await pkce(env, s);
    const t = await http(env, "https://api.x.com/2/oauth2/token", { method: "POST", headers: Object.assign({ authorization: "Basic " + btoa(env.X_CLIENT_ID + ":" + env.X_CLIENT_SECRET) }, FORM), body: form({ grant_type: "authorization_code", code, redirect_uri: redirect(origin, "x"), code_verifier: p.verifier, client_id: env.X_CLIENT_ID }) }, "X");
    const me = await http(env, "https://api.x.com/2/users/me?user.fields=profile_image_url", { headers: { authorization: "Bearer " + t.access_token } }, "X");
    got.push(await upsert(env, { platform: "x", ext_id: me.data.id, name: me.data.name, handle: "@" + me.data.username, avatar: me.data.profile_image_url, token: t.access_token, refresh: t.refresh_token, expires_at: new Date(Date.now() + (+t.expires_in || 7200) * 1000).toISOString(), meta: {} }, by));
  } else throw new Error("Unknown platform.");
  return { connected: got };
}
const liH = (env, tok) => ({ authorization: "Bearer " + tok, "Linkedin-Version": LV(env), "X-Restli-Protocol-Version": "2.0.0", "content-type": "application/json" });

/* ---------------- accounts ---------------- */
export async function accounts(env, withYoutube) {
  const d = await brainDb(env), L = ((await d.prepare("SELECT id, platform, ext_id, name, handle, avatar, expires_at, meta, connected_by, connected_at, status, last_error FROM brain_social ORDER BY platform, name").all()).results || []).map((a) => Object.assign(a, { meta: JSON.parse(a.meta || "{}"), expiresSoon: !!(a.expires_at && Date.parse(a.expires_at) - Date.now() < 7 * 864e5) }));
  if (withYoutube !== false) { try { (await G.youtubeChannels(env)).forEach((c) => L.push({ id: "youtube:" + c.id, platform: "youtube", ext_id: c.id, name: c.name, handle: c.handle, meta: { account: c.account }, status: "ok", via: "Google · " + c.account })); } catch (e) {} }
  return L;
}
export async function disconnect(env, id) { const d = await brainDb(env); await d.prepare("DELETE FROM brain_social WHERE id=?1").bind(String(id)).run(); return { disconnected: id }; }
async function token(env, a) {
  const d = await brainDb(env), row = await d.prepare("SELECT * FROM brain_social WHERE id=?1").bind(a.id).first(); if (!row) throw new Error(a.id + " is not connected.");
  if (row.platform === "x" && row.expires_at && Date.parse(row.expires_at) - Date.now() < 5 * 60e3) {   // X access tokens live 2 h; refresh tokens rotate
    const t = await http(env, "https://api.x.com/2/oauth2/token", { method: "POST", headers: Object.assign({ authorization: "Basic " + btoa(env.X_CLIENT_ID + ":" + env.X_CLIENT_SECRET) }, FORM), body: form({ grant_type: "refresh_token", refresh_token: await unseal(env, row.refresh), client_id: env.X_CLIENT_ID }) }, "X");
    await d.prepare("UPDATE brain_social SET token=?2, refresh=?3, expires_at=?4 WHERE id=?1").bind(row.id, await seal(env, t.access_token), await seal(env, t.refresh_token || (await unseal(env, row.refresh))), new Date(Date.now() + (+t.expires_in || 7200) * 1000).toISOString()).run();
    return t.access_token;
  }
  if (/^linkedin/.test(row.platform) && row.expires_at && Date.parse(row.expires_at) < Date.now()) throw new Error("The LinkedIn connection expired (LinkedIn allows 60 days) — reconnect LinkedIn on the Social page.");
  return await unseal(env, row.token);
}

/* ---------------- posts ---------------- */
const isVid = (m) => /^video\//.test(m.mime);
export async function createPost(env, p, by) {
  const caption = clean(p.caption, 63000), captions = p.captions && typeof p.captions === "object" ? p.captions : {};
  const all = await accounts(env), targets = [].concat(p.targets || []).map(String).filter((t, i, a) => a.indexOf(t) === i);
  if (!targets.length) throw new Error("Choose at least one account to post to.");
  const media = []; for (const id of [].concat(p.media || []).slice(0, 20)) { const m = await MD.get(env, id); if (!m || m.status !== "ready") throw new Error("A file is still uploading or missing — wait for it to finish."); media.push(m); }
  const vids = media.filter(isVid), imgs = media.filter((m) => !isVid(m)), problems = [];
  for (const t of targets) {
    const a = all.filter((x) => x.id === t)[0]; if (!a) { problems.push(t + " is not connected"); continue; }
    const P = PLATFORMS[a.platform], text = clean(captions[a.platform] != null ? captions[a.platform] : caption, 63000);
    if (vids.length && imgs.length && a.platform !== "instagram") problems.push(P.name + ": post either photos or one video, not both");
    if (vids.length > P.video && !(a.platform === "instagram" && media.length <= 10)) problems.push(P.name + ": only " + P.video + " video per post");
    if (imgs.length > P.images) problems.push(P.name + ": up to " + P.images + " photos");
    if (!P.text && !media.length) problems.push(P.name + " needs a photo or video");
    if (a.platform === "youtube" && vids.length !== 1) problems.push("YouTube needs exactly one video");
    if (P.chars && text.length > P.chars && env.X_LONG_POSTS !== "1") problems.push(P.name + ": " + text.length + "/" + P.chars + " characters — shorten it or write a separate X caption");
    if (!text && !media.length) problems.push(P.name + ": nothing to post");
  }
  if (problems.length) throw new Error(problems.join(" · "));
  const at = p.scheduleAt ? Date.parse(p.scheduleAt) : 0; if (p.scheduleAt && (!at || at < Date.now() - 60e3)) throw new Error("The schedule time must be in the future.");
  const d = await brainDb(env), id = "sp_" + rid(12), results = {}; targets.forEach((t) => { results[t] = { status: "queued" }; });
  await d.prepare("INSERT INTO brain_social_posts (id, caption, captions, media, targets, status, scheduled_at, results, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)")
    .bind(id, caption, JSON.stringify(captions), JSON.stringify(media.map((m) => m.id)), JSON.stringify(targets), at > Date.now() + 60e3 ? "scheduled" : "publishing", at ? new Date(at).toISOString() : null, JSON.stringify(results), by || "", nowIso()).run();
  return await getPost(env, id);
}
export async function getPost(env, id) { const d = await brainDb(env), p = await d.prepare("SELECT * FROM brain_social_posts WHERE id=?1").bind(String(id)).first(); if (!p) return null; ["captions", "media", "targets", "results"].forEach((k) => { p[k] = JSON.parse(p[k] || (k === "captions" || k === "results" ? "{}" : "[]")); }); return p; }
export async function listPosts(env, n) { const d = await brainDb(env), L = (await d.prepare("SELECT id FROM brain_social_posts ORDER BY created_at DESC LIMIT ?1").bind(n || 30).all()).results || []; return Promise.all(L.map((r) => getPost(env, r.id))); }
export async function cancelPost(env, id) { const d = await brainDb(env); const r = await d.prepare("UPDATE brain_social_posts SET status='cancelled', updated_at=?2 WHERE id=?1 AND status='scheduled'").bind(id, nowIso()).run(); return { cancelled: !!(r.meta && r.meta.changes) }; }

export async function runPost(env, origin, id, budgetMs) {
  const t0 = Date.now(), budget = budgetMs || 20000, d = await brainDb(env); let p = await getPost(env, id); if (!p) throw new Error("Post not found.");
  if (p.status === "scheduled" && Date.parse(p.scheduled_at) > Date.now()) return p;
  if (p.status === "scheduled") await d.prepare("UPDATE brain_social_posts SET status='publishing' WHERE id=?1").bind(id).run();
  if (["done", "partial", "failed", "cancelled"].indexOf(p.status) > -1) return p;
  const all = await accounts(env), media = []; for (const mid of p.media) media.push(await MD.get(env, mid));
  for (const t of p.targets) {
    const r = p.results[t]; if (!r || r.status === "done" || r.status === "failed") continue;
    const a = all.filter((x) => x.id === t)[0]; if (!a) { r.status = "failed"; r.error = "Account disconnected."; continue; }
    const text = clean(p.captions[a.platform] != null ? p.captions[a.platform] : p.caption, 63000);
    while (Date.now() - t0 < budget && r.status !== "done" && r.status !== "failed") {
      r.status = "working";
      try { const w = await STEP[a.platform](env, origin, a, text, media, r); if (w && w.wait) { r.waitUntil = Date.now() + w.wait; if (w.wait > 3000 || Date.now() - t0 + w.wait > budget) break; await new Promise((ok) => setTimeout(ok, w.wait)); } }
      catch (e) { r.tries = (r.tries || 0) + 1; r.lastError = clip(e.message, 300); if (r.tries >= 3 || (e.status && e.status < 500 && e.status !== 429)) { r.status = "failed"; r.error = r.lastError; } else break; }
      await d.prepare("UPDATE brain_social_posts SET results=?2, updated_at=?3 WHERE id=?1").bind(id, JSON.stringify(p.results), nowIso()).run();
    }
    if (Date.now() - t0 >= budget) break;
  }
  const S = p.targets.map((t) => p.results[t].status), fin = S.every((s) => s === "done" || s === "failed");
  const status = !fin ? "publishing" : S.every((s) => s === "done") ? "done" : S.some((s) => s === "done") ? "partial" : "failed";
  await d.prepare("UPDATE brain_social_posts SET status=?2, results=?3, updated_at=?4 WHERE id=?1").bind(id, status, JSON.stringify(p.results), nowIso()).run();
  return await getPost(env, id);
}
/* tick: publish due scheduled posts and finish unfinished ones */
export async function runDue(env, origin) {
  const d = await brainDb(env), L = (await d.prepare("SELECT id FROM brain_social_posts WHERE (status='scheduled' AND scheduled_at <= ?1) OR status='publishing' ORDER BY created_at LIMIT 5").bind(nowIso()).all()).results || [], out = [];
  for (const r of L) { try { const p = await runPost(env, origin, r.id, 25000); out.push({ id: r.id, status: p.status }); } catch (e) { out.push({ id: r.id, error: e.message }); } }
  return out;
}

/* ---------------- per-platform publishing steps (each call = one small unit of work) ---------------- */
const STEP = {};
const waitPull = (ms) => ({ wait: ms });
STEP.facebook = async (env, origin, a, text, media, r) => {
  const v = MV(env), tok = await token(env, a), vids = media.filter(isVid), imgs = media.filter((m) => !isVid(m));
  for (const m of media) { const w = MD.pullReadyIn(m); if (w) return waitPull(w); }
  if (vids.length) { const j = await http(env, "https://graph-video.facebook.com/" + v + "/" + a.ext_id + "/videos", { method: "POST", headers: FORM, body: form({ file_url: MD.publicUrl(origin, vids[0]), description: text, access_token: tok }), timeout: 60000 }, "Facebook"); r.status = "done"; r.postId = j.id; r.url = "https://www.facebook.com/" + a.ext_id + "/videos/" + j.id; return; }
  if (imgs.length === 1) { const j = await http(env, "https://graph.facebook.com/" + v + "/" + a.ext_id + "/photos", { method: "POST", headers: FORM, body: form({ url: MD.publicUrl(origin, imgs[0]), caption: text, access_token: tok }) }, "Facebook"); r.status = "done"; r.postId = j.post_id || j.id; r.url = "https://www.facebook.com/" + (j.post_id || j.id); return; }
  r.photos = r.photos || [];
  if (r.photos.length < imgs.length) { const m = imgs[r.photos.length], j = await http(env, "https://graph.facebook.com/" + v + "/" + a.ext_id + "/photos", { method: "POST", headers: FORM, body: form({ url: MD.publicUrl(origin, m), published: "false", access_token: tok }) }, "Facebook"); r.photos.push(j.id); return; }
  const j = await http(env, "https://graph.facebook.com/" + v + "/" + a.ext_id + "/feed", { method: "POST", headers: FORM, body: form({ message: text, attached_media: r.photos.map((x) => ({ media_fbid: x })), access_token: tok }) }, "Facebook");
  r.status = "done"; r.postId = j.id; r.url = "https://www.facebook.com/" + j.id;
};
STEP.instagram = async (env, origin, a, text, media, r) => {
  const v = MV(env), tok = await token(env, a), G_ = "https://graph.facebook.com/" + v + "/";
  const src = async (m) => { if (!isVid(m) && m.mime !== "image/jpeg") { const d = await brainDb(env), j = await d.prepare("SELECT * FROM brain_media WHERE variant_of=?1 AND status='ready'").bind(m.id).first(); if (!j) throw Object.assign(new Error("Instagram accepts JPG photos only — this one is " + m.mime + ". Re-upload it from the Social page (it makes a JPG copy automatically)."), { status: 400 }); return j; } return m; };
  for (const m of media) { const w = MD.pullReadyIn(await src(m)); if (w) return waitPull(w); }
  if (!r.container) {
    if (media.length === 1) { const m = await src(media[0]); const j = await http(env, G_ + a.ext_id + "/media", { method: "POST", headers: FORM, body: form(isVid(m) ? { media_type: "REELS", video_url: MD.publicUrl(origin, m), caption: text, share_to_feed: "true", access_token: tok } : { image_url: MD.publicUrl(origin, m), caption: text, access_token: tok }) }, "Instagram"); r.container = j.id; return; }
    r.children = r.children || [];
    if (r.children.length < media.length) { const m = await src(media[r.children.length]); const j = await http(env, G_ + a.ext_id + "/media", { method: "POST", headers: FORM, body: form(isVid(m) ? { media_type: "VIDEO", video_url: MD.publicUrl(origin, m), is_carousel_item: "true", access_token: tok } : { image_url: MD.publicUrl(origin, m), is_carousel_item: "true", access_token: tok }) }, "Instagram"); r.children.push(j.id); return; }
    for (const c of r.children) { const s = await http(env, G_ + c + "?fields=status_code,status&access_token=" + encodeURIComponent(tok), {}, "Instagram"); if (s.status_code === "ERROR") throw Object.assign(new Error("Instagram could not process a carousel item: " + (s.status || "error")), { status: 400 }); if (s.status_code !== "FINISHED") return { wait: 5000 }; }
    const j = await http(env, G_ + a.ext_id + "/media", { method: "POST", headers: FORM, body: form({ media_type: "CAROUSEL", children: r.children.join(","), caption: text, access_token: tok }) }, "Instagram"); r.container = j.id; return;
  }
  if (!r.ready) { const s = await http(env, G_ + r.container + "?fields=status_code,status&access_token=" + encodeURIComponent(tok), {}, "Instagram");
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw Object.assign(new Error("Instagram could not process the media: " + (s.status || s.status_code)), { status: 400 });
    if (s.status_code !== "FINISHED") return { wait: 5000 }; r.ready = true; }
  const j = await http(env, G_ + a.ext_id + "/media_publish", { method: "POST", headers: FORM, body: form({ creation_id: r.container, access_token: tok }) }, "Instagram");
  r.status = "done"; r.postId = j.id; try { r.url = (await http(env, G_ + j.id + "?fields=permalink&access_token=" + encodeURIComponent(tok), {}, "Instagram")).permalink; } catch (e) {}
};
/* LinkedIn "little text format": escape reserved characters, keep #hashtags as real hashtags */
export function liText(t) { const esc = (x) => x.replace(/[\\|{}@[\]()<>*_~#]/g, (c) => "\\" + c); return String(t || "").split(/(#[\p{L}\p{N}_]+)/u).map((part) => /^#[\p{L}\p{N}_]+$/u.test(part) ? "{hashtag|\\#|" + part.slice(1) + "}" : esc(part)).join(""); }
const liStep = async (env, origin, a, text, media, r) => {
  const tok = await token(env, a), H = liH(env, tok), owner = (a.platform === "linkedin_org" ? "urn:li:organization:" : "urn:li:person:") + a.ext_id, vids = media.filter(isVid), imgs = media.filter((m) => !isVid(m));
  if (vids.length) { const m = vids[0];
    if (!r.video) { const j = await http(env, "https://api.linkedin.com/rest/videos?action=initializeUpload", { method: "POST", headers: H, body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes: m.size, uploadCaptions: false, uploadThumbnail: false } }) }, "LinkedIn"); r.video = j.value.video; r.uploadToken = j.value.uploadToken || ""; r.parts = j.value.uploadInstructions.map((u) => ({ a: u.firstByte, b: u.lastByte, url: u.uploadUrl })); r.etags = []; return; }
    if (!r.finalized && r.etags.length < r.parts.length) { const pt = r.parts[r.etags.length], bytes = await MD.readRange(env, m, pt.a, pt.b); const res = await outbound(env)(pt.url, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body: bytes, signal: AbortSignal.timeout(60000) }); if (!res.ok) throw Object.assign(new Error("LinkedIn video part upload " + res.status), { status: res.status }); r.etags.push(res.headers.get("etag")); return; }
    if (!r.finalized) { await http(env, "https://api.linkedin.com/rest/videos?action=finalizeUpload", { method: "POST", headers: H, body: JSON.stringify({ finalizeUploadRequest: { video: r.video, uploadToken: r.uploadToken, uploadedPartIds: r.etags } }) }, "LinkedIn"); r.finalized = true; delete r.parts; return; }
    if (!r.ready) { const s = await http(env, "https://api.linkedin.com/rest/videos/" + encodeURIComponent(r.video), { headers: H }, "LinkedIn"); if (s.status === "PROCESSING_FAILED") throw Object.assign(new Error("LinkedIn could not process the video: " + (s.processingFailureReason || "")), { status: 400 }); if (s.status !== "AVAILABLE") return { wait: 5000 }; r.ready = true; }
  } else if (imgs.length) { r.images = r.images || [];
    if (r.images.length < imgs.length) { const m = imgs[r.images.length]; const j = await http(env, "https://api.linkedin.com/rest/images?action=initializeUpload", { method: "POST", headers: H, body: JSON.stringify({ initializeUploadRequest: { owner } }) }, "LinkedIn");
      const res = await outbound(env)(j.value.uploadUrl, { method: "PUT", headers: { authorization: "Bearer " + tok, "content-type": "application/octet-stream" }, body: await MD.readAll(env, m), signal: AbortSignal.timeout(60000) }); if (!res.ok) throw Object.assign(new Error("LinkedIn image upload " + res.status), { status: res.status }); r.images.push(j.value.image); return; }
  }
  const body = { author: owner, commentary: liText(text), visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false };
  if (r.video) body.content = { media: { id: r.video } }; else if (r.images && r.images.length === 1) body.content = { media: { id: r.images[0] } }; else if (r.images && r.images.length) body.content = { multiImage: { images: r.images.map((id) => ({ id })) } };
  const x = await http(env, "https://api.linkedin.com/rest/posts", { method: "POST", headers: H, body: JSON.stringify(body), full: true }, "LinkedIn");
  const urn = x.h.get("x-restli-id") || x.h.get("x-linkedin-id") || ""; r.status = "done"; r.postId = urn; r.url = urn ? "https://www.linkedin.com/feed/update/" + urn : "";
};
STEP.linkedin = liStep; STEP.linkedin_org = liStep;
STEP.x = async (env, origin, a, text, media, r) => {
  const tok = await token(env, a), A = { authorization: "Bearer " + tok }; r.media = r.media || [];
  if (r.media.length < media.length || r.media.some((x) => !x.ready)) {
    let k = r.media.findIndex((x) => !x.ready); if (k < 0) { k = r.media.length; r.media.push({}); }
    const m = media[k], s = r.media[k];
    if (!s.id) { const j = await http(env, "https://api.x.com/2/media/upload/initialize", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, A), body: JSON.stringify({ media_type: m.mime, total_bytes: m.size, media_category: isVid(m) ? "tweet_video" : m.mime === "image/gif" ? "tweet_gif" : "tweet_image" }) }, "X"); s.id = j.data.id; s.seg = 0; return; }
    if (s.seg < m.parts) { const fd = new FormData(); fd.append("segment_index", String(s.seg)); fd.append("media", new Blob([await MD.readPart(env, m, s.seg)], { type: "application/octet-stream" }), "chunk"); await http(env, "https://api.x.com/2/media/upload/" + s.id + "/append", { method: "POST", headers: A, body: fd, timeout: 60000 }, "X"); s.seg++; return; }
    if (!s.finalized) { const j = await http(env, "https://api.x.com/2/media/upload/" + s.id + "/finalize", { method: "POST", headers: A }, "X"); s.finalized = true; const pi = j.data && j.data.processing_info; if (!pi || pi.state === "succeeded") s.ready = true; return; }
    const j = await http(env, "https://api.x.com/2/media/upload?command=STATUS&media_id=" + s.id, { headers: A }, "X"), pi = (j.data && j.data.processing_info) || {};
    if (pi.state === "failed") throw Object.assign(new Error("X could not process the media: " + ((pi.error && pi.error.message) || "")), { status: 400 });
    if (pi.state === "succeeded" || !pi.state) { s.ready = true; return; } return { wait: Math.min(10, +pi.check_after_secs || 3) * 1000 };
  }
  const j = await http(env, "https://api.x.com/2/tweets", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, A), body: JSON.stringify(Object.assign({ text }, r.media.length ? { media: { media_ids: r.media.map((x) => x.id) } } : {})) }, "X");
  r.status = "done"; r.postId = j.data.id; r.url = "https://x.com/i/status/" + j.data.id; delete r.media;
};
STEP.youtube = async (env, origin, a, text, media, r) => {
  const m = media.filter(isVid)[0], acc = a.meta.account;
  if (!r.session) { const lines = String(text || "").split("\n"), title = clip(lines[0] || m.name.replace(/\.[^.]+$/, ""), 100) || "FODO video";
    const res = await G.g(env, acc, "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { method: "POST", raw: true, response: true, headers: { "content-type": "application/json; charset=UTF-8", "x-upload-content-length": String(m.size), "x-upload-content-type": m.mime }, body: JSON.stringify({ snippet: { title, description: clip(text, 4900), categoryId: "22" }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false } }) });
    if (!res.ok) throw Object.assign(new Error("YouTube " + res.status + ": " + clip(await res.text(), 200)), { status: res.status }); r.session = res.headers.get("location"); if (!r.session) throw Object.assign(new Error("YouTube did not start the upload (no upload URL)."), { status: 400 }); r.sent = 0; return; }
  const from = r.sent, to = Math.min(m.size, from + MD.PART) - 1, bytes = await MD.readRange(env, m, from, to);
  const res = await G.g(env, acc, r.session, { method: "PUT", raw: true, response: true, timeout: 90000, headers: { "content-type": m.mime, "content-range": "bytes " + from + "-" + to + "/" + m.size }, body: bytes });
  if (res.status === 308) { const rg = /bytes=0-(\d+)/.exec(res.headers.get("range") || ""); r.sent = rg ? +rg[1] + 1 : to + 1; return; }
  if (!res.ok) throw Object.assign(new Error("YouTube upload " + res.status + ": " + clip(await res.text(), 200)), { status: res.status });
  const v = await res.json(); r.status = "done"; r.postId = v.id; r.url = "https://youtu.be/" + v.id; delete r.session;
  if (v.status && v.status.privacyStatus === "private") r.note = "YouTube kept it private: uploads from API projects that Google hasn't audited stay private until the project passes Google's audit.";
};

/* ---------------- numbers ---------------- */
export async function stats(env, platform) {
  const out = [];
  for (const a of await accounts(env, false)) {
    if (platform && a.platform.indexOf(platform) !== 0) continue;
    try {
      const tok = await token(env, a), v = MV(env), G_ = "https://graph.facebook.com/" + v + "/";
      if (a.platform === "facebook") { const p = await http(env, G_ + a.ext_id + "?fields=name,followers_count,fan_count&access_token=" + encodeURIComponent(tok), {}, "Facebook"), posts = await http(env, G_ + a.ext_id + "/posts?limit=8&fields=message,created_time,permalink_url,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)&access_token=" + encodeURIComponent(tok), {}, "Facebook");
        out.push({ id: a.id, platform: "facebook", name: p.name, followers: p.followers_count != null ? p.followers_count : p.fan_count, recent: (posts.data || []).map((x) => ({ text: clip(x.message || "", 90), at: x.created_time, reactions: x.reactions && x.reactions.summary ? x.reactions.summary.total_count : 0, comments: x.comments && x.comments.summary ? x.comments.summary.total_count : 0, shares: x.shares ? x.shares.count : 0, url: x.permalink_url })) }); }
      else if (a.platform === "instagram") { const p = await http(env, G_ + a.ext_id + "?fields=username,followers_count,follows_count,media_count&access_token=" + encodeURIComponent(tok), {}, "Instagram"), md = await http(env, G_ + a.ext_id + "/media?limit=8&fields=caption,media_type,timestamp,like_count,comments_count,permalink&access_token=" + encodeURIComponent(tok), {}, "Instagram");
        let reach = null; try { const ins = await http(env, G_ + a.ext_id + "/insights?metric=reach&period=day&metric_type=total_value&access_token=" + encodeURIComponent(tok), {}, "Instagram"); reach = ins.data && ins.data[0] && ins.data[0].total_value ? ins.data[0].total_value.value : null; } catch (e) {}
        out.push({ id: a.id, platform: "instagram", name: "@" + p.username, followers: p.followers_count, following: p.follows_count, posts: p.media_count, reachToday: reach, recent: (md.data || []).map((x) => ({ text: clip(x.caption || "", 90), type: x.media_type, at: x.timestamp, likes: x.like_count, comments: x.comments_count, url: x.permalink })) }); }
      else if (a.platform === "x") { const p = await http(env, "https://api.x.com/2/users/me?user.fields=public_metrics", { headers: { authorization: "Bearer " + tok } }, "X"), m = p.data.public_metrics || {};
        out.push({ id: a.id, platform: "x", name: "@" + p.data.username, followers: m.followers_count, following: m.following_count, posts: m.tweet_count, note: "Each X read is billed by X (pay-per-use)." }); }
      else if (a.platform === "linkedin_org") { const n = await http(env, "https://api.linkedin.com/rest/networkSizes/urn%3Ali%3Aorganization%3A" + a.ext_id + "?edgeType=COMPANY_FOLLOWED_BY_MEMBER", { headers: liH(env, tok) }, "LinkedIn"); out.push({ id: a.id, platform: "linkedin_org", name: a.name, followers: n.firstDegreeSize }); }
      else if (a.platform === "linkedin") out.push({ id: a.id, platform: "linkedin", name: a.name, followers: null, note: "LinkedIn does not share personal-profile numbers through its API without partner approval. Posts made from FODO are listed on the Social page." });
    } catch (e) { out.push({ id: a.id, platform: a.platform, name: a.name, error: e.message }); }
  }
  if (!platform || platform === "youtube") { try { (await G.youtubeStats(env)).forEach((c) => out.push({ id: "youtube:" + c.channelId, platform: "youtube", name: c.channel, followers: c.subscribers, views: c.views, posts: c.videos, recent: c.recent })); } catch (e) { if (platform === "youtube") out.push({ platform: "youtube", error: e.message }); } }
  return out;
}
