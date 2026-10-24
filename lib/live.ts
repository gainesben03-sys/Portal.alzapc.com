"use client";

// Loading from and saving to Supabase.
// The app keeps working with one in-memory state object; this file translates
// between that object and the database tables, and saves only what changed.

import { SupabaseClient } from "@supabase/supabase-js";
import { Client, DEFAULT_RULES } from "./data";
import { ClientConfig, InviteCode, PortalUser } from "./modules";
import { DEFAULT_BOOKING_URL, emptyState, State } from "./state";

type Row = { id: string; client_id?: string; data: Record<string, unknown> };
const ENTITY = ["actions", "projects", "notes", "files", "notices", "roles", "candidates"] as const;
const GLOBAL = ["resources", "benefits", "announcements"] as const;
type EntityKey = (typeof ENTITY)[number];
type GlobalKey = (typeof GLOBAL)[number];

const strip = <T extends object>(o: T, keys: string[]) => {
  const c = { ...(o as Record<string, unknown>) };
  keys.forEach((k) => delete c[k]);
  return c;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- load

export async function loadAll(db: SupabaseClient, email: string): Promise<State> {
  const s = emptyState();
  const pick = async <T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> => {
    const r = await p;
    if (r.error) throw r.error;
    return (r.data ?? []) as T;
  };

  const [clients, members, codes, settings, prefs, ...rest] = await Promise.all([
    pick<{ id: string; name: string; engagement: string; pilot: boolean; config: Partial<ClientConfig> & { escalation?: unknown } }[]>(db.from("clients").select("*").order("created_at")),
    pick<{ client_id: string; email: string; name: string; role: string; access: PortalUser["access"]; huddle: boolean; invited: boolean; added_by: string | null }[]>(db.from("members").select("*").order("created_at")),
    pick<{ code: string; client_id: string; access: PortalUser["access"]; expires: string; created_by: string; used_by: string | null }[]>(db.from("invite_codes").select("*")),
    pick<{ key: string; data: { rules?: State["rules"]; bookingUrl?: string } }[]>(db.from("app_settings").select("*")),
    pick<{ email: string; data: { layouts?: State["layouts"]; helpful?: State["helpful"] } }[]>(db.from("user_prefs").select("*").eq("email", email)),
    ...ENTITY.map((t) => pick<Row[]>(db.from(t).select("id, client_id, data").order("created_at"))),
    ...GLOBAL.map((t) => pick<Row[]>(db.from(t).select("id, data"))),
  ]);

  for (const c of clients) {
    const cfg = c.config ?? {};
    const users: PortalUser[] = members
      .filter((m) => m.client_id === c.id)
      .map((m) => ({ name: m.name, role: m.role, email: m.email, access: m.access, invited: m.invited, addedBy: m.added_by ?? undefined }));
    const cc: InviteCode[] = codes
      .filter((x) => x.client_id === c.id)
      .map((x) => ({ code: x.code, access: x.access, expires: x.expires, createdBy: x.created_by, usedBy: x.used_by ?? undefined }));
    const huddle = {
      cadence: "weekly" as const,
      day: 1,
      skipIfQuiet: true,
      bundleReminders: true,
      personalNote: "",
      ...(cfg.huddle ?? {}),
      recipients: members.filter((m) => m.client_id === c.id && m.huddle).map((m) => m.email),
    };
    s.config[c.id] = {
      modules: { recruiting: true, resources: true, wellness: false, board: true },
      accent: "#19283c",
      escalationEmail: "",
      ...cfg,
      huddle,
      users,
      codes: cc,
    } as ClientConfig;
    const base: Client = {
      id: c.id,
      name: c.name,
      engagement: c.engagement,
      pilot: c.pilot,
      accent: s.config[c.id].accent,
      logo: s.config[c.id].logo,
      escalation: { name: "", role: "" },
      contacts: [],
    };
    s.clients.push(base);
  }

  const ent = rest.slice(0, ENTITY.length) as Row[][];
  ENTITY.forEach((t, i) => {
    (s[t] as unknown[]) = ent[i].map((r) => ({ ...r.data, id: r.id, ...(t === "candidates" ? {} : { clientId: r.client_id }) }));
  });
  const glob = rest.slice(ENTITY.length) as Row[][];
  GLOBAL.forEach((t, i) => {
    (s[t] as unknown[]) = glob[i].map((r) => ({ ...r.data, id: r.id }));
  });

  const g = settings.find((x) => x.key === "global")?.data ?? {};
  s.rules = { ...DEFAULT_RULES, ...(g.rules ?? {}) };
  s.bookingUrl = g.bookingUrl || DEFAULT_BOOKING_URL;
  const p = prefs[0]?.data ?? {};
  s.layouts = p.layouts ?? {};
  s.helpful = p.helpful ?? {};
  return s;
}

// ---------------------------------------------------------------- save

/** Write the differences between `prev` and `next`. Returns the number of failed writes. */
export async function saveDiff(db: SupabaseClient, prev: State, next: State, me: { email: string; advisor: boolean }): Promise<string[]> {
  type Op = PromiseLike<{ error: { message: string } | null }>;
  const first: Op[] = []; // client rows must exist before anything that points at them
  const ops: Op[] = [];
  const run = (p: Op) => ops.push(p);
  const runFirst = (p: Op) => first.push(p);

  // Clients (base info + config without people)
  const cfgPart = (c: ClientConfig) => {
    const x = strip(c, ["users", "codes"]) as Record<string, unknown>;
    x.huddle = strip(c.huddle, ["recipients"]);
    return x;
  };
  if (me.advisor) {
    for (const c of next.clients) {
      const before = prev.clients.find((x) => x.id === c.id);
      const cfg = next.config[c.id];
      if (!cfg) continue;
      if (!before) {
        runFirst(db.from("clients").insert({ id: c.id, name: c.name, engagement: c.engagement, pilot: c.pilot, config: cfgPart(cfg) }));
        continue;
      }
      const prevCfg = prev.config[c.id];
      if (before.name !== c.name || before.engagement !== c.engagement || before.pilot !== c.pilot || !prevCfg || !same(cfgPart(prevCfg), cfgPart(cfg))) {
        run(db.from("clients").update({ name: c.name, engagement: c.engagement, pilot: c.pilot, config: cfgPart(cfg) }).eq("id", c.id));
      }
    }
    for (const c of prev.clients) if (!next.clients.some((x) => x.id === c.id)) run(db.from("clients").delete().eq("id", c.id));
  }

  // Members, Huddle opt-in, invite codes
  for (const cid of Object.keys(next.config)) {
    const a = prev.config[cid];
    const b = next.config[cid];
    if (!b) continue;
    const au = a?.users ?? [];
    const recA = new Set(a?.huddle.recipients ?? []);
    const recB = new Set(b.huddle.recipients);
    for (const u of b.users) {
      const old = au.find((x) => x.email.toLowerCase() === u.email.toLowerCase());
      if (!old) {
        run(db.from("members").insert({ client_id: cid, email: u.email, name: u.name, role: u.role, access: u.access, invited: true, added_by: u.addedBy ?? null, huddle: recB.size === 0 || recB.has(u.email) }));
      } else {
        const patch: Record<string, unknown> = {};
        if (old.access !== u.access) patch.access = u.access;
        if (old.name !== u.name) patch.name = u.name;
        if (old.role !== u.role) patch.role = u.role;
        if (recA.has(u.email) !== recB.has(u.email)) patch.huddle = recB.has(u.email);
        if (Object.keys(patch).length) run(db.from("members").update(patch).eq("client_id", cid).eq("email", u.email.toLowerCase()));
      }
    }
    for (const u of au) if (!b.users.some((x) => x.email.toLowerCase() === u.email.toLowerCase())) run(db.from("members").delete().eq("client_id", cid).eq("email", u.email.toLowerCase()));
    const ac = a?.codes ?? [];
    for (const k of b.codes) if (!ac.some((x) => x.code === k.code)) run(db.from("invite_codes").insert({ code: k.code, client_id: cid, access: k.access, expires: k.expires }));
    for (const k of ac) if (!b.codes.some((x) => x.code === k.code)) run(db.from("invite_codes").delete().eq("code", k.code));
  }

  // Client-scoped items
  const roleClient = (roleId: string) => next.roles.find((r) => r.id === roleId)?.clientId ?? prev.roles.find((r) => r.id === roleId)?.clientId;
  for (const t of ENTITY) {
    const A = prev[t] as unknown as { id: string; clientId?: string; roleId?: string }[];
    const B = next[t] as unknown as { id: string; clientId?: string; roleId?: string }[];
    const amap = new Map(A.map((x) => [x.id, x]));
    for (const item of B) {
      const old = amap.get(item.id);
      if (old && same(old, item)) continue;
      const client_id = t === "candidates" ? roleClient(item.roleId ?? "") : item.clientId;
      if (!client_id) continue;
      const data = strip(item, ["id"]);
      if (!old) run(db.from(t).insert({ id: item.id, client_id, data }));
      else run(db.from(t).update({ data }).eq("id", item.id));
    }
    if (me.advisor) for (const item of A) if (!B.some((x) => x.id === item.id)) run(db.from(t).delete().eq("id", item.id));
  }

  // Ben's global content
  if (me.advisor) {
    for (const t of GLOBAL) {
      const A = prev[t] as unknown as { id: string }[];
      const B = next[t] as unknown as { id: string }[];
      for (const item of B) {
        const old = A.find((x) => x.id === item.id);
        if (old && same(old, item)) continue;
        run(db.from(t).upsert({ id: item.id, data: strip(item, ["id"]) }));
      }
      for (const item of A) if (!B.some((x) => x.id === item.id)) run(db.from(t).delete().eq("id", item.id));
    }
    if (!same(prev.rules, next.rules) || prev.bookingUrl !== next.bookingUrl) {
      run(db.from("app_settings").upsert({ key: "global", data: { rules: next.rules, bookingUrl: next.bookingUrl } }));
    }
  }

  // My own preferences
  if (!same(prev.layouts, next.layouts) || !same(prev.helpful, next.helpful)) {
    run(db.from("user_prefs").upsert({ email: me.email, data: { layouts: next.layouts, helpful: next.helpful } }));
  }

  const r1 = await Promise.all(first);
  const results = [...r1, ...(await Promise.all(ops))];
  return results.filter((r) => r.error).map((r) => r.error!.message);
}
