"use client";

/**
 * Notifications state/logic shared by the Comms Center (alerts tab) and the
 * navbar inbox badge: load + realtime + mark-read + invite Accept/Decline.
 * Returns CDS-NotificationData-ready items.
 */

import { useCallback, useEffect, useState } from "react";
import type { NotificationData, NotificationType } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";

const TYPE_MAP: Record<string, NotificationType> = {
  follow: "info",
  system: "system",
  session_invite: "info",
  tournament_invite: "info",
  message: "comment",
};

interface ApiNotif {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  actor: { name: string; username: string | null; avatar: string | null } | null;
  data: Record<string, unknown> | null;
}

const CheckIcon = () => <span aria-hidden>✓</span>;
const XIcon = () => <span aria-hidden>✕</span>;

type RespondFn = (notifId: string, invitationId: string, action: "accept" | "decline") => void;

function toData(n: ApiNotif, onRespond: RespondFn): NotificationData {
  const base: NotificationData = {
    id: n.id,
    type: TYPE_MAP[n.type] ?? "info",
    title: n.title,
    message: n.message ?? undefined,
    timestamp: n.createdAt,
    read: n.read,
    user: n.actor
      ? { name: n.actor.name, avatar: n.actor.avatar ?? undefined, initials: n.actor.name.slice(0, 2).toUpperCase() }
      : undefined,
    href: n.link ?? undefined,
  };
  if (!n.read && (n.type === "session_invite" || n.type === "tournament_invite")) {
    const invId = typeof n.data?.invitationId === "string" ? n.data.invitationId : null;
    if (invId) {
      base.actions = [
        { icon: CheckIcon, label: "Accept", onClick: () => onRespond(n.id, invId, "accept") },
        { icon: XIcon, label: "Decline", danger: true, onClick: () => onRespond(n.id, invId, "decline") },
      ];
    }
  }
  return base;
}

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationData[]>([]);
  const [unread, setUnread] = useState(0);

  const respond = useCallback<RespondFn>((notifId, invitationId, action) => {
    void fetch("/api/invitations/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId, action }),
    });
    void fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", id: notifId }),
    });
    setItems((prev) => prev.map((i) => (i.id === notifId ? { ...i, read: true, actions: undefined } : i)));
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    if (!res.ok) return;
    const b = (await res.json()) as { notifications: ApiNotif[]; unread: number };
    setItems(b.notifications.map((n) => toData(n, respond)));
    setUnread(b.unread ?? 0);
  }, [respond]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          void load();
        },
      )
      .subscribe();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  const markAllRead = useCallback(() => {
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, read: true, actions: i.actions })));
    void fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_all" }),
    });
  }, []);

  return { user, items, unread, markAllRead };
}
