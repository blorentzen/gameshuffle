"use client";

/**
 * "Want a live one, or a picture?" (picks 2026-11-04, 4A to 8A). The choice at the top of the studio, and the
 * picture maker: three sizes, the picture as the server draws it (src/lib/mmr/picture.tsx) from the saved card,
 * Share (the site's share sheet or window, with a link that always shows the card as it is now), Save picture
 * and Copy link. Both modes use the same look and pieces. The choice is remembered in this browser.
 */

import { useSyncExternalStore } from "react";
import { Button, Card, Chip } from "@empac/cascadeds";
import { IconBroadcast, IconCopy, IconDownload, IconPhoto, IconShare } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { useToast } from "@/components/toast/ToastProvider";
import { useShare, type ShareSize } from "@/components/share/ShareButton";
import { EVENTS, track } from "@/lib/analytics/events";
import type { PictureSize } from "@/lib/mmr/picture";

export type MakeMode = "live" | "picture";

// ── The remembered choice (localStorage, ?make=picture to open on it) ─────

const KEY = "gs-mmr-make";
const listeners = new Set<() => void>();
function readMode(): MakeMode {
  try {
    if (new URLSearchParams(window.location.search).get("make") === "picture") return "picture";
    return window.localStorage.getItem(KEY) === "picture" ? "picture" : "live";
  } catch {
    return "live";
  }
}
let current: MakeMode | null = null;
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => (current ??= readMode());

export function useMakeMode(): [MakeMode, (m: MakeMode) => void] {
  const mode = useSyncExternalStore(subscribe, snapshot, () => "live" as MakeMode);
  const set = (m: MakeMode) => {
    current = m;
    try { window.localStorage.setItem(KEY, m); } catch { /* private window: the choice lasts this visit */ }
    track(EVENTS.mmrModePicked, { mode: m });
    listeners.forEach((fn) => fn());
  };
  return [mode, set];
}

export function MmrMakePick({ mode, onMode }: { mode: MakeMode; onMode: (m: MakeMode) => void }) {
  const opts: { id: MakeMode; icon: typeof IconPhoto; tone: "blue" | "magenta"; name: string; line: string }[] = [
    { id: "live", icon: IconBroadcast, tone: "blue", name: "Live card", line: "For your stream. It updates after every event." },
    { id: "picture", icon: IconPhoto, tone: "magenta", name: "Picture", line: "A still card to post, send or save." },
  ];
  return (
    <section className="mmr-make" aria-labelledby="mmr-make">
      <h2 id="mmr-make" className="sr-only">What do you want?</h2>
      <div className="mmr-make__opts" role="group" aria-label="Live card or picture">
        {opts.map((o) => (
          <Card key={o.id} variant="outlined" padding="small" interactive selected={mode === o.id} onClick={() => onMode(o.id)} className="mmr-make__opt"
            aria-label={`${o.name}: ${o.line}${mode === o.id ? " Selected." : ""}`}>
            <IconTile icon={o.icon} tone={o.tone} />
            <span className="mmr-make__name">{o.name}</span>
            <span className="mmr-make__line">{o.line}</span>
          </Card>
        ))}
      </div>
    </section>
  );
}

const SIZES: { id: PictureSize; label: string; where: string; w: number; h: number }[] = [
  { id: "square", label: "Square", where: "Instagram, Discord", w: 1080, h: 1080 },
  { id: "wide", label: "Wide", where: "X, Bluesky, link previews", w: 1200, h: 630 },
  { id: "story", label: "Story", where: "Stories, TikTok", w: 1080, h: 1920 },
];
const SHARE_SIZE: Record<PictureSize, ShareSize> = { square: "square", wide: "wide", story: "tall" };

/** The picture maker. `version` changes after each save, so the picture follows the card. Signed in only. */
export function MmrPictureMaker({ lookId, version, name, size, onSize }: {
  lookId: string; version: string | null; name: string; size: PictureSize; onSize: (s: PictureSize) => void;
}) {
  const toast = useToast();
  const s = SIZES.find((x) => x.id === size)!;
  const q = new URLSearchParams({ size, look: lookId, ...(version ? { v: version } : {}) });
  const request = { kind: "mmr" as const, mmr: { look: lookId } };
  const text = (url: string) => `${name ? `${name}'s` : "My"} MMR card on GameShuffle ${url}`;
  const { link, share, window: win } = useShare({ request, text, game: "mmr", fallbackUrl: "https://www.gameshuffle.co/mmr-card", size: SHARE_SIZE[size], heading: "Share your card", title: "My MMR card" });
  const save = () => {
    track(EVENTS.mmrPictureSaved, { size });
    const a = document.createElement("a");
    a.href = `/api/mmr/image?${q}&download=1`;
    a.download = "";
    document.body.append(a);
    a.click();
    a.remove();
  };
  const copy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => toast.success("Link copied. It always shows your card as it is now."), () => toast.error("Couldn't copy. Try again."));
  };
  return (
    <div className="mmr-picture">
      <div className="mmr-picture__sizes" role="group" aria-label="Picture size">
        {SIZES.map((x) => <Chip key={x.id} label={x.label} clickable selected={size === x.id} onClick={() => onSize(x.id)} />)}
        <span className="mmr-studio__note">{s.where}</span>
      </div>
      <div className={`mmr-picture__frame mmr-picture__frame--${size}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn by our own server, sized by CSS */}
        <img src={`/api/mmr/image?${q}`} alt={`Your MMR card as a ${s.label.toLowerCase()} picture`} width={s.w} height={s.h} />
      </div>
      <div className="mmr-picture__actions">
        <Button variant="primary" iconBefore={IconShare} onClick={share}>Share</Button>
        <Button variant="secondary" iconBefore={IconDownload} onClick={save}>Save picture</Button>
        <Button variant="secondary" iconBefore={IconCopy} onClick={copy} disabled={!link}>Copy link</Button>
      </div>
      <p className="mmr-studio__note">The picture is your card as it is now. A shared link always shows your latest card.</p>
      {win}
    </div>
  );
}
