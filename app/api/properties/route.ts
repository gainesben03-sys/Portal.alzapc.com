// Our Properties.
// GET  ?clientId=  -> the cards for anyone in the workspace (work info only: name, title, work email),
//                     plus the "still stuck" contacts. Ben and executives also get what they need to edit.
// POST { clientId, settings } -> save property details, slot overrides, hidden locations, contacts.
//                     Ben or an executive at the client.
import { NextResponse } from "next/server";
import { admin, caller, SERVER_LIVE } from "@/lib/server";
import { cleanSettings, propertyCards, rosterLocations, type Contact, type PropertySettings } from "@/lib/properties";
import type { TeamMember } from "@/lib/team";

const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

async function load(clientId: string) {
  const db = admin();
  const [{ data: cl }, { data: ppl }, { data: mem }] = await Promise.all([
    db.from("clients").select("name, config").eq("id", clientId).maybeSingle(),
    db.from("people").select("id, client_id, data").eq("client_id", clientId),
    db.from("members").select("name, role, email").eq("client_id", clientId),
  ]);
  const people = (ppl ?? []).map((r) => ({ ...(r.data as object), id: r.id, clientId: r.client_id }) as TeamMember);
  return { db, cl, people, members: mem ?? [] };
}

export async function GET(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signin" }, 401);
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!who.advisor && !who.memberOf.includes(clientId)) return json({ ok: false, reason: "forbidden" }, 403);
  const { cl, people, members } = await load(clientId);
  if (!cl) return json({ ok: false, reason: "not_found" }, 404);
  const cfg = (cl.config ?? {}) as { properties?: PropertySettings; escalationEmail?: string; modules?: Record<string, boolean> };
  if (!cfg.modules?.properties && !who.advisor) return json({ ok: false, reason: "off" }, 403);
  const settings = cleanSettings(cfg.properties);
  const canEdit = who.advisor || who.execOf.includes(clientId);
  const esc = members.find((m) => m.email?.toLowerCase() === (cfg.escalationEmail || "").toLowerCase());
  const contacts: Contact[] = settings.contacts?.length
    ? settings.contacts
    : [
        ...(esc ? [{ name: esc.name, title: esc.role || "", email: esc.email.toLowerCase(), what: "Operations and anything else" }] : []),
        { name: "Ben Gaines", title: "HR", email: "ben@alzapc.com", what: "Employee questions and issues" },
      ];
  return json({
    ok: true,
    cards: propertyCards(people, settings, clientId),
    contacts,
    canEdit,
    // only editors get the roster list and raw settings
    ...(canEdit
      ? {
          settings,
          people: people.filter((p) => p.active !== false).map((p) => ({ id: p.id, name: p.name, title: p.title, location: p.location || "" })).sort((a, b) => a.name.localeCompare(b.name)),
          locations: rosterLocations(people, clientId),
        }
      : {}),
  });
}

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const who = await caller(req);
  if (!who) return json({ ok: false, reason: "signin" }, 401);
  let b: { clientId?: string; settings?: unknown };
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const clientId = String(b.clientId ?? "");
  if (!who.advisor && !who.execOf.includes(clientId)) return json({ ok: false, reason: "forbidden" }, 403);
  const db = admin();
  const { data: cl } = await db.from("clients").select("config").eq("id", clientId).maybeSingle();
  if (!cl) return json({ ok: false, reason: "not_found" }, 404);
  const properties = cleanSettings(b.settings);
  const cfg = (cl.config ?? {}) as Record<string, unknown>;
  const { error } = await db.from("clients").update({ config: { ...cfg, properties } }).eq("id", clientId);
  if (error) return json({ ok: false, reason: "save_failed" }, 500);
  return json({ ok: true, settings: properties });
}
