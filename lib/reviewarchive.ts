"use client";

// Review archive: every finished review as a PDF, sorted into folders, zipped for backup
// or for moving into personnel files. Built in the admin's browser from reviews they can
// already open, so nothing extra leaves the server. Review admins only (the page checks).
import { Doc, docOf, fmtDay, hasTranslation, KIND_LABEL, Review, reviewFileName } from "./perform";
import { getLetterhead } from "./docx";

export type ArchiveRange = { from: string; to: string; label: string }; // yyyy-mm-dd, inclusive

const FINISHED = ["final", "shared", "done"];
const FOLDER: Record<Review["kind"], string> = { cycle: "Performance reviews", intro: "New hire reviews", pip: "Improvement plans", adhoc: "Other reviews" };

/** The day a review belongs to, for picking a date range: when it was finalized, else its due date. */
export const reviewDay = (r: Review) => (r.finalAt ?? r.due).slice(0, 10);
export const isArchived = (r: Review) => FINISHED.includes(r.status);
export const inRange = (r: Review, x: ArchiveRange) => r.status !== "cancelled" && reviewDay(r) >= x.from && reviewDay(r) <= x.to;

function signoff(r: Review): string {
  if (r.share?.ackAt) return `Employee confirmed receipt ${fmtDay(r.share.ackAt.slice(0, 10))}`;
  if (r.share?.deliveredAt) return `Delivered in person ${fmtDay(r.share.deliveredAt.slice(0, 10))}`;
  if (r.share) return "Shared, waiting on the employee";
  return "Finalized, not yet shared";
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Build the zip. Calls back with progress so the button can show it. */
export async function buildArchive(o: {
  clientId: string;
  company: string;
  logo?: string;
  reviews: Review[];
  range: ArchiveRange;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ blob: Blob; name: string; files: number; skipped: number }> {
  const [{ default: JSZip }, pdf] = await Promise.all([import("jszip"), import("pdf-lib")]);
  const zip = new JSZip();
  const top = `${o.company} - Reviews - ${o.range.label}`.replace(/[\\/:*?"<>|]+/g, "");
  const root = zip.folder(top)!;
  const pick = o.reviews.filter((r) => inRange(r, o.range)).sort((a, b) => a.name.localeCompare(b.name) || reviewDay(a).localeCompare(reviewDay(b)));
  const done = pick.filter(isArchived);
  const head = await headerImage(o.clientId, o.logo);
  const used = new Set<string>();
  const rows: string[][] = [["Employee", "Title", "Manager", "Type", "Review period", "Due", "Overall", "Finalized", "Sign-off", "Employee comment", "File"]];

  let n = 0;
  for (const r of pick) {
    const type = KIND_LABEL[r.kind].en;
    const base = [r.name, r.title, r.managerName, type, `${fmtDay(r.periodStart)} - ${fmtDay(r.periodEnd)}`, fmtDay(r.due)];
    if (!isArchived(r)) {
      rows.push([...base, "", "", "Not finished, not included", "", ""]);
      continue;
    }
    const folder = FOLDER[r.kind];
    let name = reviewFileName(r);
    for (let i = 2; used.has(`${folder}/${name}`); i++) name = `${reviewFileName(r)} (${i})`;
    used.add(`${folder}/${name}`);
    const files: string[] = [];
    const en = await reviewPdf(pdf, docOf(r, o.company, "en"), r, head);
    root.file(`${folder}/${name}.pdf`, en);
    files.push(`${folder}/${name}.pdf`);
    if (r.lang === "es" || hasTranslation(r, "es")) {
      root.file(`${folder}/${name} (Español).pdf`, await reviewPdf(pdf, docOf(r, o.company, "es"), r, head));
      files.push(`${folder}/${name} (Español).pdf`);
    }
    const scale = r.template.scale;
    rows.push([...base, r.overall ? `${r.overall} of ${scale}` : "", r.finalAt ? fmtDay(r.finalAt.slice(0, 10)) : "", signoff(r), r.share?.comment ? "Yes" : "No", files.join(" ; ")]);
    o.onProgress?.(++n, done.length);
  }
  root.file("Index.csv", "\ufeff" + rows.map((row) => row.map((c) => csvCell(String(c ?? ""))).join(",")).join("\r\n"));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return { blob, name: `${top}.zip`, files: done.length, skipped: pick.length - done.length };
}

// ------------------------------------------------------------------ the PDF

type PdfLib = typeof import("pdf-lib");
type Head = { bytes: ArrayBuffer; png: boolean; w: number; h: number } | null;

async function headerImage(clientId: string, logo?: string): Promise<Head> {
  try {
    const lh = await getLetterhead(clientId);
    if (lh && lh.type !== "gif") return { bytes: lh.data, png: lh.type === "png", w: lh.width, h: lh.height };
  } catch {}
  if (!logo) return null;
  try {
    const res = await fetch(logo);
    const type = res.headers.get("content-type") ?? "";
    if (!/png|jpe?g/.test(type) && !/\.(png|jpe?g)$/i.test(logo)) return null;
    const bytes = await res.arrayBuffer();
    const bmp = await createImageBitmap(new Blob([bytes]));
    const scale = Math.min(180 / bmp.width, 44 / bmp.height, 1);
    return { bytes, png: /png/.test(type) || /\.png$/i.test(logo), w: bmp.width * scale, h: bmp.height * scale };
  } catch {
    return null;
  }
}

async function reviewPdf(lib: PdfLib, d: Doc, r: Review, head: Head): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = lib;
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.title} - ${d.name}`);
  doc.setAuthor(d.company);
  doc.setSubject("Personnel record");
  doc.setCreator("AlzaHR portal");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ok = new Set(font.getCharacterSet());
  const clean = (s: string) =>
    Array.from(String(s ?? "").replace(/[\u2028\u2029]/g, "\n"))
      .map((ch) => (ch === "\n" || ok.has(ch.codePointAt(0)!) ? ch : ({ "→": "->", "✓": "x", "\u00a0": " ", "\u202f": " " } as Record<string, string>)[ch] ?? (ok.has(ch.normalize("NFD").codePointAt(0)!) ? ch.normalize("NFD")[0] : "")))
      .join("");

  const W = 612, H = 792, M = 54, CW = W - M * 2;
  const ink = rgb(0.1, 0.16, 0.24), soft = rgb(0.33, 0.38, 0.45), line = rgb(0.86, 0.84, 0.8);
  let page = doc.addPage([W, H]);
  let y = H - M;

  const wrap = (t: string, f: typeof font, size: number, width: number) => {
    const out: string[] = [];
    for (const para of clean(t).split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(""); continue; }
      let cur = "";
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (f.widthOfTextAtSize(next, size) <= width) cur = next;
        else { if (cur) out.push(cur); cur = w; }
      }
      out.push(cur);
    }
    return out;
  };
  const need = (h: number) => { if (y - h < M + 24) { page = doc.addPage([W, H]); y = H - M; } };
  const text = (t: string, o: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) => {
    const size = o.size ?? 10.5, f = o.f ?? font, x = o.x ?? M, lh = size * 1.4;
    for (const l of wrap(t, f, size, o.width ?? CW - (x - M))) {
      need(lh);
      page.drawText(l, { x, y: y - size, size, font: f, color: o.color ?? ink });
      y -= lh;
    }
    y -= o.gap ?? 0;
  };
  const heading = (t: string) => { y -= 8; need(34); text(t.toUpperCase(), { size: 9, f: bold, color: soft, gap: 4 }); };
  const rule = () => { need(10); page.drawLine({ start: { x: M, y: y - 2 }, end: { x: W - M, y: y - 2 }, thickness: 0.6, color: line }); y -= 10; };

  // header: letterhead or logo, else the company name
  if (head) {
    try {
      const img = head.png ? await doc.embedPng(head.bytes) : await doc.embedJpg(head.bytes);
      const s = Math.min(CW / img.width, 60 / img.height);
      page.drawImage(img, { x: M, y: y - img.height * s, width: img.width * s, height: img.height * s });
      y -= img.height * s + 14;
    } catch { text(d.company, { size: 12, f: bold, gap: 6 }); }
  } else text(d.company, { size: 12, f: bold, gap: 6 });
  text(d.title, { size: 18, f: bold, gap: 6 });

  const es = d.lang === "es";
  const L = (en: string, s: string) => (es ? s : en);
  const meta: [string, string][] = [
    [L("Employee", "Empleado/a"), `${d.name}${d.jobTitle ? `, ${d.jobTitle}` : ""}`],
    ...(d.department ? [[L("Department", "Departamento"), d.department] as [string, string]] : []),
    [L("Manager", "Gerente"), d.manager],
    ...(d.hireDate ? [[L("Hire date", "Fecha de ingreso"), fmtDay(d.hireDate, d.lang)] as [string, string]] : []),
    [L("Review period", "Periodo"), d.period],
    [L("Date", "Fecha"), d.date],
    ...(d.format ? [[L("Format", "Formato"), d.format] as [string, string]] : []),
  ];
  for (const [k, v] of meta) {
    need(15);
    page.drawText(clean(k), { x: M, y: y - 10, size: 9.5, font: bold, color: soft });
    const lines = wrap(v, font, 10.5, CW - 110);
    lines.forEach((l, i) => { if (i) need(14); page.drawText(l, { x: M + 110, y: y - 10, size: 10.5, font, color: ink }); y -= 14.5; });
  }
  y -= 4;
  rule();

  if (d.rated.length) {
    heading(L("Ratings", "Calificaciones"));
    for (const x of d.rated) {
      need(16);
      page.drawText(clean(x.name), { x: M, y: y - 10.5, size: 10.5, font: bold, color: ink });
      const v = clean(`${x.value} · ${x.label}`);
      page.drawText(v, { x: W - M - font.widthOfTextAtSize(v, 10.5), y: y - 10.5, size: 10.5, font, color: ink });
      y -= 15;
      if (x.note) text(x.note, { size: 9.5, color: soft, x: M + 12, gap: 2 });
    }
    if (d.overall) {
      need(20); y -= 2;
      page.drawText(L("Overall", "General"), { x: M, y: y - 11, size: 11, font: bold, color: ink });
      const v = clean(`${d.overall.value} · ${d.overall.label}`);
      page.drawText(v, { x: W - M - bold.widthOfTextAtSize(v, 11), y: y - 11, size: 11, font: bold, color: ink });
      y -= 18;
    }
  }
  for (const w of d.written) { heading(w.q); text(w.a, { gap: 2 }); }
  if (d.pip) {
    heading(L("What needs to change", "Qué necesita cambiar"));
    d.pip.issues.forEach((i, k) => {
      text(`${k + 1}. ${i.what}`, { f: bold });
      text(`${L("Expected", "Se espera")}: ${i.expected}`, { x: M + 12 });
      text(`${L("Support", "Apoyo")}: ${i.support}`, { x: M + 12, gap: 4 });
    });
    heading(L("Timeline", "Plazos"));
    text(`${L("Starts", "Empieza")} ${fmtDay(d.pip.start, d.lang)}, ${d.pip.length} ${L("days", "días")}.`);
    for (const c of d.pip.checkins) text(`• ${L("Check-in", "Seguimiento")}: ${fmtDay(c.date, d.lang)}`, { x: M + 12 });
    heading(L("At the end of the plan", "Al final del plan"));
    text(d.pip.outcome);
  }
  if (d.goals.length) {
    heading(L("Goals for the next review", "Metas para la próxima evaluación"));
    for (const g of d.goals) text(`• ${g.text}${g.measure ? ` (${g.measure})` : ""}${g.by ? `, ${L("by", "para")} ${g.by}` : ""}`, { x: M + 6 });
  }
  if (d.comment) { heading(L("Employee comment", "Comentario del empleado/a")); text(d.comment); }

  // sign-off block
  y -= 10; need(110); rule();
  text(d.ackText, { size: 9.5, color: soft, gap: 8 });
  const sign: [string, string][] = [
    [L("Manager finalized", "Gerente finalizó"), d.managerDone || "-"],
    [r.share?.how === "person" ? L("Delivered in person", "Entregada en persona") : L("Employee confirmed receipt", "Empleado/a confirmó recibo"), d.ack || L("Not yet", "Todavía no")],
  ];
  for (const [k, v] of sign) {
    need(16);
    page.drawText(clean(k), { x: M, y: y - 10, size: 10, font: bold, color: ink });
    page.drawText(clean(v), { x: M + 180, y: y - 10, size: 10, font, color: ink });
    y -= 16;
  }

  // footer on every page
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const f = clean(`${d.name} · ${d.title} · ${L("Confidential personnel record", "Registro de personal confidencial")} · ${i + 1}/${pages.length}`);
    p.drawText(f, { x: M, y: 30, size: 8, font, color: soft });
  });
  return doc.save();
}
