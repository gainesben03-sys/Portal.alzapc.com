// Public: the candidate side of video screening. No sign-in.
// start: checks the link is open, returns one-time upload links straight to private storage.
// finish: checks the files arrived, then adds the candidate to the role.
import { NextResponse } from "next/server";
import { emailLogoUrl } from "@/lib/brand";
import { noticeEmail } from "@/lib/hires";
import { Candidate, ClientConfig } from "@/lib/modules";
import { MAX_RESUME_MB, MAX_UPLOAD_MB, pitchOpen, PitchSubmission } from "@/lib/pitch";
import { extFor, newCandidateId, readTicket, roleBySlug, signTicket } from "@/lib/pitchserver";
import { advisorEmails, pushTo } from "@/lib/push";
import { admin, sendEmail, SERVER_LIVE, siteUrl } from "@/lib/server";

export const maxDuration = 30;
const BUCKET = "client-files";
const s = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e);
const safe = (n: string) => n.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "file";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" }, { status: 404 });
  const { slug } = await params;
  const db = admin();
  const role = await roleBySlug(db, slug);
  if (!role?.pitch) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const { data: c } = await db.from("clients").select("name, config").eq("id", role.clientId).maybeSingle();
  const cfg = (c?.config ?? {}) as ClientConfig;
  if (!c || cfg.videoScreening === false) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const p = role.pitch;
  return NextResponse.json({
    ok: true,
    open: pitchOpen(p),
    company: c.name,
    accent: cfg.accent || "#19283c",
    logo: cfg.logoEmail || cfg.logo || null,
    role: { title: role.title, location: role.location, type: role.type, dept: role.dept },
    intro: p.intro,
    prompts: p.prompts,
    maxSeconds: p.maxSeconds,
    allowUpload: p.allowUpload,
    allowAudio: p.allowAudio,
    allowWritten: p.allowWritten,
    askResume: p.askResume,
    askLinkedin: p.askLinkedin,
    limits: { uploadMB: MAX_UPLOAD_MB, resumeMB: MAX_RESUME_MB },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!SERVER_LIVE) return NextResponse.json({ ok: false, reason: "demo" }, { status: 404 });
  const { slug } = await params;
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const db = admin();
  const role = await roleBySlug(db, slug);
  if (!role?.pitch) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  if (!pitchOpen(role.pitch)) return NextResponse.json({ ok: false, reason: "closed" });
  const p = role.pitch;

  const already = async (email: string) => {
    const { data } = await db.from("candidates").select("id").eq("client_id", role.clientId).eq("data->>roleId", role.id).eq("data->pitch->>email", email).limit(1);
    return !!data?.length;
  };

  if (b.action === "start") {
    const name = s(b.name, 100);
    const email = s(b.email, 200).toLowerCase();
    const kind = b.kind === "audio" ? "audio" : b.kind === "written" ? "written" : "video";
    if (name.length < 2) return NextResponse.json({ ok: false, reason: "name" });
    if (!emailOk(email)) return NextResponse.json({ ok: false, reason: "email" });
    if ((kind === "audio" && !p.allowAudio) || (kind === "written" && !p.allowWritten)) return NextResponse.json({ ok: false, reason: "kind" });
    if (await already(email)) return NextResponse.json({ ok: false, reason: "already_applied" });
    const mime = s(b.mime, 80).toLowerCase();
    const size = Number(b.size) || 0;
    if (kind !== "written") {
      if (!/^(video|audio)\//.test(mime)) return NextResponse.json({ ok: false, reason: "type" });
      if (size > MAX_UPLOAD_MB * 1024 * 1024) return NextResponse.json({ ok: false, reason: "too_big" });
    }
    const resume = b.resume as { name?: string; type?: string; size?: number } | undefined;
    if (resume && (Number(resume.size) || 0) > MAX_RESUME_MB * 1024 * 1024) return NextResponse.json({ ok: false, reason: "resume_too_big" });

    const c = newCandidateId();
    const folder = `${role.clientId}/pitch/${c}`;
    const m = kind === "written" ? undefined : `${folder}/pitch.${extFor(mime, kind)}`;
    const rs = resume?.name ? `${folder}/${safe(String(resume.name))}` : undefined;
    const sign = async (path?: string) => {
      if (!path) return null;
      const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
      return error || !data ? null : data.signedUrl;
    };
    const [mediaUrl, resumeUrl] = await Promise.all([sign(m), sign(rs)]);
    if ((m && !mediaUrl) || (rs && !resumeUrl)) return NextResponse.json({ ok: false, reason: "storage" }, { status: 500 });
    const ticket = signTicket({ c, r: role.id, cl: role.clientId, m, rs, e: email, n: name, k: kind, exp: Date.now() + 3 * 3600e3 });
    return NextResponse.json({ ok: true, ticket, mediaUrl, resumeUrl });
  }

  if (b.action === "finish") {
    const t = readTicket(String(b.ticket ?? ""));
    if (!t || t.r !== role.id) return NextResponse.json({ ok: false, reason: "expired" });
    const exists = async (path?: string) => {
      if (!path) return true;
      const dir = path.slice(0, path.lastIndexOf("/"));
      const file = path.slice(path.lastIndexOf("/") + 1);
      const { data } = await db.storage.from(BUCKET).list(dir, { limit: 10, search: file });
      return !!data?.some((x) => x.name === file);
    };
    if (!(await exists(t.m))) return NextResponse.json({ ok: false, reason: "media_missing" });
    if (!(await exists(t.rs))) return NextResponse.json({ ok: false, reason: "resume_missing" });
    const text = s(b.text, 4000);
    if (t.k === "written" && text.length < 20) return NextResponse.json({ ok: false, reason: "text" });
    if (await already(t.e)) return NextResponse.json({ ok: true, duplicate: true }); // a retry after success

    const now = new Date().toISOString();
    const sub: PitchSubmission = {
      kind: t.k,
      mediaPath: t.m,
      mime: s(b.mime, 80) || undefined,
      seconds: Math.round(Number(b.seconds) || 0) || undefined,
      text: text || undefined,
      email: t.e,
      phone: s(b.phone, 40) || undefined,
      linkedin: /^https?:\/\//.test(s(b.linkedin, 300)) ? s(b.linkedin, 300) : undefined,
      resumePath: t.rs,
      resumeName: t.rs ? t.rs.slice(t.rs.lastIndexOf("/") + 1) : undefined,
      submittedAt: now,
    };
    const toClient = p.review === "client";
    const cand: Omit<Candidate, "id"> = {
      roleId: role.id,
      name: t.n,
      headline: t.k === "video" ? `Video pitch${sub.seconds ? `, ${sub.seconds}s` : ""}` : t.k === "audio" ? "Audio pitch" : "Written intro",
      summary: "",
      strengths: [],
      assessment: "",
      scores: [],
      stage: "Pitch received",
      sentAt: now.slice(0, 10),
      source: "pitch",
      pitch: sub,
      hidden: !toClient,
      screened: toClient ? "shared" : undefined,
    };
    const { error } = await db.from("candidates").insert({ id: t.c, client_id: role.clientId, created_by: "pitch@portal", data: cand });
    if (error) return NextResponse.json({ ok: false, reason: "save_failed" }, { status: 500 });

    // let people know
    const base = siteUrl(req);
    const { data: c } = await db.from("clients").select("name, config").eq("id", role.clientId).maybeSingle();
    const cfg = (c?.config ?? {}) as ClientConfig;
    const company = c?.name ?? "";
    const href = `/c/${role.clientId}/recruiting`;
    await db.from("notices").insert({ id: `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, client_id: role.clientId, created_by: "pitch@portal", data: { clientId: role.clientId, kind: "pitch", text: `New pitch: ${t.n} for ${role.title}`, href, at: now, read: false } });
    await pushTo(db, await advisorEmails(db), "activity", { title: `New pitch for ${role.title}`, body: `${t.n} at ${company}`, url: href, tag: `pitch-${role.id}` });
    await sendEmail({
      to: [(process.env.NOTIFY_TO || "ben@alzapc.com").trim()],
      subject: `[Portal] New pitch: ${t.n} for ${role.title} (${company})`,
      text: `${t.n} (${t.e}) sent a ${t.k} pitch for ${role.title} at ${company}.\n\n${toClient ? "It went straight to the client." : "It's waiting for you to screen."}\n\n${base}${href}`,
    });
    if (toClient && role.hiringManager?.email) {
      await pushTo(db, [role.hiringManager.email], "requests", { title: `New candidate for ${role.title}`, body: `${t.n} sent a pitch`, url: href, tag: `pitch-${role.id}` });
    }
    const brand = { company, accent: cfg.accent || "#19283c", logoUrl: emailLogoUrl(role.clientId, cfg.logo, cfg.logoEmail, base) };
    const mail = noticeEmail(brand, "Received", `Thanks, <i>${t.n.split(" ")[0].replace(/[&<>"]/g, "")}.</i>`, [`Thanks for applying to ${role.title} at ${company}. Your ${t.k === "written" ? "introduction" : "pitch"} came through.`, "If it's a fit, someone from the team will reach out about next steps."]);
    await sendEmail({ to: [t.e], subject: `Thanks for applying to ${role.title} at ${company}`, html: mail.html, text: mail.text });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
}
