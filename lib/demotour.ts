// The 90-second guided demo on demo.alzapc.com: pick who you are, then five stops.
export type TourRole = "leader" | "manager" | "employee";
export interface TourStep { path: string; title: string; text: string; sel?: string; tryIt?: string }

export const TOUR_ROLES: { id: TourRole; label: string; blurb: string }[] = [
  { id: "manager", label: "I manage a team", blurb: "Your team's week, shoutouts and reviews" },
  { id: "employee", label: "I'm an employee", blurb: "Your first day, the Team Wall and your review" },
];

const C = "/c/harborlight";
export const TOUR: Record<TourRole, TourStep[]> = {
  leader: [],
  manager: [
    { path: `${C}/hub`, title: "Your team's week", text: "Who needs a check-in, who deserves a thank-you, and reviews you owe, all in one place.", sel: '[data-tour="hub-week"]', tryIt: "Tap a group." },
    { path: `${C}/hub`, title: "Check in or say thanks", text: "Log a quick check-in, or send a shoutout that lands on the Team Wall.", sel: '[data-tour="hub-quick"]', tryIt: "Tap Send a shoutout." },
    { path: "/shout/demo", title: "Send a shoutout", text: "Pick a name, say why, send. It lands on the Team Wall and in their inbox.", tryIt: "Send one with any name. Watch the confetti." },
    { path: `${C}/reviews`, title: "Start a review", text: "Each review has one button. The questions walk you through it in about 10 minutes, in English or Spanish.", sel: ".rd-list", tryIt: "Tap Start on a review." },
    { path: `${C}/hub`, title: "Plan a new hire's first week", text: "Every new hire comes with a simple first-week plan, so day one goes well.", sel: "text:My new hires", tryIt: "Tap Your plan." },
  ],
  employee: [
    { path: "/welcome/demo", title: "Day one starts here", text: "Before your first day: when, where, who to ask for, and a short to-do list.", tryIt: "Check off a to-do." },
    { path: "/shout/demo", title: "Thank a coworker", text: "No app, no password. Pick a name, say why, send.", tryIt: "Send one with any name. Watch the confetti." },
    { path: "/shout/demo?wall=1", title: "The Team Wall", text: "Every shoutout lands here, plus team challenges like the Appreciation Chain and the Welcome Wagon.", tryIt: "Tap a challenge to see how it works." },
    { path: "/my-review/demo-review", title: "Your review, your language", text: "Read it in English or Spanish, add a comment, and sign off.", tryIt: "Switch to Spanish." },
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
