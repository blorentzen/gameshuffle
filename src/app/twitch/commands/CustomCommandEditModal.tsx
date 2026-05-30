"use client";

/**
 * Edit-as-modal for custom commands. Covers both add and edit flows
 * since they share the same field set. Per UX feedback: inline edit
 * was too cramped to expose the variable cheat-sheet alongside the
 * inputs.
 *
 * The variable picker shows three groups:
 *   1. Caller variables — $user, $touser, $random, $count
 *   2. Helix variables  — $uptime, $followage, $accountage
 *   3. Streamer profile — $discord, $twitch, $psn, $nso, $xbox,
 *                          $steam, $epic. Tooltip flags which the
 *                          streamer has filled in under /account.
 *
 * Clicking a chip inserts the variable token at the textarea's
 * current cursor position.
 */

import { useRef, useState } from "react";
import { Modal } from "@empac/cascadeds";
import type { CustomCommandRow } from "@/lib/twitch/commands/customCommands";
import type { ActorTier } from "@/lib/twitch/commands/registry";

const ACTOR_OPTIONS: { value: ActorTier; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "player", label: "Players (joined session)" },
  { value: "crew", label: "Mods" },
  { value: "host", label: "Host (streamer)" },
];

export interface ProfileVarStatus {
  discord?: boolean;
  twitch?: boolean;
  psn?: boolean;
  nso?: boolean;
  xbox?: boolean;
  steam?: boolean;
  epic?: boolean;
  youtube?: boolean;
  twitter?: boolean;
  tiktok?: boolean;
  instagram?: boolean;
  bluesky?: boolean;
  threads?: boolean;
}

interface VariableChip {
  token: string;
  label: string;
  hint?: string;
  set?: boolean;
}

interface Props {
  isOpen: boolean;
  /** Existing row when editing; null when adding. */
  row: CustomCommandRow | null;
  /** Streamer's profile field-status. Drives the "Set" / "Not set" badge
   *  on profile-derived variable chips. */
  profileStatus: ProfileVarStatus;
  busy: boolean;
  /** Surface server-side errors inline so the user sees them while the
   *  modal is still open. Cleared by re-attempting save. */
  error?: string | null;
  onSave: (payload: {
    trigger?: string;
    responseTmpl?: string;
    actor?: ActorTier;
    cooldownSeconds?: number;
  }) => Promise<void>;
  onClose: () => void;
}

export function CustomCommandEditModal({
  isOpen,
  row,
  profileStatus,
  busy,
  error,
  onSave,
  onClose,
}: Props) {
  // Form state. The parent re-mounts this component via `key` when the
  // edited row changes (or when switching add ↔ edit), so initial
  // state from props is correct without a sync-effect reset.
  const [trigger, setTrigger] = useState(row?.trigger ?? "");
  const [response, setResponse] = useState(row?.response_tmpl ?? "");
  const [actor, setActor] = useState<ActorTier>(row?.actor ?? "everyone");
  const [cooldown, setCooldown] = useState(String(row?.cooldown_s ?? 5));
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertAtCursor = (token: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setResponse((prev) => prev + token);
      return;
    }
    const start = ta.selectionStart ?? response.length;
    const end = ta.selectionEnd ?? response.length;
    const next = response.slice(0, start) + token + response.slice(end);
    setResponse(next);
    // Restore cursor position after the inserted token.
    requestAnimationFrame(() => {
      ta.focus();
      const newPos = start + token.length;
      ta.setSelectionRange(newPos, newPos);
    });
  };

  const callerVars: VariableChip[] = [
    { token: "$user", label: "$user", hint: "Caller's display name" },
    { token: "$touser", label: "$touser", hint: "First @mention arg" },
    { token: "$random", label: "$random", hint: "Random 0–99" },
    { token: "$count", label: "$count", hint: "Times used" },
  ];

  const helixVars: VariableChip[] = [
    { token: "$uptime", label: "$uptime", hint: "Stream uptime" },
    { token: "$followage", label: "$followage", hint: "Caller follow age" },
    { token: "$accountage", label: "$accountage", hint: "Caller account age" },
  ];

  const profileVars: VariableChip[] = [
    { token: "$discord", label: "$discord", hint: "Your Discord handle", set: profileStatus.discord },
    { token: "$twitch", label: "$twitch", hint: "Your Twitch handle", set: profileStatus.twitch },
    { token: "$psn", label: "$psn", hint: "Your PSN ID", set: profileStatus.psn },
    { token: "$nso", label: "$nso", hint: "Your NSO friend code", set: profileStatus.nso },
    { token: "$xbox", label: "$xbox", hint: "Your Xbox gamertag", set: profileStatus.xbox },
    { token: "$steam", label: "$steam", hint: "Your Steam handle", set: profileStatus.steam },
    { token: "$epic", label: "$epic", hint: "Your Epic display name", set: profileStatus.epic },
  ];

  const socialVars: VariableChip[] = [
    { token: "$youtube", label: "$youtube", hint: "Your YouTube handle", set: profileStatus.youtube },
    { token: "$twitter", label: "$twitter", hint: "Your Twitter / X handle", set: profileStatus.twitter },
    { token: "$tiktok", label: "$tiktok", hint: "Your TikTok handle", set: profileStatus.tiktok },
    { token: "$instagram", label: "$instagram", hint: "Your Instagram handle", set: profileStatus.instagram },
    { token: "$bluesky", label: "$bluesky", hint: "Your Bluesky handle", set: profileStatus.bluesky },
    { token: "$threads", label: "$threads", hint: "Your Threads handle", set: profileStatus.threads },
  ];

  const canSave = trigger.trim().length > 0 && response.trim().length > 0;

  const handleSave = async () => {
    const cooldownNum = parseInt(cooldown, 10);
    if (!Number.isInteger(cooldownNum) || cooldownNum < 0) return;
    if (!row) {
      // Add — every field required.
      await onSave({
        trigger: trigger.trim(),
        responseTmpl: response.trim(),
        actor,
        cooldownSeconds: cooldownNum,
      });
      return;
    }
    // Edit — only send changed fields.
    const patch: Parameters<typeof onSave>[0] = {};
    if (trigger.trim() !== row.trigger) patch.trigger = trigger.trim();
    if (response !== row.response_tmpl) patch.responseTmpl = response;
    if (actor !== row.actor) patch.actor = actor;
    if (cooldownNum !== row.cooldown_s) patch.cooldownSeconds = cooldownNum;
    await onSave(patch);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={row ? `Edit ${row.trigger}` : "Add custom command"}
      size="large"
      primaryAction={{
        label: busy ? "Saving…" : "Save",
        onClick: () => void handleSave(),
      }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="cc-edit-modal">
        <div className="cc-edit-modal__fields">
          <label className="cc-edit-modal__field">
            Trigger
            <input
              type="text"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="!socials"
              disabled={busy}
            />
            <span className="cc-edit-modal__hint">
              Lowercased, alphanumeric + dashes/underscores. The leading{" "}
              <code>!</code> is added automatically if you skip it.
            </span>
          </label>

          <label className="cc-edit-modal__field">
            Response
            <textarea
              ref={textareaRef}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={4}
              placeholder="Catch me at https://twitch.tv/$twitch"
              disabled={busy}
            />
            <span className="cc-edit-modal__hint">
              Use the variable chips below to insert dynamic values. The chat
              renderer replaces them at fire time.
            </span>
          </label>

          <div className="cc-edit-modal__row">
            <label className="cc-edit-modal__field cc-edit-modal__field--inline">
              Actor
              <select
                value={actor}
                onChange={(e) => setActor(e.target.value as ActorTier)}
                disabled={busy}
              >
                {ACTOR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="cc-edit-modal__field cc-edit-modal__field--inline">
              Cooldown (s)
              <input
                type="number"
                min={0}
                value={cooldown}
                onChange={(e) => setCooldown(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>
        </div>

        <div className="cc-edit-modal__pickers">
          <VarPicker title="Caller" vars={callerVars} onInsert={insertAtCursor} />
          <VarPicker title="Stream" vars={helixVars} onInsert={insertAtCursor} />
          <VarPicker
            title="Gamertags & connections"
            vars={profileVars}
            onInsert={insertAtCursor}
            footer={
              <a href="/account" className="cc-edit-modal__profile-link">
                Manage in /account →
              </a>
            }
          />
          <VarPicker
            title="Socials"
            vars={socialVars}
            onInsert={insertAtCursor}
            footer={
              <a href="/account" className="cc-edit-modal__profile-link">
                Add socials in /account →
              </a>
            }
          />
        </div>

        {error && (
          <p className="cc-edit-modal__error" role="alert">
            {error}
          </p>
        )}

        {!canSave && (
          <p className="cc-edit-modal__warn">
            Trigger and response are both required.
          </p>
        )}
      </div>
    </Modal>
  );
}

function VarPicker({
  title,
  vars,
  onInsert,
  footer,
}: {
  title: string;
  vars: VariableChip[];
  onInsert: (token: string) => void;
  footer?: React.ReactNode;
}) {
  return (
    <div className="cc-edit-modal__picker">
      <h4 className="cc-edit-modal__picker-title">{title}</h4>
      <div className="cc-edit-modal__chips">
        {vars.map((v) => (
          <button
            key={v.token}
            type="button"
            className={`cc-edit-modal__chip${v.set === false ? " cc-edit-modal__chip--unset" : ""}`}
            onClick={() => onInsert(v.token)}
            title={v.hint}
          >
            <span className="cc-edit-modal__chip-token">{v.label}</span>
            {v.set !== undefined && (
              <span className="cc-edit-modal__chip-status">
                {v.set ? "set" : "not set"}
              </span>
            )}
          </button>
        ))}
      </div>
      {footer}
    </div>
  );
}
