"use client";

import { useEffect, useRef, useState } from "react";
import { videoEmbed, ViewKind } from "@/lib/viewkind";

/** Shows a training inside the portal: our own PDF reader, Microsoft's viewer for PowerPoint/Word, or a video player. */
export function DocViewer({ url, kind, title }: { url: string; kind: ViewKind; title: string }) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", k);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", k);
    };
  }, [full]);

  const body =
    kind === "pdf" ? (
      <PdfPages url={url} title={title} />
    ) : kind === "office" ? (
      <iframe className="dv-frame dv-office" title={title} src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`} allowFullScreen />
    ) : kind === "video" ? (
      <iframe className="dv-frame dv-video" title={title} src={videoEmbed(url) ?? url} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
    ) : (
      <div className="card small">This one is a link. <a href={url} target="_blank" rel="noopener noreferrer">Open it</a></div>
    );

  if (kind === "link") return body;
  return (
    <div className={`dv ${full ? "dv-full" : ""}`}>
      <div className="dv-bar">
        <b className="small ellipsis grow">{title}</b>
        <button className="btn sm" style={{ whiteSpace: "nowrap", flex: "none" }} onClick={() => setFull(!full)}>{full ? "Close" : "⤢ Full screen"}</button>
      </div>
      {body}
    </div>
  );
}

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => void };
type PdfPage = { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas: HTMLCanvasElement }) => { promise: Promise<void> } };

/** Renders each page to a canvas at the width of the screen. No download button. */
function PdfPages({ url, title }: { url: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [err, setErr] = useState("");
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let gone = false;
    let d: PdfDoc | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        d = (await pdfjs.getDocument({ url }).promise) as unknown as PdfDoc;
        if (gone) d.destroy();
        else setDoc(d);
      } catch {
        if (!gone) setErr("Couldn't load this file. Try again in a minute.");
      }
    })();
    return () => {
      gone = true;
      d?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => setWidth(Math.floor(el.clientWidth)), 120);
    });
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, []);

  // which page is on screen
  useEffect(() => {
    const el = box.current;
    if (!el || !doc) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setPage(Number((e.target as HTMLElement).dataset.n))), { root: el.closest(".dv-full") ? el : null, threshold: 0.5 });
    el.querySelectorAll("canvas").forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [doc, width]);

  return (
    <div className="dv-pdf" ref={box} onContextMenu={(e) => e.preventDefault()} aria-label={title}>
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      {!doc && !err && <p className="small muted" style={{ textAlign: "center", padding: 30 }}>Loading…</p>}
      {doc && width > 0 && Array.from({ length: doc.numPages }, (_, i) => <PdfCanvas key={`${i}-${width}`} doc={doc} n={i + 1} width={width} />)}
      {doc && doc.numPages > 1 && <span className="dv-count tiny">{page} / {doc.numPages}</span>}
    </div>
  );
}

function PdfCanvas({ doc, n, width }: { doc: PdfDoc; n: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let gone = false;
    (async () => {
      const p = await doc.getPage(n);
      const c = ref.current;
      if (gone || !c) return;
      const base = p.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: (width / base.width) * dpr });
      c.width = vp.width;
      c.height = vp.height;
      c.style.width = `${width}px`;
      c.style.height = `${(vp.height / dpr).toFixed(0)}px`;
      const ctx = c.getContext("2d");
      if (ctx) await p.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise.catch(() => undefined);
    })();
    return () => {
      gone = true;
    };
  }, [doc, n, width]);
  return <canvas ref={ref} data-n={n} className="dv-page" />;
}
