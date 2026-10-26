"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { blankHire, Checks, HireDraft, HireForm } from "@/components/hires";
import { newId } from "@/components/hireops";
import { Hire, onboardingFor } from "@/lib/hires";
import { notifyBen, useStore } from "@/lib/store";

function NewHireInner() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const router = useRouter();
  const q = useSearchParams();
  const { getClient, config, hires, patch, viewer, me, who, notice, candidates, roles } = useStore();
  const client = getClient(clientId);
  const cfg = config[clientId];
  const s = onboardingFor(cfg?.onboarding);
  const [v, setV] = useState<HireDraft>(() => blankHire(s));
  const [err, setErr] = useState("");
  const toast = useToast();

  // Coming from Recruiting: start with the finalist's name and the role.
  const candId = q.get("candidate");
  useEffect(() => {
    if (!candId) return;
    const c = candidates.find((x) => x.id === candId);
    const r = c && roles.find((x) => x.id === c.roleId);
    if (c) setV((x) => ({ ...x, name: x.name || c.name, title: x.title || r?.title || "" }));
  }, [candId, candidates, roles]);

  if (!ok || !client || !cfg) return null;
  const isAdvisor = viewer?.kind === "advisor";
  if (!isAdvisor && me?.access !== "exec")
    return (
      <div>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">Only executives can start a new hire. Ask your CEO or Ben.</div></main>
      </div>
    );

  const save = async () => {
    if (!v.name.trim() || !v.title.trim()) return setErr("Add at least the person's name and the position title.");
    if (!v.startDate) return setErr("Add a start date. You can change it later.");
    const now = new Date().toISOString();
    const h: Hire = {
      ...v,
      id: newId("h"),
      clientId,
      name: v.name.trim(),
      title: v.title.trim(),
      personalEmail: v.personalEmail.trim(),
      requestedBy: who,
      createdAt: now,
      history: [{ at: now, by: who, text: isAdvisor ? "Hire started" : `${who} started the hire. Waiting on Ben to prepare the offer.` }],
    };
    patch({ hires: [...hires, h] });
    if (!isAdvisor) {
      notice({ clientId, kind: "hire", text: `${who} started a hire: ${h.name} (${h.title})`, href: `/c/${clientId}/hires/${h.id}` });
      notifyBen(
        `${client.name}: new hire to set up, ${h.name}`,
        `${who} started a new hire in the portal.\n\n${h.name}\n${h.title}, reports to ${h.managerName || "(not set)"}\nStarts ${h.startDate}\n\nOpen it to draft the offer letter.`
      );
    }
    router.push(`/c/${clientId}/hires/${h.id}?new=1`);
  };

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap wide">
        <Link href={`/c/${clientId}/hires`} className="small" style={{ color: "var(--blue)" }}>← New hires</Link>
        <h1 style={{ marginTop: 8 }}>New hire</h1>
        <p className="small muted" style={{ marginTop: -4 }}>
          {isAdvisor
            ? "Everything the offer letter, agreement and welcome emails need. Fill in what you have; the checks show what's still missing."
            : "Tell Ben who you're hiring. He prepares the offer letter and agreement for you to approve, then handles the welcome and first-day emails."}
        </p>
        <div className="hire-new">
          <div className="card"><HireForm value={v} onChange={setV} s={s} people={cfg.users} clientName={client?.name} /></div>
          <div className="hire-side">
            <Checks h={v} s={s} />
            {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
            <button className="btn primary block" onClick={save}>{isAdvisor ? "Save hire" : "Send to Ben"}</button>
          </div>
        </div>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}

export default function NewHire() {
  return (
    <Suspense>
      <NewHireInner />
    </Suspense>
  );
}
