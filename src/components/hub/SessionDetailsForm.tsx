"use client";

/**
 * Session-details editor for the configure page. Owns the editable
 * metadata fields: name, description, game/randomizer, scheduled date,
 * eligibility window, and the test-session toggle.
 *
 * Field-by-field editability:
 *   - name + description: always editable
 *   - game / scheduled / test-session: editable while draft / scheduled
 *     / ready. Locked once active or beyond.
 *
 * Save semantics: a single Save button per spec §5.3 simplification (the
 * spec calls for debounced auto-save; for a v1 ship we trade that for a
 * predictable explicit save with toast on success). Each field is
 * controlled locally so the user can edit + save in one go.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  DatePickerModal,
  Input,
  Switch,
  Textarea,
} from "@empac/cascadeds";
import { updateSessionDetailsAction } from "@/app/hub/sessions/[slug]/actions";

interface Props {
  slug: string;
  status:
    | "draft"
    | "scheduled"
    | "ready"
    | "active"
    | "ending"
    | "ended"
    | "cancelled";
  initial: {
    name: string;
    description: string | null;
    game: string | null;
    scheduledAt: string | null;
    scheduledEligibilityWindowHours: number;
    isTestSession: boolean;
  };
  /** Available game slugs + display names for the randomizer picker. */
  games: Array<{ slug: string; label: string }>;
}

export function SessionDetailsForm({ slug, status, initial, games }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [game, setGame] = useState(initial.game ?? "");
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(
    !!initial.scheduledAt
  );
  const [scheduledAt, setScheduledAt] = useState<string>(
    initial.scheduledAt ? toLocalIsoMinute(initial.scheduledAt) : ""
  );
  const [eligibilityWindow, setEligibilityWindow] = useState<number>(
    initial.scheduledEligibilityWindowHours
  );
  const [isTestSession, setIsTestSession] = useState<boolean>(
    initial.isTestSession
  );

  const lifecycleEditable =
    status === "draft" || status === "scheduled" || status === "ready";

  const save = () => {
    setError(null);
    setSavedFlash(false);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    const payload: Parameters<typeof updateSessionDetailsAction>[1] = {
      name: trimmedName,
      description: description.trim() || null,
    };

    if (lifecycleEditable) {
      payload.game = game || null;
      payload.isTestSession = isTestSession;
      if (scheduleEnabled) {
        if (!scheduledAt) {
          setError("Pick a date and time, or turn off scheduling.");
          return;
        }
        const ms = Date.parse(scheduledAt);
        if (!Number.isFinite(ms)) {
          setError("Invalid scheduled date.");
          return;
        }
        if (ms <= Date.now()) {
          setError("Schedule a time in the future.");
          return;
        }
        payload.scheduledAt = new Date(ms).toISOString();
        payload.scheduledEligibilityWindowHours = eligibilityWindow;
      } else {
        payload.scheduledAt = null;
      }
    }

    setSaving(true);
    startTransition(async () => {
      const result = await updateSessionDetailsAction(slug, payload);
      setSaving(false);
      if (!result.ok) {
        setError(result.error ?? "Save failed.");
        return;
      }
      setSavedFlash(true);
      router.refresh();
      window.setTimeout(() => setSavedFlash(false), 2500);
    });
  };

  return (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Session details</h2>

      {!lifecycleEditable && (
        <Alert variant="info">
          This session is <strong>{status}</strong>. Name and description are
          still editable, but the game, schedule, and test-session flag are
          locked from this point.
        </Alert>
      )}

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {savedFlash && (
        <Alert variant="success">Saved.</Alert>
      )}

      <div className="hub-form__field-stack">
        <label className="hub-form__field">
          <span className="hub-form__label">Name *</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
        </label>
        <label className="hub-form__field">
          <span className="hub-form__label">Description</span>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            fullWidth
          />
        </label>

        <label className="hub-form__field">
          <span className="hub-form__label">Randomizer / game</span>
          {lifecycleEditable ? (
            <select
              value={game}
              onChange={(e) => setGame(e.target.value)}
              className="hub-form__select"
            >
              <option value="">— No game selected —</option>
              {games.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.label}
                </option>
              ))}
            </select>
          ) : (
            <p className="hub-form__platform-disabled">
              {game
                ? games.find((g) => g.slug === game)?.label ?? game
                : "No game selected"}
            </p>
          )}
        </label>

        <div className="hub-form__field">
          <span className="hub-form__label">Schedule</span>
          {lifecycleEditable ? (
            <>
              <label className="hub-form__inline-field hub-form__inline-field--row">
                <Switch
                  checked={scheduleEnabled}
                  onChange={() => setScheduleEnabled((v) => !v)}
                />
                <span>
                  {scheduleEnabled
                    ? "Scheduled — pick a date below"
                    : "Start now (creates a draft you can activate)"}
                </span>
              </label>
              {scheduleEnabled && (
                <div className="hub-form__schedule-inputs">
                  <DatePickerModal
                    value={scheduledAt}
                    onChange={setScheduledAt}
                    showTime
                    fullWidth
                    placeholder="Pick a date and time"
                  />
                  <label className="hub-form__inline-field">
                    <span>Eligibility window (hours before/after)</span>
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={String(eligibilityWindow)}
                      onChange={(e) =>
                        setEligibilityWindow(
                          Math.max(
                            1,
                            Math.min(24, parseInt(e.target.value || "4", 10))
                          )
                        )
                      }
                    />
                  </label>
                </div>
              )}
            </>
          ) : (
            <p className="hub-form__platform-disabled">
              {initial.scheduledAt
                ? `Scheduled for ${new Date(initial.scheduledAt).toLocaleString()}`
                : "Not scheduled"}
            </p>
          )}
        </div>

        <div className="hub-form__field">
          <span className="hub-form__label">Test session</span>
          {lifecycleEditable ? (
            <label className="hub-form__inline-field hub-form__inline-field--row">
              <Switch
                checked={isTestSession}
                onChange={() => setIsTestSession((v) => !v)}
              />
              <span>
                {isTestSession
                  ? "Marked as test session (feature_flags.test_session = true)"
                  : "Live session"}
              </span>
            </label>
          ) : (
            <p className="hub-form__platform-disabled">
              {initial.isTestSession ? "Test session" : "Live session"}
            </p>
          )}
        </div>
      </div>

      <div className="hub-form__actions">
        <Button
          type="button"
          variant="primary"
          onClick={save}
          disabled={saving || pending}
        >
          {saving ? "Saving…" : "Save details"}
        </Button>
      </div>
    </section>
  );
}

/** Convert an ISO timestamp to the local "YYYY-MM-DDTHH:mm" string the
 *  CDS DatePickerModal expects. Strips seconds/zone — matches user's
 *  local clock so the picker preselects the right slot. */
function toLocalIsoMinute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
