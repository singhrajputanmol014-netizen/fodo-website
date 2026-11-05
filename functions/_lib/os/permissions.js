/* FODO OS V4 Phase 1 (v50.1): the permission registry. The single source of truth for every permission string in FODO OS.
   A permission is "resource.action.scope". Scopes grow from own (my records) to all (everything, the owner's default).
   The UI reads this registry through GET /api/os/registry; nothing in js/ hardcodes a permission list.
   Role templates are data: they seed os_roles once and can be edited by the owner without a code change. */
export const SCOPES = ["own", "assigned", "team", "department", "organization", "all"];
export const RANK = { own: 0, assigned: 1, team: 2, department: 3, organization: 4, all: 5 };
const S = SCOPES, T = S.slice(2), D = S.slice(3), O = S.slice(4), A = ["all"];
export const REGISTRY = {
  project:   { view: S, create: S, update: S, assign: T, delete: O, archive: D },
  task:      { view: S, create: S, update: S, assign: T, delete: T },
  file:      { read: S, upload: S, manage: T },
  approval:  { request: S, decide: T },
  message:   { read: S, write: S },
  client:    { view: S.slice(1), manage: D },
  crm:       { view: ["own", "team", "department", "organization", "all"], manage: ["own", "team", "department", "organization", "all"] },
  quote:     { view: S, manage: D },
  contract:  { view: S, manage: D },
  finance:   { view: D, manage: O },
  expense:   { view: S, submit: S, approve: T },
  payout:    { view: O, approve: A },
  pro:       { view: ["own", "assigned", "department", "organization", "all"], manage: D },
  hr:        { view: ["own", "team", "department", "organization", "all"], manage: ["team", "department", "organization", "all"] },
  people:    { view: ["own", "team", "department", "organization", "all"], manage: O },
  calendar:  { view: S },
  campaign:  { view: S, manage: S, publish: D },
  content:   { view: S, manage: S, approve: T },
  asset:     { view: S, manage: S },
  report:    { view: S, manage: S, share: T },
  workflow:  { view: T, manage: D },
  decision:  { view: S, manage: S },
  agent:     { view: O, manage: A },
  site:      { view: ["own", "assigned", "organization", "all"], edit: ["own", "assigned", "organization", "all"], publish: ["own", "assigned", "organization", "all"] },
  growthlab: { view: ["own", "assigned", "organization", "all"], run: ["own", "assigned", "organization", "all"] },
  xray:      { view: ["own", "assigned", "organization", "all"], run: ["own", "assigned", "organization", "all"] },
  analytics: { view: T, export: O },
  equipment: { view: T, manage: D },
  production:{ view: S.slice(1), manage: T },
  workload:  { view: T },
  audit:     { view: O },
  system:    { settings: A, override: A, impersonate: A, health: O, modules: A, flags: A },
  brain:     { use: A },
  assistant: { use: ["own", "all"] },
  /* v50.7 Phase 7 */
  vendor:       { view: T, manage: D },
  purchase:     { view: S, request: S, approve: T },
  integration:  { view: O, manage: A },
  subscription: { view: D, manage: D },
  knowledge:    { view: S, manage: S, publish: D },
  document:     { view: S, manage: S, approve: T },
  inbox:        { view: S, manage: S },
  risk:         { view: T, manage: D },
  incident:     { view: S, report: S, manage: D },
  privacy:      { view: O, manage: O }
};
export const RESOURCES = Object.keys(REGISTRY);
export function validPerm(s) { const p = String(s || "").split("."); if (p.length !== 3) return false; const r = REGISTRY[p[0]]; return !!(r && r[p[1]] && r[p[1]].indexOf(p[2]) > -1); }
export const perm = (res, act, scope) => res + "." + act + "." + scope;

/* every permission of one scope class, used by the templates below */
const P = (res, acts, scope) => acts.map((a) => perm(res, a, scope));
const ALL = (res) => Object.keys(REGISTRY[res]).map((a) => perm(res, a, "all"));
const own = (res, acts) => P(res, acts, "own"), asg = (res, acts) => P(res, acts, "assigned"), team = (res, acts) => P(res, acts, "team"), dept = (res, acts) => P(res, acts, "department"), org = (res, acts) => P(res, acts, "organization");
const BASE = [].concat(own("task", ["view", "update"]), asg("task", ["view", "update", "create"]), asg("project", ["view"]), asg("file", ["read", "upload"]), own("file", ["read", "upload"]), asg("message", ["read", "write"]), own("message", ["read", "write"]), asg("approval", ["request"]), own("calendar", ["view"]), asg("calendar", ["view"]), own("expense", ["view", "submit"]), own("people", ["view"]), own("hr", ["view"]), own("expense", ["view", "submit"]), own("decision", ["view", "manage"]), ["assistant.use.own"], org("knowledge", ["view"]), own("knowledge", ["manage"]), own("purchase", ["view", "request"]), own("document", ["view", "manage"]), own("incident", ["view", "report"]));
const MANAGER = [].concat(team("workflow", ["view"]), own("decision", ["view", "manage"]), team("report", ["view", "manage", "share"]), team("asset", ["view"]), team("project", ["view", "update", "create", "assign"]), team("task", ["view", "create", "update", "assign", "delete"]), team("file", ["read", "upload", "manage"]), team("approval", ["request", "decide"]), team("message", ["read", "write"]), team("calendar", ["view"]), team("people", ["view"]), team("hr", ["view", "manage"]), team("expense", ["view", "approve"]), team("workload", ["view"]), team("analytics", ["view"]), team("expense", ["view", "approve"]), team("vendor", ["view"]), team("purchase", ["view", "approve"]), team("document", ["view", "approve"]), team("risk", ["view"]), team("incident", ["view"]), team("inbox", ["view", "manage"]), team("knowledge", ["manage"]));
const DEPT = (extra) => [].concat(BASE, MANAGER, dept("project", ["view", "update", "create", "assign", "archive"]), dept("task", ["view", "create", "update", "assign", "delete"]), dept("file", ["read", "upload", "manage"]), dept("approval", ["request", "decide"]), dept("message", ["read", "write"]), dept("calendar", ["view"]), dept("people", ["view"]), dept("workload", ["view"]), dept("analytics", ["view"]), dept("expense", ["view", "approve"]), dept("vendor", ["view", "manage"]), dept("purchase", ["view", "approve"]), dept("document", ["view", "manage", "approve"]), dept("knowledge", ["manage", "publish"]), dept("risk", ["view", "manage"]), dept("incident", ["view", "manage"]), dept("inbox", ["view", "manage"]), extra || []);

export const DEPARTMENTS = ["Management", "Operations", "Production", "Creative", "Design", "Post Production", "Marketing", "Sales", "Finance", "HR", "Technology", "AI", "Customer Success"];
/* slug, name, department, default workspace (first view after login), permissions */
export const TEMPLATES = [
  { slug: "owner", name: "Owner", dept: "Management", home: "command", perms: RESOURCES.map(ALL).reduce((a, b) => a.concat(b), []) },
  { slug: "admin", name: "Admin", dept: "Management", home: "command", perms: RESOURCES.filter((r) => ["system", "brain", "payout"].indexOf(r) < 0).map(ALL).reduce((a, b) => a.concat(b), []).concat(["system.health.organization", "audit.view.organization", "payout.view.organization"]) },
  { slug: "operations_manager", name: "Operations Manager", dept: "Operations", home: "work", perms: DEPT([].concat(org("workflow", ["view", "manage"]), org("decision", ["view", "manage"]), org("report", ["view", "manage", "share"]), org("asset", ["view"]), org("project", ["view", "update", "create", "assign", "archive"]), org("task", ["view", "create", "update", "assign", "delete"]), org("client", ["view", "manage"]), org("pro", ["view", "manage"]), org("equipment", ["view", "manage"]), org("production", ["view", "manage"]), org("calendar", ["view"]), org("approval", ["request", "decide"]), org("workload", ["view"]), org("people", ["view"]), org("analytics", ["view"]), org("quote", ["view"]), org("contract", ["view"]), org("crm", ["view"]), org("vendor", ["view", "manage"]), org("purchase", ["view", "approve"]), org("subscription", ["view", "manage"]), org("integration", ["view"]), org("knowledge", ["view", "manage", "publish"]), org("document", ["view", "manage", "approve"]), org("inbox", ["view", "manage"]), org("risk", ["view", "manage"]), org("incident", ["view", "manage"]), org("privacy", ["view"]))) },
  { slug: "project_manager", name: "Project Manager", dept: "Operations", home: "work", perms: [].concat(BASE, MANAGER, team("client", ["view"]), team("quote", ["view"]), team("contract", ["view"]), team("production", ["view", "manage"]), team("equipment", ["view"])) },
  { slug: "production_manager", name: "Production Manager", dept: "Production", home: "work", perms: DEPT([].concat(dept("workflow", ["view", "manage"]), dept("decision", ["view", "manage"]), dept("production", ["view", "manage"]), dept("equipment", ["view", "manage"]), dept("pro", ["view"]), org("calendar", ["view"]))) },
  { slug: "creative_director", name: "Creative Director", dept: "Creative", home: "work", perms: DEPT([].concat(dept("workflow", ["view", "manage"]), dept("decision", ["view", "manage"]), dept("content", ["view", "manage", "approve"]), dept("campaign", ["view"]), dept("asset", ["view", "manage"]), dept("report", ["view", "manage"]))) },
  { slug: "designer", name: "Designer", dept: "Design", home: "my-fodo", perms: [].concat(BASE, asg("content", ["view", "manage"]), own("content", ["view", "manage"]), asg("asset", ["view", "manage"]), own("asset", ["view", "manage"])) },
  { slug: "video_editor", name: "Video Editor", dept: "Post Production", home: "my-fodo", perms: [].concat(BASE, asg("content", ["view", "manage"]), own("content", ["view", "manage"]), asg("production", ["view"]), asg("asset", ["view", "manage"]), own("asset", ["view", "manage"])) },
  { slug: "performance_marketer", name: "Performance Marketer", dept: "Marketing", home: "work", perms: [].concat(BASE, team("campaign", ["view", "manage"]), dept("campaign", ["view", "manage", "publish"]), dept("report", ["view", "manage"]), team("report", ["share"]), dept("analytics", ["view"]), asg("client", ["view"]), asg("growthlab", ["view", "run"]), asg("xray", ["view", "run"])) },
  { slug: "social_media_manager", name: "Social Media Manager", dept: "Marketing", home: "work", perms: [].concat(BASE, dept("content", ["view", "manage"]), team("content", ["approve"]), dept("campaign", ["view"]), dept("asset", ["view", "manage"]), dept("report", ["view", "manage"]), team("report", ["share"]), dept("analytics", ["view"]), asg("client", ["view"])) },
  { slug: "sales_executive", name: "Sales Executive", dept: "Sales", home: "work", perms: [].concat(BASE, own("crm", ["view", "manage"]), team("crm", ["view"]), asg("client", ["view"]), asg("quote", ["view"])) },
  { slug: "finance_manager", name: "Finance Manager", dept: "Finance", home: "work", perms: [].concat(dept("workflow", ["view", "manage"]), dept("decision", ["view", "manage"]), BASE, org("project", ["view"]), org("task", ["view"]), org("finance", ["view", "manage"]), org("expense", ["view", "submit", "approve"]), org("payout", ["view"]), org("quote", ["view"]), org("contract", ["view"]), org("expense", ["view", "approve"]), org("client", ["view"]), org("analytics", ["view", "export"]), org("audit", ["view"]), org("vendor", ["view", "manage"]), org("purchase", ["view", "approve"]), org("subscription", ["view", "manage"]), org("document", ["view"]), org("risk", ["view"])) },
  { slug: "hr_talent_manager", name: "HR / Talent Manager", dept: "HR", home: "people", perms: [].concat(dept("workflow", ["view", "manage"]), dept("decision", ["view", "manage"]), BASE, org("people", ["view", "manage"]), org("hr", ["view", "manage"]), org("pro", ["view", "manage"]), org("workload", ["view"]), org("calendar", ["view"]), org("contract", ["view"]), org("knowledge", ["view", "manage", "publish"]), org("document", ["view", "manage"]), org("privacy", ["view"])) },
  { slug: "developer", name: "Developer", dept: "Technology", home: "my-fodo", perms: [].concat(BASE, org("site", ["view", "edit", "publish"]), org("system", ["health"]), asg("project", ["view", "update"]), org("integration", ["view"])) },
  { slug: "viewer", name: "Viewer (read only)", dept: "Management", home: "my-fodo", perms: [].concat(org("report", ["view"]), org("asset", ["view"]), own("people", ["view"]), org("project", ["view"]), org("task", ["view"]), org("client", ["view"]), org("pro", ["view"]), org("quote", ["view"]), org("contract", ["view"]), org("calendar", ["view"]), org("analytics", ["view"]), org("people", ["view"]), org("knowledge", ["view"])) },
  { slug: "fodo_pro", name: "FODO Pro", dept: null, home: "pro-home", perms: [].concat(asg("project", ["view"]), asg("task", ["view", "update"]), asg("file", ["read", "upload"]), asg("message", ["read", "write"]), own("calendar", ["view"]), asg("calendar", ["view"]), asg("production", ["view"]), own("pro", ["view"])) },
  { slug: "client", name: "Client", dept: null, home: "overview", perms: [].concat(own("project", ["view", "create", "update"]), own("task", ["view", "create", "update"]), own("file", ["read", "upload"]), own("message", ["read", "write"]), own("quote", ["view"]), own("contract", ["view"]), own("calendar", ["view"]), own("crm", ["view", "manage"]), own("content", ["view", "manage"]), own("campaign", ["view", "manage"]), own("site", ["view", "edit", "publish"]), own("growthlab", ["view", "run"]), own("xray", ["view", "run"]), own("approval", ["request"]), own("report", ["view"])) }
];
/* which legacy marketplace role (biz_staff / acct_admins) maps to which template when the OS backfills staff */
export const LEGACY = { owner: "owner", admin: "admin", moderator: "operations_manager", finance: "finance_manager", viewer: "viewer", pro: "fodo_pro", client: "client" };
/* modules the owner can switch on and off (navigation hides a disabled one for everybody but owners) */
export const MODULES = [["builder", "Website Builder"], ["growthlab", "Growth Lab"], ["xray", "Business X-Ray"], ["pros", "FODO Pros marketplace"], ["crm", "CRM"], ["studio", "AI Studio"], ["content", "Content & campaigns"], ["finance", "Finance"], ["approvals", "Approvals"], ["assistant", "FODO Assistant"], ["expenses", "Expenses"], ["hr", "HR"], ["marketing", "Marketing workspace"], ["automation", "Workflow Studio"], ["assistant_ui", "FODO Assistant"], ["decisions", "Decision journal"], ["procurement", "Vendors & purchases"], ["subscriptions", "Subscriptions"], ["integrations", "Integrations"], ["knowledge", "Knowledge & SOPs"], ["documents", "Documents"], ["inbox", "Unified inbox"], ["risks", "Risks & incidents"], ["privacy", "Privacy (DPDP)"]];
