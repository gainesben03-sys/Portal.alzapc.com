"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CLIENTS } from "@/lib/data";
import { useStore } from "@/lib/store";
import { ThemeToggle } from "@/components/ui";

export default function Login() {
  const { setViewer, reset, config, patch, getClient } = useStore();
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [j, setJ] = useState({ name: "", role: "", email: "" });
  const [err, setErr] = useState("");

  const findCode = (c: string) => {
    const want = c.trim().toUpperCase();
    for (const [clientId, cfg] of Object.entries(config)) {
      const hit = cfg.codes.find((x) => x.code === want);
      if (hit) return { clientId, hit };
    }
    return null;
  };

  const join = () => {
    setErr("");
    const f = findCode(code);
    if (!f) return setErr("That code doesn't match an invite.");
    if (f.hit.usedBy) return setErr("That code has already been used. Ask for a new one.");
    if (new Date(f.hit.expires).getTime() < Date.now()) return setErr("That code has expired. Ask for a new one.");
    if (!j.name.trim() || !j.email.trim()) return setErr("Add your name and work email.");
    const cfg = config[f.clientId];
    if (cfg.users.some((u) => u.email.toLowerCase() === j.email.trim().toLowerCase())) return setErr("That email already has access. Sign in with it instead.");
    const user = { name: j.name.trim(), role: j.role.trim() || "Team member", email: j.email.trim(), access: f.hit.access, addedBy: `code ${f.hit.code}` };
    patch({
      config: {
        ...config,
        [f.clientId]: { ...cfg, users: [...cfg.users, user], codes: cfg.codes.map((x) => (x.code === f.hit.code ? { ...x, usedBy: user.email } : x)) },
      },
    });
    setViewer({ kind: "client", clientId: f.clientId, person: { name: user.name, role: user.role } });
    router.push(user.access === "hiring" ? `/c/${f.clientId}/recruiting` : `/c/${f.clientId}`);
  };
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const bp = CLIENTS[0];

  return (
    <main className="login">
      <div className="card">
        <div className="row" style={{ alignItems: "center" }}>
          <div className="wordmark">Alza<span className="hr">HR</span><span className="tag hide-sm">People Collective</span></div>
          <span className="login-theme"><ThemeToggle /></span>
        </div>
        <h1 style={{ marginTop: 18 }}>Client portal</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Sign in to see what's in motion, what needs your sign-off, and everything AlzaHR has shared with your team.
        </p>

        {sent ? (
          <div className="impact" style={{ marginTop: 18 }}>
            If <b>{email}</b> has access, a one-time sign-in link is on its way. It expires in 15 minutes.
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email) setSent(true);
            }}
          >
            <label className="f" htmlFor="email">Work email</label>
            <input
              id="email"
              className="f"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn gold block" style={{ marginTop: 12 }}>
              Email me a sign-in link
            </button>
          </form>
        )}

        {!joining ? (
          <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => setJoining(true)}>
            Have an invite code?
          </button>
        ) : (
          <div style={{ marginTop: 14 }}>
            <label className="f">Invite code</label>
            <input className="f code" style={{ fontSize: 18 }} maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" />
            {findCode(code) && !findCode(code)!.hit.usedBy && (
              <p className="tiny" style={{ marginTop: 6, color: "var(--green)" }}>Joining {getClient(findCode(code)!.clientId)?.name}</p>
            )}
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
              <input className="f" placeholder="Your name" value={j.name} onChange={(e) => setJ({ ...j, name: e.target.value })} />
              <input className="f" placeholder="Title" value={j.role} onChange={(e) => setJ({ ...j, role: e.target.value })} />
              <input className="f" type="email" placeholder="Work email" value={j.email} onChange={(e) => setJ({ ...j, email: e.target.value })} style={{ gridColumn: "1 / -1" }} />
            </div>
            {err && <p className="small" style={{ color: "var(--red)", marginTop: 8 }}>{err}</p>}
            <button className="btn primary block" style={{ marginTop: 10 }} onClick={join}>Join</button>
          </div>
        )}

        <div className="divider">prototype shortcuts</div>

        <button
          className="btn block"
          onClick={() => {
            setViewer({ kind: "client", clientId: bp.id, person: bp.contacts[0] });
            router.push(`/c/${bp.id}`);
          }}
        >
          View as Blueprint CEO
        </button>
        <button
          className="btn block"
          style={{ marginTop: 8 }}
          onClick={() => {
            setViewer({ kind: "advisor" });
            router.push("/console");
          }}
        >
          View as Ben (AlzaHR console)
        </button>
        <button className="btn ghost block tiny" style={{ marginTop: 8 }} onClick={reset}>
          Reset demo data
        </button>
        <p className="demo-note">Prototype with fictional sample data. Nothing here is sent or stored outside this browser.</p>
      </div>
    </main>
  );
}
