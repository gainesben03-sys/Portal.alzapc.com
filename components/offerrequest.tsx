"use client";

// The hiring manager's offer request (no sign-in) and the one-tap approval page from email.
import { useEffect, useState } from "react";
import { Hire, longDate } from "@/lib/hires";
import { blankRequest, hireFromRequest, OfferRequest, payText, requestProblems } from "@/lib/offerreq";
import { DEMO_ACCENT, DEMO_COMPANY } from "@/lib/state";
import { useStore } from "@/lib/store";
import { LIVE } from "@/lib/supabase";

type Co = { name: string; accent: string; logo: string | null };

function Shell({ co, children }: { co: Co | null; children: React.ReactNode }) {
  return (
    <div className="orq" style={{ ["--accent" as string]: co?.accent ?? "#0d1a2e" }}>
      <header className="orq-top">
        {co?.logo ? <img src={co.logo} alt={co.name} /> : <b>{co?.name ?? ""}</b>}
      </header>
      <main className="orq-main">{children}</main>
      <footer className="orq-foot">{co ? `${co.name} · ` : ""}Alza Hub</footer>
    </div>
  );
}

export function RequestForm({ token }: { token: string }) {
  const demo = !LIVE || token === "demo";
  const { hires, patch } = useStore();
  const [co, setCo] = useState<Co | null>(null);
  const [approver, setApprover] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [v, setV] = useState<OfferRequest>(blankRequest);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ approver: string | null } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    try { const me = JSON.parse(localStorage.getItem("alza-request-me") ?? "null"); if (me?.requester) setV((x) => ({ ...x, requester: me.requester, requesterEmail: me.requesterEmail })); } catch {}
    if (demo) { setCo({ name: DEMO_COMPANY, accent: DEMO_ACCENT, logo: null }); setApprover("Alex Rivera"); return; }
    fetch(`/api/request/${encodeURIComponent(token)}`).then((r) => r.json()).then((j) => (j.ok ? (setCo(j.company), setApprover(j.approver)) : setMissing(true))).catch(() => setMissing(true));
  }, [token, demo]);

  const set = <K extends keyof OfferRequest>(k: K, val: OfferRequest[K]) => setV((x) => ({ ...x, [k]: val }));
  const problems = requestProblems(v, !!approver);

  const send = async () => {
    setTried(true);
    setErr("");
    if (problems.length) return;
    setBusy(true);
    try { localStorage.setItem("alza-request-me", JSON.stringify({ requester: v.requester, requesterEmail: v.requesterEmail })); } catch {}
    if (demo) {
      const h: Hire = hireFromRequest(v, "harborlight", `h${Date.now().toString(36)}`, approver ? { name: approver, email: "alex@example.com" } : null);
      patch({ hires: [...hires, h] });
      setBusy(false);
      return setDone({ approver });
    }
    try {
      const r = await fetch(`/api/request/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      const j = await r.json();
      if (j.ok) setDone({ approver: j.approver });
      else setErr(j.reason === "missing" ? `Still need: ${j.missing.join(", ")}.` : j.reason === "too_many" ? "Lots of requests this hour. Try again a little later." : "That didn't go through. Try again.");
    } catch {
      setErr("No connection. Try again.");
    }
    setBusy(false);
  };

  if (missing) return <Shell co={null}><div className="orq-card"><h1>This link isn&apos;t working</h1><p className="muted">Ask HR for the current offer request link.</p></div></Shell>;
  if (!co) return <Shell co={null}><div style={{ minHeight: 300 }} /></Shell>;
  if (done)
    return (
      <Shell co={co}>
        <div className="orq-card orq-done">
          <div className="orq-check" aria-hidden="true">✓</div>
          <h1>Sent</h1>
          <p>{done.approver ? `Your request for ${v.name} went to ${done.approver} to approve. Once it's approved, HR writes the offer letter and sends it to you to look over before it goes out.` : `HR has your request for ${v.name}. He'll write the offer letter and send it to you to look over before it goes out.`}</p>
          <p className="muted small">A copy is on its way to {v.requesterEmail}.</p>
          <button className="btn" onClick={() => { setDone(null); setTried(false); setV({ ...blankRequest(), requester: v.requester, requesterEmail: v.requesterEmail }); }}>Request another offer</button>
        </div>
      </Shell>
    );

  const bad = (k: string) => tried && problems.includes(k);
  return (
    <Shell co={co}>
      <div className="orq-card">
        <h1>Request an offer</h1>
        <p className="muted">Two minutes. {approver ? `It goes to ${approver} to approve, then HR writes the offer letter.` : "HR writes the offer letter and sends it back to you to approve before it goes out."}</p>

        <h2>You</h2>
        <div className="orq-two">
          <label className={`f ${bad("your name") ? "bad" : ""}`}>Your name<input className="f" value={v.requester} onChange={(e) => set("requester", e.target.value)} autoComplete="name" /></label>
          <label className={`f ${bad("your work email") ? "bad" : ""}`}>Your work email<input className="f" type="email" value={v.requesterEmail} onChange={(e) => set("requesterEmail", e.target.value)} autoComplete="email" /></label>
        </div>

        <h2>The new hire</h2>
        <div className="orq-two">
          <label className={`f ${bad("the new hire's full name") ? "bad" : ""}`}>Full legal name<input className="f" value={v.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" /></label>
          <label className={`f ${bad("their personal email") ? "bad" : ""}`}>Personal email<input className="f" type="email" value={v.personalEmail} onChange={(e) => set("personalEmail", e.target.value)} autoComplete="off" placeholder="Where the offer goes" /></label>
        </div>

        <h2>The job</h2>
        <div className="orq-two">
          <label className={`f ${bad("the job title") ? "bad" : ""}`}>Job title<input className="f" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="As it should read on the offer" /></label>
          <label className="f">Reports to<input className="f" value={v.reportsTo} onChange={(e) => set("reportsTo", e.target.value)} placeholder={v.requester || "Their manager"} /></label>
          <label className={`f ${bad("a start date") ? "bad" : ""}`}>Start date<input className="f" type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} /></label>
          <label className="f">Type
            <select className="f" value={v.employment} onChange={(e) => set("employment", e.target.value as OfferRequest["employment"])}>
              {["Full-time", "Part-time", "Seasonal", "Temporary"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
        </div>

        <h2>Pay</h2>
        <div className="seg orq-seg">
          <button className={v.payType === "hourly" ? "on" : ""} onClick={() => setV({ ...v, payType: "hourly", exempt: "nonexempt" })}>Hourly</button>
          <button className={v.payType === "salary" ? "on" : ""} onClick={() => setV({ ...v, payType: "salary" })}>Salary</button>
        </div>
        <div className="orq-two">
          <label className={`f ${bad("the pay") ? "bad" : ""}`}>{v.payType === "hourly" ? "Hourly rate ($)" : "Annual salary ($)"}<input className="f" inputMode="decimal" value={v.payAmount} onChange={(e) => set("payAmount", e.target.value.replace(/[^0-9.]/g, ""))} placeholder={v.payType === "hourly" ? "24.00" : "68000"} /></label>
          {v.payType === "salary" && (
            <label className="f">Overtime
              <select className="f" value={v.exempt} onChange={(e) => set("exempt", e.target.value as OfferRequest["exempt"])}>
                <option value="exempt">Exempt (no overtime)</option>
                <option value="nonexempt">Non-exempt (gets overtime)</option>
              </select>
            </label>
          )}
        </div>
        <label className="f">Anything else for the offer <span className="tiny muted">(optional)</span>
          <textarea className="f" style={{ minHeight: 70 }} value={v.extras} onChange={(e) => set("extras", e.target.value)} placeholder="Bonus, sign-on, relocation, background check, schedule…" />
        </label>

        {!approver && (
          <div className={`orq-ok ${bad("a check that the offer is approved") || bad("who approved it") ? "bad" : ""}`}>
            <label><input type="checkbox" checked={v.approved} onChange={(e) => set("approved", e.target.checked)} /> This offer is approved. The pay and start date are final.</label>
            {v.approved && <label className="f">Approved by<input className="f" value={v.approvedBy} onChange={(e) => set("approvedBy", e.target.value)} placeholder="Name" /></label>}
          </div>
        )}

        {tried && problems.length > 0 && <p className="orq-err">Still need: {problems.join(", ")}.</p>}
        {err && <p className="orq-err">{err}</p>}
        <button className="btn primary block orq-send" disabled={busy} onClick={send}>{busy ? "Sending…" : approver ? `Send to ${approver.split(" ")[0]} to approve` : "Send to HR"}</button>
        <p className="tiny muted" style={{ textAlign: "center", marginTop: 10 }}>🔒 Only you, the approver, your executives and HR see pay.</p>
      </div>
    </Shell>
  );
}

type View = { kind: "pre" | "letter"; company: Co; who: string; status: string; note: string; requester: string; rows: [string, string][]; letter: { name: string; url: string } | null; first: string };

const DEMO_VIEW = (kind: "pre" | "letter"): View => ({
  kind, company: { name: DEMO_COMPANY, accent: DEMO_ACCENT, logo: null }, who: kind === "pre" ? "Alex Rivera" : "Dana Ortiz", status: "waiting", note: "", requester: "Dana Ortiz", first: "Jordan",
  rows: [["New hire", "Jordan Lee"], ["Job title", "Warehouse Associate"], ["Reports to", "Dana Ortiz"], ["Start date", longDate(new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10))], ["Pay", `${payText({ payType: "hourly", payAmount: 24 })}, non-exempt`], ["Type", "Full-time"]],
  letter: kind === "letter" ? { name: "Offer Letter - Jordan Lee.docx", url: "#" } : null,
});

export function ApprovePage({ token }: { token: string }) {
  const demoKind = token === "demo" || token === "demo-pre" ? "pre" : token === "demo-letter" ? "letter" : null;
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"" | "changes">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demoKind || !LIVE) return setV(DEMO_VIEW(demoKind ?? "pre"));
    fetch(`/api/approve/${encodeURIComponent(token)}`).then((r) => r.json()).then((j) => (j.ok ? setV(j) : setErr(j.reason))).catch(() => setErr("offline"));
  }, [token, demoKind]);

  const decide = async (decision: "approve" | "changes") => {
    if (!v) return;
    if (decision === "changes" && !note.trim()) return;
    setBusy(true);
    if (demoKind || !LIVE) { setV({ ...v, status: decision === "approve" ? "approved" : "sent_back", note }); setBusy(false); return; }
    try {
      const r = await fetch(`/api/approve/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note }) });
      const j = await r.json();
      if (j.ok) setV({ ...v, status: j.status, note });
      else setErr(j.reason);
    } catch { setErr("offline"); }
    setBusy(false);
  };

  if (err) return <Shell co={v?.company ?? null}><div className="orq-card"><h1>{err === "expired" ? "This link has expired" : "This link isn't working"}</h1><p className="muted">{err === "offline" ? "Check your connection and try again." : "Reply to the email and HR will send a fresh one."}</p></div></Shell>;
  if (!v) return <Shell co={null}><div style={{ minHeight: 300 }} /></Shell>;
  const pre = v.kind === "pre";
  const name = v.rows.find((r) => r[0] === "New hire")?.[1] ?? "";

  if (v.status !== "waiting")
    return (
      <Shell co={v.company}>
        <div className="orq-card orq-done">
          <div className="orq-check" aria-hidden="true">{v.status === "approved" ? "✓" : "↩"}</div>
          <h1>{v.status === "approved" ? "Approved" : "Sent back"}</h1>
          <p>{v.status === "approved" ? (pre ? `Thanks. HR will write ${name}'s offer letter next.` : `Thanks. HR will send the offer to ${v.first} to sign.`) : `HR has your note${pre && v.requester ? `, and ${v.requester.split(" ")[0]} will hear back` : ""}.`}</p>
          {v.note && <p className="muted small">&ldquo;{v.note}&rdquo;</p>}
        </div>
      </Shell>
    );

  return (
    <Shell co={v.company}>
      <div className="orq-card">
        <div className="orq-k">{pre ? "Offer request" : "Offer letter"}</div>
        <h1>{pre ? `Approve an offer for ${name}?` : `Look over ${v.first}'s offer letter`}</h1>
        <p className="muted">{pre ? `${v.requester || "A hiring manager"} wants to make this offer.` : `HR wrote it from your request. Once you approve, HR sends it to ${v.first} to sign.`}</p>
        {v.letter && <a className="btn block orq-letter" href={v.letter.url} target="_blank" rel="noreferrer">Open the offer letter · {v.letter.name}</a>}
        <table className="orq-rows"><tbody>{v.rows.map(([k, val]) => <tr key={k}><td>{k}</td><td>{val}</td></tr>)}</tbody></table>
        {mode === "changes" ? (
          <>
            <label className="f">{pre ? "Why are you sending it back?" : "What should change?"}<textarea className="f" autoFocus style={{ minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={pre ? "e.g. Let's start at $22 and review at 90 days." : "e.g. Start date is the 15th, not the 8th."} /></label>
            <div className="orq-btns">
              <button className="btn" onClick={() => setMode("")}>Back</button>
              <button className="btn primary" disabled={busy || !note.trim()} onClick={() => decide("changes")}>{pre ? "Send back" : "Ask for changes"}</button>
            </div>
          </>
        ) : (
          <div className="orq-btns">
            <button className="btn" onClick={() => setMode("changes")}>{pre ? "Send back" : "Ask for changes"}</button>
            <button className="btn primary" disabled={busy} onClick={() => decide("approve")}>Approve</button>
          </div>
        )}
      </div>
    </Shell>
  );
}
