// Alza Perform on the server: who can see which reviews, the writing help, emails and the schedule.
import { withOneClick } from "./oneclick";
import { claude, parseJson } from "./ai";
import { emailLogoUrl, readableInk } from "./brand";
import { esc, frameEmail, onboardingFor, senderFor, type Brand } from "./hires";
import type { ClientConfig } from "./modules";
import {
  daysUntil, first, iso, KIND_LABEL, Lang, newReview, newToken, nextDue, PerformSettings, performFor, Review, stageOf, templateById,
} from "./perform";
import { admin, PORTAL_URL, sendEmail, type Caller } from "./server";
import type { TeamMember } from "./team";

export type DB = ReturnType<typeof admin>;
export type Ctx = { db: DB; clientId: string; company: string; cfg: ClientConfig; s: PerformSettings; brand: Brand; sender: ReturnType<typeof senderFor> };

export async function loadCtx(db: DB, clientId: string): Promise<Ctx | null> {
  const { data: cl } = await db.from("clients").select("name, config").eq("id", clientId).maybeSingle();
  if (!cl) return null;
  const cfg = (cl.config ?? {}) as ClientConfig;
  return {
    db, clientId, company: cl.name, cfg, s: performFor(cfg.perform),
    brand: { company: cl.name, accent: cfg.accent || "#19283c", logoUrl: emailLogoUrl(clientId, cfg.logo, cfg.logoEmail, PORTAL_URL) },
    sender: senderFor(onboardingFor(cfg.onboarding), cl.name),
  };
}

/** What this person can do with reviews at this client. */
export function roleOf(who: Caller, x: Ctx) {
  const email = who.email.toLowerCase();
  const adminRole = who.advisor || x.s.admins.includes(email);
  const exec = who.execOf.includes(x.clientId);
  return { email, admin: adminRole, exec, member: who.memberOf.includes(x.clientId) || who.advisor, ben: who.advisor };
}
export type Role = ReturnType<typeof roleOf>;
export const canOpen = (r: Review, role: Role, s: PerformSettings) => role.admin || r.managerEmail === role.email || (role.exec && s.execRead);
export const canEdit = (r: Review, role: Role) => role.admin || r.managerEmail === role.email;

export async function roster(db: DB, clientId: string): Promise<TeamMember[]> {
  const { data } = await db.from("people").select("id, data").eq("client_id", clientId);
  return (data ?? []).map((r) => ({ ...(r.data as TeamMember), id: r.id as string, clientId }));
}
export async function allReviews(db: DB, clientId: string): Promise<Review[]> {
  const { data } = await db.from("perform_reviews").select("id, data").eq("client_id", clientId).order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({ ...(r.data as Review), id: r.id as string }));
}
export async function getReview(db: DB, id: string, clientId?: string): Promise<Review | null> {
  let q = db.from("perform_reviews").select("id, client_id, data").eq("id", id);
  if (clientId) q = q.eq("client_id", clientId);
  const { data } = await q.maybeSingle();
  return data ? { ...(data.data as Review), id: data.id as string, clientId: data.client_id as string } : null;
}
export async function putReview(db: DB, r: Review) {
  const { id, ...data } = r;
  const { error } = await db.from("perform_reviews").upsert({ id, client_id: r.clientId, data: { ...data, id } });
  return !error;
}
export const log = (r: Review, by: string, text: string): Review => ({ ...r, history: [...r.history, { at: new Date().toISOString(), by, text }].slice(-80) });

/**
 * Keep reviews in step with the roster and settings: open reviews that are coming due, cancel ones for
 * people who left, and move open reviews to a new manager. Safe to run any number of times.
 */
export async function sync(x: Ctx, today = iso(new Date())) {
  if (!x.cfg.modules?.perform) return { opened: 0, cancelled: 0, moved: 0, added: 0 };
  const [people, reviews] = await Promise.all([roster(x.db, x.clientId), allReviews(x.db, x.clientId)]);
  let opened = 0, cancelled = 0, moved = 0;
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const r of reviews) {
    if (r.status !== "open") continue;
    const p = byId.get(r.personId);
    if (!p || p.active === false) {
      await putReview(x.db, log({ ...r, status: "cancelled" }, "Alza", "Cancelled: no longer on the roster"));
      cancelled++;
    } else if ((p.managerEmail || "").toLowerCase() !== r.managerEmail && p.managerEmail) {
      await putReview(x.db, log({ ...r, managerEmail: p.managerEmail.toLowerCase(), managerName: p.managerName }, "Alza", `Moved to ${p.managerName}, the new manager`));
      moved++;
    }
  }
  // reviews open on their own only when the company turned that on; otherwise HR launches them
  for (const p of x.s.autoOpen ? people : []) {
    if (p.active === false || !p.managerEmail) continue;
    for (const d of nextDue({ ...p, active: true }, x.s, today, 1)) {
      if (daysUntil(d.due, today) > x.s.openDays) continue;
      // one review per person per due date and kind; an intro review never replaces the regular one
      if (reviews.some((r) => r.personId === p.id && r.kind === d.kind && Math.abs(daysUntil(r.due, d.due)) < 45)) continue;
      const r = newReview({ ...p, active: true }, x.clientId, d, templateById(x.s, d.template), "Alza");
      await putReview(x.db, r);
      reviews.push(r);
      opened++;
    }
  }
  const open = reviews.filter((r) => r.status === "open" && r.managerEmail);
  const added = await ensureManagerAccess(x.db, x.clientId, open.map((r) => ({ email: r.managerEmail, name: r.managerName }))).catch(() => []);
  return { opened, cancelled, moved, added: added.length };
}

/**
 * Managers need Hub access to open a review. Anyone a review is assigned to who isn't on the
 * company's People Hub yet gets Manager access (their own team only). Returns the names added.
 */
export async function ensureManagerAccess(db: DB, clientId: string, mgrs: { email: string; name: string }[]): Promise<string[]> {
  const want = new Map<string, string>();
  for (const m of mgrs) {
    const e = (m.email || "").trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !want.has(e)) want.set(e, m.name || e);
  }
  if (!want.size) return [];
  const emails = [...want.keys()];
  const [{ data: have }, { data: adv }] = await Promise.all([
    db.from("members").select("email").eq("client_id", clientId).in("email", emails),
    db.from("advisors").select("email").in("email", emails),
  ]);
  const skip = new Set([...(have ?? []), ...(adv ?? [])].map((r) => String(r.email).toLowerCase()));
  const add = emails.filter((e) => !skip.has(e));
  if (!add.length) return [];
  // no People Brief for them: that's for executives
  const { error } = await db.from("members").upsert(add.map((e) => ({ client_id: clientId, email: e, name: want.get(e)!, role: "Manager", access: "manager", huddle: false, invited: true, added_by: "Reviews" })), { onConflict: "client_id,email", ignoreDuplicates: true });
  return error ? [] : add.map((e) => want.get(e)!);
}

// ---------- writing help ----------
const RULES = `You help a manager turn their notes into a polished, professional performance review. Hard rules:
- Use ONLY what the manager wrote or said. Never add accomplishments, problems, numbers, dates, examples or opinions they didn't give.
- Never give or suggest a rating. Never recommend pay, promotion, discipline, termination or any employment decision.
- Never guess at anyone's gender, age, health, family, religion, national origin or other personal traits. Use the employee's first name or "you" instead of he or she.
- Keep the manager's meaning and strength. Don't soften a concern into praise or inflate praise. If something is vague, keep it vague and list it under "vague" so the manager can add an example.
- Plain, professional, warm. No em dashes, no corporate filler, no exaggeration.
Reply with JSON only.`;

// How the drafts should read. The facts stay the manager's; the writing is ours.
const CRAFT = `How to write it:
- Don't just tidy their notes. Rewrite them as a real review: complete sentences that flow, organized so the strongest or most important point comes first.
- Reframe casual or shorthand phrasing into professional language. "good w/ customers, never late" becomes "You handle customers with patience and care, and you're someone the team can count on to be here on time." Only keep details they gave; "patience and care" is fine only if their notes point to it.
- For strengths, name the behavior and, when the manager mentioned it, the effect it has on the team, customers or work.
- For areas to improve, be clear and constructive: name what needs to change and what good looks like, using the manager's own point. No hedging, no harshness.
- For how the manager will help, write it as the manager's commitment.
- 2 to 5 sentences per item.`;

const clip = (s: string, n: number) => s.replace(/\r/g, "").trim().slice(0, n);
const LANG_NAME: Record<Lang, string> = { en: "English", es: "Spanish (neutral Latin American)" };

/** Notes to clear, professional feedback. tone: "" | "shorter" | "warmer" | "specific". */
export async function polish(o: { firstName: string; asks: { id: string; q: string }[]; answers: Record<string, string>; tone?: string; voice?: string; lang: Lang }) {
  const items = o.asks.map((a) => ({ id: a.id, question: a.q, notes: clip(o.answers[a.id] ?? "", 2000) })).filter((a) => a.notes);
  if (!items.length) return { ok: false as const, reason: "empty" };
  const tone = o.tone === "shorter" ? "Make it shorter and tighter." : o.tone === "warmer" ? "Make it warmer and more encouraging." : o.tone === "specific" ? "Make it more specific and organized using only the details given." : "";
  const voice = o.voice === "about"
    ? `Write about the employee in third person, using ${o.firstName}'s name (not he or she). Write the manager's commitments in first person ("I will").`
    : `Write directly to the employee in second person ("you", "your"), as the manager speaking to ${o.firstName}. Write the manager's commitments in first person ("I will").`;
  const r = await claude({
    system: RULES,
    maxTokens: 3000,
    messages: [{ role: "user", content: `Employee first name: ${o.firstName}\nWrite in ${LANG_NAME[o.lang]}.\n${voice}\n${CRAFT}\n${tone}\nFor each item, write the review text that answers the question from the manager's notes.\nItems:\n${JSON.stringify(items)}\nReturn {"written": {"<id>": "<text>"}, "vague": ["<short phrase from the notes that needs an example>"]}` }],
  });
  if (!r.ok) return { ok: false as const, reason: r.reason };
  const j = parseJson<{ written?: Record<string, string>; vague?: string[] }>(r.text);
  if (!j?.written) return { ok: false as const, reason: "parse" };
  const written: Record<string, string> = {};
  for (const a of items) if (typeof j.written[a.id] === "string") written[a.id] = clip(j.written[a.id], 2500).replace(/—/g, ", ");
  return { ok: true as const, written, vague: (j.vague ?? []).filter((v) => typeof v === "string").slice(0, 3).map((v) => clip(v, 120)) };
}

/** A talked-through ramble, sorted into the template's questions. Their words, lightly cleaned. */
/** Goal ideas drawn only from the manager's own feedback. The manager picks and edits. */
export async function suggestGoals(o: { firstName: string; feedback: { q: string; a: string }[]; lowAreas: string[]; prevGoals: string[]; lang: Lang }) {
  const r = await claude({
    system: `${RULES}
You suggest goals for an employee's next review period, drawn ONLY from the manager's feedback below. Each goal must trace back to something the manager actually wrote (an area to work on, a strength to build on, or a low-rated area they commented on). If the feedback doesn't support a goal, suggest fewer. Never invent problems or numbers the manager didn't give. When there's no number, make the measure observable (what the manager will see), not a made-up target.`,
    maxTokens: 900,
    messages: [{ role: "user", content: `Employee first name: ${o.firstName}\nWrite in ${LANG_NAME[o.lang]}.\nManager's feedback:\n${o.feedback.map((f) => `- ${f.q}: ${f.a}`).join("\n")}${o.lowAreas.length ? `\nRated below expectations: ${o.lowAreas.join(", ")}` : ""}${o.prevGoals.length ? `\nLast period's goals (avoid repeating unless the feedback says to): ${o.prevGoals.join("; ")}` : ""}\nSuggest 1 to 3 goals. Each: a short goal (under 12 words, starts with a verb), how it will be measured (one short phrase), and when ("By the next review", or a timeframe the manager mentioned).\nReturn {"goals":[{"text":"","measure":"","by":""}]}` }],
  });
  if (!r.ok) return { ok: false as const, reason: r.reason };
  const j = parseJson<{ goals?: { text?: string; measure?: string; by?: string }[] }>(r.text);
  const goals = (j?.goals ?? []).filter((g) => g.text?.trim()).slice(0, 3).map((g) => ({ text: clip(g.text!, 140).replace(/—/g, ", "), measure: clip(g.measure ?? "", 160).replace(/—/g, ", "), by: clip(g.by ?? "", 60) }));
  return { ok: true as const, goals };
}

export async function sortTalk(o: { firstName: string; asks: { id: string; q: string }[]; transcript: string; lang: Lang }) {
  const t = clip(o.transcript, 6000);
  if (!t) return { ok: false as const, reason: "empty" };
  const r = await claude({
    system: RULES,
    maxTokens: 1500,
    messages: [{ role: "user", content: `Employee first name: ${o.firstName}\nThe manager talked through their review. Sort what they said into these questions, written in ${LANG_NAME[o.lang]} as clear sentences. Leave a question empty if they didn't speak to it.\nQuestions: ${JSON.stringify(o.asks)}\nWhat they said: """${t}"""\nReturn {"answers": {"<id>": "<text or empty>"}, "vague": ["<short phrase that needs an example>"]}` }],
  });
  if (!r.ok) return { ok: false as const, reason: r.reason };
  const j = parseJson<{ answers?: Record<string, string>; vague?: string[] }>(r.text);
  if (!j?.answers) return { ok: false as const, reason: "parse" };
  const answers: Record<string, string> = {};
  for (const a of o.asks) answers[a.id] = typeof j.answers[a.id] === "string" ? clip(j.answers[a.id], 2500).replace(/—/g, ", ") : "";
  return { ok: true as const, answers, vague: (j.vague ?? []).filter((v) => typeof v === "string").slice(0, 3).map((v) => clip(v, 120)) };
}

// ---------- review coach: one question at a time, by voice or typing ----------
export type CoachKind = "good" | "thin" | "none" | "unclear" | "elsewhere" | "sensitive";

/** Reads the manager's latest answer and decides the next line of the conversation. Never writes the review. */
export async function coachTurn(o: { firstName: string; lang: Lang; asks: { id: string; q: string }[]; current: string; said: string; sofar: string; attempt: number; followed: boolean }) {
  const said = clip(o.said, 2000);
  if (!said) return { ok: false as const, reason: "empty" };
  const cur = o.asks.find((a) => a.id === o.current);
  if (!cur) return { ok: false as const, reason: "bad_request" };
  const r = await claude({
    system: `You coach a manager through writing a review for ${o.firstName}, one question at a time, like a friendly HR partner. You only decide the next line of the conversation. Hard rules:
- Never rate, score or rank ${o.firstName}. Never suggest pay, promotion, discipline or termination.
- Never use em dashes. Plain, warm, short: at most 2 sentences, under 40 words. Write in ${LANG_NAME[o.lang]}.
- Use the name ${o.firstName}, not he or she.
Classify the manager's latest reply to the current question:
- "sensitive": it mentions health, medical issues, injury, leave, pregnancy, disability, age, family or caregiving, religion, national origin, race, accent, or anything protected or personal. Reply by asking them to keep the review about work and what they see on the job, then re-ask the question in a simpler way.
- "none": not an answer ("idk", "not sure", "nothing", "n/a", "pass"). attempt 1: re-ask as an easier, concrete question (for example "Think about the last few weeks..."). attempt 2 or more: tell them it's fine to leave it for now and they can tap Skip.
- "unclear": too short to use, gibberish, or not about ${o.firstName}'s work. Ask for a bit more, gently.
- "elsewhere": a real answer, but it clearly answers a different question in the list better than the current one. Give that question's id in "fileUnder". Reply: say you'll put it there, then re-ask the current question briefly.
- "thin": a real answer to the current question that is vague (no example, no specifics, or no "what good looks like" for a concern) AND followed is false. Reply with ONE short follow-up asking for an example or specifics.
- "good": a real answer to the current question. Reply with a 2 to 6 word acknowledgement only (for example "Got it." or "That's helpful.").
Reply with JSON only: {"kind":"...","fileUnder":"<question id or empty>","reply":"..."}`,
    maxTokens: 300,
    messages: [{ role: "user", content: `Questions: ${JSON.stringify(o.asks)}\nCurrent question id: ${cur.id} ("${cur.q}")\nWhat they've already said for it: """${clip(o.sofar, 1500)}"""\nattempt: ${o.attempt}\nfollowed: ${o.followed}\nLatest reply: """${said}"""` }],
  });
  if (!r.ok) return { ok: false as const, reason: r.reason };
  const j = parseJson<{ kind?: string; fileUnder?: string; reply?: string }>(r.text);
  const kinds: CoachKind[] = ["good", "thin", "none", "unclear", "elsewhere", "sensitive"];
  if (!j?.kind || !kinds.includes(j.kind as CoachKind)) return { ok: false as const, reason: "parse" };
  let kind = j.kind as CoachKind;
  const fileUnder = kind === "elsewhere" && o.asks.some((a) => a.id === j.fileUnder && a.id !== cur.id) ? String(j.fileUnder) : "";
  if (kind === "elsewhere" && !fileUnder) kind = "good";
  if (kind === "thin" && o.followed) kind = "good";
  return { ok: true as const, kind, fileUnder, reply: clip(String(j.reply ?? ""), 300).replace(/—/g, ", ") };
}

/** What the manager said, per question, turned into clear written sentences in their own words. Goals come out as a list. */
export async function coachDraft(o: { firstName: string; lang: Lang; asks: { id: string; q: string }[]; said: Record<string, string>; goals: string }) {
  const said = Object.fromEntries(o.asks.map((a) => [a.id, clip(o.said[a.id] ?? "", 3000)]).filter(([, v]) => v));
  const goals = clip(o.goals, 2000);
  if (!Object.keys(said).length && !goals) return { ok: false as const, reason: "empty" };
  const r = await claude({
    system: RULES,
    maxTokens: 2000,
    messages: [{ role: "user", content: `Employee first name: ${o.firstName}\nThe manager answered these review questions out loud. For each question they answered, write a well-written review paragraph in ${LANG_NAME[o.lang]}, speaking to ${o.firstName} ("you"), in the manager's voice ("I").\n${CRAFT}\n- Write 3 to 5 sentences per question, like a thoughtful narrative about ${o.firstName}, not a list of notes.\n- Build out what the manager said: say what it looks like day to day, why it matters to the team or the work, and what to keep doing or change, but only where their words support it.\n- Never add facts, examples, numbers, dates, people, events or opinions they didn't give. If they said very little, write fewer sentences rather than make anything up.\n- Keep every point they made and its strength.\n- This is speech-to-text, so interpret it rather than copy it. Rewrite their meaning as clean, grammatical sentences. Never paste their words in as they came out.\n- Fix grammar when turning it into "you": "you haven't", "you are", "you were", "you don't", never "you hasn't" or "you is".\n- Drop words that are clearly mishearings or make no sense in context. Don't guess what they meant; leave that part out.\n- Lines aimed at you, like "help me say that nicely" or "put that in a better way", are instructions for how to write it, not content. Follow them and never include them.\n- Keep a respectful, direct tone even when what they said was blunt or frustrated. Keep the substance of any concern, without sarcasm or exaggeration.\nLeave out any question they didn't answer.\nQuestions: ${JSON.stringify(o.asks)}\nWhat they said: ${JSON.stringify(said)}\nGoals they said: """${goals}"""\nTurn the goals into up to 4 separate goals, each one clear and specific in a single sentence using only what they said. "measure" and "by" only if they said them, else "".\nReturn {"answers": {"<id>": "<text>"}, "goals": [{"text": "", "measure": "", "by": ""}]}` }],
  });
  if (!r.ok) return { ok: false as const, reason: r.reason };
  const j = parseJson<{ answers?: Record<string, string>; goals?: { text?: string; measure?: string; by?: string }[] }>(r.text);
  if (!j) return { ok: false as const, reason: "parse" };
  const answers: Record<string, string> = {};
  for (const a of o.asks) if (typeof j.answers?.[a.id] === "string" && j.answers[a.id].trim()) answers[a.id] = clip(j.answers[a.id], 2500).replace(/—/g, ", ");
  const g = (j.goals ?? []).filter((x) => x?.text?.trim()).slice(0, 4).map((x) => ({ text: clip(String(x.text), 200).replace(/—/g, ", "), measure: clip(String(x.measure ?? ""), 200), by: clip(String(x.by ?? ""), 60) }));
  return { ok: true as const, answers, goals: g };
}

/** Straight translation, nothing added or softened. */
export async function translate(fields: Record<string, string>, to: Lang) {
  const items = Object.fromEntries(Object.entries(fields).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, clip(v, 3000)]));
  if (!Object.keys(items).length) return { ok: true as const, fields: {} as Record<string, string> };
  const r = await claude({
    system: `You translate workplace documents into ${LANG_NAME[to]}. Translate faithfully: same meaning, same strength, nothing added, removed or softened. Keep names as they are. Plain, respectful, professional. No em dashes. If a value is already in ${LANG_NAME[to]}, return it exactly as written. Reply with JSON only.`,
    maxTokens: 3000,
    messages: [{ role: "user", content: `Translate every value. Keep the keys.\n${JSON.stringify(items)}\nReturn {"fields": {"<key>": "<translation>"}}` }],
  });
  if (!r.ok) return { ok: false as const, reason: r.reason };
  const j = parseJson<{ fields?: Record<string, string> }>(r.text);
  if (!j?.fields) return { ok: false as const, reason: "parse" };
  const out: Record<string, string> = {};
  for (const k of Object.keys(items)) if (typeof j.fields[k] === "string") out[k] = clip(j.fields[k], 3500).replace(/—/g, ", ");
  return { ok: true as const, fields: out };
}

// ---------- emails ----------
const P = (t: string, extra = "") => `<p style="margin:0 0 14px 0;font-family:Arial,sans-serif;font-size:15px;line-height:24px;color:#1C1A19;${extra}">${t}</p>`;
const button = (t: string, url: string, color: string) => `<a href="${esc(url)}" style="display:inline-block;margin:6px 0 4px;padding:13px 24px;border-radius:6px;background:${color};color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none">${esc(t)}</a>`;
function mail(b: Brand, heading: string, paras: string[], cta?: { label: string; url: string }) {
  const ink = readableInk(b.accent);
  const inner = `<p style="margin:30px 0 14px 0;font-family:Georgia,serif;font-size:26px;line-height:32px;color:#1C1A19">${esc(heading)}</p>${paras.map((p) => P(esc(p))).join("")}${cta ? button(cta.label, cta.url, ink) : ""}<!--HERO_END-->`;
  return { html: frameEmail({ ...b, bar: b.bar ?? b.accent, accent: ink }, inner), text: [heading, ...paras, cta ? `${cta.label}: ${cta.url}` : ""].filter(Boolean).join("\n\n") };
}

/** Reminder to the manager. days < 0 = overdue. */
export function managerEmail(x: Ctx, r: Review, days: number, lang: Lang = "en") {
  const f = first(r.name);
  const what = KIND_LABEL[r.kind][lang].toLowerCase();
  const url = `${PORTAL_URL}/c/${x.clientId}/reviews/${r.id}`;
  const es = lang === "es";
  const subject = days < 0 ? (es ? `La ${what} de ${f} está atrasada` : `${f}'s ${what} is overdue`) : days === 0 ? (es ? `La ${what} de ${f} vence hoy` : `${f}'s ${what} is due today`) : es ? `La ${what} de ${f} vence en ${days} días` : `${f}'s ${what} is due in ${days} days`;
  const body = days < 0
    ? es ? [`La ${what} de ${r.name} está atrasada. Termínela o avise a RR. HH. si hay que reasignarla.`] : [`${r.name}'s ${what} is overdue. Please finish it, or let HR know if it needs to go to someone else.`]
    : es ? [`Puede empezar a prepararla ahora. Toma unos ${r.template.minutes} minutos, en el teléfono o la computadora, y se guarda sola.`] : [`You can start it now. It takes about ${r.template.minutes} minutes, on your phone or computer, and saves as you go.`];
  return { subject, ...mail(x.brand, subject, body, { label: es ? "Abrir la evaluación" : "Open the review", url }) };
}

const names = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const md = (d: string) => new Date(d + "T12:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });

/** To a manager when HR launches reviews: who, when, and that it's quick. */
export function launchEmail(x: Ctx, managerName: string, rs: Review[], selfNote: string) {
  const n = rs.length;
  const due = rs.map((r) => r.due).sort()[0];
  const subject = n === 1 ? `Time for ${first(rs[0].name)}'s review (due ${md(due)})` : `Time for ${n} reviews on your team (due ${md(due)})`;
  const body = [
    `Hi ${first(managerName)}, reviews are open for ${names(rs.map((r) => r.name))}. Please have ${n === 1 ? "it" : "them"} done by ${md(due)}.`,
    `Each one takes about ${rs[0].template.minutes} minutes, on your phone or computer, and saves as you go. You can rate, add a few words, and set goals. We'll help you put it into words if you want.`,
    ...(selfNote ? [selfNote] : []),
  ];
  return { subject, ...mail(x.brand, subject, body, { label: n === 1 ? "Open the review" : "Open your reviews", url: n === 1 ? `${PORTAL_URL}/c/${x.clientId}/reviews/${rs[0].id}` : `${PORTAL_URL}/c/${x.clientId}/reviews` }) };
}

/** A one-email nudge listing everything a manager still owes. */
export function nudgeEmail(x: Ctx, managerName: string, rs: Review[]) {
  const today = iso(new Date());
  const late = rs.filter((r) => r.due < today);
  const subject = late.length ? `Reminder: ${late.length} review${late.length === 1 ? " is" : "s are"} past due` : `Reminder: ${rs.length} review${rs.length === 1 ? "" : "s"} to finish`;
  const body = [
    `Hi ${first(managerName)}, a quick reminder from HR. Still to finish: ${names(rs.map((r) => `${r.name} (${r.due < today ? "past due" : `due ${md(r.due)}`})`))}.`,
    `Each takes about ${rs[0].template.minutes} minutes and picks up where you left off.`,
  ];
  return { subject, ...mail(x.brand, subject, body, { label: "Open your reviews", url: `${PORTAL_URL}/c/${x.clientId}/reviews` }) };
}

export function selfEmail(x: Ctx, r: Review, token: string, lang: Lang) {
  const es = lang === "es";
  const f = first(r.name);
  const subject = es ? `${f}, unas preguntas antes de su evaluación` : `${f}, a few questions before your review`;
  const body = es
    ? [`${first(r.managerName)} hablará con usted pronto sobre su desempeño. Cuatro preguntas cortas ayudan a que la conversación sea útil. Toma unos 5 minutos y solo lo ven su gerente y RR. HH.`]
    : [`${first(r.managerName)} will meet with you soon about your work. Four short questions help make the conversation useful. It takes about 5 minutes, and only your manager and HR see it.`];
  return { subject, ...mail(x.brand, subject, body, { label: es ? "Empezar" : "Start", url: `${PORTAL_URL}/my-review/${token}` }) };
}

export function shareEmail(x: Ctx, r: Review, token: string) {
  const es = r.lang === "es";
  const pip = r.kind === "pip";
  const subject = pip ? (es ? "Su plan de mejora está listo" : "Your improvement plan is ready") : es ? "Su evaluación está lista" : "Your performance review is ready";
  const body = pip
    ? es ? ["Revise el plan y confirme que lo recibió. Puede agregar un comentario."] : ["Please read the plan and confirm you received it. You can add a comment."]
    : es ? ["Revise los comentarios y confirme que la recibió. Puede agregar un comentario."] : ["Please review the feedback and confirm you received it. You can add a comment."];
  return { subject, ...mail(x.brand, subject, body, { label: es ? "Ver" : "View", url: `${PORTAL_URL}/my-review/${token}` }) };
}

export async function send(x: Ctx, to: string, m: { subject: string; html: string; text: string }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, reason: "no_email" };
  // links into the People Hub become one-click links for this person: tap and they're in
  const one = withOneClick(to, m);
  return sendEmail({ to: [to], subject: m.subject, html: one.html, text: one.text, ...x.sender });
}

/** Send the self-assessment link and record it. */
export async function sendSelf(x: Ctx, r: Review, by: string, personEmail?: string) {
  const to = (personEmail || "").trim().toLowerCase();
  if (!to) return { ok: false as const, reason: "no_email", review: r };
  const token = r.self?.token ?? newToken();
  const lang = r.self?.lang ?? r.lang;
  const m = await send(x, to, selfEmail(x, r, token, lang));
  if (!m.ok) return { ok: false as const, reason: m.reason ?? "send", review: r };
  const next = log({ ...r, self: { ...(r.self ?? {}), token, sentAt: new Date().toISOString(), lang } }, by, `Self-assessment sent to ${to}`);
  await putReview(x.db, next);
  return { ok: true as const, review: next };
}

export const stage = (x: Ctx, r: Review) => stageOf(r, x.s);
