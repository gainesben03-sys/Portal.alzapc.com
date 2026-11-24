"use client";

import { useMail } from "@/components/mail";

// The one way to reach HR from the People Hub: his email and a tap-to-text number.
export const BEN_EMAIL = "ben@alzapc.com";
export const BEN_TEXT = "+16262248161";
export const BEN_TEXT_SHOWN = "(626) 224-8161";

export function ContactBen({ strong, label }: { strong?: boolean; label?: string }) {
  const mail = useMail();
  return (
    <span className="contact-ben">
      {label && <span className="small muted">{label}</span>}
      <a className={`btn sm ${strong ? "primary" : ""}`} {...mail(BEN_EMAIL)}>Email HR</a>
      <a className="btn sm" href={`sms:${BEN_TEXT}`}>Text HR</a>
    </span>
  );
}

/** Footer line for the dashboard. */
export function ContactBenLine() {
  const mail = useMail();
  return (
    <p className="small muted contact-line">
      Questions for HR? Email <a {...mail(BEN_EMAIL)}>{BEN_EMAIL}</a> or text <a href={`sms:${BEN_TEXT}`}>{BEN_TEXT_SHOWN}</a>.
    </p>
  );
}
