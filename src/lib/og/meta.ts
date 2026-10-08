import type { Metadata } from "next";
import { safeTimeZone } from "@/lib/time/gsClock";

/**
 * The share half of a page's metadata. A page's `openGraph` replaces the root
 * layout's whole (Next merges per key, not per field), so siteName, locale and
 * type have to be restated or link previews lose the site name. The image
 * comes from the route's opengraph-image / twitter-image files.
 */
export function shareMeta(o: { title: string; description: string; path: string; canonical?: boolean }): Pick<Metadata, "openGraph" | "twitter" | "alternates"> {
  return {
    ...(o.canonical === false ? {} : { alternates: { canonical: o.path } }),
    openGraph: { siteName: "GameShuffle", locale: "en_US", type: "website", url: o.path, title: o.title, description: o.description },
    twitter: { card: "summary_large_image", title: o.title, description: o.description },
  };
}

/** Trim a description to what previews show, on a word boundary. */
export function previewText(s: string, max = 180): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 30)).trimEnd()}…`;
}

/** "Sat, Oct 31 · 7:00 PM PDT" in the given zone (Pacific when unknown). */
export function cardDate(iso: string | null | undefined, timeZone?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tz = safeTimeZone(timeZone);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short" });
  return `${day} · ${time}`;
}
