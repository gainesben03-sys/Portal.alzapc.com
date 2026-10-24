"use client";
import { authHeader, LIVE } from "./supabase";

/** Email an invitation. Returns a short message for a toast. */
export async function sendInvite(clientId: string, email: string, name: string): Promise<string> {
  if (!LIVE) return "Invite created (demo mode, no email sent).";
  // give the save a moment so the new person exists before they try to sign in
  await new Promise((r) => setTimeout(r, 900));
  try {
    const r = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ clientId, email, name }),
    });
    const j = await r.json();
    if (j.sent) return `Invite emailed to ${email}`;
    if (j.reason === "not_configured") return "Added. Invite email isn't connected yet, so let them know to sign in at the portal.";
    return "Added, but the invite email didn't send. Let them know to sign in at the portal.";
  } catch {
    return "Added, but the invite email didn't send.";
  }
}
