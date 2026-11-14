"use client";

// Team Wall styles: corkboard, chalkboard, brick, graffiti, or clean.
// The company picks one in setup. How notes hang comes with the wall:
// pins on cork, magnets (and some chalk) on the chalkboard, nails on brick, spray paint and stickers on graffiti.
import type { ReactNode } from "react";

export type WallStyle = "clean" | "cork" | "chalk" | "brick" | "graffiti";

export const WALLS: { id: WallStyle; name: string; blurb: string }[] = [
  { id: "clean", name: "Clean", blurb: "Simple cards. The look you have now." },
  { id: "cork", name: "Corkboard", blurb: "Paper notes with push pins." },
  { id: "chalk", name: "Chalkboard", blurb: "Some notes chalked on the board, the rest on magnets. SAVE in the corner." },
  { id: "brick", name: "Brick wall", blurb: "Notes hung on masonry nails." },
  { id: "graffiti", name: "Graffiti wall", blurb: "Shoutouts spray-painted on. Birthdays and welcomes are stickers and flyers." },
];

export const WALL_FONTS = "https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Kalam:wght@400;700&family=Permanent+Marker&family=Sedgwick+Ave+Display&family=Anton&display=swap";

const TITLE: Record<Exclude<WallStyle, "clean">, string> = { cork: "Team Wall", chalk: "Team Wall", brick: "TEAM WALL", graffiti: "Team Wall" };

/** The wall itself: background, title, and everything pinned to it. */
export function Wall({ style, children }: { style: Exclude<WallStyle, "clean">; children: ReactNode }) {
  return (
    <section className={`wall wall-${style}`} aria-label="Team Wall">
      <link rel="stylesheet" href={WALL_FONTS} precedence="default" />
      <Backdrop style={style} />
      {style === "chalk" && <div className="wall-save" aria-hidden="true">SAVE</div>}
      <div className="wall-in">
        <h2 className="wall-title">{TITLE[style]}</h2>
        {children}
      </div>
    </section>
  );
}

/** A birthday, anniversary or new starter, in the wall's own way. */
export type WallMomentData = { key: string; kind: "new" | "bday" | "anniv"; badge: string; mon?: string; today?: boolean; name: string; line: string; action: string };

export function WallMoment({ m, style, onAct }: { m: WallMomentData; style: Exclude<WallStyle, "clean">; onAct: () => void }) {
  const first = m.name.split(" ")[0];
  const btn = <button className="wm-btn" onClick={onAct}>{m.action}</button>;

  if (style === "graffiti") {
    if (m.kind === "bday" && m.today)
      return (
        <article className="wn wm-sticker">
          <div className="wm-sticker-top"><b>HAPPY BIRTHDAY</b><span>TODAY · {m.mon?.toUpperCase()} {m.badge}</span></div>
          <div className="wm-sticker-name">{first}</div>
          {btn}
        </article>
      );
    if (m.kind === "bday")
      return (
        <article className="wn wm-flyer">
          <div className="wm-flyer-body"><b>BIRTHDAY!</b><span className="wm-marker">{m.name}</span><small>{m.line.replace(/^Birthday · /, "")}</small>{btn}</div>
          <div className="wm-tabs" aria-hidden="true">{[1, 1, 0, 1, 1, 1].map((x, i) => <span key={i} className={x ? "" : "gone"}>Wish {first} well</span>)}</div>
        </article>
      );
    if (m.kind === "new")
      return (
        <article className="wn wm-label">
          <div className="wm-label-top"><b>SHIPPING LABEL</b><i aria-hidden="true" /></div>
          <small>FROM</small>
          <div className="wm-marker">The whole crew</div>
          <small>TO</small>
          <div className="wm-marker big">{first}, welcome!</div>
          <div className="wm-label-foot">{m.line}</div>
          {btn}
        </article>
      );
  }

  if (m.kind === "bday")
    return (
      <article className={`wn wm-bday ${m.today ? "today" : ""}`}>
        {m.today && <span className="wm-ribbon" aria-hidden="true">TODAY</span>}
        <span className="wm-cal" aria-hidden="true"><small>{m.mon}</small><b>{m.badge}</b></span>
        <div className="wm-txt">{m.today ? <><em>Birthday today</em><b>Happy birthday, {first}!</b></> : <><b>{m.name}</b><span>{m.line}</span></>}</div>
        {btn}
      </article>
    );
  if (m.kind === "anniv")
    return (
      <article className="wn wm-anniv">
        <span className="wm-years" aria-hidden="true"><b>{m.badge}</b><small>{m.badge === "1" ? "YEAR" : "YEARS"}</small></span>
        <div className="wm-txt"><b>{m.name}</b><span>{m.line}</span></div>
        {btn}
      </article>
    );
  return (
    <article className="wn wm-polaroid">
      <div className="wm-photo" aria-hidden="true">{m.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</div>
      <b>Welcome, {first}!</b>
      <span>{m.line}</span>
      {btn}
    </article>
  );
}

function Backdrop({ style }: { style: Exclude<WallStyle, "clean"> }) {
  if (style === "cork")
    return (
      <svg className="wall-bg" aria-hidden="true">
        <defs>
          <pattern id="w-cork" width="14" height="14" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill="#c89662" />
            <circle cx="2" cy="3" r="1" fill="#a7743f" /><circle cx="9" cy="6" r=".8" fill="#b8854f" /><circle cx="5" cy="11" r="1.1" fill="#dcad77" /><circle cx="12" cy="2" r=".7" fill="#946235" /><circle cx="11" cy="12" r=".9" fill="#b07c46" /><circle cx="6" cy="6" r=".5" fill="#e3b986" />
          </pattern>
          <radialGradient id="w-cork-l" cx="40%" cy="30%" r="80%"><stop offset="0" stopColor="#fff" stopOpacity=".12" /><stop offset="1" stopColor="#000" stopOpacity=".18" /></radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#w-cork)" /><rect width="100%" height="100%" fill="url(#w-cork-l)" />
      </svg>
    );
  if (style === "chalk")
    return (
      <svg className="wall-bg" aria-hidden="true">
        <defs>
          <radialGradient id="w-s1" cx="25%" cy="20%" r="45%"><stop offset="0" stopColor="#fff" stopOpacity=".07" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <radialGradient id="w-s2" cx="75%" cy="70%" r="50%"><stop offset="0" stopColor="#fff" stopOpacity=".05" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <pattern id="w-dust" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#2b3933" /><circle cx="2" cy="7" r=".5" fill="#fff" fillOpacity=".05" /><circle cx="7" cy="2" r=".4" fill="#fff" fillOpacity=".04" /></pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#w-dust)" /><rect width="100%" height="100%" fill="url(#w-s1)" /><rect width="100%" height="100%" fill="url(#w-s2)" />
      </svg>
    );
  if (style === "brick")
    return (
      <svg className="wall-bg" aria-hidden="true">
        <defs>
          <pattern id="w-brick" width="96" height="48" patternUnits="userSpaceOnUse">
            <rect width="96" height="48" fill="#c9bcab" />
            <rect x="1.5" y="1.5" width="45" height="21" rx="1.5" fill="#9d4a33" /><rect x="49.5" y="1.5" width="45" height="21" rx="1.5" fill="#a9573c" />
            <rect x="-22.5" y="25.5" width="45" height="21" rx="1.5" fill="#8f4330" /><rect x="25.5" y="25.5" width="45" height="21" rx="1.5" fill="#a65238" /><rect x="73.5" y="25.5" width="45" height="21" rx="1.5" fill="#8f4330" />
          </pattern>
          <pattern id="w-brick2" width="288" height="144" patternUnits="userSpaceOnUse">
            <rect x="49.5" y="1.5" width="45" height="21" fill="#000" fillOpacity=".1" /><rect x="169.5" y="73.5" width="45" height="21" fill="#fff" fillOpacity=".07" /><rect x="25.5" y="121.5" width="45" height="21" fill="#000" fillOpacity=".08" /><rect x="217.5" y="25.5" width="45" height="21" fill="#fff" fillOpacity=".06" />
          </pattern>
          <linearGradient id="w-brick-l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".08" /><stop offset="1" stopColor="#000" stopOpacity=".22" /></linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#w-brick)" /><rect width="100%" height="100%" fill="url(#w-brick2)" /><rect width="100%" height="100%" fill="url(#w-brick-l)" />
      </svg>
    );
  return (
    <svg className="wall-bg" aria-hidden="true">
      <defs>
        <pattern id="w-block" width="128" height="64" patternUnits="userSpaceOnUse">
          <rect width="128" height="64" fill="#8e8d89" />
          <path d="M0 0.5 H128 M0 32.5 H128 M0.5 0 V32 M64.5 32 V64" stroke="#74736f" strokeWidth="2" />
          <circle cx="20" cy="14" r="1" fill="#6c6b67" /><circle cx="90" cy="20" r="1.2" fill="#a3a29d" /><circle cx="40" cy="50" r=".9" fill="#6c6b67" /><circle cx="110" cy="46" r="1" fill="#a3a29d" />
        </pattern>
        {(["#ff3d8b", "#19c2b0", "#ffd23f", "#7b4dff"] as const).map((c, i) => (
          <radialGradient key={c} id={`w-sp${i}`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor={c} stopOpacity=".7" /><stop offset=".6" stopColor={c} stopOpacity=".3" /><stop offset="1" stopColor={c} stopOpacity="0" /></radialGradient>
        ))}
        <linearGradient id="w-grime" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#000" stopOpacity=".15" /><stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#2b2418" stopOpacity=".45" /></linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#w-block)" />
      <ellipse cx="12%" cy="18%" rx="260" ry="150" fill="url(#w-sp0)" />
      <ellipse cx="82%" cy="12%" rx="300" ry="170" fill="url(#w-sp1)" />
      <ellipse cx="50%" cy="55%" rx="320" ry="190" fill="url(#w-sp2)" />
      <ellipse cx="14%" cy="82%" rx="260" ry="160" fill="url(#w-sp3)" />
      <ellipse cx="88%" cy="78%" rx="240" ry="150" fill="url(#w-sp0)" />
      <g fontFamily="'Sedgwick Ave Display', cursive">
        <text x="3%" y="34%" fontSize="200" fill="#1c1c1c" fillOpacity=".14">LOVE</text>
        <text x="55%" y="42%" fontSize="170" fill="#fff" fillOpacity=".1" stroke="#111" strokeOpacity=".2" strokeWidth="3">CREW</text>
        <text x="22%" y="92%" fontSize="150" fill="#ff3d8b" fillOpacity=".18">ONE TEAM</text>
      </g>
      <rect width="100%" height="100%" fill="url(#w-grime)" />
    </svg>
  );
}
