"use client";

// Ben writes The Pause once a month here. Every company's link shows it with their name.
import { useEffect, useMemo, useState } from "react";
import { AlzaNav, AlzaTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { blankRitual, cleanRituals, monthSlug, PAUSE_SEED, pauseMonthLabel, PauseRitual, PauseWords } from "@/lib/pause";
import { useStore } from "@/lib/store";
import { authHeader, LIVE } from "@/lib/supabase";

type Stat = { clientId: string; month: string; visit: number; start: number; complete: number };
type LinkRow = { id: string; name: string; url: string };
const DEMO_KEY = "alza-demo-pause-v1";

async function api<T>(body: object): Promise<T | null> {
  try {
    const r = await fetch("/api/pause", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify(body) });
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function ConsolePause() {
  const ok = useGuard("advisor");
  const { clients } = useStore();
  const toast = useToast();
  const [list, setList] = useState<PauseRitual[] | null>(null);
  const [stats, setStats] = useState<Stat[]>([]);
  const [statsReady, setStatsReady] = useState(true);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [sel, setSel] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showEs, setShowEs] = useState(false);

  useEffect(() => {
    if (!ok) return;
    if (!LIVE) {
      let l = PAUSE_SEED;
      try { const s = cleanRituals(JSON.parse(localStorage.getItem(DEMO_KEY) ?? "null")); if (s.length) l = s; } catch {}
      setList(l);
      setLinks(clients.map((c) => ({ id: c.id, name: c.name, url: `${location.origin}/pause/demo` })));
      setStats([{ clientId: clients[0]?.id ?? "", month: "2026-11", visit: 38, start: 27, complete: 19 }, { clientId: clients[0]?.id ?? "", month: "2026-10", visit: 44, start: 30, complete: 22 }]);
      return;
    }
    api<{ ok: boolean; rituals: PauseRitual[]; stats: Stat[]; statsReady: boolean; links: LinkRow[] }>({ action: "list" }).then((r) => {
      if (!r?.ok) return toast.show("Couldn't load The Pause");
      setList(r.rituals);
      setStats(r.stats);
      setStatsReady(r.statsReady);
      setLinks(r.links);
    });
  }, [ok, clients]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (list && !sel) setSel(list[0]?.month ?? ""); }, [list, sel]);
  const cur = list?.find((r) => r.month === sel) ?? null;
  const names = useMemo(() => new Map(links.map((l) => [l.id, l.name])), [links]);

  if (!ok) return null;

  const edit = (patch: Partial<PauseRitual>) => {
    if (!list || !cur) return;
    setList(list.map((r) => (r.month === cur.month ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const editEs = (patch: Partial<PauseWords>) => cur && edit({ es: { ...(cur.es ?? {}), ...patch } });
  const addMonth = () => {
    if (!list) return;
    const m = nextMonth(list.map((r) => r.month).sort().pop() ?? new Date().toISOString().slice(0, 7));
    setList([blankRitual(m), ...list]);
    setSel(m);
    setDirty(true);
  };
  const save = async () => {
    if (!list) return;
    setBusy(true);
    if (!LIVE) {
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(list)); } catch {}
      setDirty(false);
      toast.show("Saved");
    } else {
      const r = await api<{ ok: boolean; rituals: PauseRitual[] }>({ action: "save", rituals: list });
      if (r?.ok) { setList(r.rituals); setDirty(false); toast.show("Saved. It's live on every company's link."); } else toast.show("Didn't save. Try again.");
    }
    setBusy(false);
  };
  const copy = (text: string, what: string) => navigator.clipboard?.writeText(text).then(() => toast.show(`${what} copied`), () => toast.show("Couldn't copy"));
  const button = (url: string, title: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto;"><tr><td bgcolor="#cdad7d" style="background:#cdad7d;border-radius:999px;"><a href="${url}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#0d1a2e;text-decoration:none;">Take five minutes for yourself</a></td></tr></table><p style="margin:0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#707070;">This month: ${title.replace(/</g, "&lt;")}</p>`;

  const steps = cur?.steps ?? [];
  const esSteps = cur?.es?.steps ?? [];
  const f = (label: string, v: string, set: (s: string) => void, rows = 0, ph = "") => (
    <label className="f">{label}
      {rows ? <textarea className="f" style={{ minHeight: rows * 24 }} value={v} placeholder={ph} onChange={(e) => set(e.target.value)} /> : <input className="f" value={v} placeholder={ph} onChange={(e) => set(e.target.value)} />}
    </label>
  );

  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap wide">
        <div className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h1 className="grow" style={{ margin: 0 }}>The Pause</h1>
          <button className="btn sm" onClick={addMonth} disabled={!list}>Add next month</button>
          <button className="btn primary sm" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : dirty ? "Save" : "Saved"}</button>
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>Five minutes for yourself, once a month. Write it here once and every company&apos;s link shows it with their name. Past months stay open as an archive. No sign-in for employees, and nothing personal is ever collected.</p>

        {!list ? <div className="card section small muted">Loading…</div> : (
          <div className="pz-admin">
            <div className="card section">
              <div className="tiny muted" style={{ fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Months</div>
              {list.map((r) => (
                <button key={r.month} className={`pz-admin-m ${r.month === sel ? "on" : ""}`} onClick={() => setSel(r.month)}>
                  <b>{pauseMonthLabel(r.month)}</b>
                  <span>{r.title || "Untitled"}</span>
                  <i className={r.active ? "live" : ""}>{!r.active ? "Draft" : r.publishOn > new Date().toISOString().slice(0, 10) ? `From ${r.publishOn.slice(5).replace("-", "/")}` : "Live"}</i>
                </button>
              ))}
            </div>

            {cur && (
              <div className="card section">
                <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <h2 className="grow" style={{ margin: 0 }}>{pauseMonthLabel(cur.month)}</h2>
                  <a className="btn ghost sm" href={`/pause/${links[0]?.url.split("/pause/")[1] ?? "demo"}/${monthSlug(cur.month)}`} target="_blank" rel="noreferrer">Preview</a>
                </div>
                <div className="two" style={{ marginTop: 10 }}>
                  <label className="f">Shows from<input className="f" type="date" value={cur.publishOn} onChange={(e) => edit({ publishOn: e.target.value })} /></label>
                  <label className="f">Status
                    <select className="f" value={cur.active ? "on" : "off"} onChange={(e) => edit({ active: e.target.value === "on" })}>
                      <option value="on">Active</option>
                      <option value="off">Draft (hidden)</option>
                    </select>
                  </label>
                </div>
                <div className="two">
                  {f("Theme", cur.theme, (v) => edit({ theme: v }), 0, "Gratitude")}
                  {f("Title", cur.title, (v) => edit({ title: v }), 0, "Thanks goes further than you think")}
                </div>
                {f("Introduction", cur.intro, (v) => edit({ intro: v }), 3, "Two or three sentences on why this month's theme matters.")}
                {f("Guided prompt", cur.prompt, (v) => edit({ prompt: v }), 3, "The question they sit with for five minutes.")}
                <div className="tiny muted" style={{ margin: "8px 0 4px" }}>Gentle cues (optional). They light up one at a time as the sand falls.</div>
                {[0, 1, 2].map((i) => (
                  <input key={i} className="f" style={{ marginTop: 6 }} value={steps[i] ?? ""} placeholder={`Cue ${i + 1}`} onChange={(e) => { const s = [...steps]; s[i] = e.target.value; edit({ steps: s }); }} />
                ))}
                {f("Closing thought", cur.closing, (v) => edit({ closing: v }), 3, "Shows when the timer reaches zero.")}

                <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => setShowEs(!showEs)}>{showEs ? "Hide Spanish" : cur.es?.title ? "Edit Spanish" : "Add Spanish"}</button>
                {showEs && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                    <div className="two">
                      {f("Tema", cur.es?.theme ?? "", (v) => editEs({ theme: v }))}
                      {f("Título", cur.es?.title ?? "", (v) => editEs({ title: v }))}
                    </div>
                    {f("Introducción", cur.es?.intro ?? "", (v) => editEs({ intro: v }), 3)}
                    {f("Reflexión", cur.es?.prompt ?? "", (v) => editEs({ prompt: v }), 3)}
                    {[0, 1, 2].map((i) => (
                      <input key={i} className="f" style={{ marginTop: 6 }} value={esSteps[i] ?? ""} placeholder={`Paso ${i + 1}`} onChange={(e) => { const s = [...esSteps]; s[i] = e.target.value; editEs({ steps: s }); }} />
                    ))}
                    {f("Cierre", cur.es?.closing ?? "", (v) => editEs({ closing: v }), 3)}
                    <p className="tiny muted">Employees see an EN / ES switch when the Spanish title and reflection are filled in.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="card section" style={{ marginTop: 16 }}>
          <h2 style={{ margin: 0 }}>Links for the newsletter</h2>
          <p className="small muted" style={{ margin: "4px 0 10px" }}>Each company has one link. It always opens the current month. Paste the button into that company&apos;s Pause newsletter.</p>
          {links.map((l) => (
            <div key={l.id} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title">{l.name}</div>
                <div className="tiny muted" style={{ overflowWrap: "anywhere" }}>{l.url}</div>
              </div>
              <button className="btn sm" onClick={() => copy(l.url, "Link")}>Copy link</button>
              <button className="btn sm" onClick={() => copy(button(l.url, cur?.title || "The Pause"), "Email button")}>Copy email button</button>
            </div>
          ))}
        </div>

        <div className="card section" style={{ marginTop: 16 }}>
          <h2 style={{ margin: 0 }}>Participation</h2>
          <p className="small muted" style={{ margin: "4px 0 10px" }}>Counts only. Nobody&apos;s name, notes or answers are ever collected.</p>
          {!statsReady ? (
            <p className="small">Run <b>supabase/027_pause.sql</b> in the Supabase SQL Editor to start counting.</p>
          ) : stats.length === 0 ? (
            <p className="small muted">No visits yet.</p>
          ) : (
            <table className="pz-stats">
              <thead><tr><th>Company</th><th>Month</th><th>Opened</th><th>Started</th><th>Finished</th></tr></thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.clientId + s.month}><td>{names.get(s.clientId) ?? s.clientId}</td><td>{pauseMonthLabel(s.month)}</td><td>{s.visit}</td><td>{s.start}</td><td>{s.complete}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </>
  );
}
