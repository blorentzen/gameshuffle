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
  Checkbox,
  DatePickerModal,
  Input,
  Switch,
  Textarea,
} from "@empac/cascadeds";
import { updateSessionDetailsAction } from "@/app/hub/sessions/[slug]/actions";
import { GameMultiSelect } from "./GameMultiSelect";

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
    /** Multi-game spec: streamer-declared game slugs in play order. */
    configuredGames: string[];
    scheduledAt: string | null;
    scheduledEligibilityWindowHours: number;
    isTestSession: boolean;
  };
}

export function SessionDetailsForm({ slug, status, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [configuredGames, setConfiguredGames] = useState<string[]>(
    initial.configuredGames
  );
  // Play-order opt-in. Defaults on when the streamer landed here with
  // 2+ games already declared (likely they want order); otherwise off
  // so the question is explicit.
  const [setPlayOrder, setSetPlayOrder] = useState<boolean>(
    initial.configuredGames.length >= 2
  );
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
      payload.configuredGames = configuredGames;
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

        <div className="hub-form__field">
          <span className="hub-form__label">Games for this session</span>
          <GameMultiSelect
            value={configuredGames}
            onChange={setConfiguredGames}
            disabled={!lifecycleEditable}
            reorderable={setPlayOrder}
          />
          <p className="hub-form__platform-disabled">
            Pick every game you plan to host. Each game keeps its own
            picks/bans + module config under the Modules tab. GS adheres
            to whatever Twitch says you&rsquo;re currently playing —
            when you pivot between declared games, the active config
            slice flips automatically. Leave empty for a pure queue
            session.
          </p>

          {configuredGames.length >= 2 && (
            <div className="hub-form__play-order">
              <Checkbox
                checked={setPlayOrder}
                onChange={(e) => setSetPlayOrder(e.target.checked)}
                disabled={!lifecycleEditable}
                label="Would you like to set a play order?"
                helperText={
                  setPlayOrder
                    ? "Drag selected tiles above to set the sequence. GameShuffle will use this as the expected play order — useful when you have a planned arc (e.g. start with MK8DX, switch to MKWorld at the halfway mark) so we can adapt scheduling, recap framing, and category-pivot expectations to your plan."
                    : "Without an order, GameShuffle defaults to the first game you selected and adapts as Twitch tells us what's currently playing. Check this if you want a planned sequence GS should follow."
                }
              />
            </div>
          )}
        </div>


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
                  <p className="hub-form__platform-disabled">
                    Times are stored in UTC and shown in each viewer&rsquo;s
                    local zone — once you set your timezone in{" "}
                    <a href="/account?tab=profile">Account → Profile</a>{" "}
                    (coming soon), the live view + overlay will surface the
                    converted time so PST viewers see PST, EST sees EST,
                    etc. For now, schedules render in the streamer&rsquo;s
                    browser zone.
                  </p>
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
