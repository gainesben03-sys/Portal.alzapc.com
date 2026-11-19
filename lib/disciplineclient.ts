"use client";

// Discipline documentation in the browser. Live: every call goes to /api/discipline, which checks
// who's asking. Public demo: the same actions run in this browser with made-up records.
import { DiscDraft, DiscInput, DiscRecord, fmtDay, loadedWords, monthsAgo, newDiscId, protectedHits, signatureBlock, TERMINATION } from "./discipline";
import { authHeader, LIVE } from "./supabase";

const KEY = "alza-demo-discipline-v1";
type Res<T = object> = ({ ok: true } & T) | { ok: false; reason: string; hold?: string[] };

async function post<T>(clientId: string, action: string, body: object = {}): Promise<Res<T>> {
  try {
    const r = await fetch("/api/discipline", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ clientId, action, ...body }) });
    return (await r.json()) as Res<T>;
  } catch {
    return { ok: false, reason: "offline" };
  }
}

// ---------- demo ----------
const iso = (d: string) => `${d}T17:00:00.000Z`;
function seed(clientId: string): DiscRecord[] {
  const d1 = monthsAgo(4), d2 = monthsAgo(2);
  const base = { clientId, personId: "pp4", personName: "Chris Wu", personTitle: "Warehouse Associate", issue: "Attendance" as const, createdBy: "Alex Rivera", status: "saved" as const };
  return [
    {
      ...base, id: "dcdemo2", date: d2, level: "Verbal warning", format: "writeup", ack: "signed", facts: "Chris was late three times in two weeks.", createdAt: iso(d2), updatedAt: iso(d2),
      signed: { path: "", name: "Verbal warning signed.pdf", at: iso(d2) },
      draft: { title: `Verbal warning - Chris Wu - ${fmtDay(d2)}`, body: `# VERBAL WARNING\n**Employee:** Chris Wu\n**Position:** Warehouse Associate\n**Date issued:** ${fmtDay(d2)}\n**Issued by:** Alex Rivera\n\n## What happened\nChris clocked in late on three scheduled shifts in two weeks, per the timeclock report.\n\n## Policy\n> Employees are expected to be ready to work at the start of each scheduled shift.\nEmployee Handbook, Attendance and Punctuality\n\n## Expectations going forward\nClock in by the scheduled start time. Call your manager before the shift if you will be late.\n\n## If it happens again\nFurther late arrivals may lead to additional discipline, up to and including termination of employment.`, leftOut: [], missing: [] },
    },
    {
      ...base, id: "dcdemo1", date: d1, level: "Documented conversation", format: "note", ack: "none", facts: "Talked with Chris about being late twice.", createdAt: iso(d1), updatedAt: iso(d1),
      draft: { title: `Documented conversation - Chris Wu - ${fmtDay(d1)}`, body: `# File note: Documented conversation\n**Employee:** Chris Wu\n**Date of issue:** ${fmtDay(d1)}\n**Written by:** Alex Rivera\n\n## What happened\nChris arrived late to two shifts this month.\n\n## What was said\nWe talked about the start time and why it matters for the morning crew. Chris said the bus schedule changed and will catch the earlier one.\n\n## Follow up\nCheck in again in 30 days.`, leftOut: [], missing: [] },
    },
  ];
}
function load(clientId: string): DiscRecord[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "null") as Record<string, DiscRecord[]> | null;
    if (all?.[clientId]) return all[clientId];
  } catch {}
  return seed(clientId);
}
function store(clientId: string, rs: DiscRecord[]) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, DiscRecord[]>;
    all[clientId] = rs;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

const POLICY: Record<string, string> = {
  Attendance: "> Employees are expected to be ready to work at the start of each scheduled shift. Repeated late arrivals or absences may lead to discipline.\nEmployee Handbook, Section 4.1 Attendance and Punctuality",
  Performance: "> Each employee is expected to meet the standards of their role, as explained by their manager.\nEmployee Handbook, Section 5.2 Performance Expectations",
  Conduct: "> We expect everyone to treat coworkers, clients and vendors with courtesy and respect.\nEmployee Handbook, Section 3.1 Standards of Conduct",
  Policy: "> Employees are expected to follow the policies in this handbook.\nEmployee Handbook, Section 1.3 Following Company Policies",
  Safety: "> Follow all safety rules and use required protective equipment at all times.\nEmployee Handbook, Section 6.1 Safety",
  Other: "Policy: [ADD POLICY]",
};

/** A believable draft built from what was typed, for the public demo. */
function demoDraft(input: DiscInput, issuer: string, prior: DiscRecord[]): DiscDraft {
  const loaded = loadedWords(input.facts);
  // drop sentences that carry opinions
  const facts = input.facts.split(/(?<=[.!?])\s+/).filter((s) => !loadedWords(s).length).join(" ").trim() || input.facts;
  const first = input.personName.split(" ")[0];
  const priorLines = prior.filter((r) => r.status === "saved").map((r) => `- ${r.level} on ${fmtDay(r.date)} for ${r.issue.toLowerCase()}`).join("\n");
  const policy = POLICY[input.issue];
  const day = fmtDay(new Date().toISOString().slice(0, 10));
  let body: string;
  if (input.format === "email")
    body = `# Recap of our conversation on ${fmtDay(input.date)}\nHi ${first},\n\nThanks for talking with me today. I want to put what we discussed in writing. ${facts}\n\n${policy}\n\nGoing forward, the expectation is that this doesn't happen again, and that you let me know right away if something gets in the way. I'll keep this recap in your file. If anything here doesn't match how you remember our conversation, reply and let me know.\n\nThanks,\n${issuer}`;
  else if (input.format === "note")
    body = `# File note: ${input.level}\n**Employee:** ${input.personName}\n**Date of issue:** ${fmtDay(input.date)}\n**Written by:** ${issuer}\n\n## What happened\n${facts}\n\n## Policy\n${policy}\n\n## Follow up\nCheck in again in 30 days.`;
  else
    body = `# ${input.level.toUpperCase()}\n**Employee:** ${input.personName}\n${input.personTitle ? `**Position:** ${input.personTitle}\n` : ""}**Date issued:** ${day}\n**Issued by:** ${issuer}\n\n## What happened\n${facts}${input.witnesses ? `\n\nRecords and witnesses: ${input.witnesses}.` : ""}\n\n${priorLines ? `## Prior steps\n${priorLines}\n\n` : ""}## Policy\n${policy}\n\n## Expectations going forward\n[WHAT YOU EXPECT FROM HERE ON, IN ONE OR TWO SENTENCES]\n\n## If it happens again\nFurther issues may lead to additional discipline, up to and including termination of employment. This notice does not change the at-will nature of employment.\n\n${signatureBlock("writeup", issuer)}`;
  return {
    title: `${input.level} - ${input.personName} - ${fmtDay(input.date)}`,
    body,
    leftOut: loaded,
    missing: input.issue === "Attendance" && !/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i.test(input.facts) ? ["What time was the shift scheduled to start?"] : [],
    cite: input.issue === "Other" ? undefined : { doc: "Employee Handbook", section: policy.split("\n")[1]?.replace(/^Employee Handbook,\s*/, "") ?? "" },
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const discApi = {
  async list(clientId: string, personId?: string): Promise<Res<{ records: DiscRecord[] }>> {
    if (LIVE) return post(clientId, "list", { personId });
    const rs = load(clientId);
    return { ok: true, records: personId ? rs.filter((r) => r.personId === personId) : rs };
  },

  async draft(clientId: string, input: DiscInput, issuer: string, override = false): Promise<Res<{ draft: DiscDraft }>> {
    if (LIVE) return post(clientId, "draft", { input, override, issuer });
    await wait(1100);
    const hold = protectedHits(`${input.facts} ${input.witnesses ?? ""}`).map((w) => `The description mentions ${w}.`);
    if (TERMINATION.test(input.facts)) hold.push("It sounds like termination may be on the table. That goes through Ben.");
    if (input.personId === "pp1") hold.push("Something on file for this person needs Ben's eyes first.");
    if (hold.length && !override) return { ok: false, reason: "hold", hold };
    return { ok: true, draft: demoDraft(input, issuer, load(clientId).filter((r) => r.personId === input.personId)) };
  },

  async hold(clientId: string, input: DiscInput, by: string): Promise<Res<{ record: DiscRecord }>> {
    if (LIVE) return post(clientId, "hold", { input });
    const now = new Date().toISOString();
    const rec: DiscRecord = { ...input, id: newDiscId(), clientId, status: "review", hold: ["Waiting on Ben"], ack: "none", createdBy: by, createdAt: now, updatedAt: now };
    store(clientId, [rec, ...load(clientId)]);
    return { ok: true, record: rec };
  },

  async revise(clientId: string, body: string, how: string): Promise<Res<{ body: string }>> {
    if (LIVE) return post(clientId, "revise", { body, how });
    await wait(800);
    if (how === "shorter") return { ok: true, body: body.split("\n").filter((l) => !/^\[.*\]$/.test(l.trim())).join("\n") };
    if (how === "warmer") return { ok: true, body: body.replace(/## Expectations going forward\n/, "## Expectations going forward\nWe want you to succeed here, and we're glad to help. ") };
    return { ok: true, body };
  },

  async spanish(clientId: string, body: string): Promise<Res<{ body: string }>> {
    if (LIVE) return post(clientId, "spanish", { body });
    await wait(900);
    const map: [RegExp, string][] = [
      [/FINAL WRITTEN WARNING/g, "ADVERTENCIA FINAL POR ESCRITO"], [/WRITTEN WARNING/g, "ADVERTENCIA POR ESCRITO"], [/VERBAL WARNING/g, "ADVERTENCIA VERBAL"], [/DOCUMENTED CONVERSATION/g, "CONVERSACIÓN DOCUMENTADA"],
      [/\*\*Employee:\*\*/g, "**Empleado:**"], [/\*\*Position:\*\*/g, "**Puesto:**"], [/\*\*Date issued:\*\*/g, "**Fecha de emisión:**"], [/\*\*Issued by:\*\*/g, "**Emitido por:**"],
      [/## What happened/g, "## Lo que pasó"], [/## Prior steps/g, "## Pasos anteriores"], [/## Policy/g, "## Política"], [/## Expectations going forward/g, "## Expectativas a partir de ahora"],
      [/## If it happens again/g, "## Si vuelve a pasar"], [/## Employee comments/g, "## Comentarios del empleado"],
      [/Employee signature/g, "Firma del empleado"], [/Date:/g, "Fecha:"],
      [/Signing below shows you received this notice\. It does not mean you agree with it\./g, "Firmar abajo muestra que recibió este aviso. No significa que esté de acuerdo."],
      [/Further issues may lead to additional discipline, up to and including termination of employment\./g, "Más incidentes pueden llevar a medidas disciplinarias adicionales, que pueden incluir el despido."],
      [/This notice does not change the at-will nature of employment\./g, "Este aviso no cambia la naturaleza de empleo a voluntad."],
    ];
    return { ok: true, body: map.reduce((t, [re, s]) => t.replace(re, s), body) };
  },

  async save(clientId: string, record: Partial<DiscRecord> & DiscInput & { draft: DiscDraft }, by: string): Promise<Res<{ record: DiscRecord }>> {
    if (LIVE) return post(clientId, "save", { record });
    const rs = load(clientId);
    const now = new Date().toISOString();
    const old = record.id ? rs.find((r) => r.id === record.id) : undefined;
    const { id: _id, ...rest } = record; // eslint-disable-line @typescript-eslint/no-unused-vars
    const rec: DiscRecord = { ...(old ?? { id: newDiscId(), clientId, createdBy: by, createdAt: now, ack: record.format === "writeup" ? "pending" : "none" }), ...rest, status: "saved", updatedAt: now } as DiscRecord;
    store(clientId, [rec, ...rs.filter((r) => r.id !== rec.id)]);
    return { ok: true, record: rec };
  },

  async ack(clientId: string, id: string, ack: DiscRecord["ack"]): Promise<Res<{ record: DiscRecord }>> {
    if (LIVE) return post(clientId, "ack", { id, ack });
    const rs = load(clientId);
    const rec = rs.find((r) => r.id === id);
    if (!rec) return { ok: false, reason: "not_found" };
    const next = { ...rec, ack, updatedAt: new Date().toISOString() };
    store(clientId, rs.map((r) => (r.id === id ? next : r)));
    return { ok: true, record: next };
  },

  async uploadSigned(clientId: string, id: string, file: File): Promise<Res<{ record: DiscRecord }>> {
    if (!LIVE) {
      const rs = load(clientId);
      const rec = rs.find((r) => r.id === id);
      if (!rec) return { ok: false, reason: "not_found" };
      const next: DiscRecord = { ...rec, ack: "signed", signed: { path: "", name: file.name, at: new Date().toISOString() }, updatedAt: new Date().toISOString() };
      store(clientId, rs.map((r) => (r.id === id ? next : r)));
      return { ok: true, record: next };
    }
    if (file.size > 20e6) return { ok: false, reason: "too_big" };
    const u = await post<{ path: string; token: string }>(clientId, "upload", { id, fileName: file.name });
    if (!u.ok) return u;
    const { sb, BUCKET } = await import("./supabase");
    const up = await sb().storage.from(BUCKET).uploadToSignedUrl(u.path, u.token, file, { contentType: file.type || undefined });
    if (up.error) return { ok: false, reason: "upload_failed" };
    return post(clientId, "uploaded", { id, path: u.path, fileName: file.name });
  },

  async fileUrl(clientId: string, id: string): Promise<string | null> {
    if (!LIVE) return null;
    const r = await post<{ url: string | null }>(clientId, "file", { id });
    return r.ok ? r.url : null;
  },

  async ben(clientId: string, id: string): Promise<Res> {
    if (LIVE) return post(clientId, "ben", { id });
    return { ok: true };
  },

  async remove(clientId: string, id: string): Promise<Res> {
    if (LIVE) return post(clientId, "delete", { id });
    store(clientId, load(clientId).filter((r) => r.id !== id));
    return { ok: true };
  },
};

export const REASON: Record<string, string> = {
  setup: "Ben is finishing setup for this. Try again soon.",
  limit: "That's today's limit. Try again tomorrow, or email Ben.",
  no_key: "This isn't switched on yet. Ben is on it.",
  forbidden: "Only executives and Ben can document issues.",
  signed_out: "Sign in again to keep going.",
  offline: "Couldn't connect. Check your connection and try again.",
  too_big: "Files can be up to 20 MB.",
  signed: "This one is signed, so it's locked. Ask Ben if it needs a change.",
};
export const reasonText = (r: string) => REASON[r] ?? "Something went wrong. Try that again.";
