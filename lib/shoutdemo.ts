// Sample shoutouts for the demo (no server). Made-up people only.
import { scoreboard, Shoutout } from "./recognition";

const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
export const DEMO_VALUES = ["Teamwork", "Safety first", "Above and beyond", "Customer first", "Ownership"];
export const DEMO_PEOPLE = [
  { id: "pp1", name: "Marcus Bell", team: "Warehouse" },
  { id: "pp2", name: "Ana Reyes", team: "Install crew" },
  { id: "pp3", name: "Devon Park", team: "Production" },
  { id: "pp4", name: "Lucía Moreno", team: "Warehouse" },
  { id: "pp5", name: "Sam Whitaker", team: "Sales" },
  { id: "pp6", name: "Jordan Hale", team: "Install crew" },
];

const mk = (id: string, to: number, from: number, value: string, message: string, h: number, status: Shoutout["status"] = "live", heldReason?: string): Shoutout => ({
  id,
  clientId: "blueprint",
  to: { personId: DEMO_PEOPLE[to].id, name: DEMO_PEOPLE[to].name, department: DEMO_PEOPLE[to].team },
  from: { name: DEMO_PEOPLE[from].name, personId: DEMO_PEOPLE[from].id, verified: from % 2 === 0 },
  value,
  message,
  channel: (["qr", "sms", "portal"] as const)[h % 3],
  status,
  heldReason,
  at: ago(h),
});

const link = (id: string, to: number, from: number, msg: string, h: number, depth: number, parentId?: string): Shoutout => ({ ...mk(id, to, from, "Teamwork", msg, h), challengeId: "ch-demo", depth, parentId });

export const DEMO_SHOUTS: Shoutout[] = [
  link("c1", 0, 4, "Kicking off the chain: Marcus, you held the warehouse together during inventory week.", 70, 1),
  link("c2", 3, 0, "Lucía caught three mislabeled crates before they shipped. Passing it to you!", 50, 2, "c1"),
  link("c3", 2, 3, "Devon re-did the stage plot at midnight so install could start on time.", 30, 3, "c2"),
  link("c4", 5, 3, "Jordan jumped on the scanner rollout without being asked.", 28, 3, "c2"),
  link("c5", 1, 2, "Ana, your crew made load-in look easy this week.", 9, 4, "c3"),
  mk("d1", 0, 1, "Above and beyond", "Stayed two hours late to reload the truck when the gala order changed. We made the morning call because of you.", 2),
  mk("d2", 3, 0, "Safety first", "Stopped the line to re-strap a pallet that was leaning. Nobody else saw it. Thank you!", 6),
  mk("d3", 2, 4, "Customer first", "The client called out your stage setup by name in their thank-you email. That's all you.", 20),
  mk("d4", 5, 3, "Teamwork", "Gracias por enseñarme el nuevo escáner sin que te lo pidiera. Me ahorraste toda la mañana.", 30),
  mk("d5", 1, 2, "Ownership", "Found the missing cable box at 6am and still got the install done before doors opened.", 52),
  mk("d6", 4, 5, "Teamwork", "Covered my site visit so I could get to my kid's game. Owe you one.", 76),
  mk("d7", 0, 4, "Safety first", "Walked the new guys through forklift safety on their first day like a pro.", 120),
  mk("h1", 2, 1, "Teamwork", "Devon finally did something useful lol", 1, "held", "Sounds sarcastic"),
];

export function demoBoard() {
  const since = new Date();
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  return scoreboard(DEMO_SHOUTS, DEMO_VALUES, since);
}
export const demoReactions: Record<string, Record<string, number>> = { d1: { "👏": 9, "❤️": 4, "🔥": 3 }, d2: { "🙌": 6, "👏": 2 }, d3: { "🔥": 5 }, d4: { "❤️": 7 }, d5: { "👏": 3 }, d6: { "❤️": 2 }, d7: { "🙌": 4 } };

import type { Celebration } from "./recognition";
const md = (plus: number) => {
  const d = new Date();
  d.setDate(d.getDate() + plus);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
export const DEMO_CELEBRATE: Celebration[] = [
  { personId: "pp2", name: "Ana R.", team: "Install crew", kind: "birthday", days: 0, when: md(0) },
  { personId: "pp3", name: "Devon P.", team: "Production", kind: "anniversary", days: 2, when: md(2), years: 3 },
  { personId: "pp6", name: "Jordan H.", team: "Install crew", kind: "new", days: -2, when: md(-2) },
  { personId: "pp5", name: "Sam W.", team: "Sales", kind: "birthday", days: 5, when: md(5) },
  { personId: "pp4", name: "Lucía M.", team: "Warehouse", kind: "birthday", days: 11, when: md(11) },
];

import type { Challenge } from "./challenges";
const start = new Date(Date.now() - 72 * 3600e3).toISOString();
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
export const DEMO_CHALLENGES: Challenge[] = [
  { id: "ch-demo", clientId: "blueprint", kind: "chain", title: "November Appreciation Chain", status: "active", startedAt: start, endsAt: inDays(20), createdBy: { name: "Sam Whitaker" }, chain: { windowDays: 3, rootId: "c1" } },
  { id: "ch-goal", clientId: "blueprint", kind: "goal", title: "20 shoutouts by Thanksgiving", status: "active", startedAt: new Date(Date.now() - 6 * 864e5).toISOString(), endsAt: inDays(16), createdBy: { name: "Ben Gaines" }, goal: { target: 20, reward: "Team taco lunch 🌮" } },
  { id: "ch-wel", clientId: "blueprint", kind: "welcome", title: "Welcome Wagon", status: "active", startedAt: start, createdBy: { name: "Ben Gaines" }, welcome: { target: 5, days: 30 } },
];
export const DEMO_ROSTER = DEMO_PEOPLE.map((p, i) => ({ id: p.id, name: p.name, department: p.team, hireDate: i === 5 ? new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10) : i === 1 ? new Date(Date.now() - 12 * 864e5).toISOString().slice(0, 10) : "2022-03-01", active: true }));
