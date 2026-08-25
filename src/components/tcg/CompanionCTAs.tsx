"use client";

import Link from "next/link";
import { Button, Stack } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Companion module CTAs — two primary actions, auth-aware:
 *   - signed out → "Open the companion" (single action)
 *   - signed in  → "Open the companion" + "View my collection"
 * Both are primary (no secondary/tertiary noise), so the module has a clear
 * next step whether or not you have an account.
 */
export function CompanionCTAs({
  openHref,
  openLabel = "Open the companion",
  collectionHref,
}: {
  openHref: string;
  openLabel?: string;
  collectionHref: string;
}) {
  const { user } = useAuth();
  return (
    <Stack direction="horizontal" gap={12} wrap justify="center">
      <Link href={openHref} style={{ textDecoration: "none" }}>
        <Button variant="primary" size="large">
          {openLabel}
        </Button>
      </Link>
      {user ? (
        <Link href={collectionHref} style={{ textDecoration: "none" }}>
          <Button variant="primary" size="large">
            View my collection
          </Button>
        </Link>
      ) : null}
    </Stack>
  );
}
