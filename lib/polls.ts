// This or That: a one-tap poll on the Team Wall. A new one every two weeks.
// The company's own questions go first; when they run out, a seasonal one from the library.
// Counts only: nobody sees who picked what. One vote per person (per phone on the QR page).

export type PollQ = { id: string; q: string; a: string; b: string };
export type PollSettings = { on?: boolean; custom?: PollQ[]; library?: boolean };
export type PollView = { id: string; q: string; a: string; b: string; votes: { a: number; b: number }; mine?: "a" | "b"; ends: string; last?: { q: string; a: string; b: string; pa: number; pb: number } };

/** Seasonal ones by month (1-12), plus any-time ones. Fun, light, and nothing touchy. */
export const LIBRARY: (PollQ & { months?: number[] })[] = [
  { id: "l-resolutions", q: "New Year's resolutions?", a: "All in", b: "Not for me", months: [1] },
  { id: "l-snowday", q: "Snow day plan?", a: "Build a snowman", b: "Blanket and a movie", months: [1, 2] },
  { id: "l-chocolate", q: "Valentine's treat?", a: "Chocolate", b: "Candy hearts", months: [2] },
  { id: "l-springclean", q: "Spring cleaning?", a: "Love it", b: "Dread it", months: [3, 4] },
  { id: "l-rain", q: "Rainy day gear?", a: "Rain boots", b: "Umbrella", months: [4] },
  { id: "l-bbq", q: "At the BBQ?", a: "Burgers", b: "Hot dogs", months: [5, 6, 7] },
  { id: "l-pool", q: "Summer day off?", a: "Pool", b: "Beach", months: [6, 7] },
  { id: "l-icecream", q: "Ice cream?", a: "Cone", b: "Cup", months: [6, 7, 8] },
  { id: "l-camping", q: "Camping?", a: "Tent", b: "Cabin, please", months: [7, 8] },
  { id: "l-fall", q: "Best fall outing?", a: "Apple picking", b: "Pumpkin patch", months: [9, 10] },
  { id: "l-pumpkin", q: "Pumpkin spice latte?", a: "Bring it on", b: "Hard pass", months: [9, 10, 11] },
  { id: "l-candycorn", q: "Candy corn?", a: "Love it", b: "Hate it", months: [10] },
  { id: "l-pie", q: "Pie for dessert?", a: "Pumpkin", b: "Apple", months: [11] },
  { id: "l-plate", q: "Holiday plate?", a: "The main dish", b: "All about the sides", months: [11, 12] },
  { id: "l-movies", q: "Holiday movies?", a: "The classics", b: "Something new", months: [12] },
  { id: "l-wrap", q: "Wrapping gifts?", a: "Perfectly wrapped", b: "Gift bags all day", months: [12] },
  { id: "l-cocoa", q: "Hot cocoa topping?", a: "Marshmallows", b: "Whipped cream", months: [12, 1] },
  { id: "l-early", q: "Which are you?", a: "Early bird", b: "Night owl" },
  { id: "l-coffee", q: "Morning fuel?", a: "Coffee", b: "Tea" },
  { id: "l-beach", q: "Vacation?", a: "Beach", b: "Mountains" },
  { id: "l-text", q: "Reach me by?", a: "Text", b: "Call" },
  { id: "l-pets", q: "Team?", a: "Dogs", b: "Cats" },
  { id: "l-snack", q: "Snack attack?", a: "Sweet", b: "Salty" },
  { id: "l-pizza", q: "Team lunch?", a: "Pizza", b: "Tacos" },
  { id: "l-music", q: "While you work?", a: "Music on", b: "Quiet, please" },
  { id: "l-seat", q: "On the plane?", a: "Window", b: "Aisle" },
  { id: "l-books", q: "On the commute?", a: "Podcasts", b: "Music" },
  { id: "l-sunrise", q: "Better view?", a: "Sunrise", b: "Sunset" },
  { id: "l-roadtrip", q: "Getting there?", a: "Road trip", b: "Fly" },
  { id: "l-pancakes", q: "Breakfast?", a: "Pancakes", b: "Waffles" },
  { id: "l-inbox", q: "Your inbox?", a: "Inbox zero", b: "1,000 unread" },
  { id: "l-planner", q: "Keeping track?", a: "Paper planner", b: "Phone calendar" },
  { id: "l-cook", q: "Friday night?", a: "Cook at home", b: "Eat out" },
  { id: "l-theater", q: "Movie night?", a: "Theater", b: "Couch" },
  { id: "l-hotsauce", q: "Hot sauce?", a: "The hotter the better", b: "No thanks" },
  { id: "l-socks", q: "Socks with sandals?", a: "Comfort first", b: "Never" },
];

// Two-week rounds, starting on Mondays.
const ANCHOR = Date.UTC(2026, 0, 5); // a Monday
const DAY = 864e5;
export const roundOf = (todayISO: string) => Math.floor((Date.parse(todayISO + "T00:00:00Z") - ANCHOR) / (14 * DAY));
export const roundEnds = (round: number) => new Date(ANCHOR + (round + 1) * 14 * DAY - DAY).toISOString().slice(0, 10);
export const pollRowId = (clientId: string, round: number) => `poll-${clientId.replace(/[^A-Za-z0-9_-]/g, "")}-${round}`;

/** This round's question: the company's own first (in order, never repeated), then seasonal, then any-time. */
export function pickQuestion(s: PollSettings | undefined, used: Set<string>, month: number, round: number): PollQ {
  const own = (s?.custom ?? []).find((q) => !used.has(q.id));
  if (own || s?.library === false) return own ?? (s?.custom ?? [])[round % Math.max(1, s?.custom?.length ?? 1)] ?? LIBRARY[0];
  const fresh = LIBRARY.filter((q) => !used.has(q.id));
  const pool = fresh.length ? fresh : LIBRARY;
  const seasonal = pool.filter((q) => q.months?.includes(month));
  const anytime = pool.filter((q) => !q.months);
  const list = seasonal.length ? seasonal : anytime.length ? anytime : pool;
  return list[Math.abs(round) % list.length];
}

export function cleanPolls(v: unknown): PollSettings {
  const x = (v ?? {}) as Record<string, unknown>;
  const custom = Array.isArray(x.custom)
    ? (x.custom as Record<string, unknown>[])
        .map((q, i) => ({
          id: /^[A-Za-z0-9_-]{1,24}$/.test(String(q?.id ?? "")) ? String(q.id) : `c${Date.now().toString(36)}${i}`,
          q: String(q?.q ?? "").trim().slice(0, 80),
          a: String(q?.a ?? "").trim().slice(0, 30),
          b: String(q?.b ?? "").trim().slice(0, 30),
        }))
        .filter((q) => q.q && q.a && q.b)
        .slice(0, 30)
    : [];
  return { on: x.on !== false, custom, library: x.library !== false };
}

export const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
