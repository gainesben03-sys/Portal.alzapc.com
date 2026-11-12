"use client";

// The one way to reach Ben from the portal: his email and a tap-to-text number.
export const BEN_EMAIL = "ben@alzapc.com";
export const BEN_TEXT = "+16262248161";
export const BEN_TEXT_SHOWN = "(626) 224-8161";

export function ContactBen({ strong, label }: { strong?: boolean; label?: string }) {
  return (
    <span className="contact-ben">
      {label && <span className="small muted">{label}</span>}
      <a className={`btn sm ${strong ? "primary" : ""}`} href={`mailto:${BEN_EMAIL}`}>Email Ben</a>
      <a className="btn sm" href={`sms:${BEN_TEXT}`}>Text Ben</a>
    </span>
  );
}

/** Footer line for the dashboard. */
export function ContactBenLine() {
  return (
    <p className="small muted contact-line">
      Questions for Ben? Email <a href={`mailto:${BEN_EMAIL}`}>{BEN_EMAIL}</a> or text <a href={`sms:${BEN_TEXT}`}>{BEN_TEXT_SHOWN}</a>.
    </p>
  );
}
