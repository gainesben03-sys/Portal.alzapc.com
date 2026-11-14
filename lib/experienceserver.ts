// Employee experience, server side: load a hire fresh, save changes on top of the latest copy, send its emails.
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailLogoUrl } from "./brand";
import { buddyAskEmail, buddyIntroEmail, ExperienceSettings, HireXp, linkEmail, newToken } from "./experience";
import { forCompany, Hire, hireCompany, onboardingFor, OnboardingSettings, senderFor } from "./hires";
import type { ClientConfig } from "./modules";
import { PORTAL_URL, sendEmail } from "./server";

export type XpCtx = { db: SupabaseClient; id: string; clientId: string; h: Hire; company: string; cfg: Partial<ClientConfig>; s: OnboardingSettings; x: ExperienceSettings };

export async function loadHire(db: SupabaseClient, id: string): Promise<XpCtx | null> {
  const { data } = await db.from("hires").select("id, client_id, data").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: cl } = await db.from("clients").select("name, config").eq("id", data.client_id).maybeSingle();
  const cfg = (cl?.config ?? {}) as Partial<ClientConfig>;
  const s = onboardingFor(cfg.onboarding);
  return { db, id: data.id, clientId: data.client_id, h: { ...(data.data as Hire), id: data.id, clientId: data.client_id }, company: cl?.name ?? "", cfg, s, x: s.experience ?? {} };
}

export async function hireByToken(db: SupabaseClient, field: "token" | "buddy", token: string): Promise<XpCtx | null> {
  if (!/^[A-Za-z0-9]{24,64}$/.test(token)) return null;
  const path = field === "token" ? "data->xp->>token" : "data->xp->buddy->>token";
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
export async function buddyYes(c: XpCtx, by: string): Promise<Hire> {
  const b = c.h.xp?.buddy;
  if (!b) return c.h;
  const at = new Date().toISOString();
  await saveXp(c, (xp) => ({ ...xp, buddy: { ...xp.buddy!, status: "yes", answeredAt: xp.buddy?.answeredAt && xp.buddy.status === "yes" ? xp.buddy.answeredAt : at } }), { by, text: `${b.name} said yes to being the onboarding buddy` });
  if (c.h.xp?.buddy?.introSentAt || c.h.outcome || c.h.xp?.closed) return c.h;
  const to = [(c.h.personalEmail || "").trim().toLowerCase(), b.email].filter(Boolean);
  const { brand, sender } = brandAndSender(c);
  const m = buddyIntroEmail(c.h, c.x, brand, b.name);
  const r = await sendEmail({ to, subject: m.subject, html: m.html, text: m.text, ...sender });
  if (r.ok) return saveXp(c, (xp) => ({ ...xp, buddy: { ...xp.buddy!, introSentAt: new Date().toISOString() } }), { by: "AlzaHR", text: `Buddy intro sent to ${to.join(", ")}` });
  return c.h;
}

export async function buddyNo(c: XpCtx, by: string): Promise<Hire> {
  const b = c.h.xp?.buddy;
  if (!b) return c.h;
  const h = await saveXp(c, (xp) => ({ ...xp, buddy: { ...xp.buddy!, status: "no", answeredAt: new Date().toISOString() } }), { by, text: `${b.name} can't be the buddy right now. Pick someone else.` });
  const { sender, hrEmail } = brandAndSender(c);
  if (hrEmail && by !== "HR")
    await sendEmail({ to: [hrEmail], subject: `Pick another buddy for ${c.h.name}`, text: `${b.name} can't be ${c.h.name}'s onboarding buddy right now.\n\nPick someone else here:\n${PORTAL_URL}/c/${c.clientId}/hires/${c.id}`, ...sender }).catch(() => undefined);
  return h;
}

/** Short-lived links to a photo kept in storage. */
export async function signed(db: SupabaseClient, path: string | undefined, seconds = 3600) {
  if (!path || !/^hires\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.jpg$/.test(path)) return undefined;
  const { data } = await db.storage.from("client-files").createSignedUrl(path, seconds);
  return data?.signedUrl ?? undefined;
}
