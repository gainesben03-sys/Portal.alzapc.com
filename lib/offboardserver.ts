// Server-only offboarding helpers: the goodbye email and taking someone off the roster.
import { emailLogoUrl } from "./brand";
import { onboardingFor, senderFor } from "./hires";
import type { ClientConfig } from "./modules";
import { Departure, goodbyeEmail, newToken, offboardFor } from "./offboard";
import { admin, sendEmail } from "./server";
import type { TeamMember } from "./team";

/** Send the goodbye email and record it. Used here and by the daily job. */
export async function sendGoodbye(db: ReturnType<typeof admin>, site: string, clientId: string, d: Departure, opts: { test?: string; by: string }) {
  const { data: cl } = await db.from("clients").select("name, config").eq("id", clientId).maybeSingle();
  if (!cl) return { ok: false, reason: "not_found" };
  const cfg = (cl.config ?? {}) as ClientConfig;
  const s = onboardingFor(cfg.onboarding);
  const o = offboardFor(cfg.offboarding);
  const to = opts.test || (d.personalEmail || d.workEmail || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to)) return { ok: false, reason: "no_email" };
  const survey = o.survey ? d.survey ?? { token: newToken() } : undefined;
  const brand = { company: cl.name, accent: cfg.accent || "#19283c", logoUrl: emailLogoUrl(clientId, cfg.logo, cfg.logoEmail, site) };
  const m = goodbyeEmail(d, o, s, brand, survey ? `${site}/exit/${survey.token}` : undefined);
  const r = await sendEmail({ to: [to], subject: opts.test ? `[Test] ${m.subject}` : m.subject, html: m.html, text: m.text, ...senderFor(s, cl.name) });
  if (!r.ok) return { ok: false, reason: r.reason ?? "send" };
  if (opts.test) return { ok: true, to };
  const at = new Date().toISOString();
  const next: Departure = { ...d, email: { ...d.email, sentAt: at, to }, survey: survey ? { ...survey, sentAt: survey.sentAt ?? at } : d.survey, history: [...d.history, { at, by: opts.by, text: `Goodbye email sent to ${to}${survey ? " with the exit survey" : ""}` }] };
  await db.from("departures").update({ data: next }).eq("id", d.id);
  return { ok: true, to, departure: next };
}

/** Mark them inactive on the roster (kept for history, never deleted) and record it. */
export async function offRoster(db: ReturnType<typeof admin>, clientId: string, d: Departure, by: string): Promise<Departure> {
  let pid = d.personId;
  if (!pid) {
    const { data: ppl } = await db.from("people").select("id, data").eq("client_id", clientId);
    pid = (ppl ?? []).find((r) => ((r.data as TeamMember).name || "").trim().toLowerCase() === d.name.trim().toLowerCase())?.id as string | undefined;
  }
  const at = new Date().toISOString();
  if (pid) {
    const { data: pr } = await db.from("people").select("data").eq("id", pid).eq("client_id", clientId).maybeSingle();
    if (pr) await db.from("people").update({ data: { ...(pr.data as TeamMember), active: false } }).eq("id", pid);
  }
  const next: Departure = { ...d, personId: pid, rosterRemovedAt: at, history: [...d.history, { at, by, text: pid ? "Taken off the team roster" : "Not found on the team roster" }] };
  await db.from("departures").update({ data: next }).eq("id", d.id);
  return next;
}
