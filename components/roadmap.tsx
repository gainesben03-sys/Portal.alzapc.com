"use client";

// HR Roadmap screens: the dashboard tile, the full roadmap (Timeline, Calendar, List), setup, an item, and settings.
// Executives and HR only.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ReactNode, useMemo, useState } from "react";
import { useSaveProject, useAssignees } from "@/components/projectedit";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { Person, Project, isAdvisorName } from "@/lib/data";
import {
  addDays, Ans, buildYear, catOf, CATS, daysUntil, fmtRange, fmtShort, isRoadmap, iso, makeItem, nextCopy, nextDate, Phase, PHASE_LABEL, phaseOf,
  REMIND_CHOICES, Repeat, RoadmapProject, roadmapFor, RoadmapSettings, STEPS, TEMPLATES, todayISO, tplById,
} from "@/lib/roadmap";
import { useStore } from "@/lib/store";
import { authHeader, LIVE } from "@/lib/supabase";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TONE: Record<Phase, string> = { done: "green", overdue: "red", active: "blue", soon: "gold", planned: "" };

// ------------------------------------------------------------------ data
export function useRoadmap(clientId: string) {
  const { projects, config, patch, viewer, me, refresh } = useStore();
  const save = useSaveProject();
  const cfg = config[clientId];
  const settings = roadmapFor(cfg?.roadmap);
  const items = projects.filter((p) => p.clientId === clientId && isRoadmap(p)) as RoadmapProject[];
  const canUse = viewer?.kind === "advisor" || me?.access === "exec";
  const meP: Person | undefined = viewer?.kind === "client" ? { name: viewer.person.name, role: viewer.person.role, email: me?.email ?? viewer.person.email } : undefined;
  const saveSettings = async (s: RoadmapSettings): Promise<boolean> => {
    if (!LIVE) {
      patch({ config: { ...config, [clientId]: { ...cfg, roadmap: s } } });
      return true;
    }
    try {
      const r = await fetch("/api/roadmap", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ clientId, settings: s }) });
      const j = await r.json();
      if (j.ok) await refresh?.();
      return !!j.ok;
    } catch {
      return false;
    }
  };
  const addItems = (list: RoadmapProject[]) => list.length && patch({ projects: [...projects, ...list] });
  const saveItem = (next: RoadmapProject, prev: RoadmapProject) => save(next, prev);
  const remove = (p: RoadmapProject) => patch({ projects: projects.filter((x) => x.id !== p.id) });
  /** Finish one: mark done and line up next year's copy. */
  const finish = (p: RoadmapProject) => {
    const copy = nextCopy(p);
    const done: RoadmapProject = { ...p, status: "done", milestoneDue: todayISO(), steps: p.steps.map((s) => ({ ...s, done: true, doneAt: s.doneAt ?? new Date().toISOString() })), roadmap: { ...p.roadmap, next: copy?.id } };
    patch({ projects: [...projects.map((x) => (x.id === p.id ? done : x)), ...(copy ? [copy] : [])] });
    return copy;
  };
  return { cfg, settings, items, canUse, meP, saveSettings, addItems, saveItem, remove, finish };
}

function Shell({ children }: { children: (clientId: string) => ReactNode }) {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, viewer, me } = useStore();
  const client = getClient(clientId);
  if (!ok || !client) return null;
  const canUse = viewer?.kind === "advisor" || me?.access === "exec";
  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap wide">{canUse ? children(client.id) : <div className="card section small muted">The HR Roadmap is for executives.</div>}</main>
    </div>
  );
}

// ------------------------------------------------------------------ dashboard tile
export function RoadmapTile({ clientId }: { clientId: string }) {
  const R = useRoadmap(clientId);
  const base = `/c/${clientId}/roadmap`;
  const day = todayISO();
  const open = R.items.filter((p) => p.status !== "done").sort((a, b) => a.roadmap.start.localeCompare(b.roadmap.start));
  if (!R.settings.setupAt && !open.length)
    return (
      <div className="card rm-tile">
        <div className="row" style={{ justifyContent: "space-between" }}><b>HR Roadmap</b><span className="tiny muted">About 5 minutes</span></div>
        <div className="rm-blank" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <span key={i} />)}</div>
        <b className="rm-pitch">Plan your HR year in one place</b>
        <p className="small muted" style={{ margin: 0 }}>Answer a few questions and Alza builds your year: projects, checklists and reminders before each one is due.</p>
        <div><Link className="btn primary sm" href={`${base}/setup`}>Set up my roadmap</Link></div>
      </div>
    );
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(`${day.slice(0, 7)}-01T12:00:00`); d.setMonth(d.getMonth() + i); return iso(d).slice(0, 7); });
  const late = open.filter((p) => phaseOf(p, day) === "overdue");
  return (
    <div className="card rm-tile">
      <div className="row" style={{ justifyContent: "space-between" }}><b>HR Roadmap</b><Link href={base} className="small" style={{ fontWeight: 600 }}>Open</Link></div>
      <div className="rm-strip">
        {months.map((m) => {
          const n = open.filter((p) => p.roadmap.start.slice(0, 7) <= m && p.roadmap.end.slice(0, 7) >= m).length;
          return <Link key={m} href={base} className="rm-strip-m" title={`${n} in ${MONTHS[Number(m.slice(5)) - 1]}`}><span>{MONTHS[Number(m.slice(5)) - 1][0]}</span><i className={n > 2 ? "hi" : n ? "on" : ""} /></Link>;
        })}
      </div>
      <div>
        {open.filter((p) => phaseOf(p, day) !== "overdue").slice(0, 3).map((p) => {
          const d = daysUntil(p.roadmap.start, day);
          return (
            <Link key={p.id} href={`${base}?item=${p.id}`} className="rm-next">
              <span className={`rm-days ${d <= 0 ? "now" : d <= 14 ? "soon" : ""}`}>{d <= 0 ? "Now" : `${d} day${d === 1 ? "" : "s"}`}</span>
              <span className="grow"><b>{p.name}</b><span className="tiny muted">{fmtRange(p.roadmap.start, p.roadmap.end)}{p.roadmap.owner ? ` · ${p.roadmap.owner.name.split(" ")[0]}` : ""}{p.steps.length ? ` · ${p.steps.filter((s) => s.done).length} of ${p.steps.length} steps` : ""}</span></span>
            </Link>
          );
        })}
      </div>
      <span className="tiny muted">{open.length} on the roadmap{late.length ? ` · ` : ""}{late.length > 0 && <Link href={`${base}?view=list&f=late`} style={{ color: "var(--red)", fontWeight: 600 }}>{late.length} overdue</Link>}</span>
    </div>
  );
}

// ------------------------------------------------------------------ the full roadmap
type View = "timeline" | "calendar" | "list";
export function RoadmapPage() {
  return <Shell>{(id) => <Roadmap clientId={id} />}</Shell>;
}
function Roadmap({ clientId }: { clientId: string }) {
  const R = useRoadmap(clientId);
  const toast = useToast();
  const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const [view, setView] = useState<View>((q?.get("view") as View) || "timeline");
  const [openId, setOpenId] = useState<string | null>(q?.get("item") ?? null);
  const [lib, setLib] = useState(false);
  const base = `/c/${clientId}/roadmap`;
  const open = R.items.find((p) => p.id === openId);
  const day = todayISO();
  const live = R.items.filter((p) => p.status !== "done");
  const late = live.filter((p) => phaseOf(p, day) === "overdue").length;
  const under = live.filter((p) => phaseOf(p, day) === "active").length;

  if (!R.settings.setupAt && !R.items.length)
    return (
      <div className="card section rm-empty">
        <h1 className="pl-title">HR Roadmap</h1>
        <p>Plan your HR year in one place. Answer a few questions (when reviews happen, when open enrollment is, when the handbook gets updated) and Alza builds your year: projects, checklists and reminders before each one is due.</p>
        <Link className="btn primary" href={`${base}/setup`}>Set up my roadmap</Link>
      </div>
    );

  return (
    <>
      <div className="pl-head">
        <div className="grow">
          <h1 className="pl-title">HR Roadmap</h1>
          <p className="small muted" style={{ margin: "4px 0 0" }}>The next 12 months · {live.length} items{under ? ` · ${under} underway` : ""}{late ? ` · ${late} overdue` : ""}</p>
        </div>
        <div className="rm-seg" role="group" aria-label="View">
          {(["timeline", "calendar", "list"] as View[]).map((v) => <button key={v} aria-pressed={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
        </div>
        <button className="btn ghost sm" onClick={() => setLib(true)}>+ Add</button>
        <Link className="btn ghost sm" href={`${base}/settings`}>Settings</Link>
      </div>
      {view === "timeline" && <Timeline items={R.items} onOpen={setOpenId} />}
      {view === "calendar" && <CalendarView items={R.items} onOpen={setOpenId} />}
      {view === "list" && <ListView items={R.items} onOpen={setOpenId} initial={q?.get("f") === "late" ? "late" : "upcoming"} />}
      {open && <ItemSheet clientId={clientId} p={open} R={R} onClose={() => setOpenId(null)} toast={toast.show} />}
      {lib && <LibrarySheet clientId={clientId} R={R} onClose={() => setLib(false)} onAdded={(p) => { setLib(false); setOpenId(p.id); toast.show(`Added: ${p.name}`); }} />}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </>
  );
}

function windowMonths(): Date[] {
  const s = new Date(`${todayISO().slice(0, 7)}-01T12:00:00`);
  return Array.from({ length: 12 }, (_, i) => { const d = new Date(s); d.setMonth(d.getMonth() + i); return d; });
}

function Timeline({ items, onOpen }: { items: RoadmapProject[]; onOpen: (id: string) => void }) {
  const ms = windowMonths();
  const t0 = ms[0].getTime();
  const end = new Date(ms[11]); end.setMonth(end.getMonth() + 1);
  const span = end.getTime() - t0;
  const pos = (d: string) => Math.max(0, Math.min(100, ((Date.parse(`${d}T12:00:00`) - t0) / span) * 100));
  const now = pos(todayISO());
  const shown = items.filter((p) => p.status !== "done" || p.roadmap.end >= iso(ms[0]));
  const rows = CATS.map((c) => {
    const list = shown.filter((p) => p.roadmap.cat === c.key);
    const byTpl = new Map<string, RoadmapProject[]>();
    for (const p of list.sort((a, b) => a.roadmap.start.localeCompare(b.roadmap.start))) byTpl.set(p.roadmap.tpl + p.name, [...(byTpl.get(p.roadmap.tpl + p.name) ?? []), p]);
    return { c, rows: [...byTpl.values()] };
  }).filter((g) => g.rows.length);
  return (
    <div className="card section rm-tl">
      <div className="rm-tl-row rm-tl-head"><span />{ms.map((m) => <span key={m.toISOString()}>{MONTHS[m.getMonth()]}{m.getMonth() === 0 ? ` ${String(m.getFullYear()).slice(2)}` : ""}</span>)}</div>
      {!rows.length && <p className="small muted">Nothing in the next 12 months. Add something from the library.</p>}
      {rows.map(({ c, rows }) => (
        <div key={c.key}>
          <div className="rm-cat" style={{ color: c.color }}>{c.label}</div>
          {rows.map((list) => (
            <div key={list[0].id} className="rm-tl-row">
              <span className="rm-tl-name">{list[0].name}</span>
              <span className="rm-track" style={{ gridColumn: "2 / -1" }}>
                <i className="rm-now" style={{ left: `${now}%` }} aria-hidden="true" />
                {list.map((p) => {
                  const l = pos(p.roadmap.start);
                  const w = Math.max(1.2, pos(addDays(p.roadmap.end, 1)) - l);
                  const prep = p.steps.length ? p.steps.map((s) => s.due ?? p.roadmap.start).sort()[0] : p.roadmap.start;
                  const pl = pos(prep);
                  const ph = phaseOf(p);
                  return (
                    <span key={p.id}>
                      {pl < l && <i className="rm-prep" style={{ left: `${pl}%`, width: `${l - pl}%`, ["--c" as string]: c.color }} aria-hidden="true" />}
                      <button className={`rm-bar ${ph}`} style={{ left: `${l}%`, width: `${w}%`, ["--c" as string]: c.color }} onClick={() => onOpen(p.id)} title={`${p.name}: ${fmtRange(p.roadmap.start, p.roadmap.end)} (${PHASE_LABEL[ph]})`} aria-label={`${p.name}, ${fmtRange(p.roadmap.start, p.roadmap.end)}`} />
                    </span>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      ))}
      <p className="tiny muted" style={{ margin: "12px 0 0" }}>Shaded lead-up = prep steps start. Red outline = overdue. Click a bar to open it.</p>
    </div>
  );
}

function CalendarView({ items, onOpen }: { items: RoadmapProject[]; onOpen: (id: string) => void }) {
  const [m, setM] = useState(() => todayISO().slice(0, 7));
  const first = new Date(`${m}-01T12:00:00`);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const shift = (n: number) => { const d = new Date(first); d.setMonth(d.getMonth() + n); setM(iso(d).slice(0, 7)); };
  const ev = (day: string) => items.flatMap((p) => [
    ...(p.roadmap.start === day ? [{ p, label: p.roadmap.start === p.roadmap.end ? p.name : `${p.name} starts` }] : []),
    ...(p.roadmap.end === day && p.roadmap.end !== p.roadmap.start ? [{ p, label: `${p.name} due` }] : []),
  ]);
  const t = todayISO();
  return (
    <div className="card section">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ fontSize: 18 }}>{first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</b>
        <div className="row" style={{ gap: 6 }}><button className="btn ghost sm" aria-label="Previous month" onClick={() => shift(-1)}>‹</button><button className="btn ghost sm" onClick={() => setM(t.slice(0, 7))}>Today</button><button className="btn ghost sm" aria-label="Next month" onClick={() => shift(1)}>›</button></div>
      </div>
      <div className="rm-cal rm-cal-h">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d}>{d}</span>)}</div>
      <div className="rm-cal">
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} className="blank" />)}
        {Array.from({ length: days }, (_, i) => {
          const d = `${m}-${String(i + 1).padStart(2, "0")}`;
          return (
            <div key={d} className={`rm-day ${d === t ? "today" : ""}`}>
              <b>{i + 1}</b>
              {ev(d).map((e, k) => <button key={k} className="rm-ev" style={{ ["--c" as string]: catOf(e.p.roadmap.cat).color }} onClick={() => onOpen(e.p.id)}>{e.label}</button>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ items, onOpen, initial }: { items: RoadmapProject[]; onOpen: (id: string) => void; initial: "upcoming" | "late" }) {
  const [f, setF] = useState<"upcoming" | "late" | "done" | "owner">(initial);
  const day = todayISO();
  let list = items.filter((p) => (f === "done" ? p.status === "done" : f === "late" ? phaseOf(p, day) === "overdue" : p.status !== "done"));
  list = f === "owner" ? list.sort((a, b) => (a.roadmap.owner?.name ?? "~").localeCompare(b.roadmap.owner?.name ?? "~") || a.roadmap.start.localeCompare(b.roadmap.start)) : f === "done" ? list.sort((a, b) => b.milestoneDue.localeCompare(a.milestoneDue)) : list.sort((a, b) => a.roadmap.start.localeCompare(b.roadmap.start));
  return (
    <div className="card section">
      <div className="chips" style={{ marginBottom: 10 }}>
        {([["upcoming", "Upcoming"], ["late", "Overdue"], ["done", "Done"], ["owner", "By owner"]] as const).map(([k, l]) => <button key={k} className={`chip chip-btn ${f === k ? "on" : ""}`} onClick={() => setF(k)}>{l}</button>)}
      </div>
      {!list.length && <p className="small muted">Nothing here.</p>}
      <div className="pl-table">
        {list.length > 0 && <div className="pl-tr pl-th rm-lr"><span>When</span><span>Item</span><span>Owner</span><span>Status</span></div>}
        {list.map((p) => {
          const ph = phaseOf(p, day);
          return (
            <button key={p.id} className="pl-tr rm-lr" onClick={() => onOpen(p.id)}>
              <span className={ph === "overdue" ? "pl-late" : ""}>{fmtShort(p.roadmap.start)}</span>
              <span><b>{p.name}</b><span className="tiny muted" style={{ display: "block" }}>{catOf(p.roadmap.cat).label}{p.steps.length ? ` · ${p.steps.filter((s) => s.done).length} of ${p.steps.length} steps` : ""}{p.roadmap.repeat !== "none" ? ` · repeats ${p.roadmap.repeat}` : ""}</span></span>
              <span className="small">{p.roadmap.owner?.name ?? "—"}</span>
              <span><span className={`pf-chip ${TONE[ph]}`}>{PHASE_LABEL[ph]}</span></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ one item
type RR = ReturnType<typeof useRoadmap>;
function ItemSheet({ clientId, p, R, onClose, toast }: { clientId: string; p: RoadmapProject; R: RR; onClose: () => void; toast: (m: string) => void }) {
  const people = useAssignees(clientId);
  const [v, setV] = useState<RoadmapProject>(p);
  const [newStep, setNewStep] = useState("");
  const dirty = JSON.stringify(v) !== JSON.stringify(p);
  const t = tplById(p.roadmap.tpl);
  const day = todayISO();
  const ph = phaseOf(v, day);
  const meta = (m: Partial<RoadmapProject["roadmap"]>) => setV((x) => ({ ...x, roadmap: { ...x.roadmap, ...m }, milestoneDue: x.status === "planned" ? m.start ?? x.roadmap.start : m.end ?? x.roadmap.end }));
  const save = () => { R.saveItem(v, p); toast("Saved"); };
  const s = R.settings;
  const to = [s.toOwner && (v.roadmap.owner?.name ?? "the owner"), s.toBen && "HR", s.toExecs && "all executives", ...s.extra].filter(Boolean).join(", ");
  const sched = [...s.remind.map((n) => ({ k: String(n), label: `${n} days before`, at: addDays(v.roadmap.start, -n) })), ...(s.dueDay ? [{ k: "due", label: "Due date", at: v.roadmap.end }] : [])];
  return (
    <Sheet title={v.name} onClose={() => { if (dirty) save(); onClose(); }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: -6 }}>
        <span className={`pf-chip ${TONE[ph]}`}>{PHASE_LABEL[ph]}</span>
        <span className="tiny muted">{catOf(v.roadmap.cat).label}{ph !== "done" ? ` · ${daysUntil(v.roadmap.start, day) > 0 ? `starts in ${daysUntil(v.roadmap.start, day)} days` : daysUntil(v.roadmap.end, day) >= 0 ? `due in ${daysUntil(v.roadmap.end, day)} days` : `${-daysUntil(v.roadmap.end, day)} days overdue`}` : ""}</span>
      </div>
      <p className="small" style={{ margin: "10px 0" }}>{v.summary}</p>
      {t?.link && <Link className="btn primary sm" href={`/c/${clientId}/${t.link.path}`} style={{ marginBottom: 12 }}>{t.link.label}</Link>}
      <div className="rm-form">
        <label><span className="flabel">Starts</span><input type="date" className="f" value={v.roadmap.start} onChange={(e) => e.target.value && meta({ start: e.target.value, end: e.target.value > v.roadmap.end ? e.target.value : v.roadmap.end })} /></label>
        <label><span className="flabel">Due</span><input type="date" className="f" value={v.roadmap.end} min={v.roadmap.start} onChange={(e) => e.target.value && meta({ end: e.target.value })} /></label>
        <label><span className="flabel">Owner</span>
          <select className="f" value={v.roadmap.owner?.name ?? ""} onChange={(e) => meta({ owner: people.find((x) => x.name === e.target.value) })}>
            <option value="">Not set</option>
            {people.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
          </select>
        </label>
        <label><span className="flabel">Repeats</span>
          <select className="f" value={v.roadmap.repeat} onChange={(e) => meta({ repeat: e.target.value as Repeat })}>
            <option value="yearly">Every year</option><option value="quarterly">Every quarter</option><option value="none">Just once</option>
          </select>
        </label>
      </div>
      <div className="rm-check">
        <div className="row" style={{ justifyContent: "space-between" }}><span className="flabel">Checklist</span><span className="tiny muted">{v.steps.filter((x) => x.done).length} of {v.steps.length} done</span></div>
        {v.steps.map((x, i) => (
          <div key={x.id} className="ib-step">
            <input type="checkbox" checked={x.done} aria-label={x.text} onChange={() => setV((y) => ({ ...y, steps: y.steps.map((z, j) => (j === i ? { ...z, done: !z.done, doneAt: !z.done ? new Date().toISOString() : undefined } : z)) }))} />
            <span className={x.done ? "done" : ""}>{x.text}</span>
            <span className="tiny muted">{x.due ? fmtShort(x.due) : ""}</span>
            <button className="pqe-x" aria-label="Remove step" onClick={() => setV((y) => ({ ...y, steps: y.steps.filter((_, j) => j !== i) }))}>✕</button>
          </div>
        ))}
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <input className="f grow" placeholder="Add a step" value={newStep} onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newStep.trim()) { setV((y) => ({ ...y, steps: [...y.steps, { id: `s${Date.now().toString(36)}`, text: newStep.trim(), done: false }] })); setNewStep(""); } }} />
        </div>
      </div>
      <details className="pl-details" style={{ marginTop: 10 }}>
        <summary className="small"><b>Reminders</b> <span className="tiny muted">to {to || "nobody"}</span></summary>
        <div className="rm-rem">
          {sched.map((r) => <div key={r.k}><span>{r.label}</span><span className={(v.roadmap.sent ?? []).includes(r.k) ? "sent" : "tiny muted"}>{(v.roadmap.sent ?? []).includes(r.k) ? "Sent" : fmtShort(r.at)}</span></div>)}
          {s.overdueWeekly && <div><span>Weekly while overdue</span><span className="tiny muted" /></div>}
        </div>
        <Link href={`/c/${clientId}/roadmap/settings`} className="tiny">Change reminders</Link>
      </details>
      <div className="sheet-actions" style={{ flexWrap: "wrap" }}>
        <button className="linklike tiny" style={{ color: "var(--red)", marginRight: "auto" }} onClick={() => { R.remove(p); onClose(); toast("Removed from the roadmap"); }}>Remove</button>
        <Link className="btn ghost sm" href={`/c/${clientId}/projects/${p.id}`}>Project page</Link>
        {v.status === "planned" && <button className="btn ghost sm" onClick={() => { R.saveItem({ ...v, status: "active", startedAt: new Date().toISOString(), milestoneDue: v.roadmap.end }, p); toast("Started"); onClose(); }}>Start now</button>}
        {v.status !== "done" && <button className="btn ghost sm" onClick={() => { const c = R.finish(v); toast(c ? `Done. Next one is set for ${fmtShort(c.roadmap.start)}.` : "Done"); onClose(); }}>Mark done</button>}
        <button className="btn primary sm" disabled={!dirty} onClick={save}>{dirty ? "Save" : "Saved"}</button>
      </div>
    </Sheet>
  );
}

function LibrarySheet({ clientId, R, onClose, onAdded }: { clientId: string; R: RR; onClose: () => void; onAdded: (p: RoadmapProject) => void }) {
  const day = todayISO();
  const on = (id: string) => R.items.some((p) => p.roadmap.tpl === id && p.status !== "done");
  const [custom, setCustom] = useState("");
  const [cDate, setCDate] = useState(addDays(day, 30));
  return (
    <Sheet title="Add to your roadmap" onClose={onClose}>
      {CATS.map((c) => (
        <div key={c.key} style={{ marginBottom: 12 }}>
          <div className="rm-cat" style={{ color: c.color }}>{c.label}</div>
          {TEMPLATES.filter((t) => t.cat === c.key).map((t) => (
            <div key={t.id} className="rm-lib">
              <span className="grow"><b className="small">{t.title}</b><span className="tiny muted" style={{ display: "block" }}>{t.blurb}</span></span>
              {on(t.id) ? <span className="tiny" style={{ color: "var(--green)", fontWeight: 600 }}>On</span> : (
                <button className="btn ghost sm" onClick={() => { const st = nextDate(t.month, t.day, day); const p = makeItem(t, clientId, st, addDays(st, t.days), R.meP, R.meP); R.addItems([p]); onAdded(p); }}>Add</button>
              )}
            </div>
          ))}
        </div>
      ))}
      <div className="rm-cat">Something else</div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <input className="f grow" placeholder="e.g. Office move, new payroll system" value={custom} onChange={(e) => setCustom(e.target.value)} style={{ minWidth: 200 }} />
        <input type="date" className="f" value={cDate} min={day} onChange={(e) => setCDate(e.target.value)} style={{ width: "auto" }} aria-label="Start date" />
        <button className="btn primary sm" disabled={!custom.trim()} onClick={() => {
          const p: RoadmapProject = { id: `rm${Date.now().toString(36)}`, clientId, name: custom.trim(), status: "planned", summary: "", steps: [], nextMilestone: "", milestoneDue: cDate, createdBy: R.meP, roadmap: { tpl: "custom", cat: "people", start: cDate, end: addDays(cDate, 14), repeat: "none", owner: R.meP } };
          R.addItems([p]); onAdded(p);
        }}>Add</button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ setup
export function SetupPage() {
  return <Shell>{(id) => <Setup clientId={id} />}</Shell>;
}
function Setup({ clientId }: { clientId: string }) {
  const R = useRoadmap(clientId);
  const router = useRouter();
  const { config } = useStore();
  const people = useAssignees(clientId);
  const [ans, setAns] = useState<Record<string, Ans>>(() => ({ ...R.settings.answers }));
  const [step, setStep] = useState(0);
  const [owner, setOwner] = useState<string>(R.meP?.name ?? people.find((x) => !isAdvisorName(x.name))?.name ?? "");
  const [busy, setBusy] = useState(false);
  const compliance = !!config[clientId]?.modules?.compliance;
  const last = step === STEPS.length;
  const draft = useMemo(() => buildYear({ ...R.settings, answers: ans }, clientId, [], undefined, undefined, { compliance }), [ans, R.settings, clientId, compliance]);
  const set = (id: string, a: Ans) => setAns((x) => ({ ...x, [id]: a }));
  const finish = async () => {
    setBusy(true);
    const ownerP = people.find((x) => x.name === owner);
    const items = buildYear({ ...R.settings, answers: ans }, clientId, R.items, ownerP, R.meP, { compliance });
    const ok = await R.saveSettings({ ...R.settings, answers: ans, setupAt: new Date().toISOString(), setupBy: R.meP?.name ?? "HR" });
    R.addItems(items);
    setBusy(false);
    if (ok) router.push(`/c/${clientId}/roadmap`);
  };
  const cur = STEPS[step];
  return (
    <>
      <div className="pl-head">
        <div className="grow">
          <Link href={`/c/${clientId}/roadmap`} className="tiny" style={{ fontWeight: 600 }}>HR Roadmap</Link>
          <h1 className="pl-title">Set up your HR roadmap</h1>
          <p className="small muted" style={{ margin: "4px 0 0" }}>Pick a month, exact dates, or &ldquo;Not scheduled.&rdquo; You can change anything later.</p>
        </div>
        <span className="tiny muted">Step {Math.min(step + 1, STEPS.length + 1)} of {STEPS.length + 1}</span>
      </div>
      <div className="rm-setup">
        <nav className="rm-steps" aria-label="Setup steps">
          {[...STEPS.map((s) => s.label), "Must-dos and owner"].map((l, i) => (
            <button key={l} className={`rm-step ${i === step ? "on" : i < step ? "done" : ""}`} onClick={() => setStep(i)}><b>{i < step ? "✓" : i + 1}</b>{l}</button>
          ))}
        </nav>
        <div className="card section rm-qs">
          {!last && cur.qs.map((q) => (
            <div key={q.tpl} className="rm-q">
              <b>{q.ask}</b>
              <MonthPick a={ans[q.tpl]} rec={tplById(q.tpl)!.month} onChange={(a) => set(q.tpl, a)} />
              {q.also && ans[q.tpl] && !ans[q.tpl].off && (
                <div className="rm-also">
                  <span className="small">{q.also.ask}</span>
                  <MonthPick a={ans[q.also.tpl]} rec={tplById(q.also.tpl)!.month} onChange={(a) => set(q.also!.tpl, a)} compact />
                </div>
              )}
            </div>
          ))}
          {last && (
            <>
              <div className="rm-q">
                <b>California must-dos Alza adds for you</b>
                <p className="small muted" style={{ margin: "2px 0 8px" }}>On by default. Turn off anything that doesn&apos;t apply.</p>
                {TEMPLATES.filter((t) => t.must && (t.id !== "harassment" || compliance)).map((t) => (
                  <label key={t.id} className="pl-radio"><input type="checkbox" checked={!ans[t.id]?.off} onChange={(e) => set(t.id, e.target.checked ? {} : { off: true })} /><span><b>{t.title}</b><span className="tiny muted">{t.blurb}</span></span></label>
                ))}
              </div>
              <div className="rm-q">
                <b>Who owns these by default?</b>
                <select className="f" value={owner} onChange={(e) => setOwner(e.target.value)} style={{ maxWidth: 320 }}>
                  {people.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                </select>
                <span className="tiny muted">You can give any item its own owner later. Reminders go to the owner and HR unless you change it in Settings.</span>
              </div>
            </>
          )}
          <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <button className="btn ghost sm" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
            {last ? <button className="btn primary" disabled={busy} onClick={finish}>{busy ? "Building…" : `Build my roadmap (${draft.length})`}</button>
              : <button className="btn primary sm" onClick={() => setStep(step + 1)}>Next: {step + 1 < STEPS.length ? STEPS[step + 1].label : "Must-dos and owner"}</button>}
          </div>
        </div>
        <aside className="card section rm-preview">
          <b>Your next 12 months</b>
          <span className="tiny muted">Builds as you answer</span>
          {!draft.length && <p className="small muted">Nothing yet.</p>}
          {draft.sort((a, b) => a.roadmap.start.localeCompare(b.roadmap.start)).map((p) => (
            <div key={p.id} className="rm-pv"><span>{fmtShort(p.roadmap.start).split(" ")[0]}</span><span>{p.name}</span><i style={{ background: catOf(p.roadmap.cat).color }} /></div>
          ))}
        </aside>
      </div>
    </>
  );
}

function MonthPick({ a, rec, onChange, compact }: { a?: Ans; rec: number; onChange: (a: Ans) => void; compact?: boolean }) {
  const [exact, setExact] = useState(!!a?.start);
  const day = todayISO();
  return (
    <div className="rm-mp">
      <div className={`rm-months ${compact ? "compact" : ""}`}>
        {MONTHS.map((m, i) => <button key={m} aria-pressed={a?.month === i + 1 && !a?.start} className={a?.month === i + 1 && !a?.start && !a?.off && !a?.rec ? "on" : ""} onClick={() => { setExact(false); onChange({ month: i + 1 }); }}>{m}{i + 1 === rec && !compact ? <i aria-hidden="true" /> : null}</button>)}
      </div>
      <div className="rm-mp-alt">
        <button className={`chip chip-btn ${a?.off ? "on" : ""}`} onClick={() => { setExact(false); onChange({ off: true }); }}>Not scheduled</button>
        {!compact && <button className={`chip chip-btn ${a?.rec ? "on" : ""}`} onClick={() => { setExact(false); onChange({ month: rec, rec: true }); }}>Use the usual time ({MONTHS[rec - 1]})</button>}
        <button className={`chip chip-btn ${exact ? "on" : ""}`} onClick={() => setExact(true)}>Exact dates</button>
        {exact && (
          <span className="row" style={{ gap: 6, alignItems: "center" }}>
            <input type="date" className="f" min={day} value={a?.start ?? ""} onChange={(e) => onChange({ start: e.target.value, end: a?.end && a.end >= e.target.value ? a.end : undefined })} aria-label="Start" />
            <span className="tiny muted">to</span>
            <input type="date" className="f" min={a?.start ?? day} value={a?.end ?? ""} onChange={(e) => onChange({ ...a, end: e.target.value })} aria-label="End" />
          </span>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ settings
export function SettingsPage() {
  return <Shell>{(id) => <Settings clientId={id} />}</Shell>;
}
function Settings({ clientId }: { clientId: string }) {
  const R = useRoadmap(clientId);
  const toast = useToast();
  const [s, setS] = useState<RoadmapSettings>(R.settings);
  const [email, setEmail] = useState("");
  const dirty = JSON.stringify(s) !== JSON.stringify(R.settings);
  const toggle = (n: number) => setS((x) => ({ ...x, remind: x.remind.includes(n) ? x.remind.filter((y) => y !== n) : [...x.remind, n].sort((a, b) => b - a) }));
  return (
    <>
      <div className="pl-head">
        <div className="grow">
          <Link href={`/c/${clientId}/roadmap`} className="tiny" style={{ fontWeight: 600 }}>HR Roadmap</Link>
          <h1 className="pl-title">Roadmap settings</h1>
          <p className="small muted" style={{ margin: "4px 0 0" }}>Executives and HR can change these.</p>
        </div>
        <button className="btn primary sm" disabled={!dirty} onClick={async () => { const ok = await R.saveSettings(s); toast.show(ok ? "Saved" : "Couldn't save. Try again."); }}>{dirty ? "Save" : "Saved"}</button>
      </div>
      <div className="pl-two">
        <div className="card section">
          <b>Reminders</b>
          <p className="tiny muted" style={{ margin: "2px 0 10px" }}>Days before each item starts</p>
          <div className="chips">{REMIND_CHOICES.map((n) => <button key={n} className={`chip chip-btn ${s.remind.includes(n) ? "on" : ""}`} onClick={() => toggle(n)}>{n} day{n === 1 ? "" : "s"}</button>)}</div>
          <label className="pl-radio"><input type="checkbox" checked={s.dueDay} onChange={(e) => setS({ ...s, dueDay: e.target.checked })} /><span>On the due date</span></label>
          <label className="pl-radio"><input type="checkbox" checked={s.overdueWeekly} onChange={(e) => setS({ ...s, overdueWeekly: e.target.checked })} /><span>Weekly while overdue</span></label>
          <b style={{ display: "block", marginTop: 14 }}>Who gets them</b>
          <label className="pl-radio"><input type="checkbox" checked={s.toOwner} onChange={(e) => setS({ ...s, toOwner: e.target.checked })} /><span>The item&apos;s owner</span></label>
          <label className="pl-radio"><input type="checkbox" checked={s.toBen} onChange={(e) => setS({ ...s, toBen: e.target.checked })} /><span>HR (a copy)</span></label>
          <label className="pl-radio"><input type="checkbox" checked={s.toExecs} onChange={(e) => setS({ ...s, toExecs: e.target.checked })} /><span>All executives</span></label>
          <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {s.extra.map((e) => <span key={e} className="chip">{e} <button className="linklike tiny" aria-label={`Remove ${e}`} onClick={() => setS({ ...s, extra: s.extra.filter((x) => x !== e) })}>✕</button></span>)}
            <input className="f" placeholder="Add someone: name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ maxWidth: 280, margin: 0 }} />
            <button className="btn ghost sm" disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())} onClick={() => { setS({ ...s, extra: [...new Set([...s.extra, email.trim().toLowerCase()])] }); setEmail(""); }}>Add</button>
          </div>
          <p className="tiny muted" style={{ margin: "8px 0 0" }}>By email, plus a phone alert for anyone who turned alerts on.</p>
        </div>
        <div className="card section">
          <b>Your setup</b>
          <p className="small muted" style={{ margin: "4px 0 10px" }}>{R.settings.setupAt ? `Set up ${fmtShort(R.settings.setupAt.slice(0, 10))}${R.settings.setupBy ? ` by ${R.settings.setupBy}` : ""}.` : "Not set up yet."} Redoing it adds anything new and leaves what&apos;s already on the roadmap.</p>
          <Link className="btn ghost sm" href={`/c/${clientId}/roadmap/setup`}>{R.settings.setupAt ? "Redo the setup questions" : "Set up my roadmap"}</Link>
        </div>
      </div>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </>
  );
}

export type { Project };
