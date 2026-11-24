"use client";

import { complianceFor } from "@/lib/compliance";
import { MAIL_APPS } from "@/lib/mailapp";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlzaNav, AlzaTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { Access, ACCESS_LABEL, ClientConfig, MODULES, PortalUser } from "@/lib/modules";
import { useStore } from "@/lib/store";
import { sendInvite } from "@/lib/invite";
import { logoInfo, shrinkLogo } from "@/lib/logoimg";
import { OnboardingSettingsCard } from "@/components/onboarding";
import { ExperienceSetup } from "@/components/experience";
import { KnowledgePanel } from "@/components/knowledge";
import { LevelsEditor } from "@/components/discipline";
import { RosterCard } from "@/components/roster";
import { WALLS } from "@/components/wall";
import { onboardingFor } from "@/lib/hires";
import { offboardFor } from "@/lib/offboard";
import { categoriesFor } from "@/lib/leave";

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function HexField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value.toUpperCase());
  const [bad, setBad] = useState(false);
  useEffect(() => setDraft(value.toUpperCase()), [value]);
  const commit = (raw: string) => {
    let v = raw.trim().replace(/^#?/, "#");
    if (/^#[0-9a-f]{3}$/i.test(v)) v = "#" + v.slice(1).split("").map((c) => c + c).join("");
    if (/^#[0-9a-f]{6}$/i.test(v)) {
      setBad(false);
      onChange(v.toLowerCase());
    } else setBad(true);
  };
  const contrast = (1.05) / (luminance(value) + 0.05); // white text on the accent
  return (
    <div style={{ marginTop: 12 }}>
      <label className="f" style={{ marginTop: 0 }}>HEX code</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          className="f hex"
          value={draft}
          maxLength={7}
          placeholder="#2B3FF5"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => e.key === "Enter" && commit(draft)}
          aria-invalid={bad}
        />
        <button className="btn sm" onClick={() => commit(draft)}>Apply</button>
        <span className="btn sm primary" style={{ pointerEvents: "none" }}>Button preview</span>
      </div>
      {bad && <p className="tiny" style={{ color: "var(--red)", marginTop: 6 }}>Use a 6-digit HEX like #2B3FF5.</p>}
      {!bad && contrast < 3 && <p className="tiny" style={{ color: "var(--amber)", marginTop: 6 }}>This color is light, so white button text will be hard to read. A darker shade works better.</p>}
    </div>
  );
}

const SWATCHES = ["#2b3ff5", "#1a2b4a", "#4a7ab5", "#6b8c6b", "#8a6d3b", "#b4345c", "#0f766e", "#6d28d9"];

type Tab = "features" | "brand" | "access" | "roster" | "docs";
const TABS: { id: Tab; label: string }[] = [
  { id: "features", label: "Features" },
  { id: "brand", label: "Brand" },
  { id: "access", label: "People & access" },
  { id: "roster", label: "Team roster" },
  { id: "docs", label: "Documents" },
];

/** Simple line icons for the feature cards. */
const ICON: Record<string, string> = {
  hires: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6",
  recruiting: "M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14",
  recognition: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z",
  offboarding: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  leave: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  properties: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6",
  training: "M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z",
  resources: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  wellness: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6",
  board: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  askHr: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
  softAsks: "M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4",
  compliance: "M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7zM9 12l2 2 4-4",
  perform: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 14l2 2 4-4",
  pulse: "M22 12h-4l-3 9L9 3l-3 9H2",
  tracker: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
};
const Icon = ({ k }: { k: string }) => (
  <span className="fc-icon" aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[k] ?? ICON.tracker} /></svg>
  </span>
);

type Action = { label: string; href?: string; onClick?: () => void };
function FeatureCard({ k, title, blurb, on, onToggle, locked, status, actions, children }: { k: string; title: string; blurb: string; on: boolean; onToggle?: (v: boolean) => void; locked?: boolean; status?: string[]; actions?: Action[]; children?: React.ReactNode }) {
  return (
    <section className={`fcard ${on ? "on" : "off"}`} aria-label={title}>
      <div className="fc-head">
        <Icon k={k} />
        <div className="fc-title">
          <b>{title}</b>
          <span className={`fc-state ${on ? "on" : ""}`}>{locked ? "Always on" : on ? "On" : "Off"}</span>
        </div>
        {!locked && (
          <label className="switch" title={on ? `Turn ${title} off` : `Turn ${title} on`}>
            <input type="checkbox" checked={on} aria-label={`${title} on or off`} onChange={(e) => onToggle?.(e.target.checked)} />
            <span />
          </label>
        )}
      </div>
      <p className="fc-blurb">{blurb}</p>
      {on && status && status.filter(Boolean).length > 0 && (
        <ul className="fc-status">{status.filter(Boolean).map((x) => <li key={x}>{x}</li>)}</ul>
      )}
      {on && children}
      {on && actions && actions.length > 0 && (
        <div className="fc-actions">
          {actions.map((a) => (a.href ? <Link key={a.label} href={a.href} className="btn sm">{a.label}</Link> : <button key={a.label} className="btn sm" onClick={a.onClick}>{a.label}</button>))}
        </div>
      )}
    </section>
  );
}

export default function ClientSetup() {
  const { id } = useParams<{ id: string }>();
  const ok = useGuard("advisor");
  const { config, patch, getClient, live } = useStore();
  const client = getClient(id);
  const cfg = config[id];
  const toast = useToast();
  const [nu, setNu] = useState<PortalUser>({ name: "", role: "", email: "", access: "manager" });
  const [xpOpen, setXpOpen] = useState(false);
  const [emailsOpen, setEmailsOpen] = useState(false);
  const [tab, setTabState] = useState<Tab>("features");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTabState(t);
  }, []);
  const setTab = (t: Tab) => {
    setTabState(t);
    const u = new URL(window.location.href);
    if (t === "features") u.searchParams.delete("tab");
    else u.searchParams.set("tab", t);
    window.history.replaceState(null, "", u.toString());
  };

  if (!ok) return null;
  if (!client || !cfg) return (<><AlzaTopbar /><AlzaNav /><main className="wrap"><div className="card">Client not found.</div></main></>);

  const set = (p: Partial<ClientConfig>) => patch({ config: { ...config, [id]: { ...cfg, ...p } } });
  const setUser = (email: string, p: Partial<PortalUser>) => set({ users: cfg.users.map((u) => (u.email === email ? { ...u, ...p } : u)) });
  const mod = (k: keyof ClientConfig["modules"]) => !!cfg.modules[k];
  const toggle = (k: keyof ClientConfig["modules"]) => (v: boolean) => { set({ modules: { ...cfg.modules, [k]: v } }); toast.show(`${MODULES.find((m) => m.key === k)?.label ?? "Feature"} ${v ? "on" : "off"}`); };
  const blurb = (k: string) => MODULES.find((m) => m.key === k)?.blurb ?? "";
  const ob = onboardingFor(cfg.onboarding);
  const rec = cfg.recognition;
  const off = offboardFor(cfg.offboarding);
  const hiresOn = cfg.modules.hires !== false;
  const featuresOn = MODULES.filter((m) => (m.key === "hires" ? hiresOn : cfg.modules[m.key])).length;

  return (
    <div style={{ ["--accent" as string]: cfg.accent }}>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap wide">
        <Link href="/console/clients" className="small" style={{ color: "var(--blue)" }}>← All clients</Link>
        <div className="set-top">
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 auto" }}>
            {client.logo ? <img src={client.logo} alt="" className="logo-img" style={{ height: 34 }} /> : null}
            <div>
              <h1 style={{ margin: 0, fontSize: 24 }}>{client.name}</h1>
              <p className="tiny muted" style={{ margin: "2px 0 0" }}>Settings · {featuresOn} of {MODULES.length} features on · {cfg.users.length} {cfg.users.length === 1 ? "person" : "people"} with access</p>
            </div>
          </div>
          <Link href={`/c/${id}`} className="btn sm">Open their People Hub</Link>
        </div>

        <nav className="set-tabs" aria-label="Settings sections">
          {TABS.map((t) => <button key={t.id} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </nav>

        {tab === "features" && (
          <>
            <h2 className="set-h">Hiring and onboarding</h2>
            <div className="set-grid">
              <FeatureCard k="hires" title="New hires" blurb={blurb("hires")} on={hiresOn} onToggle={toggle("hires")}
                status={[ob.autoSend ? "Welcome emails send on their own" : "Welcome emails wait for you to send", cfg.onboarding?.experience?.on ? "Employee experience on: intro, buddy, manager plan" : "Employee experience off"]}
                actions={[{ label: "Welcome emails", onClick: () => setEmailsOpen(true) }, { label: cfg.onboarding?.experience?.on ? "Employee experience" : "Set up employee experience", onClick: () => setXpOpen(true) }]} />
              <FeatureCard k="recruiting" title="Recruiting" blurb={blurb("recruiting")} on={mod("recruiting")} onToggle={toggle("recruiting")}
                actions={[{ label: "Open roles", href: `/c/${id}/recruiting` }]}>
                <label className="fc-sub">
                  <span className="grow"><b>Video screening</b> <span className="pill alza">Add-on</span><span className="tiny muted" style={{ display: "block" }}>Candidates send a 90-second video pitch. You screen and share the best.</span></span>
                  <span className="switch"><input type="checkbox" checked={!!cfg.videoScreening} aria-label="Video screening" onChange={(e) => set({ videoScreening: e.target.checked })} /><span /></span>
                </label>
              </FeatureCard>
              <FeatureCard k="offboarding" title="Offboarding" blurb={blurb("offboarding")} on={mod("offboarding")} onToggle={toggle("offboarding")}
                status={[off.autoSend ? (off.sendDaysBefore === 0 ? "Goodbye email on their last day" : `Goodbye email ${off.sendDaysBefore} ${off.sendDaysBefore === 1 ? "day" : "days"} before the last day`) : "Goodbye email waits for you to send", off.survey ? "Exit survey on" : "Exit survey off"]}
                actions={[{ label: "Email and checklist", href: `/c/${id}/offboarding?tab=settings` }]} />
            </div>

            <h2 className="set-h">Culture and managers</h2>
            <div className="set-grid">
              <FeatureCard k="recognition" title="Team Wall" blurb="Shoutouts by QR code, text or the People Hub, birthdays, anniversaries and new starters on one wall. Every shoutout is screened first." on={mod("recognition")} onToggle={toggle("recognition")}
                status={[`${WALLS.find((w) => w.id === (rec?.theme?.wall ?? "clean"))?.name ?? "Clean"} wall`, rec?.polls?.on === false ? "This or That off" : "This or That every two weeks", rec?.monthly?.on ? "Monthly themes on" : "Monthly themes off"]}
                actions={[{ label: "Wall settings", href: `/c/${id}/recognition?settings=1` }]} />
              <FeatureCard k="perform" title="Reviews" blurb="Performance reviews on a schedule. Managers finish a guided review in about 10 minutes on a phone or computer, in English or Spanish. Self-assessments, sign-off, goals and improvement plans." on={mod("perform")} onToggle={toggle("perform")}
                status={[`${{ year: "Once a year", half: "Twice a year", quarter: "Every quarter", custom: "Custom schedule" }[cfg.perform?.cadence ?? "year"]}${(cfg.perform?.basis ?? "company") === "anniversary" ? ", on work anniversaries" : ""}`, cfg.perform?.intro?.on === false ? "No new hire review" : `New hire review at ${cfg.perform?.intro?.days ?? 90} days`, cfg.perform?.selfAssess === false ? "Self-assessment off" : "Self-assessment on"]}
                actions={[{ label: "Templates", href: `/c/${id}/reviews?tab=templates` }, { label: "Settings", href: `/c/${id}/reviews?tab=settings` }, { label: "Open reviews", href: `/c/${id}/reviews` }]} />
              <FeatureCard k="askHr" title="Ask HR" blurb="Managers and executives ask in plain words. Answers come only from this client's handbook and policies, and anything about firing, leave, harassment or discrimination comes to you." on={cfg.askHr !== false} onToggle={(v) => { set({ askHr: v }); toast.show(`Ask HR ${v ? "on" : "off"}`); }}
                actions={[{ label: "Handbook and policies", onClick: () => setTab("docs") }]} />
              <FeatureCard k="training" title="Training" blurb={blurb("training")} on={mod("training")} onToggle={toggle("training")}
                actions={[{ label: "Library", href: "/console/library" }]} />
              <FeatureCard k="compliance" title="Required training" blurb="California harassment prevention (the state's free course) and workplace violence prevention, plus any course they add. Assigns it, collects certificates, keeps the record, reminds people." on={mod("compliance")} onToggle={toggle("compliance")}
                status={[(() => { const c = complianceFor(cfg.compliance); const on = c.courses.filter((x) => x.on).map((x) => x.name); return on.length ? on.join(", ") : "No courses on"; })(), complianceFor(cfg.compliance).live ? "Emails on" : "Not launched yet"]}
                actions={[{ label: "Courses and settings", href: `/c/${id}/training/required?tab=setup` }, { label: "Open", href: `/c/${id}/training/required` }]} />
              <FeatureCard k="pulse" title="Pulse" blurb={blurb("pulse")} on={mod("pulse")} onToggle={toggle("pulse")}
                actions={[{ label: "Open", href: `/c/${id}/pulse` }]} />
            </div>

            <h2 className="set-h">HR tools</h2>
            <div className="set-grid">
              <FeatureCard k="leave" title="Leave center" blurb={blurb("leave")} on={mod("leave")} onToggle={toggle("leave")}
                status={[`${categoriesFor(cfg.leave ?? {}).length} leave types`]}
                actions={[{ label: "Leave settings", href: `/c/${id}/leave?tab=settings` }]} />
              <FeatureCard k="properties" title="Our Properties" blurb={blurb("properties")} on={mod("properties")} onToggle={toggle("properties")}
                actions={[{ label: "Open properties", href: `/c/${id}/properties` }]} />
              <FeatureCard k="tracker" title="Action tracker" blurb="Decisions, approvals and reminders. Overdue items escalate to the contact on People & access." on locked
                actions={[{ label: "Reminder rules", href: "/console/rules" }]} />
            </div>

            <h2 className="set-h">Content and extras</h2>
            <div className="set-grid">
              <FeatureCard k="resources" title="Resources" blurb={blurb("resources")} on={mod("resources")} onToggle={toggle("resources")} actions={[{ label: "Open resources", href: `/c/${id}/resources` }]} />
              <FeatureCard k="wellness" title="Wellness" blurb={blurb("wellness")} on={mod("wellness")} onToggle={toggle("wellness")} />
              <FeatureCard k="board" title="Messages" blurb={blurb("board")} on={mod("board")} onToggle={toggle("board")} />
              <FeatureCard k="softAsks" title="Referral and add-on lines" blurb="A quiet line on their dashboard inviting intros. Shows a hiring line only if Recruiting is off." on={cfg.softAsks !== false} onToggle={(v) => set({ softAsks: v })} />
            </div>
          </>
        )}

        {tab === "brand" && (
          <div className="set-grid two">
            <section className="card">
              <h2 className="set-card-h">Logo</h2>
              <div className="row" style={{ marginTop: 6 }}>
                <div className="grow" style={{ minHeight: 40, display: "flex", alignItems: "center" }}>
                  {cfg.logo ? <img src={cfg.logo} alt="" className="logo-img" style={{ maxHeight: 44, maxWidth: 200 }} /> : <span className="small muted">No logo yet. Their name shows instead.</span>}
                </div>
                <label className="btn sm" style={{ cursor: "pointer" }}>
                  Upload
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      try {
                        const logo = await shrinkLogo(f);
                        const { png, color } = await logoInfo(logo);
                        set({ logo, logoEmail: logo.startsWith("data:image/svg") ? png : undefined, ...(color ? { accent: color } : {}) });
                        toast.show(color ? "Logo updated. Brand color matched to it." : "Logo updated");
                      } catch {
                        toast.show("Couldn't read that image");
                      }
                    }}
                  />
                </label>
                {cfg.logo && <button className="btn ghost sm" style={{ color: "var(--red)" }} onClick={() => set({ logo: undefined, logoEmail: undefined })}>Remove</button>}
              </div>
              <p className="tiny muted" style={{ marginTop: 8 }}>A transparent PNG or SVG looks best. It also goes at the top of their emails, and the brand color is matched to it.</p>
            </section>
            <section className="card">
              <h2 className="set-card-h">Email app</h2>
              <p className="tiny muted" style={{ margin: "2px 0 10px" }}>Where &ldquo;Email&rdquo; buttons in their People Hub open on a computer. Phones always use the phone&apos;s own mail app.</p>
              <div className="pf-filters" role="group" aria-label="Email app">
                {MAIL_APPS.map((m) => (
                  <button key={m.id} className={(cfg.mailApp ?? "default") === m.id ? "on" : ""} aria-pressed={(cfg.mailApp ?? "default") === m.id} onClick={() => set({ mailApp: m.id })} title={m.sub}>{m.label}</button>
                ))}
              </div>
              <p className="tiny muted" style={{ margin: "8px 0 0" }}>{MAIL_APPS.find((m) => m.id === (cfg.mailApp ?? "default"))?.sub}. New hires writing from a personal Gmail or Outlook.com address get their own app automatically.</p>
              <p className="tiny muted" style={{ margin: "4px 0 0" }}>People Hub emails landing in spam? Ask their IT to allowlist alzapc.com.</p>
            </section>
            <section className="card">
              <h2 className="set-card-h">Brand color</h2>
              <div className="swatches" style={{ marginTop: 6 }}>
                {SWATCHES.map((c) => (
                  <button key={c} className={`swatch ${cfg.accent === c ? "on" : ""}`} style={{ background: c }} aria-label={c} onClick={() => set({ accent: c })} />
                ))}
                <input type="color" value={cfg.accent} onChange={(e) => set({ accent: e.target.value })} aria-label="Custom color" style={{ width: 38, height: 34, border: 0, background: "none" }} />
              </div>
              <HexField value={cfg.accent} onChange={(v) => set({ accent: v })} />
              <div className="row" style={{ marginTop: 10, alignItems: "center" }}>
                <p className="tiny muted grow" style={{ margin: 0 }}>Buttons and highlights in their People Hub and emails. Light colors are darkened automatically where they&apos;re used as text.</p>
                {cfg.logo && (
                  <button
                    className="btn ghost sm"
                    onClick={async () => {
                      const { png, color } = await logoInfo(cfg.logo!).catch(() => ({ png: undefined, color: null }));
                      if (!color) return toast.show("Couldn't find a color in the logo");
                      set({ accent: color, ...(cfg.logo!.startsWith("data:image/svg") && png ? { logoEmail: png } : {}) });
                      toast.show(`Matched to the logo: ${color}`);
                    }}
                  >
                    Match logo
                  </button>
                )}
              </div>
            </section>
          </div>
        )}

        {tab === "access" && (
          <div className="set-grid two">
            <section className="card">
              <h2 className="set-card-h">People with access</h2>
              {cfg.users.map((u) => (
                <div className="row" key={u.email} style={{ flexWrap: "wrap" }}>
                  <div className="grow" style={{ minWidth: 160 }}>
                    <div className="title">{u.name}{u.invited && <span className="pill" style={{ marginLeft: 6 }}>Invited</span>}</div>
                    <div className="tiny muted">{u.role} · {u.email}</div>
                  </div>
                  <select className="f" style={{ width: "auto", padding: "6px 8px", fontSize: 13 }} value={u.access} aria-label={`${u.name}'s access`} onChange={(e) => setUser(u.email, { access: e.target.value as Access })}>
                    {(Object.keys(ACCESS_LABEL) as Access[]).map((a) => <option key={a} value={a}>{ACCESS_LABEL[a]}</option>)}
                  </select>
                  <button
                    className="btn ghost sm"
                    style={{ color: "var(--red)" }}
                    disabled={cfg.users.length === 1}
                    onClick={() => {
                      set({ users: cfg.users.filter((x) => x.email !== u.email) });
                      toast.show(`${u.name}'s access removed`);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </section>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <section className="card">
                <h2 className="set-card-h">Invite someone</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!nu.name.trim() || !nu.email.trim()) return;
                    if (cfg.users.some((u) => u.email.toLowerCase() === nu.email.trim().toLowerCase())) return toast.show("That email already has access");
                    const invitee = { ...nu, name: nu.name.trim(), role: nu.role.trim() || "Team member", email: nu.email.trim().toLowerCase(), invited: true };
                    set({ users: [...cfg.users, invitee], escalationEmail: cfg.escalationEmail || (invitee.access === "exec" ? invitee.email : ""), huddle: { ...cfg.huddle, recipients: [...cfg.huddle.recipients, invitee.email] } });
                    setNu({ name: "", role: "", email: "", access: "manager" });
                    sendInvite(id, invitee.email, invitee.name).then(toast.show);
                  }}
                >
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 6 }}>
                    <input className="f" placeholder="Name" aria-label="Name" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
                    <input className="f" placeholder="Title" aria-label="Title" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })} />
                    <input className="f" type="email" placeholder="Work email" aria-label="Work email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} style={{ gridColumn: "1 / -1" }} />
                    <select className="f" value={nu.access} aria-label="Access" onChange={(e) => setNu({ ...nu, access: e.target.value as Access })} style={{ gridColumn: "1 / -1" }}>
                      {(Object.keys(ACCESS_LABEL) as Access[]).map((a) => <option key={a} value={a}>{ACCESS_LABEL[a]}</option>)}
                    </select>
                  </div>
                  <button className="btn primary block" style={{ marginTop: 10 }} disabled={!nu.name.trim() || !nu.email.trim()}>Send invite</button>
                </form>
              </section>
              <section className="card">
                <h2 className="set-card-h">Escalation contact</h2>
                <select className="f" value={cfg.escalationEmail} aria-label="Escalation contact" onChange={(e) => set({ escalationEmail: e.target.value })} style={{ marginTop: 6 }}>
                  {cfg.users.map((u) => <option key={u.email} value={u.email}>{u.name}, {u.role}</option>)}
                </select>
                <p className="tiny muted" style={{ marginTop: 8 }}>Gets the escalation when an item is overdue past your reminder rule. If they own the item themselves, it comes to you as a check-in call instead.</p>
              </section>
              <section className="card">
                <h2 className="set-card-h">Offer approver</h2>
                <select className="f" value={cfg.offerApprover?.email ?? ""} aria-label="Offer approver" style={{ marginTop: 6 }}
                  onChange={(e) => { const u = cfg.users.find((x) => x.email === e.target.value); set({ offerApprover: u ? { name: u.name, email: u.email } : undefined }); }}>
                  <option value="">No approver: requests come straight to you</option>
                  {cfg.users.map((u) => <option key={u.email} value={u.email}>{u.name}, {u.role}</option>)}
                </select>
                <p className="tiny muted" style={{ marginTop: 8 }}>Optional. When a hiring manager requests an offer, this person approves it by email first. With no approver, the manager checks that it&apos;s approved and it comes to you. Either way, the manager approves the offer letter before you send it.</p>
              </section>
            </div>
          </div>
        )}

        {tab === "roster" && (
          <>
            <p className="small muted" style={{ margin: "4px 0 10px" }}>Everyone at {client.name} and who they report to. It powers birthdays and anniversaries, check-ins, recognition and the Team Wall. Managers only see their own team.</p>
            <RosterCard clientId={id} onToast={toast.show} />
          </>
        )}

        {tab === "docs" && (
          <>
            <p className="small muted" style={{ margin: "4px 0 10px" }}>Their handbook, policies, templates and letterhead. Claude and Ask HR follow these first, then your default templates, then best practice. Past letters uploaded as Word files can be reused as is: on a hire or task, tap Fill a past one and only the details change.</p>
            {live ? <KnowledgePanel clientId={id} onToast={toast.show} /> : <div className="card small muted">Available once the People Hub is live.</div>}
            <LevelsEditor levels={cfg.discipline?.levels} onChange={(levels) => { set({ discipline: { ...cfg.discipline, levels } }); toast.show("Levels saved"); }} />
          </>
        )}

        {emailsOpen && (
          <Sheet title="Welcome emails" onClose={() => setEmailsOpen(false)}>
            <p className="small muted" style={{ marginTop: 0 }}>What {client.name}&apos;s welcome and first-day emails say, in their colors and logo. Changes save as you type.</p>
            <OnboardingSettingsCard value={cfg.onboarding} clientName={client?.name} onChange={(onboarding) => set({ onboarding })} />
            <div className="sheet-actions"><button className="btn primary" onClick={() => setEmailsOpen(false)}>Done</button></div>
          </Sheet>
        )}
        {xpOpen && <ExperienceSetup clientId={client.id} base={(cfg.onboarding ?? {}) as Record<string, unknown>} onClose={() => setXpOpen(false)} onSaved={(onboarding) => set({ onboarding: onboarding as typeof cfg.onboarding })} />}
        {!live && <p className="demo-note">Changes save in this browser for the prototype.</p>}
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
