// Break an email into its words and links, so Claude can rewrite the words while the layout,
// colors and code stay exactly as they were. Works on the table-based HTML our newsletters use.

export interface Segment {
  id: number;
  kind: "text" | "link";
  text: string; // decoded text, or the link URL
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", middot: "·", darr: "↓", rarr: "→", larr: "←", uarr: "↑", mdash: "—", ndash: "–", hellip: "…", copy: "©", reg: "®", trade: "™", bull: "•" };
export function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const encodeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
const encodeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

type Ref = { part: number; kind: "text" | "link"; lead: string; trail: string; attr?: string };

/** Split into parts (tags and text) and pick out the editable pieces. */
export function splitEmail(html: string) {
  const parts = html.split(/(<[^>]*>)/);
  const refs: Ref[] = [];
  const segs: Segment[] = [];
  let skip: string | null = null; // inside <style>, <script> or <head>-only bits
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith("<")) {
      const tag = /^<\s*(\/)?\s*([a-z0-9]+)/i.exec(p);
      const name = tag?.[2]?.toLowerCase();
      if (name && ["style", "script"].includes(name)) skip = tag![1] ? null : name;
      const href = /\bhref\s*=\s*"(https?:\/\/[^"]+)"/i.exec(p);
      if (href && !skip) {
        refs.push({ part: i, kind: "link", lead: "", trail: "", attr: href[1] });
        segs.push({ id: segs.length, kind: "link", text: decode(href[1]) });
      }
      continue;
    }
    if (skip || !p) continue;
    const text = decode(p);
    if (!text.replace(/[\s ]/g, "")) continue;
    const lead = /^[\s]*/.exec(p)![0];
    const trail = /[\s]*$/.exec(p)![0];
    refs.push({ part: i, kind: "text", lead, trail });
    segs.push({ id: segs.length, kind: "text", text: text.trim() });
  }
  return { parts, refs, segs };
}

/** Put new words (and links) back. Ids not in `changes` keep their original text. */
export function joinEmail(split: ReturnType<typeof splitEmail>, changes: Record<string, string>) {
  const parts = [...split.parts];
  split.refs.forEach((r, id) => {
    const v = changes[String(id)];
    if (v === undefined) return;
    const clean = String(v).replace(/\s*\u2014\s*/g, ", ");
    if (r.kind === "link") {
      if (/^https?:\/\/[^\s"<>]+$/i.test(clean.trim())) parts[r.part] = parts[r.part].replace(`"${r.attr}"`, `"${encodeAttr(clean.trim())}"`);
    } else {
      parts[r.part] = r.lead + encodeText(clean.trim()) + r.trail;
    }
  });
  return parts.join("");
}

/** Plain text view for the prompt: [id] text, with links marked. */
export function segmentsForPrompt(segs: Segment[]) {
  return segs.map((s) => (s.kind === "link" ? `[${s.id}] (link) ${s.text}` : `[${s.id}] ${s.text}`)).join("\n");
}
