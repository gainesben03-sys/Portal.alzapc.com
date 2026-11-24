"use client";

// The page a one-click link opens. Nothing happens until it runs in a real browser (so email
// scanners that only fetch the page don't use the link up). Then it signs in and opens the page
// the email was about, like that person's review.
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LIVE, sb } from "@/lib/supabase";

type State = "opening" | "used" | "expired" | "no_access" | "bad" | "offline" | "sent" | "sending";

export default function OneClick() {
  const { token } = useParams<{ token: string }>();
  const [st, setSt] = useState<State>("opening");

  useEffect(() => {
    if (!LIVE) return setSt("bad");
    (async () => {
      try {
        const r = await fetch("/api/go", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "open" }) }).then((x) => x.json());
        if (r.ok) {
          const { error } = await sb().auth.verifyOtp({ token_hash: r.hash, type: "magiclink" });
          if (error) return setSt("bad");
          return window.location.replace(r.path);
        }
        setSt(r.reason === "used" || r.reason === "expired" || r.reason === "no_access" ? r.reason : "bad");
      } catch {
        setSt("offline");
      }
    })();
  }, [token]);

  const resend = async () => {
    setSt("sending");
    await fetch("/api/go", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "resend" }) }).catch(() => null);
    setSt("sent");
  };

  const msg: Record<State, [string, string, boolean]> = {
    opening: ["Opening…", "One moment.", false],
    used: ["This link was already used", "Links in emails work once, to keep your team's information safe.", true],
    expired: ["This link has expired", "Links in emails last 14 days.", true],
    no_access: ["No access", "This email doesn't have access to the People Hub anymore. Ask HR if that's a mistake.", false],
    bad: ["That link didn't work", "It may have been cut off. Tap the button in the email again, or ask for a new one.", true],
    offline: ["Can't reach the People Hub", "Check your connection and try again.", false],
    sending: ["Sending…", "", false],
    sent: ["Check your email", "A new link is on its way. It opens right where you left off.", false],
  };
  const [h, p, btn] = msg[st];
  return (
    <main className="login">
      <div className="card" style={{ textAlign: "center" }}>
        {st === "opening" && <div className="go-spin" aria-hidden="true" />}
        <h1 style={{ fontSize: 22 }}>{h}</h1>
        {p && <p className="muted" style={{ marginTop: 6 }}>{p}</p>}
        {btn && <button className="btn primary block" style={{ marginTop: 14 }} onClick={resend}>Email me a new link</button>}
      </div>
    </main>
  );
}
