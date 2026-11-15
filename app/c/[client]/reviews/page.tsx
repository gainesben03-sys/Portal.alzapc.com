"use client";

// Reviews (Alza Perform): managers see who needs them, HR sees everyone, executives see how teams are doing.
// Templates and settings live here too, for Ben and the review admins.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { LangSwitch, StageChip, useDemo, useLang } from "@/components/perform";
import { useStore } from "@/lib/store";
import { BUILT_IN, cleanPerform, daysUntil, fmtDay, KIND_LABEL, Lang, Part, PerformSettings, ReviewTemplate, SCALE, stageOf, T, templatesFor, newId } from "@/lib/perform";
import { ListData, performApi } from "@/lib/performclient";

type Tab = "reviews" | "templates" | "settings";

export default function Reviews() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const router = useRouter();
  const { getClient, config } = useStore();
  const client = getClient(clientId);
  const cfg = config[clientId];
  const demo = useDemo(clientId);
  const toast = useToast();
  const [lang, setLang] = useLang();
  const t = T[lang];
  const [data, setData] = useState<ListData | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("reviews");
  const [filter, setFilter] = useState("attention");
  const [picking, setPicking] = useState<null | "adhoc" | "pip">(null);

  const call = useCallback((body: Record<string, unknown>) => performApi(clientId, body, demo), [clientId, demo]);
  const load = useCallback(async () => {
    const r = await call({ action: "list" });
    if (r.ok) setData(r as ListData);
    else setErr(r.reason === "off" ? "off" : "load");
  }, [call]);
  useEffect(() => {
    if (ok) load();
    const q = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (q) setTab(q);
  }, [ok]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok || !client) return null;
  const shell = (body: React.ReactNode) => (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap wide">{body}</main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
  if (!cfg?.modules.perform) return shell(<div className="card section small muted">Reviews isn&apos;t turned on for {client.name}.</div>);
  if (err) return shell(<div className="card section small muted">{err === "off" ? "Reviews isn't turned on." : "Couldn't load reviews. Try again in a moment."}</div>);
  if (!data) return shell(<p className="small muted">Loading…</p>);

  const s = data.settings;
  const today = new Date().toISOString().slice(0, 10);
  const go = (to: Tab) => { setTab(to); window.history.replaceState(null, "", to === "reviews" ? window.location.pathname : `?tab=${to}`); };
  const start = async (personId: string, kind: "adhoc" | "pip" | "cycle" | "intro") => {
    const r = await call({ action: "start", personId, kind });
    if (!r.ok) return toast.show("Couldn't start it. Try again.");
    router.push(`/c/${clientId}/reviews/${r.review.id}`);
  };
  const remind = async (id: string) => toast.show((await call({ action: "remind", id })).ok ? (lang === "es" ? "Recordatorio enviado" : "Reminder sent") : "Couldn't send it");

  const mine = data.reviews.filter((r) => r.managerEmail === data.role.email);
  const attention = (list: typeof data.reviews) => list.filter((r) => ["not_started", "in_progress", "ready", "waiting", "overdue"].includes(stageOf(r, s))).sort((a, b) => (a.due < b.due ? -1 : 1));
  const doneList = (list: typeof data.reviews) => list.filter((r) => stageOf(r, s) === "done").sort((a, b) => (a.due < b.due ? 1 : -1));

  const card = (r: (typeof data.reviews)[number]) => {
    const st = stageOf(r, s);
    const d = daysUntil(r.due, today);
    const when = st === "waiting" ? (lang === "es" ? `Compartida ${fmtDay(r.share!.at.slice(0, 10), lang)}` : `Shared ${fmtDay(r.share!.at.slice(0, 10), lang)}`) : d < 0 ? (lang === "es" ? `Venció hace ${-d} días` : `${-d} days overdue`) : d === 0 ? (lang === "es" ? "Vence hoy" : "Due today") : `${lang === "es" ? "Vence" : "Due"} ${fmtDay(r.due, lang)}`;
    const action = st === "waiting" ? null : st === "ready" ? t.share : ["in_progress", "overdue"].includes(st) && Object.keys(r.ratings).length + Object.keys(r.answers).length > 0 ? t.cont : t.start;
    return (
      <article key={r.id} className="pf-card">
        <span className="pf-avatar" aria-hidden="true">{r.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="pf-name">{r.name} · {KIND_LABEL[r.kind][lang]}</b>
          <span className="pf-sub">{r.title}{data.role.admin && r.managerEmail !== data.role.email ? ` · ${r.managerName}` : ""} · {when}</span>
          <span className="pf-tags">
            <StageChip st={st} lang={lang} />
            {r.self?.doneAt && <span className="pf-chip green">{lang === "es" ? "Autoevaluación lista" : "Self-assessment in"}</span>}
            {r.lang === "es" && <span className="pf-chip">Español</span>}
          </span>
        </div>
        <div className="pf-card-act">
          {action ? <Link href={`/c/${clientId}/reviews/${r.id}`} className="btn primary">{action}</Link> : <Link href={`/c/${clientId}/reviews/${r.id}`} className="btn">{t.view}</Link>}
          {action === t.start && <span className="tiny muted">{t.about(r.template.minutes)}</span>}
          {st === "waiting" && r.share?.how === "link" && <span className="tiny muted">{lang === "es" ? "Esperando que firme" : "Waiting for them to sign off"}</span>}
          {data.role.admin && r.managerEmail !== data.role.email && ["not_started", "in_progress", "overdue"].includes(st) && <button className="btn ghost sm" onClick={() => remind(r.id)}>{t.remind}</button>}
        </div>
      </article>
    );
  };

  const upcomingList = (onlyMine: boolean) => {
    const list = data.upcoming.filter((u) => !onlyMine || data.people.find((p) => p.id === u.personId)?.managerEmail === data.role.email).sort((a, b) => (a.due < b.due ? -1 : 1)).slice(0, 12);
    if (!list.length) return null;
    return (
      <section className="card section">
        <h2 className="pf-h2">{t.comingUp}</h2>
        {list.map((u) => (
          <div key={u.personId + u.kind} className="pf-row">
            <span className="grow"><b>{u.name}</b> · {KIND_LABEL[u.kind][lang]}{data.role.admin ? <span className="tiny muted"> · {u.managerName}</span> : null}</span>
            <span className="tiny muted">{fmtDay(u.due, lang)}</span>
            <button className="btn ghost sm" onClick={() => start(u.personId, u.kind)}>{lang === "es" ? "Empezar antes" : "Start early"}</button>
          </div>
        ))}
      </section>
    );
  };

  // ---------- views ----------
  const header = (
    <div className="pf-top">
      <div className="grow">
        <h1 style={{ margin: 0 }}>{t.reviews}</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {data.role.admin ? (lang === "es" ? "Todas las evaluaciones, a tiempo y en un solo lugar." : "Every review, on schedule, in one place.") : mine.length ? (lang === "es" ? `Su equipo. ${attention(mine).length} pendientes.` : `Your team. ${attention(mine).length} need${attention(mine).length === 1 ? "s" : ""} you.`) : lang === "es" ? "Cómo van los equipos." : "How your teams are doing."}
        </p>
      </div>
      <LangSwitch lang={lang} onChange={setLang} />
    </div>
  );

  const adminTabs = data.role.admin && (
    <nav className="set-tabs" aria-label="Reviews sections">
      {(["reviews", "templates", "settings"] as Tab[]).map((k) => <button key={k} className={tab === k ? "on" : ""} onClick={() => go(k)}>{k === "reviews" ? t.reviews : k === "templates" ? (lang === "es" ? "Plantillas" : "Templates") : lang === "es" ? "Ajustes" : "Settings"}</button>)}
    </nav>
  );

  if (data.role.admin && tab === "templates") return shell(<>{header}{adminTabs}<TemplatesEditor s={s} lang={lang} onSave={async (next) => { const r = await call({ action: "settings", settings: next }); if (r.ok) { setData({ ...data, settings: cleanPerform(next) }); toast.show(lang === "es" ? "Guardado" : "Saved"); } else toast.show("Couldn't save"); }} /></>);
  if (data.role.admin && tab === "settings") return shell(<>{header}{adminTabs}<SettingsEditor s={s} users={data.users} lang={lang} onSave={async (next) => { const r = await call({ action: "settings", settings: next }); if (r.ok) { setData({ ...data, settings: cleanPerform(next) }); toast.show(lang === "es" ? "Guardado" : "Saved"); } else toast.show("Couldn't save"); }} /></>);

  if (data.role.admin) {
    const all = data.reviews.filter((r) => r.status !== "cancelled");
    const cycle = all.filter((r) => r.kind !== "pip" && r.due >= new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10));
    const written = cycle.filter((r) => ["final", "shared", "done"].includes(r.status)).length;
    const signed = cycle.filter((r) => stageOf(r, s) === "done").length;
    const prog = cycle.filter((r) => stageOf(r, s) === "in_progress").length;
    const over = cycle.filter((r) => stageOf(r, s) === "overdue").length;
    const FILTERS: [string, string][] = [["attention", lang === "es" ? "Pendientes" : "Needs attention"], ["overdue", STAGE_LABELS(lang).overdue], ["waiting", STAGE_LABELS(lang).waiting], ["intro", KIND_LABEL.intro[lang]], ["pip", KIND_LABEL.pip[lang]], ["done", STAGE_LABELS(lang).done]];
    const shown = all.filter((r) => {
      const st = stageOf(r, s);
      if (filter === "attention") return ["not_started", "in_progress", "ready", "waiting", "overdue"].includes(st);
      if (filter === "intro") return r.kind === "intro" && st !== "done";
      if (filter === "pip") return r.kind === "pip";
      return st === filter;
    }).sort((a, b) => (a.due < b.due ? -1 : 1));
    return shell(
      <>
        {header}
        {adminTabs}
        <div className="pf-tiles section">
          <div className="pf-tile"><b>{cycle.length ? Math.round((written / cycle.length) * 100) : 0}%</b><span>{lang === "es" ? `Escritas por gerentes (${written} de ${cycle.length})` : `Written by managers (${written} of ${cycle.length})`}</span></div>
          <div className="pf-tile"><b>{signed}</b><span>{lang === "es" ? "Completadas (firmadas o entregadas)" : "Finished (signed off or delivered)"}</span></div>
          <div className="pf-tile"><b>{prog}</b><span>{STAGE_LABELS(lang).in_progress}</span></div>
          <div className="pf-tile"><b className={over ? "red" : ""}>{over}</b><span>{STAGE_LABELS(lang).overdue}</span></div>
        </div>

        {data.pipFlags.map((pid) => {
          const p = data.people.find((x) => x.id === pid);
          if (!p) return null;
          return (
            <div key={pid} className="pf-flag section">
              <span className="grow">{t.pipSuggest(p.name, data.reviews.filter((r) => r.personId === pid && r.overall && ((r.template.scale === 5 && r.overall <= 2) || (r.template.scale === 3 && r.overall <= 1))).length)}</span>
              <button className="btn sm" onClick={() => start(pid, "pip")}>{t.buildPip}</button>
            </div>
          );
        })}

        <div className="row section" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="pf-filters grow" role="group" aria-label="Filter">
            {FILTERS.map(([k, label]) => <button key={k} className={filter === k ? "on" : ""} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
          </div>
          <button className="btn sm" onClick={() => setPicking("adhoc")}>{lang === "es" ? "+ Nueva evaluación" : "+ Start a review"}</button>
          <button className="btn ghost sm" onClick={() => setPicking("pip")}>{lang === "es" ? "+ Plan de mejora" : "+ Improvement plan"}</button>
        </div>
        <div className="pf-list">{shown.length ? shown.map(card) : <p className="small muted">{lang === "es" ? "Nada aquí por ahora." : "Nothing here right now."}</p>}</div>

        {data.insight.length > 0 && <Insight rows={data.insight} lang={lang} />}
        {upcomingList(false)}
        {picking && <PersonPicker people={data.people} lang={lang} pip={picking === "pip"} onClose={() => setPicking(null)} onPick={(id) => { setPicking(null); start(id, picking); }} />}
      </>
    );
  }

  // manager and/or executive
  return shell(
    <>
      {header}
      {mine.length > 0 || data.people.length > 0 ? (
        <>
          <h2 className="pf-h2 section">{t.needsYou}</h2>
          <div className="pf-list">{attention(mine).length ? attention(mine).map(card) : <p className="small muted">{lang === "es" ? "Nada pendiente. Buen trabajo." : "Nothing due right now. Nice."}</p>}</div>
          {upcomingList(true)}
          {doneList(mine).length > 0 && (
            <section className="card section">
              <h2 className="pf-h2">{t.doneYear}</h2>
              {doneList(mine).slice(0, 8).map((r) => (
                <div key={r.id} className="pf-row"><span className="grow"><b>{r.name}</b> · {KIND_LABEL[r.kind][lang]}</span><span className="tiny muted">{fmtDay(r.due, lang)}</span><Link href={`/c/${clientId}/reviews/${r.id}`} className="btn ghost sm">{t.view}</Link></div>
              ))}
            </section>
          )}
        </>
      ) : null}
      {data.role.exec && data.insight.length > 0 && <Insight rows={data.insight} lang={lang} />}
    </>
  );
}

const STAGE_LABELS = (lang: Lang) => ({ overdue: lang === "es" ? "Atrasadas" : "Overdue", waiting: lang === "es" ? "Esperando firma" : "Waiting on sign-off", done: lang === "es" ? "Completadas" : "Done", in_progress: lang === "es" ? "En progreso" : "In progress" });

/** Team summaries for executives: counts only, never names or what was written. */
function Insight({ rows, lang }: { rows: ListData["insight"]; lang: Lang }) {
  const es = lang === "es";
  return (
    <section className="card section">
      <h2 className="pf-h2">{es ? "Cómo van los equipos" : "How teams are doing"}</h2>
      <p className="tiny muted" style={{ marginTop: 0 }}>{es ? "Últimos 12 meses. Solo números: las evaluaciones las ven el gerente y RR. HH." : "Last 12 months. Numbers only: reviews themselves stay with the manager and HR."}</p>
      <div style={{ overflowX: "auto" }}>
        <table className="pf-table">
          <thead><tr><th>{es ? "Gerente" : "Manager"}</th><th>{es ? "Completadas" : "Finished"}</th><th>{es ? "Atrasadas" : "Overdue"}</th><th>{es ? "Calificación general" : "Overall ratings"}</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const rated = r.below + r.meets + r.above;
              return (
                <tr key={r.manager}>
                  <td><b>{r.manager}</b></td>
                  <td>
                    <span className="pf-bar"><span style={{ width: `${r.total ? Math.round((r.done / r.total) * 100) : 0}%` }} /></span> {r.done} {es ? "de" : "of"} {r.total}
                  </td>
                  <td>{r.overdue ? <span className="pf-chip red">{r.overdue}</span> : <span className="tiny muted">0</span>}</td>
                  <td>
                    {rated ? (
                      <span className="pf-mix" aria-label={`${r.above} above, ${r.meets} meeting, ${r.below} below expectations`}>
                        <span className="above" style={{ flex: r.above }} />
                        <span className="meets" style={{ flex: r.meets }} />
                        <span className="below" style={{ flex: r.below }} />
                      </span>
                    ) : <span className="tiny muted">{es ? "Aún no" : "None yet"}</span>}
                    {rated > 0 && <span className="tiny muted" style={{ display: "block" }}>{r.above} {es ? "supera" : "above"} · {r.meets} {es ? "cumple" : "meets"} · {r.below} {es ? "debajo" : "below"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PersonPicker({ people, lang, pip, onClose, onPick }: { people: ListData["people"]; lang: Lang; pip: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const list = people.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <Sheet title={pip ? (lang === "es" ? "Plan de mejora para…" : "Improvement plan for…") : lang === "es" ? "Nueva evaluación para…" : "Start a review for…"} onClose={onClose}>
      <input className="f" autoFocus placeholder={lang === "es" ? "Buscar por nombre" : "Search by name"} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      <div style={{ marginTop: 10 }}>
        {list.map((p) => (
          <button key={p.id} className="pf-pick" onClick={() => onPick(p.id)}><b>{p.name}</b><span className="tiny muted">{p.title} · {p.managerName}</span></button>
        ))}
      </div>
    </Sheet>
  );
}

// ---------- templates ----------
function TemplatesEditor({ s, lang, onSave }: { s: PerformSettings; lang: Lang; onSave: (s: PerformSettings) => void }) {
  const es = lang === "es";
  const [list, setList] = useState<ReviewTemplate[]>(() => templatesFor(s));
  const [sel, setSel] = useState(list[0]?.id ?? "scorecard");
  const cur = list.find((x) => x.id === sel) ?? list[0];
  const set = (p: Partial<ReviewTemplate>) => setList(list.map((x) => (x.id === cur.id ? { ...x, ...p } : x)));
  const setPart = (k: "rate" | "ask", i: number, p: Partial<Part>) => set({ [k]: cur[k].map((x, j) => (j === i ? { ...x, ...p } : x)) } as Partial<ReviewTemplate>);
  const move = (k: "rate" | "ask", i: number, d: -1 | 1) => { const a = [...cur[k]]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ [k]: a } as Partial<ReviewTemplate>); };
  const save = () => {
    // keep only what differs from our built-ins, plus their own templates
    const templates = list.filter((x) => { const b = BUILT_IN.find((y) => y.id === x.id); return !b || JSON.stringify({ ...b, builtIn: undefined }) !== JSON.stringify({ ...x, builtIn: undefined }); }).map((x) => ({ ...x, builtIn: undefined }));
    onSave({ ...s, templates: templates as ReviewTemplate[] });
  };
  const parts = (k: "rate" | "ask", label: string) => (
    <div className="pf-parts">
      <span className="flabel">{label}</span>
      {cur[k].map((p, i) => (
        <div key={p.id + i} className={`pf-part ${p.on ? "" : "off"}`}>
          <div className="pf-part-move">
            <button className="btn ghost sm" aria-label="Move up" onClick={() => move(k, i, -1)}>↑</button>
            <button className="btn ghost sm" aria-label="Move down" onClick={() => move(k, i, 1)}>↓</button>
          </div>
          <div className="grow pf-part-fields">
            <input className="f" value={p.name.en} aria-label="Name in English" placeholder="English" onChange={(e) => setPart(k, i, { name: { ...p.name, en: e.target.value } })} />
            <input className="f" value={p.name.es} aria-label="Name in Spanish" placeholder="Español" onChange={(e) => setPart(k, i, { name: { ...p.name, es: e.target.value } })} />
          </div>
          <label className="switch" title={p.on ? "On" : "Off"}><input type="checkbox" checked={p.on} aria-label={`${p.name.en} on or off`} onChange={(e) => setPart(k, i, { on: e.target.checked })} /><span /></label>
          {!cur.builtIn && <button className="btn ghost sm" aria-label="Remove" onClick={() => set({ [k]: cur[k].filter((_, j) => j !== i) } as Partial<ReviewTemplate>)}>×</button>}
        </div>
      ))}
      <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => set({ [k]: [...cur[k], { id: `p${newId().slice(0, 6)}`, name: { en: "", es: "" }, on: true }] } as Partial<ReviewTemplate>)}>{es ? "+ Agregar" : "+ Add one"}</button>
    </div>
  );
  return (
    <div className="pf-tpl section">
      <div className="pf-tpl-list">
        {list.map((x) => (
          <button key={x.id} className={`pf-tpl-item ${x.id === cur.id ? "on" : ""}`} aria-pressed={x.id === cur.id} onClick={() => setSel(x.id)}>
            <span className="row" style={{ gap: 6 }}><b className="grow">{x.name}</b>{s.template === x.id && <span className="pf-chip gold">{es ? "Predeterminada" : "Default"}</span>}{s.intro.template === x.id && <span className="pf-chip">{es ? "Nuevo ingreso" : "New hires"}</span>}<span className={`tiny ${x.on ? "" : "muted"}`}>{x.on ? (es ? "En uso" : "In use") : es ? "Apagada" : "Off"}</span></span>
            <span className="tiny muted">{x.blurb}</span>
          </button>
        ))}
        <button className="btn" onClick={() => { const id = `t${newId().slice(0, 6)}`; setList([...list, { id, name: es ? "Mi plantilla" : "My template", blurb: "", kind: "review", scale: 5, rate: [], ask: [{ id: "well", name: { en: "What's going well?", es: "¿Qué va bien?" }, on: true }], minutes: 10, on: true }]); setSel(id); }}>{es ? "+ Plantilla en blanco" : "+ Start a blank template"}</button>
      </div>
      <section className="card pf-tpl-edit">
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="f grow" style={{ minWidth: 220 }}>{es ? "Nombre" : "Template name"}<input className="f" value={cur.name} onChange={(e) => set({ name: e.target.value })} /></label>
          <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={cur.on} onChange={(e) => set({ on: e.target.checked })} /> {es ? "En uso" : "In use"}</label>
        </div>
        <label className="f">{es ? "Descripción" : "What it's for"}<input className="f" value={cur.blurb} onChange={(e) => set({ blurb: e.target.value })} /></label>
        {parts("rate", es ? "Áreas a calificar (vacío = sin calificaciones)" : "Rating areas (none = no ratings)")}
        {cur.rate.length > 0 && (
          <div>
            <span className="flabel">{es ? "Escala" : "Rating scale"}</span>
            <div className="pf-filters" role="group">
              {([5, 3] as const).map((n) => <button key={n} className={cur.scale === n ? "on" : ""} aria-pressed={cur.scale === n} onClick={() => set({ scale: n })}>{n} {es ? "puntos" : "point"}</button>)}
            </div>
            <p className="tiny muted" style={{ margin: "6px 0 0" }}>{SCALE[cur.scale].map((x, i) => `${i + 1} ${x[lang]}`).join(" · ")}</p>
          </div>
        )}
        {parts("ask", es ? "Preguntas guiadas" : "Guided questions")}
        <label className="f" style={{ maxWidth: 220 }}>{es ? "Minutos aprox." : "About how many minutes"}<input className="f" type="number" min={3} max={60} value={cur.minutes} onChange={(e) => set({ minutes: Number(e.target.value) || 10 })} /></label>
        <div className="sheet-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <span className="tiny muted">{es ? "Las evaluaciones ya empezadas no cambian." : "Reviews already started keep the version they started with."}</span>
          <button className="btn primary" onClick={save}>{es ? "Guardar plantillas" : "Save templates"}</button>
        </div>
      </section>
    </div>
  );
}

// ---------- settings ----------
function SettingsEditor({ s, users, lang, onSave }: { s: PerformSettings; users: ListData["users"]; lang: Lang; onSave: (s: PerformSettings) => void }) {
  const es = lang === "es";
  const [v, setV] = useState<PerformSettings>(s);
  const tpls = templatesFor(v).filter((x) => x.on);
  const chip = (on: boolean, label: string, onClick: () => void) => <button key={label} className={on ? "on" : ""} aria-pressed={on} onClick={onClick}>{label}</button>;
  const sw = (k: keyof PerformSettings, label: string, sub: string) => (
    <label className="tw-switch" key={String(k)}>
      <span className="grow"><b>{label}</b><span className="tiny muted" style={{ display: "block", marginTop: 2 }}>{sub}</span></span>
      <input type="checkbox" role="switch" checked={!!v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
    </label>
  );
  const [mm, dd] = v.cycleDue.split("-");
  return (
    <div className="section" style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 }}>
      <section className="card">
        <h2 className="pf-h2">{es ? "Con qué frecuencia" : "How often"}</h2>
        <div className="pf-filters" role="group">
          {chip(v.cadence === "year", es ? "Una vez al año" : "Once a year", () => setV({ ...v, cadence: "year" }))}
          {chip(v.cadence === "half", es ? "Dos veces al año" : "Twice a year", () => setV({ ...v, cadence: "half" }))}
          {chip(v.cadence === "quarter", es ? "Cada trimestre" : "Every quarter", () => setV({ ...v, cadence: "quarter" }))}
          {chip(v.cadence === "custom", es ? "Otro" : "Custom", () => setV({ ...v, cadence: "custom" }))}
        </div>
        {v.cadence === "custom" && <label className="f" style={{ maxWidth: 220, marginTop: 8 }}>{es ? "Cada cuántos meses" : "Every how many months"}<input className="f" type="number" min={1} max={24} value={v.customMonths ?? 12} onChange={(e) => setV({ ...v, customMonths: Number(e.target.value) || 12 })} /></label>}
        <div className="pf-choice section">
          <button className={v.basis === "company" ? "on" : ""} aria-pressed={v.basis === "company"} onClick={() => setV({ ...v, basis: "company" })}><b>{es ? "Todos al mismo tiempo" : "Everyone at the same time"}</b><span>{es ? "Un ciclo con fecha límite. Más fácil de seguir." : "One cycle with a due date. Easiest to track."}</span></button>
          <button className={v.basis === "anniversary" ? "on" : ""} aria-pressed={v.basis === "anniversary"} onClick={() => setV({ ...v, basis: "anniversary" })}><b>{es ? "En el aniversario de cada persona" : "On each person's work anniversary"}</b><span>{es ? "Reparte el trabajo durante el año." : "Spreads the work out across the year."}</span></button>
        </div>
        {v.basis === "company" && (
          <div className="row section" style={{ gap: 10, flexWrap: "wrap" }}>
            <label className="f" style={{ width: 160 }}>{es ? "Mes de vencimiento" : "Due month"}<select className="f" value={mm} onChange={(e) => setV({ ...v, cycleDue: `${e.target.value}-${dd}` })}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{new Date(2026, i, 1).toLocaleDateString(es ? "es-US" : "en-US", { month: "long" })}</option>)}</select></label>
            <label className="f" style={{ width: 100 }}>{es ? "Día" : "Day"}<select className="f" value={dd} onChange={(e) => setV({ ...v, cycleDue: `${mm}-${e.target.value}` })}>{Array.from({ length: 28 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{i + 1}</option>)}</select></label>
            <label className="f" style={{ width: 200 }}>{es ? "Abre (días antes)" : "Opens (days before)"}<input className="f" type="number" min={7} max={120} value={v.openDays} onChange={(e) => setV({ ...v, openDays: Number(e.target.value) || 45 })} /></label>
          </div>
        )}
        <label className="f section" style={{ maxWidth: 320 }}>{es ? "Plantilla predeterminada" : "Default template"}<select className="f" value={v.template} onChange={(e) => setV({ ...v, template: e.target.value })}>{tpls.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </section>

      <section className="card">
        <label className="tw-switch">
          <span className="grow"><b>{es ? "Evaluación para nuevos ingresos" : "Review for new hires"}</b><span className="tiny muted" style={{ display: "block", marginTop: 2 }}>{es ? "No mueve su evaluación regular: entran al siguiente ciclo normal." : "It doesn't move their regular review: they join the next normal cycle as usual."}</span></span>
          <input type="checkbox" role="switch" checked={v.intro.on} onChange={(e) => setV({ ...v, intro: { ...v.intro, on: e.target.checked } })} />
        </label>
        {v.intro.on && (
          <>
            <div className="pf-filters" role="group" style={{ marginTop: 8 }}>
              {[30, 60, 90, 180].map((d) => chip(v.intro.days === d, es ? `${d} días` : `${d} days`, () => setV({ ...v, intro: { ...v.intro, days: d } })))}
            </div>
            <label className="f section" style={{ maxWidth: 320 }}>{es ? "Plantilla" : "Template"}<select className="f" value={v.intro.template} onChange={(e) => setV({ ...v, intro: { ...v.intro, template: e.target.value } })}>{tpls.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          </>
        )}
      </section>

      <section className="card">
        <h2 className="pf-h2">{es ? "Cómo funciona" : "How it works"}</h2>
        {sw("selfAssess", es ? "Autoevaluación del empleado" : "Employee self-assessment", es ? `Un enlace con 4 preguntas sale ${v.selfDaysBefore} días antes.` : `A 4-question link goes out ${v.selfDaysBefore} days before the due date, in English or Spanish.`)}
        {sw("signOff", es ? "Pedir confirmación" : "Ask employees to sign off", es ? "Cuenta como terminada cuando confirman que la recibieron." : "A review counts as finished once they confirm they received it.")}
        {sw("ai", es ? "Ayuda para redactar" : "Writing help for managers", es ? "Ayuda a redactar y traducir. El gerente siempre decide." : "Helps put notes into words and translate. The manager always has the final say.")}
        {sw("talk", es ? "Dígalo en voz alta (teléfonos)" : "Talk it through (phones)", es ? "Una opción en el teléfono para hablar en vez de escribir." : "An option on phones to talk instead of type. The guided questions stay the default.")}
        {sw("execRead", es ? "Ejecutivos pueden leer evaluaciones" : "Executives can read reviews", es ? "Apagado: ven solo el resumen de los equipos." : "Off: executives see team summaries only, not the reviews.")}
        <label className="f section" style={{ maxWidth: 260 }}>{es ? "Sugerir un plan de mejora después de" : "Suggest an improvement plan after"}<select className="f" value={v.pipAfter} onChange={(e) => setV({ ...v, pipAfter: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n} {es ? (n === 1 ? "evaluación baja" : "evaluaciones bajas") : n === 1 ? "review below expectations" : "reviews below expectations"}</option>)}</select></label>
      </section>

      <section className="card">
        <h2 className="pf-h2">{es ? "Recordatorios a gerentes" : "Reminders to managers"}</h2>
        <div className="pf-filters" role="group">
          {[30, 14, 7, 0].map((d) => chip(v.remind.includes(d), d === 0 ? (es ? "El día que vence" : "On the due date") : es ? `${d} días antes` : `${d} days before`, () => setV({ ...v, remind: v.remind.includes(d) ? v.remind.filter((x) => x !== d) : [...v.remind, d].sort((a, b) => b - a) })))}
          {chip(v.overdueWeekly, es ? "Cada semana si está atrasada" : "Weekly when overdue", () => setV({ ...v, overdueWeekly: !v.overdueWeekly }))}
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>{es ? "Paran en cuanto la evaluación está lista. Las atrasadas también le llegan a RR. HH." : "They stop the moment a review is done. Overdue ones also go to the review admins."}</p>
      </section>

      <section className="card">
        <h2 className="pf-h2">{es ? "Administradores de evaluaciones" : "Review admins"}</h2>
        <p className="tiny muted" style={{ marginTop: 0 }}>{es ? "Ven y administran todas las evaluaciones, como RR. HH. Ben siempre tiene acceso." : "They see and manage every review, like HR. Ben always has access. Managers only see their own team."}</p>
        {users.length ? users.map((u) => (
          <label key={u.email} className="check"><input type="checkbox" checked={v.admins.includes(u.email)} onChange={(e) => setV({ ...v, admins: e.target.checked ? [...v.admins, u.email] : v.admins.filter((x) => x !== u.email) })} /> {u.name} <span className="tiny muted">{u.email}</span></label>
        )) : <p className="small muted">{es ? "Agregue personas con acceso en los ajustes del cliente." : "Add people with access in the client's settings first."}</p>}
      </section>

      <div className="sheet-actions"><button className="btn primary" onClick={() => onSave(v)}>{es ? "Guardar ajustes" : "Save settings"}</button></div>
    </div>
  );
}


