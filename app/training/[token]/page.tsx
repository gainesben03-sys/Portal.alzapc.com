"use client";

// The employee's required training, from an email link. No login. English or Spanish.
// Harassment training: open the state's free course, add the certificate, confirm. Done.
// Workplace violence: read the plan, watch the video, ask a question if they have one, sign off.
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Lang = "en" | "es";
type Item = {
  id: string; course: string; about: string; kind: "crd" | "plan" | "custom"; proof: "certificate" | "signoff"; variant?: "supervisor" | "employee";
  status: "assigned" | "submitted" | "approved" | "sentback"; due: string; completedAt?: string; note?: string;
  link: string; links: { id: string; label: string; url: string }[]; plan: string | null; planName: string; video: string; qa: string; questions: boolean; minutes: number;
  asked: { q: string; answer: string }[];
};
type Info = { company: string; accent: string; logo: string | null; first: string; items: Item[] };

const DEMO: Info = {
  company: "Harborlight Events", accent: "#0f766e", logo: null, first: "Andi",
  items: [
    { id: "d1", course: "Harassment prevention", about: "California requires it every 2 years. Free course from the state's Civil Rights Department.", kind: "crd", proof: "certificate", variant: "employee", status: "assigned", due: new Date(Date.now() + 140 * 864e5).toISOString().slice(0, 10),
      link: "https://sexual-harassment-prevention-training.calcivilrights.ca.gov/NonSupervisoryEnglish/story.html",
      links: [["English", "English"], ["Spanish", "Español"], ["Chinese", "中文"], ["Korean", "한국어"], ["Vietnamese", "Tiếng Việt"], ["Tagalog", "Tagalog"]].map(([id, label]) => ({ id, label, url: `https://sexual-harassment-prevention-training.calcivilrights.ca.gov/NonSupervisory${id}/story.html` })),
      plan: null, planName: "", video: "", qa: "", questions: false, minutes: 60, asked: [] },
    { id: "d2", course: "Workplace violence prevention", about: "Once a year, everyone reviews our safety plan and gets a chance to ask questions.", kind: "plan", proof: "signoff", status: "assigned", due: new Date(Date.now() + 50 * 864e5).toISOString().slice(0, 10),
      link: "", links: [], plan: "#", planName: "Harborlight Workplace Violence Prevention Plan.pdf", video: "", qa: "Thursday, Jan 8 at 12:00 on video", questions: true, minutes: 20, asked: [] },
  ],
};

const T = {
  en: {
    hi: (n: string) => `Hi ${n}`, intro: "Here's your required training and when it's due.", due: "Due", done: "Done", checking: "HR is checking", fix: "Needs a fix", open: "Open", back: "Back",
    private: "Your certificates are private. Only you and HR can see them.", missing: "This link isn't available", missingP: "It may have changed. Check with HR.",
    step1: "Take the course", pickLang: "Pick your language. It saves your place if you stop.", saveCert: "At the end, save or screenshot your certificate.",
    step2: "Add your certificate", addFile: "Take a photo or choose a file", change: "Change", uploading: "Uploading…",
    step3: "Confirm", attest: "I completed this training myself.", send: "Send to HR", sending: "Sending…",
    allSet: (n: string) => `You're all set, ${n}`, nextDue: (d: string) => `Next one is due ${d}. We'll remind you.`, hrCheck: "HR has your certificate and will check it. We'll email you if anything's off.",
    plan: "Read our plan", planP: "The full plan. Take a few minutes with it.", openPlan: "Open the plan", video: "Watch the video", openVideo: "Play the video",
    q: "Any questions?", qP: "Ask about our plan. HR answers by email.", qPh: "For example: who do I call if a customer threatens someone after hours?", ask: "Send question", asked: "Sent. HR will answer by email.", yourQ: "You asked", answer: "Answer",
    live: "Live Q&A", sign: "Sign off", signText: "I reviewed the workplace violence prevention plan and had a chance to ask questions.", signBtn: "Sign off", course: "Open the course", proofNote: "Note from HR",
    v: { supervisor: "Supervisor course, 2 hours", employee: "Employee course, 1 hour" }, err: "Something went wrong. Try again.", fileErr: "Use a photo or a PDF under 15 MB.", demo: "Uploads are off in the demo.",
  },
  es: {
    hi: (n: string) => `Hola ${n}`, intro: "Esta es su capacitación obligatoria y cuándo vence.", due: "Vence", done: "Lista", checking: "RR. HH. revisando", fix: "Hay que corregir", open: "Abrir", back: "Atrás",
    private: "Sus certificados son privados. Solo usted y RR. HH. los ven.", missing: "Este enlace no está disponible", missingP: "Puede que haya cambiado. Pregunte a RR. HH.",
    step1: "Tome el curso", pickLang: "Elija su idioma. Guarda su avance si se detiene.", saveCert: "Al final, guarde o tome una captura de su certificado.",
    step2: "Agregue su certificado", addFile: "Tome una foto o elija un archivo", change: "Cambiar", uploading: "Subiendo…",
    step3: "Confirme", attest: "Yo mismo/a completé esta capacitación.", send: "Enviar a RR. HH.", sending: "Enviando…",
    allSet: (n: string) => `Listo, ${n}`, nextDue: (d: string) => `La próxima vence ${d}. Le avisaremos.`, hrCheck: "RR. HH. tiene su certificado y lo revisará. Le escribiremos si falta algo.",
    plan: "Lea nuestro plan", planP: "El plan completo. Tómese unos minutos.", openPlan: "Abrir el plan", video: "Vea el video", openVideo: "Ver el video",
    q: "¿Tiene preguntas?", qP: "Pregunte sobre nuestro plan. RR. HH. responde por correo.", qPh: "Por ejemplo: ¿a quién llamo si un cliente amenaza a alguien después de horas?", ask: "Enviar pregunta", asked: "Enviada. RR. HH. responderá por correo.", yourQ: "Usted preguntó", answer: "Respuesta",
    live: "Preguntas en vivo", sign: "Firme", signText: "Revisé el plan de prevención de violencia en el trabajo y tuve la oportunidad de hacer preguntas.", signBtn: "Firmar", course: "Abrir el curso", proofNote: "Nota de RR. HH.",
    v: { supervisor: "Curso para supervisores, 2 horas", employee: "Curso para empleados, 1 hora" }, err: "Algo salió mal. Intente otra vez.", fileErr: "Use una foto o un PDF de menos de 15 MB.", demo: "En la demo no se suben archivos.",
  },
};

const fmt = (d: string | undefined, lang: Lang) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "long", day: "numeric", year: "numeric" }) : "");
const addYears = (d: string, months: number) => { const x = new Date(`${d}T12:00:00`); x.setMonth(x.getMonth() + months); return x.toISOString().slice(0, 10); };

export default function MyTraining() {
  const { token } = useParams<{ token: string }>();
  const demo = token === "demo";
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    try { if (navigator.language?.toLowerCase().startsWith("es")) setLang("es"); } catch {}
    fetch(`/api/training/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.ok ? setInfo(j) : demo || j.reason === "demo" ? setInfo(DEMO) : setMissing(true)))
      .catch(() => (demo ? setInfo(DEMO) : setMissing(true)));
  }, [token, demo]);
  const t = T[lang];
  if (missing) return <div className="ex-page"><div className="ex-card"><h1>{t.missing}</h1><p className="ex-sub">{t.missingP}</p></div></div>;
  if (!info) return <div className="ex-page" />;
  const item = info.items.find((x) => x.id === open);
  const update = (id: string, p: Partial<Item>) => setInfo({ ...info, items: info.items.map((x) => (x.id === id ? { ...x, ...p } : x)) });

  return (
    <div className="ex-page my-rv tr-me" style={{ ["--ex" as string]: info.accent, ["--accent" as string]: info.accent }}>
      <div className="my-rv-top">
        {info.logo ? <img src={info.logo} alt={info.company} /> : <b>{info.company}</b>}
        <div className="pf-lang" role="group" aria-label="Language">
          <button className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
          <button className={lang === "es" ? "on" : ""} aria-pressed={lang === "es"} onClick={() => setLang("es")}>Español</button>
        </div>
      </div>
      <div className="my-rv-body">
        {!item ? (
          <>
            <h1 className="my-rv-h">{t.hi(info.first)}</h1>
            <p className="my-rv-p">{t.intro}</p>
            <div className="tr-me-list">
              {info.items.map((x) => {
                const st = x.status === "approved" ? { l: t.done, c: "green" } : x.status === "submitted" ? { l: t.checking, c: "blue" } : x.status === "sentback" ? { l: t.fix, c: "gold" } : { l: `${t.due} ${fmt(x.due, lang)}`, c: x.due < new Date().toISOString().slice(0, 10) ? "red" : "gold" };
                const actionable = x.status === "assigned" || x.status === "sentback";
                return (
                  <button key={x.id} className="tr-me-card" onClick={() => setOpen(x.id)}>
                    <span className="row" style={{ justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}><b>{x.course}</b><span className={`pf-chip ${st.c}`}>{st.l}</span></span>
                    <span className="tiny muted" style={{ textAlign: "left" }}>{x.variant ? t.v[x.variant] : x.minutes ? `${x.minutes} min` : ""}{x.status === "approved" && x.completedAt ? ` · ${fmt(x.completedAt, lang)}` : ""}</span>
                    {actionable && <span className="tr-me-go">{t.open} →</span>}
                  </button>
                );
              })}
            </div>
            <p className="tiny muted" style={{ marginTop: 16 }}>{t.private}</p>
          </>
        ) : (
          <Detail item={item} lang={lang} token={token} demo={demo} first={info.first} onBack={() => setOpen(null)} onChange={(p) => update(item.id, p)} />
        )}
      </div>
    </div>
  );
}

function Detail({ item, lang, token, demo, first, onBack, onChange }: { item: Item; lang: Lang; token: string; demo: boolean; first: string; onBack: () => void; onChange: (p: Partial<Item>) => void }) {
  const t = T[lang];
  const [opened, setOpened] = useState(false);
  const [file, setFile] = useState<{ path: string; name: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [attest, setAttest] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [qSent, setQSent] = useState(false);
  const [sawPlan, setSawPlan] = useState(false);
  const post = (body: object) => (demo ? Promise.resolve({ ok: true, demo: true } as Record<string, any>) : fetch(`/api/training/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, id: item.id }) }).then((r) => r.json()).catch(() => ({ ok: false }))); // eslint-disable-line @typescript-eslint/no-explicit-any
  const done = item.status === "approved" || item.status === "submitted";
  const months = item.kind === "crd" ? 24 : 12;

  if (done) return (
    <div className="my-rv-center">
      <span className="my-rv-check" aria-hidden="true">✓</span>
      <h1 className="my-rv-h">{t.allSet(first)}</h1>
      <p className="my-rv-p">{item.status === "submitted" ? t.hrCheck : t.nextDue(fmt(addYears(item.completedAt ?? new Date().toISOString().slice(0, 10), months), lang))}</p>
      <button className="btn" onClick={onBack}>{t.back}</button>
    </div>
  );

  const upload = async (f: File) => {
    setErr("");
    if (!/^(image\/|application\/pdf)/.test(f.type) || f.size > 15 * 1024 * 1024) return setErr(t.fileErr);
    if (demo) { setFile({ path: "demo", name: f.name }); return; }
    setBusy("up");
    const r = await post({ action: "upload", mime: f.type, size: f.size });
    if (!r.ok) { setBusy(""); return setErr(r.reason === "file" ? t.fileErr : t.err); }
    const put = await fetch(r.url, { method: "PUT", headers: { "Content-Type": f.type }, body: f }).catch(() => null);
    setBusy("");
    if (!put?.ok) return setErr(t.err);
    setFile({ path: r.path, name: f.name });
  };
  const submit = async () => {
    setBusy("send");
    setErr("");
    const r = item.proof === "signoff" ? await post({ action: "signoff", attest: true }) : await post({ action: "submit", path: file?.path, attest: true });
    setBusy("");
    if (!r.ok) return setErr(t.err);
    const today = new Date().toISOString().slice(0, 10);
    onChange(r.demo ? { status: "approved", completedAt: today } : { status: r.status, completedAt: r.completedAt });
  };
  const ready = item.proof === "signoff" ? attest : !!file && attest;
  let n = 0;
  const k = () => ++n;
  return (
    <>
      <button className="linklike small" onClick={onBack}>← {t.back}</button>
      <h1 className="my-rv-h" style={{ marginTop: 10 }}>{item.course}</h1>
      <p className="my-rv-p" style={{ marginBottom: 6 }}>{item.about}</p>
      <p className="tiny muted" style={{ margin: "0 0 14px" }}>{item.variant ? `${t.v[item.variant]} · ` : ""}{t.due} {fmt(item.due, lang)}</p>
      {item.status === "sentback" && item.note && <div className="tr-note"><b>{t.proofNote}:</b> {item.note}</div>}

      {(item.kind === "crd" || item.kind === "custom") && (
        <Step n={k()} title={t.step1} ok={opened}>
          {item.kind === "crd" ? (
            <>
              <p className="small muted" style={{ margin: 0 }}>{t.pickLang}</p>
              <div className="tr-langs">
                {item.links.map((l) => <a key={l.id} className={`btn ${(lang === "es" ? "Spanish" : "English") === l.id ? "primary" : ""}`} href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>{l.label} ↗</a>)}
              </div>
            </>
          ) : item.link ? <a className="btn" href={item.link} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>{t.course} ↗</a> : null}
          {item.proof === "certificate" && <p className="tiny muted" style={{ margin: 0 }}>{t.saveCert}</p>}
        </Step>
      )}

      {item.kind === "plan" && (
        <>
          <Step n={k()} title={t.plan} ok={sawPlan}>
            <p className="small muted" style={{ margin: 0 }}>{t.planP}</p>
            {item.plan ? <a className="btn" href={item.plan} target="_blank" rel="noopener noreferrer" onClick={() => setSawPlan(true)}>{t.openPlan} ↗</a> : <span className="small muted">{item.planName}</span>}
          </Step>
          {item.video && (
            <Step n={k()} title={t.video} ok={opened}>
              <a className="btn" href={item.video} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>{t.openVideo} ↗</a>
            </Step>
          )}
          {(item.questions || item.qa) && (
            <Step n={k()} title={t.q} ok={qSent || item.asked.length > 0}>
              {item.questions && (
                <>
                  <p className="small muted" style={{ margin: 0 }}>{t.qP}</p>
                  {item.asked.map((a, i) => <div key={i} className="tr-qa"><div className="tiny muted">{t.yourQ}</div><div className="small">{a.q}</div>{a.answer && <><div className="tiny muted" style={{ marginTop: 6 }}>{t.answer}</div><div className="small">{a.answer}</div></>}</div>)}
                  {qSent ? <p className="small" style={{ margin: 0 }}>{t.asked}</p> : (
                    <>
                      <textarea className="my-rv-in" rows={3} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.qPh} />
                      <button className="btn" disabled={!q.trim() || busy === "q"} onClick={async () => { setBusy("q"); const r = await post({ action: "question", text: q }); setBusy(""); if (r.ok) { setQSent(true); onChange({ asked: [...item.asked, { q, answer: "" }] }); } else setErr(t.err); }}>{t.ask}</button>
                    </>
                  )}
                </>
              )}
              {item.qa && <p className="small" style={{ margin: 0 }}><b>{t.live}:</b> {item.qa}</p>}
            </Step>
          )}
        </>
      )}

      {item.proof === "certificate" && (
        <Step n={k()} title={t.step2} ok={!!file}>
          {file ? (
            <span className="tr-file-ok"><b className="small">{file.name}</b><label className="linklike small" style={{ cursor: "pointer" }}>{t.change}<input type="file" accept="image/*,application/pdf" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label></span>
          ) : (
            <label className="tr-upload">{busy === "up" ? t.uploading : t.addFile}<input type="file" accept="image/*,application/pdf" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
          )}
        </Step>
      )}

      <Step n={k()} title={item.proof === "signoff" ? t.sign : t.step3} ok={attest}>
        <label className="tr-attest"><input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} /><span>{item.proof === "signoff" ? t.signText : t.attest}</span></label>
      </Step>

      {err && <p className="small" style={{ color: "#b42318" }}>{err}</p>}
      <button className="btn primary block" style={{ marginTop: 6 }} disabled={!ready || !!busy} onClick={submit}>{busy === "send" ? t.sending : item.proof === "signoff" ? t.signBtn : t.send}</button>
    </>
  );
}

function Step({ n, title, ok, children }: { n: number; title: string; ok: boolean; children: React.ReactNode }) {
  return (
    <section className="tr-step">
      <span className="row" style={{ gap: 10 }}><span className={`tr-num ${ok ? "ok" : ""}`}>{ok ? "✓" : n}</span><b>{title}</b></span>
      {children}
    </section>
  );
}
