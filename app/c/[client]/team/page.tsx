"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { fmt } from "@/lib/data";
import { Access, ACCESS_LABEL, canSee, newCode, PortalUser } from "@/lib/modules";
import { useStore } from "@/lib/store";
import { sendInvite } from "@/lib/invite";

export default function Team() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, config, patch, me, who } = useStore();
  const client = getClient(clientId);
  const cfg = config[clientId];
  const [nu, setNu] = useState<PortalUser>({ name: "", role: "", email: "", access: "manager" });
  const [codeAccess, setCodeAccess] = useState<Access>("manager");
  const toast = useToast();

  if (!ok || !client || !cfg) return null;
  if (!canSee(me?.access, "team"))
    return (
      <div>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">Only executives can manage who has access.</div></main>
      </div>
    );

  const save = (p: Partial<typeof cfg>) => patch({ config: { ...config, [clientId]: { ...cfg, ...p } } });
  const now = Date.now();
  const liveCodes = cfg.codes.filter((c) => !c.usedBy && new Date(c.expires).getTime() > now);

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <h1>Team access</h1>
        <p className="muted" style={{ marginTop: 6 }}>Choose who from {client.name} can use the portal and what they see.</p>

        <div className="section-head section"><h2>People</h2></div>
        <div className="card">
          {cfg.users.map((u) => (
            <div className="row" key={u.email} style={{ flexWrap: "wrap" }}>
              <div className="grow" style={{ minWidth: 150 }}>
                <div className="title">
                  {u.name} {u.invited && <span className="pill soon" style={{ marginLeft: 4 }}>Invited</span>}
                </div>
                <div className="tiny muted">{u.role} · {u.email}</div>
              </div>
              <select
                className="f"
                style={{ width: "auto", padding: "6px 8px", fontSize: 13 }}
                value={u.access}
                disabled={u.name === me?.name}
                onChange={(e) => save({ users: cfg.users.map((x) => (x.email === u.email ? { ...x, access: e.target.value as Access } : x)) })}
              >
                {(Object.keys(ACCESS_LABEL) as Access[]).map((a) => <option key={a} value={a}>{ACCESS_LABEL[a]}</option>)}
              </select>
              {u.name !== me?.name && (
                <button
                  className="btn ghost sm"
                  style={{ color: "var(--red)" }}
                  onClick={() => {
                    save({ users: cfg.users.filter((x) => x.email !== u.email), escalationEmail: cfg.escalationEmail === u.email ? cfg.users[0].email : cfg.escalationEmail });
                    toast.show(`${u.name}'s access removed`);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="section-head section"><h2>Invite by email</h2></div>
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            const email = nu.email.trim();
            if (!nu.name.trim() || !email) return;
            if (cfg.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) return toast.show("That email already has access");
            const lower = email.toLowerCase();
            save({ users: [...cfg.users, { ...nu, email: lower, name: nu.name.trim(), role: nu.role.trim() || "Team member", invited: true, addedBy: who }], huddle: { ...cfg.huddle, recipients: [...cfg.huddle.recipients, lower] } });
            setNu({ name: "", role: "", email: "", access: "manager" });
            sendInvite(client.id, lower, nu.name.trim()).then(toast.show);
          }}
        >
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <input className="f" placeholder="Name" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
            <input className="f" placeholder="Title" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })} />
            <input className="f" type="email" placeholder="Work email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} style={{ gridColumn: "1 / -1" }} />
            <select className="f" value={nu.access} onChange={(e) => setNu({ ...nu, access: e.target.value as Access })} style={{ gridColumn: "1 / -1" }}>
              {(Object.keys(ACCESS_LABEL) as Access[]).map((a) => <option key={a} value={a}>{ACCESS_LABEL[a]}</option>)}
            </select>
          </div>
          <button className="btn primary block" style={{ marginTop: 10 }} disabled={!nu.name.trim() || !nu.email.trim()}>Send invite</button>
        </form>

        <div className="section-head section"><h2>Invite with a code</h2></div>
        <div className="card">
          <p className="small muted">Good for a group. Each code works once and expires in 7 days.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <select className="f" value={codeAccess} onChange={(e) => setCodeAccess(e.target.value as Access)}>
              {(Object.keys(ACCESS_LABEL) as Access[]).map((a) => <option key={a} value={a}>{ACCESS_LABEL[a]}</option>)}
            </select>
            <button
              className="btn primary"
              style={{ whiteSpace: "nowrap" }}
              onClick={() => {
                const code = newCode();
                save({ codes: [{ code, access: codeAccess, expires: new Date(now + 7 * 86400000).toISOString(), createdBy: who }, ...cfg.codes] });
                toast.show(`Code ${code} created`);
              }}
            >
              New code
            </button>
          </div>
          {liveCodes.map((c) => (
            <div className="row" key={c.code}>
              <div className="grow">
                <div className="code">{c.code}</div>
                <div className="tiny muted">{ACCESS_LABEL[c.access]} · expires {fmt(c.expires)}</div>
              </div>
              <button
                className="btn sm"
                onClick={() => {
                  const msg = `You're invited to the ${client.name} portal. Go to portal.alzapc.com, tap "Have an invite code?" and enter ${c.code}`;
                  navigator.clipboard?.writeText(msg).then(() => toast.show("Invite message copied"), () => toast.show(c.code));
                }}
              >
                Copy invite
              </button>
              <button className="btn ghost sm" style={{ color: "var(--red)" }} onClick={() => save({ codes: cfg.codes.filter((x) => x.code !== c.code) })}>
                Revoke
              </button>
            </div>
          ))}
          <p className="tiny muted" style={{ marginTop: 12 }}>Anyone joining with a code confirms their email before getting in.</p>
        </div>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}
