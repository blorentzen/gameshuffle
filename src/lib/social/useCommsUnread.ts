"use client";

/**
 * Per-type unread (notifications + messages, plus their total) for the navbar
 * bell + messages badges. Refetches on realtime inserts: the user's notifications,
 * and new messages in their own conversations. Returns zeros for signed-out users.
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
    // A dropped connection (a phone going to the background, a bad signal) just
    // keeps the last counts: it ran from the menu on every page and surfaced as
    // "Load failed" errors (Sentry GAMESHUFFLE-5Q).
    try {
      const res = await fetch("/api/comms/unread", { cache: "no-store" });
      if (!res.ok) return;
      const b = (await res.json()) as Partial<CommsUnread>;
      setCounts({
        notifications: b.notifications ?? 0,
        messages: b.messages ?? 0,
        total: b.total ?? 0,
      });
    } catch {
      /* offline for a moment: the next change or page load refreshes the counts */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    let alive = true;
    let messages: ReturnType<typeof supabase.channel> | null = null;
    let watching = "";
    // New messages only in this person's own conversations (up to 100, Realtime's limit for an
    // `in` filter). Listening to every message on the site made Realtime check each one against
    // every signed-in tab. A new conversation arrives with a notification, which re-reads the list.
    const watchConversations = async () => {
      const { data } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id).limit(100);
      if (!alive) return;
      const ids = ((data ?? []) as { conversation_id: string }[]).map((r) => r.conversation_id).sort();
      const next = ids.join(",");
      if (next === watching) return;
      watching = next;
      if (messages) void supabase.removeChannel(messages);
      messages = ids.length
        ? supabase
            .channel(`comms-unread-messages:${user.id}`)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=in.(${next})` }, () => void load())
            .subscribe()
        : null;
    };
    const channel = supabase
      .channel(`comms-unread:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => { void load(); void watchConversations(); },
      )
      .subscribe();
    void watchConversations();
    // Reading a conversation marks it read without a realtime event, so the
    // messenger dispatches this to force a recount (clears the badge).
    const onRefresh = () => { void load(); void watchConversations(); };
    window.addEventListener("gs-comms-refresh", onRefresh);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
      if (messages) void supabase.removeChannel(messages);
      window.removeEventListener("gs-comms-refresh", onRefresh);
    };
  }, [user, load]);

  return counts;
}
