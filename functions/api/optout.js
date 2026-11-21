/* FODO v54.2: the "Unsubscribe" link in marketing client emails (Admin ▸ Client Emails).
   GET  /api/optout?e=EMAIL&t=TOKEN  → a small page with one "Unsubscribe" button (link scanners open links; they don't press buttons)
   POST /api/optout?e=EMAIL&t=TOKEN  → adds the email to the shared opt-out list (camp_unsub). Also the one-click List-Unsubscribe POST.
   The token is an HMAC of the email, so nobody can unsubscribe someone else. */
import { optOutCheck, optOut } from "../_lib/outreach.js";
import { cleanEmail } from "../_lib/accounts.js";
const H = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const page = (title, body) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(title) + " · FODO</title></head>" +
  '<body style="margin:0;background:#0B0B0C;color:#F4F4F2;font-family:\'Inter Tight\',Arial,sans-serif"><main style="max-width:480px;margin:12vh auto;padding:32px 28px;background:#151517;border:1px solid #2A2A2F;border-radius:20px">' +
  '<p style="margin:0 0 14px;font-size:11px;letter-spacing:1.8px;font-weight:700;color:#8F7BFF">FODO · FEAR OF DIGITALLY OUT ?</p><h1 style="margin:0 0 12px;font-size:26px;line-height:32px">' + esc(title) + "</h1>" + body + "</main></body></html>";

export async function onRequest({ request, env }) {
  const u = new URL(request.url), email = cleanEmail(u.searchParams.get("e")), t = u.searchParams.get("t") || "";
  if (!env.XRAY_DB || !(await optOutCheck(env, email, t))) return new Response(page("Link not valid", '<p style="color:#B4B4BB;line-height:24px">This unsubscribe link is not valid. Reply to the email with "unsubscribe" and we will remove you.</p>'), { status: 400, headers: H });
  if (request.method === "POST") {
    await optOut(env, email, "unsubscribe link");
    return new Response(page("You're unsubscribed", '<p style="color:#B4B4BB;line-height:24px">' + esc(email) + " will not get FODO marketing emails again. Emails about work you have with us (proposals, invoices, project updates) can still reach you.</p>"), { headers: H });
  }
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  return new Response(page("Unsubscribe from FODO emails?", '<p style="color:#B4B4BB;line-height:24px">Stop marketing emails to <b style="color:#F4F4F2">' + esc(email) + "</b>.</p>" +
    '<form method="post" action="/api/optout?e=' + encodeURIComponent(email) + "&amp;t=" + encodeURIComponent(t) + '"><button type="submit" style="margin-top:10px;padding:13px 24px;border:0;border-radius:999px;background:#8F7BFF;color:#0B0B0C;font:700 15px \'Inter Tight\',Arial,sans-serif;cursor:pointer">Unsubscribe</button></form>'), { headers: H });
}
