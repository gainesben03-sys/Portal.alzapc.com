// Server side of challenges: load them, check a chain pass, notice when a goal is reached.
import type { SupabaseClient } from "@supabase/supabase-js";
import { Challenge, challengeLive, goalStats } from "./challenges";
import type { Shoutout } from "./recognition";
import { sendEmail } from "./server";

export async function challengesFor(db: SupabaseClient, clientId: string, liveOnly = true): Promise<Challenge[]> {
  const { data } = await db.from("challenges").select("data").eq("client_id", clientId).order("created_at", { ascending: false }).limit(50);
  const list = (data ?? []).map((r) => r.data as Challenge);
  return liveOnly ? list.filter((c) => challengeLive(c)) : list;
}

export async function shoutsSince(db: SupabaseClient, clientId: string, sinceIso: string): Promise<Shoutout[]> {
  const { data } = await db.from("shoutouts").select("data").eq("client_id", clientId).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(3000);
  return (data ?? []).map((r) => r.data as Shoutout);
}

/** Can this shoutout pass the chain on from `parentId`? Returns the chain and link number, or why not. */
export async function checkChainPass(db: SupabaseClient, clientId: string, parentId: string, toPersonId: string): Promise<{ ok: true; challenge: Challenge; parent: Shoutout; depth: number } | { ok: false; reason: string }> {
  const { data } = await db.from("shoutouts").select("data").eq("id", parentId).eq("client_id", clientId).maybeSingle();
  const parent = data?.data as Shoutout | undefined;
  if (!parent?.challengeId || parent.status !== "live") return { ok: false, reason: "chain_gone" };
  const { data: ch } = await db.from("challenges").select("data").eq("id", parent.challengeId).maybeSingle();
  const challenge = ch?.data as Challenge | undefined;
  if (!challenge || challenge.kind !== "chain" || !challengeLive(challenge)) return { ok: false, reason: "chain_over" };
  const win = (challenge.chain?.windowDays ?? 3) * 864e5;
  if (Date.now() - new Date(parent.at).getTime() > win + 864e5) return { ok: false, reason: "chain_expired" }; // a day of grace
  // spread it: someone already in the chain can't get it again
  const { data: links } = await db.from("shoutouts").select("data").eq("client_id", clientId).eq("data->>challengeId", challenge.id);
  const inChain = new Set((links ?? []).flatMap((r) => { const s = r.data as Shoutout; return [s.to.personId, s.from.personId].filter(Boolean) as string[]; }));
  if (inChain.has(toPersonId)) return { ok: false, reason: "already_in_chain" };
  return { ok: true, challenge, parent, depth: (parent.depth ?? 1) + 1 };
}

/** After a shoutout goes live: did it push a Team Goal over the line? Celebrate once. */
export async function checkGoals(db: SupabaseClient, site: string, clientId: string, company: string) {
  const goals = (await challengesFor(db, clientId)).filter((c) => c.kind === "goal" && !c.goal?.reachedAt);
  if (!goals.length) return;
  const earliest = goals.reduce((m, g) => (g.startedAt < m ? g.startedAt : m), goals[0].startedAt);
  const shouts = await shoutsSince(db, clientId, earliest);
  for (const g of goals) {
    const st = goalStats(g, shouts);
    if (!st.reached) continue;
    const next: Challenge = { ...g, goal: { ...g.goal!, reachedAt: new Date().toISOString() } };
    await db.from("challenges").update({ data: next, updated_at: new Date().toISOString() }).eq("id", g.id);
    const href = `/c/${clientId}/recognition?tab=challenges`;
    await db.from("notices").insert({ id: `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, client_id: clientId, created_by: "shoutouts@portal", data: { clientId, kind: "feedback", text: `🎯 Team Goal reached: ${g.title} (${st.count} shoutouts)`, href, at: new Date().toISOString(), read: false } });
    const to = [(process.env.NOTIFY_TO || "ben@alzapc.com").trim(), ...(g.createdBy.email ? [g.createdBy.email] : [])];
    await sendEmail({ to: Array.from(new Set(to)), subject: `🎯 ${company} hit the goal: ${g.title}`, text: `${company} reached ${st.count} shoutouts for "${g.title}".${g.goal?.reward ? `\n\nTime for the reward: ${g.goal.reward}` : ""}\n\n${site}${href}` }).catch(() => undefined);
  }
}
