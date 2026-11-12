// The daily thought on the dashboard: a short people-leadership idea and one small thing to try.
// Written in Ben's voice. Everyone at a company sees the same one on the same day.
export type Thought = { theme: string; thought: string; tryThis: string };

export const MANAGER_THOUGHTS: Thought[] = [
  { theme: "Recognition", thought: "Recognition works best when it's specific. \"Great job\" fades by lunch. \"The way you handled that client call kept us on schedule\" sticks.", tryThis: "Thank one person today for something specific they did this week." },
  { theme: "One-on-ones", thought: "A one-on-one is their meeting, not yours. If you're doing most of the talking, it's a status update.", tryThis: "Open your next one-on-one with: What's on your mind this week?" },
  { theme: "Feedback", thought: "Small feedback, given often, beats big feedback saved for a review. Nobody should be surprised by their annual review.", tryThis: "Give one piece of quick, kind feedback today while it's still fresh." },
  { theme: "Clarity", thought: "Most performance problems start as clarity problems. People can't hit a target they can't see.", tryThis: "Ask someone on your team what a great week looks like in their role. See if your answers match." },
  { theme: "Listening", thought: "When someone brings you a problem, the urge is to fix it. Sometimes the better move is one more question.", tryThis: "Next time someone brings you a problem, ask \"What have you tried so far?\" before you answer." },
  { theme: "Trust", thought: "Trust is built in small moments. Doing what you said you'd do, when you said you'd do it.", tryThis: "Look at what you promised your team last week. Close the loop on one of them." },
  { theme: "Delegation", thought: "If you're the only one who can do something, that isn't job security. It's a bottleneck.", tryThis: "Pick one task only you do. Teach it to someone this week." },
  { theme: "Workload", thought: "Busy and overwhelmed look the same from the outside. You only find out which one by asking.", tryThis: "Ask one person: How's your workload right now, honestly?" },
  { theme: "Growth", thought: "People stay where they're growing. That doesn't always mean a promotion. It can be a new skill, a stretch project or a seat at a bigger table.", tryThis: "Ask someone what they'd like to learn this year." },
  { theme: "Conflict", thought: "Conflict that gets talked about early stays small. Conflict that gets avoided gets expensive.", tryThis: "Is there a conversation you've been putting off? Put 15 minutes on the calendar for it." },
  { theme: "Meetings", thought: "If a meeting ends without a decision or a next step, it probably could have been an email.", tryThis: "End your next meeting with: Who's doing what, by when?" },
  { theme: "Onboarding", thought: "New hires decide in the first few weeks whether they made the right choice. Day one matters more than we think.", tryThis: "If someone new is starting soon, plan their first lunch and their first win." },
  { theme: "Accountability", thought: "Accountability isn't about blame. It's everyone knowing what they own and following through.", tryThis: "Pick one shared project and make sure every task has one name next to it." },
  { theme: "Recognition", thought: "Praise in public, coach in private. It's old advice because it works.", tryThis: "Give someone a public shoutout today." },
  { theme: "Clarity", thought: "If you've explained the same thing three times, the problem may be the explanation, not the person.", tryThis: "Take one expectation you keep saying out loud and put it in writing." },
  { theme: "Safety", thought: "Teams do their best work when people can say \"I made a mistake\" without fear.", tryThis: "Share a recent mistake of yours and what you learned. It gives others permission to do the same." },
  { theme: "Check-ins", thought: "Don't wait for a problem to check in. The best time to ask how someone's doing is when things are fine.", tryThis: "Send a two-line check-in to someone you haven't talked with in a while." },
  { theme: "Decisions", thought: "Explaining the why behind a decision takes two extra minutes and saves two weeks of confusion.", tryThis: "Next decision you share, add one sentence on why." },
  { theme: "Strengths", thought: "People do their best work when they use their strengths. Part of your job is noticing what those are.", tryThis: "Write down one strength for each person on your team. Tell one of them." },
  { theme: "Change", thought: "People don't resist change as much as they resist being surprised by it.", tryThis: "If something is changing, tell your team early, even if you don't have every answer yet." },
  { theme: "Listening", thought: "Listening isn't waiting for your turn to talk. It's being open to changing your mind.", tryThis: "In your next conversation, sum up what you heard before you respond." },
  { theme: "Time off", thought: "When managers never take time off, their teams learn they shouldn't either.", tryThis: "Put your next day off on the calendar, and actually unplug." },
  { theme: "Feedback", thought: "Asking for feedback is a leadership skill. It shows your team that growth goes both ways.", tryThis: "Ask someone: What's one thing I could do to make your job easier?" },
  { theme: "Hiring", thought: "Hire for attitude and train for skill. Just be clear about which skills you can actually teach.", tryThis: "For your next open role, list the 3 things a new hire must bring on day one. Plan to teach the rest." },
  { theme: "Documentation", thought: "If it isn't written down, it didn't happen. That isn't about distrust. It protects everyone, you included.", tryThis: "After your next important conversation, send a short recap email." },
  { theme: "Fairness", thought: "Fair doesn't mean treating everyone the same. It means applying the same standards, every time.", tryThis: "Think of a rule you enforce. Are you applying it the same way for everyone?" },
  { theme: "Progress", thought: "Progress is motivating. Teams that see small wins keep going on the hard days.", tryThis: "At your next huddle, name one thing the team got done this week." },
  { theme: "Coaching", thought: "Coaching is asking questions that help someone find the answer themselves. It takes longer the first time and saves time every time after.", tryThis: "Next time someone asks what to do, try: What do you think the options are?" },
  { theme: "Hard news", thought: "Hard news delivered clearly and kindly is a gift. Hard news delivered vaguely is a second problem.", tryThis: "If you have hard news to share, write the first sentence. Make it direct." },
  { theme: "Energy", thought: "Your mood walks into the room before you do. Teams take their cue from the manager.", tryThis: "Before your next team meeting, take one minute to reset." },
  { theme: "Retention", thought: "Most people decide to leave months before they give notice. A stay conversation beats an exit interview.", tryThis: "Ask someone: What keeps you here? What might make you leave?" },
  { theme: "Boundaries", thought: "A 10pm email sends a message, even if you don't expect a reply.", tryThis: "Schedule your late-night emails to send in the morning." },
  { theme: "Inclusion", thought: "The quietest person in the meeting often has the most thought-through idea. Make room for it.", tryThis: "In your next meeting, ask someone who hasn't spoken what they think." },
  { theme: "Goals", thought: "A goal without a check-in date is a wish.", tryThis: "Pick one team goal and set the date you'll check on it." },
  { theme: "Recognition", thought: "Recognize effort, not just results. Results don't always come on schedule, but effort is what gets you there.", tryThis: "Thank someone for how hard they worked on something that didn't go as planned." },
  { theme: "Mistakes", thought: "How you react the first time someone brings you bad news decides whether they bring you the next one.", tryThis: "When you hear bad news this week, start with: Thanks for telling me." },
  { theme: "Priorities", thought: "When everything is a priority, nothing is. Helping your team choose is part of the job.", tryThis: "Ask your team for the top 3 things this week. Agree on them together." },
  { theme: "Respect", thought: "Starting meetings on time is a small way of saying everyone's time matters.", tryThis: "Start your next meeting right on time, even if someone's late." },
  { theme: "Development", thought: "The best managers make themselves a little less needed every year.", tryThis: "Pick one decision you usually make. Let someone on your team make it this week." },
  { theme: "Culture", thought: "Work is serious. That doesn't mean it has to be joyless. A little lightness goes a long way.", tryThis: "Share something good that happened this week, at work or otherwise." },
];

export const EXEC_THOUGHTS: Thought[] = [
  { theme: "Culture", thought: "Culture is what happens when leadership isn't in the room. It's set by what gets rewarded and what gets tolerated.", tryThis: "Name one behavior you've been tolerating that doesn't match who you want to be." },
  { theme: "Communication", thought: "By the time leaders are tired of saying something, the team is just starting to hear it.", tryThis: "Repeat this quarter's top priority at your next all-hands, even if you've said it before." },
  { theme: "Managers", thought: "Your managers are your culture. Investing in them is the highest-return people work there is.", tryThis: "Ask one of your managers: What's the hardest part of managing right now?" },
  { theme: "Hiring", thought: "A bad hire costs far more than an open seat. Slow down the decision, not the process.", tryThis: "Look at your open roles. Is any of them being rushed to fill a gap instead of to find the right person?" },
  { theme: "Pay", thought: "People can handle hearing \"not yet\" on pay. What erodes trust is not knowing how pay decisions get made.", tryThis: "Write down how a raise gets decided here. If it's hard to explain, that's a signal." },
  { theme: "Values", thought: "Values only count if you'd hold to them when it costs you something.", tryThis: "Think about a recent decision. Which of your values did it reflect?" },
  { theme: "Purpose", thought: "People want to know how their work connects to the bigger picture. Tell them.", tryThis: "Share one result this month and who made it happen." },
  { theme: "Retention", thought: "Turnover is a lagging number. By the time it shows up, the reasons are months old.", tryThis: "Ask HR for one early signal to watch: overtime, sick days, open roles or engagement." },
  { theme: "Listening", thought: "The higher you go, the more filtered the information you get. Go find the unfiltered version.", tryThis: "Have lunch or a walk with someone two levels down." },
  { theme: "Decisions", thought: "A good decision made today often beats a perfect one made next month.", tryThis: "Is there a decision waiting on you? Set the date you'll make it." },
  { theme: "Change", thought: "Big changes land better when people hear the why from the top and the how from their manager.", tryThis: "Before your next announcement, brief your managers first." },
  { theme: "Compliance", thought: "Good HR compliance isn't paperwork. It's how you make sure people are treated fairly and the company stays protected.", tryThis: "Ask when your handbook was last updated." },
  { theme: "Recognition", thought: "Recognition from the top carries extra weight. A short note from a leader gets remembered for years.", tryThis: "Send a two-line thank-you to someone on the front line." },
  { theme: "Growth", thought: "Growing companies outgrow their systems before they notice. People feel it first.", tryThis: "Ask your team: What's one process that worked when we were smaller but doesn't now?" },
  { theme: "Trust", thought: "Transparency doesn't mean sharing everything. It means not leaving people to fill in the blanks.", tryThis: "Where is your team guessing right now? Fill in one blank." },
  { theme: "Wellbeing", thought: "Burnout is a business risk, not just a personal one. It shows up as mistakes, turnover and lost customers.", tryThis: "Find out who has gone longest without time off. Encourage them to take some." },
  { theme: "Accountability", thought: "If leaders don't follow the rules, the rules stop meaning anything.", tryThis: "Pick one policy you ask others to follow. Make sure you're following it too." },
  { theme: "Feedback", thought: "Ask for feedback before you need it. Leaders who ask regularly hear about problems while they're still small.", tryThis: "Ask a leader you trust: What am I not hearing?" },
  { theme: "Onboarding", thought: "Every new hire is a fresh set of eyes. Ask what they notice before they get used to it.", tryThis: "Ask your newest hire: What's surprised you most so far?" },
  { theme: "People first", thought: "Strategy matters. But it's people who carry it out, one week at a time.", tryThis: "Ask your leadership team: What do our people need from us this month?" },
];

/** Today's thought: the same for everyone on the same day, a different one each weekday. */
export function thoughtFor(exec: boolean, d = new Date()): Thought {
  const list = exec ? [...EXEC_THOUGHTS, ...MANAGER_THOUGHTS.filter((_, i) => i % 3 === 0)] : MANAGER_THOUGHTS;
  const day = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 5)) / 864e5);
  const weekday = Math.floor(day / 7) * 5 + Math.min(day % 7, 4); // weekends repeat Friday's
  return list[((weekday % list.length) + list.length) % list.length];
}
