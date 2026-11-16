// Which email app a "send email" link opens.
// mailto: opens whatever the computer's default is (often Apple Mail on a Mac). Companies on
// Microsoft 365 or Google Workspace can send those links straight to Outlook or Gmail on the web instead.
export type MailApp = "default" | "outlook" | "gmail";
type Kind = MailApp | "outlook-live";

export const MAIL_APPS: { id: MailApp; label: string; sub: string }[] = [
  { id: "outlook", label: "Outlook", sub: "Microsoft 365" },
  { id: "gmail", label: "Gmail", sub: "Google Workspace" },
  { id: "default", label: "Device default", sub: "Whatever the computer is set to" },
];

export const cleanMailApp = (v: unknown): MailApp | undefined => (v === "outlook" || v === "gmail" || v === "default" ? v : undefined);

/** For people writing from a personal address (new hires), guess their app from it. */
export function appForAddress(email: string | undefined, fallback: Kind = "default"): Kind {
  const e = (email || "").trim().toLowerCase();
  if (/@(gmail|googlemail)\.com$/.test(e)) return "gmail";
  if (/@(outlook|hotmail|live|msn)\.[a-z.]+$/.test(e)) return "outlook-live";
  return fallback;
}

/** A link that starts a new email in the right app. */
export function composeUrl(app: Kind | undefined, to: string, subject = "", body = "") {
  const q = (o: Record<string, string>) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  if (app === "gmail") return `https://mail.google.com/mail/?${q({ view: "cm", fs: "1", to, su: subject, body })}`;
  if (app === "outlook") return `https://outlook.office.com/mail/deeplink/compose?${q({ to, subject, body })}`;
  if (app === "outlook-live") return `https://outlook.live.com/mail/0/deeplink/compose?${q({ to, subject, body })}`;
  const rest = q({ subject, body });
  return `mailto:${to}${rest ? `?${rest}` : ""}`;
}

/** Props for an <a>: web apps open in a new tab, mailto stays put. */
export function mailProps(app: Kind | undefined, to: string, subject = "", body = "") {
  const href = composeUrl(app, to, subject, body);
  return href.startsWith("mailto:") ? { href } : { href, target: "_blank", rel: "noopener noreferrer" };
}
