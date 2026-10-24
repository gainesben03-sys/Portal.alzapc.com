"use client";

// What happens when a new hire moves forward: emails, client tasks, documents.
import { Action, ADVISOR, addBusinessDays, Client, parseDay, Person, toISO, today } from "@/lib/data";
import { firstName, Hire, onboardingFor, payLine, Stage } from "@/lib/hires";
import { ClientConfig, SharedFile } from "@/lib/modules";
import { authHeader, LIVE, uploadToStorage } from "@/lib/supabase";

const EMAIL_REASONS: Record<string, string> = {
  no_email: "There's no personal email on file for this hire yet.",
  forbidden: "Only Ben or an executive can send this.",
  not_found: "This hire hasn't finished saving yet. Try again in a few seconds.",
  signed_out: "You're signed out. Sign in again and retry.",
  no_key: "Email isn't connected yet (RESEND_API_KEY in Vercel).",
};

export async function sendHireEmail(hireId: string, kind: "welcome" | "firstDay", test: boolean): Promise<{ sent: boolean; to?: string; msg: string }> {
  if (!LIVE) return { sent: false, msg: "Demo mode: emails go out once the portal is live." };
  try {
    const r = await fetch("/api/hire-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ hireId, kind, test }),
    });
    const j = await r.json();
    if (j.sent) return { sent: true, to: j.to, msg: test ? `Test sent to ${j.to}` : `Sent to ${j.to}` };
    return { sent: false, msg: EMAIL_REASONS[j.reason] ?? `Didn't send: ${j.reason ?? r.status}` };
  } catch {
    return { sent: false, msg: "Couldn't reach the server. Try again." };
  }
}

/** What the server writes after a real send, mirrored locally so the next save keeps it. */
export function afterSend(h: Hire, kind: "welcome" | "firstDay", at: string): Partial<Hire> {
  const status: Stage = kind === "firstDay" && ["Approved to hire", "Offer sent", "Offer signed", "Package ready"].includes(h.status) ? "First-day email sent" : h.status;
  return { emails: { ...(h.emails ?? {}), [kind]: at }, status };
}

const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function ownerFor(h: Hire, cfg: ClientConfig, client: Client): Person {
  const mgr = cfg.users.find((u) => u.name.trim().toLowerCase() === h.managerName.trim().toLowerCase());
  if (mgr) return { name: mgr.name, role: mgr.role, email: mgr.email };
  return client.escalation;
}

/** The client's two to-dos once an offer is signed: payroll setup and first-day prep. */
export function signedTasks(h: Hire, cfg: ClientConfig, client: Client): Action[] {
  const s = onboardingFor(cfg.onboarding);
  const now = new Date().toISOString();
  const t0 = today();
  const start = h.startDate ? parseDay(h.startDate) : addBusinessDays(t0, 10);
  let payDue = addBusinessDays(start, -3);
  if (payDue < t0) payDue = t0;
  const first = firstName(h);
  const log = [{ at: now, by: ADVISOR.name, text: `Created when ${h.name}'s offer was signed` }];
  const pay = [payLine(h), h.exempt === "exempt" ? "exempt" : "non-exempt"].filter(Boolean).join(", ");
  return [
    {
      id: newId("a"),
      clientId: h.clientId,
      side: "client",
      kind: "information",
      title: `Add ${h.name} to ${s.payroll}`,
      detail: `${h.name} starts ${h.startDate || "soon"} as ${h.title}. Set them up in ${s.payroll} so they're paid on the first payroll and can enroll in benefits.`,
      impact: "If this slips, their first paycheck and benefits enrollment slip with it.",
      owner: client.escalation,
      due: toISO(payDue),
      status: "not_started",
      attachments: [],
      subtasks: [
        `Create ${first}'s employee profile`,
        `Pay: ${pay || "see offer letter"}`,
        `Send the ${s.payroll} invite to ${h.personalEmail || "their personal email"}`,
        "Confirm their first pay date",
      ].map((text, i) => ({ id: `s${i + 1}`, text, done: false })),
      history: log,
    },
    {
      id: newId("a"),
      clientId: h.clientId,
      side: "client",
      kind: "information",
      title: `Get ready for ${first}'s first day`,
      detail: `${h.name} arrives ${h.arrivalTime || s.defaultArrival} on ${h.startDate || "their start date"}. A ready desk and working logins make the first impression.`,
      owner: ownerFor(h, cfg, client),
      due: toISO(start < t0 ? t0 : start),
      status: "not_started",
      attachments: [],
      subtasks: [
        "Laptop and equipment ready",
        "Email and system accounts created",
        "Workspace set up",
        "First-week schedule and a lunch buddy",
        "Review I-9 documents (within 3 business days of starting)",
      ].map((text, i) => ({ id: `s${i + 1}`, text, done: false })),
      history: log,
    },
  ];
}

/** Ask the client's executive to approve an offer letter Ben drafted. */
export function approvalTask(h: Hire, client: Client, doc: { name: string; path?: string }): Action {
  const now = new Date().toISOString();
  return {
    id: newId("a"),
    clientId: h.clientId,
    side: "client",
    kind: "approval",
    title: `Approve ${h.name}'s offer letter`,
    detail: `${h.title}, ${payLine(h)}, starting ${h.startDate || "TBD"}. Open the attached letter, then approve or request changes. Once approved, Ben sends it.`,
    impact: h.respondBy ? `The offer says to respond by ${h.respondBy}, so it needs to go out soon.` : undefined,
    owner: client.escalation,
    due: toISO(addBusinessDays(today(), 1)),
    status: "not_started",
    attachments: [{ name: doc.name, from: ADVISOR.name, path: doc.path }],
    history: [{ at: now, by: ADVISOR.name, text: "Sent for approval" }],
  };
}

/** Store a hire document privately and return the file record (clients can open it; it stays out of Ben's inbox when he adds it). */
export async function storeHireFile(h: Hire, file: File, by: string, fromAdvisor: boolean, note: string): Promise<SharedFile> {
  const id = newId("f");
  let path: string | undefined;
  if (LIVE) path = await uploadToStorage(h.clientId, id, file);
  return {
    id,
    clientId: h.clientId,
    name: file.name,
    size: file.size,
    type: file.type,
    category: fromAdvisor ? "From Ben" : "Other",
    note,
    confidential: false,
    by,
    at: new Date().toISOString(),
    reviewed: fromAdvisor,
    path,
    fromAdvisor: fromAdvisor || undefined,
  };
}

export { newId };
