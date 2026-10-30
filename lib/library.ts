"use client";

import { Resource } from "./modules";
import { authHeader, LIVE } from "./supabase";

/** Open a library item in a new tab. Returns an error message, or null. */
export async function openResource(r: Resource): Promise<string | null> {
  if (!r.path && !r.url) return "There's no file or link on this one yet.";
  if (!LIVE) {
    if (r.url) {
      window.open(r.url, "_blank", "noopener");
      return null;
    }
    return "Demo mode: files open once the portal is live.";
  }
  // open the tab first so phone browsers don't block it, then point it at the file
  const w = window.open("about:blank", "_blank");
  try {
    const res = await fetch(`/api/library/open?id=${encodeURIComponent(r.id)}`, { headers: await authHeader() });
    const j = await res.json();
    if (j.ok && j.url) {
      if (w) w.location.href = j.url;
      else window.location.href = j.url;
      return null;
    }
    w?.close();
    return j.reason === "forbidden" ? "This hasn't been shared with your company." : "Couldn't open it. Try again.";
  } catch {
    w?.close();
    return "Couldn't open it. Check your connection.";
  }
}

export const RES_ICON: Record<string, string> = { Training: "🎓", Video: "▶️", Template: "📄", Guide: "📘", Checklist: "✅", Policy: "📜", Link: "🔗" };
