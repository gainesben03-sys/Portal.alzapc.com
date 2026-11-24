"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ClientNav, ClientTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { DraftView, HeldView, NewIssue, RecordRows, useDiscAccess } from "@/components/discipline";
import { DiscDraft, DiscInput, DiscRecord, discFor, fmtDay, FORMAT_LABEL } from "@/lib/discipline";
import { discApi, reasonText } from "@/lib/disciplineclient";
import { useStore } from "@/lib/store";

type View = { k: "new" } | { k: "draft"; input: DiscInput; draft: DiscDraft; id?: string } | { k: "list" };

/** Document an issue: describe it, pick the level, get a clean write-up on letterhead. Executives and HR only. */
export default function Page() {
  return <Suspense fallback={null}><DocumentIssue /></Suspense>;
}

function DocumentIssue() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, people, config } = useStore();
  const client = getClient(clientId);
  const acc = useDiscAccess();
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const openId = sp.get("id");
  const startPerson = sp.get("person") ?? undefined;
  const [records, setRecords] = useState<DiscRecord[] | null>(null);
  const [view, setView] = useState<View>({ k: "new" });
  const [formKey, setFormKey] = useState(0);
  const [kept, setKept] = useState<Partial<DiscInput> | undefined>(undefined);

  const load = useCallback(async () => {
    const r = await discApi.list(clientId);
    if (r.ok) setRecords(r.records);
    else { setRecords([]); if (r.reason !== "demo") toast.show(reasonText(r.reason)); }
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ok && acc.ok) load(); }, [ok, acc.ok, load]);
  // opening a record by link replaces whatever was on screen
  useEffect(() => { if (openId) setView({ k: "list" }); }, [openId]);

  if (!ok || !client) return null;
  const base = `/c/${clientId}/hub/ask/document`;
  const shell = (body: React.ReactNode) => (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap dc-wrap">{body}</main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
  if (!acc.ok) return shell(<div className="card">Only executives and HR can document issues. <Link href={`/c/${clientId}/hub/ask`}>Back to Ask HR</Link></div>);

  const levels = discFor(config[clientId]?.discipline).levels;
  const team = people.filter((p) => p.clientId === clientId && p.active).sort((a, b) => a.name.localeCompare(b.name));
  const opened = openId ? records?.find((r) => r.id === openId) : undefined;
  const upsert = (r: DiscRecord) => setRecords((rs) => [r, ...(rs ?? []).filter((x) => x.id !== r.id)]);
  const fresh = () => { setKept(undefined); setFormKey((k) => k + 1); setView({ k: "new" }); router.push(base); };
  const pending = (records ?? []).filter((r) => r.status === "review" || r.ack === "pending").length;

  const head = (title: string, sub: string, back?: { label: string; href?: string; on?: () => void }) => (
    <div className="dc-head">
      <div className="grow" style={{ minWidth: 0 }}>
        {back && (back.href ? <Link href={back.href} className="small dc-back">← {back.label}</Link> : <button className="linklike small dc-back" onClick={back.on}>← {back.label}</button>)}
        <h1 style={{ margin: 0 }}>{title}</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>{sub}</p>
      </div>
    </div>
  );

  // a record opened by link
  if (openId) {
    if (records === null) return shell(<div className="card small muted">Loading...</div>);
    if (!opened) return shell(<div className="card">That record isn&apos;t here anymore. <Link href={base}>Back</Link></div>);
    if (view.k === "draft" && view.id === opened.id)
      return shell(<>
        {head(`${opened.level} for ${opened.personName}`, "HR cleared it. Look it over and save.", { label: "Back", on: () => setView({ k: "list" }) })}
        <DraftView clientId={clientId} input={view.input} draft={view.draft} recordId={opened.id} onSaved={(r) => { upsert(r); setView({ k: "list" }); toast.show("Saved to the record"); }} toast={toast.show} />
      </>);
    if (opened.status === "review" || !opened.draft)
      return shell(<>
        {head(`${opened.personName}`, "Paused by the fairness check, waiting on HR.", { label: "All records", href: `${base}?all=1` })}
        <HeldView clientId={clientId} r={opened} toast={toast.show} onDrafted={(input, draft) => setView({ k: "draft", input, draft, id: opened.id })} />
      </>);
    return shell(<>
      {head(`${opened.level} for ${opened.personName}`, `${FORMAT_LABEL[opened.format]} · ${opened.issue} · ${fmtDay(opened.date)}`, { label: "All records", href: `${base}?all=1` })}
      <DraftView key={opened.id + opened.updatedAt} clientId={clientId} input={opened} draft={opened.draft} saved={opened} onSaved={(r) => { upsert(r); toast.show("Saved"); }} toast={toast.show} />
    </>);
  }

  // every record
  if (sp.get("all"))
    return shell(<>
      {head("Records", "Everything documented, newest first. Private to executives and HR.", { label: "Document an issue", href: base })}
      {records === null ? <div className="card small muted">Loading...</div> : <RecordRows records={records} showPerson empty="Nothing documented yet." />}
    </>);

  // a fresh draft
  if (view.k === "draft")
    return shell(<>
      {head(`${view.input.level} for ${view.input.personName}`, "Draft. Nothing is saved until you save it.", { label: "Back to the details", on: () => { setKept(view.input); setFormKey((k) => k + 1); setView({ k: "new" }); } })}
      <DraftView
        clientId={clientId}
        input={view.input}
        draft={view.draft}
        onSaved={(r) => { upsert(r); toast.show(`Saved to ${r.personName.split(" ")[0]}'s record`); router.push(`${base}?id=${r.id}`); }}
        toast={toast.show}
      />
    </>);

  return shell(<>
    <div className="dc-head">
      <div className="grow" style={{ minWidth: 0 }}>
        <Link href={`/c/${clientId}/hub/ask`} className="small dc-back">← Ask HR</Link>
        <h1 style={{ margin: 0 }}>Document an issue</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>Say what happened in your words. You pick the level, we write it up from your handbook.</p>
      </div>
      <Link href={`${base}?all=1`} className="btn sm">Records{pending ? <span className="dc-count">{pending}</span> : null}</Link>
    </div>
    <NewIssue
      key={formKey}
      clientId={clientId}
      people={team}
      records={records ?? []}
      levels={levels}
      start={kept ?? (startPerson ? { personId: startPerson } : undefined)}
      onDrafted={(input, draft) => setView({ k: "draft", input, draft })}
      onHeld={(r) => { upsert(r); toast.show("Sent to HR. They'll get back to you."); fresh(); }}
      toast={toast.show}
    />
  </>);
}
