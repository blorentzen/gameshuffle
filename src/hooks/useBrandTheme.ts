"use client";

/**
 * useBrandTheme — the signed-in user's saved brand theme, for account-side
 * previews. Fetches `/api/account/profile-theme` once and resolves it to a
 * `BrandTheme` + the `--brand-*` CSS vars to spread onto a preview wrapper, so
 * the Overlay Layout stage / Stream Tools swatches render with the streamer's
 * ACTUAL colors (WYSIWYG with the live overlay) instead of the site default.
 *
 * `vars` is `{}` for the default theme (the site brand already lives on `:root`,
 * so there is nothing to override).
 */

import { useEffect, useState, type CSSProperties } from "react";
import { getBrandTheme, brandCssVars, type BrandTheme } from "@/lib/theme/brand";

export function useBrandTheme(): { theme: BrandTheme; vars: CSSProperties; loading: boolean } {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/account/profile-theme", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!alive) return;
        if (b?.brandTheme) setValue(b.brandTheme as string);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const theme = getBrandTheme(value);
  return { theme, vars: brandCssVars(theme), loading };
}
