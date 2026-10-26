"use client";

import { useState } from "react";
import { BUILT_IN_TEMPLATES, cleanBox, EmailEdits, FILL_INS, HireCompany, onboardingFor, OnboardingSettings, suggestBox } from "@/lib/hires";
import { logoInfo, shrinkLogo } from "@/lib/logoimg";

const domain = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "alzapc.com";
const PAYROLL = ["ADP", "Rippling", "Gusto", "Paychex", "TriNet", "Justworks"];

/** What a client's welcome and first-day emails say. Stored on the client's config. */
export function OnboardingSettingsCard({ value, onChange, clientName }: { value?: Partial<OnboardingSettings>; onChange: (v: Partial<OnboardingSettings>) => void; clientName?: string }) {
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
          <div className="full">{txt("officeLocations", "Other office locations", "One per line, e.g. The Main Post, 1 Main St, Sausalito. Each new hire picks where they report.", true)}</div>
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
          <legend className="full">Emails to candidates and new hires come from</legend>
          {txt("senderName", "Sender name", `${clientName ? clientName + " HR" : "Company HR"}`)}
          <label className="f">Sender address
            <span className="box-field">
              <input className="f" value={value?.senderBox ?? ""} placeholder={suggestBox(clientName)} onChange={(e) => set("senderBox", cleanBox(e.target.value) as never)} />
              <span className="small muted">@{domain}</span>
            </span>
          </label>
          <p className="tiny muted full" style={{ margin: "4px 0 0" }}>Replies go to the HR email above, not this address. Leave blank to use {suggestBox(clientName) || "the portal address"}{suggestBox(clientName) ? `@${domain}` : ""}.</p>
        </fieldset>
        <Companies list={value?.companies ?? []} clientName={clientName} onChange={(companies) => set("companies", companies.length ? companies : (undefined as never))} />
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
        <Templates value={value?.emailTemplates} onChange={(t) => set("emailTemplates", t as never)} />
      </div>
      {sw("orientation", "Mention HR orientation in week one", "Adds a line to the first-day email.")}
      {sw("clockingSection", "Clocking in and out section for hourly staff", "Meal and rest break basics in the first-day email for non-exempt hires.")}
    </div>
  );
}

const newCoId = () => `co${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Sister companies on one account. Each hire picks one, and its emails use that name and logo. */
function Companies({ list, clientName, onChange }: { list: HireCompany[]; clientName?: string; onChange: (l: HireCompany[]) => void }) {
  const [err, setErr] = useState("");
  const upd = (i: number, patch: Partial<HireCompany>) => onChange(list.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  return (
    <fieldset>
      <legend className="full">Sister companies <span className="tiny muted" style={{ fontFamily: "inherit", fontWeight: 400 }}>(optional)</span></legend>
      <p className="tiny muted full" style={{ margin: "0 0 6px" }}>
        Only if this account hires for more than one company. Each new hire then picks a company, and their emails and signed documents use that company&apos;s name and logo. Hires with no company picked use {clientName || "this account"}.
      </p>
      {list.map((c, i) => (
        <div key={c.id} className="full co-card">
          <div className="row" style={{ alignItems: "center", gap: 10 }}>
            <div className="co-logo">{c.logo ? <img src={c.logo} alt="" /> : <span className="tiny muted">No logo</span>}</div>
            <label className="btn ghost sm" style={{ cursor: "pointer" }}>
              {c.logo ? "Change logo" : "Add logo"}
              <input
                type="file"
                hidden
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    setErr("");
                    const logo = await shrinkLogo(f);
                    const { png, color } = await logoInfo(logo);
                    upd(i, { logo, logoEmail: logo.startsWith("data:image/svg") ? png : undefined, ...(color && !c.color ? { color } : {}) });
                  } catch {
                    setErr("Couldn't read that image.");
                  }
                }}
              />
            </label>
            <input type="color" aria-label="Brand color" value={c.color || "#19283c"} onChange={(e) => upd(i, { color: e.target.value })} style={{ width: 38, height: 34, border: 0, background: "none" }} />
            <span className="grow" />
            <button className="btn ghost sm" style={{ color: "var(--red)" }} onClick={() => onChange(list.filter((_, k) => k !== i))}>Remove</button>
          </div>
          <label className="f">Company name<input className="f" value={c.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="As it should appear in emails" /></label>
          {(c.emailTemplates?.welcome || c.emailTemplates?.firstDay) && (
            <p className="tiny muted" style={{ margin: "6px 0 0" }}>
              Has its own {[c.emailTemplates?.welcome && "welcome", c.emailTemplates?.firstDay && "first-day"].filter(Boolean).join(" and ")} email wording (saved from a hire).{" "}
              <button className="linklike tiny" onClick={() => upd(i, { emailTemplates: undefined })}>Use the main wording instead</button>
            </p>
          )}
          <div className="co-grid">
            <label className="f">HR contact <span className="tiny muted">(if different)</span><input className="f" value={c.hrName ?? ""} onChange={(e) => upd(i, { hrName: e.target.value })} /></label>
            <label className="f">HR email <span className="tiny muted">(replies go here)</span><input className="f" type="email" value={c.hrEmail ?? ""} onChange={(e) => upd(i, { hrEmail: e.target.value })} /></label>
            <label className="f">HR phone<input className="f" value={c.hrPhone ?? ""} onChange={(e) => upd(i, { hrPhone: e.target.value })} /></label>
            <label className="f">Sender address
              <span className="box-field">
                <input className="f" value={c.senderBox ?? ""} placeholder={suggestBox(c.name)} onChange={(e) => upd(i, { senderBox: cleanBox(e.target.value) })} />
                <span className="small muted">@{domain}</span>
              </span>
            </label>
          </div>
        </div>
      ))}
      {err && <p className="small full" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="full">
        <button className="btn sm" onClick={() => onChange([...list, { id: newCoId(), name: "" }])}>{list.length ? "Add another company" : "Add a sister company"}</button>
      </div>
    </fieldset>
  );
}

type Templates = { welcome?: EmailEdits; firstDay?: EmailEdits };

/** The account's standard wording for the welcome and first-day emails. Blank fields use the built-in text. */
function Templates({ value, onChange }: { value?: Templates; onChange: (t: Templates | undefined) => void }) {
  const [kind, setKind] = useState<"welcome" | "firstDay">("welcome");
  const cur = value?.[kind] ?? {};
  const b = BUILT_IN_TEMPLATES[kind];
  const set = (k: keyof EmailEdits, v: string) => {
    const next: Templates = { ...(value ?? {}), [kind]: { ...cur, [k]: v || undefined } };
    const empty = (e?: EmailEdits) => !e || !(e.subject || e.message || e.closing);
    onChange(empty(next.welcome) && empty(next.firstDay) ? undefined : next);
  };
  const custom = !!(cur.subject || cur.message || cur.closing);
  return (
    <fieldset>
      <legend className="full">Email templates</legend>
      <p className="tiny muted full" style={{ margin: "0 0 6px" }}>
        The standard wording for every new hire. Fill-ins are replaced for each person: {FILL_INS.join(", ")}. You can also tweak one hire&apos;s email from their page, or save it as the template there.
      </p>
      <div className="full seg" role="tablist" style={{ marginBottom: 4, gridTemplateColumns: "1fr 1fr" }}>
        <button className={kind === "welcome" ? "on" : ""} onClick={() => setKind("welcome")}>Welcome email</button>
        <button className={kind === "firstDay" ? "on" : ""} onClick={() => setKind("firstDay")}>First-day email</button>
      </div>
      <label className="f full">Subject<input className="f" value={cur.subject ?? ""} placeholder={b.subject} onChange={(e) => set("subject", e.target.value)} /></label>
      <label className="f full">
        Message <span className="tiny muted">(blank line between paragraphs)</span>
        <textarea className="f" style={{ minHeight: 140 }} value={cur.message ?? ""} placeholder={b.message} onChange={(e) => set("message", e.target.value)} />
      </label>
      <label className="f full">Closing line<input className="f" value={cur.closing ?? ""} placeholder={b.closing} onChange={(e) => set("closing", e.target.value)} /></label>
      <div className="full tiny muted" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{custom ? "Custom wording for this company." : "Using the standard wording (shown in gray). Type to change it."}</span>
        {!custom && (
          <button className="linklike tiny" onClick={() => onChange({ ...(value ?? {}), [kind]: { ...b } })}>Start from the standard wording</button>
        )}
        {custom && (
          <button className="linklike tiny" onClick={() => onChange({ ...(value ?? {}), [kind]: undefined })}>Reset to standard</button>
        )}
      </div>
    </fieldset>
  );
}
