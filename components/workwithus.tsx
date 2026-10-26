"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { DEFAULT_BOOKING_URL } from "@/lib/state";

/** For people who land on the portal but aren't clients: a calm, non-salesy way to reach Ben. */
export function WorkWithUs({ compact }: { compact?: boolean }) {
  const { bookingUrl: saved } = useStore();
  const bookingUrl = saved || DEFAULT_BOOKING_URL;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", company: "", size: "", need: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const send = async () => {
    if (f.name.trim().length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email.trim())) return setErr("Add your name and email.");
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json();
      if (!j.ok) throw new Error();
      setDone(true);
    } catch {
      setErr("That didn't send. Email ben@alzapc.com instead.");
    }
    setBusy(false);
  };

  return (
    <div className={`work-with ${compact ? "compact" : ""}`}>
      <b>Not working with AlzaHR yet?</b>
      <p className="small muted" style={{ margin: "4px 0 10px" }}>
        Fractional HR for growing companies: policies, hiring, onboarding, employee issues, and a portal like this one for your team. No full-time HR hire needed.
      </p>
      {done ? (
        <p className="small" style={{ color: "var(--green)" }}>Thanks. Ben will be in touch within a business day.</p>
      ) : !open ? (
        <div className="chips" style={{ marginTop: 0 }}>
          {bookingUrl && <a className="btn sm primary" href={bookingUrl} target="_blank" rel="noopener noreferrer">Book a free call</a>}
          <button className="btn sm" onClick={() => setOpen(true)}>Contact Ben</button>
          <a className="btn ghost sm" href="https://www.alzapc.com" target="_blank" rel="noopener">alzapc.com</a>
        </div>
      ) : (
        <div>
          <div className="two">
            <input className="f" placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
            <input className="f" type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
          </div>
          <div className="two" style={{ marginTop: 8 }}>
            <input className="f" placeholder="Company" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} autoComplete="organization" />
            <select className="f" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })}>
              <option value="">Team size</option>
              {["1-10", "11-25", "26-50", "51-100", "100+"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <textarea className="f" style={{ marginTop: 8, minHeight: 70 }} placeholder="What's going on? (optional)" value={f.need} onChange={(e) => setF({ ...f, need: e.target.value })} />
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1 }} value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} name="website" />
          {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
          <div className="sheet-actions" style={{ marginTop: 8 }}>
            <button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn primary sm" disabled={busy} onClick={send}>{busy ? "Sending..." : "Send to Ben"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
