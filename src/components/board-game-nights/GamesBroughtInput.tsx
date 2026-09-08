"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Icon, IconButton, Input, Modal, Select } from "@empac/cascadeds";
import { BOARD_GAME_LENGTHS, boardGameLengthLabel } from "@/data/board-games";
import type { NightGame, NightLength } from "@/lib/board-game-nights/types";

interface Suggestion {
  id: number;
  name: string;
  year: number | null;
  thumbnail_url: string | null;
  length_bucket: string | null;
  min_players: number | null;
  max_players: number | null;
  playing_time: number | null;
}

/** Which slot a pending image upload targets: the compose row or the modal. */
type ImageTarget = "compose" | "modal";

/** "2–4 players · 45 min" from BGG stats, skipping unknown parts. */
function gameDetails(s: Suggestion): string {
  const parts: string[] = [];
  if (s.min_players && s.max_players) {
    parts.push(
      s.min_players === s.max_players
        ? `${s.min_players} players`
        : `${s.min_players}–${s.max_players} players`,
    );
  } else if (s.max_players) {
    parts.push(`up to ${s.max_players} players`);
  }
  if (s.playing_time) parts.push(`${s.playing_time} min`);
  return parts.join(" · ");
}

const LENGTH_OPTIONS = BOARD_GAME_LENGTHS.map((l) => ({ value: l.value, label: l.label }));

/**
 * The games-being-brought builder. Compose a full entry — name (+ BGG
 * autocomplete when reachable), length, and artwork — THEN add it, so it drops
 * into the list complete. List rows display as clean entries (artwork, name,
 * length); the pencil opens a modal editor, the × removes.
 */
export function GamesBroughtInput({
  games,
  onChange,
}: {
  games: NightGame[];
  onChange: (games: NightGame[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [length, setLength] = useState<NightLength>("moderate");
  const [composeImage, setComposeImage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [uploading, setUploading] = useState<ImageTarget | null>(null);
  // Modal edit state — a draft copy of the game being edited + its index.
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<NightGame | null>(null);
  const debounceRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef<ImageTarget | null>(null);

  function pickImage(target: ImageTarget) {
    pendingRef.current = target;
    fileRef.current?.click();
  }

  async function onImageChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    const target = pendingRef.current;
    pendingRef.current = null;
    if (!file || target == null) return;
    setUploading(target);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/board-games/image", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (res.ok && data?.url) {
        if (target === "compose") setComposeImage(data.url);
        else setDraft((d) => (d ? { ...d, imageUrl: data.url ?? null } : d));
      }
    } finally {
      setUploading(null);
    }
  }

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/board-games/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          setSuggestions([]); // 502/429 → quietly fall back to free-text
          return;
        }
        const data = (await res.json()) as { games?: Suggestion[] };
        setSuggestions(Array.isArray(data.games) ? data.games : []);
      } catch {
        setSuggestions([]);
      }
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  const resetCompose = () => {
    setQuery("");
    setComposeImage(null);
    setSuggestions([]);
  };

  const addGame = (g: NightGame) => {
    const name = g.name.trim();
    if (!name || games.some((x) => x.name.toLowerCase() === name.toLowerCase())) return;
    onChange([...games, { ...g, name }]);
    resetCompose();
  };

  const canAdd =
    !!query.trim() &&
    !games.some((x) => x.name.toLowerCase() === query.trim().toLowerCase());

  const openEditor = (i: number) => {
    setEditIndex(i);
    setDraft({ ...games[i] });
  };
  const closeEditor = () => {
    setEditIndex(null);
    setDraft(null);
  };
  const saveEditor = () => {
    if (editIndex == null || !draft) return closeEditor();
    const name = draft.name.trim();
    if (!name) return; // keep the modal open if the name was cleared
    onChange(games.map((g, idx) => (idx === editIndex ? { ...draft, name } : g)));
    closeEditor();
  };

  return (
    <div className="bgn-games">
      {/* Compose — name on its own full-width line, then artwork + length + Add. */}
      <div className="bgn-games__compose">
        <div className="bgn-games__search">
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a game — or type any name…"
          />
          {suggestions.length > 0 && (
            <ul className="bgn-suggest" role="listbox">
              {suggestions.slice(0, 8).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() =>
                      addGame({
                        name: s.name,
                        bggId: s.id,
                        imageUrl: composeImage ?? s.thumbnail_url,
                        length: (s.length_bucket as NightLength) ?? length,
                      })
                    }
                  >
                    {s.thumbnail_url ? (
                      <img src={s.thumbnail_url} alt="" className="bgn-suggest__art" />
                    ) : (
                      <span className="bgn-suggest__art bgn-suggest__art--blank" />
                    )}
                    <span className="bgn-suggest__body">
                      <span className="bgn-suggest__name">
                        {s.name}
                        {s.year ? ` (${s.year})` : ""}
                      </span>
                      {gameDetails(s) && <span className="bgn-suggest__meta">{gameDetails(s)}</span>}
                    </span>
                    {s.length_bucket && (
                      <span className="bgn-suggest__len">{boardGameLengthLabel(s.length_bucket)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bgn-games__composerow">
          <button
            type="button"
            className="bgn-games__artbtn"
            onClick={() => pickImage("compose")}
            disabled={uploading !== null}
            title={composeImage ? "Change artwork" : "Add game artwork"}
          >
            {uploading === "compose" ? (
              <span className="bgn-games__art bgn-games__art--blank" aria-label="Uploading">…</span>
            ) : composeImage ? (
              <img src={composeImage} alt="" className="bgn-games__art" />
            ) : (
              <span className="bgn-games__art bgn-games__art--blank" aria-label="Add game artwork">
                <Icon name="photo" size="18" stroke={1.8} />
              </span>
            )}
          </button>
          <Select
            value={length}
            onChange={(v) => setLength((typeof v === "string" ? v : v[0] ?? "moderate") as NightLength)}
            options={LENGTH_OPTIONS}
          />
          <Button
            variant="secondary"
            onClick={() => addGame({ name: query, length, imageUrl: composeImage })}
            disabled={!canAdd || uploading !== null}
          >
            Add
          </Button>
        </div>
      </div>

      {games.length > 0 && (
        <ul className="bgn-games__list">
          {games.map((g, i) => (
            <li key={`${g.name}-${i}`} className="bgn-games__item">
              <span className="bgn-games__art-wrap" aria-hidden>
                {g.imageUrl ? (
                  <img src={g.imageUrl} alt="" className="bgn-games__art" />
                ) : (
                  <span className="bgn-games__art bgn-games__art--blank">
                    <Icon name="photo" size="18" stroke={1.8} />
                  </span>
                )}
              </span>
              <span className="bgn-games__name">{g.name}</span>
              <span className="bgn-games__len">{boardGameLengthLabel(g.length ?? "moderate")}</span>
              <IconButton
                variant="tertiary"
                size="small"
                aria-label={`Edit ${g.name}`}
                title="Edit"
                onClick={() => openEditor(i)}
              >
                <Icon name="pencil" size="18" />
              </IconButton>
              <IconButton
                variant="tertiary"
                size="small"
                aria-label={`Remove ${g.name}`}
                title="Remove"
                onClick={() => onChange(games.filter((_, idx) => idx !== i))}
              >
                <Icon name="x" size="18" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={onImageChosen}
      />

      <Modal
        isOpen={editIndex !== null && draft !== null}
        onClose={closeEditor}
        title="Edit game"
        size="small"
        primaryAction={{ label: "Save", onClick: saveEditor }}
        secondaryAction={{ label: "Cancel", onClick: closeEditor }}
      >
        {draft && (
          <div className="bgn-gameedit">
            <button
              type="button"
              className="bgn-gameedit__art"
              onClick={() => pickImage("modal")}
              disabled={uploading !== null}
              title={draft.imageUrl ? "Change artwork" : "Add game artwork"}
            >
              {uploading === "modal" ? (
                <span className="bgn-gameedit__art-ph" aria-label="Uploading">…</span>
              ) : draft.imageUrl ? (
                <img src={draft.imageUrl} alt="" />
              ) : (
                <span className="bgn-gameedit__art-ph">
                  <Icon name="photo" size="24" stroke={1.6} />
                  <span>Add artwork</span>
                </span>
              )}
            </button>
            <label className="bgn-gameedit__field">
              <span className="account-card__label">Game</span>
              <Input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                placeholder="Game name"
              />
            </label>
            <label className="bgn-gameedit__field">
              <span className="account-card__label">Length</span>
              <Select
                value={draft.length ?? "moderate"}
                onChange={(v) =>
                  setDraft((d) =>
                    d ? { ...d, length: (typeof v === "string" ? v : v[0] ?? "moderate") as NightLength } : d,
                  )
                }
                options={LENGTH_OPTIONS}
              />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
