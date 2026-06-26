"use client";

/**
 * Per-type unread (notifications + messages, plus their total) for the navbar
 * bell + messages badges. Refetches on realtime inserts (RLS scopes message
 * events to the user's own conversations). Returns zeros for signed-out users.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";

export interface CommsUnread {
  notifications: number;
  messages: number;
  total: number;
}

export function useCommsUnread(): CommsUnread {
  const { user } = useAuth();
  const [counts, setCounts] = useState<CommsUnread>({ notifications: 0, messages: 0, total: 0 });

  const load = useCallback(async () => {
    const res = await fetch("/api/comms/unread", { cache: "no-store" });
    if (res.ok) {
      const b = (await res.json()) as Partial<CommsUnread>;
      setCounts({
        notifications: b.notifications ?? 0,
        messages: b.messages ?? 0,
        total: b.total ?? 0,
      });
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`comms-unread:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .on(
        // RLS (messages_select_member) scopes delivery to the user's conversations.
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => void load(),
      )
      .subscribe();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  return counts;
}
