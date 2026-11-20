/* FODO v52 Social Studio: client approval page /approve/<token>. The page is a shell; js/social-approve.js reads the posts from
   /api/social/approval/<token> and sends Approve / Request changes. No login: the unguessable token is the only key. */
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export async function onRequest({ request, params }) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const t = String(params.token || ""); if (!/^[a-z0-9]{28}$/.test(t)) return new Response("Not found", { status: 404 });
  const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Content for approval</title><link rel="icon" href="/favicon.png"><link rel="stylesheet" href="/css/social-approve.css"></head><body><main id="ap" data-token="' + t + '"><p class="ap-load">Loading…</p></main><footer>Made with <a href="https://www.fodo.co.in/">FODO</a></footer><script src="/js/social-approve.js"></script></body></html>';
  return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": CSP, "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" } });
}
