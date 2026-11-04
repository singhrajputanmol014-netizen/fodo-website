/* The project handover file (CLAUDE.md) lives in the repo root, which is also the website root. It is for Claude and the team,
   not for visitors: this function answers 404 so it is never served publicly (_routes.json sends /CLAUDE.md here). */
export async function onRequest() {
  return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "no-store" } });
}
