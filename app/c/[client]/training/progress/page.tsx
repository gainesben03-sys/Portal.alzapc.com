"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ClientNav, ClientTopbar, useGuard } from "@/components/ui";
import { useStore } from "@/lib/store";
import { fmt } from "@/lib/data";
import { LIVE, sb } from "@/lib/supabase";
import { hasPractice } from "@/lib/practice";

type Row = { email: string; kind: string; ref: string | null; meta: { score?: number; total?: number }; at: string };

/** Who has practiced each training. Counts and dates only: role-play conversations are never saved. */
export default function TrainingProgress() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, resources, config, people, viewer, me } = useStore();
  const client = getClient(clientId);
  const isAdvisor = viewer?.kind === "advisor";
  const canSee = isAdvisor || me?.access === "exec";
  const trainings = resources.filter((r) => hasPractice(r) && r.shares.some((s) => s.clientId === clientId && s.folder === "Trainings"));
  const [tid, setTid] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const cfg = config[clientId];

  // everyone who could practice: portal users (not hiring-only) and the managers on the roster
  const folks = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of cfg?.users ?? []) if (u.access !== "hiring" && u.email) m.set(u.email.toLowerCase(), u.name);
    for (const p of people) if (p.clientId === clientId && p.active && p.managerEmail) m.set(p.managerEmail.toLowerCase(), m.get(p.managerEmail.toLowerCase()) ?? p.managerName);
    return Array.from(m.entries()).map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [cfg?.users, people, clientId]);

  const t = trainings.find((x) => x.id === tid) ?? trainings[0];
  useEffect(() => {
    if (!ok || !canSee || !t) return;
    if (!LIVE) {
      // demo: a believable spread
      const now = Date.now();
      const demo: Row[] = folks.slice(0, Math.max(1, folks.length - 1)).flatMap((f, i) => [
        ...(i % 3 !== 2 ? [{ email: f.email, kind: "quiz", ref: t.id, meta: { score: 6 + (i % 3), total: 8 }, at: new Date(now - (i + 1) * 864e5).toISOString() }] : []),
        ...Array.from({ length: i % 3 }, (_, k) => ({ email: f.email, kind: "feedback", ref: `${t.id}:s${k}`, meta: {}, at: new Date(now - (i + k + 1) * 432e5).toISOString() })),
      ]);
      setRows(demo);
      return;
    }
    setRows(null);
    sb()
      .from("ai_usage")
      .select("email, kind, ref, meta, at")
      .eq("client_id", clientId)
      .in("kind", ["quiz", "sort", "roleplay", "feedback"])
      .like("ref", `${t.id}%`)
      .order("at", { ascending: false })
      .limit(2000)
      .then(({ data }) => setRows((data as Row[]) ?? []));
  }, [ok, canSee, t?.id, clientId, folks]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok || !client) return null;
  if (!canSee)
    return (
      <div style={{ ["--accent" as string]: client.accent }}>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">This page is for executives.</div></main>
      </div>
    );

  const by = (email: string) => (rows ?? []).filter((r) => r.email.toLowerCase() === email);
  const stats = folks.map((f) => {
    const r = by(f.email);
    const quiz = r.filter((x) => x.kind === "quiz");
    const best = quiz.reduce((m, x) => Math.max(m, x.meta?.total ? (x.meta.score ?? 0) / x.meta.total : 0), 0);
    const plays = r.filter((x) => x.kind === "feedback").length || r.filter((x) => x.kind === "roleplay").length;
    return { ...f, quiz: quiz.length > 0, best, plays, last: r[0]?.at };
  });
  const started = stats.filter((s) => s.quiz || s.plays).length;

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <h1 style={{ margin: 0 }}>Who&apos;s practiced</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>Who has done the quick check and role-plays. You see that they practiced, never what they said.</p>
        {trainings.length > 1 && (
          <div className="chips section">
            {trainings.map((x) => <button key={x.id} className={`chip chip-btn ${t?.id === x.id ? "on" : ""}`} onClick={() => setTid(x.id)}>{x.practice!.content.en!.title}</button>)}
          </div>
        )}
        {!t ? (
          <div className="card section small muted">No trainings with practice yet.</div>
        ) : rows === null ? (
          <p className="small muted section">Loading…</p>
        ) : (
          <>
            <div className="tr-sum section">
              <div className="card"><b>{started}<span className="muted small"> / {stats.length}</span></b><span className="tiny muted">have practiced</span></div>
              <div className="card"><b>{stats.filter((s) => s.quiz).length}</b><span className="tiny muted">did the quick check</span></div>
              <div className="card"><b>{stats.reduce((n, s) => n + s.plays, 0)}</b><span className="tiny muted">role-plays</span></div>
            </div>
            <div className="card section tr-table">
              <div className="tr-tr tr-th tiny muted"><span>Person</span><span>Quick check</span><span>Role-plays</span><span>Last</span></div>
              {stats.map((s) => (
                <div className="tr-tr" key={s.email}>
                  <span className="small ellipsis"><b>{s.name}</b></span>
                  <span className="small">{s.quiz ? (isAdvisor ? `✓ ${Math.round(s.best * 100)}%` : "✓") : <span className="muted">·</span>}</span>
                  <span className="small">{s.plays || <span className="muted">·</span>}</span>
                  <span className="tiny muted">{s.last ? fmt(s.last.slice(0, 10)) : "not yet"}</span>
                </div>
              ))}
            </div>
            {isAdvisor && <p className="tiny muted">Scores show for you only. Executives see a check mark.</p>}
          </>
        )}
      </main>
    </div>
  );
}
