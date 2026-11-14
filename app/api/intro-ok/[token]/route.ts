// HR's one-click approval for a company intro, from the email they get on the day. The link is the key.
// GET -> a preview of the email and who it goes to      POST -> send it now
import { NextResponse } from "next/server";
import { introEmail, introOn } from "@/lib/experience";
import { brandAndSender, hireByToken, introRecipients, sendIntroNow, signed } from "@/lib/experienceserver";
import { admin, SERVER_LIVE } from "@/lib/server";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: H });

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const db = admin();
  const c = await hireByToken(db, "intro", (await params).token);
  if (!c || !introOn(c.x) || c.h.outcome || c.h.xp?.closed) return json({ ok: false, reason: "not_found" }, 404);
  const xp = c.h.xp ?? {};
  const { brand } = brandAndSender(c);
  const photo = c.x.photos !== false && xp.sharePhoto !== false ? await signed(db, xp.photo) : undefined;
  const m = introEmail(c.h, c.x, brand, photo);
  const { emails, audience } = await introRecipients(db, c.clientId, c.h, c.x);
  return json({
    ok: true,
    name: c.h.name,
    company: c.company,
    accent: c.cfg.accent || "#19283c",
    html: m.html,
    subject: m.subject,
    count: emails.length,
    audience,
    sent: xp.intro?.sentAt || null,
    sentTo: xp.intro?.sentTo || 0,
    cancelled: !!xp.intro?.cancelled,
    hireUrl: `/c/${c.clientId}/hires/${c.id}#plan`,
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_LIVE) return json({ ok: false, reason: "demo" }, 404);
  const c = await hireByToken(admin(), "intro", (await params).token);
  if (!c || !introOn(c.x) || c.h.outcome || c.h.xp?.closed) return json({ ok: false, reason: "not_found" }, 404);
  const r = await sendIntroNow(c, "HR (from the approval email)");
  return json(r, r.ok ? 200 : 409);
}
