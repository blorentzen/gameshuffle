import Link from "next/link";
import { Button, Stack } from "@empac/cascadeds";
import { DarkBand } from "@/components/marketing/DarkBand";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";

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
          Free to use solo. Create an account to save your setups, or go Pro to run every tool
          live on your OBS overlay, driven by your chat and channel-point rewards.
        </p>
        <Stack direction="horizontal" gap={12} justify="center" wrap>
          <AuthAwareCTA
            variant="primary"
            size="large"
            overrides={{
              anon: { label: "Create your account", href: "/signup" },
              free: { label: "Upgrade to Pro", href: "/gs-pro" },
              pro: { label: "Open your hub", href: "/hub" },
            }}
          />
          <Link href="/gs-pro" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="large">Explore GS Pro</Button>
          </Link>
        </Stack>
      </div>
    </DarkBand>
  );
}
