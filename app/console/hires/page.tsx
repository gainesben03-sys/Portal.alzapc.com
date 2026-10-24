"use client";

import { AlzaNav, AlzaTopbar, useGuard } from "@/components/ui";
import { HireRow } from "@/components/hires";
import { analyze, daysUntil, onboardingFor } from "@/lib/hires";
import { useStore } from "@/lib/store";
import Link from "next/link";

export default function ConsoleHires() {
  const ok = useGuard("advisor");
  const { hires, getClient, config, clients } = useStore();
  if (!ok) return null;
  const open = hires.filter((h) => h.status !== "Started").sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"));
  const needsBen = open.filter((h) => h.status === "Approved to hire" && !(h.docs ?? []).some((d) => d.kind === "offer"));
  const warn = open.filter((h) => analyze(h, onboardingFor(config[h.clientId]?.onboarding)).flags.some(([, k]) => k === "warn"));
  const thisWeek = open.filter((h) => h.startDate && daysUntil(h.startDate) >= 0 && daysUntil(h.startDate) <= 7);
  const recent = hires.filter((h) => h.status === "Started" && daysUntil(h.startDate) > -45).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const withHires = clients.filter((c) => config[c.id]?.modules.hires);

  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap wide">
        <h1>New hires</h1>
        <div className="stats">
          <div className="stat"><div className="n">{open.length}</div><div className="tiny muted">In progress</div></div>
          <div className="stat"><div className="n">{needsBen.length}</div><div className="tiny muted">Need an offer letter</div></div>
          <div className="stat"><div className="n">{thisWeek.length}</div><div className="tiny muted">Start this week</div></div>
          <div className="stat"><div className="n">{warn.length}</div><div className="tiny muted">Missing something</div></div>
        </div>
        <div className="section-head section">
          <h2>On the way</h2>
          <span className="tiny muted">Start one from a client: {withHires.map((c, i) => <span key={c.id}>{i > 0 && " · "}<Link href={`/c/${c.id}/hires/new`} style={{ color: "var(--blue)" }}>{c.name}</Link></span>)}</span>
        </div>
        {open.length ? (
          <div className="hire-list">{open.map((h) => <HireRow key={h.id} h={h} clientName={getClient(h.clientId)?.name} href={`/c/${h.clientId}/hires/${h.id}?from=console`} />)}</div>
        ) : (
          <div className="card small muted">No hires in progress.</div>
        )}
        {recent.length > 0 && (
          <>
            <div className="section-head section"><h2>Recently started</h2></div>
            <div className="hire-list">{recent.map((h) => <HireRow key={h.id} h={h} clientName={getClient(h.clientId)?.name} href={`/c/${h.clientId}/hires/${h.id}?from=console`} />)}</div>
          </>
        )}
      </main>
    </>
  );
}
