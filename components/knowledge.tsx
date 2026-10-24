"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authHeader, BUCKET, safeName, sb } from "@/lib/supabase";

type Kind = "handbook" | "policy" | "template" | "letterhead" | "other";
interface Doc {
  id: string;
  kind: Kind;
  title: string;
  file_name: string;
  path: string;
  chars: number;
  created_at: string;
}

const KIND_LABEL: Record<Kind, string> = {
  handbook: "Handbook",
  policy: "Policy",
  template: "Template",
  letterhead: "Letterhead",
  other: "Other",
};

/**
 * Documents Claude reads before drafting.
 * clientId = a client's own documents. clientId = null = Ben's default templates.
 */
export function KnowledgePanel({ clientId, onToast }: { clientId: string | null; onToast: (m: string) => void }) {
  const folder = clientId ?? "alza";
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<Kind>(clientId ? "handbook" : "template");
  const [busy, setBusy] = useState("");
  const [letterUrl, setLetterUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const letterRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/knowledge?clientId=${encodeURIComponent(folder)}`, { headers: await authHeader() });
      const j = await r.json();
      if (!j.ok) {
        setErr(j.reason === "demo" ? "Available once the portal is live." : /knowledge/.test(j.reason ?? "") ? "Run supabase/002_knowledge.sql in Supabase to turn this on." : "Couldn't load documents.");
        setDocs([]);
        return;
      }
      setErr("");
      setDocs(j.docs);
      const lh = (j.docs as Doc[]).find((d) => d.kind === "letterhead");
      if (lh) {
        const { data } = await sb().storage.from(BUCKET).createSignedUrl(lh.path, 600);
        setLetterUrl(data?.signedUrl ?? null);
      } else setLetterUrl(null);
    } catch {
      setErr("Couldn't load documents.");
      setDocs([]);
    }
  }, [folder]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (file: File, k: Kind) => {
    if (file.size > 25e6) return onToast("Files can be up to 25 MB");
    const id = `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const path = `${folder}/knowledge/${id}/${safeName(file.name)}`;
    setBusy(`Reading ${file.name}...`);
    const up = await sb().storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (up.error) {
      setBusy("");
      return onToast("Upload failed. Try again.");
    }
    const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    const r = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ id, clientId, kind: k, title, path, fileName: file.name, mime: file.type }),
    });
    const j = await r.json().catch(() => ({ ok: false }));
    setBusy("");
    if (!j.ok) {
      await sb().storage.from(BUCKET).remove([path]);
      return onToast(j.message ?? "Couldn't add that document.");
    }
    onToast(j.warning ? `Added. ${j.warning}` : k === "letterhead" ? "Letterhead saved" : `Added. Claude will use it when drafting.`);
    load();
  };

  const remove = async (d: Doc) => {
    const r = await fetch(`/api/knowledge?id=${encodeURIComponent(d.id)}`, { method: "DELETE", headers: await authHeader() });
    const j = await r.json().catch(() => ({ ok: false }));
    if (j.ok) {
      onToast("Removed");
      load();
    } else onToast("Couldn't remove it");
  };

  const textDocs = (docs ?? []).filter((d) => d.kind !== "letterhead");

  return (
    <div className="card">
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}

      {clientId && (
        <div className="row" style={{ alignItems: "center" }}>
          <div className="grow">
            <b>Letterhead</b>
            <div className="tiny muted">Goes at the top of Word documents Claude drafts for them. PNG, JPG, or their Word letterhead.</div>
          </div>
          {letterUrl && <img src={letterUrl} alt="Letterhead" className="logo-img" style={{ maxHeight: 40, maxWidth: 160 }} />}
          <button className="btn sm" disabled={!!busy || !!err} onClick={() => letterRef.current?.click()}>{letterUrl ? "Replace" : "Upload"}</button>
          <input ref={letterRef} type="file" hidden accept="image/png,image/jpeg,image/gif,.docx" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f, "letterhead"); }} />
        </div>
      )}

      <div className={clientId ? "row" : ""} style={clientId ? undefined : {}}>
        <div style={{ width: "100%" }}>
          {docs === null && <p className="small muted" style={{ marginTop: 10 }}>Loading...</p>}
          {docs && textDocs.length === 0 && !err && (
            <p className="small muted" style={{ marginTop: clientId ? 0 : 0 }}>
              {clientId ? "No documents yet. Until you add some, Claude drafts from your default templates and best practice." : "No default templates yet. Add your go-to offer letter, PIP, warning, and policy templates."}
            </p>
          )}
          {textDocs.map((d) => (
            <div className="row" key={d.id}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title ellipsis">{d.title}</div>
                <div className="tiny muted">
                  {KIND_LABEL[d.kind]} · {d.file_name}
                  {d.chars === 0 ? <span style={{ color: "var(--amber)" }}> · no readable text</span> : ` · ${Math.max(1, Math.round(d.chars / 3000))} page${Math.round(d.chars / 3000) > 1 ? "s" : ""} read`}
                </div>
              </div>
              <button className="btn ghost sm" style={{ color: "var(--red)" }} onClick={() => remove(d)}>Remove</button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <select className="f" style={{ width: "auto", flex: 1, minWidth: 140 }} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {(["handbook", "policy", "template", "other"] as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <button className="btn primary" disabled={!!busy || !!err} onClick={() => fileRef.current?.click()}>Upload document</button>
        <input ref={fileRef} type="file" hidden accept=".pdf,.docx,.txt,.md" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f, kind); }} />
      </div>
      {busy && <p className="tiny muted" style={{ marginTop: 8 }}>{busy}</p>}
      <p className="tiny muted" style={{ marginTop: 8 }}>PDF, Word (.docx) or text. Only you and Claude see these. Clients never do.</p>
    </div>
  );
}
