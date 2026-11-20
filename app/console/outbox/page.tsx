"use client";

// Ben's Outbox: emails from every company that are waiting for an OK.
import { useMemo } from "react";
import { AlzaNav, AlzaTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { OutboxView } from "@/components/outbox";
import { useStore } from "@/lib/store";

export default function ConsoleOutbox() {
  const ok = useGuard("advisor");
  const { clients, who } = useStore();
  const toast = useToast();
  const names = useMemo(() => clients.map((c) => ({ id: c.id, name: c.name })), [clients]);
  const viewer = useMemo(() => ({ advisor: true, name: who || "Ben" }), [who]);
  if (!ok) return null;
  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap">
        <OutboxView viewer={viewer} names={names} toast={toast.show} />
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </>
  );
}
