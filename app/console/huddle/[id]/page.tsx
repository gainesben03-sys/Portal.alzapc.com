"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AlzaNav, AlzaTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { buildHuddle } from "@/lib/huddle";
import { Cadence, CADENCE_LABEL, DAY_NAMES, HuddleSettings, nextHuddle } from "@/lib/modules";
import { useStore } from "@/lib/store";

export default function HuddleSetup() {
  const { id } = useParams<{ id: string }>();
  const ok = useGuard("advisor");
  const { config, patch, getClient, actions, projects, files, rules } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const client = getClient(id);
  const cfg = config[id];
  if (!ok) return null;
  if (!client || !cfg) return (<><AlzaTopbar /><AlzaNav /><main className="wrap"><div className="card">Client not found.</div></main></>);

  const h = cfg.huddle;
  const set = (p: Partial<HuddleSettings>) => patch({ config: { ...config, [id]: { ...cfg, huddle: { ...h, ...p } } } });
  const out = buildHuddle({ client, settings: h, actions, projects, files, rules, softAsks: config[client.id]?.softAsks });
  const next = nextHuddle(h);

  const send = async (mode: "test" | "send") => {
    setBusy(true);
    try {
      const r = await fetch("/api/huddle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, subject: out.subject, html: out.html, text: out.text, to: h.recipients }),
      });
      const j = await r.json();
      if (j.reason === "not_configured") toast.show("Email isn't connected yet. Add the Resend key in Vercel.");
      else if (j.reason === "recipient_not_allowed") toast.show("None of these emails are approved yet (REMIND_ALLOWED).");
      else if (mode === "test") toast.show(j.sent ? "Test sent to your inbox" : "Couldn't send. Check the Resend sender.");
      else {
        if (j.sent) set({ lastSent: new Date().toISOString() });
        toast.show(`Sent to ${j.sent}${j.skipped?.length ? `, ${j.skipped.length} not approved yet` : ""}`);
      }
    } catch {
      toast.show("Couldn't reach the email service");
    }
    setBusy(false);
  };

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap">
        <Link href="/console/huddle" className="small" style={{ color: "var(--blue)" }}>← All Huddles</Link>
        <h1 style={{ marginTop: 10 }}>{client.name} Huddle</h1>
        <p className="muted small" style={{ marginTop: 4 }}>
          {h.cadence === "off"
            ? "Turned off."
            : out.quiet && h.skipIfQuiet
            ? "Nothing new this week, so the next one will be skipped."
            : `Next send: ${next?.toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
          {h.lastSent && ` · Last sent ${new Date(h.lastSent).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
        </p>

        <div className="card section">
          <label className="f" style={{ marginTop: 0 }}>How often</label>
          <select className="f" value={h.cadence} onChange={(e) => set({ cadence: e.target.value as Cadence })}>
            {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}
          </select>
          {h.cadence !== "off" && (
            <>
              <label className="f">Day (sent at 8:00 AM)</label>
              <div className="seg" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginTop: 0 }}>
                {[1, 2, 3, 4, 5].map((d) => (
                  <button key={d} className={h.day === d ? "on" : ""} onClick={() => set({ day: d })}>{DAY_NAMES[d].slice(0, 3)}</button>
                ))}
              </div>
            </>
          )}
          <label className="rule" style={{ marginTop: 14, cursor: "pointer" }}>
            <span className="switch"><input type="checkbox" checked={h.skipIfQuiet} onChange={(e) => set({ skipIfQuiet: e.target.checked })} /><span /></span>
            <div><b>Skip quiet weeks</b><div className="tiny muted">Don't send if nothing is due and nothing changed</div></div>
          </label>
          <label className="rule" style={{ cursor: "pointer" }}>
            <span className="switch"><input type="checkbox" checked={h.bundleReminders} onChange={(e) => set({ bundleReminders: e.target.checked })} /><span /></span>
            <div><b>Bundle task reminders</b><div className="tiny muted">Friendly and due-date nudges ride along in the Huddle. Overdue notices and escalations still go out on their own.</div></div>
          </label>
        </div>

        <div className="section-head section"><h2>Who gets it</h2></div>
        <div className="card">
          {cfg.users.map((u) => (
            <label className="check" key={u.email}>
              <input
                type="checkbox"
                checked={h.recipients.includes(u.email)}
                onChange={(e) => set({ recipients: e.target.checked ? [...h.recipients, u.email] : h.recipients.filter((x) => x !== u.email) })}
              />
              <span>{u.name} <span className="tiny muted">· {u.role} · {u.email}</span></span>
            </label>
          ))}
          <p className="tiny muted" style={{ marginTop: 8 }}>People can also turn it on or off for themselves from their Team page.</p>
        </div>

        <div className="section-head section"><h2>Personal note (optional)</h2></div>
        <div className="card">
          <textarea className="f" value={h.personalNote} onChange={(e) => set({ personalNote: e.target.value })} placeholder="Quick heads up: open enrollment materials land next week." />
          <p className="tiny muted" style={{ marginTop: 6 }}>Shows at the top of the next Huddle. Clear it after it goes out.</p>
        </div>

        <div className="section-head section">
          <h2>Preview</h2>
          <span className="tiny muted">{out.subject}</span>
        </div>
        <iframe title="Huddle preview" srcDoc={out.html} style={{ width: "100%", height: 720, border: "1px solid var(--line)", borderRadius: 14, background: "#eef2f8" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
          <button className="btn" disabled={busy} onClick={() => send("test")}>Send me a test</button>
          <button className="btn primary" disabled={busy || !h.recipients.length} onClick={() => send("send")}>Send to client now</button>
        </div>
        <p className="demo-note">In the prototype, sends happen when you tap. The full build sends automatically on the schedule above.</p>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
