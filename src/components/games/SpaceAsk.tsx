"use client";

/**
 * "Don't see your game?" on /games (spaces first wave, 2026-11-09): name a game to ask for its space. The catalog's
 * games without a space are suggested; any name works. One ask per account per game, counted for staff on Platform ▸
 * Library ▸ Game catalog. Signed out: a line to sign in. Hidden until supabase/ideas-game-m1.sql has run (the page
 * leaves it out).
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { LabeledCombobox } from "@/components/ui/LabeledCombobox";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";

export function SpaceAsk({ signedIn, suggestions }: { signedIn: boolean; suggestions: string[] }) {
  const toast = useToast();
  const router = useRouter();
  const [game, setGame] = useState("");
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <section className="space-ask-line" aria-labelledby="space-ask-h">
        <h2 id="space-ask-h" className="space-ask-line__q">Don&apos;t see your game?</h2>
        <p className="space-ask-line__note"><Link href="/login?redirect=/games">Sign in</Link> and ask for its space. The games asked for most get one next.</p>
      </section>
    );
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const name = game.trim();
    if (name.length < 2) { toast.error("Type the game's name first."); return; }
    setBusy(true);
    const r = await fetch("/api/games/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game: name }) }).catch(() => null);
    setBusy(false);
    const j = (await r?.json().catch(() => null)) as { error?: string; already?: boolean; name?: string; space?: { href: string; name: string } } | null;
    if (!r?.ok || !j) {
      toast.error(
        j?.error === "blocked" ? "That name can't be used. Try the game's title."
          : j?.error === "rate_limited" ? "That's a lot of asks. Try again in an hour."
            : j?.error === "invalid" ? "Game names are 2 to 60 characters."
              : "That didn't save. Try again.",
      );
      return;
    }
    if (j.space) {
      toast.success(`${j.space.name} has a space already. Opening it.`);
      router.push(j.space.href);
      return;
    }
    track(EVENTS.homeSectionClicked, { to: "space-ask", from: "games" });
    setAsked(j.name ?? name);
    setGame("");
    toast.success(j.already ? `You've asked for ${j.name ?? name} already. It still counts once.` : `Asked for ${j.name ?? name}. Thanks.`);
  }

  return (
    <section className="space-ask-line" aria-labelledby="space-ask-h">
      <h2 id="space-ask-h" className="space-ask-line__q">Don&apos;t see your game?</h2>
      <form className="space-ask-line__form" onSubmit={(e) => void ask(e)}>
        <LabeledCombobox
          label="Game to ask for"
          value={game}
          onChange={setGame}
          options={suggestions.map((n) => ({ value: n, label: n }))}
          placeholder="Name a game"
          allowCreate
          createLabel="Ask for"
        />
        <Button type="submit" variant="secondary" loading={busy} disabled={busy}>Ask for a space</Button>
      </form>
      <p className="space-ask-line__note" aria-live="polite">
        {asked ? `Asked for ${asked}. The games asked for most get a space next.` : "One ask per game. The games asked for most get a space next."}
      </p>
    </section>
  );
}
