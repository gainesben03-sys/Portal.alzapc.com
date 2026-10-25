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
  allowWritten: boolean;
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
    allowWritten: true,
    askResume: true,
    askLinkedin: true,
    review: "ben",
    createdAt: new Date().toISOString(),
  };
}

export const pitchOpen = (p?: PitchSettings) => !!p && p.open && (!p.closesAt || p.closesAt >= new Date().toISOString().slice(0, 10));

export const MAX_UPLOAD_MB = 50;
export const MAX_RESUME_MB = 10;
