"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CLIENTS } from "@/lib/data";
import { useStore } from "@/lib/store";

export default function Login() {
  const { setViewer, reset } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const bp = CLIENTS[0];

  return (
    <main className="login">
      <div className="card">
        <div className="wordmark">alza</div>
        <h1 style={{ marginTop: 18 }}>Client portal</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Sign in to see what's in motion, what needs your sign-off, and everything Alza has shared with your team.
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
            <button className="btn primary block" style={{ marginTop: 12 }}>
              Email me a sign-in link
            </button>
          </form>
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
          View as Ben (Alza Master Console)
        </button>
        <button className="btn ghost block tiny" style={{ marginTop: 8 }} onClick={reset}>
          Reset demo data
        </button>
        <p className="demo-note">Prototype with fictional sample data. Nothing here is sent or stored outside this browser.</p>
      </div>
    </main>
  );
}
