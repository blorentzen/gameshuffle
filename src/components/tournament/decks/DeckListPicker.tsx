"use client";

/**
 * Pick one of your saved deck lists (My Stuff ▸ Deck lists) for a tournament,
 * each checked against the tournament's format, or paste a new one (which saves
 * to your lists too). Radios are wrapped one per row so each sits beside its
 * check badge (CDS RadioGroup only wires direct children).
 */

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Radio } from "@empac/cascadeds";
import { IconCards } from "@tabler/icons-react";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { PasteDeckModal, statusBadge } from "@/components/tcg/decks/TcgDecksTab";
import { DECK_FORMATS, type DeckFormat } from "@/lib/tcg/deckList";
import type { DeckSummary } from "@/lib/tcg/decks";

export function DeckListPicker({ format, value, onChange, legend = "Pick your deck list" }: {
  format: DeckFormat;
  value: string | null;
  onChange: (deckId: string | null) => void;
  legend?: string;
}) {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const formatLabel = DECK_FORMATS.find((f) => f.value === format)?.label ?? "Standard";

  const fetchDecks = useCallback(async (): Promise<DeckSummary[]> => {
    const res = await fetch(`/api/tcg/decks${format === "standard" ? "" : `?format=${format}`}`, { cache: "no-store" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { decks?: DeckSummary[] } | null;
    return j?.decks ?? [];
  }, [format]);
  const load = useCallback(async () => setDecks(await fetchDecks()), [fetchDecks]);
  useEffect(() => {
    let live = true;
    fetchDecks().then((d) => { if (live) setDecks(d); });
    return () => { live = false; };
  }, [fetchDecks]);

  // Pick the first list that passes, so the button is ready to go.
  useEffect(() => {
    if (!decks || value) return;
    const first = decks.find((d) => d.legal) ?? decks[0];
    if (first?.id) onChange(first.id);
  }, [decks, value, onChange]);

  if (!decks) return <LoadingLines label="Loading your deck lists" />;
  return (
    <fieldset className="deckpick">
      <legend className="deckpick__legend">{legend}</legend>
      {decks.length === 0 ? (
        <EmptyState icon={<IconCards size={28} stroke={1.6} />} title="No saved deck lists yet" description="Paste one from Pokémon TCG Live or Limitless. It saves to My Stuff ▸ Deck lists too." />
      ) : (
        <div className="deckpick__list">
          {decks.map((d) => (
            <div key={d.id} className={`deckpick__row${value === d.id ? " is-on" : ""}`}>
              <Radio name="tournament-deck" value={d.id ?? ""} checked={value === d.id} onChange={() => onChange(d.id)} label={d.name} helperText={`${d.total} cards`} />
              {statusBadge(d, format === "standard" ? "Standard ✓" : `${formatLabel} ✓`)}
            </div>
          ))}
        </div>
      )}
      <Button variant="ghost" size="small" onClick={() => setPasteOpen(true)}>Paste a new list</Button>
      {pasteOpen && (
        <PasteDeckModal
          onClose={() => setPasteOpen(false)}
          onSaved={(id) => { setPasteOpen(false); void load().then(() => onChange(id)); }}
        />
      )}
    </fieldset>
  );
}
