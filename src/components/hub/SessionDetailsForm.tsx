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

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  DatePickerModal,
  Input,
  Radio,
  RadioGroup,
  Switch,
  Textarea,
} from "@empac/cascadeds";
import { updateSessionDetailsAction } from "@/app/hub/sessions/[slug]/actions";
import { GameMultiSelect } from "./GameMultiSelect";
import { useSessionSave } from "./SessionSaveProvider";

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
    /** Spec 02 §5 — `announce_only` fires the pre-session
     *  notification + opens the queue at `announceAt`. `auto_open`
     *  additionally flips the session to active at `scheduledAt`.
     *  null means no notification, no auto-activate. */
    openMode: "announce_only" | "auto_open" | null;
    /** Spec 02 §5 follow-on — when set, the pre-session
     *  notification fires at this earlier moment. Resolved from the
     *  streamer's preset choice (30m/1h/2h/24h before) or a custom
     *  absolute time in the UI. */
    announceAt: string | null;
    /** Spec 02 §5 follow-on — when announce_at fires, should the
     *  pre-live lobby open for viewer commands (true, default)? When
     *  false the streamer just wants a Discord heads-up and viewers
     *  have to wait for manual activation to !gs-join. */
    opensQueue: boolean;
    /** Spec 02 §8 — recurrence cadence. null = one-shot session. */
    recurrence: "daily" | "weekly" | "monthly" | null;
    /** Spec 02 §8 — optional cutoff for recurrence. */
    recurrenceUntil: string | null;
  };
}

type NotifyPreset = "none" | "30m" | "1h" | "2h" | "24h" | "custom";

const PRESET_OFFSET_MS: Record<
  Exclude<NotifyPreset, "none" | "custom">,
  number
> = {
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "2h": 2 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
};

/** Derive which preset best matches an `announce_at` relative to the
 *  session start. Falls back to "custom" when the offset doesn't line
 *  up with a preset (within 1 minute of slack). */
function presetFromAnnounceAt(
  scheduledAt: string | null,
  announceAt: string | null
): NotifyPreset {
  if (!announceAt) return "none";
  if (!scheduledAt) return "custom";
  const diffMs = Date.parse(scheduledAt) - Date.parse(announceAt);
  for (const key of ["30m", "1h", "2h", "24h"] as const) {
    if (Math.abs(diffMs - PRESET_OFFSET_MS[key]) < 60_000) return key;
  }
  return "custom";
}

export function SessionDetailsForm({ slug, status, initial }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { registerSection, unregisterSection, setDirty } = useSessionSave();

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [configuredGames, setConfiguredGames] = useState<string[]>(
    initial.configuredGames
  );
  const [scheduledAt, setScheduledAt] = useState<string>(
    initial.scheduledAt ? toLocalIsoMinute(initial.scheduledAt) : ""
  );
  // Notify preset — drives announce_at. "none" leaves it null, the
  // four offsets compute it from scheduled_at, "custom" exposes an
  // explicit picker. Initial state derived from the row's stored
  // announce_at relative to the scheduled_at.
  const [notifyPreset, setNotifyPreset] = useState<NotifyPreset>(() =>
    presetFromAnnounceAt(initial.scheduledAt, initial.announceAt)
  );
  const [announceCustomAt, setAnnounceCustomAt] = useState<string>(
    initial.announceAt && presetFromAnnounceAt(
      initial.scheduledAt,
      initial.announceAt
    ) === "custom"
      ? toLocalIsoMinute(initial.announceAt)
      : ""
  );
  // Auto-activate maps to open_mode = 'auto_open'. Independent of the
  // notify preset — the streamer can opt to send a preset-time
  // announce AND have the session auto-activate at start.
  const [autoActivate, setAutoActivate] = useState<boolean>(
    initial.openMode === "auto_open"
  );
  // Opens-queue maps to feature_flags.opens_queue. Only meaningful
  // when notifyPreset !== "none" — otherwise there's no announce_at,
  // so the queue can't "open early" anyway.
  const [opensQueue, setOpensQueue] = useState<boolean>(initial.opensQueue);
  // Recurrence — "none" = one-shot session. The picker only renders
  // when scheduledAt is set; otherwise there's nothing to recur from.
  const [recurrence, setRecurrence] = useState<
    "none" | "daily" | "weekly" | "monthly"
  >(initial.recurrence ?? "none");
  const [recurrenceUntil, setRecurrenceUntil] = useState<string>(
    initial.recurrenceUntil ? toLocalIsoMinute(initial.recurrenceUntil) : ""
  );

  const lifecycleEditable =
    status === "draft" || status === "scheduled" || status === "ready";

  // Keep current field values reachable from the save fn registered
  // below without re-registering on every keystroke. The save fn
  // captures `stateRef.current` rather than the values directly. The
  // ref is updated via effect (not during render) per React's strict
  // refs rule.
  const stateRef = useRef({
    name,
    description,
    configuredGames,
    scheduledAt,
    notifyPreset,
    announceCustomAt,
    autoActivate,
    opensQueue,
    recurrence,
    recurrenceUntil,
  });
  useEffect(() => {
    stateRef.current = {
      name,
      description,
      configuredGames,
      scheduledAt,
      notifyPreset,
      announceCustomAt,
      autoActivate,
      opensQueue,
      recurrence,
      recurrenceUntil,
    };
  });

  // Register a save fn with the page-level save bar. Validation lives
  // here so the user gets an inline error when their input is invalid
  // (rather than crashing the whole save-bar batch).
  useEffect(() => {
    const id = "session-details";
    registerSection(
      id,
      async () => {
        const cur = stateRef.current;
        const trimmedName = cur.name.trim();
        if (!trimmedName) {
          const msg = "Name is required.";
          setError(msg);
          return { ok: false, error: msg };
        }
        const payload: Parameters<typeof updateSessionDetailsAction>[1] = {
          name: trimmedName,
          description: cur.description.trim() || null,
        };
        if (lifecycleEditable) {
          payload.configuredGames = cur.configuredGames;
          // Empty scheduled_at = "no schedule"; the session fires its
          // go-live events whenever the streamer activates manually.
          // Filled = scheduled session with the cron picking it up.
          if (cur.scheduledAt) {
            const ms = Date.parse(cur.scheduledAt);
            if (!Number.isFinite(ms)) {
              const msg = "Invalid scheduled date.";
              setError(msg);
              return { ok: false, error: msg };
            }
            if (ms <= Date.now()) {
              const msg = "Schedule a time in the future.";
              setError(msg);
              return { ok: false, error: msg };
            }
            payload.scheduledAt = new Date(ms).toISOString();

            // Resolve the notify preset → announce_at + open_mode.
            // - "none" → no notification; open_mode follows auto-activate only.
            // - preset offsets → announce_at = scheduled - offset.
            // - "custom" → use the explicit picker value.
            let announceAtIso: string | null = null;
            if (cur.notifyPreset === "custom") {
              if (!cur.announceCustomAt) {
                const msg = "Pick a custom notification time, or choose a preset.";
                setError(msg);
                return { ok: false, error: msg };
              }
              const announceMs = Date.parse(cur.announceCustomAt);
              if (!Number.isFinite(announceMs)) {
                const msg = "Invalid notification date.";
                setError(msg);
                return { ok: false, error: msg };
              }
              if (announceMs <= Date.now()) {
                const msg = "Notification time must be in the future.";
                setError(msg);
                return { ok: false, error: msg };
              }
              if (announceMs > ms) {
                const msg =
                  "Notification time must be at or before the session start.";
                setError(msg);
                return { ok: false, error: msg };
              }
              announceAtIso = new Date(announceMs).toISOString();
            } else if (cur.notifyPreset !== "none") {
              const offset = PRESET_OFFSET_MS[cur.notifyPreset];
              const announceMs = ms - offset;
              if (announceMs <= Date.now()) {
                const msg = `Schedule further out — the ${cur.notifyPreset} notification window has already passed.`;
                setError(msg);
                return { ok: false, error: msg };
              }
              announceAtIso = new Date(announceMs).toISOString();
            }

            // open_mode mapping:
            //   - auto-activate ON         → 'auto_open' (regardless of announce_at)
            //   - notify preset !== "none" → 'announce_only'
            //   - neither                  → null (legacy scheduled→ready path)
            payload.openMode = cur.autoActivate
              ? "auto_open"
              : cur.notifyPreset !== "none"
                ? "announce_only"
                : null;
            payload.announceAt = announceAtIso;
            // opens_queue only meaningful when there's an advance
            // notification (announce_at set). Otherwise the field is
            // moot — the queue opens at activation regardless.
            payload.opensQueue =
              cur.notifyPreset !== "none" ? cur.opensQueue : true;

            // Recurrence — null = one-shot. Validate the cutoff is
            // after the start time (a cutoff before scheduled_at means
            // no instances would ever materialize).
            if (cur.recurrence === "none") {
              payload.recurrence = null;
              payload.recurrenceUntil = null;
            } else {
              payload.recurrence = cur.recurrence;
              if (cur.recurrenceUntil) {
                const cutoffMs = Date.parse(cur.recurrenceUntil);
                if (!Number.isFinite(cutoffMs)) {
                  const msg = "Invalid 'Repeat until' date.";
                  setError(msg);
                  return { ok: false, error: msg };
                }
                if (cutoffMs <= ms) {
                  const msg =
                    "'Repeat until' must be after the session start time.";
                  setError(msg);
                  return { ok: false, error: msg };
                }
                payload.recurrenceUntil = new Date(cutoffMs).toISOString();
              } else {
                payload.recurrenceUntil = null;
              }
            }
          } else {
            payload.scheduledAt = null;
            // Clearing the schedule clears the policy + announce too —
            // they're only meaningful with a scheduled_at.
            payload.openMode = null;
            payload.announceAt = null;
            payload.opensQueue = true;
            payload.recurrence = null;
            payload.recurrenceUntil = null;
          }
        }
        const result = await updateSessionDetailsAction(slug, payload);
        if (!result.ok) {
          const msg = result.error ?? "Save failed.";
          setError(msg);
          return { ok: false, error: msg };
        }
        setError(null);
        router.refresh();
        return { ok: true };
      },
      { label: "Session details" },
    );
    return () => unregisterSection(id);
  }, [registerSection, unregisterSection, slug, lifecycleEditable, router]);

  // Dirty tracking — any field divergence from the server-known initial
  // snapshot. We don't update the snapshot here (server-refresh on save
  // success will re-render with new initial props if the page re-fetches
  // — for now we accept a "dirty until reload" minor wrinkle).
  const initialDerived = useMemo(() => {
    const preset = presetFromAnnounceAt(initial.scheduledAt, initial.announceAt);
    return {
      scheduledLocal: initial.scheduledAt
        ? toLocalIsoMinute(initial.scheduledAt)
        : "",
      preset,
      customLocal:
        preset === "custom" && initial.announceAt
          ? toLocalIsoMinute(initial.announceAt)
          : "",
      autoActivate: initial.openMode === "auto_open",
    };
  }, [initial.scheduledAt, initial.announceAt, initial.openMode]);

  useEffect(() => {
    const dirty =
      name !== initial.name ||
      (description || "") !== (initial.description ?? "") ||
      JSON.stringify(configuredGames) !==
        JSON.stringify(initial.configuredGames) ||
      scheduledAt !== initialDerived.scheduledLocal ||
      notifyPreset !== initialDerived.preset ||
      announceCustomAt !== initialDerived.customLocal ||
      autoActivate !== initialDerived.autoActivate ||
      opensQueue !== initial.opensQueue ||
      recurrence !== (initial.recurrence ?? "none") ||
      recurrenceUntil !==
        (initial.recurrenceUntil
          ? toLocalIsoMinute(initial.recurrenceUntil)
          : "");
    setDirty("session-details", dirty);
  }, [
    name,
    description,
    configuredGames,
    scheduledAt,
    notifyPreset,
    announceCustomAt,
    autoActivate,
    opensQueue,
    recurrence,
    recurrenceUntil,
    initial,
    initialDerived,
    setDirty,
  ]);

  return (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Session details</h2>

      {!lifecycleEditable && (
        <Alert variant="info">
          This session is <strong>{status}</strong>. Name and description are
          still editable, but the games + schedule are locked from this point.
        </Alert>
      )}

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
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
            reorderable={configuredGames.length >= 2}
          />
          <p className="hub-form__platform-disabled">
            Pick every game you plan to host. With 2+ games, drag the tiles
            to set the play order — GameShuffle uses index 0 as the
            starting game and adapts as Twitch tells us what&rsquo;s
            currently playing. Each game keeps its own picks/bans + module
            config under the Modules tab. Leave empty for a pure queue
            session.
          </p>
        </div>


        <div className="hub-form__field">
          <span className="hub-form__label">Schedule (optional)</span>
          {lifecycleEditable ? (
            <div className="hub-form__schedule-inputs">
              <DatePickerModal
                value={scheduledAt}
                onChange={setScheduledAt}
                showTime
                fullWidth
                placeholder="Pick a session start time, or leave empty"
              />
              {scheduledAt && (
                <button
                  type="button"
                  className="hub-form__clear-schedule"
                  onClick={() => setScheduledAt("")}
                >
                  Clear schedule
                </button>
              )}
              {!scheduledAt && (
                <p className="hub-form__platform-disabled">
                  Leave empty to start whenever you manually activate.
                  Pick a date to schedule the session and configure
                  the pre-session notification below.
                </p>
              )}
              {scheduledAt && (
                <>
                  <p className="hub-form__platform-disabled">
                    Times are stored in UTC and shown in each viewer&rsquo;s
                    local zone — once you set your timezone in{" "}
                    <a href="/account?tab=profile">Account → Profile</a>{" "}
                    (coming soon), the live view + overlay will surface
                    the converted time so PST viewers see PST, EST sees
                    EST, etc. For now, schedules render in the
                    streamer&rsquo;s browser zone.
                  </p>

                  <div className="hub-form__schedule-policy">
                    <span className="hub-form__label">
                      Pre-session notification
                    </span>
                    <p className="hub-form__platform-disabled">
                      When the notification fires, GameShuffle posts a
                      heads-up on Discord, opens the lobby so viewers can{" "}
                      <code>!gs-join</code>, and (once you go live)
                      flips your Twitch category to{" "}
                      <strong>
                        {configuredGames[0] ?? "your first game"}
                      </strong>
                      .
                    </p>

                    <RadioGroup
                      name="notify_preset"
                      orientation="vertical"
                      value={notifyPreset}
                      onChange={(v) => setNotifyPreset(v as NotifyPreset)}
                    >
                      <Radio
                        value="none"
                        label="Don't notify in advance"
                        helperText="Session sits scheduled; nothing posts until you manually activate."
                      />
                      <Radio value="30m" label="30 minutes before" />
                      <Radio value="1h" label="1 hour before" />
                      <Radio value="2h" label="2 hours before" />
                      <Radio value="24h" label="24 hours before" />
                      <Radio
                        value="custom"
                        label="Custom time"
                        helperText="Pick an exact moment for the notification + queue open."
                      />
                    </RadioGroup>

                    {notifyPreset === "custom" && (
                      <div className="hub-form__announce-block">
                        <label className="hub-form__field">
                          <span className="hub-form__label">
                            Notify at
                          </span>
                          <DatePickerModal
                            value={announceCustomAt}
                            onChange={setAnnounceCustomAt}
                            showTime
                            fullWidth
                            placeholder="Pick a date and time"
                          />
                        </label>
                        <p className="hub-form__platform-disabled">
                          Must be in the future and at or before your
                          session start time.
                        </p>
                      </div>
                    )}

                    {notifyPreset !== "none" && (
                      <label className="hub-form__inline-field hub-form__inline-field--row">
                        <Switch
                          checked={opensQueue}
                          onChange={() => setOpensQueue((v) => !v)}
                        />
                        <span>
                          <strong>
                            {opensQueue
                              ? "Open the queue when the notification fires"
                              : "Reminder only — keep the queue closed"}
                          </strong>
                          <span className="hub-form__platform-disabled">
                            {opensQueue
                              ? "Viewers can !gs-join as soon as the Discord notification goes out."
                              : "The Discord notification fires on schedule, but viewers can't !gs-join until you manually activate the session."}
                          </span>
                        </span>
                      </label>
                    )}
                  </div>

                  <label className="hub-form__inline-field hub-form__inline-field--row">
                    <Switch
                      checked={autoActivate}
                      onChange={() => setAutoActivate((v) => !v)}
                    />
                    <span>
                      <strong>Auto-activate at start time</strong>
                      <span className="hub-form__platform-disabled">
                        Skip the manual go-live step — GameShuffle flips
                        the session to active when your scheduled start
                        time arrives.
                      </span>
                    </span>
                  </label>

                  <div className="hub-form__schedule-policy">
                    <span className="hub-form__label">Repeat</span>
                    <p className="hub-form__platform-disabled">
                      Make this a recurring session. After each instance
                      ends, GameShuffle creates the next one with the
                      same configuration at the next slot.
                    </p>
                    <RadioGroup
                      name="recurrence_picker"
                      orientation="vertical"
                      value={recurrence}
                      onChange={(v) =>
                        setRecurrence(
                          v as "none" | "daily" | "weekly" | "monthly",
                        )
                      }
                    >
                      <Radio
                        value="none"
                        label="One-shot"
                        helperText="Just this session, no repeats."
                      />
                      <Radio value="daily" label="Every day" />
                      <Radio value="weekly" label="Every week" />
                      <Radio value="monthly" label="Every month" />
                    </RadioGroup>

                    {recurrence !== "none" && (
                      <div className="hub-form__announce-block">
                        <label className="hub-form__field">
                          <span className="hub-form__label">
                            Repeat until (optional)
                          </span>
                          <DatePickerModal
                            value={recurrenceUntil}
                            onChange={setRecurrenceUntil}
                            showTime
                            fullWidth
                            placeholder="Pick a cutoff date, or leave empty"
                          />
                          {recurrenceUntil && (
                            <button
                              type="button"
                              className="hub-form__clear-schedule"
                              onClick={() => setRecurrenceUntil("")}
                            >
                              Clear cutoff
                            </button>
                          )}
                        </label>
                        <p className="hub-form__platform-disabled">
                          Leave empty to keep repeating indefinitely.
                          Fill in to stop materializing instances once
                          the next slot would exceed this date.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="hub-form__platform-disabled">
              {initial.scheduledAt
                ? `Scheduled for ${new Date(initial.scheduledAt).toLocaleString()}`
                : "No schedule — fired on manual activation"}
            </p>
          )}
        </div>

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
