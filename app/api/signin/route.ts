// Sign-in links only go to people who have access: Ben, invited team members,
// or someone holding a valid invite code. Everyone gets the same reply, so the
// page never reveals whether an email is registered.
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { admin, cleanSupabaseUrl, SERVER_LIVE, siteUrl } from "@/lib/server";

export async function POST(req: Request) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: true });
  let b: { email?: string; code?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return NextResponse.json({ ok: false, reason: "email" });
  const db = admin();

  let allowed = false;
  const exact = email.replace(/[\\%_]/g, (c) => `\\${c}`); // match the address literally
  const [{ data: adv }, { data: mem }] = await Promise.all([
    db.from("advisors").select("email").ilike("email", exact).limit(1),
    db.from("members").select("email").ilike("email", exact).limit(1),
  ]);
  allowed = !!adv?.length || !!mem?.length;
  if (!allowed && b.code) {
    const { data: c } = await db.from("invite_codes").select("code, expires, used_by").eq("code", String(b.code).trim().toUpperCase()).maybeSingle();
    allowed = !!c && new Date(c.expires) > new Date() && (!c.used_by || c.used_by.toLowerCase() === email);
    if (!allowed) return NextResponse.json({ ok: false, reason: "code" }); // the person typed the code, so saying so leaks nothing
  }

  if (allowed) {
    const url = cleanSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
    const pub = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" } });
    const { error } = await pub.auth.signInWithOtp({ email, options: { emailRedirectTo: siteUrl(req), shouldCreateUser: true } });
    if (error && /rate|seconds/i.test(error.message)) return NextResponse.json({ ok: false, reason: "rate" });
  }
  return NextResponse.json({ ok: true });
}
