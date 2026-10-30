"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { Initials, LogSheet, useHub } from "@/components/hub";
import { useStore } from "@/lib/store";
import { fmt } from "@/lib/data";
import { anniversary, daysSinceIso, nextYearly, TeamLog, tenure } from "@/lib/team";

/** One person: key dates, open follow-ups, and the history of check-ins and recognition. */
export default function HubPerson() {
  const { client: clientId, id } = useParams<{ client: string; id: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, people, checkins, patch, viewer, me } = useStore();
  const client = getClient(clientId);
  const h = useHub(clientId);
  const toast = useToast();
  const [log, setLog] = useState<TeamLog["kind"] | null>(null);
  const [filter, setFilter] = useState<"all" | TeamLog["kind"]>("all");
  if (!ok || !client) return null;

  const p = people.find((x) => x.id === id && x.clientId === clientId);
  // managers only see their own people; Ben sees everyone
  const allowed = !!p && (viewer?.kind === "advisor" || (!!me?.email && p.managerEmail.toLowerCase() === me.email.toLowerCase()));
  if (!p || !allowed)
    return (
      <div style={{ ["--accent" as string]: client.accent }}>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">This person isn&apos;t on your team. <Link href={`/c/${clientId}/hub/team`}>Back to your team</Link></div></main>
      </div>
    );

  const logs = checkins.filter((l) => l.personId === p.id).sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  const shown = logs.filter((l) => filter === "all" || l.kind === filter);
  const open = logs.filter((l) => l.kind === "checkin").flatMap((l) => (l.commitments ?? []).filter((c) => !c.done).map((c) => ({ c, l })));
  const b = p.birthday ? nextYearly(p.birthday) : null;
  const a = p.hireDate ? anniversary(p.hireDate) : null;
  const first = p.name.split(" ")[0];
  const toggle = (logId: string, cid: string) =>
    patch({ checkins: checkins.map((l) => (l.id === logId ? { ...l, commitments: (l.commitments ?? []).map((c) => (c.id === cid ? { ...c, done: !c.done } : c)) } : l)) });

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <Link href={`/c/${clientId}/hub/team`} className="small" style={{ color: "var(--blue)" }}>← Your team</Link>
        <div className="hub-profile section">
          <Initials name={p.name} />
          <div className="grow" style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0 }}>{p.name}</h1>
            <div className="muted small">{[p.title, p.department, p.location].filter(Boolean).join(" · ")}</div>
          </div>
        </div>

        <div className="hub-facts section">
          {p.hireDate && <div className="card"><span className="tiny muted">With the team</span><b>{tenure(p.hireDate)}</b><span className="tiny muted">since {new Date(p.hireDate + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>}
          {a && <div className="card"><span className="tiny muted">Work anniversary</span><b>{a.years} {a.years === 1 ? "year" : "years"}</b><span className="tiny muted">{a.days === 0 ? "today" : a.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div>}
          {b && <div className="card"><span className="tiny muted">Birthday</span><b>{b.date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</b><span className="tiny muted">{b.days === 0 ? "today 🎂" : `in ${b.days} days`}</span></div>}
        </div>

        <div className="hub-quick section">
          <button className="btn primary" onClick={() => setLog("checkin")}>💬 Log a check-in</button>
          <button className="btn" onClick={() => setLog("recognition")}>⭐ Recognize {first}</button>
        </div>

        {open.length > 0 && (
          <>
            <div className="section-head section"><h2>Open follow-ups</h2></div>
            <div className="card">
              {open.map(({ c, l }) => (
                <label key={c.id} className="check" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={c.done} onChange={() => toggle(l.id, c.id)} />
                  <span>{c.text} <span className="tiny muted">· from {fmt(l.date)}</span></span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="section-head section" style={{ alignItems: "center" }}>
          <h2>History</h2>
          <div className="chips" style={{ margin: 0 }}>
            {(["all", "checkin", "recognition"] as const).map((k) => (
              <button key={k} className={`chip chip-btn ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{k === "all" ? "All" : k === "checkin" ? "Check-ins" : "Recognition"}</button>
            ))}
          </div>
        </div>
        <p className="tiny muted" style={{ marginTop: -4 }}>🔒 Only you and Ben can see these notes.</p>
        {shown.length === 0 ? (
          <div className="card small muted">Nothing logged yet. Start with a quick check-in.</div>
        ) : (
          <div className="hub-history">
            {shown.map((l) => (
              <div key={l.id} className={`card hub-log k-${l.kind}`}>
                <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
                  <b className="small">{l.kind === "checkin" ? "💬 Check-in" : "⭐ Recognition"}</b>
                  <span className="tiny muted" style={{ marginLeft: "auto" }}>{fmt(l.date)} · {daysSinceIso(l.date) <= 0 ? "today" : `${daysSinceIso(l.date)}d ago`}</span>
                </div>
                <p className="small" style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{l.notes}</p>
                {(l.commitments ?? []).length > 0 && (
                  <ul className="tiny" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {l.commitments!.map((c) => <li key={c.id} style={c.done ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>{c.text}</li>)}
                  </ul>
                )}
                <div className="tiny muted" style={{ marginTop: 6 }}>Logged by {l.by}</div>
              </div>
            ))}
          </div>
        )}
      </main>
      {log && <LogSheet clientId={clientId} kind={log} person={p} team={h.team.length ? h.team : [p]} onClose={() => setLog(null)} onSaved={(m) => { setLog(null); toast.show(m); }} />}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
