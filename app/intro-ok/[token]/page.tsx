"use client";

// HR approves a company intro from their email: see exactly what goes out, then send it.
// Nothing sends until the button here is tapped (email scanners open links on their own).
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Info = { name: string; company: string; accent: string; html: string; subject: string; count: number; audience: string; sent: string | null; sentTo: number; cancelled: boolean; hireUrl: string };

export default function IntroOk() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`/api/intro-ok/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.ok ? setInfo(j) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [token]);

  if (missing) return <div className="ex-page"><div className="ex-card"><h1>This link isn&apos;t working</h1><p className="ex-sub">The intro may have been closed or changed. Open the hire in the People Hub to send it from there.</p></div></div>;
  if (!info) return <div className="ex-page" />;

  const send = async () => {
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/intro-ok/${encodeURIComponent(token)}`, { method: "POST" }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (r.ok) setInfo({ ...info, sent: new Date().toISOString(), sentTo: r.sent ?? info.count });
    else setErr(r.reason === "not_approved" ? `${info.name.split(" ")[0]} pulled back their approval, so it can't go out.` : r.reason === "no_recipients" ? "No one on the roster has an email yet, so there's no one to send it to." : "Couldn't send. Try again, or send it from the People Hub.");
  };

  return (
    <div className="ex-page wl" style={{ ["--ex" as string]: info.accent }}>
      <div className="ex-card" style={{ maxWidth: 680 }}>
        <b className="ex-co">{info.company}</b>
        {info.sent ? (
          <div className="ex-thanks" style={{ padding: "18px 0 8px" }}>
            <h1>Sent!</h1>
            <p className="ex-sub">{info.name.split(" ")[0]}&apos;s intro went to {info.sentTo} {info.sentTo === 1 ? "person" : "people"}.</p>
          </div>
        ) : (
          <>
            <h1>Ready to send {info.name.split(" ")[0]}&apos;s intro?</h1>
            <p className="ex-sub">It goes to {info.count} {info.count === 1 ? "person" : "people"} ({info.audience === "all" ? "everyone on the roster" : "their location and their manager"}){info.cancelled ? ". It's set to not send, but you can send it anyway" : ""}.</p>
            <div className="wl-nav">
              <button className="ex-send" disabled={busy || !info.count} onClick={send}>{busy ? "Sending…" : "Approve and send"}</button>
              <a className="wl-back" href={info.hireUrl} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Change it first</a>
            </div>
            {err && <p className="ex-err">{err}</p>}
          </>
        )}
        <p className="tiny" style={{ margin: "18px 0 6px" }}>Subject: <b>{info.subject}</b></p>
        <iframe title="Email preview" srcDoc={info.html} sandbox="" style={{ width: "100%", height: 720, border: "1px solid #e6e0d8", borderRadius: 12, background: "#EAE5DE" }} />
      </div>
    </div>
  );
}
