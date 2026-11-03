"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { Custom, IdeaCards, Planner, Quiz, RolePlay, Sorter } from "@/components/practice";
import { useStore } from "@/lib/store";
import { canView, openResource } from "@/lib/library";
import { authHeader } from "@/lib/supabase";
import { Lang, LANG_LABEL, Scenario, ui } from "@/lib/practice";

type Tab = "ideas" | "check" | "sort" | "roleplay" | "plan";
const LANG_KEY = "alza-practice-lang";

/** Practice for one training: key ideas, a quick check, a sorting drill, role-play and a planner. */
export default function PracticePage() {
  const { client: clientId, id } = useParams<{ client: string; id: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, resources, viewer } = useStore();
  const client = getClient(clientId);
  const toast = useToast();
  const [lang, setLang] = useState<Lang>("en");
  const [tab, setTab] = useState<Tab>("ideas");
  const [play, setPlay] = useState<{ scenario?: Scenario; custom?: Custom } | null>(null);
  useEffect(() => {
    try {
      const l = localStorage.getItem(LANG_KEY);
      if (l === "es" || l === "en") setLang(l);
    } catch {}
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab, play]);

  if (!ok || !client) return null;
  const r = resources.find((x) => x.id === id);
  const isAdvisor = viewer?.kind === "advisor";
  const visible = !!r?.practice && (isAdvisor || (r.practice.status === "published" && r.shares.some((s) => s.clientId === clientId)));
  if (!r || !visible || !r.practice?.content.en)
    return (
      <div style={{ ["--accent" as string]: client.accent }}>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">This practice isn&apos;t available. <Link href={`/c/${clientId}/hub/library`}>Back to Learn</Link></div></main>
      </div>
    );
  const p = r.practice;
  const L: Lang = p.content[lang] ? lang : "en";
  const c = p.content[L]!;
  const t = ui(L);
  const setL = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
  };
  const done = async (kind: "quiz" | "sort", score: number, total: number) => {
    fetch("/api/practice/done", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ clientId, resourceId: r.id, kind, score, total }) }).catch(() => undefined);
  };
  const tabs: { k: Tab; label: string; show: boolean }[] = [
    { k: "ideas", label: t.ideas, show: c.ideas.length > 0 },
    { k: "check", label: t.check, show: c.quiz.length > 0 },
    { k: "sort", label: c.sort?.prompt.replace(/\?$/, "").replace(/^¿/, "") || t.sort, show: !!c.sort?.items.length },
    { k: "roleplay", label: t.roleplay, show: c.scenarios.length > 0 },
    { k: "plan", label: t.plan, show: c.planner.length > 0 },
  ];

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <Link href={`/c/${clientId}/hub/library`} className="small" style={{ color: "var(--blue)" }}>← {L === "es" ? "Aprender" : "Learn"}</Link>
        {isAdvisor && p.status !== "published" && <div className="pr-draft tiny">Draft: only you can see this until you publish it in the library.</div>}
        <div className="pr-head section">
          <div className="grow" style={{ minWidth: 0 }}>
            <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: ".08em" }}>{c.framework ? `${c.framework} · ` : ""}{L === "es" ? "Práctica" : "Practice"}</span>
            <h1 style={{ margin: "2px 0 0" }}>{c.title}</h1>
            <p className="muted small" style={{ margin: "6px 0 0" }}>{c.intro}</p>
          </div>
          {p.langs.length > 1 && (
            <div className="pr-lang" role="group" aria-label="Language">
              {p.langs.map((l) => <button key={l} className={L === l ? "on" : ""} onClick={() => setL(l)} aria-pressed={L === l}>{l === "en" ? "EN" : "ES"}<span className="sr-only"> {LANG_LABEL[l]}</span></button>)}
            </div>
          )}
        </div>
        {(r.path || r.url) && (
          canView(r) ? (
            <Link className="linklike small" style={{ marginTop: 6, display: "inline-block" }} href={`/c/${clientId}/hub/view/${r.id}?from=practice`}>{L === "es" ? "Ver las diapositivas" : "View the slides"} ›</Link>
          ) : (
            <button className="linklike small" style={{ marginTop: 6 }} onClick={async () => { const e = await openResource(r); if (e) toast.show(e); }}>{L === "es" ? "Ver las diapositivas" : "Open the slides"} ›</button>
          )
        )}

        {!play && (
          <div className="pr-tabs section" role="tablist">
            {tabs.filter((x) => x.show).map((x) => <button key={x.k} role="tab" aria-selected={tab === x.k} className={tab === x.k ? "on" : ""} onClick={() => setTab(x.k)}>{x.label}</button>)}
          </div>
        )}

        <div className="section">
          {play ? (
            <RolePlay key={(play.scenario?.id ?? "custom") + L} clientId={clientId} resourceId={play.scenario ? r.id : undefined} scenario={play.scenario} custom={play.custom} lang={L} ideas={c.ideas} pushback={c.pushback} onExit={() => setPlay(null)} />
          ) : tab === "ideas" ? (
            <>
              <IdeaCards c={c} lang={L} />
              {c.pushback && c.pushback.length > 0 && (
                <div className="card pr-push">
                  <b className="small">{L === "es" ? "Cuando se resisten" : "When they push back"}</b>
                  {c.pushback.map((x) => (
                    <div key={x.line} className="pr-push-row">
                      <span className="small">“{x.line}”</span>
                      <span className="small pr-yes">“{x.reply}”</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="pr-next">
                {c.quiz.length > 0 && <button className="btn primary" onClick={() => setTab("check")}>{t.check} ›</button>}
                {c.scenarios.length > 0 && <button className="btn" onClick={() => setTab("roleplay")}>{t.roleplay} ›</button>}
              </div>
            </>
          ) : tab === "check" ? (
            <Quiz qs={c.quiz} lang={L} onDone={(s, n) => done("quiz", s, n)} />
          ) : tab === "sort" && c.sort ? (
            <Sorter drill={c.sort} lang={L} onDone={(s, n) => done("sort", s, n)} />
          ) : tab === "roleplay" ? (
            <>
              <p className="small muted" style={{ marginTop: 0 }}>{L === "es" ? "Claude hace el papel del empleado. Practica en voz baja o escribiendo, y al final recibe comentarios. Nada se guarda." : "Claude plays the employee. Type what you'd say, and get feedback at the end. Nothing is saved."}</p>
              <div className="pr-scenarios">
                {c.scenarios.map((s, i) => (
                  <button key={s.id} className="card pr-scen" onClick={() => setPlay({ scenario: s })}>
                    <span className="tiny muted">{L === "es" ? "Escenario" : "Scenario"} {i + 1}</span>
                    <b>{s.title}</b>
                    <span className="small muted">{s.setup}</span>
                    <span className="tiny" style={{ color: "var(--blue)", fontWeight: 600 }}>{t.start} ›</span>
                  </button>
                ))}
                <button className="card pr-scen pr-scen-own" onClick={() => setTab("plan")}>
                  <b>{L === "es" ? "Practica tu propia conversación" : "Practice your own conversation"}</b>
                  <span className="small muted">{L === "es" ? "Planea una conversación real y practícala." : "Plan a real one, then rehearse it."}</span>
                </button>
              </div>
            </>
          ) : tab === "plan" ? (
            <Planner c={c} lang={L} onPractice={(cu) => setPlay({ custom: cu })} />
          ) : null}
        </div>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
