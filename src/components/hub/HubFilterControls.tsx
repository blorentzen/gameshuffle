"use client";

/**
 * Hub session list filters + sort. Per gs-pro-v1-phase-4a-spec.md §4.3.
 *
 * Client component because the filter state drives URL navigation. State
 * isn't persisted across page loads (that's Phase 4B); it lives in
 * search params for the current view only.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@empac/cascadeds";
import type { SessionStatus } from "@/lib/sessions/types";

export type HubView = "real" | "test" | "all";

interface HubFilterControlsProps {
  statusOptions: readonly SessionStatus[];
  platformOptions: ReadonlyArray<{ value: string; label: string }>;
  initialStatus: string[];
  initialPlatform: string[];
  initialSort: "newest" | "oldest" | "name";
  /** Real-vs-test view toggle — defaults to `real` so test runs don't
   *  muddy the streamer's session history. Pass null/undefined and the
   *  toggle hides (e.g. on the test-only entry). */
  initialView: HubView;
  /** Total counts per view, surfaced in the toggle chips so the
   *  streamer sees at a glance how many test runs they have. */
  counts?: { real: number; test: number };
}

export function HubFilterControls({
  statusOptions,
  platformOptions,
  initialStatus,
  initialPlatform,
  initialSort,
  initialView,
  counts,
}: HubFilterControlsProps) {
  const router = useRouter();
  const search = useSearchParams();
  const [, startTransition] = useTransition();

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value === null || value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    // Reset pagination when filters change.
    next.delete("limit");
    startTransition(() => {
      router.replace(`/hub?${next.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="hub-filters">
      <div className="hub-filters__view-row" role="tablist" aria-label="Session view">
        {(
          [
            { id: "real" as const, label: "Sessions", count: counts?.real },
            { id: "test" as const, label: "Test streams", count: counts?.test },
            { id: "all" as const, label: "All", count: undefined },
          ] satisfies Array<{ id: HubView; label: string; count?: number }>
        ).map((opt) => {
          const active = initialView === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`hub-filters__view-chip${active ? " hub-filters__view-chip--active" : ""}`}
              onClick={() =>
                updateParam("view", opt.id === "real" ? null : opt.id)
              }
            >
              {opt.label}
              {typeof opt.count === "number" && (
                <span className="hub-filters__view-count">{opt.count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="hub-filters__row">
        <div className="hub-filters__group">
          <label className="hub-filters__label">Status</label>
          <Select
            multiple
            value={initialStatus}
            onChange={(value) => {
              const arr = Array.isArray(value) ? value : value ? [value] : [];
              updateParam("status", arr.join(","));
            }}
            options={statusOptions.map((s) => ({ value: s, label: s }))}
          />
        </div>

        <div className="hub-filters__group">
          <label className="hub-filters__label">Platform</label>
          <Select
            multiple
            value={initialPlatform}
            onChange={(value) => {
              const arr = Array.isArray(value) ? value : value ? [value] : [];
              updateParam("platform", arr.join(","));
            }}
            options={platformOptions.map((p) => ({ value: p.value, label: p.label }))}
          />
        </div>

        <div className="hub-filters__group">
          <label className="hub-filters__label">Sort</label>
          <Select
            value={initialSort}
            onChange={(value) => {
              const s = typeof value === "string" ? value : value[0] ?? "newest";
              updateParam("sort", s === "newest" ? null : s);
            }}
            options={[
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
              { value: "name", label: "Name (A–Z)" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
