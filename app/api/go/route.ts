// One-click links from emails. POST { token, action: "open" | "resend" }
//   open    signs the person in (if the link is good and still unused) and says where to go
//   resend  emails a fresh link to the same address, for a used or expired one
import { NextResponse } from "next/server";
import { admin, sendEmail, SERVER_LIVE, siteUrl } from "@/lib/server";
import { LINK_DAYS, oneClickUrl, readLink, useOnce } from "@/lib/oneclick";

const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });
const recent = new Map<string, number>();

async function hasAccess(email: string) {
  const db = admin();
  const exact = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const [{ data: a }, { data: m }] = await Promise.all([
    db.from("advisors").select("email").ilike("email", exact).limit(1),
    db.from("members").select("email").ilike("email", exact).limit(1),
  ]);
  return !!a?.length || !!m?.length;
}

export async function POST(req: Request) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" });
  let b: { token?: string; action?: string };
  try { b = await req.json(); } catch { return json({ ok: false, reason: "bad_request" }, 400); }
  const v = readLink(String(b.token ?? ""));
  if (!v) return json({ ok: false, reason: "bad" });
  const db = admin();

  if (b.action === "resend") {
    if (Date.now() > v.x + 60 * 864e5) return json({ ok: false, reason: "old" });
    if (Date.now() - (recent.get(v.e) ?? 0) < 60_000) return json({ ok: true }); // one per minute
    recent.set(v.e, Date.now());
    if (!(await hasAccess(v.e))) return json({ ok: true }); // same reply either way
    const url = oneClickUrl(v.e, v.p);
    const html = `<div style="font-family:Arial,sans-serif;color:#19283c;font-size:15px;line-height:1.5"><p>Here's a fresh link. It opens right where you left off and works once, for ${LINK_DAYS} days.</p><p><a href="${url}" style="display:inline-block;background:#19283c;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:bold">Open it</a></p><p style="color:#5b6b85;font-size:13px">Didn't ask for this? You can ignore it.</p></div>`;
    await sendEmail({ to: [v.e], subject: "Your link to the Alza Hub", html, text: `Here's a fresh link. It works once, for ${LINK_DAYS} days.\n\n${url}`, fromName: "AlzaHR", bypassHold: true });
    return json({ ok: true });
  }

  if (Date.now() > v.x) return json({ ok: false, reason: "expired" });
  if (!(await hasAccess(v.e))) return json({ ok: false, reason: "no_access" });
  if (!(await useOnce(db, v.n, v.e))) return json({ ok: false, reason: "used" });
  const redirectTo = siteUrl(req);
  let r = await db.auth.admin.generateLink({ type: "magiclink", email: v.e, options: { redirectTo } });
  if (r.error && /not.*found|no user/i.test(r.error.message)) {
    await db.auth.admin.createUser({ email: v.e, email_confirm: true });
    r = await db.auth.admin.generateLink({ type: "magiclink", email: v.e, options: { redirectTo } });
  }
  const link = r.data?.properties?.action_link;
  if (r.error || !link) return json({ ok: false, reason: "signin" });
  return json({ ok: true, link, path: v.p });
}
