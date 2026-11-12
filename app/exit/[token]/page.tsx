"use client";

// Public exit survey, opened from the goodbye email. No login.
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SURVEY } from "@/lib/offboard";

type Info = { first: string; company: string; accent: string; logo: string | null; done: boolean; questions: typeof SURVEY };

export default function ExitSurvey() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [a, setA] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const demo = token === "demo" || token === "sample";
  useEffect(() => {
    fetch(`/api/exit/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setInfo(j);
        else if (j.reason === "demo" || demo) setInfo({ first: "Alex", company: "Blueprint Studios", accent: "#2b3cf5", logo: null, done: false, questions: SURVEY });
        else setMissing(true);
      })
      .catch(() => setMissing(true));
  }, [token, demo]);

  if (missing) return <div className="ex-page"><div className="ex-card"><h1>This link isn&apos;t working</h1><p>It may have expired. If you have feedback to share, reply to your goodbye email.</p></div></div>;
  if (!info) return <div className="ex-page" />;
  const accent = info.accent;
  if (done || info.done)
    return (
      <div className="ex-page" style={{ ["--ex" as string]: accent }}>
        <div className="ex-card ex-thanks">
          <h1>Thank you, {info.first}.</h1>
          <p>Your answers went to HR at {info.company}. We appreciate you taking the time, and we wish you all the best.</p>
        </div>
      </div>
    );
  const submit = async () => {
    if (!Object.values(a).some((v) => v.trim())) return setErr("Answer at least one question, or close this page if you'd rather not.");
    setErr("");
    if (demo || !info) return setDone(true);
    setBusy(true);
    const r = await fetch(`/api/exit/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: a }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (r.ok) setDone(true);
    else setErr("Couldn't send it. Try again.");
  };
  return (
    <div className="ex-page" style={{ ["--ex" as string]: accent }}>
      <div className="ex-card">
        {info.logo ? <img src={info.logo} alt={info.company} className="ex-logo" /> : <b className="ex-co">{info.company}</b>}
        <h1>Before you go, {info.first}</h1>
        <p className="ex-sub">A few quick questions about working at {info.company}. Every question is optional. Your answers go to HR, and help make this a better place to work.</p>
        {info.questions.map((q, i) => (
          <fieldset key={q.id} className="ex-q">
            <legend><span>{i + 1}</span>{q.q}</legend>
            {q.kind === "scale" && (
              <div className="ex-scale">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className={a[q.id] === String(n) ? "on" : ""} aria-pressed={a[q.id] === String(n)} onClick={() => setA({ ...a, [q.id]: a[q.id] === String(n) ? "" : String(n) })}>{n}</button>
                ))}
                <div className="ex-ends"><span>Not great</span><span>Excellent</span></div>
              </div>
            )}
            {q.kind === "choice" && (
              <div className="ex-choices">
                {q.options!.map((o) => <button key={o} type="button" className={a[q.id] === o ? "on" : ""} aria-pressed={a[q.id] === o} onClick={() => setA({ ...a, [q.id]: a[q.id] === o ? "" : o })}>{o}</button>)}
              </div>
            )}
            {q.kind === "text" && <textarea rows={3} maxLength={3000} value={a[q.id] ?? ""} onChange={(e) => setA({ ...a, [q.id]: e.target.value })} aria-label={q.q} />}
          </fieldset>
        ))}
        {err && <p className="ex-err">{err}</p>}
        <button className="ex-send" disabled={busy} onClick={submit}>{busy ? "Sending…" : "Send my answers"}</button>
      </div>
    </div>
  );
}
