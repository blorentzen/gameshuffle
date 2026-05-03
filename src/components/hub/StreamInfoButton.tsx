"use client";

/**
 * Hub-home "Stream info" CTA — sits next to "New session" in the header.
 *
 * Replaces the previous "Stream context" banner that lived above the
 * filter chips. Surfaces the streamer-facing pieces they need to bring
 * a session online quickly:
 *   - Overlay URL (browser source for OBS) + copy / preview
 *   - Current Twitch channel category (with refresh)
 *   - Future: override Twitch category from inside GS — gated behind a
 *     scope re-auth (`channel:manage:broadcast`) we don't request today.
 *
 * The detected category fetch happens lazily on open so we don't burn a
 * Helix call on every Hub home render.
 */

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Modal } from "@empac/cascadeds";

interface Props {
  /** Streamer's overlay token (`/overlay/[token]`). Null when the
   *  twitch_connections row exists but the token slot is empty —
   *  rare; the modal explains it. */
  overlayToken: string | null;
}

interface DetectedCategory {
  name: string | null;
  slug: string | null;
  supported: boolean;
}

export function StreamInfoButton({ overlayToken }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Stream info
      </Button>
      {open && (
        <StreamInfoModal
          overlayToken={overlayToken}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function StreamInfoModal({
  overlayToken: initialOverlayToken,
  onClose,
}: {
  overlayToken: string | null;
  onClose: () => void;
}) {
  const [detected, setDetected] = useState<DetectedCategory | null>(null);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [overlayCopied, setOverlayCopied] = useState(false);
  const [overlayToken, setOverlayToken] = useState<string | null>(
    initialOverlayToken
  );
  const [regenerating, setRegenerating] = useState(false);
  const [regenMessage, setRegenMessage] = useState<string | null>(null);

  const overlayUrl = overlayToken
    ? `${typeof window !== "undefined" ? window.location.origin : "https://www.gameshuffle.co"}/overlay/${overlayToken}`
    : null;

  const fetchCategory = async () => {
    setLoadingCategory(true);
    setCategoryError(null);
    try {
      const res = await fetch("/api/twitch/category/current", {
        cache: "no-store",
      });
      if (!res.ok) {
        setCategoryError("Couldn't reach Twitch — try again in a moment.");
        return;
      }
      const body = await res.json();
      setDetected({
        name: body.categoryName ?? null,
        slug: body.randomizerSlug ?? null,
        supported: !!body.supported,
      });
    } catch {
      setCategoryError("Couldn't reach Twitch — try again in a moment.");
    } finally {
      setLoadingCategory(false);
    }
  };

  useEffect(() => {
    void fetchCategory();
  }, []);

  const handleCopyOverlay = () => {
    if (!overlayUrl) return;
    void navigator.clipboard.writeText(overlayUrl);
    setOverlayCopied(true);
    window.setTimeout(() => setOverlayCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    if (
      !window.confirm(
        "Regenerate overlay URL? Your current OBS browser source URL will stop working immediately. You'll need to update OBS with the new URL."
      )
    ) {
      return;
    }
    setRegenerating(true);
    setRegenMessage(null);
    try {
      const res = await fetch("/api/twitch/overlay/regenerate", {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok || !body.overlayToken) {
        setRegenMessage(`Regenerate failed: ${body.error || res.statusText}`);
      } else {
        setOverlayToken(body.overlayToken as string);
        setRegenMessage("New URL ready — copy it and update OBS.");
      }
    } catch {
      setRegenMessage("Regenerate failed (network error).");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Stream info" size="medium">
      <div className="hub-stream-info">
        {/* Overlay URL ----------------------------------------------------*/}
        <section className="hub-stream-info__section">
          <header className="hub-stream-info__section-header">
            <h3 className="hub-stream-info__section-title">
              OBS overlay URL
            </h3>
            <p className="hub-stream-info__section-hint">
              Add as a browser source (1920×1080, transparent). Combo cards
              animate on for 8s after every <code>!gs-shuffle</code>.
            </p>
          </header>
          {overlayUrl ? (
            <>
              <div className="hub-stream-info__url">{overlayUrl}</div>
              <div className="hub-stream-info__row">
                <Button variant="secondary" onClick={handleCopyOverlay}>
                  {overlayCopied ? "Copied!" : "Copy URL"}
                </Button>
                <a
                  href={`/overlay/${overlayToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="ghost">Preview ↗</Button>
                </a>
                <Button
                  variant="ghost"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                >
                  {regenerating ? "Regenerating…" : "Regenerate URL"}
                </Button>
                {regenMessage && (
                  <span className="hub-stream-info__caption">
                    {regenMessage}
                  </span>
                )}
              </div>
              <p className="hub-stream-info__caption">
                Treat this URL like a password — anyone with it can watch
                your live shuffle activity. Hit <em>Regenerate URL</em> if
                it ever leaks (accidentally on stream, etc.).
              </p>
            </>
          ) : (
            <Alert variant="info">
              No overlay URL on file yet. Reconnect Twitch from the
              Account page to generate one.
            </Alert>
          )}
        </section>

        {/* Current Twitch category ---------------------------------------*/}
        <section className="hub-stream-info__section">
          <header className="hub-stream-info__section-header">
            <h3 className="hub-stream-info__section-title">
              Current Twitch category
            </h3>
            <p className="hub-stream-info__section-hint">
              GameShuffle binds to whatever your channel is set to when
              you go live. Set it on Twitch first, then start the
              session.
            </p>
          </header>
          {loadingCategory && !detected ? (
            <p className="hub-stream-info__muted">Looking up your channel…</p>
          ) : categoryError ? (
            <Alert variant="error">{categoryError}</Alert>
          ) : detected ? (
            <div className="hub-stream-info__category">
              <div className="hub-stream-info__category-name">
                {detected.name ?? "No category set"}
              </div>
              <div className="hub-stream-info__category-status">
                {detected.supported ? (
                  <Badge variant="success">Supported</Badge>
                ) : detected.name ? (
                  <Badge variant="warning">Not a Mario Kart category</Badge>
                ) : (
                  <Badge variant="default">Unset</Badge>
                )}
              </div>
            </div>
          ) : null}
          <div className="hub-stream-info__row">
            <Button
              variant="ghost"
              onClick={fetchCategory}
              disabled={loadingCategory}
            >
              {loadingCategory ? "Refreshing…" : "Refresh"}
            </Button>
            <a
              href="https://dashboard.twitch.tv/stream-manager/edit"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="ghost">Open Twitch dashboard ↗</Button>
            </a>
          </div>
        </section>

        {/* Override-from-GS — future, scope-gated -----------------------*/}
        <section className="hub-stream-info__section hub-stream-info__section--future">
          <header className="hub-stream-info__section-header">
            <h3 className="hub-stream-info__section-title">
              Set category from GameShuffle
              <Badge variant="default">Coming soon</Badge>
            </h3>
            <p className="hub-stream-info__section-hint">
              We&apos;d love to flip your Twitch category to MK8DX or MKW
              right from this modal. It needs the{" "}
              <code>channel:manage:broadcast</code> scope, which requires
              every existing streamer to reconnect Twitch — we&apos;ll
              roll it out in the next connect-flow update.
            </p>
          </header>
        </section>
      </div>
    </Modal>
  );
}
