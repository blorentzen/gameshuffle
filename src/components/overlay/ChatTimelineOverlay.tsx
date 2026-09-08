"use client";

/**
 * Chat Timeline Overlay — an OBS chat feed for the broadcaster overlay.
 * Polls /api/twitch/overlay/[token]/chat, appends new messages, and renders
 * them with role badges, the chatter's Twitch color, a GameShuffle-user
 * indicator, and a per-streamer theme + entrance animation. Self-gates: renders
 * nothing until the streamer enables it. Placement comes from OverlayClient.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type {
  ChatOverlayMessage,
  ChatOverlaySettings,
} from "@/lib/overlay/chat";

const POLL_MS = 2500;

const ROLE_LABEL: Record<string, string> = {
  broadcaster: "HOST",
  moderator: "MOD",
  vip: "VIP",
  subscriber: "SUB",
};

/** Static feed for the layout editor (no polling / no token). */
const SAMPLE_MESSAGES: ChatOverlayMessage[] = [
  { id: "s1", senderDisplay: "PixelPunk", senderColor: "#5cc8ff", roles: ["subscriber"], isGsUser: false, gsUsername: null, text: "let's gooo this race is stacked", createdAt: "" },
  { id: "s2", senderDisplay: "MintMod", senderColor: "#1f9d4d", roles: ["moderator"], isGsUser: true, gsUsername: "mintmod", text: "welcome in, grab a combo with !gs join", createdAt: "" },
  { id: "s3", senderDisplay: "TurboTina", senderColor: "#c150c9", roles: ["vip"], isGsUser: true, gsUsername: "turbotina", text: "rainbow road incoming 🌈", createdAt: "" },
  { id: "s4", senderDisplay: "couch_gamer", senderColor: null, roles: [], isGsUser: false, gsUsername: null, text: "first time here, this overlay is clean", createdAt: "" },
];
const SAMPLE_SETTINGS: ChatOverlaySettings = {
  theme: "default",
  animation: "slide",
  showRoles: ["broadcaster", "moderator", "vip", "subscriber", "viewer"],
  hideCommands: true,
  showGsBadge: true,
  maxMessages: 12,
};

export function ChatTimelineOverlay({
  token,
  style,
  sample = false,
}: {
  token?: string;
  style?: CSSProperties;
  /** Editor mode — render static sample messages, no polling. */
  sample?: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [settings, setSettings] = useState<ChatOverlaySettings | null>(null);
  const [messages, setMessages] = useState<ChatOverlayMessage[]>([]);
  const sinceRef = useRef<string | null>(null);
  const maxRef = useRef<number>(12);

  useEffect(() => {
    if (sample || !token) return;
    let cancelled = false;

    async function poll() {
      try {
        const since = sinceRef.current;
        const url = `/api/twitch/overlay/${token}/chat${since ? `?since=${encodeURIComponent(since)}` : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          enabled: boolean;
          settings: ChatOverlaySettings;
          messages: ChatOverlayMessage[];
        };
        if (cancelled) return;

        setEnabled(data.enabled);
        setSettings(data.settings);
        maxRef.current = data.settings?.maxMessages ?? 12;
        if (!data.enabled) {
          setMessages([]);
          sinceRef.current = null;
          return;
        }

        const incoming = data.messages ?? [];
        if (incoming.length === 0) return;

        setMessages((prev) => {
          // Merge by id (a since-less first load replaces; deltas append).
          const seen = new Set(prev.map((m) => m.id));
          const merged = since ? [...prev, ...incoming.filter((m) => !seen.has(m.id))] : incoming;
          return merged.slice(-maxRef.current);
        });
        const newest = incoming[incoming.length - 1]?.createdAt;
        if (newest) sinceRef.current = newest;
      } catch {
        // Transient — next tick retries.
      }
    }

    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token, sample]);

  const activeSettings = sample ? SAMPLE_SETTINGS : settings;
  const activeMessages = sample ? SAMPLE_MESSAGES : messages;
  if (!sample && (!enabled || !settings || messages.length === 0)) return null;
  if (!activeSettings || activeMessages.length === 0) return null;

  const anim = activeSettings.animation ?? "slide";

  return (
    <div className={`chat-ov chat-ov--${activeSettings.theme} chat-ov--anim-${anim}`} style={style}>
      {activeMessages.map((m) => (
        <div key={m.id} className="chat-ov__row">
          <span className="chat-ov__meta">
            {m.roles
              .filter((r) => ROLE_LABEL[r])
              .slice(0, 1)
              .map((r) => (
                <span key={r} className={`chat-ov__badge chat-ov__badge--${r}`}>
                  {ROLE_LABEL[r]}
                </span>
              ))}
            {activeSettings.showGsBadge && m.isGsUser && (
              <span className="chat-ov__badge chat-ov__badge--gs" title="GameShuffle player">GS</span>
            )}
            <span
              className="chat-ov__name"
              style={m.senderColor ? { color: m.senderColor } : undefined}
            >
              {m.senderDisplay}
            </span>
          </span>
          <span className="chat-ov__text">{m.text}</span>
        </div>
      ))}
    </div>
  );
}
