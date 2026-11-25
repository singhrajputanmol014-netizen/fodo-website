/* v55.26 private repository files. The repo root is also the website root (build output "."), so source, docs, tests and
   tooling would otherwise be served to anyone who guesses the path. _routes.json sends exactly these paths to Functions;
   this catch-all answers 404 for them and hands anything else to the static site (context.next()). Keep the two lists in sync
   (tests/v5526-fixes.test.mjs checks it). */
export const PRIVATE_PREFIXES = ["/docs/", "/tests/", "/scripts/", "/runner/", "/functions/", "/.github/", "/.wrangler/"];
export const PRIVATE_FILES = ["/README.md", "/BOT-README.md", "/DEPLOY-GUIDE.md", "/DESIGN-NOTES.md", "/QA-report.md", "/VOICE-README.md", "/CLAUDE.md",
  "/wrangler.toml", "/package.json", "/.gitignore", "/VERSION", "/data/reviews.csv", "/data/seo-lastmod.json"];
export function isPrivate(pathname) {
  let p = String(pathname || "/"); try { p = decodeURIComponent(p); } catch (e) {}
  p = p.replace(/\/{2,}/g, "/");
  const low = p.toLowerCase();
  return PRIVATE_FILES.some((f) => low === f.toLowerCase()) || PRIVATE_PREFIXES.some((x) => low === x.slice(0, -1).toLowerCase() || low.startsWith(x.toLowerCase()));
}
export async function onRequest(context) {
  if (isPrivate(new URL(context.request.url).pathname)) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "no-store" } });
  return context.next();
}
