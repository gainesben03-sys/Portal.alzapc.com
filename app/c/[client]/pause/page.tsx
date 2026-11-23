"use client";

// From the Hub: open this company's Pause (the same no-sign-in page employees get from the newsletter).
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ClientNav, ClientTopbar, useGuard } from "@/components/ui";
import { useStore } from "@/lib/store";
import { authHeader, LIVE } from "@/lib/supabase";

export default function HubPause() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient } = useStore();
  const client = getClient(clientId);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!ok) return;
    if (!LIVE) return void location.replace("/pause/demo");
    (async () => {
      try {
        const r = await fetch("/api/pause", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ action: "link", clientId }) });
        const j = await r.json();
        if (j.ok) location.replace(j.url); else setErr(true);
      } catch { setErr(true); }
    })();
  }, [ok, clientId]);
  if (!ok || !client) return null;
  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap"><div className="card section small muted">{err ? "Couldn't open The Pause. Try again in a moment." : "Opening The Pause…"}</div></main>
    </div>
  );
}
