// Serves a client's logo as a normal image so email apps can show it.
// Logos are public branding, so no sign-in is needed. Only raster images are served.
import { admin, SERVER_LIVE } from "@/lib/server";

export async function GET(req: Request, { params }: { params: Promise<{ client: string }> }) {
  if (!SERVER_LIVE) return new Response("Not found", { status: 404 });
  const { client } = await params;
  const { data } = await admin().from("clients").select("config").eq("id", client).maybeSingle();
  const cfg = (data?.config ?? {}) as { logo?: string; logoEmail?: string; onboarding?: { companies?: { id: string; logo?: string; logoEmail?: string }[] } };
  const co = new URL(req.url).searchParams.get("co");
  const pick = co ? (cfg.onboarding?.companies ?? []).find((c) => c.id === co) : cfg;
  const src = pick?.logoEmail || pick?.logo || "";
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(src);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
