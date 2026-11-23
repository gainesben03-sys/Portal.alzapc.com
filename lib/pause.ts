// The Pause: a five-minute monthly ritual. One page design, new words each month.
// Employees open it from The Pause newsletter. No sign-in, nothing to fill out.
// Ben writes each month once; every company's link shows it with their name.

export interface PauseWords {
  theme: string; // "Gratitude"
  title: string; // "Thanks goes further than you think"
  intro: string;
  prompt: string;
  steps?: string[]; // up to 3 gentle cues that light up as the sand falls
  closing: string;
  /** One short nudge per Thrive pillar, shown under the ritual. Blank uses the standard line. */
  thrive?: { physical?: string; financial?: string; connection?: string };
}

export type Pillar = "physical" | "financial" | "connection";
export const PILLARS: Pillar[] = ["physical", "financial", "connection"];
export const PILLAR_NAME: Record<"en" | "es", Record<Pillar, string>> = {
  en: { physical: "Physical & mental", financial: "Financial", connection: "Connection" },
  es: { physical: "Física y mental", financial: "Finanzas", connection: "Conexión" },
};
export const PILLAR_DEFAULT: Record<"en" | "es", Record<Pillar, string>> = {
  en: { physical: "Move for five minutes today. A walk counts.", financial: "Free, private 1:1 with a financial coach. Any money question.", connection: "Give someone a shoutout this week." },
  es: { physical: "Muévete cinco minutos hoy. Caminar cuenta.", financial: "Una llamada 1:1 gratis y privada con un asesor financiero. Cualquier pregunta de dinero.", connection: "Reconoce a alguien esta semana." },
};

/** The financial coach employees can book directly. Ben sets it once in the console. */
export interface PausePartner { name: string; firm: string; url: string }
export const DEFAULT_PARTNER: PausePartner = { name: "Chris", firm: "Wood Financial", url: "" };
export function cleanPartner(x: unknown): PausePartner {
  const o = (x ?? {}) as Record<string, unknown>;
  const url = String(o.url ?? "").trim().slice(0, 300);
  return { name: String(o.name ?? DEFAULT_PARTNER.name).trim().slice(0, 60), firm: String(o.firm ?? DEFAULT_PARTNER.firm).trim().slice(0, 80), url: /^https:\/\//.test(url) ? url : "" };
}

export interface PauseRitual extends PauseWords {
  month: string; // yyyy-mm
  publishOn: string; // yyyy-mm-dd: shows from this day
  active: boolean;
  minutes?: number; // 5 unless set
  es?: Partial<PauseWords>; // Spanish, for bilingual companies
}

export type PauseEvent = "visit" | "start" | "complete" | "coach";
export const PAUSE_EVENTS: PauseEvent[] = ["visit", "start", "complete", "coach"];

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "2026-11" -> "november-2026" (the link people see) */
export const monthSlug = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return MONTHS[mo - 1] ? `${MONTHS[mo - 1]}-${y}` : m;
};
/** "november-2026" or "2026-11" -> "2026-11" */
export const slugMonth = (s: string): string | null => {
  const a = /^([a-z]+)-(\d{4})$/.exec(String(s).toLowerCase());
  if (a && MONTHS.includes(a[1])) return `${a[2]}-${String(MONTHS.indexOf(a[1]) + 1).padStart(2, "0")}`;
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
};
export const pauseMonthLabel = (m: string, lang: "en" | "es" = "en") => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "long", year: "numeric" });
};

const todayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** What employees can see today: active and published, newest first. */
export function published(list: PauseRitual[], today = todayISO()) {
  return list.filter((r) => r.active && r.publishOn <= today).sort((a, b) => b.month.localeCompare(a.month));
}

/** Words in the reader's language, falling back to English line by line. */
export function wordsFor(r: PauseRitual, lang: "en" | "es"): PauseWords {
  if (lang !== "es" || !r.es) return r;
  const e = r.es;
  return { theme: e.theme || r.theme, title: e.title || r.title, intro: e.intro || r.intro, prompt: e.prompt || r.prompt, steps: e.steps?.length ? e.steps : r.steps, closing: e.closing || r.closing, thrive: e.thrive };
}
export const hasSpanish = (r: PauseRitual) => !!(r.es?.title && r.es?.prompt);

/** Keep only fields we know, trimmed, so a bad save can't break the page. */
export function cleanRituals(input: unknown): PauseRitual[] {
  if (!Array.isArray(input)) return [];
  const s = (v: unknown, n = 1200) => String(v ?? "").trim().slice(0, n);
  const thrive = (v: unknown) => {
    const o = (v ?? {}) as Record<string, unknown>;
    const t = { physical: s(o.physical, 200), financial: s(o.financial, 200), connection: s(o.connection, 200) };
    return t.physical || t.financial || t.connection ? t : undefined;
  };
  const steps = (v: unknown) => (Array.isArray(v) ? v.map((x) => s(x, 200)).filter(Boolean).slice(0, 3) : undefined);
  const out: PauseRitual[] = [];
  for (const x of input as Record<string, unknown>[]) {
    const month = s(x?.month, 7);
    if (!/^\d{4}-\d{2}$/.test(month) || out.some((r) => r.month === month)) continue;
    const es = (x.es ?? {}) as Record<string, unknown>;
    const esClean: Partial<PauseWords> = { theme: s(es.theme, 60), title: s(es.title, 140), intro: s(es.intro), prompt: s(es.prompt), steps: steps(es.steps), closing: s(es.closing), thrive: thrive(es.thrive) };
    const publishOn = /^\d{4}-\d{2}-\d{2}$/.test(s(x.publishOn, 10)) ? s(x.publishOn, 10) : `${month}-01`;
    out.push({
      month, publishOn, active: x.active !== false,
      minutes: Math.min(Math.max(Number(x.minutes) || 5, 1), 20),
      theme: s(x.theme, 60), title: s(x.title, 140), intro: s(x.intro), prompt: s(x.prompt), steps: steps(x.steps), closing: s(x.closing), thrive: thrive(x.thrive),
      es: Object.values(esClean).some((v) => (Array.isArray(v) ? v.length : v)) ? esClean : undefined,
    });
  }
  return out.sort((a, b) => b.month.localeCompare(a.month));
}

export const blankRitual = (month: string): PauseRitual => ({ month, publishOn: `${month}-01`, active: false, minutes: 5, theme: "", title: "", intro: "", prompt: "", steps: [], closing: "" });

/** The months written so far. Used until Ben saves his own in the console. */
export const PAUSE_SEED: PauseRitual[] = [
  {
    month: "2026-12",
    publishOn: "2026-12-01",
    active: true,
    theme: "Rest",
    title: "Put one thing down",
    intro: "December gets loud. Before the year wraps up, take five minutes that are only yours. No list, no inbox, nothing to fix.",
    prompt: "What's one thing you've been carrying this year that you could give yourself permission to put down?",
    steps: ["Get comfortable. Let your shoulders drop and take three slow breaths.", "Picture what you've been carrying. Name it, even just to yourself.", "Imagine setting it down for the rest of the year. What would feel lighter?"],
    closing: "You don't have to carry everything into next year. Five minutes of letting go is a good place to start.",
    thrive: { physical: "Unwind with a 5-minute stretch before bed. Shoulders, neck, back.", financial: "Holiday spending adding up? Book a free, private 1:1 with Chris at Wood Financial.", connection: "Thank one person before the year ends. Make it specific." },
    es: {
      theme: "Descanso",
      title: "Suelta una cosa",
      intro: "Diciembre se pone ruidoso. Antes de cerrar el año, tómate cinco minutos solo para ti. Sin listas, sin correo, nada que arreglar.",
      prompt: "¿Qué es algo que has cargado este año y que podrías darte permiso de soltar?",
      steps: ["Ponte cómodo. Relaja los hombros y respira lento tres veces.", "Piensa en lo que has estado cargando. Ponle nombre, aunque sea solo para ti.", "Imagina dejarlo a un lado por el resto del año. ¿Qué se sentiría más ligero?"],
      closing: "No tienes que llevar todo al próximo año. Cinco minutos para soltar es un buen comienzo.",
      thrive: { physical: "Relájate con 5 minutos de estiramiento antes de dormir. Hombros, cuello, espalda.", financial: "¿Los gastos de fin de año se acumulan? Agenda una llamada 1:1 gratis y privada con Chris de Wood Financial.", connection: "Dale las gracias a una persona antes de que termine el año. Sé específico." },
    },
  },
  {
    month: "2026-11",
    publishOn: "2026-11-01",
    active: true,
    theme: "Gratitude",
    title: "Thanks goes further than you think",
    intro: "A quick thank-you lands better than most of us expect. This month, take five minutes to notice what's been going right, and who helped.",
    prompt: "Think of something you're grateful for that you might normally overlook. Then think of one person who made your month a little easier. What would you thank them for?",
    steps: ["Settle in. Take three slow breaths and let the day go quiet.", "Notice one small thing that went right this month. Stay with it.", "Picture the person who helped. What would you say to them?"],
    closing: "You've given yourself five minutes. Sometimes that's all it takes to create a little more space in your day. If someone came to mind, send them a quick thanks. A text counts.",
    thrive: { physical: "Take a 10-minute gratitude walk. Notice three things that went right.", financial: "Grateful for a little breathing room? A free 1:1 with Chris at Wood Financial can help build more.", connection: "Send one specific thank-you on the Team Wall." },
    es: {
      theme: "Gratitud",
      title: "Un gracias llega más lejos de lo que crees",
      intro: "Un gracias rápido cae mejor de lo que la mayoría esperamos. Este mes, tómate cinco minutos para notar lo que ha salido bien, y quién te ayudó.",
      prompt: "Piensa en algo por lo que estás agradecido y que normalmente pasarías por alto. Luego piensa en una persona que te hizo el mes un poco más fácil. ¿Por qué le darías las gracias?",
      steps: ["Acomódate. Respira lento tres veces y deja que el día se calme.", "Nota una cosa pequeña que salió bien este mes. Quédate con ella.", "Piensa en la persona que te ayudó. ¿Qué le dirías?"],
      closing: "Te diste cinco minutos. A veces es todo lo que se necesita para tener un poco más de espacio en el día. Si alguien te vino a la mente, mándale un gracias. Un mensaje de texto cuenta.",
      thrive: { physical: "Da una caminata de 10 minutos y nota tres cosas que salieron bien.", financial: "¿Quieres un poco más de tranquilidad? Una llamada 1:1 gratis con Chris de Wood Financial puede ayudar.", connection: "Manda un gracias específico en el Muro del equipo." },
    },
  },
  {
    month: "2026-10",
    publishOn: "2026-10-01",
    active: true,
    theme: "Connection",
    title: "The people make the place",
    intro: "Small moments with the people around you add up. Take five minutes to think about the people who make your days better.",
    prompt: "Think of someone at work who made a hard day a little easier. What did they do? Who could you do that for this week?",
    steps: ["Get comfortable and take three slow breaths.", "Picture that person and the moment they helped.", "Think of one person who could use that from you this week."],
    closing: "Connection doesn't take much. A real hello, a question that isn't about work, a few honest minutes. You just took the first step.",
    thrive: { physical: "Take a 10-minute walk or coffee run with a coworker.", financial: "Money on your mind? Book a free, private 1:1 with Chris at Wood Financial.", connection: "Connect with 3 people this month you don't usually talk to." },
    es: {
      theme: "Conexión",
      title: "La gente hace el lugar",
      intro: "Los momentos pequeños con la gente a tu alrededor suman. Tómate cinco minutos para pensar en las personas que hacen mejores tus días.",
      prompt: "Piensa en alguien del trabajo que te hizo un día difícil un poco más fácil. ¿Qué hizo? ¿Por quién podrías hacer eso esta semana?",
      steps: ["Ponte cómodo y respira lento tres veces.", "Piensa en esa persona y en el momento en que te ayudó.", "Piensa en alguien que podría necesitar eso de ti esta semana."],
      closing: "Conectar no cuesta mucho. Un saludo sincero, una pregunta que no sea de trabajo, unos minutos de verdad. Ya diste el primer paso.",
      thrive: { physical: "Da una caminata de 10 minutos o ve por un café con un compañero.", financial: "¿Te preocupa el dinero? Agenda una llamada 1:1 gratis y privada con Chris de Wood Financial.", connection: "Conecta este mes con 3 personas con las que no sueles hablar." },
    },
  },
];
