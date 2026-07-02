"use client";

/**
 * ChannelAnthemSettings — the streamer's policy for walk-up anthems on THEIR
 * channel (Pro feature). The streamer owns this side because their channel
 * bears the noise + any risk: master enable, which roles get a walk-up, the
 * trigger, volume, cooldown, and whether to allow non-cleared/custom anthems.
 *
 * Paired with AnthemSettings (the viewer's personal anthem) — both must be on
 * for anything to play.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Checkbox, Input, RangeSlider, Select, Switch } from "@empac/cascadeds";
import {
  ANTHEM_MAX_DURATION_MS,
  ANTHEM_MIN_DURATION_MS,
  type AnthemRole,
  type AnthemTrigger,
  type ChannelAnthemPolicy,
} from "@/lib/anthems/types";

const MIN_DUR_SEC = ANTHEM_MIN_DURATION_MS / 1000;
const MAX_DUR_SEC = ANTHEM_MAX_DURATION_MS / 1000;

const TRIGGERS: { value: AnthemTrigger; label: string }[] = [
  { value: "first_chat", label: "First chat of the stream" },
  { value: "session_join", label: "When they join a session" },
  { value: "channel_points", label: "Channel-point redemption" },
  { value: "manual", label: "Manual — I trigger it" },
];

const ROLES: { value: AnthemRole; label: string }[] = [
  { value: "subscriber", label: "Subscribers" },
  { value: "vip", label: "VIPs" },
  { value: "moderator", label: "Moderators" },
  { value: "mvp", label: "MVP" },
  { value: "everyone", label: "Everyone" },
];

export function ChannelAnthemSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [trigger, setTrigger] = useState<AnthemTrigger>("first_chat");
  const [roles, setRoles] = useState<AnthemRole[]>(["subscriber", "vip", "moderator"]);
  const [allowCustom, setAllowCustom] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [maxDurationSec, setMaxDurationSec] = useState(MAX_DUR_SEC);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/anthem/policy", { cache: "no-store" });
      if (!res.ok) return;
      const { policy } = (await res.json()) as { policy: ChannelAnthemPolicy };
      setEnabled(policy.enabled);
      setTrigger(policy.trigger);
      setRoles(policy.eligibleRoles);
      setAllowCustom(policy.allowCustom);
      setVolume(policy.volume);
      setCooldownSeconds(policy.cooldownSeconds);
      setMaxDurationSec(Math.round(policy.maxDurationMs / 1000));
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

  function toggleRole(r: AnthemRole, on: boolean) {
    setRoles((prev) => (on ? [...new Set([...prev, r])] : prev.filter((x) => x !== r)));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/anthem/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          trigger,
          eligibleRoles: roles,
          allowCustom,
          volume,
          cooldownSeconds,
          maxDurationMs: maxDurationSec * 1000,
        }),
      });
      if (!res.ok) {
        setError("Couldn't save your channel settings. Try again.");
        return;
      }
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Walk-Up Anthems</h2>
      <p className="account-tab__intro">
        Let your community walk out to their own song. Viewers set a personal
        anthem on their profile; you decide whether it plays here, who gets one,
        and how loud. <strong>Pro feature.</strong>
      </p>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      ) : (
        <>
          <Switch
            checked={enabled}
            onChange={(e) => touch(setEnabled)(e.target.checked)}
            label="Allow walk-up anthems on my channel"
          />

          <div className="anthem-fields" aria-disabled={!enabled} style={{ opacity: enabled ? 1 : 0.55 }}>
            <label className="anthem-field">
              <span className="anthem-field__label">Trigger</span>
              <Select
                value={trigger}
                onChange={(v) => touch(setTrigger)(v as AnthemTrigger)}
                options={TRIGGERS}
              />
              <span className="anthem-field__hint">First-chat is live now; the others are coming soon.</span>
            </label>

            <fieldset className="anthem-field anthem-field--roles">
              <span className="anthem-field__label">Who gets a walk-up</span>
              <div className="anthem-roles">
                {ROLES.map((r) => (
                  <Checkbox
                    key={r.value}
                    label={r.label}
                    checked={roles.includes(r.value)}
                    onChange={(e) => toggleRole(r.value, e.target.checked)}
                  />
                ))}
              </div>
            </fieldset>

            <div className="anthem-field">
              <span className="anthem-field__label">Channel volume: {Math.round(volume * 100)}%</span>
              <RangeSlider
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={touch(setVolume)}
              />
            </div>

            <div className="anthem-field">
              <span className="anthem-field__label">Max clip length: {maxDurationSec}s</span>
              <RangeSlider
                min={MIN_DUR_SEC}
                max={MAX_DUR_SEC}
                value={maxDurationSec}
                onChange={touch(setMaxDurationSec)}
              />
            </div>

            <label className="anthem-field">
              <span className="anthem-field__label">Per-viewer cooldown (seconds)</span>
              <Input
                type="number"
                min={0}
                size="small"
                value={cooldownSeconds}
                onChange={(e) => touch(setCooldownSeconds)(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>

            <div className="anthem-field">
              <Switch
                checked={allowCustom}
                onChange={(e) => touch(setAllowCustom)(e.target.checked)}
                label="Allow non-cleared / custom anthems"
              />
              <span className="anthem-field__hint">
                Off by default. Custom tracks aren&apos;t licensing-cleared and may get
                your VODs muted or DMCA-struck — you&apos;re the one who takes the hit.
              </span>
            </div>
          </div>

          <div style={{ marginTop: "var(--spacing-20)" }}>
            <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
              Save settings
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
