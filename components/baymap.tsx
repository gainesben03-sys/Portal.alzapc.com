"use client";

// A drawn map of the San Francisco Bay Area with numbered pins. Light, simple, no map service.
// Coordinates come from lib/properties project(); the view grows to fit pins outside the core Bay.

export type MapPin = { key: string; n: string; x: number; y: number; color: string; label: string; onClick: () => void };

const BAY =
  "M147 188 L144 170 L137 159 L145 163 L153 162 L160 158 L164 150 L155 127 L151 121 L142 104 L150 97 L160 92 L152 80 L137 40 L140 25 L160 17 L195 22 L228 29 L242 40 L256 52 L275 56 L297 64 L330 66 L330 74 L297 72 L265 62 L240 72 L222 78 L201 81 L185 92 L169 107 L176 120 L183 127 L192 139 L205 146 L219 150 L224 165 L228 179 L224 188 L219 196 L232 200 L250 203 L262 212 L272 228 L268 240 L263 254 L283 260 L301 300 L310 329 L333 364 L374 410 L356 416 L315 399 L290 382 L269 364 L255 352 L242 338 L228 326 L212 316 L196 306 L194 290 L192 272 L189 254 L201 246 L194 234 L189 220 L186 205 L178 198 L164 199 L155 197 L147 196 Z";
const OCEAN = "M-200 -200 L46 -200 L46 87 L73 144 L100 168 L123 194 L140 191 L147 190 L147 194 L131 214 L136 251 L141 306 L130 352 L141 375 L164 399 L183 520 L230 700 L-200 700 Z";
const COAST = "M46 -200 L46 87 L73 144 L100 168 L123 194 L140 191 L147 190 M147 194 L131 214 L136 251 L141 306 L130 352 L141 375 L164 399 L183 520 L230 700";

/** The view box: the core Bay, grown (keeping its shape) to fit every pin with a margin. */
function viewFor(pins: { x: number; y: number }[]) {
  let [x0, y0, x1, y1] = [90, 90, 400, 380];
  for (const p of pins) {
    x0 = Math.min(x0, p.x - 24);
    y0 = Math.min(y0, p.y - 24);
    x1 = Math.max(x1, p.x + 24);
    y1 = Math.max(y1, p.y + 24);
  }
  const ratio = 310 / 290;
  let w = x1 - x0;
  let h = y1 - y0;
  if (w / h < ratio) {
    const nw = h * ratio;
    x0 -= (nw - w) / 2;
    w = nw;
  } else {
    const nh = w / ratio;
    y0 -= (nh - h) / 2;
    h = nh;
  }
  return { x0, y0, w, h };
}

export function BayMap({ pins }: { pins: MapPin[] }) {
  const v = viewFor(pins);
  const k = v.w / 310; // labels and lines scale with the zoom
  return (
    <div className="bm">
      <svg viewBox={`${v.x0} ${v.y0} ${v.w} ${v.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <rect x={v.x0} y={v.y0} width={v.w} height={v.h} fill="#f5f1e8" />
        <g stroke="#ebe4d6" strokeWidth={0.6 * k}>
          {Array.from({ length: 20 }, (_, i) => Math.floor(v.x0 / 40) * 40 + i * 40).map((x) => <line key={`x${x}`} x1={x} y1={v.y0} x2={x} y2={v.y0 + v.h} />)}
          {Array.from({ length: 20 }, (_, i) => Math.floor(v.y0 / 40) * 40 + i * 40).map((y) => <line key={`y${y}`} x1={v.x0} y1={y} x2={v.x0 + v.w} y2={y} />)}
        </g>
        <path d={OCEAN} fill="#d3e4ef" />
        <path d={BAY} fill="#d3e4ef" stroke="#9fbcd2" strokeWidth={0.9 * k} strokeLinejoin="miter" />
        <path d={COAST} fill="none" stroke="#9fbcd2" strokeWidth={0.9 * k} strokeLinejoin="miter" />
        <g fill="#f5f1e8" stroke="#9fbcd2" strokeWidth={0.8 * k}>
          <path d="M225 213 L238 211 L250 212 L258 218 L262 224 L257 233 L245 232 L232 228 Z" />
          <path d="M193 186 L199 185 L201 192 L196 195 Z" />
          <path d="M163 163 L170 160 L176 165 L172 172 L165 171 Z" />
          <circle cx="172" cy="187" r="1.4" />
        </g>
        <g fill="none" stroke="#e3d7c2" strokeWidth={1.1 * k} strokeLinecap="round" strokeLinejoin="round">
          <path d="M147 188 L140 170 L138 140 L138 105 L130 60 L120 -40" />
          <path d="M224 188 L230 165 L226 150 L205 105 L250 72 L265 64 L330 40" />
          <path d="M240 205 L290 255 L318 318 L350 372 L420 470" />
          <path d="M240 205 L300 232 L420 255" />
          <path d="M180 215 L185 258 L205 320 L262 372 L310 405 L400 460" />
          <path d="M172 232 L165 280 L180 330 L225 375 L260 395 L380 470" />
        </g>
        <g fill="none" stroke="#7d92a8" strokeWidth={1.2 * k} strokeLinecap="round">
          <path d="M147 187 L147 197" />
          <path d="M186 205 L196 191 L224 188" />
          <path d="M151 121 L183 127" />
          <path d="M242 338 L301 303" />
          <path d="M306 387 L322 368" />
        </g>
        <g fontFamily="Inter, system-ui, sans-serif" fontSize={6 * k} fontWeight={600} letterSpacing={1.2 * k} fill="#9a9285">
          <text x="100" y="130">MARIN</text>
          <text x="292" y="150">EAST BAY</text>
          <text x="196" y="372">PENINSULA</text>
          <text x="370" y="440">SOUTH BAY</text>
        </g>
        <g fontFamily="Inter, system-ui, sans-serif" fontSize={5.5 * k} fontStyle="italic" fill="#6f93ae">
          <text x="96" y="300">Pacific Ocean</text>
          <text x="180" y="62">San Pablo Bay</text>
          <text x="228" y="262" transform="rotate(58 228 262)">San Francisco Bay</text>
          <text x="112" y="186">Golden Gate</text>
        </g>
        <g fontFamily="Inter, system-ui, sans-serif" fontSize={5.5 * k} fill="#6e675d">
          <text x="140" y="272">San Francisco</text>
          <text x="272" y="182">Oakland</text>
          <text x="238" y="160">Berkeley</text>
          <text x="222" y="357">San Mateo</text>
          <text x="296" y="282">Hayward</text>
          <text x="318" y="398">Palo Alto</text>
          <text x="146" y="112">San Rafael</text>
          <text x="174" y="135">Richmond</text>
          <text x="410" y="476">San Jose</text>
        </g>
      </svg>
      {pins.map((p) => (
        <button
          key={p.key}
          className="bm-pin"
          aria-label={p.label}
          title={p.label}
          onClick={p.onClick}
          style={{ left: `${((p.x - v.x0) / v.w) * 100}%`, top: `${((p.y - v.y0) / v.h) * 100}%`, background: p.color }}
        >
          {p.n}
        </button>
      ))}
    </div>
  );
}
