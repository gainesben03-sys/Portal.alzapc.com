"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlzaNav, AlzaTopbar, Sheet, useGuard } from "@/components/ui";
import { newClientConfig } from "@/lib/state";
import { MODULES } from "@/lib/modules";
import { useStore } from "@/lib/store";

export default function Clients() {
  const ok = useGuard("advisor");
  const { config, getClient, bookingUrl, patch, clients } = useStore();
  const [url, setUrl] = useState(bookingUrl);
  const [saved, setSaved] = useState("");
  const [adding, setAdding] = useState(false);
  const [nc, setNc] = useState({ name: "", engagement: "" });
  const router = useRouter();
  const addClient = () => {
    const name = nc.name.trim();
    if (!name) return;
    let id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "client";
    if (clients.some((c) => c.id === id)) id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
    patch({
      clients: [...clients, { id, name, engagement: nc.engagement.trim(), pilot: false, accent: "#19283c", escalation: { name: "", role: "" }, contacts: [] }],
      config: { ...config, [id]: newClientConfig() },
    });
    setAdding(false);
    setNc({ name: "", engagement: "" });
    router.push(`/console/clients/${id}`);
  };
  useEffect(() => setUrl(bookingUrl), [bookingUrl]);
  if (!ok) return null;
  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div>
            <h1>Clients</h1>
            <p className="muted" style={{ marginTop: 6 }}>One platform, set up differently for each client.</p>
          </div>
          <button className="btn primary" onClick={() => setAdding(true)}>Add client</button>
        </div>
        <div className="card section">
          <b>Your booking link</b>
          <div className="tiny muted" style={{ marginTop: 2 }}>Powers the "Talk to Ben" tile on every client dashboard. Paste your Calendly link.</div>
          <form
            style={{ display: "flex", gap: 8, marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              const v = url.trim();
              if (v && !/^https:\/\/\S+$/.test(v)) return setSaved("Use a full https:// link");
              patch({ bookingUrl: v });
              setSaved(v ? "Saved" : "Removed");
            }}
          >
            <input className="f" type="url" placeholder="https://calendly.com/your-name" value={url} onChange={(e) => { setUrl(e.target.value); setSaved(""); }} />
            <button className="btn primary">Save</button>
          </form>
          {saved && <div className="tiny" style={{ marginTop: 6, color: saved.startsWith("Use") ? "var(--red)" : "var(--green)" }}>{saved}</div>}
        </div>
        <div style={{ marginTop: 16 }}>
          {clients.length === 0 && (
            <div className="card">
              <b>No clients yet.</b>
              <p className="small muted" style={{ marginTop: 4 }}>Add your first client, then invite their team from setup.</p>
            </div>
          )}
          {clients.map((base) => {
            const c = getClient(base.id)!;
            const cfg = config[c.id];
            const on = MODULES.filter((m) => cfg?.modules[m.key]);
            return (
              <Link key={c.id} href={`/console/clients/${c.id}`} className="card" style={{ display: "block" }}>
                <div className="row">
                  <span className="client-chip" style={{ background: c.accent }}>{c.name.slice(0, 2).toUpperCase()}</span>
                  <div className="grow">
                    <div className="title">{c.name}</div>
                    <div className="tiny muted">{c.engagement} · {cfg?.users.length ?? 0} users{c.pilot ? " · pilot" : ""}</div>
                  </div>
                  <span className="small" style={{ color: "var(--blue)" }}>Set up</span>
                </div>
                <div className="chips">
                  <span className="chip">Action tracker</span>
                  {on.map((m) => <span className="chip" key={m.key}>{m.label}</span>)}
                </div>
              </Link>
            );
          })}
        </div>
      </main>
      {adding && (
        <Sheet title="Add a client" onClose={() => setAdding(false)}>
          <label className="f">Company name</label>
          <input className="f" autoFocus value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="Blueprint Studios" />
          <label className="f">Engagement</label>
          <input className="f" value={nc.engagement} onChange={(e) => setNc({ ...nc, engagement: e.target.value })} placeholder="Fractional HR + recruiting" />
          <p className="tiny muted" style={{ marginTop: 8 }}>Next you'll set their modules, logo, colors and invite their team.</p>
          <div className="sheet-actions">
            <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn primary" disabled={!nc.name.trim()} onClick={addClient}>Add client</button>
          </div>
        </Sheet>
      )}
    </>
  );
}
