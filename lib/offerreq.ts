// Offer requests: a hiring manager fills out a short form (no sign-in). If the company set up an
// approver, it goes to them first; then to HR, who writes the offer letter. The manager approves
// the letter by email, and HR sends it. Shared by the browser and the server.
import type { Hire } from "./hires";
import type { ClientConfig } from "./modules";

export interface OfferRequest {
  requester: string;
  requesterEmail: string;
  name: string;
  personalEmail: string;
  title: string;
  reportsTo: string;
  startDate: string;
  payType: "hourly" | "salary";
  payAmount: string;
  exempt: "exempt" | "nonexempt";
  employment: "Full-time" | "Part-time" | "Seasonal" | "Temporary";
  location: string; // where they'll work: one of the company's saved locations, or typed in
  pto: "" | "Accrued" | "DTO"; // only asked when the company turns it on
  housing: boolean; // eligible for the housing discount (only asked when the company offers it)
  extras: string; // bonus, sign-on, relocation, contingencies
  approved: boolean; // used when the company has no approver
  approvedBy: string;
}

export const blankRequest = (): OfferRequest => ({ requester: "", requesterEmail: "", name: "", personalEmail: "", title: "", reportsTo: "", startDate: "", payType: "hourly", payAmount: "", exempt: "nonexempt", employment: "Full-time", location: "", pto: "", housing: false, extras: "", approved: false, approvedBy: "" });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What's missing, in plain words. Empty means ready to send. */
export function requestProblems(r: OfferRequest, hasApprover: boolean, askPto = false): string[] {
  const out: string[] = [];
  if (!r.requester.trim()) out.push("your name");
  if (!EMAIL.test(r.requesterEmail.trim())) out.push("your work email");
  if (!r.name.trim()) out.push("the new hire's full name");
  if (!EMAIL.test(r.personalEmail.trim())) out.push("their personal email");
  if (!r.title.trim()) out.push("the job title");
  if (!r.startDate) out.push("a start date");
  if (!r.location.trim()) out.push("a work location");
  if (!(Number(r.payAmount) > 0)) out.push("the pay");
  if (askPto && !r.pto) out.push("the PTO type");
  if (!hasApprover && !r.approved) out.push("a check that the offer is approved");
  if (!hasApprover && r.approved && !r.approvedBy.trim()) out.push("who approved it");
  return out;
}

export function cleanRequest(x: Partial<OfferRequest>): OfferRequest {
  const s = (v: unknown, n = 160) => String(v ?? "").trim().slice(0, n);
  return {
    requester: s(x.requester, 80), requesterEmail: s(x.requesterEmail, 120).toLowerCase(), name: s(x.name, 100), personalEmail: s(x.personalEmail, 120).toLowerCase(),
    title: s(x.title, 120), reportsTo: s(x.reportsTo, 100), startDate: /^\d{4}-\d{2}-\d{2}$/.test(s(x.startDate, 10)) ? s(x.startDate, 10) : "",
    payType: x.payType === "salary" ? "salary" : "hourly", payAmount: String(Number(x.payAmount) || ""), exempt: x.exempt === "exempt" ? "exempt" : "nonexempt",
    employment: (["Full-time", "Part-time", "Seasonal", "Temporary"] as const).includes(x.employment as "Full-time") ? (x.employment as OfferRequest["employment"]) : "Full-time",
    location: s(x.location, 160), pto: x.pto === "Accrued" || x.pto === "DTO" ? x.pto : "", housing: x.housing === true,
    extras: s(x.extras, 1500), approved: !!x.approved, approvedBy: s(x.approvedBy, 100),
  };
}

export const payText = (r: { payType: string; payAmount: string | number }) =>
  `$${Number(r.payAmount).toLocaleString("en-US", { maximumFractionDigits: 2 })}${r.payType === "hourly" ? "/hour" : "/year"}`;

/** The new hire record the request starts. */
export function hireFromRequest(r: OfferRequest, clientId: string, id: string, approver: { name: string; email: string } | null): Hire {
  const now = new Date().toISOString();
  const notes = [`${r.employment}.`, r.pto && `PTO: ${r.pto === "DTO" ? "DTO (discretionary time off)" : "Accrued"}.`, r.housing && "Eligible for the housing discount.", r.extras && `From the request: ${r.extras}`].filter(Boolean).join(" ");
  return {
    id, clientId, status: "Approved to hire",
    title: r.title, managerName: r.reportsTo || r.requester, managerTitle: "",
    name: r.name, personalEmail: r.personalEmail,
    payType: r.payType, payAmount: Number(r.payAmount), exempt: r.exempt,
    startDate: r.startDate, location: r.location || undefined, housing: r.housing || undefined, notes, requestedBy: r.requester, createdAt: now,
    request: { name: r.requester, email: r.requesterEmail, at: now, employment: r.employment, approvedBy: approver ? undefined : r.approvedBy, pto: r.pto || undefined },
    preApproval: approver ? { status: "waiting", name: approver.name, email: approver.email.toLowerCase(), at: now } : undefined,
    history: [{ at: now, by: r.requester, text: approver ? `${r.requester} requested an offer. Waiting on ${approver.name} to approve.` : `${r.requester} requested an offer (approved by ${r.approvedBy}). Next: HR writes the offer letter.` }],
  };
}

/** Where a hire stands in the request steps, for the hire page and lists. */
export function requestStage(h: Hire): string | null {
  if (h.preApproval?.status === "waiting") return `Waiting on ${h.preApproval.name.split(" ")[0]} to approve the request`;
  if (h.preApproval?.status === "sent_back") return `${h.preApproval.name.split(" ")[0]} sent the request back`;
  if (h.letterApproval?.status === "waiting") return `Offer letter with ${h.letterApproval.name.split(" ")[0]} to approve`;
  if (h.letterApproval?.status === "sent_back") return `${h.letterApproval.name.split(" ")[0]} asked for changes to the letter`;
  if (h.letterApproval?.status === "approved" && h.status === "Approved to hire") return `Letter approved by ${h.letterApproval.name.split(" ")[0]}. Ready to send`;
  return null;
}

/** The company's saved work locations, for the request form: main office, office list, then properties. */
export function requestLocations(cfg: Partial<ClientConfig> | null | undefined): string[] {
  const o = cfg?.onboarding ?? {};
  const hidden = new Set((cfg?.properties?.hidden ?? []).map((x) => x.trim().toLowerCase()));
  const all = [o.hqAddress ?? "", ...(o.officeLocations ?? "").split("\n"), ...(cfg?.properties?.items ?? []).filter((i) => i.status !== "Inactive").map((i) => i.name)]
    .map((x) => x.trim()).filter(Boolean).filter((x) => !hidden.has(x.toLowerCase()));
  const seen = new Set<string>();
  return all.filter((x) => (seen.has(x.toLowerCase()) ? false : (seen.add(x.toLowerCase()), true)));
}

/** Whether this company's request form asks accrued vs DTO. */
export const asksPto = (cfg: Partial<ClientConfig> | null | undefined, id: string, name = "") =>
  cfg?.offerPto ?? /presidio/i.test(`${id} ${name}`);

/** Whether this company's offers have the employee housing discount section. */
export const asksHousing = (cfg: Partial<ClientConfig> | null | undefined, id: string, name = "") =>
  cfg?.offerHousing ?? /presidio/i.test(`${id} ${name}`);
