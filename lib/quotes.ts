// One short line for the day, under the dashboard greeting. Motivation and a little mindfulness
// for people who lead people, written for the portal (no famous-quote misattributions).
export const DAILY_LINES: string[] = [
  "You can't pour from an empty cup. Take care of you, too.",
  "Lead with curiosity. Most problems look different after one more question.",
  "The tone you set this morning travels further than you think.",
  "Slow down for the people. Speed up on the paperwork.",
  "A calm leader makes a calm room.",
  "You don't have to have every answer. You just have to keep the door open.",
  "Small kindnesses are never small to the person on the other end.",
  "Breathe before you reply. Most things can wait ten seconds.",
  "Good HR is quiet. People just feel looked after.",
  "Clarity is a kindness. Say the thing, gently.",
  "Progress over perfection. Today, that's plenty.",
  "Every policy is really about people. Start there.",
  "Listen to understand, not to answer.",
  "Hard conversations get easier the sooner you have them.",
  "Notice what's going right. Then say it out loud.",
  "Protect your calendar like you protect your team.",
  "Fair isn't the same as identical. Consistent is the goal.",
  "Be the steady one. Somebody needs that today.",
  "Trust is built in drops and lost in buckets.",
  "Rest is part of the work, not a reward for finishing it.",
  "People remember how you handled the hard days.",
  "Assume good intent. Ask before you decide.",
  "One thoughtful note can change someone's whole week.",
  "Your team watches how you treat the person with the least power in the room.",
  "Simple, clear and kind beats clever every time.",
  "Pause. Pick the one thing that matters most today.",
  "Culture is built one ordinary Tuesday at a time.",
  "Make it easy for people to tell you the truth.",
  "Not every fire is yours to put out. Some just need a calm voice nearby.",
  "Celebrate the people who make the hard parts look easy.",
  "The best time to check in is before anyone asks.",
  "Keep your promises small and your follow-through big.",
  "Empathy and accountability can sit at the same table.",
  "Feeling stretched? That's growth. Feeling crushed? That's a signal.",
  "Leave a little room in today for something good to happen.",
  "Good leaders make other people feel capable.",
  "When in doubt, write it down and ask for help.",
  "Take the walk. The answer often shows up on the way.",
  "Grace for others starts with a little grace for yourself.",
  "A clear yes and a clear no are both gifts.",
  "Behind every request is a person having a day. Meet them there.",
  "Do the next right thing. Then the one after that.",
  "Being consistent is how people learn they can count on you.",
  "Curiosity defuses more conflict than authority ever will.",
  "You set the weather for your team. Bring some sun.",
  "Say thank you like you mean it, because you do.",
  "Done is a beautiful word. Finish one thing today.",
  "Make room for the quiet voices. They're often thinking the most.",
  "The work matters. So do the people doing it.",
  "Respond, don't react. There's a pause in between for a reason.",
  "Lead the way you'd want to be led.",
  "Little check-ins prevent big surprises.",
  "It's okay to not know yet. It's not okay to stop asking.",
  "Kind words cost nothing and pay back for years.",
  "Your energy is a resource. Spend it where it counts.",
  "Good boundaries make good teams.",
  "Make today a little easier for someone else.",
  "Steady beats loud.",
  "The right conversation at the right time saves a hundred emails.",
  "You've handled hard things before. You'll handle this one too.",
];

/** Today's line: the same for everyone on the same day. */
export function lineFor(d = new Date()): string {
  const day = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 1)) / 864e5);
  return DAILY_LINES[((day % DAILY_LINES.length) + DAILY_LINES.length) % DAILY_LINES.length];
}

// One line for the week, at the end of The People Brief. Written for CEOs and COOs:
// steady, reflective, about leading people. Original lines, no famous-quote misattributions.
export const EXEC_LINES: string[] = [
  "Your calendar is your strategy. Look at where the hours went, not where you meant them to go.",
  "People don't follow plans. They follow leaders who make the plan make sense.",
  "The most expensive problems are the ones everyone saw and nobody named.",
  "Culture is what happens when you're not in the room. Make sure you'd like what you'd see.",
  "Speed comes from trust. Trust comes from doing what you said, every time.",
  "Your best people rarely ask for attention. Give it anyway.",
  "A clear no is kinder than a slow maybe.",
  "Growth exposes every gap in how you lead. That's information, not failure.",
  "The tone at the top becomes the tone everywhere. Choose it on purpose.",
  "Decide what only you can do this week. Hand off the rest with real authority.",
  "Retention is decided in ordinary weeks, not at exit interviews.",
  "Calm is a leadership skill. So is admitting you don't know yet.",
  "Hire for what's hard to teach. Train for the rest.",
  "Every policy says what you value. Read yours like an employee would.",
  "The question you avoid asking is usually the one that matters most.",
  "Pay attention to who goes quiet. It often says more than who complains.",
  "Strategy is easy to write and hard to staff. Start with the people.",
  "Recognition costs nothing and compounds faster than a raise.",
  "When everything is a priority, the team will choose for you.",
  "Fix the system before you blame the person.",
  "Your managers are your culture at scale. Invest in them first.",
  "Rest is not a reward for finishing. It's how leaders stay sharp enough to finish.",
  "The hardest conversations get more expensive every week you wait.",
  "Clarity is the most generous thing a leader can give.",
  "Notice what's working before you ask for more.",
  "Good leaders make decisions. Great ones explain them.",
  "Protect the people who protect your customers.",
  "Small promises kept build more trust than big promises made.",
  "A company grows only as fast as its leaders do.",
  "Listen longer than feels comfortable. The real answer usually comes second.",
  "Consistency is what makes fairness believable.",
  "Lead the person in front of you, not the org chart.",
];

/** The same line all week (Monday to Sunday), different each week. */
export function weekLine(d = new Date()): string {
  const start = new Date(d.getFullYear(), 0, 1);
  const week = Math.floor((d.getTime() - start.getTime()) / (7 * 864e5));
  return EXEC_LINES[(week + d.getFullYear()) % EXEC_LINES.length];
}
