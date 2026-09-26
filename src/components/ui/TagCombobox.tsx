"use client";

import { useState } from "react";
import { Combobox } from "@empac/cascadeds";

/**
 * A CDS Combobox for the "search, pick, and it joins a list" pattern — favorite
 * games, board game genres, post topics, night games.
 *
 * Why this wrapper exists: CDS `Combobox` keeps the typed text in its own state
 * and only re-syncs it when the `value` PROP changes. Picking an option sets
 * that internal text to the option you picked, and the parent clearing back to
 * `""` is a no-op, because it was already `""` before the pick. The result is
 * the picked label sitting in the box, which you have to delete by hand before
 * you can search for the next one. Remounting on each commit (the `key` bump)
 * resets that internal state, which is the least invasive fix available from
 * outside the component.
 *
 * CDS should grow a `clearOnSelect` prop so this wrapper can go away — worth
 * raising against CascadeDS rather than living with the remount forever.
 *
 * The second thing this hides: CDS fires `onChange` ONLY on commit (picking an
 * option, or confirming a created value), never while typing. Call sites that
 * tried to mirror the query into their own state were holding a value that was
 * always empty, which is why "type a genre, press the Add button" did nothing.
 * Here, every change is a commit, so there is nothing to mirror.
 */
export function TagCombobox({
  options,
  onAdd,
  placeholder,
  size = "medium",
  allowCreate = false,
  createLabel,
  disabled = false,
}: {
  options: { value: string; label: string }[];
  /** Called once per committed selection, already trimmed and non-empty. */
  onAdd: (value: string) => void;
  placeholder?: string;
  size?: "small" | "medium" | "large";
  /** Let people add something that isn't in the list (genres yes, games no). */
  allowCreate?: boolean;
  createLabel?: string;
  disabled?: boolean;
}) {
  const [nonce, setNonce] = useState(0);

  return (
    <Combobox
      key={nonce}
      value=""
      onChange={(v) => {
        const picked = v.trim();
        if (!picked) return;
        onAdd(picked);
        setNonce((n) => n + 1); // drop CDS's leftover text
      }}
      options={options}
      placeholder={placeholder}
      size={size}
      allowCreate={allowCreate}
      createLabel={createLabel}
      disabled={disabled}
      autoFocus={nonce > 0}
    />
  );
}
