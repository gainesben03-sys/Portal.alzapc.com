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
  if (["txt", "md", "csv"].includes(ext) || mime.startsWith("text/")) return buf.toString("utf8");
  return "";
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

