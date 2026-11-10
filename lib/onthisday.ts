// "On this day" for birthday and anniversary emails: one cheerful, work-appropriate fact.
// Facts come from Wikipedia's "On this day" list (real dates), never made up. We drop anything
// about war, death, disaster, crime, politics or religion, then Claude picks the most upbeat one and
// writes it in a sentence or two using only what the source says.
import { claude, parseJson } from "./ai";

type Ev = { year: number; text: string };

const AVOID = /\b(war|wars|battle|killed|kill|dies|died|death|dead|massacre|bomb\w*|attack\w*|assassin\w*|execut\w*|murder\w*|crash\w*|disaster|earthquake|hurricane|tornado|flood\w*|fire|shooting|shot|terror\w*|invasion|invade\w*|genocide|elect\w*|president|prime minister|parliament|congress|senate|party|government|church|pope|religio\w*|saint|islam\w*|christ\w*|jew\w*|muslim|hindu|buddh\w*|god|temple|mosque|coup|revolution\w*|riot\w*|protest\w*|slave\w*|nazi\w*|treaty|prison\w*|arrest\w*|trial|court|nuclear|weapon\w*|military|army|navy|soldier\w*|sank|sink\w*|hijack\w*|plague|epidemic|pandemic|virus|famine|abortion|independence|declares|annex\w*|occup\w*|regime|dictator\w*|king|queen|emperor|empire|colon\w*|rebel\w*|scandal|resign\w*|impeach\w*|explosion|explod\w*|collapse\w*|victims?)\b/i;
const LIKE = /\b(first|record|launch\w*|invent\w*|discover\w*|premiere\w*|opens?|opened|released?|wins?|won|champion\w*|world series|super bowl|olympic\w*|patent\w*|broadcast|debut\w*|landed|lands|completes?|completed|founded|album|film|song|museum|bridge|telescope|space|orbit|moon|mars|satellite|computer|internet|game|stadium|marathon|medal|award\w*|prize|unveil\w*)\b/i;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const cache = new Map<string, { title: string; text: string } | null>();

export async function funFact(month: number, day: number): Promise<{ title: string; text: string } | null> {
  const key = `${month}-${day}`;
  if (cache.has(key)) return cache.get(key)!;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const dateLabel = `${MONTHS[month - 1]} ${day}`;
  let events: Ev[] = [];
  // Wikimedia's feed, with Wikipedia's own endpoint as a backup
  for (const url of [`https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/${mm}/${dd}`, `https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${mm}/${dd}`]) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "AlzaHR-Portal/1.0 (https://portal.alzapc.com)", Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const j = (await r.json()) as { selected?: { year: number; text: string }[] };
      events = (j.selected ?? []).filter((e) => e.year > 1700 && e.text && !AVOID.test(e.text)).map((e) => ({ year: e.year, text: e.text.trim() }));
      if (j.selected?.length) break;
    } catch {}
  }
  if (!events.length) {
    cache.set(key, null);
    return null;
  }
  // prefer the fun stuff: firsts, records, launches, sports, inventions, arts
  events.sort((a, b) => Number(LIKE.test(b.text)) - Number(LIKE.test(a.text)));
  const pool = events.slice(0, 12);

  let text = "";
  const ai = await claude({
    system: `You write one fun fact for a work birthday or anniversary email. You get a numbered list of real historical events for ${dateLabel}. Pick the single most upbeat, work-appropriate one: science, space, inventions, sports, music, film, records, firsts. Never pick anything about war, death, disaster, crime, politics, religion, royalty, or anything a coworker could find upsetting or controversial. If none fit, answer {"index": -1}.
Then write it as one or two warm, lively sentences starting with "On ${dateLabel}, <year>," using only the facts given (no extra details, no numbers or names that aren't in the event). End with an exclamation point. Never use em dashes.
Answer with JSON only: {"index": <number>, "text": "<the sentence(s)>"}`,
    messages: [{ role: "user", content: pool.map((e, i) => `${i}. (${e.year}) ${e.text}`).join("\n") }],
    maxTokens: 220,
  });
  if (ai.ok) {
    const j = parseJson<{ index: number; text: string }>(ai.text);
    if (j && j.index === -1) {
      cache.set(key, null);
      return null;
    }
    const ev = j && Number.isInteger(j.index) ? pool[j.index] : undefined;
    // keep Claude's wording only if it kept the right year and stays clean
    if (ev && j?.text && j.text.includes(String(ev.year)) && !AVOID.test(j.text) && j.text.length < 400) text = j.text.replace(/\s*—\s*/g, ", ").trim();
    else if (ev) text = `On ${dateLabel}, ${ev.year}, ${lower(ev.text)}`;
  }
  if (!text) {
    const ev = pool.find((e) => LIKE.test(e.text));
    if (!ev) {
      cache.set(key, null);
      return null;
    }
    text = `On ${dateLabel}, ${ev.year}, ${lower(ev.text)}`;
  }
  const out = { title: `On this day: ${dateLabel}`, text };
  cache.set(key, out);
  return out;
}

const lower = (t: string) => {
  const s = t.replace(/\.$/, "");
  // keep proper nouns: only lower-case a leading "The"/"A"
  return (/^(The|A|An)\s/.test(s) ? s[0].toLowerCase() + s.slice(1) : s) + "!";
};
