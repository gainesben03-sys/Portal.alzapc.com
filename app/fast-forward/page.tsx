"use client";

// Fast-forward: a new hire's first 90 days in 30 seconds. Shows what the People Hub sends on its own,
// to the manager and to the new hire, using the real templates and reminder rules (sample data).
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/ui";
import { PeopleHubMark } from "@/components/phmark";
import { DEFAULT_BUDDY_INTRO, DEFAULT_MGR_SIGNED, DEFAULT_STAGES } from "@/lib/experience";
import { type Hire, longDate, onboardingFor, signRequestEmail } from "@/lib/hires";
import { emailForHire, renderOnboard } from "@/lib/onboardemail";
import { DEMO_ACCENT, DEMO_COMPANY } from "@/lib/state";

type Role = "manager" | "hire";
type Ev = { day: number; kind: "email" | "push"; title: string; body: string; why: string; html?: string; script?: { items: string[]; asks: string[] }; open?: { label: string; href: string } };

const DAYS_BEFORE = 12;
const LAST = 92;
const SECONDS = 32;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

function build(): Record<Role, Ev[]> {
  const start = iso(plus(DAYS_BEFORE));
  const brand = { company: DEMO_COMPANY, accent: DEMO_ACCENT };
  const h = { id: "ff", clientId: "harborlight", status: "Offer signed", title: "Warehouse Associate", managerName: "Dana Ortiz", managerTitle: "Warehouse Manager", name: "Jordan Lee", personalEmail: "jordan.lee@gmail.com", payType: "hourly", payAmount: 24, exempt: "nonexempt", startDate: start, arrivalTime: "7:00 AM", location: "Harborlight warehouse, Bay 3", createdAt: new Date().toISOString(), history: [], actionItems: "Bring a photo ID for your I-9\nWear closed-toe shoes" } as unknown as Hire;
  const s = onboardingFor({ hrName: "Taylor Reed", hrEmail: "hr@harborlight.com", payroll: "ADP" } as never);
  const fill = (t: string) => t.replace(/\{first name\}/g, "Jordan").replace(/\{full name\}/g, "Jordan Lee").replace(/\{start date\}/g, longDate(start)).replace(/\{job title\}/g, "Warehouse Associate").replace(/\{buddy\}/g, "Sam Okafor").replace(/\{buddy first\}/g, "Sam").replace(/\{company\}/g, DEMO_COMPANY);
  const r = (id: string) => { const e = emailForHire(id, h, s); return e ? renderOnboard(e, h, s, brand) : null; };
  const welcome = r("welcome"), first = r("firstDay");
  const offer = signRequestEmail(h, "Offer Letter", "/sign/demo", s, brand, iso(plus(DAYS_BEFORE + 20)));
  const stage = (id: string) => DEFAULT_STAGES.find((x) => x.id === id)!;
  const plan = (id: string, day: number, label: string): Ev => {
    const st = stage(id);
    return { day, kind: "email", title: `${label}: your plan for Jordan`, body: `${st.items.slice(0, 2).join(". ")}. Plus what to ask.`, why: day < 0 ? `${-day} days before the start date` : day === 0 ? "On the start date" : `${day} days after the start date`, script: { items: st.items, asks: st.asks } };
  };
  return {
    manager: [
      { day: -DAYS_BEFORE, kind: "email", title: fill(DEFAULT_MGR_SIGNED.subject), body: "Your plan for Jordan's first 90 days is ready.", why: "The moment Jordan signs the offer", open: { label: "See the plan", href: "/c/harborlight/hub" } },
      plan("prep", -7, "Before day one"),
      { day: -1, kind: "push", title: "Jordan starts tomorrow", body: "Be there to greet them, and block time for a first-day check-in.", why: "The day before the start date" },
      plan("day", 0, "Day one"),
      plan("week", 4, "First week"),
      { day: 14, kind: "push", title: "Two weeks in", body: "Check in with Jordan: how's it going, any questions, feeling connected to the team?", why: "14 days after the start date" },
      { day: 21, kind: "push", title: "Jordan got a shoutout", body: "Sam: \"Jumped in on the Ramirez load without being asked.\"", why: "Whenever someone on your team gets a shoutout", open: { label: "See the Team Wall", href: "/shout/demo?wall=1" } },
      plan("d30", 30, "Day 30"),
      { day: 57, kind: "push", title: "Jordan's birthday is Thursday", body: "A quick shoutout goes a long way.", why: "3 days before a birthday on your team", open: { label: "Send a shoutout", href: "/shout/demo?to=Jordan%20Lee" } },
      plan("d60", 60, "Day 60"),
      { day: 83, kind: "email", title: "Jordan's 90-day review is due in a week", body: "Jordan finished the self-assessment. Most managers take about 10 minutes.", why: "7 days before a review is due", open: { label: "Start the review", href: "/c/harborlight/reviews" } },
      plan("d90", 90, "Day 90"),
    ],
    hire: [
      { day: -DAYS_BEFORE - 1, kind: "email", title: offer.subject, body: "Review and sign your offer letter. No account needed.", why: "When HR sends the offer", html: offer.html, open: { label: "Open the offer", href: "/sign/demo" } },
      ...(welcome ? [{ day: -DAYS_BEFORE + 1, kind: "email" as const, title: welcome.subject, body: "Everything for your first day, plus a few quick questions to introduce you to the team.", why: "The day after the offer is signed", html: welcome.html, open: { label: "Open your welcome page", href: "/welcome/demo" } }] : []),
      { day: -8, kind: "email", title: fill(DEFAULT_BUDDY_INTRO.subject), body: fill(DEFAULT_BUDDY_INTRO.message).split("\n")[0], why: "A week before the start date" },
      ...(first ? [{ day: -1, kind: "email" as const, title: first.subject, body: "Where to go, when to arrive, what to bring.", why: "The day before the start date", html: first.html }] : []),
      { day: 9, kind: "push", title: "Dana gave you a shoutout 🎉", body: "\"Great first week. You picked up the scanner faster than anyone.\"", why: "Whenever someone sends you a shoutout", open: { label: "See the Team Wall", href: "/shout/demo?wall=1" } },
      { day: 25, kind: "email", title: "The Pause | Five minutes for yourself", body: "This month: Gratitude. An hourglass, one good question, five minutes.", why: "Once a month, with The Pause newsletter", open: { label: "Take five minutes", href: "/pause/demo" } },
      { day: 60, kind: "email", title: "Happy birthday, Jordan!", body: "From everyone at Harborlight Events.", why: "On your birthday (if your company turns it on)" },
      { day: 80, kind: "email", title: "Your self-assessment is ready", body: "Dana would like your input before your 90-day review. About 10 minutes, in English or Spanish.", why: "10 days before your review is due" },
      { day: 91, kind: "email", title: "Your 90-day review is ready to read", body: "Read it, add a comment, and sign off.", why: "When your manager shares the review", open: { label: "Read your review", href: "/my-review/demo-review" } },
    ],
  };
}

export default function FastForward() {
  const [role, setRole] = useState<Role>("manager");
  const evs = useMemo(build, []);
  const list = evs[role];
  const first = list[0].day - 1;
  const [t, setT] = useState(0); // 0..1 through the timeline
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState<Ev | null>(null);
  const raf = useRef(0);
  const last = useRef(0);

  const day = Math.round(first + t * (LAST - first));
  const shown = list.filter((e) => e.day <= day);

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      setT((x) => {
        const n = Math.min(1, x + dt / SECONDS);
        if (n >= 1) setPlaying(false);
        return n;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const pick = (r: Role) => { setRole(r); setT(0); setPlaying(false); };
  const play = () => { if (t >= 1) setT(0); setPlaying(!playing); };
  const startDate = plus(DAYS_BEFORE);
  const dateOf = (d: number) => { const x = new Date(startDate); x.setDate(x.getDate() + d); return x.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
  const dayLabel = (d: number) => (d < 0 ? `${-d} day${d === -1 ? "" : "s"} before` : d === 0 ? "Day one" : `Day ${d}`);

  return (
    <div className="ff">
      <header className="ff-top">
        <Link href="/" className="ff-back">‹ Demo</Link>
        <div className="ff-seg" role="tablist">
          <button role="tab" aria-selected={role === "manager"} className={role === "manager" ? "on" : ""} onClick={() => pick("manager")}>Manager</button>
          <button role="tab" aria-selected={role === "hire"} className={role === "hire" ? "on" : ""} onClick={() => pick("hire")}>New hire</button>
        </div>
      </header>

      <div className="ff-body">
        <div className="ff-intro">
          <div className="ff-k">⚡ On autopilot</div>
          <h1>Jordan&apos;s first 90 days, in 30 seconds</h1>
          <p>{role === "manager" ? "What Dana, the manager, gets without anyone lifting a finger: a plan, reminders, and what to say at every check-in." : "What Jordan, the new hire, gets on their own: the offer, the welcome, the first day, shoutouts and their review."}</p>
          <button className="ff-play" onClick={play}>{playing ? "❚❚ Pause" : t >= 1 ? "↻ Play again" : t > 0 ? "▶ Keep going" : "▶ Play"}</button>
        </div>

        <div className="ff-phone" aria-live="polite">
          <div className="ff-status"><span>{dateOf(day)}</span><b>{dayLabel(day)}</b></div>
          <div className="ff-stack">
            {shown.length === 0 && <div className="ff-empty">Tap Play</div>}
            {[...shown].reverse().map((e) => (
              <button key={e.title + e.day} className={`ff-note ${e.kind}`} onClick={() => { setPlaying(false); setOpen(e); }}>
                <span className="ff-ic">{e.kind === "push" ? <PeopleHubMark size={30} /> : <i>✉</i>}</span>
                <span className="ff-txt">
                  <span className="ff-row"><b>{e.kind === "push" ? "People Hub" : DEMO_COMPANY}</b><em>{dayLabel(e.day)}</em></span>
                  <span className="ff-title">{e.title}</span>
                  <span className="ff-sub">{e.body}</span>
                  <span className="ff-why">⚡ {e.why}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="ff-line">
          <input type="range" min={0} max={1000} value={Math.round(t * 1000)} onChange={(e) => { setPlaying(false); setT(Number(e.target.value) / 1000); }} aria-label="Timeline" />
          <div className="ff-marks">
            {list.map((e) => <i key={e.title + e.day} className={e.day <= day ? "on" : ""} style={{ left: `${((e.day - first) / (LAST - first)) * 100}%` }} />)}
          </div>
          <div className="ff-ends"><span>Offer</span><span>Day 90</span></div>
        </div>
      </div>

      {open && (
        <Sheet title={open.title} onClose={() => setOpen(null)}>
          <p className="ff-why big">⚡ Sent automatically: {open.why.charAt(0).toLowerCase() + open.why.slice(1)}</p>
          {open.html ? (
            <iframe className="ff-mail" srcDoc={open.html} title={open.title} />
          ) : open.script ? (
            <div className="ff-script">
              <p className="small">{open.body}</p>
              <h3>To do</h3>
              <ul>{open.script.items.map((x) => <li key={x}>{x}</li>)}</ul>
              <h3>What to say</h3>
              <ul className="asks">{open.script.asks.map((x) => <li key={x}>&ldquo;{x}&rdquo;</li>)}</ul>
            </div>
          ) : (
            <p>{open.body}</p>
          )}
          {open.open && <Link className="btn primary block" style={{ marginTop: 12 }} href={open.open.href}>{open.open.label}</Link>}
        </Sheet>
      )}
    </div>
  );
}
