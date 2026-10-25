// Server-only: what happens after someone signs or declines.
import { SupabaseClient } from "@supabase/supabase-js";
import { loadClient, saveHire, SigRow } from "./esign";
import { Hire, signedCopyEmail, stageIndex, welcomeEmail } from "./hires";
import { signedTasks } from "./hiretasks";
import { sendEmail } from "./server";
import { advisorEmails, pushTo } from "./push";

type C = NonNullable<Awaited<ReturnType<typeof loadClient>>>;

export const safeFileName = (n: string) => n.replace(/[^\w.\- ]+/g, "_").slice(0, 120);

async function notify(db: SupabaseClient, c: C, h: Hire, subject: string, text: string) {
  const at = new Date().toISOString();
  const id = `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await db.from("notices").insert({ id, client_id: c.client.id, created_by: "esign@portal", data: { clientId: c.client.id, kind: "hire", text: `${c.client.name}: ${subject}`, href: `/c/${c.client.id}/hires/${h.id}`, at, read: false } });
  await pushTo(db, await advisorEmails(db), "hires", { title: `${c.client.name}: ${h.name}`, body: subject.replace(`${h.name} `, ""), url: `/c/${c.client.id}/hires/${h.id}`, tag: `hire-${h.id}` });
  const to = (process.env.NOTIFY_TO || "ben@alzapc.com").trim();
  await sendEmail({ to: [to], subject: `[Portal] ${c.client.name}: ${subject}`, text: `${subject}.\n\n${text}\n\n${c.base}/c/${c.client.id}/hires/${h.id}` });
}

async function run(
  db: SupabaseClient,
  c: C,
  h: Hire,
  row: SigRow,
  o: { name: string; now: string; path: string; fileId: string; fileName: string; size: number; pdf: Uint8Array }
) {
  // the signed PDF in Files (shows in Ben's inbox, and executives can open it)
  await db.from("files").insert({
    id: o.fileId,
    client_id: c.client.id,
    created_by: "esign@portal",
    data: { clientId: c.client.id, name: o.fileName, size: o.size, type: "application/pdf", category: "Signed document", note: `${row.title} for ${h.name}, signed electronically`, confidential: false, by: h.name, at: o.now, reviewed: false, path: o.path },
  });

  h.docs = [...(h.docs ?? []), { kind: "signed", name: o.fileName, path: o.path, at: o.now }];
  h.esign = { ...(h.esign ?? {}), [row.doc_kind]: { status: "signed", at: o.now } };
  h.history = [...h.history, { at: o.now, by: h.name, text: `Signed the ${row.title.toLowerCase()} electronically` }];

  if (row.doc_kind === "offer" && stageIndex(h.status) < 2) {
    h.status = "Offer signed";
    if (!h.tasksCreated) {
      const tasks = signedTasks(h, c.cfg, c.client);
      for (const t of tasks) {
        const { id, ...data } = t;
        await db.from("actions").insert({ id, client_id: c.client.id, created_by: "esign@portal", data });
      }
      h.tasksCreated = true;
      h.history.push({ at: o.now, by: "Portal", text: `Payroll setup added to Ben's list; first-day prep sent to ${tasks.find((t) => t.side === "client")?.owner.name ?? "the client"}` });
    }
    if (c.s.autoSend && !h.emails?.welcome && h.personalEmail) {
      const m = welcomeEmail(h, c.s, c.brand);
      const r = await sendEmail({ to: [h.personalEmail], subject: m.subject, html: m.html, text: m.text, replyTo: c.s.hrEmail });
      if (r.ok) {
        h.emails = { ...(h.emails ?? {}), welcome: o.now };
        h.history.push({ at: o.now, by: "Portal", text: `Welcome email sent to ${h.personalEmail}` });
      }
    }
  }
  await saveHire(db, h);

  // copy to the signer, heads-up to Ben
  const m = signedCopyEmail(h, row.title, c.s, c.brand);
  await sendEmail({ to: [row.signer_email], subject: m.subject, html: m.html, text: m.text, replyTo: c.s.hrEmail, attachments: [{ filename: o.fileName, content: Buffer.from(o.pdf).toString("base64") }] });
  await notify(db, c, h, `${h.name} signed the ${row.title.toLowerCase()}`, `Signed as "${o.name}". The signed PDF is in Files and on the hire.`);
}

export const afterSignedTasks = { run, notify };
