// Video screening (the portal's simplified AlzaPitch): settings per role and what a candidate sends.
// Pure, shared by browser and server.

export interface PitchSettings {
  slug: string; // the public link: /pitch/<slug>
  open: boolean;
  prompts: string[]; // shown on screen while they record
  maxSeconds: number; // 60, 90 or 120
  intro: string; // a short welcome from the company
  allowUpload: boolean; // upload a video they already recorded
  allowAudio: boolean;
  allowWritten: boolean; // retired: candidates send video or audio only
  askResume: boolean;
  askLinkedin: boolean;
  review: "ben" | "client"; // Ben screens first, or straight to the client
  closesAt?: string; // yyyy-mm-dd
  createdAt: string;
}

export interface PitchSubmission {
  kind: "video" | "audio" | "written";
  mediaPath?: string;
  mime?: string;
  seconds?: number;
  text?: string;
  email: string;
  phone?: string;
  linkedin?: string;
  resumePath?: string;
  resumeName?: string;
  submittedAt: string;
}

/** A private link Ben sends to someone outside the portal so they can watch pitches and say yes or no. */
export interface ReviewLink {
  id: string;
  token: string; // long random; the link is /review/<token>
  name: string; // who it's for, so their yes/no is labeled
  email?: string;
  createdAt: string;
  expiresAt?: string; // yyyy-mm-dd, last day it works
  revoked?: boolean;
}
/** One outside reviewer's call on a candidate. */
export interface OutsideReview {
  reviewerId: string;
  name: string;
  decision: "yes" | "no";
  note?: string;
  at: string;
}

export function newReviewLink(name: string, email?: string, expiresAt?: string): ReviewLink {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const token = Array.from(crypto.getRandomValues(new Uint8Array(28)), (b) => abc[b % abc.length]).join("");
  return { id: `rv${Date.now().toString(36)}`, token, name: name.trim(), email: email?.trim() || undefined, createdAt: new Date().toISOString(), expiresAt };
}
export const reviewLinkLive = (l: ReviewLink) => !l.revoked && (!l.expiresAt || l.expiresAt >= new Date().toISOString().slice(0, 10));

export const DEFAULT_PROMPTS = ["Who you are and what you do best", "Why this role, and why now", "One result you're proud of"];

export function newPitch(title: string): PitchSettings {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "role";
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
  return {
    slug: `${base}-${rand}`,
    open: true,
    prompts: [...DEFAULT_PROMPTS],
    maxSeconds: 90,
    intro: "Thanks for your interest. Instead of a cover letter, we'd love a short video so we can get to know you.",
    allowUpload: true,
    allowAudio: true,
    allowWritten: false,
    askResume: true,
    askLinkedin: true,
    review: "ben",
    createdAt: new Date().toISOString(),
  };
}

export const pitchOpen = (p?: PitchSettings) => !!p && p.open && (!p.closesAt || p.closesAt >= new Date().toISOString().slice(0, 10));

export const MAX_UPLOAD_MB = 50;

/** Pitch videos are kept until a week after the role's cutoff date, so the hiring team can look back while deciding. */
export const DELETE_AFTER_CUTOFF_DAYS = 7;
/** Without a cutoff date, videos are deleted this long after they were sent. */
export const DELETE_NO_CUTOFF_DAYS = 30;
/** Pitches Ben passed on before sharing go a week after he passed. */
export const DELETE_AFTER_PASS_DAYS = 7;

/** When this candidate's pitch video will be (or was due to be) deleted. Clearing a candidate deletes it right away. */
export function pitchDeleteOn(c: { decidedAt?: string; screened?: string; cleared?: boolean; clearedAt?: string; pitch?: { submittedAt: string } }, closesAt?: string): Date | null {
  if (!c.pitch) return null;
  if (c.cleared) return new Date(c.clearedAt ?? Date.now());
  const add = (from: string, days: number) => {
    const d = new Date(from);
    d.setDate(d.getDate() + days);
    return d;
  };
  if (c.screened === "passed" && c.decidedAt) return add(c.decidedAt, DELETE_AFTER_PASS_DAYS);
  if (closesAt) return add(`${closesAt}T23:59:00`, DELETE_AFTER_CUTOFF_DAYS);
  return add(c.pitch.submittedAt, DELETE_NO_CUTOFF_DAYS);
}
/** Past the role's cutoff date. */
export const pastCutoff = (closesAt?: string) => !!closesAt && closesAt < new Date().toISOString().slice(0, 10);
export const MAX_RESUME_MB = 10;
