"use client";

// The finished review, alone on the page, for printing or saving as a PDF.
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useGuard } from "@/components/ui";
import { ReviewDoc, useDemo } from "@/components/perform";
import { useStore } from "@/lib/store";
import { Doc, docOf, Lang, reviewFileName } from "@/lib/perform";
import { letterheadUrl } from "@/lib/docx";
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
  const [lh, setLh] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  useEffect(() => {
    if (!ok) return;
    letterheadUrl(clientId).then((x) => setLh(x?.url ?? null));
    performApi(clientId, { action: "get", id }, demo).then((g) => {
      if (!g.ok) return setErr(true);
      // the browser uses the page title as the PDF's file name
      setFileName(reviewFileName(g.review));
      setLang(g.review.lang);
      setDocs({ en: docOf(g.review, g.company || client?.name || "", "en"), es: docOf(g.review, g.company || client?.name || "", "es") });
    });
  }, [ok, id]); // eslint-disable-line react-hooks/exhaustive-deps
  // the browser uses the page title as the PDF's file name
  useEffect(() => {
    if (!fileName) return;
    const prev = document.title;
    document.title = fileName;
    const t = setTimeout(() => { document.title = fileName; }, 300);
    const before = () => { document.title = fileName; };
    window.addEventListener("beforeprint", before);
    return () => { clearTimeout(t); window.removeEventListener("beforeprint", before); document.title = prev; };
  }, [fileName]);
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
      {lh ? <img src={lh} alt={client.name} className="pf-print-lh" /> : client.logo ? <img src={client.logo} alt={client.name} className="pf-print-logo" /> : null}
      <ReviewDoc d={docs[lang]} accent={client.accent} />
    </div>
  );
}
