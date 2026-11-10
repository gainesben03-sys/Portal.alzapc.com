"use client";

// Break-room TV: rotates recent shoutouts, with the scoreboard and the QR code to join in.
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Scoreboard, ShoutCard, WallItem } from "@/components/shoutui";
import { Board, shortName } from "@/lib/recognition";
import { DEMO_SHOUTS, demoBoard, demoReactions } from "@/lib/shoutdemo";

type Info = { company: string; accent: string; logo: string | null; board: Board | null; wall: WallItem[] };

export default function ShoutTv() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [i, setI] = useState(0);
  const [qr, setQr] = useState("");

  useEffect(() => {
    const load = () =>
      fetch(`/api/shout/${encodeURIComponent(token)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (j.ok) setInfo(j);
          else if (j.reason === "demo")
            setInfo({ company: "Blueprint Studios", accent: "#2b3cf5", logo: null, board: demoBoard(), wall: DEMO_SHOUTS.filter((s) => s.status === "live").map((s) => ({ id: s.id, to: shortName(s.to.name), team: s.to.department ?? "", from: shortName(s.from.name), value: s.value ?? null, message: s.message, at: s.at, reactions: demoReactions[s.id] ?? {}, mine: [] })) });
        })
        .catch(() => undefined);
    load();
    const t = setInterval(load, 60_000);
    QRCode.toDataURL(`${window.location.origin}/shout/${token}`, { margin: 1, width: 360 }).then(setQr);
    return () => clearInterval(t);
  }, [token]);
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), 9000);
    return () => clearInterval(t);
  }, []);

  if (!info) return <div className="so-tv" />;
  const list = info.wall.slice(0, 20);
  const cur = list.length ? list[i % list.length] : null;
  const next = list.length > 1 ? [1, 2].map((k) => list[(i + k) % list.length]) : [];
  return (
    <div className="so-tv" style={{ ["--accent" as string]: info.accent }}>
      <header>
        {info.logo ? <img src={info.logo} alt={info.company} /> : <b>{info.company}</b>}
        <span>Shoutouts</span>
      </header>
      <main>
        <section className="so-tv-main">
          {cur ? <ShoutCard key={cur.id + i} s={cur} big /> : <h2>Be the first to give a shoutout this month.</h2>}
          <div className="so-tv-next">{next.map((s) => <ShoutCard key={s.id + i} s={s} />)}</div>
        </section>
        <aside>
          {info.board && <Scoreboard b={info.board} big />}
          {qr && (
            <div className="so-tv-qr">
              <img src={qr} alt="QR code to give a shoutout" />
              <b>Scan to recognize a coworker</b>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
