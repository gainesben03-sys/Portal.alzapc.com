// The dashboard greeting: warm, a little playful, and aware of the time, the day and the person.
// Picks one line per moment and sticks with it for the day, so it doesn't change on every refresh.

export type GreetingInput = {
  first: string;
  now?: Date;
  birthday?: string; // "MM-DD"
  hireDate?: string; // yyyy-mm-dd, for work anniversaries
  daysAway?: number; // since their last visit
};
export type Greeting = { headline: string; sub: string; moment: string };

type Pair = [string, string]; // headline (with {n} for the name), the line under it

const POOLS: Record<string, Pair[]> = {
  early: [
    ["Early start, {n}.", "The quiet hours are the good hours. Here's what's ahead."],
    ["Up with the sun, {n}?", "Coffee first. Then this."],
    ["Morning, early bird.", "You beat the inbox. Nice."],
  ],
  morning: [
    ["Good morning, {n}.", "Here's what's on deck today."],
    ["Morning, {n}.", "Fresh day, clean slate. Let's make it a good one."],
    ["Hey {n}, good morning.", "Hope the coffee's strong. Here's where things stand."],
    ["Rise and shine, {n}.", "A few things worth your attention today."],
  ],
  lunch: [
    ["Good afternoon, {n}.", "Hope you found time for lunch. Here's the latest."],
    ["Hey {n}.", "Halfway through the day. You're doing great."],
    ["Afternoon, {n}.", "Quick check-in before the second half."],
  ],
  afternoon: [
    ["Good afternoon, {n}.", "The home stretch. Here's what's left."],
    ["Still going strong, {n}?", "Here's what could use you before the day wraps."],
    ["Afternoon, {n}.", "Grab a second coffee. Here's the rundown."],
  ],
  evening: [
    ["Good evening, {n}.", "Wrapping up? Most of this can wait for tomorrow."],
    ["Evening, {n}.", "One last look before you call it a day."],
    ["Hey {n}, good evening.", "Thanks for checking in. Here's where things landed."],
  ],
  late: [
    ["Working late, {n}?", "Nothing here is going anywhere. It'll all be here in the morning."],
    ["Burning the midnight oil, {n}?", "Get some rest soon. We'll pick it up tomorrow."],
    ["Still at it, {n}?", "Quick look, then lights out. Deal?"],
  ],
  night: [
    ["Night owl mode, {n}?", "Hope you're catching some sleep soon."],
    ["Can't sleep, {n}?", "Here's what's waiting. None of it needs you tonight."],
  ],
  monday: [
    ["New week, {n}.", "Clean slate. Here's what this week looks like."],
    ["Happy Monday, {n}.", "Yes, that's a real thing. Here's the week ahead."],
    ["Monday again, {n}. Let's go.", "Here's what the week has in store."],
  ],
  friday: [
    ["Happy Friday, {n}.", "One more push. Here's what's left before the weekend."],
    ["You made it to Friday, {n}.", "Let's wrap the week up right."],
    ["It's Friday, {n}.", "Close a loop or two, then go enjoy your weekend."],
  ],
  weekend: [
    ["Weekend check-in, {n}?", "Look around, then go enjoy your day. It'll all keep."],
    ["Hey {n}, it's the weekend.", "Thanks for checking in. Don't stay long."],
  ],
  back: [
    ["Welcome back, {n}.", "Good to see you. Here's what happened while you were away."],
    ["Look who's back. Hi, {n}.", "Here's what you missed."],
  ],
  birthday: [
    ["Happy birthday, {n}!", "From all of us. Hope today is a great one."],
  ],
  anniversary: [
    ["Happy work anniversary, {n}!", "{y} {years}. Thank you for everything you bring."],
  ],
  newyear: [
    ["Happy New Year, {n}.", "New year, fresh start. Here's to a great one."],
  ],
};

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const mmdd = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function greetingFor(g: GreetingInput): Greeting {
  const now = g.now ?? new Date();
  const h = now.getHours();
  const dow = now.getDay();
  const today = mmdd(now);
  let moment: string;
  let years = 0;
  if (g.birthday && g.birthday === today) moment = "birthday";
  else if (g.hireDate && g.hireDate.slice(5) === today && Number(g.hireDate.slice(0, 4)) < now.getFullYear()) {
    moment = "anniversary";
    years = now.getFullYear() - Number(g.hireDate.slice(0, 4));
  } else if (today === "01-01") moment = "newyear";
  else if ((g.daysAway ?? 0) >= 7) moment = "back";
  else if (dow === 0 || dow === 6) moment = h >= 21 || h < 5 ? "late" : "weekend";
  else if (h < 5) moment = "night";
  else if (h < 8) moment = "early";
  else if (h < 12) moment = dow === 1 ? "monday" : "morning";
  else if (h < 14) moment = "lunch";
  else if (h < 17) moment = dow === 5 ? "friday" : "afternoon";
  else if (h < 21) moment = dow === 5 ? "friday" : "evening";
  else moment = "late";
  const pool = POOLS[moment];
  const pick = pool[hash(`${g.first}|${now.toDateString()}|${moment}`) % pool.length];
  const fill = (t: string) => t.replace(/\{n\}/g, g.first || "there").replace("{y}", String(years)).replace("{years}", years === 1 ? "year" : "years");
  return { headline: fill(pick[0]), sub: fill(pick[1]), moment };
}

/** "Thursday, November 12" */
export const dateLine = (d = new Date()) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
