// Sign-in links only go to people who have access: Ben, invited team members,
// or someone holding a valid invite code. Everyone gets the same reply, so the
// page never reveals whether an email is registered.
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { admin, cleanSupabaseUrl, sendEmail, SERVER_LIVE, siteUrl } from "@/lib/server";
import { codeEmail } from "@/lib/signinemail";

// Best-effort guard against repeat clicks: one email per address every 30 seconds per server.
const recent = new Map<string, number>();

/** Make the code and link ourselves and send our own email, so it never depends on Supabase's email template. */
async function sendCode(email: string, redirectTo: string): Promise<"sent" | "fallback"> {
  const db = admin();
  let r = await db.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
  if (r.error && /not.*found|no user/i.test(r.error.message)) {
    await db.auth.admin.createUser({ email, email_confirm: true });
    r = await db.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
  }
  const code = r.data?.properties?.email_otp;
  const link = r.data?.properties?.action_link;
  if (r.error || !code || !link) return "fallback";
  const m = codeEmail(code, link);
  const sent = await sendEmail({ to: [email], subject: m.subject, html: m.html, text: m.text, fromName: "AlzaHR" });
  return sent.ok ? "sent" : "fallback";
}

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
    const last = recent.get(email) ?? 0;
    if (Date.now() - last < 30_000) return NextResponse.json({ ok: false, reason: "rate" });
    recent.set(email, Date.now());
    if (recent.size > 500) recent.clear();
    try {
      if ((await sendCode(email, siteUrl(req))) === "sent") return NextResponse.json({ ok: true });
    } catch {}
    // Fallback: Supabase sends its own email (needs {{ .Token }} in its template to show a code)
    const url = cleanSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
    const pub = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" } });
    const { error } = await pub.auth.signInWithOtp({ email, options: { emailRedirectTo: siteUrl(req), shouldCreateUser: true } });
    if (error && /rate|seconds/i.test(error.message)) return NextResponse.json({ ok: false, reason: "rate" });
  }
  return NextResponse.json({ ok: true });
}
