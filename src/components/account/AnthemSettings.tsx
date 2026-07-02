"use client";

/**
 * AnthemSettings — a user's personal walk-up anthem (lives under the Theme tab,
 * next to the brand theme; it's a personal-profile setting, not a streamer one).
 *
 * The user picks a stream-safe track + a 10–15s in-point and toggles whether it
 * plays. It only ever fires on a channel where the streamer has ALSO enabled
 * walk-up anthems (see ChannelAnthemSettings) — true dual-consent.
 *
 * The catalog is provider-fed and currently empty (StreamBeats licensing is
 * being finalized), so the picker shows a "coming soon" state but the opt-in
 * toggle works today.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, RangeSlider, Select, Switch } from "@empac/cascadeds";
import {
  ANTHEM_MAX_DURATION_MS,
  ANTHEM_MIN_DURATION_MS,
  type AnthemTrack,
  type UserAnthem,
} from "@/lib/anthems/types";

const MIN_DUR_SEC = ANTHEM_MIN_DURATION_MS / 1000;
const MAX_DUR_SEC = ANTHEM_MAX_DURATION_MS / 1000;

export function AnthemSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<AnthemTrack[]>([]);

  const [enabled, setEnabled] = useState(true);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [startSec, setStartSec] = useState(0);
  const [durationSec, setDurationSec] = useState(MAX_DUR_SEC);
  const [volume, setVolume] = useState(0.8);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/anthem", { cache: "no-store" });
      if (!res.ok) return;
      const b = (await res.json()) as { anthem: UserAnthem | null; catalog: AnthemTrack[] };
      setCatalog(b.catalog ?? []);
      if (b.anthem) {
        setEnabled(b.anthem.enabled);
        setTrackId(b.anthem.trackId);
        setStartSec(Math.round(b.anthem.startMs / 1000));
        setDurationSec(Math.round(b.anthem.durationMs / 1000));
        setVolume(b.anthem.volume);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function touch<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/anthem", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId,
          startMs: startSec * 1000,
          durationMs: durationSec * 1000,
          volume,
          enabled,
        }),
      });
      if (!res.ok) {
        setError("Couldn't save your anthem. Try again.");
        return;
      }
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  const hasCatalog = catalog.length > 0;

  return (
    <div className="account-card" style={{ marginTop: "var(--spacing-24)" }}>
      <h2 className="account-tab__heading">Walk-Up Anthem</h2>
      <p className="account-tab__intro">
        Your personal, MLB-style walk-up song. Pick a stream-safe track and a
        10–15&nbsp;second moment, and it plays when you show up on a streamer&apos;s
        channel — but only when <em>both</em> you and that streamer have anthems
        switched on.
      </p>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      ) : (
        <>
          <Switch
            checked={enabled}
            onChange={(e) => touch(setEnabled)(e.target.checked)}
            label="Play my walk-up anthem on streams"
          />

          {!hasCatalog ? (
            <div style={{ marginTop: "var(--spacing-16)" }}>
              <Alert variant="info">
                The anthem catalog is on the way — we&apos;re finalizing stream-safe
                music licensing. Leave this on and you&apos;ll be able to pick your
                track the moment it goes live.
              </Alert>
            </div>
          ) : (
            <div className="anthem-fields">
              <label className="anthem-field">
                <span className="anthem-field__label">Track</span>
                <Select
                  value={trackId ?? ""}
                  onChange={(v) => touch(setTrackId)((v as string) || null)}
                  options={[
                    { value: "", label: "— Choose a track —" },
                    ...catalog.map((t) => ({
                      value: t.id,
                      label: t.artist ? `${t.title} — ${t.artist}` : t.title,
                    })),
                  ]}
                />
              </label>

              <label className="anthem-field">
                <span className="anthem-field__label">Start at (seconds)</span>
                <Input
                  type="number"
                  min={0}
                  size="small"
                  value={startSec}
                  onChange={(e) => touch(setStartSec)(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>

              <div className="anthem-field">
                <span className="anthem-field__label">Clip length: {durationSec}s</span>
                <RangeSlider
                  min={MIN_DUR_SEC}
                  max={MAX_DUR_SEC}
                  value={durationSec}
                  onChange={touch(setDurationSec)}
                />
              </div>

              <div className="anthem-field">
                <span className="anthem-field__label">Volume: {Math.round(volume * 100)}%</span>
                <RangeSlider
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={touch(setVolume)}
                />
              </div>
            </div>
          )}

          <div style={{ marginTop: "var(--spacing-20)" }}>
            <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
              Save anthem
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
