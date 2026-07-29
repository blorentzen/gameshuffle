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
import { Alert, Button, Select, Switch } from "@empac/cascadeds";
import { TokenIcon } from "@/components/TokenIcon";
import { EventEditorModal } from "./platform-events/EventEditorModal";
import { computeDeckStats, evVerdict } from "./platform-events/deckStats";
import {
  CTYPE_SHORT,
  SURFACE_FILTERS,
  SURFACE_LABEL,
  type EventRow,
  type Surface,
} from "./platform-events/types";

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
    // load is async (setState only after the fetch resolves).
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

      {events !== null && events.length > 0 && (
        <div className="deck-ev">
          {(["chaos", "random"] as const).map((deck) => {
            const s = computeDeckStats(events, deck);
            const v = evVerdict(s.meanTokenEV);
            return (
              <div key={deck} className="deck-ev__card">
                <div className="deck-ev__head">
                  <span className="deck-ev__deck">
                    <code>{deck === "chaos" ? "!chaos" : "!random"}</code> deck
                  </span>
                  <span className={`deck-ev__verdict deck-ev__verdict--${v.cls}`}>{v.label}</span>
                </div>
                <div className="deck-ev__ev">
                  {s.meanTokenEV >= 0 ? "+" : ""}
                  {s.meanTokenEV.toFixed(1)}<TokenIcon size={20} />
                  <span className="deck-ev__ev-label">mean token EV / fire</span>
                </div>
                <div className="deck-ev__meta">
                  {s.count} events · weight {s.totalWeight} · band {s.minOutcome} to +
                  {s.maxOutcome}<TokenIcon size={14} />
                </div>
                <div className="deck-ev__mix">
                  {(["token_delta", "modifier", "challenge", "story"] as const)
                    .filter((t) => s.typeMix[t] > 0)
                    .map((t) => (
                      <span key={t} className="deck-ev__chip">
                        {CTYPE_SHORT[t]} {s.typeMix[t]}
                      </span>
                    ))}
                  {s.fanoutCount > 0 && (
                    <span className="deck-ev__chip deck-ev__chip--warn">
                      ⚠ {s.fanoutCount} fan-out (×viewers)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <p className="deck-ev__note">
            Target: mean EV ≈ neutral or mildly negative — a soft sink, not a
            faucet. EV uses each token-delta consequence&apos;s midpoint; fan-out
            events multiply supply impact across viewers.
          </p>
        </div>
      )}

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
