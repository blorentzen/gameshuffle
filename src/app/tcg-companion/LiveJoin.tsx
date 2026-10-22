"use client";

/**
 * Play together: the way into a shared game from its link (`?play=CODE`).
 * A phone already in the game (its account, or the token it kept) goes
 * straight to the board; anyone else sees who's hosting and joins with a
 * name. Joining is free and needs no account.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Input } from "@empac/cascadeds";
import { CompanionPage } from "./CompanionPage";
import type { LiveBoot } from "@/lib/companion/SessionContext";
import { spacedCode } from "@/lib/companion/liveRules";
import { isFailure, liveGet, liveJoin, livePreview, savedToken, saveToken } from "@/lib/companion/liveClient";

interface Props {
  code: string;
  isAuthenticated: boolean;
  displayName: string | null;
  tier?: import("@/lib/subscription").SubscriptionTier;
}

type Phase =
  | { kind: "checking" }
  | { kind: "join"; hostName: string }
  | { kind: "in"; boot: LiveBoot }
  | { kind: "problem"; title: string; message: string };

const PROBLEMS: Record<string, { title: string; message: string }> = {
  ended: { title: "This game has ended", message: "Ask for a new link, or start your own game." },
  not_found: { title: "No game with that code", message: "Check the code with your opponent and try again." },
  full: { title: "This game already has two players", message: "Ask the host for a new link." },
  missing: { title: "Play together isn't on yet", message: "It's coming soon. You can still use the companion on one phone." },
};

function problemFor(error: string, status: number, message: string): { title: string; message: string } {
  if (status === 410) return PROBLEMS.ended;
  return PROBLEMS[error] ?? { title: "Couldn't open that game", message };
}

export function LiveJoin({ code, isAuthenticated, displayName, tier }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [name, setName] = useState(displayName ?? "");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Already in this game on this phone (account or kept token)? Straight in.
      const token = savedToken(code);
      if (token || isAuthenticated) {
        const res = await liveGet(code, token);
        if (cancelled) return;
        if (!isFailure(res) && res.view) {
          setPhase({ kind: "in", boot: { code, token, view: res.view } });
          return;
        }
        if (isFailure(res) && (res.status === 410 || res.error === "missing")) {
          setPhase({ kind: "problem", ...problemFor(res.error, res.status, res.message) });
          return;
        }
      }
      const pre = await livePreview(code);
      if (cancelled) return;
      if (isFailure(pre)) {
        setPhase({ kind: "problem", ...problemFor(pre.error, pre.status, pre.message) });
        return;
      }
      if (!pre.preview.open) {
        setPhase({ kind: "problem", ...PROBLEMS.full });
        return;
      }
      setPhase({ kind: "join", hostName: pre.preview.hostName });
    })();
    return () => {
      cancelled = true;
    };
  }, [code, isAuthenticated]);

  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    setJoining(true);
    setJoinError(null);
    const res = await liveJoin(code, savedToken(code), name);
    setJoining(false);
    if (isFailure(res)) {
      if (res.error === "full" || res.error === "not_found" || res.status === 410) setPhase({ kind: "problem", ...problemFor(res.error, res.status, res.message) });
      else setJoinError(res.message);
      return;
    }
    if (res.token) saveToken(code, res.token);
    setPhase({ kind: "in", boot: { code, token: res.token ?? savedToken(code), view: res.view } });
  };

  if (phase.kind === "in") {
    return (
      <CompanionPage
        viewer={isAuthenticated ? { kind: "auth", displayName, tier } : { kind: "guest" }}
        savedGames={[]}
        autoResume={null}
        live={phase.boot}
      />
    );
  }

  return (
    <main className="companion-entry">
      <div className="companion-entry__card companion-join">
        <span className="companion-join__eyebrow">Play together</span>
        {phase.kind === "checking" && (
          <>
            <h1 className="companion-entry__title">Opening game {spacedCode(code)}</h1>
            <p className="companion-entry__lede" role="status">Checking the game…</p>
          </>
        )}

        {phase.kind === "problem" && (
          <>
            <h1 className="companion-entry__title">{phase.title}</h1>
            <p className="companion-entry__lede">{phase.message}</p>
            <Link href="/tcg-companion" className="companion-join__link">
              <Button variant="primary" fullWidth>Open the companion</Button>
            </Link>
          </>
        )}

        {phase.kind === "join" && (
          <form className="companion-join__form" onSubmit={join}>
            <h1 className="companion-entry__title">{phase.hostName} invited you to a game</h1>
            <div className="companion-join__vs" aria-hidden="true">
              <span className="companion-join__seat">
                <span className="companion-join__avatar companion-join__avatar--host">{phase.hostName.slice(0, 1).toUpperCase()}</span>
                <strong>{phase.hostName}</strong>
                <span>Host</span>
              </span>
              <span className="companion-join__versus">vs</span>
              <span className="companion-join__seat">
                <span className="companion-join__avatar">{(name.trim() || "?").slice(0, 1).toUpperCase()}</span>
                <strong>{name.trim() || "You"}</strong>
                <span>Opponent</span>
              </span>
            </div>
            <label className="companion-join__label" htmlFor="companion-join-name">Your name</label>
            <Input
              id="companion-join-name"
              value={name}
              maxLength={24}
              autoComplete="nickname"
              placeholder="What should they call you?"
              onChange={(e) => setName(e.target.value)}
              fullWidth
            />
            {joinError && <Alert variant="warning">{joinError}</Alert>}
            <Button type="submit" variant="primary" size="large" fullWidth disabled={joining || !name.trim()}>
              {joining ? "Joining…" : "Join game"}
            </Button>
            <p className="companion-entry__hint">
              {isAuthenticated ? (
                "Your result is saved to your account."
              ) : (
                <>
                  No account needed.{" "}
                  <Link href={{ pathname: "/login", query: { redirect: `/tcg-companion?play=${code}` } }}>Sign in</Link>
                  {" "}to keep your results.
                </>
              )}
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
