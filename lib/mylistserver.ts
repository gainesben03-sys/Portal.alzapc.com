// Server-only: reminder emails for My list. Scheduled with the email service up to 2 days ahead;
// the daily job schedules anything further out once it comes within range.
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelEmail, PORTAL_URL, sendEmail } from "./server";

export type ListRow = { id: string; email: string; client_id: string | null; text: string; done: boolean; due: string | null; remind_at: string | null; scheduled_id: string | null; reminded_at: string | null };
const WINDOW = 48 * 3600e3;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Make the reminder email match the item: cancel a stale one, schedule a due one. */
export async function syncReminder(db: SupabaseClient, row: ListRow, gone = false): Promise<void> {
  if (row.scheduled_id) {
    await cancelEmail(row.scheduled_id);
    if (!gone) await db.from("my_list").update({ scheduled_id: null, reminded_at: null }).eq("id", row.id);
  }
  if (gone || row.done || !row.remind_at) return;
  const at = new Date(row.remind_at).getTime();
  if (at > Date.now() + WINDOW) return; // the daily job picks it up later
  if (at < Date.now() - 24 * 3600e3) return; // too old to be useful
  const url = row.client_id ? `${PORTAL_URL}/c/${row.client_id}` : PORTAL_URL;
  const due = row.due ? new Date(`${row.due}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "";
  const r = await sendEmail({
    to: [row.email],
    subject: `Reminder: ${row.text.slice(0, 90)}`,
    text: `${row.text}${due ? `\n\nDue ${due}.` : ""}\n\nYour list: ${url}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:24px;color:#19283c;max-width:520px"><p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#6b645e">Reminder from your list</p><p style="margin:0 0 12px;font-size:20px;line-height:28px"><b>${esc(row.text)}</b></p>${due ? `<p style="margin:0 0 16px;color:#4a4744">Due ${esc(due)}</p>` : ""}<a href="${url}" style="display:inline-block;background:#19283c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">Open my list</a><p style="margin:18px 0 0;font-size:12px;color:#6b645e">Only you can see your list.</p></div>`,
    scheduledAt: at > Date.now() + 60e3 ? new Date(at).toISOString() : undefined,
    fromName: "My list",
  });
  if (r.ok) await db.from("my_list").update({ scheduled_id: r.id ?? null, reminded_at: new Date(Math.max(at, Date.now())).toISOString() }).eq("id", row.id);
}
