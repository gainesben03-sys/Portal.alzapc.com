"use client";

import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";

type Info = {
  ok: boolean;
  status: "open" | "signed" | "declined" | "voided" | "expired" | "viewed" | "sent";
  company: string;
  accent: string;
  logo: string | null;
  hrEmail: string;
  title: string;
  signer: string;
  body?: string;
  signedAt?: string;
  download?: string | null;
  reason?: string;
};

/** Render the letter line by line: headings, bullet lists and paragraphs. */
function Letter({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const strip = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
  const flush = () => {
    if (para.length) out.push(<p key={out.length}>{para.map((l, j) => <span key={j}>{j > 0 && <br />}{strip(l)}</span>)}</p>);
    if (list.length) out.push(<ul key={out.length}>{list.map((l, j) => <li key={j}>{strip(l)}</li>)}</ul>);
    para = [];
    list = [];
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const head = /^#{1,6}\s+(.*)$/.exec(line.trim());
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (!line.trim()) flush();
    else if (head) {
      flush();
      out.push(<h3 key={out.length}>{strip(head[1])}</h3>);
    } else if (bullet) {
      if (para.length) {
        const p2 = para;
        para = [];
        out.push(<p key={out.length}>{p2.map((l, j) => <span key={j}>{j > 0 && <br />}{strip(l)}</span>)}</p>);
      }
      list.push(bullet[1]);
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return <div className="sign-letter">{out}</div>;
}

export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    fetch(`/api/esign/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setInfo(j) : setLoadErr(true)))
      .catch(() => setLoadErr(true));
  }, [token]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/esign/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.ok) setInfo((i) => (i ? { ...i, status: j.status, signedAt: j.signedAt, download: j.download } : i));
      else setErr(j.reason === "name" ? "Type your full name to sign." : j.reason === "consent" ? "Check the box to agree to sign electronically." : j.reason === "expired" ? "This link has expired." : "Something went wrong. Please try again.");
    } catch {
      setErr("Couldn't connect. Check your internet connection and try again.");
    }
    setBusy(false);
  };

  if (loadErr)
    return (
      <main className="sign-wrap">
        <div className="card sign-card"><h1>This link isn&apos;t valid</h1><p className="small muted">It may have been replaced by a newer one. Check your email for the latest link, or reply to the person who sent it.</p></div>
      </main>
    );
  if (!info) return <main className="sign-wrap"><p className="small muted" style={{ textAlign: "center", marginTop: 80 }}>Loading...</p></main>;

  const first = info.signer.split(" ")[0];
  const brand = { ["--accent" as string]: info.accent };
  const header = (
    <div className="sign-head">
      {info.logo ? <img src={info.logo} alt={info.company} /> : <span className="sign-co">{info.company}</span>}
    </div>
  );

  if (info.status === "signed")
    return (
      <main className="sign-wrap" style={brand}>
        {header}
        <div className="card sign-card done">
          <div className="sign-check" aria-hidden="true">✓</div>
          <h1 style={{ margin: "0 0 8px" }}>Signed. Thank you, {first}.</h1>
          <p className="small muted" style={{ margin: "0 0 18px" }}>A signed PDF copy is on its way to your email.{info.signedAt ? ` Signed ${new Date(info.signedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}.` : ""}</p>
          {info.download && <a className="btn primary" href={info.download} target="_blank" rel="noopener">Download signed PDF</a>}
        </div>
      </main>
    );
  if (info.status !== "open")
    return (
      <main className="sign-wrap" style={brand}>
        {header}
        <div className="card sign-card">
          <h1>{info.status === "declined" ? "You declined this document" : info.status === "expired" ? "This link has expired" : "This link is no longer active"}</h1>
          <p className="small muted">Questions? Email {info.hrEmail ? <a href={`mailto:${info.hrEmail}`}>{info.hrEmail}</a> : "the person who sent it"}.</p>
        </div>
      </main>
    );

  const canSign = agree && name.trim().length >= 2 && !busy;
  return (
    <main className="sign-wrap" style={brand}>
      {header}
      <div className="sign-intro">
        <h1>{info.title}</h1>
        <p className="small muted">{info.company} sent this to {info.signer}. Read it through, then sign at the bottom.</p>
      </div>
      <div className="card sign-paper">{info.body && <Letter text={info.body} />}</div>

      <div className="card sign-card">
        <h2 style={{ marginBottom: 8 }}>Sign</h2>
        <label className="sign-consent">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I agree to sign this document electronically and to receive it electronically. My typed name below is my legal signature, the same as signing by hand.</span>
        </label>
        <label className="f">Type your full name
          <input className="f" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={info.signer} />
        </label>
        <div className="sign-preview" aria-label="Your signature">{name.trim() || " "}</div>
        {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
        <button className="btn primary block" disabled={!canSign} onClick={() => post({ action: "sign", name, agree })}>{busy ? "Signing..." : `Sign ${info.title.toLowerCase()}`}</button>
        <p className="tiny muted" style={{ marginTop: 10 }}>We record the date, time and your IP address with your signature, and email you a signed PDF.</p>

        {!declining ? (
          <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setDeclining(true)}>I have questions or don&apos;t want to sign</button>
        ) : (
          <div style={{ marginTop: 12 }}>
            <p className="small">Have questions first? Email {info.hrEmail ? <a href={`mailto:${info.hrEmail}`}>{info.hrEmail}</a> : "the person who sent this"} and keep this link to sign later. To decline instead:</p>
            <textarea className="f" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional: let them know why" />
            <div className="action-foot" style={{ justifyContent: "flex-end" }}>
              <button className="btn ghost sm" onClick={() => setDeclining(false)}>Back</button>
              <button className="btn sm" style={{ color: "var(--red)" }} disabled={busy} onClick={() => post({ action: "decline", reason })}>Decline to sign</button>
            </div>
          </div>
        )}
      </div>
      <p className="tiny muted" style={{ textAlign: "center", margin: "18px 0 40px" }}>Secure signing by the AlzaHR client portal</p>
    </main>
  );
}
