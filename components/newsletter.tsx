"use client";

import { RefObject, useEffect, useRef } from "react";

// Shown only on screen: lets the 600px email fit a phone and opens links in a new tab.
// Both are removed again before an edited email is saved.
const FIT = `<style id="alza-fit">table[width="600"]{width:100%!important;max-width:600px}img{max-width:100%;height:auto}</style><base id="alza-base" target="_blank">`;

function withFit(html: string) {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${FIT}`);
  return FIT + html;
}

/** The edited email, as clean HTML (without the on-screen helpers). */
export function serializeFrame(frame: HTMLIFrameElement | null): string | null {
  const doc = frame?.contentDocument;
  if (!doc?.documentElement) return null;
  const root = doc.documentElement.cloneNode(true) as HTMLElement;
  root.querySelectorAll("#alza-fit, #alza-base").forEach((el) => el.remove());
  root.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
  return `<!DOCTYPE html>${root.outerHTML}`;
}

/**
 * An email shown safely inside the page: no scripts run, height follows the content.
 * With `editable`, the page can switch it into edit mode (designMode) through frameRef.
 */
export function NewsletterFrame({ html, frameRef, editable, title = "Email" }: { html: string; frameRef?: RefObject<HTMLIFrameElement | null>; editable?: boolean; title?: string }) {
  const own = useRef<HTMLIFrameElement>(null);
  const ref = frameRef ?? own;

  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    let ro: ResizeObserver | null = null;
    const size = () => {
      const d = f.contentDocument;
      if (d?.documentElement) f.style.height = `${Math.max(300, d.documentElement.scrollHeight)}px`;
    };
    const onLoad = () => {
      size();
      const body = f.contentDocument?.body;
      if (body && typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(size);
        ro.observe(body);
      }
    };
    f.addEventListener("load", onLoad);
    if (f.contentDocument?.readyState === "complete") onLoad();
    return () => {
      f.removeEventListener("load", onLoad);
      ro?.disconnect();
    };
  }, [ref, html]);

  return (
    <iframe
      ref={ref}
      className="nl-iframe"
      title={title}
      srcDoc={withFit(html)}
      // no scripts ever run inside; same-origin only so the page can size it (and edit it, for Ben)
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      data-editable={editable ? "1" : undefined}
    />
  );
}
