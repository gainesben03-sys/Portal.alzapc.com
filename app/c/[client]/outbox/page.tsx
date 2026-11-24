"use client";

// A company's Outbox: executives (and HR) approve emails before they go out.
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { OutboxView } from "@/components/outbox";
import { useStore } from "@/lib/store";

export default function ClientOutbox() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, viewer, me, who, preview } = useStore();
  const toast = useToast();
  const client = getClient(clientId);
  const advisor = viewer?.kind === "advisor";
  const names = useMemo(() => (client ? [{ id: client.id, name: client.name }] : []), [client]);
  const v = useMemo(() => ({ advisor, clientId, name: me?.name || who || "" }), [advisor, clientId, me?.name, who]);
  if (!ok || !client) return null;
  const allowed = advisor || me?.access === "exec";
  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        {allowed ? <OutboxView viewer={v} names={names} toast={toast.show} readOnly={!!preview} /> : <div className="card section small muted">The Outbox is for executives.</div>}
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
