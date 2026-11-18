"use client";

// Email to work: what Ben forwarded (or pasted) and what each became.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlzaNav, AlzaTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { InboxItem, STATUS_LABEL, TYPE_LABEL, WorkType } from "@/lib/inbox";
import { inboxApi, InboxDemo } from "@/lib/inboxclient";
import { useStore } from "@/lib/store";
import { LIVE } from "@/lib/supabase";

const ADDRESS = process.env.NEXT_PUBLIC_INBOX_ADDRESS || "";
const TONE: Record<InboxItem["status"], string> = { created: "green", private: "blue", review: "gold", unsorted: "gold", dismissed: "" };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function Inbox() {
  const ok = useGuard("advisor");
  const { clients, projects, actions, patch, refresh } = useStore();
  const toast = useToast();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"todo" | "done" | "all">("todo");
  const [open, setOpen] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const demo: InboxDemo = useMemo(() => ({
    clients: clients.map((c) => ({ id: c.id, name: c.name })),
    apply: (w) => patch({ projects: w.project ? [...projects, w.project] : projects, actions: [...actions, ...w.actions] }),
  }), [clients, projects, actions, patch]);
  const call = useCallback((b: Record<string, unknown>) => inboxApi(b, demo), [demo]);

  useEffect(() => {
    if (!ok) return;
    call({ action: "list" }).then((r) => (r.ok ? setItems(r.items) : setErr(r.reason === "setup" ? "setup" : "load")));
    const id = new URLSearchParams(window.location.search).get("item");
    if (id) setOpen(id);
  }, [ok]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok) return null;
  const put = (it: InboxItem) => setItems((l) => (l ?? []).map((x) => (x.id === it.id ? it : x)));
  const todo = (items ?? []).filter((x) => x.status === "review" || x.status === "unsorted" || (x.status === "private" && x.steps.some((s) => !s.done)));
  const list = tab === "todo" ? todo : tab === "done" ? (items ?? []).filter((x) => x.status === "created") : (items ?? []);

  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1>Email inbox</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              {ADDRESS ? <>Forward a client&apos;s email to <b>{ADDRESS}</b> and it becomes a task or a project.</> : "Forward client emails here once your inbox address is set up, or paste one below."} Add a line on top if you want (&ldquo;due Friday&rdquo;).
            </p>
          </div>
          <button className="btn ghost sm" onClick={() => setPaste((v) => !v)}>{paste ? "Close" : "Paste an email"}</button>
        </div>
        {paste && <PasteBox clients={clients} call={call} onDone={(it) => { setItems((l) => [it, ...(l ?? [])]); setOpen(it.id); setPaste(false); if (LIVE) refresh?.(); toast.show(it.status === "created" ? "Added to the portal" : STATUS_LABEL[it.status]); }} onErr={(m) => toast.show(m)} />}

        <div className="tabs section" style={{ marginTop: 14 }}>
          <button className={`tab ${tab === "todo" ? "on" : ""}`} onClick={() => setTab("todo")}>Needs you<span className="count">{todo.length}</span></button>
          <button className={`tab ${tab === "done" ? "on" : ""}`} onClick={() => setTab("done")}>Added</button>
          <button className={`tab ${tab === "all" ? "on" : ""}`} onClick={() => setTab("all")}>All</button>
        </div>
        {err === "setup" && <div className="card small muted" style={{ marginTop: 14 }}>Almost ready. Run supabase/023_inbox.sql once in Supabase, then refresh.</div>}
        {err === "load" && <div className="card small muted" style={{ marginTop: 14 }}>Couldn&apos;t load the inbox. Try again in a moment.</div>}
        {items && !list.length && <div className="card small muted" style={{ marginTop: 14 }}>{tab === "todo" ? "Nothing waiting on you." : "Nothing here yet."}</div>}
        <div style={{ marginTop: 14 }}>
          {list.map((it) => (
            <Row key={it.id} it={it} open={open === it.id} onToggle={() => setOpen(open === it.id ? null : it.id)} clients={clients} call={call}
              onChange={(n) => { put(n); if (n.status === "created" && LIVE) refresh?.(); }} onGone={() => setItems((l) => (l ?? []).filter((x) => x.id !== it.id))} toast={toast.show} />
          ))}
        </div>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </>
  );
}

type Call = (b: Record<string, unknown>) => Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

function PasteBox({ clients, call, onDone, onErr }: { clients: { id: string; name: string }[]; call: Call; onDone: (it: InboxItem) => void; onErr: (m: string) => void }) {
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="card section" style={{ marginTop: 14 }}>
      <b>Paste an email</b>
      <p className="tiny muted" style={{ margin: "2px 0 8px" }}>Same as forwarding: the portal reads it, picks the client and starts the work.</p>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <input className="f grow" placeholder="Subject (optional)" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ minWidth: 220 }} />
        <select className="f" value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ width: "auto" }} aria-label="Client">
          <option value="">Figure out the client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <textarea className="f" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the email here, including who it's from if you can." />
      <div className="sheet-actions">
        <button className="btn primary sm" disabled={busy || text.trim().length < 10} onClick={async () => {
          setBusy(true);
          const r = await call({ action: "paste", subject, text, clientId });
          setBusy(false);
          if (r.ok) onDone(r.item); else onErr(r.reason === "limit" ? "That's today's limit." : "Couldn't read that one. Try again.");
        }}>{busy ? "Reading…" : "Turn into work"}</button>
      </div>
    </div>
  );
}

function Row({ it, open, onToggle, clients, call, onChange, onGone, toast }: { it: InboxItem; open: boolean; onToggle: () => void; clients: { id: string; name: string }[]; call: Call; onChange: (it: InboxItem) => void; onGone: () => void; toast: (m: string) => void }) {
  const [busy, setBusy] = useState("");
  const client = clients.find((c) => c.id === it.clientId);
  const run = async (b: Record<string, unknown>, msg?: string) => {
    setBusy(String(b.action));
    const r = await call({ id: it.id, ...b });
    setBusy("");
    if (!r.ok) { toast(r.reason === "client" ? "Pick a client first." : "That didn't work. Try again."); return; }
    if (b.action === "delete") onGone(); else onChange(r.item);
    if (msg) toast(msg);
  };
  const upd = (patch: Partial<InboxItem>) => run({ action: "update", patch });
  const projHref = it.clientId && it.made?.projectId ? `/c/${it.clientId}/projects` : it.clientId && it.made?.actionIds[0] ? `/c/${it.clientId}/a/${it.made.actionIds[0]}` : "";
  return (
    <div className={`card ib-row ${open ? "open" : ""}`}>
      <button className="ib-head" onClick={onToggle} aria-expanded={open}>
        <span className={`pf-chip ${TONE[it.status]}`}>{STATUS_LABEL[it.status]}</span>
        <span className="grow" style={{ minWidth: 0 }}>
          <b className="ib-title">{it.title}</b>
          <span className="tiny muted ib-sub">{client?.name ?? "No client yet"} · {TYPE_LABEL[it.type]}{it.sensitive ? " · private" : ""} · {when(it.receivedAt)}{it.via === "paste" ? " · pasted" : ""}</span>
        </span>
        <span aria-hidden="true" className="muted">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="ib-body">
          {it.why && <div className="pl-issue" style={{ marginLeft: 0 }}>{it.why}</div>}
          {it.summary && <p className="small" style={{ margin: "10px 0" }}>{it.summary}</p>}
          <div className="ib-grid">
            <label><span className="flabel">Client</span>
              <select className="f" value={it.clientId ?? ""} disabled={it.status === "created"} onChange={(e) => upd({ clientId: e.target.value })}>
                <option value="">Pick a client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label><span className="flabel">Type</span>
              <select className="f" value={it.type} disabled={it.status === "created"} onChange={(e) => upd({ type: e.target.value as WorkType })}>
                {(Object.keys(TYPE_LABEL) as WorkType[]).map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="wide"><span className="flabel">Title</span><input className="f" defaultValue={it.title} disabled={it.status === "created"} onBlur={(e) => e.target.value !== it.title && upd({ title: e.target.value })} /></label>
            <label><span className="flabel">Due</span><input type="date" className="f" defaultValue={it.due ?? ""} disabled={it.status === "created"} onBlur={(e) => (e.target.value || "") !== (it.due ?? "") && upd({ due: e.target.value })} /></label>
          </div>
          {it.steps.length > 0 && (
            <div className="ib-steps">
              <span className="flabel">{it.status === "private" ? "Checklist (only you see this)" : "Steps"}</span>
              {it.steps.map((s, i) => (
                <label key={s.id} className="ib-step">
                  <input type="checkbox" checked={s.done} disabled={it.status === "created"} onChange={() => upd({ steps: it.steps.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} />
                  <span className={s.done ? "done" : ""}>{s.text}</span>
                  <span className="tiny muted">{s.who === "client" ? "Client" : "You"}</span>
                </label>
              ))}
            </div>
          )}
          {it.attachments.length > 0 && (
            <div className="tiny" style={{ marginTop: 8 }}>
              Attachments: {it.attachments.map((a, i) => (
                <span key={i}>{i > 0 && ", "}{a.path ? <button className="linklike tiny" onClick={async () => { const r = await call({ action: "file", id: it.id, path: a.path }); if (r.ok) window.open(r.url, "_blank"); }}>{a.name}</button> : `${a.name} (too large to keep)`}</span>
              ))}
            </div>
          )}
          <details className="ib-orig"><summary className="tiny">Original email</summary><div className="tiny muted">{it.origFrom ? `From ${it.origFrom} · ` : ""}{it.subject}</div><pre>{it.text}</pre></details>
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            {it.status === "created" ? (
              <>{projHref && <Link className="btn ghost sm" href={projHref}>{it.made?.projectId ? "Open project" : "Open task"}</Link>}<span className="tiny muted">On your list{it.made?.actionIds.length ? ` (${it.made.actionIds.length} task${it.made.actionIds.length === 1 ? "" : "s"})` : ""}.</span></>
            ) : (
              <>
                {it.status !== "private" && <button className="btn primary sm" disabled={!!busy || !it.clientId} onClick={() => run({ action: "add" }, "Added to the portal")}>{busy === "add" ? "Adding…" : it.type === "other" ? "Add to my list" : "Start the project"}</button>}
                {it.status === "private" && <button className="btn ghost sm" disabled={!!busy || !it.clientId} onClick={() => run({ action: "add" }, "Added to the client portal")} title="The client's executives and managers can see projects">Put it in the client portal</button>}
                {it.status !== "dismissed" && <button className="btn ghost sm" disabled={!!busy} onClick={() => run({ action: "dismiss" }, "Dismissed")}>Dismiss</button>}
              </>
            )}
            <button className="linklike tiny" style={{ marginLeft: "auto", color: "var(--red)" }} disabled={!!busy} onClick={() => run({ action: "delete" }, "Deleted")}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
