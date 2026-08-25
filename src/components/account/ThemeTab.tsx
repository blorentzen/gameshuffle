"use client";

/**
 * ThemeTab ("Brand & Theme") — set your channel's brand identity.
 *
 * Two modes: pick a built-in preset, or build a custom theme from a Primary +
 * Accent color (gradient + on-color are derived). Either way it re-skins your
 * *customer-facing* surfaces (public profile, and for streamers the OBS overlay,
 * the /live page, and every overlay tool) via `--brand-*` CSS vars — it does NOT
 * change the account dashboard (that stays on your light/dark preference).
 *
 * Custom themes persist as a compact `custom:#primary:#accent` string in the
 * same `profile_theme` column (no schema change); `getBrandTheme` rehydrates it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import {
  BRAND_THEMES,
  DEFAULT_BRAND_THEME_ID,
  brandCssVars,
  getBrandTheme,
  isCustomThemeValue,
  serializeCustomTheme,
} from "@/lib/theme/brand";

type ThemeMode = "preset" | "custom";

interface ThemeMeta {
  liveSlug: string | null;
  profileUsername: string | null;
  isPublic: boolean;
}

export function ThemeTab() {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ThemeMode>("preset");
  const [selected, setSelected] = useState(DEFAULT_BRAND_THEME_ID);
  const [customPrimary, setCustomPrimary] = useState("#2766ec");
  const [customAccent, setCustomAccent] = useState("#7048e8");
  const [saved, setSaved] = useState(DEFAULT_BRAND_THEME_ID);
  const [meta, setMeta] = useState<ThemeMeta>({
    liveSlug: null,
    profileUsername: null,
    isPublic: false,
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/profile-theme", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { brandTheme: string } & ThemeMeta;
      setSaved(body.brandTheme);
      const t = getBrandTheme(body.brandTheme);
      // Seed the color pickers from the saved theme so switching to Customize
      // starts from where the streamer already is, not a cold default.
      setCustomPrimary(t.primary);
      setCustomAccent(t.accent);
      if (isCustomThemeValue(body.brandTheme)) {
        setMode("custom");
        setSelected(DEFAULT_BRAND_THEME_ID);
      } else {
        setMode("preset");
        setSelected(body.brandTheme);
      }
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

  // The value we'd persist for the current UI state.
  const currentValue = useMemo(
    () => (mode === "custom" ? serializeCustomTheme(customPrimary, customAccent) : selected),
    [mode, customPrimary, customAccent, selected],
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/account/profile-theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandTheme: currentValue }),
      });
      if (!res.ok) {
        toast.error("Couldn't save your theme. Try again.");
        return;
      }
      setSaved(currentValue);
      toast.success("Theme saved");
    } finally {
      setSaving(false);
    }
  }

  const preview = getBrandTheme(currentValue);

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Brand &amp; Theme</h2>
      <p className="account-tab__intro">
        Set your channel&rsquo;s brand colors. It re-skins your{" "}
        <strong>public profile</strong>, and if you stream, your OBS overlay, your
        live page, and every overlay tool (timer, bingo, tier list, and more)
        &mdash; all from here. Override a single tool&rsquo;s color in{" "}
        <strong>Stream Tools</strong> if you ever need to. Your own dashboard keeps
        its light/dark preference.
      </p>

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Theme mode"
            style={{
              display: "inline-flex",
              borderRadius: 999,
              border: "1px solid var(--border-default)",
              overflow: "hidden",
              marginBottom: "var(--spacing-20)",
            }}
          >
            {(
              [
                ["preset", "Pick a theme"],
                ["custom", "Customize"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                style={{
                  padding: "6px 16px",
                  fontSize: "var(--font-size-14)",
                  fontWeight: "var(--font-weight-semibold)",
                  cursor: "pointer",
                  border: "none",
                  background: mode === m ? "var(--bg-primary)" : "transparent",
                  color: mode === m ? "var(--text-on-primary)" : "var(--text-secondary)",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "preset" ? (
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
          ) : (
            <div
              style={{
                display: "flex",
                gap: "var(--spacing-24)",
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              <ColorPicker
                label="Primary"
                hint="Headers, buttons, key accents"
                value={customPrimary}
                onChange={setCustomPrimary}
              />
              <ColorPicker
                label="Accent"
                hint="Secondary highlights"
                value={customAccent}
                onChange={setCustomAccent}
              />
              <p
                style={{
                  flexBasis: "100%",
                  margin: 0,
                  fontSize: "var(--font-size-12)",
                  color: "var(--text-tertiary)",
                }}
              >
                Your gradient and text color are matched automatically. Check the
                preview below.
              </p>
            </div>
          )}

          <div className="brand-preview-row" style={brandCssVars(preview)}>
            {(["light", "dark"] as const).map((mode) => (
              <div key={mode} className={`brand-preview brand-preview--${mode}`}>
                <div className="brand-preview__bar">
                  <span className="brand-preview__dot" aria-hidden="true" />
                  Your channel: live
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
              disabled={currentValue === saved}
              onClick={() => void save()}
            >
              Save theme
            </Button>
            {currentValue !== saved ? (
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

/** A labeled swatch + native color input for the custom builder. */
function ColorPicker({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--spacing-12)",
        cursor: "pointer",
      }}
    >
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 44,
          height: 44,
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          background: "none",
          padding: 0,
          cursor: "pointer",
        }}
      />
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: "var(--font-size-14)", fontWeight: "var(--font-weight-semibold)" }}>
          {label}
        </span>
        <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{hint}</span>
        <span
          style={{
            fontSize: "var(--font-size-12)",
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono, monospace)",
            textTransform: "uppercase",
          }}
        >
          {value}
        </span>
      </span>
    </label>
  );
}
