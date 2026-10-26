"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlzaNav, AlzaTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { useStore } from "@/lib/store";
import { addMonths, getNewsletter, KIND_AUDIENCE, KIND_LABEL, loadNewsletters, monthLabel, newNlId, Newsletter, NlKind, saveNewsletter, STATUS_LABEL, thisMonth } from "@/lib/newsletters";

export default function ConsoleNewsletters() {
  const ok = useGuard("advisor");
  const { clients, getClient } = useStore();
  const toast = useToast();
  const router = useRouter();
  const [list, setList] = useState<Newsletter[] | null>(null);
  const [err, setErr] = useState("");
  const [month, setMonth] = useState("");
  const [adding, setAdding] = useState(false);

  const demoClients = useMemo(() => clients.map((c) => ({ id: c.id, name: c.name, accent: c.accent })), [clients]);
  useEffect(() => {
    if (!ok) return;
    loadNewsletters({ light: true, demoClients }).then((r) => {
      setList(r.list);
      setErr(r.error ?? "");
    });
  }, [ok, demoClients]);

  const months = useMemo(() => {
    const set = new Set((list ?? []).map((n) => n.month));
    set.add(thisMonth());
    set.add(addMonths(thisMonth(), 1));
    return Array.from(set).sort().reverse();
  }, [list]);
  useEffect(() => {
    if (month || !list) return;
    const now = thisMonth();
    setMonth(list.some((n) => n.month === now) ? now : (list.map((n) => n.month).sort().pop() ?? now));
  }, [list, month]);

  if (!ok) return null;
  const inMonth = (list ?? []).filter((n) => n.month === month);
  const byClient = clients.map((c) => ({ c, items: inMonth.filter((n) => n.clientId === c.id).sort((a, b) => a.kind.localeCompare(b.kind)) })).filter((g) => g.items.length);

  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap wide">
        <div className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h1 className="grow" style={{ margin: 0 }}>Newsletters</h1>
          <button className="btn primary sm" onClick={() => setAdding(true)} disabled={!list}>New issue</button>
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>Manager Minute and The Pause for each client. Edit, copy into the client&apos;s mailbox to send, then save it to their Library.</p>

        {err === "setup" ? (
          <div className="card section small">Newsletters aren&apos;t set up yet. Run <b>supabase/008_newsletters.sql</b> in the Supabase SQL Editor. It also brings over your September and October issues.</div>
        ) : err ? (
          <div className="card section small" style={{ color: "var(--red)" }}>Couldn&apos;t load newsletters: {err}</div>
        ) : null}

        <div className="nl-monthbar section">
          <button className="btn ghost sm" aria-label="Previous month" disabled={months.indexOf(month) >= months.length - 1} onClick={() => setMonth(months[months.indexOf(month) + 1])}>&larr;</button>
          <select className="f" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button className="btn ghost sm" aria-label="Next month" disabled={months.indexOf(month) <= 0} onClick={() => setMonth(months[months.indexOf(month) - 1])}>&rarr;</button>
          {list && (
            <span className="tiny muted">
              {inMonth.filter((n) => n.status === "sent").length} of {inMonth.length} sent · {inMonth.filter((n) => n.inLibrary).length} in Library
            </span>
          )}
        </div>

        {!list ? (
          <div className="card small muted">Loading...</div>
        ) : byClient.length === 0 ? (
          <div className="card small muted">Nothing queued for {monthLabel(month)}. Tap <b>New issue</b> to start one, usually from last month&apos;s.</div>
        ) : (
          byClient.map(({ c, items }) => (
            <div key={c.id} className="section">
              <div className="section-head"><h2>{c.name}</h2></div>
              <div className="card nl-list">
                {items.map((n) => (
                  <Link key={n.id} href={`/console/newsletters/${n.id}`} className="nl-row">
                    <span className="nl-dot" style={{ background: n.status === "sent" ? "var(--green)" : n.status === "ready" ? "var(--amber)" : "var(--line)" }} aria-hidden="true" />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <b className="small">{KIND_LABEL[n.kind] ?? n.kind}</b>
                      <span className="tiny muted"> · {KIND_AUDIENCE[n.kind] || "Email"}{n.lang.includes("es") ? " · English / Español" : ""}</span>
                      <span className="tiny muted nl-subject">{n.subject}</span>
                    </span>
                    <span className="nl-chips">
                      <span className={`chip ${n.status === "sent" ? "ok" : ""}`}>{STATUS_LABEL[n.status] ?? n.status}</span>
                      {n.inLibrary && <span className="chip">In Library</span>}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </main>

      {adding && list && (
        <NewIssue
          month={month}
          list={list}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          onClose={() => setAdding(false)}
          onCreate={async (n) => {
            const e = await saveNewsletter(n);
            if (e) return toast.show(e === "setup" ? "Run supabase/008_newsletters.sql first." : `Couldn't save: ${e}`);
            router.push(`/console/newsletters/${n.id}`);
          }}
          clientName={(id) => getClient(id)?.name ?? ""}
        />
      )}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </>
  );
}

/** Start an issue: usually a copy of the client's last one of that kind, or pasted / uploaded HTML. */
function NewIssue({ month, list, clients, onClose, onCreate, clientName }: { month: string; list: Newsletter[]; clients: { id: string; name: string }[]; onClose: () => void; onCreate: (n: Newsletter) => void; clientName: (id: string) => string }) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [kind, setKind] = useState<NlKind>("manager-minute");
  const [m, setM] = useState(month);
  const prev = useMemo(() => list.filter((n) => n.clientId === clientId && n.kind === kind && n.month < m).sort((a, b) => b.month.localeCompare(a.month))[0], [list, clientId, kind, m]);
  const [from, setFrom] = useState<"prev" | "paste">("prev");
  const [html, setHtml] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const usePrev = from === "prev" && !!prev;
  const exists = list.some((n) => n.clientId === clientId && n.kind === kind && n.month === m);

  return (
    <Sheet title="New issue" onClose={onClose}>
      <div className="hire-form">
        <fieldset>
          <label className="f">Client
            <select className="f" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="f">Newsletter
            <select className="f" value={kind} onChange={(e) => setKind(e.target.value as NlKind)}>
              {(Object.keys(KIND_LABEL) as NlKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="f">Month
            <input className="f" type="month" value={m} onChange={(e) => setM(e.target.value)} />
          </label>
          <label className="f">Start from
            <select className="f" value={usePrev ? "prev" : "paste"} onChange={(e) => setFrom(e.target.value as "prev" | "paste")}>
              {prev && <option value="prev">Copy of {monthLabel(prev.month)}</option>}
              <option value="paste">Paste or upload HTML</option>
            </select>
          </label>
          {!usePrev && (
            <>
              <label className="f full">Subject<input className="f" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`${KIND_LABEL[kind]}: ...`} /></label>
              <div className="f full">
                <span className="flabel">
                  Email HTML: paste it, or{" "}
                  <label style={{ display: "inline", color: "var(--blue)", cursor: "pointer" }}>
                    upload an .html file
                    <input type="file" hidden accept=".html,.htm,text/html" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setHtml(await f.text()); }} />
                  </label>
                </span>
                <textarea className="f" aria-label="Email HTML" style={{ minHeight: 120, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }} value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<!DOCTYPE html>..." />
              </div>
            </>
          )}
        </fieldset>
      </div>
      {exists && <p className="tiny" style={{ color: "var(--amber)" }}>{clientName(clientId)} already has a {KIND_LABEL[kind]} for {monthLabel(m)}. This adds another.</p>}
      {usePrev && <p className="tiny muted">Starts as a copy of {monthLabel(prev!.month)}&apos;s issue: &ldquo;{prev!.subject}&rdquo;. Change the wording before it goes out.</p>}
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button
          className="btn primary sm"
          disabled={busy || !clientId || (!usePrev && !html.trim())}
          onClick={async () => {
            setBusy(true);
            setErr("");
            let base: Partial<Newsletter> = {};
            if (usePrev) {
              const r = await getNewsletter(prev!.id);
              if (!r.item) {
                setBusy(false);
                return setErr("Couldn't open last month's issue. Try again.");
              }
              base = { html: r.item.html, subject: r.item.subject, preview: r.item.preview, sendFrom: r.item.sendFrom, lang: r.item.lang };
            } else {
              if (!/<html|<table|<body/i.test(html)) {
                setBusy(false);
                return setErr("That doesn't look like email HTML. Paste the full email code.");
              }
              base = { html: html.trim(), subject: subject.trim() || `${KIND_LABEL[kind]}`, lang: /espa[nñ]ol|lang="es"/i.test(html) ? "en+es" : "en" };
            }
            const now = new Date().toISOString();
            onCreate({ id: newNlId(), clientId, kind, month: m, lang: base.lang ?? "en", subject: base.subject ?? "", preview: base.preview, sendFrom: base.sendFrom, html: base.html!, originalHtml: base.html, status: "draft", inLibrary: false, createdAt: now, updatedAt: now });
          }}
        >
          {busy ? "Creating..." : "Create"}
        </button>
      </div>
    </Sheet>
  );
}
