"use client";

// Shows what someone typed in the reader's language, with a way to see the original.
// Translations are batched, cached in the browser for the session, and skipped when the
// text is already in the reader's language (the server returns it unchanged).
import { useEffect, useState } from "react";
import { authHeader, LIVE } from "@/lib/supabase";

type Lang = "en" | "es";
const mem = new Map<string, string>();
const k = (t: string, to: Lang) => `${to}\u0000${t}`;
let queue: { t: string; to: Lang; done: (v: string) => void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const batch = queue;
  queue = [];
  for (const to of ["en", "es"] as Lang[]) {
    const items = batch.filter((q) => q.to === to);
    for (let i = 0; i < items.length; i += 40) {
      const part = items.slice(i, i + 40);
      const texts = [...new Set(part.map((p) => p.t))];
      (async () => {
        try {
          const r = await fetch("/api/tr", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ texts, to }) }).then((x) => x.json());
          texts.forEach((t, j) => mem.set(k(t, to), r.ok ? r.out[j] ?? t : t));
        } catch {
          texts.forEach((t) => mem.set(k(t, to), t));
        }
        part.forEach((p) => p.done(mem.get(k(p.t, to)) ?? p.t));
      })();
    }
  }
}

/** The text in this language (the original until the translation arrives). */
export function useTranslated(text: string, to: Lang, on = true): { text: string; changed: boolean; busy: boolean } {
  const t = (text ?? "").trim();
  const [v, setV] = useState<string | undefined>(() => mem.get(k(t, to)));
  useEffect(() => {
    if (!on || !LIVE || !t || t.length < 3) return setV(undefined);
    const hit = mem.get(k(t, to));
    if (hit !== undefined) return setV(hit);
    setV(undefined);
    let live = true;
    queue.push({ t, to, done: (x) => live && setV(x) });
    if (!timer) timer = setTimeout(flush, 60);
    return () => { live = false; };
  }, [t, to, on]);
  const out = v ?? t;
  return { text: out, changed: !!v && v.trim() !== t, busy: on && LIVE && t.length >= 3 && v === undefined };
}

export function TrText({ text, to, as = "p", className, on = true }: { text: string; to: Lang; as?: "p" | "span" | "div"; className?: string; on?: boolean }) {
  const r = useTranslated(text, to, on);
  const [orig, setOrig] = useState(false);
  const Tag = as;
  return (
    <Tag className={className}>
      {orig || !r.changed ? text : r.text}
      {r.changed && (
        <button type="button" className="tr-toggle" onClick={() => setOrig(!orig)}>
          {orig ? (to === "es" ? "Ver traducción" : "Show translation") : to === "es" ? "Traducido · ver original" : "Translated · show original"}
        </button>
      )}
    </Tag>
  );
}
