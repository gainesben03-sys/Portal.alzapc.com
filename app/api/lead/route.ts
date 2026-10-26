// "Work with Alza": a short form for people who aren't clients yet. Emails Ben and alerts his phone.
import { NextResponse } from "next/server";
import { advisorEmails, pushTo } from "@/lib/push";
import { admin, sendEmail, SERVER_LIVE } from "@/lib/server";

const s = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (s(b.website, 100)) return NextResponse.json({ ok: true }); // hidden field: bots fill it in
  const name = s(b.name, 100);
  const email = s(b.email, 200).toLowerCase();
  const company = s(b.company, 120);
  const size = s(b.size, 40);
  const need = String(b.need ?? "").trim().slice(0, 2000);
  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return NextResponse.json({ ok: false, reason: "fields" });
  const ben = (process.env.NOTIFY_TO || "ben@alzapc.com").trim();
  const r = await sendEmail({
    to: [ben],
    replyTo: email,
    subject: `[Portal] New inquiry: ${name}${company ? `, ${company}` : ""}`,
    text: `Someone reached out from the portal sign-in page.\n\nName: ${name}\nEmail: ${email}\nCompany: ${company || "-"}\nTeam size: ${size || "-"}\n\nWhat they need:\n${need || "(not filled in)"}\n\nReply to this email to answer them directly.`,
  });
  if (SERVER_LIVE) {
    const db = admin();
    await pushTo(db, await advisorEmails(db), "activity", { title: "New inquiry", body: `${name}${company ? ` at ${company}` : ""}`, url: "/console", tag: "lead" });
  }
  return NextResponse.json({ ok: r.ok || !process.env.RESEND_API_KEY });
}
