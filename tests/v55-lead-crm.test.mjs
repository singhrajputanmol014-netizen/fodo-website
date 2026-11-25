// v55.23 Enquiry → CRM: contact + Day 0/3/7 tasks, duplicate handling, never throws.
import { enquiryToCrm, plan, istDay } from "../functions/_lib/leadcrm.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };
const owner = { id: "u1", email: "anmol@fodo.co.in" };
const NOW = Date.UTC(2026, 10, 25, 20, 0, 0);   // 26 Nov 01:30 IST

// 1. plan
const p = plan({ name: "Shubhankar Shukla", phone: "+91 98765 44627", email: "", business: "" }, { goal: "Instagram growth", budget: "20k" }, "instagram-dm", "ld_x", NOW);
ok(p.contact.source === "instagram", "source maps to instagram");
ok(p.contact.tags.indexOf("enquiry") > -1 && p.contact.tags.indexOf("instagram-dm") > -1, "tags");
ok(/ld_x/.test(p.contact.notes) && /Instagram growth/.test(p.contact.notes), "notes carry enquiry id + need");
ok(p.tasks.length === 3, "three tasks");
ok(p.tasks[0].due === "2026-11-26" && p.tasks[1].due === "2026-11-29" && p.tasks[2].due === "2026-12-03", "IST due dates 0/3/7: " + p.tasks.map((t) => t.due));
ok(p.tasks.every((t) => /^Day \d/.test(t.body)), "task bodies");
ok(/Nothing is sent automatically/.test(p.tasks[0].body), "day 0 says nothing is sent");
ok(plan({ name: "A" }, {}, "", "ld_y").contact.tags.indexOf("website-form") > -1, "website form tag");
ok(plan({ name: "A" }, {}, "whatsapp-dm", "ld_y").contact.source === "whatsapp", "whatsapp source");
ok(istDay(0, Date.UTC(2026, 10, 25, 18, 29)) === "2026-11-25" && istDay(0, Date.UTC(2026, 10, 25, 18, 31)) === "2026-11-26", "IST midnight boundary");

// 2. new contact
let saved = [], acts = [];
const deps = { owner, saveContact: async (e, u, b) => { saved.push([u.id, b]); return { contact: { id: "cc1" } }; }, addActivity: async (e, u, b) => { acts.push(b); return {}; } };
let r = await enquiryToCrm({}, { name: "Shubhankar Shukla", phone: "+919876544627" }, {}, "instagram-dm", "ld_1", deps);
ok(r.ok && r.contactId === "cc1" && !r.dup && r.tasks === 3, "new contact result " + JSON.stringify(r));
ok(saved.length === 1 && saved[0][0] === "u1", "saved to owner CRM");
ok(acts.length === 3 && acts.every((a) => a.kind === "task" && a.contactId === "cc1" && /^\d{4}-\d{2}-\d{2}$/.test(a.due)), "3 tasks on contact");

// 3. duplicate → note + tasks, no second contact
acts = [];
deps.saveContact = async () => { throw Object.assign(new Error("dup"), { status: 409, dup: "ccOld" }); };
r = await enquiryToCrm({}, { name: "Same", phone: "+919876544627" }, {}, "facebook-dm", "ld_2", deps);
ok(r.ok && r.dup && r.contactId === "ccOld", "dup handled");
ok(acts.length === 4 && acts[0].kind === "note" && /again/.test(acts[0].body), "note then tasks");

// 4. errors never throw
deps.saveContact = async () => { throw new Error("db down"); };
r = await enquiryToCrm({}, { name: "X", phone: "1" }, {}, "website-chat", "ld_3", deps);
ok(r.ok === false && r.reason === "error", "error swallowed");
r = await enquiryToCrm({}, { name: "X" }, {}, "", "ld_4", { owner: null, saveContact: deps.saveContact, addActivity: deps.addActivity }).catch(() => ({ threw: true }));
ok(!r.threw, "no owner / no db does not throw");

console.log(`v55-lead-crm: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
