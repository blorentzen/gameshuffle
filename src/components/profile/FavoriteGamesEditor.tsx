"use client";

/**
 * Favorite games on the profile editor: search the game catalog (games
 * GameShuffle has tools for come first), or add one that isn't there ("Add
 * another game"), then order the shelf by dragging (or the grip's arrow keys)
 * so the top picks lead on the public profile. Covers are the catalog's box
 * art; a custom game shows a lettered tile until the catalog gains it.
 */

import { Badge } from "@empac/cascadeds";
import { IconX } from "@tabler/icons-react";
import { TagCombobox } from "@/components/ui/TagCombobox";
import { SortableList } from "@/components/ui/SortableList";
import { IconAction } from "@/components/actions/IconAction";
import { GameCover } from "@/components/games/GameCover";
import { GAME_CATALOG, catalogGame } from "@/data/game-catalog";
import { MAX_FAVORITE_GAMES, isCustomGame } from "@/data/favorite-games";

const ORDER = { live: 0, candidate: 1, listed: 2 } as const;
const OPTIONS = [...GAME_CATALOG]
  .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name))
  .map((g) => ({ value: g.name, label: g.name }));

export function FavoriteGamesEditor({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const full = value.length >= MAX_FAVORITE_GAMES;
  const add = (typed: string) => {
    // A typed name that matches a catalog game (or one of its other names) is stored as that game.
    const name = catalogGame(typed)?.name ?? typed.slice(0, 60);
    if (!full && !value.some((v) => v.toLowerCase() === name.toLowerCase())) onChange([...value, name]);
  };

  return (
    <div className="fav-games">
      <TagCombobox
        options={OPTIONS.filter((o) => !value.includes(o.value))}
        onAdd={add}
        allowCreate
        createLabel="Add another game:"
        placeholder={full ? `That's ${MAX_FAVORITE_GAMES}, remove one to add another` : "Search games to add"}
        disabled={full}
      />
      {value.length > 0 && (
        <SortableList
          layout="grid"
          className="fav-games__shelf"
          items={value}
          getId={(name) => name}
          onReorder={onChange}
          handleLabel={(name) => `Move ${name}`}
        >
          {(name, handle, i) => (
            <div className="fav-games__tile">
              <div className="fav-games__cover">
                <GameCover name={name} />
                <span className="fav-games__rank" aria-hidden>{i + 1}</span>
                <span className="fav-games__grip">{handle}</span>
                <span className="fav-games__remove">
                  <IconAction label={`Remove ${name}`} icon={IconX} onClick={() => onChange(value.filter((v) => v !== name))} />
                </span>
              </div>
              <span className="fav-games__name">{name}</span>
              {isCustomGame(name) && <Badge size="small" variant="outline">Other</Badge>}
            </div>
          )}
        </SortableList>
      )}
      <p className="fav-games__hint">
        Up to {MAX_FAVORITE_GAMES}, shown with their box art on your profile. Drag to put your top picks first. Missing one? Type it and choose &quot;Add another game&quot;: we&apos;ll add its art when it joins the catalog.
      </p>
    </div>
  );
}
