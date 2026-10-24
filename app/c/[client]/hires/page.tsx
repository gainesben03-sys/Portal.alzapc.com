"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ClientNav, ClientTopbar, useGuard } from "@/components/ui";
import { HireRow } from "@/components/hires";
import { daysUntil } from "@/lib/hires";
import { useStore } from "@/lib/store";

export default function Hires() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, hires, config, viewer, me } = useStore();
  const client = getClient(clientId);
  if (!ok || !client) return null;
  const cfg = config[clientId];
  if (!cfg?.modules.hires)
    return (
      <div>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">New hires isn't turned on for this workspace.</div></main>
      </div>
    );

  const isAdvisor = viewer?.kind === "advisor";
  const canStart = isAdvisor || me?.access === "exec";
  const mine = hires.filter((h) => h.clientId === clientId);
  const byStart = (a: { startDate: string }, b: { startDate: string }) => (a.startDate || "9999").localeCompare(b.startDate || "9999");
  const coming = mine.filter((h) => h.status !== "Started").sort(byStart);
  const started = mine.filter((h) => h.status === "Started").sort((a, b) => b.startDate.localeCompare(a.startDate)).filter((h) => daysUntil(h.startDate) > -90);

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <div className="row" style={{ alignItems: "center" }}>
          <h1 className="grow" style={{ margin: 0 }}>New hires</h1>
          {canStart && <Link href={`/c/${clientId}/hires/new`} className="btn primary sm">New hire</Link>}
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>
          From approved to day one. Offer letters, welcome emails and first-day details are handled here{isAdvisor ? "" : " with Ben"}.
        </p>

        <div className="section-head section"><h2>On the way</h2><span className="tiny muted">{coming.length}</span></div>
        {coming.length ? (
          <div className="hire-list">{coming.map((h) => <HireRow key={h.id} h={h} href={`/c/${clientId}/hires/${h.id}`} />)}</div>
        ) : (
          <div className="card small muted">
            No one in progress.{canStart ? " When you're ready to make an offer, tap New hire and Ben takes it from there." : ""}
          </div>
        )}

        {started.length > 0 && (
          <>
            <div className="section-head section"><h2>Recently started</h2></div>
            <div className="hire-list">{started.map((h) => <HireRow key={h.id} h={h} href={`/c/${clientId}/hires/${h.id}`} />)}</div>
          </>
        )}
      </main>
    </div>
  );
}
