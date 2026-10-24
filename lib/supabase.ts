"use client";

// Browser Supabase client. When the env vars are missing the app runs in demo mode
// (sample data in the browser), so the site keeps working before setup is finished.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

/** Accepts the project URL in any common form and returns https://<ref>.supabase.co */
export function cleanSupabaseUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim().replace(/^["']|["']$/g, "");
  try {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);
    // dashboard link: https://supabase.com/dashboard/project/<ref>/...
    const m = u.pathname.match(/\/project\/([a-z0-9]{10,})/i);
    if (/(^|\.)supabase\.com$/i.test(u.hostname) && m) return `https://${m[1]}.supabase.co`;
    return u.origin; // drops /rest/v1/ and anything else after the domain
  } catch {
    return v;
  }
}

const url = cleanSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);

export const LIVE = !!(url && anon);

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!LIVE) throw new Error("Supabase is not configured");
  if (!client) {
    client = createClient(url!, anon!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
    });
  }
  return client;
}

/** Authorization header for our own API routes. */
export async function authHeader(): Promise<Record<string, string>> {
  if (!LIVE) return {};
  const { data } = await sb().auth.getSession();
  const t = data.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const BUCKET = "client-files";

export function safeName(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}

/** Upload one file into the client's private folder. Returns the storage path. */
export async function uploadToStorage(clientId: string, fileId: string, file: File): Promise<string> {
  const path = `${clientId}/${fileId}/${safeName(file.name)}`;
  const { error } = await sb().storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return path;
}

/** Open a stored file through a short-lived private link. */
export async function openStored(path: string) {
  const { data, error } = await sb().storage.from(BUCKET).createSignedUrl(path, 120);
  if (error || !data) throw error ?? new Error("No link");
  window.open(data.signedUrl, "_blank", "noopener");
}
