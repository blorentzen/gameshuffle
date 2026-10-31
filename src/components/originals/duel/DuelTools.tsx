"use client";

/**
 * Tools in the turn window (picks 2026-10-25, https://claude.ai/artifact/2Jvhc2QgmCGMZSTcLMME1o): the
 * tools in your bag that this duel allows, each with its Item card's picture. Pick one, then (when it
 * needs one) the card it goes on, or Spare Energy's type and card; it's used straight away and the turn
 * goes on. One a duel on Trainer Road or the Daily Duel, none in Hard (the engine says how many
 * are left and where each can go: DuelPlayView.tools).
 *
 * The tool tiles are our own drawing (a picture option list: on the CascadeDS fix list, like the turn
 * window's card rows); the choices after a pick are CascadeDS Buttons and Chips.
 */

import { useState } from "react";
import { Button, Chip as CdsChip } from "@empac/cascadeds";
import { IconBackpack } from "@tabler/icons-react";
import type { DuelCardView, DuelPlayView, ToolBagView, ToolItemView } from "@/lib/originals/duel/view";
import type { DuelToolStep, EnergyType, ToolId } from "@/lib/originals/duel/types";
import { TOOLS, patchAmount } from "@/lib/originals/duel/tools";
import { EnergyDot } from "./DuelBits";
import { cardLabel } from "./duelLook";
import "@/styles/tool-art.css";

/** A tool's Item card, cropped to its art window. */
export function ToolArt({ item, ratio = 3 / 2, className = "" }: { item: Pick<ToolItemView, "art">; ratio?: number; className?: string }) {
  const art = item.art;
  if (!art) return <span className={`tool-art tool-art--none ${className}`} style={{ aspectRatio: String(ratio) }} aria-hidden="true" />;
  const [x, y, w, h] = art.box;
  const win = (w * art.w) / (h * art.h);
  const cover = win >= ratio ? { width: `${(win / ratio) * 100}%`, height: "100%" } : { width: "100%", height: `${(ratio / win) * 100}%` };
  return (
    <span className={`tool-art ${className}`} style={{ aspectRatio: String(ratio) }} aria-hidden="true">
      <span className="tool-art__win" style={cover}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Scrydex card image, cropped to its art window by CSS */}
        <img src={art.img} alt="" loading="lazy" decoding="async" style={{ width: `${100 / w}%`, transform: `translate(${-x * 100}%, ${-y * 100}%)` }} />
      </span>
    </span>
  );
}

/** How many of a tool, on its tile: "×3", "Kept" (ready today), or both. */
const countText = (i: ToolItemView) => [i.count > 0 ? `×${i.count}` : null, i.keptReady ? "Kept" : null].filter(Boolean).join(" · ");

export function DuelTools({ play, bag, busy, onTool }: {
  play: DuelPlayView;
  bag: ToolBagView;
  busy: boolean;
  onTool: (st: DuelToolStep) => void;
}) {
  const tools = play.tools;
  const [open, setOpen] = useState<ToolId | null>(null);
  const [type, setType] = useState<EnergyType | null>(null);
  if (!tools) return null;
  const items = bag.items.filter((i) => i.count > 0 || i.keptReady);
  const usedNames = tools.used.map((t) => TOOLS[t].name);
  const left = tools.left;
  const status = left > 0 ? `${left} left this battle` : `Used: ${usedNames.join(", ")}`;

  if (!items.length) {
    return (
      <div className="duel-tools duel-tools--empty">
        <p className="duel-turnwin__label"><IconBackpack size={16} stroke={2} aria-hidden="true" />Tools <span>Your bag is empty. Tools come from badges and the Mart on Trainer Road.</span></p>
      </div>
    );
  }

  const pickTool = (id: ToolId) => { setOpen((o) => (o === id ? null : id)); setType(null); };
  const item = open ? items.find((i) => i.id === open) ?? null : null;
  const target = open ? tools.targets[open] : undefined;
  const use = (card?: number) => { if (open) onTool({ tool: open, ...(card != null ? { card } : {}), ...(open === "spare" && type ? { type } : {}) }); };
  const cardName = (i: number) => cardLabel(play.you[i]);
  const cardLine = (c: DuelCardView) => {
    if (open === "patch") return `${cardLabel(c)}: ${c.cur}/${c.hp} HP, +${Math.min(c.hp - c.cur, patchAmount())}`;
    if (open === "wind") return `${cardLabel(c)}: back with ${Math.max(10, Math.floor(c.hp / 20) * 10)} HP`;
    return `${cardLabel(c)}: ${c.cur}/${c.hp} HP`;
  };

  return (
    <div className="duel-tools">
      <p className="duel-turnwin__label" id="duel-tools-label"><IconBackpack size={16} stroke={2} aria-hidden="true" />Tools <span>{status}</span></p>
      <ul className="duel-tools__list" aria-labelledby="duel-tools-label">
        {items.map((i) => {
          const can = left > 0 && !!tools.targets[i.id];
          return (
            <li key={i.id}>
              <button
                type="button"
                className={`duel-tool${open === i.id ? " duel-tool--on" : ""}`}
                onClick={() => pickTool(i.id)}
                disabled={busy || !can}
                aria-pressed={open === i.id}
                data-tool={i.id}
                aria-label={`${i.name}: ${i.line} ${i.count > 0 ? `You have ${i.count}.` : ""}${i.keptReady ? " Kept for good, ready today." : ""}${!can && left > 0 ? " Nothing to use it on right now." : ""}`}
              >
                <ToolArt item={i} className="duel-tool__art" />
                <span className="duel-tool__name" aria-hidden="true">{i.name}</span>
                <span className="duel-tool__count" aria-hidden="true">{countText(i)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {item && target && (
        <div className="duel-tools__use" role="group" aria-label={item.name}>
          <p className="duel-tools__line">{item.line}</p>
          {item.art?.credit && <p className="duel-tools__credit">Picture: {item.art.credit}</p>}
          {open === "spare" && (
            <span className="duel-hand" role="group" aria-label="Which Energy">
              {(target.types ?? []).map((t) => (
                <CdsChip key={t} clickable selected={type === t} disabled={busy} size="medium" icon={<EnergyDot t={t} size="sm" />} label={t} onClick={() => setType(t)} className="duel-hand__e" aria-label={`${t} Energy${type === t ? ", picked" : ""}`} />
              ))}
            </span>
          )}
          {TOOLS[item.id].aim === "card" || TOOLS[item.id].aim === "out" ? (
            (open !== "spare" || type) && (
              <div className="duel-tools__cards">
                {target.cards.map((ci) => (
                  <Button key={ci} variant="secondary" size="small" className="duel-tools__card" onClick={() => use(ci)} disabled={busy} data-tool-card={ci}
                    aria-label={`${item.name} on ${cardName(ci)}`}>
                    {cardLine(play.you[ci])}
                  </Button>
                ))}
              </div>
            )
          ) : (
            <Button variant="primary" size="small" className="duel-tools__go" onClick={() => use()} disabled={busy} data-tool-use>Use {item.name}</Button>
          )}
        </div>
      )}
    </div>
  );
}
