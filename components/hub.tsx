"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Commitment, isoDay, sameEmail, TeamLog, TeamMember, teamFor } from "@/lib/team";
import { Sheet } from "./ui";

const MGR_KEY = "alza-hub-manager";

/** The manager whose team we're showing: the signed-in manager, or (for Ben) one he picks. */
export function useHub(clientId: string) {
  const { me, viewer, people, checkins, config } = useStore();
  const isAdvisor = viewer?.kind === "advisor";
  const all = people.filter((p) => p.clientId === clientId && p.active);
  const managers = useMemo(() => Array.from(new Map(all.map((p) => [p.managerEmail, p.managerName])).entries()).map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name)), [all]);
  const [picked, setPicked] = useState("");
  useEffect(() => {
    try {
      setPicked(sessionStorage.getItem(`${MGR_KEY}:${clientId}`) ?? "");
    } catch {}
  }, [clientId]);
  const pick = (email: string) => {
    setPicked(email);
    try {
      sessionStorage.setItem(`${MGR_KEY}:${clientId}`, email);
    } catch {}
  };
  const managerEmail = isAdvisor ? (managers.some((m) => m.email === picked) ? picked : managers[0]?.email ?? "") : me?.email?.toLowerCase() ?? "";
  const managerName = isAdvisor ? managers.find((m) => m.email === managerEmail)?.name ?? "" : me?.name ?? "";
  const team = teamFor(people, clientId, managerEmail);
  const logs = checkins.filter((l) => l.clientId === clientId && team.some((p) => p.id === l.personId));
  const cfg = config[clientId];
  return { isAdvisor, managers, managerEmail, managerName, pick, team, logs, cfg, me };
}

/** Top of every Hub page: the title and, for Ben, whose team he's looking at. */
export function HubHeader({ clientId, title, sub }: { clientId: string; title: string; sub?: string }) {
  const h = useHub(clientId);
  return (
    <div className="hub-head">
      <div className="grow" style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        {sub && <p className="muted" style={{ margin: "4px 0 0" }}>{sub}</p>}
      </div>
      {h.isAdvisor && h.managers.length > 0 && (
        <label className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Team of
          <select className="f" style={{ width: "auto", margin: 0, padding: "6px 8px" }} value={h.managerEmail} onChange={(e) => h.pick(e.target.value)}>
            {h.managers.map((m) => <option key={m.email} value={m.email}>{m.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

export const newLogId = () => `ck${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const PROMPTS: Record<TeamLog["kind"], string[]> = {
  checkin: ["How are things going?", "What's getting in your way?", "What do you need from me?", "What's one thing you want to get better at?"],
  recognition: ["What did they do?", "What difference did it make?", "How did you thank them?"],
};

/** Log a check-in or a recognition for one person. */
export function LogSheet({ clientId, person, kind, team, onClose, onSaved }: { clientId: string; person?: TeamMember; kind: TeamLog["kind"]; team: TeamMember[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const { patch, checkins, who, me, viewer } = useStore();
  const [pid, setPid] = useState(person?.id ?? team[0]?.id ?? "");
  const [k, setK] = useState(kind);
  const [date, setDate] = useState(isoDay(new Date()));
  const [notes, setNotes] = useState("");
  const [commits, setCommits] = useState("");
  const p = team.find((x) => x.id === pid);
  const first = p?.name.split(" ")[0] ?? "them";
  return (
    <Sheet title={k === "checkin" ? "Log a check-in" : "Recognize someone"} onClose={onClose}>
      <div className="seg" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 0 }}>
        <button className={k === "checkin" ? "on" : ""} onClick={() => setK("checkin")}>Check-in</button>
        <button className={k === "recognition" ? "on" : ""} onClick={() => setK("recognition")}>Recognition</button>
      </div>
      {!person && (
        <label className="f">Who
          <select className="f" value={pid} onChange={(e) => setPid(e.target.value)}>
            {team.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
      )}
      <label className="f">Date<input className="f" type="date" value={date} max={isoDay(new Date())} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="f">
        {k === "checkin" ? `Notes from your talk with ${first}` : `What did ${first} do?`}
        <textarea className="f" style={{ minHeight: 110 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={PROMPTS[k].join(" ")} />
      </label>
      {k === "checkin" && (
        <label className="f">Follow-ups <span className="tiny muted">(one per line, optional)</span>
          <textarea className="f" style={{ minHeight: 60 }} value={commits} onChange={(e) => setCommits(e.target.value)} placeholder={`e.g. Get ${first} on the forklift training list`} />
        </label>
      )}
      <p className="tiny muted" style={{ margin: "6px 0 0" }}>🔒 Only you and Ben can see this. Keep it factual: it&apos;s part of {first}&apos;s record.</p>
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button
          className="btn primary sm"
          disabled={!p || !notes.trim()}
          onClick={() => {
            if (!p) return;
            const commitments: Commitment[] = commits.split("\n").map((t) => t.trim()).filter(Boolean).map((text, i) => ({ id: `c${Date.now().toString(36)}${i}`, text, done: false }));
            const log: TeamLog = {
              id: newLogId(),
              clientId,
              personId: p.id,
              managerEmail: p.managerEmail.toLowerCase(),
              kind: k,
              date,
              notes: notes.trim(),
              commitments: k === "checkin" ? commitments : undefined,
              by: viewer?.kind === "advisor" ? "Ben Gaines" : me?.name ?? who,
              at: new Date().toISOString(),
            };
            patch({ checkins: [...checkins, log] });
            onSaved(k === "checkin" ? `Check-in with ${first} saved` : `Recognition for ${first} saved`);
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

export function personHref(clientId: string, id: string) {
  return `/c/${clientId}/hub/p/${id}`;
}

export function Initials({ name }: { name: string }) {
  const i = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return <span className="hub-avatar" aria-hidden="true">{i}</span>;
}

export function NoTeam({ clientId }: { clientId: string }) {
  const { viewer } = useStore();
  return (
    <div className="card section small muted">
      {viewer?.kind === "advisor" ? (
        <>No team roster yet. Upload one in <Link href={`/console/clients/${clientId}#team`} style={{ color: "var(--blue)" }}>client setup</Link>.</>
      ) : (
        "No one is listed as reporting to you yet. Ben will add your team."
      )}
    </div>
  );
}

export const isMine = (p: TeamMember, email?: string) => sameEmail(p.managerEmail, email);
