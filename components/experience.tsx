"use client";

// Employee experience in the portal: the setup (every question, email, nudge and playbook item is editable)
// and the Journey section on each hire's page.
import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui";
import {
  buddyAskWording, buddyIntroWording, buddyNudgeDone, buddyOn, currentStage, DEFAULT_INTRO, DEFAULT_NUDGES, DEFAULT_QUESTIONS, DEFAULT_STAGES, ExperienceSettings, fillVals, fillXp,
  HireXp, introDay, introLines, introOn, introWording, journey, linkWording, newToken, nudgeDay, nudgesFor, PAGE_TEXT, PAGE_TITLE, playbookOn, privateAnswers, questionsFor, stageDay,
  stageProgress, stagesFor, XNudge, XP_FILL_INS, XQuestion, XStage,
} from "@/lib/experience";
import { addDaysISO, Hire, shortDate } from "@/lib/hires";
import { useStore } from "@/lib/store";
import { authHeader, LIVE } from "@/lib/supabase";

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const uid = (p: string) => `${p}${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`;

async function call(body: object): Promise<{ ok: boolean; reason?: string; hire?: Hire; onboarding?: Record<string, unknown>; photo?: string }> {
  try {
    const r = await fetch("/api/experience", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify(body) });
    return await r.json();
  } catch {
    return { ok: false, reason: "network" };
  }
}

const REASON: Record<string, string> = {
  no_email: "There's no email for that person yet.",
  preview: "Preview is read-only.",
  forbidden: "Only HR can do that.",
  network: "Couldn't reach the portal. Try again.",
};
const why = (r?: string) => REASON[r ?? ""] ?? "Couldn't save. Try again.";

// ================================================================== setup

type Tab = "setup" | "questions" | "intro" | "buddy" | "playbook";

export function ExperienceSetup({ clientId, base, onClose, onSaved }: { clientId: string; base: Record<string, unknown>; onClose: () => void; onSaved: (onboarding: Record<string, unknown>) => void }) {
  const start = (base.experience ?? {}) as ExperienceSettings;
  const [x, setX] = useState<ExperienceSettings>(() => ({
    ...start,
    on: start.on ?? true,
    questions: questionsFor(start).map((q) => ({ ...q })),
    nudges: nudgesFor(start).map((n) => ({ ...n })),
    stages: stagesFor(start).map((s) => ({ ...s, items: [...s.items], asks: [...s.asks] })),
  }));
  const [tab, setTab] = useState<Tab>("setup");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (p: Partial<ExperienceSettings>) => setX((v) => ({ ...v, ...p }));

  const save = async () => {
    setBusy(true);
    setErr("");
    const r = await call({ clientId, action: "settings", experience: x });
    setBusy(false);
    if (r.ok && r.onboarding) onSaved(r.onboarding);
    else if (r.reason === "demo") onSaved({ ...base, experience: x });
    else return setErr(why(r.reason));
    onClose();
  };

  const sw = (on: boolean, title: string, sub: string, flip: () => void) => (
    <label className="rule" style={{ cursor: "pointer" }}>
      <span className="switch"><input type="checkbox" checked={on} onChange={flip} /><span /></span>
      <div><b>{title}</b><div className="tiny muted">{sub}</div></div>
    </label>
  );
  const tabs: [Tab, string][] = [["setup", "Setup"], ["questions", "Questions"], ["intro", "Company intro"], ["buddy", "Buddy"], ["playbook", "Manager playbook"]];

  return (
    <Sheet title="Employee experience" onClose={onClose}>
      <div className="xp-setup">
        <div className="pr-tabs xp-tabs" role="tablist">
          {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
        </div>

        {tab === "setup" && (
          <div className="xp-pane">
            {sw(!!x.on, "Turn on", "Personal intros, a buddy and a manager plan for each new hire. Off: onboarding works exactly as it does today.", () => set({ on: !x.on }))}
            {x.on && (
              <>
                {sw(x.introOn !== false, "Get to know you + company intro", "A few questions and a photo after the welcome email. They approve it, then it goes out on day one.", () => set({ introOn: x.introOn === false }))}
                {x.introOn !== false && (
                  <div className="xp-sub">
                    {sw(x.remind !== false, "Remind them once", "If they haven't answered in 3 days.", () => set({ remind: x.remind === false }))}
                    {sw(x.photos !== false, "Ask for a photo", "Only used if they say yes to it.", () => set({ photos: x.photos === false }))}
                    {sw(x.wall !== false, "Also post the intro on the Team Wall", "When the Team Wall is on.", () => set({ wall: x.wall === false }))}
                    <label className="f">Intro goes to
                      <select className="f" value={x.audience ?? "all"} onChange={(e) => set({ audience: e.target.value as "all" | "site" })}>
                        <option value="all">Everyone on the roster</option>
                        <option value="site">People at their location, plus their manager</option>
                      </select>
                    </label>
                  </div>
                )}
                {sw(x.buddyOn !== false, "Onboarding buddy", "You pick someone. They say yes before anything goes out.", () => set({ buddyOn: x.buddyOn === false }))}
                {sw(x.playbookOn !== false, "Manager playbook", "What to do and ask at each stage, on the hire's page and in the Monday email.", () => set({ playbookOn: x.playbookOn === false }))}
                <p className="tiny muted" style={{ marginTop: 10 }}>Check-ins on days 7, 30 and 90 are coming next.</p>
              </>
            )}
          </div>
        )}

        {tab === "questions" && (
          <div className="xp-pane">
            <label className="f">Page heading<input className="f" value={x.pageTitle ?? ""} placeholder={PAGE_TITLE} onChange={(e) => set({ pageTitle: e.target.value })} /></label>
            <label className="f">Page intro<textarea className="f" rows={3} value={x.pageText ?? ""} placeholder={PAGE_TEXT} onChange={(e) => set({ pageText: e.target.value })} /></label>
            <p className="tiny muted">They&apos;re always asked what name they go by. Every question is optional for them.</p>
            <QuestionList list={x.questions ?? []} onChange={(questions) => set({ questions })} />
            <h4 className="xp-h">Email with the link</h4>
            <Words value={x.linkEmail} def={linkWording()} onChange={(linkEmail) => set({ linkEmail })} />
          </div>
        )}

        {tab === "intro" && (
          <div className="xp-pane">
            <p className="tiny muted">Goes out on their first day with the answers and photo they approved. You can still change it for any one person.</p>
            <label className="f">Subject<input className="f" value={x.intro?.subject ?? ""} placeholder={DEFAULT_INTRO.subject} onChange={(e) => set({ intro: { ...x.intro, subject: e.target.value } })} /></label>
            <label className="f">Opening<textarea className="f" rows={3} value={x.intro?.message ?? ""} placeholder={DEFAULT_INTRO.message} onChange={(e) => set({ intro: { ...x.intro, message: e.target.value } })} /></label>
            <p className="tiny muted">Then their approved answers, one per line.</p>
            <label className="f">Closing<textarea className="f" rows={2} value={x.intro?.closing ?? ""} placeholder={DEFAULT_INTRO.closing} onChange={(e) => set({ intro: { ...x.intro, closing: e.target.value } })} /></label>
            <FillIns />
          </div>
        )}

        {tab === "buddy" && (
          <div className="xp-pane">
            <h4 className="xp-h" style={{ marginTop: 0 }}>Asking someone to be a buddy</h4>
            <p className="tiny muted">Yes and Not right now buttons are added at the bottom.</p>
            <Words value={x.buddyAsk} def={buddyAskWording()} onChange={(buddyAsk) => set({ buddyAsk })} />
            <h4 className="xp-h">Intro to the new hire and buddy, once they say yes</h4>
            <Words value={x.buddyIntro} def={buddyIntroWording()} onChange={(buddyIntro) => set({ buddyIntro })} />
            <h4 className="xp-h">Check-ins for the buddy</h4>
            <NudgeList list={x.nudges ?? []} onChange={(nudges) => set({ nudges })} />
            <FillIns />
          </div>
        )}

        {tab === "playbook" && (
          <div className="xp-pane">
            <p className="tiny muted">Each stage has a short checklist and questions to ask. Days count from the start date.</p>
            <StageList list={x.stages ?? []} onChange={(stages) => set({ stages })} />
          </div>
        )}
      </div>
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Sheet>
  );
}

function FillIns() {
  return <p className="tiny muted" style={{ marginTop: 8 }}>Fill-ins: {XP_FILL_INS.join(" ")}</p>;
}

function Words({ value, def, onChange }: { value?: { subject?: string; message?: string }; def: { subject: string; message: string }; onChange: (v: { subject?: string; message?: string }) => void }) {
  return (
    <>
      <label className="f">Subject<input className="f" value={value?.subject ?? ""} placeholder={def.subject} onChange={(e) => onChange({ ...value, subject: e.target.value })} /></label>
      <label className="f">Message<textarea className="f" rows={5} value={value?.message ?? ""} placeholder={def.message} onChange={(e) => onChange({ ...value, message: e.target.value })} /></label>
    </>
  );
}

function move<T>(l: T[], i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= l.length) return l;
  const n = [...l];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

function Order({ i, n, onMove, onRemove, label }: { i: number; n: number; onMove: (d: number) => void; onRemove: () => void; label: string }) {
  return (
    <span className="xp-order">
      <button className="btn ghost sm" disabled={i === 0} onClick={() => onMove(-1)} aria-label={`Move ${label} up`}>↑</button>
      <button className="btn ghost sm" disabled={i === n - 1} onClick={() => onMove(1)} aria-label={`Move ${label} down`}>↓</button>
      <button className="btn ghost sm" onClick={onRemove} aria-label={`Remove ${label}`}>×</button>
    </span>
  );
}

function QuestionList({ list, onChange }: { list: XQuestion[]; onChange: (l: XQuestion[]) => void }) {
  const up = (i: number, p: Partial<XQuestion>) => onChange(list.map((q, k) => (k === i ? { ...q, ...p } : q)));
  return (
    <div className="xp-list">
      {list.map((q, i) => (
        <div key={q.id} className="xp-item">
          <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
            <input className="f grow" value={q.q} onChange={(e) => up(i, { q: e.target.value })} aria-label={`Question ${i + 1}`} placeholder="The question" />
            <Order i={i} n={list.length} label={`question ${i + 1}`} onMove={(d) => onChange(move(list, i, d))} onRemove={() => onChange(list.filter((_, k) => k !== i))} />
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            <label className="tiny xp-check"><input type="checkbox" checked={!!q.private} onChange={(e) => up(i, { private: e.target.checked || undefined })} /> Just for the manager (never in the intro)</label>
            {!q.private && <input className="f xp-label" value={q.label ?? ""} onChange={(e) => up(i, { label: e.target.value })} placeholder="Shown in the intro as" aria-label={`Intro label for question ${i + 1}`} />}
          </div>
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn sm" onClick={() => onChange([...list, { id: uid("q"), q: "", label: "" }])}>+ Add a question</button>
        <button className="btn ghost sm" onClick={() => onChange(DEFAULT_QUESTIONS.map((q) => ({ ...q })))}>Back to the standard questions</button>
      </div>
    </div>
  );
}

const whenLabel = (d: number) => (d === 0 ? "On day one" : d < 0 ? `${-d} day${d === -1 ? "" : "s"} before they start` : `Day ${d}`);

function DaysField({ days, onChange, label }: { days: number; onChange: (n: number) => void; label: string }) {
  const before = days < 0;
  return (
    <span className="xp-days">
      <input className="f" inputMode="numeric" value={Math.abs(days)} aria-label={`${label}: days`} onChange={(e) => { const n = Math.min(365, Number(e.target.value.replace(/\D/g, "")) || 0); onChange(before ? -n : n); }} />
      <select className="f" value={before ? "before" : "after"} aria-label={`${label}: before or after the start`} onChange={(e) => onChange(e.target.value === "before" ? -Math.abs(days) : Math.abs(days))}>
        <option value="before">days before day one</option>
        <option value="after">days after the start</option>
      </select>
    </span>
  );
}

function NudgeList({ list, onChange }: { list: XNudge[]; onChange: (l: XNudge[]) => void }) {
  const up = (i: number, p: Partial<XNudge>) => onChange(list.map((n, k) => (k === i ? { ...n, ...p } : n)));
  return (
    <div className="xp-list">
      {list.map((n, i) => (
        <div key={n.id} className="xp-item">
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <DaysField days={n.days} label={`Check-in ${i + 1}`} onChange={(days) => up(i, { days })} />
            <span className="grow" />
            <Order i={i} n={list.length} label={`check-in ${i + 1}`} onMove={(d) => onChange(move(list, i, d))} onRemove={() => onChange(list.filter((_, k) => k !== i))} />
          </div>
          <textarea className="f" rows={2} value={n.text} onChange={(e) => up(i, { text: e.target.value })} aria-label={`Check-in ${i + 1} message`} style={{ marginTop: 6 }} />
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn sm" onClick={() => onChange([...list, { id: uid("n"), days: 30, text: "" }])}>+ Add a check-in</button>
        <button className="btn ghost sm" onClick={() => onChange(DEFAULT_NUDGES.map((n) => ({ ...n })))}>Back to the standard ones</button>
      </div>
    </div>
  );
}

function StageList({ list, onChange }: { list: XStage[]; onChange: (l: XStage[]) => void }) {
  const up = (i: number, p: Partial<XStage>) => onChange(list.map((s, k) => (k === i ? { ...s, ...p } : s)));
  return (
    <div className="xp-list">
      {list.map((s, i) => (
        <div key={s.id} className="xp-item">
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input className="f" style={{ flex: "1 1 160px" }} value={s.label} onChange={(e) => up(i, { label: e.target.value })} aria-label={`Stage ${i + 1} name`} placeholder="Stage name" />
            <Order i={i} n={list.length} label={`stage ${i + 1}`} onMove={(d) => onChange(move(list, i, d))} onRemove={() => onChange(list.filter((_, k) => k !== i))} />
          </div>
          <div style={{ marginTop: 6 }}><DaysField days={s.days} label={`Stage ${i + 1}`} onChange={(days) => up(i, { days })} /></div>
          <label className="f" style={{ marginTop: 6 }}>Checklist, one per line
            <textarea className="f" rows={Math.max(3, s.items.length)} value={s.items.join("\n")} onChange={(e) => up(i, { items: e.target.value.split("\n") })} />
          </label>
          <label className="f">Questions to ask, one per line
            <textarea className="f" rows={Math.max(2, s.asks.length)} value={s.asks.join("\n")} onChange={(e) => up(i, { asks: e.target.value.split("\n") })} />
          </label>
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn sm" onClick={() => onChange([...list, { id: uid("s"), label: "", days: 45, items: [], asks: [] }])}>+ Add a stage</button>
        <button className="btn ghost sm" onClick={() => onChange(DEFAULT_STAGES.map((s) => ({ ...s, items: [...s.items], asks: [...s.asks] })))}>Back to the standard playbook</button>
      </div>
    </div>
  );
}

// ================================================================== the hire's journey

export function Journey({ h, clientId, company, firstDayDaysBefore, x, hr, manager }: { h: Hire; clientId: string; company: string; firstDayDaysBefore: number; x: ExperienceSettings; hr: boolean; manager: boolean }) {
  const { updateHire, patch, hires, people, who } = useStore();
  const [photo, setPhoto] = useState<string | undefined>();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const today = todayISO();
  const xp = h.xp ?? {};

  // fresh copy on open: answers and buddy replies arrive from outside the portal
  useEffect(() => {
    if (!LIVE) return;
    let off = false;
    (async () => {
      const r = await fetch(`/api/experience?clientId=${encodeURIComponent(clientId)}&hireId=${encodeURIComponent(h.id)}`, { headers: { ...(await authHeader()) }, cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (off || !r?.ok) return;
      setPhoto(r.photo);
      if (JSON.stringify(r.xp) !== JSON.stringify(h.xp ?? {}) || (r.history?.length ?? 0) !== (h.history?.length ?? 0)) patch({ hires: hires.map((x) => (x.id === h.id ? { ...x, xp: r.xp, history: r.history } : x)) });
    })();
    return () => {
      off = true;
    };
  }, [h.id, clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Live: the server does it and hands back the hire. Demo: do it here. */
  const act = async (action: string, extra: object, demo: (xp: HireXp) => HireXp, log?: string, ok?: string) => {
    setBusy(action);
    setMsg("");
    const r = LIVE ? await call({ clientId, hireId: h.id, action, ...extra }) : { ok: false, reason: "demo" };
    setBusy("");
    if (r.ok && r.hire) {
      const fresh = r.hire;
      patch({ hires: hires.map((x) => (x.id === h.id ? { ...x, xp: fresh.xp, history: fresh.history } : x)) });
    } else if (r.reason === "demo") updateHire(h.id, (x0) => ({ xp: demo({ ...(x0.xp ?? {}) }) }), log ? `${log}${LIVE ? "" : " (demo, nothing really sent)"}` : undefined);
    else return setMsg(why(r.reason));
    if (ok) setMsg(ok);
  };

  const steps = useMemo(() => journey(h, x, firstDayDaysBefore, today), [h, x, firstDayDaysBefore, today]);
  const roster = people.filter((p) => p.clientId === clientId && p.active !== false && p.name.trim().toLowerCase() !== h.name.trim().toLowerCase());
  const v = fillVals(h, company);

  return (
    <div id="plan">
      <div className="section-head section"><h2>{hr ? `${v.preferred}'s first 90 days` : `Your plan for ${v.preferred}`}</h2></div>
      {xp.closed && hr && (
        <div className="card small" style={{ borderLeft: "3px solid var(--amber)" }}>
          Closed: nothing else sends for {v.first}. <button className="link" onClick={() => act("close", { closed: false }, (o) => ({ ...o, closed: undefined }), "Reopened the employee experience journey")}>Reopen</button>
        </div>
      )}
      {msg && <div className="card small section" role="status">{msg}</div>}

      {hr && (
        <div className="card">
          <ol className="xp-steps">
            {steps.map((s, i) => (
              <li key={i} className={s.done ? "done" : s.now ? "now" : ""}>
                <span className="xp-dot" aria-hidden="true">{s.done ? "✓" : ""}</span>
                <div className="grow"><b>{s.label}</b><div className="tiny muted">{s.sub}</div></div>
                <span className="tiny muted">{s.when}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {hr && introOn(x) && <IntroCard h={h} x={x} company={company} photo={photo} busy={busy} act={act} />}
      {hr && buddyOn(x) && <BuddyCard h={h} x={x} roster={roster} busy={busy} act={act} />}
      {(hr || manager) && playbookOn(x) && <PlanCard h={h} x={x} who={who} today={today} act={act} hr={hr} />}
      {(hr || manager) && privateAnswers(h, x).length > 0 && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}>From {v.preferred}, for {hr ? "the manager and HR" : "you and HR"}</h3>
          {privateAnswers(h, x).map((p) => <p key={p.q} className="small" style={{ margin: "6px 0" }}><b>{p.q}</b><br />{p.a}</p>)}
        </div>
      )}
      {hr && !xp.closed && (
        <p className="tiny muted section">
          {v.first} left early, or this isn&apos;t needed?{" "}
          <button className="link" onClick={() => act("close", { closed: true }, (o) => ({ ...o, closed: true }), "Closed the employee experience journey: nothing else will send")}>Close the journey</button>
        </p>
      )}
    </div>
  );
}

type Act = (action: string, extra: object, demo: (xp: HireXp) => HireXp, log?: string, ok?: string) => Promise<void>;

function IntroCard({ h, x, company, photo, busy, act }: { h: Hire; x: ExperienceSettings; company: string; photo?: string; busy: string; act: Act }) {
  const xp = h.xp ?? {};
  const v = fillVals(h, company);
  const w = introWording(x, xp);
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState({ subject: "", message: "", closing: "" });
  const [copied, setCopied] = useState(false);
  const lines = introLines(h, x);
  const sent = !!xp.intro?.sentAt;
  const audience = xp.intro?.audience ?? x.audience ?? "all";
  const wall = xp.intro?.wall ?? x.wall ?? true;
  const day = introDay(h);
  const link = xp.token && typeof window !== "undefined" ? `${window.location.origin}/welcome/${xp.token}` : "";
  const introSave = (p: Record<string, unknown>, log: string) => act("intro", { intro: { ...xp.intro, ...p } }, (o) => ({ ...o, intro: { ...o.intro, ...p } as HireXp["intro"] }), log);

  return (
    <div className="card section">
      <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h3 className="grow" style={{ margin: 0 }}>Get to know you and company intro</h3>
        <span className={`pill ${sent ? "green" : xp.approvedAt ? "green" : xp.submittedAt ? "amber" : ""}`}>{sent ? "Sent" : xp.intro?.cancelled ? "Not sending" : xp.approvedAt ? `Approved by ${v.preferred}` : xp.submittedAt ? "Answered, not approved yet" : xp.linkSentAt ? "Link sent" : "Not started"}</span>
      </div>

      {!xp.submittedAt && (
        <div className="row small" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <span className="grow muted">{xp.linkSentAt ? `Link sent ${shortDate(xp.linkSentAt.slice(0, 10))}${xp.remindedAt ? ", reminded" : ""}.` : h.emails?.welcome ? "The link goes out with tomorrow morning's emails." : "The link goes out the day after the welcome email."}</span>
          <button className="btn sm" disabled={!!busy || !h.personalEmail} onClick={() => act("sendLink", {}, (o) => ({ ...o, token: o.token || newToken(), linkSentAt: new Date().toISOString() }), `Get-to-know-you link sent to ${h.personalEmail}`, "Link sent")}>{xp.linkSentAt ? "Send it again" : "Send it now"}</button>
          {link && <button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>}
        </div>
      )}

      {xp.submittedAt && (
        <>
          <div className="xp-intro">
            <div className="row" style={{ gap: 12, alignItems: "center", justifyContent: "flex-start" }}>
              {photo && xp.sharePhoto !== false ? <img src={photo} alt="" className="xp-av" /> : <span className="xp-av">{(v.preferred[0] ?? "") + (v.last[0] ?? "")}</span>}
              <b>{fillXp(w.subject, v)}</b>
            </div>
            <p>{fillXp(w.message, v)}</p>
            {lines.map((l) => <p key={l.label} style={{ margin: "4px 0" }}><b>{l.label}:</b> {l.text}</p>)}
            <p>{fillXp(w.closing, v)}</p>
            {!xp.approvedAt && <p className="tiny" style={{ color: "var(--amber)" }}>{v.preferred} hasn&apos;t approved this yet. It won&apos;t go out until they do.</p>}
          </div>

          {edit ? (
            <div>
              <label className="f">Subject<input className="f" value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} /></label>
              <label className="f">Opening<textarea className="f" rows={3} value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} /></label>
              <label className="f">Closing<textarea className="f" rows={2} value={d.closing} onChange={(e) => setD({ ...d, closing: e.target.value })} /></label>
              <p className="tiny muted">Their answers stay as they approved them.</p>
              <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                <button className="btn ghost sm" onClick={() => setEdit(false)}>Cancel</button>
                <button className="btn primary sm" onClick={async () => { await introSave(d, "Company intro wording changed"); setEdit(false); }}>Save</button>
              </div>
            </div>
          ) : !sent && (
            <>
              <div className="row xp-pills" style={{ marginTop: 10, justifyContent: "flex-start" }}>
                <span className="tiny muted">Send to</span>
                {(["all", "site"] as const).map((a) => <button key={a} className={`chip ${audience === a ? "on" : ""}`} aria-pressed={audience === a} onClick={() => introSave({ audience: a }, `Company intro goes to ${a === "all" ? "everyone" : "their location"}`)}>{a === "all" ? "Everyone" : "Their location"}</button>)}
              </div>
              <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10, justifyContent: "flex-start" }}>
                <label className="small row" style={{ gap: 6, alignItems: "center" }}><input type="checkbox" checked={wall} onChange={(e) => introSave({ wall: e.target.checked }, e.target.checked ? "Intro will post on the Team Wall" : "Intro won't post on the Team Wall")} /> Also on the Team Wall</label>
                <label className="small row" style={{ gap: 6, alignItems: "center" }}>Goes out
                  <input type="date" className="f" style={{ width: "auto" }} value={day} min={todayISO()} onChange={(e) => e.target.value && introSave({ on: e.target.value }, `Company intro moved to ${shortDate(e.target.value)}`)} />
                </label>
                <span className="grow" />
                <button className="btn ghost sm" onClick={() => { setD({ subject: w.subject, message: w.message, closing: w.closing }); setEdit(true); }}>Edit wording</button>
                {xp.intro?.cancelled
                  ? <button className="btn sm" onClick={() => introSave({ cancelled: false }, "Company intro will be sent after all")}>Send it after all</button>
                  : <button className="btn ghost sm" style={{ color: "var(--red)" }} onClick={() => introSave({ cancelled: true }, "Company intro won't be sent")}>Don&apos;t send</button>}
              </div>
            </>
          )}
          {xp.intro?.failed && <p className="tiny" style={{ color: "var(--red)" }}>{xp.intro.failed}</p>}
        </>
      )}
    </div>
  );
}

function BuddyCard({ h, x, roster, busy, act }: { h: Hire; x: ExperienceSettings; roster: { id: string; name: string; title: string; email?: string; location?: string }[]; busy: string; act: Act }) {
  const b = h.xp?.buddy;
  const [pick, setPick] = useState("");
  const first = (b?.name || "").split(" ")[0];
  const site = (h.location || "").trim().toLowerCase();
  const sorted = [...roster].sort((a, c) => Number((c.location || "").trim().toLowerCase() === site) - Number((a.location || "").trim().toLowerCase() === site) || a.name.localeCompare(c.name));
  const chosen = roster.find((p) => p.id === pick);
  const status = !b ? ["Not picked", "amber"] : b.status === "yes" ? ["Confirmed", "green"] : b.status === "no" ? ["Said not right now", "amber"] : ["Asked, waiting", ""];

  return (
    <div className="card section">
      <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
        <h3 className="grow" style={{ margin: 0 }}>Onboarding buddy</h3>
        <span className={`pill ${status[1]}`}>{status[0]}</span>
      </div>
      {(!b || b.status === "no") && (
        <>
          <p className="small muted">{b ? `${b.name} can't right now. ` : ""}Pick someone from the roster. They get a short ask and say yes or not right now. Nobody is assigned without saying yes.</p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select className="f grow" style={{ minWidth: 200 }} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Pick a buddy">
              <option value="">Choose someone…</option>
              {sorted.map((p) => <option key={p.id} value={p.id} disabled={!p.email}>{p.name}{p.title ? `, ${p.title}` : ""}{p.email ? "" : " (no email)"}</option>)}
            </select>
            <button className="btn primary sm" disabled={!chosen || !!busy} onClick={() => chosen && act("askBuddy", { personId: chosen.id }, (o) => ({ ...o, buddy: { personId: chosen.id, name: chosen.name, email: chosen.email || "", token: newToken(), status: "asked", askedAt: new Date().toISOString() } }), `Asked ${chosen.name} to be the onboarding buddy`, `Asked ${chosen.name.split(" ")[0]}`)}>
              {chosen ? `Ask ${chosen.name.split(" ")[0]}` : "Ask"}
            </button>
          </div>
        </>
      )}
      {b?.status === "asked" && (
        <div className="row small" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <span className="grow">Asked {b.name} on {shortDate(b.askedAt.slice(0, 10))}. Once they say yes, {fillVals(h, "").preferred} and {first} both get an intro.</span>
          <button className="btn sm" disabled={!!busy} onClick={() => act("buddyYes", {}, (o) => ({ ...o, buddy: { ...o.buddy!, status: "yes", answeredAt: new Date().toISOString(), introSentAt: new Date().toISOString() } }), `${b.name} said yes to being the onboarding buddy`)}>They said yes</button>
          <button className="btn ghost sm" disabled={!!busy} onClick={() => act("clearBuddy", {}, (o) => ({ ...o, buddy: undefined }), `Took ${b.name} off as buddy`)}>Pick someone else</button>
        </div>
      )}
      {b?.status === "yes" && (
        <>
          <div className="xp-buddy">
            <div className="grow"><b>{b.name}</b><div className="tiny muted">Said yes{b.answeredAt ? ` ${shortDate(b.answeredAt.slice(0, 10))}` : ""}{b.introSentAt ? " · intro sent to both" : ""}</div></div>
            <button className="btn ghost sm" onClick={() => act("clearBuddy", {}, (o) => ({ ...o, buddy: undefined }), `Took ${b.name} off as buddy`)}>Change</button>
          </div>
          <ul className="xp-mini">
            {nudgesFor(x).map((n) => {
              const d = nudgeDay(h, n);
              const done = buddyNudgeDone(b, n.id);
              return <li key={n.id} className={done ? "done" : ""}><span>{done ? "✓" : "○"}</span> {d ? shortDate(d) : ""}: {fillXp(n.text, { ...fillVals(h, ""), buddy: b.name })}{b.log?.[n.id] && !done ? " (sent)" : ""}</li>;
            })}
          </ul>
          {b.note && <p className="small" style={{ margin: "8px 0 0" }}><b>Note from {first}:</b> {b.note}</p>}
        </>
      )}
    </div>
  );
}

function PlanCard({ h, x, who, today, act, hr }: { h: Hire; x: ExperienceSettings; who: string; today: string; act: Act; hr: boolean }) {
  const stages = stagesFor(x);
  const [tab, setTab] = useState(() => currentStage(h, x, addDaysISO(today, 6)).id);
  const cur = stages.find((s) => s.id === tab) ?? stages[0];
  const v = fillVals(h, "");
  const tick = (k: string, on: boolean, text: string) => act("plan", { key: k, on }, (o) => { const plan = { ...(o.plan ?? {}) }; if (on) plan[k] = new Date().toISOString(); else delete plan[k]; return { ...o, plan }; }, on ? `Playbook: ${text}` : undefined);
  void who;
  if (!cur) return null;
  return (
    <div className="card section">
      <h3 style={{ marginTop: 0 }}>{hr ? `${h.managerName ? h.managerName.split(" ")[0] + "'s" : "Manager"} playbook` : "Your playbook"}</h3>
      <div className="xp-stages" role="tablist">
        {stages.map((s) => {
          const p = stageProgress(h, s);
          const d = stageDay(h, s);
          return (
            <button key={s.id} role="tab" aria-selected={s.id === cur.id} className={s.id === cur.id ? "on" : ""} onClick={() => setTab(s.id)}>
              <b>{s.label}</b><span>{d ? shortDate(d) : ""} · {p.done}/{p.total}</span>
            </button>
          );
        })}
      </div>
      <div className="xp-plan">
        <div className="xp-checks">
          {cur.items.map((it, i) => {
            const k = `${cur.id}:${i}`;
            const on = !!h.xp?.plan?.[k];
            return (
              <label key={k} className={`xp-check-row ${on ? "done" : ""}`}>
                <input type="checkbox" checked={on} onChange={() => tick(k, !on, fillXp(it, { ...v, buddy: h.xp?.buddy?.name || "" }))} />
                <span>{fillXp(it, { ...v, buddy: h.xp?.buddy?.name || "" })}</span>
              </label>
            );
          })}
        </div>
        {cur.asks.length > 0 && (
          <div className="xp-asks">
            <b>Questions to ask</b>
            <ul>{cur.asks.map((q) => <li key={q}>{fillXp(q, { ...v, buddy: h.xp?.buddy?.name || "" })}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}
