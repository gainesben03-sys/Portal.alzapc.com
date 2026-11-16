"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { AskBox } from "@/components/askbox";
import { fmt } from "@/lib/data";
import { FOLDERS } from "@/lib/modules";
import { useStore } from "@/lib/store";
import { canView, openResource } from "@/lib/library";
import { hasPractice } from "@/lib/practice";

export default function Resources() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, resources, config } = useStore();
  const client = getClient(clientId);
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const toast = useToast();
  const router = useRouter();

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
        <div style={{ marginTop: 14 }}><AskBox clientId={client.id} slim /></div>

        <div className="tile-grid section" style={{ marginTop: 16 }}>
          {FOLDERS.map((f) => {
            const n = shared.filter((x) => x.s.folder === f).length;
            if (!n && folder !== f) return null; // empty folders just add noise
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
                <div className="ic" aria-hidden="true">{typeIcon(r.type)}</div>
              </div>
              <div className="grow">
                <div className="title">{r.title}</div>
                <div className="tiny muted">
                  {s.folder} · shared {fmt(s.at)}
                  {r.outdated && <span style={{ color: "var(--amber)" }}> · update coming</span>}
                </div>
              </div>
              <span style={{ display: "inline-flex", gap: 6, flex: "none" }}>
                {hasPractice(r) && config[clientId]?.modules.training && <Link className="btn sm primary" href={`/c/${clientId}/hub/learn/${r.id}`}>Practice</Link>}
                <button
                  className="btn sm"
                  onClick={async () => {
                    if (canView(r)) return router.push(`/c/${clientId}/hub/view/${r.id}`);
                    const e = await openResource(r);
                    if (e) toast.show(e);
                  }}
                >
                  Open
                </button>
              </span>
            </div>
          ))}
        </div>
        <p className="demo-note">Sample resources for the prototype.</p>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}

/** A small icon per resource type, so the list reads at a glance. */
function typeIcon(type: string) {
  const t = type.toLowerCase();
  const p = t.startsWith("train") ? "M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5"
    : t.startsWith("templ") ? "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4"
    : t.startsWith("check") ? "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"
    : t.startsWith("guide") ? "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM20 17v4H6.5A2.5 2.5 0 0 1 4 19.5"
    : t.startsWith("video") ? "M15 10l5-3v10l-5-3zM3 6h12v12H3z"
    : t.startsWith("polic") ? "M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z"
    : "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5";
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={p} /></svg>;
}
