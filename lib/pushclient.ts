"use client";

// Browser side of push alerts: device support, sign-up, and small triggers.
import { authHeader, LIVE } from "./supabase";
import type { PushTopic } from "./pushtopics";

const VAPID = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
// a real public key is 87 characters and starts with "B"
const VAPID_OK = /^B[A-Za-z0-9_-]{86}$/.test(VAPID);
export const PUSH_CONFIGURED = LIVE && VAPID_OK;

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
/** "ready": can ask now. "ios-home": iPhone/iPad must add to Home Screen first. "unsupported": this browser can't. */
export function pushSupport(): "ready" | "ios-home" | "unsupported" {
  if (typeof window === "undefined") return "unsupported";
  if (isIOS() && !isStandalone()) return "ios-home";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "ready";
}
export function permission(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function api(body?: Record<string, unknown>) {
  const r = await fetch("/api/push", {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

export async function registerSW() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/** Asks for permission (must be called from a tap) and signs this device up. */
export async function enablePush(): Promise<{ ok: boolean; msg?: string }> {
  if (!PUSH_CONFIGURED) return { ok: false, msg: "Alerts aren't switched on for the portal yet." };
  const support = pushSupport();
  if (support === "ios-home") return { ok: false, msg: "On iPhone, add the portal to your Home Screen first, then turn alerts on from there." };
  if (support === "unsupported") return { ok: false, msg: "This browser can't show alerts. Try Chrome, Edge, Firefox or Safari." };
  const p = await Notification.requestPermission();
  if (p !== "granted") return { ok: false, msg: p === "denied" ? "Alerts are blocked for this site. Allow them in your browser or phone settings, then try again." : "No problem. You can turn alerts on later." };
  const reg = (await registerSW()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) });
  const j = await api({ action: "subscribe", sub: sub.toJSON() });
  if (!j.ok) return { ok: false, msg: j.reason === "no_table" ? "Alerts need one more setup step (005_push.sql in Supabase)." : "Couldn't save this device. Try again." };
  return { ok: true };
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api({ action: "unsubscribe", endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch {}
}

export async function thisDeviceOn() {
  try {
    if (permission() !== "granted") return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export const getPushPrefs = (): Promise<{ ok: boolean; topics?: Partial<Record<PushTopic, boolean>>; devices?: number }> => api().catch(() => ({ ok: false }));
export const savePushPrefs = (topics: Partial<Record<PushTopic, boolean>>) => api({ action: "prefs", topics }).catch(() => ({ ok: false }));
export const testPush = () => api({ action: "test" }).catch(() => ({ ok: false }));

/** Heads-up to Ben from something a client did (fire and forget). */
export function pingBen(title: string, body: string, url: string, topic: "activity" | "hires" = "activity") {
  if (!LIVE) return;
  api({ action: "ben", title, body, url, topic }).catch(() => {});
}

/** Alert a client that Ben assigned something (after it has saved). */
export function pingTask(actionId: string) {
  if (!LIVE) return;
  setTimeout(async () => {
    const j = await api({ action: "task", actionId }).catch(() => null);
    if (j && j.reason === "not_found") setTimeout(() => api({ action: "task", actionId }).catch(() => {}), 4000);
  }, 2500);
}
