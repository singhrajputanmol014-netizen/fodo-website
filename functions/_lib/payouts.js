/* FODO v46.2 payout adapters: pay FODO Pros automatically through Cashfree Payouts or RazorpayX Payouts.
   Rules:
   - a professional's payout details (UPI ID or bank account + IFSC) are stored ENCRYPTED (AES-GCM; key PAYOUT_ENC_KEY,
     or SITES_SECRET_KEY) and only ever shown masked; without a key they are not stored at all;
   - the amount sent is the payout's net from the database, never from the browser; one transfer per attempt id (idempotent);
   - a payout is "paid" only when the provider says SUCCESS / processed (or FODO finance records a manual reference);
     until then it is "processing"; failed / reversed transfers show the reason and can be sent again;
   - only FODO admins / finance send or check payouts; everything is audited.
   Setup: Cashfree: CASHFREE_PAYOUTS_ON=1 + CASHFREE_PAYOUT_CLIENT_ID + CASHFREE_PAYOUT_CLIENT_SECRET (Payouts keys, not PG keys)
          RazorpayX: RAZORPAYX_ON=1 + RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET + RAZORPAYX_ACCOUNT (your RazorpayX account number)
   Test in the provider's sandbox / test mode first (CASHFREE_ENV=production switches Cashfree to live). */
import { nowIso, db as adb } from "./accounts.js";
import { bdb, err, can, auditLog, notify } from "./biz.js";
import { outbound } from "./xray-core.js";
import * as SCH from "./schema.js";

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u) => btoa(String.fromCharCode(...u)), unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const keySrc = (env) => env.PAYOUT_ENC_KEY || env.SITES_SECRET_KEY || "";
async function aes(env) { const raw = await crypto.subtle.digest("SHA-256", enc.encode("fodo-payout|" + keySrc(env))); return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]); }
async function seal(env, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(env), enc.encode(JSON.stringify(obj)))); return b64(iv) + "." + b64(ct); }
async function unseal(env, s) { const [iv, ct] = String(s || "").split("."); return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aes(env), unb64(ct)))); }

export function provider(env) {
  if (env.CASHFREE_PAYOUTS_ON === "1" && env.CASHFREE_PAYOUT_CLIENT_ID && env.CASHFREE_PAYOUT_CLIENT_SECRET) return "cashfree";
  if (env.RAZORPAYX_ON === "1" && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAYX_ACCOUNT) return "razorpayx";
  return null;
}
const T = ["CREATE TABLE IF NOT EXISTS biz_payout_methods (pro_id TEXT PRIMARY KEY, kind TEXT, enc TEXT, masked TEXT, name TEXT, updated_at TEXT, bene_id TEXT)"];
const COLS = ["ALTER TABLE biz_payouts ADD COLUMN provider TEXT", "ALTER TABLE biz_payouts ADD COLUMN provider_ref TEXT", "ALTER TABLE biz_payouts ADD COLUMN fail_reason TEXT", "ALTER TABLE biz_payouts ADD COLUMN attempts INTEGER DEFAULT 0", "ALTER TABLE biz_payouts ADD COLUMN sent_at TEXT"];
export async function pdb(env) { const d = await bdb(env); await SCH.setup(d, "payouts", async () => { await SCH.ddl(d, T); const { migrateOnce } = await import("./accounts.js"); await migrateOnce(d, COLS); }); return d; }
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

/* ---------- the professional's payout method ---------- */
export const UPI = /^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9]{1,63}$/i, IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export function cleanMethod(b) {
  const name = clip(b.name, 100); if (name.length < 3) throw err("Enter the account holder's name (as in the bank).");
  if (b.kind === "upi") { const vpa = clip(b.vpa, 120).toLowerCase(); if (!UPI.test(vpa)) throw err("That UPI ID doesn't look right (example: name@okicici)."); return { kind: "upi", name, vpa, masked: vpa.replace(/^(.{2}).*(@.*)$/, "$1•••$2") }; }
  const acc = String(b.account || "").replace(/\s/g, ""), ifsc = clip(b.ifsc, 11).toUpperCase(); if (!/^\d{9,18}$/.test(acc)) throw err("The account number should be 9 to 18 digits."); if (!IFSC.test(ifsc)) throw err("That IFSC doesn't look right (example: HDFC0001234).");
  if (b.account2 != null && String(b.account2).replace(/\s/g, "") !== acc) throw err("The two account numbers don't match.");
  return { kind: "bank", name, account: acc, ifsc, masked: "•••• " + acc.slice(-4) + " · " + ifsc };
}
async function proFor(env, u) { const d = await pdb(env), p = await d.prepare("SELECT id, name, user_id FROM biz_pros WHERE user_id=?1").bind(u.id).first(); if (!p) throw err("Create your FODO Pro profile first.", 404); return { d, p }; }
export async function getMethod(env, u) { const { d, p } = await proFor(env, u), m = await d.prepare("SELECT kind, masked, name, updated_at FROM biz_payout_methods WHERE pro_id=?1").bind(p.id).first(); return { method: m || null, automatic: !!provider(env), canStore: !!keySrc(env) }; }
export async function saveMethod(env, u, b) {
  if (!keySrc(env)) throw err("Payout details can't be stored yet: FODO hasn't set the encryption key. FODO pays you by bank / UPI transfer meanwhile.", 503);
  const { d, p } = await proFor(env, u), m = cleanMethod(b || {}), sealed = await seal(env, m);
  await d.prepare("INSERT INTO biz_payout_methods (pro_id, kind, enc, masked, name, updated_at, bene_id) VALUES (?1,?2,?3,?4,?5,?6,NULL) ON CONFLICT(pro_id) DO UPDATE SET kind=?2, enc=?3, masked=?4, name=?5, updated_at=?6, bene_id=NULL").bind(p.id, m.kind, sealed, m.masked, m.name, nowIso()).run();
  await auditLog(env, u.email, "payout:method", p.id, m.kind + " " + m.masked); await notify(env, u.id, "account", "Your payout details were changed to " + m.masked + ". If this wasn't you, contact FODO now.", "#pro-earn");
  return getMethod(env, u);
}

/* ---------- provider calls ---------- */
const cfBase = (env) => (env.CASHFREE_ENV === "production" ? "https://api.cashfree.com/payout" : "https://sandbox.cashfree.com/payout");
async function cfp(env, method, path, body) {
  const r = await outbound(env)(cfBase(env) + path, { method, headers: { "x-client-id": env.CASHFREE_PAYOUT_CLIENT_ID, "x-client-secret": env.CASHFREE_PAYOUT_CLIENT_SECRET, "x-api-version": env.CASHFREE_PAYOUT_API_VERSION || "2024-01-01", "content-type": "application/json", accept: "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error("Cashfree: " + (j.message || r.status)); e.status = r.status; e.code = j.code; throw e; } return j;
}
async function rzx(env, method, path, body, idem) {
  const h = { authorization: "Basic " + btoa(env.RAZORPAY_KEY_ID + ":" + env.RAZORPAY_KEY_SECRET), "content-type": "application/json", accept: "application/json" }; if (idem) h["X-Payout-Idempotency"] = idem;
  const r = await outbound(env)("https://api.razorpay.com/v1" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error("RazorpayX: " + ((j.error && j.error.description) || r.status)); e.status = r.status; throw e; } return j;
}
const DONE = { cashfree: ["SUCCESS", "COMPLETED"], razorpayx: ["processed"] }, FAILED = { cashfree: ["FAILED", "REJECTED", "REVERSED", "CANCELLED"], razorpayx: ["reversed", "rejected", "cancelled", "failed"] };

/* send one payout (admin / finance) */
export async function send(env, u, R, id) {
  if (!can(R, ["admin", "finance"])) throw err("Only FODO finance or admins.", 403); const pv = provider(env); if (!pv) throw err("Automatic payouts aren't set up (Cashfree Payouts or RazorpayX). Pay by bank / UPI and record the reference.", 409);
  const d = await pdb(env), po = await d.prepare("SELECT po.*, p.name AS pro_name, p.user_id FROM biz_payouts po JOIN biz_pros p ON p.id=po.pro_id WHERE po.id=?1").bind(String(id || "").slice(0, 40)).first(); if (!po) throw err("Payout not found.", 404);
  if (["paid", "processing"].indexOf(po.status) > -1) throw err("This payout is already " + po.status + ".", 409); if (po.status === "via_split") throw err("This share is paid by Cashfree Easy Split from the client's order. It can't be sent again.", 409); if (!(po.net >= 1)) throw err("Nothing to pay.", 409);
  const mrow = await d.prepare("SELECT * FROM biz_payout_methods WHERE pro_id=?1").bind(po.pro_id).first(); if (!mrow) throw err(po.pro_name + " hasn't added payout details yet. Ask them to add UPI or bank details in Earnings & payouts.", 409);
  const m = await unseal(env, mrow.enc), attempt = (po.attempts || 0) + 1, tid = (po.id + "_" + attempt).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40), usr = await (await adb(env)).prepare("SELECT email FROM acct_users WHERE id=?1").bind(po.user_id).first();
  /* claim it first (no double send from two clicks / two admins) */
  const claim = await d.prepare("UPDATE biz_payouts SET status='processing', attempts=?2, provider=?3, sent_at=?4, fail_reason=NULL WHERE id=?1 AND status NOT IN ('paid','processing','via_split')").bind(po.id, attempt, pv, nowIso()).run(); if (!claim.meta.changes) throw err("This payout changed meanwhile, reload.", 409);
  try {
    let ref, st;
    if (pv === "cashfree") {
      let bene = mrow.bene_id; if (!bene) { bene = ("fodo_" + po.pro_id).replace(/[^A-Za-z0-9_]/g, "").slice(0, 50);
        try { await cfp(env, "POST", "/beneficiary", { beneficiary_id: bene, beneficiary_name: m.name, beneficiary_instrument_details: m.kind === "upi" ? { vpa: m.vpa } : { bank_account_number: m.account, bank_ifsc: m.ifsc }, beneficiary_contact_details: { beneficiary_email: (usr && usr.email) || undefined } }); }
        catch (e) { if (e.status !== 409) throw e; }   // already exists
        await d.prepare("UPDATE biz_payout_methods SET bene_id=?2 WHERE pro_id=?1").bind(po.pro_id, bene).run(); }
      const r = await cfp(env, "POST", "/transfers", { transfer_id: tid, transfer_amount: po.net, transfer_currency: "INR", transfer_mode: m.kind === "upi" ? "upi" : "imps", beneficiary_details: { beneficiary_id: bene }, transfer_remarks: "FODO payout" });
      ref = r.cf_transfer_id ? String(r.cf_transfer_id) : tid; st = String(r.status || "").toUpperCase();
    } else {
      const fa = m.kind === "upi" ? { account_type: "vpa", vpa: { address: m.vpa } } : { account_type: "bank_account", bank_account: { name: m.name, ifsc: m.ifsc, account_number: m.account } };
      const r = await rzx(env, "POST", "/payouts", { account_number: env.RAZORPAYX_ACCOUNT, amount: Math.round(po.net * 100), currency: "INR", mode: m.kind === "upi" ? "UPI" : "IMPS", purpose: "payout", queue_if_low_balance: true, reference_id: tid, narration: "FODO payout",
        fund_account: Object.assign(fa, { contact: { name: m.name, email: (usr && usr.email) || undefined, type: "vendor", reference_id: po.pro_id } }) }, tid);
      ref = r.id || tid; st = String(r.status || "");
    }
    await settle(env, d, po, pv, ref, st, null);
  } catch (e) { await d.prepare("UPDATE biz_payouts SET status='failed', fail_reason=?2 WHERE id=?1").bind(po.id, clip(e.message, 200)).run(); await auditLog(env, u.email, "payout:send-failed", po.id, clip(e.message, 200)); throw err("The provider refused the payout: " + clip(e.message, 160), 502); }
  await auditLog(env, u.email, "payout:sent", po.id, pv + " ₹" + po.net);
  return d.prepare("SELECT id, status, provider, provider_ref, fail_reason, net, paid_at FROM biz_payouts WHERE id=?1").bind(po.id).first();
}
/* write what the provider said */
async function settle(env, d, po, pv, ref, st, reason) {
  if (DONE[pv].indexOf(st) > -1) { await d.prepare("UPDATE biz_payouts SET status='paid', provider_ref=?2, ref=COALESCE(ref, ?2), paid_at=?3 WHERE id=?1").bind(po.id, ref, nowIso()).run(); await notify(env, po.user_id, "payout", "Payout sent: ₹" + po.net.toLocaleString("en-IN") + " (" + pv + " ref " + ref + ").", "#pro-earn"); try { const F = await import("./finance.js"), mm = await d.prepare("SELECT project_id FROM biz_milestones WHERE id=COALESCE(?1, ?2)").bind(po.source_milestone || null, po.milestone_id).first(); await F.ledger(env, "payout", "payouts_paid", "payout", po.id, mm && mm.project_id, po.net, pv + " " + ref); } catch (e) {} return "paid"; }
  if (FAILED[pv].indexOf(st) > -1) { await d.prepare("UPDATE biz_payouts SET status='failed', provider_ref=?2, fail_reason=?3 WHERE id=?1").bind(po.id, ref, clip(reason || "Provider status: " + st, 200)).run(); return "failed"; }
  await d.prepare("UPDATE biz_payouts SET status='processing', provider_ref=?2 WHERE id=?1").bind(po.id, ref).run(); return "processing";
}
/* ask the provider about a processing payout (admin button + the daily scheduler) */
export async function check(env, id) {
  const pv = provider(env), d = await pdb(env), po = await d.prepare("SELECT po.*, p.user_id FROM biz_payouts po JOIN biz_pros p ON p.id=po.pro_id WHERE po.id=?1").bind(String(id || "").slice(0, 40)).first();
  if (!po) throw err("Payout not found.", 404); if (po.status !== "processing" || !pv || po.provider !== pv) return { status: po.status };
  let st, reason = null;
  if (pv === "cashfree") { const tid = (po.id + "_" + (po.attempts || 1)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40), r = await cfp(env, "GET", "/transfers?transfer_id=" + encodeURIComponent(tid)); st = String(r.status || "").toUpperCase(); reason = r.status_description || null; }
  else { const r = await rzx(env, "GET", "/payouts/" + encodeURIComponent(po.provider_ref)); st = String(r.status || ""); reason = r.status_details && r.status_details.description || null; }
  return { status: await settle(env, d, po, pv, po.provider_ref, st, reason) };
}
export async function checkAll(env, limit) { if (!provider(env)) return { checked: 0 }; const d = await pdb(env), L = ((await d.prepare("SELECT id FROM biz_payouts WHERE status='processing' ORDER BY sent_at LIMIT ?1").bind(limit || 20).all()).results) || []; let n = 0; for (const x of L) { try { await check(env, x.id); n++; } catch (e) {} } return { checked: n }; }
export async function adminList(env, R) { if (!can(R, ["admin", "finance", "viewer"])) throw err("Not allowed.", 403); const d = await pdb(env);
  return ((await d.prepare("SELECT po.id, po.milestone_id, po.pro_id, po.gross, po.commission, po.net, po.status, po.ref, po.created_at, po.paid_at, po.provider, po.provider_ref, po.fail_reason, COALESCE(po.label, m.title) AS title, p.name AS pro_name, pm.masked AS method FROM biz_payouts po LEFT JOIN biz_milestones m ON m.id=COALESCE(po.source_milestone, po.milestone_id) JOIN biz_pros p ON p.id=po.pro_id LEFT JOIN biz_payout_methods pm ON pm.pro_id=po.pro_id ORDER BY po.status='paid', po.created_at DESC LIMIT 300").all()).results) || []; }
