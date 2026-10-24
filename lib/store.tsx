"use client";

// Prototype state. Everything lives in the browser (localStorage) so the demo
// works with no backend. In the real build this becomes Supabase tables with
// row-level security per client.

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Action, ADVISOR, Client, CLIENTS, DEFAULT_RULES, Person, Project, Rules, seed, toISO } from "./data";
import {
  Announcement,
  Benefit,
  Candidate,
  ClientConfig,
  PortalUser,
  Note,
  Notice,
  Resource,
  SharedFile,
  Role,
  seedModules,
} from "./modules";

export type Viewer = { kind: "advisor" } | { kind: "client"; clientId: string; person: Person };

interface State {
  actions: Action[];
  projects: Project[];
  rules: Rules;
  config: Record<string, ClientConfig>;
  roles: Role[];
  candidates: Candidate[];
  resources: Resource[];
  benefits: Benefit[];
  announcements: Announcement[];
  notes: Note[];
  files: SharedFile[];
  notices: Notice[];
  helpful: Record<string, "up" | "down">;
  bookingUrl: string; // Ben's scheduling link (Calendly)
  layouts: Record<string, string[]>; // per-person dashboard tiles, key `${clientId}:${email}`
}

interface Store extends State {
  ready: boolean;
  viewer: Viewer | null;
  who: string;
  setViewer: (v: Viewer | null) => void;
  setRules: (r: Rules) => void;
  update: (id: string, patch: Partial<Action>, log: string) => void;
  patch: (p: Partial<State>) => void;
  /** Add an item to Ben's notification bell. */
  notice: (n: Omit<Notice, "id" | "at" | "read">) => void;
  getClient: (id: string) => Client | undefined;
  /** The signed-in client user's record (null for Ben). */
  me: PortalUser | null;
  reset: () => void;
}

const Ctx = createContext<Store | null>(null);
const KEY = "alza-portal-demo-v4";

function fresh(): State {
  const a = seed();
  const m = seedModules();
  return { ...a, rules: DEFAULT_RULES, ...m, helpful: {}, bookingUrl: "", layouts: {} };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [state, setState] = useState<State>(() => ({
    actions: [],
    projects: [],
    rules: DEFAULT_RULES,
    config: {},
    roles: [],
    candidates: [],
    resources: [],
    benefits: [],
    announcements: [],
    notes: [],
    files: [],
    notices: [],
    helpful: {},
    bookingUrl: "",
    layouts: {},
  }));

  useEffect(() => {
    let next = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        next = { ...next, ...s.state };
        setViewer(s.viewer ?? null);
      }
    } catch {}
    setState(next);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ state, viewer }));
    } catch {}
  }, [ready, state, viewer]);

  const value = useMemo<Store>(() => {
    const who = viewer?.kind === "client" ? viewer.person.name : ADVISOR.name;
    const getClient = (id: string): Client | undefined => {
      const base = CLIENTS.find((c) => c.id === id);
      if (!base) return undefined;
      const cfg = state.config[id];
      if (!cfg) return base;
      const esc = cfg.users.find((u) => u.email === cfg.escalationEmail);
      return {
        ...base,
        accent: cfg.accent,
        logo: cfg.logo,
        contacts: cfg.users.map(({ name, role }) => ({ name, role })),
        escalation: esc ? { name: esc.name, role: esc.role } : base.escalation,
      };
    };
    const me =
      viewer?.kind === "client"
        ? state.config[viewer.clientId]?.users.find((u) => u.name === viewer.person.name) ?? null
        : null;
    return {
      ...state,
      me,
      ready,
      viewer,
      who,
      setViewer,
      getClient,
      setRules: (rules) => setState((s) => ({ ...s, rules })),
      patch: (p) => setState((s) => ({ ...s, ...p })),
      notice: (n) =>
        setState((s) => ({
          ...s,
          notices: [{ ...n, id: `x${Date.now()}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), read: false }, ...s.notices],
        })),
      update: (id, patch, log) =>
        setState((s) => {
          const before = s.actions.find((a) => a.id === id);
          let notices = s.notices;
          if (before && viewer?.kind === "client" && patch.status && patch.status !== before.status) {
            const kind =
              patch.status === "completed" ? "completed" : patch.status === "extension_requested" ? "extension" : patch.status === "needs_revision" ? "revision" : patch.status === "submitted" ? "upload" : null;
            if (kind) {
              const verb = { completed: "completed", extension: "asked for more time on", revision: "requested changes on", upload: "uploaded a file to" }[kind];
              notices = [
                { id: `x${Date.now()}`, clientId: before.clientId, kind, text: `${who} ${verb} "${before.title}"`, href: `/c/${before.clientId}/a/${before.id}`, at: new Date().toISOString(), read: false },
                ...notices,
              ];
            }
          }
          return {
          ...s,
          notices,
          actions: s.actions.map((a) =>
            a.id === id
              ? {
                  ...a,
                  ...patch,
                  completedAt:
                    patch.status === "completed" ? new Date().toISOString() : patch.completedAt ?? a.completedAt,
                  history: [...a.history, { at: new Date().toISOString(), by: who, text: log }],
                }
              : a
          ),
          };
        }),
      reset: () => setState(fresh()),
    };
  }, [ready, viewer, state]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

/** Static lookup (base data). Prefer useStore().getClient for configured values. */
export const clientById = (id: string) => CLIENTS.find((c) => c.id === id);
export { toISO };

/** Send an email notification to Ben via the server route. Never throws. */
export async function notifyBen(subject: string, text: string): Promise<boolean> {
  try {
    const r = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, text }),
    });
    const j = await r.json();
    return !!j.sent;
  } catch {
    return false;
  }
}
