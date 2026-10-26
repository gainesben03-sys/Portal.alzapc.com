"use client";

import { useEffect, useRef, useState } from "react";
import { authHeader } from "@/lib/supabase";
import { DOCX_MIME } from "@/lib/docx";

const REASONS: Record<string, string> = {
  no_key: "Claude is off. Add ANTHROPIC_API_KEY in Vercel and redeploy.",
  demo: "This works once the portal is connected to Supabase.",
  forbidden: "Only Ben can do this.",
  not_docx: "That one isn't a Word file. To keep the formatting, upload the .docx version (PDFs can't be edited this way).",
  too_big: "That file is over 3 MB. Save it without large images, or upload it under Client setup and pick it from the list.",
  not_found: "Couldn't find that file. It may have been removed.",
  unreadable: "Couldn't open that Word file. Open it in Word, Save As .docx, and try again.",
  empty: "No text found in that file.",
  bad_answer: "Claude's answer came back garbled. Try again.",
  api_401: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel.",
  api_429: "Claude is rate limited right now. Try again in a minute.",
  api_529: "Claude is busy right now. Try again in a minute.",
};

type Doc = { id: string; title: string; file_name: string; kind: string; client_id: string | null };
type Change = { find: string; replace: string; why: string; found: number; on: boolean };

async function call(body: Record<string, unknown>) {
  try {
    const r = await fetch("/api/fill", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify(body) });
    const j = await r.json();
    if (j.ok) return j;
    if (/credit|balance/i.test(j.detail ?? "")) return { error: "Your Anthropic account is out of credit. Add credit at console.anthropic.com." };
    return { error: REASONS[j.reason] ?? `That didn't work (${j.reason ?? r.status}). Try again.` };
  } catch {
    return { error: "Couldn't reach the portal. Check your connection and try again." };
  }
}

const toB64 = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(f);
  });

/**
 * Pick a past letter (offer, termination, promotion...), Claude finds the details that change,
 * Ben checks them, and the original Word file comes back with only those words swapped.
 */
export function FillPanel({
  clientId,
  hireId,
  actionId,
  hint,
  primaryLabel,
  onUse,
  onClose,
}: {
  clientId: string;
  hireId?: string;
  actionId?: string;
  hint?: string;
  primaryLabel: string;
  onUse: (file: File) => Promise<void> | void;
  onClose: () => void;
}) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [pick, setPick] = useState("");
  const [upload, setUpload] = useState<File | null>(null);
  const [instructions, setInstructions] = useState("");
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [notes, setNotes] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "find" | "save" | "download">("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const h = await authHeader();
      const get = (cid: string) => fetch(`/api/knowledge?clientId=${encodeURIComponent(cid)}`, { headers: h }).then((r) => r.json()).catch(() => ({}));
      const [a, b] = await Promise.all([get(clientId), get("alza")]);
      const all: Doc[] = [...(a.docs ?? []), ...(b.docs ?? [])].filter((d: Doc) => /\.docx$/i.test(d.file_name ?? ""));
      setDocs(all);
      const re = hint ? new RegExp(hint, "i") : null;
      const best = all.find((d) => d.client_id && !!re?.test(d.title)) ?? all.find((d) => !!re?.test(d.title)) ?? all.find((d) => d.client_id && d.kind === "template");
      if (best) setPick(best.id);
    })();
  }, [clientId, hint]);

  const source = async () => (upload ? { file: await toB64(upload), fileName: upload.name } : { knowledgeId: pick });
  const reset = () => {
    setChanges(null);
    setNotes("");
    setMissing([]);
    setMsg("");
  };

  const find = async () => {
    setErr("");
    setBusy("find");
    const j = await call({ step: "propose", clientId, hireId, actionId, instructions: instructions.trim() || undefined, ...(await source()) });
    setBusy("");
    if (j.error) return setErr(j.error);
    setChanges((j.changes as Omit<Change, "on">[]).map((c) => ({ ...c, on: c.found > 0 })));
    setNotes(j.notes);
    setMissing(j.missing);
  };

  const build = async (): Promise<File | null> => {
    const list = (changes ?? []).filter((c) => c.on);
    const j = await call({ step: "apply", clientId, changes: list.map(({ find, replace }) => ({ find, replace })), ...(await source()) });
    if (j.error) {
      setErr(j.error);
      return null;
    }
    const miss = (j.applied as { find: string; count: number }[]).filter((a) => !a.count);
    const left = list.filter((c) => /\[NEW VALUE NEEDED/i.test(c.replace)).length;
    setMsg(
      [miss.length ? `${miss.length} change${miss.length > 1 ? "s" : ""} didn't match anything in the file: ${miss.map((m) => `"${m.find}"`).join(", ")}.` : "", left ? `${left} spot${left > 1 ? "s" : ""} still say [NEW VALUE NEEDED]. Fill ${left > 1 ? "them" : "it"} in Word before sending.` : ""]
        .filter(Boolean)
        .join(" "),
    );
    const bytes = Uint8Array.from(atob(j.file), (c) => c.charCodeAt(0));
    return new File([bytes], j.fileName, { type: DOCX_MIME });
  };

  const noSource = !upload && !pick;
  const chosen = upload?.name ?? docs?.find((d) => d.id === pick)?.title;

  return (
    <div className="draft-panel">
      <div className="row" style={{ alignItems: "center" }}>
        <b className="small">{changes ? `Changes to ${chosen}` : "Fill in a past document"}</b>
        <button className="btn ghost sm" onClick={onClose}>Close</button>
      </div>

      {!changes && (
        <>
          <p className="tiny muted" style={{ marginTop: 4 }}>Keeps the original Word file exactly as it is (letterhead, fonts, layout). Only the details that change get swapped.</p>
          {docs === null ? (
            <p className="small muted" style={{ marginTop: 8 }}>Loading documents...</p>
          ) : (
            <label className="f" style={{ marginTop: 8 }}>
              Start from
              <select
                className="f"
                value={upload ? "__uploaded" : pick}
                onChange={(e) => {
                  if (e.target.value === "__upload") return fileRef.current?.click();
                  if (e.target.value === "__uploaded") return;
                  setUpload(null);
                  setPick(e.target.value);
                }}
              >
                <option value="">Choose a Word document...</option>
                {docs.filter((d) => d.client_id).length > 0 && (
                  <optgroup label="This client's documents">
                    {docs.filter((d) => d.client_id).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </optgroup>
                )}
                {docs.filter((d) => !d.client_id).length > 0 && (
                  <optgroup label="Your templates">
                    {docs.filter((d) => !d.client_id).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </optgroup>
                )}
                {upload && <option value="__uploaded">{upload.name} (uploaded now)</option>}
                <option value="__upload">Upload a past letter (.docx)...</option>
              </select>
            </label>
          )}
          {docs?.length === 0 && !upload && <p className="tiny muted">No Word documents on file yet. Upload one here, or add past letters under Client setup → Documents for Claude to reuse them.</p>}
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (!/\.docx$/i.test(f.name)) return setErr(REASONS.not_docx);
              if (f.size > 3e6) return setErr(REASONS.too_big);
              setErr("");
              setUpload(f);
            }}
          />
          <textarea
            className="f"
            style={{ marginTop: 8 }}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={hireId ? "Anything beyond the hire details? e.g. No relocation bonus this time. Sign-on bonus $5,000." : "What's new? e.g. Termination letter for Sam Lee, Sales Associate, last day Nov 7, 2026, final pay and PTO paid that day."}
          />
          <button className="btn primary block" style={{ marginTop: 10 }} disabled={!!busy || noSource || (!hireId && !instructions.trim())} onClick={find}>
            {busy === "find" ? "Reading the document..." : "Find what changes"}
          </button>
        </>
      )}

      {err && <p className="small" style={{ color: "var(--red)", marginTop: 8 }}>{err}</p>}

      {changes && (
        <>
          {changes.length === 0 && <p className="small muted" style={{ marginTop: 8 }}>Claude didn&apos;t find anything to change. Add instructions and try again.</p>}
          <div className="fill-list">
            {changes.map((c, i) => (
              <div key={i} className={`fill-row${c.on ? "" : " off"}`}>
                <input
                  type="checkbox"
                  aria-label="Use this change"
                  checked={c.on}
                  onChange={(e) => setChanges(changes.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="tiny muted fill-old">{c.find}</div>
                  <input
                    className="f"
                    value={c.replace}
                    placeholder="(remove this text)"
                    onChange={(e) => setChanges(changes.map((x, k) => (k === i ? { ...x, replace: e.target.value } : x)))}
                  />
                  <div className="tiny muted">
                    {c.why}
                    {c.found > 1 && ` · ${c.found} places`}
                    {c.found === 0 && <span style={{ color: "var(--amber)" }}> · Not found word for word, so it may not apply</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {(missing.length > 0 || notes) && (
            <div className="for-ben">
              <b>Only you see this</b>
              {missing.length > 0 && <div style={{ marginTop: 4 }}>Still needed: {missing.join("; ")}</div>}
              {notes && <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{notes}</div>}
            </div>
          )}
          {msg && <p className="small" style={{ color: "var(--amber)", marginTop: 8 }}>{msg}</p>}
          <div className="action-foot" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button className="btn ghost sm" disabled={!!busy} onClick={reset}>Start over</button>
            <button
              className="btn ghost sm"
              disabled={!!busy}
              onClick={async () => {
                setBusy("download");
                setErr("");
                const f = await build();
                setBusy("");
                if (!f) return;
                const url = URL.createObjectURL(f);
                const a = document.createElement("a");
                a.href = url;
                a.download = f.name;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
              }}
            >
              {busy === "download" ? "Preparing..." : "Download Word"}
            </button>
            <button
              className="btn primary sm"
              disabled={!!busy || !changes.some((c) => c.on)}
              onClick={async () => {
                setBusy("save");
                setErr("");
                try {
                  const f = await build();
                  if (f) await onUse(f);
                } finally {
                  setBusy("");
                }
              }}
            >
              {busy === "save" ? "Saving..." : primaryLabel}
            </button>
          </div>
          <p className="tiny muted" style={{ marginTop: 6 }}>Open the Word file once before it goes out. Claude only changes the words listed above.</p>
        </>
      )}
    </div>
  );
}
