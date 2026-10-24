"use client";

// Prototype state. Everything lives in the browser (localStorage) so the demo
// works with no backend. In the real build this becomes Supabase tables with
// row-level security per client.

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Action, ADVISOR, CLIENTS, DEFAULT_RULES, Person, Project, Rules, seed, toISO } from "./data";

export type Viewer = { kind: "advisor" } | { kind: "client"; clientId: string; person: Person };

interface Store {
  ready: boolean;
  viewer: Viewer | null;
  setViewer: (v: Viewer | null) => void;
  actions: Action[];
  projects: Project[];
  rules: Rules;
  setRules: (r: Rules) => void;
  update: (id: string, patch: Partial<Action>, log: string) => void;
  reset: () => void;
}

const Ctx = createContext<Store | null>(null);
const KEY = "alza-portal-demo-v1";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);

  useEffect(() => {
    let loaded = false;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setActions(s.actions);
        setProjects(s.projects);
        setRules(s.rules ?? DEFAULT_RULES);
        setViewer(s.viewer ?? null);
        loaded = true;
      }
    } catch {}
    if (!loaded) {
      const s = seed();
      setActions(s.actions);
      setProjects(s.projects);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ actions, projects, rules, viewer }));
    } catch {}
  }, [ready, actions, projects, rules, viewer]);

  const value = useMemo<Store>(() => {
    const who = viewer?.kind === "client" ? viewer.person.name : ADVISOR.name;
    return {
      ready,
      viewer,
      setViewer,
      actions,
      projects,
      rules,
      setRules,
      update: (id, patch, log) =>
        setActions((list) =>
          list.map((a) =>
            a.id === id
              ? {
                  ...a,
                  ...patch,
                  completedAt: patch.status === "completed" ? new Date().toISOString() : patch.completedAt ?? a.completedAt,
                  history: [...a.history, { at: new Date().toISOString(), by: who, text: log }],
                }
              : a
          )
        ),
      reset: () => {
        const s = seed();
        setActions(s.actions);
        setProjects(s.projects);
        setRules(DEFAULT_RULES);
      },
    };
  }, [ready, viewer, actions, projects, rules]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

export const clientById = (id: string) => CLIENTS.find((c) => c.id === id);
export { toISO };
