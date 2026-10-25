"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { canRecord, clearLocal, loadLocal, mediaError, openStream, PitchKind, Recording, saveLocal, startRecording, stopStream, upload } from "@/lib/recorder";

type Info = {
  ok: boolean;
  open: boolean;
  company: string;
  accent: string;
  logo: string | null;
  role: { title: string; location?: string; type?: string; dept?: string };
  intro: string;
  prompts: string[];
  maxSeconds: number;
  allowUpload: boolean;
  allowAudio: boolean;
  allowWritten: boolean;
  askResume: boolean;
  askLinkedin: boolean;
  limits: { uploadMB: number; resumeMB: number };
};
type Mode = "video" | "upload" | "audio" | "written";
type Step = "intro" | "details" | "record" | "send" | "done";

const REASONS: Record<string, string> = {
  name: "Add your full name.",
  email: "Check your email address.",
  already_applied: "You've already sent a pitch for this role with that email. Thank you! The team has it.",
  closed: "This role isn't taking new pitches right now.",
  too_big: "That video is too large. Record it here instead (it keeps files small), or trim it and try again.",
  resume_too_big: "That resume file is too large. Try a PDF under 10 MB.",
  type: "That file isn't a video or audio file we can use.",
  expired: "This took a while, so the upload link expired. Tap Send again.",
  media_missing: "Your recording didn't finish uploading. Tap Send again; it's saved on this device.",
  resume_missing: "Your resume didn't finish uploading. Tap Send again.",
  text: "Write at least a couple of sentences.",
};

const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function PitchPage() {
  const { slug } = useParams<{ slug: string }>();
  const KEY = `pitch:${slug}`;
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [step, setStep] = useState<Step>("intro");
  const [mode, setMode] = useState<Mode>("video");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [take, setTake] = useState<Recording | null>(null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof loadLocal>>>(null);

  // recorder state
  const stream = useRef<MediaStream | null>(null);
  const live = useRef<HTMLVideoElement>(null);
  const [camOn, setCamOn] = useState(false);
  const [level, setLevel] = useState(0);
  const [count, setCount] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const stopRef = useRef<() => void>(() => {});
  const [previewUrl, setPreviewUrl] = useState("");

  // sending
  const [progress, setProgress] = useState(0);
  const [sendNote, setSendNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/pitch/${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setInfo(j) : setMissing(true)))
      .catch(() => setMissing(true));
    loadLocal(KEY).then((s) => s && Date.now() - s.at < 7 * 864e5 && setSaved(s));
  }, [slug, KEY]);

  // pick a sensible default mode for this device
  useEffect(() => {
    if (!info) return;
    if (!canRecord("video")) setMode(info.allowUpload ? "upload" : info.allowAudio && canRecord("audio") ? "audio" : "written");
  }, [info]);

  const closeCam = useCallback(() => {
    stopStream(stream.current);
    stream.current = null;
    setCamOn(false);
  }, []);
  useEffect(() => () => closeCam(), [closeCam]);
  useEffect(() => {
    if (step !== "record" || (mode !== "video" && mode !== "audio")) closeCam();
  }, [step, mode, closeCam]);

  // keep people from closing the page mid-upload
  useEffect(() => {
    if (!sending) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sending]);

  // (re)attach the live camera whenever the preview element is on screen
  useEffect(() => {
    const v = live.current;
    if (camOn && v && stream.current && v.srcObject !== stream.current) {
      v.srcObject = stream.current;
      v.muted = true;
      v.play().catch(() => {});
    }
  }, [camOn, take, mode, step]);

  useEffect(() => {
    if (!take) return setPreviewUrl("");
    const u = URL.createObjectURL(take.blob);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [take]);

  if (missing)
    return (
      <main className="sign-wrap">
        <div className="card sign-card"><h1>This link isn&apos;t active</h1><p className="small muted">The role may have closed. Check with the person who shared it.</p></div>
      </main>
    );
  if (!info) return <main className="sign-wrap"><p className="small muted" style={{ textAlign: "center", marginTop: 80 }}>Loading...</p></main>;

  const brand = { ["--accent" as string]: info.accent };
  const header = <div className="sign-head">{info.logo ? <img src={info.logo} alt={info.company} /> : <span className="sign-co">{info.company}</span>}</div>;

  if (!info.open)
    return (
      <main className="sign-wrap" style={brand}>
        {header}
        <div className="card sign-card"><h1>{info.role.title}</h1><p className="small muted">This role isn&apos;t taking new pitches right now. Thanks for your interest in {info.company}.</p></div>
      </main>
    );

  // ------------------------------------------------------------ camera
  const startCam = async (kind: PitchKind) => {
    setErr("");
    try {
      closeCam();
      const s = await openStream(kind);
      stream.current = s;
      setCamOn(true);
      if (kind === "video" && live.current) {
        live.current.srcObject = s;
        live.current.muted = true;
        await live.current.play().catch(() => {});
      }
      // mic level, so people can see they're being heard
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ac = new AC();
        const an = ac.createAnalyser();
        an.fftSize = 256;
        ac.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        const loop = () => {
          if (!stream.current) return ac.close().catch(() => {});
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 50));
          requestAnimationFrame(loop);
        };
        loop();
      } catch {}
    } catch (e) {
      setErr(mediaError(e, kind));
    }
  };

  const record = async (kind: PitchKind) => {
    if (!stream.current) await startCam(kind);
    if (!stream.current) return;
    setTake(null);
    for (let i = 3; i > 0; i--) {
      setCount(i);
      await new Promise((r) => setTimeout(r, 900));
    }
    setCount(0);
    setElapsed(0);
    setRecording(true);
    try {
      const r = startRecording(stream.current, kind, info.maxSeconds, setElapsed);
      stopRef.current = r.stop;
      const rec = await r.done;
      setRecording(false);
      if (rec.blob.size < 2000) return setErr("That recording came out empty. Check your camera and microphone, then try again.");
      setTake(rec);
      saveLocal(KEY, { blob: rec.blob, mime: rec.mime, seconds: rec.seconds, kind, name, email, phone, linkedin, at: Date.now() });
      closeCam();
    } catch {
      setRecording(false);
      setErr("Recording stopped unexpectedly. Try again, or upload a video instead.");
    }
  };

  // ------------------------------------------------------------ send
  const send = async (override?: { blob?: Blob; mime?: string; seconds?: number; kind: "video" | "audio" | "written"; text?: string }) => {
    setErr("");
    const kind = override?.kind ?? (mode === "written" ? "written" : mode === "audio" ? "audio" : "video");
    const blob = override?.blob ?? take?.blob;
    const mime = override?.mime ?? take?.mime ?? blob?.type ?? "";
    const seconds = override?.seconds ?? take?.seconds;
    const body = override?.text ?? text;
    if (kind !== "written" && !blob) return setErr("Record or choose your video first.");
    if (kind === "written" && body.trim().length < 20) return setErr("Write at least a couple of sentences.");
    setStep("send");
    setSending(true);
    setProgress(0);
    setSendNote("Getting ready...");
    try {
      const api = async (b: Record<string, unknown>) => {
        for (let i = 0; i < 4; i++) {
          try {
            const r = await fetch(`/api/pitch/${encodeURIComponent(slug)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
            return await r.json();
          } catch {
            setSendNote("Waiting for a connection...");
            await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
          }
        }
        throw new Error("offline");
      };
      const start = await api({ action: "start", name, email, kind, mime, size: blob?.size ?? 0, resume: resume ? { name: resume.name, type: resume.type, size: resume.size } : undefined });
      if (!start.ok) throw new Error(start.reason || "start");
      const total = (blob?.size ?? 0) + (resume?.size ?? 0) || 1;
      if (blob && start.mediaUrl) {
        setSendNote(kind === "video" ? "Sending your video..." : "Sending your recording...");
        await upload(start.mediaUrl, blob, `pitch.${mime.includes("mp4") ? "mp4" : "webm"}`, (f) => setProgress((f * blob.size) / total), (n) => setSendNote(`Connection hiccup. Trying again (${n} of 5)...`));
      }
      if (resume && start.resumeUrl) {
        setSendNote("Sending your resume...");
        await upload(start.resumeUrl, resume, resume.name, (f) => setProgress(((blob?.size ?? 0) + f * resume.size) / total));
      }
      setSendNote("Almost done...");
      const fin = await api({ action: "finish", ticket: start.ticket, seconds, mime, text: body, phone, linkedin, kind });
      if (!fin.ok) throw new Error(fin.reason || "finish");
      await clearLocal(KEY);
      setSaved(null);
      setProgress(1);
      setStep("done");
    } catch (e) {
      const r = (e as Error).message;
      setErr(REASONS[r] ?? (r === "offline" ? "You seem to be offline. Your pitch is saved on this device; tap Send again when you're connected." : "Something went wrong sending your pitch. It's saved on this device, so tap Send again."));
      setStep(r === "already_applied" ? "done" : "record");
    } finally {
      setSending(false);
    }
  };

  const first = name.split(" ")[0];
  const modes: [Mode, string][] = [
    ["video", "Record video"],
    ...(info.allowUpload ? ([["upload", "Upload a video"]] as [Mode, string][]) : []),
    ...(info.allowAudio ? ([["audio", "Audio only"]] as [Mode, string][]) : []),
    ...(info.allowWritten ? ([["written", "Write it"]] as [Mode, string][]) : []),
  ];

  return (
    <main className="sign-wrap pitch" style={brand}>
      {header}

      {saved && step !== "done" && step !== "send" && (
        <div className="card sign-card pitch-saved">
          <b className="small">You have a pitch that didn&apos;t finish sending.</b>
          <div className="tiny muted">Saved on this device{saved.seconds ? `, ${fmtSec(saved.seconds)} long` : ""}.</div>
          <div className="sheet-actions" style={{ justifyContent: "flex-start" }}>
            <button
              className="btn primary sm"
              onClick={() => {
                setName(saved.name);
                setEmail(saved.email);
                setPhone(saved.phone ?? "");
                setLinkedin(saved.linkedin ?? "");
                send({ blob: saved.blob, mime: saved.mime, seconds: saved.seconds, kind: saved.kind, text: saved.text });
              }}
            >
              Send it now
            </button>
            <button className="btn ghost sm" onClick={() => { clearLocal(KEY); setSaved(null); }}>Start over</button>
          </div>
        </div>
      )}

      {step === "intro" && (
        <>
          <div className="sign-intro">
            <div className="tiny muted" style={{ letterSpacing: 2, textTransform: "uppercase" }}>{info.company}</div>
            <h1>{info.role.title}</h1>
            <p className="small muted">{[info.role.location, info.role.type].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="card sign-card">
            <p>{info.intro}</p>
            <h2 style={{ marginTop: 16 }}>What to cover</h2>
            <ul className="pitch-prompts">{info.prompts.map((p, i) => <li key={i}>{p}</li>)}</ul>
            <p className="small muted" style={{ marginTop: 12 }}>Up to {fmtSec(info.maxSeconds)}. Be yourself; no script needed. You can watch it back and re-record before you send. Your video is private to the hiring team and deleted soon after a decision.</p>
            <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => setStep("details")}>Get started</button>
          </div>
        </>
      )}

      {step === "details" && (
        <div className="card sign-card">
          <h2>About you</h2>
          <label className="f">Full name<input className="f" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <label className="f">Email<input className="f" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" /></label>
          <label className="f">Phone <span className="tiny muted">(optional)</span><input className="f" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></label>
          {info.askLinkedin && <label className="f">LinkedIn <span className="tiny muted">(optional)</span><input className="f" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/..." inputMode="url" /></label>}
          {info.askResume && (
            <label className="f">Resume <span className="tiny muted">(optional, PDF or Word)</span>
              <input className="f" type="file" accept=".pdf,.doc,.docx,application/pdf" onChange={(e) => setResume(e.target.files?.[0] ?? null)} />
            </label>
          )}
          {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
          <div className="sheet-actions">
            <button className="btn ghost sm" onClick={() => setStep("intro")}>Back</button>
            <button
              className="btn primary sm"
              onClick={() => {
                if (name.trim().length < 2) return setErr("Add your full name.");
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim())) return setErr("Check your email address.");
                if (resume && resume.size > info.limits.resumeMB * 1048576) return setErr("That resume file is too large. Try a PDF under 10 MB.");
                setErr("");
                setStep("record");
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === "record" && (
        <div className="card sign-card">
          {modes.length > 1 && (
            <div className="seg pitch-modes" style={{ gridTemplateColumns: `repeat(${modes.length}, 1fr)` }}>
              {modes.map(([m, l]) => (
                <button key={m} className={mode === m ? "on" : ""} disabled={recording} onClick={() => { setMode(m); setErr(""); setTake(null); }}>{l}</button>
              ))}
            </div>
          )}

          {(mode === "video" || mode === "audio") && (
            <>
              {mode === "video" && !canRecord("video") && <p className="small" style={{ color: "var(--amber)" }}>This browser can&apos;t record video here.{info.allowUpload ? " Choose Upload a video to use your phone's camera instead." : ""}</p>}
              {!take && (
                <div className={`pitch-stage ${mode}`}>
                  {mode === "video" && <video ref={live} playsInline muted autoPlay className="pitch-live" />}
                  {mode === "audio" && <div className="pitch-audio-dot" style={{ transform: `scale(${1 + level * 0.6})` }} />}
                  {!camOn && (
                    <div className="pitch-overlay">
                      <button className="btn primary" onClick={() => startCam(mode)}>{mode === "video" ? "Turn on camera" : "Turn on microphone"}</button>
                      <div className="tiny" style={{ marginTop: 8, color: "#fff", opacity: 0.85 }}>Your browser will ask for permission.</div>
                    </div>
                  )}
                  {count > 0 && <div className="pitch-count">{count}</div>}
                  {recording && (
                    <div className="pitch-rec">
                      <span className="pitch-dot" /> {fmtSec(elapsed)} / {fmtSec(info.maxSeconds)}
                    </div>
                  )}
                  {camOn && (recording || count > 0) && (
                    <div className="pitch-cue">
                      {info.prompts.map((p, i) => <div key={i}>{i + 1}. {p}</div>)}
                    </div>
                  )}
                </div>
              )}
              {camOn && !recording && !take && count === 0 && (
                <div className="pitch-meter" aria-label="Microphone level"><div style={{ width: `${Math.round(level * 100)}%` }} /></div>
              )}
              {recording && <div className="bar" style={{ marginTop: 8 }}><div style={{ width: `${Math.min(100, (elapsed / info.maxSeconds) * 100)}%` }} /></div>}

              {take && previewUrl && (
                <div>
                  {mode === "video" ? <video src={previewUrl} controls playsInline className="pitch-live" /> : <audio src={previewUrl} controls style={{ width: "100%" }} />}
                  <p className="tiny muted" style={{ marginTop: 6 }}>{fmtSec(take.seconds)} · {(take.blob.size / 1048576).toFixed(1)} MB · saved on this device until it&apos;s sent</p>
                </div>
              )}

              {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
              <div className="sheet-actions">
                {!take && !recording && camOn && count === 0 && <button className="btn primary" onClick={() => record(mode)}>Start recording</button>}
                {recording && <button className="btn primary" onClick={() => stopRef.current()} disabled={elapsed < 3}>Stop</button>}
                {take && (
                  <>
                    <button className="btn ghost sm" onClick={() => { setTake(null); startCam(mode); }}>Record again</button>
                    <button className="btn primary" onClick={() => send()}>Send my pitch</button>
                  </>
                )}
              </div>
            </>
          )}

          {mode === "upload" && (
            <>
              <p className="small">Record a short video with your phone&apos;s camera (or pick one you already have), up to {fmtSec(info.maxSeconds)} and {info.limits.uploadMB} MB.</p>
              <label className="btn block" style={{ marginTop: 10, cursor: "pointer" }}>
                {take ? "Choose a different video" : "Choose or record a video"}
                <input
                  type="file"
                  accept="video/*"
                  capture="user"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    if (f.size > info.limits.uploadMB * 1048576) return setErr(`That video is ${(f.size / 1048576).toFixed(0)} MB, over the ${info.limits.uploadMB} MB limit. Record it here with Record video instead, which keeps it small.`);
                    setErr("");
                    const v = document.createElement("video");
                    v.preload = "metadata";
                    v.onloadedmetadata = () => {
                      const secs = Math.round(v.duration || 0);
                      URL.revokeObjectURL(v.src);
                      const rec = { blob: f, mime: f.type || "video/mp4", seconds: secs };
                      setTake(rec);
                      saveLocal(KEY, { ...rec, kind: "video", name, email, phone, linkedin, at: Date.now() });
                      if (secs > info.maxSeconds + 5) setErr(`Heads up: that's ${fmtSec(secs)}, longer than the ${fmtSec(info.maxSeconds)} they asked for. You can still send it.`);
                    };
                    v.onerror = () => setTake({ blob: f, mime: f.type || "video/mp4", seconds: 0 });
                    v.src = URL.createObjectURL(f);
                  }}
                />
              </label>
              {take && previewUrl && <video src={previewUrl} controls playsInline className="pitch-live" style={{ marginTop: 10 }} />}
              {err && <p className="small" style={{ color: take ? "var(--amber)" : "var(--red)" }}>{err}</p>}
              <div className="sheet-actions">{take && <button className="btn primary" onClick={() => send({ blob: take.blob, mime: take.mime, seconds: take.seconds, kind: "video" })}>Send my pitch</button>}</div>
            </>
          )}

          {mode === "written" && (
            <>
              <p className="small">Not a camera person? Tell them in writing.</p>
              <ul className="pitch-prompts">{info.prompts.map((p, i) => <li key={i}>{p}</li>)}</ul>
              <textarea className="f" style={{ minHeight: 180 }} value={text} onChange={(e) => { setText(e.target.value); if (e.target.value.length % 40 === 0) saveLocal(KEY, { kind: "written", text: e.target.value, name, email, phone, linkedin, at: Date.now() }); }} maxLength={4000} placeholder="A few short paragraphs is perfect." />
              <div className="tiny muted" style={{ textAlign: "right" }}>{text.length} / 4000</div>
              {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
              <div className="sheet-actions"><button className="btn primary" onClick={() => send({ kind: "written", text })}>Send</button></div>
            </>
          )}

          <button className="btn ghost sm" style={{ marginTop: 8 }} disabled={recording} onClick={() => setStep("details")}>Back</button>
        </div>
      )}

      {step === "send" && (
        <div className="card sign-card" style={{ textAlign: "center" }}>
          <h2>Sending...</h2>
          <div className="bar" style={{ marginTop: 14 }}><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <p className="small muted" style={{ marginTop: 10 }}>{sendNote} {progress > 0 && progress < 1 ? `${Math.round(progress * 100)}%` : ""}</p>
          <p className="tiny muted">Keep this page open. If your connection drops, it picks back up.</p>
        </div>
      )}

      {step === "done" && (
        <div className="card sign-card done">
          <div className="sign-check" aria-hidden="true">✓</div>
          <h1 style={{ margin: "0 0 8px" }}>{err ? "Already received" : `Thanks${first ? `, ${first}` : ""}!`}</h1>
          <p className="small muted">{err || `Thanks for applying to ${info.role.title} at ${info.company}. We'll be in touch about next steps. A confirmation is on its way to your email.`}</p>
        </div>
      )}

      <p className="tiny muted" style={{ textAlign: "center", margin: "18px 0 40px" }}>Powered by AlzaHR</p>
    </main>
  );
}
