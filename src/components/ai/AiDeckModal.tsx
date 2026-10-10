"use client";

/**
 * "Make cards with AI" for a deck (My Stuff ▸ Decks): pick a kind, add an
 * optional theme, get draft cards, untick what you don't want, add the rest
 * to the deck as drafts. Each draft still needs Publish (with the family-safe
 * question) before it's dealt. GS Pro, counted against the 30-day AI allowance
 * (POST /api/ai/deck); anyone else sees the AiGatePrompt.
 */

import { useState } from "react";
import { Alert, Badge, Button, Checkbox, Input, Modal, Select } from "@empac/cascadeds";
import { IconSparkles } from "@tabler/icons-react";
import { EVENTS, track } from "@/lib/analytics/events";
import { AI_ERRORS as ERRORS } from "@/components/ai/errors";
import { AiGatePrompt, allowanceText } from "@/components/ai/AiGate";
import { useAiAccess } from "@/components/ai/useAiAccess";
import type { CardDraft } from "@/lib/party/deck";

export type AiDeckKind = "chance" | "mission" | "rule";

const KINDS: { value: AiDeckKind; label: string; example: string }[] = [
  { value: "chance", label: "Chance cards", example: "Sneaky and a little mean, for a competitive crew" },
  { value: "mission", label: "Missions", example: "Easy ones for a family night" },
  { value: "rule", label: "House rules", example: "Silly rules that make everyone talk more" },
];

/** A card's text with sample names, so drafts read like the dealt card. */
const sample = (text: string) => text.replaceAll("{player}", "Ana").replaceAll("{rival}", "Ben").replaceAll("{n}", "n");

export function AiDeckModal({ family, familyLabel, initialKind = "chance", isOpen, onClose, onAdd, avoid = [] }: {
  family: string;
  familyLabel: string;
  initialKind?: AiDeckKind;
  isOpen: boolean;
  onClose: () => void;
  /** Adds the kept cards as drafts; resolves to how many were added. */
  onAdd: (cards: CardDraft[]) => Promise<number>;
  /** Titles already in the deck, so a run brings new ideas. */
  avoid?: string[];
}) {
  const { info, block, spent } = useAiAccess("deck");
  const [kind, setKind] = useState<AiDeckKind>(initialKind);
  const [theme, setTheme] = useState("");
  const [cards, setCards] = useState<CardDraft[]>([]);
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = KINDS.find((k) => k.value === kind)!;

  const generate = async (more: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family, kind, theme, avoid: more ? [...avoid, ...cards.map((c) => c.title)] : avoid }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; cards?: CardDraft[]; remaining?: number | null; error?: string };
      spent(data.remaining);
      if (!res.ok || !data.ok || !data.cards) {
        setError(ERRORS[data.error ?? ""] ?? "That didn't work. Try again, or change the theme a little.");
        return;
      }
      setCards(data.cards);
      setKept(new Set(data.cards.map((_, i) => i)));
      track(EVENTS.aiDeckGenerated, { kind, family, more });
    } catch {
      setError("Couldn't reach GameShuffle. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const chosen = cards.filter((_, i) => kept.has(i));
    if (!chosen.length) return;
    setAdding(true);
    const n = await onAdd(chosen);
    setAdding(false);
    if (n > 0) {
      track(EVENTS.aiDeckSaved, { kind, family, count: n });
      setCards([]);
      setKept(new Set());
      onClose();
    }
  };

  const toggle = (i: number) => setKept((k) => { const n = new Set(k); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  if (info && block) return <AiGatePrompt info={info} block={block} isOpen={isOpen} onClose={onClose} />;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Make ${familyLabel} cards with AI`}
      size="medium"
      footer={
        <div className="ai-pack__footer">
          <span className="ai-pack__allowance">{allowanceText(info)}</span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={adding} disabled={!kept.size} onClick={() => void add()}>
            {`Add ${kept.size || ""} as drafts`.replace("  ", " ")}
          </Button>
        </div>
      }
    >
      <div className="ai-pack">
        <form className="ai-deck__ask" onSubmit={(e) => { e.preventDefault(); void generate(false); }}>
          <Select
            floatingLabel="Kind of card"
            value={kind}
            onChange={(v) => { setKind(((typeof v === "string" ? v : v[0]) ?? "chance") as AiDeckKind); setCards([]); }}
            options={KINDS.map(({ value, label }) => ({ value, label }))}
          />
          <Input fullWidth floatingLabel="Theme (optional)" placeholder={meta.example} value={theme} maxLength={200} onChange={(e) => setTheme(e.target.value)} />
          <Button type="submit" variant="primary" iconBefore={IconSparkles} loading={busy}>{cards.length ? "Start over" : "Make them"}</Button>
        </form>

        {error && <Alert variant="error">{error}</Alert>}

        {cards.length > 0 && (
          <>
            <p className="ai-pack__hint">Untick anything you don&apos;t want. The rest go in your deck as drafts, so you can edit each one before you publish it.</p>
            <ul className="ai-deck__list">
              {cards.map((c, i) => (
                <li key={`${c.title}-${i}`} className={`party-card${c.effect ? ` party-card--${c.effect}` : ""}`}>
                  <Checkbox label={c.title} checked={kept.has(i)} onChange={() => toggle(i)} />
                  <span>{sample(c.text)}</span>
                  <span className="party-card__head">
                    {c.effect && <Badge variant={c.effect === "help" ? "success" : "warning"} size="small">{c.effect === "help" ? "Help" : "Crutch"}</Badge>}
                    {c.worth && <Badge variant="outline" size="small">{c.worth} pt{c.worth === 1 ? "" : "s"}</Badge>}
                    {c.tone && <Badge variant="outline" size="small">{c.tone === "mild" ? "Mild" : "Spicy"}</Badge>}
                    {c.kind === "rule" && <Badge variant="outline" size="small">{c.scope === "table" ? "Everyone" : "One player"}</Badge>}
                    {c.turns_min && <Badge variant="outline" size="small">{c.turns_min === c.turns_max ? `${c.turns_min}` : `${c.turns_min} to ${c.turns_max}`} {familyLabel === "Smash" ? "games" : "turns"}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
            <Button variant="secondary" size="small" loading={busy} onClick={() => void generate(true)}>Give me different ones</Button>
          </>
        )}

        <p className="ai-pack__note">Written by AI. Read each card over before you publish it: people play by these at the table and on stream.</p>
      </div>
    </Modal>
  );
}
