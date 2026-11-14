"use client";

// The new hire's welcome page, opened from their emails. No login: the link is the key.
// Before day one: a countdown, their first day, to-dos, their people, their intro.
// After: "Day N", what's left, their people. Works for 90 days after the start.
// "Tell us about you" opens the get-to-know-you questions, then they approve their intro.
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_INTRO, DEFAULT_QUESTIONS, PAGE_TEXT, PAGE_TITLE, XQuestion } from "@/lib/experience";

type Info = {
  first: string; preferred: string; last: string; title: string; manager: string; managerEmail: string; startISO: string; start: string; arrival: string; where: string; bring: string;
  company: string; accent: string; logo: string | null; hr: { name: string; email: string; phone: string }; mission: string; values: string[]; video: string;
  signed: boolean; todos: { text: string; done: boolean }[]; intro: boolean;
  pageTitle: string; pageText: string; questions: XQuestion[]; answers: Record<string, string>; share: string[] | null; sharePhoto: boolean; photos: boolean; photo?: string;
  submitted: boolean; approved: boolean; sent: boolean; introDay: string; opening: string; closing: string; subject: string; buddy: string; buddyEmail: string;
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plus = (n: number) => iso(new Date(Date.now() + n * 864e5));

const SAMPLE: Info = {
  first: "Maya", preferred: "", last: "Torres", title: "Leasing Manager", manager: "Jordan Ellis", managerEmail: "jordan@example.com", startISO: plus(9), start: "", arrival: "9:00 AM", where: "Harbor View leasing office", bring: "Accepted ID: a U.S. passport, or a driver's license plus a Social Security card or birth certificate.",
  company: "Bayside Residential", accent: "#1d4f7a", logo: null, hr: { name: "Alex Kim", email: "hr@example.com", phone: "" }, mission: "Homes people are proud to come back to.", values: ["Residents first", "Own it", "Leave it better"], video: "",
  signed: true, todos: [{ text: "Fill in your new-hire paperwork in Rippling", done: false }, { text: "Add an emergency contact", done: false }], intro: true,
  pageTitle: PAGE_TITLE, pageText: PAGE_TEXT, questions: DEFAULT_QUESTIONS, answers: {}, share: null, sharePhoto: true, photos: true, submitted: false, approved: false, sent: false, introDay: plus(9),
  opening: DEFAULT_INTRO.message, closing: DEFAULT_INTRO.closing, subject: DEFAULT_INTRO.subject, buddy: "Sam Okafor", buddyEmail: "sam@example.com",
};

/** Square, at most 600px, as a JPEG. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const out = Math.min(600, side);
    const c = document.createElement("canvas");
    c.width = c.height = out;
    c.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const longD = (d: string) => (d ? new Date(d + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "");
const shortD = (d: string) => (d ? new Date(d + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export default function Welcome() {
  const { token } = useParams<{ token: string }>();
  const demo = token === "demo" || token === "sample";
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [mode, setMode] = useState<"home" | "ask">("home");
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Record<string, string>>({});
  const [pref, setPref] = useState("");
  const [share, setShare] = useState<Set<string>>(new Set());
  const [usePhoto, setUsePhoto] = useState(true);
  const [photo, setPhoto] = useState<string | undefined>();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    const load = (i: Info) => {
      setInfo(i);
      setA(i.answers);
      setPref(i.preferred);
      setShare(new Set(i.share ?? i.questions.filter((q) => !q.private).map((q) => q.id)));
      setUsePhoto(i.sharePhoto);
      setPhoto(i.photo);
    };
    fetch(`/api/welcome/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.ok ? load(j) : j.reason === "demo" || demo ? load(SAMPLE) : setMissing(true)))
      .catch(() => (demo ? load(SAMPLE) : setMissing(true)));
  }, [token, demo]);

  const name = (pref.trim() || info?.first || "").trim();
  const fill = (t: string) =>
    !info ? t : t
      .replace(/\{preferred name\}/gi, name).replace(/\{first name\}/gi, info.first).replace(/\{last name\}/gi, info.last).replace(/\{full name\}/gi, `${info.first} ${info.last}`.trim())
      .replace(/\{job title\}/gi, info.title || "our new team member").replace(/\{manager\}/gi, info.manager || "their manager").replace(/\{company\}/gi, info.company).replace(/\{start date\}/gi, longD(info.startISO))
      .replace(/\{buddy first\}/gi, info.buddy.split(" ")[0] || "your buddy").replace(/\{buddy\}/gi, info.buddy || "your buddy").replace(/ {2,}/g, " ").replace(/ ([.,!?])/g, "$1");
  const pub = useMemo(() => (info?.questions ?? []).filter((q) => !q.private), [info]);
  const priv = useMemo(() => (info?.questions ?? []).filter((q) => q.private), [info]);
  const lines = pub.filter((q) => (a[q.id] || "").trim());

  if (missing)
    return <div className="ex-page"><div className="ex-card"><h1>This link isn&apos;t working</h1><p className="ex-sub">It may have expired. Reply to your welcome email and HR will help.</p></div></div>;
  if (!info) return <div className="ex-page" />;

  const post = async (body: object) => {
    if (demo) return { ok: true } as { ok: boolean; reason?: string; photo?: string };
    setBusy(true);
    const r = await fetch(`/api/welcome/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    return r as { ok: boolean; reason?: string; photo?: string };
  };
  const save = async (approve?: boolean) => {
    setErr("");
    const r = await post({ answers: a, preferred: pref, share: [...share], sharePhoto: usePhoto, approve });
    if (!r.ok) setErr(r.reason === "sent" ? "Your intro already went out, so it can't be pulled back now." : "Couldn't save. Check your connection and try again.");
    return !!r.ok;
  };
  const pickPhoto = async (f?: File) => {
    if (!f) return;
    setErr("");
    try {
      const data = await shrink(f);
      if (demo) return setPhoto(data);
      const r = await post({ action: "photo", data });
      if (r.ok) setPhoto(r.photo || data);
      else setErr("That photo didn't upload. Try a JPG or PNG.");
    } catch {
      setBusy(false);
      setErr("That photo didn't open. Try a JPG or PNG.");
    }
  };
  const tick = async (i: number, done: boolean) => {
    const r = await post({ action: "todo", i, done });
    if (r.ok) setInfo({ ...info, todos: info.todos.map((t, k) => (k === i ? { ...t, done } : t)) });
  };

  const today = iso(new Date());
  const days = info.startISO ? Math.round((new Date(info.startISO + "T12:00").getTime() - new Date(today + "T12:00").getTime()) / 864e5) : null;
  const before = days !== null && days > 0;
  const dayN = days !== null && days <= 0 ? 1 - days : 0;
  const initials = ini(`${name} ${info.last}`);
  const steps = info.photos ? 3 : 2;
  const go = async (n: number) => {
    if (n > step && step === 0 && !(await save())) return;
    window.scrollTo(0, 0);
    setStep(!info.photos && n === 1 ? (step === 0 ? 2 : 0) : n);
  };

  // to-dos: get to know you first, then the offer, then their action items
  type Todo = { key: string; label: string; sub: string; done: boolean; open?: () => void; toggle?: () => void };
  const todos: Todo[] = [];
  if (info.intro && !info.sent)
    todos.push({
      key: "know",
      label: info.approved ? "Your intro is ready" : info.submitted ? "Approve your intro" : "Tell us about you",
      sub: info.approved ? `Goes to the team ${shortD(info.introDay) || "on your first day"}. Change it any time before then.` : "About 4 minutes. Becomes your intro to the team.",
      done: info.approved,
      open: () => { setMode("ask"); setStep(info.submitted ? (info.photos ? 2 : 2) : 0); setOk(false); window.scrollTo(0, 0); },
    });
  todos.push({ key: "offer", label: "Sign your offer", sub: info.signed ? "Signed" : "Check your email for the signing link", done: info.signed });
  info.todos.forEach((t, i) => todos.push({ key: `t${i}`, label: t.text, sub: t.done ? "Done" : "Tap the circle when it's done", done: t.done, toggle: () => tick(i, !t.done) }));
  const doneCount = todos.filter((t) => t.done).length;

  const people = [
    info.manager && { role: "Your manager", name: info.manager, sub: "", email: info.managerEmail },
    info.buddy && { role: "Your buddy", name: info.buddy, sub: "Here for the informal stuff", email: info.buddyEmail },
    info.hr.email && { role: "HR", name: info.hr.name || "HR", sub: info.hr.phone, email: info.hr.email },
  ].filter(Boolean) as { role: string; name: string; sub: string; email: string }[];

  // ================================================= the questions
  if (mode === "ask")
    return (
      <div className="ex-page wl" style={{ ["--ex" as string]: info.accent }}>
        <div className="ex-card">
          <button className="wl-link" style={{ paddingLeft: 0 }} onClick={() => { setMode("home"); setErr(""); }}>‹ Back to your welcome page</button>
          <div className="wl-steps" aria-label={`Step ${(info.photos ? step : step === 2 ? 1 : 0) + 1} of ${steps}`}>{Array.from({ length: steps }, (_, i) => <span key={i} className={i <= (info.photos ? step : step === 2 ? 1 : 0) ? "on" : ""} />)}</div>

          {step === 0 && (
            <>
              <h1>{fill(info.pageTitle)}</h1>
              <p className="ex-sub">{fill(info.pageText)}</p>
              <fieldset className="ex-q">
                <legend>What name do you go by?</legend>
                <input className="wl-in" value={pref} placeholder={info.first} maxLength={40} onChange={(e) => setPref(e.target.value)} aria-label="What name do you go by?" />
              </fieldset>
              {pub.map((q) => (
                <fieldset key={q.id} className="ex-q">
                  <legend>{q.q}</legend>
                  <textarea rows={2} maxLength={600} value={a[q.id] ?? ""} onChange={(e) => setA({ ...a, [q.id]: e.target.value })} aria-label={q.q} />
                </fieldset>
              ))}
              {priv.length > 0 && (
                <div className="wl-private">
                  <h2>Just for {info.manager ? info.manager.split(" ")[0] : "your manager"}</h2>
                  <p>Only your manager and HR see these. They&apos;re never part of your intro.</p>
                  {priv.map((q) => (
                    <fieldset key={q.id} className="ex-q">
                      <legend>{q.q}</legend>
                      <textarea rows={3} maxLength={600} value={a[q.id] ?? ""} onChange={(e) => setA({ ...a, [q.id]: e.target.value })} aria-label={q.q} />
                    </fieldset>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <h1>Add a photo</h1>
              <p className="ex-sub">Casual is great. It only goes in your intro if you say so on the next step.</p>
              <div className="wl-photo">{photo ? <img src={photo} alt="Your photo" /> : <span>{initials}</span>}</div>
              <div className="wl-row">
                <label className="wl-btn">
                  {photo ? "Choose a different photo" : "Choose a photo"}
                  <input type="file" accept="image/*" onChange={(e) => pickPhoto(e.target.files?.[0])} />
                </label>
                {photo && <button className="wl-link" onClick={async () => { await post({ action: "removePhoto" }); setPhoto(undefined); }}>Remove</button>}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1>Here&apos;s your intro</h1>
              <p className="ex-sub">This goes to the team on your first day. Uncheck anything you&apos;d rather keep to yourself.</p>
              <div className="wl-intro">
                <div className="wl-who">
                  <div className="wl-av">{photo && usePhoto ? <img src={photo} alt="" /> : <span>{initials}</span>}</div>
                  <div><div className="tiny">Please welcome</div><b>{name} {info.last}</b><div className="tiny">{info.title}{info.manager ? ` · reports to ${info.manager}` : ""}</div></div>
                </div>
                <p className="wl-open">{fill(info.opening)}</p>
                {photo && <label className="wl-line"><input type="checkbox" checked={usePhoto} onChange={(e) => setUsePhoto(e.target.checked)} /><span><b>My photo</b></span></label>}
                {lines.map((q) => {
                  const on = share.has(q.id);
                  return (
                    <label key={q.id} className={`wl-line ${on ? "" : "off"}`}>
                      <input type="checkbox" checked={on} onChange={() => { const n = new Set(share); if (on) n.delete(q.id); else n.add(q.id); setShare(n); }} />
                      <span><b>{q.label || q.q.replace(/\?$/, "")}:</b> {a[q.id]}</span>
                    </label>
                  );
                })}
                <p className="wl-open">{fill(info.closing)}</p>
              </div>
              <label className={`wl-approve ${ok ? "on" : ""}`}>
                <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
                <span>I approve sharing what&apos;s checked above with my colleagues as my intro.</span>
              </label>
              {info.approved && <button className="wl-link" style={{ paddingLeft: 0 }} onClick={async () => { if (await save(false)) { setInfo({ ...info, approved: false }); setMode("home"); setFlash("Got it. Your intro won't be shared."); } }}>Don&apos;t share my intro at all</button>}
            </>
          )}

          {err && <p className="ex-err">{err}</p>}
          <div className="wl-nav">
            {step > 0 && <button className="wl-back" onClick={() => go(step - 1)}>Back</button>}
            {step < 2 && <button className="ex-send" disabled={busy} onClick={() => go(step + 1)}>{busy ? "Saving…" : step === 1 && !photo ? "Skip for now" : "Next"}</button>}
            {step === 2 && (
              <button className="ex-send" disabled={busy || !ok} onClick={async () => { if (await save(true)) { setInfo({ ...info, approved: true, submitted: true, answers: a, preferred: pref }); setMode("home"); setFlash(`Thanks, ${name}! Your intro is set.`); window.scrollTo(0, 0); } }}>
                {busy ? "Saving…" : "Approve my intro"}
              </button>
            )}
          </div>
        </div>
      </div>
    );

  // ================================================= home
  return (
    <div className="ex-page wl wp" style={{ ["--ex" as string]: info.accent }}>
      <div className="wp-top">
        {info.logo ? <img src={info.logo} alt={info.company} className="wp-logo" /> : <b>{info.company}</b>}
      </div>
      <div className="wp-body">
        {before ? (
          <h1 className="wp-h1">Hi {name}, we can&apos;t wait to meet you.</h1>
        ) : (
          <>
            {dayN > 0 && <div className="wp-kicker">Day {dayN}</div>}
            <h1 className="wp-h1">Glad you&apos;re here, {name}.</h1>
          </>
        )}
        {flash && <div className="wp-flash" role="status">{flash}</div>}

        {before && info.startISO && (
          <div className="wp-count">
            <div className="wp-num"><b>{days}</b><span>{days === 1 ? "day to go" : "days to go"}</span></div>
            <div className="wp-when"><span>Your first day</span><b>{longD(info.startISO)}</b><span>{info.arrival}{info.where ? ` · ${info.where.split(",")[0]}` : ""}</span></div>
          </div>
        )}
        {!before && dayN > 0 && (
          <div className="wp-track" aria-label="Your first 90 days">
            {[["Week 1", 7], ["Day 30", 30], ["Day 60", 60], ["Day 90", 90]].map(([l, d], i, arr) => {
              const from = i === 0 ? 0 : (arr[i - 1][1] as number);
              const pct = Math.max(0, Math.min(1, (dayN - from) / ((d as number) - from)));
              return <div key={l as string}><div className="wp-bar"><span style={{ width: `${pct * 100}%` }} /></div><small>{l}</small></div>;
            })}
          </div>
        )}

        <section className="wp-card">
          <h2>Your to-dos</h2>
          <div className="tiny">{doneCount} of {todos.length} done</div>
          {todos.map((t) => (
            <div key={t.key} className="wp-todo">
              {t.toggle ? (
                <button className={`wp-dot ${t.done ? "on" : ""}`} aria-pressed={t.done} aria-label={`${t.done ? "Mark not done" : "Mark done"}: ${t.label}`} disabled={busy} onClick={t.toggle}>{t.done ? "✓" : ""}</button>
              ) : (
                <span className={`wp-dot ${t.done ? "on" : ""}`} aria-hidden="true">{t.done ? "✓" : ""}</span>
              )}
              <div className="grow"><b className={t.done ? "done" : ""}>{t.label}</b><div className="tiny">{t.sub}</div></div>
              {t.open && <button className="wp-go" onClick={t.open}>{t.done ? "Change" : info.submitted ? "Review" : "Start"}</button>}
            </div>
          ))}
        </section>

        {(before || dayN === 1) && (
          <section className="wp-card">
            <h2>Your first day</h2>
            <div className="wp-fact"><b>When</b><span>{longD(info.startISO) || "To be confirmed"}{info.arrival ? `, ${info.arrival}` : ""}</span></div>
            {info.where && <div className="wp-fact"><b>Where</b><span>{info.where} · <a href={`https://maps.google.com/?q=${encodeURIComponent(info.where)}`} target="_blank" rel="noreferrer">Directions</a></span></div>}
            {info.manager && <div className="wp-fact"><b>Ask for</b><span>{info.manager}, your manager</span></div>}
            {info.bring && <div className="wp-fact"><b>Bring</b><span>{info.bring}</span></div>}
          </section>
        )}

        {people.length > 0 && (
          <section className="wp-card">
            <h2>Your people</h2>
            {people.map((p) => (
              <div key={p.role} className="wp-person">
                <span className="wl-av" aria-hidden="true">{ini(p.name)}</span>
                <div className="grow"><div className="wp-role">{p.role}</div><b>{p.name}</b>{p.sub && <div className="tiny">{p.sub}</div>}</div>
                {p.email && <a className="wp-mail" href={`mailto:${p.email}`} aria-label={`Email ${p.name}`}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg></a>}
              </div>
            ))}
          </section>
        )}

        {info.intro && (info.approved || info.sent) && (
          <section className="wp-card">
            <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
              <h2 className="grow" style={{ margin: 0 }}>Your intro</h2>
              <span className="wp-pill">{info.sent ? "Shared with the team" : `Goes out ${shortD(info.introDay)}`}</span>
            </div>
            <p className="tiny" style={{ margin: "6px 0 0" }}>{info.sent ? "The team got your intro." : "The team gets this on your first day. You can change it until then."}</p>
            {showIntro && (
              <div className="wl-intro">
                <b>{fill(info.subject)}</b>
                <p className="wl-open">{fill(info.opening)}</p>
                {lines.filter((q) => share.has(q.id)).map((q) => <p key={q.id} className="wl-open" style={{ margin: "4px 0" }}><b>{q.label || q.q.replace(/\?$/, "")}:</b> {a[q.id]}</p>)}
              </div>
            )}
            <button className="wl-link" style={{ paddingLeft: 0 }} onClick={() => setShowIntro(!showIntro)}>{showIntro ? "Hide it" : "See it"}</button>
          </section>
        )}

        {(info.mission || info.values.length > 0 || info.video) && (
          <section className="wp-card">
            <h2>Getting to know {info.company}</h2>
            {info.mission && <p className="wp-mission">{info.mission}</p>}
            {info.values.length > 0 && <ul className="wp-values">{info.values.map((v) => <li key={v}>{v}</li>)}</ul>}
            {info.video && <a className="wl-btn" href={info.video} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}>Watch the welcome video</a>}
          </section>
        )}

        {info.hr.email && (
          <p className="wp-foot">
            {before ? "Questions before you start?" : "Something not right, or just a question?"}
            <br />
            <a href={`mailto:${info.hr.email}`}>Email HR</a>
            {info.managerEmail && <> · <a href={`mailto:${info.managerEmail}`}>Email {info.manager.split(" ")[0]}</a></>}
          </p>
        )}
      </div>
    </div>
  );
}
