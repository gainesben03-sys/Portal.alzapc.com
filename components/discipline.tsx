"use client";

import Link from "next/link";
import { Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTalk } from "@/components/perform";
import { blocks, DEFAULT_LEVELS, DiscDraft, DiscInput, DiscRecord, fmtDay, Format, FORMAT_LABEL, guessIssue, Issue, ISSUES, loadedWords, protectedHits, suggestLevel, TERMINATION, today } from "@/lib/discipline";
import { discApi, reasonText } from "@/lib/disciplineclient";
import { downloadDocx, letterheadUrl } from "@/lib/docx";
import { useStore } from "@/lib/store";
import type { TeamMember } from "@/lib/team";

// ---------- shared bits ----------

/** Executives at the company and Ben. Nobody else sees discipline records. */
export function useDiscAccess() {
  const { me, viewer } = useStore();
  const isBen = viewer?.kind === "advisor";
  return { ok: isBen || me?.access === "exec", isBen, name: isBen ? "Ben Gaines" : me?.name ?? "" };
}

const first = (n: string) => n.trim().split(/\s+/)[0] || n;

function inline(t: string): ReactNode {
  return t.split(/(\*\*[^*]+\*\*|\[[A-Z][^\]]{2,}\])/g).filter(Boolean).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b>
    : /^\[[A-Z]/.test(p) ? <mark key={i} className="dc-fill">{p}</mark>
    : <Fragment key={i}>{p}</Fragment>,
  );
}
/** Spots still to fill in, like [ADD POLICY]. */
export const blanks = (body: string) => (body.match(/\[[A-Z][^\]]{2,}\]/g) ?? []).length;

function useLetterhead(clientId: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    letterheadUrl(clientId).then((l) => on && setUrl(l?.url ?? null));
    return () => { on = false; };
  }, [clientId]);
  return url;
}

function LetterTop({ clientId, letterhead }: { clientId: string; letterhead: string | null }) {
  const { getClient } = useStore();
  const c = getClient(clientId);
  if (letterhead) return <div className="dc-lh"><img src={letterhead} alt={`${c?.name ?? "Company"} letterhead`} /></div>;
  return (
    <div className="dc-lh plain">
      {c?.logo && <img src={c.logo} alt="" />}
      <b>{c?.name}</b>
    </div>
  );
}

/** The document as it will print: letterhead, then the text. */
export function Letter({ clientId, body, letterhead }: { clientId: string; body: string; letterhead: string | null }) {
  return (
    <article className="dc-letter">
      <LetterTop clientId={clientId} letterhead={letterhead} />
      {blocks(body).map((b, i) =>
        b.k === "h1" ? <h3 key={i} className="dc-h1">{inline(b.t)}</h3>
        : b.k === "h2" ? <h4 key={i} className="dc-h2">{inline(b.t)}</h4>
        : b.k === "quote" ? <blockquote key={i} className="dc-quote">{inline(b.t)}</blockquote>
        : b.k === "li" ? <div key={i} className="dc-li">{inline(b.t)}</div>
        : b.k === "line" ? <div key={i} className="dc-line" />
        : <p key={i} className={/^\*\*[^*]+:\*\*/.test(b.t) ? "dc-field" : /: _{6,}/.test(b.t) ? "dc-sign" : ""}>{inline(b.t)}</p>,
      )}
    </article>
  );
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inlineHtml = (t: string) => esc(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

/** Print to PDF from a clean page with the letterhead. Nothing leaves the browser. */
function printPdf(title: string, body: string, top: { img?: string | null; logo?: string; name?: string }) {
  const html = blocks(body)
    .map((b) => (b.k === "h1" ? `<h1>${inlineHtml(b.t)}</h1>` : b.k === "h2" ? `<h2>${inlineHtml(b.t)}</h2>` : b.k === "quote" ? `<blockquote>${inlineHtml(b.t)}</blockquote>` : b.k === "li" ? `<li>${inlineHtml(b.t)}</li>` : b.k === "line" ? `<div class="line"></div>` : `<p>${inlineHtml(b.t)}</p>`))
    .join("");
  const head = top.img ? `<img class="lh" src="${esc(top.img)}">` : `<div class="lhp">${top.logo ? `<img src="${esc(new URL(top.logo, location.href).href)}">` : ""}<b>${esc(top.name ?? "")}</b></div>`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{margin:0.8in}body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1f2a37}
.lh{max-width:100%;max-height:1.2in;margin-bottom:18px}.lhp{display:flex;align-items:center;gap:10px;border-bottom:2px solid #19283c;padding-bottom:10px;margin-bottom:18px}.lhp img{max-height:40px}.lhp b{font-size:15pt}
h1{font-size:13pt;letter-spacing:.06em;text-align:center;margin:8px 0 14px}h2{font-size:10.5pt;letter-spacing:.04em;text-transform:uppercase;margin:16px 0 4px}
p{margin:0 0 6px}blockquote{margin:6px 0;padding:8px 12px;background:#f6f3ec;font-style:italic}li{margin-left:18px}.line{border-bottom:1px solid #999;height:22px}
</style></head><body>${head}${html}</body></html>`;
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  const w = f.contentWindow!;
  w.document.open();
  w.document.write(doc);
  w.document.close();
  const go = () => { w.focus(); w.print(); setTimeout(() => f.remove(), 1500); };
  const imgs = Array.from(w.document.images);
  if (!imgs.length) setTimeout(go, 50);
  else Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = r; im.onerror = r; })))).then(go);
}

export function AckPill({ r }: { r: DiscRecord }) {
  if (r.status === "review") return <span className="pill amber">With Ben</span>;
  if (r.ack === "pending") return <span className="pill amber">Needs signature</span>;
  if (r.ack === "signed") return <span className="pill green">Signed</span>;
  if (r.ack === "declined") return <span className="pill later">Declined to sign</span>;
  return <span className="pill later">On file</span>;
}

// ---------- 1. what happened ----------

export function NewIssue({ clientId, people, records, levels, start, onDrafted, onHeld, toast }: {
  clientId: string;
  people: TeamMember[];
  records: DiscRecord[];
  levels: string[];
  start?: Partial<DiscInput>;
  onDrafted: (input: DiscInput, draft: DiscDraft) => void;
  onHeld: (r: DiscRecord) => void;
  toast: (m: string) => void;
}) {
  const acc = useDiscAccess();
  const [personId, setPersonId] = useState(start?.personId ?? "");
  const [date, setDate] = useState(start?.date ?? today());
  const [facts, setFacts] = useState(start?.facts ?? "");
  const [witnesses, setWitnesses] = useState(start?.witnesses ?? "");
  const [format, setFormat] = useState<Format>(start?.format ?? "writeup");
  const [issue, setIssue] = useState<Issue | "">(start?.issue ?? "");
  const [level, setLevel] = useState(start?.level ?? "");
  const [busy, setBusy] = useState(false);
  const [hold, setHold] = useState<string[] | null>(null);
  const talk = useTalk("en");
  useEffect(() => { if (talk.on) setFacts(talk.text); }, [talk.on, talk.text]);

  const person = people.find((p) => p.id === personId);
  const history = records.filter((r) => r.personId === personId && r.status === "saved");
  const theIssue: Issue = issue || (facts.trim().length > 12 ? guessIssue(facts) : "Other");
  const sug = personId ? suggestLevel(levels, history, theIssue) : null;
  const theLevel = level || sug?.level || levels[0];
  const loaded = loadedWords(facts);
  const flags = protectedHits(`${facts} ${witnesses}`);
  const firing = TERMINATION.test(facts);
  const ready = !!person && facts.trim().length >= 20 && !busy;
  const input = (): DiscInput => ({ personId, personName: person!.name, personTitle: person!.title || undefined, date, facts: facts.trim(), witnesses: witnesses.trim() || undefined, issue: theIssue, level: theLevel, format });

  const go = async () => {
    if (!ready) return;
    if (talk.on) talk.stop();
    setBusy(true);
    setHold(null);
    const r = await discApi.draft(clientId, input(), acc.name);
    setBusy(false);
    if (r.ok) return onDrafted(input(), r.draft);
    if (r.reason === "hold") return setHold(r.hold ?? []);
    toast(reasonText(r.reason));
  };
  const sendBen = async () => {
    setBusy(true);
    const r = await discApi.hold(clientId, input(), acc.name);
    setBusy(false);
    if (r.ok) onHeld(r.record);
    else toast(reasonText(r.reason));
  };

  if (hold)
    return (
      <div className="card dc-hold">
        <b className="dc-hold-h">Let&apos;s have Ben look at this first</b>
        <p className="small" style={{ margin: "6px 0 10px" }}>Before anything goes in writing, we check for things the law protects. Disciplining someone soon after one of these can look like retaliation, even when it isn&apos;t.</p>
        <ul className="small dc-hold-list">{hold.map((h) => <li key={h}>{h}</li>)}</ul>
        <div className="dc-actions-row">
          <button className="btn primary" disabled={busy} onClick={sendBen}>{busy ? "Sending..." : "Send to Ben"}</button>
          <button className="btn" onClick={() => setHold(null)}>Edit the description</button>
        </div>
        <p className="tiny muted" style={{ margin: "10px 0 0" }}>Ben gets a heads-up with no details in the email. He&apos;ll open it in the portal and get back to you.</p>
      </div>
    );

  return (
    <div className="dc-grid">
      <div className="card dc-form">
        <div className="dc-two">
          <label className="dc-field-l">
            <span>Employee</span>
            <select className="f" value={personId} onChange={(e) => { setPersonId(e.target.value); setLevel(""); }}>
              <option value="">Choose someone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.title ? ` · ${p.title}` : ""}</option>)}
            </select>
          </label>
          <label className="dc-field-l">
            <span>Date it happened</span>
            <input className="f" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        <div className="dc-field-l">
          <div className="dc-label-row">
            <label htmlFor="dc-facts">What happened</label>
            {talk.supported && (
              <button type="button" className={`dc-mic ${talk.on ? "on" : ""}`} onClick={() => { if (talk.on) talk.stop(); else { talk.setText(facts); talk.start(true); } }} aria-pressed={talk.on}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>
                {talk.on ? "Stop" : "Speak instead"}
              </button>
            )}
          </div>
          <textarea
            id="dc-facts"
            className="f dc-facts"
            rows={6}
            maxLength={6000}
            value={facts}
            onChange={(e) => setFacts(e.target.value)}
            placeholder="In your own words: what happened, when, who saw it, what they said. Dates and times help."
          />
          {talk.on && <span className="tiny muted">Listening. Tap Stop when you&apos;re done.</span>}
          {talk.err === "denied" && <span className="tiny" style={{ color: "var(--red)" }}>Allow the microphone to speak instead.</span>}
          {loaded.length > 0 && (
            <div className="dc-flag">
              <b>{loaded.map((w) => `"${w}"`).join(", ")}</b> {loaded.length > 1 ? "are opinions" : "is an opinion"}, not facts. {loaded.length > 1 ? "They'll" : "It'll"} be left out. Add what they said or did instead.
            </div>
          )}
          {(flags.length > 0 || firing) && (
            <div className="dc-flag blue">
              {firing ? "Termination goes through Ben, not here." : `This mentions ${flags.join(" and ")}. It will go to Ben before anything is drafted.`}
            </div>
          )}
        </div>

        <label className="dc-field-l">
          <span>Witnesses or records <em>optional</em></span>
          <input className="f" value={witnesses} maxLength={400} onChange={(e) => setWitnesses(e.target.value)} placeholder="Timeclock report, a coworker who saw it" />
        </label>

        <div className="dc-two">
          <div className="dc-field-l">
            <span>Put it in a</span>
            <div className="dc-chips">
              {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => <button key={f} type="button" className={`chip chip-btn ${format === f ? "on" : ""}`} onClick={() => setFormat(f)} aria-pressed={format === f}>{FORMAT_LABEL[f]}</button>)}
            </div>
          </div>
          <label className="dc-field-l">
            <span>Type of issue</span>
            <select className="f" value={theIssue} onChange={(e) => { setIssue(e.target.value as Issue); setLevel(""); }}>
              {ISSUES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
        </div>

        <div className="dc-field-l">
          <span>Level <em>your call</em></span>
          <div className="dc-chips">
            {levels.map((l) => (
              <button key={l} type="button" className={`chip chip-btn dc-level ${theLevel === l ? "on" : ""}`} onClick={() => setLevel(l)} aria-pressed={theLevel === l}>
                {l}{sug?.level === l && <span className="dc-sug">Suggested</span>}
              </button>
            ))}
          </div>
          {sug && <span className="tiny muted">{sug.why}</span>}
        </div>

        <div className="dc-submit">
          <button className="btn primary" disabled={!ready} onClick={go}>{busy ? "Drafting..." : `Draft the ${FORMAT_LABEL[format].toLowerCase()}`}</button>
          {!person && <span className="tiny muted">Choose who it&apos;s about to start.</span>}
        </div>
      </div>

      <aside className="dc-side">
        <div className="card">
          <b className="small">{person ? `${first(person.name)}'s history` : "History"}</b>
          {!person ? (
            <p className="tiny muted" style={{ margin: "6px 0 0" }}>Choose someone to see what&apos;s already on file.</p>
          ) : history.length === 0 ? (
            <p className="tiny muted" style={{ margin: "6px 0 0" }}>Nothing on file.</p>
          ) : (
            <div className="dc-hist">
              {history.map((r) => (
                <Link key={r.id} href={`?id=${r.id}`} className="dc-hist-row">
                  <span className="small"><b>{r.level}</b> · {r.issue}</span>
                  <span className="tiny muted">{fmtDay(r.date)} · by {r.createdBy}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="card dc-note">
          <b className="small">How this works</b>
          <ul className="tiny">
            <li>You choose the level. We word it, format it and quote your handbook.</li>
            <li>Opinions are left out, so it holds up.</li>
            <li>We check first for complaints, leave, accommodations, injuries and reports. If one turns up, it goes to Ben.</li>
            <li>Private to executives and Ben.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

// ---------- 2. the draft, and a saved record ----------

const CHANGES: [string, string][] = [["shorter", "Shorter"], ["warmer", "Warmer"], ["formal", "More formal"]];

export function DraftView({ clientId, input, draft, saved, recordId, onSaved, toast }: {
  clientId: string;
  recordId?: string; // a held record Ben cleared: saving fills it in

  input: DiscInput;
  draft: DiscDraft;
  saved?: DiscRecord;
  onSaved: (r: DiscRecord) => void;
  toast: (m: string) => void;
}) {
  const acc = useDiscAccess();
  const { getClient } = useStore();
  const client = getClient(clientId);
  const letterhead = useLetterhead(clientId);
  const [en, setEn] = useState(draft.body);
  const [es, setEs] = useState(draft.es ?? "");
  const [lang, setLang] = useState<"en" | "es">("en");
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const body = lang === "es" ? es : en;
  const locked = !!saved?.signed && !acc.isBen;
  const dirty = !saved || en !== saved.draft?.body || (es || undefined) !== saved.draft?.es;
  const name = first(input.personName);
  const title = draft.title;

  const setBody = (t: string) => (lang === "es" ? setEs(t) : setEn(t));
  const change = async (how: string) => {
    if (!how.trim() || busy) return;
    setBusy("change");
    const r = await discApi.revise(clientId, body, how);
    setBusy("");
    if (r.ok) { setBody(r.body); setAsk(""); toast("Updated"); } else toast(reasonText(r.reason));
  };
  const toSpanish = async () => {
    if (es) return setLang("es");
    setBusy("es");
    const r = await discApi.spanish(clientId, en);
    setBusy("");
    if (r.ok) { setEs(r.body); setLang("es"); } else toast(reasonText(r.reason));
  };
  const save = async (): Promise<DiscRecord | null> => {
    setBusy("save");
    const r = await discApi.save(clientId, { ...input, id: saved?.id ?? recordId, draft: { ...draft, body: en, es: es || undefined } }, acc.name);
    setBusy("");
    if (!r.ok) { toast(reasonText(r.reason)); return null; }
    onSaved(r.record);
    return r.record;
  };
  const ben = async () => {
    const rec = dirty ? await save() : saved!;
    if (!rec) return;
    const r = await discApi.ben(clientId, rec.id);
    toast(r.ok ? "Sent to Ben. He'll take a look." : reasonText(r.reason));
  };
  const ack = async (a: DiscRecord["ack"]) => {
    if (!saved) return;
    const r = await discApi.ack(clientId, saved.id, a);
    if (r.ok) onSaved(r.record); else toast(reasonText(r.reason));
  };
  const upload = async (f: File) => {
    if (!saved) return;
    setBusy("upload");
    const r = await discApi.uploadSigned(clientId, saved.id, f);
    setBusy("");
    if (r.ok) { onSaved(r.record); toast("Signed copy saved"); } else toast(reasonText(r.reason));
  };
  const view = async () => {
    if (!saved) return;
    const u = await discApi.fileUrl(clientId, saved.id);
    if (u) window.open(u, "_blank", "noopener"); else toast("The signed copy opens once the portal is live.");
  };
  const fileName = `${title}${lang === "es" ? " (ES)" : ""}`;

  return (
    <div className="dc-grid">
      <div className="dc-doc">
        <div className="dc-doc-bar">
          <div className="dc-seg" role="group" aria-label="Language">
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")} aria-pressed={lang === "en"}>English</button>
            <button className={lang === "es" ? "on" : ""} onClick={toSpanish} aria-pressed={lang === "es"} disabled={busy === "es"}>{busy === "es" ? "Translating..." : "Español"}</button>
          </div>
          {!locked && <button className="btn sm" onClick={() => setEditing(!editing)}>{editing ? "Done editing" : "Edit text"}</button>}
        </div>
        {editing ? (
          <textarea className="f dc-edit" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Document text" />
        ) : (
          <div className={busy === "change" ? "dc-dim" : ""}><Letter clientId={clientId} body={body} letterhead={letterhead} /></div>
        )}
        {editing && <p className="tiny muted" style={{ margin: "6px 2px 0" }}>Lines starting with # are titles, ## are section headings, &gt; is the policy quote, **bold** is bold.</p>}
      </div>

      <aside className="dc-side">
        {saved && (
          <div className="card">
            <div className="dc-card-h"><b className="small">On {name}&apos;s record</b><AckPill r={saved} /></div>
            <p className="tiny muted" style={{ margin: "4px 0 10px" }}>Saved {fmtDay(saved.createdAt.slice(0, 10))} by {saved.createdBy}{saved.updatedAt !== saved.createdAt ? ` · updated ${fmtDay(saved.updatedAt.slice(0, 10))}` : ""}{saved.personId && <> · <Link href={`/c/${clientId}/hub/p/${saved.personId}`}>{name}&apos;s page</Link></>}</p>
            {saved.format === "writeup" && (
              saved.signed ? (
                <div className="dc-actions-col">
                  <button className="btn sm" onClick={view}>View signed copy</button>
                  <span className="tiny muted">{saved.signed.name} · {fmtDay(saved.signed.at.slice(0, 10))}</span>
                </div>
              ) : (
                <div className="dc-actions-col">
                  <button className="btn sm primary" disabled={busy === "upload"} onClick={() => fileRef.current?.click()}>{busy === "upload" ? "Uploading..." : "Upload signed copy"}</button>
                  {saved.ack === "declined" ? (
                    <button className="linklike tiny" onClick={() => ack("pending")}>Undo &quot;declined to sign&quot;</button>
                  ) : (
                    <button className="linklike tiny" onClick={() => ack("declined")}>{name} declined to sign</button>
                  )}
                  <input ref={fileRef} type="file" hidden accept=".pdf,image/*,.docx" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
                </div>
              )
            )}
            {locked && <p className="tiny muted" style={{ margin: "8px 0 0" }}>Signed, so the text is locked.</p>}
          </div>
        )}

        <div className="card">
          <b className="small">Checks</b>
          <ul className="dc-checks">
            <li className="ok">Facts only, with dates</li>
            {draft.cite ? <li className="ok">Quotes {draft.cite.doc}{draft.cite.section ? `, ${draft.cite.section}` : ""}</li> : <li className="warn">No matching policy found. Add one where it says [ADD POLICY].</li>}
            <li className="ok">{input.level}, your choice</li>
            {blanks(en) > 0 && <li className="warn">{blanks(en) === 1 ? "One spot" : `${blanks(en)} spots`} to fill in, marked in yellow. Use Edit text.</li>}
            {draft.leftOut.length > 0 && <li className="warn">Left out {draft.leftOut.map((w) => `"${w}"`).join(", ")}. Opinions weaken a write-up.</li>}
          </ul>
          {draft.missing.length > 0 && (
            <>
              <b className="tiny dc-sub">Make it stronger</b>
              <ul className="tiny dc-missing">{draft.missing.map((m) => <li key={m}>{m}</li>)}</ul>
              <span className="tiny muted">Add the answer with Edit text, or fill in anything in [BRACKETS].</span>
            </>
          )}
        </div>

        {!locked && (
          <div className="card">
            <b className="small">Change it</b>
            <div className="dc-chips" style={{ marginTop: 8 }}>
              {CHANGES.map(([k, l]) => <button key={k} className="chip chip-btn" disabled={!!busy} onClick={() => change(k)}>{l}</button>)}
            </div>
            <form className="dc-ask" onSubmit={(e) => { e.preventDefault(); change(ask); }}>
              <input className="f" value={ask} maxLength={400} onChange={(e) => setAsk(e.target.value)} placeholder="Or say what to change" aria-label="What to change" />
              <button className="btn sm" disabled={!ask.trim() || !!busy}>{busy === "change" ? "..." : "Go"}</button>
            </form>
          </div>
        )}

        <div className="card dc-actions-col">
          {(dirty || !saved) && !locked && <button className="btn primary" disabled={!!busy} onClick={save}>{busy === "save" ? "Saving..." : saved ? "Save changes" : `Save to ${name}'s record`}</button>}
          <div className="dc-two-btn">
            <button className="btn" onClick={() => downloadDocx(title, body, clientId, fileName).catch(() => toast("Couldn't make the Word file"))}>Word</button>
            <button className="btn" onClick={() => printPdf(title, body, { img: letterhead, logo: client?.logo, name: client?.name })}>PDF</button>
          </div>
          {input.format === "email" && <button className="btn" onClick={() => navigator.clipboard?.writeText(body.replace(/^#.*\n+/, "").replace(/\*\*/g, "")).then(() => toast("Email copied"), () => toast("Couldn't copy"))}>Copy email text</button>}
          {!acc.isBen && <button className="btn ghost sm" onClick={ben}>Ask Ben to look it over</button>}
          <span className="tiny muted">Private to executives and Ben. {name} never sees this in the portal.</span>
        </div>

        {!saved && <p className="tiny muted dc-term">Thinking about termination? Don&apos;t use this. Email Ben and he&apos;ll take it from there.</p>}
      </aside>
    </div>
  );
}

/** Ben's view of something the fairness check paused. */
export function HeldView({ clientId, r, onDrafted, toast }: { clientId: string; r: DiscRecord; onDrafted: (input: DiscInput, draft: DiscDraft) => void; toast: (m: string) => void }) {
  const acc = useDiscAccess();
  const [busy, setBusy] = useState(false);
  return (
    <div className="dc-grid">
      <div className="card">
        <div className="dc-card-h"><b>{r.level} · {r.issue}</b><AckPill r={r} /></div>
        <p className="tiny muted" style={{ margin: "4px 0 12px" }}>{fmtDay(r.date)} · started by {r.createdBy} · {FORMAT_LABEL[r.format]}</p>
        <p className="small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{r.facts}</p>
        {r.witnesses && <p className="tiny muted" style={{ margin: "8px 0 0" }}>Witnesses or records: {r.witnesses}</p>}
      </div>
      <aside className="dc-side">
        <div className="card dc-hold">
          <b className="small">Why it paused</b>
          <ul className="small dc-hold-list">{(r.hold ?? []).map((h) => <li key={h}>{h}</li>)}</ul>
          {acc.isBen ? (
            <button className="btn primary" disabled={busy} onClick={async () => {
              setBusy(true);
              const x = await discApi.draft(clientId, r, r.createdBy, true);
              setBusy(false);
              if (x.ok) onDrafted(r, x.draft); else toast(reasonText(x.reason));
            }}>{busy ? "Drafting..." : "Cleared. Draft it"}</button>
          ) : (
            <p className="tiny muted" style={{ margin: 0 }}>Ben has it. He&apos;ll get back to you before anything goes in writing.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

// ---------- 3. lists ----------

export function RecordRows({ records, showPerson, empty }: { records: DiscRecord[]; showPerson?: boolean; empty: string }) {
  if (!records.length) return <div className="card small muted">{empty}</div>;
  return (
    <div className="card dc-rows">
      {records.map((r) => (
        <Link key={r.id} href={`?id=${r.id}`} className="dc-row">
          <span className="dc-row-date tiny muted">{fmtDay(r.date)}</span>
          <span className="dc-row-main">
            {showPerson && <b className="small">{r.personName}</b>}
            <span className="small">{showPerson ? " · " : ""}<b style={showPerson ? { fontWeight: 500 } : undefined}>{r.level}</b> <span className="muted">· {r.issue}</span></span>
          </span>
          <AckPill r={r} />
        </Link>
      ))}
    </div>
  );
}

/** The Documentation section on a person's page. Executives and Ben only. */
export function PersonDocs({ clientId, person }: { clientId: string; person: TeamMember }) {
  const acc = useDiscAccess();
  const [rs, setRs] = useState<DiscRecord[] | null>(null);
  useEffect(() => {
    if (!acc.ok) return;
    discApi.list(clientId, person.id).then((r) => setRs(r.ok ? r.records : []));
  }, [acc.ok, clientId, person.id]);
  if (!acc.ok) return null;
  const base = `/c/${clientId}/hub/ask/document`;
  return (
    <>
      <div className="section-head section" style={{ alignItems: "center" }}>
        <h2>Documentation</h2>
        <Link href={`${base}?person=${person.id}`} className="btn sm">Document an issue</Link>
      </div>
      <p className="tiny muted" style={{ marginTop: -4 }}>🔒 Executives and Ben only. Not {first(person.name)}, and not their manager.</p>
      {rs === null ? <div className="card small muted">Loading...</div> : (
        rs.length === 0 ? <div className="card small muted">Nothing on file.</div> : (
          <div className="card dc-rows">
            {rs.map((r) => (
              <Link key={r.id} href={`${base}?id=${r.id}`} className="dc-row">
                <span className="dc-row-date tiny muted">{fmtDay(r.date)}</span>
                <span className="dc-row-main small"><b>{r.level}</b> <span className="muted">· {r.issue}</span></span>
                <AckPill r={r} />
              </Link>
            ))}
          </div>
        )
      )}
    </>
  );
}

// ---------- setup ----------

/** Discipline levels in the company's own words. Order matters: it's how the next step is suggested. */
export function LevelsEditor({ levels, onChange }: { levels?: string[]; onChange: (levels: string[]) => void }) {
  const list = useMemo(() => (levels?.length ? levels : DEFAULT_LEVELS), [levels]);
  const [draft, setDraft] = useState(list);
  useEffect(() => setDraft(list), [list]);
  const commit = (next: string[]) => { const clean = next.map((l) => l.trim()).filter(Boolean); setDraft(next); if (clean.length) onChange(clean); };
  const move = (i: number, d: number) => { const n = [...draft]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; commit(n); };
  return (
    <div className="card section">
      <div className="dc-card-h"><b>Discipline levels</b><span className="tiny muted">First to last</span></div>
      <p className="tiny muted" style={{ margin: "4px 0 10px" }}>Use their handbook&apos;s words. Execs pick from these when they document an issue, and the next one in line is suggested.</p>
      {draft.map((l, i) => (
        <div key={i} className="dc-lvl">
          <span className="dc-lvl-n">{i + 1}</span>
          <input className="f" value={l} maxLength={60} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? e.target.value : x)))} onBlur={() => commit(draft)} aria-label={`Level ${i + 1}`} />
          <button className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
          <button className="btn ghost sm" onClick={() => move(i, 1)} disabled={i === draft.length - 1} aria-label="Move down">↓</button>
          <button className="btn ghost sm" style={{ color: "var(--red)" }} onClick={() => commit(draft.filter((_, j) => j !== i))} disabled={draft.length <= 2} aria-label={`Remove ${l}`}>✕</button>
        </div>
      ))}
      <div className="dc-actions-row" style={{ marginTop: 8 }}>
        {draft.length < 8 && <button className="btn sm" onClick={() => setDraft([...draft, ""])}>+ Add a level</button>}
        {levels?.length ? <button className="linklike tiny" onClick={() => onChange([])}>Reset to the standard four</button> : null}
      </div>
    </div>
  );
}
