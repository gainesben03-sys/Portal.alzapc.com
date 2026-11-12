// My list reminders. The browser saves the item itself (only its owner can); this keeps the
// reminder email in step. POST { id, gone? }
import { NextResponse } from "next/server";
import { ListRow, syncReminder } from "@/lib/mylistserver";
import { admin, caller, SERVER_LIVE } from "@/lib/server";

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" });
  const who = await caller(req);
  if (!who) return NextResponse.json({ ok: false, reason: "signin" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; gone?: boolean; scheduledId?: string };
  const db = admin();
  const { data } = await db.from("my_list").select("*").eq("id", String(b.id ?? "")).maybeSingle();
  if (!data) {
    // already deleted: the browser passes the reminder it had, to cancel it
    if (b.gone && b.scheduledId) await syncReminder(db, { id: String(b.id), email: who.email, client_id: null, text: "", done: true, due: null, remind_at: null, scheduled_id: String(b.scheduledId), reminded_at: null }, true);
    return NextResponse.json({ ok: true });
  }
  const row = data as ListRow;
  if (row.email.toLowerCase() !== who.email) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  await syncReminder(db, row, !!b.gone);
  return NextResponse.json({ ok: true });
}
