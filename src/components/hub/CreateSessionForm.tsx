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

  const fieldErrors = state?.fieldErrors ?? {};
  const topError = state && !state.ok && state.error ? state.error : null;

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
      title: "Schedule (optional)",
      description: scheduledAt
        ? `Scheduled for ${scheduledAt}`
        : "Empty — fires the moment you activate the session",
      content: (
        <div className="hub-form__field-stack">
          <DatePickerModal
            value={scheduledAt}
            onChange={setScheduledAt}
            showTime
            fullWidth
            placeholder="Pick a session start time, or leave empty"
            error={!!fieldErrors.scheduled_at}
          />
          <input type="hidden" name="scheduled_at" value={scheduledAt} />
          {fieldErrors.scheduled_at && (
            <p className="hub-form__field-error">{fieldErrors.scheduled_at}</p>
          )}
          {!scheduledAt && (
            <p className="hub-form__platform-disabled">
              Leave empty to start whenever you manually activate. Pick
              a date to schedule the session and set up the pre-session
              notification.
            </p>
          )}
          {scheduledAt && (
            <>
              <div className="hub-form__schedule-policy">
                <span className="hub-form__label">
                  Pre-session notification
                </span>
                <p className="hub-form__platform-disabled">
                  When the notification fires, GameShuffle pings Discord
                  and opens the lobby so viewers can{" "}
                  <code>!gs-join</code> ahead of go-live.
                </p>

                <RadioGroup
                  name="notify_preset"
                  orientation="vertical"
                  value={notifyPreset}
                  onChange={(v) =>
                    setNotifyPreset(v as typeof notifyPreset)
                  }
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
                    <input
                      type="hidden"
                      name="announce_custom_at"
                      value={announceCustomAt}
                    />
                  </div>
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
                    GameShuffle flips the session to active when your
                    scheduled start time arrives.
                  </span>
                </span>
              </label>
              <input
                type="hidden"
                name="auto_activate"
                value={autoActivate ? "on" : "off"}
              />
            </>
          )}
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
            {scheduledAt
              ? `Scheduled for ${scheduledAt}`
              : "No schedule — fires on manual activation"}
          </li>
          <li>{defaultTestSession ? "Test session" : "Live session"}</li>
        </ul>
      </div>

      <div className="hub-form__actions">
        <a href="/hub" className="hub-form__cancel">
          Cancel
        </a>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : scheduledAt ? "Schedule" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}
