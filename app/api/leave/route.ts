// Leave center. HR admins only (Ben, plus the people Ben names for a client).
// Every read of the case list, every change, document open and email is checked here and
// written to leave_audit. Medical documents open only for HR admins with medical access.
//
// POST { clientId, action, ... }
//   list                      -> { cases, me: { medical }, admins? (Ben) }
//   save    { case }          -> creates or updates one case
//   uploadUrl { caseId, name }-> signed upload into <client>/leave/<case>/
//   addDoc  { caseId, doc }   -> records the uploaded document on the case
//   openDoc { caseId, docId } -> short-lived link to view it
//   removeDoc { caseId, docId }
//   email   { caseId, to, subject, body, copyMe, docIds }
//   audit   { caseId }        -> the case history
//   admins  { admins? }       -> Ben: read or set the HR admin list
//   remove  { caseId }        -> Ben: delete a case and its documents (retention)

import { NextResponse } from "next/server";
import { caller, admin, sendEmail, SERVER_LIVE, siteUrl } from "@/lib/server";
import { advisorEmails, pushTo } from "@/lib/push";
import { emailLogoUrl } from "@/lib/brand";
import { noticeEmail, onboardingFor, senderFor } from "@/lib/hires";
import type { ClientConfig } from "@/lib/modules";
import { CaseDoc, LeaveCase, STATUS_LABEL } from "@/lib/leave";

type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const json = (b: D, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });
const BUCKET = "client-files";
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/i;
const short = (name: string) => {
  const w = name.trim().split(/\s+/);
  return w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}.` : w[0] || "Employee";
};

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signin" }, 401);
  let b: D;
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const clientId = String(b.clientId ?? "");
  const db = admin();
  const { data: cl } = await db.from("clients").select("id, name, config").eq("id", clientId).maybeSingle();
  if (!cl) return json({ ok: false, reason: "not_found" }, 404);
  const cfg = (cl.config ?? {}) as ClientConfig;

  // who may use the leave center
  let medical = who.advisor;
  if (!who.advisor) {
    if (!who.memberOf.includes(clientId) || !(cfg.modules as D | undefined)?.leave) return json({ ok: false, reason: "forbidden" }, 403);
    const { data: a } = await db.from("leave_admins").select("medical").eq("client_id", clientId).ilike("email", who.email).maybeSingle();
    if (!a) return json({ ok: false, reason: "forbidden" }, 403);
    medical = !!a.medical;
  }
  const audit = (caseId: string, what: string, detail?: string) => db.from("leave_audit").insert({ client_id: clientId, case_id: caseId, who: who.name || who.email, what, detail: detail?.slice(0, 500) ?? null });
  const getCase = async (id: string) => {
    const { data } = await db.from("leave_cases").select("data").eq("id", id).eq("client_id", clientId).maybeSingle();
    return (data?.data as LeaveCase | undefined) ?? null;
  };
  const putCase = (c: LeaveCase) => db.from("leave_cases").update({ data: { ...c, updatedAt: new Date().toISOString() } }).eq("id", c.id).eq("client_id", clientId);
  const hrAdmins = async () => {
    const { data } = await db.from("leave_admins").select("email, medical").eq("client_id", clientId);
    return (data ?? []) as { email: string; medical: boolean }[];
  };

  if (b.action === "list") {
    const { data } = await db.from("leave_cases").select("data").eq("client_id", clientId).order("updated_at", { ascending: false }).limit(1000);
    return json({ ok: true, cases: (data ?? []).map((r) => r.data), me: { medical, advisor: who.advisor }, admins: await hrAdmins() });
  }

  if (b.action === "admins") {
    if (!who.advisor) return json({ ok: false, reason: "forbidden" }, 403);
    if (Array.isArray(b.admins)) {
      const next = (b.admins as D[]).map((a) => ({ email: String(a.email ?? "").trim().toLowerCase(), medical: a.medical !== false })).filter((a) => EMAIL.test(a.email));
      await db.from("leave_admins").delete().eq("client_id", clientId);
      if (next.length) await db.from("leave_admins").insert(next.map((a) => ({ client_id: clientId, ...a })));
      await audit("-", "changed HR admins", next.map((a) => `${a.email}${a.medical ? "" : " (no medical)"}`).join(", ") || "none");
    }
    return json({ ok: true, admins: await hrAdmins() });
  }

  if (b.action === "save") {
    const c = b.case as LeaveCase;
    if (!c?.id || typeof c.id !== "string" || c.id.length > 60 || !c.employee?.name) return json({ ok: false, reason: "bad_request" }, 400);
    const prev = await getCase(c.id);
    const { data: other } = await db.from("leave_cases").select("client_id").eq("id", c.id).maybeSingle();
    if (other && other.client_id !== clientId) return json({ ok: false, reason: "forbidden" }, 403);
    // documents, emails and the case number are only changed by the server
    const next: LeaveCase = { ...c, clientId, docs: prev?.docs ?? [], emails: prev?.emails ?? [], number: prev?.number ?? c.number, updatedAt: new Date().toISOString() };
    if (!prev) {
      const { count } = await db.from("leave_cases").select("id", { count: "exact", head: true }).eq("client_id", clientId);
      next.number = `LOA-${String((count ?? 0) + 1).padStart(4, "0")}`;
      next.docs = [];
      next.emails = [];
      const { error } = await db.from("leave_cases").insert({ id: c.id, client_id: clientId, data: next, created_by: who.email });
      if (error) return json({ ok: false, reason: "save" }, 500);
      await audit(c.id, "opened the case", `${next.number}, status ${STATUS_LABEL[next.status]}`);
      // new request alert: Ben and the other HR admins, with no medical details
      const site = siteUrl(req);
      const href = `/c/${clientId}/leave/${c.id}`;
      const text = `New leave case ${next.number} (${short(next.employee.name)}) opened by ${who.name || who.email}`;
      await db.from("notices").insert({ id: `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, client_id: clientId, created_by: "leave@portal", data: { clientId, kind: "note", text: `${cl.name}: ${text}`, href, at: new Date().toISOString(), read: false } });
      const to = Array.from(new Set([...(await hrAdmins()).map((a) => a.email), ...(await advisorEmails(db).catch(() => []))])).filter((e) => e !== who.email);
      if (to.length) {
        await pushTo(db, to, "requests", { title: "New leave case", body: text, url: href }).catch(() => 0);
        const brand = { company: cl.name, accent: cfg.accent || "#19283c", logoUrl: emailLogoUrl(clientId, cfg.logo, cfg.logoEmail, site) };
        const m = noticeEmail(brand, "Leave center", `New leave case ${next.number}`, [`${who.name || who.email} opened leave case ${next.number} for ${short(next.employee.name)}.`, `Open it in the portal: ${site}${href}`, "For privacy, leave details are only in the portal."]);
        await sendEmail({ to, subject: `New leave case ${next.number}`, text: m.text, html: m.html }).catch(() => undefined);
      }
      return json({ ok: true, case: next });
    }
    // what changed, for the history
    const changes: string[] = [];
    if (prev.status !== next.status) changes.push(`status ${STATUS_LABEL[prev.status]} → ${STATUS_LABEL[next.status]}`);
    for (const k of ["expectedStart", "expectedEnd", "actualStart", "actualEnd", "schedule"] as const) if ((prev[k] ?? "") !== (next[k] ?? "")) changes.push(`${k.replace(/([A-Z])/g, " $1").toLowerCase()} ${prev[k] || "none"} → ${next[k] || "none"}`);
    if (prev.categories.join() !== next.categories.join()) changes.push(`leave types: ${next.categories.join(", ")}`);
    if ((prev.assignedTo?.email ?? "") !== (next.assignedTo?.email ?? "")) changes.push(`assigned to ${next.assignedTo?.name ?? "nobody"}`);
    const pDone = new Set(prev.tasks.filter((t) => t.done).map((t) => t.id));
    for (const t of next.tasks) if (t.done && !pDone.has(t.id)) changes.push(`done: ${t.title}`);
    for (const t of next.tasks) if (!prev.tasks.some((x) => x.id === t.id)) changes.push(`task added: ${t.title}`);
    for (const t of next.tasks) {
      const p = prev.tasks.find((x) => x.id === t.id);
      if (p && p.due !== t.due) changes.push(`${t.title} due ${p.due ?? "none"} → ${t.due ?? "none"}`);
    }
    if (next.notes.length > prev.notes.length) changes.push("added a note");
    if (Object.entries(next.rtw).some(([k, v]) => v && !prev.rtw[k])) changes.push("return-to-work checklist updated");
    for (const e of next.extensions) {
      const p = prev.extensions.find((x) => x.id === e.id);
      if (!p) changes.push(`extension requested to ${e.newEnd}`);
      else if (p.status !== e.status) changes.push(`extension to ${e.newEnd}: ${e.status.replace("_", " ")}`);
    }
    if (JSON.stringify(prev.eligibility) !== JSON.stringify(next.eligibility)) changes.push("eligibility review updated");
    if (next.intermittent.length !== prev.intermittent.length) changes.push("intermittent time logged");
    await putCase(next);
    await audit(c.id, "updated", changes.join("; ") || "details");
    return json({ ok: true, case: { ...next, updatedAt: new Date().toISOString() } });
  }

  const caseId = String(b.caseId ?? "");
  const c = caseId ? await getCase(caseId) : null;
  if (!c) return json({ ok: false, reason: "not_found" }, 404);

  if (b.action === "audit") {
    const { data } = await db.from("leave_audit").select("who, what, detail, at").eq("client_id", clientId).eq("case_id", caseId).order("at", { ascending: false }).limit(300);
    return json({ ok: true, history: data ?? [] });
  }

  if (b.action === "uploadUrl") {
    const name = String(b.name ?? "file").replace(/[^A-Za-z0-9._ -]/g, "").replace(/\s+/g, "-").slice(-80) || "file";
    const path = `${clientId}/leave/${caseId}/${Date.now().toString(36)}-${name}`;
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return json({ ok: false, reason: "upload" }, 500);
    return json({ ok: true, path, token: data.token });
  }

  if (b.action === "addDoc") {
    const d = b.doc as Partial<CaseDoc>;
    const path = String(d?.path ?? "");
    if (!path.startsWith(`${clientId}/leave/${caseId}/`)) return json({ ok: false, reason: "bad_request" }, 400);
    const kind = (["medical", "notice", "designation", "rtw", "request", "other"] as const).find((k) => k === d.kind) ?? "other";
    const isMed = kind === "medical" || !!d.medical;
    if (isMed && !medical) return json({ ok: false, reason: "medical" }, 403);
    const doc: CaseDoc = { id: `d${Date.now().toString(36)}`, name: String(d.name ?? "Document").slice(0, 120), path, kind, medical: isMed, size: Number(d.size) || undefined, at: new Date().toISOString(), by: who.name || who.email };
    const next = { ...c, docs: [...c.docs, doc] };
    await putCase(next);
    await audit(caseId, "uploaded a document", `${doc.name}${doc.medical ? " (medical, restricted)" : ""}`);
    return json({ ok: true, case: next });
  }

  if (b.action === "openDoc" || b.action === "removeDoc") {
    const doc = c.docs.find((x) => x.id === String(b.docId ?? ""));
    if (!doc) return json({ ok: false, reason: "not_found" }, 404);
    if (doc.medical && !medical) {
      await audit(caseId, "was blocked from a medical document", doc.name);
      return json({ ok: false, reason: "medical" }, 403);
    }
    if (b.action === "openDoc") {
      const { data } = await db.storage.from(BUCKET).createSignedUrl(doc.path, 120);
      if (!data?.signedUrl) return json({ ok: false, reason: "missing" }, 404);
      await audit(caseId, "opened a document", doc.name);
      return json({ ok: true, url: data.signedUrl, name: doc.name });
    }
    await db.storage.from(BUCKET).remove([doc.path]);
    const next = { ...c, docs: c.docs.filter((x) => x.id !== doc.id) };
    await putCase(next);
    await audit(caseId, "deleted a document", doc.name);
    return json({ ok: true, case: next });
  }

  if (b.action === "email") {
    const to = String(b.to ?? "").trim().toLowerCase();
    const subject = String(b.subject ?? "").trim().slice(0, 200);
    const body = String(b.body ?? "").trim().slice(0, 8000);
    if (!EMAIL.test(to) || !subject || !body) return json({ ok: false, reason: "bad_request" }, 400);
    // only the employee on the case, their manager, or an HR admin can get case emails
    const allowed = new Set([c.employee.email, c.employee.managerEmail, who.email, ...(await hrAdmins()).map((a) => a.email)].filter(Boolean).map((e) => e!.toLowerCase()));
    if (!allowed.has(to)) return json({ ok: false, reason: "recipient" }, 400);
    const ids: string[] = Array.isArray(b.docIds) ? b.docIds.map(String).slice(0, 5) : [];
    const attachments: { filename: string; content: string }[] = [];
    for (const id of ids) {
      const doc = c.docs.find((x) => x.id === id);
      if (!doc || doc.medical) continue; // medical documents never go out by email
      const { data } = await db.storage.from(BUCKET).download(doc.path);
      if (!data || data.size > 8e6) continue;
      attachments.push({ filename: doc.name, content: Buffer.from(await data.arrayBuffer()).toString("base64") });
    }
    const site = siteUrl(req);
    const brand = { company: cl.name, accent: cfg.accent || "#19283c", logoUrl: emailLogoUrl(clientId, cfg.logo, cfg.logoEmail, site) };
    const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const m = noticeEmail(brand, cl.name, subject, paras);
    const sender = senderFor(onboardingFor(cfg.onboarding), cl.name);
    const r = await sendEmail({ to: [to], subject, text: body, html: m.html, attachments: attachments.length ? attachments : undefined, ...sender, replyTo: who.advisor ? sender.replyTo || who.email : who.email });
    if (!r.ok) return json({ ok: false, reason: r.reason ?? "send" }, 502);
    if (b.copyMe) await sendEmail({ to: [who.email], subject: `Copy: ${subject}`, text: `Sent to ${to} from the leave center (${c.number}).\n\n${body}`, ...sender }).catch(() => undefined);
    const next = { ...c, emails: [...c.emails, { at: new Date().toISOString(), by: who.name || who.email, to, subject }] };
    await putCase(next);
    await audit(caseId, "sent an email", `"${subject}" to ${to}${attachments.length ? ` with ${attachments.map((a) => a.filename).join(", ")}` : ""}`);
    return json({ ok: true, case: next });
  }

  if (b.action === "remove") {
    if (!who.advisor) return json({ ok: false, reason: "forbidden" }, 403);
    if (c.docs.length) await db.storage.from(BUCKET).remove(c.docs.map((d) => d.path));
    await db.from("leave_cases").delete().eq("id", caseId).eq("client_id", clientId);
    await audit(caseId, "deleted the case", `${c.number} and ${c.docs.length} document(s), under the retention policy`);
    return json({ ok: true });
  }

  return json({ ok: false, reason: "bad_request" }, 400);
}
