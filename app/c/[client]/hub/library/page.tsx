"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { HubHeader } from "@/components/hub";
import { useStore } from "@/lib/store";
import { fmt } from "@/lib/data";
import { openResource, RES_ICON } from "@/lib/library";
import { loadNewsletters, monthLabel, Newsletter } from "@/lib/newsletters";

const MANAGER_FOLDERS = ["Trainings", "Manager toolkit", "Policies"];

/** Trainings, toolkit and past Manager Minutes, built for a quick look on a phone. */
export default function HubLibrary() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, resources, clients } = useStore();
  const client = getClient(clientId);
  const toast = useToast();
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string>("all");
  const [minutes, setMinutes] = useState<Newsletter[]>([]);

  const demoClients = useMemo(() => clients.map((c) => ({ id: c.id, name: c.name, accent: c.accent })), [clients]);
  useEffect(() => {
    if (!ok) return;
    loadNewsletters({ clientId, light: true, demoClients }).then((r) => setMinutes(r.list.filter((n) => n.inLibrary && n.kind === "manager-minute").sort((a, b) => b.month.localeCompare(a.month))));
  }, [ok, clientId, demoClients]);

  if (!ok || !client) return null;
  const items = resources
    .flatMap((r) => r.shares.filter((s) => s.clientId === clientId && MANAGER_FOLDERS.includes(s.folder)).map((s) => ({ r, s })))
    .sort((a, b) => (a.s.folder === "Trainings" ? -1 : 0) - (b.s.folder === "Trainings" ? -1 : 0) || b.s.at.localeCompare(a.s.at));
  const folders = Array.from(new Set(items.map((x) => x.s.folder)));
  const shown = items.filter(({ r, s }) => (folder === "all" || s.folder === folder) && (!q || `${r.title} ${r.desc} ${r.category}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <HubHeader clientId={clientId} title="Library" sub="Trainings, tools and past Manager Minutes." />
        {items.length + minutes.length > 6 && <input className="f section" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trainings and tools" />}
        {folders.length > 1 && (
          <div className="chips section">
            <button className={`chip chip-btn ${folder === "all" ? "on" : ""}`} onClick={() => setFolder("all")}>All</button>
            {folders.map((f) => <button key={f} className={`chip chip-btn ${folder === f ? "on" : ""}`} onClick={() => setFolder(f)}>{f}</button>)}
          </div>
        )}

        {shown.length === 0 && minutes.length === 0 ? (
          <div className="card section small muted">Nothing here yet. Ben adds trainings and tools as you go.</div>
        ) : (
          <div className="card section hub-lib">
            {shown.map(({ r, s }) => (
              <button
                key={r.id + s.folder}
                className="hub-lib-row"
                onClick={async () => {
                  const e = await openResource(r);
                  if (e) toast.show(e);
                }}
              >
                <span className="hub-lib-icon" aria-hidden="true">{RES_ICON[r.type] ?? "📄"}</span>
                <span className="grow" style={{ minWidth: 0, textAlign: "left" }}>
                  <b className="small" style={{ display: "block" }}>{r.title}</b>
                  {r.desc && <span className="tiny muted" style={{ display: "block" }}>{r.desc}</span>}
                  <span className="tiny muted">{s.folder} · {r.type}{r.url && /youtu|vimeo|loom/i.test(r.url) ? " · video" : ""} · {fmt(s.at.slice(0, 10))}</span>
                </span>
                <span className="tiny" style={{ color: "var(--blue)", flex: "none" }}>Open</span>
              </button>
            ))}
          </div>
        )}

        {minutes.length > 0 && (folder === "all" || folder === "Manager Minute") && (
          <>
            <div className="section-head section"><h2>Manager Minute</h2><Link href={`/c/${clientId}/newsletters`}>All issues</Link></div>
            <div className="card">
              {minutes.slice(0, 6).map((n) => (
                <Link key={n.id} className="row" href={`/c/${clientId}/newsletters`}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="title ellipsis">{n.subject.replace(/^Manager Minute:\s*/i, "").replace(/\s*\|.*$/, "")}</div>
                    <div className="tiny muted">{monthLabel(n.month)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
