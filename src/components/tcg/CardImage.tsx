"use client";

import { useCallback, useState } from "react";
import type { TcgCardImages } from "@/lib/scrydex/types";

/**
 * Renders a TCG card thumbnail from a Scrydex image URL (default image path,
 * `SELF_HOST_IMAGES = false`). Spec Phase 5:
 *   - URLs come straight from the card payload — NEVER construct a URL.
 *   - `small` / `medium` only, never `large` (thumbnail-scale ID, not
 *     print-resolution reproduction).
 *   - placeholder while loading → retry-once on error → static fallback tile
 *     on repeated failure (assume the URL can 404 / rate-limit).
 *   - no download/export affordance (draggable off; no save button anywhere).
 */

type Size = "small" | "medium";

export function CardImage({
  images,
  name,
  size = "small",
  className,
}: {
  images: TcgCardImages | null | undefined;
  name: string;
  size?: Size;
  className?: string;
}) {
  // Prefer requested size; fall back to the other thumbnail size, never large.
  const url =
    (size === "medium" ? images?.medium : images?.small) ??
    images?.small ??
    images?.medium ??
    null;

  const [status, setStatus] = useState<"loading" | "ok" | "error">(
    url ? "loading" : "error",
  );
  // Cache-busting retry token: bump once on first error to force one reload.
  const [retry, setRetry] = useState(0);

  // Ref callback so a cached image that finishes before React attaches
  // `onLoad` (very common) still resolves to "ok" — otherwise it stays hidden.
  const imgRef = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0) setStatus("ok");
  }, []);

  if (!url || status === "error") {
    return (
      <div
        className={`tcg-card-img tcg-card-img--fallback ${className ?? ""}`}
        role="img"
        aria-label={name}
        title={name}
      >
        <span className="tcg-card-img__fallback-name">{name}</span>
      </div>
    );
  }

  return (
    <div className={`tcg-card-img ${className ?? ""}`}>
      {status === "loading" ? (
        <div className="tcg-card-img__placeholder" aria-hidden="true" />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- cross-origin
          Scrydex URL; Next/Image would require per-host remotePatterns and
          we must render the URL verbatim (never construct/transform it). */}
      <img
        ref={imgRef}
        src={retry ? `${url}${url.includes("?") ? "&" : "?"}r=${retry}` : url}
        alt={name}
        loading="lazy"
        draggable={false}
        onLoad={() => setStatus("ok")}
        onError={() => {
          if (retry === 0) {
            // retry once
            setRetry(1);
            setStatus("loading");
          } else {
            setStatus("error");
          }
        }}
        className="tcg-card-img__img"
        style={{ opacity: status === "ok" ? 1 : 0 }}
      />
    </div>
  );
}
