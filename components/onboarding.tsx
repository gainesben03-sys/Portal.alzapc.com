"use client";

import { onboardingFor, OnboardingSettings } from "@/lib/hires";

const PAYROLL = ["ADP", "Rippling", "Gusto", "Paychex", "TriNet", "Justworks"];

/** What a client's welcome and first-day emails say. Stored on the client's config. */
export function OnboardingSettingsCard({ value, onChange }: { value?: Partial<OnboardingSettings>; onChange: (v: Partial<OnboardingSettings>) => void }) {
  const s = onboardingFor(value);
  const set = <K extends keyof OnboardingSettings>(k: K, v: OnboardingSettings[K]) => onChange({ ...(value ?? {}), [k]: v });
  const txt = (k: keyof OnboardingSettings, label: string, ph?: string, area?: boolean) => (
    <label className="f">
      {label}
      {area ? (
        <textarea className="f" value={String(value?.[k] ?? "")} placeholder={ph ?? String(s[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} />
      ) : (
        <input className="f" value={String(value?.[k] ?? "")} placeholder={ph ?? String(s[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} />
      )}
    </label>
  );
  const sw = (k: "autoSend" | "orientation" | "clockingSection", title: string, sub: string) => (
    <label className="rule" style={{ cursor: "pointer" }}>
      <span className="switch"><input type="checkbox" checked={!!s[k]} onChange={(e) => set(k, e.target.checked)} /><span /></span>
      <div><b>{title}</b><div className="tiny muted">{sub}</div></div>
    </label>
  );
  const custom = typeof value?.payroll === "string" && !PAYROLL.includes(value.payroll);

  return (
    <div className="card">
      {sw("autoSend", "Send onboarding emails automatically", `Welcome email when the offer is signed, first-day email ${s.firstDayDaysBefore} days before the start date. Off: send them by hand from each hire.`)}
      <div className="hire-form">
        <fieldset>
          <label className="f">Payroll system
            <select className="f" value={custom ? "other" : value?.payroll ?? ""} onChange={(e) => set("payroll", (e.target.value === "other" ? "" : e.target.value || undefined) as never)}>
              <option value="">Choose...</option>
              {PAYROLL.map((p) => <option key={p}>{p}</option>)}
              <option value="other">Other</option>
            </select>
          </label>
          <label className="f">First-day email goes out
            <select className="f" value={s.firstDayDaysBefore} onChange={(e) => set("firstDayDaysBefore", Number(e.target.value))}>
              {[3, 5, 7, 10, 14].map((n) => <option key={n} value={n}>{n} days before day one</option>)}
            </select>
          </label>
          {custom && <div className="full">{txt("payroll", "Payroll system name", "e.g. Paylocity")}</div>}
          <div className="full">{txt("hqAddress", "Main office address", "Street, city, suite. Used as the default place to report.")}</div>
          {txt("defaultArrival", "Usual arrival time")}
          <label className="f">Benefits enrollment window (days)
            <input className="f" inputMode="numeric" value={value?.enrollDays ?? ""} placeholder={String(s.enrollDays)} onChange={(e) => set("enrollDays", (e.target.value ? Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 30) : undefined) as never)} />
          </label>
        </fieldset>
        <fieldset>
          <legend className="full">Who new hires contact</legend>
          {txt("hrName", "Name")}
          {txt("hrEmail", "Email")}
          {txt("hrPhone", "Phone", "Optional")}
        </fieldset>
        <fieldset>
          <legend className="full">What the emails say</legend>
          <div className="full">{txt("benefitsNote", "Benefits line", undefined, true)}</div>
          <div className="full">{txt("mission", "Mission", "One or two sentences. Leave blank to skip.", true)}</div>
          <div className="full">{txt("values", "Values", "One per line. Leave blank to skip.", true)}</div>
          <div className="full">{txt("leaderQuote", "A welcome note from leadership", "Leave blank to skip.", true)}</div>
          {txt("leaderNames", "Signed by", "e.g. Alex Rivera, CEO")}
          {txt("videoUrl", "Welcome video link", "Optional https:// link")}
          <div className="full">{txt("idNote", "ID to bring on day one", undefined, true)}</div>
        </fieldset>
      </div>
      {sw("orientation", "Mention HR orientation in week one", "Adds a line to the first-day email.")}
      {sw("clockingSection", "Clocking in and out section for hourly staff", "Meal and rest break basics in the first-day email for non-exempt hires.")}
    </div>
  );
}
