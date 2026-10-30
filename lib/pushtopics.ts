// Push notification topics: what each person can turn on or off. Shared by browser and server.
export type PushTopic = "activity" | "requests" | "reminders" | "replies" | "hires" | "team";

export const BEN_TOPICS: { key: PushTopic; label: string; sub: string }[] = [
  { key: "activity", label: "Client activity", sub: "Notes, uploads, approvals, change requests, feedback" },
  { key: "hires", label: "New hires", sub: "Offers signed or declined, hires started by a client" },
  { key: "reminders", label: "Escalations and blockers", sub: "When something is stuck past its due date" },
];

export const CLIENT_TOPICS: { key: PushTopic; label: string; sub: string }[] = [
  { key: "requests", label: "New requests from Ben", sub: "Approvals and anything that needs you" },
  { key: "reminders", label: "Due today and overdue", sub: "Only when something is due or late" },
  { key: "replies", label: "Replies from Ben", sub: "When Ben answers your note or question" },
  { key: "team", label: "Your team", sub: "Birthdays, work anniversaries, new starters and your Monday list (managers)" },
];

/** Everything is on until someone turns it off. */
/** Defaults are quiet: alerts for things that need you; everything else is opt-in. */
const DEFAULT_ON: Record<PushTopic, boolean> = { activity: true, hires: true, reminders: true, requests: true, replies: false, team: true };
export const topicOn = (topics: Partial<Record<PushTopic, boolean>> | null | undefined, t: PushTopic) => topics?.[t] ?? DEFAULT_ON[t];
