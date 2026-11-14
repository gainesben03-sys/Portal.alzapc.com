// This or That on the server. Each round is a row in shoutouts (kind "poll", status "poll", so it never shows as a shoutout),
// and each vote is a row in shout_reactions ("a" or "b") keyed to the person or phone. Counts only go out.
import type { SupabaseClient } from "@supabase/supabase-js";
import { pct, pickQuestion, PollQ, pollRowId, PollSettings, PollView, roundEnds, roundOf } from "./polls";

type Row = PollQ & { kind: "poll"; status: "poll"; qid: string; round: number; clientId: string; at: string };

async function ensureRound(db: SupabaseClient, clientId: string, s: PollSettings | undefined, today: string): Promise<Row> {
  const round = roundOf(today);
  const id = pollRowId(clientId, round);
  const { data: have } = await db.from("shoutouts").select("data").eq("id", id).maybeSingle();
  if (have?.data) return have.data as Row;
  const { data: past } = await db.from("shoutouts").select("data").eq("client_id", clientId).eq("data->>kind", "poll").limit(200);
  const used = new Set((past ?? []).map((r) => (r.data as Row).qid));
  const q = pickQuestion(s, used, Number(today.slice(5, 7)), round);
  const row: Row = { id, q: q.q, a: q.a, b: q.b, qid: q.id, kind: "poll", status: "poll", round, clientId, at: new Date().toISOString() };
  await db.from("shoutouts").upsert({ id, client_id: clientId, data: row }, { onConflict: "id", ignoreDuplicates: true });
  const { data: again } = await db.from("shoutouts").select("data").eq("id", id).maybeSingle();
  return (again?.data as Row) ?? row;
}

async function counts(db: SupabaseClient, id: string, who?: string) {
  const { data } = await db.from("shout_reactions").select("who, emoji").eq("shout_id", id);
  const rows = data ?? [];
  return { a: rows.filter((r) => r.emoji === "a").length, b: rows.filter((r) => r.emoji === "b").length, mine: who ? (rows.find((r) => r.who === who)?.emoji as "a" | "b" | undefined) : undefined };
}

/** This round's poll with counts, the viewer's own vote, and last round's result. */
export async function pollFor(db: SupabaseClient, clientId: string, s: PollSettings | undefined, today: string, who?: string): Promise<PollView | null> {
  if (s?.on === false) return null;
  const row = await ensureRound(db, clientId, s, today);
  const c = await counts(db, row.id, who);
  const { data: prev } = await db.from("shoutouts").select("data").eq("id", pollRowId(clientId, row.round - 1)).maybeSingle();
  let last: PollView["last"];
  if (prev?.data) {
    const p = prev.data as Row;
    const pc = await counts(db, p.id);
    if (pc.a + pc.b > 0) last = { q: p.q, a: p.a, b: p.b, pa: pct(pc.a, pc.a + pc.b), pb: pct(pc.b, pc.a + pc.b) };
  }
  return { id: row.id, q: row.q, a: row.a, b: row.b, votes: { a: c.a, b: c.b }, mine: c.mine, ends: roundEnds(row.round), last };
}

/** One vote per person: a second tap doesn't change it. */
export async function votePoll(db: SupabaseClient, clientId: string, s: PollSettings | undefined, today: string, who: string, choice: string): Promise<PollView | null> {
  if (choice !== "a" && choice !== "b") return null;
  const row = await ensureRound(db, clientId, s, today);
  const { data: had } = await db.from("shout_reactions").select("emoji").eq("shout_id", row.id).eq("who", who).limit(1);
  if (!had?.length) await db.from("shout_reactions").insert({ shout_id: row.id, client_id: clientId, who, emoji: choice });
  return pollFor(db, clientId, s, today, who);
}
