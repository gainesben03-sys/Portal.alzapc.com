// Browser-only helpers for logos picked in setup.
import { dominantColor } from "./brand";

/** Read an image and scale it to at most 120px tall so it stays small. */
export function shrinkLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const src = String(r.result);
      if (file.type === "image/svg+xml") return resolve(src);
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, 120 / img.height);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.src = src;
    };
    r.readAsDataURL(file);
  });
}

/** Render a logo on a canvas: a PNG copy (for email) and its main color. */
export function logoInfo(src: string): Promise<{ png?: string; color: string | null }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = reject;
    img.onload = () => {
      const h = 120;
      const w = Math.max(1, Math.round(((img.naturalWidth || img.width || 300) / (img.naturalHeight || img.height || 120)) * h));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      let color: string | null = null;
      let png: string | undefined;
      try {
        color = dominantColor(ctx.getImageData(0, 0, w, h).data);
        png = c.toDataURL("image/png");
      } catch {}
      resolve({ png, color });
    };
    img.src = src;
  });
}
