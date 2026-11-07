"use client";

/** The Studio's tabs (journeys picks 2026-11-06, 10A): Home, Streams, Tools, Setup, Discord, as links (CDS SubNav). */

import { usePathname } from "next/navigation";
import { LabeledSubNav } from "@/components/ui/LabeledSubNav";

const TABS = [
  { label: "Home", href: "/hub", on: (p: string) => p === "/hub" },
  { label: "Streams", href: "/hub/streams", on: (p: string) => p.startsWith("/hub/streams") || p.startsWith("/hub/sessions") },
  { label: "Tools", href: "/hub/tools", on: (p: string) => p.startsWith("/hub/tools") },
  { label: "Setup", href: "/hub/setup", on: (p: string) => p.startsWith("/hub/setup") },
  { label: "Discord", href: "/account/discord", on: () => false },
];

export function StudioNav() {
  const p = usePathname() ?? "/hub";
  return <LabeledSubNav label="Studio" variant="tabs" className="studio-nav" items={TABS.map((t) => ({ label: t.label, href: t.href, active: t.on(p) }))} />;
}
