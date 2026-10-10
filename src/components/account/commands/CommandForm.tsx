"use client";

/**
 * The trigger / who can use it / reply / cooldown fields for one of a
 * streamer's own chat commands, used by Add and Edit on Streaming ▸ Chat ▸
 * Commands (moved out of the old ChatCommandsTab, 2026-10-10).
 */

import { Input, Select } from "@empac/cascadeds";
import { VariableAutocomplete } from "../VariableAutocomplete";

export type CommandActor = "everyone" | "crew" | "host";

export const ACTOR_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "crew", label: "Mods + broadcaster" },
  { value: "host", label: "Broadcaster only" },
];

export const ACTOR_LABEL: Record<CommandActor, string> = {
  everyone: "Everyone",
  crew: "Mods + broadcaster",
  host: "Broadcaster only",
};

const LABEL_STYLE = {
  display: "block",
  marginBottom: "var(--spacing-8)",
} as const;

/**
 * The trigger / who-can-run / response / cooldown field set — shared by
 * the Add and Edit flows (both render it inside the modal) so they can't
 * drift.
 */
export function CommandFormFields({
  trigger,
  onTrigger,
  actor,
  onActor,
  response,
  onResponse,
  cooldown,
  onCooldown,
  responseAria,
  showTriggerHint = false,
}: {
  trigger: string;
  onTrigger: (v: string) => void;
  actor: CommandActor;
  onActor: (v: CommandActor) => void;
  response: string;
  onResponse: (v: string) => void;
  cooldown: string;
  onCooldown: (v: string) => void;
  responseAria: string;
  showTriggerHint?: boolean;
}) {
  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--spacing-16)",
        }}
      >
        <div>
          <label className="account-card__label" style={LABEL_STYLE}>
            Trigger
          </label>
          <Input
            type="text"
            value={trigger}
            onChange={(e) => onTrigger(e.target.value)}
            placeholder="!discord"
            fullWidth
          />
          {showTriggerHint && (
            <p
              style={{
                margin: "var(--spacing-4) 0 0",
                fontSize: "var(--font-size-12)",
                color: "var(--text-tertiary)",
              }}
            >
              Include the leading <code>!</code>. Single word only.
            </p>
          )}
        </div>
        <div>
          <label className="account-card__label" style={LABEL_STYLE}>
            Who can run it
          </label>
          <Select
            options={ACTOR_OPTIONS}
            value={actor}
            onChange={(v) =>
              onActor(
                (Array.isArray(v) ? v[0] : v) as CommandActor,
              )
            }
            fullWidth
          />
        </div>
      </div>
      <div style={{ marginTop: "var(--spacing-16)" }}>
        <label className="account-card__label" style={LABEL_STYLE}>
          Response
        </label>
        {/* Both `$name` and `{name}` syntaxes substitute against the same
            variable set. Autocomplete inserts the `{}` form (canonical);
            legacy `$name` in existing commands keeps working. */}
        <VariableAutocomplete
          value={response}
          onChange={onResponse}
          placeholder="👋 Welcome to the stream, {user}!"
          rows={3}
          ariaLabel={responseAria}
        />
      </div>
      <div style={{ marginTop: "var(--spacing-16)", maxWidth: "200px" }}>
        <label className="account-card__label" style={LABEL_STYLE}>
          Cooldown (seconds)
        </label>
        <Input
          type="number"
          min={0}
          max={3600}
          value={cooldown}
          onChange={(e) => onCooldown(e.target.value)}
          fullWidth
        />
      </div>
    </>
  );
}

