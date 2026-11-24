// The roster, for executives: add people, edit details, and set managers and departments.
// The people table stays HR-only; this route checks the caller is an executive at that company.
// Uploading the payroll file and removing people stay with HR (console).
// POST { clientId, people: TeamMember[] }  create or update, up to 500 at a time
import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import { cleanCell, TeamMember } from "@/lib/team";

const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });
const str = (v: unknown, n = 160) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const opt = (v: unknown, n = 160) => str(v, n) || undefined;
const email = (v: unknown) => { const e = str(v, 200).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ""; };

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" });
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signed_out" }, 401);
  let b: { clientId?: string; people?: unknown[] };
  try { b = await req.json(); } catch { return json({ ok: false, reason: "bad_request" }, 400); }
  const clientId = str(b.clientId, 60);
  if (!clientId || (!who.advisor && !who.execOf.includes(clientId))) return json({ ok: false, reason: "forbidden" }, 403);
  const list = (Array.isArray(b.people) ? b.people : []).slice(0, 500) as Partial<TeamMember>[];
  if (!list.length) return json({ ok: true, saved: [] });
  const db = admin();
  const ids = list.map((p) => str(p.id, 60)).filter(Boolean);
  const { data: rows } = await db.from("people").select("id, data").eq("client_id", clientId).in("id", ids.length ? ids : ["-"]);
  const have = new Map((rows ?? []).map((r) => [String(r.id), r.data as TeamMember]));
  const saved: TeamMember[] = [];
  for (const p of list) {
    const name = str(p.name, 120);
    if (!name) continue;
    const old = have.get(str(p.id, 60));
    const id = old ? str(p.id, 60) : `pp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const md = str(p.birthday, 5);
    const next: TeamMember = {
      ...(old ?? {}),
      id, clientId, name,
      title: str(p.title, 120),
      email: email(p.email) || undefined,
      managerEmail: email(p.managerEmail),
      managerName: str(p.managerName, 120),
      hireDate: /^\d{4}-\d{2}-\d{2}$/.test(str(p.hireDate, 10)) ? str(p.hireDate, 10) : undefined,
      birthday: /^\d{2}-\d{2}$/.test(md) ? md : undefined,
      department: opt(p.department, 80),
      location: opt(p.location, 120),
      cell: p.cell ? cleanCell(str(p.cell, 30)) : undefined,
      celebrate: p.celebrate === false ? false : undefined,
      isManager: p.isManager ? true : undefined,
      // only HR marks people as gone (offboarding or the console)
      active: old ? old.active : true,
    };
    const { id: _id, ...data } = next; // eslint-disable-line @typescript-eslint/no-unused-vars
    const r = old ? await db.from("people").update({ data }).eq("id", id).eq("client_id", clientId) : await db.from("people").insert({ id, client_id: clientId, data });
    if (!r.error) saved.push(next);
  }
  return json({ ok: true, saved });
}
