// Outbox: during the early days with a company, outgoing email can wait for a person's OK.
// Each company picks a mode; held emails wait in the Outbox until HR or an executive sends or skips them.

export type OutboxMode = "off" | "auto" | "all";
export const MODE_LABEL: Record<OutboxMode, { title: string; blurb: string }> = {
  off: { title: "Send automatically", blurb: "Emails go out as soon as they're ready." },
  auto: { title: "Hold automatic emails", blurb: "Reminders, welcome emails, celebrations and other emails the People Hub sends on its own wait for your OK. Emails someone sends by clicking a button still go right away." },
  all: { title: "Hold everything", blurb: "Every email waits for your OK, except sign-in codes and People Hub invites." },
};
export const outboxMode = (m?: string): OutboxMode => (m === "auto" || m === "all" ? m : "off");

export type Audience = "employee" | "leader" | "ben";
export type OutStatus = "held" | "sent" | "skipped" | "failed" | "digest";

export interface OutMail {
  id: string;
  clientId: string | null;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  scheduledAt?: string;
  attachments?: { filename: string; content: string }[];
  replyTo?: string | string[];
  fromName?: string;
  fromBox?: string;
  auto: boolean; // the People Hub sent it on its own (a schedule), not a person clicking a button
  audience: Audience;
  sensitive: boolean; // leave, write-ups: only HR sees these in the Outbox
  status: OutStatus;
  createdAt: string;
  doneAt?: string;
  doneBy?: string;
  error?: string;
}

/** What the Outbox list shows (no attachment bodies). */
export type OutRow = Omit<OutMail, "attachments" | "text"> & { attachments?: string[] };

export const HOLD_DAYS = 14; // held longer than this are skipped, since reminders go stale

export const ageText = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};
