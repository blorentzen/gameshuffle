"use client";

/** The Events tab's kind filter (`?kind=`), as pills with counts (CDS SubNav). */

import { LabeledSubNav } from "@/components/ui/LabeledSubNav";
import type { HostKind } from "@/lib/host/home";

const KINDS: { id: HostKind | null; label: string }[] = [
  { id: null, label: "Everything" },
  { id: "tournament", label: "Tournaments" },
  { id: "night", label: "Game nights" },
  { id: "trivia", label: "Trivia" },
];

export function HostKinds({ active, counts }: { active: HostKind | null; counts: Record<"all" | HostKind, number> }) {
  const items = KINDS.filter((k) => !k.id || counts[k.id] > 0).map((k) => ({
    label: `${k.label} (${counts[k.id ?? "all"]})`,
    href: k.id ? `/host/events?kind=${k.id}` : "/host/events",
    active: k.id === active,
  }));
  return <LabeledSubNav label="Kind of event" variant="pills" className="host-kinds" items={items} />;
}
