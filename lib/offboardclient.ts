"use client";

// Offboarding in the browser: Ben and executives only. The public demo keeps everything in this browser.
import { useCallback, useEffect, useState } from "react";
import { Departure, newToken, tasksFor } from "./offboard";
import { authHeader, LIVE, sb } from "./supabase";

const KEY = "alza-demo-offboard-v1";
const iso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function demo(): Departure[] {
  const now = new Date().toISOString();
  const a: Departure = { id: "demo-off-1", clientId: "blueprint", status: "planned", personId: "pp4", name: "Chris Wu", title: "Warehouse Associate", department: "Warehouse", managerName: "Dana Ortiz", type: "resignation", noticeDate: iso(-6), lastDay: iso(8), personalEmail: "chris.wu@example.com", rehire: "yes", reason: "Moving to Portland for family.", tasks: [], email: { auto: true }, notes: [], history: [{ at: now, by: "Ben Gaines", text: "Offboarding started" }], createdAt: now, createdBy: "Ben Gaines" };
  a.tasks = tasksFor(a, "Rippling").map((t, i) => (i < 2 ? { ...t, done: true, doneAt: iso(-5), doneBy: "Ben Gaines" } : t));
  const b: Departure = { id: "demo-off-2", clientId: "blueprint", status: "departed", name: "Riley Park", title: "Driver", department: "Logistics", managerName: "Dana Ortiz", type: "resignation", noticeDate: iso(-30), lastDay: iso(-16), personalEmail: "riley@example.com", rehire: "yes", tasks: [], email: { auto: true, sentAt: `${iso(-18)}T16:00:00Z`, to: "riley@example.com" }, survey: { token: newToken(), sentAt: `${iso(-18)}T16:00:00Z`, doneAt: `${iso(-15)}T19:00:00Z`, answers: [{ q: "Overall, how was your experience working here?", a: "4" }, { q: "How supported did you feel by your manager?", a: "5" }, { q: "What's the main reason you're leaving?", a: "Growth or career path" }, { q: "What did you like most about working here?", a: "The crew. Everyone has each other's back on install days." }, { q: "What's one thing we should change?", a: "More notice on weekend shifts." }, { q: "Would you recommend us as a place to work?", a: "Yes" }] }, rosterRemovedAt: `${iso(-15)}T14:00:00Z`, notes: [], history: [{ at: `${iso(-30)}T16:00:00Z`, by: "Ben Gaines", text: "Offboarding started" }], createdAt: `${iso(-30)}T16:00:00Z`, createdBy: "Ben Gaines" };
  b.tasks = tasksFor(b, "Rippling").map((t) => ({ ...t, done: true, doneAt: b.lastDay, doneBy: "Ben Gaines" }));
  return [a, b];
}
function demoGet(): Departure[] {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return demo();
}
function demoPut(l: Departure[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {}
}

export async function offboardApi(clientId: string, body: object): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!LIVE) return { ok: false, reason: "demo" };
  const r = await fetch("/api/offboarding", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ clientId, ...body }) });
  return r.json().catch(() => ({ ok: false, reason: "error" }));
}

export function useDepartures(clientId: string, enabled: boolean) {
  const [list, setList] = useState<Departure[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    if (!enabled) return;
    if (!LIVE) return setList(demoGet().filter((d) => d.clientId === clientId));
    const { data, error } = await sb().from("departures").select("id, data").eq("client_id", clientId).order("created_at", { ascending: false });
    if (error) return setErr(/relation|does not exist/i.test(error.message) ? "setup" : "load");
    setList((data ?? []).map((r) => ({ ...(r.data as Departure), id: r.id as string })));
  }, [clientId, enabled]);
  useEffect(() => {
    load();
  }, [load]);
  const save = useCallback(
    async (d: Departure): Promise<string> => {
      const next = { ...d };
      if (!LIVE) {
        const all = demoGet();
        demoPut(all.some((x) => x.id === d.id) ? all.map((x) => (x.id === d.id ? next : x)) : [next, ...all]);
      } else {
        const { id, ...data } = next;
        const { error } = await sb().from("departures").upsert({ id, client_id: clientId, data: { ...data, id } });
        if (error) return "Couldn't save. Try again.";
      }
      setList((l) => ((l ?? []).some((x) => x.id === d.id) ? (l ?? []).map((x) => (x.id === d.id ? next : x)) : [next, ...(l ?? [])]));
      return "";
    },
    [clientId]
  );
  const replace = useCallback((d: Departure) => {
    setList((l) => (l ?? []).map((x) => (x.id === d.id ? d : x)));
    if (!LIVE) demoPut(demoGet().map((x) => (x.id === d.id ? d : x)));
  }, []);
  return { list, err, load, save, replace };
}

export const soonDays = (d: Departure) => {
  const a = new Date(`${d.lastDay}T12:00:00`).getTime();
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const t = now.getTime();
  return Math.round((a - t) / 864e5);
};
