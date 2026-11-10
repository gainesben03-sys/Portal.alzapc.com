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
