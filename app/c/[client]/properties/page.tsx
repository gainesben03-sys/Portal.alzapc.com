"use client";

// Our Properties: a card for each property with who leads it and who handles what.
// Cards fill from the team roster (Location + Title). Ben and executives can fix any slot,
// set a property's area for the map, hide locations that aren't properties, and pick the
// "still stuck" contacts. Directory by default, Map view on request.
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BayMap, MapPin } from "@/components/baymap";
import { ClientNav, ClientTopbar, Sheet, Toast, useGuard, useToast } from "@/components/ui";
import { CITIES, cleanSettings, Contact, HqCard, hqCard, keyOf, pinFor, PropertyCard, propertyCards, PropertySettings, PropItem, PropStatus, RoleKey, ROLES, rosterLocations, STATUSES } from "@/lib/properties";
import { useStore } from "@/lib/store";
import { authHeader, LIVE } from "@/lib/supabase";

type Roster = { id: string; name: string; title: string; location: string };
type Loc = { key: string; name: string; count: number; corporate: boolean };
type Data = { cards: PropertyCard[]; hq?: HqCard | null; contacts: Contact[]; canEdit: boolean; settings?: PropertySettings; people?: Roster[]; locations?: Loc[] };

const DOT: Record<PropStatus, string> = { Active: "#3f8a5a", Transition: "#d0862a", Acquisition: "#3c7fc0", Inactive: "#8a857e" };
const TXT: Record<PropStatus, string> = { Active: "var(--green)", Transition: "var(--amber)", Acquisition: "#2e6aa3", Inactive: "var(--muted)" };

function useProperties(clientId: string) {
  const { people, config, viewer, me, getClient } = useStore();
  const [live, setLive] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    if (!LIVE) return;
    try {
      const r = await fetch(`/api/properties?clientId=${encodeURIComponent(clientId)}`, { headers: await authHeader() });
      const j = await r.json();
      if (j.ok) setLive(j);
      else setErr(j.reason || "error");
    } catch {
      setErr("error");
    }
  }, [clientId]);
  useEffect(() => {
    load();
  }, [load]);
  // demo: everything from this browser's sample data
  const demo = useMemo<Data | null>(() => {
    if (LIVE) return null;
    const settings = cleanSettings(config[clientId]?.properties, { allowData: true });
    const client = getClient(clientId);
    const canEdit = viewer?.kind === "advisor" || me?.access === "exec";
    const esc = client?.escalation;
    return {
      cards: propertyCards(people, settings, clientId),
      hq: hqCard(people, settings, clientId),
      contacts: settings.contacts?.length ? settings.contacts : [...(esc?.name ? [{ name: esc.name, title: esc.role, email: esc.email ?? "", what: "Operations and anything else" }] : []), { name: "Ben Gaines", title: "HR", email: "ben@alzapc.com", what: "Employee questions and issues" }],
      canEdit,
      settings,
      people: people.filter((p) => p.clientId === clientId && p.active !== false).map((p) => ({ id: p.id, name: p.name, title: p.title, location: p.location || "" })).sort((a, b) => a.name.localeCompare(b.name)),
      locations: rosterLocations(people, clientId),
    };
  }, [people, config, clientId, viewer, me, getClient]);
  return { data: LIVE ? live : demo, err, reload: load };
}

export default function PropertiesPage() {
  const { client: clientId } = useParams<{ client: string }>();
  const ok = useGuard("client", clientId);
  const { getClient, config, patch, viewer } = useStore();
  const client = getClient(clientId);
  const cfg = config[clientId];
  const { data, err, reload } = useProperties(clientId);
  const toast = useToast();
  const [view, setView] = useState<"directory" | "map">("directory");
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [editHq, setEditHq] = useState(false);

  if (!ok || !client) return null;
  const isAdvisor = viewer?.kind === "advisor";
  if (!cfg?.modules.properties && !isAdvisor)
    return (
      <div>
        <ClientTopbar client={client} />
        <ClientNav clientId={client.id} />
        <main className="wrap"><div className="card">Our Properties isn&apos;t turned on for this workspace.</div></main>
      </div>
    );

  const save = async (settings: PropertySettings, msg = "Saved") => {
    const clean = cleanSettings(settings, { allowData: !LIVE });
    if (!LIVE) {
      patch({ config: { ...config, [clientId]: { ...cfg, properties: clean } } });
      toast.show(msg);
      return true;
    }
    const r = await fetch("/api/properties", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ clientId, settings: clean }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) {
      toast.show(j.reason === "preview" ? "Preview is read-only" : "Couldn't save. Try again.");
      return false;
    }
    patch({ config: { ...config, [clientId]: { ...cfg, properties: j.settings } } });
    await reload();
    toast.show(msg);
    return true;
  };

  // card photos: live uploads go straight to storage; the demo keeps a small copy in this browser
  const setPhoto = async (key: string, name: string, dataUrl: string | null) => {
    if (!LIVE) {
      const cur = cleanSettings(cfg?.properties, { allowData: true });
      const items = cur.items ?? [];
      const next = items.some((i) => i.key === key) ? items.map((i) => (i.key === key ? { ...i, photo: dataUrl ?? undefined } : i)) : [...items, { key, name, photo: dataUrl ?? undefined }];
      return save({ ...cur, items: next }, dataUrl ? "Photo added" : "Photo removed");
    }
    const r = await fetch("/api/properties", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ clientId, action: dataUrl ? "photo" : "removePhoto", key, data: dataUrl }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) {
      toast.show(j.reason === "too_big" ? "That photo is too large" : "Couldn't save the photo. Try again.");
      return false;
    }
    patch({ config: { ...config, [clientId]: { ...cfg, properties: j.settings } } });
    await reload();
    toast.show(dataUrl ? "Photo added" : "Photo removed");
    return true;
  };

  const cards = data?.cards ?? [];
  const f = q.trim().toLowerCase();
  const shown = cards.filter((c) => !f || [c.name, c.city ?? "", ...c.slots.map((s) => s.person?.name ?? "")].some((t) => t.toLowerCase().includes(f)));
  const num = new Map(cards.map((c, i) => [c.key, String(i + 1)]));
  const open = cards.find((c) => c.key === focus);
  const editCard = cards.find((c) => c.key === editing);

  return (
    <div style={{ ["--accent" as string]: client.accent }}>
      <ClientTopbar client={client} />
      <ClientNav clientId={client.id} />
      <main className="wrap wide">
        {!cfg?.modules.properties && isAdvisor && <div className="pr-draft tiny">Our Properties is off for {client.name}. Turn it on in their settings under Modules.</div>}

        {!data ? (
          <div className="card small muted section">{err ? "Couldn't load the properties. Refresh to try again." : "Loading…"}</div>
        ) : open ? (
          <Focus card={open} n={num.get(open.key) ?? ""} canEdit={data.canEdit} onBack={() => setFocus(null)} onEdit={() => setEditing(open.key)} />
        ) : (
          <>
            <div className="op-head">
              <div className="grow" style={{ minWidth: 240 }}>
                <h1 style={{ margin: 0 }}>Our Properties</h1>
                <p className="muted" style={{ margin: "4px 0 0" }}>Who runs each property and who to reach for what.</p>
              </div>
              <div className="op-tools">
                <div className="op-seg" role="group" aria-label="View">
                  <button aria-pressed={view === "directory"} className={view === "directory" ? "on" : ""} onClick={() => setView("directory")}>Directory</button>
                  <button aria-pressed={view === "map"} className={view === "map" ? "on" : ""} onClick={() => setView("map")}>Map view</button>
                </div>
                {cards.length > 3 && <input className="op-find" placeholder="Find a property or person" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a property or person" />}
                {data.canEdit && <button className="btn sm" onClick={() => setManaging(true)}>Manage</button>}
              </div>
            </div>

            {!cards.length ? (
              <div className="card section">
                <b>No properties yet.</b>
                <p className="small muted" style={{ margin: "6px 0 0" }}>
                  The cards fill themselves from the team roster: each person&apos;s Location (or Property) column is where they work, and their title says what they handle.
                  {isAdvisor ? " Upload the census on this client's page in your console." : data.canEdit ? " Send AlzaHR your latest census, or add a property by hand under Manage." : ""}
                </p>
              </div>
            ) : view === "map" ? (
              <MapView cards={shown} hq={data.hq ?? null} num={num} canEdit={data.canEdit} onOpen={setFocus} />
            ) : (
              <>
              {data.hq && !f && <Hq hq={data.hq} canEdit={data.canEdit} onEdit={() => setEditHq(true)} />}
              <div className="op-grid section">
                {shown.map((c) => <Card key={c.key} card={c} n={num.get(c.key) ?? ""} onOpen={() => setFocus(c.key)} />)}
                {!shown.length && <p className="muted">No property or person matches that.</p>}
              </div>
              </>
            )}
          </>
        )}

        {data && data.contacts.length > 0 && (
          <section className="op-stuck section" aria-label="Still stuck">
            <b className="op-stuck-h">Still stuck?</b>
            {data.contacts.map((c) => (
              <div key={c.name} className="op-stuck-p">
                <span className="grow">
                  <b>{c.name}</b>
                  <span className="tiny muted" style={{ display: "block" }}>{[c.title, c.what].filter(Boolean).join(" · ")}</span>
                </span>
                {c.email && <a className="btn sm" href={`mailto:${c.email}`}>Email</a>}
              </div>
            ))}
          </section>
        )}
      </main>

      {editCard && data?.settings && data.people && (
        <EditSheet card={editCard} settings={data.settings} people={data.people} onPhoto={(d) => setPhoto(editCard.key, editCard.name, d)} onClose={() => setEditing(null)} onSave={async (s) => (await save(s)) && setEditing(null)} />
      )}
      {editHq && data?.hq && data.settings && <HqSheet hq={data.hq} settings={data.settings} people={data.people ?? []} onPhoto={(d) => setPhoto(data.hq!.key, data.hq!.name, d)} onClose={() => setEditHq(false)} onSave={async (s) => (await save(s)) && setEditHq(false)} />}
      {managing && data?.settings && (
        <ManageSheet settings={data.settings} hqNow={data.hq?.keys ?? []} locations={data.locations ?? []} contacts={data.contacts} onClose={() => setManaging(false)} onSave={async (s) => (await save(s)) && setManaging(false)} />
      )}
      <Toast msg={toast.msg} onDone={toast.clear} />
    </div>
  );
}

const Mail = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
);

function Card({ card, n, onOpen }: { card: PropertyCard; n: string; onOpen: () => void }) {
  const lead = card.slots.find((s) => s.role === "lead")?.person;
  return (
    <article className={`op-card ${card.photo ? "has-photo" : ""}`}>
      {card.photo && (
        <button className="op-photo" onClick={onOpen} aria-label={`Open ${card.name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.photo} alt="" loading="lazy" />
        </button>
      )}
      <div className="op-card-top">
        <span className="op-num" style={{ background: DOT[card.status] }}>{n}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <h2>{card.name}</h2>
          <div className="tiny muted"><b style={{ color: TXT[card.status] }}>{card.status}</b>{card.city ? ` · ${card.city}` : ""}</div>
        </div>
        <button className="btn sm" onClick={onOpen}>Open</button>
      </div>
      <div className={`op-lead ${lead ? "" : "none"}`}>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="op-k">Property lead</span>
          <b>{lead?.name ?? "No lead yet"}</b>
        </span>
        {lead?.email && <a className="op-mail ring" href={`mailto:${lead.email}`} aria-label={`Email ${lead.name}`}><Mail /></a>}
      </div>
      <ul className="op-rows">
        {card.slots.filter((s) => s.role !== "lead" && s.person).map((s) => (
          <li key={s.role}>
            <span className="op-rk">{s.role === "backup" ? "Backup" : s.role === "maint" ? "Maint." : s.role === "acct" ? "Acct." : s.role === "facil" ? "Facilities" : s.label}</span>
            <span className={`op-rn ${s.person ? "" : "gap"}`}>{s.person?.name ?? "Not assigned"}</span>
            {s.person?.email && <a className="op-mail" href={`mailto:${s.person.email}`} aria-label={`Email ${s.person.name}`}><Mail /></a>}
          </li>
        ))}
      </ul>
    </article>
  );
}

function MapView({ cards, hq, num, canEdit, onOpen }: { cards: PropertyCard[]; hq: HqCard | null; num: Map<string, string>; canEdit: boolean; onOpen: (k: string) => void }) {
  const placed = cards.filter((c) => pinFor(c.city));
  const missing = cards.filter((c) => !pinFor(c.city));
  // spread pins that land on the same spot
  const seen = new Map<string, number>();
  const pins: MapPin[] = placed.map((c) => {
    const p = pinFor(c.city)!;
    const k = `${Math.round(p.x)}:${Math.round(p.y)}`;
    const i = seen.get(k) ?? 0;
    seen.set(k, i + 1);
    return { key: c.key, n: num.get(c.key) ?? "", x: p.x + i * 7, y: p.y + i * 5, color: DOT[c.status], label: `${num.get(c.key)}: ${c.name}`, onClick: () => onOpen(c.key) };
  });
  const hp = hq ? pinFor(hq.city) : null;
  if (hq && hp) pins.push({ key: "hq", n: "HQ", x: hp.x, y: hp.y, color: "#19283c", label: `Headquarters: ${hq.name}`, onClick: () => {} });
  return (
    <section className="op-map section" aria-label="Map of our properties">
      <div className="op-map-l"><BayMap pins={pins} /></div>
      <div className="op-map-r">
        <div className="tiny muted" style={{ padding: "2px 6px 8px" }}>{cards.length} {cards.length === 1 ? "property" : "properties"}</div>
        {cards.map((c) => (
          <button key={c.key} className="op-li" onClick={() => onOpen(c.key)}>
            <span className="op-num sm" style={{ background: DOT[c.status] }}>{num.get(c.key)}</span>
            <span className="grow" style={{ minWidth: 0 }}>
              <b>{c.name}</b>
              <span className="tiny muted" style={{ display: "block" }}>{[c.city ?? "Area not set", c.slots.find((s) => s.role === "lead")?.person?.name ?? "No lead yet"].join(" · ")}</span>
            </span>
          </button>
        ))}
        {missing.length > 0 && canEdit && <p className="tiny muted" style={{ margin: "8px 6px 0" }}>Not on the map yet: {missing.map((c) => c.name).join(", ")}. Open one and tap Edit to add its address or area.</p>}
        <div className="op-legend">
          {(["Active", "Transition", "Acquisition"] as PropStatus[]).map((s) => <span key={s}><i style={{ background: DOT[s] }} />{s}</span>)}
        </div>
      </div>
    </section>
  );
}

function Hq({ hq, canEdit, onEdit }: { hq: HqCard; canEdit: boolean; onEdit: () => void }) {
  const [all, setAll] = useState(false);
  return (
    <section className={`op-hq section ${hq.photo ? "has-photo" : ""}`} aria-label="Headquarters">
      {hq.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="op-hq-photo" src={hq.photo} alt={hq.name} />
      )}
      <div className="op-hq-l">
        <span className="op-hq-k">Headquarters</span>
        <h2>{hq.name}</h2>
        {hq.places.length > 1 && <p className="tiny muted" style={{ margin: "2px 0 0" }}>{hq.places.join(" · ")}</p>}
        {hq.address && <p className="small" style={{ margin: "6px 0 0" }}>{hq.address} · <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hq.address)}`} target="_blank" rel="noreferrer">Directions</a></p>}
        {hq.note && <p className="small" style={{ margin: "6px 0 0" }}>{hq.note}</p>}
        {canEdit && <button className="btn sm" style={{ marginTop: 12 }} onClick={onEdit}>Edit</button>}
      </div>
      <div className="op-hq-r">
        {hq.leaders.length ? (
          <ul className="op-lead-row" aria-label="Leadership">
            {hq.leaders.map((p) => (
              <li key={p.id}>
                <b>{p.name}</b>
                <span>{p.title}</span>
                {p.email && <a href={`mailto:${p.email}`} aria-label={`Email ${p.name}`}><Mail /> Email</a>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">No leadership titles found at headquarters yet.{canEdit ? " Tap Edit to pick who shows here." : ""}</p>
        )}
        {hq.others.length > 0 && (
          <div className="op-hq-more">
            <button className="linklike small" onClick={() => setAll(!all)} aria-expanded={all}>{all ? "Hide" : `Also at headquarters: ${hq.others.length} ${hq.others.length === 1 ? "person" : "people"}`}</button>
            {all && (
              <ul>
                {hq.others.map((p) => (
                  <li key={p.id}>{p.email ? <a href={`mailto:${p.email}`}>{p.name}</a> : p.name}<span className="muted"> · {p.title}</span></li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function HqSheet({ hq, settings, people, onPhoto, onClose, onSave }: { hq: HqCard; settings: PropertySettings; people: Roster[]; onPhoto: (d: string | null) => Promise<boolean>; onClose: () => void; onSave: (s: PropertySettings) => void }) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const cur = settings.items?.find((i) => i.key === hq.key);
  const [auto, setAuto] = useState(hq.autoLeaders);
  const [picked, setPicked] = useState<string[]>(hq.leaders.map((p) => p.id));
  const hqPeople = [...hq.leaders, ...hq.others];
  const extra = people.filter((p) => !hqPeople.some((x) => x.id === p.id));
  const everyone = [...hqPeople.map((p) => ({ id: p.id, name: p.name, title: p.title })), ...extra.map((p) => ({ id: p.id, name: p.name, title: p.title }))];
  const move = (i: number, d: number) => {
    const n = [...picked];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    setPicked(n);
  };
  const [v, setV] = useState<PropItem>({ key: hq.key, name: hq.name, address: hq.address, city: cur?.city, note: hq.note });
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Edit headquarters" onClose={onClose}>
      <div className="op-photo-edit">
        {hq.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hq.photo} alt="" />
        ) : (
          <span className="op-photo-empty tiny muted">No photo. The banner looks just like it does now.</span>
        )}
        <div className="row" style={{ gap: 8, justifyContent: "flex-start", marginTop: 8 }}>
          <label className="btn sm" style={{ display: "inline-flex", alignItems: "center" }}>
            {photoBusy ? "Saving…" : hq.photo ? "Change photo" : "Add a photo"}
            <input type="file" accept="image/*" hidden disabled={photoBusy} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f || !/^image\//.test(f.type)) return; setPhotoBusy(true); try { await onPhoto(await shrink(f, LIVE ? 1600 : 800, LIVE ? 0.82 : 0.7)); } catch {} setPhotoBusy(false); }} />
          </label>
          {hq.photo && <button className="btn sm" disabled={photoBusy} onClick={async () => { setPhotoBusy(true); await onPhoto(null); setPhotoBusy(false); }}>Remove</button>}
        </div>
      </div>
      <label className="f">Name<input className="f" value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      <label className="f">Address <span className="tiny muted">(optional; puts HQ on the map)</span><input className="f" value={v.address ?? ""} maxLength={200} placeholder="123 Main St, San Francisco, CA" onChange={(e) => setV({ ...v, address: e.target.value || undefined })} /></label>
      <label className="f">Area, for the map
        <select className="f" value={v.city ?? ""} onChange={(e) => setV({ ...v, city: e.target.value || undefined })}>
          <option value="">{hq.city && !cur?.city ? `Automatic (${hq.city})` : "Automatic"}</option>
          {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
        </select>
      </label>
      <label className="f">Note <span className="tiny muted">(optional)</span><textarea className="f" rows={2} maxLength={400} value={v.note ?? ""} onChange={(e) => setV({ ...v, note: e.target.value || undefined })} /></label>
      <h4 className="op-h">Leadership</h4>
      <label className="check" style={{ marginTop: 0 }}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Pick and order from titles automatically</label>
      {!auto && (
        <>
          <ol className="op-order">
            {picked.map((id, i) => {
              const p = everyone.find((x) => x.id === id);
              if (!p) return null;
              return (
                <li key={id}>
                  <span className="op-order-n">{i + 1}</span>
                  <span className="grow" style={{ minWidth: 0 }}><b>{p.name}</b> <span className="tiny muted">· {p.title}</span></span>
                  <button className="btn sm" aria-label={`Move ${p.name} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="btn sm" aria-label={`Move ${p.name} later`} disabled={i === picked.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button className="btn sm" aria-label={`Remove ${p.name}`} onClick={() => setPicked(picked.filter((x) => x !== id))}>×</button>
                </li>
              );
            })}
          </ol>
          {picked.length < 12 && (
            <select className="f" value="" onChange={(e) => e.target.value && setPicked([...picked, e.target.value])} aria-label="Add someone to the leadership row">
              <option value="">+ Add someone</option>
              {everyone.filter((p) => !picked.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}{p.title ? `, ${p.title}` : ""}</option>)}
            </select>
          )}
        </>
      )}
      <p className="tiny muted">Shown side by side in this order, left to right. Everyone else at HQ is listed under it. Choose which locations count as HQ under Manage.</p>
      <div className="sheet-actions">
        <button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={busy} onClick={async () => { setBusy(true); await onSave({ ...settings, leaders: auto ? [] : picked.slice(0, 12), items: [...(settings.items ?? []).filter((i) => i.key !== hq.key), { ...cur, ...v, photo: (settings.items ?? []).find((i) => i.key === hq.key)?.photo, name: v.name.trim() || hq.name }] }); setBusy(false); }}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Sheet>
  );
}

function Focus({ card, n, canEdit, onBack, onEdit }: { card: PropertyCard; n: string; canEdit: boolean; onBack: () => void; onEdit: () => void }) {
  const lead = card.slots.find((s) => s.role === "lead");
  return (
    <>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm" onClick={onBack}>← All properties</button>
        <span className="grow" />
        {canEdit && <button className="btn sm" onClick={onEdit}>Edit</button>}
      </div>
      <section className="op-focus section">
        {card.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="op-focus-photo" src={card.photo} alt={card.name} />
        )}
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <span className="op-num lg" style={{ background: DOT[card.status] }}>{n}</span>
          <div className="grow">
            <div className="small muted"><b style={{ color: TXT[card.status] }}>{card.status}</b>{card.city ? ` · ${card.city}` : ""}{card.headcount ? ` · ${card.headcount} on site` : ""}</div>
            <h1 style={{ margin: "4px 0 0" }}>{card.name}</h1>
          </div>
        </div>
        {card.address && (
          <p className="small" style={{ margin: 0 }}>
            {card.address} · <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.address)}`} target="_blank" rel="noreferrer">Directions</a>
          </p>
        )}
        {card.note && <p className="op-note"><b>Note:</b> {card.note}</p>}
        {!lead?.person && <div className="op-warn"><b>No lead yet.</b> Until someone is named, use the contacts under Still stuck.</div>}
        <div className="op-people">
          {card.slots.filter((s) => s.person || canEdit).map((s) => (
            <div key={s.role} className={`op-pc ${s.role === "lead" ? "lead" : ""} ${s.person ? "" : "gap"}`}>
              <span className="op-k">{s.label}</span>
              <b className="op-pn">{s.person?.name ?? "Not assigned yet"}</b>
              <span className="tiny muted">{s.person?.title ?? "Only you and admins see this. Tap Edit to assign someone."}</span>
              {s.person?.email && (
                <span className="row" style={{ gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-start" }}>
                  <a className="btn primary sm" href={`mailto:${s.person.email}`}>Email</a>
                  <span className="tiny muted">{s.person.email}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/** Shrink a photo in the browser to a wide JPEG before it's saved. */
async function shrink(file: File, maxW: number, quality: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    // crop to a 2:1 banner from the center
    const ratio = 2;
    let sw = img.naturalWidth;
    let sh = Math.round(sw / ratio);
    if (sh > img.naturalHeight) {
      sh = img.naturalHeight;
      sw = Math.round(sh * ratio);
    }
    const sx = Math.round((img.naturalWidth - sw) / 2);
    const sy = Math.round((img.naturalHeight - sh) / 2);
    const w = Math.min(maxW, sw);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = Math.round(w / ratio);
    c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function EditSheet({ card, settings, people, onPhoto, onClose, onSave }: { card: PropertyCard; settings: PropertySettings; people: Roster[]; onPhoto: (d: string | null) => Promise<boolean>; onClose: () => void; onSave: (s: PropertySettings) => void }) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const pickPhoto = async (f?: File) => {
    if (!f || !/^image\//.test(f.type)) return;
    setPhotoBusy(true);
    try {
      await onPhoto(await shrink(f, LIVE ? 1200 : 640, LIVE ? 0.82 : 0.7));
    } catch {
      /* unreadable image */
    }
    setPhotoBusy(false);
  };
  const cur = settings.items?.find((i) => i.key === card.key);
  const [v, setV] = useState<PropItem>({ key: card.key, name: card.name, status: card.status, city: cur?.city, address: card.address, note: card.note, roles: { ...(cur?.roles ?? {}) }, manual: cur?.manual });
  const [busy, setBusy] = useState(false);
  const setRole = (k: RoleKey, val: string) =>
    setV((x) => {
      const roles = { ...(x.roles ?? {}) };
      if (val === "auto") delete roles[k];
      else roles[k] = val === "none" ? "" : val;
      return { ...x, roles };
    });
  const auto = (k: RoleKey) => card.slots.find((s) => s.role === k && s.auto)?.person?.name;
  const here = people.filter((p) => p.location.toLowerCase().includes(card.name.toLowerCase()));
  const rest = people.filter((p) => !here.includes(p));
  const submit = async () => {
    setBusy(true);
    const latest = (settings.items ?? []).find((i) => i.key === card.key);
    const items = [...(settings.items ?? []).filter((i) => i.key !== card.key), { ...v, photo: latest?.photo, name: v.name.trim() || card.name }];
    await onSave({ ...settings, items });
    setBusy(false);
  };
  return (
    <Sheet title={`Edit ${card.name}`} onClose={onClose}>
      <div className="op-scroll">
        <div className="op-photo-edit">
          {card.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.photo} alt="" />
          ) : (
            <span className="op-photo-empty tiny muted">No photo. The card looks just like it does now.</span>
          )}
          <div className="row" style={{ gap: 8, justifyContent: "flex-start", marginTop: 8 }}>
            <label className="btn sm" style={{ display: "inline-flex", alignItems: "center" }}>
              {photoBusy ? "Saving…" : card.photo ? "Change photo" : "Add a photo"}
              <input type="file" accept="image/*" hidden disabled={photoBusy} onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {card.photo && <button className="btn sm" disabled={photoBusy} onClick={async () => { setPhotoBusy(true); await onPhoto(null); setPhotoBusy(false); }}>Remove</button>}
          </div>
        </div>
        <label className="f">Name<input className="f" value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <div className="two">
          <label className="f">Status
            <select className="f" value={v.status ?? "Active"} onChange={(e) => setV({ ...v, status: e.target.value as PropStatus })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label className="f">Area, for the map
            <select className="f" value={v.city ?? ""} onChange={(e) => setV({ ...v, city: e.target.value || undefined })}>
              <option value="">{card.city && !cur?.city ? `Automatic (${card.city})` : "Automatic"}</option>
              {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <label className="f">Address <span className="tiny muted">(optional; if it names a Bay Area city, the map pin goes there)</span><input className="f" value={v.address ?? ""} maxLength={200} placeholder="123 Main St, Oakland, CA" onChange={(e) => setV({ ...v, address: e.target.value || undefined })} /></label>
        <label className="f">Note <span className="tiny muted">(optional, shows on the card)</span><textarea className="f" rows={2} maxLength={400} value={v.note ?? ""} onChange={(e) => setV({ ...v, note: e.target.value || undefined })} /></label>
        <h4 className="op-h">Who handles what</h4>
        <p className="tiny muted" style={{ marginTop: 0 }}>Leave a slot on Automatic and it follows the roster: when someone new takes the job, the card updates by itself.</p>
        {ROLES.map((r) => {
          const val = v.roles?.[r.key];
          return (
            <label key={r.key} className="f">{r.label}
              <select className="f" value={val === undefined ? "auto" : val === "" ? "none" : val} onChange={(e) => setRole(r.key, e.target.value)}>
                <option value="auto">Automatic{auto(r.key) ? ` (${auto(r.key)})` : " (no match on the roster)"}</option>
                <option value="none">No one</option>
                {here.length > 0 && <optgroup label="At this property">{here.map((p) => <option key={p.id} value={p.id}>{p.name}{p.title ? `, ${p.title}` : ""}</option>)}</optgroup>}
                <optgroup label={here.length ? "Everyone else" : "Everyone"}>{rest.map((p) => <option key={p.id} value={p.id}>{p.name}{p.title ? `, ${p.title}` : ""}{p.location ? ` (${p.location})` : ""}</option>)}</optgroup>
              </select>
            </label>
          );
        })}
      </div>
      <div className="sheet-actions">
        <button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Sheet>
  );
}

function ManageSheet({ settings, hqNow, locations, contacts, onClose, onSave }: { settings: PropertySettings; hqNow: string[]; locations: Loc[]; contacts: Contact[]; onClose: () => void; onSave: (s: PropertySettings) => void }) {
  const [hq, setHq] = useState<string[]>(hqNow);
  const [hidden, setHidden] = useState<string[]>(settings.hidden ?? []);
  const [items, setItems] = useState<PropItem[]>(settings.items ?? []);
  const [cs, setCs] = useState<Contact[]>(contacts.length ? contacts : [{ name: "", title: "", email: "", what: "" }]);
  const [add, setAdd] = useState("");
  const [busy, setBusy] = useState(false);
  const manual = items.filter((i) => i.manual);
  const isHidden = (l: Loc) => hq.includes(l.key) || hidden.includes(l.key) || (l.corporate && !items.some((i) => i.key === l.key));
  const toggle = (l: Loc, show: boolean) => {
    setHidden((h) => (show ? h.filter((x) => x !== l.key) : [...new Set([...h, l.key])]));
    // a corporate-sounding location only shows if it's named as a property on purpose
    if (show && l.corporate && !items.some((i) => i.key === l.key)) setItems((xs) => [...xs, { key: l.key, name: l.name, manual: true }]);
  };
  const addOne = () => {
    const name = add.trim();
    if (!name) return;
    const key = keyOf(name);
    if (!items.some((i) => i.key === key)) setItems((xs) => [...xs, { key, name, manual: true }]);
    setHidden((h) => h.filter((x) => x !== key));
    setAdd("");
  };
  const setC = (i: number, c: Partial<Contact>) => setCs((xs) => xs.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const submit = async () => {
    setBusy(true);
    await onSave({ ...settings, hidden, items, hq, contacts: cs.filter((c) => c.name.trim()) });
    setBusy(false);
  };
  return (
    <Sheet title="Manage properties" onClose={onClose}>
      <div className="op-scroll">
        <h4 className="op-h" style={{ marginTop: 0 }}>From the roster</h4>
        {locations.length ? (
          <ul className="op-manage">
            {locations.map((l) => (
              <li key={l.key}>
                <label className="check" style={{ margin: 0 }}>
                  <input type="checkbox" checked={!isHidden(l)} disabled={hq.includes(l.key)} onChange={(e) => toggle(l, e.target.checked)} />
                  <span className="grow">{l.name} <span className="tiny muted">· {l.count} {l.count === 1 ? "person" : "people"}</span></span>
                </label>
                <button className={`op-hqbtn ${hq.includes(l.key) ? "on" : ""}`} aria-pressed={hq.includes(l.key)} onClick={() => setHq(hq.includes(l.key) ? hq.filter((x) => x !== l.key) : [...hq, l.key])}>{hq.includes(l.key) ? "HQ" : "Make HQ"}</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">No locations on the roster yet.</p>
        )}
        <p className="tiny muted">Checked locations get a property card. Mark your headquarters as HQ (more than one if they share a venue) to show leadership above the cards. Uncheck anything else that isn&apos;t a property; people there still fill company-wide slots, like accounting.</p>

        <h4 className="op-h">Added by hand</h4>
        {manual.length > 0 && (
          <ul className="op-manage">
            {manual.map((i) => (
              <li key={i.key}>
                <span className="grow">{i.name}</span>
                <button className="linklike tiny" style={{ color: "var(--red)" }} onClick={() => setItems((xs) => xs.filter((x) => x.key !== i.key))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <div className="row" style={{ gap: 6 }}>
          <input className="f grow" placeholder="A property not on the roster yet, like a new acquisition" value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addOne()} aria-label="New property name" />
          <button className="btn sm" onClick={addOne} disabled={!add.trim()}>Add</button>
        </div>

        <h4 className="op-h">Still stuck? contacts</h4>
        <p className="tiny muted" style={{ marginTop: 0 }}>The last stop on every card. Up to three people.</p>
        {cs.map((c, i) => (
          <div key={i} className="op-contact">
            <div className="two">
              <input className="f" placeholder="Name" value={c.name} onChange={(e) => setC(i, { name: e.target.value })} aria-label="Contact name" />
              <input className="f" placeholder="Title" value={c.title} onChange={(e) => setC(i, { title: e.target.value })} aria-label="Contact title" />
            </div>
            <div className="two">
              <input className="f" placeholder="Email" type="email" value={c.email} onChange={(e) => setC(i, { email: e.target.value })} aria-label="Contact email" />
              <input className="f" placeholder="Go to them for…" value={c.what} onChange={(e) => setC(i, { what: e.target.value })} aria-label="What to contact them for" />
            </div>
            {cs.length > 1 && <button className="linklike tiny" style={{ color: "var(--red)" }} onClick={() => setCs((xs) => xs.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        {cs.length < 3 && <button className="btn sm" onClick={() => setCs((xs) => [...xs, { name: "", title: "", email: "", what: "" }])}>+ Add a contact</button>}
      </div>
      <div className="sheet-actions">
        <button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Sheet>
  );
}
