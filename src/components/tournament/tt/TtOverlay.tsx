"use client";

/**
 * The time trial piece on a streamer's GameShuffle overlay (TT picks 10A): the tournament's name, the track or
 * round with the time left, and the standings with the streamer's row lit up (or their own match in Swiss and
 * brackets decided by time trial). Shows only while the streamer is in a running time trial tournament
 * (overlayServer.ttPieceFor); reads its own small view every 3 seconds while the overlay is visible. A changed
 * time pops in. Mid-left by default: Mario Kart's time trial shows the timer and laps top right.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { TT_OVERLAY_SAMPLE, type TtOverlayData } from "@/lib/tournaments/tt/overlay";
import "@/styles/tt-overlay.css";

function useTtOverlay(id: string | null, participantId: string | null): (TtOverlayData & { skew: number }) | null {
  const [data, setData] = useState<(TtOverlayData & { skew: number }) | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const q = participantId ? `?p=${participantId}` : "";
      const res = await fetch(`/api/tournament/${id}/tt/overlay${q}`, { cache: "no-store" }).catch(() => null);
      if (!alive) return;
      if (res?.status === 404) { setData(null); return; }
      const j = res?.ok ? ((await res.json().catch(() => null)) as TtOverlayData | null) : null;
      if (alive && j) setData({ ...j, skew: j.now - Date.now() });
    };
    void load();
    const iv = window.setInterval(load, 3000);
    return () => { alive = false; window.clearInterval(iv); };
  }, [id, participantId]);
  return data;
}

/** "23:41 left", "1:02:13 left", "3 days left", or "Time's up". */
function leftText(ms: number): string {
  if (ms <= 0) return "Time's up";
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400);
  if (d >= 1) return `${d} day${d === 1 ? "" : "s"} left`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h ? `${h}:${pad(m)}` : m}:${pad(sec)} left`;
}

function Countdown({ until, skew }: { until: string; skew: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);
  return <b className="tto__left">{leftText(Date.parse(until) - (now + skew))}</b>;
}

export function TtOverlay({ piece, sample, style }: { piece?: { id: string; participantId: string | null } | null; sample?: boolean; style?: CSSProperties }) {
  const live = useTtOverlay(sample ? null : piece?.id ?? null, piece?.participantId ?? null);
  const data = sample ? { ...TT_OVERLAY_SAMPLE, skew: 0 } : live;
  if (!data || !data.rows.length) return null;
  return (
    <div className="tto" style={style}>
      <div className="tto__card">
        <div className="tto__top">
          <span className="tto__title">{data.title}</span>
          <span className="tto__head">
            <b>{data.head}</b>
            {sample ? <b className="tto__left">23:41 left</b> : data.closesAt && <Countdown until={data.closesAt} skew={data.skew} />}
          </span>
        </div>
        <ol className="tto__rows">
          {data.rows.map((r) => (
            <li key={r.key} className={`tto__row${r.you ? " is-you" : ""}${r.cut ? " is-cut" : ""}${r.place ? "" : " tto__row--match"}`}>
              {r.place && <span className="tto__place">{r.place}</span>}
              <span className="tto__name">{r.name}</span>
              <b key={r.value} className="tto__val">{r.value}</b>
            </li>
          ))}
        </ol>
        {data.line && <p className="tto__line">{data.line}</p>}
      </div>
    </div>
  );
}
