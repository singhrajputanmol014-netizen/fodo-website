/* FODO OS V4 Phase 1 (v50.1): the `os` block of GET /api/biz/me. Never throws: if FODO OS is switched off or its set-up fails,
   the Workspace gets the v47 navigation and { enabled: false }, so a problem in the OS layer can never take the Workspace down. */
import { navFor, bdb } from "../biz.js";
import { one } from "./db.js";
import { principal, describe } from "./authz.js";
import { navInfo } from "./nav.js";
export async function meBlock(env, u, R, imp) {
  try { const r = await one(await bdb(env), "SELECT v FROM biz_settings WHERE k='os_enabled'"); if (r && String(r.v).replace(/"/g, "") === "0") return { nav: navFor(R), os: { enabled: false } };
    const P = await principal(env, u, { R, quiet: true }); if (imp) { P.readOnly = true; P.impersonator = { email: imp.by.email, until: imp.until }; }
    const n = await navInfo(env, P, R), d = describe(P); return { nav: n.nav, os: { enabled: true, kind: d.kind, home: n.home, roles: d.roles, owner: d.owner, groups: n.groups, can: d.kind === "employee" ? d.can : undefined, readOnly: d.readOnly, impersonating: d.impersonating, name: d.name, title: d.title } };
  } catch (e) { return { nav: navFor(R), os: { enabled: false, error: "FODO OS is not available right now." } }; }
}
