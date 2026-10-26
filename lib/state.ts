import { Action, Client, CLIENTS, DEFAULT_RULES, Project, Rules, seed } from "./data";
import { Announcement, Benefit, Candidate, ClientConfig, Note, Notice, Resource, Role, SharedFile, seedModules } from "./modules";
import { Hire } from "./hires";

export const DEFAULT_BOOKING_URL = "https://calendly.com/ben-alzapc/30min";

export interface State {
  clients: Client[]; // base info; getClient() merges in config
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
  hires: Hire[];
  helpful: Record<string, "up" | "down">;
  bookingUrl: string; // Ben's scheduling link (Calendly)
  layouts: Record<string, string[]>; // per-person dashboard tiles, key `${clientId}:${email}`
}

export function emptyState(): State {
  return {
    clients: [],
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
    hires: [],
    helpful: {},
    bookingUrl: DEFAULT_BOOKING_URL,
    layouts: {},
  };
}

/** Demo data (fictional), used only when Supabase is not configured. */
/** The public demo (demo.alzapc.com) never shows a real client: the pilot company becomes a fictional one. */
export const DEMO_SITE = process.env.NEXT_PUBLIC_DEMO_SITE === "1";

export function demoState(): State {
  const s: State = { ...emptyState(), clients: CLIENTS, ...seed(), ...seedModules() };
  if (!DEMO_SITE) return s;
  const out = JSON.parse(
    JSON.stringify(s)
      .replace(/Blueprint Studios/g, "Harborlight Events")
      .replace(/Blueprint/g, "Harborlight")
      .replace(/blueprint/g, "harborlight")
      .replace(/"\/harborlight-logo\.png"/g, "null")
  ) as State;
  const accent = "#0f766e";
  out.clients = out.clients.map((c) => (c.id === "harborlight" ? { ...c, accent, logo: undefined } : c));
  if (out.config.harborlight) out.config.harborlight = { ...out.config.harborlight, accent, logo: undefined };
  return out;
}

export function newClientConfig(): ClientConfig {
  return {
    huddle: { cadence: "weekly", day: 1, recipients: [], skipIfQuiet: true, bundleReminders: true, personalNote: "" },
    modules: { recruiting: true, resources: true, wellness: false, board: true, hires: true },
    accent: "#19283c",
    escalationEmail: "",
    users: [],
    codes: [],
  };
}
