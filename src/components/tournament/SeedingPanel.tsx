"use client";

/**
 * The organizer's seeding controls.
 *
 * Before this, the field went into a format in whatever order people entered,
 * so the two strongest players could meet in round one and byes landed on
 * whoever signed up first. This is where an organizer decides how much of what
 * they know should shape the draw.
 *
 * The framing throughout is that seeding is PRIVATE. Tiers and pins are the
 * organizer's read on the field, and a player seeing "your host rated you C"
 * would be worse than no feature at all. Every control that captures an opinion
 * says so in plain words rather than relying on the reader to assume it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Select, Tabs } from "@empac/cascadeds";
import { SortableList } from "@/components/ui/SortableList";
import { useToast } from "@/components/toast/ToastProvider";
import type { SeedingMethod, Tier } from "@/lib/tournaments/seeding";
import { previewSeeding } from "@/lib/tournaments/seedingPreview";

interface Entrant { id: string; display_name: string; user_id: string | null; status: string }

interface State {
  method: SeedingMethod;
  status: "unseeded" | "seeded" | "stale" | "locked";
  protectedCount: number;
  seededAt: string | null;
  order: string[];
  tiers: Record<string, Tier | null>;
  protectedRanks: Record<string, number | null>;
  drawCount: number;
  locked: boolean;
}

/** Plain-language helper per method, in product voice. The spec asks for these
 *  by name, and they are what stop Tiered reading as a ranking players can see. */
const METHOD_HELP: Record<SeedingMethod, string> = {
  random: "A straight shuffle. The fairest option when you do not know the field, and the one most nights want.",
  manual: "You set the order yourself, strongest first. Nothing is shuffled.",
  protected: "Pin the few you want kept apart, and everyone else is drawn at random below them.",
  tiered: "Sort players into A, B and C. Only you can see tiers: players see the draw, not how you rated them.",
  standings: "Seed straight from the season table, best-placed first. Players new to the series come after, at random.",
};

const METHOD_LABEL: Record<SeedingMethod, string> = {
  random: "Random", manual: "Manual", protected: "Protected", tiered: "Tiered", standings: "Standings",
};

export function SeedingPanel({
  tournamentId, entrants, isChampionship, format, heatSize,
}: {
  tournamentId: string;
  entrants: Entrant[];
  isChampionship: boolean;
  format: string;
  heatSize?: number | null;
}) {
  const toast = useToast();
  const [state, setState] = useState<State | null>(null);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<Entrant[]>([]);

  const seated = useMemo(
    () => entrants.filter((e) => ["registered", "confirmed", "checked_in"].includes(e.status)),
    [entrants],
  );
  const nameOf = useCallback(
    (id: string) => seated.find((e) => e.id === id)?.display_name ?? "Entrant",
    [seated],
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournament/${tournamentId}/seeding`, { cache: "no-store" });
    if (res.status === 503) { setAvailable(false); return; }
    if (!res.ok) { setAvailable(false); return; }
    const { state: s } = await res.json();
    setState(s);
    // Seed the manual list from the current draw so an organizer switching to
    // Manual starts from what is already there rather than from entry order.
    setManual(s.order.length
      ? (s.order as string[]).map((id) => seated.find((e) => e.id === id)).filter(Boolean) as Entrant[]
      : seated);
  }, [tournamentId, seated]);

  useEffect(() => { void load(); }, [load]);

  if (!available) return null;   // pre-migration: no controls rather than broken ones
  if (!state) return <p style={{ color: "var(--text-secondary)" }}>Loading seeding…</p>;

  const methods: SeedingMethod[] = ["random", "manual", "protected", "tiered", ...(isChampionship ? ["standings" as const] : [])];

  const setMethod = (m: SeedingMethod) => setState({ ...state, method: m });

  const draw = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/seeding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: state.method,
          protectedCount: state.protectedCount,
          manualOrder: state.method === "manual" ? manual.map((e) => e.id) : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) { toast.error(body.error ?? "Couldn't run the draw."); return; }
      toast.success(state.method === "manual" ? "Order saved." : "Draw complete.");
      await load();
    } finally { setBusy(false); }
  };

  const annotate = async (participantId: string, patch: { tier?: Tier | null; protectedRank?: number | null }) => {
    // Optimistic: tagging fifteen people should not feel like fifteen saves.
    setState((s) => s && ({
      ...s,
      tiers: patch.tier !== undefined ? { ...s.tiers, [participantId]: patch.tier } : s.tiers,
      protectedRanks: patch.protectedRank !== undefined ? { ...s.protectedRanks, [participantId]: patch.protectedRank } : s.protectedRanks,
    }));
    const res = await fetch(`/api/tournament/${tournamentId}/seeding`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, ...patch }),
    });
    if (!res.ok) { toast.error("Couldn't save that."); await load(); }
  };

  const pinnedCount = Object.values(state.protectedRanks).filter((r) => r != null).length;

  return (
    <div className="seeding">
      <div className="seeding__head">
        <div>
          <span className="seeding__title">Seeding</span>
          <p className="seeding__sub">
            {state.locked
              ? "This tournament has started, so the draw is locked."
              : "How the field is ordered before it goes into the format. Only you see this."}
          </p>
        </div>
        {state.drawCount > 0 && (
          <span className="seeding__draws">{state.drawCount} {state.drawCount === 1 ? "draw" : "draws"}</span>
        )}
      </div>

      {state.status === "stale" && (
        <div className="seeding__stale" role="status">
          <strong>The field has changed since the last draw.</strong>{" "}
          {state.method === "random"
            ? "Run it again to include everyone."
            : "Run it again when you are ready. Your order and tiers are kept."}
        </div>
      )}

      {!state.locked && (
        <>
          <Tabs
            variant="pills"
            activeTab={state.method}
            onChange={(m) => setMethod(m as SeedingMethod)}
            tabs={methods.map((m) => ({ id: m, label: METHOD_LABEL[m], content: null }))}
          />
          <p className="seeding__help">{METHOD_HELP[state.method]}</p>

          {state.method === "protected" && (
            <div className="seeding__field">
              <label className="account-card__label" htmlFor="seeding-protected-count">Pinned seats</label>
              <Select
                value={String(state.protectedCount)}
                onChange={(v) => setState({ ...state, protectedCount: Number(typeof v === "string" ? v : v[0]) })}
                options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: String(n) }))}
              />
              <span className="seeding__hint">
                {pinnedCount} of {state.protectedCount} pinned. Use the list below to choose who.
              </span>
            </div>
          )}

          {state.method === "manual" ? (
            <SortableList
              items={manual}
              getId={(e) => e.id}
              onReorder={setManual}
              handleLabel={(e) => `Reorder ${e.display_name}`}
            >
              {(e, handle, i) => (
                <div className="seeding__row">
                  {handle}
                  <span className="seeding__seed">{i + 1}</span>
                  <span className="seeding__name">{e.display_name}</span>
                </div>
              )}
            </SortableList>
          ) : (
            <ul className="seeding__list">
              {(state.order.length ? state.order.map(nameOfId(seated)) : seated).map((e, i) => (
                <li key={e.id} className="seeding__row">
                  {state.order.length > 0 && <span className="seeding__seed">{i + 1}</span>}
                  <span className="seeding__name">{e.display_name}</span>
                  {state.method === "tiered" && (
                    <span className="seeding__tiers">
                      {(["A", "B", "C"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={(state.tiers[e.id] ?? "B") === t}
                          className={`seeding__tier${(state.tiers[e.id] ?? "B") === t ? " is-on" : ""}`}
                          onClick={() => void annotate(e.id, { tier: t })}
                        >{t}</button>
                      ))}
                    </span>
                  )}
                  {state.method === "protected" && (
                    <button
                      type="button"
                      className={`seeding__pin${state.protectedRanks[e.id] != null ? " is-on" : ""}`}
                      onClick={() => void annotate(e.id, {
                        protectedRank: state.protectedRanks[e.id] != null ? null : pinnedCount + 1,
                      })}
                    >{state.protectedRanks[e.id] != null ? `Pinned ${state.protectedRanks[e.id]}` : "Pin"}</button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <Preview
            format={format}
            fieldSize={seated.length}
            heatSize={heatSize ?? undefined}
            order={state.order}
            nameOf={nameOf}
          />

          <div className="seeding__actions">
            <Button variant="primary" onClick={() => void draw()} loading={busy}>
              {state.method === "manual" ? "Save this order"
                : state.status === "unseeded" ? "Run the draw" : "Draw again"}
            </Button>
            {state.seededAt && (
              <span className="seeding__hint">
                Last drawn {new Date(state.seededAt).toLocaleString()}
              </span>
            )}
          </div>
        </>
      )}

      {state.locked && state.order.length > 0 && (
        <ol className="seeding__list">
          {state.order.map((id, i) => (
            <li key={id} className="seeding__row">
              <span className="seeding__seed">{i + 1}</span>
              <span className="seeding__name">{nameOf(id)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Resolve the stored order back to entrants, dropping any that have left. */
function nameOfId(seated: Entrant[]) {
  return (id: string): Entrant =>
    seated.find((e) => e.id === id) ?? { id, display_name: "Entrant", user_id: null, status: "registered" };
}


/**
 * What the draw produces, before it is committed.
 *
 * Shows seed numbers until a draw exists, then real names, because "Match 1:
 * seed 1 v seed 8" answers a different question from "Match 1: Maya v Rex". The
 * first says the format is fair; the second is the one an organizer actually
 * checks before they hit go.
 */
function Preview({
  format, fieldSize, heatSize, order, nameOf,
}: {
  format: string;
  fieldSize: number;
  heatSize?: number;
  order: string[];
  nameOf: (id: string) => string;
}) {
  const { groups, note } = previewSeeding({ format, fieldSize, heatSize });
  if (groups.length === 0 && !note) return null;

  const label = (seed: number | null) => {
    if (seed == null) return null;
    const id = order[seed - 1];
    return id ? nameOf(id) : `Seed ${seed}`;
  };

  return (
    <div className="seeding__preview">
      <span className="account-card__label">
        {order.length ? "This draw" : "How the field would be placed"}
      </span>
      {note && <p className="seeding__hint">{note}</p>}
      {groups.length > 0 && (
        <div className="seeding__preview-grid">
          {groups.map((g) => (
            <div key={g.label} className="seeding__preview-group">
              <span className="seeding__preview-label">{g.label}</span>
              {g.seeds.map((seed, i) => (
                <span key={i} className={`seeding__preview-slot${seed == null ? " is-bye" : ""}`}>
                  {seed == null
                    ? "Bye"
                    : <><span className="seeding__preview-seed">{seed}</span>{label(seed)}</>}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
