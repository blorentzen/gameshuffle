/**
 * Daily Duel: the trainer's picture (picks 2026-10-21, https://claude.ai/artifact/4YeQz1MVRnuBLkSHmkMCmp,
 * every option as recommended). The art window of the person's own Supporter card; when no card
 * shows them, their official artwork (self-hosted, from the games' official sites; added
 * 2026-10-23), else the art of their ace's card; with where the face is for the round portrait.
 * Pure; the data is small (src/data/originals/duel/trainer-cards.ts, trainer-art.generated.ts and
 * official-art.generated.ts), so a stored day of any age gets the current picture for its person,
 * and a person the data doesn't know yet gets their ace.
 *
 * `artCrop` is the one crop rule: the page's CSS (.duel-art in duel-art.css) does the same sums
 * with container units, and the share card cuts the image with it on the server.
 */

import { ACE_ART, ACE_FACE, DUEL_TRAINER_CARDS, OFFICIAL_ART, OFFICIAL_ART_ON, POKEMON_ART, SUPPORTER_ART, supporterEra, type ArtBox } from "@/data/originals/duel/trainer-cards";
import { DUEL_TRAINER_ART } from "@/data/originals/duel/trainer-art.generated";
import { DUEL_OFFICIAL_ART } from "@/data/originals/duel/official-art.generated";
import { personOf } from "./rules";
import type { DuelCard, DuelTrainer } from "./types";
import type { DuelPicture } from "./view";

/** Scrydex's medium card images are 367 × 512: the shape when an image wasn't measured. */
export const CARD_RATIO = 367 / 512;

/** The credit line for a picture ("Bertha's picture: Bertha's Warmth (Rising Rivals), illustrated by Ken Sugimori."; "Viola's picture: official artwork from Pokémon X and Y."). */
export function pictureCredit(name: string, p: Pick<DuelPicture, "kind" | "card" | "set" | "artist">): string {
  const line = p.kind === "ace" ? `${name}'s picture: the art from ${name}'s ace, ${p.card}`
    : p.kind === "official" ? `${name}'s picture: official artwork from ${p.set}`
    : `${name}'s picture: ${p.card}${p.set ? ` (${p.set})` : ""}${p.artist ? `, illustrated by ${p.artist}` : ""}`;
  // One stop at the end, even after a name that ends in one ("GAME FREAK inc.", "Let's Go, Eevee!").
  return /[.!?]$/.test(line) ? line : `${line}.`;
}

/** Screen-reader words for the picture, where it carries meaning. */
export function pictureAlt(name: string, p: Pick<DuelPicture, "kind" | "card">): string {
  if (p.kind === "official") return `${name}, from official artwork`;
  return p.kind === "ace" ? `${name}'s ace, ${p.card}, from its card` : `${name}, from the card ${p.card}`;
}

/** A person's official picture, when the data has one and the switch is on. */
function officialPicture(name: string, person: string): DuelPicture | null {
  const plan = OFFICIAL_ART[person];
  const art = DUEL_OFFICIAL_ART[person];
  if (!OFFICIAL_ART_ON || !plan || !art) return null;
  const p = { kind: "official" as const, card: "official artwork", set: plan.game, artist: null };
  return {
    ...p, id: `official:${person}`, img: art.img, ratio: art.ratio, box: [0, 0, 1, 1],
    face: [...plan.face] as DuelPicture["face"],
    alt: pictureAlt(name, p), credit: pictureCredit(name, p),
  };
}

/**
 * A trainer's picture: their own card when the data has one, else their official artwork, else the
 * ace on screen (`ace`, the last card of the team, with its image as the day stored it). Null when
 * none has a picture.
 */
export function trainerPicture(trainer: Pick<DuelTrainer, "name" | "person">, ace: Pick<DuelCard, "id" | "name" | "short" | "img"> | null): DuelPicture | null {
  const person = personOf(trainer);
  const plan = DUEL_TRAINER_CARDS[person];
  if (plan?.card) {
    const art = DUEL_TRAINER_ART[plan.card];
    if (art) {
      const p = { kind: "card" as const, card: plan.name, set: plan.set, artist: plan.artist || null };
      return {
        ...p, id: plan.card, img: art.img, ratio: art.ratio,
        box: [...(plan.box ?? SUPPORTER_ART[supporterEra(plan.card)])] as DuelPicture["box"],
        face: [...plan.face] as DuelPicture["face"],
        alt: pictureAlt(trainer.name, p), credit: pictureCredit(trainer.name, p),
      };
    }
  }
  const official = officialPicture(trainer.name, person);
  if (official) return official;
  if (!ace?.img) return null;
  const p = { kind: "ace" as const, card: ace.short || ace.name, set: null, artist: null };
  return {
    ...p, id: ace.id, img: ace.img, ratio: DUEL_TRAINER_ART[ace.id]?.ratio ?? CARD_RATIO,
    box: [...(ACE_ART[ace.id]?.box ?? POKEMON_ART)] as DuelPicture["box"],
    face: [...(ACE_ART[ace.id]?.face ?? ACE_FACE)] as DuelPicture["face"],
    alt: pictureAlt(trainer.name, p), credit: pictureCredit(trainer.name, p),
  };
}

/** The picture for a person by name alone (a share card stored before pictures): their own card or official artwork, or null. */
export function pictureByName(name: string, person?: string): DuelPicture | null {
  return trainerPicture({ name, person }, null);
}

/**
 * Where to cut the card image for a frame `w` × `h` (any unit): the art window covers the frame,
 * zoomed by `zoom`, with the face (x, y in the art window) at (`px`, `py`) of the frame where the
 * art window allows (it never shows past the art window's edges). Returns the cut as shares of
 * the image: x, y, width, height.
 */
export function artCrop(p: Pick<DuelPicture, "box" | "ratio" | "face">, w: number, h: number, opts: { zoom?: number; px?: number; py?: number } = {}): ArtBox {
  const [ax, ay, aw, ah] = p.box;
  const r = p.ratio;
  const fx = p.face[0];
  const fy = p.face[1];
  const iw = Math.max(w / aw, (h * r) / ah) * Math.max(1, opts.zoom ?? 1);
  const ih = iw / r;
  const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(v, hi));
  const left = clamp(w - (ax + aw) * iw, w * (opts.px ?? 0.5) - (ax + fx * aw) * iw, -ax * iw);
  const top = clamp(h - (ay + ah) * ih, h * (opts.py ?? 0.5) - (ay + fy * ah) * ih, -ay * ih);
  return [-left / iw, -top / ih, w / iw, h / ih];
}
