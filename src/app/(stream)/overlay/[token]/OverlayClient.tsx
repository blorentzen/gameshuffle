"use client";

/**
 * Client overlay: polls /api/twitch/overlay/[token]/latest every 2s,
 * detects new broadcaster shuffles via the createdAt timestamp, and
 * animates a card on for ~8 seconds before fading out.
 *
 * Polling at 2s is the sweet spot: 0–2s perceived latency on stream,
 * ~30 requests per active overlay per minute. If we ever need real-time,
 * Supabase Realtime broadcast on a per-connection channel is the upgrade
 * path — no schema change required.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getImagePath } from "@/lib/images";
import "@/styles/overlay.css";

const POLL_INTERVAL_MS = 2000;
const SHOW_DURATION_MS = 8000;

interface ComboImage {
  name: string;
  img: string;
}

interface ComboPayload {
  character?: ComboImage;
  vehicle?: ComboImage;
  wheels?: ComboImage;
  glider?: ComboImage;
}

interface ShufflePayload {
  id: string;
  displayName: string;
  combo: ComboPayload | null;
  createdAt: string;
}

interface ApiResponse {
  ok: true;
  broadcaster: string | null;
  session: { id: string; randomizerSlug: string } | null;
  shuffle: ShufflePayload | null;
}

export function OverlayClient({ token }: { token: string }) {
  const [active, setActive] = useState<ShufflePayload | null>(null);
  const [phase, setPhase] = useState<"hidden" | "entering" | "holding" | "leaving">("hidden");
  const lastSeenRef = useRef<string | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);

  const showShuffle = useCallback((shuffle: ShufflePayload) => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);

    setActive(shuffle);
    // Force a fresh enter even if we were already showing — short hidden tick
    setPhase("hidden");
    window.setTimeout(() => setPhase("entering"), 20);
    window.setTimeout(() => setPhase("holding"), 500);
    fadeTimerRef.current = window.setTimeout(
      () => setPhase("leaving"),
      SHOW_DURATION_MS - 500
    );
    hideTimerRef.current = window.setTimeout(() => {
      setPhase("hidden");
      setActive(null);
    }, SHOW_DURATION_MS);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const url = new URL(
          `/api/twitch/overlay/${encodeURIComponent(token)}/latest`,
          window.location.origin
        );
        if (lastSeenRef.current) url.searchParams.set("since", lastSeenRef.current);
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (data.shuffle && data.shuffle.createdAt !== lastSeenRef.current) {
          lastSeenRef.current = data.shuffle.createdAt;
          showShuffle(data.shuffle);
        }
      } catch {
        // Network blips — ignore; next tick will catch up.
      }
    };

    // Prime the lastSeen marker so we don't animate the most recent
    // historical shuffle on first load.
    const prime = async () => {
      try {
        const url = new URL(
          `/api/twitch/overlay/${encodeURIComponent(token)}/latest`,
          window.location.origin
        );
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as ApiResponse;
        if (data.shuffle) lastSeenRef.current = data.shuffle.createdAt;
      } catch {
        // ignore
      }
    };

    let timer: number | undefined;
    prime().finally(() => {
      if (cancelled) return;
      timer = window.setInterval(poll, POLL_INTERVAL_MS);
    });

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    };
  }, [token, showShuffle]);

  if (!active) return null;

  const slots: ComboImage[] = [active.combo?.character, active.combo?.vehicle, active.combo?.wheels, active.combo?.glider]
    .filter((s): s is ComboImage => !!s && !!s.img && s.name !== "N/A");

  return (
    <div className={`gs-overlay gs-overlay--${phase}`}>
      <div className="gs-overlay__card">
        <div className="gs-overlay__header">
          <span className="gs-overlay__dice">🎲</span>
          <span className="gs-overlay__name">{active.displayName}</span>
          <span className="gs-overlay__verb">drew</span>
        </div>
        <div className="gs-overlay__slots">
          {slots.map((slot, i) => (
            <div key={i} className="gs-overlay__slot">
              <div className="gs-overlay__slot-img">
                <Image
                  src={getImagePath(slot.img)}
                  alt={slot.name}
                  width={120}
                  height={120}
                  unoptimized
                />
              </div>
              <div className="gs-overlay__slot-name">{slot.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
