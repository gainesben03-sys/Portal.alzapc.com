// Employee experience, server side: load a hire fresh, save changes on top of the latest copy, send its emails.
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailLogoUrl } from "./brand";
import type { MailApp } from "./mailapp";
import { buddyAskEmail, buddyIntroEmail, ExperienceSettings, HireXp, linkEmail, newToken } from "./experience";
import { forCompany, Hire, hireCompany, onboardingFor, OnboardingSettings, senderFor } from "./hires";
import type { ClientConfig } from "./modules";
import { PORTAL_URL, sendEmail } from "./server";
import { isAdvisorName } from "./data";

export type XpCtx = { db: SupabaseClient; id: string; clientId: string; h: Hire; company: string; cfg: Partial<ClientConfig>; s: OnboardingSettings; x: ExperienceSettings };

export async function loadHire(db: SupabaseClient, id: string): Promise<XpCtx | null> {
  const { data } = await db.from("hires").select("id, client_id, data").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: cl } = await db.from("clients").select("name, config").eq("id", data.client_id).maybeSingle();
  const cfg = (cl?.config ?? {}) as Partial<ClientConfig>;
  const s = onboardingFor(cfg.onboarding);
  return { db, id: data.id, clientId: data.client_id, h: { ...(data.data as Hire), id: data.id, clientId: data.client_id }, company: cl?.name ?? "", cfg, s, x: s.experience ?? {} };
}

export async function hireByToken(db: SupabaseClient, field: "token" | "buddy" | "plan" | "intro", token: string): Promise<XpCtx | null> {
  if (!/^[A-Za-z0-9]{24,64}$/.test(token)) return null;
  const path = field === "token" ? "data->xp->>token" : field === "plan" ? "data->xp->>planToken" : field === "intro" ? "data->xp->intro->>okToken" : "data->xp->buddy->>token";
  const { data } = await db.from("hires").select("id").eq(path, token).maybeSingle();
  return data ? loadHire(db, data.id as string) : null;
}

/** Apply a change to the hire's latest copy (so a page open since this morning can't undo someone's answers). */
export async function saveXp(c: XpCtx, change: (xp: HireXp, h: Hire) => HireXp, log?: { by: string; text: string }): Promise<Hire> {
  const { data } = await c.db.from("hires").select("data").eq("id", c.id).maybeSingle();
  const h = { ...((data?.data ?? c.h) as Hire) };
  const xp = change({ ...(h.xp ?? {}) }, h);
  const next: Hire = { ...h, xp, history: log ? [...(h.history ?? []), { at: new Date().toISOString(), by: log.by, text: log.text }] : h.history };
  const { error } = await c.db.from("hires").update({ data: next }).eq("id", c.id);
  if (error) throw new Error(error.message);
  c.h = { ...next, id: c.id, clientId: c.clientId };
  return c.h;
}

export function brandAndSender(c: Pick<XpCtx, "clientId" | "h" | "company" | "cfg" | "s">) {
  const co = hireCompany(c.h, c.s);
  const { s, brand } = forCompany(c.h, c.s, { company: c.company, accent: c.cfg.accent || "#19283c", logoUrl: emailLogoUrl(c.clientId, c.cfg.logo, c.cfg.logoEmail, PORTAL_URL) }, co ? emailLogoUrl(c.clientId, co.logo, co.logoEmail, PORTAL_URL, co.id) : undefined);
  return { brand, s, sender: senderFor(s, brand.company), hrEmail: (s.hrEmail || "").trim().toLowerCase() };
}

export const welcomeUrl = (token: string) => `${PORTAL_URL}/welcome/${token}`;
export const buddyUrl = (token: string) => `${PORTAL_URL}/buddy/${token}`;

/** Send (or resend) the get-to-know-you link to the new hire's personal email. */
export async function sendLink(c: XpCtx, by: string, reminder = false): Promise<{ ok: boolean; reason?: string; to?: string }> {
  const to = (c.h.personalEmail || "").trim().toLowerCase();
  if (!to) return { ok: false, reason: "no_email" };
  const token = c.h.xp?.token || newToken();
  if (!c.h.xp?.token) await saveXp(c, (xp) => ({ ...xp, token }));
  const { brand, sender } = brandAndSender(c);
  const m = linkEmail(c.h, c.x, brand, welcomeUrl(token), reminder);
  const r = await sendEmail({ to: [to], subject: m.subject, html: m.html, text: m.text, ...sender });
  if (!r.ok) return r;
  const at = new Date().toISOString();
  await saveXp(c, (xp) => (reminder ? { ...xp, remindedAt: at } : { ...xp, linkSentAt: at }), { by, text: reminder ? `Get-to-know-you reminder sent to ${to}` : `Get-to-know-you link sent to ${to}` });
  return { ok: true, to };
}

/** Ask someone to be the buddy. Nothing goes to the new hire until they say yes. */
export async function askBuddy(c: XpCtx, by: string, buddy: { personId?: string; name: string; email: string }): Promise<{ ok: boolean; reason?: string }> {
  const token = newToken();
  const { brand, sender } = brandAndSender(c);
  const m = buddyAskEmail(c.h, c.x, brand, buddy.name, buddyUrl(token));
  const r = await sendEmail({ to: [buddy.email], subject: m.subject, html: m.html, text: m.text, ...sender });
  if (!r.ok) return r;
  const at = new Date().toISOString();
  await saveXp(c, (xp) => ({ ...xp, buddy: { personId: buddy.personId, name: buddy.name, email: buddy.email, token, status: "asked", askedAt: at } }), { by, text: `Asked ${buddy.name} to be the onboarding buddy` });
  return { ok: true };
}

/** The buddy said yes (or HR marked it): introduce them to the new hire. */
export async function buddyYes(c: XpCtx, by: string, phone?: string): Promise<Hire> {
  const b = c.h.xp?.buddy;
  if (!b) return c.h;
  const at = new Date().toISOString();
  await saveXp(c, (xp) => ({ ...xp, buddy: { ...xp.buddy!, ...(phone ? { phone } : {}), status: "yes", answeredAt: xp.buddy?.answeredAt && xp.buddy.status === "yes" ? xp.buddy.answeredAt : at } }), { by, text: `${b.name} said yes to being the onboarding buddy` });
  if (c.h.xp?.buddy?.introSentAt || c.h.outcome || c.h.xp?.closed) return c.h;
  const to = [(c.h.personalEmail || "").trim().toLowerCase(), b.email].filter(Boolean);
  const { brand, sender } = brandAndSender(c);
  const m = buddyIntroEmail(c.h, c.x, brand, b.name, { email: b.email, phone: phone || b.phone }, (c.cfg as { mailApp?: MailApp }).mailApp);
  const r = await sendEmail({ to, subject: m.subject, html: m.html, text: m.text, ...sender, replyTo: m.replyTo.length ? m.replyTo : undefined });
  if (r.ok) return saveXp(c, (xp) => ({ ...xp, buddy: { ...xp.buddy!, introSentAt: new Date().toISOString() } }), { by: "AlzaHR", text: `Buddy intro sent to ${to.join(", ")}` });
  return c.h;
}

export async function buddyNo(c: XpCtx, by: string): Promise<Hire> {
  const b = c.h.xp?.buddy;
  if (!b) return c.h;
  const h = await saveXp(c, (xp) => ({ ...xp, buddy: { ...xp.buddy!, status: "no", answeredAt: new Date().toISOString() } }), { by, text: `${b.name} can't be the buddy right now. Pick someone else.` });
  const { sender, hrEmail } = brandAndSender(c);
  if (hrEmail && !isAdvisorName(by))
    await sendEmail({ to: [hrEmail], subject: `Pick another buddy for ${c.h.name}`, text: `${b.name} can't be ${c.h.name}'s onboarding buddy right now.\n\nPick someone else here:\n${PORTAL_URL}/c/${c.clientId}/hires/${c.id}`, ...sender }).catch(() => undefined);
  return h;
}

/** Short-lived links to a photo kept in storage. */
export async function signed(db: SupabaseClient, path: string | undefined, seconds = 3600) {
  if (!path || !/^hires\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.jpg$/.test(path)) return undefined;
  const { data } = await db.storage.from("client-files").createSignedUrl(path, seconds);
  return data?.signedUrl ?? undefined;
}

// ---------------------------------------------------------------- the company intro

/** Who gets the intro: everyone on the roster with an email, or just their location plus their manager. */
export async function introRecipients(db: SupabaseClient, clientId: string, h: Hire, x: import("./experience").ExperienceSettings | undefined) {
  const { data: ppl } = await db.from("people").select("id, data").eq("client_id", clientId);
  const roster = (ppl ?? []).map((r) => ({ ...(r.data as import("./team").TeamMember), id: r.id as string }));
  const audience = h.xp?.intro?.audience ?? x?.audience ?? "all";
  const norm = (v?: string) => (v || "").trim().toLowerCase();
  const me = roster.find((p) => p.id === h.rosterId);
  const site = norm(me?.location || h.location);
  const own = norm(h.personalEmail);
  const emails = [
    ...new Set(
      roster
        .filter((p) => p.active !== false && p.email && p.id !== h.rosterId && norm(p.name) !== norm(h.name))
        .filter((p) => audience === "all" || (!!site && (norm(p.location) === site || norm(p.location).includes(site) || (!!norm(p.location) && site.includes(norm(p.location))))) || norm(p.name) === norm(h.managerName))
        .map((p) => norm(p.email))
        .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e !== own)
    ),
  ];
  return { emails, me, audience };
}

/** Send the company intro now (email to the team, and a welcome on the Team Wall). Doesn't save: the caller records the result. */
export async function deliverIntro(db: SupabaseClient, client: { id: string; name: string; config: unknown }, h: Hire, x: import("./experience").ExperienceSettings | undefined, brand: import("./hires").Brand, sender: ReturnType<typeof senderFor>) {
  const { introEmail } = await import("./experience");
  const cfg = (client.config ?? {}) as Partial<ClientConfig> & { recognition?: { token?: string } };
  const xp = h.xp ?? {};
  const { emails, me } = await introRecipients(db, client.id, h, x);
  const photoOk = x?.photos !== false && xp.sharePhoto !== false && !!xp.photo && /^hires\//.test(xp.photo);
  const photoUrl = photoOk ? (await db.storage.from("client-files").createSignedUrl(xp.photo!, 60 * 60 * 24 * 30)).data?.signedUrl ?? undefined : undefined;
  const wantWall = (xp.intro?.wall ?? x?.wall ?? true) && !!cfg.modules?.recognition;
  const wallUrl = wantWall && cfg.recognition?.token ? `${PORTAL_URL}/shout/${cfg.recognition.token}` : undefined;
  const m = introEmail(h, x, brand, photoUrl, wallUrl);
  if (!emails.length) return { sent: 0, total: 0, fail: "No one on the roster has an email to send it to" };
  let sent = 0;
  let fail = "";
  for (let k = 0; k < emails.length; k += 8) {
    const rs = await Promise.all(emails.slice(k, k + 8).map((e) => sendEmail({ to: [e], subject: m.subject, html: m.html, text: m.text, ...sender })));
    rs.forEach((r) => (r.ok ? sent++ : (fail = r.reason || "failed")));
  }
  if (sent && wantWall && h.rosterId) {
    const id = `so${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const story = xp.intro?.story?.trim().split(/\n\s*\n/)[0];
    const lines = m.lines.slice(0, 2).map((l) => `${l.label}: ${l.text}`).join(". ");
    const message = `${m.subject.replace(/!$/, "")}! ${story && xp.intro?.style === "story" ? story : lines}`.replace(/\s+/g, " ").trim().slice(0, 280);
    const shout = { id, clientId: client.id, to: { personId: h.rosterId, name: h.name, department: me?.department, location: me?.location || h.location }, from: { name: client.name, verified: true }, message, channel: "portal", status: "live", at: new Date().toISOString() };
    await db.from("shoutouts").insert({ id, client_id: client.id, data: shout });
  }
  return { sent, total: emails.length, fail };
}

/** A few short paragraphs from what the new hire approved, in a warm, plain voice. Only approved, shareable answers go in. */
export async function writeStory(h: Hire, x: import("./experience").ExperienceSettings | undefined, company: string): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const { claude, noDash } = await import("./ai");
  const { fillVals, introLines } = await import("./experience");
  const v = fillVals(h, company);
  const lines = introLines(h, x);
  const facts = [`Name they go by: ${v.preferred} ${v.last}`.trim(), `Job title: ${v.title}`, h.managerName ? `Manager: ${h.managerName}` : "", ...lines.map((l) => `${l.label}: ${l.text}`)].filter(Boolean).join("\n");
  const r = await claude({
    system:
      `You write the short welcome email ${company} sends to the whole team on a new employee's first day. ` +
      "Write 3 or 4 short paragraphs, plain and warm, like a friendly coworker wrote it. No headline, no greeting line, no sign-off: those are added around your text. " +
      "Start with who they are and their role, e.g. 'Andi Molina joins us today as our new Shipping Associate on Dana's team.' Do not start with 'Please welcome'. " +
      "Use ONLY the facts given. Do not add anything they did not say: no guesses about family, age, background, health, beliefs, or where they are from beyond what is written. " +
      "Use their name instead of he or she. One light, kind touch of humor at most. End with an easy way to say hello (stop by, coffee) if the facts allow. " +
      "No em dashes. No emoji. Under 140 words. Plain text, paragraphs separated by a blank line.",
    messages: [{ role: "user", content: `Facts the new hire approved to share:\n${facts}` }],
    maxTokens: 500,
    temperature: 0.6,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  const text = noDash(r.text).replace(/\r/g, "").replace(/^\s*(please welcome[^\n]*\n)?/i, "").trim().slice(0, 1500);
  return text ? { ok: true, text } : { ok: false, reason: "empty" };
}

/** HR said send (from the email link or the hire's page): send the intro to the team now and record it. */
export async function sendIntroNow(c: XpCtx, by: string): Promise<{ ok: boolean; reason?: string; sent?: number }> {
  const xp = c.h.xp ?? {};
  if (xp.intro?.sentAt) return { ok: true, sent: xp.intro.sentTo };
  if (!xp.approvedAt) return { ok: false, reason: "not_approved" };
  const { brand, sender } = brandAndSender(c);
  const r = await deliverIntro(c.db, { id: c.clientId, name: c.company, config: c.cfg }, c.h, c.x, brand, sender);
  const at = new Date().toISOString();
  if (!r.sent) {
    await saveXp(c, (x0) => ({ ...x0, intro: { ...(x0.intro ?? {}), failed: r.fail } }), { by, text: `Company intro not sent: ${r.fail}` });
    return { ok: false, reason: r.fail.startsWith("No one") ? "no_recipients" : "send_failed" };
  }
  await saveXp(c, (x0) => ({ ...x0, intro: { ...(x0.intro ?? {}), sentAt: at, sentTo: r.sent, okAt: at, okBy: by, cancelled: undefined, failed: r.fail ? `${r.total - r.sent} didn't go through (${r.fail})` : undefined } }), { by, text: `Company intro sent to ${r.sent} ${r.sent === 1 ? "person" : "people"}` });
  return { ok: true, sent: r.sent };
}
