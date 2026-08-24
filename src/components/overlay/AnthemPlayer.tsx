"use client";

/**
 * AnthemPlayer — plays a viewer's walk-up anthem clip on the OBS overlay and
 * shows a small "now playing" card. Fed by an `anthem`-type overlay event; the
 * event's ttl removes it after the clip. Autoplay-with-sound works in the OBS
 * browser source (it allows autoplay); a normal browser may gate it until a
 * user gesture.
 */

import { useEffect, useRef } from "react";

export interface AnthemEventPayload {
  audioUrl: string;
  startMs: number;
  durationMs: number;
  volume: number;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  attribution: string | null;
  viewerName: string;
}

export function AnthemPlayer({ payload }: { payload: AnthemEventPayload }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, payload.volume ?? 1));
    const startSeconds = (payload.startMs ?? 0) / 1000;
    const begin = () => {
      try {
        audio.currentTime = startSeconds;
      } catch {
        /* currentTime before metadata — the loadedmetadata handler retries */
      }
      audio.play().catch(() => {});
    };
    if (audio.readyState >= 1) begin();
    else audio.addEventListener("loadedmetadata", begin, { once: true });

    const stop = window.setTimeout(() => audio.pause(), payload.durationMs ?? 15000);
    return () => {
      window.clearTimeout(stop);
      audio.pause();
    };
  }, [payload]);

  return (
    <div className="gs-anthem">
      {payload.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="gs-anthem__art" src={payload.artworkUrl} alt="" />
      ) : (
        <div className="gs-anthem__art gs-anthem__art--note" aria-hidden>♪</div>
      )}
      <div className="gs-anthem__text">
        <div className="gs-anthem__viewer">🎵 {payload.viewerName} is here</div>
        <div className="gs-anthem__title">
          {payload.title}
          {payload.artist ? ` — ${payload.artist}` : ""}
        </div>
        {payload.attribution ? <div className="gs-anthem__attr">{payload.attribution}</div> : null}
      </div>
      <audio ref={audioRef} src={payload.audioUrl} preload="auto" />
    </div>
  );
}
