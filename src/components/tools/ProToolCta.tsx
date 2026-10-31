import Link from "next/link";
import { Button, Stack } from "@empac/cascadeds";
import { DarkBand } from "@/components/marketing/DarkBand";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";
import { EVENTS, tagged } from "@/lib/analytics/events";

/**
 * Closing GS Pro module for the free-tool pages — the shared "pretty" curved
 * premium band (matches the marketing pages), driving both free signups and
 * Pro. Auth-aware: signed-out leads with account creation, free leads with the
 * upgrade, Pro opens the hub. Full-bleed, so place it OUTSIDE the tool
 * Container at the bottom of the page.
 */
export function ProToolCta() {
  return (
    <DarkBand
      premium
      curved
      curveEdges="top"
      curveColor="var(--surface-default)"
    >
      <div style={{ textAlign: "center", maxWidth: "60rem", marginInline: "auto" }}>
        <p className="marketing-eyebrow">GameShuffle Pro</p>
        <h2
          className="pro-band__title"
          style={{
            fontSize: "var(--font-size-fluid-h3)",
            fontWeight: "var(--font-weight-bold)",
            margin: "0 0 var(--spacing-12)",
            lineHeight: "var(--line-height-tight)",
          }}
        >
          Put these tools on your stream
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-18)",
            lineHeight: "var(--line-height-relaxed)",
            margin: "0 auto var(--spacing-24)",
            maxWidth: "52rem",
          }}
        >
          Free to use solo. With a free account your dice, coin, timer and wheel looks follow you
          to every device. GS Pro puts every tool on your OBS overlay in the same looks, run by
          your chat and channel-point rewards.
        </p>
        <Stack direction="horizontal" gap={12} justify="center" wrap>
          <AuthAwareCTA
            variant="primary"
            size="large"
            trackFrom="tool-band"
            overrides={{
              anon: { label: "Create your account", href: "/signup" },
              free: { label: "Upgrade to Pro", href: "/gs-pro" },
              pro: { label: "Open your hub", href: "/hub" },
            }}
          />
          <Link href="/gs-pro" style={{ textDecoration: "none" }} className={tagged(EVENTS.upgradeClicked, { from: "tool-band-explore" })}>
            <Button variant="secondary" size="large">Explore GS Pro</Button>
          </Link>
        </Stack>
      </div>
    </DarkBand>
  );
}
