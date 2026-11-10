"use client";

// Leave center in the browser: who can see it, the cases, and calls to /api/leave.
// In the public demo everything stays in this browser.
import { useCallback, useEffect, useState } from "react";
import { useStore } from "./store";
import { authHeader, LIVE, sb } from "./supabase";
import { LeaveCase } from "./leave";
import { demoLeave } from "./leavedemo";

const DEMO_KEY = "alza-demo-leave-v1";
function demoGet(): LeaveCase[] {
  try {
    const s = localStorage.getItem(DEMO_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return demoLeave();
}
function demoPut(l: LeaveCase[]) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(l));
  } catch {}
}

export async function leaveApi(clientId: string, body: object): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!LIVE) return { ok: false, reason: "demo" };
  const r = await fetch("/api/leave", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ clientId, ...body }) });
  return r.json().catch(() => ({ ok: false, reason: "error" }));
}

/** Is the signed-in person an HR admin for this client? Ben always is. */
export function useLeaveAccess(clientId: string) {
  const { viewer, me, config } = useStore();
  const on = !!config[clientId]?.modules.leave;
  const isAdvisor = viewer?.kind === "advisor";
  const [state, setState] = useState<{ admin: boolean; medical: boolean; ready: boolean }>({ admin: isAdvisor, medical: isAdvisor, ready: isAdvisor });
  useEffect(() => {
    if (isAdvisor) return setState({ admin: true, medical: true, ready: true });
    if (!on || !me?.email) return setState({ admin: false, medical: false, ready: true });
    if (!LIVE) return setState({ admin: me.access === "exec", medical: me.access === "exec", ready: true }); // demo: executives play the HR admin
    let off = false;
    sb()
      .from("leave_admins")
      .select("medical")
      .eq("client_id", clientId)
      .ilike("email", me.email)
      .maybeSingle()
      .then(({ data }) => !off && setState({ admin: !!data, medical: !!data?.medical, ready: true }));
    return () => {
      off = true;
    };
  }, [isAdvisor, on, me?.email, me?.access, clientId]);
  return { ...state, on };
}

export type HrAdmin = { email: string; medical: boolean };

export function useLeaveCases(clientId: string, enabled: boolean) {
  const [cases, setCases] = useState<LeaveCase[] | null>(null);
  const [admins, setAdmins] = useState<HrAdmin[]>([]);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    if (!enabled) return;
    if (!LIVE) {
      setCases(demoGet().filter((c) => c.clientId === clientId));
      setAdmins([{ email: "alex@example.com", medical: true }, { email: "priya@example.com", medical: false }]);
      return;
    }
    const j = await leaveApi(clientId, { action: "list" });
    if (!j.ok) return setErr(j.reason ?? "error");
    setCases(j.cases);
    setAdmins(j.admins ?? []);
  }, [clientId, enabled]);
  useEffect(() => {
    load();
  }, [load]);

  /** Save one case. Returns the saved case, or an error message. */
  const save = useCallback(
    async (c: LeaveCase): Promise<LeaveCase | string> => {
      if (!LIVE) {
        const all = demoGet();
        const now = { ...c, updatedAt: new Date().toISOString() };
        const next = all.some((x) => x.id === c.id) ? all.map((x) => (x.id === c.id ? now : x)) : [now, ...all];
        demoPut(next);
        setCases(next.filter((x) => x.clientId === clientId));
        return now;
      }
      const j = await leaveApi(clientId, { action: "save", case: c });
      if (!j.ok) return j.reason === "forbidden" ? "Only HR admins can change leave cases." : "Couldn't save. Try again.";
      setCases((l) => (l ?? []).some((x) => x.id === c.id) ? (l ?? []).map((x) => (x.id === c.id ? j.case : x)) : [j.case, ...(l ?? [])]);
      return j.case as LeaveCase;
    },
    [clientId]
  );
  const replace = useCallback((c: LeaveCase) => {
    setCases((l) => (l ?? []).map((x) => (x.id === c.id ? c : x)));
    if (!LIVE) demoPut(demoGet().map((x) => (x.id === c.id ? c : x)));
  }, []);
  return { cases, admins, setAdmins, err, load, save, replace };
}
