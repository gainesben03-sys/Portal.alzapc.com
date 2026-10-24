"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlzaNav, AlzaTopbar, Toast, useGuard, useToast } from "@/components/ui";
import { Access, ACCESS_LABEL, ClientConfig, MODULES, PortalUser } from "@/lib/modules";
import { useStore } from "@/lib/store";

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function HexField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value.toUpperCase());
  const [bad, setBad] = useState(false);
  useEffect(() => setDraft(value.toUpperCase()), [value]);
  const commit = (raw: string) => {
    let v = raw.trim().replace(/^#?/, "#");
    if (/^#[0-9a-f]{3}$/i.test(v)) v = "#" + v.slice(1).split("").map((c) => c + c).join("");
    if (/^#[0-9a-f]{6}$/i.test(v)) {
      setBad(false);
      onChange(v.toLowerCase());
    } else setBad(true);
  };
  const contrast = (1.05) / (luminance(value) + 0.05); // white text on the accent
  return (
    <div style={{ marginTop: 12 }}>
      <label className="f" style={{ marginTop: 0 }}>HEX code</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          className="f hex"
          value={draft}
          maxLength={7}
          placeholder="#2B3FF5"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => e.key === "Enter" && commit(draft)}
          aria-invalid={bad}
        />
        <button className="btn sm" onClick={() => commit(draft)}>Apply</button>
        <span className="btn sm primary" style={{ pointerEvents: "none" }}>Button preview</span>
      </div>
      {bad && <p className="tiny" style={{ color: "var(--red)", marginTop: 6 }}>Use a 6-digit HEX like #2B3FF5.</p>}
      {!bad && contrast < 3 && <p className="tiny" style={{ color: "var(--amber)", marginTop: 6 }}>This color is light, so white button text will be hard to read. A darker shade works better.</p>}
    </div>
  );
}

const SWATCHES = ["#2b3ff5", "#1a2b4a", "#4a7ab5", "#6b8c6b", "#8a6d3b", "#b4345c", "#0f766e", "#6d28d9"];

export default function ClientSetup() {
  const { id } = useParams<{ id: string }>();
  const ok = useGuard("advisor");
  const { config, patch, getClient } = useStore();
  const client = getClient(id);
  const cfg = config[id];
  const toast = useToast();
  const [nu, setNu] = useState<PortalUser>({ name: "", role: "", email: "", access: "manager" });

  if (!ok) return null;
  if (!client || !cfg) return (<><AlzaTopbar /><AlzaNav /><main className="wrap"><div className="card">Client not found.</div></main></>);

  const set = (p: Partial<ClientConfig>) => patch({ config: { ...config, [id]: { ...cfg, ...p } } });
  const setUser = (email: string, p: Partial<PortalUser>) => set({ users: cfg.users.map((u) => (u.email === email ? { ...u, ...p } : u)) });

  return (
    <div style={{ ["--accent" as string]: cfg.accent }}>
      <AlzaTopbar />
      <AlzaNav />
      <main className="wrap">
        <Link href="/console/clients" className="small" style={{ color: "var(--blue)" }}>← All clients</Link>
        <div className="row" style={{ marginTop: 10, alignItems: "center" }}>
          <div className="grow" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {client.logo ? <img src={client.logo} alt="" className="logo-img" style={{ height: 34 }} /> : <h1>{client.name}</h1>}
          </div>
          <Link href={`/c/${id}`} className="btn sm">Preview workspace</Link>
        </div>

        <div className="section-head section"><h2>Modules</h2></div>
        <div className="card">
          <div className="rule">
            <span className="switch"><input type="checkbox" checked disabled /><span /></span>
            <div><b>Action tracker</b><div className="tiny muted">Always on. Decisions, approvals, reminders</div></div>
          </div>
          {MODULES.map((m) => (
            <label className="rule" key={m.key} style={{ cursor: "pointer" }}>
              <span className="switch">
                <input type="checkbox" checked={cfg.modules[m.key]} onChange={(e) => set({ modules: { ...cfg.modules, [m.key]: e.target.checked } })} />
                <span />
              </span>
              <div><b>{m.label}</b><div className="tiny muted">{m.blurb}</div></div>
            </label>
          ))}
        </div>

        <div className="section-head section"><h2>Brand color</h2></div>
        <div className="card">
          <div className="swatches">
            {SWATCHES.map((c) => (
              <button key={c} className={`swatch ${cfg.accent === c ? "on" : ""}`} style={{ background: c }} aria-label={c} onClick={() => set({ accent: c })} />
            ))}
            <input type="color" value={cfg.accent} onChange={(e) => set({ accent: e.target.value })} aria-label="Custom color" style={{ width: 38, height: 34, border: 0, background: "none" }} />
          </div>
          <HexField value={cfg.accent} onChange={(v) => set({ accent: v })} />
          <p className="tiny muted" style={{ marginTop: 10 }}>Used for buttons and highlights in their workspace.</p>
        </div>

        <div className="section-head section"><h2>Logo</h2></div>
        <div className="card">
          <div className="row">
            <div className="grow" style={{ minHeight: 40, display: "flex", alignItems: "center" }}>
              {cfg.logo ? <img src={cfg.logo} alt="" className="logo-img" style={{ maxHeight: 44, maxWidth: 200 }} /> : <span className="small muted">No logo yet. Their name shows instead.</span>}
            </div>
            <label className="btn sm" style={{ cursor: "pointer" }}>
              Upload
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    set({ logo: await shrinkLogo(f) });
                    toast.show("Logo updated");
                  } catch {
                    toast.show("Couldn't read that image");
                  }
                }}
              />
            </label>
            {cfg.logo && <button className="btn ghost sm" style={{ color: "var(--red)" }} onClick={() => set({ logo: undefined })}>Remove</button>}
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>A transparent PNG or SVG looks best.</p>
        </div>

        <div className="section-head section"><h2>People with access</h2></div>
        <div className="card">
          {cfg.users.map((u) => (
            <div className="row" key={u.email} style={{ flexWrap: "wrap" }}>
              <div className="grow" style={{ minWidth: 160 }}>
                <div className="title">{u.name}</div>
                <div className="tiny muted">{u.role} · {u.email}</div>
              </div>
              <select className="f" style={{ width: "auto", padding: "6px 8px", fontSize: 13 }} value={u.access} onChange={(e) => setUser(u.email, { access: e.target.value as Access })}>
                {(Object.keys(ACCESS_LABEL) as Access[]).map((a) => <option key={a} value={a}>{ACCESS_LABEL[a]}</option>)}
              </select>
              <button
                className="btn ghost sm"
                style={{ color: "var(--red)" }}
                disabled={cfg.users.length === 1}
                onClick={() => {
                  set({ users: cfg.users.filter((x) => x.email !== u.email) });
                  toast.show(`${u.name}'s access removed`);
                }}
              >
                Remove
              </button>
            </div>
          ))}
          <form
            style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 4 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!nu.name.trim() || !nu.email.trim()) return;
              if (cfg.users.some((u) => u.email.toLowerCase() === nu.email.trim().toLowerCase())) return toast.show("That email already has access");
              set({ users: [...cfg.users, { ...nu, name: nu.name.trim(), role: nu.role.trim() || "Team member", email: nu.email.trim() }] });
              setNu({ name: "", role: "", email: "", access: "manager" });
              toast.show("Invite created. A single-use sign-in link is emailed in the full build.");
            }}
          >
            <label className="f">Invite someone</label>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <input className="f" placeholder="Name" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
              <input className="f" placeholder="Title" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })} />
              <input className="f" type="email" placeholder="Work email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} style={{ gridColumn: "1 / -1" }} />
              <select className="f" value={nu.access} onChange={(e) => setNu({ ...nu, access: e.target.value as Access })} style={{ gridColumn: "1 / -1" }}>
                {(Object.keys(ACCESS_LABEL) as Access[]).map((a) => <option key={a} value={a}>{ACCESS_LABEL[a]}</option>)}
              </select>
            </div>
            <button className="btn primary block" style={{ marginTop: 10 }} disabled={!nu.name.trim() || !nu.email.trim()}>Send invite</button>
          </form>
        </div>

        <div className="section-head section"><h2>Escalation contact</h2></div>
        <div className="card">
          <select className="f" value={cfg.escalationEmail} onChange={(e) => set({ escalationEmail: e.target.value })}>
            {cfg.users.map((u) => <option key={u.email} value={u.email}>{u.name}, {u.role}</option>)}
          </select>
          <p className="tiny muted" style={{ marginTop: 8 }}>Gets the escalation when an item is overdue past your reminder rule. If they own the item themselves, it comes to you as a check-in call instead.</p>
        </div>
        <p className="demo-note">Changes save in this browser for the prototype.</p>
      </main>
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}

/** Read an image and scale it to at most 120px tall so it stays small. */
function shrinkLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const src = String(r.result);
      if (file.type === "image/svg+xml") return resolve(src);
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, 120 / img.height);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.src = src;
    };
    r.readAsDataURL(file);
  });
}
