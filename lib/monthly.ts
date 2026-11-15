// Monthly appreciation themes for the Team Wall: a new reason to say thanks each month.
// Off until a client turns it on. Every theme, prompt, reason and email line can be changed per client.
import { esc, frameEmail, sectionHtml, type Brand } from "./hires";
import { readableInk } from "./brand";

export type MonthTheme = { title: string; intro: string; prompt: string; reasons: string[] };
export type MonthlySettings = {
  on?: boolean;
  /** Changes to the built-in themes, by month "1".."12". off = skip that month. */
  themes?: Record<string, Partial<MonthTheme> & { off?: boolean }>;
  tag?: boolean; // shoutouts given that month carry the theme's name (default on)
  tv?: boolean; // banner on the break room TV (default on)
  email?: boolean; // the monthly email (default on once themes are on)
  emailDay?: number; // day of the month it goes out (1-28, default 1)
  nudge?: boolean; // mid-month nudge (default off)
  nudgeDay?: number; // default 15
  managers?: boolean; // a line in the managers' Monday email (default on)
  wording?: { subject?: string; opening?: string; closing?: string; nudge?: string };
};

export const DEFAULT_THEMES: MonthTheme[] = [
  { title: "Fresh Start", intro: "New year, same great people. Start it by thanking someone who sets the tone.", prompt: "Who helped you start the year strong?", reasons: ["Set us up for a good year", "Showed up ready", "Made a hard week easier", "Brought a great new idea"] },
  { title: "Got Your Back", intro: "Good teams cover for each other. This month, notice who covered for you.", prompt: "Who had your back this month?", reasons: ["Jumped in without being asked", "Covered a shift or task", "Stood up for the team", "Made it a group win"] },
  { title: "Behind the Scenes", intro: "Some of the best work happens where nobody sees it. Let's change that.", prompt: "Whose work keeps things running that most people never see?", reasons: ["Keeps things organized", "Fixes problems before we notice", "Does the work nobody asks about", "Always prepared"] },
  { title: "Problem Solvers", intro: "Every team has someone who figures it out. Give them some credit.", prompt: "Who fixed something that was bugging everyone?", reasons: ["Found a better way", "Stayed calm and figured it out", "Fixed it for good", "Asked the right question"] },
  { title: "Teach Me Something", intro: "Knowledge shared is work made easier. Thank the people who show you how.", prompt: "Who taught you something this month?", reasons: ["Showed me the ropes", "Explained it with patience", "Shared a shortcut", "Made me better at my job"] },
  { title: "Good Energy", intro: "Attitude is contagious. Shout out the people who make the day better just by being there.", prompt: "Whose attitude made your day better?", reasons: ["Always positive", "Made me laugh", "Kept us going when it was tough", "Welcomed someone new"] },
  { title: "Above and Beyond", intro: "Some people do the job. Some do more. This month is for the ones who do more.", prompt: "Who went further than anyone asked?", reasons: ["Stayed late to get it done", "Went the extra mile for a customer", "Took on more than their share", "Sweated the details"] },
  { title: "Rising Stars", intro: "New people and growing people deserve to hear they're doing great.", prompt: "Who's new or growing fast and deserves a shoutout?", reasons: ["Learning fast", "Stepped up", "Took on something new", "Already feels like part of the team"] },
  { title: "Customer Heroes", intro: "The people we serve notice when someone cares. So should we.", prompt: "Who made a customer's day?", reasons: ["Turned a bad day around", "Remembered the little things", "Solved it on the spot", "Made someone feel taken care of"] },
  { title: "Count On You", intro: "Reliable people make everything easier. Let them know it doesn't go unnoticed.", prompt: "Who can you always count on?", reasons: ["Always there when needed", "Does what they say", "Steady under pressure", "Never drops the ball"] },
  { title: "Thankful for You", intro: "Gratitude month. Tell someone why you're glad they're on the team.", prompt: "Who are you thankful to work with?", reasons: ["Makes work better", "Always helps", "Kind to everyone", "I just appreciate them"] },
  { title: "Highlight Reel", intro: "The year's almost done. What moment from this year deserves a shoutout?", prompt: "Whose moment from this year should we remember?", reasons: ["Best moment of the year", "Got us through a tough stretch", "Biggest win", "Made this a good year"] },
];

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const DEFAULT_MONTHLY_WORDING = {
  subject: "{month}: {theme}",
  opening: "New month, new reason to say thanks. This month's theme is {theme}.",
  closing: "Thanks for noticing each other.",
  nudge: "Halfway through {theme}. Who's on your list?",
};

/** A month's theme (1-12) with this client's changes. */
export function themeOf(m: MonthlySettings | undefined, month: number): MonthTheme & { month: number; name: string; off: boolean } {
  const base = DEFAULT_THEMES[(month - 1 + 12) % 12];
  const o = m?.themes?.[String(month)] ?? {};
  const reasons = (o.reasons ?? base.reasons).map((r) => r.trim()).filter(Boolean);
  return { month, name: MONTHS[month - 1], title: o.title?.trim() || base.title, intro: o.intro?.trim() || base.intro, prompt: o.prompt?.trim() || base.prompt, reasons, off: !!o.off };
}

/** The theme for a date (local "YYYY-MM-DD" or a Date), or null when themes are off or that month is skipped. */
export function currentTheme(m: MonthlySettings | undefined, day: string | Date = new Date()) {
  if (!m?.on) return null;
  const month = typeof day === "string" ? Number(day.slice(5, 7)) : day.getMonth() + 1;
  const t = themeOf(m, month);
  return t.off ? null : t;
}

/** What the wall, QR page and TV need to know. Never more. */
export type PublicTheme = { month: number; name: string; title: string; intro: string; prompt: string; reasons: string[]; tv: boolean };
export const publicTheme = (m: MonthlySettings | undefined, day: string | Date = new Date()): PublicTheme | null => {
  const t = currentTheme(m, day);
  return t ? { month: t.month, name: t.name, title: t.title, intro: t.intro, prompt: t.prompt, reasons: t.reasons, tv: m?.tv !== false } : null;
};

const s = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, n) : undefined);
const day = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Math.min(28, Math.max(1, Math.round(Number(v)))) : d);

/** Keep only what belongs, and drop anything that matches the built-in theme (so improvements to ours still reach them). */
export function cleanMonthly(x: unknown): MonthlySettings | undefined {
  if (!x || typeof x !== "object") return undefined;
  const m = x as MonthlySettings;
  const themes: NonNullable<MonthlySettings["themes"]> = {};
  for (let i = 1; i <= 12; i++) {
    const o = m.themes?.[String(i)];
    if (!o || typeof o !== "object") continue;
    const base = DEFAULT_THEMES[i - 1];
    const t: Partial<MonthTheme> & { off?: boolean } = {};
    const title = s(o.title, 40);
    const intro = s(o.intro, 200);
    const prompt = s(o.prompt, 90);
    if (title && title !== base.title) t.title = title;
    if (intro && intro !== base.intro) t.intro = intro;
    if (prompt && prompt !== base.prompt) t.prompt = prompt;
    if (Array.isArray(o.reasons)) {
      const r = o.reasons.map((v) => s(v, 40)).filter((v): v is string => !!v).slice(0, 6);
      if (JSON.stringify(r) !== JSON.stringify(base.reasons)) t.reasons = r;
    }
    if (o.off) t.off = true;
    if (Object.keys(t).length) themes[String(i)] = t;
  }
  const w = m.wording ?? {};
  const wording = {
    subject: s(w.subject, 120) || undefined,
    opening: s(w.opening, 400) || undefined,
    closing: s(w.closing, 200) || undefined,
    nudge: s(w.nudge, 300) || undefined,
  };
  (Object.keys(wording) as (keyof typeof wording)[]).forEach((k) => (!wording[k] || wording[k] === DEFAULT_MONTHLY_WORDING[k]) && delete wording[k]);
  return {
    on: !!m.on,
    ...(Object.keys(themes).length ? { themes } : {}),
    tag: m.tag !== false,
    tv: m.tv !== false,
    email: m.email !== false,
    emailDay: day(m.emailDay, 1),
    nudge: !!m.nudge,
    nudgeDay: day(m.nudgeDay, 15),
    managers: m.managers !== false,
    ...(Object.keys(wording).length ? { wording } : {}),
  };
}

const fill = (t: string, v: { month: string; theme: string; company: string }) => t.replace(/\{month\}/gi, v.month).replace(/\{theme\}/gi, v.theme).replace(/\{company\}/gi, v.company);
const P = (t: string, extra = "") => `<p style="margin:0 0 14px 0;font-family:Arial,sans-serif;font-size:15px;line-height:24px;color:#1C1A19;${extra}">${t}</p>`;
const label = (t: string, color: string) => `<p style="margin:0 0 10px 0;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;font-weight:bold;color:${color}">${esc(t.toUpperCase())}</p>`;
const button = (t: string, url: string, color: string, ghost = false) =>
  `<a href="${esc(url)}" style="display:inline-block;margin:4px 8px 4px 0;padding:12px 22px;border-radius:6px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;${ghost ? `border:2px solid ${color};color:${color};background:#ffffff` : `background:${color};color:#ffffff`}">${esc(t)}</a>`;

export type Favorite = { from: string; to: string; text: string };

/** The 1st-of-the-month email: the new theme, last month's recap, and This or That. */
export function monthlyEmail(o: {
  m: MonthlySettings | undefined;
  theme: MonthTheme & { name: string };
  brand: Brand;
  giveUrl: string;
  wallUrl: string;
  last?: { title: string; count: number; favorites: Favorite[] } | null;
  poll?: { q: string; a: string; b: string } | null;
}) {
  const w = { ...DEFAULT_MONTHLY_WORDING, ...(o.m?.wording ?? {}) };
  const v = { month: o.theme.name, theme: o.theme.title, company: o.brand.company };
  const ink = readableInk(o.brand.accent);
  const subject = fill(w.subject, v);
  const opening = fill(w.opening, v);
  const closing = fill(w.closing, v);
  let inner = `<p style="margin:30px 0 12px 0;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;font-weight:bold;color:${ink}">THIS MONTH'S THEME</p>`;
  inner += `<p style="margin:0 0 14px 0;font-family:Georgia,serif;font-size:32px;line-height:38px;color:#1C1A19">${esc(o.theme.title)}</p>`;
  inner += P(esc(opening));
  inner += P(esc(o.theme.intro));
  inner += P(esc(o.theme.prompt), "font-family:Georgia,serif;font-style:italic;font-size:18px;line-height:26px");
  inner += `<div style="margin:6px 0 4px">${button("Give a shoutout", o.giveUrl, ink)}</div><!--HERO_END-->`;
  if (o.last && o.last.count > 0) {
    let r = label(`Last month: ${o.last.title}`, "#6B645E");
    r += P(`You gave <b>${o.last.count} ${o.last.count === 1 ? "shoutout" : "shoutouts"}</b>.${o.last.favorites.length ? " A few favorites:" : ""}`);
    for (const f of o.last.favorites)
      r += `<div style="background:#ffffff;border-radius:8px;padding:12px 14px;margin:0 0 10px 0"><p style="margin:0 0 4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B645E"><b style="color:#1C1A19">${esc(f.from)}</b> to <b style="color:#1C1A19">${esc(f.to)}</b></p><p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:22px;color:#1C1A19">${esc(f.text)}</p></div>`;
    r += `<p style="margin:6px 0 0 0;font-family:Arial,sans-serif;font-size:14px"><a href="${esc(o.wallUrl)}" style="color:${ink};font-weight:bold">See them all on the Team Wall</a></p>`;
    inner += sectionHtml("#F4F1EC", r);
  }
  if (o.poll) inner += sectionHtml("#FFFFFF", label("This or That", ink) + `<p style="margin:0 0 12px 0;font-family:Georgia,serif;font-size:21px;line-height:28px;color:#1C1A19">${esc(o.poll.q)}</p>` + button(o.poll.a, o.wallUrl, ink, true) + button(o.poll.b, o.wallUrl, ink, true));
  inner += sectionHtml("#FFFFFF", `<p style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:18px;color:#1C1A19">${esc(closing)}</p>`);
  const text = [
    `${o.theme.title}`,
    opening,
    o.theme.intro,
    o.theme.prompt,
    `Give a shoutout: ${o.giveUrl}`,
    o.last && o.last.count > 0 ? `Last month (${o.last.title}): ${o.last.count} shoutouts.\n${o.last.favorites.map((f) => `- ${f.from} to ${f.to}: "${f.text}"`).join("\n")}` : "",
    o.poll ? `This or That: ${o.poll.q} ${o.poll.a} or ${o.poll.b}? Vote: ${o.wallUrl}` : "",
    closing,
  ].filter(Boolean).join("\n\n");
  return { subject, html: frameEmail({ ...o.brand, bar: o.brand.bar ?? o.brand.accent, accent: ink }, inner), text };
}

/** The optional mid-month nudge. Short. */
export function monthlyNudgeEmail(o: { m: MonthlySettings | undefined; theme: MonthTheme & { name: string }; brand: Brand; giveUrl: string }) {
  const w = { ...DEFAULT_MONTHLY_WORDING, ...(o.m?.wording ?? {}) };
  const v = { month: o.theme.name, theme: o.theme.title, company: o.brand.company };
  const ink = readableInk(o.brand.accent);
  const msg = fill(w.nudge, v);
  const inner = `<p style="margin:30px 0 12px 0;font-family:Georgia,serif;font-size:26px;line-height:32px;color:#1C1A19">${esc(o.theme.title)}</p>${P(esc(msg))}${P(esc(o.theme.prompt), "font-family:Georgia,serif;font-style:italic;font-size:18px;line-height:26px")}<div style="margin:6px 0 4px">${button("Give a shoutout", o.giveUrl, ink)}</div><!--HERO_END-->`;
  return { subject: msg.length <= 70 ? msg : `${o.theme.title}: who's on your list?`, html: frameEmail({ ...o.brand, bar: o.brand.bar ?? o.brand.accent, accent: ink }, inner), text: `${msg}\n\n${o.theme.prompt}\n\nGive a shoutout: ${o.giveUrl}` };
}

/** Last month's favorites: most reactions first, then the newest. */
export function pickFavorites(list: { id: string; from: string; to: string; message: string; at: string }[], reactions: Record<string, number>, n = 3): Favorite[] {
  return [...list]
    .sort((a, b) => (reactions[b.id] ?? 0) - (reactions[a.id] ?? 0) || b.at.localeCompare(a.at))
    .slice(0, n)
    .map((x) => ({ from: x.from, to: x.to, text: x.message.length > 160 ? `${x.message.slice(0, 157).trimEnd()}...` : x.message }));
}
