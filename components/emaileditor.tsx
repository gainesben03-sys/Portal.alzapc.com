"use client";

import { useMemo, useState } from "react";
import { Brand, EmailEdits, emailDefaults, firstDayEmail, firstName, Hire, officeList, OnboardingSettings, welcomeEmail } from "@/lib/hires";
import { LIVE } from "@/lib/supabase";
import { Sheet } from "./ui";

type Kind = "welcome" | "firstDay";

/** Preview only: let the 600px email shrink to the screen, as phone mail apps do. */
const fitPreview = (html: string) => html.replace("<html>", '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>table[width="600"]{width:100%!important}td{word-break:break-word}</style></head>');
export type EmailEditFields = { subject: string; message: string; closing: string; actionItems: string; arrivalTime: string; location: string };

/** What gets saved on the hire: blank wording means "use the standard text", so later setup changes still flow in. */
export function editsToChanges(kind: Kind, f: EmailEditFields, h: Hire, s: OnboardingSettings, company: string): Partial<Hire> {
  const d = emailDefaults(kind, h, s, company);
  const keep = (v: string, def: string) => (v.trim() && v.trim() !== def.trim() ? v.trim() : undefined);
  const e: EmailEdits = { subject: keep(f.subject, d.subject), message: keep(f.message, d.message), closing: keep(f.closing, d.closing) };
  const out: Partial<Hire> = { emailEdits: { ...(h.emailEdits ?? {}), [kind]: e } };
  if (kind === "welcome") out.actionItems = f.actionItems;
  else {
    out.arrivalTime = f.arrivalTime;
    out.location = f.location;
  }
  return out;
}

/** Preview a new hire email, change the wording for this one person, then send. */
export function EmailEditor({
  kind,
  h,
  s,
  brand,
  canManage,
  canSend,
  busy,
  onClose,
  onSave,
  onSend,
}: {
  kind: Kind;
  h: Hire;
  s: OnboardingSettings;
  brand: Brand;
  canManage: boolean;
  canSend: boolean;
  busy: string;
  onClose: () => void;
  onSave: (changes: Partial<Hire>) => void;
  onSend: (test: boolean, f: EmailEditFields) => Promise<boolean>;
}) {
  const start = (): EmailEditFields => {
    const d = emailDefaults(kind, h, s, brand.company);
    const e = h.emailEdits?.[kind] ?? {};
    return { subject: e.subject || d.subject, message: e.message || d.message, closing: e.closing || d.closing, actionItems: h.actionItems ?? "", arrivalTime: h.arrivalTime ?? "", location: h.location ?? "" };
  };
  const [f, setF] = useState<EmailEditFields>(start);
  const [saved, setSaved] = useState<EmailEditFields>(start);
  const [editing, setEditing] = useState(false);
  const set = (k: keyof EmailEditFields, v: string) => setF((x) => ({ ...x, [k]: v }));
  const first = firstName(h);

  const draft: Hire = useMemo(() => ({ ...h, ...editsToChanges(kind, f, h, s, brand.company) }), [kind, f, h, s, brand.company]);
  const mail = kind === "welcome" ? welcomeEmail(draft, s, brand) : firstDayEmail(draft, s, brand);
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const places = [s.hqAddress, ...officeList(s)].filter(Boolean);
  const sent = h.emails?.[kind];

  const save = () => {
    onSave(editsToChanges(kind, f, h, s, brand.company));
    setSaved(f);
  };

  return (
    <Sheet title={kind === "welcome" ? "Welcome email" : "First-day email"} onClose={onClose}>
      <div className="tiny muted">To: {h.personalEmail || "(no personal email yet)"}</div>

      {editing ? (
        <div className="email-edit">
          <label className="f">Subject<input className="f" value={f.subject} onChange={(e) => set("subject", e.target.value)} /></label>
          <label className="f">
            Message <span className="tiny muted">(leave a blank line between paragraphs)</span>
            <textarea className="f" style={{ minHeight: 150 }} value={f.message} onChange={(e) => set("message", e.target.value)} />
          </label>
          {kind === "welcome" ? (
            <label className="f">
              Action items <span className="tiny muted">(one per line, optional)</span>
              <textarea className="f" style={{ minHeight: 70 }} value={f.actionItems} onChange={(e) => set("actionItems", e.target.value)} placeholder="e.g. Reply with your cell phone number" />
            </label>
          ) : (
            <div className="email-edit-row">
              <label className="f">Arrive by<input className="f" value={f.arrivalTime} onChange={(e) => set("arrivalTime", e.target.value)} placeholder={s.defaultArrival} /></label>
              <label className="f">
                Where
                <input className="f" list="email-places" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder={s.hqAddress || "Address"} />
                <datalist id="email-places">{places.map((p) => <option key={p} value={p} />)}</datalist>
              </label>
            </div>
          )}
          <label className="f">Closing line<input className="f" value={f.closing} onChange={(e) => set("closing", e.target.value)} /></label>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <button
              className="linklike tiny"
              onClick={() => {
                const d = emailDefaults(kind, h, s, brand.company);
                setF((x) => ({ ...x, subject: d.subject, message: d.message, closing: d.closing }));
              }}
            >
              Use the standard wording
            </button>
            <button className="btn ghost sm" onClick={() => setEditing(false)}>Done editing</button>
          </div>
        </div>
      ) : (
        <div className="small" style={{ margin: "4px 0 10px", display: "flex", gap: 8, alignItems: "center" }}>
          <span className="grow" style={{ minWidth: 0 }}><b>Subject:</b> {mail.subject}</span>
          {canManage && <button className="btn sm" onClick={() => setEditing(true)}>Edit</button>}
        </div>
      )}

      <iframe className="email-frame" title="Email preview" srcDoc={fitPreview(mail.html)} sandbox="" />
      {canManage && <p className="tiny muted" style={{ marginTop: 6 }}>Changes apply to {first}&apos;s email only{s.autoSend && !sent ? ", including when it goes out automatically" : ""}. To change it for every hire, edit the client&apos;s new hire onboarding settings.</p>}

      <div className="action-foot" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button className="btn ghost sm" onClick={onClose}>Close</button>
        {canManage && dirty && <button className="btn ghost sm" onClick={save}>Save changes</button>}
        {canManage && LIVE && (
          <button
            className="btn ghost sm"
            disabled={!!busy}
            onClick={async () => {
              if (dirty) save();
              await onSend(true, f);
            }}
          >
            {busy === kind + "t" ? "Sending..." : "Send me a test"}
          </button>
        )}
        {canManage && (
          <button
            className="btn primary sm"
            disabled={!!busy || !canSend}
            title={!canSend ? "Available once the offer is signed" : undefined}
            onClick={async () => {
              if (dirty) save();
              if (await onSend(false, f)) onClose();
            }}
          >
            {busy === kind ? "Sending..." : sent ? `Send again to ${first}` : `Send to ${first}`}
          </button>
        )}
      </div>
    </Sheet>
  );
}
