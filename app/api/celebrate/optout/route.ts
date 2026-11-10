// The "don't show my birthday" link in the birthday email. GET ?c=client&p=person&k=key
// Turns off public birthday and anniversary celebrations for that one person.
import { admin, SERVER_LIVE } from "@/lib/server";
import { optOutKey } from "@/lib/shoutserver";

const page = (title: string, body: string) =>
  new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f5f1;color:#16202e;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px}div{background:#fff;border:1px solid #e6e1d8;border-radius:16px;padding:24px;max-width:420px}h1{font-size:22px;margin:0 0 8px}p{color:#5b6575;margin:0}</style></head><body><div><h1>${title}</h1><p>${body}</p></div></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  if (!SERVER_LIVE) return page("Not available", "This only works in the live portal.");
  const u = new URL(req.url);
  const c = u.searchParams.get("c") ?? "";
  const p = u.searchParams.get("p") ?? "";
  const k = u.searchParams.get("k") ?? "";
  if (!c || !p || k !== optOutKey(c, p)) return page("That link didn't work", "Ask your manager to turn off birthday celebrations for you.");
  const db = admin();
  const { data } = await db.from("people").select("data").eq("id", p).eq("client_id", c).maybeSingle();
  if (!data) return page("That link didn't work", "Ask your manager to turn off birthday celebrations for you.");
  await db.from("people").update({ data: { ...(data.data as object), celebrate: false } }).eq("id", p);
  return page("Done", "Your birthday and work anniversary won't be shown to the team. Your manager can turn it back on any time.");
}
