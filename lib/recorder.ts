"use client";

// Recording and sending a pitch, built to survive real phones and bad connections:
// - picks a format the browser can actually record (MP4 first, so it plays everywhere)
// - caps length and bitrate, so files stay small (about 10-18 MB for 90 seconds)
// - keeps the finished recording on the device until the server confirms it arrived
// - uploads straight to private storage with progress, waits out dropped connections, and retries

export type PitchKind = "video" | "audio";

const VIDEO_TYPES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
const AUDIO_TYPES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export function canRecord(kind: PitchKind) {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined" && !!pickType(kind);
}

export function pickType(kind: PitchKind): string {
  if (typeof MediaRecorder === "undefined") return "";
  const list = kind === "video" ? VIDEO_TYPES : AUDIO_TYPES;
  for (const t of list) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {}
  }
  return "";
}

export async function openStream(kind: PitchKind): Promise<MediaStream> {
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (kind === "audio") return navigator.mediaDevices.getUserMedia({ audio });
  try {
    return await navigator.mediaDevices.getUserMedia({ audio, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } });
  } catch (e) {
    // some cameras reject the size hints; try plain
    if ((e as DOMException)?.name === "OverconstrainedError") return navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: "user" } });
    throw e;
  }
}

export function stopStream(s?: MediaStream | null) {
  s?.getTracks().forEach((t) => t.stop());
}

/** Plain-language help for camera/mic errors. */
export function mediaError(e: unknown, kind: PitchKind): string {
  const name = (e as DOMException)?.name ?? "";
  const what = kind === "video" ? "camera and microphone" : "microphone";
  if (name === "NotAllowedError" || name === "SecurityError")
    return `Your browser blocked the ${what}. Tap the camera icon or "aA" in the address bar (or your phone's Settings for this browser) and allow access, then try again. You can also upload a video instead.`;
  if (name === "NotFoundError" || name === "OverconstrainedError") return `We couldn't find a ${what} on this device. Try another device, or upload a video instead.`;
  if (name === "NotReadableError") return `Another app is using your ${what}. Close it (video calls especially) and try again.`;
  return `We couldn't start your ${what}. Try again, or upload a video instead.`;
}

export interface Recording {
  blob: Blob;
  mime: string;
  seconds: number;
}

/** Records from a live stream until stop() or the time limit. */
export function startRecording(stream: MediaStream, kind: PitchKind, maxSeconds: number, onTick: (s: number) => void): { stop: () => void; done: Promise<Recording> } {
  const type = pickType(kind);
  const opts: MediaRecorderOptions = type ? { mimeType: type } : {};
  if (kind === "video") {
    opts.videoBitsPerSecond = 1_400_000;
    opts.audioBitsPerSecond = 96_000;
  } else opts.audioBitsPerSecond = 96_000;
  const rec = new MediaRecorder(stream, opts);
  const chunks: Blob[] = [];
  const t0 = Date.now();
  let stopped = false;
  const tick = setInterval(() => {
    const s = (Date.now() - t0) / 1000;
    onTick(s);
    if (s >= maxSeconds) stop();
  }, 200);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(tick);
    try {
      if (rec.state !== "inactive") rec.stop();
    } catch {}
  };
  const done = new Promise<Recording>((resolve, reject) => {
    rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    rec.onerror = (e) => reject((e as unknown as { error?: Error }).error ?? new Error("recording failed"));
    rec.onstop = () => {
      const mime = (rec.mimeType || type || (kind === "video" ? "video/webm" : "audio/webm")).split(";")[0];
      resolve({ blob: new Blob(chunks, { type: mime }), mime, seconds: Math.min(maxSeconds, Math.round((Date.now() - t0) / 1000)) });
    };
  });
  rec.start(1000); // a chunk every second, so a long recording never sits in one buffer
  return { stop, done };
}

// ------------------------------------------------------------ on-device backup (IndexedDB)

const DB = "alza-pitch";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("saved");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export interface Saved {
  blob?: Blob;
  mime?: string;
  seconds?: number;
  kind: "video" | "audio" | "written";
  name: string;
  email: string;
  phone?: string;
  linkedin?: string;
  text?: string;
  at: number;
}
export async function saveLocal(key: string, v: Saved) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction("saved", "readwrite");
      tx.objectStore("saved").put(v, key);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch {}
}
export async function loadLocal(key: string): Promise<Saved | null> {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const r = db.transaction("saved").objectStore("saved").get(key);
      r.onsuccess = () => res((r.result as Saved) ?? null);
      r.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}
export async function clearLocal(key: string) {
  try {
    const db = await idb();
    db.transaction("saved", "readwrite").objectStore("saved").delete(key);
  } catch {}
}

// ------------------------------------------------------------ upload

const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const online = () => (navigator.onLine ? Promise.resolve() : new Promise<void>((r) => window.addEventListener("online", () => r(), { once: true })));

function putOnce(url: string, blob: Blob, filename: string, onProgress: (f: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "true");
    if (anon) {
      xhr.setRequestHeader("apikey", anon);
      xhr.setRequestHeader("authorization", `Bearer ${anon}`);
    }
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}: ${xhr.responseText.slice(0, 120)}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.ontimeout = () => reject(new Error("timeout"));
    xhr.timeout = 10 * 60 * 1000;
    const fd = new FormData();
    fd.append("cacheControl", "3600");
    fd.append("", blob, filename);
    xhr.send(fd);
  });
}

/** Upload with waits for a connection and up to 6 tries, backing off between them. */
export async function upload(url: string, blob: Blob, filename: string, onProgress: (f: number) => void, onRetry?: (n: number) => void) {
  const backoff = [0, 2000, 5000, 10000, 20000, 30000];
  let last: unknown;
  for (let i = 0; i < backoff.length; i++) {
    if (backoff[i]) {
      onRetry?.(i);
      await wait(backoff[i]);
    }
    await online();
    try {
      await putOnce(url, blob, filename, onProgress);
      onProgress(1);
      return;
    } catch (e) {
      last = e;
      if (/upload 4(00|13|15)/.test(String((e as Error).message))) break; // too big / wrong type: retrying won't help
    }
  }
  throw last ?? new Error("upload failed");
}
