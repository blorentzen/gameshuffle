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
import { TCG_SHOP_URL } from "@/data/shop";

interface Props {
  betaModeOn: boolean;
  onEnterAsGuest: () => void;
}

export function CompanionEntry({ betaModeOn, onEnterAsGuest }: Props) {
  return (
    <div className="companion-entry">
      <div className="companion-entry__card">
        <h1 className="companion-entry__title">TCG Companion</h1>
        <p className="companion-entry__lede">
          Damage counters, condition tracking, prize counts, a coin, and
          dice — for your Pokémon table game.
        </p>

        <div className="companion-entry__actions">
          <Link
            href={{ pathname: "/login", query: { redirect: "/tcg-companion" } }}
            className="companion-entry__btn companion-entry__btn--primary"
          >
            Sign in to GameShuffle
          </Link>
          <button
            type="button"
            className="companion-entry__btn companion-entry__btn--secondary"
            onClick={onEnterAsGuest}
          >
            Continue as guest
          </button>
        </div>

        <p className="companion-entry__hint">
          Guest mode lets you play right now — your game won&apos;t save
          when you leave.
        </p>

        <p className="companion-entry__shop">
          Need cards?{" "}
          <a href={TCG_SHOP_URL} target="_blank" rel="noopener noreferrer">
            Shop our Pokémon cards ↗
          </a>
        </p>

        {betaModeOn && (
          <p className="companion-entry__beta">
            On the Discord tester list? <Link href="/tcg-companion/beta">Enter the beta passphrase</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
