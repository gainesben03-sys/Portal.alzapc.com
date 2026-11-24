// One-click links for emails: a manager taps "Open the review" and lands in it, signed in.
// Each link is signed by the server, works once, and expires after LINK_DAYS. A used or expired
// link offers to email a fresh one to the same address, so only that inbox can get back in.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PORTAL_URL } from "./server";

export const LINK_DAYS = 14;
const secret = () => process.env.ONE_CLICK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (body: string) => b64(createHmac("sha256", secret()).update(body).digest());

export interface LinkBody { e: string; p: string; x: number; n: string }

/** A one-click link for this person to this page of the People Hub. */
export function oneClickUrl(email: string, path: string, days = LINK_DAYS) {
  if (!secret()) return PORTAL_URL + path;
  const body = b64(JSON.stringify({ e: email.trim().toLowerCase(), p: path, x: Date.now() + days * 864e5, n: randomBytes(9).toString("base64url") } satisfies LinkBody));
  return `${PORTAL_URL}/go/${body}.${sign(body)}`;
}

/** Check the signature. Expiry is checked by the caller, so an expired link can still ask for a new one. */
export function readLink(token: string): LinkBody | null {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig || !secret()) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString()) as LinkBody;
    return v.e && v.p?.startsWith("/") && !v.p.startsWith("//") ? v : null;
  } catch {
    return null;
  }
}

/** Swap every People Hub page link in an email for a one-click link for this recipient. */
export function withOneClick(to: string, m: { html?: string; text: string }) {
  const base = PORTAL_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${base}(/c/[A-Za-z0-9_\\-/?=&%.]+)`, "g");
  const made = new Map<string, string>();
  const swap = (s: string) => s.replace(re, (_, path: string) => {
    if (!made.has(path)) made.set(path, oneClickUrl(to, path));
    return made.get(path)!;
  });
  return { html: m.html ? swap(m.html) : m.html, text: swap(m.text) };
}

/** Mark a link used. Returns false if it was used already. Without the table, links can be reused until they expire. */
export async function useOnce(db: SupabaseClient, n: string, email: string) {
  const { error } = await db.from("link_uses").insert({ id: n, email });
  if (!error) return true;
  if (/duplicate|unique|23505/i.test(`${error.code} ${error.message}`)) return false;
  return true;
}
