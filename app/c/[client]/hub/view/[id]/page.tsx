"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ClientNav, ClientTopbar, useGuard } from "@/components/ui";
import { DocViewer } from "@/components/docviewer";
import { useStore } from "@/lib/store";
import { hasPractice } from "@/lib/practice";
import { viewUrl } from "@/lib/library";
import { ViewKind } from "@/lib/viewkind";

/** A training or tool shown right in the portal. */
export default function ViewPage() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}

function View() {
  const { client: clientId, id } = useParams<{ client: string; id: string }>();
  const back = useSearchParams().get("from");
  const ok = useGuard("client", clientId);
  const { getClient, resources, viewer } = useStore();
  const client = getClient(clientId);
  const r = resources.find((x) => x.id === id && (viewer?.kind === "advisor" || x.shares.some((s) => s.clientId === clientId)));
  const [v, setV] = useState<{ url: string; kind: ViewKind } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!ok || !r) return;
    viewUrl(r).then((x) => ("error" in x ? setErr(x.error) : setV(x)));
  }, [ok, r?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok || !client) return null;
  const backHref = back === "practice" ? `/c/${clientId}/hub/learn/${id}` : `/c/${clientId}/hub/library`;
  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap">
        <Link href={backHref} className="small" style={{ color: "var(--blue)" }}>← {back === "practice" ? "Practice" : "Learn"}</Link>
        {!r ? (
          <div className="card section">This isn&apos;t available. <Link href={`/c/${clientId}/hub/library`}>Back to Learn</Link></div>
        ) : (
          <>
            <div className="row section" style={{ alignItems: "flex-end", gap: 10 }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0 }}>{r.title}</h1>
                {r.desc && <p className="muted small" style={{ margin: "4px 0 0" }}>{r.desc}</p>}
              </div>
              {hasPractice(r) && back !== "practice" && <Link className="btn primary sm" href={`/c/${clientId}/hub/learn/${r.id}`}>🎯 Practice</Link>}
            </div>
            <div className="section">
              {err ? <div className="card small">{err}</div> : v ? <DocViewer url={v.url} kind={v.kind} title={r.title} /> : <p className="small muted">Loading…</p>}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
