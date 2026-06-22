"use client";

/**
 * WheelsTab — Pro streamers manage their overlay wheels here.
 *
 * Lists the streamer's wheels, with a modal editor for name + segments
 * (label / optional weight / optional color) + a default toggle. Persists
 * to `/api/account/wheels` (Pro-gated; a 403 renders a Pro upsell). The
 * default wheel is the one `!spin` uses; the Hub can pick any wheel.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  FormField,
  Input,
  Modal,
  Select,
  Switch,
} from "@empac/cascadeds";
import { WheelStylePicker } from "@/components/wheel/WheelStylePicker";
import {
  DEFAULT_FILL_STYLE,
  DEFAULT_THEME_ID,
  type FillStyle,
} from "@/lib/wheel/themes";
import { getBrandTheme } from "@/lib/theme/brand";
import type {
  ContributionMode,
  ResetMode,
  Wheel,
  WheelContribution,
  WheelSegment,
} from "@/lib/wheels/types";

interface DraftSegment {
  label: string;
  weight: string; // kept as string for the input; coerced on save
}

interface Draft {
  id?: string;
  name: string;
  segments: DraftSegment[];
  isDefault: boolean;
  themeId: string;
  fillStyle: FillStyle;
  mode: ContributionMode;
  max: string;
  perViewerLimit: string;
  allowlistText: string;
  resetMode: ResetMode;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  segments: [
    { label: "", weight: "" },
    { label: "", weight: "" },
  ],
  isDefault: false,
  themeId: DEFAULT_THEME_ID,
  fillStyle: DEFAULT_FILL_STYLE,
  mode: "off",
  max: "5",
  perViewerLimit: "1",
  allowlistText: "",
  resetMode: "manual",
};

function toDraft(w: Wheel): Draft {
  return {
    id: w.id,
    name: w.name,
    segments: w.segments.map((s) => ({
      label: s.label,
      weight: s.weight != null ? String(s.weight) : "",
    })),
    isDefault: w.isDefault,
    themeId: w.themeId,
    fillStyle: w.fillStyle,
    mode: w.contribution.mode,
    max: String(w.contribution.max),
    perViewerLimit: String(w.contribution.perViewerLimit),
    allowlistText: w.contribution.allowlist.join(", "),
    resetMode: w.contribution.resetMode,
  };
}

function draftToContribution(d: Draft): WheelContribution {
  return {
    mode: d.mode,
    max: Math.max(0, Math.min(5, parseInt(d.max, 10) || 0)),
    perViewerLimit: Math.max(1, Math.min(5, parseInt(d.perViewerLimit, 10) || 1)),
    allowlist: d.allowlistText
      .split(/[\s,]+/)
      .map((s) => s.trim().replace(/^@/, "").toLowerCase())
      .filter((s) => /^[a-z0-9_]{1,25}$/.test(s)),
    resetMode: d.resetMode,
  };
}

function draftToSegments(d: Draft): WheelSegment[] {
  return d.segments
    .map((s) => s.label.trim())
    .map((label, i) => ({ raw: d.segments[i], label }))
    .filter((x) => x.label)
    .map(({ raw, label }) => {
      const seg: WheelSegment = { label };
      const w = parseFloat(raw.weight);
      if (Number.isFinite(w) && w > 0) seg.weight = w;
      return seg;
    });
}

export function WheelsTab() {
  const [wheels, setWheels] = useState<Wheel[]>([]);
  const [loading, setLoading] = useState(true);
  const [proRequired, setProRequired] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // New wheels default to the streamer's brand palette (their chosen brand
  // theme maps to a wheel theme); falls back to the wheel default.
  const [brandWheelTheme, setBrandWheelTheme] = useState(DEFAULT_THEME_ID);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/wheels", { cache: "no-store" });
      if (res.status === 403) {
        setProRequired(true);
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { wheels: Wheel[] };
      setWheels(body.wheels);
      // Resolve the brand theme → wheel palette for new-wheel defaults.
      try {
        const brandRes = await fetch("/api/account/profile-theme", { cache: "no-store" });
        if (brandRes.ok) {
          const brandBody = (await brandRes.json()) as { brandTheme: string };
          setBrandWheelTheme(getBrandTheme(brandBody.brandTheme).wheelThemeId);
        }
      } catch {
        /* brand is optional — keep the wheel default */
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setError(null);
    const segments = draftToSegments(draft);
    if (!draft.name.trim()) {
      setError("Give your wheel a name.");
      return;
    }
    if (segments.length < 2) {
      setError("Add at least two segments with labels.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/wheels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          name: draft.name.trim(),
          segments,
          isDefault: draft.isDefault,
          themeId: draft.themeId,
          fillStyle: draft.fillStyle,
          contribution: draftToContribution(draft),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          body.error === "name_taken"
            ? "You already have a wheel with that name."
            : "Couldn't save the wheel. Try again.",
        );
        return;
      }
      setDraft(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/account/wheels?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await load();
  }

  if (proRequired) {
    return (
      <div className="account-card">
        <h2 className="account-tab__heading">Wheels</h2>
        <Alert variant="info">
          The overlay wheel spinner is a GameShuffle Pro feature.{" "}
          <Link href="/gs-pro">Upgrade to Pro</Link> to build wheels and spin
          them live on your overlay — no separate browser source required.
        </Alert>
      </div>
    );
  }

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Wheels</h2>
      <p className="account-tab__intro">
        Build randomized wheels and spin them right on your overlay — from the
        Hub or with <code>!spin</code> in chat. The <strong>default</strong>{" "}
        wheel is what <code>!spin</code> uses.
      </p>

      <div style={{ margin: "var(--spacing-16) 0" }}>
        <Button
          variant="primary"
          onClick={() => setDraft({ ...EMPTY_DRAFT, themeId: brandWheelTheme })}
        >
          New wheel
        </Button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : wheels.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>
          No wheels yet. Create one to get started.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
          {wheels.map((w) => (
            <div
              key={w.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--spacing-12)",
                padding: "var(--spacing-12) var(--spacing-16)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-8, 0.5rem)",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
                  <strong>{w.name}</strong>
                  {w.isDefault ? <Badge variant="success" size="small">Default</Badge> : null}
                </div>
                <span style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)" }}>
                  {w.segments.length} segment{w.segments.length === 1 ? "" : "s"}
                </span>
              </div>
              <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
                <Button variant="secondary" size="small" onClick={() => setDraft(toDraft(w))}>
                  Edit
                </Button>
                <Button variant="ghost" size="small" onClick={() => void remove(w.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft ? (
        <Modal
          isOpen
          onClose={() => setDraft(null)}
          title={draft.id ? "Edit wheel" : "New wheel"}
          footer={
            <div style={{ display: "flex", gap: "var(--spacing-8)", justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
              <Button variant="primary" loading={saving} onClick={() => void save()}>
                Save wheel
              </Button>
            </div>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-16)" }}>
            {error ? <Alert variant="error">{error}</Alert> : null}

            <FormField label="Wheel name" htmlFor="wheel-name">
              <Input
                id="wheel-name"
                fullWidth
                value={draft.name}
                placeholder="e.g. What do we play?"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </FormField>

            <div>
              <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--spacing-8)" }}>
                Look
              </div>
              <WheelStylePicker
                themeId={draft.themeId}
                onThemeChange={(themeId) => setDraft({ ...draft, themeId })}
                fillStyle={draft.fillStyle}
                onFillStyleChange={(fillStyle) => setDraft({ ...draft, fillStyle })}
              />
            </div>

            <div>
              <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--spacing-8)" }}>
                Segments
              </div>
              <div className="wheel-seg-grid">
                <div className="wheel-seg-row wheel-seg-row--head" aria-hidden="true">
                  <span>Label</span>
                  <span>Weight</span>
                  <span />
                </div>
                {draft.segments.map((seg, i) => (
                  <div key={i} className="wheel-seg-row">
                    <Input
                      fullWidth
                      value={seg.label}
                      placeholder={`Option ${i + 1}`}
                      aria-label={`Segment ${i + 1} label`}
                      onChange={(e) => {
                        const segments = [...draft.segments];
                        segments[i] = { ...segments[i], label: e.target.value };
                        setDraft({ ...draft, segments });
                      }}
                    />
                    <Input
                      fullWidth
                      type="number"
                      min={0}
                      step="any"
                      value={seg.weight}
                      placeholder="1"
                      aria-label={`Segment ${i + 1} weight`}
                      onChange={(e) => {
                        const segments = [...draft.segments];
                        segments[i] = { ...segments[i], weight: e.target.value };
                        setDraft({ ...draft, segments });
                      }}
                    />
                    <div className="wheel-seg-remove">
                      <Button
                        variant="ghost"
                        size="small"
                        disabled={draft.segments.length <= 2}
                        onClick={() => {
                          const segments = draft.segments.filter((_, j) => j !== i);
                          setDraft({ ...draft, segments });
                        }}
                        aria-label={`Remove segment ${i + 1}`}
                      >
                        ✕
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "var(--spacing-12)" }}>
                <Button
                  variant="tertiary"
                  size="small"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      segments: [...draft.segments, { label: "", weight: "" }],
                    })
                  }
                >
                  + Add segment
                </Button>
              </div>
              <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", marginTop: "var(--spacing-8)" }}>
                Weight is optional (default 1) — higher weight means a bigger
                slice and better odds.
              </p>
            </div>

            <div>
              <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--spacing-8)" }}>
                Viewer contributions
              </div>
              <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", margin: "0 0 var(--spacing-12)" }}>
                Let viewers add options to this wheel from chat with <code>!wheel add</code>.
              </p>
              <FormField label="Who can add" htmlFor="wheel-contrib-mode">
                <Select
                  id="wheel-contrib-mode"
                  fullWidth
                  value={draft.mode}
                  onChange={(value) =>
                    setDraft({ ...draft, mode: value as ContributionMode })
                  }
                  options={[
                    { value: "off", label: "Off — only you" },
                    { value: "everyone", label: "Everyone" },
                    { value: "allowlist", label: "Allow-list only" },
                  ]}
                />
              </FormField>

              {draft.mode !== "off" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)", marginTop: "var(--spacing-12)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--spacing-8)" }}>
                    <FormField label="Max options (0–5)" htmlFor="wheel-contrib-max">
                      <Input
                        id="wheel-contrib-max"
                        fullWidth
                        type="number"
                        min={0}
                        max={5}
                        value={draft.max}
                        onChange={(e) => setDraft({ ...draft, max: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Per viewer" htmlFor="wheel-contrib-perviewer">
                      <Input
                        id="wheel-contrib-perviewer"
                        fullWidth
                        type="number"
                        min={1}
                        max={5}
                        value={draft.perViewerLimit}
                        onChange={(e) => setDraft({ ...draft, perViewerLimit: e.target.value })}
                      />
                    </FormField>
                  </div>

                  {draft.mode === "allowlist" ? (
                    <FormField label="Allowed Twitch usernames" htmlFor="wheel-contrib-allowlist">
                      <Input
                        id="wheel-contrib-allowlist"
                        fullWidth
                        value={draft.allowlistText}
                        placeholder="user1, user2, user3"
                        onChange={(e) => setDraft({ ...draft, allowlistText: e.target.value })}
                      />
                    </FormField>
                  ) : null}

                  <Switch
                    checked={draft.resetMode === "on_spin"}
                    onChange={(e) =>
                      setDraft({ ...draft, resetMode: e.target.checked ? "on_spin" : "manual" })
                    }
                    label="Remove each pick from the wheel after it's spun (elimination)"
                  />
                </div>
              ) : null}
            </div>

            <Switch
              checked={draft.isDefault}
              onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
              label="Make this the default wheel (used by !spin)"
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
