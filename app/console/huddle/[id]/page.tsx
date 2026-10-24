"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AlzaNav, AlzaTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { buildHuddle } from "@/lib/huddle";
import { Cadence, CADENCE_LABEL, DAY_NAMES, HuddleSettings, nextHuddle } from "@/lib/modules";
import { useStore } from "@/lib/store";
import { authHeader } from "@/lib/supabase";

export default function HuddleSetup() {
  const { id } = useParams<{ id: string }>();
  const ok = useGuard("advisor");
  const { config, patch, getClient, actions, projects, files, rules, live } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [sendErr, setSendErr] = useState("");
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
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ mode, subject: out.subject, html: out.html, text: out.text, to: h.recipients, clientId: id }),
      });
      const j = await r.json();
      setSendErr("");
      if (!j.sent && j.reason && !["recipient_not_allowed", "no_recipients"].includes(j.reason)) setSendErr(explain(String(j.reason)));
      if (j.reason === "not_configured") toast.show("Email isn't connected yet. Add the Resend key in Vercel.");
      else if (j.reason === "recipient_not_allowed") toast.show("None of these emails are approved yet (REMIND_ALLOWED).");
      else if (j.reason === "no_recipients") toast.show("Nobody at this client has the Huddle turned on.");
      else if (mode === "test") toast.show(j.sent ? "Test sent. Check your inbox (and spam)." : "Didn't send. See the reason below.");
      else {
        if (j.sent) set({ lastSent: new Date().toISOString() });
        toast.show(j.sent ? `Sent to ${j.sent}${j.skipped?.length ? `, ${j.skipped.length} not approved yet` : ""}` : "Didn't send. See the reason below.");
      }
    } catch {
      toast.show("Couldn't reach the email service");
    }
    setBusy(false);
  };

  const explain = (reason: string) => {
    if (reason === "not_configured") return "RESEND_API_KEY or NOTIFY_FROM is missing in Vercel. Add both, then redeploy.";
    if (reason === "forbidden") return "You need to be signed in as Ben to send Huddles.";
    if (/resend_401|resend_403.*(api key|invalid)/i.test(reason)) return "Resend rejected the API key. Put your current Resend key in Vercel as RESEND_API_KEY, then redeploy.";
    if (/resend_403/i.test(reason)) return `Resend refused the sender. Check that alzapc.com is verified in Resend and NOTIFY_FROM uses it. (${reason})`;
    if (/resend_422/i.test(reason)) return `Resend didn't accept the sender format. NOTIFY_FROM should look like: AlzaHR Portal <portal@alzapc.com>. (${reason})`;
    if (/resend_429/i.test(reason)) return "Too many emails at once. Wait a minute and try again.";
    return `Email failed: ${reason}`;
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
        {sendErr && <div className="impact" style={{ marginTop: 10, color: "var(--red)", background: "var(--red-bg)" }}>{sendErr}</div>}
        <p className="demo-note">{live ? "Sends automatically on the schedule above. Use these buttons for a test or an extra send." : "Demo mode: sends happen only when you tap."}</p>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
