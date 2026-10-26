"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CLIENTS } from "@/lib/data";
import { PENDING_INVITE, useStore } from "@/lib/store";
import { LIVE, sb } from "@/lib/supabase";
import { ThemeToggle } from "@/components/ui";
import { WorkWithUs } from "@/components/workwithus";

export default function Login() {
  const { setViewer, reset, config, patch, getClient, viewer, ready, me, noAccess, signOut } = useStore();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [j, setJ] = useState({ name: "", role: "", email: "" });
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Live mode: once signed in, go straight to the right place.
  useEffect(() => {
    if (!LIVE || !ready || !viewer) return;
    if (viewer.kind === "advisor") router.replace("/console");
    else router.replace(me?.access === "hiring" ? `/c/${viewer.clientId}/recruiting` : `/c/${viewer.clientId}`);
  }, [ready, viewer, me, router]);

  // The server decides who gets a link; the reply is the same either way.
  const sendLink = async (to: string, inviteCode?: string) => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: to.trim(), code: inviteCode }) });
      const j = await r.json();
      setBusy(false);
      if (!j.ok) {
        setErr(j.reason === "rate" ? "Too many sign-in emails just now. Wait a minute and try again." : j.reason === "code" ? "That invite code isn't valid or has expired. Ask for a new one." : j.reason === "email" ? "Check the email address." : "Something went wrong. Try again.");
        return false;
      }
    } catch {
      setBusy(false);
      setErr("Couldn't connect. Check your internet and try again.");
      return false;
    }
    setSent(to.trim());
    return true;
  };

  // ---------------- demo-only helpers
  const findCode = (c: string) => {
    const want = c.trim().toUpperCase();
    for (const [clientId, cfg] of Object.entries(config)) {
      const hit = cfg.codes.find((x) => x.code === want);
      if (hit) return { clientId, hit };
    }
    return null;
  };

  const join = async () => {
    setErr("");
    if (LIVE && noAccess) {
      // Already signed in: redeem straight away.
      if (!code.trim() || !j.name.trim()) return setErr("Add the code and your name.");
      setBusy(true);
      const { error } = await sb().rpc("redeem_invite", { p_code: code.trim().toUpperCase(), p_name: j.name.trim(), p_role: j.role.trim() });
      setBusy(false);
      if (error) return setErr(error.message.replace(/^.*?: /, ""));
      window.location.reload();
      return;
    }
    if (!code.trim() || !j.name.trim() || !j.email.trim()) return setErr("Add the code, your name and your work email.");
    if (LIVE) {
      // Verify the email first; the code is redeemed right after they click the link.
      try {
        localStorage.setItem(PENDING_INVITE, JSON.stringify({ code: code.trim().toUpperCase(), name: j.name.trim(), role: j.role.trim() }));
      } catch {}
      await sendLink(j.email, code.trim().toUpperCase());
      return;
    }
    const f = findCode(code);
    if (!f) return setErr("That code doesn't match an invite.");
    if (f.hit.usedBy) return setErr("That code has already been used. Ask for a new one.");
    if (new Date(f.hit.expires).getTime() < Date.now()) return setErr("That code has expired. Ask for a new one.");
    const cfg = config[f.clientId];
    if (cfg.users.some((u) => u.email.toLowerCase() === j.email.trim().toLowerCase())) return setErr("That email already has access. Sign in with it instead.");
    const user = { name: j.name.trim(), role: j.role.trim() || "Team member", email: j.email.trim(), access: f.hit.access, addedBy: `code ${f.hit.code}` };
    patch({
      config: {
        ...config,
        [f.clientId]: { ...cfg, users: [...cfg.users, user], codes: cfg.codes.map((x) => (x.code === f.hit.code ? { ...x, usedBy: user.email } : x)) },
      },
    });
    setViewer({ kind: "client", clientId: f.clientId, person: { name: user.name, role: user.role, email: user.email } });
    router.push(user.access === "hiring" ? `/c/${f.clientId}/recruiting` : `/c/${f.clientId}`);
  };

  const bp = CLIENTS[0];

  if (LIVE && !ready) return <main className="login"><p className="muted">Loading...</p></main>;

  return (
    <main className="login">
      <div className="card">
        <div className="row" style={{ alignItems: "center" }}>
          <div className="wordmark">Alza<span className="hr">HR</span><span className="tag hide-sm">People Collective</span></div>
          <span className="login-theme"><ThemeToggle /></span>
        </div>
        <h1 style={{ marginTop: 18 }}>Client portal</h1>

        {LIVE && noAccess ? (
          <>
            <p className="muted" style={{ marginTop: 6 }}>
              You're signed in as <b>{noAccess}</b>, but this email isn't on a team yet. Ask Ben or your company's admin for an invite, or join with an invite code.
            </p>
            <button className="btn block" style={{ marginTop: 14 }} onClick={() => setJoining(true)}>I have an invite code</button>
            <button className="btn ghost block" style={{ marginTop: 6 }} onClick={() => signOut()}>Use a different email</button>
            <WorkWithUs compact />
          </>
        ) : (
          <p className="muted" style={{ marginTop: 6 }}>
            Sign in to see what's in motion, what needs your sign-off, and everything AlzaHR has shared with your team.
          </p>
        )}

        {sent ? (
          <div className="impact" style={{ marginTop: 18 }}>
            If <b>{sent}</b> has access to a portal, a sign-in link is on its way. Open it on this device or any other. It works once and expires soon. Nothing after a few minutes? Check spam, or ask Ben to confirm your email is on your team.
            <div style={{ marginTop: 8 }}>
              <button className="btn ghost sm" onClick={() => setSent(null)}>Use a different email</button>
            </div>
          </div>
        ) : (
          !noAccess && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!email.trim()) return;
                if (LIVE) await sendLink(email);
                else setSent(email);
              }}
            >
              <label className="f" htmlFor="email">Work email</label>
              <input id="email" className="f" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn gold block" style={{ marginTop: 12 }} disabled={busy}>
                {busy ? "Sending..." : "Email me a sign-in link"}
              </button>
            </form>
          )
        )}

        {!sent && (
          !joining ? (
            !noAccess && (
              <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => setJoining(true)}>
                Have an invite code?
              </button>
            )
          ) : (
            <div style={{ marginTop: 14 }}>
              <label className="f">Invite code</label>
              <input className="f code" style={{ fontSize: 18 }} maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" />
              {!LIVE && findCode(code) && !findCode(code)!.hit.usedBy && (
                <p className="tiny" style={{ marginTop: 6, color: "var(--green)" }}>Joining {getClient(findCode(code)!.clientId)?.name}</p>
              )}
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
                <input className="f" placeholder="Your name" value={j.name} onChange={(e) => setJ({ ...j, name: e.target.value })} />
                <input className="f" placeholder="Title" value={j.role} onChange={(e) => setJ({ ...j, role: e.target.value })} />
                {!noAccess && <input className="f" type="email" placeholder="Work email" value={j.email} onChange={(e) => setJ({ ...j, email: e.target.value })} style={{ gridColumn: "1 / -1" }} />}
              </div>
              {LIVE && !noAccess && <p className="tiny muted" style={{ marginTop: 6 }}>We'll email you a link to confirm it's you, then you're in.</p>}
              <button className="btn primary block" style={{ marginTop: 10 }} disabled={busy} onClick={join}>
                {LIVE && !noAccess ? "Confirm my email and join" : "Join"}
              </button>
            </div>
          )
        )}
        {err && <p className="small" style={{ color: "var(--red)", marginTop: 8 }}>{err}</p>}
        {!noAccess && <WorkWithUs />}

        {!LIVE && (
          <>
            <div className="divider">prototype shortcuts</div>
            <button
              className="btn block"
              onClick={() => {
                setViewer({ kind: "client", clientId: bp.id, person: { ...bp.contacts[0], email: "alex@example.com" } });
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
          </>
        )}
      </div>
    </main>
  );
}
