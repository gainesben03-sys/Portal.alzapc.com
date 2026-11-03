// Practice built from a training: key ideas, a quick check, a sorting drill, role-play scenarios
// and a planner for a real conversation. Ben generates it from the slides, reviews it, then publishes.

export type Lang = "en" | "es";
export const LANG_LABEL: Record<Lang, string> = { en: "English", es: "Español" };

export interface KeyIdea {
  label: string; // "C", "1", or a short tag
  title: string;
  body: string;
  instead?: string;
  tryThis?: string;
}
export interface QuizQ {
  q: string;
  options: string[];
  answer: number;
  why: string;
}
export interface SortDrill {
  prompt: string;
  buckets: [string, string];
  items: { text: string; bucket: 0 | 1; why: string }[];
}
export interface Scenario {
  id: string;
  title: string;
  setup: string; // what the manager reads
  name: string; // the employee Claude plays
  role: string;
  persona: string; // how to play them (shown only after the role-play)
  goal: string; // what a good outcome looks like
  opener: string; // the employee's first line
}
export interface PracticeContent {
  title: string;
  intro: string;
  framework: string; // what feedback is scored against, e.g. "CLEAR"
  ideas: KeyIdea[];
  quiz: QuizQ[];
  sort?: SortDrill;
  scenarios: Scenario[];
  pushback?: { line: string; reply: string }[];
  planner: string[];
  ui?: Partial<Record<keyof typeof UI_EN, string>>;
}
export interface Practice {
  status: "draft" | "published";
  langs: Lang[];
  content: Partial<Record<Lang, PracticeContent>>;
  at: string;
  notes?: string; // Claude's notes for Ben from the last generation
}

export const hasPractice = (r: { practice?: Practice }) => r.practice?.status === "published" && !!r.practice.content.en;

/** Words on the practice screens, in both languages. */
export const UI_EN = {
  ideas: "Key ideas",
  check: "Quick check",
  sort: "Sort it",
  roleplay: "Role-play",
  plan: "Plan a real one",
  instead: "Instead of",
  try: "Try",
  next: "Next",
  again: "Try again",
  start: "Start",
  feedback: "Get feedback",
  you: "You",
  send: "Send",
  restart: "Start over",
  goal: "What good looks like",
  hints: "Stuck? Lines that help",
  score: "You got {n} of {t}",
  plannerNote: "Just for you. Nothing here is saved.",
  practiceThis: "Practice this conversation",
  copy: "Copy my plan",
};
export const UI_ES: typeof UI_EN = {
  ideas: "Ideas clave",
  check: "Repaso rápido",
  sort: "Clasifica",
  roleplay: "Práctica",
  plan: "Planea una real",
  instead: "En lugar de",
  try: "Prueba",
  next: "Siguiente",
  again: "Otra vez",
  start: "Empezar",
  feedback: "Ver comentarios",
  you: "Tú",
  send: "Enviar",
  restart: "Empezar de nuevo",
  goal: "Cómo se ve bien",
  hints: "¿Atorado? Frases que ayudan",
  score: "Acertaste {n} de {t}",
  plannerNote: "Solo para ti. Nada de esto se guarda.",
  practiceThis: "Practicar esta conversación",
  copy: "Copiar mi plan",
};
export const ui = (lang: Lang) => (lang === "es" ? UI_ES : UI_EN);

/** Used for role-play when there's no training behind it (from Ask HR or a custom plan). */
export const DEFAULT_IDEAS: KeyIdea[] = [
  { label: "C", title: "Calm", body: "Start steady. Don't match their emotion." },
  { label: "L", title: "Lead with facts", body: "Describe what you saw or heard, not what you think it means." },
  { label: "E", title: "Explore", body: "Ask a real question and listen before you decide." },
  { label: "A", title: "Agree", body: "Agree on something specific you can check." },
  { label: "R", title: "Revisit", body: "Set a time to follow up." },
];

// ---------- Seed: Manager Essentials, "Say it. Don't avoid it." (from the bilingual deck) ----------

const EN: PracticeContent = {
  title: "Say it. Don't avoid it.",
  intro: "Difficult conversations, made simple. Most managers avoid the talk, let it build up, then blow up. CLEAR is the middle path.",
  framework: "CLEAR",
  ideas: [
    { label: "C", title: "Calm", body: "Pause. Check yourself first. If you're not calm yet, it's not time yet.", instead: "I'm going to go deal with this right now.", tryThis: "Let me take a minute and get my facts straight." },
    { label: "L", title: "Lead with facts", body: "Facts describe behavior. Stories explain intent. Start with what you saw or heard.", instead: "You don't care about deadlines.", tryThis: "The report was submitted two days late." },
    { label: "E", title: "Explore", body: "Get curious before you conclude. Ask, then actually listen.", instead: "Why can't you just get it done?", tryThis: "Help me understand what's getting in the way." },
    { label: "A", title: "Agree", body: "Be specific about what's next. If you can't check it, you didn't agree on it.", instead: "Just try to do better.", tryThis: "Can we agree that from now on, reports are due Friday by noon?" },
    { label: "R", title: "Revisit", body: "Follow up. Follow through. Accountability needs a date on the calendar.", instead: "Glad we talked. (Then nothing.)", tryThis: "Let's check in next Friday and see how it's going." },
  ],
  quiz: [
    { q: "Which one is a fact, not a story?", options: ["You don't care about the team.", "You were 15 minutes late on Monday and Wednesday.", "You've checked out lately.", "You have a bad attitude."], answer: 1, why: "A fact is something you saw or heard that anyone could check. The others guess at intent." },
    { q: "You're frustrated and want to talk to them right now. What does CLEAR say?", options: ["Go now while it's fresh.", "Send a text so it's in writing.", "Take a minute and get your facts straight first.", "Wait until their review."], answer: 2, why: "Calm comes first. If you're not calm yet, it's not time yet. Waiting a little is fine, waiting months is avoiding." },
    { q: "Which agreement passes the test?", options: ["Try to do better.", "Be more careful on site.", "Here and ready at 7:00, starting tomorrow.", "Work on your attitude."], answer: 2, why: "If you can't check it, you didn't agree on it. You can check 7:00." },
    { q: "They say, \"That's not fair.\" What's your best next move?", options: ["Explain why it is fair.", "Drop it for now.", "Slow down and ask what feels unfair.", "Remind them who's the manager."], answer: 2, why: "Don't match their emotion. Listening isn't agreeing: you can hear them out and still hold the expectation." },
    { q: "\"Listen ≠ Agree\" means...", options: ["You don't have to listen if you disagree.", "You can understand how they feel and still keep the expectation.", "Agree with them so they calm down.", "Let them talk, then repeat yourself."], answer: 1, why: "\"I hear that this feels unfair. The expectation still needs to be met.\"" },
    { q: "Your best performer is rude to coworkers. What's the trap?", options: ["Documenting it.", "Letting performance become a pass.", "Naming specific comments.", "Setting a follow-up date."], answer: 1, why: "Address the behavior without attacking character, and without giving a pass because they're valuable." },
    { q: "What makes Revisit real?", options: ["Saying \"let me know if anything changes.\"", "A date to check in, and a note of what you agreed.", "Bringing it up at the holiday party.", "Waiting to see if it happens again."], answer: 1, why: "Follow up, follow through. Put the date on your calendar and write down what you agreed." },
    { q: "Before you start, which question keeps it on track?", options: ["How do I prove I'm right?", "Am I trying to solve this, or trying to win?", "Who else has noticed?", "What did HR say last time?"], answer: 1, why: "The goal is to understand it, address it and agree on what's next." },
  ],
  sort: {
    prompt: "Fact or story?",
    buckets: ["Fact", "Story"],
    items: [
      { text: "You've been late three times this week.", bucket: 0, why: "Specific and checkable." },
      { text: "You don't take this job seriously.", bucket: 1, why: "A guess about how they feel." },
      { text: "The drill cord was left across the walkway on Tuesday.", bucket: 0, why: "What you saw, where and when." },
      { text: "You're careless on site.", bucket: 1, why: "A label, not a behavior." },
      { text: "In Monday's meeting you said Sam's idea was \"stupid.\"", bucket: 0, why: "The exact words, and when." },
      { text: "You have a bad attitude.", bucket: 1, why: "Name the comments instead." },
      { text: "The report came in two days after the deadline.", bucket: 0, why: "Anyone could check it." },
      { text: "You obviously don't respect me.", bucket: 1, why: "It explains intent. You can't know that." },
    ],
  },
  scenarios: [
    {
      id: "late",
      title: "The reliable employee who keeps being late",
      setup: "Jordan does good work and is well liked, but has been 10 to 15 minutes late several times a week. You've mentioned it casually twice. It keeps happening. Today you're talking about it for real.",
      name: "Jordan",
      role: "a reliable, well-liked team member",
      persona: "Friendly and a bit embarrassed. Starts by laughing it off (\"It's only a few minutes, and I stay late\"). The real reason is a new childcare drop-off that runs tight. Opens up if the manager is calm, specific and asks what's going on. Gets a little hurt and vague if the manager lectures or says things like \"you always\" or \"you don't care.\" Will agree to a specific start time and suggest a fix (a later drop-off on two days or a schedule tweak) if asked.",
      goal: "Name the pattern with facts, find out what's going on, agree on being here and ready at start time, and set a check-in for next week.",
      opener: "Hey, you wanted to see me? Is everything okay?",
    },
    {
      id: "safety",
      title: "The safety issue that gets pushback",
      setup: "Taylor, an installer, has left tools and cords out on the job site three times this month. Last week a coworker nearly tripped over a drill cord. When you bring it up, Taylor gets defensive.",
      name: "Taylor",
      role: "an experienced installer",
      persona: "Defensive at first: \"Why are you always on me? Everybody leaves stuff out.\" Feels singled out because others do it too (partly true). Calms down if the manager doesn't match the frustration, keeps it about safety, and asks what feels unfair. Digs in if the manager argues about who else does it or makes it personal. Will agree to put tools away before leaving an area, and may suggest the whole crew does the same.",
      goal: "Stay calm, keep it about safety with the facts (three times, someone nearly fell), hear what feels unfair without backing off, agree that tools are put away before leaving the area, and check the next install.",
      opener: "Why are you always on me? Everybody leaves stuff out.",
    },
    {
      id: "attitude",
      title: "The strong performer with a bad attitude",
      setup: "Alex is one of your highest performers. Lately Alex has been negative and dismissive toward coworkers, and several people have complained that Alex's comments make the team uncomfortable. You've been hesitant because Alex is so valuable.",
      name: "Alex",
      role: "a top performer",
      persona: "Confident and a little dismissive: \"I'm just being honest. Somebody has to be.\" Is frustrated by being asked to carry others' work, and feels overlooked for a promotion. Softens if the manager names specific comments (not \"bad attitude\") and asks what's been going on. Gets sharper if labeled or compared to others. Will agree to keep comments respectful and to bring frustrations to the manager directly.",
      goal: "Check your own hesitation, name specific comments, ask what's been going on, agree on respectful behavior with coworkers every time, and set a follow-up date.",
      opener: "Sure, what's up? I've got a deadline at three.",
    },
  ],
  pushback: [
    { line: "That's not fair.", reply: "I hear that this feels unfair. The expectation still needs to be met." },
    { line: "That's not what happened.", reply: "Tell me how you saw it." },
    { line: "Why are you picking on me?", reply: "I'm talking with you because I want this to work. Here's what I saw." },
    { line: "Nobody else gets held to this.", reply: "I'm talking with you about you right now. It applies to everyone." },
  ],
  planner: ["What is the issue?", "What are the facts?", "What do I need to understand?", "What needs to happen next?", "When will I follow up?"],
};

const ES: PracticeContent = {
  title: "Dilo. No lo evites.",
  intro: "Conversaciones difíciles, más simples. Muchos gerentes evitan la plática, la dejan acumular y luego explotan. CLEAR es el camino de en medio.",
  framework: "CLEAR",
  ideas: [
    { label: "C", title: "Calma", body: "Haz una pausa. Revísate primero. Si aún no estás en calma, todavía no es el momento.", instead: "Voy a resolver esto ahora mismo.", tryThis: "Déjame tomar un minuto y aclarar los hechos." },
    { label: "L", title: "Los hechos primero", body: "Los hechos describen conductas. Las historias suponen intenciones. Empieza con lo que viste u oíste.", instead: "No te importan las fechas límite.", tryThis: "El reporte se entregó dos días tarde." },
    { label: "E", title: "Explora", body: "Ten curiosidad antes de concluir. Pregunta y luego escucha de verdad.", instead: "¿Por qué no puedes simplemente hacerlo?", tryThis: "Ayúdame a entender qué te lo está impidiendo." },
    { label: "A", title: "Acuerda", body: "Sé específico sobre lo que sigue. Si no lo puedes verificar, no lo acordaron.", instead: "Solo trata de hacerlo mejor.", tryThis: "¿Podemos acordar que, de ahora en adelante, los reportes se entregan el viernes antes del mediodía?" },
    { label: "R", title: "Da seguimiento", body: "Da seguimiento. Cumple. La responsabilidad necesita una fecha en el calendario.", instead: "Qué bueno que hablamos. (Y luego nada.)", tryThis: "Revisemos el próximo viernes cómo va todo." },
  ],
  quiz: [
    { q: "¿Cuál es un hecho y no una historia?", options: ["No te importa el equipo.", "Llegaste 15 minutos tarde el lunes y el miércoles.", "Últimamente andas desconectado.", "Tienes mala actitud."], answer: 1, why: "Un hecho es algo que viste u oíste y que cualquiera puede verificar. Los demás suponen intenciones." },
    { q: "Estás frustrado y quieres hablar con la persona ahora mismo. ¿Qué dice CLEAR?", options: ["Ve ahora que está fresco.", "Manda un mensaje para que quede por escrito.", "Toma un minuto y aclara los hechos primero.", "Espera hasta su evaluación."], answer: 2, why: "Primero la calma. Si aún no estás en calma, todavía no es el momento. Esperar un poco está bien; esperar meses es evitar." },
    { q: "¿Qué acuerdo pasa la prueba?", options: ["Trata de hacerlo mejor.", "Ten más cuidado en el sitio.", "Aquí y listo a las 7:00, a partir de mañana.", "Trabaja en tu actitud."], answer: 2, why: "Si no lo puedes verificar, no lo acordaron. Las 7:00 sí se pueden verificar." },
    { q: "Te dice: «Eso no es justo». ¿Cuál es tu mejor siguiente paso?", options: ["Explicar por qué sí es justo.", "Dejarlo por ahora.", "Bajar el ritmo y preguntar qué le parece injusto.", "Recordarle quién es el gerente."], answer: 2, why: "No respondas con la misma emoción. Escuchar no es estar de acuerdo: puedes escuchar y mantener lo esperado." },
    { q: "«Escuchar ≠ Estar de acuerdo» significa...", options: ["No tienes que escuchar si no estás de acuerdo.", "Puedes entender cómo se siente y aun así mantener lo esperado.", "Dale la razón para que se calme.", "Déjalo hablar y luego repite lo tuyo."], answer: 1, why: "«Entiendo que esto te parece injusto. Aun así, hay que cumplir con lo esperado.»" },
    { q: "Tu mejor empleado es grosero con sus compañeros. ¿Cuál es la trampa?", options: ["Documentarlo.", "Dejar que el desempeño sea un pase.", "Nombrar comentarios específicos.", "Fijar una fecha de seguimiento."], answer: 1, why: "Atiende la conducta sin atacar a la persona y sin darle un pase porque es valioso." },
    { q: "¿Qué hace real el seguimiento?", options: ["Decir «avísame si algo cambia».", "Una fecha para revisar y una nota de lo que acordaron.", "Sacarlo en la fiesta de fin de año.", "Esperar a ver si vuelve a pasar."], answer: 1, why: "Da seguimiento y cumple. Pon la fecha en tu calendario y anota lo que acordaron." },
    { q: "Antes de empezar, ¿qué pregunta te mantiene en el camino?", options: ["¿Cómo demuestro que tengo razón?", "¿Estoy tratando de resolver esto, o de ganar?", "¿Quién más se ha dado cuenta?", "¿Qué dijo Recursos Humanos la última vez?"], answer: 1, why: "La meta es entenderlo, atenderlo y acordar qué sigue." },
  ],
  sort: {
    prompt: "¿Hecho o historia?",
    buckets: ["Hecho", "Historia"],
    items: [
      { text: "Llegaste tarde tres veces esta semana.", bucket: 0, why: "Específico y verificable." },
      { text: "No te tomas en serio este trabajo.", bucket: 1, why: "Es una suposición sobre lo que siente." },
      { text: "El martes el cable del taladro quedó atravesado en el pasillo.", bucket: 0, why: "Lo que viste, dónde y cuándo." },
      { text: "Eres descuidado en el sitio.", bucket: 1, why: "Una etiqueta, no una conducta." },
      { text: "En la junta del lunes dijiste que la idea de Sam era «tonta».", bucket: 0, why: "Las palabras exactas y cuándo." },
      { text: "Tienes mala actitud.", bucket: 1, why: "Mejor nombra los comentarios." },
      { text: "El reporte llegó dos días después de la fecha límite.", bucket: 0, why: "Cualquiera lo puede verificar." },
      { text: "Es obvio que no me respetas.", bucket: 1, why: "Supone una intención. No lo puedes saber." },
    ],
  },
  scenarios: [
    { ...EN.scenarios[0], title: "El empleado confiable que sigue llegando tarde", setup: "Jordan hace buen trabajo y es muy apreciado, pero ha llegado de 10 a 15 minutos tarde varias veces por semana. Ya se lo mencionaste de manera informal dos veces. Sigue pasando. Hoy lo vas a hablar en serio.", role: "un miembro del equipo confiable y apreciado", goal: "Nombra el patrón con hechos, entiende qué está pasando, acuerden estar aquí y listo a la hora de entrada, y fija una revisión para la próxima semana.", opener: "Hola, ¿querías verme? ¿Todo bien?" },
    { ...EN.scenarios[1], title: "El problema de seguridad que genera resistencia", setup: "Taylor, instalador, ha dejado herramientas y cables tirados en el sitio tres veces este mes. La semana pasada un compañero casi se tropieza con el cable de un taladro. Cuando se lo mencionas, se pone a la defensiva.", role: "un instalador con experiencia", goal: "Mantén la calma, enfócate en la seguridad con los hechos (tres veces, alguien casi se cae), escucha qué le parece injusto sin echarte para atrás, acuerden guardar las herramientas antes de dejar el área y revisa la próxima instalación.", opener: "¿Por qué siempre me andas vigilando? Todos dejan cosas tiradas." },
    { ...EN.scenarios[2], title: "El empleado estrella con mala actitud", setup: "Alex es uno de tus mejores empleados. Últimamente ha sido negativo y despectivo con sus compañeros, y varios se han quejado de que sus comentarios incomodan al equipo. Has dudado porque Alex es muy valioso.", role: "un empleado de alto desempeño", goal: "Revisa tu propia duda, nombra comentarios específicos, pregunta qué ha estado pasando, acuerden respeto con los compañeros siempre y fija una fecha de seguimiento.", opener: "Claro, ¿qué pasa? Tengo una entrega a las tres." },
  ],
  pushback: [
    { line: "Eso no es justo.", reply: "Entiendo que esto te parece injusto. Aun así, hay que cumplir con lo esperado." },
    { line: "Eso no fue lo que pasó.", reply: "Cuéntame cómo lo viste tú." },
    { line: "¿Por qué la traes contra mí?", reply: "Hablo contigo porque quiero que esto funcione. Esto es lo que vi." },
    { line: "A nadie más le exigen esto.", reply: "Ahorita estoy hablando contigo de ti. Aplica para todos." },
  ],
  planner: ["¿Cuál es el problema?", "¿Cuáles son los hechos?", "¿Qué necesito entender?", "¿Qué tiene que pasar ahora?", "¿Cuándo daré seguimiento?"],
};

export const SEED_PRACTICE: Practice = { status: "published", langs: ["en", "es"], content: { en: EN, es: ES }, at: "2026-10-21T17:00:00.000Z" };

// ---------- Demo mode (no server): canned answers so the flow can be shown ----------

export interface HandbookAnswer {
  answer: string;
  cites: { doc: string; section: string; quote: string }[];
  covered: boolean;
  callBen: boolean;
  why?: string;
}
export interface SituationAnswer {
  read: string;
  steps: string[];
  say: string[];
  avoid: string[];
  document: string;
  callBen: boolean;
  why?: string;
  employee?: { name: string; role: string };
}
export interface Feedback {
  overall: string;
  steps: { label: string; title: string; mark: "yes" | "partly" | "no"; note: string }[];
  strengths: string[];
  tryNext: string;
  betterLine?: { said: string; try: string };
}

export function demoHandbook(q: string): HandbookAnswer {
  const t = q.toLowerCase();
  if (/sick|pto|vacation|time off|holiday/.test(t))
    return {
      answer: "Everyone gets paid sick time from day one. It builds at 1 hour for every 30 hours worked, up to 40 hours (5 days) a year, and up to 80 hours can roll over. Vacation is separate: full-time staff start at 10 days a year after 90 days. Ask for vacation at least two weeks ahead in the scheduling app.",
      cites: [
        { doc: "Employee Handbook", section: "4.2 Paid Sick Leave", quote: "Employees accrue one hour of paid sick leave for every 30 hours worked." },
        { doc: "Employee Handbook", section: "4.3 Vacation", quote: "Requests should be submitted at least two weeks in advance." },
      ],
      covered: true,
      callBen: false,
    };
  if (/overtime|hours|break|lunch|meal/.test(t))
    return {
      answer: "Overtime needs your OK before it's worked. Non-exempt staff get a 30-minute unpaid meal break before the end of their fifth hour, and a paid 10-minute rest break for every 4 hours. If someone works overtime without approval, they still get paid for it: talk to them about the approval step, and don't adjust their time card.",
      cites: [
        { doc: "Employee Handbook", section: "3.4 Overtime", quote: "All overtime must be approved in advance by your supervisor." },
        { doc: "Employee Handbook", section: "3.5 Meal and Rest Periods", quote: "a 30-minute unpaid meal period before the end of the fifth hour of work" },
      ],
      covered: true,
      callBen: false,
    };
  if (/fire|terminat|let .* go|harass|discriminat|pregnan|disabil|accommodat|leave/.test(t))
    return {
      answer: "This is one to run by Ben before you act. The handbook covers the basics, but every situation like this has details that matter, and getting the steps right protects you and the employee.",
      cites: [{ doc: "Employee Handbook", section: "1.3 Equal Opportunity", quote: "Report concerns to your manager or HR right away." }],
      covered: true,
      callBen: true,
      why: "Terminations, harassment, discrimination, leave and accommodation always go through Ben.",
    };
  return {
    answer: "I couldn't find this in your handbook. Ben can give you a straight answer, usually the same day.",
    cites: [],
    covered: false,
    callBen: true,
    why: "Not covered in the handbook.",
  };
}

export function demoSituation(q: string): SituationAnswer {
  const late = /late|tard|attend/.test(q.toLowerCase());
  return {
    read: late ? "A pattern after two casual mentions means it's time for a real conversation. Keep it about the start time, not about whether they care." : "This is worth addressing now, while it's small. Keep it to what you've seen and heard, and stay curious about their side.",
    steps: [
      "Calm: pick a private moment when you're not frustrated.",
      late ? "Facts: \"You've been 10 to 15 minutes late four times in the last two weeks.\"" : "Facts: name the specific behavior, when and where.",
      "Explore: \"Help me understand what's getting in the way.\" Then listen.",
      late ? "Agree: here and ready at start time. Ask what they need to make that work." : "Agree on one specific thing you can check.",
      "Revisit: set a check-in for next week and write down what you agreed.",
    ],
    say: [late ? "I want to talk about start times. You've been 10 to 15 minutes late four times in the last two weeks." : "I want to talk about something I've noticed.", "Help me understand what's going on.", "I hear you. The expectation still needs to be met."],
    avoid: ["\"You always...\" or \"You never...\"", "Guessing at why (\"you don't care\")", "Ending without a specific agreement"],
    document: "Date, what you discussed, what they said, what you agreed and the follow-up date. A few factual lines in a check-in note is enough.",
    callBen: false,
    employee: { name: late ? "Jordan" : "your employee", role: "team member" },
  };
}

const DEMO_LINES: Record<string, string[]> = {
  late: ["Oh. Yeah, I know I've been a few minutes behind. But I always stay late to make it up, so it kind of evens out, right?", "Honestly? My kid's daycare changed their drop-off time last month and it's been tight. I didn't want it to sound like an excuse.", "I could do the early drop-off on Tuesdays and Thursdays. Monday, Wednesday and Friday are the hard ones.", "Okay. Here and ready at 7:00. That's fair. Checking in next week works."],
  safety: ["Seriously, everybody does it. Mike left his saw out yesterday and nobody said a word to him.", "Fine. I didn't know someone almost tripped. That's not great.", "I guess I just get pulled to the next thing and forget. I could do a sweep before I move areas.", "Okay. Tools up before I leave an area. You can check me on the next install."],
  attitude: ["I'm just being honest. Somebody has to be around here.", "Okay, I said that about Sam's idea. It was a bad idea though. I'm tired of fixing everyone else's work.", "Yeah. I guess I've been frustrated about the lead role too. Nobody's said anything about that.", "Fine. I'll keep it respectful, and bring stuff to you instead. Let's talk again in two weeks."],
};
export function demoReply(scenarioId: string, managerTurns: number, lang: Lang): { reply: string; done: boolean } {
  const lines = DEMO_LINES[scenarioId] ?? DEMO_LINES.late;
  const i = Math.min(managerTurns - 1, lines.length - 1);
  const reply = lang === "es" ? `(Demo en inglés) ${lines[i]}` : lines[i];
  return { reply, done: managerTurns >= lines.length };
}
export function demoFeedback(ideas: KeyIdea[]): Feedback {
  const marks: Feedback["steps"][number]["mark"][] = ["yes", "yes", "partly", "yes", "no"];
  return {
    overall: "Solid. You stayed steady and kept it about what happened. The piece missing was a follow-up date.",
    steps: ideas.slice(0, 5).map((k, i) => ({ label: k.label, title: k.title, mark: marks[i] ?? "partly", note: ["You opened steady and didn't rush it.", "You named the times, not their attitude.", "You asked once, then moved to the fix. One more question would have helped.", "You landed on a specific start time.", "No date to check back in."][i] ?? "" })),
    strengths: ["Specific facts instead of labels", "You didn't match their emotion"],
    tryNext: "Before you wrap up, set the follow-up: \"Let's check in next Friday.\"",
    betterLine: { said: "So just try to be on time, okay?", try: "Can we agree you're here and ready at 7:00, starting tomorrow? Let's check in Friday." },
  };
}

// ---------- My progress (kept on this device only) ----------

export interface MyProgress {
  quiz?: { score: number; total: number; at: string };
  sort?: { score: number; total: number; at: string };
  roleplays?: number;
  last?: string;
}
const PROG_KEY = "alza-practice-progress";
export function myProgress(): Record<string, MyProgress> {
  try {
    return JSON.parse(localStorage.getItem(PROG_KEY) || "{}");
  } catch {
    return {};
  }
}
export function saveProgress(id: string, p: (cur: MyProgress) => MyProgress) {
  try {
    const all = myProgress();
    all[id] = { ...p(all[id] ?? {}), last: new Date().toISOString() };
    localStorage.setItem(PROG_KEY, JSON.stringify(all));
  } catch {}
}
/** 0 to 3 steps done: the quick check, a role-play, and the sort drill or a second role-play. */
export function progressSteps(p: MyProgress | undefined, hasSort: boolean): number {
  if (!p) return 0;
  return (p.quiz ? 1 : 0) + ((p.roleplays ?? 0) > 0 ? 1 : 0) + (hasSort ? (p.sort ? 1 : 0) : (p.roleplays ?? 0) > 1 ? 1 : 0);
}
