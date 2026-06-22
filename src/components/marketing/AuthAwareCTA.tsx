import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { effectiveTier, normalizeTier } from "@/lib/subscription";

/**
 * Auth-aware primary CTA. Server component — reads the Supabase session
 * and the user's effective tier on the server so the correct label/href
 * is in the initial HTML (no client-side swap, no hydration flash on the
 * hero/conversion button).
 *
 * Three render states, each independently overridable per placement:
 *   - anon  → no session            → default "Create your account" → /signup
 *   - free  → session, free tier     → default "Upgrade to Pro"      → /gs-pro
 *   - pro   → session, pro/staff     → default "Manage subscription" → /account
 *             (or hidden entirely when `hideOnPro`)
 *
 * Per `specs/gs-marketing/gameshuffle-marketing-copy-v1.md` (auth-aware CTA
 * convention). Tier resolution mirrors the server pattern in
 * `src/app/tcg-companion/page.tsx` — `normalizeTier` + `effectiveTier` so
 * staff/impersonation inherit the right tier.
 */

type CTAState = "anon" | "free" | "pro";

interface CTAOverride {
  label: string;
  href: string;
}

interface AuthAwareCTAProps {
  variant?: "primary" | "secondary" | "tertiary" | "ghost";
  size?: "small" | "medium" | "large";
  /** Per-state label/href overrides. Omitted states fall back to defaults. */
  overrides?: Partial<Record<CTAState, CTAOverride>>;
  /** When true, render nothing for Pro users instead of the manage CTA. */
  hideOnPro?: boolean;
  /** Optional full-width button. */
  fullWidth?: boolean;
}

const DEFAULTS: Record<CTAState, CTAOverride> = {
  anon: { label: "Create your account", href: "/signup" },
  free: { label: "Upgrade to Pro", href: "/gs-pro" },
  pro: { label: "Manage subscription", href: "/account" },
};

async function resolveState(): Promise<CTAState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "anon";

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_tier, role")
    .eq("id", user.id)
    .maybeSingle();

  const tier = effectiveTier({
    tier: normalizeTier(profile?.subscription_tier as string | null),
    role: (profile?.role as string | null) ?? null,
  });
  return tier === "pro" ? "pro" : "free";
}

export async function AuthAwareCTA({
  variant = "primary",
  size = "large",
  overrides,
  hideOnPro = false,
  fullWidth = false,
}: AuthAwareCTAProps) {
  const state = await resolveState();

  if (state === "pro" && hideOnPro && !overrides?.pro) return null;

  const cta = overrides?.[state] ?? DEFAULTS[state];

  return (
    <Link href={cta.href} style={{ textDecoration: "none" }}>
      <Button variant={variant} size={size} fullWidth={fullWidth}>
        {cta.label}
      </Button>
    </Link>
  );
}
