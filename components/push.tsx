"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { BEN_TOPICS, CLIENT_TOPICS, PushTopic, topicOn } from "@/lib/pushtopics";
import { disablePush, enablePush, getPushPrefs, isIOS, permission, PUSH_CONFIGURED, pushSupport, registerSW, savePushPrefs, testPush, thisDeviceOn } from "@/lib/pushclient";
import { LIVE } from "@/lib/supabase";
import { Sheet } from "./ui";

const ASK_KEY = (who: string) => `alza-push-ask:${who.toLowerCase()}`;
const SNOOZE_DAYS = 14;

function readAsk(who: string): { n: number; until: number } {
  try {
    return JSON.parse(localStorage.getItem(ASK_KEY(who)) || "") as { n: number; until: number };
  } catch {
    return { n: 0, until: 0 };
  }
}
function writeAsk(who: string, v: { n: number; until: number }) {
  try {
    localStorage.setItem(ASK_KEY(who), JSON.stringify(v));
  } catch {}
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-3px" }}>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

function HomeScreenSteps() {
  return (
    <ol className="push-steps">
      <li>Tap <b>Share</b> <ShareIcon /> at the bottom of Safari.</li>
      <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
      <li>Open <b>AlzaHR</b> from your Home Screen and turn alerts on.</li>
    </ol>
  );
}

/**
 * First visit after signing in: a friendly one-time ask to turn on alerts.
 * "Not now" asks again once, two weeks later, then never on its own.
 */
export function PushPrompt() {
  const { viewer, ready } = useStore();
  const [open, setOpen] = useState<null | "ask" | "ios">(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const who = viewer ? (viewer.kind === "advisor" ? "advisor" : viewer.person.email || viewer.person.name) : "";
  const isBen = viewer?.kind === "advisor";

  useEffect(() => {
    if (!ready || !viewer) return;
    registerSW();
    const sup = pushSupport();
    if (sup === "unsupported") return;
    if (sup === "ready" && permission() !== "default") return; // already decided on this device
    const a = readAsk(who);
    if (a.n >= 2 || Date.now() < a.until) return;
    const t = setTimeout(async () => {
      if (await thisDeviceOn()) return;
      setOpen(sup === "ios-home" ? "ios" : "ask");
    }, 1500);
    return () => clearTimeout(t);
  }, [ready, viewer, who]);

  if (!open) return null;
  const later = () => {
    const a = readAsk(who);
    writeAsk(who, { n: a.n + 1, until: Date.now() + SNOOZE_DAYS * 864e5 });
    setOpen(null);
  };

  return (
    <Sheet title={isBen ? "Get alerts on your phone" : "Don't miss what needs you"} onClose={later}>
      <p className="small">
        {isBen
          ? "A quick alert when a client posts a note, uploads a document, approves something, or a new hire signs. Email still comes too."
          : "Turn on alerts and your phone lets you know when Ben needs your approval or something is due. Only the things that need you. You can change this any time."}
      </p>
      {open === "ios" && (
        <>
          <p className="small" style={{ marginTop: 10 }}>On iPhone, alerts work once the portal is on your Home Screen. It takes ten seconds:</p>
          <HomeScreenSteps />
        </>
      )}
      {msg && <p className="small" style={{ color: "var(--amber)", marginTop: 8 }}>{msg}</p>}
      <div className="sheet-actions">
        <button className="btn ghost sm" onClick={later}>Not now</button>
        {open === "ios" ? (
          <button
            className="btn primary sm"
            onClick={() => {
              writeAsk(who, { n: 1, until: Date.now() + 2 * 864e5 }); // remind them in a couple of days if they don't
              setOpen(null);
            }}
          >
            Got it
          </button>
        ) : (
          <button
            className="btn primary sm"
            disabled={busy}
            onClick={async () => {
              if (!PUSH_CONFIGURED) {
                setMsg(LIVE ? "Alerts aren't switched on for the portal yet. Ben is setting them up." : "Demo mode: alerts work once the portal is live.");
                writeAsk(who, { n: 1, until: Date.now() + SNOOZE_DAYS * 864e5 });
                return;
              }
              setBusy(true);
              const r = await enablePush();
              setBusy(false);
              writeAsk(who, { n: 2, until: 0 });
              if (r.ok) setOpen(null);
              else setMsg(r.msg ?? "Couldn't turn alerts on.");
            }}
          >
            {busy ? "Turning on..." : "Turn on alerts"}
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** Settings: this device on/off, which kinds of alerts, and a test. */
export function PushSettings({ onClose }: { onClose: () => void }) {
  const { viewer } = useStore();
  const isBen = viewer?.kind === "advisor";
  const list = isBen ? BEN_TOPICS : CLIENT_TOPICS;
  const [on, setOn] = useState<boolean | null>(null);
  const [topics, setTopics] = useState<Partial<Record<PushTopic, boolean>>>({});
  const [devices, setDevices] = useState(0);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const sup = pushSupport();

  useEffect(() => {
    thisDeviceOn().then(setOn);
    if (PUSH_CONFIGURED)
      getPushPrefs().then((j) => {
        if (j.ok) {
          setTopics(j.topics ?? {});
          setDevices(j.devices ?? 0);
        }
      });
  }, []);

  const toggleDevice = async () => {
    setMsg("");
    if (!PUSH_CONFIGURED) return setMsg(LIVE ? "Alerts aren't switched on for the portal yet." : "Demo mode: alerts work once the portal is live.");
    setBusy(true);
    if (on) {
      await disablePush();
      setOn(false);
      setDevices((d) => Math.max(0, d - 1));
    } else {
      const r = await enablePush();
      if (r.ok) {
        setOn(true);
        setDevices((d) => d + 1);
      } else setMsg(r.msg ?? "");
    }
    setBusy(false);
  };

  return (
    <Sheet title="Alerts" onClose={onClose}>
      {sup === "ios-home" ? (
        <>
          <p className="small">On iPhone and iPad, alerts work once the portal is on your Home Screen:</p>
          <HomeScreenSteps />
        </>
      ) : sup === "unsupported" ? (
        <p className="small">This browser can&apos;t show alerts. You&apos;ll still get emails. Chrome, Edge, Firefox and Safari all support them.</p>
      ) : (
        <label className="rule" style={{ cursor: "pointer" }}>
          <span className="switch"><input type="checkbox" checked={!!on} disabled={busy || on === null} onChange={toggleDevice} /><span /></span>
          <div>
            <b>Alerts on this {isIOS() ? "phone" : "device"}</b>
            <div className="tiny muted">{devices > 1 ? `On for ${devices} of your devices.` : "Each phone or computer is turned on separately."}</div>
          </div>
        </label>
      )}

      <div className="section-head" style={{ marginTop: 14 }}><h2>What to alert me about</h2></div>
      {list.map((t) => (
        <label key={t.key} className="rule" style={{ cursor: "pointer" }}>
          <span className="switch">
            <input
              type="checkbox"
              checked={topicOn(topics, t.key)}
              onChange={(e) => {
                const next = { ...topics, [t.key]: e.target.checked };
                setTopics(next);
                if (PUSH_CONFIGURED) savePushPrefs(next);
              }}
            />
            <span />
          </span>
          <div><b>{t.label}</b><div className="tiny muted">{t.sub}</div></div>
        </label>
      ))}
      <p className="tiny muted" style={{ marginTop: 8 }}>Emails keep coming either way, so nothing is missed if alerts are off.</p>
      {msg && <p className="small" style={{ color: "var(--amber)", marginTop: 8 }}>{msg}</p>}
      <div className="sheet-actions">
        {on && (
          <button
            className="btn ghost sm"
            onClick={async () => {
              const j = await testPush();
              setMsg(j.ok ? "Sent. It should pop up in a few seconds." : "Couldn't send a test. Turn alerts off and on again on this device.");
            }}
          >
            Send a test
          </button>
        )}
        <button className="btn primary sm" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}

/** Small icon button for the top bar. */
export function PushButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="theme-toggle" aria-label="Alert settings" title="Alerts" onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="6" y="2" width="12" height="20" rx="2.5" />
          <path d="M11 18h2" />
        </svg>
      </button>
      {open && <PushSettings onClose={() => setOpen(false)} />}
    </>
  );
}
