"use client";

import { useRouter } from "next/navigation";
import { Select } from "@empac/cascadeds";
import { seasonLabel } from "@/lib/seasons/ranks";
import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";

/**
 * Which month's season to show. Past seasons are GS Pro (decided 2026-10-07),
 * judged on the page owner: with Pro everyone can browse them; without it the
 * picker doesn't show, and only the owner sees the trial prompt (owners pay to show
 * their own history; viewers never see a wall here).
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
      <div className="season-picker__upsell">
        <ProTrialPrompt compact title="Past seasons are part of GS Pro" from="seasons">
          <p>Everyone who visits can browse your earlier months too.</p>
        </ProTrialPrompt>
      </div>
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
