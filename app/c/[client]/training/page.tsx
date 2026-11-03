"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { useStore } from "@/lib/store";
import { fmt } from "@/lib/data";
import { canView, openResource } from "@/lib/library";
import { hasPractice, MyProgress, myProgress, progressSteps } from "@/lib/practice";

/** Training: every training Ben has run for this company, to view again and practice. */
export default function TrainingHome() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, resources, config, viewer, me } = useStore();
  const client = getClient(clientId);
  const toast = useToast();
  const [prog, setProg] = useState<Record<string, MyProgress>>({});
  useEffect(() => setProg(myProgress()), []);
  if (!ok || !client) return null;

  const isAdvisor = viewer?.kind === "advisor";
  const on = !!config[clientId]?.modules.training;
  const list = resources
    .flatMap((r) => r.shares.filter((s) => s.clientId === clientId && s.folder === "Trainings").map((s) => ({ r, at: s.at })))
    .sort((a, b) => Number(hasPractice(b.r)) - Number(hasPractice(a.r)) || b.at.localeCompare(a.at));
  const withPractice = list.filter((x) => hasPractice(x.r) || (isAdvisor && x.r.practice));
  const other = list.filter((x) => !withPractice.includes(x));

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <h1 style={{ margin: 0 }}>Training</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>Your trainings with Ben, and a place to practice what you learned. Five minutes at a time.</p>
        {!on && isAdvisor && <div className="pr-draft tiny">Training is off for {client.name}. Turn it on in their settings under Modules.</div>}

        {withPractice.length > 0 && (
          <div className="tr-grid section">
            {withPractice.map(({ r }) => {
              const c = r.practice!.content.en!;
              const p = prog[r.id];
              const steps = progressSteps(p, !!c.sort);
              return (
                <div key={r.id} className="card tr-card">
                  <div className="tr-top">
                    <span className="tiny" style={{ letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.85 }}>{c.framework || "Training"}{r.practice!.langs.includes("es") ? " · EN / ES" : ""}{r.practice!.status !== "published" ? " · draft" : ""}</span>
                    <b className="tr-title">{c.title}</b>
                    <span className="small" style={{ opacity: 0.9 }}>{c.intro}</span>
                  </div>
                  <div className="tr-steps" aria-label={`${steps} of 3 done`}>
                    {[
                      ["Quick check", !!p?.quiz, p?.quiz ? `${p.quiz.score}/${p.quiz.total}` : `${c.quiz.length} questions`],
                      ["Role-play", (p?.roleplays ?? 0) > 0, (p?.roleplays ?? 0) > 0 ? `${p!.roleplays} done` : `${c.scenarios.length} scenarios`],
                      c.sort ? [c.sort.prompt.replace(/^¿|\?$/g, ""), !!p?.sort, p?.sort ? `${p.sort.score}/${p.sort.total}` : `${c.sort.items.length} to sort`] : ["Another role-play", (p?.roleplays ?? 0) > 1, ""],
                    ].map(([label, done, note]) => (
                      <div key={String(label)} className={`tr-step ${done ? "done" : ""}`}>
                        <span className="tr-dot" aria-hidden="true">{done ? "✓" : ""}</span>
                        <span className="tiny"><b>{label}</b>{note ? <span className="muted"> · {note}</span> : null}</span>
                      </div>
                    ))}
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <Link className="btn primary sm" href={`/c/${clientId}/hub/learn/${r.id}`}>{steps === 0 ? "Start practicing" : steps >= 3 ? "Practice again" : "Keep going"}</Link>
                    {(r.path || r.url) && (canView(r) ? <Link className="btn sm" href={`/c/${clientId}/hub/view/${r.id}`}>View slides</Link> : <button className="btn sm" onClick={async () => { const e = await openResource(r); if (e) toast.show(e); }}>Slides</button>)}
                    {p?.last && <span className="tiny muted" style={{ marginLeft: "auto", alignSelf: "center" }}>Last practiced {fmt(p.last.slice(0, 10))}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {other.length > 0 && (
          <>
            <div className="section-head section"><h2>{withPractice.length ? "More trainings" : "Your trainings"}</h2></div>
            <div className="card hub-lib">
              {other.map(({ r, at }) => (
                <button key={r.id} className="hub-lib-row" onClick={async () => { if (canView(r)) { window.location.href = `/c/${clientId}/hub/view/${r.id}`; return; } const e = await openResource(r); if (e) toast.show(e); }}>
                  <span className="hub-lib-icon" aria-hidden="true">🎓</span>
                  <span className="grow" style={{ minWidth: 0, textAlign: "left" }}>
                    <b className="small" style={{ display: "block" }}>{r.title}</b>
                    {r.desc && <span className="tiny muted" style={{ display: "block" }}>{r.desc}</span>}
                    <span className="tiny muted">{fmt(at.slice(0, 10))}</span>
                  </span>
                  <span className="tiny" style={{ color: "var(--blue)", flex: "none" }}>View</span>
                </button>
              ))}
            </div>
          </>
        )}

        {list.length === 0 && <div className="card section small muted">No trainings yet. After a session with Ben, the slides and practice show up here.</div>}
        {withPractice.length > 0 && <p className="tiny muted section">🔒 Practice is private. Role-play conversations aren&apos;t saved. {me?.access === "exec" || isAdvisor ? "You can see who has practiced, not what they said." : "Your company sees that you practiced, not what you said."}</p>}
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
