// Server-only helpers for video screening.
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { Role } from "./modules";

const secret = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CRON_SECRET || "dev-only";

export interface Ticket {
  c: string; // candidate id
  r: string; // role id
  cl: string; // client id
  m?: string; // media path
  rs?: string; // resume path
  e: string; // email
  n: string; // name
  k: "video" | "audio" | "written";
  exp: number;
}

export function signTicket(t: Ticket) {
  const body = Buffer.from(JSON.stringify(t)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readTicket(s: string): Ticket | null {
  const [body, sig] = String(s || "").split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", secret()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString()) as Ticket;
    return t.exp > Date.now() ? t : null;
  } catch {
    return null;
  }
}

export const newCandidateId = () => `c${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;

export async function roleBySlug(db: SupabaseClient, slug: string) {
  if (!/^[a-z0-9-]{4,60}$/.test(slug)) return null;
  const { data } = await db.from("roles").select("id, client_id, data").eq("data->pitch->>slug", slug).maybeSingle();
  if (!data) return null;
  return { ...(data.data as Role), id: data.id as string, clientId: data.client_id as string };
}

export const extFor = (mime: string, kind: string) =>
  /mp4/.test(mime) ? (kind === "audio" ? "m4a" : "mp4") : /quicktime/.test(mime) ? "mov" : /ogg/.test(mime) ? "ogg" : /mpeg/.test(mime) ? "mp3" : /wav/.test(mime) ? "wav" : "webm";
