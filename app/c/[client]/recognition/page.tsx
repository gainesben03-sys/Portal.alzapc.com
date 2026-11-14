"use client";

// The Team Wall: shoutouts, this week's birthdays, anniversaries and new starters, the scoreboard
// and challenges on one page. Review and settings (QR code, TV, emails, approval) sit behind the gear.
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { ChallengeCards, Pick, PersonSearch, Scoreboard, ShoutCard, WallItem } from "@/components/shoutui";
import { Baton, Challenge, CHALLENGE_INFO, ChallengeKind, chainStats, challengeLive, PublicChallenge, publicChallenge } from "@/lib/challenges";
import { challengeLine, NUDGE_LINES } from "@/lib/nudge";
import { useStore } from "@/lib/store";
import { authHeader, LIVE, sb } from "@/lib/supabase";
import { DEFAULT_HEADLINE, THEME_STYLES, ThemeStyle, themeVars, secondColor, ShoutTheme, CELEBRATE_FILL_INS, CelebrateKind, CelebrateTemplate, celebrateSender, DEFAULT_CELEBRATE_TEMPLATES, DEFAULT_VALUES, fillCelebrate, MAX_MESSAGE, newRecognition, randomToken, REACTIONS, RecognitionSettings, scoreboard, Shoutout, STARTERS, templateFor } from "@/lib/recognition";
import { DEMO_CHALLENGES, DEMO_PEOPLE, DEMO_SHOUTS, demoReactions } from "@/lib/shoutdemo";

type Rx = { shout_id: string; who: string; emoji: string };

export default function Recognition() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, config, patch, viewer, me, people } = useStore();
  const client = getClient(clientId);
  const toast = useToast();
  const cfg = config[clientId];
  const rec = cfg?.recognition;
  const isAdvisor = viewer?.kind === "advisor";
  const exec = isAdvisor || me?.access === "exec";
  const [list, setList] = useState<Shoutout[]>([]);
  const [rx, setRx] = useState<Rx[]>([]);
  const [giving, setGiving] = useState<false | { pass?: Baton & { title: string }; preset?: { to: Pick; msg?: string } }>(false);
  const [shown, setShown] = useState(12);
  const [sheet, setSheet] = useState<null | "board" | "challenges" | "review" | "settings">(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [starting, setStarting] = useState(false);
  const [nudging, setNudging] = useState(false);
  const myKey = `e:${(me?.email ?? "ben").toLowerCase()}`;

  const load = useCallback(async () => {
    if (!LIVE) {
      setList(DEMO_SHOUTS);
      setChallenges(DEMO_CHALLENGES);
      setRx(Object.entries(demoReactions).flatMap(([id, m]) => Object.entries(m).flatMap(([emoji, n]) => Array.from({ length: n }, (_, k) => ({ shout_id: id, who: `x${k}`, emoji })))));
      return;
    }
    const { data } = await sb().from("shoutouts").select("data").eq("client_id", clientId).order("created_at", { ascending: false }).limit(400);
    const l = (data ?? []).map((r) => r.data as Shoutout);
    setList(l);
    const { data: chs } = await sb().from("challenges").select("data").eq("client_id", clientId).order("created_at", { ascending: false }).limit(40);
    setChallenges((chs ?? []).map((r) => r.data as Challenge));
    const ids = l.filter((s) => s.status === "live").slice(0, 120).map((s) => s.id);
    if (ids.length) {
      const { data: r } = await sb().from("shout_reactions").select("shout_id, who, emoji").in("shout_id", ids);
      setRx((r as Rx[]) ?? []);
    }
  }, [clientId]);
  useEffect(() => {
    if (ok && rec?.token) load();
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("review")) setSheet("review");
    if (sp.get("tab") === "challenges") setSheet("challenges");
  }, [ok, rec?.token, load]);

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  if (!ok || !client) return null;

  const setRec = (p: Partial<RecognitionSettings>) => patch({ config: { ...config, [clientId]: { ...cfg, recognition: { ...(rec ?? newRecognition()), ...p } } } });
  const live = list.filter((s) => s.status === "live");
  const held = list.filter((s) => s.status === "held");
  const roster = people.filter((p) => p.clientId === clientId);
  const manages = roster.some((p) => !!me?.email && p.managerEmail.toLowerCase() === me.email.toLowerCase());
  const canStart = exec || manages;
  const myPerson = roster.find((p) => !!me?.email && p.email?.toLowerCase() === me.email.toLowerCase());
  const activeCh = challenges.filter((c) => challengeLive(c));
  // batons I'm holding in an Appreciation Chain
  const myBatons = activeCh.filter((c) => c.kind === "chain").flatMap((c) => chainStats(c, list).open.filter((b) => myPerson && b.personId === myPerson.id).map((b) => ({ ...b, title: c.title })));
  const board = scoreboard(list, rec?.values ?? DEFAULT_VALUES, since);
  const toItem = (s: Shoutout): WallItem => ({
    id: s.id,
    to: s.to.name,
    team: s.to.department || s.to.location || "",
    from: s.from.name,
    value: s.value ?? null,
    message: s.message,
    at: s.at,
    reactions: Object.fromEntries(REACTIONS.map((e) => [e, rx.filter((r) => r.shout_id === s.id && r.emoji === e).length])),
    mine: rx.filter((r) => r.shout_id === s.id && r.who === myKey).map((r) => r.emoji),
  });
  const api = async (body: object) => {
    if (!LIVE) return { ok: true, demo: true };
    const r = await fetch("/api/shout", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ clientId, ...body }) });
    return r.json().catch(() => ({ ok: false }));
  };
  const react = async (id: string, emoji: string) => {
    const had = rx.some((r) => r.shout_id === id && r.who === myKey && r.emoji === emoji);
    setRx(had ? rx.filter((r) => !(r.shout_id === id && r.who === myKey && r.emoji === emoji)) : [...rx, { shout_id: id, who: myKey, emoji }]);
    await api({ action: "react", id, emoji });
  };
  const review = async (s: Shoutout, approve: boolean) => {
    const j = await api({ action: approve ? "review" : "review", id: s.id, approve });
    if (!j.ok) return toast.show("Couldn't save that");
    setList(list.map((x) => (x.id === s.id ? { ...x, status: approve ? "live" : "removed" } : x)));
    toast.show(approve ? "Posted to the wall" : "Removed");
  };
  const remove = async (s: Shoutout) => {
    if (!confirm(`Take down the shoutout to ${s.to.name}?`)) return;
    const j = await api({ action: "remove", id: s.id });
    if (!j.ok) return toast.show("Couldn't take it down");
    setList(list.map((x) => (x.id === s.id ? { ...x, status: "removed" } : x)));
    toast.show("Taken down");
  };

  const on = !!cfg?.modules.recognition;
  // Ben saves through the portal; an executive's changes go through the server (they can't write settings directly)
  const saveRec = async (r: RecognitionSettings, msg = "Saved") => {
    if (isAdvisor) {
      setRec(r);
      return toast.show(msg);
    }
    const j = await api({ action: "settings", rec: r });
    if (j.demo || j.ok) {
      patch({ config: { ...config, [clientId]: { ...cfg, recognition: j.recognition ?? r } } });
      return toast.show(msg);
    }
    toast.show(j.reason === "preview" ? "Preview is read-only" : "Couldn't save. Try again.");
  };

  // this month's most recognized
  const top = Object.entries(live.filter((x) => new Date(x.at) >= since).reduce((a, x) => ({ ...a, [x.to.name]: (a[x.to.name] ?? 0) + 1 }), {} as Record<string, number>))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const week = thisWeek(roster, rec?.celebrate !== false);
  const pastCh = challenges.filter((c) => !challengeLive(c));
  const asPick = (p: { id: string; name: string; department?: string; location?: string }): Pick => ({ id: p.id, name: p.name, team: p.department || p.location || "" });

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap wide">
        <div className="tw-head">
          <div className="tw-title">
            <h1 style={{ margin: 0 }}>Team Wall</h1>
            <p className="muted" style={{ margin: "4px 0 0" }}>Shoutouts, birthdays and milestones, all in one place.</p>
          </div>
          {rec?.token && (
            <div className="tw-actions">
              {exec && held.length > 0 && (
                <button className="tw-pill" onClick={() => setSheet("review")}><span aria-hidden="true" />{held.length} waiting for your OK</button>
              )}
              {exec && (
                <button className="tw-gear" aria-label="Team Wall settings" title="Settings" onClick={() => setSheet("settings")}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
                </button>
              )}
              <button className="btn primary tw-give" onClick={() => setGiving({})}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                Give a shoutout
              </button>
            </div>
          )}
        </div>
        {!on && isAdvisor && <div className="pr-draft tiny">The Team Wall is off for {client.name}. Turn it on in their settings under Modules.</div>}

        {!rec?.token ? (
          isAdvisor ? (
            <div className="section"><Setup advisor rec={null} onSave={(r) => saveRec(r, "Team Wall set up")} clientName={client.name} accent={client.accent} /></div>
          ) : (
            <div className="card section small muted">The Team Wall isn&apos;t set up yet.</div>
          )
        ) : (
          <>
            {week.length > 0 && (
              <section className="section" aria-label="This week">
                <h2 className="tw-label">This week</h2>
                <div className="tw-week">
                  {week.map((w) => (
                    <div key={w.key} className={`tw-moment ${w.today ? "today" : ""} ${w.kind}`}>
                      {w.today && w.kind === "bday" && <span className="tw-today">Today</span>}
                      {w.kind === "bday" ? (
                        <span className="tw-cal" aria-hidden="true"><small>{w.mon}</small><b>{w.badge}</b></span>
                      ) : (
                        <span className={`tw-badge ${w.kind}`} aria-hidden="true">{w.badge}</span>
                      )}
                      <span className="tw-moment-txt"><b>{w.name}</b><span>{w.line}</span></span>
                      <button className="btn sm" onClick={() => setGiving({ preset: { to: asPick(w.person), msg: w.starter } })}>{w.action}</button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {myBatons.map((b) => (
              <div key={b.shoutId} className="so-pass section">
                <span className="so-kicker">{b.title}</span>
                <b style={{ display: "block", marginTop: 2 }}>You&apos;re holding link #{b.link}. Don&apos;t let it end with you!</b>
                <div className="row" style={{ gap: 10, marginTop: 8, alignItems: "center" }}>
                  <span className="tiny muted grow">{b.daysLeft <= 0 ? "Last day to pass it on" : `${b.daysLeft} ${b.daysLeft === 1 ? "day" : "days"} left to pass it on`}</span>
                  <button className="btn primary sm" onClick={() => setGiving({ pass: b })}>Pass it on</button>
                </div>
              </div>
            ))}

            <div className="tw-cols section">
              <div className={`tw-main so-portal so-theme-${rec.theme?.style ?? "classic"}`} style={themeVars(client.accent, rec.theme)}>
                {activeCh.length > 0 && <ChallengeCards list={activeCh.map((c) => publicChallenge(c, list, roster))} />}
                {live.length === 0 ? (
                  <div className="card small muted">No shoutouts yet. Be the first: tap Give a shoutout.</div>
                ) : (
                  <>
                    <div className="so-wall">{live.slice(0, shown).map((s) => <ShoutCard key={s.id} s={toItem(s)} onReact={(e) => react(s.id, e)} onRemove={exec ? () => remove(s) : undefined} />)}</div>
                    {live.length > shown && shown < 80 && <button className="btn block" onClick={() => setShown(Math.min(80, shown + 20))}>Show more</button>}
                  </>
                )}
              </div>

              <aside className="tw-side">
                <div className="card">
                  <h2 className="tw-h">Most recognized this month</h2>
                  {top.length ? (
                    <ol className="tw-top">
                      {top.map(([n, c], i) => <li key={n}><span>{i + 1}</span><span className="grow">{n}</span><b>{c}</b></li>)}
                    </ol>
                  ) : (
                    <p className="small muted" style={{ margin: 0 }}>No one yet this month.</p>
                  )}
                  <button className="linklike small tw-more" onClick={() => setSheet("board")}>Full scoreboard</button>
                </div>
                <div className="card">
                  <h2 className="tw-h">Challenges</h2>
                  <p className="small muted" style={{ margin: "0 0 10px" }}>A short push, like a week of thank-yous, with a goal everyone can see.</p>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {canStart && <button className="btn sm" onClick={() => setStarting(true)}>Start a challenge</button>}
                    {(exec || manages) && <button className="btn sm" onClick={() => setNudging(true)}>Send a nudge</button>}
                  </div>
                  {(pastCh.length > 0 || activeCh.length > 0) && <button className="linklike small tw-more" onClick={() => setSheet("challenges")}>{pastCh.length ? "Past challenges" : "Challenge details"}</button>}
                </div>
              </aside>
            </div>
          </>
        )}
      </main>

      {sheet === "board" && (
        <Sheet title="Scoreboard" onClose={() => setSheet(null)}>
          <div className="tw-scroll so-portal" style={themeVars(client.accent, rec?.theme)}>
            <Scoreboard b={board} />
            <Missing list={live} />
          </div>
          <div className="sheet-actions"><button className="btn primary sm" onClick={() => setSheet(null)}>Done</button></div>
        </Sheet>
      )}
      {sheet === "challenges" && (
        <Sheet title="Challenges" onClose={() => setSheet(null)}>
          <div className="tw-scroll">
            <Challenges
              list={challenges}
              shouts={list}
              roster={roster}
              canStart={canStart}
              canEnd={(c) => exec || (!!me?.email && c.createdBy.email?.toLowerCase() === me.email.toLowerCase())}
              onStart={() => { setSheet(null); setStarting(true); }}
              onEnd={async (c) => {
                if (!confirm(`End "${c.title}"?`)) return;
                const j = await api({ action: "endChallenge", id: c.id });
                if (!j.ok) return toast.show("Couldn't end it");
                setChallenges(challenges.map((x) => (x.id === c.id ? { ...x, status: "ended" } : x)));
                toast.show("Challenge ended");
              }}
            />
          </div>
          <div className="sheet-actions"><button className="btn primary sm" onClick={() => setSheet(null)}>Done</button></div>
        </Sheet>
      )}
      {sheet === "review" && exec && (
        <Sheet title="Waiting for your OK" onClose={() => setSheet(null)}>
          <div className="tw-scroll">
            <p className="small muted" style={{ marginTop: 0 }}>{rec?.approval ? "Approval is on, so every shoutout waits here. " : ""}Anything the screen flagged or sent from a name not on the list waits here too. Nobody else sees these.</p>
            {held.length === 0 ? (
              <div className="card small muted">Nothing waiting.</div>
            ) : (
              held.map((s) => (
                <div className="card so-review" key={s.id}>
                  <div className="tiny" style={{ color: "var(--amber)", fontWeight: 600 }}>{s.heldReason ?? "Held"}</div>
                  <p style={{ margin: "6px 0" }}>&ldquo;{s.message}&rdquo;</p>
                  <div className="tiny muted">To {s.to.name} · from {s.from.name}{s.from.verified ? "" : s.from.personId ? " (picked from the list)" : " (typed their own name)"} · {s.channel === "sms" ? "text" : s.channel === "qr" ? "QR code" : "portal"} · {new Date(s.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                  <div className="sheet-actions">
                    <button className="btn sm" style={{ color: "var(--red)" }} onClick={() => review(s, false)}>Remove</button>
                    <button className="btn primary sm" onClick={() => review(s, true)}>Post it</button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="sheet-actions"><button className="btn sm" onClick={() => setSheet(null)}>Close</button></div>
        </Sheet>
      )}
      {sheet === "settings" && exec && rec && (
        <Sheet title="Team Wall settings" onClose={() => setSheet(null)}>
          <div className="tw-scroll">
            <p className="small muted" style={{ marginTop: 0 }}>Only you{isAdvisor ? " and the client's executives" : " and AlzaHR"} see this.</p>
            <Setup
              advisor={isAdvisor}
              rec={rec}
              onSave={(r) => saveRec(r)}
              clientName={client.name}
              accent={client.accent}
              onTest={isAdvisor ? async (kind, draft) => {
                if (!LIVE) return toast.show("Demo: test emails send from the live portal");
                const j = await api({ action: "testEmail", kind, rec: draft });
                toast.show(j.ok ? `Test sent to ${j.to}` : `Couldn't send the test (${j.reason ?? "error"})`);
              } : undefined}
            />
          </div>
          <div className="sheet-actions"><button className="btn sm" onClick={() => setSheet(null)}>Close</button></div>
        </Sheet>
      )}
      {giving && rec?.token && (
        <GiveSheet
          token={rec.token}
          pass={giving.pass}
          preset={giving.preset}
          onClose={() => setGiving(false)}
          onSend={async (body) => {
            const j = await api({ action: "give", ...body, pass: giving.pass?.shoutId });
            if (!j.ok) return j.reason === "self" ? "You can't give yourself one." : j.reason === "already_in_chain" ? "They're already in the chain. Pick someone new so it keeps spreading!" : j.reason?.startsWith("chain") ? "This chain has ended." : "That didn't send. Try again.";
            setGiving(false);
            toast.show(j.demo ? "Sent (demo)" : j.status === "held" ? "Thanks! It'll post once it's approved." : giving.pass ? `The chain grows! Link #${giving.pass.link + 1}` : "Sent!");
            load();
            return "";
          }}
        />
      )}
      {nudging && rec && (
        <NudgeSheet
          exec={exec}
          myEmail={me?.email ?? ""}
          roster={roster}
          challenges={activeCh.map((c) => publicChallenge(c, list, roster))}
          onClose={() => setNudging(false)}
          onSend={async (body) => {
            const j = await api({ action: "nudge", ...body });
            if (j.demo) {
              setNudging(false);
              toast.show("Nudge sent (demo)");
              return "";
            }
            if (!j.ok) return j.reason === "recent" ? "This group got a nudge in the last 3 days. Give it a little time." : j.reason === "nobody" ? "Nobody in that group has an email on the roster." : j.reason === "forbidden" ? "Managers can nudge their own team." : "Couldn't send it. Try again.";
            setNudging(false);
            toast.show(j.waves === 3 ? `Wave 1 sent to ${j.sent}. The rest go out over the next 4 days.` : `Nudge sent to ${j.sent} ${j.sent === 1 ? "person" : "people"}`);
            return "";
          }}
        />
      )}
      {starting && rec && (
        <StartSheet
          token={rec.token}
          hasWelcome={activeCh.some((c) => c.kind === "welcome")}
          onClose={() => setStarting(false)}
          onStart={async (body) => {
            const j = await api({ action: "startChallenge", ...body });
            if (!j.ok) return j.reason === "first_link" ? "Pick who gets the first link and write the shoutout." : j.reason === "welcome_on" ? "A Welcome Wagon is already running." : j.reason === "forbidden" ? "Only leaders and managers can start challenges." : "Couldn't start it. Try again.";
            setStarting(false);
            if (j.demo) {
              toast.show("Started (demo)");
              return "";
            }
            toast.show(body.kind === "chain" ? "Chain started! The first link is on its way." : "Challenge started!");
            load();
            return "";
          }}
        />
      )}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}

type Moment = { key: string; kind: "new" | "bday" | "anniv"; badge: string; mon?: string; today?: boolean; name: string; line: string; action: string; starter: string; person: { id: string; name: string; department?: string; location?: string } };

/** New starters, birthdays and work anniversaries in the next 7 days (new starters: the last 7 too). Month and day only. */
function thisWeek(roster: { id: string; name: string; title?: string; hireDate?: string; birthday?: string; active: boolean; celebrate?: boolean; department?: string; location?: string }[], on: boolean): Moment[] {
  if (!on) return [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dayName = (n: number, d: Date) => (n === 0 ? "Today" : n === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "long" }));
  const md = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const when = (n: number, d: Date) => (n === 0 ? `today, ${md(d)}` : `${dayName(n, d)}, ${md(d)}`);
  const out: (Moment & { sort: number })[] = [];
  for (const p of roster) {
    if (!p.active || p.celebrate === false) continue;
    const first = p.name.split(" ")[0];
    const initials = p.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
    if (p.hireDate) {
      const [y, m, d] = p.hireDate.split("-").map(Number);
      const start = new Date(y, m - 1, d);
      const diff = Math.round((start.getTime() - now.getTime()) / 864e5);
      if (diff >= -7 && diff <= 7)
        out.push({ key: `n${p.id}`, kind: "new", badge: initials, name: p.name, line: diff <= 0 ? `New this week${p.title ? ` · ${p.title}` : ""}` : `Starts ${dayName(diff, start)}${p.title ? ` · ${p.title}` : ""}`, action: "Say welcome", starter: `Welcome to the team, ${first}! `, person: p, sort: Math.abs(diff) - 100 });
    }
    for (let n = 0; n < 7; n++) {
      const d = new Date(now.getTime() + n * 864e5);
      const mmdd = iso(d).slice(5);
      if (p.birthday === mmdd) out.push({ key: `b${p.id}`, kind: "bday", badge: String(d.getDate()), mon: d.toLocaleDateString("en-US", { month: "short" }), today: n === 0, name: p.name, line: n === 0 ? "Birthday today!" : `Birthday · ${when(n, d)}`, action: "Send wishes", starter: `Happy birthday, ${first}! `, person: p, sort: n - 50 * Number(n === 0) });
      if (p.hireDate && p.hireDate.slice(5) === mmdd) {
        const yrs = d.getFullYear() - Number(p.hireDate.slice(0, 4));
        if (yrs >= 1) out.push({ key: `a${p.id}`, kind: "anniv", badge: String(yrs), name: p.name, today: n === 0, line: `${yrs} ${yrs === 1 ? "year" : "years"} · ${when(n, d)}`, action: "Congrats", starter: `Congrats on ${yrs} ${yrs === 1 ? "year" : "years"}, ${first}! `, person: p, sort: n });
      }
    }
  }
  return out.sort((a, b) => a.sort - b.sort).slice(0, 6);
}

type NudgeBody = { audience: string; waves: 1 | 3; line: string; note?: string; challengeId?: string };

/** A nudge to recognize someone, to everyone or a group, at once or in three waves. */
function NudgeSheet({ exec, myEmail, roster, challenges, onClose, onSend }: { exec: boolean; myEmail: string; roster: { id: string; name: string; email?: string; managerEmail: string; department?: string; location?: string; active: boolean; nudges?: boolean }[]; challenges: PublicChallenge[]; onClose: () => void; onSend: (b: NudgeBody) => Promise<string> }) {
  const live = roster.filter((p) => p.active && p.email && p.nudges !== false);
  const mine = live.filter((p) => p.managerEmail.toLowerCase() === myEmail.toLowerCase());
  const teams = Array.from(new Set(live.map((p) => p.department || p.location).filter(Boolean) as string[])).sort();
  const mgrs = new Set(roster.filter((p) => p.active).map((p) => p.managerEmail.toLowerCase()).filter(Boolean));
  const [aud, setAud] = useState<string>(exec ? "everyone" : "mine");
  const [team, setTeam] = useState(teams[0] ?? "");
  const [w, setW] = useState<1 | 3>(exec ? 3 : 1);
  const [lineI, setLineI] = useState(Math.floor(Date.now() / 864e5) % NUDGE_LINES.length);
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [chId, setChId] = useState(challenges.find((c) => c.kind !== "welcome")?.id ?? challenges[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const audience = aud === "team" ? `team:${team}` : aud;
  const count = aud === "everyone" ? live.length : aud === "managers" ? mgrs.size : aud === "mine" ? mine.length : live.filter((p) => (p.department || p.location) === team).length;
  const line = custom.trim() || NUDGE_LINES[lineI];
  const ch = challenges.find((c) => c.id === chId);
  const cl = challengeLine(ch);
  const day = (n: number) => new Date(Date.now() + n * 864e5).toLocaleDateString("en-US", { weekday: "short" });
  const canWave = count >= 6;
  return (
    <Sheet title="💛 Nudge people to recognize someone" onClose={onClose}>
      <span className="flabel">Who</span>
      <div className="so-values" style={{ marginBottom: 8 }}>
        {exec && <button className={aud === "everyone" ? "on" : ""} onClick={() => setAud("everyone")}>Everyone ({live.length})</button>}
        {exec && <button className={aud === "managers" ? "on" : ""} onClick={() => setAud("managers")}>Managers ({mgrs.size})</button>}
        {exec && teams.length > 0 && <button className={aud === "team" ? "on" : ""} onClick={() => setAud("team")}>A team</button>}
        {mine.length > 0 && <button className={aud === "mine" ? "on" : ""} onClick={() => setAud("mine")}>My team ({mine.length})</button>}
      </div>
      {aud === "team" && (
        <select className="f" value={team} onChange={(e) => setTeam(e.target.value)}>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</select>
      )}
      <span className="flabel" style={{ marginTop: 10 }}>When</span>
      <div className="seg" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 4 }}>
        <button className={w === 1 || !canWave ? "on" : ""} onClick={() => setW(1)}>All at once</button>
        <button className={w === 3 && canWave ? "on" : ""} disabled={!canWave} onClick={() => setW(3)}>In 3 waves</button>
      </div>
      <p className="tiny muted" style={{ margin: "0 0 10px" }}>{w === 3 && canWave ? `A third today, a third ${day(2)}, a third ${day(4)}. Shoutouts keep coming all week instead of all at once.` : `Everyone gets it now.${!canWave ? " (Waves need at least 6 people.)" : ""}`}</p>

      {challenges.length > 0 && (
        <label className="f">Tie it to a challenge
          <select className="f" value={chId} onChange={(e) => setChId(e.target.value)}>
            <option value="">No, just a reminder</option>
            {challenges.map((c) => <option key={c.id} value={c.id}>{c.kind === "chain" ? "🔗" : c.kind === "goal" ? "🎯" : "👋"} {c.title}</option>)}
          </select>
        </label>
      )}
      <span className="flabel">Opening line</span>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <input className="f grow" style={{ margin: 0 }} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={NUDGE_LINES[lineI]} maxLength={140} />
        <button className="btn ghost sm" title="Another line" onClick={() => { setCustom(""); setLineI((lineI + 1) % NUDGE_LINES.length); }}>🔀</button>
      </div>
      <label className="f" style={{ marginTop: 8 }}>A note from you <span className="tiny muted">(optional)</span><textarea className="f" style={{ minHeight: 56 }} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Busy week on the install crew. Let's make sure people know we noticed." /></label>

      <div className="so-preview">
        <span className="tiny muted">Preview</span>
        <b style={{ display: "block", margin: "4px 0 6px", fontFamily: "var(--serif, Georgia, serif)", fontSize: 18 }}>{line}</b>
        <p className="small" style={{ margin: "0 0 6px" }}>Hi Alex,</p>
        {note.trim() && <p className="small" style={{ margin: "0 0 6px" }}>{note}</p>}
        {cl && <p className="small" style={{ margin: "0 0 6px" }}>{cl}</p>}
        <p className="small" style={{ margin: "0 0 6px" }}>{aud === "managers" ? "On your team, Sam and Jo haven't had a shoutout in the last 30 days. A quick one from you would mean a lot." : "Think of one person who made your week better, and tell them. It takes 20 seconds."}</p>
        <span className="tiny" style={{ color: "var(--blue)" }}>🎉 Give a shoutout</span>
        <p className="tiny muted" style={{ margin: "6px 0 0" }}>Managers also see who on their team hasn&apos;t been recognized lately. Everyone can turn these off from the email.</p>
      </div>
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={busy || count === 0} onClick={async () => { setBusy(true); setErr(await onSend({ audience, waves: w === 3 && canWave ? 3 : 1, line, note: note.trim() || undefined, challengeId: chId || undefined })); setBusy(false); }}>
          {busy ? "Sending…" : `💛 Nudge ${count} ${count === 1 ? "person" : "people"}`}
        </button>
      </div>
    </Sheet>
  );
}

/** Live and past challenges, with the chain drawn out link by link. */
function Challenges({ list, shouts, roster, canStart, canEnd, onStart, onEnd }: { list: Challenge[]; shouts: Shoutout[]; roster: { id: string; name: string; department?: string; location?: string; hireDate?: string; active?: boolean }[]; canStart: boolean; canEnd: (c: Challenge) => boolean; onStart: () => void; onEnd: (c: Challenge) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const live = list.filter((c) => challengeLive(c));
  const past = list.filter((c) => !challengeLive(c));
  return (
    <>
      <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 10 }}>
        <p className="small muted grow" style={{ margin: 0 }}>Friendly challenges that keep recognition going. Everyone sees them on the wall and the TV.</p>
        {canStart && <button className="btn primary sm" onClick={onStart}>+ Start a challenge</button>}
      </div>
      {live.length === 0 && <div className="card small muted">No challenges running.{canStart ? " Start an Appreciation Chain: it's the easiest way to get everyone recognizing each other." : ""}</div>}
      {live.map((c) => {
        const pc = publicChallenge(c, shouts, roster);
        const st = c.kind === "chain" ? chainStats(c, shouts) : null;
        return (
          <div key={c.id} className="card so-chcard">
            <ChallengeCards list={[pc]} />
            <div className="tiny muted">Started by {c.createdBy.name} · {new Date(c.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{c.endsAt ? ` · ends ${new Date(c.endsAt + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}{c.kind === "chain" ? ` · ${c.chain?.windowDays ?? 3} days to pass it on` : ""}</div>
            {st && (
              <>
                {st.open.length > 0 && (
                  <div className="so-batons">
                    <b className="tiny">Holding the chain right now</b>
                    {st.open.map((b) => <span key={b.shoutId} className="chip">{b.name} · link #{b.link} · {b.daysLeft <= 0 ? "last day" : `${b.daysLeft}d left`}</span>)}
                  </div>
                )}
                <button className="linklike tiny" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? "Hide the chain" : `See the chain (${st.links} links)`}</button>
                {open === c.id && (
                  <div className="so-tree">
                    {st.tree.map((n) => (
                      <div key={n.id} className="so-node" style={{ marginLeft: Math.min(n.depth - 1, 8) * 14 }}>
                        <span className={`so-node-dot ${n.passed ? "passed" : n.expired ? "quiet" : "open"}`} />
                        <span className="small"><b>{n.from.split(" ")[0]}</b> → <b>{n.to}</b>{n.team ? <span className="tiny muted"> · {n.team}</span> : null}</span>
                        <span className="tiny muted" style={{ display: "block" }}>“{n.message}”</span>
                      </div>
                    ))}
                    <p className="tiny muted" style={{ margin: "6px 0 0" }}>🟢 passed it on · 🟡 has it now · ⚪ went quiet</p>
                  </div>
                )}
              </>
            )}
            {canEnd(c) && <div style={{ textAlign: "right" }}><button className="linklike tiny" style={{ color: "var(--red)" }} onClick={() => onEnd(c)}>End challenge</button></div>}
          </div>
        );
      })}
      {past.length > 0 && (
        <>
          <div className="section-head section"><h2>Past challenges</h2></div>
          <div className="card">
            {past.map((c) => {
              const pc = publicChallenge(c, shouts, roster);
              return (
                <div key={c.id} className="row" style={{ padding: "8px 0" }}>
                  <span className="grow small"><b>{CHALLENGE_INFO[c.kind].icon} {c.title}</b></span>
                  <span className="tiny muted">{pc.chain ? `${pc.chain.links} links · longest ${pc.chain.longest}` : pc.goal ? `${pc.goal.count}/${pc.goal.target}${pc.goal.reached ? " 🏆" : ""}` : ""}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

type StartBody = { kind: ChallengeKind; title: string; endsAt?: string; windowDays?: number; target?: number; reward?: string; value?: string; welcomeTarget?: number; welcomeDays?: number; to?: string; message?: string };

function StartSheet({ token, hasWelcome, onClose, onStart }: { token: string; hasWelcome: boolean; onClose: () => void; onStart: (b: StartBody) => Promise<string> }) {
  const [kind, setKind] = useState<ChallengeKind>("chain");
  const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [endsAt, setEndsAt] = useState(inDays(30));
  const [windowDays, setWindowDays] = useState(3);
  const [target, setTarget] = useState(50);
  const [reward, setReward] = useState("");
  const [wt, setWt] = useState(5);
  const [wd, setWd] = useState(30);
  const [to, setTo] = useState<Pick | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const search = useCallback(
    async (q: string): Promise<Pick[]> => {
      if (!LIVE) return DEMO_PEOPLE.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
      const r = await fetch(`/api/shout/${encodeURIComponent(token)}?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => ({}));
      return r.people ?? [];
    },
    [token]
  );
  const month = new Date().toLocaleDateString("en-US", { month: "long" });
  const placeholder = kind === "chain" ? `${month} Appreciation Chain` : kind === "goal" ? "100 shoutouts by Thanksgiving" : "Welcome Wagon";
  return (
    <Sheet title="Start a challenge" onClose={onClose}>
      <div className="so-kinds">
        {(["chain", "goal", "welcome"] as ChallengeKind[]).map((k) => (
          <button key={k} className={kind === k ? "on" : ""} disabled={k === "welcome" && hasWelcome} onClick={() => setKind(k)}>
            <span aria-hidden="true">{CHALLENGE_INFO[k].icon}</span>
            <b>{CHALLENGE_INFO[k].name}</b>
            <span className="tiny muted">{k === "welcome" && hasWelcome ? "Already running" : CHALLENGE_INFO[k].blurb}</span>
          </button>
        ))}
      </div>
      <label className="f">Name<input className="f" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} maxLength={80} /></label>
      {kind === "chain" && (
        <>
          <div className="two">
            <label className="f">Days to pass it on
              <select className="f" value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>{[1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d} {d === 1 ? "day" : "days"}</option>)}</select>
            </label>
            <label className="f">Ends<input className="f" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></label>
          </div>
          <span className="flabel">You start it: who gets the first link?</span>
          <PersonSearch search={search} value={to} onPick={setTo} placeholder="Start typing their name" />
          <textarea className="f" style={{ minHeight: 70, marginTop: 8 }} value={msg} onChange={(e) => setMsg(e.target.value.slice(0, MAX_MESSAGE))} placeholder="Your shoutout to them" />
          <p className="tiny muted" style={{ margin: "4px 0 0" }}>They get it with &quot;Don&apos;t let the chain of recognition end with you,&quot; and {windowDays} {windowDays === 1 ? "day" : "days"} to pass it on to someone new. Anyone can pass it to more than one person, so it can branch. You&apos;ll see the streaks on the wall, the TV and here.</p>
        </>
      )}
      {kind === "goal" && (
        <>
          <div className="two">
            <label className="f">Shoutouts<input className="f" type="number" min={5} max={5000} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></label>
            <label className="f">By<input className="f" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></label>
          </div>
          <label className="f">Team reward <span className="tiny muted">(optional)</span><input className="f" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="e.g. Taco lunch for everyone 🌮" maxLength={120} /></label>
        </>
      )}
      {kind === "welcome" && (
        <div className="two">
          <label className="f">Shoutouts per new person<input className="f" type="number" min={1} max={20} value={wt} onChange={(e) => setWt(Number(e.target.value))} /></label>
          <label className="f">In their first<select className="f" value={wd} onChange={(e) => setWd(Number(e.target.value))}>{[14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}</select></label>
        </div>
      )}
      {kind === "welcome" && <p className="tiny muted" style={{ margin: "4px 0 0" }}>Runs until you end it. New people show on the Celebrate tab and the wall with how many welcomes they&apos;ve had, so the team can see who still needs some.</p>}
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button
          className="btn primary sm"
          disabled={busy || (kind === "chain" && (!to || msg.trim().length < 3))}
          onClick={async () => {
            setBusy(true);
            setErr(await onStart({ kind, title: title.trim() || placeholder, endsAt: kind === "welcome" ? undefined : endsAt, windowDays, target, reward, welcomeTarget: wt, welcomeDays: wd, to: to?.id, message: msg }));
            setBusy(false);
          }}
        >
          {busy ? "Starting…" : kind === "chain" ? "🔗 Start the chain" : "Start"}
        </button>
      </div>
    </Sheet>
  );
}

/** Teams nobody has recognized in a while: a nudge for leaders. */
function Missing({ list }: { list: Shoutout[] }) {
  const { people } = useStore();
  const { client: clientId } = useParams<{ client: string }>();
  const roster = people.filter((p) => p.clientId === clientId && p.active);
  if (!roster.length) return null;
  const cut = Date.now() - 30 * 864e5;
  const got = new Set(list.filter((s) => new Date(s.at).getTime() >= cut).map((s) => s.to.personId));
  const quiet = roster.filter((p) => !got.has(p.id));
  if (!quiet.length) return null;
  return (
    <div className="card section">
      <b className="small">Not recognized in 30 days ({quiet.length})</b>
      <p className="tiny muted" style={{ margin: "2px 0 8px" }}>Only you can see this. A good place to start this week.</p>
      <div className="chips">{quiet.slice(0, 24).map((p) => <span className="chip" key={p.id}>{p.name}{p.department ? ` · ${p.department}` : ""}</span>)}</div>
    </div>
  );
}

function GiveSheet({ token, pass, preset, onClose, onSend }: { token: string; pass?: Baton & { title: string }; preset?: { to: Pick; msg?: string }; onClose: () => void; onSend: (b: { to: string; value?: string; message: string }) => Promise<string> }) {
  const [to, setTo] = useState<Pick | null>(preset?.to ?? null);
  const [msg, setMsg] = useState(preset?.msg ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const search = useCallback(
    async (q: string): Promise<Pick[]> => {
      if (!LIVE) return DEMO_PEOPLE.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
      const r = await fetch(`/api/shout/${encodeURIComponent(token)}?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => ({}));
      return r.people ?? [];
    },
    [token]
  );
  return (
    <Sheet title={pass ? "Pass on the chain" : "Give a shoutout"} onClose={onClose}>
      {pass && <p className="small" style={{ marginTop: 0 }}>You&apos;re link #{pass.link} in the <b>{pass.title}</b>. Recognize someone new to keep it growing.</p>}
      <span className="flabel">Who</span>
      <PersonSearch search={search} value={to} onPick={setTo} placeholder="Start typing their name" autoFocus={!preset} />
      <span className="flabel" style={{ marginTop: 12 }}>What did they do?</span>
      <div className="so-starters">{STARTERS.en.map((s) => <button key={s} onClick={() => setMsg(s.replace("…", " "))}>{s}</button>)}</div>
      <textarea className="f" style={{ minHeight: 80 }} value={msg} onChange={(e) => setMsg(e.target.value.slice(0, MAX_MESSAGE))} placeholder="Be specific. What happened, and why it mattered." />
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={busy || !to || msg.trim().length < 3} onClick={async () => { setBusy(true); setErr(await onSend({ to: to!.id, message: msg })); setBusy(false); }}>{busy ? "Sending…" : "Send"}</button>
      </div>
    </Sheet>
  );
}

const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "alzapc.com";

function Setup({ advisor, rec, onSave, clientName, accent, onTest }: { advisor?: boolean; rec: RecognitionSettings | null | undefined; onSave: (r: RecognitionSettings) => void; clientName: string; accent: string; onTest?: (k: CelebrateKind, draft: Partial<RecognitionSettings>) => void }) {
  const [sms, setSms] = useState(rec?.smsNumber ?? "");
  const [approval, setApproval] = useState(!!rec?.approval);
  const [notify, setNotify] = useState(rec?.notifyManagers !== false);
  const [wall, setWall] = useState(rec?.showWall !== false);
  const [cel, setCel] = useState(rec?.celebrate !== false);
  const [theme, setTheme] = useState<ShoutTheme>(rec?.theme ?? { style: "classic", burst: true });
  const defSender = celebrateSender(undefined, clientName);
  const [senderName, setSenderName] = useState(rec?.sender?.name ?? "");
  const [senderBox, setSenderBox] = useState(rec?.sender?.box ?? "");
  const [autoB, setAutoB] = useState(!!rec?.autoEmail?.birthday);
  const [autoA, setAutoA] = useState(!!rec?.autoEmail?.anniversary);
  const [tpls, setTpls] = useState<Record<CelebrateKind, CelebrateTemplate>>({ birthday: templateFor(rec ?? undefined, "birthday"), anniversary: templateFor(rec ?? undefined, "anniversary") });
  const [editing, setEditing] = useState<CelebrateKind | null>(null);
  const [qr, setQr] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = rec ? `${origin}/shout/${rec.token}` : "";
  useEffect(() => {
    if (link) QRCode.toDataURL(link, { margin: 1, width: 600 }).then(setQr);
  }, [link]);
  const clean = sms.replace(/[^\d+]/g, "");
  const smsNumber = clean ? (clean.startsWith("+") ? clean : clean.length === 10 ? `+1${clean}` : `+${clean}`) : undefined;
  const cleanBox = senderBox.toLowerCase().replace(/[^a-z0-9._-]/g, "");
  const extras = (): Partial<RecognitionSettings> => ({
    sender: senderName.trim() || cleanBox ? { name: senderName.trim() || undefined, box: cleanBox || undefined } : undefined,
    autoEmail: { birthday: autoB, anniversary: autoA },
    templates: {
      ...(JSON.stringify(tpls.birthday) !== JSON.stringify(DEFAULT_CELEBRATE_TEMPLATES.birthday) ? { birthday: tpls.birthday } : {}),
      ...(JSON.stringify(tpls.anniversary) !== JSON.stringify(DEFAULT_CELEBRATE_TEMPLATES.anniversary) ? { anniversary: tpls.anniversary } : {}),
    },
    celebrate: cel,
    theme,
  });
  const save = (next?: Partial<RecognitionSettings>) => onSave({ ...(rec ?? newRecognition()), values: rec?.values ?? DEFAULT_VALUES, smsNumber, notifyManagers: notify, showWall: wall, approval, ...extras(), ...(next ?? {}) });
  const copy = (t: string) => navigator.clipboard?.writeText(t);

  return (
    <div className="so-setup">
      {!rec && <p className="small" style={{ marginTop: 0 }}>Print the QR code for {clientName}&apos;s break rooms, trucks and shop floor.</p>}
      <div className="card tw-approval">
        <label className="tw-switch">
          <span className="grow">
            <b>Approve shoutouts before they post</b>
            <span className="tiny muted" style={{ display: "block", marginTop: 2 }}>
              {approval ? "On: every shoutout waits for an OK from you or an executive." : "Off: shoutouts post right away. Anything the screen flags, or from a name not on the roster, still waits for a look."}
            </span>
          </span>
          <input type="checkbox" role="switch" checked={approval} onChange={(e) => { setApproval(e.target.checked); if (rec) save({ approval: e.target.checked }); }} aria-label="Approve shoutouts before they post" />
        </label>
      </div>

      <div className="card section">
        <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email the person&apos;s manager when they get a shoutout</label>
        <label className="check"><input type="checkbox" checked={wall} onChange={(e) => setWall(e.target.checked)} /> Show the wall and scoreboard on the QR page</label>
        <label className="check"><input type="checkbox" checked={cel} onChange={(e) => setCel(e.target.checked)} /> Show birthdays, work anniversaries and new starters on the wall (This week, month and day only). Anyone can opt out from their birthday email, or you can uncheck them on the roster.</label>
        {advisor && (
          <label className="f" style={{ marginTop: 8 }}>Texting number <span className="tiny muted">(optional, once the texting provider is set up)</span>
            <input className="f" value={sms} onChange={(e) => setSms(e.target.value)} placeholder="(415) 555-0123" />
          </label>
        )}
        <div className="sheet-actions"><button className="btn primary sm" onClick={() => save()}>{rec ? "Save" : "Turn on the Team Wall"}</button></div>
      </div>

      <div className="card section">
        <b className="small">The look</b>
        <p className="tiny muted" style={{ margin: "2px 0 10px" }}>For the QR page, the wall and the TV. Every style uses {clientName}&apos;s brand color and logo.</p>
        <div className="so-looks">
          {THEME_STYLES.map((t) => (
            <button key={t.id} className={`so-look ${(theme.style ?? "classic") === t.id ? "on" : ""}`} onClick={() => setTheme({ ...theme, style: t.id as ThemeStyle })}>
              <div className={`so-look-pv so-portal so-theme-${t.id}`} style={{ ...themeVars(accent, theme), ...(t.id === "spotlight" ? { background: `linear-gradient(135deg, ${accent}, #111)` } : t.id === "classic" ? { background: "var(--soft)" } : {}) }}>
                <span style={t.id === "spotlight" ? { background: theme.accent2 || secondColor(accent), boxShadow: "none" } : undefined} />
              </div>
              <b>{t.name}</b>
              <small>{t.blurb}</small>
            </button>
          ))}
        </div>
        <div className="two" style={{ marginTop: 10 }}>
          <label className="f">Second color
            <span className="so-color">
              <input type="color" value={theme.accent2 || secondColor(accent)} onChange={(e) => setTheme({ ...theme, accent2: e.target.value })} />
              <span className="tiny muted">{theme.accent2 ? <button className="linklike tiny" onClick={() => setTheme({ ...theme, accent2: undefined })}>Use the suggested one</button> : "Suggested to go with your brand color"}</span>
            </span>
          </label>
          <label className="check" style={{ alignSelf: "end" }}><input type="checkbox" checked={theme.burst !== false} onChange={(e) => setTheme({ ...theme, burst: e.target.checked })} /> Confetti when someone sends one</label>
        </div>
        <div className="two">
          <label className="f">Headline<input className="f" value={theme.headline ?? ""} onChange={(e) => setTheme({ ...theme, headline: e.target.value || undefined })} placeholder={DEFAULT_HEADLINE.en} maxLength={60} /></label>
          <label className="f">Headline (Spanish)<input className="f" value={theme.headlineEs ?? ""} onChange={(e) => setTheme({ ...theme, headlineEs: e.target.value || undefined })} placeholder={DEFAULT_HEADLINE.es} maxLength={60} /></label>
        </div>
        <div className="sheet-actions">
          {rec && <a className="btn ghost sm" href={`/shout/${rec.token}`} target="_blank" rel="noopener">Open the page</a>}
          <button className="btn primary sm" onClick={() => { save(); try { localStorage.setItem("alza-demo-shout-theme", JSON.stringify(theme)); } catch {} }}>Save the look</button>
        </div>
      </div>

      <div className="card section">
        <b className="small">Emails to employees</b>
        <p className="tiny muted" style={{ margin: "2px 0 10px" }}>Shoutout, birthday and anniversary emails come from this name and address. Every one has a one-click opt-out at the bottom.</p>
        {advisor && <div className="two">
          <label className="f">From name<input className="f" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder={defSender.fromName} maxLength={60} /></label>
          <label className="f">Address
            <span className="so-addr"><input className="f" value={senderBox} onChange={(e) => setSenderBox(e.target.value)} placeholder={defSender.fromBox} maxLength={40} /><span className="tiny muted">@{MAIL_DOMAIN}</span></span>
          </label>
        </div>}
        <p className="tiny muted" style={{ margin: "0 0 10px" }}>They&apos;ll see: <b>{senderName.trim() || defSender.fromName}</b> &lt;{cleanBox || defSender.fromBox}@{MAIL_DOMAIN}&gt;</p>

        {(["birthday", "anniversary"] as CelebrateKind[]).map((k) => {
          const onK = k === "birthday" ? autoB : autoA;
          const t = tpls[k];
          const sample = { first: "Alex", company: clientName, years: 3, manager: "Jordan Lee" };
          return (
            <div key={k} className="so-auto">
              <label className="check" style={{ margin: 0 }}>
                <input type="checkbox" checked={onK} onChange={(e) => (k === "birthday" ? setAutoB : setAutoA)(e.target.checked)} />
                <span><b>{k === "birthday" ? "Email them on their birthday" : "Email them on their work anniversary"}</b> <span className="tiny muted">{k === "birthday" ? "(the morning of)" : "(each year, the morning of)"}</span></span>
              </label>
              <div className="so-auto-row">
                <span className="tiny muted ellipsis grow">“{fillCelebrate(t.subject, sample)}”</span>
                <button className="linklike tiny" onClick={() => setEditing(editing === k ? null : k)}>{editing === k ? "Done" : "Edit template"}</button>
                {onTest && <button className="linklike tiny" onClick={() => onTest(k, { ...extras() })}>Send me a test</button>}
              </div>
              {editing === k && (
                <div className="so-tpl">
                  <label className="f">Subject<input className="f" value={t.subject} onChange={(e) => setTpls({ ...tpls, [k]: { ...t, subject: e.target.value } })} /></label>
                  <label className="f">Headline<input className="f" value={t.headline ?? ""} onChange={(e) => setTpls({ ...tpls, [k]: { ...t, headline: e.target.value } })} /></label>
                  <label className="f">Message<textarea className="f" style={{ minHeight: 110 }} value={t.body} onChange={(e) => setTpls({ ...tpls, [k]: { ...t, body: e.target.value } })} /></label>
                  <label className="f">Quote <span className="tiny muted">(optional, shown in a highlighted box)</span><textarea className="f" style={{ minHeight: 60 }} value={t.quote ?? ""} onChange={(e) => setTpls({ ...tpls, [k]: { ...t, quote: e.target.value } })} /></label>
                  <label className="f">Signed <span className="tiny muted">(optional)</span><input className="f" value={t.signoff ?? ""} onChange={(e) => setTpls({ ...tpls, [k]: { ...t, signoff: e.target.value } })} placeholder="e.g. {company} Leadership" /></label>
                  <div className="chips" style={{ margin: "0 0 8px" }}>
                    {CELEBRATE_FILL_INS.filter((f) => !f.includes("year") || k === "anniversary").map((f) => (
                      <button key={f} className="chip chip-btn" onClick={() => setTpls({ ...tpls, [k]: { ...t, body: `${t.body}${t.body.endsWith(" ") || !t.body ? "" : " "}${f}` } })}>{f}</button>
                    ))}
                    <button className="chip chip-btn" onClick={() => setTpls({ ...tpls, [k]: DEFAULT_CELEBRATE_TEMPLATES[k] })}>Reset to default</button>
                  </div>
                  <label className="check" style={{ margin: "0 0 8px" }}>
                    <input type="checkbox" checked={t.funFact !== false} onChange={(e) => setTpls({ ...tpls, [k]: { ...t, funFact: e.target.checked } })} />
                    <span>Add an &quot;On this day&quot; fun fact <span className="tiny muted">(a real event from that date, picked to be upbeat and work-appropriate: no war, politics, religion or tragedy)</span></span>
                  </label>
                  <div className="so-preview">
                    <span className="tiny muted">Preview · subject: {fillCelebrate(t.subject, sample)}</span>
                    <b style={{ display: "block", margin: "4px 0 6px", fontFamily: "var(--serif, Georgia, serif)", fontSize: 18 }}>{fillCelebrate(t.headline || t.subject, sample)}</b>
                    {fillCelebrate(t.body, sample).split(/\n{2,}/).map((para, i) => <p key={i} className="small" style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{para}</p>)}
                    {t.quote && <p className="small so-quote">“{fillCelebrate(t.quote, sample)}”</p>}
                    {t.signoff && <p className="small" style={{ fontStyle: "italic", margin: "0 0 8px" }}>{fillCelebrate(t.signoff, sample)}</p>}
                    {t.funFact !== false && (
                      <div className="so-fact">
                        <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: ".08em" }}>On this day: October 30</span>
                        <p className="small" style={{ margin: "2px 0 0" }}>On October 30, 1974, Muhammad Ali won back the heavyweight title in the legendary &quot;Rumble in the Jungle,&quot; one of sports&apos; greatest comebacks! <span className="tiny muted">(example; each email gets that day&apos;s fact)</span></p>
                      </div>
                    )}
                    <p className="tiny muted" style={{ margin: 0 }}>Rather not have your birthday and work anniversary celebrated? <u>Turn it off</u>.</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <p className="tiny muted" style={{ margin: "8px 0 0" }}>Only people with an email on the roster who haven&apos;t opted out. Month and day only, never their age.</p>
        <div className="sheet-actions"><button className="btn primary sm" onClick={() => save()}>Save</button></div>
      </div>

      {rec && (
        <>
          <div className="card section so-poster-card">
            <div className="so-poster" id="so-poster">
              <span className="so-kicker">{clientName}</span>
              <h2>Who made your day better?</h2>
              <p>Scan to give a coworker a shoutout. Takes 20 seconds.</p>
              {qr && <img src={qr} alt="Shoutout QR code" />}
              <p className="so-poster-es">¿Quién te alegró el día? Escanea para reconocer a un compañero.</p>
              {rec.smsNumber && <p className="so-poster-sms">Or text a name to <b>{rec.smsNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")}</b></p>}
            </div>
            <div className="sheet-actions" style={{ flexWrap: "wrap" }}>
              <button className="btn sm" onClick={() => window.print()}>🖨 Print poster</button>
              <a className="btn sm" href={qr} download={`${clientName.replace(/\W+/g, "-")}-shoutout-qr.png`}>Download QR</a>
              <button className="btn sm" onClick={() => copy(link)}>Copy link</button>
              <a className="btn sm" href={`/shout/${rec.token}/tv`} target="_blank" rel="noopener">TV display</a>
              <a className="btn sm" href={`/shout/${rec.token}`} target="_blank" rel="noopener">Open</a>
            </div>
          </div>
          <div className="card section tiny">
            <b className="small">How the three ways in work</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              <li><b>QR code:</b> anyone scans, picks who, writes it, done. No login. Post the poster where people take breaks, on truck dashes and on the shop floor.</li>
              <li><b>Text:</b> they text a coworker&apos;s name to the company number and it walks them through. STOP always works, and stopping texts never stops them giving or getting shoutouts.</li>
              <li><b>Email:</b> the person gets an email (and a text, if their cell is on the roster) with a link to see it on the wall and pass it on. Their manager gets a heads-up.</li>
            </ul>
            <p style={{ margin: "8px 0 0" }}><b>Keeping it positive:</b> every shoutout is screened before it posts. Anything questionable, or from a name not on the roster, waits for your OK (the pill at the top of the wall). Two reports from coworkers takes one down until you look.</p>
            {!rec.smsNumber && <p style={{ margin: "8px 0 0" }}><b>To turn on texting:</b> set up a Twilio number with carrier registration, add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Vercel, point the number&apos;s incoming messages to <code>{origin}/api/shout/sms</code>, then enter the number above.</p>}
          </div>
          {advisor && <button className="linklike tiny" style={{ color: "var(--red)" }} onClick={() => { if (confirm("Get a new link? The current QR code and TV link stop working, so you'll need to reprint the poster.")) onSave({ ...rec, token: randomToken(22) }); }}>Get a new link (old QR codes stop working)</button>}
        </>
      )}
    </div>
  );
}
