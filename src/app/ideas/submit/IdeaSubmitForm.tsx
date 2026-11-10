"use client";

/**
 * The Idea Board's form. A game space's "Suggest an idea" and its starter ideas open it with the game set
 * (`?game=<catalog key>`), the randomizer category and, for a starter, its title filled in (game spaces first wave,
 * 2026-11-09). The game picker shows once gs_ideas has its game column (supabase/ideas-game-m1.sql).
 */

import { useState } from "react";
import Link from "next/link";
import { Container, Input, Textarea, Select, Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { LabeledCombobox } from "@/components/ui/LabeledCombobox";
import { GameCover } from "@/components/games/GameCover";
import { catalogGame } from "@/data/game-catalog";
import {
  IDEA_LIMITS,
  IDEA_CATEGORIES,
  IDEA_CATEGORY_LABELS,
  type IdeaCategory,
} from "@/lib/ideas/constants";

const CATEGORY_OPTIONS = IDEA_CATEGORIES.map((c) => ({ value: c, label: IDEA_CATEGORY_LABELS[c] }));

export interface IdeaFormGame { key: string; name: string }

export function IdeaSubmitForm({ initialGame, initialTitle, initialCategory, gameReady, gameNames, space, loginHref }: {
  /** The game the form opened for (from a game space), or null. */
  initialGame: IdeaFormGame | null;
  initialTitle: string;
  initialCategory: IdeaCategory;
  /** Whether ideas can carry a game yet (the picker hides before the migration). */
  gameReady: boolean;
  /** Every catalog game's name, for the picker. */
  gameNames: string[];
  /** The space the game opened from, for "Back to the space" once it's sent. */
  space: { href: string; name: string } | null;
  loginHref: string;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<IdeaCategory>(initialCategory);
  const [gameName, setGameName] = useState(initialGame?.name ?? "");
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const picked = gameName.trim() ? catalogGame(gameName) : null;
  const gameOptions = gameNames.map((n) => ({ value: n, label: n }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (gameReady && gameName.trim() && !picked) {
      setError("Pick the game from the list, or clear it for an idea about GameShuffle in general.");
      return;
    }
    if (!token) {
      setError("Please complete the verification.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, category, game: gameReady && picked ? picked.slug : null, turnstileToken: token }),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
      return;
    }
    const d = (await res.json().catch(() => null)) as { error?: string } | null;
    setError(
      d?.error === "rate_limited"
        ? `You can submit up to ${IDEA_LIMITS.submissionsPer24h} ideas per day. Try again tomorrow.`
        : "Couldn't submit that. Check your entry and try again.",
    );
  }

  if (done) {
    return (
      <Container as="main" className="ideas-page">
        <div className="ideas-submit__done">
          <h1 className="ideas-page__title">Idea submitted</h1>
          <p className="ideas-page__lead">
            Thanks! Every idea gets a quick review before it shows on the board{gameReady && picked && space ? ` and in the ${space.name} space` : ""}.
            Once it&apos;s approved it starts collecting votes. You can track it any time.
          </p>
          <div className="ideas-submit__actions">
            <Link href="/ideas/mine">
              <Button variant="primary">View my ideas</Button>
            </Link>
            {space && (
              <Link href={gameReady ? `${space.href}?tab=ideas` : space.href}>
                <Button variant="secondary">Back to {space.name}</Button>
              </Link>
            )}
            <Button variant="secondary" onClick={() => { setTitle(""); setBody(""); setDone(false); }}>
              Submit another
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container as="main" className="ideas-page">
        <h1 className="ideas-page__title">Submit an idea</h1>
        <p className="ideas-page__lead">
          {initialGame ? `Sign in to tell us what to build for ${initialGame.name}.` : "Sign in to share a game idea, randomizer concept, or feature request."}
        </p>
        <Link href={loginHref}>
          <Button variant="primary">Log in</Button>
        </Link>
      </Container>
    );
  }

  return (
    <Container as="main" className="ideas-page">
      <h1 className="ideas-page__title">{initialGame ? `An idea for ${initialGame.name}` : "Submit an idea"}</h1>
      <p className="ideas-page__lead">
        {initialGame
          ? `What should we build for ${initialGame.name}? Once it's reviewed, players vote on it ${gameReady && space ? `in the ${space.name} space and ` : ""}on the Idea Board.`
          : "Game ideas, randomizer concepts, tools, and features. The community votes, ideas enter batched review cycles, and every reviewed idea gets a public verdict."}
      </p>

      <form onSubmit={submit} className="ideas-submit__form">
        {gameReady && (
          <div className="ideas-field idea-game">
            <span className="idea-game__label">Game</span>
            <div className="idea-game__pick">
              {picked && <span className="idea-game__cover"><GameCover slug={picked.slug} name={picked.name} /></span>}
              <LabeledCombobox
                label="Game"
                value={gameName}
                onChange={setGameName}
                options={gameOptions}
                placeholder="Find a game"
                allowCreate={false}
              />
            </div>
            <span className="idea-game__hint">Leave it empty for an idea about GameShuffle itself.</span>
          </div>
        )}

        <div className="ideas-field">
          <Input
            floatingLabel="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={IDEA_LIMITS.titleMax}
            fullWidth
            required
          />
          <span className="ideas-field__count">{title.length}/{IDEA_LIMITS.titleMax}</span>
        </div>

        <Select
          floatingLabel="Category"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(v) => setCategory(v as IdeaCategory)}
          fullWidth
        />

        <div className="ideas-field">
          <Textarea
            floatingLabel="Describe your idea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={IDEA_LIMITS.bodyMax}
            rows={6}
            fullWidth
            required
          />
          <span className="ideas-field__count">{body.length}/{IDEA_LIMITS.bodyMax}</span>
        </div>

        <TurnstileWidget onToken={setToken} />
        {error && <p className="ideas-submit__error">{error}</p>}

        <Button type="submit" variant="primary" loading={submitting} disabled={!title.trim() || !body.trim()}>
          Submit for review
        </Button>
      </form>
    </Container>
  );
}
