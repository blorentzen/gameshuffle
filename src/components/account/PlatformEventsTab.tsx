"use client";

/**
 * PlatformEventsTab — staff/admin-only event catalog editor.
 *
 * Single table of every `gs_events` row with inline enabled toggle,
 * surface filter, and edit modal (add / update / delete). The chaos
 * and random event decks both pull from this catalog at fire time,
 * so changes here flow through to live streams instantly.
 *
 * Consequences (token deltas, modifiers, challenges, story beats)
 * are edited inline inside the event modal — `ConsequencesEditor`
 * adds / updates / deletes rows against
 * `/api/admin/events/[id]/consequences[/...]`. Each operation
 * persists immediately; the parent table reloads when the modal
 * closes so the consequences-count column stays in sync.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Input,
  Modal,
  Radio,
  RadioGroup,
  Select,
  Switch,
  Textarea,
} from "@empac/cascadeds";
import { VariableAutocomplete } from "./VariableAutocomplete";
import {
  AUTHORITY_LABEL,
  type ChatAuthority,
} from "@/lib/twitch/commands/authority";

interface FlavorVariable {
  name: string;
  description: string;
  example: string;
}

type Surface = "chaos" | "random" | "both";
type PartnerMode =
  | "none"
  | "mention"
  | "random_active"
  | "random_n"
  | "all_active";
type ConsequenceTarget = "actor" | "partner" | "both";
type EventAuthority = ChatAuthority;

const FANOUT_MODES = new Set<PartnerMode>(["random_n", "all_active"]);


interface ConsequenceRow {
  id: string;
  event_id: string;
  ctype: "token_delta" | "modifier" | "challenge" | "story";
  payload: Record<string, unknown>;
  target: ConsequenceTarget;
}

interface EventRow {
  id: string;
  event_key: string;
  surface: Surface;
  flavor_tmpl: string;
  weight: number;
  game_scope: string | null;
  enabled: boolean;
  partner_mode: PartnerMode;
  partner_count: number | null;
  trigger_directly: boolean;
  min_authority: EventAuthority;
  created_at: string;
  consequences: ConsequenceRow[];
}

const SURFACE_FILTERS: Array<{ value: "all" | Surface; label: string }> = [
  { value: "all", label: "All surfaces" },
  { value: "chaos", label: "Chaos only" },
  { value: "random", label: "Random only" },
  { value: "both", label: "Chaos + Random" },
];

const SURFACE_LABEL: Record<Surface, string> = {
  chaos: "Chaos",
  random: "Random",
  both: "Both",
};

export function PlatformEventsTab() {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [surfaceFilter, setSurfaceFilter] = useState<"all" | Surface>("all");
  const [editing, setEditing] = useState<EventRow | "new" | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/events", { cache: "no-store" });
      if (res.status === 403) {
        setLoadError(
          "Forbidden — this surface is for GameShuffle staff only.",
        );
        setEvents([]);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Failed to load (${res.status}).`);
        setEvents([]);
        return;
      }
      const body = (await res.json()) as { events: EventRow[] };
      setEvents(body.events);
    } catch {
      setLoadError("Network error while loading.");
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered =
    events?.filter(
      (e) => surfaceFilter === "all" || e.surface === surfaceFilter,
    ) ?? [];

  const toggleEnabled = async (row: EventRow) => {
    const next = !row.enabled;
    setEvents(
      (cur) =>
        cur?.map((e) => (e.id === row.id ? { ...e, enabled: next } : e)) ??
        null,
    );
    try {
      const res = await fetch("/api/admin/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          event_key: row.event_key,
          surface: row.surface,
          flavor_tmpl: row.flavor_tmpl,
          weight: row.weight,
          game_scope: row.game_scope,
          enabled: next,
        }),
      });
      if (!res.ok) {
        // Roll back optimistic update.
        setEvents(
          (cur) =>
            cur?.map((e) =>
              e.id === row.id ? { ...e, enabled: row.enabled } : e,
            ) ?? null,
        );
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Toggle failed (${res.status}).`);
      }
    } catch {
      setEvents(
        (cur) =>
          cur?.map((e) =>
            e.id === row.id ? { ...e, enabled: row.enabled } : e,
          ) ?? null,
      );
      setLoadError("Network error while toggling.");
    }
  };

  const handleDelete = async (row: EventRow) => {
    if (
      !confirm(
        `Delete event "${row.event_key}"? Consequences are removed too. This can't be undone.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/events/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Delete failed (${res.status}).`);
        return;
      }
      setEvents((cur) => cur?.filter((e) => e.id !== row.id) ?? null);
    } catch {
      setLoadError("Network error while deleting.");
    }
  };

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Events</h2>
      <p className="account-tab__intro">
        Global catalog for the <code>!chaos</code> and <code>!random</code>{" "}
        event decks. Changes here apply platform-wide on the next fire
        — toggle an event off to remove it from the deck without
        deleting the row.
      </p>

      {loadError && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          <Alert variant="error" onClose={() => setLoadError(null)}>
            {loadError}
          </Alert>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-16)",
          marginBottom: "var(--spacing-16)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: "240px" }}>
          <Select
            options={SURFACE_FILTERS.map((s) => ({
              value: s.value,
              label: s.label,
            }))}
            value={surfaceFilter}
            onChange={(v) =>
              setSurfaceFilter(
                (Array.isArray(v) ? v[0] : v) as "all" | Surface,
              )
            }
            size="small"
            fullWidth
          />
        </div>
        <span
          style={{
            color: "var(--text-tertiary)",
            fontSize: "var(--font-size-12)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontWeight: "var(--font-weight-semibold)",
          }}
        >
          {filtered.length} / {events?.length ?? 0} shown
        </span>
        <div style={{ marginLeft: "auto" }}>
          <Button variant="primary" onClick={() => setEditing("new")}>
            Add event
          </Button>
        </div>
      </div>

      {events === null ? (
        <p className="account-tab__empty">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="account-tab__empty">
          {events.length === 0
            ? "No events in the catalog yet. Add one to seed the decks."
            : "No events match the current filter."}
        </p>
      ) : (
        <table className="platform-events__table">
          <thead>
            <tr>
              <th>Event key</th>
              <th>Surface</th>
              <th>Weight</th>
              <th>Game scope</th>
              <th>Effects</th>
              <th>Enabled</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <code>{row.event_key}</code>
                </td>
                <td>{SURFACE_LABEL[row.surface]}</td>
                <td>{row.weight}</td>
                <td>{row.game_scope ?? "all games"}</td>
                <td>{row.consequences.length}</td>
                <td>
                  <Switch
                    checked={row.enabled}
                    onChange={() => void toggleEnabled(row)}
                  />
                </td>
                <td className="platform-events__actions">
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setEditing(row)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="small"
                    onClick={() => void handleDelete(row)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <EventEditorModal
          row={editing === "new" ? null : editing}
          isOpen={!!editing}
          onClose={() => {
            // Close without an explicit event-metadata save can still
            // have touched consequences (they persist immediately).
            // Reload so the table row's consequences count stays
            // correct.
            setEditing(null);
            void load();
          }}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor modal
// ---------------------------------------------------------------------------

interface EditorProps {
  row: EventRow | null;
  isOpen: boolean;
  onClose: () => void;
  /** Fired when event metadata is saved — parent closes + reloads.
   *  Consequence CRUD is local to the modal; parent picks up changes
   *  whenever the modal eventually closes (Cancel or Save). */
  onSaved: () => void;
}

function EventEditorModal({ row, isOpen, onClose, onSaved }: EditorProps) {

  const [eventKey, setEventKey] = useState(row?.event_key ?? "");
  const [surface, setSurface] = useState<Surface>(row?.surface ?? "chaos");
  const [flavorTmpl, setFlavorTmpl] = useState(row?.flavor_tmpl ?? "");
  const [weight, setWeight] = useState(String(row?.weight ?? 100));
  const [gameScope, setGameScope] = useState(row?.game_scope ?? "");
  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [partnerMode, setPartnerMode] = useState<PartnerMode>(
    row?.partner_mode ?? "none",
  );
  const [partnerCount, setPartnerCount] = useState(
    row?.partner_count !== null && row?.partner_count !== undefined
      ? String(row.partner_count)
      : "10",
  );
  const [triggerDirectly, setTriggerDirectly] = useState(
    row?.trigger_directly ?? false,
  );
  const [minAuthority, setMinAuthority] = useState<EventAuthority>(
    row?.min_authority ?? "viewer",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const trimmedKey = eventKey.trim();
    const trimmedTmpl = flavorTmpl.trim();
    if (!trimmedKey) return setError("Event key is required.");
    if (!trimmedTmpl) return setError("Flavor template is required.");
    const w = parseInt(weight, 10);
    if (!Number.isFinite(w) || w <= 0) {
      return setError("Weight must be a positive integer.");
    }
    if (FANOUT_MODES.has(partnerMode)) {
      const pc = parseInt(partnerCount, 10);
      if (!Number.isInteger(pc) || pc < 1) {
        return setError(
          "Partner count must be a positive integer when the event fans out.",
        );
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row?.id,
          event_key: trimmedKey,
          surface,
          flavor_tmpl: trimmedTmpl,
          weight: w,
          game_scope: gameScope.trim() || null,
          enabled,
          partner_mode: partnerMode,
          partner_count: FANOUT_MODES.has(partnerMode)
            ? parseInt(partnerCount, 10)
            : null,
          trigger_directly: triggerDirectly,
          min_authority: minAuthority,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error || `Save failed (${res.status}).`);
        return;
      }
      onSaved();
    } catch {
      setError("Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      title={row ? `Edit ${row.event_key}` : "Add event"}
      size="medium"
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "var(--spacing-8)",
            width: "100%",
          }}
        >
          <Button variant="tertiary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={save}
            loading={saving}
            disabled={saving}
          >
            Save event
          </Button>
        </div>
      }
    >
      {error && (
        <div style={{ marginBottom: "var(--spacing-12)" }}>
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <div className="hub-form__field-stack">
        <label className="hub-form__field">
          <span className="hub-form__label">Event key</span>
          <Input
            value={eventKey}
            onChange={(e) => setEventKey(e.target.value)}
            placeholder="banana_storm"
            fullWidth
          />
          <p className="hub-form__platform-disabled">
            Stable identifier. Lowercase + underscores. Used in logs
            and the resolver — don&rsquo;t rename once the event has
            fired.
          </p>
        </label>

        <RadioGroup
          name="surface"
          label="Deck"
          orientation="vertical"
          value={surface}
          onChange={(v) => setSurface(v as Surface)}
        >
          <Radio value="chaos" label="Chaos" helperText="!chaos fires from this deck (paid, burns tokens)." />
          <Radio value="random" label="Random" helperText="!random fires from this deck (free, cooldown-gated)." />
          <Radio value="both" label="Both" helperText="Event is eligible for either command." />
        </RadioGroup>

        <RadioGroup
          name="partner_mode"
          label="Participants"
          orientation="vertical"
          value={partnerMode}
          onChange={(v) => setPartnerMode(v as PartnerMode)}
        >
          <Radio
            value="none"
            label="Single viewer"
            helperText="One target. {user}/{from} = that viewer. Drawn by !chaos / !random."
          />
          <Radio
            value="mention"
            label="Two viewers — caller mentions"
            helperText="Caller @-mentions a target. The event key doubles as the chat command — e.g. event_key 'hug' makes !hug @viewer work."
          />
          <Radio
            value="random_active"
            label="Two viewers — random partner"
            helperText="Engine picks one random active viewer as the partner. Wiring lands with the multi-party fanout pass."
          />
          <Radio
            value="random_n"
            label="Multi-party — random K viewers"
            helperText="Engine picks K consenting viewers (set the count below). Used for things like !community_jackpot — random K winners share a prize."
          />
          <Radio
            value="all_active"
            label="Multi-party — everyone active"
            helperText="Fans out to every active viewer (capped by the count below). For events like !happy_hour. Token-negative consequences require viewer opt-in."
          />
        </RadioGroup>

        {FANOUT_MODES.has(partnerMode) && (
          <label className="hub-form__field">
            <span className="hub-form__label">
              {partnerMode === "random_n"
                ? "How many viewers (K)"
                : "Soft cap on fanout"}
            </span>
            <Input
              type="number"
              min={1}
              value={partnerCount}
              onChange={(e) => setPartnerCount(e.target.value)}
              fullWidth
            />
            <p className="hub-form__platform-disabled">
              {partnerMode === "random_n"
                ? "Number of partners the engine picks. Combined with consequence target='partner'/'both', each picked viewer receives the consequence independently."
                : "Maximum viewers to fan out to. Protects the token economy on big streams — a 5000-viewer chat blowing through a token gift event would tank the supply otherwise."}
            </p>
          </label>
        )}

        {(partnerMode === "random_n" || partnerMode === "all_active") && (
          <p
            className="hub-form__platform-disabled"
            style={{
              padding: "var(--spacing-8) var(--spacing-12)",
              background: "var(--surface-secondary)",
              borderRadius: "var(--radius-medium)",
            }}
          >
            <strong>Consent gate:</strong> if any consequence on this
            event subtracts tokens from partners, only viewers who
            opted in via <code>!opt-in</code> are eligible. Events
            with only positive partner consequences fire for any
            recently-active viewer. Engine fanout + the consent
            commands ship in the follow-up.
          </p>
        )}

        <label className="hub-form__field">
          <span className="hub-form__label">Flavor template</span>
          <VariableAutocomplete
            value={flavorTmpl}
            onChange={setFlavorTmpl}
            rows={3}
            placeholder="🍌 {user} {verb} {delta} tokens to a banana storm on {game}!"
            ariaLabel="Flavor template"
          />
          <p className="hub-form__platform-disabled">
            Posted in chat when this event fires. Wrap variables in
            curly braces — see the dictionary below.
          </p>
          <FlavorVariablesDictionary />
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--spacing-16)",
          }}
        >
          <label className="hub-form__field">
            <span className="hub-form__label">Weight</span>
            <Input
              type="number"
              min={1}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              fullWidth
            />
            <p className="hub-form__platform-disabled">
              Higher weight = higher chance to draw. Default 100.
            </p>
          </label>
          <label className="hub-form__field">
            <span className="hub-form__label">Game scope (optional)</span>
            <Input
              value={gameScope}
              onChange={(e) => setGameScope(e.target.value)}
              placeholder="mario-kart-8-deluxe"
              fullWidth
            />
            <p className="hub-form__platform-disabled">
              Restrict to one game key. Empty = all games.
            </p>
          </label>
        </div>

        <label className="hub-form__inline-field hub-form__inline-field--row">
          <Switch
            checked={enabled}
            onChange={() => setEnabled((v) => !v)}
          />
          <span>
            <strong>{enabled ? "Enabled" : "Disabled"}</strong>
            <span className="hub-form__platform-disabled">
              Disabled events stay in the catalog but don&rsquo;t draw.
              Useful for retiring an event without losing its history.
            </span>
          </span>
        </label>

        {partnerMode !== "mention" && (
          <label className="hub-form__inline-field hub-form__inline-field--row">
            <Switch
              checked={triggerDirectly}
              onChange={() => setTriggerDirectly((v) => !v)}
            />
            <span>
              <strong>
                {triggerDirectly
                  ? "Direct trigger enabled"
                  : "Draw-only"}
              </strong>
              <span className="hub-form__platform-disabled">
                When on, the <code>event_key</code> works as a direct
                chat command (e.g. event_key <code>tornado</code> →{" "}
                <code>!tornado</code>). Off keeps the event reachable
                only via <code>!chaos</code> / <code>!random</code>{" "}
                draws. Mention events are always direct-triggerable —
                this toggle doesn&rsquo;t apply to them.
              </span>
            </span>
          </label>
        )}

        {triggerDirectly && partnerMode !== "mention" && (
          <label className="hub-form__field">
            <span className="hub-form__label">
              Who can fire directly
            </span>
            <Select
              value={minAuthority}
              onChange={(v) => setMinAuthority(v as EventAuthority)}
              options={[
                { value: "viewer", label: AUTHORITY_LABEL.viewer },
                { value: "vip", label: AUTHORITY_LABEL.vip },
                { value: "mod", label: AUTHORITY_LABEL.mod },
                { value: "host", label: AUTHORITY_LABEL.host },
              ]}
              fullWidth
            />
            <p className="hub-form__platform-disabled">
              Authority gate for direct invocations only. Draws via{" "}
              <code>!chaos</code> / <code>!random</code> use the
              parent command&rsquo;s gate instead.
            </p>
          </label>
        )}

        {row && (
          <ConsequencesEditor
            eventId={row.id}
            initial={row.consequences}
            partnerMode={partnerMode}
          />
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Consequences editor (inline inside the event modal)
// ---------------------------------------------------------------------------

type Ctype = ConsequenceRow["ctype"];

const CTYPE_LABEL: Record<Ctype, string> = {
  token_delta: "Token delta",
  modifier: "Modifier",
  challenge: "Challenge",
  story: "Story beat",
};

const TARGET_LABEL: Record<ConsequenceTarget, string> = {
  actor: "actor",
  partner: "partner",
  both: "both",
};

function summarizeConsequence(c: ConsequenceRow): string {
  const p = c.payload;
  switch (c.ctype) {
    case "token_delta": {
      const min = typeof p.min === "number" ? p.min : 0;
      const max = typeof p.max === "number" ? p.max : 0;
      const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
      return min === max ? `${sign(min)} tokens` : `${sign(min)} to ${sign(max)} tokens`;
    }
    case "modifier": {
      const effect = typeof p.effect === "string" ? p.effect : "(no effect)";
      const duration = typeof p.duration === "number" ? p.duration : 60;
      const scope = typeof p.scope === "string" ? p.scope : "seconds";
      return `${effect} · ${duration} ${scope}`;
    }
    case "challenge": {
      const vt = typeof p.variable_type === "string" ? p.variable_type : "?";
      const vis = typeof p.visibility === "string" ? p.visibility : "public";
      return `${vt} · ${vis}`;
    }
    case "story":
      return "Narrative beat (no payload)";
  }
}

interface ConsequencesEditorProps {
  eventId: string;
  initial: ConsequenceRow[];
  /** Drives whether the per-consequence target picker is shown.
   *  For single-party events the picker is hidden + every
   *  consequence saves as 'actor' — keeps the form simple in the
   *  90% case. */
  partnerMode: PartnerMode;
}

function ConsequencesEditor({
  eventId,
  initial,
  partnerMode,
}: ConsequencesEditorProps) {
  const [rows, setRows] = useState<ConsequenceRow[]>(initial);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (consequenceId: string) => {
    setError(null);
    const res = await fetch(
      `/api/admin/events/${eventId}/consequences/${consequenceId}`,
      { method: "DELETE" },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      setError(body.error || `Delete failed (${res.status}).`);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== consequenceId));
  };

  const upsert = async (
    ctype: Ctype,
    payload: Record<string, unknown>,
    target: ConsequenceTarget,
    consequenceId: string | null,
  ): Promise<boolean> => {
    setError(null);
    const res = await fetch(`/api/admin/events/${eventId}/consequences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consequence_id: consequenceId ?? undefined,
        ctype,
        payload,
        target,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      setError(body.error || `Save failed (${res.status}).`);
      return false;
    }
    const savedId: string = body.id;
    if (consequenceId) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === savedId ? { ...r, payload, target } : r,
        ),
      );
    } else {
      setRows((prev) => [
        ...prev,
        { id: savedId, event_id: eventId, ctype, payload, target },
      ]);
    }
    setEditingId(null);
    return true;
  };

  return (
    <div className="hub-form__field">
      <span className="hub-form__label">Consequences ({rows.length})</span>

      {error && (
        <div style={{ margin: "var(--spacing-8) 0" }}>
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--spacing-8)",
        }}
      >
        {rows.map((c) =>
          editingId === c.id ? (
            <ConsequenceForm
              key={c.id}
              initial={c}
              partnerMode={partnerMode}
              onCancel={() => setEditingId(null)}
              onSubmit={(ctype, payload, target) =>
                upsert(ctype, payload, target, c.id)
              }
            />
          ) : (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--spacing-12)",
                padding:
                  "var(--spacing-8) var(--spacing-12)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-medium)",
                background: "var(--surface-secondary)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <strong style={{ fontSize: "var(--font-size-14)" }}>
                  {CTYPE_LABEL[c.ctype]}
                  {partnerMode !== "none" && (
                    <span
                      style={{
                        marginLeft: "var(--spacing-6)",
                        padding: "2px var(--spacing-6)",
                        background: "var(--surface-tertiary)",
                        borderRadius: "var(--radius-small)",
                        fontSize: "var(--font-size-12)",
                        fontWeight: "var(--font-weight-regular)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      → {TARGET_LABEL[c.target]}
                    </span>
                  )}
                </strong>
                <span
                  style={{
                    fontSize: "var(--font-size-12)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {summarizeConsequence(c)}
                </span>
              </div>
              <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
                <Button
                  size="small"
                  variant="tertiary"
                  onClick={() => setEditingId(c.id)}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  variant="tertiary"
                  onClick={() => void remove(c.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ),
        )}

        {editingId === "new" ? (
          <ConsequenceForm
            initial={null}
            partnerMode={partnerMode}
            onCancel={() => setEditingId(null)}
            onSubmit={(ctype, payload, target) =>
              upsert(ctype, payload, target, null)
            }
          />
        ) : (
          <Button
            size="small"
            variant="secondary"
            onClick={() => setEditingId("new")}
          >
            + Add consequence
          </Button>
        )}
      </div>

      <p className="hub-form__platform-disabled">
        ctype is locked once a consequence is created. To switch type,
        delete it and add a fresh one.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-ctype form (inline)
// ---------------------------------------------------------------------------

interface ConsequenceFormProps {
  /** Existing row when editing; null for the create form. */
  initial: ConsequenceRow | null;
  /** From the parent event — hides the target picker when 'none'. */
  partnerMode: PartnerMode;
  onCancel: () => void;
  /** Returns whether the save succeeded — used to keep the form open
   *  on failure so the admin can fix and retry. */
  onSubmit: (
    ctype: Ctype,
    payload: Record<string, unknown>,
    target: ConsequenceTarget,
  ) => Promise<boolean>;
}

function ConsequenceForm({
  initial,
  partnerMode,
  onCancel,
  onSubmit,
}: ConsequenceFormProps) {
  const isEdit = !!initial;
  const [ctype, setCtype] = useState<Ctype>(initial?.ctype ?? "token_delta");
  const [target, setTarget] = useState<ConsequenceTarget>(
    initial?.target ?? "actor",
  );
  const p = initial?.payload ?? {};

  // token_delta
  const [tdMin, setTdMin] = useState(
    String(typeof p.min === "number" ? p.min : -5),
  );
  const [tdMax, setTdMax] = useState(
    String(typeof p.max === "number" ? p.max : 5),
  );

  // modifier
  const [modEffect, setModEffect] = useState(
    typeof p.effect === "string" ? p.effect : "",
  );
  const [modDuration, setModDuration] = useState(
    String(typeof p.duration === "number" ? p.duration : 60),
  );
  const [modScope, setModScope] = useState<"seconds" | "round" | "chapter">(
    p.scope === "round" || p.scope === "chapter" ? p.scope : "seconds",
  );

  // challenge
  const [chVarType, setChVarType] = useState<string>(
    typeof p.variable_type === "string" ? p.variable_type : "binary",
  );
  const [chReward, setChReward] = useState(
    String(typeof p.reward === "number" ? p.reward : 10),
  );
  const [chPenalty, setChPenalty] = useState(
    String(typeof p.penalty === "number" ? p.penalty : 0),
  );
  const [chVisibility, setChVisibility] = useState<"public" | "secret">(
    p.visibility === "secret" ? "secret" : "public",
  );
  const [chCondition, setChCondition] = useState(
    typeof p.condition === "object" && p.condition !== null
      ? JSON.stringify(p.condition, null, 2)
      : "{}",
  );

  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLocalError(null);
    let payload: Record<string, unknown> = {};
    switch (ctype) {
      case "token_delta": {
        const min = Number(tdMin);
        const max = Number(tdMax);
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
          setLocalError("min and max must be numbers.");
          return;
        }
        payload = { min, max };
        break;
      }
      case "modifier": {
        const effect = modEffect.trim();
        if (!effect) {
          setLocalError("Effect is required.");
          return;
        }
        const duration = parseInt(modDuration, 10);
        if (!Number.isInteger(duration) || duration <= 0) {
          setLocalError("Duration must be a positive integer.");
          return;
        }
        payload = { effect, duration, scope: modScope };
        break;
      }
      case "challenge": {
        let condition: unknown;
        try {
          condition = JSON.parse(chCondition);
        } catch {
          setLocalError("Condition must be valid JSON.");
          return;
        }
        if (
          !condition ||
          typeof condition !== "object" ||
          Array.isArray(condition)
        ) {
          setLocalError("Condition must be a JSON object.");
          return;
        }
        const reward = Number(chReward);
        const penalty = Number(chPenalty);
        payload = {
          variable_type: chVarType,
          condition,
          reward: Number.isFinite(reward) ? reward : 0,
          penalty: Number.isFinite(penalty) ? penalty : 0,
          visibility: chVisibility,
        };
        break;
      }
      case "story":
        payload = {};
        break;
    }
    setSubmitting(true);
    try {
      // Single-party events always save target='actor' — keeps
      // the DB shape consistent even though the picker is hidden.
      const effectiveTarget: ConsequenceTarget =
        partnerMode === "none" ? "actor" : target;
      await onSubmit(ctype, payload, effectiveTarget);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--spacing-12)",
        padding: "var(--spacing-12)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-medium)",
        background: "var(--surface-primary)",
      }}
    >
      {localError && (
        <Alert variant="error" onClose={() => setLocalError(null)}>
          {localError}
        </Alert>
      )}

      {!isEdit && (
        <label className="hub-form__field">
          <span className="hub-form__label">Type</span>
          <Select
            value={ctype}
            onChange={(v) => setCtype(v as Ctype)}
            options={[
              { value: "token_delta", label: "Token delta" },
              { value: "modifier", label: "Modifier" },
              { value: "challenge", label: "Challenge" },
              { value: "story", label: "Story beat" },
            ]}
            fullWidth
          />
        </label>
      )}

      {partnerMode !== "none" && (
        <label className="hub-form__field">
          <span className="hub-form__label">Applies to</span>
          <Select
            value={target}
            onChange={(v) => setTarget(v as ConsequenceTarget)}
            options={[
              { value: "actor", label: "Actor ({from} — the caller)" },
              { value: "partner", label: "Partner ({to} — the target)" },
              { value: "both", label: "Both" },
            ]}
            fullWidth
          />
        </label>
      )}

      {ctype === "token_delta" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--spacing-12)",
          }}
        >
          <label className="hub-form__field">
            <span className="hub-form__label">Min</span>
            <Input
              type="number"
              value={tdMin}
              onChange={(e) => setTdMin(e.target.value)}
              fullWidth
            />
          </label>
          <label className="hub-form__field">
            <span className="hub-form__label">Max</span>
            <Input
              type="number"
              value={tdMax}
              onChange={(e) => setTdMax(e.target.value)}
              fullWidth
            />
          </label>
        </div>
      )}

      {ctype === "modifier" && (
        <>
          <label className="hub-form__field">
            <span className="hub-form__label">Effect</span>
            <Input
              value={modEffect}
              onChange={(e) => setModEffect(e.target.value)}
              placeholder="banana_storm"
              fullWidth
            />
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--spacing-12)",
            }}
          >
            <label className="hub-form__field">
              <span className="hub-form__label">Duration</span>
              <Input
                type="number"
                min={1}
                value={modDuration}
                onChange={(e) => setModDuration(e.target.value)}
                fullWidth
              />
            </label>
            <label className="hub-form__field">
              <span className="hub-form__label">Scope</span>
              <Select
                value={modScope}
                onChange={(v) =>
                  setModScope(v as "seconds" | "round" | "chapter")
                }
                options={[
                  { value: "seconds", label: "Seconds" },
                  { value: "round", label: "Round" },
                  { value: "chapter", label: "Chapter" },
                ]}
                fullWidth
              />
            </label>
          </div>
        </>
      )}

      {ctype === "challenge" && (
        <>
          <label className="hub-form__field">
            <span className="hub-form__label">Variable type</span>
            <Select
              value={chVarType}
              onChange={(v) => setChVarType(v as string)}
              options={[
                { value: "binary", label: "binary" },
                { value: "placement", label: "placement" },
                { value: "pickone", label: "pickone" },
                { value: "count", label: "count" },
              ]}
              fullWidth
            />
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--spacing-12)",
            }}
          >
            <label className="hub-form__field">
              <span className="hub-form__label">Reward</span>
              <Input
                type="number"
                value={chReward}
                onChange={(e) => setChReward(e.target.value)}
                fullWidth
              />
            </label>
            <label className="hub-form__field">
              <span className="hub-form__label">Penalty</span>
              <Input
                type="number"
                value={chPenalty}
                onChange={(e) => setChPenalty(e.target.value)}
                fullWidth
              />
            </label>
          </div>
          <label className="hub-form__field">
            <span className="hub-form__label">Visibility</span>
            <Select
              value={chVisibility}
              onChange={(v) => setChVisibility(v as "public" | "secret")}
              options={[
                { value: "public", label: "Public" },
                { value: "secret", label: "Secret" },
              ]}
              fullWidth
            />
          </label>
          <label className="hub-form__field">
            <span className="hub-form__label">Condition (JSON)</span>
            <Textarea
              value={chCondition}
              onChange={(e) => setChCondition(e.target.value)}
              rows={4}
              fullWidth
            />
          </label>
        </>
      )}

      {ctype === "story" && (
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-12)",
            color: "var(--text-secondary)",
          }}
        >
          Story beats carry no payload — the flavor template on the
          event is the whole effect.
        </p>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "var(--spacing-8)",
        }}
      >
        <Button
          size="small"
          variant="tertiary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          size="small"
          variant="primary"
          onClick={handleSubmit}
          loading={submitting}
          disabled={submitting}
        >
          {isEdit ? "Save consequence" : "Add consequence"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flavor template variables — inline reference under the textarea
// ---------------------------------------------------------------------------

function FlavorVariablesDictionary() {
  const [open, setOpen] = useState(false);
  const [vars, setVars] = useState<FlavorVariable[] | null>(null);

  // Lazy-fetch on first expand so we don't hit the API for every
  // event modal open (most flows never look at the dictionary).
  useEffect(() => {
    if (!open || vars !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/flavor-variables", {
          cache: "no-store",
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && body.ok) {
          setVars(body.variables as FlavorVariable[]);
        } else {
          setVars([]);
        }
      } catch {
        if (!cancelled) setVars([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, vars]);

  return (
    <details
      style={{
        marginTop: "var(--spacing-8)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-medium)",
        background: "var(--surface-secondary)",
      }}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary
        style={{
          cursor: "pointer",
          padding: "var(--spacing-8) var(--spacing-12)",
          fontSize: "var(--font-size-14)",
          fontWeight: "var(--font-weight-semibold)",
          listStyle: "none",
        }}
      >
        Available variables
        {vars !== null && ` (${vars.length})`}
      </summary>
      {vars === null ? (
        <p
          style={{
            margin: 0,
            padding: "var(--spacing-8) var(--spacing-12)",
            borderTop: "1px solid var(--border-default)",
            fontSize: "var(--font-size-12)",
            color: "var(--text-tertiary)",
          }}
        >
          Loading…
        </p>
      ) : vars.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: "var(--spacing-8) var(--spacing-12)",
            borderTop: "1px solid var(--border-default)",
            fontSize: "var(--font-size-12)",
            color: "var(--text-tertiary)",
          }}
        >
          No variables in the catalog. Add some under{" "}
          <strong>Platform Admin → Variables</strong>.
        </p>
      ) : (
        <table
          style={{
            width: "100%",
            borderTop: "1px solid var(--border-default)",
            borderCollapse: "collapse",
            fontSize: "var(--font-size-12)",
          }}
        >
          <thead>
            <tr style={{ background: "var(--surface-tertiary)" }}>
              <th
                style={{
                  textAlign: "left",
                  padding: "var(--spacing-6) var(--spacing-12)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--text-secondary)",
                }}
              >
                Variable
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "var(--spacing-6) var(--spacing-12)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--text-secondary)",
                }}
              >
                What it renders
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "var(--spacing-6) var(--spacing-12)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--text-secondary)",
                }}
              >
                Example
              </th>
            </tr>
          </thead>
          <tbody>
            {vars.map((v) => (
              <tr
                key={v.name}
                style={{ borderTop: "1px solid var(--border-default)" }}
              >
                <td
                  style={{
                    padding: "var(--spacing-6) var(--spacing-12)",
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                  }}
                >
                  <code>{`{${v.name}}`}</code>
                </td>
                <td
                  style={{
                    padding: "var(--spacing-6) var(--spacing-12)",
                    color: "var(--text-secondary)",
                    verticalAlign: "top",
                  }}
                >
                  {v.description}
                </td>
                <td
                  style={{
                    padding: "var(--spacing-6) var(--spacing-12)",
                    color: "var(--text-secondary)",
                    verticalAlign: "top",
                  }}
                >
                  <code>{v.example || "—"}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p
        style={{
          margin: 0,
          padding: "var(--spacing-8) var(--spacing-12)",
          borderTop: "1px solid var(--border-default)",
          fontSize: "var(--font-size-12)",
          color: "var(--text-tertiary)",
        }}
      >
        Unknown tokens render literally in chat, so typos are visible.
        Manage the catalog under <strong>Platform Admin →
        Variables</strong>.
      </p>
    </details>
  );
}
