// Email to work: HR forwards a client's email to the Alza Hub and it becomes a task or a project.
// Shared by the server and HR's console. No secrets here.
import { Action, ADVISOR, Project, Subtask } from "./data";
import { syncStepTasks } from "./projecttasks";

export type WorkType = "offer" | "termination" | "newhire" | "jd" | "investigation" | "leave" | "policy" | "other";
export type InboxStatus = "created" | "private" | "review" | "unsorted" | "dismissed";

export interface InboxStep { id: string; text: string; who: "ben" | "client"; done: boolean; doneAt?: string }
export interface InboxItem {
  id: string;
  clientId?: string;
  receivedAt: string;
  via: "email" | "paste";
  from: string; // who forwarded it (HR)
  origFrom?: string; // the client person who wrote it, when the forward shows it
  subject: string;
  text: string; // the email as plain text, trimmed
  note?: string; // what HR typed above the forward
  attachments: { name: string; path?: string; size?: number; type?: string }[];
  type: WorkType;
  sensitive: boolean;
  title: string;
  summary: string;
  person?: string; // who it's about, if anyone
  due?: string; // yyyy-mm-dd
  steps: InboxStep[];
  status: InboxStatus;
  why?: string; // why it's waiting (review / unsorted)
  made?: { projectId?: string; actionIds: string[] };
  trusted: boolean; // sender checks passed
  emailId?: string; // Resend's id, so a repeat delivery isn't taken in twice
}

export const TYPE_LABEL: Record<WorkType, string> = {
  offer: "Offer letter", termination: "Termination", newhire: "New hire", jd: "Job description",
  investigation: "Investigation", leave: "Leave of absence", policy: "Policy or handbook", other: "Task",
};
/** Kept between HR and HR only: never written where client staff can see it. */
export const SENSITIVE: WorkType[] = ["termination", "investigation", "leave"];

type S = [string, "ben" | "client"];
export const STEPS: Record<Exclude<WorkType, "other">, S[]> = {
  offer: [["Confirm title, pay, start date and manager", "ben"], ["Draft the offer letter", "ben"], ["Client reviews the offer", "client"], ["Send for e-signature", "ben"], ["Add to the new hire tracker", "ben"]],
  termination: [
    ["Review the documentation and reason", "ben"],
    ["Confirm final pay date and amount, including accrued vacation (due on the last day if involuntary in CA)", "ben"],
    ["Prepare the termination letter and required notices (Change in Relationship, EDD DE 2320, COBRA / Cal-COBRA, HIPP)", "ben"],
    ["Plan the meeting: who, when, what to say", "ben"],
    ["Equipment return and access shutoff", "client"],
    ["Start offboarding in the Alza Hub", "ben"],
  ],
  newhire: [["Get start date, title, pay and manager", "ben"], ["Offer letter out for signature", "ben"], ["Add to the new hire tracker", "ben"], ["Welcome and first-day prep", "client"]],
  jd: [["Gather role details from the manager", "ben"], ["Draft the job description", "ben"], ["Set the pay range (CA pay transparency)", "ben"], ["Client reviews", "client"], ["Finalize", "ben"]],
  investigation: [["Intake: what happened, who, when", "ben"], ["Interim measures, if needed", "ben"], ["Interview plan", "ben"], ["Interviews", "ben"], ["Findings memo", "ben"], ["Close-out conversations", "ben"]],
  leave: [["Confirm the leave type and eligibility (CFRA, FMLA, PDL)", "ben"], ["Send the notice and certification forms", "ben"], ["Set the dates and track them", "ben"], ["Plan the return to work", "ben"]],
  policy: [["Gather what's needed and current practice", "ben"], ["Draft or update", "ben"], ["Client reviews", "client"], ["Finalize and share", "ben"]],
};
export const stepsFor = (t: WorkType): InboxStep[] =>
  t === "other" ? [] : STEPS[t].map(([text, who], i) => ({ id: `s${i + 1}`, text, who, done: false }));

export const STATUS_LABEL: Record<InboxStatus, string> = { created: "Added", private: "Private", review: "Needs your OK", unsorted: "Pick a client", dismissed: "Dismissed" };

/** Business days back from a date, for spacing HR's steps before the due date. */
export function spreadDue(due: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${due}T12:00:00`);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    let back = Math.round((i * 3) / Math.max(1, n - 1)); // spread over about 3 business days
    while (back > 0) {
      x.setDate(x.getDate() - 1);
      if (x.getDay() !== 0 && x.getDay() !== 6) back--;
    }
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

/** Three business days out, when nothing says otherwise. */
export function defaultDue(): string {
  const d = new Date();
  let n = 3;
  while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n--; }
  return d.toISOString().slice(0, 10);
}
const nid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** The project (with HR's steps on his list) or the single task an item becomes. */
export function buildWork(item: InboxItem): { project?: Project; actions: Action[] } {
  const clientId = item.clientId as string;
  const now = new Date().toISOString();
  const due = item.due || defaultDue();
  const who = item.origFrom ? ` from ${item.origFrom.replace(/<[^>]+>/, "").trim()}` : "";
  const ref = item.via === "paste" && item.subject === "(pasted email)" ? `From an email${who}.` : `From an email${who}: "${item.subject}".`;
  const attachments = item.attachments.filter((a) => a.path).map((a) => ({ name: a.name, from: "Email", path: a.path }));
  if (item.type === "other" || !item.steps.length) {
    const a: Action = {
      id: nid("a"), clientId, side: "alza", kind: "todo", title: item.title, detail: [item.summary, item.note ? `Your note: ${item.note}` : "", ref].filter(Boolean).join("\n\n"),
      owner: ADVISOR, due, status: "not_started", attachments, history: [{ at: now, by: "Alza Hub", text: "Added from a forwarded email" }],
    };
    return { actions: [a] };
  }
  const benSteps = item.steps.filter((s) => s.who === "ben" && !s.done);
  const dates = spreadDue(due, benSteps.length);
  const steps: Subtask[] = item.steps.map((s) => {
    const k = benSteps.indexOf(s);
    return { id: s.id, text: s.text, done: s.done, doneAt: s.doneAt, ...(k >= 0 ? { owner: ADVISOR, due: dates[k] } : {}) };
  });
  const p0: Project = { id: nid("p"), clientId, name: item.title, status: "active", summary: [item.summary, ref].filter(Boolean).join(" "), steps, nextMilestone: steps.find((s) => !s.done)?.text ?? "", milestoneDue: due, startedAt: now };
  const { project, created } = syncStepTasks(p0, undefined, [], { name: "Alza Hub", advisor: true });
  if (created[0] && attachments.length) created[0].attachments = attachments;
  return { project, actions: created };
}
