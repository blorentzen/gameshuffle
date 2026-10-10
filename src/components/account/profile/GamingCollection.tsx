"use client";

/**
 * Account ▸ Profile ▸ Games ▸ My gaming collection (2026-10-10): one shelf for
 * the games you own, video and board, replacing Favorite games, What you own
 * and the board game list.
 *
 * Where it lives (no new tables):
 *   - a video game you own = a `user_game_profiles` row (user, game slug); a
 *     game the catalog doesn't know keeps its name in `data.prefs.name`. The
 *     randomizers already read these rows for what you own.
 *   - starred = `users.favorite_games` (through ProfileStore), which is what
 *     the public profile shows, in the order set under "On your profile".
 *   - board games = the existing list behind /api/account/board-games.
 * Favorites from before become owned games on first load.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Chip, IconButton, Input, Modal } from "@empac/cascadeds";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { TagCombobox } from "@/components/ui/TagCombobox";
import { GameCover } from "@/components/games/GameCover";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { MyGameEditor } from "@/components/collection/CollectionEditor";
import { COLLECTION_GAMES, defaultCollection } from "@/lib/collection/catalog";
import { GAME_CATALOG, catalogGame, findGame } from "@/data/game-catalog";
import { MAX_FAVORITE_GAMES } from "@/data/favorite-games";

interface VideoGame { kind: "video"; slug: string; name: string }
interface BoardGame { kind: "board"; name: string }
type Owned = VideoGame | BoardGame;

const ORDER = { live: 0, candidate: 1, listed: 2 } as const;
const OPTIONS = [...GAME_CATALOG]
  .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name))
  .map((g) => ({ value: g.name, label: g.name }));

const slugify = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "game";

/** A typed or picked name, as the catalog knows it (slug + proper name). */
function identify(typed: string): { slug: string; name: string } {
  const entry = catalogGame(typed);
  if (entry) return { slug: entry.appSlug ?? entry.slug, name: entry.name };
  const name = typed.trim().slice(0, 60);
  return { slug: slugify(name), name };
}

type Filter = "all" | "video" | "board" | "starred";

export function GamingCollection({ favorites, onFavoritesChange }: { favorites: string[]; onFavoritesChange: (next: string[]) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [video, setVideo] = useState<VideoGame[] | null>(null);
  const [board, setBoard] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [addKind, setAddKind] = useState<"video" | "board">("video");
  const [boardInput, setBoardInput] = useState("");
  const [open, setOpen] = useState<Owned | null>(null);
  // Favorites at first load: any not owned yet become owned (starred) games.
  const initialFavorites = useRef(favorites);

  const starred = useMemo(() => new Set(favorites.map((f) => f.toLowerCase())), [favorites]);
  const isStarred = (name: string) => starred.has(name.toLowerCase());

  // Load what you own.
  useEffect(() => {
    if (!user) return;
    let live = true;
    void (async () => {
      const [rowsRes, boardRes] = await Promise.all([
        createClient().from("user_game_profiles").select("game_slug, data").eq("user_id", user.id),
        fetch("/api/account/board-games").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!live) return;
      const rows = (rowsRes.data ?? []) as { game_slug: string; data: { prefs?: { name?: string } } | null }[];
      const owned: VideoGame[] = rows.map((r) => ({
        kind: "video" as const,
        slug: r.game_slug,
        name: findGame(r.game_slug)?.name ?? r.data?.prefs?.name ?? r.game_slug.replace(/-/g, " "),
      }));
      // Favorites from before this screen become owned games (once: after
      // this they have rows). ignoreDuplicates never touches saved settings.
      const have = new Set(owned.map((g) => g.slug));
      const missing = initialFavorites.current.map(identify).filter((g) => !have.has(g.slug) && (have.add(g.slug), true));
      if (missing.length && !rowsRes.error) {
        await createClient().from("user_game_profiles").upsert(
          missing.map((g) => ({ user_id: user.id, game_slug: g.slug, data: COLLECTION_GAMES.includes(g.slug) ? defaultCollection(g.slug) : { enabled: true, off: {}, prefs: { name: g.name } }, updated_at: new Date().toISOString() })),
          { onConflict: "user_id,game_slug", ignoreDuplicates: true },
        );
        owned.push(...missing.map((g) => ({ kind: "video" as const, ...g })));
      }
      if (!live) return;
      setVideo(owned);
      if (Array.isArray(boardRes?.games)) setBoard(boardRes.games as string[]);
    })();
    return () => { live = false; };
  }, [user]);

  const addVideo = useCallback(async (typed: string, opts: { quiet?: boolean } = {}) => {
    if (!user) return;
    const { slug, name } = identify(typed);
    if (video?.some((g) => g.slug === slug)) { if (!opts.quiet) toast.info(`${name} is already in your collection`); return; }
    const data = COLLECTION_GAMES.includes(slug)
      ? defaultCollection(slug)
      : { enabled: true, off: {}, prefs: { name } };
    // ignoreDuplicates: never overwrite a game's saved settings (tracks, DLC).
    const { error } = await createClient().from("user_game_profiles")
      .upsert({ user_id: user.id, game_slug: slug, data, updated_at: new Date().toISOString() }, { onConflict: "user_id,game_slug", ignoreDuplicates: true });
    if (error) { if (!opts.quiet) toast.error("Couldn't add that game. Try again."); return; }
    setVideo((v) => (v?.some((g) => g.slug === slug) ? v : [...(v ?? []), { kind: "video", slug, name }]));
    if (!opts.quiet) toast.success(`${name} added`);
  }, [user, video, toast]);


  const saveBoard = async (next: string[]) => {
    setBoard(next);
    const res = await fetch("/api/account/board-games", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ games: next }) }).catch(() => null);
    if (!res?.ok) toast.error("Couldn't save your board games. Try again.");
  };
  const addBoard = () => {
    const names = boardInput.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const seen = new Set(board.map((g) => g.toLowerCase()));
    const next = [...board];
    for (const n of names) if (!seen.has(n.toLowerCase())) { next.push(n.slice(0, 80)); seen.add(n.toLowerCase()); }
    void saveBoard(next);
    setBoardInput("");
  };

  const toggleStar = (name: string) => {
    if (isStarred(name)) { onFavoritesChange(favorites.filter((f) => f.toLowerCase() !== name.toLowerCase())); return; }
    if (favorites.length >= MAX_FAVORITE_GAMES) { toast.info(`Your profile shows up to ${MAX_FAVORITE_GAMES}. Unstar one first.`); return; }
    onFavoritesChange([...favorites, name]);
  };

  const remove = async (g: Owned) => {
    const ok = await confirm({
      title: `Remove ${g.name}?`,
      body: g.kind === "video" && COLLECTION_GAMES.includes(g.slug) ? "Its track, character and kart settings are cleared too." : undefined,
      confirmLabel: "Remove game",
    });
    if (!ok || !user) return;
    if (g.kind === "board") {
      void saveBoard(board.filter((b) => b !== g.name));
    } else {
      const { error } = await createClient().from("user_game_profiles").delete().eq("user_id", user.id).eq("game_slug", g.slug);
      if (error) { toast.error("Couldn't remove that game. Try again."); return; }
      setVideo((v) => (v ?? []).filter((x) => x.slug !== g.slug));
      if (isStarred(g.name)) onFavoritesChange(favorites.filter((f) => f.toLowerCase() !== g.name.toLowerCase()));
    }
    setOpen(null);
    toast.success(`${g.name} removed`);
  };

  if (video === null) return <LoadingLines label="Loading your collection" />;

  const all: Owned[] = [...video, ...board.map((name) => ({ kind: "board" as const, name }))];
  const shown = all.filter((g) => filter === "all" || (filter === "starred" ? g.kind === "video" && isStarred(g.name) : g.kind === filter));

  return (
    <div className="gcol">
      <div className="gcol__add">
        <div className="gcol__kind" role="group" aria-label="Kind of game to add">
          <Button size="small" variant={addKind === "video" ? "primary" : "secondary"} onClick={() => setAddKind("video")}>Video game</Button>
          <Button size="small" variant={addKind === "board" ? "primary" : "secondary"} onClick={() => setAddKind("board")}>Board game</Button>
        </div>
        {addKind === "video" ? (
          <div className="gcol__search">
            <TagCombobox
              label="Add a video game"
              options={OPTIONS.filter((o) => !video.some((g) => g.name === o.value))}
              onAdd={(v) => void addVideo(v)}
              allowCreate
              createLabel="Add your own:"
              placeholder="Search games, or type any name"
            />
          </div>
        ) : (
          <div className="gcol__search gcol__search--board">
            <Input
              fullWidth
              aria-label="Add a board game"
              value={boardInput}
              onChange={(e) => setBoardInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBoard(); } }}
              placeholder="A board game, or a comma-separated list"
            />
            <Button variant="secondary" onClick={addBoard} disabled={!boardInput.trim()}>Add</Button>
          </div>
        )}
      </div>

      <div className="gcol__filters" role="group" aria-label="Show">
        {([["all", `All (${all.length})`], ["video", "Video games"], ["board", "Board games"], ["starred", "★ On your profile"]] as [Filter, string][]).map(([id, label]) => (
          <Chip key={id} size="small" clickable selected={filter === id} variant={filter === id ? "primary" : "default"} label={label} onClick={() => setFilter(id)} />
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="admin-field__help">{all.length === 0 ? "Nothing here yet. Add the games you own: randomizers only roll what you have, and starred games show on your profile." : "No games in this view."}</p>
      ) : (
        <ul className="gcol__shelf">
          {shown.map((g) => {
            const key = g.kind === "video" ? `v:${g.slug}` : `b:${g.name}`;
            const star = g.kind === "video" && isStarred(g.name);
            return (
              <li key={key} className="gcol__item">
                <Card variant="flat" padding="none" interactive className="gcol__open" onClick={() => setOpen(g)} aria-label={`${g.name}: details`}>
                  <span className="gcol__cover">
                    <GameCover slug={g.kind === "video" ? g.slug : undefined} name={g.name} />
                    {g.kind === "board" && <span className="gcol__kindtag">Board</span>}
                  </span>
                  <span className="gcol__name">{g.name}</span>
                </Card>
                {g.kind === "video" && (
                  <span className={`gcol__star${star ? " is-on" : ""}`}>
                    <IconButton size="small" variant="tertiary" onClick={() => toggleStar(g.name)} aria-pressed={star} aria-label={star ? `Take ${g.name} off your profile` : `Show ${g.name} on your profile`}>
                      {star ? <IconStarFilled size={14} aria-hidden /> : <IconStar size={14} aria-hidden />}
                    </IconButton>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        isOpen={!!open}
        onClose={() => setOpen(null)}
        title={open?.name ?? ""}
        size={open?.kind === "video" && COLLECTION_GAMES.includes(open.slug) ? "large" : "small"}
        secondaryAction={{ label: "Done", onClick: () => setOpen(null) }}
      >
        {open && (
          <div className="gcol__details">
            {open.kind === "video" ? (
              <>
                <div className="gcol__details-head">
                  <span className="gcol__details-cover"><GameCover slug={open.slug} name={open.name} /></span>
                  <div className="gcol__details-text">
                    {!catalogGame(open.name) && <Badge size="small" variant="outline">Your own</Badge>}
                    <Button size="small" variant={isStarred(open.name) ? "primary" : "secondary"} onClick={() => toggleStar(open.name)}>
                      {isStarred(open.name) ? "★ On your profile" : "☆ Show on my profile"}
                    </Button>
                  </div>
                </div>
                {COLLECTION_GAMES.includes(open.slug) ? (
                  <MyGameEditor slug={open.slug} />
                ) : (
                  <p className="admin-field__help">No extra settings for this game yet.</p>
                )}
              </>
            ) : (
              <p className="admin-field__help">Your game picker can draw from your board games, and they&apos;re one tap to add when you host a game night.</p>
            )}
            <div><Button size="small" variant="ghost" onClick={() => void remove(open)}>Remove from collection</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
