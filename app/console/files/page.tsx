"use client";

import Link from "next/link";
import { useState } from "react";
import { AlzaNav, AlzaTopbar, useGuard } from "@/components/ui";
import { fmtTime } from "@/lib/data";
import { useStore } from "@/lib/store";

const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export default function Files() {
  const ok = useGuard("advisor");
  const { files, patch, getClient, actions } = useStore();
  const [f, setF] = useState<"new" | "all">("new");
  if (!ok) return null;
  const list = files.filter((x) => f === "all" || !x.reviewed).sort((a, b) => b.at.localeCompare(a.at));
  const mark = (id: string, reviewed: boolean) => patch({ files: files.map((x) => (x.id === id ? { ...x, reviewed } : x)) });

  return (
    <>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap">
        <h1>Shared with HR</h1>
        <p className="muted" style={{ marginTop: 6 }}>Everything clients have sent you through the portal.</p>
        <div className="tabs section" style={{ marginTop: 14 }}>
          <button className={`tab ${f === "new" ? "on" : ""}`} onClick={() => setF("new")}>To review<span className="count">{files.filter((x) => !x.reviewed).length}</span></button>
          <button className={`tab ${f === "all" ? "on" : ""}`} onClick={() => setF("all")}>All<span className="count">{files.length}</span></button>
        </div>
        <div style={{ marginTop: 14 }}>
          {list.length === 0 && <div className="card small muted">You're caught up.</div>}
          {list.map((x) => {
            const c = getClient(x.clientId);
            const req = actions.find((a) => a.id === x.requestId);
            return (
              <div className="card" key={x.id}>
                <div className="action-top">
                  <div style={{ minWidth: 0 }}>
                    <span className="client-chip" style={{ background: c?.accent }}>{c?.name}</span>
                    <h3 className="ellipsis">{x.name}</h3>
                    <div className="small muted">{x.by} · {fmtTime(x.at)} · {size(x.size)}</div>
                  </div>
                  {x.confidential && <span className="pill overdue">Confidential</span>}
                </div>
                <div className="chips">
                  <span className="chip">{x.category}</span>
                  {req && <Link className="chip" href={`/c/${x.clientId}/a/${req.id}`} style={{ color: "var(--blue)" }}>For: {req.title}</Link>}
                </div>
                {x.note && <div className="reply">{x.note}</div>}
                <div className="action-foot">
                  <button className="btn sm" onClick={() => alert("Opens the file from secure storage in the full build.")}>Open</button>
                  {x.reviewed ? (
                    <button className="btn ghost sm" onClick={() => mark(x.id, false)}>Mark unreviewed</button>
                  ) : (
                    <button className="btn sm primary" onClick={() => mark(x.id, true)}>Mark reviewed</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
