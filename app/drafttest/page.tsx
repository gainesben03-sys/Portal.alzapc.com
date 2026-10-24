"use client";
import { DraftPanel } from "@/components/draft";
export default function T() {
  return <main className="wrap"><div className="card"><b>Dana Ortiz:</b> Do part-time warehouse staff accrue PTO under the new policy?</div>
    <DraftPanel clientId="blueprint" mode="reply" noteId="n2" title="Draft a reply to Dana" primaryLabel="Send reply" onClose={() => {}} onUse={(t) => { document.title = "USED:" + t.slice(0, 20); }} /></main>;
}
