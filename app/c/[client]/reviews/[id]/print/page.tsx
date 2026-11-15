"use client";

// The finished review, alone on the page, for printing or saving as a PDF.
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useGuard } from "@/components/ui";
import { ReviewDoc, useDemo } from "@/components/perform";
import { useStore } from "@/lib/store";
import { Doc, docOf, Lang } from "@/lib/perform";
import { performApi } from "@/lib/performclient";

export default function PrintReview() {
  const { client: clientId, id } = useParams<{ client: string; id: string }>();
  const ok = useGuard("client", clientId);
  const { getClient } = useStore();
  const client = getClient(clientId);
  const demo = useDemo(clientId);
  const [docs, setDocs] = useState<Record<Lang, Doc> | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!ok) return;
    performApi(clientId, { action: "get", id }, demo).then((g) => {
      if (!g.ok) return setErr(true);
      setLang(g.review.lang);
      setDocs({ en: docOf(g.review, g.company || client?.name || "", "en"), es: docOf(g.review, g.company || client?.name || "", "es") });
    });
  }, [ok, id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ok || !client) return null;
  if (err) return <p style={{ padding: 24 }}>This review isn&apos;t available.</p>;
  if (!docs) return null;
  return (
    <div className="pf-print">
      <div className="pf-print-bar no-print">
        <div className="pf-lang" role="group" aria-label="Language">
          <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>English</button>
          <button className={lang === "es" ? "on" : ""} onClick={() => setLang("es")}>Español</button>
        </div>
        <button className="btn primary" onClick={() => window.print()}>{lang === "es" ? "Imprimir o guardar PDF" : "Print or save as PDF"}</button>
      </div>
      {client.logo && <img src={client.logo} alt={client.name} className="pf-print-logo" />}
      <ReviewDoc d={docs[lang]} accent={client.accent} />
    </div>
  );
}
