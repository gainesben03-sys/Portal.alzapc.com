// How a library item shows inside the portal (no download needed).
export type ViewKind = "pdf" | "office" | "video" | "link";

export function viewKind(name: string, url?: string): ViewKind {
  const ext = (name || "").toLowerCase().split("?")[0].split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (["pptx", "ppt", "docx", "doc", "xlsx", "xls"].includes(ext)) return "office";
  if (!name && url) {
    if (/\.pdf(\?|$)/i.test(url)) return "pdf";
    if (videoEmbed(url)) return "video";
  }
  return "link";
}

/** An embeddable player for YouTube, Vimeo and Loom links. */
export function videoEmbed(url: string): string | null {
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0`;
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  m = url.match(/loom\.com\/(?:share|embed)\/([\w-]+)/i);
  if (m) return `https://www.loom.com/embed/${m[1]}`;
  return null;
}
