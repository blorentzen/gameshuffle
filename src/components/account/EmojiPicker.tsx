"use client";

/**
 * Emoji picker for role-menu buttons. Offers both ways: a grid of common
 * unicode emojis + the server's custom emojis (pulled from Discord), plus a
 * type-in fallback for any other emoji. Custom emojis are stored in Discord's
 * `<:name:id>` form (parsed back into a button emoji server-side).
 */

import { useState } from "react";

export interface GuildEmoji {
  id: string;
  name: string;
  animated: boolean;
}

const COMMON = [
  "🎮", "🎯", "🏁", "🔴", "🟢", "🔵", "🟡", "🟣", "⭐", "❤️", "🔥", "✨",
  "🎉", "👑", "🛡️", "⚔️", "🏆", "🥇", "🎲", "🕹️", "📣", "🔔", "💬", "✅",
];

const CUSTOM_RE = /^<a?:(\w+):(\d+)>$/;

function customEmojiUrl(value: string): string | null {
  const m = value.match(CUSTOM_RE);
  if (!m) return null;
  const animated = value.startsWith("<a:");
  return `https://cdn.discordapp.com/emojis/${m[2]}.${animated ? "gif" : "png"}?size=32`;
}

export function EmojiPreview({ value }: { value: string }) {
  if (!value) return <span aria-hidden>😀</span>;
  const url = customEmojiUrl(value);
  // eslint-disable-next-line @next/next/no-img-element -- external Discord CDN emoji, tiny
  if (url) return <img src={url} alt="" width={22} height={22} style={{ display: "block" }} />;
  return <span>{value}</span>;
}

export function EmojiPicker({
  value,
  onChange,
  guildEmojis,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  guildEmojis: GuildEmoji[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="emoji-picker">
      <button
        type="button"
        className="emoji-picker__btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={label ? `Pick emoji for ${label}` : "Pick emoji"}
      >
        <EmojiPreview value={value} />
      </button>

      {open && (
        <div className="emoji-picker__panel">
          <div className="emoji-picker__section">Common</div>
          <div className="emoji-picker__grid">
            {COMMON.map((e) => (
              <button key={e} type="button" className="emoji-picker__item" onClick={() => pick(e)}>
                {e}
              </button>
            ))}
          </div>

          {guildEmojis.length > 0 && (
            <>
              <div className="emoji-picker__section">Server</div>
              <div className="emoji-picker__grid">
                {guildEmojis.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="emoji-picker__item"
                    title={`:${e.name}:`}
                    onClick={() => pick(`<${e.animated ? "a" : ""}:${e.name}:${e.id}>`)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- external Discord CDN emoji, tiny */}
                    <img
                      src={`https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "png"}?size=32`}
                      alt={e.name}
                      width={22}
                      height={22}
                    />
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="emoji-picker__type">
            <input
              className="save-setup-input"
              placeholder="Type or paste an emoji"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <button
              type="button"
              className="emoji-picker__set"
              onClick={() => {
                if (typed.trim()) pick(typed.trim());
                setTyped("");
              }}
            >
              Set
            </button>
          </div>

          {value && (
            <button type="button" className="emoji-picker__clear" onClick={() => pick("")}>
              Clear emoji
            </button>
          )}
        </div>
      )}
    </div>
  );
}
