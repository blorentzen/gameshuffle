"use client";

/**
 * EventOverridesSection — streamer-facing tri-state control for
 * platform events. Mirrors `DefaultCommandOverridesSection`:
 *
 *   - Off       — turn the event off for this community.
 *   - Default   — use the platform-curated flavor + trigger config.
 *                 Deleting the override row maps to this state.
 *   - Override  — pin a custom flavor template (and/or flip the
 *                 direct-trigger flag for this community only).
 *
 * Direct-trigger override is exposed as a separate switch only for
 * non-mention events — mention events are always direct-triggerable
 * by their event_key, so the flag is meaningless there.
 *
 * The non-clobber guarantee: platform admin edits to flavor_tmpl
 * never overwrite a streamer's `flavor_tmpl_override`. Same wall as
 * default-command overrides — the override row survives every
 * platform update.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Radio,
  RadioGroup,
  Switch,
} from "@empac/cascadeds";
import { VariableAutocomplete } from "./VariableAutocomplete";
import { useNotifyAccordionResize } from "./useNotifyAccordionResize";
import {
  AUTHORITY_LABEL,
  type ChatAuthority,
} from "@/lib/twitch/commands/authority";

type EventSurface = "chaos" | "random" | "both";
type PartnerMode =
  | "none"
  | "mention"
  | "random_active"
  | "random_n"
  | "all_active";
type EventAuthority = ChatAuthority;

interface EventRow {
  id: string;
  event_key: string;
  surface: EventSurface;
  flavor_tmpl: string;
  partner_mode: PartnerMode;
  partner_count: number | null;
  enabled: boolean;
  trigger_directly: boolean;
  min_authority: EventAuthority;
  override: {
    enabled: boolean;
    flavor_tmpl_override: string | null;
    trigger_directly_override: boolean | null;
  } | null;
}

type State = "off" | "default" | "override";

const PARTNER_MODE_LABEL: Record<PartnerMode, string> = {
  none: "Single viewer",
  mention: "Mention",
  random_active: "Random partner",
  random_n: "Random K viewers",
  all_active: "All active",
};

const SURFACE_ORDER: EventSurface[] = ["chaos", "random", "both"];

const SURFACE_LABEL: Record<EventSurface, string> = {
  chaos: "Chaos deck (paid)",
  random: "Random deck (free)",
  both: "Chaos + Random",
};

function stateOf(row: EventRow): State {
  if (!row.override) return "default";
  if (!row.override.enabled) return "off";
  if (
    row.override.flavor_tmpl_override ||
    row.override.trigger_directly_override !== null
  ) {
    return "override";
  }
  return "default";
}

interface Props {
  /** Skip the internal h3 + intro paragraph — used when the section
   *  lives inside an Accordion that owns its own title. */
  hideHeader?: boolean;
}

export function EventOverridesSection({ hideHeader = false }: Props = {}) {
  // When wrapped in a CDS Accordion, the parent measures content
  // scrollHeight once on open. Async data + Override edits change
  // our size after that, so we ping window-resize (which CDS
  // already listens for) to trigger a re-measure.
  const sectionRef = useNotifyAccordionResize<HTMLDivElement>();
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftFlavor, setDraftFlavor] = useState<Record<string, string>>({});
  const [draftDirect, setDraftDirect] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/account/event-overrides", {
        cache: "no-store",
      });
      if (res.status === 404) {
        setRows([]);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Load failed (${res.status}).`);
        setRows([]);
        return;
      }
      const list = body.events as EventRow[];
      setRows(list);
      const flavors: Record<string, string> = {};
      const directs: Record<string, boolean> = {};
      for (const r of list) {
        flavors[r.id] = r.override?.flavor_tmpl_override ?? r.flavor_tmpl;
        directs[r.id] =
          r.override?.trigger_directly_override ?? r.trigger_directly;
      }
      setDraftFlavor(flavors);
      setDraftDirect(directs);
    } catch {
      setLoadError("Network error while loading.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setState = async (row: EventRow, next: State) => {
    setSavingId(row.id);
    setLoadError(null);
    try {
      if (next === "default") {
        const res = await fetch(
          `/api/account/event-overrides?event_id=${encodeURIComponent(row.id)}`,
          { method: "DELETE" },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) {
          setLoadError(body.error || `Save failed (${res.status}).`);
          return;
        }
      } else if (next === "off") {
        const res = await fetch("/api/account/event-overrides", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: row.id,
            enabled: false,
            flavor_tmpl_override: null,
            trigger_directly_override: null,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) {
          setLoadError(body.error || `Save failed (${res.status}).`);
          return;
        }
      } else {
        // override
        const res = await fetch("/api/account/event-overrides", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: row.id,
            enabled: true,
            flavor_tmpl_override: draftFlavor[row.id] ?? row.flavor_tmpl,
            trigger_directly_override:
              row.partner_mode === "mention"
                ? null
                : draftDirect[row.id] ?? row.trigger_directly,
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

  const saveOverride = async (row: EventRow) => {
    setSavingId(row.id);
    setLoadError(null);
    try {
      const res = await fetch("/api/account/event-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: row.id,
          enabled: true,
          flavor_tmpl_override: draftFlavor[row.id] ?? "",
          trigger_directly_override:
            row.partner_mode === "mention"
              ? null
              : draftDirect[row.id] ?? row.trigger_directly,
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
        <h3 className="account-tab__section-title">Platform events</h3>
        <p className="account-tab__empty">Loading…</p>
      </div>
    );
  }

  const grouped = new Map<EventSurface, EventRow[]>();
  for (const s of SURFACE_ORDER) grouped.set(s, []);
  for (const r of rows) grouped.get(r.surface)?.push(r);

  return (
    <div ref={sectionRef} className="account-tab__section">
      {!hideHeader && (
        <>
          <h3 className="account-tab__section-title">Platform events</h3>
          <p className="account-tab__intro" style={{ marginTop: 0 }}>
            Platform-curated events that fire via <code>!chaos</code>,{" "}
            <code>!random</code>, or directly by their{" "}
            <code>event_key</code> when enabled. For each event, pick{" "}
            <strong>Off</strong>, use the curated{" "}
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

      {SURFACE_ORDER.map((surface) => {
        const list = grouped.get(surface) ?? [];
        if (list.length === 0) return null;
        return (
          <div key={surface} style={{ marginBottom: "var(--spacing-24)" }}>
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
              {SURFACE_LABEL[surface]}
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
                const isMention = row.partner_mode === "mention";
                return (
                  <Card key={row.id} variant="outlined" padding="medium">
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
                          {isMention || row.trigger_directly
                            ? `!${row.event_key}`
                            : row.event_key}
                        </code>
                        <p
                          style={{
                            margin: "var(--spacing-4) 0 0",
                            fontSize: "var(--font-size-12)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {PARTNER_MODE_LABEL[row.partner_mode]}
                          {row.partner_count !== null &&
                            ` · cap ${row.partner_count}`}
                          {(isMention || row.trigger_directly) && (
                            <>
                              {" · "}
                              {AUTHORITY_LABEL[row.min_authority]}{" "}
                              direct trigger
                            </>
                          )}
                        </p>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        <RadioGroup
                          name={`event-state-${row.id}`}
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

                    {current === "default" && (
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
                        <strong>Platform flavor:</strong>{" "}
                        {row.flavor_tmpl}
                      </div>
                    )}

                    {current === "override" && (
                      <div
                        style={{ marginTop: "var(--spacing-12)" }}
                      >
                        <label className="hub-form__field">
                          <span className="hub-form__label">
                            Your flavor template
                          </span>
                          <VariableAutocomplete
                            value={draftFlavor[row.id] ?? ""}
                            onChange={(v) =>
                              setDraftFlavor((prev) => ({
                                ...prev,
                                [row.id]: v,
                              }))
                            }
                            rows={3}
                            placeholder={row.flavor_tmpl}
                            ariaLabel={`Flavor override for ${row.event_key}`}
                          />
                          <p className="hub-form__platform-disabled">
                            Type <code>{`{`}</code> for variable
                            autofill. Same <code>{`{name}`}</code> set
                            as platform templates.
                          </p>
                        </label>

                        {!isMention && (
                          <label
                            className="hub-form__inline-field hub-form__inline-field--row"
                            style={{ marginTop: "var(--spacing-12)" }}
                          >
                            <Switch
                              checked={
                                draftDirect[row.id] ?? row.trigger_directly
                              }
                              onChange={() =>
                                setDraftDirect((prev) => ({
                                  ...prev,
                                  [row.id]: !(
                                    prev[row.id] ?? row.trigger_directly
                                  ),
                                }))
                              }
                            />
                            <span>
                              <strong>
                                Direct trigger (<code>!{row.event_key}</code>)
                              </strong>
                              <span className="hub-form__platform-disabled">
                                When on, viewers in your community can
                                fire this event directly. Platform
                                default:{" "}
                                {row.trigger_directly
                                  ? "on"
                                  : "off (draw only)"}.
                              </span>
                            </span>
                          </label>
                        )}

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: "var(--spacing-8)",
                            marginTop: "var(--spacing-12)",
                          }}
                        >
                          <Button
                            size="small"
                            variant="primary"
                            onClick={() => void saveOverride(row)}
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
                        This event won&rsquo;t fire for your community
                        — including from draws. Switch to Default or
                        Override to re-enable.
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
