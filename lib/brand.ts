// Client branding shared by the workspace and the emails.

export function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** The brand color, darkened only as much as needed to read as text on white (4.5:1). */
export function readableInk(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#19283c";
  const n = parseInt(m[1], 16);
  let [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  for (let i = 0; i < 40; i++) {
    const h = toHex(r, g, b);
    if (1.05 / (luminance(h) + 0.05) >= 4.5) return h;
    r *= 0.92;
    g *= 0.92;
    b *= 0.92;
  }
  return toHex(r, g, b);
}

/** Pick the main color of a logo from its pixels (RGBA). Ignores white, near-white and transparent areas; favors saturated colors. */
export function dominantColor(px: Uint8ClampedArray): string | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number; sat: number }>();
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
    if (a < 200) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (min > 225) continue; // white / paper
    const sat = max === 0 ? 0 : (max - min) / max;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const k = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, sat };
    k.n++;
    k.r += r;
    k.g += g;
    k.b += b;
    buckets.set(key, k);
  }
  let best: { n: number; r: number; g: number; b: number; sat: number } | null = null;
  let score = 0;
  for (const k of Array.from(buckets.values())) {
    const s = k.n * (0.25 + k.sat);
    if (s > score) {
      score = s;
      best = k;
    }
  }
  return best ? toHex(best.r / best.n, best.g / best.n, best.b / best.n) : null;
}

/** Where emails load the logo from. Email apps can't show logos stored inside the page, so those are served from the portal. */
export function emailLogoUrl(clientId: string, logo: string | undefined, logoEmail: string | undefined, portalUrl: string) {
  if (logoEmail || (logo && logo.startsWith("data:image/") && !logo.startsWith("data:image/svg"))) {
    const src = logoEmail || logo!;
    let h = 0;
    for (let i = 0; i < src.length; i += 97) h = (h * 31 + src.charCodeAt(i)) | 0;
    return `${portalUrl}/api/logo/${encodeURIComponent(clientId)}?v=${(h >>> 0).toString(36)}`;
  }
  if (logo && /^https?:\/\//.test(logo) && !/\.svg(\?|$)/i.test(logo)) return logo;
  if (logo && logo.startsWith("/") && !/\.svg(\?|$)/i.test(logo)) return portalUrl + logo;
  return undefined;
}
