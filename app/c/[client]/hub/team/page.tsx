"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { HubHeader, Initials, LogSheet, NoTeam, personHref, useHub } from "@/components/hub";
import { useStore } from "@/lib/store";
import { anniversary, daysSinceIso, lastLog, nextYearly, TeamLog, TeamMember, tenure } from "@/lib/team";

const ago = (iso?: string) => {
  if (!iso) return "never";
  const d = daysSinceIso(iso);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

/** Everyone who reports to this manager, with when they last checked in and recognized them. */
export default function HubTeam() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient } = useStore();
  const client = getClient(clientId);
  const h = useHub(clientId);
  const toast = useToast();
  const [log, setLog] = useState<{ kind: TeamLog["kind"]; person: TeamMember } | null>(null);
  if (!ok || !client) return null;

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <HubHeader clientId={clientId} title="Your team" sub={h.team.length ? `${h.team.length} ${h.team.length === 1 ? "person" : "people"}` : undefined} />
        {h.team.length === 0 ? (
          <NoTeam clientId={clientId} />
        ) : (
          <div className="card section hub-people">
            {h.team.map((p) => {
              const ci = lastLog(h.logs, p.id, "checkin");
              const rc = lastLog(h.logs, p.id, "recognition");
              const b = p.birthday ? nextYearly(p.birthday) : null;
              const a = p.hireDate ? anniversary(p.hireDate) : null;
              const soon = [b && b.days <= 14 && `🎂 ${b.days === 0 ? "today" : `in ${b.days}d`}`, a && a.days <= 14 && `🎉 ${a.years} yr ${a.days === 0 ? "today" : `in ${a.days}d`}`].filter(Boolean).join("  ");
              return (
                <div className="hub-person" key={p.id}>
                  <Link href={personHref(clientId, p.id)} className="hub-person-main">
                    <Initials name={p.name} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <b className="small ellipsis" style={{ display: "block" }}>{p.name}</b>
                      <span className="tiny muted ellipsis" style={{ display: "block" }}>{[p.title, p.hireDate && tenure(p.hireDate)].filter(Boolean).join(" · ")}</span>
                      <span className="tiny muted" style={{ display: "block" }}>Check-in {ago(ci?.date)} · Recognized {ago(rc?.date)}</span>
                      {soon && <span className="tiny" style={{ display: "block", color: "var(--accent)", fontWeight: 600 }}>{soon}</span>}
                    </span>
                  </Link>
                  <div className="hub-person-actions">
                    <button className="btn sm" aria-label={`Log a check-in with ${p.name}`} onClick={() => setLog({ kind: "checkin", person: p })}>💬</button>
                    <button className="btn sm" aria-label={`Recognize ${p.name}`} onClick={() => setLog({ kind: "recognition", person: p })}>⭐</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      {log && <LogSheet clientId={clientId} kind={log.kind} person={log.person} team={h.team} onClose={() => setLog(null)} onSaved={(m) => { setLog(null); toast.show(m); }} />}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
