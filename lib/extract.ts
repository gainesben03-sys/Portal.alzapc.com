// Server-only: read text out of uploaded documents.
import JSZip from "jszip";

export async function extractText(buf: Buffer, name: string, mime: string): Promise<string> {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" || mime === "application/pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfText(pdf, { mergePages: true });
    return String(text);
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }
  if (ext === "pptx") return pptxText(buf);
  if (["txt", "md", "csv"].includes(ext) || mime.startsWith("text/")) return buf.toString("utf8");
  return "";
}

/** Slide text, in order, with the speaker notes. One block per slide. */
export async function pptxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const num = (f: string) => Number(f.match(/(\d+)\.xml$/)?.[1] ?? 0);
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => num(a) - num(b));
  const paras = (xml: string) =>
    (xml.match(/<a:p>[\s\S]*?<\/a:p>|<a:p [\s\S]*?<\/a:p>/g) ?? [])
      .map((p) => (p.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map((t) => t.replace(/<\/?a:t>/g, "")).join(""))
      .map((t) => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim())
      .filter(Boolean);
  const out: string[] = [];
  for (const f of slides) {
    const n = num(f);
    const body = paras(await zip.file(f)!.async("string"));
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
    const notes = notesFile ? paras(await notesFile.async("string")).filter((t) => !/^\d+$/.test(t)) : [];
    out.push(`--- Slide ${n} ---\n${body.join("\n")}${notes.length ? `\n[Speaker notes] ${notes.join(" ")}` : ""}`);
  }
  return out.join("\n\n");
}

/** Pull the header image out of a Word letterhead (falls back to the first image in the file). */
export async function letterheadImage(buf: Buffer): Promise<{ data: Buffer; ext: string } | null> {
  const zip = await JSZip.loadAsync(buf);
  const relFiles = Object.keys(zip.files).filter((f) => /^word\/_rels\/header\d*\.xml\.rels$/.test(f));
  for (const rf of relFiles) {
    const xml = await zip.file(rf)!.async("string");
    const m = xml.match(/Target="(media\/[^"]+\.(png|jpe?g|gif))"/i);
    if (m) {
      const f = zip.file(`word/${m[1]}`);
      if (f) return { data: Buffer.from(await f.async("uint8array")), ext: m[2].toLowerCase() };
    }
  }
  const media = Object.keys(zip.files).find((f) => /^word\/media\/.+\.(png|jpe?g|gif)$/i.test(f));
  if (!media) return null;
  return { data: Buffer.from(await zip.file(media)!.async("uint8array")), ext: media.split(".").pop()!.toLowerCase() };
}

