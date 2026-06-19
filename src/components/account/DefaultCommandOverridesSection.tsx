"use client";

/**
 * DefaultCommandOverridesSection — streamer-facing tri-state
 * control for the platform default-command library.
 *
 * Lives inside `ChatCommandsTab` under the streamer's custom-
 * commands editor. Lists every enabled platform command grouped by
 * category, and lets the streamer pick one of three states per
 * command:
 *
 *   - Off         — turn the command off for this community.
 *                   Engine skips the catalog row entirely.
 *   - Default     — use the platform-curated template as-is. Engine
 *                   reads `response_template` from `gs_default_commands`.
 *                   Deleting the override row maps to this state.
 *   - Override    — replace the response with the streamer's
 *                   custom text. Engine reads `custom_response`
 *                   from the override row.
 *
 * Why tri-state instead of two toggles? It separates intent. A
 * streamer who wants the canon hype line stays in "Default" and
 * future platform updates flow through (e.g. admin adds an emoji).
 * A streamer who flipped to "Override" pinned their version on
 * purpose — platform updates don't clobber it, see the non-clobber
 * guarantee in the API.
 *
 * Authority + cooldown values stay platform-managed (not overridable
 * here) so the per-community semantics don't drift wildly from
 * what the catalog promises.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Radio,
  RadioGroup,
} from "@empac/cascadeds";
import { VariableAutocomplete } from "./VariableAutocomplete";
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
  // scrollHeight once on open. Async data + Override edits change
  // our size after that measurement, so we ping window-resize
  // (which CDS already listens for) to trigger a re-measure.
  const sectionRef = useNotifyAccordionResize<HTMLDivElement>();
  const [rows, setRows] = useState<CommandRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftResponse, setDraftResponse] = useState<Record<string, string>>(
    {},
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/account/default-command-overrides", {
        cache: "no-store",
      });
      if (res.status === 404) {
        // Streamer hasn't connected Twitch yet — section stays
        // hidden via the noCommunity branch in the parent tab.
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
      // resolved response is — so flipping to Override pre-fills
      // with the platform default for easy tweaking.
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

  const setState = async (row: CommandRow, next: State) => {
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
        const enabled = next === "override";
        const custom_response =
          next === "override" ? draftResponse[row.id] ?? "" : null;
        const res = await fetch("/api/account/default-command-overrides", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command_id: row.id,
            enabled,
            custom_response,
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

  const saveCustomResponse = async (row: CommandRow) => {
    setSavingId(row.id);
    setLoadError(null);
    try {
      const res = await fetch("/api/account/default-command-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command_id: row.id,
          enabled: true,
          custom_response: draftResponse[row.id] ?? "",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Save failed (${res.status}).`);
        return;
      }
      await load();
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

  // Group by category for visual structure — InfoFirst feels right
  // because that's what new streamers care about (discord, schedule,
  // socials).
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
            <code>!discord</code>, <code>!8ball</code>, etc.). For each
            one, pick <strong>Off</strong>, use the curated{" "}
            <strong>Default</strong>, or write your own{" "}
            <strong>Override</strong>. Platform updates never overwrite
            your override.
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
            <h4
              style={{
                fontSize: "var(--font-size-14)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--text-secondary)",
                margin:
                  "var(--spacing-16) 0 var(--spacing-8)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {CATEGORY_LABEL[cat]}
            </h4>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--spacing-12)",
              }}
            >
              {list.map((row) => {
                const current = stateOf(row);
                const isSaving = savingId === row.id;
                return (
                  <Card
                    key={row.id}
                    variant="outlined"
                    padding="medium"
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "var(--spacing-16)",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <code
                          style={{
                            fontSize: "var(--font-size-16)",
                            fontWeight:
                              "var(--font-weight-semibold)",
                          }}
                        >
                          !{row.trigger}
                          {row.aliases.length > 0 && (
                            <span
                              style={{
                                marginLeft: "var(--spacing-6)",
                                color: "var(--text-tertiary)",
                                fontSize: "var(--font-size-12)",
                                fontWeight: 400,
                              }}
                            >
                              ({row.aliases
                                .map((a) => `!${a}`)
                                .join(", ")})
                            </span>
                          )}
                        </code>
                        <p
                          style={{
                            margin:
                              "var(--spacing-4) 0 0",
                            fontSize:
                              "var(--font-size-12)",
                            color:
                              "var(--text-secondary)",
                          }}
                        >
                          {row.description}{" "}
                          <span
                            style={{
                              color:
                                "var(--text-tertiary)",
                            }}
                          >
                            · {AUTHORITY_LABEL[row.min_authority]} ·{" "}
                            {row.cooldown_seconds}s cooldown
                          </span>
                        </p>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        <RadioGroup
                          name={`state-${row.id}`}
                          orientation="horizontal"
                          value={current}
                          onChange={(v) =>
                            void setState(row, v as State)
                          }
                        >
                          <Radio value="off" label="Off" />
                          <Radio value="default" label="Default" />
                          <Radio
                            value="override"
                            label="Override"
                          />
                        </RadioGroup>
                      </div>
                    </div>

                    {current === "default" && row.response_template && (
                      <div
                        style={{
                          marginTop: "var(--spacing-12)",
                          padding:
                            "var(--spacing-8) var(--spacing-12)",
                          background: "var(--surface-secondary)",
                          borderRadius:
                            "var(--radius-medium)",
                          fontSize: "var(--font-size-12)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <strong>Platform default:</strong>{" "}
                        {row.response_template}
                      </div>
                    )}

                    {current === "override" && (
                      <div
                        style={{ marginTop: "var(--spacing-12)" }}
                      >
                        <label className="hub-form__field">
                          <span className="hub-form__label">
                            Your response
                          </span>
                          <VariableAutocomplete
                            value={draftResponse[row.id] ?? ""}
                            onChange={(v) =>
                              setDraftResponse((prev) => ({
                                ...prev,
                                [row.id]: v,
                              }))
                            }
                            rows={2}
                            placeholder={
                              row.response_template ?? "Custom response…"
                            }
                            ariaLabel={`Custom response for !${row.trigger}`}
                          />
                          <p className="hub-form__platform-disabled">
                            Uses the same <code>{`{name}`}</code>{" "}
                            variables as platform commands. Start
                            typing <code>{`{`}</code> for autofill.
                          </p>
                        </label>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: "var(--spacing-8)",
                            marginTop: "var(--spacing-8)",
                          }}
                        >
                          <Button
                            size="small"
                            variant="primary"
                            onClick={() =>
                              void saveCustomResponse(row)
                            }
                            loading={isSaving}
                            disabled={isSaving}
                          >
                            Save override
                          </Button>
                        </div>
                      </div>
                    )}

                    {current === "off" && (
                      <p
                        style={{
                          marginTop: "var(--spacing-12)",
                          padding:
                            "var(--spacing-8) var(--spacing-12)",
                          background: "var(--surface-tertiary)",
                          borderRadius:
                            "var(--radius-medium)",
                          fontSize: "var(--font-size-12)",
                          color: "var(--text-tertiary)",
                          margin: 0,
                        }}
                      >
                        This command is hidden from your chat. Switch
                        to Default or Override to re-enable.
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
