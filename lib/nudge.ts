// "Recognize someone" nudges. Pure helpers shared by the portal (preview) and the server (send).
import type { PublicChallenge } from "./challenges";

export type NudgeAudience = "everyone" | "managers" | "mine" | `team:${string}`;
export interface Nudge {
  id: string;
  clientId: string;
  audience: NudgeAudience;
  waves: 1 | 3;
  line: string; // the inspirational opener
  note?: string; // optional personal note from whoever sent it
  challengeId?: string;
  by: { name: string; email: string };
  createdAt: string;
  // when each wave goes, and who's in it (person ids); sent waves get sentAt
  plan: { at: string; ids: string[]; sentAt?: string; sent?: number }[];
}

export const NUDGE_LINES = [
  "Recognition takes 20 seconds and can make someone's whole week.",
  "Somebody made your week a little easier. Tell them.",
  "The best teams notice each other.",
  "A thank-you costs nothing and means a lot.",
  "Catch someone doing something right today.",
  "Small thanks, big difference.",
  "Who had your back this week?",
  "Great work deserves to be seen. Go shine a light on someone.",
];
export const pickLine = (seed = Date.now()) => NUDGE_LINES[Math.floor(seed / 864e5) % NUDGE_LINES.length];

/** One line about an open challenge, to give the nudge a reason. */
export function challengeLine(c: PublicChallenge | undefined): string | null {
  if (!c) return null;
  if (c.kind === "chain" && c.chain) return `🔗 The ${c.title} is at ${c.chain.links} ${c.chain.links === 1 ? "link" : "links"} (longest streak: ${c.chain.longest}). Keep it growing!`;
  if (c.kind === "goal" && c.goal) return c.goal.reached ? `🏆 We hit "${c.title}"! Let's keep the momentum going.` : `🎯 ${c.title}: we're at ${c.goal.count} of ${c.goal.target}.${c.goal.target - c.goal.count <= 10 ? ` Only ${c.goal.target - c.goal.count} to go!` : ""}${c.goal.reward ? ` 🎁 ${c.goal.reward}` : ""}`;
  if (c.kind === "welcome" && c.welcome?.length) {
    const need = c.welcome.filter((n) => n.got < n.target);
    return need.length ? `👋 Welcome Wagon: ${need.slice(0, 3).map((n) => n.name.split(" ")[0]).join(", ")} ${need.length === 1 ? "is" : "are"} new. A welcome shoutout means a lot in week one.` : null;
  }
  return null;
}

/** Split people into three steady groups (same person, same wave). */
export function waves<T extends { id: string }>(people: T[]): T[][] {
  const h = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const out: T[][] = [[], [], []];
  [...people].sort((a, b) => h(a.id) - h(b.id)).forEach((p, i) => out[i % 3].push(p));
  return out;
}
