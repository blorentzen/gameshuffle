"use client";

/**
 * Public-profile "Shared configs" — a read-only list whose "View" opens a
 * modal previewing the config's visuals (kart combos, tracks, items, etc.).
 * Distinct from the owner-only SetupCard (which carries delete/copy actions).
 */

import { useState } from "react";
import { Button, Modal } from "@empac/cascadeds";
import { getImagePath } from "@/lib/images";

type ImgItem = { img?: string; name?: string };

export interface ProfileConfig {
  id: string;
  config_name: string;
  randomizer_slug: string;
  share_token: string | null;
  created_at: string;
  config_data: Record<string, unknown> | null;
}

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

function ConfigVisual({ cfg }: { cfg: Record<string, unknown> }) {
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

export function ProfileConfigs({ configs }: { configs: ProfileConfig[] }) {
  const [active, setActive] = useState<ProfileConfig | null>(null);

  return (
    <>
      <h2 className="profile-section-heading">Shared configs</h2>
      <div className="config-list" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {configs.map((c) => (
          <div key={c.id} className="config-list-item">
            <div>
              <span className="account-card__value">{c.config_name}</span>
              <br />
              <span className="account-card__label">
                {((c.config_data?.type as string | undefined) || c.randomizer_slug || "").replace(/-/g, " ")}
              </span>
            </div>
            <Button variant="secondary" size="small" onClick={() => setActive(c)}>
              View
            </Button>
          </div>
        ))}
      </div>

      {active && (
        <Modal
          isOpen
          onClose={() => setActive(null)}
          title={active.config_name}
          size="large"
          secondaryAction={{ label: "Close", onClick: () => setActive(null) }}
          primaryAction={
            active.share_token
              ? {
                  label: "Open full config",
                  onClick: () => {
                    window.location.href = `/s/${active.share_token}`;
                  },
                }
              : undefined
          }
        >
          <ConfigVisual cfg={active.config_data ?? {}} />
        </Modal>
      )}
    </>
  );
}
