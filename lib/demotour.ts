// The 90-second guided demo on demo.alzapc.com: pick who you are, then five stops.
export type TourRole = "leader" | "manager" | "employee";
export interface TourStep { path: string; title: string; text: string; sel?: string }

export const TOUR_ROLES: { id: TourRole; label: string; blurb: string }[] = [
  { id: "leader", label: "I run the company", blurb: "What needs you, at a glance" },
  { id: "manager", label: "I manage a team", blurb: "Your team's week, on your phone" },
  { id: "employee", label: "I'm an employee", blurb: "Your first day, thank-yous and reviews" },
];

const C = "/c/harborlight";
export const TOUR: Record<TourRole, TourStep[]> = {
  leader: [
    { path: C, title: "Everything, at a glance", text: "Open it and you see what needs you: who's starting, what's waiting on you, and what's moving.", sel: "main h1" },
    { path: C, title: "Every HR project", text: "Where each project stands and who it's waiting on. Reminders do the chasing.", sel: "text:Projects" },
    { path: `${C}/hires`, title: "New hires, handled", text: "Every new hire from offer to day one, with a checklist and welcome emails that go out on their own.", sel: "main h1" },
    { path: `${C}/reviews`, title: "Reviews on schedule", text: "See every review's progress, and launch the next round in two taps.", sel: ".rd-health" },
    { path: `${C}/pulse/insights`, title: "Hear from your team", text: "Short anonymous surveys, turned into what's working, what needs attention and what to do next.", sel: "main h1" },
  ],
  manager: [
    { path: `${C}/hub`, title: "Your team's week", text: "Who needs a check-in, who deserves a thank-you, and reviews you owe. Tap a group to act.", sel: '[data-tour="hub-week"]' },
    { path: `${C}/hub`, title: "Two quick buttons", text: "Log a check-in or recognize someone in under a minute, right from your phone.", sel: '[data-tour="hub-quick"]' },
    { path: `${C}/recognition`, title: "Say thanks", text: "Give a shoutout in about 20 seconds. It lands on the Team Wall and in their inbox.", sel: "text:Give a shoutout" },
    { path: `${C}/reviews`, title: "Reviews in minutes", text: "Your reviews, each with one button. Most take about 10 minutes, in English or Spanish.", sel: ".rd-list" },
  ],
  employee: [
    { path: "/welcome/demo", title: "Day one starts here", text: "Before your first day: when, where, who to ask for, and a short to-do list." },
    { path: "/shout/demo", title: "Thank a coworker", text: "No app, no password. Pick a name, say why, send. It shows up on the Team Wall." },
    { path: "/my-review/demo-review", title: "Your review, your language", text: "Read it in English or Spanish, add a comment, and sign off." },
  ],
};

export const TOUR_KEY = "alza-demo-tour";
export interface TourState { role: TourRole; step: number; done?: boolean }
export function readTour(): TourState | null {
  try { return JSON.parse(sessionStorage.getItem(TOUR_KEY) || "null"); } catch { return null; }
}
export function writeTour(s: TourState | null) {
  try { if (s) sessionStorage.setItem(TOUR_KEY, JSON.stringify(s)); else sessionStorage.removeItem(TOUR_KEY); } catch {}
  window.dispatchEvent(new Event("alza-demo-tour"));
}
