"use client";

import { useState } from "react";
import { AlzaNav, AlzaTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { fmt, toISO, today } from "@/lib/data";
import { FOLDERS, Resource, ResourceType } from "@/lib/modules";
import { useStore } from "@/lib/store";

const TYPES: ResourceType[] = ["Template", "Guide", "Checklist", "Policy", "Video", "Link"];

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
                  <h3>{r.title}</h3>
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
          onClose={() => setAdding(false)}
          onAdd={(r) => {
            patch({ resources: [r, ...resources] });
            setAdding(false);
            toast.show("Added to your library");
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

function AddSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (r: Resource) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ResourceType>("Template");
  const [category, setCategory] = useState("Leadership");
  const [desc, setDesc] = useState("");
  return (
    <Sheet title="Add to library" onClose={onClose}>
      <label className="f">Title</label>
      <input className="f" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="f">Type</label>
      <select className="f" value={type} onChange={(e) => setType(e.target.value as ResourceType)}>
        {TYPES.map((t) => <option key={t}>{t}</option>)}
      </select>
      <label className="f">Category</label>
      <input className="f" value={category} onChange={(e) => setCategory(e.target.value)} />
      <label className="f">Short description</label>
      <textarea className="f" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <p className="tiny muted" style={{ marginTop: 10 }}>File upload comes with the full build.</p>
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          disabled={!title.trim()}
          onClick={() => onAdd({ id: `res${Date.now()}`, title: title.trim(), type, category: category.trim() || "General", desc: desc.trim(), updated: toISO(today()), shares: [] })}
        >
          Add
        </button>
      </div>
    </Sheet>
  );
}
