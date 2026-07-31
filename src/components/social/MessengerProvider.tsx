"use client";

/**
 * Navbar comms coordinator. Lives in the app shell (chrome branch only, so it's
 * absent on OBS/overlay routes) and owns the open state for BOTH the bottom-
 * right messenger and the notifications popover — so they're mutually exclusive
 * (opening one closes the other). Shared by the navbar bell + chat bubble, the
 * panel, and "Message" buttons (`openConversation(id)` pops a thread).
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface MessengerCtx {
  open: boolean; // messenger
  notificationsOpen: boolean;
  /** A conversation the messenger should switch to once opened, then cleared. */
  requestedId: string | null;
  openMessenger: () => void;
  closeMessenger: () => void;
  toggleMessenger: () => void;
  closeNotifications: () => void;
  toggleNotifications: () => void;
  openConversation: (id: string) => void;
  clearRequested: () => void;
}

const Ctx = createContext<MessengerCtx | null>(null);

export function MessengerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [requestedId, setRequestedId] = useState<string | null>(null);

  // Opening either surface closes the other (they share the top-right corner).
  const openMessenger = useCallback(() => {
    setNotificationsOpen(false);
    setOpen(true);
  }, []);
  const closeMessenger = useCallback(() => setOpen(false), []);
  const toggleMessenger = useCallback(() => {
    setNotificationsOpen(false);
    setOpen((o) => !o);
  }, []);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);
  const toggleNotifications = useCallback(() => {
    setOpen(false);
    setNotificationsOpen((n) => !n);
  }, []);
  const openConversation = useCallback((id: string) => {
    setNotificationsOpen(false);
    setRequestedId(id);
    setOpen(true);
  }, []);
  const clearRequested = useCallback(() => setRequestedId(null), []);

  return (
    <Ctx.Provider
      value={{
        open,
        notificationsOpen,
        requestedId,
        openMessenger,
        closeMessenger,
        toggleMessenger,
        closeNotifications,
        toggleNotifications,
        openConversation,
        clearRequested,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useMessenger(): MessengerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMessenger must be used within MessengerProvider");
  return ctx;
}
