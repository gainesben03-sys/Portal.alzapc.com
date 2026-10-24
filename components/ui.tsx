"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { Action, Client, dueLabel, reminderStage, urgency, Urgency } from "@/lib/data";
import { clientById, useStore } from "@/lib/store";

export function UrgencyPill({ a }: { a: Action }) {
  const { rules } = useStore();
  const u = urgency(a, rules);
  const label = u === "blocker" ? `Blocker · ${dueLabel(a)}` : dueLabel(a);
  return (
    <span className={`pill ${u}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

export function ActionCard({
  a,
  href,
  showClient,
  children,
}: {
  a: Action;
  href: string;
  showClient?: boolean;
  children?: ReactNode;
}) {
  const { rules } = useStore();
  const client = clientById(a.clientId)!;
  const u: Urgency = urgency(a, rules);
  return (
    <div className={`card action u-${u}`}>
      <Link href={href}>
        <div className="action-top">
          <div style={{ minWidth: 0 }}>
            {showClient && (
              <span className="client-chip" style={{ background: client.accent }}>
                {client.name}
              </span>
            )}
            <h3>{a.title}</h3>
            <div className="action-meta">
              {a.side === "alza" ? "Owner: Alza (Ben)" : `Owner: ${a.owner.name}, ${a.owner.role}`}
            </div>
          </div>
          <UrgencyPill a={a} />
        </div>
        {a.impact && a.status !== "completed" && (
          <div className="impact">
            <b>Why it matters:</b> {a.impact}
          </div>
        )}
      </Link>
      <div className="action-foot">
        {children}
        {a.side === "client" && <span className="stage">{reminderStage(a, client, rules)}</span>}
      </div>
    </div>
  );
}

export function useGuard(kind: "advisor" | "client", clientId?: string) {
  const { ready, viewer } = useStore();
  const router = useRouter();
  const ok =
    !!viewer &&
    (viewer.kind === "advisor" || (kind === "client" && viewer.kind === "client" && viewer.clientId === clientId));
  useEffect(() => {
    if (ready && !ok) router.replace("/");
  }, [ready, ok, router]);
  return ready && ok;
}

export function AlzaTopbar({ title = "Master Console" }: { title?: string }) {
  const { setViewer } = useStore();
  const router = useRouter();
  return (
    <header className="topbar">
      <Link href="/console" className="wordmark">
        alza<span>{title}</span>
      </Link>
      <button
        className="viewer-switch"
        onClick={() => {
          setViewer(null);
          router.push("/");
        }}
      >
        Ben · Sign out
      </button>
    </header>
  );
}

export function ClientTopbar({ client }: { client: Client }) {
  const { viewer, setViewer } = useStore();
  const router = useRouter();
  const isAdvisor = viewer?.kind === "advisor";
  return (
    <header className="topbar client">
      <Link href={`/c/${client.id}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {client.logo ? <img src={client.logo} alt={client.name} className="client-logo" /> : <b>{client.name}</b>}
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="powered">
          powered by <b>alza</b>
        </span>
        {isAdvisor ? (
          <Link href="/console" className="viewer-switch">
            Back to console
          </Link>
        ) : (
          <button
            className="viewer-switch"
            onClick={() => {
              setViewer(null);
              router.push("/");
            }}
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}

export function Toast({ msg, onDone }: { msg: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  return msg ? <div className="toast">{msg}</div> : null;
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  return { msg, show: setMsg, clear: () => setMsg(null) };
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
