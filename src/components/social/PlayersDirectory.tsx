"use client";

/**
 * Find Players directory (community Phase 2 + relevance). Filter public accounts
 * by search, favorite game, region, online-now, streamer status, and board-game
 * preferences. When signed in, results are RANKED by relevance (shared games,
 * mutual connections, board-game fit) and each card shows the "why". Each result
 * is a profile-card door (UserIdentity) with an inline follow.
 * Fetches /api/social/discover.
 */

import { useEffect, useState } from "react";
import { Input, Select, Chip, Badge, FollowButton } from "@empac/cascadeds";
import { UserAvatar } from "@/components/UserAvatar";
import { UserIdentity } from "@/components/profile/UserIdentity";
import { LivePresenceDot } from "@/components/social/LivePresenceDot";
import { FAVORITE_GAME_CATALOG } from "@/data/favorite-games";
import { BOARD_GAME_GENRE_SUGGESTIONS, BOARD_GAME_LEVELS, BOARD_GAME_LENGTHS } from "@/data/board-games";
import { REGIONS } from "@/lib/social/region";
import type { PlayerSummary } from "@/lib/social/discovery";

const GAME_OPTIONS = [
  { value: "", label: "All games" },
  ...FAVORITE_GAME_CATALOG.map((g) => ({ value: g.name, label: g.name })),
];

const REGION_OPTIONS = [
  { value: "", label: "All regions" },
  ...REGIONS.map((r) => ({ value: r, label: r })),
];

const BG_GENRE_OPTIONS = [
  { value: "", label: "Any type" },
  ...BOARD_GAME_GENRE_SUGGESTIONS.map((g) => ({ value: g, label: g })),
];
const BG_LEVEL_OPTIONS = [
  { value: "", label: "Any level" },
  ...BOARD_GAME_LEVELS.map((l) => ({ value: l.value, label: l.label })),
];
const BG_LENGTH_OPTIONS = [
  { value: "", label: "Any length" },
  ...BOARD_GAME_LENGTHS.map((l) => ({ value: l.value, label: l.label })),
];

function avatarUser(p: PlayerSummary) {
  return {
    id: p.id,
    avatar_source: p.avatarSource,
    avatar_seed: p.avatarSeed,
    avatar_options: p.avatarOptions,
    discord_avatar: p.discordAvatar,
    twitch_avatar: p.twitchAvatar,
  };
}

/** "3 mutual · Also likes Mario Kart, Smash" — the relevance rationale. */
function relevanceLine(p: PlayerSummary): string | null {
  const parts: string[] = [];
  if (p.mutuals > 0) parts.push(`${p.mutuals} mutual${p.mutuals === 1 ? "" : "s"}`);
  if (p.sharedGames.length) parts.push(`Also likes ${p.sharedGames.slice(0, 2).join(", ")}`);
  else if (p.sharedBoardGenres.length) parts.push(`Both play ${p.sharedBoardGenres.slice(0, 2).join(", ")}`);
  return parts.length ? parts.join(" · ") : null;
}

function PlayerResultCard({ player }: { player: PlayerSummary }) {
  const [following, setFollowing] = useState(player.isFollowing);
  const [busy, setBusy] = useState(false);
  const shared = new Set(player.sharedGames);
  const why = relevanceLine(player);

  async function toggle() {
    setBusy(true);
    const res = following
      ? await fetch(`/api/account/follow?userId=${encodeURIComponent(player.id)}`, { method: "DELETE" })
      : await fetch("/api/account/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: player.id }),
        });
    setBusy(false);
    if (res.ok) setFollowing((f) => !f);
  }

  return (
    <div className="player-card">
      <UserIdentity userId={player.id} name={player.displayName}>
        <span className="player-card__id">
          <UserAvatar user={avatarUser(player)} size={48} className="player-card__avatar" />
          <span className="player-card__namecol">
            <span className="player-card__name">
              {player.displayName}
              <LivePresenceDot userId={player.id} fallback={player.isOnline} className="player-card__online" />
            </span>
            {player.username && <span className="player-card__handle">@{player.username}</span>}
            {player.region && <span className="player-card__region">{player.region}</span>}
          </span>
        </span>
      </UserIdentity>

      {why && <p className="player-card__why">{why}</p>}

      <span className="player-card__badges">
        {player.isLive ? (
          <Badge variant="error" size="small">Live</Badge>
        ) : player.isStreamer ? (
          <Badge variant="default" size="small">Streamer</Badge>
        ) : null}
        {player.playsBoardGames && (
          <Badge variant="info" size="small">Board games</Badge>
        )}
      </span>

      {player.favoriteGames.length > 0 && (
        <div className="player-card__games">
          {/* Shared games float first + highlighted, so the overlap reads at a glance. */}
          {[...player.favoriteGames]
            .sort((a, b) => Number(shared.has(b)) - Number(shared.has(a)))
            .slice(0, 3)
            .map((g) => (
              <Chip key={g} label={g} variant={shared.has(g) ? "primary" : "default"} size="small" />
            ))}
        </div>
      )}

      <FollowButton
        isFollowing={following}
        isLoading={busy}
        onFollow={() => void toggle()}
        onUnfollow={() => void toggle()}
        size="small"
      />
    </div>
  );
}

export function PlayersDirectory() {
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("");
  const [region, setRegion] = useState("");
  const [online, setOnline] = useState(false);
  const [streamers, setStreamers] = useState(false);
  const [boardGames, setBoardGames] = useState(false);
  const [bgGenre, setBgGenre] = useState("");
  const [bgLevel, setBgLevel] = useState("");
  const [bgLength, setBgLength] = useState("");
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (query.trim()) p.set("q", query.trim());
      if (game) p.set("game", game);
      if (region) p.set("region", region);
      if (online) p.set("online", "1");
      if (streamers) p.set("streamers", "1");
      if (boardGames) {
        p.set("boardgames", "1");
        if (bgGenre) p.set("bggenre", bgGenre);
        if (bgLevel) p.set("bglevel", bgLevel);
        if (bgLength) p.set("bglength", bgLength);
      }
      setLoading(true);
      fetch(`/api/social/discover?${p.toString()}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { players: [] }))
        .then((d) => setPlayers((d.players as PlayerSummary[]) ?? []))
        .catch(() => setPlayers([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, game, region, online, streamers, boardGames, bgGenre, bgLevel, bgLength]);

  return (
    <div className="players-dir">
      <div className="players-dir__filters">
        <Input
          floatingLabel="Search players"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
        />
        <Select
          floatingLabel="Game"
          options={GAME_OPTIONS}
          value={game}
          onChange={(v) => setGame(v as string)}
          fullWidth
        />
        <Select
          floatingLabel="Region"
          options={REGION_OPTIONS}
          value={region}
          onChange={(v) => setRegion(v as string)}
          fullWidth
        />
        <div className="players-dir__toggles">
          <Chip label="Online now" variant={online ? "primary" : "default"} onClick={() => setOnline((o) => !o)} />
          <Chip
            label="Streamers"
            variant={streamers ? "primary" : "default"}
            onClick={() => setStreamers((s) => !s)}
          />
          <Chip
            label="Board games"
            variant={boardGames ? "primary" : "default"}
            onClick={() => setBoardGames((b) => !b)}
          />
        </div>
      </div>

      {boardGames && (
        <div className="players-dir__filters players-dir__filters--board">
          <Select
            floatingLabel="Board game type"
            options={BG_GENRE_OPTIONS}
            value={bgGenre}
            onChange={(v) => setBgGenre(v as string)}
            fullWidth
          />
          <Select
            floatingLabel="Skill level"
            options={BG_LEVEL_OPTIONS}
            value={bgLevel}
            onChange={(v) => setBgLevel(v as string)}
            fullWidth
          />
          <Select
            floatingLabel="Session length"
            options={BG_LENGTH_OPTIONS}
            value={bgLength}
            onChange={(v) => setBgLength(v as string)}
            fullWidth
          />
        </div>
      )}

      {loading ? (
        <p className="players-dir__msg">Finding players…</p>
      ) : players.length === 0 ? (
        <p className="players-dir__msg">No players match. Try widening your filters.</p>
      ) : (
        <div className="players-dir__grid">
          {players.map((p) => (
            <PlayerResultCard key={p.id} player={p} />
          ))}
        </div>
      )}
    </div>
  );
}
