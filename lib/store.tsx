"use client";

// App state.
//   Live mode (Supabase keys set): real sign-in, data loads from the database and
//   every change is saved back automatically. Row-level security decides who sees what.
//   Demo mode (no keys): fictional sample data kept in this browser only.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { Action, ADVISOR, Client, Person, Rules, toISO } from "./data";
import { Notice, PortalUser } from "./modules";
import { demoState, emptyState, State } from "./state";
import { authHeader, LIVE, sb } from "./supabase";
import type { Hire } from "./hires";
import { pingBen } from "./pushclient";
import { loadAll, saveDiff } from "./live";

export type Viewer = { kind: "advisor" } | { kind: "client"; clientId: string; person: Person };
export type { State };

interface Store extends State {
  ready: boolean;
  live: boolean;
  viewer: Viewer | null;
  who: string;
  /** Live mode: signed in but not on any client's team yet. */
  noAccess: string | null;
  saving: boolean;
  saveError: string | null;
  setViewer: (v: Viewer | null) => void;
  setRules: (r: Rules) => void;
  update: (id: string, patch: Partial<Action>, log: string) => void;
  patch: (p: Partial<State>) => void;
  /** Change one new hire (always against the latest state) and log it. */
  updateHire: (id: string, change: Partial<Hire> | ((h: Hire) => Partial<Hire>), log?: string) => void;
  /** Add an item to Ben's notification bell. */
  notice: (n: Omit<Notice, "id" | "at" | "read">) => void;
  getClient: (id: string) => Client | undefined;
  /** The signed-in client user's record (null for Ben). */
  me: PortalUser | null;
  reset: () => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
const KEY = "alza-portal-demo-v8";
export const PENDING_INVITE = "alza-pending-invite";

type Who = { email: string; advisor: boolean; memberships: { clientId: string; name: string; role: string; access: string }[] };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [viewer, setViewerState] = useState<Viewer | null>(null);
  const [state, setState] = useState<State>(emptyState);
  const [noAccess, setNoAccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // live-mode bookkeeping
  const synced = useRef<State | null>(null); // what the database has
  const whoRef = useRef<Who | null>(null);
  const dirtyAt = useRef(0);
  const stateRef = useRef<State | null>(null);
  const retries = useRef(0);
  stateRef.current = state;
  const savingRef = useRef(false);
  const [kick, setKick] = useState(0);

  // ------------------------------------------------ demo mode
  useEffect(() => {
    if (LIVE) return;
    let next = demoState();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        next = { ...next, ...s.state };
        setViewerState(s.viewer ?? null);
      }
    } catch {}
    setState(next);
    setReady(true);
  }, []);

  useEffect(() => {
    if (LIVE || !ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ state, viewer }));
    } catch {}
  }, [ready, state, viewer]);

  // ------------------------------------------------ live mode
  const load = useCallback(async () => {
    const db = sb();
    const w = whoRef.current;
    if (!w) return;
    const s = await loadAll(db, w.email);
    synced.current = s;
    setState(s);
  }, []);

  const boot = useCallback(async () => {
    const db = sb();
    const { data } = await db.auth.getSession();
    if (!data.session) {
      whoRef.current = null;
      synced.current = null;
      setViewerState(null);
      setState(emptyState());
      setNoAccess(null);
      setReady(true);
      return;
    }
    // finish an invite-code join that started before the email link was clicked
    try {
      const pending = localStorage.getItem(PENDING_INVITE);
      if (pending) {
        const p = JSON.parse(pending);
        await db.rpc("redeem_invite", { p_code: p.code, p_name: p.name, p_role: p.role });
        localStorage.removeItem(PENDING_INVITE);
      }
    } catch {}
    await db.rpc("mark_signed_in");
    const { data: who, error } = await db.rpc("whoami");
    if (error || !who) {
      setNoAccess(data.session.user.email ?? "");
      setReady(true);
      return;
    }
    const w = who as Who;
    whoRef.current = w;
    if (w.advisor) {
      setViewerState({ kind: "advisor" });
      setNoAccess(null);
    } else if (w.memberships.length) {
      const m = w.memberships[0];
      setViewerState({ kind: "client", clientId: m.clientId, person: { name: m.name, role: m.role, email: w.email } });
      setNoAccess(null);
    } else {
      setViewerState(null);
      setNoAccess(w.email);
    }
    if (w.advisor || w.memberships.length) {
      try {
        await load();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Couldn't load your data");
      }
    }
    setReady(true);
  }, [load]);

  useEffect(() => {
    if (!LIVE) return;
    boot();
    const { data: sub } = sb().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") boot();
    });
    return () => sub.subscription.unsubscribe();
  }, [boot]);

  // save changes shortly after they happen
  useEffect(() => {
    if (!LIVE || !ready || !synced.current || !whoRef.current) return;
    if (state === synced.current) return;
    dirtyAt.current = Date.now();
    const t = setTimeout(async () => {
      if (savingRef.current || !synced.current || !whoRef.current) return;
      savingRef.current = true;
      setSaving(true);
      const target = state;
      const errs = await saveDiff(sb(), synced.current, target, { email: whoRef.current.email, advisor: whoRef.current.advisor });
      // A dropped connection ("Load failed", "Failed to fetch"): keep the change on screen and send it again.
      // Every write is safe to resend, so parts that already landed aren't duplicated.
      const network = errs.length > 0 && errs.every((e) => /load failed|failed to fetch|networkerror|network request failed|fetch failed|timed? ?out|aborted/i.test(e));
      if (network && retries.current < 6) {
        retries.current += 1;
        savingRef.current = false;
        setSaving(false);
        setSaveError(navigator.onLine ? "Connection hiccup. Your change is safe; saving again..." : "You're offline. Your change is safe and will save when you're back online.");
        const again = () => setKick((k) => k + 1);
        if (!navigator.onLine) window.addEventListener("online", again, { once: true });
        else setTimeout(again, Math.min(15000, 1500 * retries.current));
        return;
      }
      retries.current = 0;
      synced.current = target;
      savingRef.current = false;
      setSaving(false);
      setKick((k) => k + 1); // save anything that changed while this save was running
      if (errs.length) {
        console.warn("Save problems:", errs);
        const missingTable = errs.some((e) => /does not exist|schema cache|could not find/i.test(e));
        const why = errs[0].replace(/\s+/g, " ").slice(0, 160);
        setSaveError(
          missingTable
            ? "That didn't save because a database update hasn't been run yet. Run supabase/all_updates.sql in the Supabase SQL Editor, then try again."
            : `That didn't save, so the page reloaded the last saved version. Try again; if it keeps happening, send Ben this: ${why}`
        );
        try {
          await load();
        } catch {}
      } else setSaveError(null);
    }, 500);
    return () => clearTimeout(t);
  }, [state, ready, load, kick]);

  // pick up changes made by other people / devices
  useEffect(() => {
    if (!LIVE || !ready) return;
    const tick = async () => {
      if (document.hidden || savingRef.current || Date.now() - dirtyAt.current < 4000 || !whoRef.current) return;
      const before = stateRef.current;
      if (synced.current && before !== synced.current) return; // unsaved local edits
      try {
        const s = await loadAll(sb(), whoRef.current.email);
        // Something changed on this screen while we were fetching (a logo picked, a project added):
        // keep the local change, and let it save; the next refresh catches up.
        if (stateRef.current !== before || savingRef.current) return;
        setState((cur) => {
          if (cur !== before) return cur; // changed in the last instant: keep it
          synced.current = s;
          return s;
        });
      } catch {}
    };
    const iv = setInterval(tick, 20000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(iv);
      window.removeEventListener("focus", tick);
    };
  }, [ready, load, state]);

  const setViewer = useCallback(
    (v: Viewer | null) => {
      if (LIVE && v === null) {
        sb().auth.signOut();
      }
      setViewerState(v);
    },
    []
  );

  const value = useMemo<Store>(() => {
    const who = viewer?.kind === "client" ? viewer.person.name : ADVISOR.name;
    const getClient = (id: string): Client | undefined => {
      const base = state.clients.find((c) => c.id === id);
      if (!base) return undefined;
      const cfg = state.config[id];
      if (!cfg) return base;
      const esc = cfg.users.find((u) => u.email.toLowerCase() === (cfg.escalationEmail || "").toLowerCase());
      return {
        ...base,
        accent: cfg.accent,
        logo: cfg.logo,
        contacts: cfg.users.map(({ name, role, email }) => ({ name, role, email })),
        escalation: esc ? { name: esc.name, role: esc.role, email: esc.email } : base.escalation,
      };
    };
    const me =
      viewer?.kind === "client"
        ? state.config[viewer.clientId]?.users.find((u) =>
            viewer.person.email ? u.email.toLowerCase() === viewer.person.email.toLowerCase() : u.name === viewer.person.name
          ) ?? null
        : null;
    return {
      ...state,
      live: LIVE,
      me,
      ready,
      viewer,
      who,
      noAccess,
      saving,
      saveError,
      setViewer,
      getClient,
      setRules: (rules) => setState((s) => ({ ...s, rules })),
      patch: (p) => setState((s) => ({ ...s, ...p })),
      updateHire: (id, change, log) =>
        setState((s) => ({
          ...s,
          hires: s.hires.map((h) => {
            if (h.id !== id) return h;
            const c = typeof change === "function" ? change(h) : change;
            const history = log ? [...(c.history ?? h.history ?? []), { at: new Date().toISOString(), by: who, text: log }] : c.history ?? h.history;
            return { ...h, ...c, history };
          }),
        })),
      notice: (n) => {
        if (viewer?.kind === "client") pingBen(`${state.clients.find((c) => c.id === n.clientId)?.name ?? "Client"}`, n.text, n.href || "/console", n.kind === "hire" ? "hires" : "activity");
        setState((s) => ({
          ...s,
          notices: [{ ...n, id: `x${Date.now()}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), read: false }, ...s.notices],
        }));
      },
      update: (id, patch, log) =>
        setState((s) => {
          const before = s.actions.find((a) => a.id === id);
          let notices = s.notices;
          if (before && viewer?.kind === "client" && patch.status && patch.status !== before.status) {
            const kind =
              patch.status === "completed" ? "completed" : patch.status === "extension_requested" ? "extension" : patch.status === "needs_revision" ? "revision" : patch.status === "submitted" ? "upload" : null;
            if (kind) {
              const verb = { completed: "completed", extension: "asked for more time on", revision: "requested changes on", upload: "uploaded a file to" }[kind];
              pingBen(s.clients.find((c) => c.id === before.clientId)?.name ?? "Client", `${who} ${verb} "${before.title}"`, `/c/${before.clientId}/a/${before.id}`);
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
                    completedAt: patch.status === "completed" ? new Date().toISOString() : patch.completedAt ?? a.completedAt,
                    history: [...a.history, { at: new Date().toISOString(), by: who, text: log }],
                  }
                : a
            ),
          };
        }),
      reset: () => {
        if (!LIVE) setState(demoState());
      },
      signOut: async () => {
        if (LIVE) await sb().auth.signOut();
        setViewerState(null);
      },
      refresh: async () => {
        if (LIVE) await load();
      },
    };
  }, [ready, viewer, state, noAccess, saving, saveError, setViewer, load]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {LIVE && saveError && (
        <div className="save-error" role="status">
          {saveError}
          <button className="btn ghost sm" onClick={() => setSaveError(null)}>Dismiss</button>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

export { toISO };

/** Send an email notification to Ben via the server route. Never throws. */
export async function notifyBen(subject: string, text: string): Promise<boolean> {
  try {
    const r = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ subject, text }),
    });
    const j = await r.json();
    return !!j.sent;
  } catch {
    return false;
  }
}
