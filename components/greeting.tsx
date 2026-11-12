"use client";

// Top of the client dashboard: a warm greeting, a few things worth knowing, and today's thought.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { dateLine, greetingFor } from "@/lib/greeting";
import { thoughtFor } from "@/lib/thoughts";

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const todayKey = () => new Date().toDateString();

export function Greeting({ clientId, onCustomize }: { clientId: string; onCustomize: () => void }) {
  const { viewer, me, people, hires, candidates, roles, projects } = useStore();
  const isAdvisor = viewer?.kind === "advisor";
  const name = viewer?.kind === "client" ? viewer.person.name : "Ben Gaines";
  const first = name.split(" ")[0];
  const email = (me?.email ?? "").toLowerCase();
  const exec = isAdvisor || me?.access === "exec";
  const [now, setNow] = useState<Date | null>(null);
  const [away, setAway] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [off, setOff] = useState(false);

  useEffect(() => {
    const d = new Date();
    setNow(d);
    const last = Number(get("alza-last-visit") || 0);
    if (last) setAway(Math.floor((d.getTime() - last) / 864e5));
    set("alza-last-visit", String(d.getTime()));
    setHidden(get("alza-thought-hidden") === todayKey());
    setOff(get("alza-thought-off") === "1");
    const t = setInterval(() => setNow(new Date()), 5 * 60e3);
    return () => clearInterval(t);
  }, []);

  const mePerson = people.find((p) => p.clientId === clientId && email && (p.email ?? "").toLowerCase() === email);
  const g = useMemo(() => (now ? greetingFor({ first, now, birthday: mePerson?.birthday, hireDate: mePerson?.hireDate, daysAway: away }) : null), [now, first, mePerson?.birthday, mePerson?.hireDate, away]);
  const thought = useMemo(() => thoughtFor(exec, now ?? new Date()), [exec, now]);

  // a few things worth knowing, each a link
  const base = `/c/${clientId}`;
  const chips = useMemo(() => {
    if (!now) return [];
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const today = iso(now);
    const week = iso(new Date(now.getTime() + 7 * 864e5));
    const out: { text: string; href: string; tone: string }[] = [];
    const starting = hires.filter((h) => h.clientId === clientId && h.startDate >= today && h.startDate <= week && h.status !== "Started");
    for (const h of starting.slice(0, 2)) {
      const d = new Date(`${h.startDate}T12:00:00`);
      const when = h.startDate === today ? "today" : d.toLocaleDateString("en-US", { weekday: "long" });
      out.push({ text: `${(h.firstName || h.name).split(" ")[0]} starts ${when}`, href: `${base}/hires/${h.id}`, tone: "new" });
    }
    const myRoles = roles.filter((r) => r.clientId === clientId).map((r) => r.id);
    const waiting = candidates.filter((c) => myRoles.includes(c.roleId) && !c.hidden && !c.cleared && !c.decision).length;
    if (waiting) out.push({ text: `${waiting} candidate${waiting === 1 ? "" : "s"} waiting on a yes or no`, href: `${base}/recruiting`, tone: "warn" });
    const due = projects.filter((p) => p.clientId === clientId && p.status === "active" && p.milestoneDue >= today && p.milestoneDue <= week).length;
    if (due) out.push({ text: `${due} project milestone${due === 1 ? "" : "s"} this week`, href: `${base}/projects`, tone: "info" });
    return out;
  }, [now, hires, candidates, roles, projects, clientId, base]);

  if (!g) return <div className="gr" style={{ minHeight: 120 }} />;
  const celebrate = g.moment === "birthday" || g.moment === "anniversary";
  return (
    <div className="gr">
      <div className="gr-top">
        <div className="gr-hello">
          <span className="gr-date">{dateLine(now!)}</span>
          <h1 className={celebrate ? "gr-party" : ""}>{g.headline}</h1>
          <p className="gr-sub">{g.sub}</p>
        </div>
        <button className="btn sm" onClick={onCustomize}>Customize</button>
      </div>
      {chips.length > 0 && (
        <div className="gr-chips">
          {chips.map((c) => (
            <Link key={c.text} href={c.href} className="gr-chip"><span className={`gr-dot ${c.tone}`} aria-hidden="true" />{c.text}</Link>
          ))}
        </div>
      )}
      {!off && !hidden && (
        <section className="gr-thought" aria-label="Today's thought">
          <div className="gr-thead">
            <span className="gr-label">Today&apos;s thought</span>
            <span className="gr-theme">{thought.theme}</span>
            <span style={{ flex: 1 }} />
            <button className="gr-hide" onClick={() => { set("alza-thought-hidden", todayKey()); setHidden(true); }}>Hide for today</button>
          </div>
          <p className="gr-q">{thought.thought}</p>
          <div className="gr-try">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <p><b>Try this today:</b> {thought.tryThis}</p>
          </div>
          <div className="gr-foot">
            <span>From Ben at AlzaHR · a new one each weekday</span>
            <button className="linklike tiny" onClick={() => { if (confirm("Stop showing the daily thought? You can turn it back on at the bottom of the dashboard.")) { set("alza-thought-off", "1"); setOff(true); } }}>Turn off</button>
          </div>
        </section>
      )}
      {(hidden || off) && (
        <button className="gr-show" onClick={() => { set("alza-thought-hidden", ""); set("alza-thought-off", ""); setHidden(false); setOff(false); }}>Show today&apos;s thought</button>
      )}
    </div>
  );
}
