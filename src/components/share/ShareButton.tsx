"use client";

/**
 * One Share button for a result (Britton's picks, 2026-10-19,
 * https://claude.ai/artifact/9JxKKcAJj1L8m5pZgqg7kD). The card is made as soon as the end screen
 * shows (POST /api/share, then its picture), because a browser only opens its share sheet right
 * after a tap: tapping Share hands the picture, the squares and the link to the phone's (or the
 * computer's) own share sheet. Where there isn't one, our share window opens: the card and a
 * button per place, Copy text and Save picture. Phones get the tall card (stories), computers
 * the wide one.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, Modal } from "@empac/cascadeds";
import {
  IconBrandBluesky, IconBrandDiscord, IconBrandFacebook, IconBrandReddit, IconBrandThreads, IconBrandWhatsapp, IconBrandX, IconCopy, IconDownload, IconShare,
} from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { guestRequestId } from "@/components/originals/DailyBoard";
import { EVENTS, track } from "@/lib/analytics/events";
import type { ShareMade, ShareRequest } from "@/lib/share/types";
import "@/styles/share.css";

const noop = () => () => {};
/** A phone or tablet (a finger, not a mouse): the tall card, made for stories. */
const coarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

interface Card { made: ShareMade; file: File | null }

/** Makes the card ahead of the tap. Null request = nothing to share yet. */
function useShareCard(request: ShareRequest | null): Card | null {
  const key = request ? JSON.stringify(request) : "";
  const [card, setCard] = useState<{ key: string; card: Card } | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void (async () => {
      const res = await fetch("/api/share", { method: "POST", headers: { "Content-Type": "application/json", "x-daily-guest": guestRequestId() }, body: key }).catch(() => null);
      if (!res?.ok) return;
      const made = (await res.json()) as ShareMade;
      const size = coarse() ? "tall" : "wide";
      const blob = await fetch(`/r/${made.code}/card?size=${size}&v=${made.version}`).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
      const file = blob ? new File([blob], `gameshuffle-${size === "tall" ? "story" : "card"}.png`, { type: "image/png" }) : null;
      if (alive) setCard({ key, card: { made, file } });
    })();
    return () => { alive = false; };
  }, [key]);
  return card?.key === key ? card.card : null;
}

export function ShareButton({ request, text, game, fallbackUrl, title = "My GameShuffle result", label = "Share", variant = "primary", trigger }: {
  /** What to make the card from; null while the game isn't finished. */
  request: ShareRequest | null;
  /** The squares and words to go with it, ending in the link it's given. */
  text: (url: string) => string;
  /** For analytics: shuffle, dex, fire, weekly, day. */
  game: string;
  /** Where the link points when the card couldn't be made (the game's page). */
  fallbackUrl: string;
  title?: string;
  label?: string;
  variant?: "primary" | "secondary";
  /** Draws its own control in place of the Share button (the profile's Supporter badge). */
  trigger?: (share: () => void) => ReactNode;
}) {
  const toast = useToast();
  const card = useShareCard(request);
  const [open, setOpen] = useState(false);
  const url = card?.made.url ?? fallbackUrl;
  const fullText = useMemo(() => text(url), [text, url]);

  const share = useCallback(async () => {
    const file = card?.file ?? null;
    if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      track(EVENTS.shareOpened, { game, via: "sheet" });
      try {
        await navigator.share({ files: [file], text: fullText, title });
        track(EVENTS.shareSent, { game, place: "sheet" });
      } catch (e) {
        // Closing the sheet is fine; anything else falls back to our window.
        if ((e as Error)?.name !== "AbortError") setOpen(true);
      }
      return;
    }
    // A phone whose browser shares text but not pictures.
    if (!file && coarse() && typeof navigator.share === "function") {
      track(EVENTS.shareOpened, { game, via: "sheet" });
      try { await navigator.share({ text: fullText, title }); track(EVENTS.shareSent, { game, place: "sheet" }); } catch (e) { if ((e as Error)?.name !== "AbortError") setOpen(true); }
      return;
    }
    track(EVENTS.shareOpened, { game, via: "window" });
    setOpen(true);
  }, [card, fullText, game, title]);

  return (
    <>
      {trigger ? trigger(() => void share()) : <Button variant={variant} iconBefore={IconShare} onClick={() => void share()}>{label}</Button>}
      <ShareWindow open={open} onClose={() => setOpen(false)} card={card} url={url} text={fullText} title={title} game={game} onCopied={(m) => toast.success(m)} onFailed={(m) => toast.error(m)} />
    </>
  );
}

const enc = encodeURIComponent;

/** Where there's no share sheet: the card, a button per place, Copy text and Save picture. */
function ShareWindow({ open, onClose, card, url, text, title, game, onCopied, onFailed }: {
  open: boolean; onClose: () => void; card: Card | null; url: string; text: string; title: string; game: string;
  onCopied: (msg: string) => void; onFailed: (msg: string) => void;
}) {
  // The CDS Modal portals to the body: only after hydration.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return null;
  const go = (place: string, href: string) => {
    track(EVENTS.shareSent, { game, place });
    window.open(href, "_blank", "noopener,noreferrer");
  };
  const copy = (place: string, msg: string) => navigator.clipboard.writeText(text).then(
    () => { track(EVENTS.shareSent, { game, place }); onCopied(msg); },
    () => onFailed("Couldn't copy. Try again."),
  );
  const save = () => {
    if (!card) return;
    track(EVENTS.shareSent, { game, place: "save" });
    const a = document.createElement("a");
    a.href = `/r/${card.made.code}/card?size=${coarse() ? "tall" : "wide"}&v=${card.made.version}&download=1`;
    a.download = "";
    document.body.append(a);
    a.click();
    a.remove();
  };
  const places: { label: string; icon: typeof IconShare; on: () => void }[] = [
    { label: "X", icon: IconBrandX, on: () => go("x", `https://x.com/intent/post?text=${enc(text)}`) },
    { label: "Facebook", icon: IconBrandFacebook, on: () => go("facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`) },
    { label: "Threads", icon: IconBrandThreads, on: () => go("threads", `https://www.threads.net/intent/post?text=${enc(text)}`) },
    { label: "Bluesky", icon: IconBrandBluesky, on: () => go("bluesky", `https://bsky.app/intent/compose?text=${enc(text)}`) },
    { label: "WhatsApp", icon: IconBrandWhatsapp, on: () => go("whatsapp", `https://wa.me/?text=${enc(text)}`) },
    { label: "Reddit", icon: IconBrandReddit, on: () => go("reddit", `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(title)}`) },
    { label: "Discord", icon: IconBrandDiscord, on: () => void copy("discord", "Copied. Paste it in Discord: the link shows your card.") },
    { label: "Copy text", icon: IconCopy, on: () => void copy("copy", "Copied") },
  ];
  return (
    <Modal isOpen={open} onClose={onClose} title="Share your result" size="medium">
      <div className="share-window">
        {card
          // eslint-disable-next-line @next/next/no-img-element -- our own drawn card
          ? <img className="share-window__card" src={`/r/${card.made.code}/card?size=wide&v=${card.made.version}`} alt={card.made.alt} width={1200} height={630} />
          : <p className="share-window__note">Your picture isn&apos;t ready, so this shares your squares and the link.</p>}
        <div className="share-window__places" role="group" aria-label="Share to">
          {places.map((p) => <Button key={p.label} variant="secondary" iconBefore={p.icon} onClick={p.on}>{p.label}</Button>)}
          {card && <Button variant="secondary" iconBefore={IconDownload} onClick={save}>Save picture</Button>}
        </div>
        <p className="share-window__note">Instagram, TikTok and Snapchat: save the picture and add it to your story.</p>
      </div>
    </Modal>
  );
}
