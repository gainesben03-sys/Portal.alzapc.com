"use client";

// Alza Pulse screens: overview, surveys, library and builder, a survey (draft, open or closed), insights and the action plan.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { downloadDocx } from "@/lib/docx";
import { addDays } from "@/lib/perform";
import {
  AGREE, fmtDay, KIND_LABEL, MIN_GROUP, PAction, PKind, PQ, rate, recommend, Summary, Survey, surveyLink, TEMPLATES, today,
} from "@/lib/pulse";
import { pulseApi } from "@/lib/pulseclient";
import { useStore } from "@/lib/store";

type Call = (b: Record<string, unknown>) => Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ------------------------------------------------------------------ shell and data
export function usePulse() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, config, people, viewer, me, hires } = useStore();
  const client = getClient(clientId);
  const cfg = config[clientId];
  const toast = useToast();
  const demo = useMemo(() => ({ people, me: viewer?.kind === "client" ? me?.name || "HR" : "Ben" }), [people, viewer, me]);
  const call: Call = useCallback((body) => pulseApi(clientId, body, demo), [clientId, demo]);
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [err, setErr] = useState("");
  const reload = useCallback(async () => {
    const r = await call({ action: "list" });
    if (r.ok) setSurveys(r.surveys as Survey[]);
    else setErr(r.reason === "setup" ? "setup" : r.reason === "off" ? "off" : r.reason === "forbidden" ? "forbidden" : "load");
  }, [call]);
  useEffect(() => { if (ok && cfg?.modules.pulse) reload(); }, [ok, cfg?.modules.pulse]); // eslint-disable-line react-hooks/exhaustive-deps
  const canUse = viewer?.kind === "advisor" || me?.access === "exec";
  const newHires30 = hires.filter((h) => h.clientId === clientId && !h.outcome && h.startDate && Math.abs((Date.parse(today()) - Date.parse(h.startDate)) / 864e5 - 30) <= 7).length;

  const shell = (body: ReactNode) =>
    !ok || !client ? null : (
      <div style={{ ["--accent" as string]: client.accent }}>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap wide">
          {!cfg?.modules.pulse ? <div className="card section small muted">Pulse isn&apos;t turned on for {client.name}.</div>
            : !canUse || err === "forbidden" ? <div className="card section small muted">Pulse is for executives and HR.</div>
            : err === "setup" ? <div className="card section small muted">Almost ready. The database update for Pulse (supabase/022_pulse.sql) hasn&apos;t been run yet. Run it once in Supabase, then refresh.</div>
            : err ? <div className="card section small muted">Couldn&apos;t load Pulse. Try again in a moment.</div>
            : !surveys ? <p className="small muted">Loading…</p>
            : body}
        </main>
        <Toast msg={toast.msg} onDone={toast.clear} />
      </div>
    );
  return { clientId, client, cfg, call, surveys, setSurveys, reload, toast, shell, newHires30, base: `/c/${clientId}/pulse` };
}

const STATUS: Record<Survey["status"], [string, string]> = { draft: ["Draft", ""], open: ["Open", "green"], closed: ["Closed", "blue"] };
const Status = ({ s }: { s: Survey }) => <span className={`pf-chip ${STATUS[s.status][1]}`}>{STATUS[s.status][0]}</span>;
const PRI: Record<PAction["priority"], [string, string]> = { high: ["High", "red"], med: ["Medium", "gold"], low: ["Low", ""] };
const ACT: Record<PAction["status"], [string, string]> = { planned: ["Planned", ""], progress: ["In progress", "gold"], done: ["Done", "green"] };
const delta = (now?: number, was?: number) => (now === undefined || was === undefined ? null : now - was);
const Delta = ({ d, suffix = "" }: { d: number | null; suffix?: string }) => (d === null ? null : <span className={`pl-delta ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>{d > 0 ? "+" : ""}{d}{suffix}</span>);

function Ring({ pct, size = 104 }: { pct: number; size?: number }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct} percent responded`} className="pl-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth="11" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(Math.min(100, pct) / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="54%" textAnchor="middle" fontSize={size / 5} fontWeight="700" fill="currentColor">{pct}%</text>
    </svg>
  );
}

function Head({ title, sub, right, back }: { title: string; sub?: string; right?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="pl-head">
      <div className="grow">
        {back && <Link href={back.href} className="tiny" style={{ fontWeight: 600 }}>{back.label}</Link>}
        <h1 className="pl-title">{title}</h1>
        {sub && <p className="small muted" style={{ margin: "4px 0 0" }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// ------------------------------------------------------------------ overview
export function Overview() {
  const P = usePulse();
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const list = P.surveys ?? [];
  const recos = recommend(list, { newHires30: P.newHires30 });
  const open = list.filter((s) => s.status === "open");
  const latest = list.filter((s) => s.status === "closed" && s.analysis).sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""))[0];
  const acts = list.flatMap((s) => s.actions.map((a) => ({ a, s }))).filter(({ a }) => a.status !== "done").slice(0, 5);
  const start = async (templateId: string) => {
    setBusy(templateId);
    const r = await P.call({ action: "create", templateId });
    setBusy("");
    if (r.ok) router.push(`${P.base}/survey/${r.survey.id}`);
    else P.toast.show("Couldn't start that survey. Try again.");
  };
  return P.shell(
    <>
      <Head title="Pulse" sub="What your people are telling you, and what to do about it." right={<Link href={`${P.base}/library`} className="btn primary">New survey</Link>} />
      {recos.length > 0 && (
        <div className="card section pl-recos">
          <div className="row" style={{ gap: 10, alignItems: "center" }}><span className="pl-tag gold">Alza recommends</span><span className="tiny muted">Based on your calendar and what&apos;s happening in the portal</span></div>
          <div className="pl-grid3">
            {recos.map((r) => (
              <div key={r.id} className="pl-reco">
                <b>{r.title}</b>
                <span className="small muted">{r.why}</span>
                <button className="linklike small" disabled={!!busy} onClick={() => start(r.templateId)}>{busy === r.templateId ? "Starting…" : r.cta}</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="pl-two">
        <div className="card section">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><b>Open now</b>{open[0] && <span className="pf-chip green">{open[0].privacy === "anonymous" ? "Anonymous" : "Confidential"}</span>}</div>
          {!open.length ? <p className="small muted">Nothing open. <Link href={`${P.base}/library`}>Start a survey</Link></p> : open.map((s) => (
            <Link key={s.id} href={`${P.base}/survey/${s.id}`} className="pl-open">
              <Ring pct={rate(s)} />
              <div className="grow">
                <b className="pl-open-t">{s.title}</b>
                <div className="small muted">{s.responded} of {s.invited} responded · closes {fmtDay(s.closesAt)}</div>
                <div className="tiny muted" style={{ marginTop: 4 }}>{s.privacy === "anonymous" ? "Reminders go to people who haven't answered. You never see who." : "Confidential: HR sees individual answers."}</div>
              </div>
            </Link>
          ))}
        </div>
        <div className="card section">
          <b>Action plan</b>
          {!acts.length ? <p className="small muted">No open actions. They come from survey results.</p> : (
            <div className="pl-mini">
              {acts.map(({ a, s }) => (
                <div key={a.id} className="pl-mini-row"><span className="grow">{a.action}<span className="tiny muted"> · {s.title}</span></span><span className={`pf-chip ${ACT[a.status][1]}`}>{ACT[a.status][0]}</span></div>
              ))}
            </div>
          )}
          <Link href={`${P.base}/actions`} className="tiny" style={{ fontWeight: 600 }}>Open action plan</Link>
        </div>
      </div>
      {latest?.analysis && (
        <div className="card section pl-latest">
          <span className="pl-tag teal">Latest insight</span>
          <div className="grow">
            <b>{latest.analysis.headline}</b>
            <div className="small muted" style={{ marginTop: 4 }}>{latest.analysis.consider}</div>
          </div>
          <Link href={`${P.base}/survey/${latest.id}`} className="small" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>See results</Link>
        </div>
      )}
      {!list.length && <div className="card section small muted">No surveys yet. Start with the Annual Culture &amp; Engagement survey: it&apos;s the baseline everything else is compared to.</div>}
    </>
  );
}

// ------------------------------------------------------------------ surveys list
export function SurveysList() {
  const P = usePulse();
  const list = P.surveys ?? [];
  return P.shell(
    <>
      <Head title="Surveys" sub="Every survey you've run, newest first." right={<Link href={`${P.base}/library`} className="btn primary">New survey</Link>} />
      <div className="card section">
        {!list.length ? <p className="small muted">No surveys yet.</p> : (
          <div className="pl-table">
            <div className="pl-tr pl-th"><span>Survey</span><span>Status</span><span>Responses</span><span>Dates</span></div>
            {list.map((s) => (
              <Link key={s.id} href={`${P.base}/survey/${s.id}`} className="pl-tr">
                <span><b>{s.title}</b>{s.analysis && <span className="tiny muted"> · insight ready</span>}</span>
                <span><Status s={s} /></span>
                <span>{s.status === "draft" ? "—" : `${s.responded} of ${s.invited} (${rate(s)}%)`}</span>
                <span className="small muted">{s.status === "draft" ? `Created ${fmtDay(s.createdAt)}` : s.status === "open" ? `Closes ${fmtDay(s.closesAt)}` : `Closed ${fmtDay(s.closedAt)}`}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ library and AI builder
export function Library() {
  const P = usePulse();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState("");
  const last = (tid: string) => (P.surveys ?? []).filter((s) => s.templateId === tid && s.launchedAt).map((s) => s.launchedAt as string).sort().pop();
  const start = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    const r = await P.call({ action: "create", ...body });
    setBusy("");
    if (r.ok) router.push(`${P.base}/survey/${r.survey.id}`);
    else P.toast.show("Couldn't start that survey. Try again.");
  };
  const build = async () => {
    setBusy("ai");
    const r = await P.call({ action: "ai", op: "build", prompt });
    if (!r.ok) { setBusy(""); return P.toast.show(r.reason === "limit" ? "That's the AI limit for today. Try tomorrow, or start from the library." : "Alza couldn't write that one. Try rewording, or start from the library."); }
    await start({ survey: r.draft }, "ai");
  };
  return P.shell(
    <>
      <Head title="New survey" back={{ href: P.base, label: "Pulse" }} />
      <div className="card section">
        <b>Tell Alza what you want to know</b>
        <label htmlFor="pl-ask" className="small muted" style={{ display: "block", margin: "4px 0 8px" }}>Plain words are fine. Alza writes a balanced survey you can edit before anything goes out.</label>
        <textarea id="pl-ask" className="f" rows={3} value={prompt} maxLength={1500} onChange={(e) => setPrompt(e.target.value)} placeholder="We're thinking about bringing the office team back 3 days a week. I want to understand concerns before we decide." />
        <div className="row" style={{ gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <button className="btn primary sm" disabled={prompt.trim().length < 10 || !!busy} onClick={build}>{busy === "ai" ? "Writing your survey…" : "Build my survey"}</button>
          <span className="tiny muted">Usually 8 to 12 questions, about 3 minutes for employees</span>
        </div>
      </div>
      <div className="section-head" style={{ marginTop: 22 }}><b>Or start from the library</b><span className="tiny muted"> · written by HR, edit any question</span></div>
      <div className="pl-lib">
        {TEMPLATES.map((t) => {
          const l = last(t.id);
          return (
            <button key={t.id} className="pl-tpl" disabled={!!busy} onClick={() => start({ templateId: t.id }, t.id)}>
              <span className="row" style={{ justifyContent: "space-between", gap: 8 }}><b>{t.title}</b>{t.tag && <span className="pl-tag teal">{t.tag}</span>}</span>
              <span className="small muted">{t.blurb}</span>
              <span className="tiny muted">{t.questions.length} questions · about {t.minutes} min{l ? ` · last sent ${fmtDay(l)}` : ""}</span>
              {busy === t.id && <span className="tiny">Starting…</span>}
            </button>
          );
        })}
        <button className="pl-tpl" disabled={!!busy} onClick={() => start({ survey: { title: "New survey", questions: [] } }, "blank")}>
          <b>Start from scratch</b>
          <span className="small muted">Write your own questions.</span>
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ one survey
export function SurveyPage() {
  const P = usePulse();
  const { id } = useParams<{ id: string }>();
  const s = (P.surveys ?? []).find((x) => x.id === id);
  const set = (n: Survey) => P.setSurveys((l) => (l ?? []).map((x) => (x.id === n.id ? n : x)));
  if (P.surveys && !s) return P.shell(<div className="card section small muted">That survey isn&apos;t here anymore. <Link href={`${P.base}/surveys`}>All surveys</Link></div>);
  if (!s) return P.shell(null);
  return P.shell(s.status === "draft" ? <Editor P={P} s={s} set={set} /> : <Live P={P} s={s} set={set} />);
}

type PP = ReturnType<typeof usePulse>;

function Editor({ P, s, set }: { P: PP; s: Survey; set: (s: Survey) => void }) {
  const router = useRouter();
  const { people } = useStore();
  const roster = people.filter((p) => p.clientId === P.clientId && p.active !== false);
  const [v, setV] = useState<Survey>(s);
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<{ id: string; issue: string; suggestion: string }[] | null>(null);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pick, setPick] = useState(false);
  const upd = (p: Partial<Survey>) => { setV((x) => ({ ...x, ...p })); setDirty(true); };
  const setQ = (i: number, p: Partial<PQ>) => upd({ questions: v.questions.map((q, j) => (j === i ? { ...q, ...p, es: undefined } : q)) });
  const move = (i: number, d: number) => { const l = [...v.questions]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); upd({ questions: l }); };
  const save = async (quiet = false) => {
    setBusy("save");
    const r = await P.call({ action: "save", survey: v });
    setBusy("");
    if (!r.ok) { P.toast.show("Couldn't save. Try again."); return null; }
    set(r.survey); setV(r.survey); setDirty(false);
    if (!quiet) P.toast.show("Saved");
    return r.survey as Survey;
  };
  const review = async () => {
    setBusy("bias");
    const r = await P.call({ action: "ai", op: "bias", questions: v.questions });
    setBusy("");
    if (!r.ok) return P.toast.show("The review didn't come back. Try again.");
    setIssues(r.issues);
    if (!r.issues.length) P.toast.show("Looks balanced. No problems found.");
  };
  const launch = async () => {
    const saved = dirty ? await save(true) : v;
    if (!saved) return;
    setBusy("launch");
    const r = await P.call({ action: "launch", id: saved.id });
    setBusy("");
    setConfirm(false);
    if (!r.ok) return P.toast.show(r.reason === "close_date" ? "Pick a close date in the future." : r.reason === "no_questions" ? "Add at least one question." : "Couldn't launch. Try again.");
    set(r.survey);
    P.toast.show(`Sent to ${r.sent} ${r.sent === 1 ? "person" : "people"}${r.noEmail ? `. ${r.noEmail} without an email can use the shared link or QR code.` : ""}`);
  };
  const del = async () => {
    const r = await P.call({ action: "delete", id: v.id });
    if (r.ok) { P.setSurveys((l) => (l ?? []).filter((x) => x.id !== v.id)); router.push(`${P.base}/surveys`); }
  };
  const audienceN = v.audience.all ? roster.length : (v.audience.personIds ?? []).length;
  const small = audienceN < 10;
  const issueFor = (qid: string) => issues?.filter((x) => x.id === qid) ?? [];
  return (
    <>
      <Head title={v.title || "New survey"} back={{ href: `${P.base}/surveys`, label: "Surveys" }} sub="Draft. Nothing goes out until you launch." right={
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn ghost sm" onClick={() => save()} disabled={!dirty || !!busy}>{busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}</button>
          <a className="btn ghost sm" href={`/s/${v.openToken}?preview=1`} target="_blank" rel="noopener">Preview</a>
          <button className="btn primary sm" onClick={() => setConfirm(true)} disabled={!v.questions.length || !!busy}>Launch</button>
        </div>
      } />
      <div className="pl-edit">
        <div className="card section">
          <label className="flabel" htmlFor="pl-title">Survey name</label>
          <input id="pl-title" className="f" value={v.title} maxLength={120} onChange={(e) => upd({ title: e.target.value })} />
          <label className="flabel" htmlFor="pl-intro" style={{ marginTop: 10 }}>Note to employees</label>
          <textarea id="pl-intro" className="f" rows={2} value={v.intro} maxLength={600} onChange={(e) => upd({ intro: e.target.value })} />
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
            <b>Questions <span className="tiny muted">({v.questions.length})</span></b>
            <button className="btn ghost sm" onClick={review} disabled={!v.questions.length || !!busy}>{busy === "bias" ? "Reviewing…" : "Review for bias"}</button>
          </div>
          {issues && issues.some((x) => x.id === "length") && <div className="pl-issue" style={{ marginTop: 8 }}>{issues.find((x) => x.id === "length")?.issue} {issues.find((x) => x.id === "length")?.suggestion}</div>}
          {issues && !issues.length && <div className="pl-good">Reviewed: no leading, double-barreled or sensitive questions found.</div>}
          {v.questions.map((q, i) => (
            <div key={q.id} className={`pl-q ${issueFor(q.id).length ? "warn" : ""}`}>
              <div className="pl-q-top">
                <span className="pl-q-n">{i + 1}</span>
                <textarea className="f" rows={1} value={q.text} maxLength={300} onChange={(e) => setQ(i, { text: e.target.value })} aria-label={`Question ${i + 1}`} />
                <button className="pqe-x" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="pqe-x" aria-label="Move down" disabled={i === v.questions.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="pqe-x" aria-label="Remove question" onClick={() => upd({ questions: v.questions.filter((_, j) => j !== i) })}>✕</button>
              </div>
              {issueFor(q.id).map((x, k) => (
                <div key={k} className="pl-issue">
                  <b>{x.issue}</b> {x.suggestion && <>Try: &ldquo;{x.suggestion}&rdquo; <button className="linklike tiny" onClick={() => { setQ(i, { text: x.suggestion }); setIssues((l) => (l ?? []).filter((y) => y !== x)); }}>Use this</button></>}
                </div>
              ))}
              <div className="pl-q-opts">
                <select className="f" value={q.kind} onChange={(e) => { const kind = e.target.value as PKind; setQ(i, { kind, options: kind === "choice" || kind === "multi" ? q.options ?? ["", ""] : undefined, max: kind === "multi" ? 3 : undefined, enps: kind === "scale10" ? q.enps : false }); }} aria-label="Answer type">
                  {(Object.keys(KIND_LABEL) as PKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                <input className="f" value={q.cat ?? ""} placeholder="Area (e.g. Communication)" maxLength={40} onChange={(e) => setQ(i, { cat: e.target.value })} aria-label="Area" style={{ maxWidth: 220 }} />
                <label className="pqe-req"><input type="checkbox" checked={!!q.required} onChange={(e) => setQ(i, { required: e.target.checked })} /> Required</label>
              </div>
              {(q.kind === "choice" || q.kind === "multi") && (
                <div className="pqe-choices">
                  {(q.options ?? []).map((o, k) => (
                    <div key={k} className="pqe-choice">
                      <input className="f" value={o} placeholder={`Choice ${k + 1}`} maxLength={100} onChange={(e) => setQ(i, { options: (q.options ?? []).map((x, m) => (m === k ? e.target.value : x)) })} />
                      {(q.options ?? []).length > 2 && <button className="pqe-x" aria-label="Remove choice" onClick={() => setQ(i, { options: (q.options ?? []).filter((_, m) => m !== k) })}>✕</button>}
                    </div>
                  ))}
                  {(q.options ?? []).length < 12 && <button className="linklike tiny" onClick={() => setQ(i, { options: [...(q.options ?? []), ""] })}>+ Add a choice</button>}
                </div>
              )}
            </div>
          ))}
          <button className="btn ghost sm" style={{ marginTop: 10 }} disabled={v.questions.length >= 60} onClick={() => upd({ questions: [...v.questions, { id: `q${Date.now().toString(36)}`, text: "", kind: "agree" }] })}>+ Add a question</button>
        </div>

        <aside className="pl-side">
          <div className="card section">
            <b>Privacy</b>
            <label className="pl-radio"><input type="radio" checked={v.privacy === "anonymous"} onChange={() => upd({ privacy: "anonymous" })} /><span><b>Anonymous</b><span className="tiny muted">No names on answers. Nobody can see who said what, including HR.</span></span></label>
            <label className="pl-radio"><input type="radio" checked={v.privacy === "confidential"} onChange={() => upd({ privacy: "confidential" })} /><span><b>Confidential</b><span className="tiny muted">HR sees individual answers. Executives see combined results only.</span></span></label>
            {small && v.privacy === "anonymous" && <div className="pl-issue">With fewer than 10 people, answers are easier to guess. Results stay hidden until {MIN_GROUP} people respond.</div>}
          </div>
          <div className="card section">
            <b>Who</b>
            <label className="pl-radio"><input type="radio" checked={v.audience.all} onChange={() => upd({ audience: { all: true } })} /><span>Everyone on the roster <span className="tiny muted">({roster.length})</span></span></label>
            <label className="pl-radio"><input type="radio" checked={!v.audience.all} onChange={() => { upd({ audience: { all: false, personIds: v.audience.personIds ?? [] } }); setPick(true); }} /><span>Pick people {!v.audience.all && <span className="tiny muted">({(v.audience.personIds ?? []).length}) <button className="linklike tiny" onClick={() => setPick(true)}>Change</button></span>}</span></label>
            <p className="tiny muted" style={{ margin: "6px 0 0" }}>People without an email can use the shared link or QR code once it&apos;s open.</p>
          </div>
          <div className="card section">
            <label className="flabel" htmlFor="pl-close"><b>Closes</b></label>
            <input id="pl-close" type="date" className="f" value={v.closesAt} min={today()} onChange={(e) => upd({ closesAt: e.target.value })} />
            <p className="tiny muted" style={{ margin: "6px 0 0" }}>Reminders go out halfway through and the day before it closes.</p>
          </div>
          <button className="linklike tiny" style={{ color: "var(--red)" }} onClick={del}>Delete draft</button>
        </aside>
      </div>

      {pick && (
        <Sheet title="Who gets this survey" onClose={() => setPick(false)}>
          <PeoplePicker roster={roster} value={v.audience.personIds ?? []} onChange={(ids) => upd({ audience: { all: false, personIds: ids } })} />
          <div className="sheet-actions"><button className="btn primary sm" onClick={() => setPick(false)}>Done</button></div>
        </Sheet>
      )}
      {confirm && (
        <Sheet title="Launch this survey?" onClose={() => setConfirm(false)}>
          <p className="small">&ldquo;{v.title}&rdquo; goes to <b>{audienceN} {audienceN === 1 ? "person" : "people"}</b> by email, closing <b>{fmtDay(v.closesAt)}</b>.</p>
          <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.6 }}>
            <li>{v.privacy === "anonymous" ? "Anonymous: answers carry no names." : "Confidential: HR sees individual answers."}</li>
            <li>Written in English. Alza adds Spanish automatically.</li>
            <li>Questions lock once it&apos;s open, so results stay comparable.</li>
            <li>You&apos;ll get a shared link and QR code for anyone without email.</li>
          </ul>
          <div className="sheet-actions">
            <button className="btn ghost sm" onClick={() => setConfirm(false)}>Not yet</button>
            <button className="btn primary sm" onClick={launch} disabled={!!busy || !audienceN}>{busy === "launch" ? "Sending…" : "Launch and send"}</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function PeoplePicker({ roster, value, onChange }: { roster: { id: string; name: string; title?: string; department?: string }[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const list = roster.filter((p) => !q || `${p.name} ${p.title ?? ""} ${p.department ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const all = list.length > 0 && list.every((p) => value.includes(p.id));
  return (
    <>
      <input className="f" placeholder="Search name, title or department" value={q} onChange={(e) => setQ(e.target.value)} />
      <label className="pl-pick-row" style={{ fontWeight: 600 }}><input type="checkbox" checked={all} onChange={() => onChange(all ? value.filter((id) => !list.some((p) => p.id === id)) : [...new Set([...value, ...list.map((p) => p.id)])])} /> Select all{q ? " shown" : ""}</label>
      <div className="pl-pick">
        {list.map((p) => (
          <label key={p.id} className="pl-pick-row"><input type="checkbox" checked={value.includes(p.id)} onChange={() => onChange(value.includes(p.id) ? value.filter((x) => x !== p.id) : [...value, p.id])} /> <span className="grow">{p.name}</span><span className="tiny muted">{p.title}</span></label>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ open or closed survey
function Live({ P, s, set }: { P: PP; s: Survey; set: (s: Survey) => void }) {
  const [sum, setSum] = useState<Summary | null>(null);
  const [busy, setBusy] = useState("");
  const [share, setShare] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [extend, setExtend] = useState(false);
  const loadResults = useCallback(async () => {
    const r = await P.call({ action: "results", id: s.id });
    if (r.ok) setSum(r.summary);
  }, [P, s.id]);
  useEffect(() => { loadResults(); }, [s.id, s.status, s.responded]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (action: string, extra: Record<string, unknown> = {}, ok?: string) => {
    setBusy(action);
    const r = await P.call({ action, id: s.id, ...extra });
    setBusy("");
    if (!r.ok) { P.toast.show(r.reason === "too_few" ? `Insight needs at least ${MIN_GROUP} responses.` : r.reason === "limit" ? "That's the AI limit for today." : "That didn't work. Try again."); return null; }
    if (r.survey) set(r.survey);
    if (ok) P.toast.show(ok);
    return r;
  };
  const report = async () => {
    if (!sum) return;
    const { reportText } = await import("@/lib/pulsereport");
    await downloadDocx(`${s.title} Executive Report`, reportText(s, sum, P.client?.name ?? ""), P.clientId, `${s.title} Executive Report`);
  };
  const writeMsg = async () => {
    if (s.message) return setMsg(s.message);
    setBusy("msg");
    const r = await P.call({ action: "ai", op: "message", id: s.id });
    setBusy("");
    if (r.ok) setMsg(r.message);
    else P.toast.show("Couldn't draft the message. Try again.");
  };
  const open = s.status === "open";
  return (
    <>
      <Head
        title={s.title}
        back={{ href: `${P.base}/surveys`, label: "Surveys" }}
        sub={`${open ? `Open · closes ${fmtDay(s.closesAt)}` : `Closed ${fmtDay(s.closedAt)}`} · ${s.responded} of ${s.invited} responded (${rate(s)}%) · ${s.privacy}${sum?.prev ? ` · compared with ${sum.prev.title}` : ""}`}
        right={open ? (
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn ghost sm" onClick={() => setShare(true)}>Share link / QR</button>
            <button className="btn ghost sm" disabled={!!busy || s.responded >= s.invited} onClick={() => act("remind", {}, "Reminder sent to everyone who hasn't answered")}>{busy === "remind" ? "Sending…" : "Send reminder"}</button>
            <button className="btn primary sm" disabled={!!busy} onClick={() => act("close", {}, "Survey closed")}>Close now</button>
          </div>
        ) : (
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn ghost sm" onClick={() => setExtend(true)}>Reopen</button>
            <button className="btn ghost sm" disabled={!sum || sum.hidden} onClick={report}>Executive report</button>
            <button className="btn primary sm" disabled={!!busy || !sum || sum.hidden} onClick={writeMsg}>{busy === "msg" ? "Writing…" : "Message to employees"}</button>
          </div>
        )}
      />

      {open && (
        <div className="card section pl-progress">
          <Ring pct={rate(s)} size={120} />
          <div className="grow">
            <b className="pl-open-t">{s.responded} of {s.invited} have answered</b>
            <p className="small muted" style={{ margin: "4px 0 0" }}>{s.privacy === "anonymous" ? "You'll never see who has or hasn't. Reminders go out halfway through and the day before it closes." : "Reminders go out halfway through and the day before it closes."}{s.reminded?.length ? ` Last reminder ${fmtDay(s.reminded[s.reminded.length - 1])}.` : ""}</p>
            <p className="tiny muted" style={{ margin: "6px 0 0" }}>{sum && !sum.hidden ? "Early results are below. Insight and the report open once it closes." : `Results show once ${MIN_GROUP} people answer.`}</p>
          </div>
        </div>
      )}

      {sum && sum.hidden && !open && <div className="card section small muted">Only {sum.n} {sum.n === 1 ? "person" : "people"} answered. Results stay hidden under {MIN_GROUP} to protect anonymity.</div>}

      {sum && !sum.hidden && (
        <>
          <Scores sum={sum} />
          {!open && <Insight P={P} s={s} busy={busy === "analyze"} onRun={() => act("analyze", {}, "Insight ready")} />}
          <Areas sum={sum} />
          {s.analysis && s.analysis.themes.length > 0 && <Themes s={s} />}
          <Questions sum={sum} />
          {!open && <ActionPlan P={P} s={s} set={set} />}
        </>
      )}

      {share && <ShareSheet s={s} onClose={() => setShare(false)} />}
      {extend && (
        <Sheet title="Reopen this survey" onClose={() => setExtend(false)}>
          <ReopenForm onSave={async (d) => { if (await act("reopen", { closesAt: d }, "Reopened")) setExtend(false); }} />
        </Sheet>
      )}
      {msg !== null && (
        <Sheet title="Message to employees" onClose={() => setMsg(null)}>
          <p className="tiny muted" style={{ marginTop: -4 }}>&ldquo;You said, we did.&rdquo; Edit it, then send it from your email or post it to the Team Wall.</p>
          <textarea className="f" rows={14} value={msg} onChange={(e) => setMsg(e.target.value)} />
          <div className="sheet-actions">
            <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(msg).then(() => P.toast.show("Copied"))}>Copy</button>
            <button className="btn primary sm" onClick={async () => { await act("message", { message: msg }, "Saved"); setMsg(null); }}>Save</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function ReopenForm({ onSave }: { onSave: (d: string) => void }) {
  const [d, setD] = useState(addDays(today(), 3));
  return (
    <>
      <label className="flabel" htmlFor="pl-re">New close date</label>
      <input id="pl-re" type="date" className="f" value={d} min={today()} onChange={(e) => setD(e.target.value)} />
      <div className="sheet-actions"><button className="btn primary sm" onClick={() => onSave(d)}>Reopen</button></div>
    </>
  );
}

function ShareSheet({ s, onClose }: { s: Survey; onClose: () => void }) {
  const url = typeof window !== "undefined" ? surveyLink(window.location.origin, s.openToken) : "";
  const [qr, setQr] = useState("");
  useEffect(() => { if (url) QRCode.toDataURL(url, { margin: 1, width: 600 }).then(setQr); }, [url]);
  return (
    <Sheet title="Share link and QR code" onClose={onClose}>
      <p className="small muted" style={{ marginTop: -4 }}>For people without a work email: post the QR code in the break room or text the link. {s.privacy === "anonymous" ? "Answers through the shared link are anonymous too." : "Answers through the shared link aren't tied to a name."}</p>
      <div className="pitch-url"><code>{url.replace(/^https?:\/\//, "")}</code><button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(url)}>Copy</button></div>
      {qr && <div style={{ textAlign: "center", marginTop: 12 }}><img src={qr} alt="QR code for the survey" width={220} height={220} /><div><a className="btn ghost sm" href={qr} download={`${s.title} QR.png`}>Download QR code</a></div></div>}
    </Sheet>
  );
}

function Scores({ sum }: { sum: Summary }) {
  const low = [...sum.cats].sort((a, b) => a.fav - b.fav)[0];
  const top = sum.cats[0];
  const tiles: { label: string; value: string; d: number | null }[] = [];
  if (sum.engagement !== undefined) tiles.push({ label: "Engagement", value: `${sum.engagement}%`, d: delta(sum.engagement, sum.prev?.engagement) });
  if (sum.enps !== undefined) tiles.push({ label: "eNPS", value: `${sum.enps > 0 ? "+" : ""}${sum.enps}`, d: delta(sum.enps, sum.prev?.enps) });
  if (top && !tiles.some((t) => t.label === top.name)) tiles.push({ label: `Strongest: ${top.name}`, value: `${top.fav}%`, d: delta(top.fav, top.prev) });
  if (low && low !== top) tiles.push({ label: `Lowest: ${low.name}`, value: `${low.fav}%`, d: delta(low.fav, low.prev) });
  tiles.push({ label: "Responses", value: String(sum.n), d: null });
  return (
    <div className="pl-tiles">
      {tiles.slice(0, 4).map((t) => (
        <div key={t.label} className="card pl-tile"><span className="small muted">{t.label}</span><b>{t.value}</b>{t.d !== null ? <Delta d={t.d} suffix=" vs last time" /> : <span className="tiny muted">{t.label === "Responses" ? "" : "% favorable"}</span>}</div>
      ))}
    </div>
  );
}

function Insight({ P, s, busy, onRun }: { P: PP; s: Survey; busy: boolean; onRun: () => void }) {
  const a = s.analysis;
  if (!a)
    return (
      <div className="card section pl-insight-empty">
        <div className="grow"><span className="pl-tag teal">Alza insight</span><p className="small" style={{ margin: "8px 0 0" }}>Turn the numbers and comments into what matters, what&apos;s behind it, and what to do next.</p></div>
        <button className="btn primary sm" onClick={onRun} disabled={busy}>{busy ? "Reading every answer…" : "Generate Alza insight"}</button>
      </div>
    );
  return (
    <div className="card section">
      <div className="row" style={{ gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span className="pl-tag teal">Alza insight</span>
        <b className="pl-headline grow">{a.headline}</b>
        <button className="linklike tiny" onClick={onRun} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
      </div>
      <div className="pl-four">
        <div><span className="pl-k">What the data says</span><p>{a.says}</p></div>
        <div><span className="pl-k">What comments suggest</span><p>{a.suggests}</p></div>
        <div><span className="pl-k">What it can&apos;t conclude</span><p>{a.cantConclude}</p></div>
        <div className="hi"><span className="pl-k">Consider</span><p>{a.consider}</p></div>
      </div>
      <div className="pl-two" style={{ marginTop: 14 }}>
        <div><b className="small">Strengths</b><ul className="pl-ul">{a.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div><b className="small">Needs attention</b><ul className="pl-ul">{a.concerns.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </div>
      {a.quickWins.length > 0 && <div className="pl-quick"><b className="small">Quick wins people suggested</b><span className="small">{a.quickWins.join(" · ")}</span></div>}
      {a.questions.length > 0 && <details className="pl-details"><summary className="small">Questions for your leadership meeting</summary><ol className="pl-ul">{a.questions.map((x, i) => <li key={i}>{x}</li>)}</ol></details>}
      <p className="tiny muted" style={{ margin: "10px 0 0" }}>Written by AI from {a.n} answers on {fmtDay(a.at)}. It works only from what people said, never guesses who said it, and never recommends action about an individual.</p>
      <span style={{ display: "none" }}>{P.clientId}</span>
    </div>
  );
}

function Areas({ sum }: { sum: Summary }) {
  if (!sum.cats.length) return null;
  return (
    <div className="card section">
      <b>By area</b> <span className="tiny muted">· % who agree or strongly agree</span>
      <div className="pl-bars">
        {sum.cats.map((c) => (
          <div key={c.name} className="pl-bar-row">
            <span className="pl-bar-l">{c.name}</span>
            <span className="pl-bar"><span style={{ width: `${c.fav}%` }} className={c.fav >= 70 ? "good" : c.fav < 55 ? "low" : ""} />{c.prev !== undefined && <i style={{ left: `${c.prev}%` }} title={`Last time ${c.prev}%`} />}</span>
            <span className="pl-bar-v">{c.fav}%</span>
            <Delta d={delta(c.fav, c.prev)} />
          </div>
        ))}
      </div>
      {sum.cats.some((c) => c.prev !== undefined) && <p className="tiny muted" style={{ margin: "6px 0 0" }}>The thin line marks last time.</p>}
    </div>
  );
}

function Themes({ s }: { s: Survey }) {
  const a = s.analysis!;
  const [open, setOpen] = useState(a.themes[0]?.name ?? "");
  const t = a.themes.find((x) => x.name === open);
  const tone = { positive: "green", mixed: "gold", negative: "red" } as const;
  return (
    <div className="card section">
      <b>What people wrote</b> <span className="tiny muted">· {a.themes.reduce((n, x) => n + x.count, 0)} comments in {a.themes.length} themes</span>
      <div className="pl-themes">
        <div className="pl-theme-list">
          {a.themes.map((x) => (
            <button key={x.name} className={`pl-theme ${open === x.name ? "on" : ""}`} onClick={() => setOpen(x.name)}>
              <span className="grow">{x.name}</span><span className="tiny muted">{x.count}</span><span className={`pf-chip ${tone[x.sentiment]}`}>{x.sentiment}</span>
            </button>
          ))}
        </div>
        {t && (
          <div className="pl-theme-body">
            <b>{t.name}</b>
            <p className="small">{t.summary}</p>
            {t.quotes.map((q, i) => <blockquote key={i} className="pl-quote">&ldquo;{q}&rdquo;</blockquote>)}
          </div>
        )}
      </div>
    </div>
  );
}

function Questions({ sum }: { sum: Summary }) {
  return (
    <details className="card section pl-details">
      <summary><b>Every question</b> <span className="tiny muted">· answers and comments (names removed)</span></summary>
      {sum.qs.map((q, i) => (
        <div key={q.id} className="pl-qr">
          <div className="small"><b>{i + 1}. {q.text}</b> <span className="tiny muted">· {q.n} answered</span></div>
          {q.kind === "agree" && (
            <div className="pl-stack" aria-label={q.dist.map((d) => `${d.label} ${d.count}`).join(", ")}>
              {q.dist.map((d, k) => d.count > 0 && <span key={k} className={`s${k}`} style={{ flex: d.count }} title={`${d.label}: ${d.count}`}>{Math.round((100 * d.count) / Math.max(1, q.n))}%</span>)}
            </div>
          )}
          {q.kind === "agree" && <div className="tiny muted">{q.fav}% favorable{q.prevFav !== undefined ? ` · was ${q.prevFav}%` : ""} · {AGREE[0]} to {AGREE[4]}</div>}
          {q.kind === "scale10" && <div className="tiny muted">Average {q.avg} of 10{q.enps !== undefined ? ` · eNPS ${q.enps > 0 ? "+" : ""}${q.enps}` : ""}</div>}
          {(q.kind === "choice" || q.kind === "multi" || q.kind === "yesno") && (
            <div className="pl-opts">{[...q.dist].sort((a, b) => b.count - a.count).map((d) => <div key={d.label} className="pl-opt-row"><span className="grow">{d.label}</span><span className="pl-bar sm"><span style={{ width: `${Math.round((100 * d.count) / Math.max(1, q.n))}%` }} /></span><span className="tiny">{d.count}</span></div>)}</div>
          )}
          {q.kind === "text" && <div className="pl-comments">{(q.comments ?? []).length ? (q.comments ?? []).map((c, k) => <p key={k} className="small">{c}</p>) : <p className="tiny muted">No comments.</p>}</div>}
        </div>
      ))}
    </details>
  );
}

function ActionPlan({ P, s, set }: { P: PP; s: Survey; set: (s: Survey) => void }) {
  const [list, setList] = useState<PAction[]>(s.actions);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setList(s.actions); setDirty(false); }, [s.actions]);
  const upd = (l: PAction[]) => { setList(l); setDirty(true); };
  const setA = (i: number, p: Partial<PAction>) => upd(list.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const save = async () => {
    const r = await P.call({ action: "actions", id: s.id, actions: list });
    if (r.ok) { set(r.survey); P.toast.show("Action plan saved"); }
    else P.toast.show("Couldn't save. Try again.");
  };
  const suggested = (s.analysis?.actions ?? []).filter((x) => !list.some((a) => a.action === x.action));
  const add = (p?: Partial<PAction>) => upd([...list, { id: Math.random().toString(36).slice(2, 10), finding: "", action: "", owner: "", status: "planned", priority: "med", ...p }]);
  return (
    <div className="card section" id="actions">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div><b>Action plan</b><div className="tiny muted">Each action ties to a finding. The next survey shows whether it worked.</div></div>
        <div className="row" style={{ gap: 8 }}><button className="btn ghost sm" onClick={() => add()}>+ Add action</button><button className="btn primary sm" disabled={!dirty} onClick={save}>{dirty ? "Save plan" : "Saved"}</button></div>
      </div>
      {suggested.length > 0 && (
        <div className="pl-suggest">
          <span className="pl-k">Suggested by Alza</span>
          {suggested.map((x, i) => (
            <div key={i} className="pl-sug-row">
              <span className={`pf-chip ${PRI[x.priority][1]}`}>{PRI[x.priority][0]}</span>
              <span className="grow small"><b>{x.action}</b><span className="tiny muted"> · {x.finding} · {x.timing}</span></span>
              <button className="btn ghost sm" onClick={() => add({ finding: x.finding, action: x.action, priority: x.priority, metric: x.metric })}>Add</button>
            </div>
          ))}
        </div>
      )}
      {list.map((a, i) => (
        <div key={a.id} className="pl-act">
          <div className="pl-act-grid">
            <label><span className="flabel">Finding</span><input className="f" value={a.finding} onChange={(e) => setA(i, { finding: e.target.value })} /></label>
            <label className="wide"><span className="flabel">Action</span><input className="f" value={a.action} onChange={(e) => setA(i, { action: e.target.value })} /></label>
            <label><span className="flabel">Owner</span><input className="f" value={a.owner} onChange={(e) => setA(i, { owner: e.target.value })} placeholder="Name or team" /></label>
            <label><span className="flabel">Due</span><input type="date" className="f" value={a.due ?? ""} onChange={(e) => setA(i, { due: e.target.value || undefined })} /></label>
            <label><span className="flabel">Priority</span><select className="f" value={a.priority} onChange={(e) => setA(i, { priority: e.target.value as PAction["priority"] })}><option value="high">High</option><option value="med">Medium</option><option value="low">Low</option></select></label>
            <label><span className="flabel">Status</span><select className="f" value={a.status} onChange={(e) => setA(i, { status: e.target.value as PAction["status"] })}><option value="planned">Planned</option><option value="progress">In progress</option><option value="done">Done</option></select></label>
            <label className="wide"><span className="flabel">How we&apos;ll know</span><input className="f" value={a.metric ?? ""} onChange={(e) => setA(i, { metric: e.target.value })} placeholder="e.g. Communication score above 65% next survey" /></label>
          </div>
          <button className="linklike tiny" style={{ color: "var(--red)" }} onClick={() => upd(list.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {!list.length && !suggested.length && <p className="small muted">No actions yet.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ insights across surveys
export function Insights() {
  const P = usePulse();
  const closed = (P.surveys ?? []).filter((s) => s.status === "closed").sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
  return P.shell(
    <>
      <Head title="Insights" sub="What each survey found, newest first. Open one for the full results and report." />
      {!closed.length && <div className="card section small muted">Insights show here once a survey closes.</div>}
      {closed.map((s) => (
        <Link key={s.id} href={`${P.base}/survey/${s.id}`} className="card section pl-ins">
          <div className="row" style={{ justifyContent: "space-between", gap: 10 }}><b>{s.title}</b><span className="tiny muted">Closed {fmtDay(s.closedAt)} · {s.responded} answered</span></div>
          {s.analysis ? <><p className="small" style={{ margin: "6px 0 0" }}><b>{s.analysis.headline}</b></p><p className="small muted" style={{ margin: "4px 0 0" }}>{s.analysis.consider}</p></> : <p className="small muted" style={{ margin: "6px 0 0" }}>{s.responded >= MIN_GROUP ? "Open it to generate the Alza insight." : `Fewer than ${MIN_GROUP} answers, so results stay hidden.`}</p>}
          {s.actions.length > 0 && <div className="tiny muted" style={{ marginTop: 6 }}>{s.actions.filter((a) => a.status === "done").length} of {s.actions.length} actions done</div>}
        </Link>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ every action
export function Actions() {
  const P = usePulse();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const rows = (P.surveys ?? []).flatMap((s) => s.actions.map((a) => ({ a, s }))).filter(({ a }) => filter === "all" || a.status !== "done").sort((x, y) => (x.a.due ?? "9").localeCompare(y.a.due ?? "9"));
  const setStatus = async (s: Survey, id: string, status: PAction["status"]) => {
    const r = await P.call({ action: "actions", id: s.id, actions: s.actions.map((a) => (a.id === id ? { ...a, status } : a)) });
    if (r.ok) P.setSurveys((l) => (l ?? []).map((x) => (x.id === s.id ? r.survey : x)));
  };
  return P.shell(
    <>
      <Head title="Action plan" sub="Commitments from every survey. Change a status right here." right={<div className="chips"><button className={`chip chip-btn ${filter === "open" ? "on" : ""}`} onClick={() => setFilter("open")}>Open</button><button className={`chip chip-btn ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All</button></div>} />
      <div className="card section">
        {!rows.length ? <p className="small muted">{filter === "open" ? "Nothing open." : "No actions yet."} Actions come from a closed survey&apos;s results.</p> : (
          <div className="pl-table acts">
            <div className="pl-tr pl-th"><span>Action</span><span>Owner</span><span>Due</span><span>Status</span></div>
            {rows.map(({ a, s }) => (
              <div key={a.id} className="pl-tr">
                <span><span className={`pf-chip ${PRI[a.priority][1]}`} style={{ marginRight: 6 }}>{PRI[a.priority][0]}</span><b>{a.action}</b><div className="tiny muted">{a.finding ? `${a.finding} · ` : ""}<Link href={`${P.base}/survey/${s.id}#actions`}>{s.title}</Link>{a.metric ? ` · ${a.metric}` : ""}</div></span>
                <span className="small">{a.owner || "—"}</span>
                <span className={`small ${a.due && a.due < today() && a.status !== "done" ? "pl-late" : ""}`}>{a.due ? fmtDay(a.due) : "—"}</span>
                <span><select className="f" value={a.status} onChange={(e) => setStatus(s, a.id, e.target.value as PAction["status"])} aria-label="Status"><option value="planned">Planned</option><option value="progress">In progress</option><option value="done">Done</option></select></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
