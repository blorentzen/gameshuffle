"use client";

/**
 * A saved setup's visuals (kart combos, tracks, items, party/Smash/Splatoon/
 * Kirby/Stadium summaries). Shared by the public profile's "Shared configs"
 * window and My Stuff ▸ Saved configs ▸ View.
 */

import { getImagePath } from "@/lib/images";
import { describePartySetup } from "@/data/party";
import { describeSmashSetup } from "@/data/smash";
import { describeSplatoonSetup } from "@/data/splatoon";
import { describeKirbySetup } from "@/data/kirby";
import { describeStadiumSetup } from "@/data/pokemon/stadium-setup";

type ImgItem = { img?: string; name?: string };

const SLOTS = ["character", "vehicle", "wheels", "glider"] as const;

function asImg(v: unknown): ImgItem | null {
  return v && typeof v === "object" ? (v as ImgItem) : null;
}
function asImgArray(v: unknown): ImgItem[] {
  return Array.isArray(v) ? (v as ImgItem[]) : [];
}

function Tile({ item }: { item: ImgItem | null }) {
  if (!item?.img) return null;
  return (
    <figure className="cfg-tile">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={getImagePath(item.img)} alt={item.name ?? ""} />
      {item.name ? <figcaption>{item.name}</figcaption> : null}
    </figure>
  );
}

export function ConfigVisual({ cfg }: { cfg: Record<string, unknown> }) {
  const type = cfg.type as string | undefined;

  if (type === "kart-build") {
    return (
      <div className="cfg-grid">
        {SLOTS.map((s) => (
          <Tile key={s} item={asImg(cfg[s])} />
        ))}
      </div>
    );
  }
  if (type === "item-set") {
    return (
      <div className="cfg-grid">
        {asImgArray(cfg.items).map((it, i) => (
          <Tile key={i} item={it} />
        ))}
      </div>
    );
  }
  if (type === "track-list") {
    return (
      <div className="cfg-grid">
        {asImgArray(cfg.tracks).map((t, i) => (
          <Tile key={i} item={t} />
        ))}
      </div>
    );
  }
  if (type === "game-night-setup") {
    const players = Array.isArray(cfg.players) ? cfg.players.length : 0;
    const tracks = asImgArray(cfg.tracks);
    return (
      <div>
        <p className="cfg-summary">
          {players} player{players === 1 ? "" : "s"} · {tracks.length} track
          {tracks.length === 1 ? "" : "s"}
        </p>
        {tracks.length > 0 && (
          <div className="cfg-grid">
            {tracks.slice(0, 12).map((t, i) => (
              <Tile key={i} item={t} />
            ))}
          </div>
        )}
      </div>
    );
  }
  if (type === "party-setup") {
    return (
      <ul className="cfg-list">
        {describePartySetup(cfg).map((r) => <li key={r.label}>{r.label}: {r.value}</li>)}
      </ul>
    );
  }
  if (type === "stadium-setup") {
    return (
      <ul className="cfg-list">
        {describeStadiumSetup(cfg).map((r) => <li key={r.label}>{r.label}: {r.value}</li>)}
      </ul>
    );
  }
  if (type === "kirby-setup") {
    return (
      <ul className="cfg-list">
        {describeKirbySetup(cfg).map((r) => <li key={r.label}>{r.label}: {r.value}</li>)}
      </ul>
    );
  }
  if (type === "splatoon-setup") {
    return (
      <ul className="cfg-list">
        {describeSplatoonSetup(cfg).map((r) => <li key={r.label}>{r.label}: {r.value}</li>)}
      </ul>
    );
  }
  if (type === "smash-setup") {
    return (
      <ul className="cfg-list">
        {describeSmashSetup(cfg).map((r) => <li key={r.label}>{r.label}: {r.value}</li>)}
      </ul>
    );
  }
  if (type === "player-preset") {
    const players = Array.isArray(cfg.players) ? cfg.players : [];
    return (
      <ul className="cfg-list">
        {players.map((p, i) => (
          <li key={i}>{typeof p === "string" ? p : asImg(p)?.name ?? "Player"}</li>
        ))}
      </ul>
    );
  }
  if (type === "ruleset") {
    return (
      <ul className="cfg-list">
        {cfg.mode ? <li>Mode: {String(cfg.mode)}</li> : null}
        {cfg.cc ? <li>CC: {String(cfg.cc)}</li> : null}
        {cfg.items ? <li>Items: {String(cfg.items)}</li> : null}
      </ul>
    );
  }
  return <p className="cfg-summary">No preview available for this config.</p>;
}

