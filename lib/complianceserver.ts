// Server side of required training: loading, the daily sync, emails, and reading certificates.
import { claude, parseJson } from "./ai";
import { emailLogoUrl, readableInk } from "./brand";
import {
  AiRead, checkRead, ComplianceSettings, complianceFor, Course, courseLink, daysBetween, fmtDate, logRec, newRecord, nextAssignment,
  supervisorIds, appliesTo, TrainingRecord, variantLabel,
} from "./compliance";
import { esc, frameEmail, onboardingFor, senderFor, type Brand } from "./hires";
import type { ClientConfig } from "./modules";
import { iso, newToken } from "./perform";
import { admin, PORTAL_URL, sendEmail, type Caller } from "./server";
import type { TeamMember } from "./team";

export type DB = ReturnType<typeof admin>;
export type Ctx = { db: DB; clientId: string; company: string; cfg: ClientConfig; s: ComplianceSettings; brand: Brand; sender: ReturnType<typeof senderFor> };
export const BEN = "ben@alzapc.com";

export async function loadCtx(db: DB, clientId: string): Promise<Ctx | null> {
  const { data: cl } = await db.from("clients").select("name, config").eq("id", clientId).maybeSingle();
  if (!cl) return null;
  const cfg = (cl.config ?? {}) as ClientConfig;
  return {
    db, clientId, company: cl.name, cfg, s: complianceFor(cfg.compliance),
    brand: { company: cl.name, accent: cfg.accent || "#19283c", logoUrl: emailLogoUrl(clientId, cfg.logo, cfg.logoEmail, PORTAL_URL) },
    sender: senderFor(onboardingFor(cfg.onboarding), cl.name),
  };
}

/** Admins check certificates, answer questions and change settings: HR, executives, and anyone HR adds. */
export function roleOf(who: Caller, x: Ctx) {
  const email = who.email.toLowerCase();
  const adminRole = who.advisor || who.execOf.includes(x.clientId) || x.s.admins.includes(email);
  return { email, admin: adminRole, member: who.memberOf.includes(x.clientId) || who.advisor || who.execOf.includes(x.clientId), ben: who.advisor };
}
export type Role = ReturnType<typeof roleOf>;

export async function saveSettings(x: Ctx, s: ComplianceSettings) {
  const { data } = await x.db.from("clients").select("config").eq("id", x.clientId).maybeSingle();
  const cfg = (data?.config ?? {}) as ClientConfig;
  await x.db.from("clients").update({ config: { ...cfg, compliance: s } }).eq("id", x.clientId);
  x.s = s;
}

export async function roster(db: DB, clientId: string): Promise<TeamMember[]> {
  const { data } = await db.from("people").select("id, data").eq("client_id", clientId);
  return (data ?? []).map((r) => ({ ...(r.data as TeamMember), id: r.id as string, clientId }));
}
/** Is the training table there? (The 021 update has to be run once in Supabase.) */
export async function tableReady(db: DB) {
  const { error } = await db.from("training_records").select("id").limit(1);
  return !error;
}
export async function allRecords(db: DB, clientId: string): Promise<TrainingRecord[]> {
  const { data } = await db.from("training_records").select("id, data").eq("client_id", clientId).order("created_at", { ascending: false }).limit(5000);
  return (data ?? []).map((r) => ({ ...(r.data as TrainingRecord), id: r.id as string, clientId }));
}
export async function getRecord(db: DB, id: string, clientId?: string): Promise<TrainingRecord | null> {
  let q = db.from("training_records").select("id, client_id, data").eq("id", id);
  if (clientId) q = q.eq("client_id", clientId);
  const { data } = await q.maybeSingle();
  return data ? { ...(data.data as TrainingRecord), id: data.id as string, clientId: data.client_id as string } : null;
}
export async function byToken(db: DB, token: string): Promise<TrainingRecord[]> {
  if (!/^[A-Za-z0-9]{24,64}$/.test(token)) return [];
  const { data } = await db.from("training_records").select("id, client_id, data").eq("data->>token", token).limit(200);
  return (data ?? []).map((r) => ({ ...(r.data as TrainingRecord), id: r.id as string, clientId: r.client_id as string }));
}
export async function putRecord(db: DB, r: TrainingRecord) {
  const { id, ...data } = r;
  const { error } = await db.from("training_records").upsert({ id, client_id: r.clientId, data: { ...data, id } });
  return !error;
}

/**
 * Keep assignments in step with the roster and settings: open what's coming due, swap the course
 * version for someone who became a supervisor, close open ones for people who left or courses turned off.
 * Safe to run any number of times. Returns the full list afterwards.
 */
export async function sync(x: Ctx): Promise<{ records: TrainingRecord[]; people: TeamMember[] }> {
  const today = iso(new Date());
  if (!x.s.startedAt) await saveSettings(x, { ...x.s, startedAt: today });
  const [people, recs] = await Promise.all([roster(x.db, x.clientId), allRecords(x.db, x.clientId)]);
  const sups = supervisorIds(people, x.s);
  const byPerson = new Map<string, TrainingRecord[]>();
  for (const r of recs) byPerson.set(r.personId, [...(byPerson.get(r.personId) ?? []), r]);
  const out = [...recs];
  const changed: TrainingRecord[] = [];
  const open = (r: TrainingRecord) => r.status === "assigned" || r.status === "sentback" || r.status === "submitted";
  for (const p of people) {
    const mine = byPerson.get(p.id) ?? [];
    const token = mine.find((r) => r.token)?.token ?? newToken();
    for (const c of x.s.courses) {
      const forCourse = mine.filter((r) => r.courseId === c.id);
      const live = p.active !== false && c.on && appliesTo(c, sups.has(p.id));
      const o = forCourse.find(open);
      if (!live) {
        if (o && o.status !== "submitted") changed.push(logRec({ ...o, status: "cancelled" }, "People Hub", p.active === false ? "Closed: no longer on the roster" : "Closed: course turned off or doesn't apply"));
        continue;
      }
      if (o) {
        // keep the person's details fresh; a new supervisor still on the employee version moves up
        const v = c.kind === "crd" ? (sups.has(p.id) ? "supervisor" : "employee") : undefined;
        const upd = { ...o, name: p.name, email: p.email?.toLowerCase(), title: p.title, managerEmail: (p.managerEmail || "").toLowerCase(), managerName: p.managerName || "", courseName: c.name };
        if (o.status === "assigned" && v && o.variant !== v) changed.push(logRec({ ...upd, variant: v }, "People Hub", `Switched to the ${variantLabel(v)} course`));
        else if (JSON.stringify(upd) !== JSON.stringify(o)) changed.push(upd);
        continue;
      }
      const a = nextAssignment(p, c, sups.has(p.id), forCourse, x.s, today);
      if (!a) continue;
      const r = newRecord(p, x.clientId, c, a, token);
      changed.push(r);
      out.push(r);
    }
  }
  for (const r of changed) {
    if (!(await putRecord(x.db, r))) throw new Error("save_failed");
    const i = out.findIndex((y) => y.id === r.id);
    if (i >= 0) out[i] = r;
  }
  return { records: out, people };
}

// ---------- emails ----------
const P = (t: string) => `<p style="margin:0 0 14px 0;font-family:Arial,sans-serif;font-size:16px;line-height:24px;color:#1C1A19">${t}</p>`;
const button = (label: string, href: string, color: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px 0"><tr><td style="border-radius:10px;background:${color}"><a href="${esc(href)}" style="display:inline-block;padding:13px 22px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px">${esc(label)}</a></td></tr></table>`;
export function mail(b: Brand, heading: string, paras: string[], cta?: { label: string; url: string }) {
  const ink = readableInk(b.accent);
  const inner = `<p style="margin:30px 0 14px 0;font-family:Georgia,serif;font-size:26px;line-height:32px;color:#1C1A19">${esc(heading)}</p>${paras.map((p) => P(esc(p))).join("")}${cta ? button(cta.label, cta.url, ink) : ""}<!--HERO_END-->`;
  return { html: frameEmail({ ...b, bar: b.bar ?? b.accent, accent: ink }, inner), text: [heading, ...paras, cta ? `${cta.label}: ${cta.url}` : ""].filter(Boolean).join("\n\n") };
}
const first = (n: string) => (n || "").trim().split(/\s+/)[0] || "there";
export const linkFor = (token: string) => `${PORTAL_URL}/training/${token}`;
const courseLine = (r: TrainingRecord) => `${r.courseName}${r.variant ? ` (${variantLabel(r.variant)})` : ""}, due ${fmtDate(r.due)}`;

export function assignEmail(x: Ctx, rs: TrainingRecord[]) {
  const f = first(rs[0].name);
  const subject = rs.length === 1 ? `Required training: ${rs[0].courseName}` : `Your required training at ${x.company}`;
  const body = [
    `Hi ${f}, California requires some training for everyone at ${x.company}. Here's yours:`,
    ...rs.map((r) => `• ${courseLine(r)}`),
    `Your page has the links and a place to add your certificate. It works on your phone. English and Spanish.`,
  ];
  return { subject, ...mail(x.brand, subject, body, { label: "Open my training", url: linkFor(rs[0].token) }) };
}
export function reminderEmail(x: Ctx, r: TrainingRecord, days: number) {
  const f = first(r.name);
  const subject = days < 0 ? `Your ${r.courseName} training is late` : days === 0 ? `Your ${r.courseName} training is due today` : `Reminder: ${r.courseName} training due ${fmtDate(r.due)}`;
  const body = days < 0
    ? [`Hi ${f}, your ${r.courseName} training was due ${fmtDate(r.due)}. It's required by California law, so please finish it as soon as you can.`]
    : [`Hi ${f}, a quick reminder: ${courseLine(r)}.`];
  if (r.status === "sentback" && r.note) body.push(`Note from HR: ${r.note}`);
  return { subject, ...mail(x.brand, subject, body, { label: "Open my training", url: linkFor(r.token) }) };
}
export function lateCopyEmail(x: Ctx, toName: string, rs: TrainingRecord[], forManager: boolean) {
  const subject = rs.length === 1 ? `${first(rs[0].name)} is late on ${rs[0].courseName}` : `${rs.length} required trainings are late`;
  const body = [
    `Hi ${first(toName)}, ${forManager ? "someone on your team is" : "these are"} past due on required training:`,
    ...rs.map((r) => `• ${r.name}: ${courseLine(r)}`),
    forManager ? "A quick word from you usually does it. We've already emailed them." : "We're reminding them weekly.",
  ];
  return { subject, ...mail(x.brand, subject, body, { label: "See required training", url: `${PORTAL_URL}/c/${x.clientId}/training/required` }) };
}
export function sentBackEmail(x: Ctx, r: TrainingRecord) {
  const subject = `One fix on your ${r.courseName} certificate`;
  return { subject, ...mail(x.brand, subject, [`Hi ${first(r.name)}, HR looked at your certificate and needs one thing:`, r.note || "Please upload it again.", "It only takes a minute from your phone."], { label: "Fix it", url: linkFor(r.token) }) };
}
export function questionEmail(x: Ctx, r: TrainingRecord, q: string, anon: boolean) {
  const subject = `Training question: ${r.courseName}`;
  return { subject, ...mail(x.brand, subject, [`${anon ? "Someone" : r.name} asked a question during ${r.courseName}:`, `"${q}"`, "Answer it from the People Hub. They'll get your answer by email."], { label: "Answer", url: `${PORTAL_URL}/c/${x.clientId}/training/required?tab=questions` }) };
}
export function answerEmail(x: Ctx, r: TrainingRecord, q: string, a: string) {
  const subject = `Answer to your ${r.courseName} question`;
  return { subject, ...mail(x.brand, subject, [`Hi ${first(r.name)}, you asked: "${q}"`, a], { label: "Back to my training", url: linkFor(r.token) }) };
}

export async function send(x: Ctx, to: string | undefined, m: { subject: string; html: string; text: string }) {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, reason: "no_email" };
  return sendEmail({ to: [to], subject: m.subject, html: m.html, text: m.text, ...x.sender });
}

/** Who gets HR copies and questions: the admins picked in settings, or HR if none. */
export const hrInbox = (x: Ctx) => (x.s.admins.length ? x.s.admins : [BEN]);

/** Send assignment emails for anything not yet sent, one email per person. Only once HR has launched. */
export async function sendAssignments(x: Ctx, recs: TrainingRecord[]) {
  if (!x.s.live) return 0;
  const pending = recs.filter((r) => r.status === "assigned" && !r.sentAt);
  const byP = new Map<string, TrainingRecord[]>();
  for (const r of pending) byP.set(r.personId, [...(byP.get(r.personId) ?? []), r]);
  let n = 0;
  for (const rs of byP.values()) {
    if (!rs[0].email) continue;
    // only email links that were actually saved, so every link works
    const saved = await byToken(x.db, rs[0].token);
    const ready = rs.filter((r) => saved.some((y) => y.id === r.id));
    if (!ready.length) continue;
    const m = await send(x, rs[0].email, assignEmail(x, ready));
    if (!m.ok) continue;
    n++;
    const at = new Date().toISOString();
    for (const r of ready) await putRecord(x.db, logRec({ ...r, sentAt: at }, "People Hub", `Emailed ${r.email}`));
  }
  return n;
}

// ---------- certificates ----------
export const certPath = (r: TrainingRecord, ext: string) => `${r.clientId}/training/${r.personId}/${r.id}-${Date.now().toString(36)}.${ext}`;

/** Read a certificate with AI: name, course, version and date. Never decides anything by itself. */
export async function readCertificate(bytes: ArrayBuffer, mime: string, r: TrainingRecord, c?: Course): Promise<AiRead> {
  const b64 = Buffer.from(bytes).toString("base64");
  const block = mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : { type: "image", source: { type: "base64", media_type: mime, data: b64 } };
  const res = await claude({
    system: "You read training completion certificates and report exactly what is printed. Never guess: leave a field empty when you can't read it. Reply with JSON only.",
    maxTokens: 400,
    messages: [{
      role: "user",
      content: [
        block,
        { type: "text", text: `Expected course: ${c?.name ?? r.courseName}${r.variant ? ` (California CRD harassment prevention, ${r.variant === "supervisor" ? "supervisory, 2 hours" : "nonsupervisory, 1 hour"})` : ""}.\nReturn {"name":"the person's name as printed","course":"the course title as printed","variant":"supervisor|employee|\\"\\" (CRD only: supervisory or nonsupervisory)","date":"YYYY-MM-DD completion date as printed","isCertificate":true|false}` },
      ],
    }],
  });
  if (!res.ok) return { flags: ["Couldn't read the file automatically. Please look at it."] };
  const j = parseJson<{ name?: string; course?: string; variant?: string; date?: string; isCertificate?: boolean }>(res.text) ?? {};
  const flags: string[] = [];
  if (j.isCertificate === false) flags.push("This doesn't look like a completion certificate.");
  return {
    name: String(j.name ?? "").slice(0, 120),
    course: String(j.course ?? "").slice(0, 200),
    variant: j.variant === "supervisor" || j.variant === "employee" ? j.variant : "",
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(j.date)) ? String(j.date) : "",
    flags,
  };
}

export { checkRead, courseLink, daysBetween };
