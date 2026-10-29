"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDaysISO, analyze, daysUntil, firstName, Hire, officeList, OnboardingSettings, payLine, shortDate, STAGES, STAGE_SHORT, stageIndex } from "@/lib/hires";
import { Action, Rules, urgency } from "@/lib/data";
import { PortalUser } from "@/lib/modules";

/** Pizza-tracker style progress: six stops, the current one pulses. */
export function Tracker({ h, compact, noLabels }: { h: Pick<Hire, "status" | "startDate">; compact?: boolean; noLabels?: boolean }) {
  const cur = stageIndex(h.status);
  return (
    <div className={`tracker ${compact ? "compact" : ""}`} role="img" aria-label={`Stage: ${h.status}`}>
      <div className="tracker-line">
        <div className="tracker-fill" style={{ width: `${(cur / (STAGES.length - 1)) * 100}%` }} />
      </div>
      <ol>
        {STAGES.map((s, i) => (
          <li key={s} className={i < cur ? "done" : i === cur ? "now" : ""}>
            <span className="dot">{i < cur ? "✓" : i + 1}</span>
            {!noLabels && <span className="lbl">{STAGE_SHORT[s]}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Tasks that belong to one hire (offer approval, first-day prep, payroll setup...). */
export function hireTasks(h: Pick<Hire, "clientId" | "name" | "firstName">, actions: Action[]) {
  const first = firstName(h);
  return actions.filter((a) => a.clientId === h.clientId && !!h.name && (a.title.includes(h.name) || (a.title === `Get ready for ${first}'s first day` && !!a.history[0]?.text.includes(h.name))));
}

/** Who acts next on a hire, in plain words. */
export function hireNext(h: Hire, tasks: Action[], s: OnboardingSettings, escalationName?: string) {
  const first = firstName(h);
  const open = tasks.filter((a) => a.status !== "completed");
  const clientTask = open.find((a) => a.side === "client");
  switch (stageIndex(h.status)) {
    case 0:
      if (clientTask && clientTask.kind === "approval") return `Waiting on ${clientTask.owner.name.split(" ")[0]} to approve the offer`;
      return (h.docs ?? []).some((d) => d.kind === "offer") ? `Offer letter ready to send` : `Ben is preparing the offer letter`;
    case 1:
      return h.esign?.offer?.status === "viewed" ? `${first} opened the offer, not signed yet` : `Waiting on ${first} to sign the offer`;
    case 2:
      return clientTask ? `${clientTask.title} (${clientTask.owner.name.split(" ")[0]})` : `Ben is setting up payroll and paperwork`;
    case 3:
      if (clientTask) return `${clientTask.title} (${clientTask.owner.name.split(" ")[0]})`;
      return h.startDate && s.autoSend ? `First-day email goes out ${shortDate(addDaysISO(h.startDate, -s.firstDayDaysBefore))}` : `First-day email is next`;
    case 4:
      return clientTask ? `${clientTask.title} (${clientTask.owner.name.split(" ")[0]})` : `All set for day one`;
    default:
      return `On the team${escalationName ? "" : ""}`;
  }
}

export type HireBadge = { label: string; tone: "green" | "amber" | "red" | "done" };
export function hireBadge(h: Hire, tasks: Action[], rules: Rules): HireBadge {
  const stage = stageIndex(h.status);
  if (stage >= 5) return { label: "Started", tone: "done" };
  const open = tasks.filter((a) => a.side === "client" && a.status !== "completed");
  if (open.some((a) => ["overdue", "blocker"].includes(urgency(a, rules)))) return { label: "Needs you", tone: "red" };
  const n = h.startDate ? daysUntil(h.startDate) : 99;
  if (n <= 7 && stage < 3) return { label: "Tight for the start date", tone: "red" };
  if (open.length) return { label: "Needs you", tone: "amber" };
  if (n <= 7) return { label: n <= 0 ? "Starts today" : "Starts this week", tone: "green" };
  return { label: "On track", tone: "green" };
}

/** Home page card: who, when, the six-stop tracker, and who acts next. */
export function HireProgressCard({ h, href, tasks, s, rules }: { h: Hire; href: string; tasks: Action[]; s: OnboardingSettings; rules: Rules }) {
  const cur = stageIndex(h.status);
  const b = hireBadge(h, tasks, rules);
  const n = h.startDate ? daysUntil(h.startDate) : null;
  return (
    <Link href={href} className="proj-mini hire-card-mini">
      <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="ellipsis" style={{ display: "block" }}>{h.name || "New hire"}</b>
          <span className="tiny muted ellipsis" style={{ display: "block" }}>{h.title}</span>
        </div>
        <div style={{ textAlign: "right", flex: "none" }}>
          <div className="small"><b>{h.startDate ? shortDate(h.startDate) : "TBD"}</b></div>
          <div className="tiny muted">{n === null ? "No date yet" : n > 1 ? `in ${n} days` : n === 1 ? "tomorrow" : n === 0 ? "today" : `${-n} days ago`}</div>
        </div>
      </div>
      <div className="steptrack" style={{ marginTop: 10 }} role="img" aria-label={`Stage: ${h.status}`}>
        <div className="steptrack-bar" style={{ gridTemplateColumns: `repeat(${STAGES.length}, 1fr)` }}>
          {STAGES.map((st, i) => <span key={st} className={i < cur || cur === STAGES.length - 1 ? "done" : i === cur ? "now" : ""} />)}
        </div>
      </div>
      <div className="tiny" style={{ marginTop: 6 }}>
        <b>{STAGE_SHORT[h.status]}</b>
        {cur < STAGES.length - 1 && <span className="muted"> · Next: {STAGE_SHORT[STAGES[cur + 1]]}</span>}
      </div>
      <div className="tiny muted ellipsis" style={{ marginTop: 2 }}>{hireNext(h, tasks, s)}</div>
      <div style={{ marginTop: 8 }}>
        <span className={`health-chip h-${b.tone}`}><span className="dot" />{b.label}</span>
      </div>
    </Link>
  );
}

export function startsIn(iso: string) {
  if (!iso) return "No start date";
  const n = daysUntil(iso);
  if (n < 0) return `Started ${shortDate(iso)}`;
  if (n === 0) return "Starts today";
  if (n === 1) return "Starts tomorrow";
  return `Starts in ${n} days`;
}

export function HireRow({ h, href, clientName }: { h: Hire; href: string; clientName?: string }) {
  const n = h.startDate ? daysUntil(h.startDate) : null;
  return (
    <Link href={href} className="card hire-card" style={{ display: "block" }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow" style={{ minWidth: 0 }}>
          {clientName && <div className="tiny muted" style={{ marginBottom: 2 }}>{clientName}</div>}
          <div className="hire-name">{h.name || "Unnamed hire"}</div>
          <div className="small muted">{[h.title, h.managerName && `reports to ${h.managerName}`].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="hire-when">{h.startDate ? shortDate(h.startDate) : "TBD"}</div>
          <div className={`tiny ${n !== null && n >= 0 && n <= 7 ? "" : "muted"}`} style={n !== null && n >= 0 && n <= 7 ? { color: "var(--amber)", fontWeight: 600 } : undefined}>{startsIn(h.startDate)}</div>
        </div>
      </div>
      <Tracker h={h} compact />
      <div className="tiny muted" style={{ marginTop: 6 }}>{h.status}</div>
    </Link>
  );
}

export function Checks({ h, s }: { h: Partial<Hire>; s: OnboardingSettings }) {
  const a = analyze(h, s);
  const pill = (ok: boolean, t: string) => <span className={`pill ${ok ? "done" : "soon"}`}>{ok ? "Ready" : "Missing info"}: {t}</span>;
  return (
    <div className="card">
      <h2 style={{ marginBottom: 10 }}>Checks</h2>
      <div className="chips" style={{ marginTop: 0 }}>
        {pill(a.offer, "Offer letter")}
        {pill(a.agreement, "Agreement")}
        {pill(a.welcome, "Welcome email")}
        {pill(a.firstDay, "First-day email")}
      </div>
      <ul className="flags">
        {a.flags.map(([t, k], i) => (
          <li key={i} className={k}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export type HireDraft = Omit<Hire, "id" | "clientId" | "createdAt" | "history"> & { id?: string };

export function blankHire(s: OnboardingSettings): HireDraft {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return {
    status: "Approved to hire",
    title: "",
    managerName: "",
    managerTitle: "",
    name: "",
    firstName: "",
    personalEmail: "",
    cell: "",
    payType: "salary",
    payAmount: "",
    bonus: "",
    exempt: "exempt",
    startDate: "",
    arrivalTime: s.defaultArrival,
    location: "",
    jd: "",
    letterDate: iso,
    respondBy: addDaysISO(iso, 2),
    contingencies: "",
    notes: "",
    actionItems: "",
  };
}

/** The intake form. Mirrors the Presidio Bay console: role, person, pay, day one, documents, welcome email. */
export function HireForm({
  value,
  onChange,
  s,
  people,
  clientName,
}: {
  value: HireDraft;
  onChange: (v: HireDraft) => void;
  s: OnboardingSettings;
  people: PortalUser[];
  clientName?: string;
}) {
  const set = <K extends keyof HireDraft>(k: K, v: HireDraft[K]) => onChange({ ...value, [k]: v });
  const offices = officeList(s);
  const companies = (s.companies ?? []).filter((c) => c.name.trim());
  const [otherLoc, setOtherLoc] = useState(!!value.location && value.location !== s.hqAddress && !offices.includes(value.location));
  const locValue = otherLoc ? "__other" : value.location && offices.includes(value.location) ? value.location : s.hqAddress ? "__hq" : offices.length ? "" : "__other";
  const managerOptions = useMemo(() => people.map((p) => ({ name: p.name, title: p.role })), [people]);

  return (
    <div className="hire-form">
      {companies.length > 0 && (
        <fieldset>
          <legend>Company</legend>
          <label className="f full">Hiring company <span className="tiny muted">(sets the name and logo on their emails)</span>
            <select className="f" value={value.companyId ?? ""} onChange={(e) => set("companyId", e.target.value || undefined)}>
              <option value="">{clientName || "Main company"}</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </fieldset>
      )}
      <fieldset>
        <legend>Role</legend>
        <label className="f full">Position title<input className="f" value={value.title} onChange={(e) => set("title", e.target.value)} placeholder="Exactly as it will read on the offer letter" /></label>
        <label className="f">Reports to
          <input
            className="f"
            list="mgr-list"
            value={value.managerName}
            onChange={(e) => {
              const m = managerOptions.find((x) => x.name === e.target.value);
              onChange({ ...value, managerName: e.target.value, managerTitle: m ? m.title : value.managerTitle });
            }}
            placeholder="Manager's full name"
          />
          <datalist id="mgr-list">{managerOptions.map((m) => <option key={m.name} value={m.name} />)}</datalist>
        </label>
        <label className="f">Manager's title<input className="f" value={value.managerTitle} onChange={(e) => set("managerTitle", e.target.value)} /></label>
      </fieldset>

      <fieldset>
        <legend>New hire</legend>
        <label className="f">Full legal name<input className="f" value={value.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" /></label>
        <label className="f">Goes by (if different)<input className="f" value={value.firstName ?? ""} onChange={(e) => set("firstName", e.target.value)} /></label>
        <label className="f">Personal email<input className="f" type="email" value={value.personalEmail} onChange={(e) => set("personalEmail", e.target.value)} placeholder="Where the welcome emails go" /></label>
        <label className="f">Cell phone<input className="f" type="tel" value={value.cell ?? ""} onChange={(e) => set("cell", e.target.value)} placeholder={`Often needed for ${s.payroll}`} /></label>
      </fieldset>

      <fieldset>
        <legend>Pay</legend>
        <div className="f full">
          <span className="flabel">Pay type</span>
          <div className="seg" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 0 }}>
            <button type="button" className={value.payType === "salary" ? "on" : ""} onClick={() => onChange({ ...value, payType: "salary" })}>Salary</button>
            <button type="button" className={value.payType === "hourly" ? "on" : ""} onClick={() => onChange({ ...value, payType: "hourly", exempt: "nonexempt" })}>Hourly</button>
          </div>
        </div>
        <label className="f">{value.payType === "hourly" ? "Hourly rate ($)" : "Annual salary ($)"}
          <input className="f" inputMode="decimal" value={value.payAmount} onChange={(e) => set("payAmount", e.target.value === "" ? "" : Number(e.target.value.replace(/[$,\s]/g, "")) || "")} placeholder={value.payType === "hourly" ? "e.g. 28.50" : "e.g. 95000"} />
        </label>
        <label className="f">Bonus target (%)
          <input className="f" inputMode="decimal" value={value.bonus ?? ""} onChange={(e) => set("bonus", e.target.value === "" ? "" : Number(e.target.value.replace(/[%\s]/g, "")) || 0)} placeholder="Leave blank if none" />
        </label>
        <label className="f full">Classification
          <select className="f" value={value.exempt} onChange={(e) => set("exempt", e.target.value as HireDraft["exempt"])}>
            <option value="exempt">Exempt</option>
            <option value="nonexempt">Non-exempt</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Day one</legend>
        <label className="f">Start date<input className="f" type="date" value={value.startDate} onChange={(e) => set("startDate", e.target.value)} /></label>
        <label className="f">Arrive by<input className="f" value={value.arrivalTime ?? ""} onChange={(e) => set("arrivalTime", e.target.value)} placeholder="9:00 AM" /></label>
        <div className="f full">
          <span className="flabel">Where to report</span>
          <select
            className="f"
            value={locValue}
            onChange={(e) => {
              const v = e.target.value;
              setOtherLoc(v === "__other");
              set("location", v === "__other" || v === "__hq" ? "" : v);
            }}
          >
            {!s.hqAddress && offices.length > 0 && <option value="">Choose...</option>}
            {s.hqAddress && <option value="__hq">Main office: {s.hqAddress}</option>}
            {offices.map((o) => <option key={o} value={o}>{o}</option>)}
            <option value="__other">{s.hqAddress || offices.length ? "Other (type it in)" : "Enter an address"}</option>
          </select>
          {locValue === "__other" && <input className="f" style={{ marginTop: 8 }} value={value.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="Address, suite, and anything about parking" />}
        </div>
      </fieldset>

      <fieldset>
        <legend>Job description</legend>
        <label className="f full">For the agreement's job description <span className="tiny muted">(one item per line; a line ending in a colon is a heading)</span>
          <textarea className="f" style={{ minHeight: 120 }} value={value.jd ?? ""} onChange={(e) => set("jd", e.target.value)} />
        </label>
      </fieldset>

      <fieldset>
        <legend>Offer letter</legend>
        <label className="f">Letter date<input className="f" type="date" value={value.letterDate ?? ""} onChange={(e) => onChange({ ...value, letterDate: e.target.value, respondBy: e.target.value ? addDaysISO(e.target.value, 2) : value.respondBy })} /></label>
        <label className="f">Respond by<input className="f" type="date" value={value.respondBy ?? ""} onChange={(e) => set("respondBy", e.target.value)} /></label>
        <label className="f full">Contingencies <span className="tiny muted">(optional)</span><input className="f" value={value.contingencies ?? ""} onChange={(e) => set("contingencies", e.target.value)} placeholder="e.g. Background check, reference check" /></label>
      </fieldset>

      <fieldset>
        <legend>Welcome email</legend>
        <label className="f full">Action items for the new hire <span className="tiny muted">(one per line, optional)</span>
          <textarea className="f" style={{ minHeight: 70 }} value={value.actionItems ?? ""} onChange={(e) => set("actionItems", e.target.value)} placeholder="e.g. Reply with your cell phone number" />
        </label>
        <label className="f full">Notes for HR <span className="tiny muted">(only you and Ben see these)</span>
          <textarea className="f" style={{ minHeight: 60 }} value={value.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </label>
      </fieldset>
    </div>
  );
}

export { payLine };
