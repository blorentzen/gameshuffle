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
 * UX: events render as compact cards in a grid, grouped by surface
 * (chaos / random / both). Off + Default apply instantly from the card;
 * Override opens a modal holding the flavor editor + the direct-trigger
 * switch, so the grid never reflows. Direct-trigger is exposed only for
 * non-mention events — mention events are always direct-triggerable by
 * their event_key, so the flag is meaningless there.
 *
 * The non-clobber guarantee: platform admin edits to flavor_tmpl never
 * overwrite a streamer's `flavor_tmpl_override`. The override row
 * survives every platform update.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Modal,
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

const STATE_BADGE: Record<State, string> = {
  off: "Off",
  default: "Default",
  override: "Override",
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
  // scrollHeight once on open. Async data changes our size after that,
  // so we ping window-resize (which CDS already listens for) to trigger
  // a re-measure.
  const sectionRef = useNotifyAccordionResize<HTMLDivElement>();
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftFlavor, setDraftFlavor] = useState<Record<string, string>>({});
  const [draftDirect, setDraftDirect] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Override editor modal — the event being overridden + its own error.
  const [overrideRow, setOverrideRow] = useState<EventRow | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

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

  // Off / Default apply immediately from the card. Override routes
  // through the modal (openOverride) so it isn't handled here.
  const setState = async (row: EventRow, next: "off" | "default") => {
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
      } else {
        // Off — disable the event, clear any override values.
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
      }
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const openOverride = (row: EventRow) => {
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
    const flavor = (draftFlavor[row.id] ?? "").trim();
    if (!flavor) {
      setModalError("Flavor text is required.");
      return;
    }
    setSavingId(row.id);
    setModalError(null);
    try {
      const res = await fetch("/api/account/event-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: row.id,
          enabled: true,
          flavor_tmpl_override: flavor,
          trigger_directly_override:
            row.partner_mode === "mention"
              ? null
              : draftDirect[row.id] ?? row.trigger_directly,
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
            <code>!random</code>, or directly by their <code>event_key</code>{" "}
            when enabled. For each event, pick <strong>Off</strong>, use the
            curated <strong>Default</strong>, or write your own{" "}
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

      {SURFACE_ORDER.map((surface) => {
        const list = grouped.get(surface) ?? [];
        if (list.length === 0) return null;
        return (
          <div key={surface} style={{ marginBottom: "var(--spacing-24)" }}>
            <h4 className="dc-cat-title">{SURFACE_LABEL[surface]}</h4>
            <div className="chat-commands__grid">
              {list.map((row) => {
                const current = stateOf(row);
                const isSaving = savingId === row.id;
                const isMention = row.partner_mode === "mention";
                const directable = isMention || row.trigger_directly;
                return (
                  <Card
                    key={row.id}
                    variant="outlined"
                    padding="medium"
                    className="chat-commands__card"
                  >
                    <div className="chat-commands__row-meta">
                      <code className="chat-commands__trigger">
                        {directable ? `!${row.event_key}` : row.event_key}
                      </code>
                      <span
                        className={`dc-card__status dc-card__status--${current}`}
                      >
                        {STATE_BADGE[current]}
                      </span>
                    </div>

                    <p className="chat-commands__response">
                      {PARTNER_MODE_LABEL[row.partner_mode]}
                      {row.partner_count !== null &&
                        ` · cap ${row.partner_count}`}
                    </p>

                    {/* One-line context for the current state. */}
                    {current === "override" &&
                      row.override?.flavor_tmpl_override && (
                        <p className="dc-card__preview">
                          <strong>Your flavor:</strong>{" "}
                          {row.override.flavor_tmpl_override}
                        </p>
                      )}
                    {current === "default" && (
                      <p className="dc-card__preview">{row.flavor_tmpl}</p>
                    )}
                    {current === "off" && (
                      <p className="dc-card__preview dc-card__preview--muted">
                        Won&rsquo;t fire — including from draws.
                      </p>
                    )}

                    <div className="dc-card__controls">
                      <RadioGroup
                        name={`event-state-${row.id}`}
                        orientation="horizontal"
                        value={current}
                        onChange={(v) => {
                          const next = v as State;
                          if (next === "override") {
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
                        {AUTHORITY_LABEL[row.min_authority]}
                        {directable ? " · direct" : ""}
                      </span>
                    </div>

                    {current === "override" && (
                      <div className="dc-card__edit">
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => openOverride(row)}
                          disabled={isSaving}
                        >
                          Edit override
                        </Button>
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
        title={overrideRow ? `Override ${overrideRow.event_key}` : ""}
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
            <p className="dc-modal__default">
              <strong>Platform flavor:</strong> {overrideRow.flavor_tmpl}
            </p>
            <label className="hub-form__field">
              <span className="hub-form__label">Your flavor template</span>
              <VariableAutocomplete
                value={draftFlavor[overrideRow.id] ?? ""}
                onChange={(v) =>
                  setDraftFlavor((prev) => ({
                    ...prev,
                    [overrideRow.id]: v,
                  }))
                }
                rows={3}
                placeholder={overrideRow.flavor_tmpl}
                ariaLabel={`Flavor override for ${overrideRow.event_key}`}
              />
            </label>
            <p className="hub-form__platform-disabled">
              Type <code>{`{`}</code> for variable autofill. Same{" "}
              <code>{`{name}`}</code> set as platform templates.
            </p>

            {overrideRow.partner_mode !== "mention" && (
              <label
                className="hub-form__inline-field hub-form__inline-field--row"
                style={{ marginTop: "var(--spacing-16)" }}
              >
                <Switch
                  checked={
                    draftDirect[overrideRow.id] ?? overrideRow.trigger_directly
                  }
                  onChange={() =>
                    setDraftDirect((prev) => ({
                      ...prev,
                      [overrideRow.id]: !(
                        prev[overrideRow.id] ?? overrideRow.trigger_directly
                      ),
                    }))
                  }
                />
                <span>
                  <strong>
                    Direct trigger (<code>!{overrideRow.event_key}</code>)
                  </strong>
                  <span className="hub-form__platform-disabled">
                    When on, viewers in your community can fire this event
                    directly. Platform default:{" "}
                    {overrideRow.trigger_directly ? "on" : "off (draw only)"}.
                  </span>
                </span>
              </label>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
