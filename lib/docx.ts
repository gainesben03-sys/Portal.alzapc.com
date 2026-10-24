"use client";

// Builds a real Word (.docx) file from a Claude draft, with the client's letterhead in the header.
import { authHeader, BUCKET, LIVE, sb } from "./supabase";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface Letterhead {
  data: ArrayBuffer;
  type: "png" | "jpg" | "gif";
  width: number;
  height: number;
}

const cache = new Map<string, Letterhead | null>();

/** The client's letterhead image, if one has been uploaded (Ben only). */
export async function getLetterhead(clientId: string): Promise<Letterhead | null> {
  if (!LIVE) return null;
  if (cache.has(clientId)) return cache.get(clientId)!;
  try {
    const r = await fetch(`/api/knowledge?clientId=${encodeURIComponent(clientId)}`, { headers: await authHeader() });
    const j = await r.json();
    const lh = j.ok ? (j.docs as { kind: string; path: string }[]).find((d) => d.kind === "letterhead") : null;
    if (!lh) {
      cache.set(clientId, null);
      return null;
    }
    const { data } = await sb().storage.from(BUCKET).download(lh.path);
    if (!data) return null;
    const bmp = await createImageBitmap(data);
    // fit within 6.5in wide x 1.25in tall at 96 dpi
    const scale = Math.min(624 / bmp.width, 120 / bmp.height, 1);
    const ext = lh.path.split(".").pop()!.toLowerCase();
    const out: Letterhead = { data: await data.arrayBuffer(), type: ext === "png" ? "png" : ext === "gif" ? "gif" : "jpg", width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) };
    cache.set(clientId, out);
    return out;
  } catch {
    return null;
  }
}

/** Light markdown (headings, bullets, numbered lists, **bold**) to Word. */
export async function docxBlob(title: string, text: string, clientId?: string): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Header, ImageRun, AlignmentType } = await import("docx");
  const runs = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) =>
      part.startsWith("**") && part.endsWith("**") ? new TextRun({ text: part.slice(2, -2), bold: true }) : new TextRun({ text: part })
    );

  const children: InstanceType<typeof Paragraph>[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      children.push(new Paragraph({ heading: h[1].length === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: runs(h[2]) }));
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: runs(bullet[1]) }));
      continue;
    }
    const num = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (num) {
      children.push(new Paragraph({ spacing: { after: 60 }, indent: { left: 360, hanging: 360 }, children: [new TextRun({ text: `${num[1]}.\t` }), ...runs(num[2])] }));
      continue;
    }
    children.push(new Paragraph({ spacing: { after: 140 }, children: runs(line) }));
  }

  const lh = clientId ? await getLetterhead(clientId) : null;
  const headers = lh
    ? {
        default: new Header({
          children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new ImageRun({ type: lh.type, data: lh.data, transformation: { width: lh.width, height: lh.height } })] })],
        }),
      }
    : undefined;

  const doc = new Document({
    title,
    creator: "AlzaHR",
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: lh ? 1800 : 1200, bottom: 1200, left: 1200, right: 1200 } } }, headers, children }],
  });
  return Packer.toBlob(doc);
}

export function docxName(title: string) {
  return `${title.replace(/[^\w\- ]+/g, "").trim() || "Draft"}.docx`;
}

export async function downloadDocx(title: string, text: string, clientId?: string) {
  const blob = await docxBlob(title, text, clientId);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = docxName(title);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
