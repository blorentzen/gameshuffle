"use client";

/**
 * DefaultCommandOverridesSection — streamer-facing tri-state control
 * over the platform's built-in chat commands (!hype, !discord, …).
 *
 * Per command, three states:
 *   - Off         — turn the command off for this community.
 *   - Default     — use the platform-curated template as-is. Engine
 *                   reads `response_template` from `gs_default_commands`.
 *   - Override    — replace the response with the streamer's custom
 *                   text. Engine reads `custom_response` from the
 *                   per-community override row.
 *
 * UX: commands render as compact cards in a grid, grouped by category.
 * The Off/Default/Override toggle lives on the card — Off and Default
 * apply instantly (the common case). Override opens a modal to write the
 * custom text (where the {variable} autocomplete has room), so the grid
 * never reflows. Platform template updates never overwrite an override —
 * a streamer on Default always tracks the latest curated line.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Modal,
  Radio,
  RadioGroup,
} from "@empac/cascadeds";
import { VariableAutocomplete } from "./VariableAutocomplete";
import { CommandPoolModal } from "./CommandPoolModal";
import { useNotifyAccordionResize } from "./useNotifyAccordionResize";
import {
  AUTHORITY_LABEL,
  type ChatAuthority,
} from "@/lib/twitch/commands/authority";

type Category = "info" | "fun" | "engagement" | "wholesome" | "game";
type Authority = ChatAuthority;

interface CommandRow {
  id: string;
  trigger: string;
  aliases: string[];
  category: Category;
  response_template: string | null;
  handler: string | null;
  description: string;
  default_enabled: boolean;
  enabled: boolean;
  cooldown_seconds: number;
  min_authority: Authority;
  override: {
    enabled: boolean;
    custom_response: string | null;
  } | null;
  /** Response-pool entry counts. `platform > 0` ⇒ this is a pool command
   *  (8ball, quote, …) that gets the "Manage responses" editor. */
  pool?: { platform: number; community: number };
}

type State = "off" | "default" | "override";

const CATEGORY_LABEL: Record<Category, string> = {
  info: "Info",
  fun: "Fun",
  engagement: "Engagement",
  wholesome: "Wholesome",
  game: "Game",
};

const CATEGORY_ORDER: Category[] = [
  "info",
  "engagement",
  "fun",
  "wholesome",
  "game",
];

const STATE_BADGE: Record<State, string> = {
  off: "Off",
  default: "Default",
  override: "Override",
};

function stateOf(row: CommandRow): State {
  if (!row.override) {
    return row.default_enabled ? "default" : "off";
  }
  if (!row.override.enabled) return "off";
  if (row.override.custom_response) return "override";
  return "default";
}

interface Props {
  /** Skip the internal h3 + intro paragraph — used when the section
   *  lives inside an Accordion that owns its own title. */
  hideHeader?: boolean;
}

export function DefaultCommandOverridesSection({ hideHeader = false }: Props = {}) {
  // When wrapped in a CDS Accordion, the parent measures content
  // scrollHeight once on open. Async data changes our size after that
  // measurement, so we ping window-resize (which CDS already listens
  // for) to trigger a re-measure.
  const sectionRef = useNotifyAccordionResize<HTMLDivElement>();
  const [rows, setRows] = useState<CommandRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftResponse, setDraftResponse] = useState<Record<string, string>>(
    {},
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  // Override editor modal — holds the row being overridden + its own
  // error so failures surface without closing the modal.
  const [overrideRow, setOverrideRow] = useState<CommandRow | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Response-pool editor modal (pool commands only).
  const [poolRow, setPoolRow] = useState<CommandRow | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/account/default-command-overrides", {
        cache: "no-store",
      });
      if (res.status === 404) {
        // Streamer hasn't connected Twitch yet — section stays hidden
        // via the noCommunity branch in the parent tab.
        setRows([]);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Load failed (${res.status}).`);
        setRows([]);
        return;
      }
      const list = body.commands as CommandRow[];
      setRows(list);
      // Seed editable drafts with whatever each command's current
      // resolved response is — so opening Override pre-fills with the
      // platform default for easy tweaking.
      const drafts: Record<string, string> = {};
      for (const r of list) {
        drafts[r.id] =
          r.override?.custom_response ?? r.response_template ?? "";
      }
      setDraftResponse(drafts);
    } catch {
      setLoadError("Network error while loading.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Off / Default apply immediately from the card. Override routes
  // through the modal (see openOverride) so it isn't handled here.
  const setState = async (row: CommandRow, next: "off" | "default") => {
    setSavingId(row.id);
    setLoadError(null);
    try {
      if (next === "default") {
        const res = await fetch(
          `/api/account/default-command-overrides?command_id=${encodeURIComponent(row.id)}`,
          { method: "DELETE" },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) {
          setLoadError(body.error || `Save failed (${res.status}).`);
          return;
        }
      } else {
        // Off — disable the command with no custom text.
        const res = await fetch("/api/account/default-command-overrides", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command_id: row.id,
            enabled: false,
            custom_response: null,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) {
          setLoadError(body.error || `Save failed (${res.status}).`);
          return;
        }
      }
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const openOverride = (row: CommandRow) => {
    setModalError(null);
    setOverrideRow(row);
  };

  const closeOverride = () => {
    if (savingId && overrideRow && savingId === overrideRow.id) return;
    setOverrideRow(null);
    setModalError(null);
  };

  const handleOverrideSave = async () => {
    const row = overrideRow;
    if (!row) return;
    const custom = (draftResponse[row.id] ?? "").trim();
    if (!custom) {
      setModalError("Response text is required.");
      return;
    }
    setSavingId(row.id);
    setModalError(null);
    try {
      const res = await fetch("/api/account/default-command-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command_id: row.id,
          enabled: true,
          custom_response: custom,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setModalError(body.error || `Save failed (${res.status}).`);
        return;
      }
      setOverrideRow(null);
      await load();
    } catch {
      setModalError("Network error while saving.");
    } finally {
      setSavingId(null);
    }
  };

  if (rows === null) {
    return (
      <div ref={sectionRef} className="account-tab__section">
        <h3 className="account-tab__section-title">Platform defaults</h3>
        <p className="account-tab__empty">Loading…</p>
      </div>
    );
  }

  // Group by category — Info first because that's what new streamers
  // care about (discord, schedule, socials).
  const grouped = new Map<Category, CommandRow[]>();
  for (const cat of CATEGORY_ORDER) grouped.set(cat, []);
  for (const r of rows) grouped.get(r.category)?.push(r);

  return (
    <div ref={sectionRef} className="account-tab__section">
      {!hideHeader && (
        <>
          <h3 className="account-tab__section-title">Platform defaults</h3>
          <p className="account-tab__intro" style={{ marginTop: 0 }}>
            Built-in commands every streamer gets (<code>!hype</code>,{" "}
            <code>!discord</code>, <code>!8ball</code>, etc.). For each one,
            pick <strong>Off</strong>, use the curated{" "}
            <strong>Default</strong>, or write your own{" "}
            <strong>Override</strong>. Platform updates never overwrite your
            override.
          </p>
        </>
      )}

      {loadError && (
        <div style={{ marginBottom: "var(--spacing-12)" }}>
          <Alert variant="error" onClose={() => setLoadError(null)}>
            {loadError}
          </Alert>
        </div>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const list = grouped.get(cat) ?? [];
        if (list.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: "var(--spacing-24)" }}>
            <h4 className="dc-cat-title">{CATEGORY_LABEL[cat]}</h4>
            <div className="chat-commands__grid">
              {list.map((row) => {
                const current = stateOf(row);
                const isSaving = savingId === row.id;
                return (
                  <Card
                    key={row.id}
                    variant="outlined"
                    padding="medium"
                    className="chat-commands__card"
                  >
                    <div className="chat-commands__row-meta">
                      <code className="chat-commands__trigger">
                        !{row.trigger}
                        {row.aliases.length > 0 && (
                          <span className="dc-card__aliases">
                            {" "}
                            ({row.aliases.map((a) => `!${a}`).join(", ")})
                          </span>
                        )}
                      </code>
                      <span
                        className={`dc-card__status dc-card__status--${current}`}
                      >
                        {STATE_BADGE[current]}
                      </span>
                    </div>

                    <p className="chat-commands__response">
                      {row.description}
                    </p>

                    {/* One-line context for the current state. */}
                    {current === "override" &&
                      row.override?.custom_response && (
                        <p className="dc-card__preview">
                          <strong>Your response:</strong>{" "}
                          {row.override.custom_response}
                        </p>
                      )}
                    {current === "default" && row.response_template && (
                      <p className="dc-card__preview">
                        {row.response_template}
                      </p>
                    )}
                    {current === "off" && (
                      <p className="dc-card__preview dc-card__preview--muted">
                        Hidden from chat.
                      </p>
                    )}

                    <div className="dc-card__controls">
                      <RadioGroup
                        name={`state-${row.id}`}
                        orientation="horizontal"
                        value={current}
                        onChange={(v) => {
                          const next = v as State;
                          if (next === "override") {
                            // Don't flip state yet — the modal saves it.
                            openOverride(row);
                          } else {
                            void setState(row, next);
                          }
                        }}
                      >
                        <Radio value="off" label="Off" />
                        <Radio value="default" label="Default" />
                        <Radio value="override" label="Override" />
                      </RadioGroup>
                      <span className="dc-card__meta">
                        {AUTHORITY_LABEL[row.min_authority]} ·{" "}
                        {row.cooldown_seconds}s
                      </span>
                    </div>

                    {(current === "override" ||
                      (row.pool?.platform ?? 0) > 0) && (
                      <div className="dc-card__actions">
                        {current === "override" && (
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => openOverride(row)}
                            disabled={isSaving}
                          >
                            Edit response
                          </Button>
                        )}
                        {(row.pool?.platform ?? 0) > 0 && (
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => setPoolRow(row)}
                            disabled={isSaving}
                          >
                            Manage responses
                            {(row.pool?.community ?? 0) > 0
                              ? ` (${row.pool?.community})`
                              : ""}
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      <Modal
        isOpen={overrideRow !== null}
        onClose={closeOverride}
        title={overrideRow ? `Override !${overrideRow.trigger}` : ""}
        size="medium"
        primaryAction={{
          label:
            overrideRow && savingId === overrideRow.id
              ? "Saving…"
              : "Save override",
          onClick: () => void handleOverrideSave(),
        }}
        secondaryAction={{ label: "Cancel", onClick: closeOverride }}
      >
        {overrideRow && (
          <>
            {modalError && (
              <div style={{ marginBottom: "var(--spacing-12)" }}>
                <Alert variant="error" onClose={() => setModalError(null)}>
                  {modalError}
                </Alert>
              </div>
            )}
            {overrideRow.response_template && (
              <p className="dc-modal__default">
                <strong>Platform default:</strong>{" "}
                {overrideRow.response_template}
              </p>
            )}
            <label className="hub-form__field">
              <span className="hub-form__label">Your response</span>
              <VariableAutocomplete
                value={draftResponse[overrideRow.id] ?? ""}
                onChange={(v) =>
                  setDraftResponse((prev) => ({
                    ...prev,
                    [overrideRow.id]: v,
                  }))
                }
                rows={3}
                placeholder={overrideRow.response_template ?? "Custom response…"}
                ariaLabel={`Custom response for !${overrideRow.trigger}`}
              />
            </label>
            <p className="hub-form__platform-disabled">
              Uses the same <code>{`{name}`}</code> variables as platform
              commands. Start typing <code>{`{`}</code> for autofill.
            </p>
          </>
        )}
      </Modal>

      {poolRow && (
        <CommandPoolModal
          commandId={poolRow.id}
          trigger={poolRow.trigger}
          isOpen={poolRow !== null}
          onClose={() => setPoolRow(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
