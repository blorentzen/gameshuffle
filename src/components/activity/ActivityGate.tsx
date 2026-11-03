"use client";

/**
 * The Activity page serves both Discord apps (src/lib/activity/frame.ts). The server renders GameShuffle's app as it
 * always has; in GameShuffle Competitive's frame the War room takes over right after the page wakes up. GameShuffle's
 * app checks the frame too before it signs in, so it never starts Discord's one-time handshake as the wrong app.
 */

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { ActivityApp } from "./ActivityApp";
import { activityFrameApp } from "@/lib/activity/frame";

const WarRoomApp = dynamic(() => import("./war/WarRoomApp").then((m) => m.WarRoomApp), { ssr: false });
const noopSubscribe = () => () => {};

export function ActivityGate({ clientId, compClientId }: { clientId: string | null; compClientId: string | null }) {
  const app = useSyncExternalStore(noopSubscribe, activityFrameApp, () => "main" as const);
  return app === "comp" ? <WarRoomApp clientId={compClientId} /> : <ActivityApp clientId={clientId} />;
}
