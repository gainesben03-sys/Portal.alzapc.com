"use client";

// Shoutouts inside the portal: the wall, the scoreboard, give one, and (Ben and executives)
// review anything held and set up the QR code, values and texting.
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { ChallengeCards, Pick, PersonSearch, Scoreboard, ShoutCard, WallItem } from "@/components/shoutui";
import { Baton, Challenge, CHALLENGE_INFO, ChallengeKind, chainStats, challengeLive, publicChallenge } from "@/lib/challenges";
import { useStore } from "@/lib/store";
import { authHeader, LIVE, sb } from "@/lib/supabase";
import { CELEBRATE_FILL_INS, CelebrateKind, CelebrateTemplate, celebrateSender, DEFAULT_CELEBRATE_TEMPLATES, DEFAULT_VALUES, fillCelebrate, MAX_MESSAGE, newRecognition, randomToken, REACTIONS, RecognitionSettings, scoreboard, Shoutout, STARTERS, templateFor } from "@/lib/recognition";
import { DEMO_CHALLENGES, DEMO_PEOPLE, DEMO_SHOUTS, demoReactions } from "@/lib/shoutdemo";

type Rx = { shout_id: string; who: string; emoji: string };
type Tab = "wall" | "board" | "challenges" | "review" | "setup";

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
  const [tab, setTab] = useState<Tab>("wall");
  const [list, setList] = useState<Shoutout[]>([]);
  const [rx, setRx] = useState<Rx[]>([]);
  const [giving, setGiving] = useState<false | { pass?: Baton & { title: string } }>(false);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [starting, setStarting] = useState(false);
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
    if (sp.get("review")) setTab("review");
    if (sp.get("tab") === "challenges") setTab("challenges");
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
  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
          <div className="grow">
            <h1 style={{ margin: 0 }}>Shoutouts</h1>
            <p className="muted" style={{ margin: "4px 0 0" }}>Recognition from anyone, by QR code, text or right here.</p>
          </div>
          {rec?.token && <button className="btn primary" onClick={() => setGiving({})}>🎉 Give one</button>}
        </div>
        {!on && isAdvisor && <div className="pr-draft tiny">Shoutouts is off for {client.name}. Turn it on in their settings under Modules.</div>}

        {!rec?.token ? (
          isAdvisor ? (
            <Setup rec={null} onSave={(r) => { setRec(r); toast.show("Shoutouts set up"); setTab("setup"); }} clientName={client.name} />
          ) : (
            <div className="card section small muted">Shoutouts aren&apos;t set up yet.</div>
          )
        ) : (
          <>
            <div className="pr-tabs section" role="tablist">
              <button className={tab === "wall" ? "on" : ""} onClick={() => setTab("wall")}>Wall</button>
              <button className={tab === "board" ? "on" : ""} onClick={() => setTab("board")}>Scoreboard</button>
              <button className={tab === "challenges" ? "on" : ""} onClick={() => setTab("challenges")}>Challenges{activeCh.length ? ` · ${activeCh.length}` : ""}</button>
              {exec && <button className={tab === "review" ? "on" : ""} onClick={() => setTab("review")}>To review{held.length ? ` · ${held.length}` : ""}</button>}
              {isAdvisor && <button className={tab === "setup" ? "on" : ""} onClick={() => setTab("setup")}>Set up</button>}
            </div>
            {myBatons.map((b) => (
              <div key={b.shoutId} className="so-pass section">
                <span className="so-kicker">🔗 {b.title}</span>
                <b style={{ display: "block", marginTop: 2 }}>You&apos;re holding link #{b.link}. Don&apos;t let it end with you!</b>
                <div className="row" style={{ gap: 10, marginTop: 8, alignItems: "center" }}>
                  <span className="tiny muted grow">{b.daysLeft <= 0 ? "Last day to pass it on" : `${b.daysLeft} ${b.daysLeft === 1 ? "day" : "days"} left to pass it on`}</span>
                  <button className="btn primary sm" onClick={() => setGiving({ pass: b })}>🔗 Pass it on</button>
                </div>
              </div>
            ))}
            <div className="section">
              {tab === "challenges" && (
                <Challenges
                  list={challenges}
                  shouts={list}
                  roster={roster}
                  canStart={canStart}
                  canEnd={(c) => exec || (!!me?.email && c.createdBy.email?.toLowerCase() === me.email.toLowerCase())}
                  onStart={() => setStarting(true)}
                  onEnd={async (c) => {
                    if (!confirm(`End "${c.title}"?`)) return;
                    const j = await api({ action: "endChallenge", id: c.id });
                    if (!j.ok) return toast.show("Couldn't end it");
                    setChallenges(challenges.map((x) => (x.id === c.id ? { ...x, status: "ended" } : x)));
                    toast.show("Challenge ended");
                  }}
                />
              )}
              {tab === "wall" && activeCh.length > 0 && <ChallengeCards list={activeCh.map((c) => publicChallenge(c, list, roster))} />}
              {tab === "wall" &&
                (live.length === 0 ? (
                  <div className="card small muted">No shoutouts yet. Print the QR code and be the first.</div>
                ) : (
                  <div className="so-wall">{live.slice(0, 80).map((s) => <ShoutCard key={s.id} s={toItem(s)} onReact={(e) => react(s.id, e)} onRemove={exec ? () => remove(s) : undefined} />)}</div>
                ))}
              {tab === "board" && (
                <>
                  <Scoreboard b={board} />
                  <Missing list={live} />
                </>
              )}
              {tab === "review" && exec && (
                <>
                  <p className="small muted" style={{ marginTop: 0 }}>Anything the screen wasn&apos;t sure about, sent by someone not on the list, or reported twice by coworkers. Nobody else sees these.</p>
                  {held.length === 0 ? (
                    <div className="card small muted">Nothing waiting. 👍</div>
                  ) : (
                    held.map((s) => (
                      <div className="card so-review" key={s.id}>
                        <div className="tiny" style={{ color: "var(--amber)", fontWeight: 600 }}>⚠ {s.heldReason ?? "Held"}</div>
                        <p style={{ margin: "6px 0" }}>“{s.message}”</p>
                        <div className="tiny muted">To {s.to.name} · from {s.from.name}{s.from.verified ? "" : s.from.personId ? " (picked from the list)" : " (typed their own name)"} · {s.channel === "sms" ? "text" : s.channel === "qr" ? "QR code" : "portal"} · {new Date(s.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                        <div className="sheet-actions">
                          <button className="btn sm" style={{ color: "var(--red)" }} onClick={() => review(s, false)}>Remove</button>
                          <button className="btn primary sm" onClick={() => review(s, true)}>Post it</button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
              {tab === "setup" && isAdvisor && (
                <Setup
                  rec={rec}
                  onSave={(r) => { setRec(r); toast.show("Saved"); }}
                  clientName={client.name}
                  onTest={async (kind, draft) => {
                    if (!LIVE) return toast.show("Demo: test emails send from the live portal");
                    const j = await api({ action: "testEmail", kind, rec: draft });
                    toast.show(j.ok ? `Test sent to ${j.to}` : `Couldn't send the test (${j.reason ?? "error"})`);
                  }}
                />
              )}
            </div>
          </>
        )}
      </main>
      {giving && rec?.token && (
        <GiveSheet
          token={rec.token}
          values={rec.values}
          pass={giving.pass}
          onClose={() => setGiving(false)}
          onSend={async (body) => {
            const j = await api({ action: "give", ...body, pass: giving.pass?.shoutId });
            if (!j.ok) return j.reason === "self" ? "You can't give yourself one 😄" : j.reason === "already_in_chain" ? "They're already in the chain. Pick someone new so it keeps spreading!" : j.reason?.startsWith("chain") ? "This chain has ended." : "That didn't send. Try again.";
            setGiving(false);
            toast.show(j.demo ? "Sent (demo)" : j.status === "held" ? "Thanks! It'll post after a quick check." : giving.pass ? `The chain grows! Link #${giving.pass.link + 1} 🔗` : "Sent! 🎉");
            load();
            return "";
          }}
        />
      )}
      {starting && rec && (
        <StartSheet
          token={rec.token}
          values={rec.values}
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
            toast.show(body.kind === "chain" ? "Chain started! 🔗 The first link is on its way." : "Challenge started! 🎉");
            setTab("challenges");
            load();
            return "";
          }}
        />
      )}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
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

function StartSheet({ token, values, hasWelcome, onClose, onStart }: { token: string; values: string[]; hasWelcome: boolean; onClose: () => void; onStart: (b: StartBody) => Promise<string> }) {
  const [kind, setKind] = useState<ChallengeKind>("chain");
  const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [endsAt, setEndsAt] = useState(inDays(30));
  const [windowDays, setWindowDays] = useState(3);
  const [target, setTarget] = useState(50);
  const [reward, setReward] = useState("");
  const [value, setValue] = useState("");
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
          <label className="f">Only count one value <span className="tiny muted">(optional)</span>
            <select className="f" value={value} onChange={(e) => setValue(e.target.value)}><option value="">Any shoutout</option>{values.map((v) => <option key={v} value={v}>{v}</option>)}</select>
          </label>
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
            setErr(await onStart({ kind, title: title.trim() || placeholder, endsAt: kind === "welcome" ? undefined : endsAt, windowDays, target, reward, value: value || undefined, welcomeTarget: wt, welcomeDays: wd, to: to?.id, message: msg }));
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

function GiveSheet({ token, values, pass, onClose, onSend }: { token: string; values: string[]; pass?: Baton & { title: string }; onClose: () => void; onSend: (b: { to: string; value?: string; message: string }) => Promise<string> }) {
  const [to, setTo] = useState<Pick | null>(null);
  const [msg, setMsg] = useState("");
  const [value, setValue] = useState<string | null>(null);
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
    <Sheet title={pass ? "Pass on the chain 🔗" : "Give a shoutout"} onClose={onClose}>
      {pass && <p className="small" style={{ marginTop: 0 }}>You&apos;re link #{pass.link} in the <b>{pass.title}</b>. Recognize someone new to keep it growing.</p>}
      <span className="flabel">Who</span>
      <PersonSearch search={search} value={to} onPick={setTo} placeholder="Start typing their name" autoFocus />
      <span className="flabel" style={{ marginTop: 12 }}>What did they do?</span>
      <div className="so-starters">{STARTERS.en.map((s) => <button key={s} onClick={() => setMsg(s.replace("…", " "))}>{s}</button>)}</div>
      <textarea className="f" style={{ minHeight: 80 }} value={msg} onChange={(e) => setMsg(e.target.value.slice(0, MAX_MESSAGE))} placeholder="Be specific. What happened, and why it mattered." />
      <span className="flabel">Value</span>
      <div className="so-values">{values.map((v) => <button key={v} className={value === v ? "on" : ""} onClick={() => setValue(value === v ? null : v)}>{v}</button>)}</div>
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={busy || !to || msg.trim().length < 3} onClick={async () => { setBusy(true); setErr(await onSend({ to: to!.id, value: value ?? undefined, message: msg })); setBusy(false); }}>{busy ? "Sending…" : "Send"}</button>
      </div>
    </Sheet>
  );
}

const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "alzapc.com";

function Setup({ rec, onSave, clientName, onTest }: { rec: RecognitionSettings | null | undefined; onSave: (r: RecognitionSettings) => void; clientName: string; onTest?: (k: CelebrateKind, draft: Partial<RecognitionSettings>) => void }) {
  const [values, setValues] = useState((rec?.values ?? DEFAULT_VALUES).join("\n"));
  const [sms, setSms] = useState(rec?.smsNumber ?? "");
  const [notify, setNotify] = useState(rec?.notifyManagers !== false);
  const [wall, setWall] = useState(rec?.showWall !== false);
  const [cel, setCel] = useState(rec?.celebrate !== false);
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
  const vals = values.split("\n").map((v) => v.trim()).filter(Boolean).slice(0, 8);
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
  });
  const save = () => onSave({ ...(rec ?? newRecognition()), values: vals.length ? vals : DEFAULT_VALUES, smsNumber, notifyManagers: notify, showWall: wall, ...extras() });
  const copy = (t: string) => navigator.clipboard?.writeText(t);

  return (
    <div className="so-setup">
      {!rec && <p className="small" style={{ marginTop: 0 }}>Set the values, then print the QR code for {clientName}&apos;s break rooms, trucks and shop floor.</p>}
      <div className="card">
        <label className="f">Company values <span className="tiny muted">(one per line, up to 8. Every shoutout can be tied to one.)</span>
          <textarea className="f" style={{ minHeight: 110 }} value={values} onChange={(e) => setValues(e.target.value)} />
        </label>
        <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email the person&apos;s manager when they get a shoutout</label>
        <label className="check"><input type="checkbox" checked={wall} onChange={(e) => setWall(e.target.checked)} /> Show the wall and scoreboard on the QR page</label>
        <label className="check"><input type="checkbox" checked={cel} onChange={(e) => setCel(e.target.checked)} /> Celebrate tab: birthdays, work anniversaries and new people (next 2 weeks, month and day only). Anyone can opt out from their birthday email, or you can uncheck them on the roster.</label>
        <label className="f" style={{ marginTop: 8 }}>Texting number <span className="tiny muted">(optional, once the texting provider is set up)</span>
          <input className="f" value={sms} onChange={(e) => setSms(e.target.value)} placeholder="(415) 555-0123" />
        </label>
        <div className="sheet-actions"><button className="btn primary sm" onClick={save}>{rec ? "Save" : "Turn on shoutouts"}</button></div>
      </div>

      <div className="card section">
        <b className="small">Emails to employees</b>
        <p className="tiny muted" style={{ margin: "2px 0 10px" }}>Shoutout, birthday and anniversary emails come from this name and address. Every one has a one-click opt-out at the bottom.</p>
        <div className="two">
          <label className="f">From name<input className="f" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder={defSender.fromName} maxLength={60} /></label>
          <label className="f">Address
            <span className="so-addr"><input className="f" value={senderBox} onChange={(e) => setSenderBox(e.target.value)} placeholder={defSender.fromBox} maxLength={40} /><span className="tiny muted">@{MAIL_DOMAIN}</span></span>
          </label>
        </div>
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
        <div className="sheet-actions"><button className="btn primary sm" onClick={save}>Save</button></div>
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
            <p style={{ margin: "8px 0 0" }}><b>Keeping it positive:</b> every shoutout is screened before it posts. Anything questionable, or from a name not on the roster, waits in To review. Two reports from coworkers takes one down until you look.</p>
            {!rec.smsNumber && <p style={{ margin: "8px 0 0" }}><b>To turn on texting:</b> set up a Twilio number with carrier registration, add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Vercel, point the number&apos;s incoming messages to <code>{origin}/api/shout/sms</code>, then enter the number above.</p>}
          </div>
          <button className="linklike tiny" style={{ color: "var(--red)" }} onClick={() => { if (confirm("Get a new link? The current QR code and TV link stop working, so you'll need to reprint the poster.")) onSave({ ...rec, token: randomToken(22) }); }}>Get a new link (old QR codes stop working)</button>
        </>
      )}
    </div>
  );
}
