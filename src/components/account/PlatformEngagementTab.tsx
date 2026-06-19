"use client";

/**
 * PlatformEngagementTab — staff/admin-only editor for the
 * engagement signal weights (`gs_engagement_weights`).
 *
 * Phase 2 sees the data flowing from Phase 1 signal logs; this
 * surface lets staff calibrate without a deploy. Weight changes
 * propagate immediately — the PUT endpoint busts the runtime
 * cache so the next logSignal call sees the new value.
 *
 * 5 rows fixed by the schema's signal_type CHECK constraint. UI
 * keeps it as a flat table since the cardinality is so small.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, Textarea } from "@empac/cascadeds";

type SignalType =
  | "command_fired"
  | "event_fired"
  | "social_action"
  | "token_earned"
  | "token_spent";

interface WeightRow {
  signal_type: SignalType;
  weight: number;
  note: string | null;
  updated_at: string;
}

const SIGNAL_LABEL: Record<SignalType, string> = {
  command_fired: "Command fired",
  event_fired: "Event fired",
  social_action: "Social action",
  token_earned: "Tokens earned",
  token_spent: "Tokens spent",
};

const SIGNAL_HELP: Record<SignalType, string> = {
  command_fired:
    "Any default / custom chat command. Low weight by default — they're frequent + low-friction.",
  event_fired:
    "An event triggered by !chaos / !random / mention / direct that moved tokens or applied a modifier. Higher weight.",
  social_action:
    "A wholesome story-only event (no token movement). Sits between commands and full events.",
  token_earned:
    "Multiplied by amount when wired in Phase 3. Today logs at this base weight per signal.",
  token_spent:
    "Multiplied by amount when wired in Phase 3. Today logs at this base weight per signal.",
};

export function PlatformEngagementTab() {
  const [rows, setRows] = useState<WeightRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Partial<Record<SignalType, { weight: string; note: string }>>
  >({});
  const [savingType, setSavingType] = useState<SignalType | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/engagement-weights", {
        cache: "no-store",
      });
      if (res.status === 403) {
        setLoadError(
          "Forbidden — this surface is for GameShuffle staff only.",
        );
        setRows([]);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Load failed (${res.status}).`);
        setRows([]);
        return;
      }
      const list = (body.weights as WeightRow[]) ?? [];
      setRows(list);
      // Seed editable drafts so admins can type → save without
      // first focusing each input.
      const seeded: Partial<
        Record<SignalType, { weight: string; note: string }>
      > = {};
      for (const r of list) {
        seeded[r.signal_type] = {
          weight: String(r.weight),
          note: r.note ?? "",
        };
      }
      setDrafts(seeded);
    } catch {
      setLoadError("Network error while loading.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (signalType: SignalType) => {
    const draft = drafts[signalType];
    if (!draft) return;
    const weight = parseInt(draft.weight, 10);
    if (!Number.isInteger(weight) || weight < 1) {
      setLoadError("Weight must be a positive integer.");
      return;
    }
    setSavingType(signalType);
    try {
      const res = await fetch("/api/admin/engagement-weights", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signal_type: signalType,
          weight,
          note: draft.note.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Save failed (${res.status}).`);
        return;
      }
      await load();
    } finally {
      setSavingType(null);
    }
  };

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Engagement weights</h2>
      <p className="account-tab__intro">
        Per-signal weights for the engagement scoring system. Changes
        take effect immediately — the runtime cache is invalidated
        on every save, so the next signal log uses the new value.
        Phase 1&rsquo;s code constants are the fallback when the row
        is missing or the table is unreadable.
      </p>

      {loadError && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          <Alert variant="error" onClose={() => setLoadError(null)}>
            {loadError}
          </Alert>
        </div>
      )}

      {rows === null ? (
        <p className="account-tab__empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="account-tab__empty">
          No weight rows yet — apply the migration to seed the
          defaults.
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-16)",
          }}
        >
          {rows.map((row) => {
            const draft = drafts[row.signal_type] ?? {
              weight: String(row.weight),
              note: row.note ?? "",
            };
            const dirty =
              draft.weight !== String(row.weight) ||
              draft.note !== (row.note ?? "");
            const isSaving = savingType === row.signal_type;
            return (
              <div
                key={row.signal_type}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 1fr auto",
                  gap: "var(--spacing-16)",
                  alignItems: "flex-start",
                  padding: "var(--spacing-16)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-medium)",
                  background: "var(--background-elevated)",
                }}
              >
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: "var(--font-weight-semibold)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {SIGNAL_LABEL[row.signal_type]}
                  </p>
                  <p
                    style={{
                      margin: "var(--spacing-4) 0 0",
                      fontSize: "var(--font-size-12)",
                      color: "var(--text-secondary)",
                      lineHeight: "var(--line-height-relaxed)",
                    }}
                  >
                    {SIGNAL_HELP[row.signal_type]}
                  </p>
                </div>
                <label
                  className="hub-form__field"
                  style={{ minWidth: 0 }}
                >
                  <span className="hub-form__label">Weight</span>
                  <Input
                    type="number"
                    min={1}
                    value={draft.weight}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.signal_type]: {
                          ...draft,
                          weight: e.target.value,
                        },
                      }))
                    }
                    fullWidth
                  />
                </label>
                <label
                  className="hub-form__field"
                  style={{ minWidth: 0 }}
                >
                  <span className="hub-form__label">
                    Note (admin-only)
                  </span>
                  <Textarea
                    value={draft.note}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.signal_type]: {
                          ...draft,
                          note: e.target.value,
                        },
                      }))
                    }
                    rows={2}
                    fullWidth
                  />
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    height: "100%",
                  }}
                >
                  <Button
                    variant="primary"
                    size="small"
                    onClick={() => void save(row.signal_type)}
                    disabled={!dirty || isSaving}
                    loading={isSaving}
                  >
                    Save
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
