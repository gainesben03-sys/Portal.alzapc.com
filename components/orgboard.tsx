"use client";

// Organize teams: drag people between managers (or departments). Nothing changes until Save.
import { useEffect, useMemo, useRef, useState } from "react";
import { leadsTeam, sameEmail, TeamMember } from "@/lib/team";

type Col = { key: string; title: string; sub?: string; email?: string; locked?: string };
const NONE = "__none";
const NEW = "__new";

export function OrgBoard({ team, onSave, onClose }: { team: TeamMember[]; onSave: (changed: TeamMember[]) => Promise<boolean>; onClose: () => void }) {
  const base = useMemo(() => team.filter((p) => p.active), [team]);
  const [list, setList] = useState<TeamMember[]>(base);
  const [by, setBy] = useState<"manager" | "dept">("manager");
  const [over, setOver] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [newDept, setNewDept] = useState<string[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // pointer dragging (works the same in Chrome, Safari, Edge and Firefox)
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; name: string; title: string } | null>(null);
  const press = useRef<{ id: string; x: number; y: number; dx: number; dy: number; w: number; on: boolean } | null>(null);
  const moveRef = useRef<(id: string, key: string) => void>(() => {});

  const changed = list.filter((p) => {
    const o = base.find((x) => x.id === p.id)!;
    return o.managerEmail !== p.managerEmail || (o.department ?? "") !== (p.department ?? "") || !!o.isManager !== !!p.isManager;
  });

  // columns
  const cols: Col[] = useMemo(() => {
    if (by === "dept") {
      const ds = [...new Set([...list.map((p) => p.department).filter(Boolean) as string[], ...newDept])].sort((a, b) => a.localeCompare(b));
      return [{ key: NONE, title: "No department" }, ...ds.map((d) => ({ key: `d:${d}`, title: d }))];
    }
    const leads = list.filter((p) => leadsTeam(p, list)).sort((a, b) => a.name.localeCompare(b.name));
    const onRoster = new Set(list.map((p) => p.email?.toLowerCase()).filter(Boolean));
    // managers who aren't on the roster themselves (an owner, someone outside the file)
    const outside = [...new Map(list.filter((p) => p.managerEmail && !onRoster.has(p.managerEmail)).map((p) => [p.managerEmail, p.managerName || p.managerEmail])).entries()];
    return [
      { key: NONE, title: "Unassigned", sub: "No manager. Owners can stay here." },
      ...leads.map((p) => ({ key: `m:${p.id}`, title: p.name, sub: [p.title, p.email].filter(Boolean).join(" · "), email: p.email, locked: p.email ? undefined : "Add a work email to give them a team" })),
      ...outside.map(([e, n]) => {
        // same name as someone on the roster, different email: almost always the same person
        const twin = list.find((p) => p.email && p.name.trim().toLowerCase() === String(n).trim().toLowerCase());
        return { key: `x:${e}`, title: n, sub: `Not on the roster · ${e}`, email: e, locked: twin ? `${twin.name} is on the roster as ${twin.email}. Drag these people to that column, or use the same email for both.` : undefined };
      }),
    ];
  }, [by, list, newDept]);

  const colOf = (p: TeamMember) => {
    if (by === "dept") return p.department ? `d:${p.department}` : NONE;
    if (!p.managerEmail) return NONE;
    const lead = list.find((x) => x.email && sameEmail(x.email, p.managerEmail) && leadsTeam(x, list));
    return lead ? `m:${lead.id}` : `x:${p.managerEmail}`;
  };

  const move = (id: string, key: string) => {
    setMsg("");
    const p = list.find((x) => x.id === id);
    if (!p) return;
    const put = (n: Partial<TeamMember>) => setList((l) => l.map((x) => (x.id === id ? { ...x, ...n } : x)));
    if (key === NEW) {
      if (!p.email) return setMsg(`${p.name} needs a work email before they can have a team.`);
      return put({ isManager: true });
    }
    if (by === "dept") return put({ department: key === NONE ? undefined : key.slice(2) });
    if (key === NONE) return put({ managerEmail: "", managerName: "" });
    const c = cols.find((x) => x.key === key);
    if (!c?.email) return setMsg(c?.locked ?? "That team needs a manager with a work email.");
    if (p.email && sameEmail(p.email, c.email)) return setMsg(p.id === c.key.slice(2) ? "" : `${p.name} and ${c.title} have the same email, so they look like one person. Give each a different email.`);
    // no loops: someone can't report to a person on their own team
    let up = c.email, guard = 0;
    while (up && guard++ < 50) {
      if (p.email && sameEmail(up, p.email)) return setMsg(`${c.title} reports up to ${p.name}, so that would make a loop.`);
      up = list.find((x) => x.email && sameEmail(x.email, up))?.managerEmail ?? "";
    }
    put({ managerEmail: c.email.toLowerCase(), managerName: c.title });
  };

  const save = async () => {
    setBusy(true);
    const ok = await onSave(changed);
    setBusy(false);
    if (ok) onClose();
    else setMsg("Couldn't save. Try again.");
  };

  moveRef.current = move;
  const colAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-col]") as HTMLElement | null)?.dataset.col ?? null;
  useEffect(() => {
    const mv = (e: PointerEvent) => {
      const s = press.current;
      if (!s) return;
      if (!s.on) {
        if (Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) < 6) return;
        s.on = true;
        setDrag(s.id);
        document.body.classList.add("org-dragging");
      }
      const p = list.find((x) => x.id === s.id);
      setGhost({ x: e.clientX - s.dx, y: e.clientY - s.dy, w: s.w, name: p?.name ?? "", title: p?.title ?? "" });
      setOver(colAt(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      const s = press.current;
      press.current = null;
      document.body.classList.remove("org-dragging");
      if (!s?.on) return;
      const key = colAt(e.clientX, e.clientY);
      setGhost(null);
      setOver(null);
      setDrag(null);
      if (key) moveRef.current(s.id, key);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, [list]);

  const card = (p: TeamMember) => {
    const lead = leadsTeam(p, list);
    const moved = changed.some((x) => x.id === p.id);
    return (
      <div key={p.id} className={`org-card${drag === p.id ? " dragging" : ""}${moved ? " moved" : ""}`}
        onPointerDown={(e) => {
          // mouse and pen drag; on a touch screen, use Move so the columns still scroll
          if (e.pointerType === "touch" || e.button !== 0 || (e.target as HTMLElement).closest("select")) return;
          const r = e.currentTarget.getBoundingClientRect();
          press.current = { id: p.id, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, on: false };
          e.preventDefault();
        }}>
        <span className="org-who">
          <b>{p.name}</b>
          <span>{p.title || "No title"}</span>
        </span>
        {lead && by === "manager" && <span className="org-tag">Manager</span>}
        <select className="org-move" aria-label={`Move ${p.name}`} value="" onChange={(e) => e.target.value && move(p.id, e.target.value)}>
          <option value="">Move…</option>
          {cols.filter((c) => c.key !== colOf(p)).map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
          {by === "manager" && !lead && <option value={NEW}>Make a manager</option>}
        </select>
      </div>
    );
  };

  const drop = (key: string) => ({ "data-col": key });

  return (
    <div className="org-overlay" role="dialog" aria-label="Organize teams">
      <div className="org-head">
        <div>
          <b className="org-title">Organize teams</b>
          <p className="small muted">Drag people where they belong{typeof window !== "undefined" && "ontouchstart" in window ? ", or tap Move" : ""}. Nothing changes until you save.</p>
        </div>
        <div className="dc-seg">
          <button className={by === "manager" ? "on" : ""} onClick={() => setBy("manager")}>By manager</button>
          <button className={by === "dept" ? "on" : ""} onClick={() => setBy("dept")}>By department</button>
        </div>
      </div>

      <div className="org-cols">
        {cols.map((c) => {
          const people = list.filter((p) => colOf(p) === c.key).sort((a, b) => a.name.localeCompare(b.name));
          return (
            <section key={c.key} className={`org-col${over === c.key ? " over" : ""}${c.key === NONE ? " none" : ""}`} {...drop(c.key)}>
              <header>
                <b>{c.title}</b>
                <span className="org-count">{people.length}</span>
                {c.sub && <span className="org-sub">{c.sub}</span>}
                {c.locked && <span className="org-sub warn">{c.locked}</span>}
              </header>
              <div className="org-list">
                {people.map(card)}
                {!people.length && <p className="org-empty">Drop people here</p>}
              </div>
            </section>
          );
        })}
        {by === "manager" ? (
          <section className={`org-col add${over === NEW ? " over" : ""}`} {...drop(NEW)}>
            <header><b>+ New team</b></header>
            <p className="org-empty">Drop someone here to make them a manager.</p>
          </section>
        ) : (
          <section className="org-col add">
            {adding === null ? (
              <button className="org-add" onClick={() => setAdding("")}>+ Department</button>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); const d = adding.trim(); if (d) setNewDept((x) => [...x, d]); setAdding(null); }}>
                <input className="f" autoFocus placeholder="Department name" value={adding} onChange={(e) => setAdding(e.target.value)} onBlur={() => { const d = adding.trim(); if (d) setNewDept((x) => [...x, d]); setAdding(null); }} />
              </form>
            )}
          </section>
        )}
      </div>

      {ghost && (
        <div className="org-card org-ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.w }} aria-hidden="true">
          <span className="org-who"><b>{ghost.name}</b><span>{ghost.title || "No title"}</span></span>
        </div>
      )}

      <div className="org-bar">
        <span className="small">
          {msg ? <span className="warn">{msg}</span> : changed.length ? <><b>{changed.length} change{changed.length === 1 ? "" : "s"}</b> <span className="muted">· Open reviews follow the new manager.</span></> : <span className="muted">No changes yet.</span>}
        </span>
        <span style={{ flex: 1 }} />
        <button className="btn ghost sm" onClick={onClose}>{changed.length ? "Discard" : "Close"}</button>
        <button className="btn primary sm" disabled={!changed.length || busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</button>
      </div>
    </div>
  );
}
