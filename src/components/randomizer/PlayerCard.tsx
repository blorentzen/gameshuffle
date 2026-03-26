"use client";

import { Button, Input } from "@empac/cascadeds";
import { KartSlot } from "./KartSlot";
import { SaveKartBuild } from "./SaveKartBuild";
import type { Player } from "@/data/types";

interface PlayerCardProps {
  player: Player;
  gameSlug?: string;
  onRefresh: () => void;
  onRemove: () => void;
  onNameChange: (name: string) => void;
  canRemove: boolean;
}

export function PlayerCard({
  player,
  gameSlug = "mario-kart-8",
  onRefresh,
  onRemove,
  onNameChange,
  canRemove,
}: PlayerCardProps) {
  return (
    <div className="player-card">
      <div className="player-card__header">
        <div className="player-card__name">
          <Input
            type="text"
            placeholder="Player Name"
            value={player.name}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
        <div className="player-card__actions">
          <Button variant="primary" size="small" onClick={onRefresh}>
            Refresh Kart
          </Button>
          {canRemove && (
            <Button variant="danger" size="small" onClick={onRemove}>
              Remove Player
            </Button>
          )}
        </div>
      </div>
      <ul className="player-card__slots">
        <KartSlot
          label="Character"
          name={player.combo?.character.name ?? null}
          imageSrc={player.combo?.character.img ?? null}
        />
        <KartSlot
          label="Vehicle"
          name={player.combo?.vehicle.name ?? null}
          imageSrc={player.combo?.vehicle.img ?? null}
        />
        <KartSlot
          label="Wheels"
          name={player.combo?.wheels.name ?? null}
          imageSrc={player.combo?.wheels.img ?? null}
        />
        <KartSlot
          label="Glider"
          name={player.combo?.glider.name ?? null}
          imageSrc={player.combo?.glider.img ?? null}
        />
      </ul>
      {player.combo && (
        <div className="player-card__save">
          <SaveKartBuild combo={player.combo} gameSlug={gameSlug} />
        </div>
      )}
    </div>
  );
}
