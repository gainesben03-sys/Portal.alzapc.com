"use client";

// The Outbox: every email waiting for an OK, previewed exactly as it will look, then sent or skipped.
// Used in HR's console (all companies) and on each company's portal (executives, their company only).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui";
import { ageText, MODE_LABEL, OutboxMode, OutRow } from "@/lib/outbox";
import Link from "next/link";
import { OutList, outboxApi, setHeldCount, useHeldCount } from "@/lib/outboxclient";

type Viewer = { advisor: boolean; clientId?: string; name: string };
const MODES: OutboxMode[] = ["off", "auto", "all"];
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fit = (html: string) => `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}table[width="600"]{width:100%!important}td{word-break:break-word}a{pointer-events:none}</style>${html}`;
const toLine = (m: OutRow) => [...m.to, ...(m.cc ?? []).map((c) => `cc ${c}`)].join(", ");

export function OutboxView({ viewer, names, toast, readOnly }: { viewer: Viewer; names: { id: string; name: string }[]; toast: (m: string) => void; readOnly?: boolean }) {
  const [data, setData] = useState<OutList | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"waiting" | "done">("waiting");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await outboxApi.list(viewer, names);
    if (r.ok) {
      setData(r);
      setHeldCount(viewer, r.held.length);
    } else setErr(r.reason === "setup" ? "setup" : "load");
  }, [viewer, names]);
  useEffect(() => { load(); }, [viewer.advisor, viewer.clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = useMemo(() => new Map(names.map((c) => [c.id, c.name])), [names]);
  const groups = useMemo(() => {
    const g = new Map<string, OutRow[]>();
    for (const m of data?.held ?? []) {
      const k = m.clientId ?? "";
      g.set(k, [...(g.get(k) ?? []), m]);
    }
    return [...g];
  }, [data]);

  const decide = async (ids: string[], send: boolean) => {
    if (!ids.length) return;
    setBusy(true);
    const r = await outboxApi.decide(viewer, ids, send);
    setBusy(false);
    if (!r.ok) return toast("Couldn't do that. Try again.");
    const n = send ? r.sent ?? 0 : r.skipped ?? 0;
    toast(send ? (r.failed ? `${n} sent, ${r.failed} didn't go through` : `${n} email${n === 1 ? "" : "s"} sent`) : `${n} skipped`);
    setPicked(new Set());
    setOpen(null);
    load();
  };
  const setMode = async (clientId: string, mode: OutboxMode) => {
    const r = await outboxApi.mode(viewer, clientId, mode);
    if (!r.ok) return toast("Couldn't save that.");
    setData((d) => (d ? { ...d, companies: d.companies.map((c) => (c.id === clientId ? { ...c, mode } : c)) } : d));
    toast(MODE_LABEL[mode].title);
  };
  const setDigest = async (on: boolean) => {
    const r = await outboxApi.digest(on);
    if (!r.ok) return toast("Couldn't save that.");
    setData((d) => (d ? { ...d, benDigest: on } : d));
    toast(on ? "One daily summary" : "Each as it happens");
  };

  if (err === "setup") return <div className="card small muted section">Almost ready. Run supabase/025_outbox.sql once in Supabase, then refresh.</div>;
  if (err) return <div className="card small muted section">Couldn&apos;t load the Outbox. Try again in a moment.</div>;
  if (!data) return <p className="small muted section">Loading…</p>;

  const held = data.held;
  const allPicked = held.length > 0 && held.every((m) => picked.has(m.id));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const one = !viewer.advisor || !!viewer.clientId ? data.companies[0] : null;
  const anyOn = data.companies.some((c) => c.mode !== "off");

  return (
    <>
      <div className="ob-head">
        <div>
          <h1>Outbox</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {one ? (one.mode === "off" ? "Emails are going out automatically. Turn on holding to approve them first." : `${MODE_LABEL[one.mode].title}. Nothing here goes out until you send it.`) : anyOn ? "Emails waiting for your OK. Nothing here goes out until you send it." : "No company is holding emails right now."}
          </p>
        </div>
        {readOnly ? <span className="small muted">Preview: nothing can be sent or changed.</span> : <button className={`btn sm ${settings ? "primary" : ""}`} onClick={() => setSettings((v) => !v)}>{settings ? "Done" : "Settings"}</button>}
      </div>

      {settings && (
        <div className="card section ob-settings">
          {viewer.advisor && (
            <div className="ob-set-row">
              <div>
                <b>My notifications</b>
                <p className="small muted">Alza Hub updates to you: one at a time, or one summary each morning. Write-ups and leave always come right away.</p>
              </div>
              <div className="dc-seg">
                <button className={!data.benDigest ? "on" : ""} onClick={() => setDigest(false)}>As they happen</button>
                <button className={data.benDigest ? "on" : ""} onClick={() => setDigest(true)}>Daily summary</button>
              </div>
            </div>
          )}
          {one ? (
            <div className="ob-modes">
              {MODES.map((m) => (
                <button key={m} className={`ob-mode ${one.mode === m ? "on" : ""}`} onClick={() => setMode(one.id, m)}>
                  <span className="ob-radio" />
                  <span><b>{MODE_LABEL[m].title}</b><span className="small muted">{MODE_LABEL[m].blurb}</span></span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <p className="small muted" style={{ margin: "14px 0 6px" }}>
                <b>Hold automatic emails:</b> {MODE_LABEL.auto.blurb.split(". ")[0]}. <b>Hold everything:</b> {MODE_LABEL.all.blurb}
              </p>
              <div className="ob-companies">
                {data.companies.map((c) => (
                  <label key={c.id} className="ob-co">
                    <span>{c.name}</span>
                    <select value={c.mode} onChange={(e) => setMode(c.id, e.target.value as OutboxMode)}>
                      {MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m].title}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </>
          )}
          {!!data.digest.length && <p className="small muted" style={{ marginTop: 12 }}>{data.digest.length} update{data.digest.length === 1 ? "" : "s"} saved for tomorrow morning&apos;s summary.</p>}
        </div>
      )}

      <div className="tabs section" style={{ marginTop: 16 }}>
        <button className={`tab ${tab === "waiting" ? "on" : ""}`} onClick={() => setTab("waiting")}>Waiting<span className="count">{held.length}</span></button>
        <button className={`tab ${tab === "done" ? "on" : ""}`} onClick={() => setTab("done")}>Sent &amp; skipped</button>
      </div>

      {tab === "waiting" && (
        <>
          {held.length > 0 && !readOnly && (
            <div className="ob-bar">
              <label className="ob-all"><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(held.map((m) => m.id)))} /> {picked.size ? `${picked.size} selected` : "Select all"}</label>
              <span style={{ flex: 1 }} />
              <button className="btn sm" disabled={!picked.size || busy} onClick={() => decide([...picked], false)}>Skip</button>
              <button className="btn sm primary" disabled={!picked.size || busy} onClick={() => decide([...picked], true)}>Send{picked.size ? ` ${picked.size}` : ""}</button>
            </div>
          )}
          {!held.length && (
            <div className="card small muted ob-empty">
              <b>All clear.</b> Nothing is waiting{anyOn ? "" : ", and emails are going out automatically"}.
            </div>
          )}
          {groups.map(([cid, list]) => (
            <div key={cid || "none"} className="ob-group">
              {viewer.advisor && !viewer.clientId && <p className="ob-co-name">{nameOf.get(cid) ?? "Other"} <span className="muted">· {list.length}</span></p>}
              <div className="card ob-list">
                {list.map((m) => (
                  <div key={m.id} className={`ob-row ${picked.has(m.id) ? "picked" : ""}`}>
                    {!readOnly && <input type="checkbox" aria-label={`Select ${m.subject}`} checked={picked.has(m.id)} onChange={() => toggle(m.id)} />}
                    <button className="ob-main" onClick={() => setOpen(m.id)}>
                      <span className="ob-subj">{m.subject}</span>
                      <span className="ob-to small muted">To {toLine(m)}</span>
                      <span className="ob-meta">
                        <span className="chip">{m.auto ? "Automatic" : "Sent by a person"}</span>
                        <span className="chip">{m.audience === "leader" ? "Leader" : m.audience === "ben" ? "You" : "Employee"}</span>
                        {m.sensitive && <span className="chip">Private</span>}
                        {m.scheduledAt && <span className="chip">For {when(m.scheduledAt)}</span>}
                        <span className="small muted">{ageText(m.createdAt)}</span>
                      </span>
                    </button>
                    {!readOnly && <span className="ob-acts">
                      <button className="btn ghost sm" disabled={busy} onClick={() => decide([m.id], false)}>Skip</button>
                      <button className="btn sm" disabled={busy} onClick={() => decide([m.id], true)}>Send</button>
                    </span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {data.hiddenCount > 0 && <p className="small muted" style={{ marginTop: 12 }}>{data.hiddenCount} private email{data.hiddenCount === 1 ? "" : "s"} about leave or a write-up {data.hiddenCount === 1 ? "is" : "are"} waiting for HR.</p>}
        </>
      )}

      {tab === "done" && (
        <div className="card ob-list" style={{ marginTop: 14 }}>
          {!data.history.length && <p className="small muted">Nothing in the last two weeks.</p>}
          {data.history.map((m) => (
            <div key={m.id} className="ob-row done">
              <button className="ob-main" onClick={() => setOpen(m.id)}>
                <span className="ob-subj">{m.subject}</span>
                <span className="ob-to small muted">To {toLine(m)}{viewer.advisor && !viewer.clientId && m.clientId ? ` · ${nameOf.get(m.clientId) ?? ""}` : ""}</span>
              </button>
              <span className="small muted ob-done">
                <span className={`pill ${m.status === "sent" ? "green" : m.status === "failed" ? "overdue" : "later"}`}>{m.status === "sent" ? "Sent" : m.status === "failed" ? "Didn't send" : "Skipped"}</span>
                {m.doneBy && <span>{m.doneBy}{m.doneAt ? `, ${when(m.doneAt)}` : ""}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {open && <Preview id={open} viewer={viewer} busy={busy} readOnly={readOnly} onClose={() => setOpen(null)} onDecide={(send) => decide([open], send)} />}
    </>
  );
}

function Preview({ id, viewer, busy, readOnly, onClose, onDecide }: { id: string; viewer: Viewer; busy: boolean; readOnly?: boolean; onClose: () => void; onDecide: (send: boolean) => void }) {
  const [m, setM] = useState<(OutRow & { text: string }) | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    outboxApi.view(viewer, id).then((r) => (r.ok ? setM(r.mail) : setGone(true)));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet title={m?.subject ?? "Email"} onClose={onClose}>
      {gone && <p className="small muted">This email isn&apos;t available.</p>}
      {!m && !gone && <p className="small muted">Loading…</p>}
      {m && (
        <>
          <dl className="ob-hdr small">
            <dt>From</dt><dd>{m.fromName || "HR"}{m.fromBox ? ` (${m.fromBox}@)` : ""}</dd>
            <dt>To</dt><dd>{m.to.join(", ")}</dd>
            {!!m.cc?.length && (<><dt>Cc</dt><dd>{m.cc.join(", ")}</dd></>)}
            {m.scheduledAt && (<><dt>Send on</dt><dd>{when(m.scheduledAt)}</dd></>)}
            {!!m.attachments?.length && (<><dt>Attached</dt><dd>{m.attachments.join(", ")}</dd></>)}
          </dl>
          {m.html ? <iframe className="email-frame" title="Email preview" srcDoc={fit(m.html)} sandbox="" /> : <pre className="ob-text">{m.text}</pre>}
          {m.status === "held" && !readOnly ? (
            <div className="sheet-actions">
              <button className="btn ghost" onClick={onClose}>Close</button>
              <button className="btn" disabled={busy} onClick={() => onDecide(false)}>Skip</button>
              <button className="btn primary" disabled={busy} onClick={() => onDecide(true)}>Send now</button>
            </div>
          ) : (
            <div className="sheet-actions"><button className="btn" onClick={onClose}>Close</button></div>
          )}
        </>
      )}
    </Sheet>
  );
}

/** On a company's dashboard: a slim note when emails are waiting for an executive's OK. */
export function OutboxBanner({ clientId, advisor, exec }: { clientId: string; advisor: boolean; exec: boolean }) {
  const v = useMemo(() => (advisor || exec ? { advisor, clientId, name: "" } : null), [advisor, exec, clientId]);
  const n = useHeldCount(v, [{ id: clientId, name: "" }]);
  if (!n) return null;
  return (
    <div className="card ob-banner section">
      <span><b>{n} email{n === 1 ? " is" : "s are"} waiting for your OK.</b> <span className="muted">They go out once you send them.</span></span>
      <Link className="btn sm primary" href={`/c/${clientId}/outbox`}>Review</Link>
    </div>
  );
}
