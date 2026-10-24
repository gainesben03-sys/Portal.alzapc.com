"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlzaNav, AlzaTopbar, useGuard } from "@/components/ui";
import { CLIENTS } from "@/lib/data";
import { MODULES } from "@/lib/modules";
import { useStore } from "@/lib/store";

export default function Clients() {
  const ok = useGuard("advisor");
  const { config, getClient, bookingUrl, patch } = useStore();
  const [url, setUrl] = useState(bookingUrl);
  const [saved, setSaved] = useState("");
  useEffect(() => setUrl(bookingUrl), [bookingUrl]);
  if (!ok) return null;
  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap">
        <h1>Clients</h1>
        <p className="muted" style={{ marginTop: 6 }}>One platform, set up differently for each client.</p>
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
          {CLIENTS.map((base) => {
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
    </>
  );
}
