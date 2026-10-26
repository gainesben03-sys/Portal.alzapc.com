"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ReactNode, Suspense, useMemo, useRef, useState } from "react";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { Checks, HireDraft, HireForm, startsIn, Tracker } from "@/components/hires";
import { afterSend, approvalTask, requestSignature, sendHireEmail, signedTasks, storeHireFile } from "@/components/hireops";
import { DraftPanel } from "@/components/draft";
import { FillPanel } from "@/components/fillpanel";
import { EmailEditFields, EmailEditor } from "@/components/emaileditor";
import { fmtTime } from "@/lib/data";
import { docxBlob, docxName, DOCX_MIME } from "@/lib/docx";
import { addDaysISO, firstName, forCompany, Hire, hireCompany, senderFor, longDate, onboardingFor, payLine, shortDate, Stage, STAGES, stageIndex } from "@/lib/hires";
import { useStore } from "@/lib/store";
import { pingTask } from "@/lib/pushclient";
import { LIVE, openStored } from "@/lib/supabase";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function HireInner() {
  const { client: clientId, id } = useParams<{ client: string; id: string }>();
  const ok = useGuard("client", clientId);
  const q = useSearchParams();
  const { getClient, hires, config, viewer, me, who, patch, actions, files, updateHire } = useStore();
  const client = getClient(clientId);
  const cfg = config[clientId];
  const h = hires.find((x) => x.id === id && x.clientId === clientId);
  const s = onboardingFor(cfg?.onboarding);
  const toast = useToast();
  const [editing, setEditing] = useState<HireDraft | null>(null);
  const [drafting, setDrafting] = useState<null | "offer" | "agreement">(null);
  const [filling, setFilling] = useState<null | "offer" | "agreement">(null);
  const [preview, setPreview] = useState<null | "welcome" | "firstDay">(null);
  const [busy, setBusy] = useState("");
  const [confirmSign, setConfirmSign] = useState<NonNullable<Hire["docs"]>[number] | null>(null);
  const signedInput = useRef<HTMLInputElement>(null);

  const brand = useMemo(() => ({ company: client?.name ?? "", accent: client?.accent ?? "#19283c", logoUrl: client?.logo }), [client]);

  if (!ok || !client || !cfg) return null;
  if (!h)
    return (
      <div>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">This hire isn't here anymore. <Link href={`/c/${clientId}/hires`}>Back to New hires</Link></div></main>
      </div>
    );

  const isAdvisor = viewer?.kind === "advisor";
  const canManage = isAdvisor || me?.access === "exec";
  const first = firstName(h);
  const stage = stageIndex(h.status);
  const firstDayOn = h.startDate ? addDaysISO(h.startDate, -s.firstDayDaysBefore) : "";
  const myTasks = actions.filter((a) => a.clientId === clientId && (a.title.includes(h.name) || (a.title === `Get ready for ${first}'s first day` && !!a.history[0]?.text.includes(h.name))));

  // ---------------------------------------------------------------- actions
  const setStage = (status: Stage, log: string) => updateHire(h.id, { status }, log);

  const send = async (kind: "welcome" | "firstDay", test = false, f?: EmailEditFields): Promise<boolean> => {
    const label = kind === "welcome" ? "Welcome email" : "First-day email";
    if (!test && !h.personalEmail) {
      toast.show(`Add ${first}'s personal email first.`);
      return false;
    }
    if (!LIVE) {
      if (test) {
        toast.show("Demo mode: test emails go out once the portal is live.");
        return false;
      }
      const at = new Date().toISOString();
      updateHire(h.id, (x) => afterSend(x, kind, at), `${label} sent to ${h.personalEmail} (demo, not really sent)`);
      toast.show(`${label} marked as sent (demo mode)`);
      return true;
    }
    setBusy(kind + (test ? "t" : ""));
    const edits = f ? { subject: f.subject, message: f.message, closing: f.closing, ...(kind === "welcome" ? { actionItems: f.actionItems } : { arrivalTime: f.arrivalTime, location: f.location }) } : undefined;
    const r = await sendHireEmail(h.id, kind, test, edits);
    setBusy("");
    toast.show(r.msg);
    if (r.sent && !test) {
      const at = new Date().toISOString();
      updateHire(h.id, (x) => afterSend(x, kind, at), `${label} sent to ${r.to}`);
    }
    return r.sent;
  };

  const markSigned = async () => {
    const tasks = h.tasksCreated ? [] : signedTasks(h, cfg, client);
    if (tasks.length) {
      patch({ actions: [...actions, ...tasks] });
      if (isAdvisor) tasks.forEach((t) => pingTask(t.id));
    }
    const prep = tasks.find((t) => t.side === "client");
    const owners = prep ? [prep.owner.name] : [];
    updateHire(h.id, { status: "Offer signed", tasksCreated: true }, `Offer signed${tasks.length ? `. Payroll setup added to Ben's list${prep ? `; first-day prep sent to ${prep.owner.name}` : ""}` : ""}`);
    if (s.autoSend && !h.emails?.welcome && h.personalEmail) {
      toast.show("Offer signed. Sending the welcome email...");
      await wait(LIVE ? 1800 : 300); // let the change save first
      await send("welcome");
    } else toast.show(owners.length ? `Offer signed. Payroll setup is on Ben's list; first-day prep went to ${owners[0]}.` : "Offer signed");
  };

  const addDoc = async (file: File, kind: "offer" | "agreement" | "signed") => {
    const label = kind === "offer" ? "Offer letter" : kind === "agreement" ? "Employment agreement" : "Signed offer";
    setBusy("doc");
    try {
      const rec = await storeHireFile(h, file, who, isAdvisor, `${label} for ${h.name}`);
      patch({ files: [{ ...rec, category: kind === "signed" ? "Signed document" : rec.category }, ...files] });
      updateHire(h.id, (x) => ({ docs: [...(x.docs ?? []), { kind, name: file.name, path: rec.path, at: rec.at }] }), `${label} added: ${file.name}`);
      toast.show(`${label} saved`);
      return rec;
    } catch {
      toast.show("Upload failed. Try again.");
    } finally {
      setBusy("");
    }
  };

  const openDoc = async (d: NonNullable<Hire["docs"]>[number]) => {
    if (!d.path) return toast.show("In demo mode files aren't stored. Download from the draft instead.");
    try {
      await openStored(d.path);
    } catch {
      toast.show("Couldn't open that file");
    }
  };

  const sendForSignature = async (d: NonNullable<Hire["docs"]>[number]) => {
    const kind = d.kind === "agreement" ? "agreement" : "offer";
    const label = kind === "offer" ? "Offer letter" : "Employment agreement";
    setConfirmSign(null);
    const mirror = () => {
      const at = new Date().toISOString();
      updateHire(h.id, (x) => ({ esign: { ...(x.esign ?? {}), [kind]: { status: "sent", at } }, status: kind === "offer" && stageIndex(x.status) < 1 ? "Offer sent" : x.status }), `${label} sent for e-signature to ${h.personalEmail}${LIVE ? "" : " (demo, not really sent)"}`);
    };
    if (!LIVE) {
      mirror();
      return toast.show("Demo mode: marked as sent for signature");
    }
    setBusy("sign");
    let r = await requestSignature(h.id, d.path!, kind);
    if (!r.ok && (r.reason === "not_found" || r.reason === "no_document")) {
      await wait(2500); // a just-saved document may still be on its way to the database
      r = await requestSignature(h.id, d.path!, kind);
    }
    setBusy("");
    if (r.ok) {
      mirror();
      toast.show(`Sent to ${h.personalEmail} to sign`);
    } else toast.show(r.msg);
  };

  const cancelSignature = async (kind: "offer" | "agreement") => {
    if (LIVE) {
      const r = await requestSignature(h.id, "", kind, true);
      if (!r.ok) return toast.show(r.msg);
    }
    updateHire(h.id, (x) => ({ esign: { ...(x.esign ?? {}), [kind]: undefined } }), `Cancelled the ${kind === "offer" ? "offer letter" : "agreement"} signing request`);
    toast.show("Signing link cancelled");
  };

  const askApproval = (d: NonNullable<Hire["docs"]>[number]) => {
    const a = approvalTask(h, client, d);
    patch({ actions: [...actions, a] });
    pingTask(a.id);
    updateHire(h.id, {}, `Offer letter sent to ${client.escalation.name} for approval`);
    toast.show(`Sent to ${client.escalation.name} to approve`);
  };

  // ---------------------------------------------------------------- next step
  let next: { text: ReactNode; buttons?: ReactNode } = { text: "" };
  const sig = h.esign ?? {};
  const respond = h.respondBy ? ` They have until ${shortDate(h.respondBy)} to respond.` : "";
  switch (h.status) {
    case "Approved to hire":
      next = isAdvisor
        ? { text: "Draft the offer letter below, get it approved, then send it for e-signature. Sent it another way? Mark it sent.", buttons: <button className="btn sm" onClick={() => setStage("Offer sent", "Offer sent")}>Mark offer sent</button> }
        : { text: "Ben is preparing the offer letter. You'll get it here to approve before it goes out." };
      break;
    case "Offer sent":
      next = {
        text: sig.offer?.status === "viewed" ? `${first} opened the offer letter ${fmtTime(sig.offer.at)}. Waiting on their signature.${respond}` : sig.offer?.status === "declined" ? `${first} declined to sign${sig.offer.note ? `: "${sig.offer.note}"` : "."} Talk with them, then send a revised offer.` : sig.offer ? `Out for e-signature since ${fmtTime(sig.offer.at)}. You'll get an email the moment ${first} signs.${respond}` : `Waiting on ${first} to sign.${respond}`,
        buttons: canManage && (
          <>
            <button className="btn sm" disabled={busy === "doc"} onClick={() => signedInput.current?.click()}>Upload signed offer</button>
            <button className="btn primary sm" onClick={markSigned}>Mark offer signed</button>
          </>
        ),
      };
      break;
    case "Offer signed":
      next = {
        text: (
          <>
            Signed. {h.emails?.welcome ? `Welcome email went out ${shortDate(h.emails.welcome.slice(0, 10))}.` : s.autoSend ? "The welcome email goes out with tomorrow morning's run if it isn't sent before then." : "Send the welcome email when you're ready."}{" "}
            Next: new-hire paperwork in {s.payroll}.
          </>
        ),
        buttons: canManage && <button className="btn primary sm" onClick={() => setStage("Package ready", "New-hire paperwork done")}>Paperwork done</button>,
      };
      break;
    case "Package ready":
      next = {
        text: s.autoSend && firstDayOn ? `The first-day email goes out automatically on ${shortDate(firstDayOn)}, ${s.firstDayDaysBefore} days before ${first} starts.` : "Send the first-day email about a week before the start date.",
        buttons: canManage && <button className="btn primary sm" disabled={!!busy} onClick={() => send("firstDay")}>Send first-day email now</button>,
      };
      break;
    case "First-day email sent":
      next = {
        text: `All set for ${h.startDate ? longDate(h.startDate) : "day one"}.`,
        buttons: canManage && <button className="btn primary sm" onClick={() => setStage("Started", `${first} started`)}>Mark started</button>,
      };
      break;
    case "Started":
      next = { text: `${first} is on the team. Ben checks in at 30 days.` };
  }

  const docs = h.docs ?? [];
  const emailRow = (kind: "welcome" | "firstDay") => {
    const sent = h.emails?.[kind];
    const title = kind === "welcome" ? "Welcome email" : "First-day email";
    const when = sent
      ? `Sent ${fmtTime(sent)}`
      : kind === "welcome"
        ? s.autoSend ? "Goes out when the offer is signed" : "Send it after the offer is signed"
        : s.autoSend && firstDayOn ? `Goes out ${shortDate(firstDayOn)}, ${s.firstDayDaysBefore} days before day one` : `Send about ${s.firstDayDaysBefore} days before day one`;
    return (
      <div className="email-row" key={kind}>
        <div className="grow">
          <b className="small">{title}</b>
          <div className={`tiny ${sent ? "" : "muted"}`} style={sent ? { color: "var(--green)" } : undefined}>{sent ? "✓ " : ""}{when}</div>
        </div>
        <button className="btn sm" onClick={() => setPreview(kind)}>{canManage ? (sent ? "Preview / send again" : "Preview & edit") : "Preview"}</button>
      </div>
    );
  };

  const co = hireCompany(h, s);
  const own = forCompany(h, s, brand, co?.logo);

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap wide">
        <Link href={isAdvisor && q.get("from") === "console" ? "/console/hires" : `/c/${clientId}/hires`} className="small" style={{ color: "var(--blue)" }}>← New hires</Link>

        {q.get("new") && !isAdvisor && (
          <div className="card section small" style={{ borderLeft: "3px solid var(--green)" }}>Sent to Ben. He'll draft the offer letter and send it to you to approve.</div>
        )}

        <div className="card section hire-hero">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0 }}>{h.name}</h1>
              <div className="small muted">{[h.title, h.managerName && `reports to ${h.managerName}`].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="countdown">
              <div className="n">{h.startDate ? shortDate(h.startDate) : "TBD"}</div>
              <div className="tiny muted">{startsIn(h.startDate)}</div>
            </div>
          </div>
          <Tracker h={h} />
          <div className="next-step">
            <div className="small">{next.text}</div>
            {next.buttons && <div className="next-buttons">{next.buttons}</div>}
          </div>
          {myTasks.length > 0 && (
            <div className="tiny muted" style={{ marginTop: 10 }}>
              Tasks:{" "}
              {myTasks.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && " · "}
                  <Link href={`/c/${clientId}/a/${a.id}`} style={{ color: "var(--blue)" }}>{a.title}</Link> ({a.status === "completed" ? "done" : a.owner.name})
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="hire-grid">
          <div>
            <div className="section-head section"><h2>Documents</h2></div>
            <div className="card">
              {docs.length === 0 && <div className="small muted">{isAdvisor ? "No documents yet. Draft the offer letter and agreement from this hire's details." : "Ben adds the offer letter and agreement here."}</div>}
              {docs.map((d, i) => (
                <div className="email-row" key={i}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b className="small" style={{ wordBreak: "break-word" }}>{d.name}</b>
                    <div className="tiny muted">{d.kind === "offer" ? "Offer letter" : d.kind === "agreement" ? "Employment agreement" : "Signed"} · {fmtTime(d.at)}</div>
                  </div>
                  <button className="btn ghost sm" onClick={() => openDoc(d)}>Open</button>
                  {isAdvisor && d.kind === "offer" && h.status === "Approved to hire" && !sig.offer && <button className="btn ghost sm" onClick={() => askApproval(d)}>Ask {client.escalation.name.split(" ")[0]} to approve</button>}
                  {canManage && d.kind !== "signed" && sig[d.kind]?.status !== "signed" && (
                    <button className={`btn sm ${sig[d.kind] ? "" : "primary"}`} disabled={busy === "sign"} onClick={() => (h.personalEmail ? setConfirmSign(d) : toast.show(`Add ${first}'s personal email first (Details → Edit).`))}>
                      {busy === "sign" ? "Sending..." : sig[d.kind] ? "Resend" : "Send for e-signature"}
                    </button>
                  )}
                  {d.kind !== "signed" && sig[d.kind] && (
                    <div className="tiny" style={{ flexBasis: "100%", color: sig[d.kind]!.status === "signed" ? "var(--green)" : sig[d.kind]!.status === "declined" ? "var(--red)" : "var(--amber)" }}>
                      {sig[d.kind]!.status === "signed" ? `✓ Signed electronically ${fmtTime(sig[d.kind]!.at)}` : sig[d.kind]!.status === "declined" ? `Declined ${fmtTime(sig[d.kind]!.at)}${sig[d.kind]!.note ? `: "${sig[d.kind]!.note}"` : ""}` : sig[d.kind]!.status === "viewed" ? `Opened by ${first} ${fmtTime(sig[d.kind]!.at)}, not signed yet` : `Out for signature since ${fmtTime(sig[d.kind]!.at)}`}
                      {canManage && (sig[d.kind]!.status === "sent" || sig[d.kind]!.status === "viewed") && <> · <button className="linklike" onClick={() => cancelSignature(d.kind as "offer" | "agreement")}>Cancel link</button></>}
                    </div>
                  )}
                </div>
              ))}
              {isAdvisor && !drafting && !filling && (
                <div className="chips" style={{ marginTop: 12 }}>
                  <button className="btn sm" onClick={() => setFilling("offer")}>Offer letter</button>
                  <button className="btn sm" onClick={() => setFilling("agreement")}>Contract</button>
                  <button className="btn ghost sm" onClick={() => setDrafting("offer")}><span className="spark" aria-hidden="true">✦</span> Draft offer letter</button>
                  <button className="btn ghost sm" onClick={() => setDrafting("agreement")}><span className="spark" aria-hidden="true">✦</span> Draft agreement</button>
                </div>
              )}
              {filling && (
                <div style={{ marginTop: 12 }}>
                  <FillPanel
                    clientId={clientId}
                    hireId={h.id}
                    hint={filling === "offer" ? "offer" : "agreement|contract|employment"}
                    fileName={`${h.name.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}_${filling === "offer" ? "Offer" : "Contract"}.docx`}
                    primaryLabel={`Save as ${filling === "offer" ? "offer letter" : "contract"}`}
                    onClose={() => setFilling(null)}
                    onUse={async (file) => {
                      const rec = await addDoc(file, filling);
                      if (rec) setFilling(null);
                    }}
                  />
                </div>
              )}
              {canManage && (
                <button className="btn ghost sm" style={{ marginTop: 10 }} disabled={busy === "doc"} onClick={() => signedInput.current?.click()}>
                  {busy === "doc" ? "Uploading..." : "Upload a signed copy"}
                </button>
              )}
              <input
                ref={signedInput}
                type="file"
                hidden
                accept=".pdf,.doc,.docx,image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  if (f.size > 25e6) return toast.show("Files can be up to 25 MB");
                  const rec = await addDoc(f, "signed");
                  if (rec && h.status === "Offer sent") toast.show("Signed copy saved. Tap Mark offer signed when you're ready.");
                }}
              />
              {drafting && (
                <div style={{ marginTop: 12 }}>
                  <DraftPanel
                    clientId={clientId}
                    mode="hire_doc"
                    hireId={h.id}
                    docType={drafting}
                    askForInstructions
                    title={`${drafting === "offer" ? "Offer letter" : "Employment agreement"} for ${h.name}`}
                    primaryLabel="Save to this hire"
                    onClose={() => setDrafting(null)}
                    onUse={async (text) => {
                      const t = `${drafting === "offer" ? "Offer Letter" : "Employment Agreement"} - ${h.name}`;
                      const file = new File([await docxBlob(t, text, clientId)], docxName(t), { type: DOCX_MIME });
                      const rec = await addDoc(file, drafting);
                      if (rec) setDrafting(null);
                    }}
                  />
                  <p className="tiny muted" style={{ marginTop: 6 }}>Claude fills {client.name}&apos;s own template when one is on file, using the details on this page. Check names, pay and dates before it goes out.</p>
                </div>
              )}
            </div>

            <div className="section-head section"><h2>Emails to {first}</h2></div>
            <div className="card">
              {emailRow("welcome")}
              {emailRow("firstDay")}
              <div className="tiny muted" style={{ marginTop: 8 }}>
                From {senderFor(own.s, own.brand.company).fromName} in {own.brand.company}&apos;s colors, to {h.personalEmail || "their personal email (not added yet)"}.{" "}
                {isAdvisor && <Link href={`/console/clients/${clientId}#onboarding`} style={{ color: "var(--blue)" }}>Edit what they say</Link>}
              </div>
            </div>
          </div>

          <div>
            <div className="section-head section">
              <h2>Details</h2>
              {canManage && !editing && <button className="btn ghost sm" onClick={() => setEditing({ ...h })}>Edit</button>}
            </div>
            {editing ? (
              <div className="card">
                <HireForm value={editing} onChange={setEditing} s={s} people={cfg.users} clientName={client?.name} />
                {isAdvisor && (
                  <label className="f">Stage (to correct it)
                    <select className="f" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Stage })}>
                      {STAGES.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </label>
                )}
                <div className="action-foot" style={{ justifyContent: "flex-end" }}>
                  <button className="btn ghost sm" onClick={() => setEditing(null)}>Cancel</button>
                  <button
                    className="btn primary sm"
                    onClick={() => {
                      const { id: _i, ...rest } = editing;
                      void _i;
                      updateHire(h.id, { ...rest, name: rest.name.trim(), personalEmail: rest.personalEmail.trim() }, rest.startDate !== h.startDate ? `Details updated. Start date now ${rest.startDate}` : "Details updated");
                      setEditing(null);
                      toast.show("Saved");
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="card">
                <dl className="facts">
                  <dt>Pay</dt><dd>{payLine(h) || "—"}{h.bonus ? `, ${h.bonus}% bonus target` : ""} · {h.exempt === "exempt" ? "Exempt" : "Non-exempt"}</dd>
                  <dt>Start</dt><dd>{h.startDate ? longDate(h.startDate) : "—"}, arrive {h.arrivalTime || s.defaultArrival}</dd>
                  <dt>Where</dt><dd>{h.location || s.hqAddress || "—"}</dd>
                  <dt>Email</dt><dd>{h.personalEmail || <span className="muted">Not added</span>}</dd>
                  <dt>Cell</dt><dd>{h.cell || <span className="muted">Not added</span>}</dd>
                  {h.contingencies && (<><dt>Contingent on</dt><dd>{h.contingencies}</dd></>)}
                  {canManage && h.notes && (<><dt>HR notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{h.notes}</dd></>)}
                </dl>
              </div>
            )}

            {canManage && <div className="section"><Checks h={editing ?? h} s={s} /></div>}

            <div className="section-head section"><h2>Activity</h2></div>
            <div className="card">
              <ul className="timeline">
                {[...h.history].reverse().map((e, i) => (
                  <li key={i}><span className="tiny muted">{fmtTime(e.at)} · {e.by}</span><div className="small">{e.text}</div></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>

      {preview && (
        <EmailEditor
          key={preview}
          kind={preview}
          h={h}
          s={own.s}
          brand={own.brand}
          canManage={canManage}
          canSend={stage >= 2}
          busy={busy}
          onClose={() => setPreview(null)}
          onSave={(changes) => updateHire(h.id, changes, `${preview === "welcome" ? "Welcome" : "First-day"} email wording edited`)}
          onSend={(test, f) => send(preview, test, f)}
        />
      )}
      {confirmSign && (
        <Sheet title={`Send for e-signature?`} onClose={() => setConfirmSign(null)}>
          <p className="small">
            {first} gets an email in {client.name}&apos;s colors with a private link to read and sign <b>{confirmSign.name}</b>. They sign by typing their name; no account needed.
          </p>
          <p className="small" style={{ marginTop: 8 }}>To: <b>{h.personalEmail}</b></p>
          <p className="tiny muted" style={{ marginTop: 8 }}>When they sign: the signed PDF (with a signature certificate) lands on this hire and in Files, they get a copy, you get an email{confirmSign.kind === "offer" ? `, the hire moves to Signed, payroll setup goes on your list, and the first-day prep task goes to the client` : ""}. Any earlier link for this document stops working.</p>
          <div className="sheet-actions">
            <button className="btn ghost sm" onClick={() => setConfirmSign(null)}>Cancel</button>
            <button className="btn primary sm" onClick={() => sendForSignature(confirmSign)}>Send</button>
          </div>
        </Sheet>
      )}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}

export default function HirePage() {
  return (
    <Suspense>
      <HireInner />
    </Suspense>
  );
}
