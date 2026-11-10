// Sample leave cases for the public demo. All people are fictional; no medical details.
import { addDays, CaseTask, DEFAULT_CATEGORIES, LeaveCase, tasksFor, today } from "./leave";

const ben = { name: "Ben Gaines", email: "ben@alzapc.com" };
const dana = { name: "Dana Ortiz", email: "dana@example.com" };

function make(n: number, p: Partial<LeaveCase> & Pick<LeaveCase, "employee" | "categories" | "requestedAt" | "status">, doneKeys: string[] = []): LeaveCase {
  const t = today();
  const base: LeaveCase = { id: `demo-loa-${n}`, clientId: "blueprint", number: `LOA-${String(n).padStart(4, "0")}`, schedule: "continuous", assignedTo: ben, eligibility: {}, entitlement: {}, tasks: [], rtw: {}, docs: [], notes: [], intermittent: [], extensions: [], emails: [], createdAt: `${p.requestedAt}T16:00:00.000Z`, updatedAt: `${addDays(t, -2)}T16:00:00.000Z`, ...p };
  const tasks: CaseTask[] = (p.tasks ?? tasksFor(base, DEFAULT_CATEGORIES)).map((x) => (x.key && doneKeys.includes(x.key) ? { ...x, done: true, doneAt: x.due, doneBy: "Ben Gaines" } : x));
  return { ...base, tasks };
}

export function demoLeave(): LeaveCase[] {
  const t = today();
  const d = (n: number) => addDays(t, n);
  return [
    make(1, {
      status: "active",
      employee: { personId: "pp1", name: "Jamie Lopez", title: "Warehouse Lead", department: "Warehouse", manager: "Dana Ortiz", managerEmail: "dana@example.com", email: "jamie@example.com" },
      categories: ["fmla", "cfra"],
      requestedAt: d(-40),
      expectedStart: d(-30),
      expectedEnd: d(9),
      actualStart: d(-30),
      eligibility: { fmla: "likely", cfra: "likely" },
      entitlement: { fmla: { available: 12, used: 4.3 }, cfra: { available: 12, used: 4.3 } },
      benefits: { continuing: true, premiums: "Payroll deduction continues (PTO running concurrently)" },
      docs: [
        { id: "dd1", name: "Leave request form.pdf", path: "", kind: "request", medical: false, at: `${d(-40)}T17:00:00Z`, by: "Ben Gaines" },
        { id: "dd2", name: "Eligibility and rights notice.pdf", path: "", kind: "notice", medical: false, at: `${d(-38)}T17:00:00Z`, by: "Ben Gaines" },
        { id: "dd3", name: "Provider certification.pdf", path: "", kind: "medical", medical: true, at: `${d(-27)}T17:00:00Z`, by: "Ben Gaines" },
      ],
      notes: [{ id: "n1", at: `${d(-27)}T18:00:00Z`, by: "Ben Gaines", text: "Certification received and complete. Designation notice drafted." }],
      emails: [{ at: `${d(-40)}T17:30:00Z`, by: "Ben Gaines", to: "jamie@example.com", subject: "We received your leave request" }],
    }, ["notice", "certSent", "certDue", "designation", "benefits"]),
    make(2, {
      status: "pending_docs",
      employee: { personId: "pp2", name: "Sam Patel", title: "Inventory Coordinator", department: "Warehouse", manager: "Dana Ortiz", managerEmail: "dana@example.com", email: "sam.p@example.com" },
      categories: ["family", "cfra"],
      schedule: "intermittent",
      scheduleNote: "Up to 2 days a month for a family member's appointments",
      requestedAt: d(-12),
      expectedStart: d(-5),
      expectedEnd: d(80),
      assignedTo: dana,
      eligibility: { cfra: "likely", family: "not_reviewed" },
      entitlement: { cfra: { available: 12, used: 0.4 } },
      intermittent: [
        { id: "i1", date: d(-5), hours: 8 },
        { id: "i2", date: d(-1), hours: 4, note: "Half day" },
      ],
    }, ["notice", "certSent"]),
    make(3, {
      status: "requested",
      employee: { personId: "pp3", name: "Rosa Diaz", title: "Driver", department: "Logistics", manager: "Dana Ortiz", managerEmail: "dana@example.com", email: "rosa@example.com" },
      categories: ["bonding"],
      requestedAt: d(-2),
      expectedStart: d(21),
      expectedEnd: d(77),
    }),
    make(4, {
      status: "extended",
      employee: { personId: "pp4", name: "Chris Wu", title: "Warehouse Associate", department: "Warehouse", manager: "Dana Ortiz", managerEmail: "dana@example.com", email: "chris.w@example.com" },
      categories: ["wc", "accommodation"],
      requestedAt: d(-60),
      expectedStart: d(-58),
      expectedEnd: d(-3),
      actualStart: d(-58),
      extensions: [
        { id: "x1", requestedAt: d(-6), newEnd: d(4), status: "approved", note: "Updated work status note received" },
        { id: "x2", requestedAt: d(-1), newEnd: d(18), status: "requested" },
      ],
      accommodation: { considered: true, note: "Light duty options discussed with Dana: no lifting over 25 lbs." },
      notes: [{ id: "n2", at: `${d(-6)}T18:00:00Z`, by: "Ben Gaines", text: "Carrier claim number on file. Interactive process meeting held." }],
    }, ["dwc1", "carrier", "duty", "meet", "medinfo", "decision"]),
    make(5, {
      status: "closed",
      employee: { personId: "pp5", name: "Dana Ortiz", title: "Office Manager", department: "Operations", manager: "Alex Rivera", managerEmail: "alex@example.com", email: "dana@example.com" },
      categories: ["bereavement"],
      requestedAt: d(-95),
      expectedStart: d(-94),
      expectedEnd: d(-90),
      actualStart: d(-94),
      actualEnd: d(-90),
      rtw: { confirm: true, notify: true, payroll: true, actual: true, close: true },
      closedAt: `${d(-88)}T18:00:00Z`,
    }, ["proof"]),
  ];
}
