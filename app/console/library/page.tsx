"use client";

import { useState } from "react";
import { AlzaNav, AlzaTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { fmt, toISO, today } from "@/lib/data";
import { FOLDERS, Resource, ResourceType } from "@/lib/modules";
import { useStore } from "@/lib/store";
import { BUCKET, LIVE, safeName, sb } from "@/lib/supabase";
import { openResource, RES_ICON } from "@/lib/library";

const TYPES: ResourceType[] = ["Training", "Video", "Template", "Guide", "Checklist", "Policy", "Link"];

export default function Library() {
  const ok = useGuard("advisor");
  const { resources, patch, config, getClient, clients } = useStore();
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [share, setShare] = useState<Resource | null>(null);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  if (!ok) return null;

  const lib = resources.filter((r) => !r.clientOnly);
  const cats = Array.from(new Set(lib.map((r) => r.category)));
  const list = lib.filter((r) => (!cat || r.category === cat) && (!q || (r.title + r.desc).toLowerCase().includes(q.toLowerCase())));
  const setRes = (id: string, p: Partial<Resource>) => patch({ resources: resources.map((r) => (r.id === id ? { ...r, ...p } : r)) });

  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div>
            <h1>Alza library</h1>
            <p className="muted" style={{ marginTop: 6 }}>Your reusable resources. Share any of them to a client folder in two taps.</p>
          </div>
          <button className="btn primary" onClick={() => setAdding(true)}>Add</button>
        </div>
        <input className="f" style={{ marginTop: 14 }} placeholder="Search your library" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="tabs" style={{ marginTop: 10 }}>
          <button className={`tab ${!cat ? "on" : ""}`} onClick={() => setCat(null)}>All</button>
          {cats.map((c) => (
            <button key={c} className={`tab ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          {list.map((r) => (
            <div className="card" key={r.id}>
              <div className="action-top">
                <div>
                  <h3>{RES_ICON[r.type] ? `${RES_ICON[r.type]} ` : ""}{r.title}</h3>
                  <div className="small muted">{r.type} · {r.category} · updated {fmt(r.updated)}</div>
                </div>
                {r.outdated && <span className="pill soon">Needs update</span>}
              </div>
              <p className="small" style={{ marginTop: 6 }}>{r.desc}</p>
              <div className="chips">
                {r.shares.length === 0 && <span className="tiny muted">Not shared yet</span>}
                {r.shares.map((s, i) => (
                  <span className="chip" key={i}>{getClient(s.clientId)?.name} · {s.folder}</span>
                ))}
              </div>
              <div className="action-foot">
{(r.path || r.url) && <button className="btn sm" onClick={async () => { const e = await openResource(r); if (e) toast.show(e); }}>Open</button>}
                <button className="btn sm primary" onClick={() => setShare(r)}>Share to client</button>
                {r.outdated ? (
                  <button className="btn sm" onClick={() => { setRes(r.id, { outdated: false, updated: toISO(today()) }); toast.show("Marked as updated"); }}>Mark updated</button>
                ) : (
                  <button className="btn ghost sm" onClick={() => setRes(r.id, { outdated: true })}>Flag as outdated</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      {share && (
        <ShareSheet
          r={share}
          clients={clients.filter((c) => config[c.id]?.modules.resources).map((c) => getClient(c.id)!)}
          onClose={() => setShare(null)}
          onShare={(clientId, folder) => {
            if (share.shares.some((s) => s.clientId === clientId && s.folder === folder)) {
              toast.show("Already in that folder");
            } else {
              setRes(share.id, { shares: [...share.shares, { clientId, folder, at: new Date().toISOString() }] });
              toast.show(`Shared to ${getClient(clientId)?.name}`);
            }
            setShare(null);
          }}
        />
      )}
      {adding && (
        <AddSheet
          clients={clients.map((c) => ({ id: c.id, name: getClient(c.id)?.name ?? c.name }))}
          onClose={() => setAdding(false)}
          onAdd={(r) => {
            patch({ resources: [r, ...resources] });
            setAdding(false);
            toast.show(r.shares.length ? `Added and shared with ${r.shares.length} client${r.shares.length > 1 ? "s" : ""}` : "Added to your library");
          }}
        />
      )}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </>
  );
}

function ShareSheet({ r, clients, onClose, onShare }: { r: Resource; clients: { id: string; name: string }[]; onClose: () => void; onShare: (c: string, f: string) => void }) {
  const [c, setC] = useState(clients[0]?.id ?? "");
  const [f, setF] = useState(FOLDERS[0]);
  return (
    <Sheet title={`Share "${r.title}"`} onClose={onClose}>
      <label className="f">Client</label>
      <select className="f" value={c} onChange={(e) => setC(e.target.value)}>
        {clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <label className="f">Folder</label>
      <select className="f" value={f} onChange={(e) => setF(e.target.value)}>
        {FOLDERS.map((x) => <option key={x}>{x}</option>)}
      </select>
      <p className="tiny muted" style={{ marginTop: 10 }}>Only clients with Resources turned on are listed.</p>
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!c} onClick={() => onShare(c, f)}>Share</button>
      </div>
    </Sheet>
  );
}

function AddSheet({ onClose, onAdd, clients }: { onClose: () => void; onAdd: (r: Resource) => void; clients: { id: string; name: string }[] }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ResourceType>("Training");
  const [category, setCategory] = useState("Manager training");
  const [desc, setDesc] = useState("");
  const [src, setSrc] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [shareTo, setShareTo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Sheet title="Add to library" onClose={onClose}>
      <label className="f">Title<input className="f" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Session 3: Interviewing and offers" /></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="f">Type
          <select className="f" value={type} onChange={(e) => setType(e.target.value as ResourceType)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="f">Category<input className="f" value={category} onChange={(e) => setCategory(e.target.value)} /></label>
      </div>
      <label className="f">Short description<textarea className="f" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="One or two lines: what it covers and when to use it" /></label>

      <div className="seg" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <button className={src === "file" ? "on" : ""} onClick={() => setSrc("file")}>Upload a file</button>
        <button className={src === "link" ? "on" : ""} onClick={() => setSrc("link")}>Add a link</button>
      </div>
      {src === "file" ? (
        <label className="f">File <span className="tiny muted">(PDF, slides, Word, short video; up to 50 MB)</span>
          <input className="f" type="file" onChange={(e) => { setErr(""); setFile(e.target.files?.[0] ?? null); }} />
        </label>
      ) : (
        <label className="f">Link <span className="tiny muted">(best for recorded trainings: YouTube unlisted, Loom, Vimeo, Google Drive)</span>
          <input className="f" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
      )}

      {clients.length > 0 && (
        <div className="f">
          <span className="flabel">Share with <span className="tiny muted">(goes in their Trainings folder; you can share more later)</span></span>
          <div className="chips" style={{ marginTop: 0 }}>
            {clients.map((c) => (
              <button key={c.id} className={`chip chip-btn ${shareTo.includes(c.id) ? "on" : ""}`} onClick={() => setShareTo(shareTo.includes(c.id) ? shareTo.filter((x) => x !== c.id) : [...shareTo, c.id])}>{c.name}</button>
            ))}
          </div>
        </div>
      )}
      {err && <p className="small" style={{ color: "var(--red)" }}>{err}</p>}
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          disabled={busy || !title.trim() || (src === "file" ? !file : !/^https?:\/\/\S+\.\S+/.test(url.trim()))}
          onClick={async () => {
            const id = `res${Date.now().toString(36)}`;
            let path: string | undefined;
            if (src === "file" && file) {
              if (file.size > 50e6) return setErr("That file is over 50 MB. Upload long videos to YouTube (unlisted), Loom or Vimeo and add the link instead.");
              if (LIVE) {
                setBusy(true);
                const p = `alza/library/${id}/${safeName(file.name)}`;
                const { error } = await sb().storage.from(BUCKET).upload(p, file, { contentType: file.type || undefined, upsert: false });
                setBusy(false);
                if (error) return setErr(`The upload didn't go through (${error.message}). Try again.`);
                path = p;
              }
            }
            const at = new Date().toISOString();
            onAdd({
              id,
              title: title.trim(),
              type,
              category: category.trim() || "General",
              desc: desc.trim(),
              updated: toISO(today()),
              shares: shareTo.map((clientId) => ({ clientId, folder: type === "Training" ? "Trainings" : "Manager toolkit", at })),
              ...(src === "link" ? { url: url.trim() } : { path, fileName: file?.name, size: file?.size }),
            });
          }}
        >
          {busy ? "Uploading..." : "Add"}
        </button>
      </div>
    </Sheet>
  );
}
