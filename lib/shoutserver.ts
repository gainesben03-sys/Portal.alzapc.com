// Server side of shoutouts: find the company, screen every message, save it, and let people know.
import { createHmac } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claude, parseJson } from "./ai";
import type { ClientConfig } from "./modules";
import { advisorEmails, pushTo } from "./push";
import { RecognitionSettings, shortName, Shoutout, ShoutChannel } from "./recognition";
import { sendEmail } from "./server";
import type { TeamMember } from "./team";

type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type ShoutClient = { id: string; name: string; config: ClientConfig; rec: RecognitionSettings };

const on = (cfg: ClientConfig) => !!(cfg.modules as D | undefined)?.recognition && !!cfg.recognition?.token;

export async function clientByToken(db: SupabaseClient, token: string): Promise<ShoutClient | null> {
  if (!/^[A-Za-z0-9]{16,64}$/.test(token)) return null;
  const { data } = await db.from("clients").select("id, name, config").eq("config->recognition->>token", token).maybeSingle();
  const cfg = (data?.config ?? {}) as ClientConfig;
  return data && on(cfg) ? { id: data.id, name: data.name, config: cfg, rec: cfg.recognition! } : null;
}
export async function clientBySms(db: SupabaseClient, number: string): Promise<ShoutClient | null> {
  const { data } = await db.from("clients").select("id, name, config").eq("config->recognition->>smsNumber", number).maybeSingle();
  const cfg = (data?.config ?? {}) as ClientConfig;
  return data && on(cfg) ? { id: data.id, name: data.name, config: cfg, rec: cfg.recognition! } : null;
}
export async function rosterFor(db: SupabaseClient, clientId: string): Promise<TeamMember[]> {
  const { data } = await db.from("people").select("id, data").eq("client_id", clientId);
  return (data ?? []).map((r) => ({ ...(r.data as TeamMember), id: r.id as string, clientId })).filter((p) => p.active !== false);
}

// ---------- screening ----------

const BLOCK = /\b(f+u+c+k\w*|sh+i+t+\w*|bitch\w*|cunt\w*|dick\w*|puss(y|ies)|asshole\w*|bastard\w*|retard\w*|whore\w*|slut\w*|n[i1]gg\w*|fag\w*|kill (yo)?u|hate (yo)?u|stupid|idiot|dumb\w*|ugly|sexy|hot body)\b/i;
const PRIVATE = /(\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b|[\w.+-]+@[\w-]+\.[\w.]+|\b\d{3}-\d{2}-\d{4}\b)/;

/** Is this a shoutout that can go on the wall? Anything questionable is held for a person to look at. */
export async function screen(message: string, toName: string): Promise<{ ok: boolean; reason?: string }> {
  const m = message.trim();
  if (m.length < 3) return { ok: false, reason: "Too short" };
  if (BLOCK.test(m)) return { ok: false, reason: "Language filter" };
  if (PRIVATE.test(m)) return { ok: false, reason: "Has a phone number or email" };
  const r = await claude({
    system: `You screen employee recognition messages ("shoutouts") before they appear on a company's public recognition wall. Reply with JSON only: {"ok": true} or {"ok": false, "reason": "a few words"}.
ok: false when the message is: insulting, sarcastic or backhanded; a joke at someone's expense; about looks, bodies, dating or anything sexual; about age, race, ethnicity, national origin, religion, gender, sexual orientation, pregnancy, disability, health or medical issues; about someone's personal life, family or money; mentions discipline, complaints, investigations or someone being fired; threatening; political; spam or nonsense; or not actually recognizing something they did at work.
ok: true for sincere thanks or praise for work, effort, helping others, safety, customers, attitude at work. Short and simple is fine. English or Spanish. When unsure, ok: false.`,
    messages: [{ role: "user", content: `Shoutout to ${toName}:\n"""${m.slice(0, 600)}"""` }],
    maxTokens: 60,
  });
  if (!r.ok) return { ok: true }; // the filter above already ran; don't block recognition if screening is down
  const j = parseJson<{ ok: boolean; reason?: string }>(r.text);
  return j && j.ok === false ? { ok: false, reason: String(j.reason ?? "Flagged").slice(0, 80) } : { ok: true };
}

// ---------- texting (Twilio) ----------

export const smsReady = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

export async function sendSms(db: SupabaseClient, to: string, from: string | undefined, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  const sender = from || process.env.TWILIO_FROM;
  if (!sid || !tok || !sender || !to) return false;
  const { data: out } = await db.from("sms_optouts").select("phone").eq("phone", to).maybeSingle();
  if (out) return false; // they said STOP: never text them
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${tok}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: sender, Body: body.slice(0, 640) }).toString(),
  }).catch(() => null);
  return !!r?.ok;
}

// ---------- the engine ----------

export async function createShout(
  db: SupabaseClient,
  site: string,
  c: ShoutClient,
  input: { to: TeamMember; from: Shoutout["from"]; value?: string; message: string; channel: ShoutChannel; lang?: "en" | "es" }
): Promise<Shoutout> {
  const message = input.message.replace(/\s+/g, " ").trim().slice(0, 280);
  const value = input.value && c.rec.values.includes(input.value) ? input.value : undefined;
  const check = await screen(message, input.to.name);
  // a typed-in name (not picked from the list or texted from a known number) always gets a quick look
  const held = !check.ok || (!input.from.verified && !input.from.personId);
  const s: Shoutout = {
    id: `so${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    clientId: c.id,
    to: { personId: input.to.id, name: input.to.name, department: input.to.department, location: input.to.location },
    from: input.from,
    value,
    message,
    channel: input.channel,
    status: held ? "held" : "live",
    heldReason: held ? check.reason ?? "Check the sender" : undefined,
    at: new Date().toISOString(),
    lang: input.lang,
  };
  const { error } = await db.from("shoutouts").insert({ id: s.id, client_id: c.id, data: s });
  if (error) throw new Error(error.message);
  if (s.status === "live") await tellThem(db, site, c, s, input.to);
  else await tellReviewers(db, site, c, s);
  return s;
}

/** Let the person (and their manager) know. Email if we have it, text if they've opted in. */
export async function tellThem(db: SupabaseClient, site: string, c: ShoutClient, s: Shoutout, to?: TeamMember) {
  const person = to ?? (await rosterFor(db, c.id)).find((p) => p.id === s.to.personId);
  if (!person) return;
  const link = `${site}/shout/${c.rec.token}?s=${s.id}`;
  const from = shortName(s.from.name);
  const line = `${from} gave you a shoutout${s.value ? ` for ${s.value}` : ""}: "${s.message}"`;
  if (person.email)
    await sendEmail({
      to: [person.email],
      subject: `🎉 ${from} gave you a shoutout`,
      text: `Hi ${person.name.split(" ")[0]},\n\n${line}\n\nSee it on the ${c.name} wall: ${link}\n\nPass it on: recognize someone who made your day better. ${site}/shout/${c.rec.token}`,
      fromName: `${c.name} Shoutouts`,
    }).catch(() => undefined);
  if (person.cell && smsReady()) await sendSms(db, person.cell, c.rec.smsNumber, `${c.name}: ${line} ${link}\nReply STOP to stop texts.`);
  if (c.rec.notifyManagers !== false && person.managerEmail && person.managerEmail !== person.email)
    await sendEmail({
      to: [person.managerEmail],
      subject: `${person.name.split(" ")[0]} got a shoutout`,
      text: `${person.name} got a shoutout from ${from}${s.value ? ` for ${s.value}` : ""}:\n\n"${s.message}"\n\nA quick "I saw this, nice work" from you goes a long way.\n\n${link}`,
      fromName: `${c.name} Shoutouts`,
    }).catch(() => undefined);
}

/** Something's waiting for review: tell Ben (and the bell). */
export async function tellReviewers(db: SupabaseClient, site: string, c: ShoutClient, s: Shoutout) {
  const href = `/c/${c.id}/recognition?review=1`;
  const text = `A shoutout to ${s.to.name} is waiting for review (${s.heldReason ?? "flagged"})`;
  await db.from("notices").insert({ id: `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, client_id: c.id, created_by: "shoutouts@portal", data: { clientId: c.id, kind: "feedback", text, href, at: s.at, read: false } });
  await pushTo(db, await advisorEmails(db), "activity", { title: "Shoutout to review", body: `${c.name}: to ${s.to.name}`, url: href, tag: `shout-${s.id}` });
  await sendEmail({ to: [(process.env.NOTIFY_TO || "ben@alzapc.com").trim()], subject: `[Portal] ${c.name}: shoutout waiting for review`, text: `${text}.\n\nFrom: ${s.from.name}${s.from.verified ? "" : " (not verified)"}\nTo: ${s.to.name}\n"${s.message}"\n\nApprove or remove: ${site}${href}` });
}

/** Fuzzy match a typed name against the roster. */
export function matchPeople(roster: TeamMember[], q: string): TeamMember[] {
  const t = q.toLowerCase().replace(/[^a-záéíóúñü\s'-]/gi, " ").trim();
  if (t.length < 2) return [];
  const words = t.split(/\s+/);
  const exact = roster.filter((p) => p.name.toLowerCase() === t);
  if (exact.length) return exact;
  return roster.filter((p) => words.every((w) => p.name.toLowerCase().split(/\s+/).some((n) => n.startsWith(w)))).slice(0, 8);
}

// ---------- celebrations ----------

/** Today's date where the company is (Pacific), for birthdays and anniversaries. */
export const localToday = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));

/** A link-only key so the opt-out link in an email can't be guessed for someone else. */
export function optOutKey(clientId: string, personId: string) {
  const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "alza";
  return createHmac("sha256", secret).update(`celebrate:${clientId}:${personId}`).digest("hex").slice(0, 24);
}
