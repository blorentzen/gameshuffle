"use client";

/**
 * Presence dot that updates live. Drop-in replacement for the inline
 * `{isOnline && <span className="…__dot" />}` pattern: pass the same className
 * and the server-known `isOnline` as `fallback`. Renders nothing when offline.
 */

import { useUserPresence } from "./PresenceProvider";

export function LivePresenceDot({
  userId,
  fallback = false,
  className,
  label = "Online",
}: {
  userId: string | null | undefined;
  fallback?: boolean;
  className?: string;
  label?: string;
}) {
  const online = useUserPresence(userId, fallback);
  if (!online) return null;
  return <span className={className} title={label} aria-label={label} />;
}
