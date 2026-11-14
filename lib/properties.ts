// Our Properties: a card per property showing who leads it and who handles what.
// Cards fill themselves from the team roster (the census upload): each person's Location is their
// property, and their title says what they handle. Ben or an executive can override any slot.
// Pure functions, used in the browser (demo, previews) and on the server (live directory).
import type { TeamMember } from "./team";

export type RoleKey = "lead" | "backup" | "leasing" | "maint" | "facil" | "acct";
export const ROLES: { key: RoleKey; label: string; match: RegExp; not?: RegExp }[] = [
  { key: "lead", label: "Property lead", match: /\b(property|community|general|site|building|resident) manager\b|^manager$/i, not: /assistant|regional|area|district|portfolio/i },
  { key: "backup", label: "If the lead is out", match: /assistant (property|community|general|site|building) manager|\b(regional|area|district|portfolio) manager\b/i },
  { key: "leasing", label: "Leasing", match: /leasing|lease up|marketing (agent|consultant)/i },
  { key: "maint", label: "Maintenance", match: /maintenance|technician|\btech\b|porter|janitor|custodian|handy/i },
  { key: "facil", label: "Facilities", match: /facilit|engineer|superintendent|building operations|chief of operations/i },
  { key: "acct", label: "Accounting", match: /account|bookkeep|controller|finance|payable|receivable/i },
];
export const roleLabel = (k: RoleKey) => ROLES.find((r) => r.key === k)?.label ?? k;

export type PropStatus = "Active" | "Acquisition" | "Transition" | "Inactive";
export const STATUSES: PropStatus[] = ["Active", "Transition", "Acquisition", "Inactive"];

export interface PropItem {
  key: string; // lowercased name; matches the roster's Location
  name: string;
  status?: PropStatus;
  city?: string; // one of CITIES, for the map
  address?: string; // street address; also sets the map area when it names a city
  note?: string;
  /** person id to force a slot, "" to leave it empty on purpose; missing = filled from the roster */
  roles?: Partial<Record<RoleKey, string>>;
  manual?: boolean; // added by hand rather than found on the roster
  /** a photo for the card: a stored file path (live), or a small data URL (demo only) */
  photo?: string;
}
export interface Contact {
  name: string;
  title: string;
  email: string;
  what: string; // what to come to them for
}
export interface PropertySettings {
  items?: PropItem[];
  /** roster locations that aren't properties (a corporate office, "Remote") */
  hidden?: string[];
  /** the roster location that is headquarters: shown on its own above the properties. "" = none */
  hq?: string;
  contacts?: Contact[];
}

export interface CardPerson {
  id: string;
  name: string;
  title: string;
  email?: string;
}
export interface CardSlot {
  role: RoleKey;
  label: string;
  person: CardPerson | null;
  auto: boolean; // filled from the roster, not set by hand
}
export interface PropertyCard {
  key: string;
  name: string;
  status: PropStatus;
  city?: string;
  address?: string;
  note?: string;
  slots: CardSlot[];
  headcount: number;
  manual?: boolean;
  photo?: string; // path or data URL here; the server swaps paths for short-lived links
}

export const keyOf = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const CORPORATE = /corporate|head ?office|\bhq\b|headquarters|remote|all properties|company[- ]wide|portfolio|home office/i;
/** A roster Location can name more than one property: "Harbor View; The Alder". */
export const locationsOf = (loc?: string) => (loc || "").split(/[;|]/).map((x) => x.trim()).filter(Boolean);

const person = (p: TeamMember): CardPerson => ({ id: p.id, name: p.name, title: p.title, email: p.email });

/** Every property: the ones set up by hand plus every roster Location that isn't hidden or corporate. */
export function propertyCards(people: TeamMember[], s: PropertySettings | undefined, clientId: string): PropertyCard[] {
  const team = people.filter((p) => p.clientId === clientId && p.active !== false);
  const hidden = new Set((s?.hidden ?? []).map(keyOf));
  const hqK = hqKey(people, s, clientId);
  const items = new Map<string, PropItem>();
  for (const it of s?.items ?? []) items.set(it.key, it);
  const byKey = new Map<string, TeamMember[]>();
  const names = new Map<string, string>();
  const corporate: TeamMember[] = [];
  for (const p of team) {
    const locs = locationsOf(p.location);
    if (!locs.length) corporate.push(p);
    for (const l of locs) {
      const k = keyOf(l);
      if (hidden.has(k) || CORPORATE.test(l) || k === hqK) {
        corporate.push(p);
        continue;
      }
      if (!names.has(k)) names.set(k, l);
      byKey.set(k, [...(byKey.get(k) ?? []), p]);
    }
  }
  const keys = new Set<string>([...byKey.keys(), ...[...items.values()].filter((i) => i.manual).map((i) => i.key)]);
  const all = new Map(team.map((p) => [p.id, p]));
  const cards: PropertyCard[] = [];
  for (const k of keys) {
    if (hidden.has(k)) continue;
    const it = items.get(k);
    const here = byKey.get(k) ?? [];
    const taken = new Set<string>();
    const pick = (pool: TeamMember[], r: (typeof ROLES)[number]) => pool.find((p) => !taken.has(p.id) && r.match.test(p.title || "") && !(r.not && r.not.test(p.title || "")));
    const slots: CardSlot[] = ROLES.map((r) => {
      const forced = it?.roles?.[r.key];
      if (forced !== undefined) {
        const p = forced ? all.get(forced) : undefined;
        if (p) taken.add(p.id);
        return { role: r.key, label: r.label, person: p ? person(p) : null, auto: false };
      }
      return { role: r.key, label: r.label, person: null, auto: true };
    });
    // fill the rest from the people at this property, then company-wide people with the right title
    for (const slot of slots) {
      if (!slot.auto) continue;
      const r = ROLES.find((x) => x.key === slot.role)!;
      let p = pick(here, r);
      if (!p && slot.role !== "lead") p = pick(corporate, r);
      if (!p && slot.role === "backup") {
        // nobody titled for it: the lead's own manager covers
        const lead = slots.find((x) => x.role === "lead")?.person;
        const lp = lead ? all.get(lead.id) : undefined;
        p = lp?.managerEmail ? team.find((x) => (x.email || "").toLowerCase() === lp.managerEmail) : undefined;
      }
      if (p) {
        taken.add(p.id);
        slot.person = person(p);
      }
    }
    cards.push({ key: k, name: it?.name || names.get(k) || k, status: it?.status ?? "Active", city: it?.city ?? cityIn(it?.address || "") ?? cityIn(names.get(k) || it?.name || ""), address: it?.address, note: it?.note, slots, headcount: here.length, manual: it?.manual, photo: it?.photo });
  }
  const order: Record<PropStatus, number> = { Active: 0, Transition: 1, Acquisition: 2, Inactive: 3 };
  return cards.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
}

/** Which roster location is headquarters: the one chosen, else the first that sounds like one ("Corporate", "HQ"). */
export function hqKey(people: TeamMember[], s: PropertySettings | undefined, clientId: string): string {
  if (s?.hq !== undefined) return s.hq;
  const hit = rosterLocations(people, clientId).find((l) => /corporate|head ?office|\bhq\b|headquarters|home office/i.test(l.name));
  return hit?.key ?? "";
}

export interface HqCard {
  key: string;
  name: string;
  address?: string;
  note?: string;
  city?: string;
  people: CardPerson[];
}
const RANK: [RegExp, number][] = [
  [/\b(ceo|chief executive|founder|owner|president|managing (principal|partner|director)|principal)\b/i, 0],
  [/\b(chief|coo|cfo|cto|cmo|evp|svp)\b/i, 1],
  [/\b(vp|vice president|head of)\b/i, 2],
  [/\bdirector\b/i, 3],
  [/\b(manager|controller|lead)\b/i, 4],
];
const rank = (t: string) => RANK.find(([re]) => re.test(t))?.[1] ?? 5;

/** The people at headquarters, most senior first. */
export function hqCard(people: TeamMember[], s: PropertySettings | undefined, clientId: string): HqCard | null {
  const k = hqKey(people, s, clientId);
  if (!k) return null;
  const here = people.filter((p) => p.clientId === clientId && p.active !== false && locationsOf(p.location).some((l) => keyOf(l) === k));
  const it = s?.items?.find((i) => i.key === k);
  const name = it?.name || rosterLocations(people, clientId).find((l) => l.key === k)?.name || "Headquarters";
  return {
    key: k,
    name,
    address: it?.address,
    note: it?.note,
    city: it?.city ?? cityIn(it?.address || ""),
    people: here.sort((a, b) => rank(a.title || "") - rank(b.title || "") || a.name.localeCompare(b.name)).map(person),
  };
}

/** Locations on the roster that could be properties, for the Manage list (including hidden ones). */
export function rosterLocations(people: TeamMember[], clientId: string) {
  const seen = new Map<string, { name: string; count: number }>();
  for (const p of people.filter((x) => x.clientId === clientId && x.active !== false))
    for (const l of locationsOf(p.location)) {
      const k = keyOf(l);
      const v = seen.get(k) ?? { name: l, count: 0 };
      v.count++;
      seen.set(k, v);
    }
  return [...seen.entries()].map(([key, v]) => ({ key, ...v, corporate: CORPORATE.test(v.name) })).sort((a, b) => a.name.localeCompare(b.name));
}

export const PHOTO_PATH = /^properties\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.jpg$/;
/** allowData: the demo keeps photos in this browser as small data URLs; the live server never accepts them. */
export function cleanSettings(v: unknown, opts: { allowData?: boolean } = {}): PropertySettings {
  const s = (v ?? {}) as PropertySettings;
  const str = (x: unknown, n: number) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const items: PropItem[] = [];
  const seen = new Set<string>();
  for (const it of Array.isArray(s.items) ? s.items.slice(0, 300) : []) {
    const name = str(it?.name, 80);
    const key = keyOf(str(it?.key, 80) || name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const roles: Partial<Record<RoleKey, string>> = {};
    for (const r of ROLES) {
      const v = it?.roles?.[r.key];
      if (typeof v === "string") roles[r.key] = v.slice(0, 64);
    }
    items.push({
      key,
      name: name || key,
      status: STATUSES.includes(it?.status as PropStatus) ? (it.status as PropStatus) : undefined,
      city: CITIES.some((c) => c.name === it?.city) ? it.city : undefined,
      address: str(it?.address, 200) || undefined,
      note: str(it?.note, 400) || undefined,
      roles: Object.keys(roles).length ? roles : undefined,
      manual: !!it?.manual || undefined,
      photo: typeof it?.photo === "string" && (PHOTO_PATH.test(it.photo) || (opts.allowData && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(it.photo) && it.photo.length < 400_000)) ? it.photo : undefined,
    });
  }
  const hidden = [...new Set((Array.isArray(s.hidden) ? s.hidden : []).map((h) => keyOf(str(h, 80))).filter(Boolean))].slice(0, 100);
  const hq = typeof s.hq === "string" ? keyOf(str(s.hq, 80)) : undefined;
  const contacts = (Array.isArray(s.contacts) ? s.contacts : [])
    .slice(0, 4)
    .map((c) => ({ name: str(c?.name, 60), title: str(c?.title, 60), email: str(c?.email, 120).toLowerCase(), what: str(c?.what, 100) }))
    .filter((c) => c.name);
  return { items, hidden, contacts, ...(hq !== undefined ? { hq } : {}) };
}

// ---------------------------------------------------------------- map

/** Bay Area places a property can sit in, for the map pin. */
export const CITIES: { name: string; lat: number; lon: number }[] = [
  { name: "San Francisco · Marina", lat: 37.802, lon: -122.437 },
  { name: "San Francisco · Pacific Heights", lat: 37.792, lon: -122.435 },
  { name: "San Francisco · North Beach", lat: 37.801, lon: -122.41 },
  { name: "San Francisco · Financial District", lat: 37.794, lon: -122.4 },
  { name: "San Francisco · Nob Hill", lat: 37.793, lon: -122.416 },
  { name: "San Francisco · Hayes Valley", lat: 37.776, lon: -122.425 },
  { name: "San Francisco · SoMa", lat: 37.778, lon: -122.405 },
  { name: "San Francisco · Mission Bay", lat: 37.77, lon: -122.391 },
  { name: "San Francisco · Mission", lat: 37.76, lon: -122.415 },
  { name: "San Francisco · Dogpatch", lat: 37.758, lon: -122.389 },
  { name: "San Francisco · Richmond District", lat: 37.78, lon: -122.48 },
  { name: "San Francisco · Sunset", lat: 37.753, lon: -122.485 },
  { name: "San Francisco · Bayview", lat: 37.73, lon: -122.39 },
  { name: "San Francisco · Excelsior", lat: 37.724, lon: -122.428 },
  { name: "San Francisco", lat: 37.775, lon: -122.418 },
  { name: "Daly City", lat: 37.688, lon: -122.47 },
  { name: "South San Francisco", lat: 37.655, lon: -122.41 },
  { name: "San Bruno", lat: 37.63, lon: -122.415 },
  { name: "Pacifica", lat: 37.613, lon: -122.487 },
  { name: "Millbrae", lat: 37.599, lon: -122.387 },
  { name: "Burlingame", lat: 37.584, lon: -122.366 },
  { name: "San Mateo", lat: 37.563, lon: -122.322 },
  { name: "Foster City", lat: 37.559, lon: -122.27 },
  { name: "Belmont", lat: 37.52, lon: -122.276 },
  { name: "San Carlos", lat: 37.507, lon: -122.26 },
  { name: "Redwood City", lat: 37.485, lon: -122.236 },
  { name: "Menlo Park", lat: 37.453, lon: -122.182 },
  { name: "Palo Alto", lat: 37.442, lon: -122.143 },
  { name: "Mountain View", lat: 37.386, lon: -122.084 },
  { name: "Sunnyvale", lat: 37.369, lon: -122.036 },
  { name: "Santa Clara", lat: 37.354, lon: -121.955 },
  { name: "San Jose", lat: 37.338, lon: -121.886 },
  { name: "Half Moon Bay", lat: 37.464, lon: -122.428 },
  { name: "Sausalito", lat: 37.859, lon: -122.485 },
  { name: "Mill Valley", lat: 37.906, lon: -122.545 },
  { name: "Tiburon", lat: 37.873, lon: -122.457 },
  { name: "Larkspur", lat: 37.934, lon: -122.535 },
  { name: "San Rafael", lat: 37.974, lon: -122.531 },
  { name: "Novato", lat: 38.107, lon: -122.57 },
  { name: "Richmond", lat: 37.936, lon: -122.348 },
  { name: "El Cerrito", lat: 37.916, lon: -122.31 },
  { name: "Berkeley", lat: 37.872, lon: -122.273 },
  { name: "Emeryville", lat: 37.831, lon: -122.285 },
  { name: "Oakland", lat: 37.812, lon: -122.268 },
  { name: "Oakland · Lake Merritt", lat: 37.808, lon: -122.258 },
  { name: "Oakland · Fruitvale", lat: 37.775, lon: -122.224 },
  { name: "Alameda", lat: 37.765, lon: -122.242 },
  { name: "San Leandro", lat: 37.725, lon: -122.156 },
  { name: "Hayward", lat: 37.669, lon: -122.081 },
  { name: "Union City", lat: 37.593, lon: -122.044 },
  { name: "Fremont", lat: 37.548, lon: -121.989 },
  { name: "Walnut Creek", lat: 37.91, lon: -122.065 },
  { name: "Concord", lat: 37.978, lon: -122.031 },
  { name: "Lafayette", lat: 37.886, lon: -122.118 },
  { name: "Orinda", lat: 37.877, lon: -122.18 },
  { name: "Dublin", lat: 37.702, lon: -121.936 },
  { name: "Pleasanton", lat: 37.662, lon: -121.875 },
  { name: "Vallejo", lat: 38.104, lon: -122.257 },
];

/** Guess a city from a property's name or location ("Harbor View, Oakland"). Longest match wins. */
export function cityIn(text: string): string | undefined {
  const t = text.toLowerCase();
  const hit = CITIES.filter((c) => t.includes(c.name.split(" · ").pop()!.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
  return hit?.name;
}

/** Map coordinates (the map's own units) for a place. */
export function project(lat: number, lon: number) {
  return { x: (lon + 122.8) * 456.5, y: (38.15 - lat) * 577.8 };
}
export function pinFor(city?: string) {
  const c = CITIES.find((x) => x.name === city);
  return c ? project(c.lat, c.lon) : null;
}
