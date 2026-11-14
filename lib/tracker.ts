// New hire tracker: the per-company checklist every hire moves through (offer signed, background,
// drug screen, payroll, orientation, 30-day check-in...). Steps are set per company. A step with
// a day count sends HR and the manager a reminder that many days after the start date.
// Pure functions, used by the browser and by the daily email job.
import { addDaysISO, Hire, stageIndex } from "./hires";

export interface TrackerStep {
  id: string;
  label: string;
  /** Remind HR and the manager this many days after the start date, if the step isn't done. */
  days?: number | null;
}

export type Outcome = "declined" | "rescinded" | "noshow" | "failed";
export const OUTCOMES: { id: Outcome; label: string }[] = [
  { id: "declined", label: "Declined" },
  { id: "rescinded", label: "Offer rescinded" },
  { id: "noshow", label: "No show" },
  { id: "failed", label: "Didn't pass" },
];
export const outcomeLabel = (o?: Outcome) => OUTCOMES.find((x) => x.id === o)?.label ?? "";

export function defaultSteps(payroll = "payroll"): TrackerStep[] {
  return [
    { id: "offer", label: "Offer signed" },
    { id: "bg", label: "Background cleared" },
    { id: "drug", label: "Drug screen cleared" },
    { id: "payroll", label: `Added to ${payroll || "payroll"}` },
    { id: "orient", label: "Orientation complete" },
    { id: "day30", label: "30-day check-in", days: 30 },
  ];
}

/** This company's steps, or the defaults. */
export function stepsFor(s: { trackerSteps?: TrackerStep[]; payroll?: string }): TrackerStep[] {
  const t = cleanSteps(s.trackerSteps);
  return t.length ? t : defaultSteps(s.payroll);
}

export function cleanSteps(v: unknown): TrackerStep[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: TrackerStep[] = [];
  for (const x of v.slice(0, 12)) {
    const label = String((x as TrackerStep)?.label ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!label) continue;
    let id = String((x as TrackerStep)?.id ?? "").replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || slug(label);
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    const d = Number((x as TrackerStep)?.days);
    out.push({ id, label, days: Number.isFinite(d) && d > 0 ? Math.min(365, Math.round(d)) : null });
  }
  return out;
}

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || `s${Date.now().toString(36)}`;
export const newStepId = (label: string) => `${slug(label)}-${Math.random().toString(36).slice(2, 5)}`;

type T = Pick<Hire, "track" | "status" | "signedAt" | "backgroundCheck" | "startDate">;

/** When this step was done, or null. The offer and background steps also follow the hire's own progress. */
export function stepDone(h: T, id: string): string | null {
  const v = h.track?.[id];
  if (v === "") return null; // unmarked by hand
  if (v) return v;
  if (id === "offer" && stageIndex(h.status) >= 2) return h.signedAt || "auto";
  if (id === "bg" && (h.backgroundCheck?.status === "clear" || h.backgroundCheck?.status === "skipped")) return h.backgroundCheck.at || "auto";
  return null;
}

export function progress(h: T, steps: TrackerStep[]) {
  const done = steps.filter((s) => stepDone(h, s.id)).length;
  return { done, total: steps.length };
}

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export type Bucket = "active" | "done" | "out";
export function bucket(h: T & Pick<Hire, "outcome">, steps: TrackerStep[]): Bucket {
  if (h.outcome) return "out";
  // hires from before the tracker, well past their start: finished
  if (!h.track && h.status === "Started" && h.startDate && h.startDate <= addDaysISO(isoToday(), -60)) return "done";
  const p = progress(h, steps);
  return p.total && p.done === p.total ? "done" : "active";
}

/** Steps with a reminder that are due on or before `day` and still open. */
export function dueReminders(h: T & Pick<Hire, "outcome">, steps: TrackerStep[], day: string) {
  if (h.outcome || !h.startDate) return [];
  return steps.filter((s) => s.days && !stepDone(h, s.id) && day >= addDaysISO(h.startDate, s.days) && day <= addDaysISO(h.startDate, s.days + 3));
}

/** Short column label for tight spaces. */
export function shortLabel(label: string) {
  const l = label.trim();
  const map: [RegExp, string][] = [
    [/^offer/i, "Signed"],
    [/^background/i, "BG check"],
    [/^drug/i, "Drug"],
    [/^added to (\S+)/i, "$1"],
    [/^orientation/i, "Orient."],
    [/^(\d+)[- ]day/i, "$1-day"],
  ];
  for (const [re, to] of map) {
    const m = l.match(re);
    if (m) return to.replace("$1", m[1] ?? "");
  }
  return l.split(/\s+/)[0];
}

// ---------- Import from a spreadsheet (pasted from Excel/Sheets, or a .csv / .tsv file)

export function parseTable(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = first.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((x) => x.trim()));
}

const COLS: Record<string, RegExp> = {
  name: /^(employee )?name$|^employee$/i,
  title: /title|position|role/i,
  manager: /manager|supervisor/i,
  location: /location|site|office/i,
  start: /start/i,
  phone: /phone|cell|mobile/i,
  email: /e-?mail/i,
  pay: /pay|rate|wage|salary/i,
  remarks: /remark|note|comment|status/i,
};

/** Which step a spreadsheet column fills in, by its header. */
function stepForHeader(head: string, steps: TrackerStep[]): string | null {
  const h = head.toLowerCase();
  const tests: [RegExp, RegExp][] = [
    [/offer/, /^offer/i],
    [/background/, /^background/i],
    [/drug/, /^drug/i],
    [/adp|payroll|rippling|trinet|gusto|paychex|added to/, /^added to|payroll/i],
    [/orientation/, /^orientation/i],
    [/30|check-?in/, /30|check-?in/i],
  ];
  const exact = steps.find((s) => s.label.toLowerCase() === h);
  if (exact) return exact.id;
  for (const [hr, sr] of tests) if (hr.test(h)) return steps.find((s) => sr.test(s.label))?.id ?? null;
  return null;
}

const toISO = (v: string, yearHint?: number): string | null => {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : yearHint;
    if (!y) return null;
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  // "Nov 10, 2026", "10-Nov-26" and the like
  if (/[a-z]/i.test(s) && /\d/.test(s)) {
    const t = Date.parse(s.replace(/-/g, " "));
    if (!Number.isNaN(t)) {
      const d = new Date(t);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  return null;
};

const yes = (v: string) => /^(true|yes|y|x|✓|✔|done|complete[d]?|cleared|pass(ed)?)$/i.test(v.trim());

export function outcomeFrom(text: string): Outcome | undefined {
  const t = text.toLowerCase();
  if (/rescind/.test(t)) return "rescinded";
  if (/declin|turned down|withdrew|withdrawn/.test(t)) return "declined";
  if (/no[- ]?show|no response|never (showed|started)|ghost/.test(t)) return "noshow";
  if (/did ?n[o']t pass|not pass|fail|not clear/.test(t)) return "failed";
  return undefined;
}

export interface ImportRow {
  name: string;
  title: string;
  managerName: string;
  location: string;
  startDate: string;
  cell: string;
  personalEmail: string;
  pay: string;
  remarks: string;
  track: Record<string, string>;
  outcome?: Outcome;
}

/** Rows from the sheet, ready to add. Skips blank rows and anything without a name. */
export function readImport(text: string, steps: TrackerStep[], today: string): { rows: ImportRow[]; mapped: string[]; unmapped: string[] } {
  const table = parseTable(text).filter((r) => r.some((c) => c));
  if (!table.length) return { rows: [], mapped: [], unmapped: [] };
  const head = table[0];
  const idx: Partial<Record<keyof typeof COLS, number>> = {};
  const stepCol: Record<number, string> = {};
  const mapped: string[] = [];
  const unmapped: string[] = [];
  head.forEach((hd, i) => {
    if (!hd) return;
    const st = stepForHeader(hd, steps);
    if (st && !(/remark|note/i.test(hd))) {
      stepCol[i] = st;
      mapped.push(hd);
      return;
    }
    const k = (Object.keys(COLS) as (keyof typeof COLS)[]).find((key) => idx[key] === undefined && COLS[key].test(hd) && !(key === "name" && /manager/i.test(hd)));
    if (k) {
      idx[k] = i;
      mapped.push(hd);
    } else unmapped.push(hd);
  });
  if (idx.name === undefined) idx.name = 0;
  const get = (r: string[], k: keyof typeof COLS) => (idx[k] !== undefined ? (r[idx[k]!] ?? "").trim() : "");
  const rows: ImportRow[] = [];
  for (const r of table.slice(1)) {
    const name = get(r, "name").replace(/\s+/g, " ");
    if (!name) continue;
    const startDate = toISO(get(r, "start")) ?? "";
    const yr = Number((startDate || today).slice(0, 4));
    const remarks = get(r, "remarks");
    const track: Record<string, string> = {};
    for (const [i, id] of Object.entries(stepCol)) {
      const v = (r[Number(i)] ?? "").trim();
      if (!v) continue;
      const d = toISO(v, yr);
      if (d) track[id] = d;
      else if (yes(v)) track[id] = startDate && startDate < today ? startDate : today;
    }
    // "Onboarding complete" in the notes, or a start date well in the past: treat it as finished
    const finished = /onboarding complete|completed onboarding/i.test(remarks) || (!!startDate && startDate <= addDaysISO(today, -45));
    const outcome = outcomeFrom(remarks);
    if (finished && !outcome) for (const s of steps) if (!track[s.id] && !(s.days && startDate && addDaysISO(startDate, s.days) > today)) track[s.id] = startDate || today;
    rows.push({ name, title: get(r, "title"), managerName: get(r, "manager"), location: get(r, "location"), startDate, cell: get(r, "phone"), personalEmail: get(r, "email").toLowerCase(), pay: get(r, "pay"), remarks, track, outcome });
  }
  return { rows, mapped, unmapped };
}

/** Dated notes from a remarks cell like "11/9 - Background initiated". */
export function remarkNote(text: string, startDate: string, today: string): { at: string; text: string } | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[-–:]?\s*(.*)$/);
  const yr = Number((startDate || today).slice(0, 4));
  if (m) {
    let d = toISO(m[1], yr);
    // a note dated after the start date in December, for a January start, is last year
    if (d && startDate && d > addDaysISO(startDate, 200)) d = `${yr - 1}${d.slice(4)}`;
    return { at: d ?? today, text: m[2] || t };
  }
  return { at: today, text: t };
}
