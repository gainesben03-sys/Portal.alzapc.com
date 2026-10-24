"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDaysISO, analyze, daysUntil, Hire, OnboardingSettings, payLine, shortDate, STAGES, STAGE_SHORT, stageIndex } from "@/lib/hires";
import { PortalUser } from "@/lib/modules";

/** Pizza-tracker style progress: six stops, the current one pulses. */
export function Tracker({ h, compact }: { h: Pick<Hire, "status" | "startDate">; compact?: boolean }) {
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
            {!compact && <span className="lbl">{STAGE_SHORT[s]}</span>}
          </li>
        ))}
      </ol>
    </div>
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
}: {
  value: HireDraft;
  onChange: (v: HireDraft) => void;
  s: OnboardingSettings;
  people: PortalUser[];
}) {
  const set = <K extends keyof HireDraft>(k: K, v: HireDraft[K]) => onChange({ ...value, [k]: v });
  const [otherLoc, setOtherLoc] = useState(!!value.location && value.location !== s.hqAddress);
  const managerOptions = useMemo(() => people.map((p) => ({ name: p.name, title: p.role })), [people]);

  return (
    <div className="hire-form">
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
            value={otherLoc || !s.hqAddress ? "other" : "hq"}
            onChange={(e) => {
              const o = e.target.value === "other";
              setOtherLoc(o);
              set("location", o ? "" : "");
            }}
          >
            {s.hqAddress && <option value="hq">Main office: {s.hqAddress}</option>}
            <option value="other">{s.hqAddress ? "Somewhere else" : "Enter an address"}</option>
          </select>
          {(otherLoc || !s.hqAddress) && <input className="f" style={{ marginTop: 8 }} value={value.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="Address, suite, and anything about parking" />}
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
