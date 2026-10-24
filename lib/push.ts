// Server-only: send push notifications to everyone signed up on their devices.
import webpush from "web-push";
import { SupabaseClient } from "@supabase/supabase-js";
import { PushTopic, topicOn } from "./pushtopics";
import { PORTAL_URL } from "./server";

const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
const priv = process.env.VAPID_PRIVATE_KEY?.trim();
export const PUSH_READY = !!(pub && priv);
if (PUSH_READY) webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:ben@alzapc.com", pub!, priv!);

export interface PushMsg {
  title: string;
  body: string;
  url?: string; // path inside the portal
  tag?: string; // same tag replaces an older alert instead of stacking
}

/** Push to these people (by email) if they have devices and haven't turned the topic off. Never throws. */
export async function pushTo(db: SupabaseClient, emails: string[], topic: PushTopic, msg: PushMsg): Promise<number> {
  if (!PUSH_READY) return 0;
  const list = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (!list.length) return 0;
  try {
    const [{ data: subs }, { data: prefs }] = await Promise.all([
      db.from("push_subs").select("endpoint, email, sub").in("email", list),
      db.from("push_prefs").select("email, topics").in("email", list),
    ]);
    const pmap = new Map((prefs ?? []).map((p) => [String(p.email).toLowerCase(), p.topics]));
    const payload = JSON.stringify({
      title: msg.title.slice(0, 120),
      body: msg.body.slice(0, 300),
      url: msg.url ? (msg.url.startsWith("http") ? msg.url : PORTAL_URL + msg.url) : PORTAL_URL,
      tag: msg.tag,
    });
    let n = 0;
    await Promise.all(
      (subs ?? [])
        .filter((s) => topicOn(pmap.get(String(s.email).toLowerCase()), topic))
        .map(async (s) => {
          try {
            await webpush.sendNotification(s.sub as webpush.PushSubscription, payload, { TTL: 60 * 60 * 24 });
            n++;
            await db.from("push_subs").update({ last_ok: new Date().toISOString() }).eq("endpoint", s.endpoint);
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) await db.from("push_subs").delete().eq("endpoint", s.endpoint); // device gone
          }
        })
    );
    return n;
  } catch {
    return 0;
  }
}

/** Everyone on Ben's side (the advisors table). */
export async function advisorEmails(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from("advisors").select("email");
  const list = (data ?? []).map((r) => String(r.email));
  const ben = (process.env.NOTIFY_TO || "").trim();
  return ben ? [...list, ben] : list;
}
