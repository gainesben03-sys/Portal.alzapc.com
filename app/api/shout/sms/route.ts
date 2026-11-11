// Text a shoutout. Twilio sends each incoming text here; we reply in the same conversation.
// Point the company's texting number's "A message comes in" webhook to: https://<portal>/api/shout/sms
//
// The conversation: who -> what they did -> which value -> done. A first text like
// "Maria Lopez for staying late to finish the load" skips straight to the value.
// STOP always works and is remembered. Texting is just one way in: anyone who stops texts
// can still give and get shoutouts by QR code, email or the portal.

import { createHmac } from "crypto";
import { clientBySms, createShout, matchPeople, rosterFor, ShoutClient } from "@/lib/shoutserver";
import { admin, SERVER_LIVE, siteUrl } from "@/lib/server";
import { cleanCell, TeamMember } from "@/lib/team";

type Thread = { step: "who" | "pick" | "what" | "value"; choices?: string[]; to?: string; message?: string; lang?: "en" | "es"; fromName?: string; at: string };

const STOP = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|alto|parar)\s*$/i;
const START = /^\s*(start|unstop|yes|si|sí)\s*$/i;
const HELP = /^\s*(help|info|ayuda)\s*$/i;
const RESET = /^\s*(new|again|otro|otra|reset)\s*$/i;

const xml = (msg: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Message>` : ""}</Response>`, { headers: { "Content-Type": "text/xml" } });

/** Twilio signs each request; reject anything that isn't from Twilio. */
function fromTwilio(req: Request, params: URLSearchParams, url: string): boolean {
  const tok = process.env.TWILIO_AUTH_TOKEN;
  const sig = req.headers.get("x-twilio-signature") || "";
  if (!tok || !sig) return false;
  const keys = [...new Set(params.keys())].sort();
  const data = url + keys.map((k) => k + params.get(k)).join("");
  const want = createHmac("sha1", tok).update(Buffer.from(data, "utf-8")).digest("base64");
  return want === sig;
}

const T = {
  en: {
    who: (co: string) => `${co} Shoutouts 🎉 Who do you want to recognize? Reply with their name.`,
    pick: (list: string) => `Which one? Reply with the number:\n${list}`,
    none: "I couldn't find that name. Try first and last name, or reply NEW to start over.",
    what: (n: string) => `What did ${n} do? One or two sentences.`,
    live: (n: string, url: string) => `Sent! ${n} will see it on the wall. 🙌 Text NEW to recognize someone else. Wall: ${url}`,
    held: (n: string) => `Thanks! Your shoutout to ${n} will post after a quick check. Text NEW for another.`,
    name: "Before we post it: what's your name?",
    help: "Text a coworker's name to give them a shoutout. Reply STOP to stop texts. You can still use the QR code anytime.",
    stopped: "You won't get any more texts. You can still give shoutouts with the QR code. Reply START to turn texts back on.",
    started: "Texts are back on. Text a coworker's name to give them a shoutout.",
    self: "Nice try 😄 You can't give yourself a shoutout. Who else made your day better?",
  },
  es: {
    who: (co: string) => `${co} Reconocimientos 🎉 ¿A quién quieres reconocer? Responde con su nombre.`,
    pick: (list: string) => `¿Cuál? Responde con el número:\n${list}`,
    none: "No encontré ese nombre. Prueba con nombre y apellido, o responde OTRO para empezar de nuevo.",
    what: (n: string) => `¿Qué hizo ${n}? Una o dos frases.`,
    live: (n: string, url: string) => `¡Enviado! ${n} lo verá en el muro. 🙌 Escribe OTRO para reconocer a alguien más. Muro: ${url}`,
    held: (n: string) => `¡Gracias! Tu reconocimiento para ${n} se publicará después de una revisión rápida.`,
    name: "Antes de publicarlo: ¿cuál es tu nombre?",
    help: "Escribe el nombre de un compañero para reconocerlo. Responde STOP para dejar de recibir mensajes.",
    stopped: "Ya no recibirás mensajes. Puedes seguir usando el código QR. Responde START para volver a activarlos.",
    started: "Los mensajes están activos otra vez. Escribe el nombre de un compañero para reconocerlo.",
    self: "😄 No puedes darte un reconocimiento a ti mismo. ¿Quién más te alegró el día?",
  },
};
const spanish = (s: string) => /[ñáéíóú¿¡]|\b(gracias|hola|por|ayud|quiero|reconoc)/i.test(s);

export async function POST(req: Request) {
  if (!SERVER_LIVE) return xml("");
  const raw = await req.text();
  const p = new URLSearchParams(raw);
  const site = siteUrl(req);
  if (!fromTwilio(req, p, `${site}/api/shout/sms`)) return new Response("forbidden", { status: 403 });
  const from = cleanCell(p.get("From") ?? "") ?? "";
  const to = cleanCell(p.get("To") ?? "") ?? "";
  const body = (p.get("Body") ?? "").trim().slice(0, 600);
  const db = admin();

  if (STOP.test(body)) {
    await db.from("sms_optouts").upsert({ phone: from });
    return xml(""); // Twilio sends the carrier's STOP reply
  }
  const c = await clientBySms(db, to);
  if (!c) return xml("");
  if (START.test(body) && !(await thread(db, c, from))) {
    await db.from("sms_optouts").delete().eq("phone", from);
    return xml(T.en.started);
  }
  if (HELP.test(body)) return xml(T[spanish(body) ? "es" : "en"].help);

  const roster = await rosterFor(db, c.id);
  const me = roster.find((x) => x.cell === from);
  let t = RESET.test(body) ? null : await thread(db, c, from);
  if (t && Date.now() - new Date(t.at).getTime() > 6 * 3600e3) t = null; // old conversations start fresh
  const lang = t?.lang ?? (spanish(body) ? "es" : "en");
  const L = T[lang];
  const save = (next: Thread | null) => (next ? db.from("sms_threads").upsert({ phone: from, client_id: c.id, data: { ...next, at: new Date().toISOString() }, updated_at: new Date().toISOString() }) : db.from("sms_threads").delete().eq("phone", from).eq("client_id", c.id));
  const nameOf = (id?: string) => roster.find((x) => x.id === id)?.name.split(" ")[0] ?? "";
  // got the message: send it, or ask for their name first if their phone isn't on the roster
  const finish = async (th: Thread): Promise<Response> => {
    if (!me) {
      await save({ ...th, step: "value", fromName: "?", choices: [] });
      return xml(L.name);
    }
    const person = roster.find((x) => x.id === th.to);
    await save(null);
    if (!person || !th.message) return xml(L.who(c.name));
    const s = await createShout(db, site, c, { to: person, from: { name: me.name, personId: me.id, verified: true }, message: th.message, channel: "sms", lang });
    return xml(s.status === "live" ? L.live(person.name.split(" ")[0], `${site}/shout/${c.rec.token}`) : L.held(person.name.split(" ")[0]));
  };

  const chose = async (person: TeamMember, rest?: string): Promise<Response> => {
    if (me && person.id === me.id) {
      await save(null);
      return xml(L.self);
    }
    if (rest && rest.length >= 8) return finish({ step: "value", to: person.id, message: rest, lang, at: "" });
    await save({ step: "what", to: person.id, lang, at: "" });
    return xml(L.what(person.name.split(" ")[0]));
  };

  // a new conversation
  if (!t || RESET.test(body)) {
    if (RESET.test(body) || body.length < 2) {
      await save({ step: "who", lang, at: "" });
      return xml(L.who(c.name));
    }
    // "Maria Lopez for staying late" -> find a name at the start
    const words = body.replace(/^(shout ?out|shout|thanks|gracias)\s+(to\s+|a\s+)?/i, "").split(/\s+/);
    for (const n of [3, 2, 1]) {
      const hits = matchPeople(roster, words.slice(0, n).join(" "));
      if (hits.length === 1) return chose(hits[0], words.slice(n).join(" ").replace(/^(for|por|because|porque)\s+/i, ""));
    }
    await save({ step: "who", lang, at: "" });
    return xml(L.who(c.name));
  }

  if (t.step === "who") {
    const hits = matchPeople(roster, body);
    if (hits.length === 1) return chose(hits[0]);
    if (!hits.length) return xml(L.none);
    await save({ ...t, step: "pick", choices: hits.map((h) => h.id) });
    return xml(L.pick(hits.map((h, i) => `${i + 1} ${h.name}${h.department ? ` (${h.department})` : ""}`).join("\n")));
  }
  if (t.step === "pick") {
    const n = parseInt(body, 10);
    const id = t.choices?.[n - 1];
    const person = roster.find((x) => x.id === id);
    if (!person) return xml(L.pick((t.choices ?? []).map((cid, i) => `${i + 1} ${roster.find((x) => x.id === cid)?.name ?? ""}`).join("\n")));
    return chose(person);
  }
  if (t.step === "what") {
    if (body.length < 4) return xml(L.what(nameOf(t.to)));
    return finish({ ...t, step: "value", message: body });
  }
  // their name, when their phone isn't on the roster
  if (t.step !== "value") {
    await save(null);
    return xml(L.who(c.name));
  }
  const fromName = me ? me.name : body.replace(/\s+/g, " ").trim().slice(0, 60);
  const person = roster.find((x) => x.id === t!.to);
  await save(null);
  if (!person || !t.message) return xml(L.who(c.name));
  const s = await createShout(db, site, c, { to: person, from: { name: fromName, personId: me?.id, verified: !!me }, message: t.message, channel: "sms", lang });
  return xml(s.status === "live" ? L.live(person.name.split(" ")[0], `${site}/shout/${c.rec.token}`) : L.held(person.name.split(" ")[0]));
}

async function thread(db: ReturnType<typeof admin>, c: ShoutClient, phone: string): Promise<Thread | null> {
  const { data } = await db.from("sms_threads").select("data").eq("phone", phone).eq("client_id", c.id).maybeSingle();
  return (data?.data as Thread) ?? null;
}
