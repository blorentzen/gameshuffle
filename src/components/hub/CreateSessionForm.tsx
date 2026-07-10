"use client";

/**
 * Session creation form — single page with progressive disclosure
 * (Accordion). Per gs-pro-v1-phase-4b-spec.md §4.
 *
 * Sections:
 *   1. Name + description (always visible at top)
 *   2. Platforms — Twitch by default; Discord placeholder per
 *      Discord-verification doc (integration not yet shipped)
 *   3. Schedule — "Start now" or "Schedule for later"
 *   4. Modules — placeholder for Phase 4B+ module config
 *   5. Advanced — test session toggle
 *
 * Form submits via the createSessionAction Server Action; on success the
 * action redirects to the new session detail page. On validation
 * failure it returns fieldErrors which we surface inline.
 */

import { useActionState, useState } from "react";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Checkbox,
  DatePickerModal,
  Input,
  Radio,
  RadioGroup,
  Switch,
  Textarea,
} from "@empac/cascadeds";
import {
  createSessionAction,
  type CreateSessionFormResult,
} from "@/app/hub/sessions/new/actions";

interface Props {
  twitchConnected: boolean;
  twitchHandle: string | null;
  /** When true, default the "Test session" toggle on. Set by the test-
   *  session entry on Hub home, which routes here so the streamer goes
   *  through the same draft → configure → activate flow as a real
   *  session. */
  defaultTestSession?: boolean;
}

/**
 * Spec 02 §170 layered-control presets — bundle a schedule + fan-out
 * policy into one choice, with the raw per-transition controls tucked
 * behind "custom". Each maps onto the same engine models the server
 * action already reads (`scheduled_at` / `notify_preset` / `auto_activate`).
 *   - manual        → no schedule; opens on manual activate / go-live attach
 *   - auto_open     → scheduled; announce ahead + open the lobby automatically
 *   - announce_only → scheduled; announce ahead, streamer opens manually
 *   - custom        → expose every raw control
 */
type SchedulePreset = "manual" | "auto_open" | "announce_only" | "custom";

const PRESET_HELP: Record<SchedulePreset, string> = {
  manual:
    "No set time. The lobby opens when you activate the session — or automatically when you go live on Twitch. Best for spontaneous streams.",
  auto_open:
    "Pick a start time. GameShuffle announces ahead of time, then opens the lobby automatically the moment it arrives.",
  announce_only:
    "Pick a start time. GameShuffle announces ahead of time; you open the lobby yourself when you're ready to go.",
  custom:
    "Set the start time, how far ahead to announce, and whether the lobby auto-opens — every control, à la carte.",
};

const initialState: CreateSessionFormResult | null = null;

export function CreateSessionForm({
  twitchConnected,
  twitchHandle,
  defaultTestSession = false,
}: Props) {
  const [state, formAction, pending] = useActionState(
    createSessionAction,
    initialState
  );

  // Local mirrored state for inputs that need controlled rendering
  // (DatePickerModal in particular needs a string `value` to drive its
  // popover). The hidden inputs below carry the actual value into the
  // FormData payload.
  const [scheduledAt, setScheduledAt] = useState<string>("");
  // Pre-session notification — same model as SessionDetailsForm.
  // "none" = no advance notice; presets compute announce_at as
  // scheduled_at - offset; "custom" exposes an explicit picker.
  const [notifyPreset, setNotifyPreset] = useState<
    "none" | "30m" | "1h" | "2h" | "24h" | "custom"
  >("1h");
  const [announceCustomAt, setAnnounceCustomAt] = useState<string>("");
  // Auto-activate at session start. Maps to open_mode = 'auto_open'.
  const [autoActivate, setAutoActivate] = useState<boolean>(false);
  const [attachTwitch, setAttachTwitch] = useState<boolean>(twitchConnected);
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  // Spec 02 §170 — the bundled schedule preset. Defaults to "manual"
  // (the legacy no-schedule behavior).
  const [preset, setPreset] = useState<SchedulePreset>("manual");

  const fieldErrors = state?.fieldErrors ?? {};
  const topError = state && !state.ok && state.error ? state.error : null;

  // Resolve the raw form fields from the preset + the underlying UI
  // state. These feed the hidden inputs below — the single source of
  // truth for FormData, so the visible controls can use `*_ui` names and
  // never collide. The server action is unchanged.
  const isScheduledPreset = preset !== "manual";
  const effScheduledAt = preset === "manual" ? "" : scheduledAt;
  const effAutoActivate =
    preset === "auto_open"
      ? true
      : preset === "custom"
        ? autoActivate
        : false;
  const effNotifyPreset =
    preset === "custom" ? notifyPreset : preset === "manual" ? "none" : "1h";
  const effAnnounceCustom =
    preset === "custom" && notifyPreset === "custom" ? announceCustomAt : "";
  // A scheduled preset with no start time yet — block submit so the
  // streamer doesn't silently get a manual draft when they meant to
  // schedule.
  const scheduleIncomplete = isScheduledPreset && !scheduledAt;

  const accordionItems = [
    {
      id: "platforms",
      title: "Platforms",
      description: attachTwitch
        ? `Twitch attached${twitchHandle ? ` (${twitchHandle})` : ""}`
        : "No platforms attached",
      content: (
        <div className="hub-form__field-stack">
          <label className="hub-form__platform-row">
            <Checkbox
              checked={attachTwitch}
              onChange={(e) => setAttachTwitch(e.target.checked)}
              disabled={!twitchConnected}
            />
            <span className="hub-form__platform-label">
              <strong>Twitch</strong>
              {twitchConnected ? (
                <span className="hub-form__platform-handle">
                  {twitchHandle ?? "(connected)"}
                </span>
              ) : (
                <span className="hub-form__platform-disabled">
                  Not connected — set up the streamer integration in{" "}
                  <a href="/account?tab=integrations">Account → Integrations</a>{" "}
                  first.
                </span>
              )}
            </span>
          </label>
          {fieldErrors.attach_twitch && (
            <p className="hub-form__field-error">{fieldErrors.attach_twitch}</p>
          )}
          {/* Hidden input mirrors checkbox state into FormData. */}
          <input
            type="hidden"
            name="attach_twitch"
            value={attachTwitch ? "on" : "off"}
          />

          <div className="hub-form__platform-row hub-form__platform-row--disabled">
            <Checkbox checked={false} disabled />
            <span className="hub-form__platform-label">
              <strong>Discord</strong>{" "}
              <Badge variant="default" size="small">
                Coming soon
              </Badge>
              <span className="hub-form__platform-disabled">
                Discord streamer integration ships in a follow-up — Twitch
                + Discord sessions arrive together.
              </span>
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "schedule",
      title: "Schedule + fan-out",
      description:
        preset === "manual"
          ? "Go live only — opens when you activate"
          : effScheduledAt
            ? `${
                preset === "auto_open"
                  ? "Auto-open"
                  : preset === "announce_only"
                    ? "Announce"
                    : "Custom"
              } · ${effScheduledAt}`
            : "Pick a start time",
      content: (
        <div className="hub-form__field-stack">
          <div className="hub-form__schedule-policy">
            <span className="hub-form__label">
              How should this session start?
            </span>
            <RadioGroup
              name="schedule_preset_ui"
              orientation="vertical"
              value={preset}
              onChange={(v) => setPreset(v as SchedulePreset)}
            >
              <Radio value="manual" label="Go live only — no set time" />
              <Radio value="auto_open" label="Schedule + auto-open the lobby" />
              <Radio
                value="announce_only"
                label="Schedule + announce (you open it)"
              />
              <Radio value="custom" label="Customize…" />
            </RadioGroup>
            <p className="hub-form__platform-disabled">{PRESET_HELP[preset]}</p>
          </div>

          {isScheduledPreset && (
            <label className="hub-form__field">
              <span className="hub-form__label">Start time</span>
              <DatePickerModal
                value={scheduledAt}
                onChange={setScheduledAt}
                showTime
                fullWidth
                placeholder="Pick a session start time"
                error={!!fieldErrors.scheduled_at}
              />
              {fieldErrors.scheduled_at && (
                <p className="hub-form__field-error">
                  {fieldErrors.scheduled_at}
                </p>
              )}
              {scheduleIncomplete && (
                <p className="hub-form__platform-disabled">
                  Pick a start time to schedule this session.
                </p>
              )}
            </label>
          )}

          {isScheduledPreset && preset !== "custom" && (
            <p className="hub-form__platform-disabled">
              {preset === "auto_open" ? (
                <>
                  We&rsquo;ll announce <strong>1&nbsp;hour</strong> ahead and
                  open the lobby automatically at the start time.
                </>
              ) : (
                <>
                  We&rsquo;ll announce <strong>1&nbsp;hour</strong> ahead; open
                  the lobby yourself from the session controls when you&rsquo;re
                  ready.
                </>
              )}{" "}
              Need a different lead time? Choose <em>Customize</em>.
            </p>
          )}

          {preset === "custom" && (
            <div className="hub-form__schedule-policy">
              <span className="hub-form__label">Pre-session notification</span>
              <p className="hub-form__platform-disabled">
                When the notification fires, GameShuffle pings Discord and
                opens the lobby so viewers can <code>!gs-join</code> ahead of
                go-live.
              </p>

              <RadioGroup
                name="notify_preset_ui"
                orientation="vertical"
                value={notifyPreset}
                onChange={(v) => setNotifyPreset(v as typeof notifyPreset)}
              >
                <Radio value="none" label="Don't notify in advance" />
                <Radio value="30m" label="30 minutes before" />
                <Radio value="1h" label="1 hour before" />
                <Radio value="2h" label="2 hours before" />
                <Radio value="24h" label="24 hours before" />
                <Radio value="custom" label="Custom time" />
              </RadioGroup>

              {notifyPreset === "custom" && (
                <div className="hub-form__announce-block">
                  <DatePickerModal
                    value={announceCustomAt}
                    onChange={setAnnounceCustomAt}
                    showTime
                    fullWidth
                    placeholder="Pick a date and time"
                  />
                </div>
              )}

              <label className="hub-form__inline-field hub-form__inline-field--row">
                <Switch
                  checked={autoActivate}
                  onChange={() => setAutoActivate((v) => !v)}
                />
                <span>
                  <strong>Auto-activate at start time</strong>
                  <span className="hub-form__platform-disabled">
                    GameShuffle flips the session to active when your scheduled
                    start time arrives.
                  </span>
                </span>
              </label>
            </div>
          )}

          {fieldErrors.notify_preset && (
            <p className="hub-form__field-error">{fieldErrors.notify_preset}</p>
          )}

          {/* Hidden inputs — the resolved, preset-driven values the server
              action reads. Visible controls above use *_ui names so they
              never collide with these. */}
          <input type="hidden" name="scheduled_at" value={effScheduledAt} />
          <input type="hidden" name="notify_preset" value={effNotifyPreset} />
          <input
            type="hidden"
            name="announce_custom_at"
            value={effAnnounceCustom}
          />
          <input
            type="hidden"
            name="auto_activate"
            value={effAutoActivate ? "on" : "off"}
          />
        </div>
      ),
    },
    {
      id: "modules",
      title: "Modules",
      description: "Default modules (kart randomizer + chat commands)",
      content: (
        <div className="hub-form__field-stack">
          <p className="hub-form__platform-disabled">
            Default modules ship with every session: kart randomizer, lobby
            commands, and the broadcaster overlay. Module-specific configuration
            (picks &amp; bans rules, etc.) is available on the session&rsquo;s{" "}
            <em>Configure</em> page after creation.
          </p>
        </div>
      ),
    },
  ];

  return (
    <form action={formAction} className="hub-form">
      {topError && (
        <Alert variant="error">
          {topError}
        </Alert>
      )}

      <div className="hub-form__field-stack">
        <label className="hub-form__field">
          <span className="hub-form__label">Name *</span>
          <Input
            name="name"
            placeholder="Mario Kart Wednesday"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            error={!!fieldErrors.name}
            fullWidth
          />
          {fieldErrors.name && (
            <p className="hub-form__field-error">{fieldErrors.name}</p>
          )}
        </label>
        <label className="hub-form__field">
          <span className="hub-form__label">Description (optional)</span>
          <Textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="A short blurb about this session — shown on the public recap page."
            fullWidth
          />
        </label>
      </div>

      <Accordion items={accordionItems} allowMultiple variant="bordered" />

      {/* Test/live is decided by the entry point (Sessions vs. Test
          streams tab on Hub home, or the ?test=true URL param here).
          Hidden so the action can persist it without a redundant UI
          control. */}
      <input
        type="hidden"
        name="is_test_session"
        value={defaultTestSession ? "on" : "off"}
      />

      <div className="hub-form__summary">
        <h3>Review</h3>
        <ul>
          <li>
            {attachTwitch && twitchHandle
              ? `Twitch session "${name || "(unnamed)"}"`
              : `Session "${name || "(unnamed)"}"`}
          </li>
          <li>
            {preset === "manual"
              ? "No schedule — opens on activation / go-live"
              : effScheduledAt
                ? `${
                    preset === "auto_open"
                      ? "Auto-opens"
                      : preset === "announce_only"
                        ? "Announced"
                        : "Scheduled"
                  } for ${effScheduledAt}`
                : "Schedule selected — pick a start time"}
          </li>
          <li>{defaultTestSession ? "Test session" : "Live session"}</li>
        </ul>
      </div>

      <div className="hub-form__actions">
        <a href="/hub" className="hub-form__cancel">
          Cancel
        </a>
        <Button
          type="submit"
          variant="primary"
          disabled={pending || scheduleIncomplete}
        >
          {pending ? "Creating…" : effScheduledAt ? "Schedule" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}
