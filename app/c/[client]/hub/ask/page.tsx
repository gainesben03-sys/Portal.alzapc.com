"use client";

import { ContactBen } from "@/components/contactben";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { AskBenSheet } from "@/components/askben";
import { useDiscAccess } from "@/components/discipline";
import { discApi } from "@/lib/disciplineclient";
import { Custom, RolePlay } from "@/components/practice";
import { useStore } from "@/lib/store";
import { authHeader } from "@/lib/supabase";
import { DEFAULT_IDEAS, demoHandbook, demoSituation, hasPractice, HandbookAnswer, SituationAnswer } from "@/lib/practice";

type Mode = "handbook" | "situation";
type Turn = { q: string; a?: HandbookAnswer | SituationAnswer; err?: string };

const EXAMPLES: Record<Mode, string[]> = {
  handbook: ["How much sick time do people get?", "Do I have to approve overtime ahead of time?", "When do meal breaks have to happen?", "Can someone take vacation during their first 90 days?"],
  situation: ["Someone on my team keeps showing up 10 minutes late", "Two people on my crew aren't getting along", "My best performer is rude to coworkers", "Someone got defensive when I gave feedback"],
};
const REASON: Record<string, string> = {
  no_handbook: "HR hasn't loaded your handbook yet. Email or text HR for now.",
  limit: "That's today's limit for Ask HR. Email or text HR, or try again tomorrow.",
  off: "Ask HR isn't turned on for your company.",
  no_key: "Ask HR isn't switched on yet. It's coming soon.",
  forbidden: "Ask HR isn't available to you.",
  signed_out: "Sign in again to keep going.",
};

/** Ask HR: plain-language answers from the company handbook, and coaching for sticky situations. */
export default function AskHr() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, resources, config } = useStore();
  const client = getClient(clientId);
  const toast = useToast();
  const disc = useDiscAccess();
  const [mode, setMode] = useState<Mode>("handbook");
  const [threads, setThreads] = useState<Record<Mode, Turn[]>>({ handbook: [], situation: [] });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [ben, setBen] = useState<{ q: string; mode: Mode } | null>(null);
  const [play, setPlay] = useState<Custom | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const thread = threads[mode];
  useEffect(() => {
    if (thread.length) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread.length, busy]);

  // a question typed on the home page arrives as ?q=
  const asked = useRef(false);
  useEffect(() => {
    if (!ok || !client || asked.current) return;
    asked.current = true;
    const sp = new URLSearchParams(window.location.search);
    const m: Mode = sp.get("mode") === "situation" ? "situation" : "handbook";
    setMode(m);
    const q = sp.get("q");
    if (q) {
      window.history.replaceState(null, "", window.location.pathname);
      ask(q, m);
    }
  }, [ok, client]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok || !client) return null;
  const training = !config[clientId]?.modules.training ? undefined : resources.find((r) => hasPractice(r) && r.shares.some((s) => s.clientId === clientId));
  const ideas = training?.practice?.content.en?.ideas ?? DEFAULT_IDEAS;

  const ask = async (text: string, m: Mode = mode) => {
    const q = text.trim();
    if (!q || busy) return;
    const prior = threads[m].filter((x) => x.a);
    const next: Turn[] = [...threads[m], { q }];
    setThreads((t) => ({ ...t, [m]: next }));
    setDraft("");
    setBusy(true);
    const messages = prior.flatMap((x) => [{ role: "user", text: x.q }, { role: "assistant", text: JSON.stringify(x.a) }]).concat({ role: "user", text: q });
    let turn: Turn = { q };
    try {
      const r = await fetch("/api/askhr", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ clientId, mode: m, messages }) });
      const j = await r.json();
      if (j.reason === "demo") turn = { q, a: m === "handbook" ? demoHandbook(q) : demoSituation(q) };
      else if (j.ok) turn = { q, a: j.answer };
      else turn = { q, err: REASON[j.reason] ?? "Something went wrong. Try that again." };
    } catch {
      turn = { q, err: "Couldn't reach Ask HR. Check your connection and try again." };
    }
    setBusy(false);
    setThreads((t) => ({ ...t, [m]: [...next.slice(0, -1), turn] }));
  };

  if (play)
    return (
      <div style={{ ["--accent" as string]: client.accent }}>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap">
          <button className="linklike small" style={{ color: "var(--blue)" }} onClick={() => setPlay(null)}>← Back to Ask HR</button>
          <div className="section"><RolePlay clientId={clientId} custom={play} lang="en" ideas={ideas} onExit={() => setPlay(null)} /></div>
        </main>
      </div>
    );

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <div className="ask-head">
          <h1 style={{ margin: 0 }}>Ask HR</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>Answers from {client.name}&apos;s handbook, help with tough conversations{disc.ok ? ", and clean documentation" : ""}.</p>
        </div>

        <div className={`ask-layout section ${disc.ok ? "with-doc" : ""}`}>
          <section className="card ask-main" aria-label="Ask a question">
            <div className="ask-main-top">
              <div style={{ minWidth: 0 }}>
                <b className="ask-card-t">Ask a question</b>
                <span className="tiny muted ask-card-s">{mode === "handbook" ? "Plain answers, with where the handbook says so." : "Talk it through before you have the conversation."}</span>
              </div>
              <div className="dc-seg" role="group" aria-label="What kind of question">
                <button className={mode === "handbook" ? "on" : ""} onClick={() => setMode("handbook")} aria-pressed={mode === "handbook"}>Handbook</button>
                <button className={mode === "situation" ? "on" : ""} onClick={() => setMode("situation")} aria-pressed={mode === "situation"}>Sticky situation</button>
              </div>
            </div>

            {thread.length === 0 && (
              <div className="ask-chips">
                {EXAMPLES[mode].map((e) => <button key={e} className="ask-chip" onClick={() => ask(e)}>{e}</button>)}
              </div>
            )}

            {thread.length > 0 && (
              <div className="ask-thread">
                {thread.map((t, i) => (
                  <div key={i} className="ask-turn">
                    <div className="bub me"><div>{t.q}</div></div>
                    {t.err ? (
                      <div className="card ask-a"><p className="small" style={{ margin: 0 }}>{t.err}</p><AskBenBtn onClick={() => setBen({ q: t.q, mode })} /></div>
                    ) : t.a && mode === "handbook" ? (
                      <HandbookCard a={t.a as HandbookAnswer} onBen={() => setBen({ q: t.q, mode })} />
                    ) : t.a ? (
                      <SituationCard a={t.a as SituationAnswer} onBen={() => setBen({ q: t.q, mode })} onPractice={() => { const s = t.a as SituationAnswer; setPlay({ name: s.employee?.name || "your employee", role: s.employee?.role || "", situation: thread.slice(0, i + 1).map((x) => x.q).join("\n") }); }} />
                    ) : (
                      <div className="bub typing"><span /><span /><span /></div>
                    )}
                  </div>
                ))}
                <div ref={end} />
              </div>
            )}

            <div className="ask-compose">
              <textarea
                className="f"
                rows={2}
                maxLength={2000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(draft); } }}
                placeholder={thread.length ? "Ask a follow-up" : mode === "handbook" ? "Ask about a policy, in your own words" : "What's going on? Stick to what you've seen and heard."}
                aria-label="Your question"
              />
              <button className="btn primary" disabled={!draft.trim() || busy} onClick={() => ask(draft)}>Ask</button>
            </div>
            <div className="row tiny muted" style={{ gap: 10 }}>
              <span className="grow">🔒 Questions aren&apos;t saved. Not legal advice. Firing, leave, harassment or discrimination: talk to HR first.</span>
              {thread.length > 0 && <button className="linklike tiny" onClick={() => setThreads((x) => ({ ...x, [mode]: [] }))}>Clear</button>}
            </div>
          </section>

          {disc.ok && <DocCard clientId={clientId} />}
        </div>

        {mode === "situation" && training && (
          <Link href={`/c/${clientId}/hub/learn/${training.id}`} className="card section ask-train">
            <span className="tiny muted">From your training</span>
            <b className="small" style={{ display: "block" }}>{training.practice?.content.en?.title}</b>
            <span className="tiny" style={{ color: "var(--blue)" }}>Practice a conversation ›</span>
          </Link>
        )}
      </main>
      {ben && (
        <AskBenSheet
          clientId={clientId}
          startKind={ben.mode === "handbook" ? "A policy question" : "Help with an employee situation"}
          startTitle={ben.q.length > 90 ? ben.q.slice(0, 87) + "..." : ben.q}
          startDetail={ben.q.length > 90 ? ben.q : ""}
          onClose={() => setBen(null)}
          onDone={(m) => { setBen(null); toast.show(m); }}
        />
      )}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}

function AskBenBtn({ onClick, strong }: { onClick: () => void; strong?: boolean }) {
  void onClick;
  return <div style={{ marginTop: 10 }}><ContactBen strong={strong} /></div>;
}

function HandbookCard({ a, onBen }: { a: HandbookAnswer; onBen: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="card ask-a">
      {a.callBen && <div className="ask-flag small">⚠️ Talk to HR before you act on this.{a.why ? ` ${a.why}` : ""}</div>}
      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{a.answer}</p>
      {a.cites?.length > 0 && (
        <div className="ask-cites">
          {a.cites.map((c, i) => (
            <div key={i}>
              <button className="ask-cite" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>📘 {c.doc}{c.section ? ` · ${c.section}` : ""}</button>
              {open === i && c.quote && <blockquote className="ask-quote small">“{c.quote}”</blockquote>}
            </div>
          ))}
        </div>
      )}
      {!a.covered && <p className="tiny muted" style={{ margin: "8px 0 0" }}>Your handbook doesn&apos;t cover this.</p>}
      {(a.callBen || !a.covered) && <AskBenBtn onClick={onBen} strong />}
    </div>
  );
}

function SituationCard({ a, onBen, onPractice }: { a: SituationAnswer; onBen: () => void; onPractice: () => void }) {
  void onBen;
  return (
    <div className="card ask-a">
      {a.callBen && <div className="ask-flag small">⚠️ Talk to HR before you act.{a.why ? ` ${a.why}` : ""}</div>}
      <p style={{ margin: 0 }}>{a.read}</p>
      {a.steps?.length > 0 && (
        <>
          <b className="tiny ask-h">What to do</b>
          <ol className="small ask-steps">{a.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </>
      )}
      {a.say?.length > 0 && (
        <>
          <b className="tiny ask-h">Try saying</b>
          {a.say.map((s) => <div key={s} className="small pr-yes ask-say">“{s.replace(/^["“]|["”]$/g, "")}”</div>)}
        </>
      )}
      {a.avoid?.length > 0 && (
        <>
          <b className="tiny ask-h">Avoid</b>
          <ul className="small ask-steps">{a.avoid.map((s) => <li key={s}>{s}</li>)}</ul>
        </>
      )}
      {a.document && <p className="tiny" style={{ margin: "8px 0 0" }}><b>Write down:</b> {a.document}</p>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {!a.callBen && <button className="btn sm primary" onClick={onPractice}>🎭 Practice this conversation</button>}
        <ContactBen strong={a.callBen} />
      </div>
    </div>
  );
}

/** The way into discipline documentation, for executives and HR. */
function DocCard({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    discApi.list(clientId).then((r) => setOpen(r.ok ? r.records.filter((x) => x.status === "review" || x.ack === "pending").length : null));
  }, [clientId]);
  const base = `/c/${clientId}/hub/ask/document`;
  return (
    <section className="card ask-doc" aria-label="Document an issue">
      <span className="ask-doc-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
      </span>
      <b className="ask-card-t">Document an issue</b>
      <span className="small muted" style={{ lineHeight: 1.5 }}>Say what happened. You pick the level, and we write it up on your letterhead from your handbook.</span>
      <div className="ask-doc-kinds tiny muted">Write-up · Email recap · File note</div>
      <Link href={base} className="btn primary ask-doc-go">Start a write-up</Link>
      <Link href={`${base}?all=1`} className="ask-doc-rec small">
        <span>Records</span>
        {open ? <span className="pill amber">{open} open</span> : <span className="muted">›</span>}
      </Link>
      <span className="tiny muted">🔒 Executives and HR only</span>
    </section>
  );
}
