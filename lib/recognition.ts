// Shoutouts: one recognition engine with three ways in (QR code form, text message, the portal),
// and email / text to let people know. Turning off texts never turns off recognition.

export type ShoutChannel = "qr" | "sms" | "portal" | "email";
export type ShoutStatus = "live" | "held" | "removed";

export interface Shoutout {
  id: string;
  clientId: string;
  to: { personId: string; name: string; department?: string; location?: string };
  from: { name: string; personId?: string; email?: string; verified: boolean }; // verified = signed in, or texted from a number on the roster
  value?: string;
  message: string;
  channel: ShoutChannel;
  status: ShoutStatus;
  heldReason?: string; // why it's waiting for review
  reviewedBy?: string;
  reports?: number;
  at: string;
  lang?: "en" | "es";
}

export interface RecognitionSettings {
  token: string; // the QR code / wall link: /shout/<token>
  values: string[]; // the company's values; every shoutout can be tied to one
  smsNumber?: string; // the company's texting number (+1...), once the texting provider is set up
  notifyManagers?: boolean; // email the person's manager when they get one (default on)
  showWall?: boolean; // the wall and scoreboard on the QR page (default on)
  celebrate?: boolean; // the Celebrate tab: birthdays, work anniversaries, new people (default on; each person can opt out)
  sender?: { name?: string; box?: string }; // emails to employees come from "<name> <box@domain>", e.g. "Blueprint Studios Celebrations <celebrations@alzapc.com>"
  autoEmail?: { birthday?: boolean; anniversary?: boolean }; // email people on the day (off until turned on)
  templates?: Partial<Record<CelebrateKind, CelebrateTemplate>>;
}

export type CelebrateKind = "birthday" | "anniversary";
export type CelebrateTemplate = { subject: string; body: string; headline?: string; quote?: string; signoff?: string; funFact?: boolean };
export const CELEBRATE_FILL_INS = ["{first name}", "{company}", "{years}", "{year/years}", "{manager}"] as const;
export const DEFAULT_CELEBRATE_TEMPLATES: Record<CelebrateKind, CelebrateTemplate> = {
  birthday: {
    subject: "Happy birthday, {first name}! 🎂",
    headline: "Wishing you a wonderful birthday, {first name}!",
    body: "Today is all about you! Thank you for everything you bring to {company}. Your energy, creativity, and dedication make this team what it is. Hope your day is as amazing as you are!",
    funFact: true,
  },
  anniversary: {
    subject: "{first name}, thank you for {years} incredible {year/years}! 🎉",
    headline: "{first name}, thank you for {years} incredible {year/years}!",
    body: "Today marks a meaningful milestone in your journey with {company}. Your commitment, creativity, and hard work have left a real mark on this team and everything we build together. We're genuinely grateful you're part of the {company} family.",
    quote: "{years} {year/years} of showing up, delivering, and raising the bar. That's something worth celebrating, today and every day.",
    signoff: "{company} Leadership",
    funFact: true,
  },
};
export const templateFor = (rec: RecognitionSettings | undefined, k: CelebrateKind): CelebrateTemplate => ({ ...DEFAULT_CELEBRATE_TEMPLATES[k], ...(rec?.templates?.[k] ?? {}) });
export function fillCelebrate(text: string, v: { first: string; company: string; years?: number; manager?: string }) {
  return text
    .replace(/\{first name\}/gi, v.first)
    .replace(/\{company\}/gi, v.company)
    .replace(/\{years\}/gi, String(v.years ?? ""))
    .replace(/\{year\/years\}/gi, v.years === 1 ? "year" : "years")
    .replace(/\{manager\}/gi, v.manager || "your manager");
}
/** Who employee emails come from. */
export function celebrateSender(rec: RecognitionSettings | undefined, company: string) {
  const box = (rec?.sender?.box || "celebrations").toLowerCase().replace(/[^a-z0-9._-]/g, "") || "celebrations";
  return { fromName: (rec?.sender?.name || `${company} Celebrations`).slice(0, 60), fromBox: box };
}

export type Celebration = { personId: string; name: string; team: string; kind: "birthday" | "anniversary" | "new"; days: number; when: string; years?: number };

/** Birthdays, work anniversaries and new starters in the next two weeks, for people who haven't opted out. */
export function celebrations(people: { id: string; name: string; department?: string; location?: string; birthday?: string; hireDate?: string; celebrate?: boolean; active?: boolean }[], from = new Date(), within = 14): Celebration[] {
  const day0 = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const next = (mmdd: string) => {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(mmdd);
    if (!m) return null;
    let d = new Date(day0.getFullYear(), +m[1] - 1, +m[2]);
    if (d < day0) d = new Date(day0.getFullYear() + 1, +m[1] - 1, +m[2]);
    return d;
  };
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const out: Celebration[] = [];
  for (const p of people) {
    if (p.active === false || p.celebrate === false) continue;
    const base = { personId: p.id, name: shortName(p.name), team: p.department || p.location || "" };
    if (p.birthday) {
      const d = next(p.birthday);
      if (d) {
        const days = Math.round((d.getTime() - day0.getTime()) / 864e5);
        if (days <= within) out.push({ ...base, kind: "birthday", days, when: fmt(d) });
      }
    }
    if (p.hireDate) {
      const [y, mo, da] = p.hireDate.slice(0, 10).split("-").map(Number);
      const start = new Date(y, mo - 1, da);
      const sd = Math.round((start.getTime() - day0.getTime()) / 864e5);
      if (sd >= -7 && sd <= within) out.push({ ...base, kind: "new", days: sd, when: fmt(start) });
      else {
        const d = next(`${mo}-${da}`);
        if (d) {
          const days = Math.round((d.getTime() - day0.getTime()) / 864e5);
          const years = d.getFullYear() - y;
          if (years >= 1 && days <= within) out.push({ ...base, kind: "anniversary", days, when: fmt(d), years });
        }
      }
    }
  }
  return out.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

export function celebrateLine(c: Celebration, lang: "en" | "es" = "en") {
  const first = c.name.split(" ")[0];
  if (lang === "es") return c.kind === "birthday" ? `¡Feliz cumpleaños, ${first}! 🎂 ` : c.kind === "anniversary" ? `¡Felices ${c.years} ${c.years === 1 ? "año" : "años"} con el equipo, ${first}! 🎉 ` : `¡Bienvenido al equipo, ${first}! 👋 `;
  return c.kind === "birthday" ? `Happy birthday, ${first}! 🎂 ` : c.kind === "anniversary" ? `Happy ${c.years}-year work anniversary, ${first}! 🎉 ` : `Welcome to the team, ${first}! 👋 `;
}

export const DEFAULT_VALUES = ["Teamwork", "Safety first", "Above and beyond", "Customer first", "Ownership"];
export const REACTIONS = ["👏", "❤️", "🔥", "🙌"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const MAX_MESSAGE = 280;

export function newRecognition(values = DEFAULT_VALUES): RecognitionSettings {
  return { token: randomToken(22), values, notifyManagers: true, showWall: true };
}
export function randomToken(n: number) {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => abc[b % abc.length]).join("");
}

/** "Maria Lopez" -> "Maria L." Used anywhere outside the signed-in portal. */
export const shortName = (n: string) => {
  const p = n.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] ?? "";
};

/** Starter lines so people write specific, positive recognition (and fewer one-word ones). */
export const STARTERS = {
  en: ["Thank you for…", "You made a difference when you…", "I noticed how you…", "Our team is better because you…"],
  es: ["Gracias por…", "Hiciste la diferencia cuando…", "Me di cuenta de cómo…", "Nuestro equipo es mejor porque…"],
};

export type Board = {
  total: number;
  people: number; // different people recognized
  givers: number;
  byValue: { value: string; n: number }[];
  byTeam: { team: string; n: number }[];
  topGivers: { name: string; n: number }[];
  streakWeeks: number; // weeks in a row with at least one shoutout
};

/** The scoreboard. It celebrates giving and the values, not who is most popular. */
export function scoreboard(list: Shoutout[], values: string[], since: Date): Board {
  const live = list.filter((s) => s.status === "live");
  const recent = live.filter((s) => new Date(s.at) >= since);
  const count = <K extends string>(xs: (K | undefined)[]) => {
    const m = new Map<K, number>();
    for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const v = count(recent.map((s) => s.value));
  const t = count(recent.map((s) => s.to.department || s.to.location || undefined));
  const g = count(recent.map((s) => (s.from.verified ? shortName(s.from.name) : undefined)));
  // weeks in a row (counting back from this week) with at least one shoutout
  const wk = (d: Date) => Math.floor((d.getTime() - new Date("2024-01-01T00:00:00").getTime()) / (7 * 864e5));
  const weeks = new Set(live.map((s) => wk(new Date(s.at))));
  let streak = 0;
  for (let w = wk(new Date()); weeks.has(w); w--) streak++;
  return {
    total: recent.length,
    people: new Set(recent.map((s) => s.to.personId)).size,
    givers: new Set(recent.map((s) => s.from.personId || s.from.name)).size,
    byValue: [...values.map((value) => ({ value, n: v.get(value) ?? 0 }))].sort((a, b) => b.n - a.n),
    byTeam: [...t.entries()].map(([team, n]) => ({ team, n })).sort((a, b) => b.n - a.n).slice(0, 6),
    topGivers: [...g.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 5),
    streakWeeks: streak,
  };
}

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
