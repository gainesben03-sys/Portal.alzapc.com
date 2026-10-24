"use client";

import Link from "next/link";
import { AlzaNav, AlzaTopbar, useGuard } from "@/components/ui";
import { buildHuddle } from "@/lib/huddle";
import { CADENCE_LABEL, DAY_NAMES, nextHuddle } from "@/lib/modules";
import { useStore } from "@/lib/store";

export default function HuddleList() {
  const ok = useGuard("advisor");
  const { config, getClient, actions, projects, files, rules, clients } = useStore();
  if (!ok) return null;
  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap">
        <h1>HR Huddle</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          One recap email per client on a set day: what needs them, project progress, wins and what's next. Quiet weeks are skipped so it never feels like nagging.
        </p>
        <div style={{ marginTop: 16 }}>
          {clients.map((b) => {
            const c = getClient(b.id)!;
            const h = config[c.id]?.huddle;
            if (!h) return null;
            const out = buildHuddle({ client: c, settings: h, actions, projects, files, rules, softAsks: config[c.id]?.softAsks });
            const next = nextHuddle(h);
            return (
              <Link key={c.id} href={`/console/huddle/${c.id}`} className="card" style={{ display: "block" }}>
                <div className="row">
                  <span className="client-chip" style={{ background: c.accent }}>{c.name.slice(0, 2).toUpperCase()}</span>
                  <div className="grow">
                    <div className="title">{c.name}</div>
                    <div className="tiny muted">
                      {h.cadence === "off" ? "Off" : `${CADENCE_LABEL[h.cadence]} on ${DAY_NAMES[h.day]}`} · {h.recipients.length} recipient{h.recipients.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  {h.cadence === "off" ? (
                    <span className="pill later">Off</span>
                  ) : out.quiet && h.skipIfQuiet ? (
                    <span className="pill later">Quiet, will skip</span>
                  ) : (
                    <span className="pill alza">Next {next?.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                  )}
                </div>
                <div className="chips">
                  <span className="chip">{out.counts.needs} need them</span>
                  {out.counts.overdue > 0 && <span className="chip" style={{ color: "var(--red)" }}>{out.counts.overdue} overdue</span>}
                  <span className="chip">{out.counts.active} active projects</span>
                  <span className="chip">{out.counts.done} wins this week</span>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
