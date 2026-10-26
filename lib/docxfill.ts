// Server-only: change only the words that need changing inside an existing Word file.
// Everything else (fonts, spacing, letterhead, tables, signature lines, footers) stays exactly as it was.
// Word often splits one phrase across several "runs" (pieces with their own formatting), so a
// replacement is matched across the runs of a paragraph and written into the first run's formatting.
import JSZip from "jszip";

export interface Replacement {
  find: string;
  replace: string;
  why?: string;
}

const PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
const PARA = /<w:p[\s>][\s\S]*?<\/w:p>/g;
const TEXT = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Word's "smart" punctuation vs plain typing shouldn't stop a match. */
const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, " ");

/** The document's text, one paragraph per line (what Claude reads). */
export async function docxParagraphs(buf: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buf);
  const out: string[] = [];
  for (const name of Object.keys(zip.files).filter((n) => PARTS.test(n)).sort((a, b) => (a.includes("document") ? -1 : b.includes("document") ? 1 : a.localeCompare(b)))) {
    const xml = await zip.file(name)!.async("string");
    for (const p of xml.match(PARA) ?? []) {
      const t = Array.from(p.matchAll(TEXT)).map((m) => unesc(m[2])).join("");
      if (t.trim()) out.push(t);
    }
  }
  return out;
}

function replaceInParagraph(p: string, find: string, replace: string): { xml: string; n: number } {
  const runs = Array.from(p.matchAll(TEXT)).map((m) => ({ full: m[0], attrs: m[1] ?? "", text: unesc(m[2]), index: m.index! }));
  if (!runs.length) return { xml: p, n: 0 };
  let texts = runs.map((r) => r.text);
  let n = 0;
  const target = norm(find);
  for (let guard = 0; guard < 20; guard++) {
    const joined = norm(texts.join(""));
    const at = joined.indexOf(target);
    if (at < 0) break;
    const end = at + target.length;
    // locate the runs holding the first and last character of the match
    let si = -1, so = 0, ei = -1, eo = 0, pos = 0;
    for (let i = 0; i < texts.length; i++) {
      const len = texts[i].length;
      if (si < 0 && len > 0 && at >= pos && at < pos + len) { si = i; so = at - pos; }
      if (si >= 0 && ei < 0 && len > 0 && end > pos && end <= pos + len) { ei = i; eo = end - pos; }
      pos += len;
    }
    if (si < 0 || ei < 0) break;
    const next = [...texts];
    if (si === ei) next[si] = texts[si].slice(0, so) + replace + texts[si].slice(eo);
    else {
      next[si] = texts[si].slice(0, so) + replace;
      for (let k = si + 1; k < ei; k++) next[k] = "";
      next[ei] = texts[ei].slice(eo);
    }
    texts = next;
    n++;
    if (replace.includes(find)) break; // don't loop forever on "X" -> "X Jr."
  }
  if (!n) return { xml: p, n: 0 };
  // rebuild the paragraph, writing each run's new text (keeping its formatting)
  let out = "";
  let last = 0;
  runs.forEach((r, i) => {
    out += p.slice(last, r.index);
    const attrs = /xml:space=/.test(r.attrs) ? r.attrs : `${r.attrs} xml:space="preserve"`;
    out += `<w:t${attrs}>${esc(texts[i])}</w:t>`;
    last = r.index + r.full.length;
  });
  out += p.slice(last);
  return { xml: out, n };
}

/** Apply the replacements to every text part of the document. Returns the new file and what matched. */
export async function fillDocx(buf: Buffer, reps: Replacement[]): Promise<{ file: Buffer; applied: (Replacement & { count: number })[] }> {
  const zip = await JSZip.loadAsync(buf);
  const counts = reps.map(() => 0);
  for (const name of Object.keys(zip.files).filter((n) => PARTS.test(n))) {
    let xml = await zip.file(name)!.async("string");
    xml = xml.replace(PARA, (p) => {
      let cur = p;
      reps.forEach((r, i) => {
        if (!r.find || r.find === r.replace) return;
        const res = replaceInParagraph(cur, r.find, r.replace);
        cur = res.xml;
        counts[i] += res.n;
      });
      return cur;
    });
    zip.file(name, xml);
  }
  const file = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { file, applied: reps.map((r, i) => ({ ...r, count: counts[i] })) };
}
