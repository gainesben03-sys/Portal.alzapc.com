"use client";

// The new hire's get-to-know-you page, opened from their email. No login.
// Answer a few questions, add a photo if they like, then see the intro and approve exactly what's shared.
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_INTRO, DEFAULT_QUESTIONS, PAGE_TEXT, PAGE_TITLE, XQuestion } from "@/lib/experience";

type Info = {
  first: string; preferred: string; last: string; title: string; manager: string; start: string; arrival: string; company: string; accent: string; logo: string | null;
  pageTitle: string; pageText: string; questions: XQuestion[]; answers: Record<string, string>; share: string[] | null; sharePhoto: boolean; photos: boolean; photo?: string;
  submitted: boolean; approved: boolean; sent: boolean; opening: string; closing: string; buddy: string;
};

const SAMPLE: Info = {
  first: "Maya", preferred: "", last: "Torres", title: "Leasing Manager", manager: "Jordan Ellis", start: "Monday, December 1st", arrival: "9:00 AM", company: "Bayside Residential", accent: "#1d4f7a", logo: null,
  pageTitle: PAGE_TITLE, pageText: PAGE_TEXT, questions: DEFAULT_QUESTIONS, answers: {}, share: null, sharePhoto: true, photos: true, submitted: false, approved: false, sent: false,
  opening: DEFAULT_INTRO.message, closing: DEFAULT_INTRO.closing, buddy: "Sam Okafor",
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

export default function Welcome() {
  const { token } = useParams<{ token: string }>();
  const demo = token === "demo" || token === "sample";
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Record<string, string>>({});
  const [pref, setPref] = useState("");
  const [share, setShare] = useState<Set<string>>(new Set());
  const [usePhoto, setUsePhoto] = useState(true);
  const [photo, setPhoto] = useState<string | undefined>();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const load = (i: Info) => {
      setInfo(i);
      setA(i.answers);
      setPref(i.preferred);
      setShare(new Set(i.share ?? i.questions.filter((q) => !q.private).map((q) => q.id)));
      setUsePhoto(i.sharePhoto);
      setPhoto(i.photo);
      if (i.approved) setStep(3);
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
      .replace(/\{job title\}/gi, info.title || "our new team member").replace(/\{manager\}/gi, info.manager || "their manager").replace(/\{company\}/gi, info.company).replace(/\{start date\}/gi, info.start)
      .replace(/\{buddy first\}/gi, info.buddy.split(" ")[0] || "your buddy").replace(/\{buddy\}/gi, info.buddy || "your buddy").replace(/ {2,}/g, " ").replace(/ ([.,!?])/g, "$1");
  const pub = useMemo(() => (info?.questions ?? []).filter((q) => !q.private), [info]);
  const priv = useMemo(() => (info?.questions ?? []).filter((q) => q.private), [info]);
  const lines = pub.filter((q) => (a[q.id] || "").trim());

  if (missing)
    return <div className="ex-page"><div className="ex-card"><h1>This link isn&apos;t working</h1><p className="ex-sub">It may have expired. Reply to your welcome email and HR will send a new one.</p></div></div>;
  if (!info) return <div className="ex-page" />;

  const save = async (approve?: boolean) => {
    setErr("");
    if (demo) return true;
    setBusy(true);
    const r = await fetch(`/api/welcome/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: a, preferred: pref, share: [...share], sharePhoto: usePhoto, approve }),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) setErr(r.reason === "sent" ? "Your intro already went out, so it can't be pulled back now." : "Couldn't save. Check your connection and try again.");
    return !!r.ok;
  };
  const pickPhoto = async (f?: File) => {
    if (!f) return;
    setErr("");
    try {
      const data = await shrink(f);
      if (demo) return setPhoto(data);
      setBusy(true);
      const r = await fetch(`/api/welcome/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "photo", data }) }).then((x) => x.json()).catch(() => ({ ok: false }));
      setBusy(false);
      if (r.ok) setPhoto(r.photo || data);
      else setErr("That photo didn't upload. Try a JPG or PNG.");
    } catch {
      setBusy(false);
      setErr("That photo didn't open. Try a JPG or PNG.");
    }
  };
  const removePhoto = async () => {
    if (!demo) await fetch(`/api/welcome/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "removePhoto" }) }).catch(() => undefined);
    setPhoto(undefined);
  };
  const steps = info.photos ? 3 : 2;
  const go = async (n: number) => {
    if (n > step && step === 0 && !(await save())) return;
    window.scrollTo(0, 0);
    setStep(!info.photos && n === 1 ? (step === 0 ? 2 : 0) : n);
  };
  const initials = `${name[0] ?? ""}${info.last[0] ?? ""}`.toUpperCase();

  return (
    <div className="ex-page wl" style={{ ["--ex" as string]: info.accent }}>
      <div className="ex-card">
        {info.logo ? <img src={info.logo} alt={info.company} className="ex-logo" /> : <b className="ex-co">{info.company}</b>}
        {step < 3 && <div className="wl-steps" aria-label={`Step ${Math.min(step, steps - 1) + 1} of ${steps}`}>{Array.from({ length: steps }, (_, i) => <span key={i} className={i <= (info.photos ? step : step === 2 ? 1 : 0) ? "on" : ""} />)}</div>}

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
              {photo && <button className="wl-link" onClick={removePhoto}>Remove</button>}
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
              {photo && (
                <label className="wl-line"><input type="checkbox" checked={usePhoto} onChange={(e) => setUsePhoto(e.target.checked)} /><span><b>My photo</b></span></label>
              )}
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
            <p className="ex-sub" style={{ fontSize: 13 }}>Changed your mind later? Come back to this link any time before your first day.</p>
          </>
        )}

        {step === 3 && (
          <div className="ex-thanks" style={{ padding: "24px 0 8px" }}>
            <h1>Thanks, {name}!</h1>
            <p className="ex-sub">{info.sent ? "Your intro went out to the team." : `Your intro goes to the team on your first day${info.start ? `, ${info.start}` : ""}.`}{info.buddy ? ` Your onboarding buddy is ${info.buddy}.` : ""}</p>
            {info.start && (
              <div className="wl-day"><div className="tiny">Your first day</div><b>{info.start}{info.arrival ? ` at ${info.arrival}` : ""}</b>{info.manager && <div>Ask for {info.manager}, your manager</div>}</div>
            )}
            {!info.sent && <button className="wl-link" onClick={() => { setOk(false); setStep(2); }}>Change my intro</button>}
            {!info.sent && <button className="wl-link" onClick={async () => { if (await save(false)) { setInfo({ ...info, approved: false }); setStep(2); } }}>Don&apos;t share my intro</button>}
          </div>
        )}

        {err && <p className="ex-err">{err}</p>}
        {step < 3 && (
          <div className="wl-nav">
            {step > 0 && <button className="wl-back" onClick={() => go(step - 1)}>Back</button>}
            {step < 2 && <button className="ex-send" disabled={busy} onClick={() => go(step + 1)}>{busy ? "Saving…" : step === 1 && !photo ? "Skip for now" : "Next"}</button>}
            {step === 2 && (
              <button className="ex-send" disabled={busy || !ok} onClick={async () => { if (await save(true)) { setInfo({ ...info, approved: true }); setStep(3); } }}>
                {busy ? "Saving…" : "Approve my intro"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
