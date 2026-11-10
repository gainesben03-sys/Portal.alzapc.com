// Sending nudges: build each person's note, send one wave, record it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailLogoUrl } from "./brand";
import { challengeLive, publicChallenge } from "./challenges";
import { challengesFor, shoutsSince } from "./challengeserver";
import { festiveEmail } from "./hires";
import { challengeLine, Nudge, NudgeAudience } from "./nudge";
import { celebrateSender } from "./recognition";
import { sendEmail } from "./server";
import { optOutKey, rosterFor, ShoutClient } from "./shoutserver";
import type { TeamMember } from "./team";

export type NudgeTarget = { id: string; name: string; email: string; manager: boolean };

/** Who a nudge goes to. Managers come from the roster's "manager email" column. */
export function nudgeTargets(roster: TeamMember[], audience: NudgeAudience, me?: string): NudgeTarget[] {
  const live = roster.filter((p) => p.active !== false);
  const ok = (p: TeamMember) => !!p.email && p.nudges !== false;
  const mgrEmails = new Set(live.map((p) => (p.managerEmail || "").toLowerCase()).filter(Boolean));
  const asTarget = (p: TeamMember): NudgeTarget => ({ id: p.id, name: p.name, email: p.email!, manager: mgrEmails.has(p.email!.toLowerCase()) });
  if (audience === "managers") {
    return [...mgrEmails].map((e) => {
      const p = live.find((x) => x.email?.toLowerCase() === e);
      if (p) return p.nudges === false ? null : asTarget(p);
      const name = live.find((x) => (x.managerEmail || "").toLowerCase() === e)?.managerName || e.split("@")[0];
      return { id: `m:${e}`, name, email: e, manager: true };
    }).filter(Boolean) as NudgeTarget[];
  }
  if (audience === "mine") return live.filter((p) => ok(p) && !!me && (p.managerEmail || "").toLowerCase() === me.toLowerCase()).map(asTarget);
  if (audience.startsWith("team:")) {
    const t = audience.slice(5).toLowerCase();
    return live.filter((p) => ok(p) && ((p.department || "").toLowerCase() === t || (p.location || "").toLowerCase() === t)).map(asTarget);
  }
  return live.filter(ok).map(asTarget);
}

/** Send one wave of a nudge. Facts (challenge progress, who hasn't been recognized) are as of right now. */
export async function sendNudgeWave(db: SupabaseClient, site: string, c: ShoutClient, n: Nudge, wave: number): Promise<number> {
  const plan = n.plan[wave];
  if (!plan || plan.sentAt) return 0;
  const roster = await rosterFor(db, c.id);
  const targets = nudgeTargets(roster, n.audience, n.by.email);
  const byId = new Map(targets.map((t) => [t.id, t]));
  const recent = await shoutsSince(db, c.id, new Date(Date.now() - 30 * 864e5).toISOString());
  const got = new Set(recent.filter((s) => s.status === "live").map((s) => s.to.personId));
  let line: string | null = null;
  if (n.challengeId) {
    const ch = (await challengesFor(db, c.id)).find((x) => x.id === n.challengeId && challengeLive(x));
    if (ch) line = challengeLine(publicChallenge(ch, await shoutsSince(db, c.id, ch.kind === "welcome" ? new Date(Date.now() - 120 * 864e5).toISOString() : ch.startedAt), roster));
  }
  const brand = { company: c.name, accent: c.config.accent || "#19283c", logoUrl: emailLogoUrl(c.id, c.config.logo, c.config.logoEmail, site) };
  const give = `${site}/shout/${c.rec.token}`;
  let sent = 0;
  for (const id of plan.ids) {
    const t = byId.get(id);
    if (!t) continue; // left, or turned nudges off since
    const first = t.name.split(" ")[0];
    const paras = [`Hi ${first},`];
    if (n.note) paras.push(n.note);
    if (line) paras.push(line);
    if (t.manager) {
      const quiet = roster.filter((p) => p.active !== false && (p.managerEmail || "").toLowerCase() === t.email.toLowerCase() && !got.has(p.id));
      if (quiet.length) paras.push(`On your team, ${quiet.slice(0, 4).map((p) => p.name.split(" ")[0]).join(", ")}${quiet.length > 4 ? ` and ${quiet.length - 4} more` : ""} ${quiet.length === 1 ? "hasn't" : "haven't"} had a shoutout in the last 30 days. A quick one from you would mean a lot.`);
    } else paras.push("Think of one person who made your week better, and tell them. It takes 20 seconds.");
    const realPerson = !id.startsWith("m:");
    const m = festiveEmail(brand, {
      emoji: "&#128155;&#10024;&#128079;",
      kicker: "A little nudge",
      headline: n.line,
      paragraphs: paras,
      cta: { label: "🎉 Give a shoutout", url: give },
      optOut: realPerson ? { url: `${site}/api/celebrate/optout?t=nudge&c=${encodeURIComponent(c.id)}&p=${encodeURIComponent(id)}&k=${optOutKey(c.id, id, "nudge")}`, label: "Don't want these reminders?" } : undefined,
    });
    const r = await sendEmail({ to: [t.email], subject: `💛 ${n.line}`, text: m.text, html: m.html, ...celebrateSender(c.rec, c.name) }).catch(() => ({ ok: false }));
    if (r.ok) sent++;
  }
  const next: Nudge = { ...n, plan: n.plan.map((p, i) => (i === wave ? { ...p, sentAt: new Date().toISOString(), sent } : p)) };
  await db.from("nudges").update({ data: next }).eq("id", n.id);
  return sent;
}
