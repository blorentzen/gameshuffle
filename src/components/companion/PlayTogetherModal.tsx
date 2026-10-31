"use client";

/**
 * Play together: share the game on this phone with an opponent on theirs.
 *
 * Signed out → sign in first (the game on this phone is kept). Free account →
 * the GS Pro trial prompt (only the host needs Pro; joining is free). Pro →
 * one tap shares the board and shows the code (same table) and the link (far
 * apart), then waits for the other phone and says when they're in.
 */

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Modal } from "@empac/cascadeds";
import { IconBrandDiscord, IconCopy, IconShare } from "@tabler/icons-react";
import { useSession } from "@/lib/companion/SessionContext";
import { spacedCode } from "@/lib/companion/liveRules";
import { useToast } from "@/components/toast/ToastProvider";
import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";
import { TablerIcon } from "./TablerIcon";

function joinLink(code: string): string {
  const origin = typeof window === "undefined" ? "https://www.gameshuffle.co" : window.location.origin;
  return `${origin}/tcg-companion?play=${code}`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PlayTogetherModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { live, isAuthenticated, isPro, startLive, mode } = useSession();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = async () => {
    setStarting(true);
    setError(null);
    const res = await startLive();
    setStarting(false);
    if (!res.ok) setError(res.message);
  };

  let body: React.ReactNode;
  if (live) {
    body = <InviteDetails code={live.code} opponent={live.seats.p2.joined ? live.seats.p2.name : null} onClose={onClose} gameName={mode.displayName} />;
  } else if (!isAuthenticated) {
    body = (
      <div className="companion-together">
        <p>Play on two phones, at the same table or far apart on a call with your real cards. Every move shows on both.</p>
        <p className="companion-together__muted">Sign in to share a game. This game stays on this phone while you do.</p>
        <Link href={{ pathname: "/login", query: { redirect: "/tcg-companion" } }} className="companion-together__link">
          <Button variant="primary" fullWidth>Sign in to share</Button>
        </Link>
        <p className="companion-together__muted">Joining someone else&apos;s game? Open their link, or tap Join a game on the companion&apos;s start screen.</p>
      </div>
    );
  } else if (!isPro) {
    body = (
      <ProTrialPrompt title="Play together is part of GS Pro" from="companion-play-together">
        Play on two phones, at the table or over a call. Your opponent joins free, no account needed.
      </ProTrialPrompt>
    );
  } else {
    body = (
      <div className="companion-together">
        <p>Your opponent plays on their own phone. Every move shows on both, and coin flips and dice are rolled by GameShuffle so you both see the same result.</p>
        <ul className="companion-together__ways">
          <li><span className="companion-together__tile" aria-hidden="true"><TablerIcon name="cards" size="16" /></span><span><strong>Same table:</strong> they open the companion and type the code.</span></li>
          <li><span className="companion-together__tile" aria-hidden="true"><IconShare size={16} /></span><span><strong>Far apart:</strong> send the link, then get on a call with your real cards.</span></li>
        </ul>
        {error && <Alert variant="warning">{error}</Alert>}
        <Button variant="primary" fullWidth onClick={share} disabled={starting}>
          {starting ? "Sharing…" : "Share this game"}
        </Button>
        <p className="companion-together__muted">Your opponent joins free. Their phone shows their side at the bottom.</p>
      </div>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Play together">
      {body}
    </Modal>
  );
}

function InviteDetails({ code, opponent, onClose, gameName }: { code: string; opponent: string | null; onClose: () => void; gameName: string }) {
  const toast = useToast();
  const link = joinLink(code);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="companion-together">
      <span className="companion-together__label" id="companion-together-code">Game code</span>
      <p className="companion-together__code" aria-labelledby="companion-together-code">
        {code.split("").map((ch, i) => (
          <span key={i} className={i === 3 ? "companion-together__char companion-together__char--gap" : "companion-together__char"}>{ch}</span>
        ))}
        <span className="sr-only">{spacedCode(code).split("").join(" ")}</span>
      </p>
      <ul className="companion-together__ways">
        <li><span className="companion-together__tile" aria-hidden="true"><TablerIcon name="cards" size="16" /></span><span><strong>Same table:</strong> they open the companion, tap Join a game and type the code.</span></li>
        <li><span className="companion-together__tile" aria-hidden="true"><IconShare size={16} /></span><span><strong>Far apart:</strong> send the link, then get on a call with your real cards.</span></li>
      </ul>
      <div className="companion-together__buttons">
        <Button
          variant="primary"
          size="small"
          iconBefore={IconCopy}
          onClick={async () => {
            const ok = await copy(link);
            toast.toast({ variant: ok ? "success" : "warning", message: ok ? "Link copied." : link });
          }}
        >
          Copy link
        </Button>
        {canShare && (
          <Button
            variant="secondary"
            size="small"
            iconBefore={IconShare}
            onClick={() => navigator.share({ title: `${gameName} TCG on GameShuffle`, text: `Join my ${gameName} TCG game (code ${spacedCode(code)})`, url: link }).catch(() => undefined)}
          >
            Share
          </Button>
        )}
        <Button
          variant="secondary"
          size="small"
          iconBefore={IconBrandDiscord}
          onClick={async () => {
            const ok = await copy(`Join my ${gameName} TCG game on GameShuffle: ${link} (code ${spacedCode(code)})`);
            toast.toast({ variant: ok ? "success" : "warning", message: ok ? "Copied. Paste it in Discord." : link });
          }}
        >
          Copy for Discord
        </Button>
      </div>
      {opponent ? (
        <div className="companion-together__joined" role="status">
          <span><strong>{opponent}</strong> joined. Have a good game!</span>
          <Button variant="primary" size="small" onClick={onClose}>Start playing</Button>
        </div>
      ) : (
        <p className="companion-together__waiting" role="status">
          <span className="companion-together__pulse" aria-hidden="true" />
          Waiting for your opponent…
        </p>
      )}
    </div>
  );
}
