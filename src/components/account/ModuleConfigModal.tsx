"use client";

/**
 * Per-module config editor — opened from the ModulesSection "Configure"
 * button on each module card. Form fields are rendered per moduleId
 * (picks / bans / kart_randomizer) since each has its own config schema
 * per src/lib/modules/types.ts.
 *
 * Persistence: PATCHes via the existing POST /api/twitch/modules with
 * action=update_config. The API auto-ensures the row exists before
 * mutating, so configuring a never-touched module also provisions it.
 */

import { useEffect, useState } from "react";
import { Alert, Checkbox, Modal, Select } from "@empac/cascadeds";

type ModuleId = "kart_randomizer" | "picks" | "bans";

const PICKABLE_CATEGORIES = ["characters", "karts", "wheels", "gliders", "tracks"] as const;
type PickableCategory = (typeof PICKABLE_CATEGORIES)[number];

const CATEGORY_LABELS: Record<PickableCategory, string> = {
  characters: "Characters",
  karts: "Karts",
  wheels: "Wheels",
  gliders: "Gliders",
  tracks: "Tracks",
};

interface PicksConfig {
  picks_per_participant: number;
  pickable_categories: PickableCategory[];
  category_pick_limits?: Partial<Record<PickableCategory, number>>;
  timer_seconds: number;
  confirm_mode: "auto" | "manual" | "manual_with_timeout";
  allow_pick_changes: boolean;
}

interface BansConfig {
  bans_per_participant: number;
  bannable_categories: PickableCategory[];
  category_ban_limits?: Partial<Record<PickableCategory, number>>;
  timer_seconds: number;
  confirm_mode: "auto" | "manual" | "manual_with_timeout";
  allow_ban_changes: boolean;
}

interface KartConfig {
  cooldown_seconds: number;
}

export interface ModuleConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleId: ModuleId;
  moduleName: string;
  initialConfig: Record<string, unknown>;
  /** Fires after a successful save so the parent can refresh module rows. */
  onSaved?: () => void;
}

export function ModuleConfigModal({
  isOpen,
  onClose,
  moduleId,
  moduleName,
  initialConfig,
  onSaved,
}: ModuleConfigModalProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset draft to initialConfig every time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setDraft(initialConfig);
      setError(null);
    }
  }, [isOpen, initialConfig]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/twitch/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_config", moduleId, config: draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || body.error || "Save failed.");
        return;
      }
      onSaved?.();
      onClose();
    } catch (err) {
      console.error("[ModuleConfigModal] save failed:", err);
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Configure ${moduleName}`}
      size="medium"
      primaryAction={{ label: saving ? "Saving…" : "Save", onClick: () => void handleSave() }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      {error && (
        <div style={{ marginBottom: "var(--spacing-12)" }}>
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      {moduleId === "picks" && (
        <PicksOrBansForm
          mode="picks"
          draft={draft as unknown as PicksConfig}
          onChange={(next) => setDraft(next as unknown as Record<string, unknown>)}
        />
      )}
      {moduleId === "bans" && (
        <PicksOrBansForm
          mode="bans"
          draft={draft as unknown as BansConfig}
          onChange={(next) => setDraft(next as unknown as Record<string, unknown>)}
        />
      )}
      {moduleId === "kart_randomizer" && (
        <KartRandomizerForm
          draft={draft as unknown as KartConfig}
          onChange={(next) => setDraft(next as unknown as Record<string, unknown>)}
        />
      )}
    </Modal>
  );
}

// ---------- Picks / Bans form (shared shape) ----------

function PicksOrBansForm({
  mode,
  draft,
  onChange,
}: {
  mode: "picks" | "bans";
  draft: PicksConfig | BansConfig;
  onChange: (next: PicksConfig | BansConfig) => void;
}) {
  const isPicks = mode === "picks";
  const perField = isPicks ? "picks_per_participant" : "bans_per_participant";
  const categoriesField = isPicks ? "pickable_categories" : "bannable_categories";
  const allowChangesField = isPicks ? "allow_pick_changes" : "allow_ban_changes";

  const draftMap = draft as unknown as Record<string, unknown>;
  const perValue = (draftMap[perField] as number) ?? 2;
  const categoriesValue = (draftMap[categoriesField] as PickableCategory[] | undefined) ?? [];
  const allowChangesValue = (draftMap[allowChangesField] as boolean | undefined) ?? true;
  const timerValue = draft.timer_seconds ?? 90;
  const confirmModeValue = draft.confirm_mode ?? "manual_with_timeout";

  const update = (patch: Record<string, unknown>) => {
    onChange({ ...draft, ...patch } as PicksConfig | BansConfig);
  };

  const toggleCategory = (cat: PickableCategory) => {
    const set = new Set(categoriesValue);
    if (set.has(cat)) set.delete(cat);
    else set.add(cat);
    // Preserve declaration order so the chat command's category list reads
    // consistently regardless of click order.
    const ordered = PICKABLE_CATEGORIES.filter((c) => set.has(c));
    update({ [categoriesField]: ordered });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Per-participant count */}
      <div>
        <Label>{isPicks ? "Picks per participant" : "Bans per participant"}</Label>
        <NumberStepper
          value={perValue}
          min={1}
          max={5}
          onChange={(v) => update({ [perField]: v })}
        />
        <Hint>Total selections each viewer can make per round (1–5).</Hint>
      </div>

      {/* Categories multi-select */}
      <div>
        <Label>{isPicks ? "Pickable categories" : "Bannable categories"}</Label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-6)", marginTop: "var(--spacing-4)" }}>
          {PICKABLE_CATEGORIES.map((cat) => {
            const active = categoriesValue.includes(cat);
            return (
              <button
                type="button"
                key={cat}
                onClick={() => toggleCategory(cat)}
                style={{
                  padding: "var(--spacing-4) var(--spacing-12)",
                  borderRadius: "var(--radius-full)",
                  border: active ? "1px solid var(--primary-500)" : "1px solid var(--border-default)",
                  background: active ? "var(--primary-50)" : "var(--background-primary)",
                  color: active ? "var(--primary-600)" : "var(--text-secondary)",
                  fontSize: "var(--font-size-14)",
                  fontWeight: active ? "var(--font-weight-semibold)" : "var(--font-weight-medium)",
                  cursor: "pointer",
                }}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            );
          })}
        </div>
        {categoriesValue.length === 0 && (
          <Hint warning>At least one category must be selected for this module to do anything.</Hint>
        )}
        {categoriesValue.length === 1 && (
          <Hint>
            With only one category enabled, viewers can use the short form (e.g. <code>!gs-{isPicks ? "pick" : "ban"} mario</code>).
          </Hint>
        )}
      </div>

      {/* Timer */}
      <div>
        <Label>Timer (seconds)</Label>
        <NumberStepper
          value={timerValue}
          min={0}
          max={300}
          step={15}
          onChange={(v) => update({ timer_seconds: v })}
        />
        <Hint>How long viewers have to {isPicks ? "pick" : "ban"} (0 = no timer, manual confirm only).</Hint>
      </div>

      {/* Confirm mode */}
      <div>
        <Label>Lock-in mode</Label>
        <Select
          fullWidth
          value={confirmModeValue}
          onChange={(v) => update({ confirm_mode: typeof v === "string" ? v : v[0] ?? confirmModeValue })}
          options={[
            { value: "manual_with_timeout", label: "Manual confirm with timer fallback" },
            { value: "manual", label: "Manual confirm only (you click to lock)" },
            { value: "auto", label: "Auto-lock when timer expires" },
          ]}
        />
        <Hint>Controls how a round transitions from collecting to locked.</Hint>
      </div>

      {/* Allow changes */}
      <div>
        <Checkbox
          label={`Allow ${isPicks ? "pick" : "ban"} changes during collection`}
          checked={allowChangesValue}
          onChange={(e) => update({ [allowChangesField]: e.target.checked })}
        />
        <Hint>
          When on, viewers replace their oldest {isPicks ? "pick" : "ban"} when at the limit. When
          off, the first {isPicks ? "pick" : "ban"} sticks until the streamer resets.
        </Hint>
      </div>
    </div>
  );
}

// ---------- Kart Randomizer form ----------

function KartRandomizerForm({
  draft,
  onChange,
}: {
  draft: KartConfig;
  onChange: (next: KartConfig) => void;
}) {
  const cooldown = draft.cooldown_seconds ?? 30;
  return (
    <div>
      <Label>Per-viewer shuffle cooldown (seconds)</Label>
      <NumberStepper
        value={cooldown}
        min={0}
        max={300}
        step={5}
        onChange={(v) => onChange({ ...draft, cooldown_seconds: v })}
      />
      <Hint>
        How often a single viewer can run <code>!gs-shuffle</code>. Broadcaster bypasses
        the cooldown. 0 = no cooldown (not recommended for live streams).
      </Hint>
    </div>
  );
}

// ---------- Tiny shared field primitives ----------

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: "var(--font-size-14)", fontWeight: "var(--font-weight-semibold)", color: "var(--text-primary)", marginBottom: "var(--spacing-4)" }}>
      {children}
    </label>
  );
}

function Hint({ children, warning }: { children: React.ReactNode; warning?: boolean }) {
  return (
    <p style={{ fontSize: "var(--font-size-12)", color: warning ? "var(--error-700)" : "var(--text-tertiary)", margin: "var(--spacing-4) 0 0", lineHeight: "var(--line-height-snug)" }}>
      {children}
    </p>
  );
}

function NumberStepper({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
}) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--border-default)", borderRadius: "var(--radius-6)", overflow: "hidden" }}>
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        style={{
          padding: "var(--spacing-6) var(--spacing-12)",
          background: "var(--background-secondary)",
          border: "none",
          cursor: value <= min ? "not-allowed" : "pointer",
          fontSize: "var(--font-size-16)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--text-secondary)",
        }}
      >
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        style={{
          width: "4rem",
          textAlign: "center",
          border: "none",
          padding: "var(--spacing-6) var(--spacing-4)",
          fontSize: "var(--font-size-14)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--text-primary)",
          background: "var(--background-primary)",
        }}
      />
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        style={{
          padding: "var(--spacing-6) var(--spacing-12)",
          background: "var(--background-secondary)",
          border: "none",
          cursor: value >= max ? "not-allowed" : "pointer",
          fontSize: "var(--font-size-16)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--text-secondary)",
        }}
      >
        +
      </button>
    </div>
  );
}
