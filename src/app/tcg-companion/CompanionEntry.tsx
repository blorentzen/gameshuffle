"use client";

/**
 * The real entry chooser. Shown when the viewer isn't authenticated
 * AND hasn't already opted into guest mode (or beta access).
 *
 * v1 Scope §10 frames this as the conversion mechanism: a free
 * GameShuffle account is the primary success metric, with guest
 * mode available as a friction-free fallback. The button order
 * matches that — sign-in first, guest second.
 */

import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { TCG_SHOP_URL } from "@/data/shop";

interface Props {
  onEnterAsGuest: () => void;
}

export function CompanionEntry({ onEnterAsGuest }: Props) {
  return (
    <div className="companion-entry">
      <div className="companion-entry__card">
        <h1 className="companion-entry__title">TCG Companion</h1>
        <p className="companion-entry__lede">
          Damage counters, condition tracking, prize counts, a coin, and
          dice for your Pokémon table game.
        </p>

        <div className="companion-entry__actions">
          <Link
            href={{ pathname: "/login", query: { redirect: "/tcg-companion" } }}
            style={{ textDecoration: "none" }}
          >
            <Button variant="primary" size="large" fullWidth>
              Sign in to GameShuffle
            </Button>
          </Link>
          <Button variant="secondary" size="large" fullWidth onClick={onEnterAsGuest}>
            Continue as guest
          </Button>
        </div>

        <p className="companion-entry__hint">
          Guest mode lets you play right now, though your game won&apos;t save
          when you leave.
        </p>

        {/* Signing in unlocks My Cards — a conversion nudge toward a free
            account (the destination redirects to login for guests). */}
        <p className="companion-entry__cards">
          Track what you own?{" "}
          <Link href="/account/stuff?tab=my-cards">Go to My Cards</Link>
        </p>

        <p className="companion-entry__shop">
          Need cards?{" "}
          <a href={TCG_SHOP_URL} target="_blank" rel="noopener noreferrer">
            Shop our Pokémon cards ↗
          </a>
        </p>
      </div>
    </div>
  );
}
