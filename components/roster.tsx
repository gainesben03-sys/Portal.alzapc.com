"use client";

import { useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { sendInvite } from "@/lib/invite";
import { PortalUser } from "@/lib/modules";
import { parseRoster, ROSTER_TEMPLATE, rowsToTeam, sameEmail, TeamMember, tenure } from "@/lib/team";
import { Sheet } from "./ui";

const mdLabel = (md?: string) => {
  if (!md) return "";
  const [m, d] = md.split("-").map(Number);
  return new Date(2000, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const newPersonId = () => `pp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Client setup: the team roster that powers the Manager Hub (reminders, check-ins, recognition). */
export function RosterCard({ clientId, onToast }: { clientId: string; onToast: (m: string) => void }) {
  const { people, config, patch } = useStore();
  const cfg = config[clientId];
  const team = useMemo(() => people.filter((p) => p.clientId === clientId).sort((a, b) => a.managerName.localeCompare(b.managerName) || a.name.localeCompare(b.name)), [people, clientId]);
  const [preview, setPreview] = useState<ReturnType<typeof rowsToTeam> | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [paste, setPaste] = useState<string | null>(null);
  const [edit, setEdit] = useState<TeamMember | null>(null);
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!cfg) return null;
  const users = cfg.users;

  // managers named on the roster, and whether they can sign in yet
  const managers = Array.from(new Map(team.filter((p) => p.managerEmail).map((p) => [p.managerEmail, p.managerName])).entries()).map(([email, name]) => ({
    email,
    name,
    count: team.filter((p) => p.managerEmail === email && p.active).length,
    user: users.find((u) => sameEmail(u.email, email)),
  }));
  const notOnPortal = managers.filter((m) => !m.user);

  const read = (text: string) => {
    const { rows, headers } = parseRoster(text);
    if (!rows.length) return onToast("Couldn't find any rows. Use the template's column names, one person per row.");
    setPreview(rowsToTeam(rows, headers, clientId, users));
  };

  const doImport = () => {
    if (!preview) return;
    const incoming = preview.people;
    let next: TeamMember[];
    if (mode === "replace") next = incoming;
    else {
      next = [...team];
      for (const p of incoming) {
        const i = next.findIndex((x) => (p.email && sameEmail(x.email, p.email)) || x.name.trim().toLowerCase() === p.name.trim().toLowerCase());
        if (i >= 0) next[i] = { ...next[i], ...Object.fromEntries(Object.entries(p).filter(([k, v]) => v !== undefined && v !== "" && k !== "id")), id: next[i].id } as TeamMember;
        else next.push(p);
      }
    }
    patch({ people: [...people.filter((p) => p.clientId !== clientId), ...next] });
    setPreview(null);
    setPaste(null);
    onToast(`${incoming.length} ${incoming.length === 1 ? "person" : "people"} ${mode === "replace" ? "loaded" : "added or updated"}`);
  };

  const invite = async (m: { email: string; name: string }) => {
    const u: PortalUser = { name: m.name || m.email.split("@")[0], role: "Manager", email: m.email.toLowerCase(), access: "manager", invited: true };
    patch({ config: { ...config, [clientId]: { ...cfg, users: [...cfg.users, u] } } });
    return sendInvite(clientId, u.email, u.name);
  };

  const download = () => {
    const blob = new Blob([ROSTER_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "team-roster-template.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const shown = team.filter((p) => !q || `${p.name} ${p.title} ${p.managerName} ${p.department ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div className="grow small">
          {team.length ? <><b>{team.filter((p) => p.active).length} people</b> · {managers.length} manager{managers.length === 1 ? "" : "s"}</> : <span className="muted">No roster yet.</span>}
        </div>
        <button className="btn sm" onClick={() => fileRef.current?.click()}>Upload roster</button>
        <button className="btn ghost sm" onClick={() => setPaste("")}>Paste</button>
        <button className="btn ghost sm" onClick={() => setEdit({ id: "", clientId, name: "", title: "", managerEmail: "", managerName: "", active: true })}>Add a person</button>
      </div>
      <p className="tiny muted" style={{ margin: "8px 0 0" }}>
        A CSV export from payroll works (save Excel as CSV). Columns: Name, Title, Email, Manager Email (or Manager), Hire Date, Birthday. Birthdays keep the month and day only.{" "}
        <button className="linklike tiny" onClick={download}>Download a template</button>
      </p>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept=".csv,.txt,text/csv"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (/\.xlsx?$/i.test(f.name)) return onToast("Save the spreadsheet as CSV first (File, Save As, CSV), then upload that.");
          read(await f.text());
        }}
      />

      {notOnPortal.length > 0 && (
        <div className="for-ben" style={{ marginTop: 12 }}>
          <b>Managers not on the portal yet</b>
          <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
            {notOnPortal.map((m) => (
              <div key={m.email} className="row" style={{ alignItems: "center", gap: 8 }}>
                <span className="grow small">{m.name} <span className="muted">· {m.email} · {m.count} on their team</span></span>
                <button className="btn sm" onClick={async () => onToast(await invite(m))}>Invite</button>
              </div>
            ))}
          </div>
          {notOnPortal.length > 1 && (
            <button
              className="btn primary sm"
              style={{ marginTop: 8 }}
              onClick={async () => {
                const u: PortalUser[] = notOnPortal.map((m) => ({ name: m.name || m.email.split("@")[0], role: "Manager", email: m.email.toLowerCase(), access: "manager", invited: true }));
                patch({ config: { ...config, [clientId]: { ...cfg, users: [...cfg.users, ...u] } } });
                for (const x of u) await sendInvite(clientId, x.email, x.name);
                onToast(`Invited ${u.length} managers. They get a welcome email and their Manager Hub.`);
              }}
            >
              Invite all {notOnPortal.length}
            </button>
          )}
          <div className="tiny muted" style={{ marginTop: 6 }}>They get the sign-in email, and the portal opens to their Manager Hub with their team.</div>
        </div>
      )}

      {team.length > 0 && (
        <>
          {managers.length > 0 && (
            <div className="chips" style={{ marginTop: 12 }}>
              {managers.map((m) => (
                <span key={m.email} className="chip">{m.name}: {m.count}{m.user ? "" : " (not invited)"}</span>
              ))}
            </div>
          )}
          {team.length > 8 && <input className="f" style={{ marginTop: 10 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" />}
          <div className="roster-list">
            {(showAll || q ? shown : shown.slice(0, 8)).map((p) => (
              <button key={p.id} className="roster-row" onClick={() => setEdit(p)}>
                <span className="grow" style={{ minWidth: 0, textAlign: "left" }}>
                  <b className="small">{p.name}</b>{!p.active && <span className="tiny muted"> (inactive)</span>}
                  <span className="tiny muted" style={{ display: "block" }}>{[p.title, p.managerName && `reports to ${p.managerName}`].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="tiny muted" style={{ textAlign: "right", flex: "none" }}>
                  {p.hireDate ? tenure(p.hireDate) : "No hire date"}
                  <span style={{ display: "block" }}>{p.birthday ? `🎂 ${mdLabel(p.birthday)}` : ""}</span>
                </span>
              </button>
            ))}
          </div>
          {!q && shown.length > 8 && <button className="linklike tiny" style={{ marginTop: 6 }} onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${shown.length}`}</button>}
        </>
      )}

      {paste !== null && !preview && (
        <Sheet title="Paste the roster" onClose={() => setPaste(null)}>
          <p className="small muted" style={{ marginTop: 0 }}>Copy the rows from Excel or Google Sheets, including the header row, and paste here.</p>
          <textarea className="f" style={{ minHeight: 180, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={ROSTER_TEMPLATE} />
          <div className="sheet-actions">
            <button className="btn ghost sm" onClick={() => setPaste(null)}>Cancel</button>
            <button className="btn primary sm" disabled={!paste.trim()} onClick={() => read(paste)}>Preview</button>
          </div>
        </Sheet>
      )}

      {preview && (
        <Sheet title={`${preview.people.length} people found`} onClose={() => setPreview(null)}>
          {preview.missing.length > 0 && (
            <p className="small" style={{ color: "var(--amber)", marginTop: 0 }}>
              No {preview.missing.map((m) => ({ name: "name", title: "title", hire: "hire date", birthday: "birthday" })[m]).join(", ")} column found. You can still import and add those later.
            </p>
          )}
          <div className="roster-preview">
            <table>
              <thead><tr><th>Name</th><th>Title</th><th>Manager</th><th>Hired</th><th>Birthday</th></tr></thead>
              <tbody>
                {preview.people.slice(0, 60).map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.title}</td>
                    <td>{p.managerName || p.managerEmail || <span style={{ color: "var(--red)" }}>missing</span>}</td>
                    <td>{p.hireDate ?? ""}</td>
                    <td>{mdLabel(p.birthday)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.people.length > 60 && <p className="tiny muted">Plus {preview.people.length - 60} more.</p>}
          </div>
          {preview.problems.length > 0 && (
            <div className="for-ben">
              <b>Check these</b>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{preview.problems.slice(0, 8).map((x, i) => <li key={i} className="small">{x}</li>)}</ul>
              {preview.problems.length > 8 && <div className="tiny muted">Plus {preview.problems.length - 8} more.</div>}
            </div>
          )}
          {team.length > 0 && (
            <div className="seg" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <button className={mode === "merge" ? "on" : ""} onClick={() => setMode("merge")}>Add and update</button>
              <button className={mode === "replace" ? "on" : ""} onClick={() => setMode("replace")}>Replace everyone</button>
            </div>
          )}
          {team.length > 0 && <p className="tiny muted">{mode === "merge" ? "Matches people by email (or name) and updates them; adds anyone new; leaves everyone else." : "Replaces the whole roster with this file. Check-in notes stay with Ben."}</p>}
          <div className="sheet-actions">
            <button className="btn ghost sm" onClick={() => setPreview(null)}>Cancel</button>
            <button className="btn primary sm" disabled={!preview.people.length} onClick={doImport}>Import {preview.people.length}</button>
          </div>
        </Sheet>
      )}

      {edit && <PersonSheet p={edit} users={users} onClose={() => setEdit(null)} onSave={(p) => {
        const exists = people.some((x) => x.id === p.id);
        patch({ people: exists ? people.map((x) => (x.id === p.id ? p : x)) : [...people, { ...p, id: newPersonId() }] });
        setEdit(null);
        onToast(exists ? "Saved" : `${p.name} added`);
      }} onRemove={people.some((x) => x.id === edit.id) ? () => {
        patch({ people: people.filter((x) => x.id !== edit.id) });
        setEdit(null);
        onToast(`${edit.name} removed`);
      } : undefined} />}
    </div>
  );
}

function PersonSheet({ p, users, onClose, onSave, onRemove }: { p: TeamMember; users: PortalUser[]; onClose: () => void; onSave: (p: TeamMember) => void; onRemove?: () => void }) {
  const [v, setV] = useState<TeamMember>(p);
  const [bm, setBm] = useState(p.birthday ? Number(p.birthday.slice(0, 2)) : 0);
  const [bd, setBd] = useState(p.birthday ? Number(p.birthday.slice(3)) : 0);
  const [confirm, setConfirm] = useState(false);
  const set = (k: keyof TeamMember, val: unknown) => setV({ ...v, [k]: val });
  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString("en-US", { month: "long" }));
  return (
    <Sheet title={p.id ? `Edit ${p.name}` : "Add a person"} onClose={onClose}>
      <div className="hire-form">
        <fieldset>
          <label className="f">Name<input className="f" value={v.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label className="f">Title<input className="f" value={v.title} onChange={(e) => set("title", e.target.value)} /></label>
          <label className="f">Work email <span className="tiny muted">(optional)</span><input className="f" type="email" value={v.email ?? ""} onChange={(e) => set("email", e.target.value.toLowerCase() || undefined)} /></label>
          <label className="f">Manager
            <select
              className="f"
              value={users.find((u) => sameEmail(u.email, v.managerEmail))?.email ?? (v.managerEmail ? "__other" : "")}
              onChange={(e) => {
                const u = users.find((x) => x.email === e.target.value);
                setV({ ...v, managerEmail: u?.email.toLowerCase() ?? "", managerName: u?.name ?? "" });
              }}
            >
              <option value="">Choose...</option>
              {users.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
              {v.managerEmail && !users.some((u) => sameEmail(u.email, v.managerEmail)) && <option value="__other">{v.managerName || v.managerEmail} (not on the portal)</option>}
            </select>
          </label>
          <label className="f">Hire date<input className="f" type="date" value={v.hireDate ?? ""} onChange={(e) => set("hireDate", e.target.value || undefined)} /></label>
          <div className="f">
            <span className="flabel">Birthday <span className="tiny muted">(month and day only)</span></span>
            <div style={{ display: "flex", gap: 8 }}>
              <select className="f" value={bm} onChange={(e) => { const m = Number(e.target.value); setBm(m); set("birthday", m && bd ? `${String(m).padStart(2, "0")}-${String(bd).padStart(2, "0")}` : undefined); }}>
                <option value={0}>Month</option>
                {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select className="f" value={bd} onChange={(e) => { const d = Number(e.target.value); setBd(d); set("birthday", bm && d ? `${String(bm).padStart(2, "0")}-${String(d).padStart(2, "0")}` : undefined); }}>
                <option value={0}>Day</option>
                {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
            </div>
          </div>
          <label className="f">Department <span className="tiny muted">(optional)</span><input className="f" value={v.department ?? ""} onChange={(e) => set("department", e.target.value || undefined)} /></label>
          <label className="f">Location <span className="tiny muted">(optional)</span><input className="f" value={v.location ?? ""} onChange={(e) => set("location", e.target.value || undefined)} /></label>
        </fieldset>
      </div>
      {p.id && (
        <label className="rule" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={!v.active} onChange={(e) => set("active", !e.target.checked)} />
          <div><b className="small">No longer with the company</b><div className="tiny muted">Hides them from the Manager Hub and reminders. Their check-in history stays.</div></div>
        </label>
      )}
      <div className="sheet-actions" style={{ justifyContent: "space-between" }}>
        {onRemove ? (
          confirm ? <button className="btn sm" style={{ background: "var(--red)", color: "#fff", borderColor: "var(--red)" }} onClick={onRemove}>Remove for good</button> : <button className="btn ghost sm" style={{ color: "var(--red)" }} onClick={() => setConfirm(true)}>Remove</button>
        ) : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost sm" onClick={onClose}>Cancel</button>
          <button className="btn primary sm" disabled={!v.name.trim() || !v.managerEmail} onClick={() => onSave({ ...v, name: v.name.trim(), title: v.title.trim() })}>Save</button>
        </div>
      </div>
    </Sheet>
  );
}
