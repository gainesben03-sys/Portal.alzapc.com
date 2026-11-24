"use client";

// The guided demo card: a highlight on one thing, one sentence, Next. Demo site only.
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { readTour, TOUR, TOUR_ROLES, TourState, writeTour } from "@/lib/demotour";

const CALENDLY = "https://calendly.com/ben-alzapc/30min";

function find(sel?: string): HTMLElement | null {
  if (!sel) return null;
  if (sel.startsWith("text:")) {
    const t = sel.slice(5).toLowerCase();
    const hit = [...document.querySelectorAll<HTMLElement>("main button, main a, main h1, main h2, main h3, main .tile-head, main .flabel")].find((e) => e.offsetParent && (e.textContent || "").trim().toLowerCase().startsWith(t));
    if (!hit) return null;
    return hit.matches("button, a") ? hit : (hit.closest(".card, .tile, section") as HTMLElement) ?? hit;
  }
  const el = document.querySelector<HTMLElement>(sel);
  return el && el.offsetParent ? el : null;
}

export function DemoTour() {
  const router = useRouter();
  const path = usePathname();
  const [t, setT] = useState<TourState | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  useEffect(() => {
    const sync = () => setT(readTour());
    sync();
    window.addEventListener("alza-demo-tour", sync);
    return () => window.removeEventListener("alza-demo-tour", sync);
  }, []);
  const steps = t ? TOUR[t.role] : [];
  const step = t && !t.done ? steps[t.step] : null;
  const here = !!step && path === step.path;

  // highlight the thing this stop is about
  const place = useCallback(() => {
    const el = here ? find(step?.sel) : null;
    setBox(el ? el.getBoundingClientRect() : null);
  }, [here, step?.sel]);
  useEffect(() => {
    if (!here) return setBox(null);
    let n = 0;
    const tryFind = setInterval(() => {
      const el = find(step?.sel);
      if (el || ++n > 20) {
        clearInterval(tryFind);
        if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(place, 450); }
      }
    }, 150);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { clearInterval(tryFind); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [here, step?.sel, place]);

  if (!t) return null;
  const go = (n: number) => {
    if (n >= steps.length) return writeTour({ ...t, done: true });
    const next = { ...t, step: Math.max(0, n) };
    writeTour(next);
    if (steps[next.step].path !== path) router.push(steps[next.step].path);
  };
  const role = TOUR_ROLES.find((r) => r.id === t.role)!;

  if (t.done)
    return (
      <div className="dt-scrim" role="dialog" aria-label="That's the People Hub">
        <div className="dt-finish">
          <p className="dt-kicker">The People Hub</p>
          <h2>Now it&apos;s yours.</h2>
          <p>Give a shoutout, add a new hire, launch a review. Go ahead, try it out.</p>
          <button className="btn gold block" onClick={() => writeTour(null)}>Start playing</button>
          <div className="dt-row">
            <button className="btn block" onClick={() => { writeTour(null); router.push("/"); }}>See another view</button>
            <a className="btn ghost block" href={CALENDLY} target="_blank" rel="noreferrer">Book a call with HR</a>
          </div>
        </div>
      </div>
    );

  return (
    <>
      {box && <div className="dt-ring" style={{ left: box.left - 8, top: box.top - 8, width: box.width + 16, height: box.height + 16 }} aria-hidden="true" />}
      <div className="dt-card" role="dialog" aria-label="Guided demo">
        <div className="dt-top">
          <span className="dt-kicker">{role.label} · {t.step + 1} of {steps.length}</span>
          <button className="dt-x" aria-label="End the tour" onClick={() => writeTour(null)}>×</button>
        </div>
        {here ? (
          <>
            <b className="dt-title">{step!.title}</b>
            <p className="dt-text">{step!.text}</p>
            {step!.tryIt && <p className="dt-try"><b>Try it:</b> {step!.tryIt}</p>}
            <div className="dt-bar"><span style={{ width: `${((t.step + 1) / steps.length) * 100}%` }} /></div>
            <div className="dt-row">
              {t.step > 0 ? <button className="btn ghost sm" onClick={() => go(t.step - 1)}>Back</button> : <span />}
              <button className="btn gold sm" onClick={() => go(t.step + 1)}>{t.step + 1 === steps.length ? "Finish" : "Next"}</button>
            </div>
          </>
        ) : (
          <div className="dt-row"><span className="dt-text" style={{ margin: 0 }}>Looking around? Pick up where you left off.</span><button className="btn gold sm" onClick={() => router.push(step!.path)}>Back to the tour</button></div>
        )}
      </div>
    </>
  );
}
