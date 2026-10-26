"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { NewsletterFrame } from "@/components/newsletter";
import { copyRich, getNewsletter, KIND_AUDIENCE, KIND_LABEL, loadNewsletters, monthLabel, Newsletter, NlKind } from "@/lib/newsletters";
import { useStore } from "@/lib/store";

/** The client's archive of Manager Minute and The Pause issues Ben has saved to their Library. */
export default function ClientNewsletters() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, viewer, me, clients } = useStore();
  const client = getClient(clientId);
  const toast = useToast();
  const [list, setList] = useState<Newsletter[] | null>(null);
  const [kind, setKind] = useState<NlKind | "all">("all");
  const [open, setOpen] = useState<Newsletter | null>(null);
  const canCopy = viewer?.kind === "advisor" || me?.access === "exec";

  const demoClients = useMemo(() => clients.map((c) => ({ id: c.id, name: c.name, accent: c.accent })), [clients]);
  useEffect(() => {
    if (!ok) return;
    loadNewsletters({ clientId, light: true, demoClients }).then((r) => setList(r.list.filter((n) => n.inLibrary)));
  }, [ok, clientId, demoClients]);

  if (!ok || !client) return null;
  const kinds = Array.from(new Set((list ?? []).map((n) => n.kind)));
  const shown = (list ?? []).filter((n) => kind === "all" || n.kind === kind).sort((a, b) => b.month.localeCompare(a.month) || a.kind.localeCompare(b.kind));

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <h1>Newsletters</h1>
        <p className="small muted" style={{ marginTop: -4 }}>Every Manager Minute and The Pause your team has received, in one place.</p>

        {kinds.length > 1 && (
          <div className="chips section">
            <button className={`chip chip-btn ${kind === "all" ? "on" : ""}`} onClick={() => setKind("all")}>All</button>
            {kinds.map((k) => <button key={k} className={`chip chip-btn ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{KIND_LABEL[k] ?? k}</button>)}
          </div>
        )}

        {!list ? (
          <div className="card section small muted">Loading...</div>
        ) : shown.length === 0 ? (
          <div className="card section small muted">Nothing here yet. Issues show up here once they go out.</div>
        ) : (
          <div className="card section nl-list">
            {shown.map((n) => (
              <button
                key={n.id}
                className="nl-row"
                onClick={async () => {
                  const r = await getNewsletter(n.id);
                  if (r.item) setOpen(r.item);
                  else toast.show("Couldn't open it. Try again.");
                }}
              >
                <span className="grow" style={{ minWidth: 0, textAlign: "left" }}>
                  <b className="small">{KIND_LABEL[n.kind] ?? n.kind}</b>
                  <span className="tiny muted"> · {monthLabel(n.month)}{KIND_AUDIENCE[n.kind] ? ` · ${KIND_AUDIENCE[n.kind]}` : ""}</span>
                  <span className="tiny muted nl-subject">{n.subject}</span>
                </span>
                <span className="tiny" style={{ color: "var(--blue)" }}>Read</span>
              </button>
            ))}
          </div>
        )}
      </main>

      {open && (
        <Sheet title={`${KIND_LABEL[open.kind] ?? "Newsletter"}, ${monthLabel(open.month)}`} onClose={() => setOpen(null)}>
          <div className="small" style={{ marginBottom: 8 }}><b>{open.subject}</b></div>
          <div className="nl-frame"><NewsletterFrame html={open.html} /></div>
          <div className="action-foot" style={{ justifyContent: "flex-end" }}>
            {canCopy && <button className="btn ghost sm" onClick={async () => toast.show((await copyRich(open.html)) ? "Copied. Paste it into an email to forward it." : "Couldn't copy")}>Copy email</button>}
            <button className="btn primary sm" onClick={() => setOpen(null)}>Close</button>
          </div>
        </Sheet>
      )}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
