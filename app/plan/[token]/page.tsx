"use client";

// The manager's plan for one new hire, opened from their reminder emails. No login.
// Stage by stage: a short checklist, questions to ask, the new hire's answers for the manager, and private notes.
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_STAGES } from "@/lib/experience";
import { DEMO_ACCENT, DEMO_COMPANY } from "@/lib/state";

type Stage = { id: string; label: string; on: string; items: { text: string; done: boolean }[]; asks: string[] };
type Info = { company: string; accent: string; manager: string; name: string; first: string; title: string; start: string; buddy: string; current: string; stages: Stage[]; answers: { q: string; a: string }[]; notes: string };

const SAMPLE: Info = {
  company: DEMO_COMPANY, accent: DEMO_ACCENT, manager: "Dana Ortiz", name: "Jordan Lee", first: "Jordan", title: "Warehouse Associate", start: new Date(Date.now() + 9 * 864e5).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }), buddy: "Sam Okafor", current: "prep",
  stages: DEFAULT_STAGES.map((s) => ({ id: s.id, label: s.label, on: "", items: s.items.map((t, i) => ({ text: t.replace(/they|them|their/g, (w) => ({ they: "Jordan", them: "Jordan", their: "Jordan's" })[w] ?? w), done: s.id === "prep" && i < 2 })), asks: s.asks })),
  answers: [{ q: "How do you like to get feedback or recognition?", a: "Quick and direct, in person. Public shoutouts make me a little shy." }, { q: "Anything that would make your first weeks easier?", a: "A walkthrough of the leasing software before I meet residents." }],
  notes: "",
};
const shortD = (d: string) => (d ? new Date(d + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

export default function Plan() {
  const { token } = useParams<{ token: string }>();
  const demo = token === "demo" || token === "sample";
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    const load = (i: Info) => {
      setInfo(i);
      setTab(i.current);
      setNotes(i.notes);
    };
    fetch(`/api/plan/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.ok ? load(j) : j.reason === "demo" || demo ? load(SAMPLE) : setMissing(true)))
      .catch(() => (demo ? load(SAMPLE) : setMissing(true)));
  }, [token, demo]);

  if (missing) return <div className="ex-page"><div className="ex-card"><h1>This plan isn&apos;t available</h1><p className="ex-sub">It may have wrapped up (plans run through day 90) or been closed by HR.</p></div></div>;
  if (!info) return <div className="ex-page" />;

  const post = async (body: object) => {
    if (demo) return { ok: true };
    return fetch(`/api/plan/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ ok: false }));
  };
  const cur = info.stages.find((s) => s.id === tab) ?? info.stages[0];
  const tick = async (i: number, on: boolean) => {
    setInfo({ ...info, stages: info.stages.map((s) => (s.id === cur.id ? { ...s, items: s.items.map((x, k) => (k === i ? { ...x, done: on } : x)) } : s)) });
    const r = await post({ action: "tick", key: `${cur.id}:${i}`, on });
    if (!r.ok) setInfo(info);
  };

  return (
    <div className="ex-page wl wp" style={{ ["--ex" as string]: info.accent }}>
      <div className="wp-top"><b>{info.company}</b></div>
      <div className="wp-body" style={{ maxWidth: 720 }}>
        <div>
          <div className="wp-kicker">Your plan for</div>
          <h1 className="wp-h1">{info.name}</h1>
          <p className="tiny" style={{ marginTop: 6, fontSize: 14 }}>{[info.title, info.start ? `starts ${info.start}` : "", info.buddy ? `buddy: ${info.buddy}` : ""].filter(Boolean).join(" · ")}</p>
        </div>

        <div className="pl-tabs" role="tablist">
          {info.stages.map((s) => {
            const done = s.items.filter((x) => x.done).length;
            return (
              <button key={s.id} role="tab" aria-selected={s.id === cur.id} className={s.id === cur.id ? "on" : ""} onClick={() => setTab(s.id)}>
                <b>{s.label}</b>
                <span>{s.on ? `${shortD(s.on)} · ` : ""}{done}/{s.items.length}</span>
              </button>
            );
          })}
        </div>

        <section className="wp-card">
          <h2>{cur.label}</h2>
          {cur.items.map((x, i) => (
            <label key={i} className={`wl-line ${x.done ? "off" : ""}`}>
              <input type="checkbox" checked={x.done} onChange={(e) => tick(i, e.target.checked)} />
              <span>{x.text}</span>
            </label>
          ))}
        </section>

        {cur.asks.length > 0 && (
          <section className="wp-card pl-asks">
            <h2>Questions to ask</h2>
            <ul>{cur.asks.map((q) => <li key={q}>{q}</li>)}</ul>
          </section>
        )}

        {info.answers.length > 0 && (
          <section className="wp-card">
            <h2>From {info.first}, for you</h2>
            {info.answers.map((p) => <p key={p.q} style={{ margin: "8px 0", fontSize: 15, lineHeight: 1.5 }}><b>{p.q}</b><br />{p.a}</p>)}
          </section>
        )}

        <section className="wp-card">
          <h2>Your notes</h2>
          <p className="tiny" style={{ margin: "0 0 8px" }}>Only you and HR see these. {info.first} never does.</p>
          <textarea className="wl-in" rows={4} value={notes} maxLength={4000} onChange={(e) => { setNotes(e.target.value); setSaved(""); }} placeholder="How it's going, what to follow up on" aria-label="Your notes" />
          <button className="wl-back" style={{ marginTop: 10 }} onClick={async () => setSaved((await post({ action: "note", text: notes })).ok ? "Saved" : "Couldn't save. Try again.")}>Save notes</button>
          {saved && <span className="tiny" style={{ marginLeft: 10 }}>{saved}</span>}
        </section>
      </div>
    </div>
  );
}
