"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore, Preview } from "@/lib/store";
import { ACCESS_LABEL, Access } from "@/lib/modules";
import { Sheet } from "./ui";

const landing = (p: Preview) => (p.access === "hiring" ? `/c/${p.clientId}/recruiting` : `/c/${p.clientId}`);
const ACCESS_SHORT: Record<Access, string> = { exec: "Executive", manager: "Manager", hiring: "Hiring manager" };

/** Sticky bar while Ben is looking at the portal as a client person. */
export function PreviewBar() {
  const { preview, setPreview, config, getClient } = useStore();
  const router = useRouter();
  const [flash, setFlash] = useState(false);
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    const on = () => {
      setFlash(true);
      setTimeout(() => setFlash(false), 2600);
    };
    window.addEventListener("alza-preview-blocked", on);
    return () => window.removeEventListener("alza-preview-blocked", on);
  }, []);
  if (!preview) return null;
  const client = getClient(preview.clientId);
  return (
    <>
      <div className={`preview-bar ${flash ? "flash" : ""}`} role="status">
        <span className="grow" style={{ minWidth: 0 }}>
          {flash ? (
            <b>Preview only: nothing is saved or sent.</b>
          ) : (
            <>
              Viewing as <b>{preview.name}</b> <span className="pv-sub">({ACCESS_SHORT[preview.access]}) at {client?.name ?? "client"}</span>
            </>
          )}
        </span>
        {(config[preview.clientId]?.users.length ?? 0) > 1 && <button className="pv-btn" onClick={() => setSwitching(true)}>Switch</button>}
        <button
          className="pv-btn strong"
          onClick={() => {
            setPreview(null);
            router.push("/console");
          }}
        >
          Exit preview
        </button>
      </div>
      {switching && (
        <ViewAsSheet
          initialClient={preview.clientId}
          lockClient
          onClose={() => setSwitching(false)}
          onPick={(p) => {
            setSwitching(false);
            setPreview(p);
            router.push(landing(p));
          }}
        />
      )}
    </>
  );
}

/** Pick a client and one of their people to see the portal as. */
export function ViewAsSheet({ initialClient, lockClient, onClose, onPick }: { initialClient?: string; lockClient?: boolean; onClose: () => void; onPick: (p: Preview) => void }) {
  const { clients, config } = useStore();
  const [clientId, setClientId] = useState(initialClient && clients.some((c) => c.id === initialClient) ? initialClient : clients[0]?.id ?? "");
  const users = config[clientId]?.users ?? [];
  const order: Access[] = ["exec", "manager", "hiring"];
  const sorted = [...users].sort((a, b) => order.indexOf(a.access) - order.indexOf(b.access));
  const [who, setWho] = useState<string>("");
  const pick = sorted.find((u) => u.email === who) ?? sorted[0];

  return (
    <Sheet title="View as client" onClose={onClose}>
      <p className="small muted" style={{ marginTop: 0 }}>See the portal exactly as one of their people does: same menus, same access, only what they can see. It&apos;s read-only, so nothing you click is saved or sent.</p>
      {!lockClient && (
        <label className="f">Client
          <select className="f" value={clientId} onChange={(e) => { setClientId(e.target.value); setWho(""); }}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <label className="f">As
        <select className="f" value={pick?.email ?? "__exec"} onChange={(e) => setWho(e.target.value)}>
          {sorted.map((u) => <option key={u.email || u.name} value={u.email}>{u.name}, {ACCESS_LABEL[u.access]}</option>)}
          {sorted.length === 0 && <option value="__exec">An executive (no one invited yet)</option>}
        </select>
      </label>
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button
          className="btn primary sm"
          disabled={!clientId}
          onClick={() =>
            onPick(
              pick
                ? { clientId, email: pick.email, name: pick.name, role: pick.role, access: pick.access }
                : { clientId, email: "", name: "Client executive", role: "Executive", access: "exec" }
            )
          }
        >
          View the portal
        </button>
      </div>
    </Sheet>
  );
}

export { landing as previewLanding };
