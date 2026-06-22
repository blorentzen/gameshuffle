"use client";

/**
 * ThemeTab — a streamer picks a brand theme for their channel.
 *
 * The brand theme re-skins the streamer's *customer-facing* surfaces (OBS
 * overlay + public /live page) via `--brand-*` CSS vars — it does NOT change
 * the account dashboard (that stays on the user's own light/dark preference).
 * Presets only for v1; a custom-color builder is a planned follow-on.
 *
 * Gated on community presence (Twitch connected) like the other streamer
 * tabs — a 404 from the API renders a connect CTA.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button } from "@empac/cascadeds";
import {
  BRAND_THEMES,
  DEFAULT_BRAND_THEME_ID,
  brandCssVars,
  getBrandTheme,
} from "@/lib/theme/brand";

interface ThemeMeta {
  liveSlug: string | null;
  profileUsername: string | null;
  isPublic: boolean;
}

export function ThemeTab() {
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(DEFAULT_BRAND_THEME_ID);
  const [saved, setSaved] = useState(DEFAULT_BRAND_THEME_ID);
  const [meta, setMeta] = useState<ThemeMeta>({
    liveSlug: null,
    profileUsername: null,
    isPublic: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/profile-theme", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { brandTheme: string } & ThemeMeta;
      setSelected(body.brandTheme);
      setSaved(body.brandTheme);
      setMeta({
        liveSlug: body.liveSlug,
        profileUsername: body.profileUsername,
        isPublic: body.isPublic,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/profile-theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandTheme: selected }),
      });
      if (!res.ok) {
        setError("Couldn't save your theme. Try again.");
        return;
      }
      setSaved(selected);
    } finally {
      setSaving(false);
    }
  }

  const preview = getBrandTheme(selected);

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Theme</h2>
      <p className="account-tab__intro">
        Pick a theme for your <strong>public profile</strong>. If you stream, it
        also re-skins your OBS overlay and your live page. Your own dashboard
        keeps its light/dark preference.
      </p>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      ) : (
        <>
          <div className="brand-gallery" role="radiogroup" aria-label="Brand theme">
            {BRAND_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`brand-chip${selected === t.id ? " is-active" : ""}`}
                onClick={() => setSelected(t.id)}
                aria-pressed={selected === t.id}
              >
                <span className="brand-chip__swatch" style={{ background: t.gradient }}>
                  <span className="brand-chip__accent" style={{ background: t.accent }} />
                </span>
                <span className="brand-chip__name">{t.name}</span>
              </button>
            ))}
          </div>

          <div className="brand-preview-row" style={brandCssVars(preview)}>
            {(["light", "dark"] as const).map((mode) => (
              <div key={mode} className={`brand-preview brand-preview--${mode}`}>
                <div className="brand-preview__bar">
                  <span className="brand-preview__dot" aria-hidden="true" />
                  Your channel — live
                </div>
                <div className="brand-preview__body">
                  <span className="brand-preview__pill">Now playing</span>
                  <span className="brand-preview__btn">Join the lobby</span>
                </div>
                <span className="brand-preview__mode">{mode} mode</span>
              </div>
            ))}
          </div>

          {(meta.liveSlug || (meta.isPublic && meta.profileUsername)) && (
            <div className="brand-preview-links">
              <span>See it on:</span>
              {meta.liveSlug && (
                <Link href={`/live/${meta.liveSlug}`} target="_blank" rel="noreferrer">
                  Your live page ↗
                </Link>
              )}
              {meta.isPublic && meta.profileUsername && (
                <Link href={`/u/${meta.profileUsername}`} target="_blank" rel="noreferrer">
                  Your public profile ↗
                </Link>
              )}
            </div>
          )}

          <div style={{ marginTop: "var(--spacing-20)" }}>
            <Button
              variant="primary"
              loading={saving}
              disabled={selected === saved}
              onClick={() => void save()}
            >
              Save theme
            </Button>
            {selected !== saved ? (
              <span
                style={{
                  marginLeft: "var(--spacing-12)",
                  color: "var(--text-tertiary)",
                  fontSize: "var(--font-size-14)",
                }}
              >
                Save to apply it to your live pages.
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
