"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@empac/cascadeds";
import { CardActions } from "./CardActions";
import { KartSlot, SlotCaptionContext } from "./KartSlot";
import { SaveKartBuild } from "./SaveKartBuild";
import type { Player, GameData } from "@/data/types";

/**
 * Every randomizer's player card (grow in place, approved 2026-10-20). Before
 * the first roll it's a short row: the game's random tile, the name field and
 * the card's buttons. On the first roll the tile stays in the left column and
 * grows into the picture while the details unfold beside the name field, so
 * nothing jumps. Re-rolls only spin the picture. The motion is CSS
 * (`.player-card--grow` in randomizer.css): transitions on the class change,
 * so a card that mounts already rolled doesn't animate, and reduced motion (or
 * the Rolling animation switch off) changes it in one step.
 *
 * `tile` is the main KartSlot. Its rolled name shows as the card's heading
 * beside the picture (SlotCaptionContext), still rolling with the reel.
 * `children` are the game's own details under that heading; while the reel
 * spins they wait (all but `.player-card__parts`, which spin too), so a line
 * like "Costume 2 · Fire Emblem" can't give the pick away.
 */
export function SeatCard({ rolled, animate, name, actions, tile, children, className }: {
  /** The seat has a pick. */
  rolled: boolean;
  /** The page's Rolling animation switch; false changes the card in one step. */
  animate?: boolean;
  /** The name field (or a CPU label). */
  name: ReactNode;
  /** CardActions. */
  actions: ReactNode;
  /** The main KartSlot, drawn as the picture. */
  tile: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const [pickEl, setPickEl] = useState<HTMLParagraphElement | null>(null);
  const [spinning, setSpinning] = useState(false);
  const host = useMemo(() => ({ el: pickEl, onSpin: setSpinning }), [pickEl]);
  return (
    <div className={`player-card player-card--grow ${rolled ? "player-card--rolled" : "player-card--seat"}${spinning ? " player-card--spinning" : ""}${animate === false ? " player-card--still" : ""}${className ? ` ${className}` : ""}`}>
      <ul className="player-card__pic">
        <SlotCaptionContext.Provider value={host}>{tile}</SlotCaptionContext.Provider>
      </ul>
      <div className="player-card__main">
        <div className="player-card__header">
          <div className="player-card__name">{name}</div>
          {actions}
        </div>
        <div className="player-card__more">
          <div className="player-card__inner">
            <p className="player-card__pick" ref={setPickEl} />
            <div className="player-card__details">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PlayerCardProps {
  player: Player;
  gameSlug?: string;
  hasVehicle?: boolean;
  hasWheels?: boolean;
  hasGlider?: boolean;
  /** Full game data — supplies the part pools for the roulette reel animation. */
  gameData?: GameData;
  /** Play the rolling reel on a new pick. Falls back to OS reduced-motion when unset. */
  animate?: boolean;
  onRefresh: () => void;
  onRemove: () => void;
  onNameChange: (name: string) => void;
  canRemove: boolean;
  /** 0-based seat, for button labels when no name is typed ("Player 2"). */
  seat?: number;
}

/** The Mario Kart card: the character is the picture; vehicle, wheels and glider line up beside it. */
export function PlayerCard({
  player,
  gameSlug = "mario-kart-8",
  hasVehicle = true,
  hasWheels = true,
  hasGlider = true,
  gameData,
  animate,
  onRefresh,
  onRemove,
  onNameChange,
  canRemove,
  seat,
}: PlayerCardProps) {
  const who = player.name.trim() || (seat !== undefined ? `Player ${seat + 1}` : "this player");
  const parts = [hasVehicle, hasWheels, hasGlider].filter(Boolean).length;
  return (
    <SeatCard
      rolled={Boolean(player.combo)}
      animate={animate}
      name={
        <Input
          type="text"
          floatingLabel="Player name"
          placeholder="Type a name"
          value={player.name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      }
      actions={
        <CardActions
          refreshLabel={`${hasVehicle ? "New kart combo" : "New character"} for ${who}`} onRefresh={onRefresh}
          removeLabel={`Remove ${who}`} onRemove={canRemove ? onRemove : undefined} />
      }
      tile={
        <KartSlot
          label="Character"
          name={player.combo?.character.name ?? null}
          imageSrc={player.combo?.character.img ?? null}
          pool={gameData?.characters}
          animate={animate}
        />
      }
    >
      {parts > 0 && (
        // One part (Mario Kart World's vehicle) sits in a row beside its name.
        <ul className={`player-card__parts${parts === 1 ? " player-card__parts--row" : ""}`}>
          {hasVehicle && (
            <KartSlot
              label="Vehicle"
              name={player.combo?.vehicle.name ?? null}
              imageSrc={player.combo?.vehicle.img ?? null}
              pool={gameData?.vehicles}
              animate={animate}
            />
          )}
          {hasWheels && (
            <KartSlot
              label="Wheels"
              name={player.combo?.wheels.name ?? null}
              imageSrc={player.combo?.wheels.img ?? null}
              pool={gameData?.wheels}
              animate={animate}
            />
          )}
          {hasGlider && (
            <KartSlot
              label="Glider"
              name={player.combo?.glider.name ?? null}
              imageSrc={player.combo?.glider.img ?? null}
              pool={gameData?.gliders}
              animate={animate}
            />
          )}
        </ul>
      )}
      {player.combo && (
        <div className="player-card__save">
          <SaveKartBuild combo={player.combo} gameSlug={gameSlug} />
        </div>
      )}
    </SeatCard>
  );
}
