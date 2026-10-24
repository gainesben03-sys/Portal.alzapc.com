"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { fmt } from "@/lib/data";
import { FOLDERS } from "@/lib/modules";
import { useStore } from "@/lib/store";

export default function Resources() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, resources, config } = useStore();
  const client = getClient(clientId);
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const toast = useToast();

  if (!ok || !client) return null;
  if (!config[clientId]?.modules.resources)
    return (
      <div>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">Resources aren't turned on for this workspace.</div></main>
      </div>
    );

  const shared = resources
    .flatMap((r) => r.shares.filter((s) => s.clientId === client.id).map((s) => ({ r, s })))
    .sort((a, b) => b.s.at.localeCompare(a.s.at));
  const filtered = shared.filter(
    ({ r, s }) =>
      (!folder || s.folder === folder) &&
      (!q || (r.title + " " + r.desc + " " + r.category).toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <h1>Resources</h1>
        <p className="muted" style={{ marginTop: 6 }}>Everything Alza has shared with {client.name}, in one place.</p>

        <div className="tile-grid section" style={{ marginTop: 16 }}>
          {FOLDERS.map((f) => {
            const n = shared.filter((x) => x.s.folder === f).length;
            return (
              <button key={f} className={`tile ${folder === f ? "on" : ""}`} onClick={() => setFolder(folder === f ? null : f)}>
                <b>{f}</b>
                <span>{n} item{n === 1 ? "" : "s"}</span>
              </button>
            );
          })}
        </div>

        <input className="f" style={{ marginTop: 14 }} placeholder="Search resources" value={q} onChange={(e) => setQ(e.target.value)} />

        <div className="section-head section">
          <h2>{folder ?? "Recently shared"}</h2>
          {folder && <button className="btn ghost sm" onClick={() => setFolder(null)}>Show all</button>}
        </div>
        <div className="card">
          {filtered.length === 0 && <p className="small muted">Nothing here yet.</p>}
          {filtered.map(({ r, s }) => (
            <div className="row" key={r.id + s.folder}>
              <div className="file" style={{ border: 0, padding: 0 }}>
                <div className="ic">{r.type.slice(0, 4).toUpperCase()}</div>
              </div>
              <div className="grow">
                <div className="title">{r.title}</div>
                <div className="tiny muted">
                  {s.folder} · shared {fmt(s.at)}
                  {r.outdated && <span style={{ color: "var(--amber)" }}> · update coming</span>}
                </div>
              </div>
              <button className="btn sm" onClick={() => toast.show("Opens the file in the full build")}>Open</button>
            </div>
          ))}
        </div>
        <p className="demo-note">Sample resources for the prototype.</p>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
