"use client";

/** One of Account ▸ Streaming's screens, inside a Studio page (journeys picks 2026-11-06, 10A). */

import { proScreens } from "@/components/account/streaming/StreamingTabs";

export function StudioScreen({ screen, profileTimezone }: { screen: string; profileTimezone: string | null }) {
  const render = proScreens(profileTimezone)[screen];
  return <div className="studio-screen">{render ? render() : null}</div>;
}
