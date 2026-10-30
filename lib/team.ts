// Manager Hub: each client's team roster, and the check-ins and recognition managers log.
// Check-in notes and recognition are documentation: only Ben and that person's manager can read them
// (enforced by the database rules in supabase/009_manager_hub.sql, not just the screens).

export interface TeamMember {
  id: string;
  clientId: string;
  name: string;
  title: string;
  email?: string;
  managerEmail: string; // lowercase
  managerName: string;
  hireDate?: string; // yyyy-mm-dd
  birthday?: string; // "MM-DD" only, never the year
  department?: string;
  location?: string;
  active: boolean;
}

export interface Commitment {
  id: string;
  text: string;
  done: boolean;
}

export interface TeamLog {
  id: string;
  clientId: string;
  personId: string;
  managerEmail: string; // lowercase: who can see it, besides Ben
  kind: "checkin" | "recognition";
  date: string; // yyyy-mm-dd
  notes: string;
  commitments?: Commitment[];
  by: string;
  at: string; // ISO
}

export const CHECKIN_EVERY_DAYS = 14;
export const RECOGNIZE_EVERY_DAYS = 30;

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Next date (today or later) a yearly MM-DD comes around, and how many days away. */
export function nextYearly(mmdd: string, from = new Date()): { date: Date; days: number } | null {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(mmdd);
  if (!m) return null;
  const t = dayStart(from);
  let d = new Date(t.getFullYear(), Number(m[1]) - 1, Number(m[2]));
  if (d < t) d = new Date(t.getFullYear() + 1, Number(m[1]) - 1, Number(m[2]));
  return { date: d, days: Math.round((d.getTime() - t.getTime()) / 864e5) };
}

export function daysSinceIso(iso: string, from = new Date()) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round((dayStart(from).getTime() - new Date(y, m - 1, d).getTime()) / 864e5);
}

/** Years completed at the next anniversary. */
export function anniversary(hireDate: string, from = new Date()) {
  const n = nextYearly(hireDate.slice(5), from);
  if (!n) return null;
  const years = n.date.getFullYear() - Number(hireDate.slice(0, 4));
  return years >= 1 ? { ...n, years } : null;
}

export function tenure(hireDate?: string, from = new Date()) {
  if (!hireDate) return "";
  const days = daysSinceIso(hireDate, from);
  if (days < 0) return "Starting soon";
  if (days < 60) return `${days} days`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} months`;
  const y = Math.floor(months / 12);
  return `${y} years`;
}

export const sameEmail = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function teamFor(people: TeamMember[], clientId: string, managerEmail?: string) {
  return people.filter((p) => p.clientId === clientId && p.active && (!managerEmail || sameEmail(p.managerEmail, managerEmail))).sort((a, b) => a.name.localeCompare(b.name));
}

export function lastLog(logs: TeamLog[], personId: string, kind: TeamLog["kind"]) {
  return logs.filter((l) => l.personId === personId && l.kind === kind).sort((a, b) => b.date.localeCompare(a.date))[0];
}

export type HubItem = {
  key: string;
  personId?: string;
  kind: "birthday" | "anniversary" | "starting" | "checkin" | "recognize" | "commitment";
  title: string;
  why: string;
  score: number;
  action: "recognize" | "checkin" | "open";
};

/** What a manager should do this week, most important first. Used by the Hub and the Monday nudge. */
export function weekItems(team: TeamMember[], logs: TeamLog[], from = new Date(), opts: { checkinDays?: number; recognizeDays?: number } = {}): HubItem[] {
  const checkinDays = opts.checkinDays ?? CHECKIN_EVERY_DAYS;
  const recognizeDays = opts.recognizeDays ?? RECOGNIZE_EVERY_DAYS;
  const out: HubItem[] = [];
  for (const p of team) {
    const first = p.name.split(" ")[0];
    if (p.birthday) {
      const b = nextYearly(p.birthday, from);
      if (b && b.days <= 7) out.push({ key: `bd-${p.id}`, personId: p.id, kind: "birthday", title: `${first}'s birthday ${b.days === 0 ? "is today" : b.days === 1 ? "is tomorrow" : `is ${b.date.toLocaleDateString("en-US", { weekday: "long" })}`}`, why: "A quick note or a card goes a long way.", score: 90 - b.days * 4, action: "recognize" });
    }
    if (p.hireDate) {
      const started = daysSinceIso(p.hireDate, from);
      if (started < 0 && started >= -14) out.push({ key: `st-${p.id}`, personId: p.id, kind: "starting", title: `${first} starts ${started === -1 ? "tomorrow" : `in ${-started} days`}`, why: "Plan their first day and first week, and set your first check-in.", score: 85 + started, action: "open" });
      const a = anniversary(p.hireDate, from);
      if (a && a.days <= 7) out.push({ key: `an-${p.id}`, personId: p.id, kind: "anniversary", title: `${first}'s ${a.years}-year work anniversary ${a.days === 0 ? "is today" : a.days === 1 ? "is tomorrow" : `is ${a.date.toLocaleDateString("en-US", { weekday: "long" })}`}`, why: `Recognize ${a.years === 1 ? "their first year" : `${a.years} years`} with the team.`, score: 88 - a.days * 4, action: "recognize" });
      if (started >= 0 && started <= 90 && [30, 60, 90].some((d) => d - started >= 0 && d - started <= 7)) {
        const mark = [30, 60, 90].find((d) => d - started >= 0 && d - started <= 7)!;
        out.push({ key: `m-${p.id}`, personId: p.id, kind: "checkin", title: `${first}'s ${mark}-day check-in`, why: "How's it going, what's unclear, what do they need from you?", score: 80, action: "checkin" });
      }
    }
    if (p.hireDate && daysSinceIso(p.hireDate, from) < 0) continue;
    const ci = lastLog(logs, p.id, "checkin");
    const ciDays = ci ? daysSinceIso(ci.date, from) : null;
    if (!out.some((x) => x.key === `m-${p.id}`) && (ciDays === null || ciDays >= checkinDays))
      out.push({ key: `ci-${p.id}`, personId: p.id, kind: "checkin", title: `Check in with ${first}`, why: ciDays === null ? "No check-in logged yet." : `Last check-in was ${ciDays} days ago.`, score: 50 + Math.min(30, (ciDays ?? checkinDays * 2) - checkinDays), action: "checkin" });
    const rc = lastLog(logs, p.id, "recognition");
    const rcDays = rc ? daysSinceIso(rc.date, from) : null;
    if (!out.some((x) => x.personId === p.id && (x.kind === "birthday" || x.kind === "anniversary")) && (rcDays === null || rcDays >= recognizeDays))
      out.push({ key: `rc-${p.id}`, personId: p.id, kind: "recognize", title: `Recognize ${first}`, why: rcDays === null ? "Nothing logged yet. What have they done well lately?" : `Last recognized ${rcDays} days ago.`, score: 40 + Math.min(25, (rcDays ?? recognizeDays * 2) - recognizeDays), action: "recognize" });
    // open commitments from the last check-in
    const open = (ci?.commitments ?? []).filter((c) => !c.done);
    if (open.length) out.push({ key: `cm-${p.id}`, personId: p.id, kind: "commitment", title: `Follow up with ${first}: ${open[0].text}`, why: open.length > 1 ? `${open.length} open commitments from your last check-in.` : "Open from your last check-in.", score: 60, action: "open" });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Read a roster export: CSV or pasted rows. Headers are matched loosely. */
export function parseRoster(text: string): { rows: Record<string, string>[]; headers: string[] } {
  const lines: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let q = false;
  const delim = text.split("\n")[0].includes("\t") && !text.split("\n")[0].includes(",") ? "\t" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { cur.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(cell); cell = "";
      if (cur.some((c) => c.trim())) lines.push(cur);
      cur = [];
    } else cell += ch;
  }
  cur.push(cell);
  if (cur.some((c) => c.trim())) lines.push(cur);
  if (!lines.length) return { rows: [], headers: [] };
  const headers = lines[0].map((h) => h.trim().replace(/^﻿/, ""));
  return { headers, rows: lines.slice(1).map((l) => Object.fromEntries(headers.map((h, i) => [h, (l[i] ?? "").trim()]))) };
}

const H = {
  first: /^(first|first name|legal first name|preferred first name)$/i,
  last: /^(last|last name|legal last name|surname)$/i,
  name: /^(name|full name|employee|employee name|worker)$/i,
  title: /^(title|job title|position|role|job)$/i,
  email: /^(email|work email|e-mail|employee email|work e-mail)$/i,
  managerEmail: /^(manager email|supervisor email|reports to email|manager e-mail)$/i,
  managerName: /^(manager|manager name|supervisor|reports to|supervisor name)$/i,
  hire: /^(hire date|start date|date of hire|original hire date|hired)$/i,
  birthday: /^(birthday|birth date|date of birth|dob|birthdate)$/i,
  department: /^(department|dept|team)$/i,
  location: /^(location|work location|office|site)$/i,
};

function toIsoDate(v: string): string | undefined {
  const s = v.trim();
  if (!s) return undefined;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? (Number(m[3]) > 40 ? 1900 : 2000) + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(+m[1])}-${pad(+m[2])}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : isoDay(d);
}
/** Birthday kept as month and day only. */
function toMonthDay(v: string): string | undefined {
  const s = v.trim();
  if (!s) return undefined;
  let m = /^(\d{1,2})[/.-](\d{1,2})$/.exec(s);
  if (m) return `${pad(+m[1])}-${pad(+m[2])}`;
  const iso = toIsoDate(s);
  if (iso) return iso.slice(5);
  const d = new Date(`${s} 2000`);
  return isNaN(d.getTime()) ? undefined : `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Turn parsed rows into team members. Managers can be given by email or by name (matched to the client's people). */
export function rowsToTeam(rows: Record<string, string>[], headers: string[], clientId: string, users: { name: string; email: string }[]) {
  const col = (re: RegExp) => headers.find((h) => re.test(h.trim()));
  const c = Object.fromEntries(Object.entries(H).map(([k, re]) => [k, col(re)])) as Record<keyof typeof H, string | undefined>;
  const people: TeamMember[] = [];
  const problems: string[] = [];
  rows.forEach((r, i) => {
    let name = (c.name ? r[c.name] : [c.first && r[c.first], c.last && r[c.last]].filter(Boolean).join(" ")).trim();
    // payroll exports often use "Last, First"
    const lf = /^([^,]+),\s*(.+)$/.exec(name);
    if (lf) name = `${lf[2].trim()} ${lf[1].trim()}`;
    if (!name) return;
    let mEmail = (c.managerEmail && r[c.managerEmail]) || "";
    let mName = (c.managerName && r[c.managerName]) || "";
    if (!mEmail && /@/.test(mName)) [mEmail, mName] = [mName, ""];
    const ml = /^([^,@]+),\s*([^@]+)$/.exec(mName);
    if (ml) mName = `${ml[2].trim()} ${ml[1].trim()}`;
    if (!mEmail && mName) mEmail = users.find((u) => u.name.trim().toLowerCase() === mName.trim().toLowerCase())?.email ?? "";
    if (mEmail && !mName) mName = users.find((u) => sameEmail(u.email, mEmail))?.name ?? mEmail.split("@")[0];
    if (!mEmail && !mName) problems.push(`Row ${i + 2}: ${name} has no manager.`);
    else if (!mEmail) problems.push(`Row ${i + 2}: ${name}'s manager "${mName}" isn't on the portal yet. Add a manager email column, or invite ${mName} first.`);
    people.push({
      id: `pp${Date.now().toString(36)}${i.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      clientId,
      name,
      title: (c.title && r[c.title]) || "",
      email: ((c.email && r[c.email]) || "").toLowerCase() || undefined,
      managerEmail: mEmail.trim().toLowerCase(),
      managerName: mName.trim(),
      hireDate: c.hire ? toIsoDate(r[c.hire]) : undefined,
      birthday: c.birthday ? toMonthDay(r[c.birthday]) : undefined,
      department: (c.department && r[c.department]) || undefined,
      location: (c.location && r[c.location]) || undefined,
      active: true,
    });
  });
  const missing = (["name", "title", "hire", "birthday"] as const).filter((k) => (k === "name" ? !c.name && !c.first : !c[k]));
  return { people, problems, columns: c, missing };
}

export const ROSTER_TEMPLATE = "Name,Title,Email,Manager Email,Hire Date,Birthday,Department,Location\nTaylor Brooks,Event Coordinator,taylor@company.com,manager@company.com,2024-03-18,06-12,Events,San Francisco\n";
