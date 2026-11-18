// Alza Pulse on the server: storage, invitations, reminders, results and the AI pieces.
import { claude, noDash, parseJson, tidy } from "./ai";
import { loadCtx, mail, roster, type Ctx, type DB } from "./complianceserver";
import { newId, newToken } from "./perform";
import {
  Analysis, cleanSurvey, Invite, PQ, PResponse, redact, summarize, Summary, Survey, today,
} from "./pulse";
import { PORTAL_URL, sendEmail, type Caller } from "./server";

export { loadCtx };
export type { Ctx, DB };

export const isAdmin = (who: Caller, clientId: string) => who.advisor || who.execOf.includes(clientId);

export async function tableReady(db: DB) {
  const { error } = await db.from("pulse_surveys").select("id").limit(1);
  return !error;
}
export async function listSurveys(db: DB, clientId: string): Promise<Survey[]> {
  const { data } = await db.from("pulse_surveys").select("id, data").eq("client_id", clientId).order("created_at", { ascending: false }).limit(300);
  return (data ?? []).map((r) => ({ ...(r.data as Survey), id: r.id as string, clientId }));
}
export async function getSurvey(db: DB, id: string, clientId?: string): Promise<Survey | null> {
  let q = db.from("pulse_surveys").select("id, client_id, data").eq("id", id);
  if (clientId) q = q.eq("client_id", clientId);
  const { data } = await q.maybeSingle();
  return data ? { ...(data.data as Survey), id: data.id as string, clientId: data.client_id as string } : null;
}
export async function putSurvey(db: DB, s: Survey) {
  const { id, ...data } = s;
  const { error } = await db.from("pulse_surveys").upsert({ id, client_id: s.clientId, data: { ...data, id } });
  return !error;
}
export async function responsesFor(db: DB, surveyId: string): Promise<PResponse[]> {
  const { data } = await db.from("pulse_responses").select("id, day, data").eq("survey_id", surveyId).limit(5000);
  return (data ?? []).map((r) => ({ ...(r.data as PResponse), id: r.id as string, surveyId, day: String(r.day) }));
}
export async function invitesFor(db: DB, surveyId: string): Promise<Invite[]> {
  const { data } = await db.from("pulse_invites").select("token, done, data").eq("survey_id", surveyId).limit(5000);
  return (data ?? []).map((r) => ({ ...(r.data as Invite), token: r.token as string, done: !!r.done }));
}

// ---------- emails ----------
const first = (n: string) => (n || "").trim().split(/\s+/)[0] || "there";
export const linkFor = (token: string) => `${PORTAL_URL}/s/${token}`;
const minutes = (s: Survey) => Math.max(1, Math.round(s.questions.length * 0.25));
function inviteEmail(x: Ctx, s: Survey, inv: Invite, reminder: boolean) {
  const subject = reminder ? `Reminder: ${s.title}` : `${x.company} wants to hear from you`;
  const anon = s.privacy === "anonymous"
    ? "It's anonymous. Your name is never attached to your answers, and results only show for groups of 5 or more."
    : "It's confidential. Only HR sees individual answers, and leaders see combined results.";
  const body = [
    `Hi ${first(inv.name)}, ${reminder ? `there's still time to share your thoughts in "${s.title}".` : `we'd like your honest feedback in "${s.title}".`}`,
    `It takes about ${minutes(s)} minute${minutes(s) === 1 ? "" : "s"} on your phone${s.esReady ? ", in English or Spanish" : ""}. ${anon}`,
    `It closes ${new Date(`${s.closesAt}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.`,
  ];
  return { subject, ...mail(x.brand, reminder ? "Still time to share" : "Your voice matters", body, { label: "Take the survey", url: linkFor(inv.token) }) };
}

/** Make invitations for everyone in the audience who has an email and send them. */
export async function launch(x: Ctx, s: Survey): Promise<{ survey: Survey; sent: number; noEmail: number }> {
  const people = (await roster(x.db, x.clientId)).filter((p) => p.active !== false);
  const who = s.audience.all ? people : people.filter((p) => s.audience.personIds?.includes(p.id));
  if (!s.esReady) s = await translate(s);
  const existing = await invitesFor(x.db, s.id);
  let sent = 0;
  let noEmail = 0;
  for (const p of who) {
    if (existing.some((i) => i.personId === p.id)) continue;
    const inv: Invite = { token: newToken(), surveyId: s.id, clientId: x.clientId, personId: p.id, name: p.name, email: p.email?.toLowerCase(), done: false };
    if (!inv.email) noEmail++;
    const { error } = await x.db.from("pulse_invites").insert({ token: inv.token, survey_id: s.id, client_id: x.clientId, done: false, data: inv });
    if (error) throw new Error("save_failed");
    if (inv.email) {
      const m = inviteEmail(x, s, inv, false);
      const r = await sendEmail({ to: [inv.email], subject: m.subject, html: m.html, text: m.text, ...x.sender });
      if (r.ok) {
        sent++;
        await x.db.from("pulse_invites").update({ data: { ...inv, sentAt: new Date().toISOString() } }).eq("token", inv.token);
      }
    }
  }
  const next: Survey = { ...s, status: "open", launchedAt: s.launchedAt ?? new Date().toISOString(), invited: existing.length + who.filter((p) => !existing.some((i) => i.personId === p.id)).length };
  if (!(await putSurvey(x.db, next))) throw new Error("save_failed");
  return { survey: next, sent, noEmail };
}

/** Email everyone who hasn't answered. The person sending never learns who that is. */
export async function remind(x: Ctx, s: Survey): Promise<number> {
  const invs = (await invitesFor(x.db, s.id)).filter((i) => !i.done && i.email);
  let n = 0;
  for (const inv of invs) {
    const m = inviteEmail(x, s, inv, true);
    const r = await sendEmail({ to: [inv.email as string], subject: m.subject, html: m.html, text: m.text, ...x.sender });
    if (r.ok) n++;
  }
  await putSurvey(x.db, { ...s, reminded: [...(s.reminded ?? []), today()] });
  return n;
}

/** Results for the hiring team: numbers, plus written comments with names taken out. */
export async function results(x: Ctx, s: Survey, all: Survey[]): Promise<{ summary: Summary; respondents?: { name: string; answers: PResponse["answers"] }[] }> {
  const rs = await responsesFor(x.db, s.id);
  const prevSv = all.filter((y) => y.id !== s.id && y.templateId && y.templateId === s.templateId && y.status === "closed" && (y.closedAt ?? "") < (s.closedAt ?? s.launchedAt ?? "9")).sort((p, q) => (q.closedAt ?? "").localeCompare(p.closedAt ?? ""))[0];
  const prev = prevSv ? { sv: prevSv, rs: await responsesFor(x.db, prevSv.id) } : undefined;
  const summary = summarize(s, rs, prev);
  const names = (await roster(x.db, x.clientId)).map((p) => p.name);
  for (const q of summary.qs) if (q.comments) q.comments = q.comments.map((c) => redact(c, names));
  return { summary };
}

// ---------- AI ----------
const RULES = `You are an experienced HR consultant helping a small company understand an employee survey.
Rules:
- Work only from the data and comments given. Never invent numbers, quotes or causes.
- Say plainly when something can't be concluded (small groups, mixed signals, few comments).
- Never try to identify who wrote a comment. Never repeat names, emails, phone numbers or details that could identify someone; write [name] instead.
- Never recommend discipline, termination or any action about an individual employee.
- Plain, warm, direct language for a busy CEO. Short sentences. No em dashes. No jargon.`;

export async function analyze(x: Ctx, s: Survey, sum: Summary): Promise<Analysis | null> {
  if (sum.hidden) return null;
  const lines: string[] = [];
  lines.push(`Survey: ${s.title}. ${sum.n} responses of ${sum.invited || "?"} invited. Privacy: ${s.privacy}.`);
  if (sum.engagement !== undefined) lines.push(`Engagement: ${sum.engagement}% favorable${sum.prev?.engagement !== undefined ? ` (previous ${sum.prev.engagement}%)` : ""}.`);
  if (sum.enps !== undefined) lines.push(`eNPS: ${sum.enps}${sum.prev?.enps !== undefined ? ` (previous ${sum.prev.enps})` : ""}.`);
  lines.push("Areas (% favorable, previous if any):");
  for (const c of sum.cats) lines.push(`- ${c.name}: ${c.fav}%${c.prev !== undefined ? ` (was ${c.prev}%)` : ""}`);
  lines.push("Questions:");
  for (const q of sum.qs) {
    if (q.kind === "agree") lines.push(`- [${q.cat ?? ""}] ${q.text}: ${q.fav}% favorable, avg ${q.avg}/5, n=${q.n}${q.prevFav !== undefined ? `, was ${q.prevFav}%` : ""}`);
    else if (q.kind === "text") continue;
    else lines.push(`- ${q.text}: ${q.dist.filter((d) => d.count).map((d) => `${d.label} ${d.count}`).join(", ") || "no answers"}`);
  }
  const comments = sum.qs.filter((q) => q.kind === "text").flatMap((q) => (q.comments ?? []).map((c) => `[${q.text}] ${c}`)).slice(0, 400);
  const user = `${lines.join("\n")}\n\nWritten comments (${comments.length}):\n${comments.map((c, i) => `${i + 1}. ${c.slice(0, 600)}`).join("\n") || "none"}

Return JSON only:
{"headline":"one sentence, the single most important finding with its number",
"says":"what the numbers say, 1-2 sentences",
"suggests":"what the comments suggest, 1-2 sentences, or 'Too few comments to say.'",
"cantConclude":"what this survey can't tell you, 1 sentence",
"consider":"what leadership should consider doing, 1-2 sentences",
"strengths":["3 to 5 short items, what's going well, with numbers"],
"concerns":["3 to 5 short items, ranked by severity and how many it affects"],
"themes":[{"name":"short theme","count":number of comments,"sentiment":"positive|mixed|negative","summary":"2 sentences on what people are saying","quotes":["1-2 short representative comments, redacted"]}],
"quickWins":["low or no cost ideas employees suggested"],
"actions":[{"priority":"high|med|low","finding":"short","action":"specific action","timing":"e.g. 30 days, before open enrollment","metric":"how we'll know it worked"}],
"questions":["3-5 questions for a leadership discussion"],
"followUp":"what to measure again and when, 1 sentence"}`;
  const r = await claude({ system: RULES, messages: [{ role: "user", content: user }], maxTokens: 3500, temperature: 0.3 });
  if (!r.ok) return null;
  const j = parseJson<Partial<Analysis>>(r.text);
  if (!j?.headline) return null;
  const arr = (v: unknown, n = 6) => (Array.isArray(v) ? v.map((y) => noDash(String(y))).filter(Boolean).slice(0, n) : []);
  return tidy({
    at: new Date().toISOString(), n: sum.n, headline: noDash(j.headline), says: noDash(j.says), suggests: noDash(j.suggests), cantConclude: noDash(j.cantConclude), consider: noDash(j.consider),
    strengths: arr(j.strengths), concerns: arr(j.concerns), quickWins: arr(j.quickWins), questions: arr(j.questions), followUp: noDash(j.followUp),
    themes: (Array.isArray(j.themes) ? j.themes : []).slice(0, 8).map((t) => ({ name: noDash(t.name), count: Math.max(0, Number(t.count) || 0), sentiment: (["positive", "mixed", "negative"].includes(t.sentiment) ? t.sentiment : "mixed") as "positive" | "mixed" | "negative", summary: noDash(t.summary), quotes: arr(t.quotes, 2) })),
    actions: (Array.isArray(j.actions) ? j.actions : []).slice(0, 6).map((y) => ({ priority: (["high", "med", "low"].includes(y.priority) ? y.priority : "med") as "high" | "med" | "low", finding: noDash(y.finding), action: noDash(y.action), timing: noDash(y.timing), metric: noDash(y.metric) })),
  });
}

const BUILD = `You are an experienced HR consultant who designs employee surveys for small companies.
Write neutral, balanced questions that don't lead people toward an answer. One idea per question. Plain words, 8th grade reading level.
Never ask about protected traits (age, race, religion, disability, health, pregnancy, family plans, national origin, citizenship, sexual orientation, gender identity), pay history or anything that could identify someone in a small group.
Mix: mostly agree/disagree statements, a few pick-one or pick-several, and 1-2 written questions. No em dashes.`;
export async function buildSurvey(prompt: string): Promise<{ title: string; intro: string; questions: PQ[] } | null> {
  const r = await claude({
    system: BUILD,
    messages: [{ role: "user", content: `What the employer wants to learn:\n"""${prompt.slice(0, 1500)}"""\n\nReturn JSON only: {"title":"short survey name","intro":"1-2 friendly sentences to employees","questions":[{"text":"...","kind":"agree|choice|multi|yesno|text|scale10","options":["only for choice/multi"],"cat":"short area name"}]}. 8 to 12 questions. Agree questions are statements.` }],
    maxTokens: 2500, temperature: 0.4,
  });
  if (!r.ok) return null;
  const j = parseJson<{ title: string; intro: string; questions: PQ[] }>(r.text);
  if (!j?.questions?.length) return null;
  const keep: Survey = { id: "x", clientId: "x", title: j.title || "New survey", intro: "", privacy: "anonymous", questions: [], status: "draft", audience: { all: true }, openToken: "", closesAt: today(), createdAt: "", createdBy: "", invited: 0, responded: 0, actions: [] };
  const clean = cleanSurvey({ title: noDash(j.title), intro: noDash(j.intro), questions: j.questions.map((q, i) => ({ ...q, id: `q${i + 1}`, text: noDash(q.text) })) }, keep);
  return { title: clean.title, intro: clean.intro, questions: clean.questions };
}

export async function biasReview(qs: PQ[]): Promise<{ id: string; issue: string; suggestion: string }[] | null> {
  const r = await claude({
    system: BUILD,
    messages: [{ role: "user", content: `Review these survey questions. Flag only real problems: leading language, double-barreled (two ideas in one), loaded or judgmental words, too sensitive or could identify someone, a protected trait, unclear, or won't produce an answer anyone can act on. Also flag near-duplicates. Skip questions that are fine.\n\n${qs.map((q) => `${q.id} [${q.kind}] ${q.text}${q.options ? ` (options: ${q.options.join(", ")})` : ""}`).join("\n")}\n\nAlso, if the survey is too long for its purpose, add one item with id "length".\nReturn JSON only: {"issues":[{"id":"question id","issue":"short, plain","suggestion":"a better wording or fix"}]}` }],
    maxTokens: 1800, temperature: 0.2,
  });
  if (!r.ok) return null;
  const j = parseJson<{ issues: { id: string; issue: string; suggestion: string }[] }>(r.text);
  return (j?.issues ?? []).slice(0, 30).map((i) => ({ id: String(i.id), issue: noDash(i.issue), suggestion: noDash(i.suggestion) }));
}

/** Write the Spanish version. Leaves the survey as it was if the translation doesn't come back whole. */
export async function translate(s: Survey): Promise<Survey> {
  const todo = s.questions.filter((q) => !q.es);
  if (!todo.length) return { ...s, esReady: true };
  const r = await claude({
    system: "Translate employee survey questions into clear, warm Latin American Spanish that hourly and office workers both understand. Keep the meaning exact and neutral. No em dashes.",
    messages: [{ role: "user", content: `Return JSON only: {"items":[{"id":"...","text":"...","options":["same count and order as given, or omit"]}]}\n\n${JSON.stringify(todo.map((q) => ({ id: q.id, text: q.text, options: q.options })))}` }],
    maxTokens: 3000, temperature: 0.2,
  });
  if (!r.ok) return s;
  const j = parseJson<{ items: { id: string; text: string; options?: string[] }[] }>(r.text);
  const by = new Map((j?.items ?? []).map((i) => [i.id, i]));
  const questions = s.questions.map((q) => {
    if (q.es) return q;
    const t = by.get(q.id);
    if (!t?.text) return q;
    const okOpts = !q.options || (t.options && t.options.length === q.options.length);
    return okOpts ? { ...q, es: { text: noDash(t.text), options: t.options?.map(noDash) } } : q;
  });
  return { ...s, questions, esReady: questions.every((q) => q.es) };
}

export async function employeeMessage(x: Ctx, s: Survey): Promise<string | null> {
  const a = s.analysis;
  const acts = s.actions.length ? s.actions.map((y) => `- ${y.action}${y.due ? ` (by ${y.due})` : ""}`).join("\n") : (a?.actions ?? []).map((y) => `- ${y.action}`).join("\n");
  const r = await claude({
    system: `${RULES}\nYou write short, sincere messages from company leadership to all employees.`,
    messages: [{ role: "user", content: `Company: ${x.company}. Survey: ${s.title}, ${s.responded} people answered.\nKey findings: ${a?.headline ?? ""} Strengths: ${(a?.strengths ?? []).join("; ")}. Concerns: ${(a?.concerns ?? []).join("; ")}.\nWhat we'll do:\n${acts}\n\nWrite a "You said, we did" message to all employees: thank them, share 2 things that are going well and 2-3 things we heard, then what we're doing about it with timing. Under 200 words. No subject line. Sign off as "The leadership team".` }],
    maxTokens: 800, temperature: 0.5,
  });
  return r.ok ? noDash(r.text.trim()) : null;
}

/** Daily: close surveys past their date, and remind halfway through and the day before close. */
export async function pulseCron(db: DB, log: string[]) {
  if (!(await tableReady(db))) return;
  const { data } = await db.from("pulse_surveys").select("id, client_id, data").eq("data->>status", "open").limit(500);
  const day = today();
  for (const row of data ?? []) {
    const s = { ...(row.data as Survey), id: row.id as string, clientId: row.client_id as string };
    if (s.closesAt < day) {
      await putSurvey(db, { ...s, status: "closed", closedAt: new Date().toISOString() });
      log.push(`pulse: closed ${s.title}`);
      continue;
    }
    const start = (s.launchedAt ?? day).slice(0, 10);
    const span = Math.max(1, Math.round((Date.parse(s.closesAt) - Date.parse(start)) / 864e5));
    const mid = new Date(Date.parse(start) + Math.floor(span / 2) * 864e5).toISOString().slice(0, 10);
    const eve = new Date(Date.parse(s.closesAt) - 864e5).toISOString().slice(0, 10);
    const due = (day === mid && span >= 4) || day === eve;
    if (!due || (s.reminded ?? []).includes(day)) continue;
    const x = await loadCtx(db, s.clientId);
    if (!x || !x.cfg.modules?.pulse) continue;
    const n = await remind(x, s);
    log.push(`pulse: reminded ${n} for ${s.title}`);
  }
}

export { newId };
