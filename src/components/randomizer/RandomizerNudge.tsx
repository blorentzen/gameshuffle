import { DarkBand } from "@/components/marketing/DarkBand";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";

/**
 * Conversion module under the free randomizers. Two paths, auth-aware:
 *  1. a free GameShuffle account (save setups, competitive scoring, tournaments)
 *  2. GS Pro (this randomizer live on the OBS overlay, chat-driven)
 * Server component so the CTA label/href match the viewer's state in the initial
 * HTML (no hydration flash). Full-bleed — render OUTSIDE the tool Container, at
 * the bottom of the randomizer page.
 */
export function RandomizerNudge({ gameName }: { gameName: string }) {
  return (
    <DarkBand premium curved curveEdges="top" curveColor="var(--surface-default)">
      <div className="rand-nudge">
        <div className="rand-nudge__card">
          <p className="marketing-eyebrow">Free account</p>
          <h3 className="rand-nudge__title">Save your setups, play for keeps</h3>
          <p className="rand-nudge__body">
            A free GameShuffle account saves your kart builds and game-night setups,
            unlocks competitive lounge scoring, and lets you run tournaments with
            friends.
          </p>
          <AuthAwareCTA
            variant="primary"
            size="large"
            overrides={{
              anon: { label: "Create your free account", href: "/signup" },
              free: { label: "Explore your account", href: "/account/stuff?tab=setups" },
              pro: { label: "Open My Stuff", href: "/account/stuff?tab=setups" },
            }}
          />
        </div>

        <div className="rand-nudge__card">
          <p className="marketing-eyebrow">GameShuffle Pro</p>
          <h3 className="rand-nudge__title">Put {gameName} on your stream</h3>
          <p className="rand-nudge__body">
            Go Pro to run this randomizer live on your OBS overlay, driven by your
            chat and channel-point rewards, with a public lobby your viewers can
            join.
          </p>
          <AuthAwareCTA
            variant="secondary"
            size="large"
            overrides={{
              anon: { label: "Explore GS Pro", href: "/gs-pro" },
              free: { label: "Upgrade to Pro", href: "/gs-pro" },
              pro: { label: "Open your hub", href: "/hub" },
            }}
          />
        </div>
      </div>
    </DarkBand>
  );
}
