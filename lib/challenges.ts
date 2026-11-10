// Shoutout challenges. All three are counted from the shoutouts themselves, so nothing can drift.
//  - Appreciation Chain: each person who gets a chain shoutout passes it on within N days. It can branch.
//  - Team Goal: "100 shoutouts by Thanksgiving", with a team reward.
//  - Welcome Wagon: every new person gets N shoutouts in their first M days.
import { shortName, Shoutout } from "./recognition";

export type ChallengeKind = "chain" | "goal" | "welcome";
export interface Challenge {
  id: string;
  clientId: string;
  kind: ChallengeKind;
  title: string;
  status: "active" | "ended";
  startedAt: string;
  endsAt?: string; // yyyy-mm-dd, last day
  createdBy: { name: string; email?: string };
  chain?: { windowDays: number; rootId?: string };
  goal?: { target: number; reward?: string; value?: string; reachedAt?: string };
  welcome?: { target: number; days: number };
}

export const CHALLENGE_INFO: Record<ChallengeKind, { icon: string; name: string; blurb: string }> = {
  chain: { icon: "🔗", name: "Appreciation Chain", blurb: "You recognize someone. They have a few days to pass it on. Watch it grow." },
  goal: { icon: "🎯", name: "Team Goal", blurb: "A number of shoutouts by a date, with a team reward when you hit it." },
  welcome: { icon: "👋", name: "Welcome Wagon", blurb: "Every new person gets a few shoutouts in their first weeks." },
};

const DAY = 864e5;
export const challengeLive = (c: Challenge, now = new Date()) => c.status === "active" && (!c.endsAt || c.endsAt >= now.toISOString().slice(0, 10));

export type Baton = { shoutId: string; personId: string; name: string; team: string; link: number; dueAt: string; daysLeft: number };
export type ChainStats = { links: number; longest: number; people: number; teams: number; open: Baton[]; quiet: number; tree: { id: string; to: string; from: string; depth: number; at: string; parentId?: string; team: string; message: string; passed: boolean; expired: boolean }[] };

/** Everything about a chain: length, longest unbroken run, who holds the baton and how long they have. */
export function chainStats(c: Challenge, shouts: Shoutout[], now = new Date()): ChainStats {
  const links = shouts.filter((s) => s.challengeId === c.id && s.status === "live").sort((a, b) => a.at.localeCompare(b.at));
  const win = (c.chain?.windowDays ?? 3) * DAY;
  const passedFrom = new Set(links.map((s) => s.parentId).filter(Boolean) as string[]);
  const open: Baton[] = [];
  let quiet = 0;
  const tree = links.map((s) => {
    const due = new Date(new Date(s.at).getTime() + win);
    const passed = passedFrom.has(s.id);
    const expired = !passed && due < now;
    if (!passed && !expired && challengeLive(c, now)) open.push({ shoutId: s.id, personId: s.to.personId, name: s.to.name, team: s.to.department || s.to.location || "", link: s.depth ?? 1, dueAt: due.toISOString(), daysLeft: Math.max(0, Math.ceil((due.getTime() - now.getTime()) / DAY)) });
    if (expired) quiet++;
    return { id: s.id, to: s.to.name, from: s.from.name, depth: s.depth ?? 1, at: s.at, parentId: s.parentId, team: s.to.department || s.to.location || "", message: s.message, passed, expired };
  });
  return {
    links: links.length,
    longest: links.reduce((m, s) => Math.max(m, s.depth ?? 1), 0),
    people: new Set(links.flatMap((s) => [s.to.personId, s.from.personId].filter(Boolean))).size,
    teams: new Set(links.map((s) => s.to.department || s.to.location).filter(Boolean)).size,
    open: open.sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    quiet,
    tree,
  };
}

export type GoalStats = { count: number; target: number; pct: number; reached: boolean; daysLeft: number | null };
export function goalStats(c: Challenge, shouts: Shoutout[], now = new Date()): GoalStats {
  const start = c.startedAt;
  const end = c.endsAt ? `${c.endsAt}T23:59:59` : "9999";
  const count = shouts.filter((s) => s.status === "live" && s.at >= start && s.at <= end && (!c.goal?.value || s.value === c.goal.value)).length;
  const target = Math.max(1, c.goal?.target ?? 50);
  return { count, target, pct: Math.min(100, Math.round((count / target) * 100)), reached: count >= target, daysLeft: c.endsAt ? Math.max(0, Math.ceil((new Date(`${c.endsAt}T23:59:59`).getTime() - now.getTime()) / DAY)) : null };
}

export type Newbie = { personId: string; name: string; team: string; got: number; target: number; daysLeft: number };
/** New people still in their welcome window, and how many shoutouts they've had. */
export function welcomeStats(c: Challenge, people: { id: string; name: string; department?: string; location?: string; hireDate?: string; active?: boolean }[], shouts: Shoutout[], now = new Date()): Newbie[] {
  const target = c.welcome?.target ?? 5;
  const days = c.welcome?.days ?? 30;
  return people
    .filter((p) => p.active !== false && p.hireDate)
    .map((p) => {
      const start = new Date(`${p.hireDate!.slice(0, 10)}T00:00:00`);
      const left = Math.ceil((start.getTime() + days * DAY - now.getTime()) / DAY);
      const got = shouts.filter((s) => s.status === "live" && s.to.personId === p.id && new Date(s.at) >= start).length;
      return { personId: p.id, name: shortName(p.name), team: p.department || p.location || "", got, target, daysLeft: left, started: start <= now };
    })
    .filter((n) => n.started && n.daysLeft > 0 && n.daysLeft <= days)
    .map(({ started: _s, ...n }) => n) // eslint-disable-line @typescript-eslint/no-unused-vars
    .sort((a, b) => a.got - b.got || a.daysLeft - b.daysLeft);
}

/** What the public page and TV get: no emails, short names. */
export type PublicChallenge = { id: string; kind: ChallengeKind; title: string; endsAt?: string; chain?: { links: number; longest: number; teams: number; open: number; windowDays: number }; goal?: GoalStats & { reward?: string; value?: string }; welcome?: Newbie[] };
export function publicChallenge(c: Challenge, shouts: Shoutout[], people: Parameters<typeof welcomeStats>[1], now = new Date()): PublicChallenge {
  const base = { id: c.id, kind: c.kind, title: c.title, endsAt: c.endsAt };
  if (c.kind === "chain") {
    const st = chainStats(c, shouts, now);
    return { ...base, chain: { links: st.links, longest: st.longest, teams: st.teams, open: st.open.length, windowDays: c.chain?.windowDays ?? 3 } };
  }
  if (c.kind === "goal") return { ...base, goal: { ...goalStats(c, shouts, now), reward: c.goal?.reward, value: c.goal?.value } };
  return { ...base, welcome: welcomeStats(c, people, shouts, now).map((n) => ({ ...n, name: shortName(n.name) })) };
}
