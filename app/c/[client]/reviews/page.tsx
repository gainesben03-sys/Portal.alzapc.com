"use client";

// Reviews (Alza Perform): managers see who needs them, HR sees everyone, executives see how teams are doing.
// Templates and settings live here too, for Ben and the review admins.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { StageChip, useDemo, useLang } from "@/components/perform";
import { useStore } from "@/lib/store";
import { BUILT_IN, cleanPerform, daysUntil, fmtDay, KIND_LABEL, Lang, Part, PerformSettings, ReviewTemplate, SCALE, stageOf, T, templatesFor, newId } from "@/lib/perform";
import { ListData, performApi } from "@/lib/performclient";
import { ArchiveRange, buildArchive, inRange, isArchived } from "@/lib/reviewarchive";

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
  const [launching, setLaunching] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [nudging, setNudging] = useState(false);
  const [kind, setKind] = useState<"all" | "review" | "intro" | "pip">("all");
  const moreRef = useRef<HTMLDetailsElement>(null);

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
  const onMe = (list: typeof data.reviews) => attention(list).filter((r) => stageOf(r, s) !== "waiting");
  const onThem = (list: typeof data.reviews) => attention(list).filter((r) => stageOf(r, s) === "waiting");
  const doneList = (list: typeof data.reviews) => list.filter((r) => stageOf(r, s) === "done").sort((a, b) => (a.due < b.due ? 1 : -1));

  const card = (r: (typeof data.reviews)[number]) => {
    const st = stageOf(r, s);
    const d = daysUntil(r.due, today);
    const when = st === "waiting" ? (lang === "es" ? `Compartida ${fmtDay(r.share!.at.slice(0, 10), lang)}` : `Shared ${fmtDay(r.share!.at.slice(0, 10), lang)}`) : d < 0 ? (lang === "es" ? `Venció hace ${-d} días` : `${-d} days overdue`) : d === 0 ? (lang === "es" ? "Vence hoy" : "Due today") : `${lang === "es" ? "Vence" : "Due"} ${fmtDay(r.due, lang)}`;
    const action = st === "waiting" ? null : st === "ready" ? t.share : ["in_progress", "overdue"].includes(st) && Object.keys(r.ratings).length + Object.keys(r.answers).length > 0 ? t.cont : t.start;
    const href = `/c/${clientId}/reviews/${r.id}`;
    const canRemind = data.role.admin && r.managerEmail !== data.role.email && ["not_started", "in_progress", "overdue"].includes(st);
    const who = data.role.admin ? (r.managerEmail === data.role.email ? (lang === "es" ? "Usted" : "You") : r.managerName) : "";
    return (
      <article key={r.id} className={`rd-card${st === "overdue" ? " late" : ""}`} role="link" tabIndex={0} aria-label={`${r.name}, ${KIND_LABEL[r.kind][lang]}`}
        onClick={() => router.push(href)} onKeyDown={(e) => { if (e.key === "Enter") router.push(href); }}>
        <div className="rd-main">
          <span className="rd-name"><b>{r.name}</b><span className="rd-type">{KIND_LABEL[r.kind][lang]}</span>{r.lang === "es" && <span className="rd-type">ES</span>}</span>
          <span className="rd-meta">{who ? <>{lang === "es" ? "Gerente" : "Manager"}: {who}</> : r.title}<span aria-hidden="true"> · </span><span className={st === "overdue" ? "red" : ""}>{when}</span></span>
        </div>
        <div className="rd-status">
          <StageChip st={st} lang={lang} />
          {r.self?.doneAt && st !== "done" && st !== "waiting" && <span className="tiny muted">{lang === "es" ? "Autoevaluación lista" : "Self-assessment in"}</span>}
        </div>
        <div className="rd-act" onClick={(e) => e.stopPropagation()}>
          {canRemind && <button className="btn ghost sm" onClick={() => remind(r.id)}>{t.remind}</button>}
          <Link href={href} className={`btn sm${action ? " primary" : ""}`}>{action ?? t.view}</Link>
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

  const remindAll = async () => {
    setNudging(true);
    const r = await call({ action: "remindAll" });
    setNudging(false);
    toast.show(r.ok ? (r.managers ? (lang === "es" ? `Recordatorio enviado a ${r.managers} gerente${r.managers === 1 ? "" : "s"}` : `Reminder sent to ${r.managers} manager${r.managers === 1 ? "" : "s"}`) : lang === "es" ? "Nadie tiene evaluaciones pendientes" : "No one has reviews to finish") : lang === "es" ? "No se pudo enviar" : "Couldn't send. Try again.");
    if (r.ok) load();
  };

  // ---------- views ----------
  const header = (
    <div className="pf-top">
      <div className="grow">
        <h1 style={{ margin: 0 }}>{t.reviews}</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {data.role.admin ? (lang === "es" ? "Todas las evaluaciones, a tiempo y en un solo lugar." : "Every review, on schedule, in one place.") : mine.length ? (lang === "es" ? `Su equipo. ${onMe(mine).length} pendientes.` : onMe(mine).length ? `Your team. ${onMe(mine).length} need${onMe(mine).length === 1 ? "s" : ""} you.` : "Your team. You're caught up.") : lang === "es" ? "Cómo van los equipos." : "How your teams are doing."}
        </p>
      </div>
      <div className="rd-top-act">
        <div className="rd-lang" role="group" aria-label="Language">
          <button className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          <button className={lang === "es" ? "on" : ""} aria-pressed={lang === "es"} onClick={() => setLang("es")}>ES</button>
        </div>
        {data.role.admin && tab === "reviews" && (
          <>
            <details className="rd-more" ref={moreRef}>
              <summary className="btn sm">{lang === "es" ? "Más" : "More"}</summary>
              <div className="rd-menu" onClick={() => moreRef.current?.removeAttribute("open")}>
                <button disabled={nudging} onClick={remindAll}>{lang === "es" ? "Recordar a los gerentes" : "Remind managers"}<span>{lang === "es" ? "Todos los que tienen evaluaciones pendientes" : "Everyone with reviews to finish"}</span></button>
                <button onClick={() => setPicking("adhoc")}>{lang === "es" ? "Una evaluación" : "One review"}<span>{lang === "es" ? "Para una sola persona, fuera del ciclo" : "For one person, outside the cycle"}</span></button>
                <button onClick={() => setPicking("pip")}>{lang === "es" ? "Plan de mejora" : "Improvement plan"}<span>{lang === "es" ? "RR. HH. lo revisa antes de compartirlo" : "HR reviews it before it's shared"}</span></button>
              </div>
            </details>
            <button className="btn primary sm" onClick={() => setLaunching(true)}>+ {lang === "es" ? "Lanzar evaluaciones" : "Launch reviews"}</button>
          </>
        )}
      </div>
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
    const signed = cycle.filter((r) => stageOf(r, s) === "done").length;
    const over = cycle.filter((r) => stageOf(r, s) === "overdue").length;
    const awaiting = cycle.filter((r) => stageOf(r, s) === "waiting").length;
    const open = cycle.length - signed - over;
    const pct = cycle.length ? Math.round((signed / cycle.length) * 100) : 0;
    const FILTERS: [string, string][] = [["attention", lang === "es" ? "Pendientes" : "Needs attention"], ["progress", STAGE_LABELS(lang).in_progress], ["waiting", STAGE_LABELS(lang).waiting], ["done", STAGE_LABELS(lang).done]];
    const rank = (st: string) => (st === "overdue" ? 0 : 1);
    const shown = all.filter((r) => {
      const st = stageOf(r, s);
      if (kind !== "all" && (kind === "review" ? r.kind === "intro" || r.kind === "pip" : r.kind !== kind)) return false;
      // needs attention: late, written but not shared yet, or due within two weeks
      if (filter === "attention") return st === "overdue" || st === "ready" || (["not_started", "in_progress"].includes(st) && daysUntil(r.due, today) <= 14);
      if (filter === "progress") return ["not_started", "in_progress", "ready", "overdue"].includes(st);
      return st === filter;
    }).sort((a, b) => rank(stageOf(a, s)) - rank(stageOf(b, s)) || (filter === "done" ? (a.due < b.due ? 1 : -1) : a.due < b.due ? -1 : 1));
    return shell(
      <>
        {header}
        {adminTabs}
        <section className="rd-health section" aria-label={lang === "es" ? "Resumen del ciclo" : "Review cycle overview"}>
          <div className="rd-stats">
            <div><b>{cycle.length}</b><span>{lang === "es" ? "Evaluaciones" : "Total reviews"}</span></div>
            <div><b>{signed}</b><span>{STAGE_LABELS(lang).done}</span></div>
            <div><b>{open}</b><span>{STAGE_LABELS(lang).in_progress}{awaiting ? <em>{awaiting} {lang === "es" ? "esperando firma" : "awaiting sign-off"}</em> : null}</span></div>
            <div><b className={over ? "red" : ""}>{over}</b><span>{STAGE_LABELS(lang).overdue}</span></div>
          </div>
          <div className="rd-progress">
            <span className="pf-bar"><span style={{ width: `${pct}%` }} /></span>
            <span className="tiny muted">{pct}% {lang === "es" ? "completado" : "complete"}</span>
          </div>
        </section>

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

        <div className="rd-filters section">
          <div className="pf-filters grow" role="group" aria-label="Filter">
            {FILTERS.map(([k, label]) => <button key={k} className={filter === k ? "on" : ""} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
          </div>
          <select className="rd-kind" aria-label={lang === "es" ? "Tipo" : "Review type"} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="all">{lang === "es" ? "Todos los tipos" : "All types"}</option>
            <option value="review">{lang === "es" ? "Evaluación de desempeño" : "Performance review"}</option>
            <option value="intro">{KIND_LABEL.intro[lang]}</option>
            <option value="pip">{KIND_LABEL.pip[lang]}</option>
          </select>
        </div>
        <div className="pf-list rd-list">{shown.length ? shown.map(card) : <p className="small muted rd-empty">{filter === "attention" ? (lang === "es" ? "Nada necesita atención ahora." : "Nothing needs attention right now.") : lang === "es" ? "Nada aquí por ahora." : "Nothing here right now."}</p>}</div>

        {data.insight.length > 0 && <Insight rows={data.insight} lang={lang} />}
        {upcomingList(false)}
        <div className="pf-launch section">
          <div className="grow">
            <b>{lang === "es" ? "Descargar evaluaciones" : "Download reviews"}</b>
            <span className="tiny muted">{lang === "es" ? "Cada evaluación terminada como PDF, en un solo zip. Para respaldo o para los expedientes del personal." : "Every finished review as a PDF, in one zip. For backup or to move into personnel files."}</span>
          </div>
          <button className="btn sm" onClick={() => setArchiving(true)}>{lang === "es" ? "Descargar todo" : "Download all"}</button>
        </div>
        {archiving && <ArchiveSheet data={data} clientId={clientId} company={client.name} logo={client.logo} lang={lang} onClose={() => setArchiving(false)} onDone={(m) => { setArchiving(false); toast.show(m); }} />}
        {launching && <LaunchSheet data={data} lang={lang} call={call} onClose={() => setLaunching(false)} onDone={(m) => { setLaunching(false); toast.show(m); load(); }} onSettings={() => { setLaunching(false); go("settings"); }} />}
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
          <div className="pf-list rd-list">{onMe(mine).length ? onMe(mine).map(card) : <p className="small muted rd-empty">{lang === "es" ? "Nada pendiente. Buen trabajo." : "Nothing due right now. Nice."}</p>}</div>
          {onThem(mine).length > 0 && (
            <>
              <h2 className="pf-h2 section">{lang === "es" ? "Esperando al empleado" : "Waiting on them"}</h2>
              <div className="pf-list rd-list">{onThem(mine).map(card)}</div>
            </>
          )}
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

const STAGE_LABELS = (lang: Lang) => ({ overdue: lang === "es" ? "Atrasadas" : "Overdue", waiting: lang === "es" ? "Esperando firma" : "Awaiting sign-off", done: lang === "es" ? "Completadas" : "Completed", in_progress: lang === "es" ? "En progreso" : "In progress" });

/** Team summaries for executives: counts only, never names or what was written. */
function Insight({ rows, lang }: { rows: ListData["insight"]; lang: Lang }) {
  const es = lang === "es";
  return (
    <details className="card section rd-mgr">
      <summary>
        <h2 className="pf-h2">{es ? "Progreso por gerente" : "Progress by manager"}</h2>
        <span className="tiny muted">{rows.length} {es ? (rows.length === 1 ? "gerente" : "gerentes") : rows.length === 1 ? "manager" : "managers"} · {rows.reduce((n, r) => n + r.overdue, 0)} {es ? "atrasadas" : "overdue"}</span>
      </summary>
      <p className="tiny muted" style={{ marginTop: 0 }}>{es ? "Últimos 12 meses. Solo números: las evaluaciones las ven el gerente y RR. HH." : "Last 12 months. Numbers only: reviews themselves stay with the manager and HR."}</p>
      <div style={{ overflowX: "auto" }}>
        <table className="pf-table">
          <thead><tr><th>{es ? "Gerente" : "Manager"}</th><th>{es ? "Completadas" : "Completed"}</th><th>{es ? "Atrasadas" : "Overdue"}</th><th>{es ? "Calificación general" : "Overall ratings"}</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const rated = r.below + r.meets + r.above;
              return (
                <tr key={r.manager}>
                  <td><b>{r.manager}</b></td>
                  <td>
                    <span className="pf-bar"><span style={{ width: `${r.total ? Math.round(((r.done + r.waiting) / r.total) * 100) : 0}%` }} /></span> {r.done + r.waiting} {es ? "de" : "of"} {r.total}
                    {r.waiting > 0 && <span className="tiny muted" style={{ display: "block" }}>{r.waiting} {es ? "esperando firma" : "waiting on sign-off"}</span>}
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
    </details>
  );
}

// ---------- launch a round ----------
function LaunchSheet({ data, lang, call, onClose, onDone, onSettings }: { data: ListData; lang: Lang; call: (b: Record<string, unknown>) => Promise<Record<string, any>>; onClose: () => void; onDone: (msg: string) => void; onSettings: () => void }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const es = lang === "es";
  const L = (en: string, sp: string) => (es ? sp : en);
  const s = data.settings;
  const openIds = new Set(data.reviews.filter((r) => r.status === "open" && r.kind !== "pip").map((r) => r.personId));
  const why = (p: ListData["people"][number]) => (!p.managerEmail ? L("No manager on the roster", "Sin gerente") : openIds.has(p.id) ? L("Already has a review open", "Ya tiene una evaluación abierta") : "");
  const eligible = data.people.filter((p) => !why(p));
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(eligible.map((p) => p.id)));
  const reviewTemplates = templatesFor(s).filter((x) => x.kind === "review" && x.on);
  const [template, setTemplate] = useState(s.template);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const [due, setDue] = useState(in30);
  const [self, setSelf] = useState<"before" | "now" | "skip">("before");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { created: number; managers: number; selfSent: number; skipped: { name: string; why: string }[] }>(null);
  const depts = [...new Set(data.people.map((p) => p.department).filter(Boolean))] as string[];
  const mgrs = [...new Set(data.people.map((p) => p.managerName).filter(Boolean))].sort();
  const shown = data.people.filter((p) => (!q || `${p.name} ${p.title}`.toLowerCase().includes(q.toLowerCase())) && (!group || p.department === group || p.managerName === group));
  const shownOk = shown.filter((p) => !why(p));
  const allOn = shownOk.length > 0 && shownOk.every((p) => picked.has(p.id));
  const toggle = (id: string) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setAll = (on: boolean) => setPicked((cur) => { const n = new Set(cur); for (const p of shownOk) { if (on) n.add(p.id); else n.delete(p.id); } return n; });
  const count = [...picked].filter((id) => eligible.some((p) => p.id === id)).length;
  const managersCount = new Set(eligible.filter((p) => picked.has(p.id)).map((p) => p.managerEmail)).size;
  const remindText = (() => {
    const before = s.remind.filter((d) => d > 0).sort((a, b) => b - a);
    const parts = [before.length ? L(`${before.join(", ")} days before`, `${before.join(", ")} días antes`) : "", s.remind.includes(0) ? L("on the due date", "el día que vence") : "", s.overdueWeekly ? L("then weekly if late", "y cada semana si se atrasa") : ""].filter(Boolean);
    return parts.length ? parts.join(", ") : L("no automatic reminders", "sin recordatorios automáticos");
  })();

  if (result) return (
    <Sheet title={L("Reviews launched", "Evaluaciones lanzadas")} onClose={() => onDone(L(`Launched ${result.created} reviews`, `${result.created} evaluaciones lanzadas`))}>
      <p className="small" style={{ marginTop: 0 }}><b>{result.created}</b> {L(`review${result.created === 1 ? "" : "s"} open, due ${fmtDay(due, "en")}.`, `evaluaciones abiertas, para el ${fmtDay(due, "es")}.`)}</p>
      <ul className="small pf-launch-done">
        {notify && <li>{L(`${result.managers} manager${result.managers === 1 ? "" : "s"} emailed with their list.`, `Correo a ${result.managers} gerentes con su lista.`)}</li>}
        {self === "now" && <li>{L(`${result.selfSent} self-assessment${result.selfSent === 1 ? "" : "s"} sent.`, `${result.selfSent} autoevaluaciones enviadas.`)}</li>}
        {self === "before" && s.selfAssess && <li>{L(`Self-assessments go out ${s.selfDaysBefore} days before the due date.`, `Las autoevaluaciones salen ${s.selfDaysBefore} días antes.`)}</li>}
        <li>{L(`Managers get reminders ${remindText}.`, `Los gerentes reciben recordatorios ${remindText}.`)}</li>
      </ul>
      {result.skipped.length > 0 && (
        <div className="pf-launch-skip">
          <b className="small">{L("Skipped", "Omitidos")}</b>
          {result.skipped.map((x) => <div key={x.name} className="tiny muted">{x.name}: {x.why}</div>)}
        </div>
      )}
      <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => onDone(L(`Launched ${result.created} reviews`, `${result.created} evaluaciones lanzadas`))}>{L("Done", "Listo")}</button>
    </Sheet>
  );

  return (
    <Sheet title={L("Launch reviews", "Lanzar evaluaciones")} onClose={onClose}>
      <span className="flabel">{L("Who", "Quiénes")}</span>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <input className="f grow" placeholder={L("Search by name or title", "Buscar por nombre o puesto")} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" style={{ minWidth: 160 }} />
        {(depts.length > 0 || mgrs.length > 0) && (
          <select className="f" value={group} onChange={(e) => setGroup(e.target.value)} aria-label={L("Filter", "Filtrar")} style={{ width: "auto" }}>
            <option value="">{L("Everyone", "Todos")}</option>
            {depts.length > 0 && <optgroup label={L("Department", "Departamento")}>{depts.map((d) => <option key={d} value={d}>{d}</option>)}</optgroup>}
            <optgroup label={L("Manager", "Gerente")}>{mgrs.map((m) => <option key={m} value={m}>{L(`${m}'s team`, `Equipo de ${m}`)}</option>)}</optgroup>
          </select>
        )}
      </div>
      <div className="pf-launch-list">
        <label className="pf-launch-row all">
          <input type="checkbox" checked={allOn} onChange={(e) => setAll(e.target.checked)} />
          <b className="small">{L(`Select all${q || group ? " shown" : ""} (${shownOk.length})`, `Seleccionar todos (${shownOk.length})`)}</b>
        </label>
        {shown.map((p) => {
          const w = why(p);
          return (
            <label key={p.id} className={`pf-launch-row ${w ? "off" : ""}`}>
              <input type="checkbox" disabled={!!w} checked={!w && picked.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="grow" style={{ minWidth: 0 }}>
                <b className="small">{p.name}</b>
                <span className="tiny muted">{[p.title, p.managerName && L(`Manager: ${p.managerName}`, `Gerente: ${p.managerName}`)].filter(Boolean).join(" · ")}</span>
              </span>
              {w ? <span className="tiny muted">{w}</span> : !p.hasEmail && s.selfAssess && self !== "skip" ? <span className="tiny muted">{L("No email for self-assessment", "Sin correo")}</span> : null}
            </label>
          );
        })}
      </div>

      <div className="pf-launch-grid section">
        <label className="f">{L("Template", "Plantilla")}
          <select className="f" value={template} onChange={(e) => setTemplate(e.target.value)}>
            {reviewTemplates.map((x) => <option key={x.id} value={x.id}>{x.name}{x.minutes ? ` (about ${x.minutes} min)` : ""}</option>)}
          </select>
        </label>
        <label className="f">{L("Due", "Vence")}
          <input className="f" type="date" value={due} min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>

      {s.selfAssess ? (
        <div className="section">
          <span className="flabel">{L("Employee self-assessment", "Autoevaluación del empleado")}</span>
          <div className="pf-filters" role="group">
            {([["before", L(`${s.selfDaysBefore} days before due`, `${s.selfDaysBefore} días antes`)], ["now", L("Send now", "Enviar ahora")], ["skip", L("Skip", "Omitir")]] as const).map(([k, lb]) => <button key={k} className={self === k ? "on" : ""} aria-pressed={self === k} onClick={() => setSelf(k)}>{lb}</button>)}
          </div>
          <p className="tiny muted" style={{ margin: "6px 0 0" }}>{L("Four short questions by email, in English or Spanish. Only the manager and HR see the answers.", "Cuatro preguntas cortas por correo, en inglés o español. Solo el gerente y RR. HH. ven las respuestas.")}</p>
        </div>
      ) : <p className="tiny muted section">{L("Self-assessments are off.", "Las autoevaluaciones están apagadas.")} <button className="linklike tiny" onClick={onSettings}>{L("Change in Settings", "Cambiar en Ajustes")}</button></p>}

      <label className="row section" style={{ gap: 10, alignItems: "flex-start" }}>
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ marginTop: 3 }} />
        <span className="small" style={{ flex: 1, textAlign: "left" }}>{L(`Email each manager their list now${managersCount ? ` (${managersCount} manager${managersCount === 1 ? "" : "s"})` : ""}`, `Enviar a cada gerente su lista ahora${managersCount ? ` (${managersCount})` : ""}`)}</span>
      </label>
      <p className="tiny muted" style={{ margin: "8px 0 0" }}>{L(`Reminders: managers hear from us ${remindText}. HR gets a copy when one is late.`, `Recordatorios: ${remindText}. RR. HH. recibe copia si se atrasa.`)} <button className="linklike tiny" onClick={onSettings}>{L("Change", "Cambiar")}</button></p>

      <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy || !count} onClick={async () => {
        setBusy(true);
        const r = await call({ action: "launch", personIds: [...picked], template, due, self, notify });
        setBusy(false);
        if (r.ok) setResult({ created: r.created, managers: r.managers, selfSent: r.selfSent, skipped: r.skipped ?? [] });
        else onDone(L("Couldn't launch. Try again.", "No se pudo lanzar."));
      }}>{busy ? L("Launching…", "Lanzando…") : count ? L(`Launch ${count} review${count === 1 ? "" : "s"}`, `Lanzar ${count} evaluaciones`) : L("Pick at least one person", "Elija al menos una persona")}</button>
    </Sheet>
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



/** Review admins: every finished review in a date range as PDFs, zipped. */
function ArchiveSheet({ data, clientId, company, logo, lang, onClose, onDone }: { data: ListData; clientId: string; company: string; logo?: string; lang: Lang; onClose: () => void; onDone: (msg: string) => void }) {
  const es = lang === "es";
  const L = (en: string, s: string) => (es ? s : en);
  const today = new Date().toISOString().slice(0, 10);
  const y = Number(today.slice(0, 4));
  const yearAgo = `${y - 1}${today.slice(4)}`;
  const first = data.reviews.map((r) => (r.finalAt ?? r.due).slice(0, 10)).sort()[0] ?? today;
  const opts: [string, ArchiveRange][] = [
    ["this", { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) }],
    ["last", { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1) }],
    ["12", { from: yearAgo, to: today, label: L("Last 12 months", "Últimos 12 meses") }],
    ["all", { from: first < "2000-01-01" ? "2000-01-01" : first, to: "2999-12-31", label: L("All", "Todas") }],
  ];
  const [k, setK] = useState("this");
  const [from, setFrom] = useState(`${y}-01-01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);
  const range: ArchiveRange = k === "custom" ? { from, to, label: `${from} to ${to}` } : opts.find((o) => o[0] === k)![1];
  const pick = data.reviews.filter((r) => inRange(r, range));
  const ready = pick.filter(isArchived).length;
  const open = pick.length - ready;
  const labels: Record<string, string> = { this: String(y), last: String(y - 1), "12": L("Last 12 months", "Últimos 12 meses"), all: L("All time", "Todo"), custom: L("Pick dates", "Elegir fechas") };
  const go = async () => {
    setBusy(L("Getting started…", "Empezando…"));
    try {
      const out = await buildArchive({ clientId, company, logo, reviews: data.reviews, range, onProgress: (n, t) => setBusy(L(`Making PDFs: ${n} of ${t}`, `Creando PDFs: ${n} de ${t}`)) });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out.blob);
      a.download = out.name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      onDone(L(`Downloaded ${out.files} review${out.files === 1 ? "" : "s"}`, `${out.files} evaluaciones descargadas`));
    } catch {
      setBusy(null);
      onDone(L("Couldn't build the zip. Try again.", "No se pudo crear el zip. Intente de nuevo."));
    }
  };
  return (
    <Sheet title={L("Download reviews", "Descargar evaluaciones")} onClose={onClose}>
      <p className="small muted" style={{ marginTop: 0 }}>{L("Finished reviews and improvement plans as PDFs, sorted into folders, with an index you can open in Excel.", "Evaluaciones y planes de mejora terminados como PDF, en carpetas, con un índice que se abre en Excel.")}</p>
      <div className="small" style={{ fontWeight: 600, margin: "14px 0 8px" }}>{L("Which reviews", "Cuáles evaluaciones")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {[...opts.map((o) => o[0]), "custom"].map((x) => <button key={x} className={`chip chip-btn ${k === x ? "on" : ""}`} aria-pressed={k === x} onClick={() => setK(x)}>{labels[x]}</button>)}
      </div>
      {k === "custom" && (
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <label className="grow small">{L("From", "Desde")}<input className="f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="grow small">{L("To", "Hasta")}<input className="f" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      )}
      <div className="card" style={{ margin: "14px 0", padding: 14 }}>
        <b className="small">{ready ? L(`${ready} finished review${ready === 1 ? "" : "s"}`, `${ready} evaluaciones terminadas`) : L("No finished reviews in these dates", "No hay evaluaciones terminadas en estas fechas")}</b>
        {open > 0 && <div className="tiny muted" style={{ marginTop: 4 }}>{L(`${open} not finished yet. They're listed in the index, not included as PDFs.`, `${open} sin terminar. Aparecen en el índice, sin PDF.`)}</div>}
        <div className="tiny muted" style={{ marginTop: 6, lineHeight: 1.5 }}>{L("Each PDF has the full review, the employee's comment and the sign-off dates. Reviews read in Spanish come in both languages. Folders: Performance reviews, New hire reviews, Improvement plans.", "Cada PDF tiene la evaluación completa, el comentario del empleado/a y las fechas de firma. Las leídas en español vienen en ambos idiomas.")}</div>
      </div>
      <button className="btn primary" style={{ width: "100%" }} disabled={!ready || !!busy} onClick={go}>{busy ?? L("Download zip", "Descargar zip")}</button>
      <p className="tiny muted" style={{ marginBottom: 0 }}>🔒 {L("Only review admins can do this. Store the zip somewhere secure.", "Solo los administradores de evaluaciones pueden hacer esto. Guarde el zip en un lugar seguro.")}</p>
    </Sheet>
  );
}
