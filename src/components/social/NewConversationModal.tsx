"use client";

/**
 * "New message" picker — lists the people you can DM (accounts you follow or
 * who follow you, block-filtered server-side) so the messenger can start fresh
 * conversations, not just resurface existing ones. Picking one hands the user
 * id back to the messenger, which get-or-creates the conversation and opens it.
 */

import { useEffect, useState } from "react";
import { Modal, Input, Avatar } from "@empac/cascadeds";

interface Contact {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

export function NewConversationModal({
  isOpen,
  onClose,
  onPick,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPick: (userId: string) => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQ("");
    setLoading(true);
    fetch("/api/messages/contacts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((d) => setContacts((d.contacts as Contact[]) ?? []))
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          (c.username ?? "").toLowerCase().includes(needle),
      )
    : contacts;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New message" size="small">
      <div className="new-convo">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people you follow…"
        />
        <ul className="new-convo__list">
          {loading ? (
            <li className="new-convo__empty">Loading…</li>
          ) : filtered.length === 0 ? (
            <li className="new-convo__empty">
              {contacts.length === 0
                ? "Follow people (or get followed) to start a conversation."
                : "No matches."}
            </li>
          ) : (
            filtered.map((c) => (
              <li key={c.id}>
                <button type="button" className="new-convo__row" onClick={() => onPick(c.id)}>
                  <Avatar size="small" src={c.avatar ?? undefined} initials={initials(c.name)} />
                  <span className="new-convo__meta">
                    <span className="new-convo__name">{c.name}</span>
                    {c.username && <span className="new-convo__handle">@{c.username}</span>}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Modal>
  );
}
