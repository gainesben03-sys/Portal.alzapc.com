// Server-only: built-in e-signature. Builds the signed PDF with an audit certificate,
// and loads what the signing routes need. Records follow ESIGN/UETA basics: consent to sign
// electronically, intent (typed signature), the exact text signed (SHA-256), who/when/where.
import { createHash, randomBytes } from "crypto";
import { PDFDocument, PDFFont, rgb, StandardFonts } from "pdf-lib";
import { SupabaseClient } from "@supabase/supabase-js";
import { emailLogoUrl } from "./brand";
import { Client, Person } from "./data";
import { Hire, onboardingFor, OnboardingSettings } from "./hires";
import { ClientConfig } from "./modules";
import { letterheadImage } from "./extract";
import { PORTAL_URL } from "./server";

export const newToken = () => randomBytes(24).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export interface SigEvent {
  at: string;
  what: string;
  ip?: string;
  agent?: string;
}

export interface SigRow {
  id: string;
  client_id: string;
  hire_id: string;
  doc_kind: "offer" | "agreement";
  title: string;
  body: string;
  doc_hash: string;
  source_path: string | null;
  signer_name: string;
  signer_email: string;
  status: "sent" | "viewed" | "signed" | "declined" | "voided";
  sent_by: string;
  sent_at: string;
  viewed_at: string | null;
  signed_at: string | null;
  signed_name: string | null;
  signed_ip: string | null;
  signed_agent: string | null;
  decline_reason: string | null;
  signed_path: string | null;
  expires_at: string;
  events: SigEvent[];
}

/** Everything about a client the signing flow needs: brand, settings, and a Client with its escalation contact. */
export async function loadClient(db: SupabaseClient, clientId: string) {
  const { data: c } = await db.from("clients").select("id, name, engagement, pilot, config").eq("id", clientId).maybeSingle();
  if (!c) return null;
  const cfg = (c.config ?? {}) as ClientConfig;
  const { data: mem } = await db.from("members").select("email, name, role, access").eq("client_id", clientId);
  const users = (mem ?? []) as { email: string; name: string; role: string; access: string }[];
  const esc = users.find((u) => u.email.toLowerCase() === (cfg.escalationEmail || "").toLowerCase()) ?? users.find((u) => u.access === "exec");
  const escalation: Person = esc ? { name: esc.name, role: esc.role, email: esc.email } : { name: "Ben Gaines", role: "Alza advisor" };
  const client: Client = { id: c.id, name: c.name, accent: cfg.accent || "#19283c", logo: cfg.logo, pilot: !!c.pilot, engagement: c.engagement ?? "", escalation, contacts: users };
  const fullCfg: ClientConfig = { ...cfg, users: users.map((u) => ({ ...u, access: u.access as "exec" })), codes: [] };
  const s: OnboardingSettings = onboardingFor(cfg.onboarding);
  const brand = { company: c.name, accent: cfg.accent || "#19283c", logoUrl: emailLogoUrl(c.id, cfg.logo, cfg.logoEmail, PORTAL_URL) };
  return { client, cfg: fullCfg, s, brand, logo: cfg.logoEmail || cfg.logo };
}

export async function loadHire(db: SupabaseClient, hireId: string): Promise<Hire | null> {
  const { data } = await db.from("hires").select("id, client_id, data").eq("id", hireId).maybeSingle();
  return data ? { ...(data.data as Hire), id: data.id, clientId: data.client_id } : null;
}

export async function saveHire(db: SupabaseClient, h: Hire) {
  const { id, ...rest } = h;
  return db.from("hires").update({ data: rest }).eq("id", id);
}

/** Header image for the PDF: the client's letterhead if Ben uploaded one, else their logo. */
export async function headerImage(db: SupabaseClient, clientId: string, logo?: string): Promise<{ data: Uint8Array; png: boolean } | null> {
  try {
    const { data: k } = await db.from("knowledge").select("path, mime, file_name").eq("client_id", clientId).eq("kind", "letterhead").order("created_at", { ascending: false }).limit(1);
    const row = k?.[0];
    if (row?.path) {
      const { data: blob } = await db.storage.from("client-files").download(row.path);
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        if (/\.docx$/i.test(row.file_name ?? row.path)) {
          const img = await letterheadImage(buf);
          if (img && /png|jpe?g/i.test(img.ext)) return { data: new Uint8Array(img.data), png: /png/i.test(img.ext) };
        } else if (/png|jpe?g/i.test(row.mime ?? row.path)) return { data: new Uint8Array(buf), png: /png/i.test(row.mime ?? row.path) };
      }
    }
  } catch {}
  const m = logo && /^data:image\/(png|jpeg);base64,(.+)$/.exec(logo);
  if (m) return { data: new Uint8Array(Buffer.from(m[2], "base64")), png: m[1] === "png" };
  return null;
}

// ------------------------------------------------------------------ PDF

/** Characters the standard PDF fonts can't draw become close equivalents. */
function clean(font: PDFFont, s: string) {
  const ok = new Set(font.getCharacterSet());
  const map: Record<string, string> = { " ": " ", " ": " ", "→": "->", "✓": "x", "☐": "[ ]", "☑": "[x]", "​": "" };
  return Array.from(s)
    .map((ch) => (ok.has(ch.codePointAt(0)!) ? ch : map[ch] ?? (ch.normalize("NFD")[0] && ok.has(ch.normalize("NFD").codePointAt(0)!) ? ch.normalize("NFD")[0] : "")))
    .join("");
}

function wrap(font: PDFFont, size: number, text: string, width: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(t, size) <= width) line = t;
      else {
        if (line) out.push(line);
        line = w;
        while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
    }
    out.push(line);
  }
  return out;
}

const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" });

export async function buildSignedPdf(o: {
  row: SigRow;
  company: string;
  header: { data: Uint8Array; png: boolean } | null;
  signedName: string;
  signedAt: string;
  ip: string;
  agent: string;
  events: SigEvent[];
}) {
  const docId = sha256(`doc:${o.row.id}`).slice(0, 20).toUpperCase(); // never print the link token itself
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${o.row.title} (signed)`);
  pdf.setAuthor(o.company);
  pdf.setProducer("AlzaHR Client Portal");
  pdf.setCreationDate(new Date(o.signedAt));
  const reg = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const ital = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 64, CW = W - M * 2;
  const ink = rgb(0.11, 0.1, 0.1), grey = rgb(0.42, 0.39, 0.37);

  let img: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  if (o.header) {
    try {
      img = o.header.png ? await pdf.embedPng(o.header.data) : await pdf.embedJpg(o.header.data);
    } catch {}
  }

  let page = pdf.addPage([W, H]);
  let y = H - M;
  const pages = [page];
  const top = () => {
    y = H - M;
    if (img) {
      const h = Math.min(56, img.height * (CW / img.width));
      const w = img.width * (h / img.height);
      page.drawImage(img, { x: M, y: y - h + 8, width: w, height: h });
      y -= h + 18;
    } else {
      page.drawText(clean(bold, o.company), { x: M, y: y - 6, size: 15, font: bold, color: ink });
      y -= 34;
    }
  };
  const newPage = () => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    top();
  };
  const need = (h: number) => {
    if (y - h < M + 24) newPage();
  };
  top();

  // body: light markdown (headings, bold markers, bullets)
  for (const raw of o.row.body.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const head = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const text = (head ? head[1] : bullet ? bullet[1] : line).replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
    const allBold = !!head || /^\*\*[^*]+\*\*:?$/.test(line.trim());
    const font = allBold ? bold : reg;
    const size = head ? 13 : 11;
    if (!text.trim()) {
      y -= 8;
      continue;
    }
    const indent = bullet ? 14 : 0;
    const lines = wrap(font, size, clean(font, text), CW - indent);
    if (head) y -= 4;
    for (let i = 0; i < lines.length; i++) {
      need(size + 5);
      if (bullet && i === 0) page.drawText("•", { x: M + 3, y: y - size, size, font: reg, color: ink });
      page.drawText(lines[i], { x: M + indent, y: y - size, size, font, color: ink });
      y -= size + 5;
    }
    y -= 3;
  }

  // signature block
  need(110);
  y -= 18;
  page.drawText("ACCEPTED AND AGREED", { x: M, y: y - 9, size: 9, font: sansB, color: grey });
  y -= 30;
  page.drawText(clean(ital, o.signedName), { x: M, y: y - 22, size: 26, font: ital, color: rgb(0.06, 0.12, 0.35) });
  y -= 30;
  page.drawLine({ start: { x: M, y }, end: { x: M + 260, y }, thickness: 0.8, color: grey });
  y -= 14;
  page.drawText(clean(sans, `${o.row.signer_name} · Signed electronically ${fmtStamp(o.signedAt)}`).replace("·", "-"), { x: M, y, size: 9, font: sans, color: grey });
  y -= 12;
  page.drawText(`Document ID ${docId} · see the signature certificate`.replace(/·/g, "-"), { x: M, y, size: 8, font: sans, color: grey });

  // certificate page
  page = pdf.addPage([W, H]);
  pages.push(page);
  y = H - M;
  page.drawText("Signature certificate", { x: M, y: y - 18, size: 20, font: bold, color: ink });
  y -= 44;
  const row = (k: string, v: string) => {
    const lines = wrap(sans, 10, clean(sans, v), CW - 150);
    page.drawText(k, { x: M, y: y - 10, size: 10, font: sansB, color: grey });
    lines.forEach((l, i) => page.drawText(l, { x: M + 150, y: y - 10 - i * 14, size: 10, font: sans, color: ink }));
    y -= Math.max(1, lines.length) * 14 + 8;
  };
  row("Document", o.row.title);
  row("Company", o.company);
  row("Document ID", docId);
  row("Document SHA-256", o.row.doc_hash);
  row("Signer", `${o.row.signer_name} <${o.row.signer_email}>`);
  row("Signed as", o.signedName);
  row("Signed", fmtStamp(o.signedAt));
  row("IP address", o.ip || "unknown");
  row("Browser", o.agent || "unknown");
  row("Delivery", `Unique signing link emailed to ${o.row.signer_email}`);
  row("Consent", "The signer agreed to use an electronic signature and to receive documents electronically, and typed their name to sign.");
  y -= 10;
  page.drawText("Activity", { x: M, y: y - 12, size: 12, font: bold, color: ink });
  y -= 26;
  for (const e of o.events) {
    if (y < M + 20) {
      page = pdf.addPage([W, H]);
      pages.push(page);
      y = H - M;
    }
    const t = clean(sans, `${fmtStamp(e.at)}  ${e.what}${e.ip ? ` (IP ${e.ip})` : ""}`);
    for (const l of wrap(sans, 9, t, CW)) {
      page.drawText(l, { x: M, y: y - 9, size: 9, font: sans, color: ink });
      y -= 13;
    }
  }

  pages.forEach((p, i) => p.drawText(`${i + 1} of ${pages.length}`, { x: W - M - 40, y: 30, size: 8, font: sans, color: grey }));
  return pdf.save();
}

/** Request details from headers. */
export function who(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  const agent = (req.headers.get("user-agent") ?? "").slice(0, 300);
  return { ip, agent };
}
