"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select } from "@empac/cascadeds";
import { seasonLabel } from "@/lib/seasons/ranks";

/**
 * Which month's season to show. Past seasons are GS Pro (decided 2026-10-07),
 * judged on the page owner: with Pro everyone can browse them; without it the
 * picker doesn't show, and only the owner sees a pointer to the trial.
 * Navigates with ?season=YYYY-MM (plus any `extra` params, e.g. the profile tab).
 */
export function SeasonPicker({ value, months, allowPast, ownerUpsell, extra }: {
  value: string;
  /** Newest first, current month first. */
  months: string[];
  allowPast: boolean;
  /** The free owner is looking at their own page: show the trial pointer. */
  ownerUpsell?: boolean;
  extra?: Record<string, string>;
}) {
  const router = useRouter();
  if (!allowPast) {
    return ownerUpsell ? (
      <p className="season-picker__upsell">
        <Link href="/account?tab=plans">See past seasons with GS Pro</Link>
      </p>
    ) : null;
  }
  return (
    <div className="season-picker">
      <Select
        floatingLabel="Season"
        options={months.map((m, i) => ({ value: m, label: i === 0 ? `${seasonLabel(m)} (this month)` : seasonLabel(m) }))}
        value={value}
        onChange={(v) => {
          const key = typeof v === "string" ? v : v[0];
          if (!key) return;
          const params = new URLSearchParams(window.location.search);
          for (const [k, val] of Object.entries(extra ?? {})) params.set(k, val);
          if (key === months[0]) params.delete("season"); else params.set("season", key);
          const q = params.toString();
          router.replace(q ? `?${q}` : window.location.pathname, { scroll: false });
        }}
        size="small"
      />
    </div>
  );
}
