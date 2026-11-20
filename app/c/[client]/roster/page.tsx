"use client";

// The company's roster for executives (and Ben): who's here, who reports to whom, and departments.
import { useParams } from "next/navigation";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { RosterCard } from "@/components/roster";
import { useStore } from "@/lib/store";

export default function RosterPage() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, viewer, me } = useStore();
  const toast = useToast();
  const client = getClient(clientId);
  if (!ok || !client) return null;
  const advisor = viewer?.kind === "advisor";
  const allowed = advisor || me?.access === "exec";
  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <h1>Roster</h1>
        <p className="muted" style={{ marginTop: 6, marginBottom: 14 }}>Everyone at {client.name}, who they report to, and their department. Reviews, reminders and celebrations all use this list.</p>
        {allowed ? <RosterCard clientId={client.id} onToast={toast.show} limited={!advisor} /> : <div className="card small muted">The roster is for executives.</div>}
        {allowed && !advisor && <p className="tiny muted" style={{ marginTop: 10 }}>To upload a full payroll file or remove someone, ask Ben.</p>}
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
