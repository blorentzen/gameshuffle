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
}

const initialState: CreateSessionFormResult | null = null;

export function CreateSessionForm({ twitchConnected, twitchHandle }: Props) {
  const [state, formAction, pending] = useActionState(
    createSessionAction,
    initialState
  );

  // Local mirrored state for inputs that need controlled rendering
  // (DatePickerModal in particular needs a string `value` to drive its
  // popover). The hidden inputs below carry the actual value into the
  // FormData payload.
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [eligibilityWindow, setEligibilityWindow] = useState<number>(4);
  const [attachTwitch, setAttachTwitch] = useState<boolean>(twitchConnected);
  const [isTestSession, setIsTestSession] = useState<boolean>(false);
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
      title: "Schedule",
      description:
        scheduleMode === "now"
          ? "Start now (creates a draft you can activate)"
          : `Scheduled for ${scheduledAt || "—"}`,
      content: (
        <div className="hub-form__field-stack">
          <label className="hub-form__radio-row">
            <input
              type="radio"
              name="schedule_mode"
              value="now"
              checked={scheduleMode === "now"}
              onChange={() => setScheduleMode("now")}
            />
            <span>
              <strong>Start now</strong>
              <span className="hub-form__platform-disabled">
                Session is created as a draft. Click <em>Activate</em> on the
                next page to begin.
              </span>
            </span>
          </label>
          <label className="hub-form__radio-row">
            <input
              type="radio"
              name="schedule_mode"
              value="later"
              checked={scheduleMode === "later"}
              onChange={() => setScheduleMode("later")}
            />
            <span>
              <strong>Schedule for later</strong>
              <span className="hub-form__platform-disabled">
                Pick a date and time. The session moves into <em>scheduled</em>{" "}
                state and becomes activatable inside the eligibility window.
              </span>
            </span>
          </label>

          {scheduleMode === "later" && (
            <div className="hub-form__schedule-inputs">
              <DatePickerModal
                value={scheduledAt}
                onChange={setScheduledAt}
                showTime
                fullWidth
                placeholder="Pick a date and time"
                error={!!fieldErrors.scheduled_at}
              />
              <input type="hidden" name="scheduled_at" value={scheduledAt} />
              {fieldErrors.scheduled_at && (
                <p className="hub-form__field-error">
                  {fieldErrors.scheduled_at}
                </p>
              )}
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
                <input
                  type="hidden"
                  name="eligibility_window_hours"
                  value={String(eligibilityWindow)}
                />
              </label>
            </div>
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
    {
      id: "advanced",
      title: "Advanced",
      description: isTestSession ? "Test session enabled" : "—",
      content: (
        <div className="hub-form__field-stack">
          <label className="hub-form__inline-field hub-form__inline-field--row">
            <Switch
              checked={isTestSession}
              onChange={() => setIsTestSession((v) => !v)}
            />
            <span>
              <strong>Test session</strong>
              <span className="hub-form__platform-disabled">
                Marks the session with{" "}
                <code>feature_flags.test_session = true</code>. Bot still
                responds to chat commands; useful for previewing a flow before
                going live.
              </span>
            </span>
          </label>
          <input
            type="hidden"
            name="is_test_session"
            value={isTestSession ? "on" : "off"}
          />
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

      <div className="hub-form__summary">
        <h3>Review</h3>
        <ul>
          <li>
            {attachTwitch && twitchHandle
              ? `Twitch session "${name || "(unnamed)"}"`
              : `Session "${name || "(unnamed)"}"`}
          </li>
          <li>
            {scheduleMode === "now"
              ? "Starting as a draft (activate manually)"
              : `Scheduled for ${scheduledAt || "(time pending)"}`}
          </li>
          <li>{isTestSession ? "Test session" : "Live session"}</li>
        </ul>
      </div>

      <div className="hub-form__actions">
        <a href="/hub" className="hub-form__cancel">
          Cancel
        </a>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : scheduleMode === "later" ? "Schedule" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}
