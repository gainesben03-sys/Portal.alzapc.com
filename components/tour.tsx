"use client";

// A short click-through tour the first time someone opens their Alza Hub.
// It points at the real menu and buttons, skips anything this person can't see, and can be replayed from the "?" button.
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useStore } from "@/lib/store";

type Step = { target?: string; title: string; body: string };
const KEY = (email: string) => `alza-tour-v1:${email || "guest"}`;
export const startTour = () => window.dispatchEvent(new Event("alza-tour"));
/** Has this person finished or skipped the tour on this device? Other first-visit prompts wait for it. */
export function tourSeen(email: string) {
  try { return !!localStorage.getItem(KEY((email || "").toLowerCase())); } catch { return true; }
}

function stepsFor(kind: "exec" | "manager" | "hiring", company: string, first: string): Step[] {
  const hello: Step = { title: `Welcome, ${first}`, body: `This is ${company}'s Alza Hub. Here's a one-minute look around. Skip anytime.` };
  const phone: Step = { target: "push", title: "Take it with you", body: "Add the Alza Hub to your phone's home screen and turn on alerts, so the important stuff finds you." };
  const replay: Step = { target: "help", title: "That's it", body: "Tap ? up here anytime to see this again. Questions? Ben is a message away." };
  const ask: Step = { target: "nav-library", title: "Ask HR and resources", body: "Templates, newsletters and Ask HR, which answers from your own handbook and policies." };
  if (kind === "manager")
    return [
      hello,
      { target: "hub-week", title: "Your attention this week", body: "What your team needs from you, grouped: reviews, check-ins, recognition. Tap a group to see who and act right there." },
      { target: "hub-quick", title: "Two quick buttons", body: "Start a check-in or recognize someone in under a minute. Works great from your phone." },
      { target: "sub-team", title: "Your team", body: "Everyone on your team, with notes from past check-ins so 1:1s are easy to prep." },
      { target: "nav-people", title: "New hires and reviews", body: "Your new hires and your team's reviews live under People. When a review is due, it also shows up in your week. About 10 minutes each." },
      { target: "sub-recognition", title: "Recognition", body: "Shoutouts, birthdays and work anniversaries for the whole company." },
      ask,
      phone,
      replay,
    ];
  if (kind === "hiring")
    return [
      hello,
      { target: "nav-people", title: "Hiring", body: "Your open roles and candidates. Watch video pitches and tap yes or no." },
      replay,
    ];
  return [
    hello,
    { target: "nav-home", title: "Your dashboard", body: "What needs you, new hires, hiring, reviews and celebrations, at a glance. Every line is a link." },
    { target: "customize", title: "Make it yours", body: "Add, remove or reorder what's on your dashboard. It only changes your view." },
    { target: "nav-hub", title: "Team Hub", body: "For anyone who leads a team: this week's to-dos, your team and recognition." },
    { target: "nav-people", title: "People", body: "New hires from offer to day one, recruiting, performance reviews, and who has access to the Alza Hub." },
    { target: "nav-todo", title: "Projects with Ben", body: "What Ben is working on for you, what's moving, and anything waiting on your side." },
    ask,
    phone,
    replay,
  ];
}

export function Tour({ company, homeHref }: { company: string; homeHref: string }) {
  const { viewer, me } = useStore();
  const path = usePathname();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const client = viewer?.kind === "client";
  const email = (me?.email || (client ? viewer.person.email : "") || "").toLowerCase();
  const first = (client ? viewer.person.name : "").split(" ")[0] || "there";
  const kind = me?.access === "manager" ? "manager" : me?.access === "hiring" ? "hiring" : "exec";

  const visible = useCallback((s: Step) => {
    if (!s.target) return true;
    const el = document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`);
    return !!el && el.offsetParent !== null;
  }, []);
  const begin = useCallback(() => {
    const all = stepsFor(kind, company, first).filter(visible);
    setSteps(all);
    setI(0);
  }, [kind, company, first, visible]);
  const end = useCallback(() => {
    setSteps(null);
    try { localStorage.setItem(KEY(email), new Date().toISOString()); } catch {}
    window.dispatchEvent(new Event("alza-tour-done"));
  }, [email]);

  // first visit to their landing page: start on its own
  useEffect(() => {
    if (!client || !me) return;
    const landing = path === homeHref || path === `${homeHref}/hub` || path === `${homeHref}/recruiting`;
    if (!landing) return;
    let seen = true;
    try { seen = !!localStorage.getItem(KEY(email)); } catch {}
    if (seen) return;
    const t = setTimeout(begin, 900);
    return () => clearTimeout(t);
  }, [client, me, path, homeHref, email, begin]);
  useEffect(() => {
    const go = () => begin();
    window.addEventListener("alza-tour", go);
    return () => window.removeEventListener("alza-tour", go);
  }, [begin]);

  const step = steps?.[i];
  useLayoutEffect(() => {
    if (!step?.target) return setRect(null);
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return setRect(null);
    el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    const place = () => setRect(el.getBoundingClientRect());
    const t = setTimeout(place, 320);
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { clearTimeout(t); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [step]);
  useEffect(() => {
    if (!steps) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") end();
      if (e.key === "ArrowRight") setI((n) => (n < steps.length - 1 ? n + 1 : n));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [steps, end]);

  if (!steps || !step) return null;
  const last = i === steps.length - 1;
  const pad = 6;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const w = Math.min(340, vw - 32);
  let style: React.CSSProperties = { width: w, left: (vw - w) / 2, top: vh * 0.28 };
  if (rect) {
    const below = rect.bottom + 14 + 190 < vh;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), vw - w - 16);
    const above = rect.top - 14 - 200 > 0;
    style = below ? { width: w, left, top: rect.bottom + pad + 10 } : above ? { width: w, left, bottom: vh - rect.top + pad + 10 } : { width: w, left, bottom: 16 };
  }
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Alza Hub tour">
      <div className="tour-catch" onClick={end} />
      {rect ? (
        <div className="tour-hole" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-pop" style={style}>
        <div className="tour-count tiny">{i + 1} of {steps.length}</div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-nav">
          {!last && <button className="linklike tiny" onClick={end}>Skip tour</button>}
          <span style={{ flex: 1 }} />
          {i > 0 && <button className="btn sm" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn primary sm" autoFocus onClick={() => (last ? end() : setI(i + 1))}>{last ? "Got it" : i === 0 ? "Show me" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}

/** The "?" in the top bar: replay the tour. */
export function TourButton() {
  return (
    <button className="theme-toggle" data-tour="help" aria-label="Take the tour" title="Take the tour" onClick={startTour}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5" /><path d="M12 17.5h.01" /></svg>
    </button>
  );
}
