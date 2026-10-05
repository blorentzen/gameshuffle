"use client";

/**
 * "Make it with AI" for streamer content: type a theme, get a draft list
 * (wheel slices, bingo squares, tier list items, prompts), untick anything you
 * don't want, then use the rest. Nothing is saved here: the caller drops the
 * kept items into its own editor, where the streamer still saves as usual.
 * GS Pro, counted against the monthly AI allowance (POST /api/ai/pack).
 */

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Checkbox, Input, Modal } from "@empac/cascadeds";
import { IconSparkles } from "@tabler/icons-react";
import { EVENTS, track } from "@/lib/analytics/events";
import { AI_ERRORS as ERRORS } from "@/components/ai/errors";

export type AiPackKind = "wheel" | "bingo" | "tierlist" | "mostlikely" | "oddoneout";

const COPY: Record<AiPackKind, { noun: string; example: string }> = {
  wheel: { noun: "wheel slices", example: "Elden Ring boss night, punishments for dying" },
  bingo: { noun: "bingo squares", example: "Mario Kart rage moments, my chat's favorite jokes" },
  tierlist: { noun: "tier list items", example: "Nintendo 64 games we grew up with" },
  mostlikely: { noun: "prompts", example: "our Friday Smash crew" },
  oddoneout: { noun: "secret words", example: "Theme park rides" },
};


export function AiPackModal({ kind, isOpen, onClose, onApply, avoid = [], applyLabel }: {
  kind: AiPackKind;
  isOpen: boolean;
  onClose: () => void;
  /** The kept items and the theme they were made from. */
  onApply: (items: string[], theme: string) => void;
  /** What's already there, so a run adds new ideas instead of repeats. */
  avoid?: string[];
  applyLabel?: string;
}) {
  const copy = COPY[kind];
  const [theme, setTheme] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const generate = async (more: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, theme, avoid: more ? [...avoid, ...items] : avoid }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: string[]; remaining?: number | null; error?: string };
      if (!res.ok || !data.ok || !data.items) {
        setError(ERRORS[data.error ?? ""] ?? "That didn't work. Try again, or change the theme a little.");
        if (typeof data.remaining === "number") setRemaining(data.remaining);
        return;
      }
      setItems(data.items);
      setKept(new Set(data.items.map((_, i) => i)));
      setRemaining(data.remaining ?? null);
      track(EVENTS.aiPackGenerated, { kind, more });
    } catch {
      setError("Couldn't reach GameShuffle. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    const chosen = items.filter((_, i) => kept.has(i));
    if (!chosen.length) return;
    track(EVENTS.aiPackSaved, { kind, count: chosen.length });
    onApply(chosen, theme.trim());
    setItems([]);
    setKept(new Set());
    onClose();
  };

  const toggle = (i: number) => setKept((k) => { const n = new Set(k); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Make ${copy.noun} with AI`}
      size="medium"
      footer={
        <div className="ai-pack__footer">
          <span className="ai-pack__allowance">{remaining === null ? "" : `${remaining} left this month`}</span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!kept.size} onClick={apply}>{applyLabel ?? `Use ${kept.size || ""} ${copy.noun}`.replace("  ", " ")}</Button>
        </div>
      }
    >
      <div className="ai-pack">
        <form className="ai-pack__ask" onSubmit={(e) => { e.preventDefault(); if (theme.trim().length >= 3) void generate(false); }}>
          <Input floatingLabel="What's it for?" placeholder={copy.example} value={theme} maxLength={200} onChange={(e) => setTheme(e.target.value)} />
          <Button type="submit" variant="primary" iconBefore={IconSparkles} loading={busy} disabled={theme.trim().length < 3}>{items.length ? "Start over" : "Make them"}</Button>
        </form>

        {error && (
          <Alert variant={error === ERRORS.pro_required ? "info" : "error"}>
            {error}{error === ERRORS.pro_required && <> <Link href="/gs-pro">See GS Pro</Link></>}
          </Alert>
        )}

        {items.length > 0 && (
          <>
            <p className="ai-pack__hint">Untick anything you don&apos;t want. You can still edit everything before you save.</p>
            <ul className="ai-pack__list">
              {items.map((item, i) => (
                <li key={`${item}-${i}`}><Checkbox label={item} checked={kept.has(i)} onChange={() => toggle(i)} /></li>
              ))}
            </ul>
            <Button variant="secondary" size="small" loading={busy} onClick={() => void generate(true)}>Give me different ones</Button>
          </>
        )}

        <p className="ai-pack__note">Written by AI from your theme. Read it over before it goes on stream.</p>
      </div>
    </Modal>
  );
}
