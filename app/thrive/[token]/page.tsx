"use client";

// MOCKUP: Thrive, the employee page for a company's benefits and wellness. No sign-in, same idea as The Pause.
// Sample data only for now; the real version fills from each client's Thrive builder output.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DEMO_COMPANY } from "@/lib/state";

const BENEFITS = [
  { k: "Medical", v: "Three plans, from $0 a paycheck for you", more: "Kaiser HMO, Anthem PPO or Anthem HSA. Harborlight pays 90% for you and 60% for family." },
  { k: "Dental & vision", v: "Covered for you, low cost for family", more: "Delta Dental PPO and VSP. Cleanings twice a year at no cost." },
  { k: "401(k)", v: "4% match, yours from day one", more: "Put in 4% and Harborlight adds 4% more. Free 1:1 planning with Guideline." },
  { k: "Time off", v: "15 days PTO, 10 holidays, 5 sick days", more: "PTO grows to 20 days after 3 years. Your birthday is a paid day off." },
];

type Item = { t: string; d: string; cta: string; href?: string; health?: boolean };
const PILLARS: { id: string; name: string; color: string; items: Item[] }[] = [
  {
    id: "physical", name: "Physical & mental", color: "#17505d", items: [
      { t: "Gyms, studios and apps", d: "1,000s of gyms, yoga and wellbeing apps at Alza-negotiated rates. Plans from $0.", cta: "See options" },
      { t: "Talk to someone, free", d: "Confidential counseling 24/7 for you and your family, up to 6 free sessions. Harborlight never knows who calls.", cta: "Call 1-800-555-0142" },
      { t: "Team move challenge", d: "Walk, run, ride or stretch. Connect a fitness app or just log minutes. The team only ever sees the total.", cta: "Join (opt-in)", health: true },
    ],
  },
  {
    id: "financial", name: "Financial", color: "#b98a47", items: [
      { t: "Money basics workshop", d: "Thursday, Dec 11 at noon. Budgeting for the holidays, 30 minutes, lunch on us.", cta: "Save my seat" },
      { t: "1:1 with Chris at Wood Financial", d: "A free, private call. Debt, saving, buying a home, retirement, anything. You book directly with Chris, so Harborlight never sees who books.", cta: "Book a call" },
      { t: "401(k) in 5 minutes", d: "How the match works and how to raise your contribution.", cta: "Watch" },
    ],
  },
  {
    id: "connection", name: "Connection", color: "#d9714e", items: [
      { t: "Team Wall", d: "Shoutouts from your coworkers. Give one in 20 seconds.", cta: "Open the wall", href: "/shout/demo" },
      { t: "This week", d: "Chris W. birthday today · Jamie L. 3 years on Monday · Volunteer day Dec 13 at the food bank.", cta: "See celebrations", href: "/shout/demo" },
      { t: "Past Pauses", d: "Every month's 5-minute ritual, ready to redo.", cta: "Browse", href: "/pause/demo" },
    ],
  },
];

const APPS = ["Apple Health", "Google Fit", "Fitbit", "Garmin", "Strava"];

export default function ThriveMock() {
  const { token } = useParams<{ token: string }>();
  const [open, setOpen] = useState<string | null>(null);
  const [connect, setConnect] = useState(false);
  const [move, setMove] = useState(false);
  const company = token === "demo" ? DEMO_COMPANY : "Your company";

  return (
    <div className="th">
      <div className="th-mock">Mockup with sample data</div>
      <header className="th-top">
        <div className="th-mark">THRIVE</div>
        <div className="th-co">{company}</div>
      </header>
      <main className="th-main">
        <section className="th-hero">
          <h1>Everything that&apos;s yours, in one place.</h1>
          <p>Your benefits, time off and the extras that help you feel good at work and outside it.</p>
        </section>

        <section className="th-month">
          <div className="th-k">This month · Gratitude</div>
          <h2>Take five minutes for yourself</h2>
          <div className="th-two">
            <Link href="/pause/demo" className="th-pick"><b>Reflect</b><span>A 5-minute pause with one good question</span></Link>
            <button className="th-pick soon" onClick={() => setMove(!move)}><b>Move</b><span>A 5-minute stretch for desk, floor or road</span></button>
          </div>
          {move && <div className="th-note">Move is next: pick At a desk, On your feet or On the road, then follow 5 simple moves with the same hourglass.</div>}
          <div className="th-note">Open enrollment ends Friday, Dec 5. <a href="#benefits">Review your plans</a></div>
        </section>

        <section id="benefits">
          <div className="th-k dark">Your benefits</div>
          <div className="th-ben">
            {BENEFITS.map((b) => (
              <button key={b.k} className={`th-b ${open === b.k ? "on" : ""}`} onClick={() => setOpen(open === b.k ? null : b.k)}>
                <b>{b.k}</b>
                <span>{b.v}</span>
                {open === b.k && <em>{b.more}</em>}
              </button>
            ))}
          </div>
          <div className="th-row">
            <a className="th-btn" href="#" onClick={(e) => e.preventDefault()}>Log in to ADP</a>
            <a className="th-btn ghost" href="#" onClick={(e) => e.preventDefault()}>Full Thrive Guide (PDF)</a>
          </div>
        </section>

        {PILLARS.map((p) => (
          <section key={p.id} id={p.id} className="th-pillar" style={{ ["--pc" as string]: p.color }}>
            <div className="th-ph"><span />{p.name}</div>
            {p.items.map((it) => (
              <div key={it.t} className="th-item">
                <div className="grow">
                  <b>{it.t}</b>
                  <p>{it.d}</p>
                  {it.health && connect && (
                    <div className="th-apps">
                      {APPS.map((a) => <span key={a}>{a}</span>)}
                      <small>Only minutes are shared, never health details. Leave any time.</small>
                    </div>
                  )}
                </div>
                {it.href ? <Link className="th-cta" href={it.href}>{it.cta}</Link> : <button className="th-cta" onClick={() => it.health && setConnect(!connect)}>{it.cta}</button>}
              </div>
            ))}
            {p.id === "physical" && (
              <div className="th-team">
                <div><b>1,240</b><span>team minutes this month</span></div>
                <div className="th-bar"><i style={{ width: "62%" }} /></div>
                <span>Goal: 2,000 minutes by Dec 31. 18 people in.</span>
              </div>
            )}
          </section>
        ))}

        <p className="th-private">🔒 {company} only ever sees totals, never who used what.</p>
      </main>
      <footer className="th-foot">Questions? Ask HR or text Ben at (626) 224-8161 · Thrive by Alza</footer>
    </div>
  );
}
