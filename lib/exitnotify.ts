// Server-only: tell Ben (and the client's executives) that an exit survey came in. No answers in the email.
import type { SupabaseClient } from "@supabase/supabase-js";
import { advisorEmails } from "./push";
import type { Departure } from "./offboard";
import { PORTAL_URL, sendEmail } from "./server";

export async function notifyAdvisors(db: SupabaseClient, clientId: string, company: string, d: Departure) {
  const { data: execs } = await db.from("members").select("email").eq("client_id", clientId).eq("access", "exec");
  const to = Array.from(new Set([...(await advisorEmails(db).catch(() => [])), ...(execs ?? []).map((m) => String(m.email).toLowerCase())]));
  if (!to.length) return;
  const url = `${PORTAL_URL}/c/${clientId}/offboarding/${d.id}`;
  await sendEmail({ to, subject: `${company}: exit survey from ${d.name.split(" ")[0]}`, text: `${d.name} completed their exit survey. Read it in the portal (executives and Ben only):\n\n${url}` });
}
