"use client";

// Browser Supabase client. When the env vars are missing the app runs in demo mode
// (sample data in the browser), so the site keeps working before setup is finished.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
