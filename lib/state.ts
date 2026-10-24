import { Action, Client, CLIENTS, DEFAULT_RULES, Project, Rules, seed } from "./data";
import { Announcement, Benefit, Candidate, ClientConfig, Note, Notice, Resource, Role, SharedFile, seedModules } from "./modules";

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
    helpful: {},
    bookingUrl: DEFAULT_BOOKING_URL,
    layouts: {},
  };
}

/** Demo data (fictional), used only when Supabase is not configured. */
export function demoState(): State {
  return { ...emptyState(), clients: CLIENTS, ...seed(), ...seedModules() };
}

export function newClientConfig(): ClientConfig {
  return {
    huddle: { cadence: "weekly", day: 1, recipients: [], skipIfQuiet: true, bundleReminders: true, personalNote: "" },
    modules: { recruiting: true, resources: true, wellness: false, board: true },
    accent: "#19283c",
    escalationEmail: "",
    users: [],
    codes: [],
  };
}
