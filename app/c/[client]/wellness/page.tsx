"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { fmt } from "@/lib/data";
import { PILLARS } from "@/lib/modules";
import { useStore } from "@/lib/store";

export default function Wellness() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, benefits, announcements, helpful, patch, config } = useStore();
  const client = getClient(clientId);
  const [pillar, setPillar] = useState<string | null>(null);
  const toast = useToast();

  if (!ok || !client) return null;
  if (!config[clientId]?.modules.wellness)
    return (
      <div>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">Wellness isn't turned on for this workspace.</div></main>
      </div>
    );

  const list = benefits.filter((b) => !pillar || b.pillar === pillar);
  const vote = (id: string, v: "up" | "down") => {
    patch({ helpful: { ...helpful, [id]: v } });
    toast.show("Thanks, that helps us pick what to offer");
  };

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <h1>Wellness</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Benefits and programs available to the {client.name} team.
        </p>

        {announcements.map((a) => (
          <div className="impact" key={a.id} style={{ marginTop: 12 }}>
            <b>{a.title}</b> <span className="tiny muted">· {fmt(a.date)}</span>
            <div style={{ marginTop: 2 }}>{a.body}</div>
          </div>
        ))}

        <div className="tile-grid section" style={{ marginTop: 18 }}>
          {PILLARS.map((p) => (
            <button key={p.id} className={`tile ${pillar === p.id ? "on" : ""}`} onClick={() => setPillar(pillar === p.id ? null : p.id)}>
              <b>{p.name}</b>
              <span>{p.blurb}</span>
            </button>
          ))}
        </div>

        <div className="section-head section">
          <h2>{pillar ? PILLARS.find((p) => p.id === pillar)!.name : "All programs"}</h2>
          {pillar && <button className="btn ghost sm" onClick={() => setPillar(null)}>Show all</button>}
        </div>
        {list.map((b) => (
          <div className="card" key={b.id}>
            <div className="action-top">
              <div>
                <h3>{b.name}</h3>
                <div className="small muted">{b.provider}</div>
              </div>
              <span className={`pill ${b.included ? "done" : "later"}`}>{b.included ? "Included" : "Optional add-on"}</span>
            </div>
            <p className="small" style={{ marginTop: 8 }}>{b.desc}</p>
            <p className="small muted" style={{ marginTop: 6 }}><b>How to use it:</b> {b.howTo}</p>
            <div className="action-foot">
              <button className="btn sm primary" onClick={() => toast.show("Links to the provider in the full build")}>Get started</button>
              <div className="thumbs" style={{ marginLeft: "auto" }}>
                <span className="tiny muted">Useful?</span>
                <button className={`btn sm ${helpful[b.id] === "up" ? "primary" : ""}`} onClick={() => vote(b.id, "up")} aria-label="Yes">Yes</button>
                <button className={`btn sm ${helpful[b.id] === "down" ? "primary" : ""}`} onClick={() => vote(b.id, "down")} aria-label="No">No</button>
              </div>
            </div>
          </div>
        ))}
        <p className="demo-note">
          Leadership only ever sees totals, never who used which program. Providers shown are placeholders.
        </p>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
