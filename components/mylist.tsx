"use client";

// My list: a private checklist on the dashboard, with due dates and email reminders.
// Only the person themselves can see it (the database enforces that, Ben included).
import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { authHeader, LIVE, sb } from "@/lib/supabase";

type Item = { id: string; text: string; done: boolean; due: string | null; remind_at: string | null; scheduled_id?: string | null; created_at: string };
const KEY = "alza-demo-mylist-v1";
const iso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const demo = (): Item[] => [
  { id: "m1", text: "Call the benefits broker about renewal", done: false, due: iso(2), remind_at: `${iso(2)}T16:00:00.000Z`, created_at: new Date().toISOString() },
  { id: "m2", text: "Order a welcome gift for Jamie", done: false, due: iso(4), remind_at: null, created_at: new Date().toISOString() },
  { id: "m3", text: "Review the Q4 schedule", done: true, due: null, remind_at: null, created_at: new Date().toISOString() },
];
const load = (): Item[] => {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return demo();
};
const keep = (l: Item[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {}
};
const sync = async (id: string, extra?: object) => {
  if (!LIVE) return;
  await fetch("/api/mylist", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ id, ...extra }) }).catch(() => undefined);
};

/** "2026-11-14T16:00" in the person's own time zone, for a datetime input. */
const toLocalInput = (isoStr: string | null) => {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const dueLabel = (d: string) => {
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  const n = Math.round((new Date(`${d}T12:00:00`).getTime() - t.getTime()) / 864e5);
  return n < 0 ? { text: n === -1 ? "Yesterday" : `${-n} days late`, tone: "overdue" } : n === 0 ? { text: "Today", tone: "soon" } : n === 1 ? { text: "Tomorrow", tone: "soon" } : { text: new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: n < 7 ? "short" : undefined, month: "short", day: "numeric" }), tone: "later" };
};
const remindLabel = (r: string) => new Date(r).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function useMyList(clientId: string) {
  const { me } = useStore();
  const email = (me?.email ?? "").toLowerCase();
  const [items, setItems] = useState<Item[] | null>(null);
  const [setup, setSetup] = useState(false);
  const refresh = useCallback(async () => {
    if (!LIVE) return setItems(load());
    if (!email) return setItems([]);
    const { data, error } = await sb().from("my_list").select("id, text, done, due, remind_at, scheduled_id, created_at").order("created_at", { ascending: true });
    if (error) {
      setSetup(/relation|does not exist/i.test(error.message));
      return setItems([]);
    }
    setItems((data ?? []) as Item[]);
  }, [email]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const put = async (it: Item, isNew = false) => {
    setItems((l) => (isNew ? [...(l ?? []), it] : (l ?? []).map((x) => (x.id === it.id ? it : x))));
    if (!LIVE) return keep(isNew ? [...load(), it] : load().map((x) => (x.id === it.id ? it : x)));
    const row = { id: it.id, email, client_id: clientId, text: it.text, done: it.done, done_at: it.done ? new Date().toISOString() : null, due: it.due, remind_at: it.remind_at };
    const { error } = isNew ? await sb().from("my_list").insert(row) : await sb().from("my_list").update(row).eq("id", it.id);
    if (!error) sync(it.id);
  };
  const remove = async (it: Item) => {
    setItems((l) => (l ?? []).filter((x) => x.id !== it.id));
    if (!LIVE) return keep(load().filter((x) => x.id !== it.id));
    await sb().from("my_list").delete().eq("id", it.id);
    if (it.scheduled_id) sync(it.id, { gone: true, scheduledId: it.scheduled_id });
  };
  return { items, setup, put, remove };
}

type TileFn = (p: { title: string; count?: React.ReactNode; href?: string; linkLabel?: string; wide?: boolean; children: React.ReactNode }) => React.ReactElement;

export function MyListTile({ clientId, Tile }: { clientId: string; Tile: TileFn }) {
  const { items, setup, put, remove } = useMyList(clientId);
  const [text, setText] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const todo = (items ?? []).filter((i) => !i.done).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const done = (items ?? []).filter((i) => i.done);
  const add = () => {
    const t = text.trim().slice(0, 300);
    if (!t) return;
    put({ id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: t, done: false, due: null, remind_at: null, created_at: new Date().toISOString() }, true);
    setText("");
  };
  return (
    <Tile title="My list" count={todo.length || undefined}>
      {setup ? (
        <p className="small muted">My list needs one database step (019_my_list.sql).</p>
      ) : !items ? (
        <p className="small muted">Loading…</p>
      ) : (
        <div className="ml">
          <form className="ml-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input className="f" placeholder="Add something…" value={text} onChange={(e) => setText(e.target.value)} aria-label="New item" maxLength={300} />
            <button className="btn primary sm" disabled={!text.trim()}>Add</button>
          </form>
          {todo.length === 0 && <p className="small muted" style={{ margin: "8px 0 0" }}>All clear.</p>}
          {todo.map((it) => {
            const d = it.due ? dueLabel(it.due) : null;
            return (
              <div key={it.id} className="ml-item">
                <div className="ml-row">
                  <input type="checkbox" aria-label={`Done: ${it.text}`} checked={false} onChange={() => put({ ...it, done: true })} />
                  <button className="ml-text" onClick={() => setOpen(open === it.id ? null : it.id)} aria-expanded={open === it.id}>
                    <span>{it.text}</span>
                    <span className="ml-meta">
                      {d && <span className={`pill ${d.tone}`}>{d.text}</span>}
                      {it.remind_at && <span className="tiny muted">🔔 {remindLabel(it.remind_at)}</span>}
                    </span>
                  </button>
                </div>
                {open === it.id && <Details it={it} onSave={(x) => { put(x); setOpen(null); }} onDelete={() => remove(it)} />}
              </div>
            );
          })}
          {done.length > 0 && (
            <div className="ml-done">
              <button className="linklike tiny" onClick={() => setShowDone(!showDone)}>{showDone ? "Hide" : "Show"} done ({done.length})</button>
              {showDone && (
                <>
                  {done.map((it) => (
                    <div key={it.id} className="ml-row done">
                      <input type="checkbox" aria-label={`Not done: ${it.text}`} checked onChange={() => put({ ...it, done: false })} />
                      <s className="small">{it.text}</s>
                      <button className="ml-x" aria-label={`Delete ${it.text}`} onClick={() => remove(it)}>✕</button>
                    </div>
                  ))}
                  <button className="linklike tiny" onClick={() => done.forEach(remove)}>Clear done</button>
                </>
              )}
            </div>
          )}
          <p className="tiny muted ml-private">🔒 Only you can see this list.</p>
        </div>
      )}
    </Tile>
  );
}

function Details({ it, onSave, onDelete }: { it: Item; onSave: (x: Item) => void; onDelete: () => void }) {
  const [text, setText] = useState(it.text);
  const [due, setDue] = useState(it.due ?? "");
  const [remind, setRemind] = useState(toLocalInput(it.remind_at));
  const [err, setErr] = useState("");
  return (
    <div className="ml-details">
      <input className="f" value={text} onChange={(e) => setText(e.target.value)} aria-label="Item" maxLength={300} />
      <div className="ml-fields">
        <label className="f">Due<input className="f" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <label className="f">Email me a reminder<input className="f" type="datetime-local" value={remind} onChange={(e) => setRemind(e.target.value)} /></label>
      </div>
      {err && <p className="tiny" style={{ color: "var(--red)", margin: "4px 0 0" }}>{err}</p>}
      <div className="ml-btns">
        <button className="linklike tiny" style={{ color: "var(--red)" }} onClick={onDelete}>Delete</button>
        <span style={{ flex: 1 }} />
        {remind && <button className="btn ghost sm" onClick={() => setRemind("")}>No reminder</button>}
        <button
          className="btn primary sm"
          onClick={() => {
            if (!text.trim()) return setErr("Add some text.");
            const r = remind ? new Date(remind) : null;
            if (r && r.getTime() < Date.now() - 60e3) return setErr("Pick a reminder time in the future.");
            onSave({ ...it, text: text.trim().slice(0, 300), due: due || null, remind_at: r ? r.toISOString() : null });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
