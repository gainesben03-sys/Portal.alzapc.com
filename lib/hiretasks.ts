// Client tasks created by the hire flow. Pure functions, used in the browser and on the server.
import { Action, ADVISOR, addBusinessDays, Client, parseDay, Person, toISO, today } from "./data";
import { firstName, Hire, onboardingFor, payLine } from "./hires";
import { ClientConfig } from "./modules";

export const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function ownerFor(h: Hire, cfg: ClientConfig, client: Client): Person {
  const mgr = cfg.users.find((u) => u.name.trim().toLowerCase() === h.managerName.trim().toLowerCase());
  if (mgr) return { name: mgr.name, role: mgr.role, email: mgr.email };
  return client.escalation;
}

/** Once an offer is signed: Ben adds them to payroll; the client gets ready for day one. */
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
      side: "alza",
      kind: "document",
      title: `Add ${h.name} to ${s.payroll}`,
      detail: `${h.name} starts ${h.startDate || "soon"} as ${h.title}. Ben sets them up in ${s.payroll} so they're paid on the first payroll and can enroll in benefits.`,
      impact: "If this slips, their first paycheck and benefits enrollment slip with it.",
      owner: ADVISOR,
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

