"use client";

/** The Host home's tabs (journeys picks 2026-11-06, 7A): Home, Events, Leagues and seasons, Communities, Tools, as links. */

import { usePathname } from "next/navigation";
import { LabeledSubNav } from "@/components/ui/LabeledSubNav";

const TABS = [
  { label: "Home", href: "/host", on: (p: string) => p === "/host" },
  { label: "Events", href: "/host/events", on: (p: string) => p.startsWith("/host/events") },
  { label: "Leagues and seasons", href: "/host/leagues", on: (p: string) => p.startsWith("/host/leagues") },
  { label: "Communities", href: "/host/communities", on: (p: string) => p.startsWith("/host/communities") },
  { label: "Tools", href: "/host/tools", on: (p: string) => p.startsWith("/host/tools") },
];

export function HostNav() {
  const p = usePathname() ?? "/host";
  return <LabeledSubNav label="Host" variant="tabs" className="studio-nav" items={TABS.map((t) => ({ label: t.label, href: t.href, active: t.on(p) }))} />;
}
