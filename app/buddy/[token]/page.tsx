"use client";

// The onboarding buddy's page, opened from their email. No login.
// Say yes or not right now, then tick off the check-ins and leave HR a note.
// Links in emails carry ?a=yes or ?done=<id>; nothing changes until the buddy taps the button here.
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Info = {
  buddy: string; status: "asked" | "yes" | "no"; name: string; first: string; title: string; manager: string; start: string; company: string; accent: string; logo: string | null;
  about: { label: string; text: string }[]; note: string; todos: { id: string; text: string; on: string; done: boolean }[];
};

const SAMPLE: Info = {
  buddy: "Sam", status: "asked", name: "Maya Torres", first: "Maya", title: "Leasing Manager", manager: "Jordan Ellis", start: "Monday, December 1st", company: "Bayside Residential", accent: "#1d4f7a", logo: null,
  about: [{ label: "Outside of work", text: "Trail running, my two dogs, and every taqueria in the East Bay." }, { label: "Fun fact", text: "I once worked a season as a park ranger at Yosemite." }],
  note: "",
  todos: [
    { id: "n1", text: "Maya starts Monday, December 1st. Take a minute to say hi and set up a coffee for her first week.", on: "2026-11-26", done: false },
    { id: "n2", text: "Two weeks in. Check in with Maya: how's it going, any questions, feeling connected to the team?", on: "2026-12-15", done: false },
  ],
};

const day = (iso: string) => (iso ? new Date(iso + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "");

function Buddy() {
  const { token } = useParams<{ token: string }>();
  const q = useSearchParams();
  const demo = token === "demo" || token === "sample";
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = (i: Info) => {
      setInfo(i);
      setNote(i.note);
    };
    fetch(`/api/buddy/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.ok ? load(j) : j.reason === "demo" || demo ? load(SAMPLE) : setMissing(true)))
      .catch(() => (demo ? load(SAMPLE) : setMissing(true)));
  }, [token, demo]);

  if (missing) return <div className="ex-page"><div className="ex-card"><h1>This link isn&apos;t working</h1><p className="ex-sub">It may have expired. Reply to the email and HR will help.</p></div></div>;
  if (!info) return <div className="ex-page" />;

  const act = async (action: string, extra: object = {}) => {
    if (demo) return { ok: true };
    setBusy(true);
    const r = await fetch(`/api/buddy/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    return r;
  };
  const answer = async (yes: boolean) => {
    const r = await act(yes ? "yes" : "no");
    if (r.ok) setInfo({ ...info, status: yes ? "yes" : "no" });
  };
  const tick = async (id: string, done: boolean) => {
    const r = await act(done ? "done" : "undo", { id });
    if (r.ok) setInfo({ ...info, todos: info.todos.map((t) => (t.id === id ? { ...t, done } : t)) });
  };
  const hinted = q.get("done");
  const want = q.get("a");

  return (
    <div className="ex-page wl" style={{ ["--ex" as string]: info.accent }}>
      <div className="ex-card">
        {info.logo ? <img src={info.logo} alt={info.company} className="ex-logo" /> : <b className="ex-co">{info.company}</b>}

        {info.status === "asked" && (
          <>
            <h1>Hi {info.buddy}, would you be {info.first}&apos;s buddy?</h1>
            <p className="ex-sub">{info.name} starts {info.start || "soon"} as {info.title || "a new team member"}{info.manager ? `, working with ${info.manager}` : ""}. You&apos;re not training anyone. Just be a friendly face for the first month.</p>
            <div className="wl-nav" style={{ flexDirection: "column" }}>
              <button className="ex-send" disabled={busy} onClick={() => answer(true)} autoFocus={want === "yes"}>Yes, happy to</button>
              <button className="wl-back" disabled={busy} onClick={() => answer(false)} style={{ width: "100%" }} autoFocus={want === "no"}>Not right now</button>
            </div>
            <p className="ex-sub" style={{ fontSize: 13, marginTop: 12 }}>&ldquo;Not right now&rdquo; is totally fine. HR will ask someone else.</p>
          </>
        )}

        {info.status === "no" && (
          <div className="ex-thanks" style={{ padding: "24px 0" }}>
            <h1>No problem, {info.buddy}.</h1>
            <p className="ex-sub">We let HR know. Thanks for getting back to us.</p>
          </div>
        )}

        {info.status === "yes" && (
          <>
            <h1>Thanks for being {info.first}&apos;s buddy!</h1>
            <p className="ex-sub">{info.name} · {info.title}{info.start ? ` · starts ${info.start}` : ""}</p>
            {info.about.length > 0 && (
              <div className="wl-intro" style={{ marginTop: 14 }}>
                <div className="tiny" style={{ marginBottom: 4 }}>A little about {info.first}</div>
                {info.about.map((l) => <p key={l.label} className="wl-open" style={{ margin: "4px 0" }}><b>{l.label}:</b> {l.text}</p>)}
              </div>
            )}
            <h2 className="wl-h2">Your check-ins</h2>
            {info.todos.map((t) => (
              <label key={t.id} className={`wl-line ${t.done ? "off" : ""} ${hinted === t.id && !t.done ? "hint" : ""}`}>
                <input type="checkbox" checked={t.done} disabled={busy} onChange={(e) => tick(t.id, e.target.checked)} />
                <span>{t.text}<span className="tiny" style={{ display: "block", marginTop: 2 }}>{day(t.on)}</span></span>
              </label>
            ))}
            <h2 className="wl-h2">Anything HR should know?</h2>
            <textarea className="wl-in" rows={3} maxLength={1500} value={note} onChange={(e) => { setNote(e.target.value); setSaved(""); }} placeholder="Optional. Only HR sees this." aria-label="Note for HR" />
            <button className="wl-back" style={{ marginTop: 10 }} disabled={busy} onClick={async () => { const r = await act("note", { text: note }); setSaved(r.ok ? "Saved" : "Couldn't save. Try again."); }}>Save note</button>
            {saved && <span className="tiny" style={{ marginLeft: 10 }}>{saved}</span>}
          </>
        )}
      </div>
    </div>
  );
}

export default function BuddyPage() {
  return <Suspense fallback={<div className="ex-page" />}><Buddy /></Suspense>;
}
