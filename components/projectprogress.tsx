"use client";

import { Action, fmt, parseDay, Project, projectProgress, Rules, today, urgency } from "@/lib/data";

export type Health = { label: string; tone: "green" | "amber" | "red" | "done"; why: string };

/** Plain-language read on whether a project will land by its target date. */
export function projectHealth(p: Project, items: Action[], rules: Rules): Health {
  const pct = projectProgress(p);
  if (p.status === "done") return { label: "Complete", tone: "done", why: `Wrapped up ${fmt(p.milestoneDue)}.` };
  const stuck = items.find((a) => a.side === "client" && a.status !== "completed" && ["overdue", "blocker"].includes(urgency(a, rules)));
  if (stuck) return { label: "Waiting on your team", tone: "red", why: `"${stuck.title}" is past due and holding this up.` };
  const now = today().getTime();
  const due = parseDay(p.milestoneDue).getTime();
  const daysLeft = Math.round((due - now) / 864e5);
  if (daysLeft < 0) return { label: "Behind", tone: "red", why: `The target was ${fmt(p.milestoneDue)}. Ben will confirm a new date.` };
  if (p.startedAt) {
    const start = parseDay(p.startedAt.slice(0, 10)).getTime();
    const expected = due > start ? Math.min(100, Math.max(0, ((now - start) / (due - start)) * 100)) : 0;
    if (expected >= 40 && pct + 20 < expected) return { label: "A little behind", tone: "amber", why: `About ${Math.round(expected)}% of the time has passed and ${pct}% is done.` };
  }
  if (daysLeft <= 7 && pct < 70) return { label: "Tight on time", tone: "amber", why: `${daysLeft === 0 ? "Due today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`} with ${100 - pct}% to go.` };
  return { label: "On track", tone: "green", why: daysLeft <= 14 ? `${daysLeft} days to the target, ${pct}% done.` : `Target ${fmt(p.milestoneDue)}.` };
}

export function HealthChip({ h }: { h: Health }) {
  return <span className={`health-chip h-${h.tone}`}><span className="dot" />{h.label}</span>;
}

/** The current step: the first one not done. */
export function currentStep(p: Project) {
  return p.status === "done" ? -1 : p.steps.findIndex((s) => !s.done);
}

/** Pizza-tracker bar: one segment per step, done ones filled, the current one pulsing. */
export function StepTrack({ p, labels }: { p: Project; labels?: boolean }) {
  const cur = currentStep(p);
  if (!p.steps.length) return <div className="bar"><div style={{ width: `${projectProgress(p)}%` }} /></div>;
  return (
    <div className="steptrack" role="img" aria-label={`${p.steps.filter((s) => s.done).length} of ${p.steps.length} steps done${cur >= 0 ? `, now: ${p.steps[cur].text}` : ""}`}>
      <div className="steptrack-bar" style={{ gridTemplateColumns: `repeat(${p.steps.length}, 1fr)` }}>
        {p.steps.map((s, i) => <span key={s.id} className={s.done ? "done" : i === cur ? "now" : ""} />)}
      </div>
      {labels && (
        <div className="steptrack-labels" style={{ gridTemplateColumns: `repeat(${p.steps.length}, 1fr)` }}>
          {p.steps.map((s, i) => <span key={s.id} className={s.done ? "done" : i === cur ? "now" : ""}>{s.text}</span>)}
        </div>
      )}
    </div>
  );
}

/** Ring with the % in the middle. */
export function ProgressRing({ pct, size = 92 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--soft2)" strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dasharray .6s ease" }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.24} fontWeight="700" fill="var(--ink)">{pct}%</text>
    </svg>
  );
}

/** Progress over time: actual (steps as they were checked off) against the pace needed to hit the target. */
export function ProgressChart({ p }: { p: Project }) {
  const done = p.steps.filter((s) => s.done && s.doneAt).map((s) => s.doneAt!.slice(0, 10)).sort();
  const startIso = (p.startedAt ?? done[0] ?? "").slice(0, 10);
  if (!startIso || !p.steps.length) return <p className="tiny muted">The chart fills in as steps get checked off.</p>;
  const start = parseDay(startIso).getTime();
  const target = parseDay(p.milestoneDue).getTime();
  const now = today().getTime();
  const end = Math.max(target, now, start + 7 * 864e5);
  const W = 400, H = 170, L = 34, R = 14, T = 10, B = 24;
  const x = (t: number) => L + ((t - start) / (end - start)) * (W - L - R);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const total = p.steps.length;
  // completed steps without a date (checked before dates were kept) count from the start
  let n = p.steps.filter((s) => s.done && !s.doneAt).length;
  const pts: [number, number][] = [[start, (n / total) * 100]];
  for (const d of done) {
    const t = parseDay(d).getTime();
    pts.push([t, (n / total) * 100]);
    n++;
    pts.push([t, (n / total) * 100]);
  }
  pts.push([Math.min(now, end), (n / total) * 100]);
  const line = pts.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const near = (a: number, b: number) => Math.abs(x(a) - x(b)) < 70;
  const ticks = [start, target].concat(now > start && !near(now, target) && !near(now, start) ? [now] : []);
  const short = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <svg className="pchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Progress over time: ${projectProgress(p)}% done, target ${fmt(p.milestoneDue)}`}>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
          <text x={L - 6} y={y(v)} fontSize="11" textAnchor="end" dominantBaseline="central" fill="var(--muted)">{v}%</text>
        </g>
      ))}
      <line x1={x(start)} y1={y(0)} x2={x(target)} y2={y(100)} stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4 4" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" />
      <line x1={x(now)} x2={x(now)} y1={T} y2={H - B} stroke="var(--accent)" strokeWidth="1" opacity=".35" />
      <circle cx={x(Math.min(now, end))} cy={y(pts[pts.length - 1][1])} r="5" fill="var(--accent)" />
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={H - 8} fontSize="11" textAnchor={t === start ? "start" : x(t) > W - R - 40 ? "end" : "middle"} fill="var(--muted)">
          {t === target ? `Target ${short(t)}` : t === now ? "Today" : short(t)}
        </text>
      ))}
    </svg>
  );
}
