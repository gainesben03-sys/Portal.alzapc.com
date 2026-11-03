"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { HubHeader } from "@/components/hub";
import { useStore } from "@/lib/store";
import { fmt } from "@/lib/data";
import { canView, openResource, RES_ICON } from "@/lib/library";
import { useRouter } from "next/navigation";
import { loadNewsletters, monthLabel, Newsletter } from "@/lib/newsletters";
import { hasPractice } from "@/lib/practice";

const MANAGER_FOLDERS = ["Trainings", "Manager toolkit", "Policies"];

/** Learn: trainings with practice, the toolkit and past Manager Minutes, built for a phone. */
export default function HubLibrary() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, resources, clients, viewer, config } = useStore();
  const client = getClient(clientId);
  const toast = useToast();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string>("all");
  const [minutes, setMinutes] = useState<Newsletter[]>([]);

  const demoClients = useMemo(() => clients.map((c) => ({ id: c.id, name: c.name, accent: c.accent })), [clients]);
  useEffect(() => {
    if (!ok) return;
    loadNewsletters({ clientId, light: true, demoClients }).then((r) => setMinutes(r.list.filter((n) => n.inLibrary && n.kind === "manager-minute").sort((a, b) => b.month.localeCompare(a.month))));
  }, [ok, clientId, demoClients]);

  if (!ok || !client) return null;
  const trainingOn = !!config[clientId]?.modules.training;
  const items = resources
    .flatMap((r) => r.shares.filter((s) => s.clientId === clientId && MANAGER_FOLDERS.includes(s.folder) && !(trainingOn && s.folder === "Trainings")).map((s) => ({ r, s })))
    .sort((a, b) => (a.s.folder === "Trainings" ? -1 : 0) - (b.s.folder === "Trainings" ? -1 : 0) || b.s.at.localeCompare(a.s.at));
  const isAdvisor = viewer?.kind === "advisor";
  // practice lives in the Training tab (a feature Ben turns on per client)
  const practice: typeof items = [];
  const folders = Array.from(new Set(items.map((x) => x.s.folder)));
  const shown = items.filter(({ r, s }) => (folder === "all" || s.folder === folder) && (!q || `${r.title} ${r.desc} ${r.category}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <HubHeader clientId={clientId} title={trainingOn ? "Toolkit" : "Learn"} sub={trainingOn ? "Guides, policies and past Manager Minutes." : "Trainings, tools and past Manager Minutes."} />
        {trainingOn && (
          <Link href={`/c/${clientId}/training`} className="card section hub-tool">
            <span className="hub-icon" aria-hidden="true">🎓</span>
            <span className="grow" style={{ minWidth: 0 }}><b className="small" style={{ display: "block" }}>Trainings and practice</b><span className="tiny muted">In the Training tab</span></span>
          </Link>
        )}
        {practice.length > 0 && (
          <div className="learn-feature section">
            {practice.map(({ r }) => {
              const c = r.practice!.content.en!;
              return (
                <div className="card learn-card" key={r.id}>
                  <span className="tiny" style={{ letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.8 }}>🎯 Practice{c.framework ? ` · ${c.framework}` : ""}{r.practice!.langs.includes("es") ? " · EN / ES" : ""}{r.practice!.status !== "published" ? " · draft" : ""}</span>
                  <b className="learn-title">{c.title}</b>
                  <span className="small" style={{ opacity: 0.85 }}>{c.intro}</span>
                  <span className="tiny" style={{ opacity: 0.8 }}>{[c.quiz.length && `${c.quiz.length}-question check`, c.scenarios.length && `${c.scenarios.length} role-plays`, c.planner.length && "a conversation planner"].filter(Boolean).join(" · ")}</span>
                  <div className="row" style={{ gap: 8, marginTop: 4 }}>
                    <Link className="btn sm learn-go" href={`/c/${clientId}/hub/learn/${r.id}`}>Start practicing</Link>
                    {(r.path || r.url) && (canView(r) ? <Link className="btn sm ghost learn-ghost" href={`/c/${clientId}/hub/view/${r.id}`}>View slides</Link> : <button className="btn sm ghost learn-ghost" onClick={async () => { const e = await openResource(r); if (e) toast.show(e); }}>Slides</button>)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
                  if (canView(r)) return router.push(`/c/${clientId}/hub/view/${r.id}`);
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
