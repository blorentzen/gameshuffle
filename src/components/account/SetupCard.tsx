"use client";

import { useState } from "react";
import { Icon, Tooltip } from "@empac/cascadeds";
import { getImagePath } from "@/lib/images";
import { getGameName } from "@/data/game-registry";
import mk8dxData from "@/data/mk8dx-data.json";

interface SetupCardProps {
  config: {
    id: string;
    config_name: string;
    randomizer_slug: string;
    config_data: Record<string, any>;
    share_token: string | null;
    created_at: string;
  };
  onCopyLink: (token: string) => void;
  onDelete: (id: string) => void;
  copied: string | null;
}

type ExpandedSection = "players" | "tracks" | "items" | null;

// Build item image lookup from game data
const itemImageMap: Record<string, string> = {};
if (mk8dxData.items) {
  mk8dxData.items.forEach((item: { name: string; img: string }) => {
    itemImageMap[item.name] = item.img;
  });
}

export function SetupCard({ config, onCopyLink, onDelete, copied }: SetupCardProps) {
  const [expanded, setExpanded] = useState<ExpandedSection>(null);
  const cfg = config.config_data;

  const toggleSection = (section: ExpandedSection) => {
    setExpanded(expanded === section ? null : section);
  };

  return (
    <div className="saved-build-card">
      {cfg?.type === "kart-build" && (
        <div className="saved-build-card__images">
          {["character", "vehicle", "wheels", "glider"].map(
            (slot) =>
              cfg[slot]?.img && (
                <div key={slot} className="saved-build-card__slot">
                  <img src={getImagePath(cfg[slot].img)} alt={cfg[slot].name} />
                  <span>{cfg[slot].name}</span>
                </div>
              )
          )}
        </div>
      )}

      {cfg?.type === "game-night-setup" && (
        <div className="saved-build-card__setup">
          <div className="saved-build-card__summary">
            <button
              className={`saved-build-card__stat saved-build-card__stat--clickable ${expanded === "players" ? "saved-build-card__stat--active" : ""}`}
              onClick={() => toggleSection("players")}
            >
              <span className="saved-build-card__stat-value">{cfg.players?.length || 0}</span>
              <span className="saved-build-card__stat-label"><Icon name="users" size="12" /> Players</span>
            </button>
            <button
              className={`saved-build-card__stat saved-build-card__stat--clickable ${expanded === "tracks" ? "saved-build-card__stat--active" : ""}`}
              onClick={() => toggleSection("tracks")}
            >
              <span className="saved-build-card__stat-value">{cfg.tracks?.length || 0}</span>
              <span className="saved-build-card__stat-label"><Icon name="flag" size="12" /> Tracks</span>
            </button>
            <button
              className={`saved-build-card__stat saved-build-card__stat--clickable ${expanded === "items" ? "saved-build-card__stat--active" : ""}`}
              onClick={() => toggleSection("items")}
            >
              <span className="saved-build-card__stat-value">{cfg.activeItems?.length || 0}</span>
              <span className="saved-build-card__stat-label"><Icon name="box" size="12" /> Items</span>
            </button>
          </div>

          {/* Expanded: Players */}
          {expanded === "players" && cfg.players && (
            <div className="setup-expand">
              {cfg.players.map((p: any, i: number) => (
                <div key={i} className="setup-expand__player">
                  <span className="setup-expand__name">{p.name || `Player ${i + 1}`}</span>
                  {p.combo && (
                    <div className="setup-expand__combo">
                      {["character", "vehicle", "wheels", "glider"].map(
                        (slot) =>
                          p.combo[slot]?.img && (
                            <Tooltip key={slot} content={p.combo[slot].name} position="top">
                              <img
                                src={getImagePath(p.combo[slot].img)}
                                alt={p.combo[slot].name}
                                className="setup-expand__part-img"
                              />
                            </Tooltip>
                          )
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Expanded: Tracks */}
          {expanded === "tracks" && cfg.tracks && (
            <div className="setup-expand">
              <div className="setup-expand__track-grid">
                {cfg.tracks.map((t: any, i: number) => (
                  <div key={i} className="setup-expand__track">
                    <img src={getImagePath(t.img)} alt={t.name} className="setup-expand__track-img" />
                    <span className="setup-expand__track-name">{t.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expanded: Items */}
          {expanded === "items" && cfg.activeItems && (
            <div className="setup-expand">
              <div className="setup-expand__item-grid">
                {cfg.activeItems.map((name: string) => (
                  <Tooltip key={name} content={name} position="top">
                    <div className="setup-expand__item">
                      {itemImageMap[name] ? (
                        <img src={getImagePath(itemImageMap[name])} alt={name} className="setup-expand__item-img" />
                      ) : (
                        <span className="setup-expand__item-fallback">{name}</span>
                      )}
                    </div>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}

          <div className="saved-build-card__presets">
            {cfg.charFilters?.length > 0 && (
              <span className="config-tag">Weight: {cfg.charFilters.join(", ")}</span>
            )}
            {cfg.vehiFilters?.length > 0 && (
              <span className="config-tag">Drift: {cfg.vehiFilters.join(", ")}</span>
            )}
            {cfg.noDups && <span className="config-tag">No Duplicates</span>}
            {cfg.tourOnly && <span className="config-tag">Tour Only</span>}
          </div>
        </div>
      )}

      {cfg?.type === "item-set" && (
        <div className="saved-build-card__summary">
          <button
            className={`saved-build-card__stat saved-build-card__stat--clickable ${expanded === "items" ? "saved-build-card__stat--active" : ""}`}
            onClick={() => toggleSection("items")}
          >
            <span className="saved-build-card__stat-value">{cfg.items?.length || 0}</span>
            <span className="saved-build-card__stat-label"><Icon name="box" size="12" /> Items</span>
          </button>
          {expanded === "items" && cfg.items && (
            <div className="setup-expand" style={{ gridColumn: "1 / -1" }}>
              <div className="setup-expand__item-grid">
                {cfg.items.map((item: any) => (
                  <Tooltip key={item.name} content={item.name} position="top">
                    <div className="setup-expand__item">
                      {item.img ? (
                        <img src={getImagePath(item.img)} alt={item.name} className="setup-expand__item-img" />
                      ) : (
                        <span className="setup-expand__item-fallback">{item.name}</span>
                      )}
                    </div>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="saved-build-card__details">
        <span className="saved-build-card__name">{config.config_name}</span>
        <span className="saved-build-card__game">{getGameName(config.randomizer_slug)}</span>
        <span className="account-card__label">{new Date(config.created_at).toLocaleDateString()}</span>
      </div>

      <div className="saved-build-card__actions saved-build-card__actions--row">
        {(cfg?.type === "game-night-setup" || cfg?.type === "item-set") && (
          <Tooltip content="Open in Randomizer" position="bottom">
            <a href={`/randomizers/${config.randomizer_slug}?config=${config.id}`}>
              <button className="icon-action-btn icon-action-btn--primary">
                <Icon name="external-link" size="16" />
              </button>
            </a>
          </Tooltip>
        )}
        {config.share_token && (
          <Tooltip content={copied === config.share_token ? "Copied!" : "Copy share link"} position="bottom">
            <button className="icon-action-btn" onClick={() => onCopyLink(config.share_token!)}>
              <Icon name={copied === config.share_token ? "check" : "share"} size="16" />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Delete" position="bottom">
          <button className="icon-action-btn icon-action-btn--danger" onClick={() => onDelete(config.id)}>
            <Icon name="trash" size="16" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
