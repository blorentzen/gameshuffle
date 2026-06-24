"use client";

/**
 * Navbar notifications — CDS NotificationTrigger (bell + unread badge) +
 * Notifications dropdown. Loads on sign-in, subscribes to realtime inserts,
 * and marks-all-read on open. Renders nothing for signed-out users.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  NotificationTrigger,
  Notifications,
  type NotificationData,
  type NotificationType,
} from "@empac/cascadeds";
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

type RespondFn = (
  notifId: string,
  invitationId: string,
  action: "accept" | "decline",
) => void;

function toData(n: ApiNotif, onRespond: RespondFn): NotificationData {
  const base: NotificationData = {
    id: n.id,
    type: TYPE_MAP[n.type] ?? "info",
    title: n.title,
    message: n.message ?? undefined,
    timestamp: n.createdAt,
    read: n.read,
    user: n.actor
      ? {
          name: n.actor.name,
          avatar: n.actor.avatar ?? undefined,
          initials: n.actor.name.slice(0, 2).toUpperCase(),
        }
      : undefined,
    href: n.link ?? undefined,
  };

  // Unanswered invites get Accept / Decline actions.
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

export function NotificationsBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    // Optimistically mark handled — drops the Accept/Decline actions.
    setItems((prev) =>
      prev.map((i) => (i.id === notifId ? { ...i, read: true, actions: undefined } : i)),
    );
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
    // Initial load — async (setState only after the fetch resolves).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  if (!user) return null;

  function markAllRead() {
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    void fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_all" }),
    });
  }

  function openPanel() {
    setOpen(true);
    if (unread > 0) markAllRead();
  }

  return (
    <>
      <NotificationTrigger unreadCount={unread} onClick={openPanel} />
      <Notifications
        isOpen={open}
        onClose={() => setOpen(false)}
        notifications={items}
        title="Notifications"
        position="top-right"
        showMarkAllAsRead
        onMarkAllAsRead={markAllRead}
        onNotificationClick={(n) => {
          setOpen(false);
          if (n.href) router.push(n.href);
        }}
        emptyMessage="No notifications yet."
      />
    </>
  );
}
