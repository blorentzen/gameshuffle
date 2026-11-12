/**
 * The character's pictures (client, no three.js): one small canvas per
 * character holding what its head shows, drawn once from the avatar.
 *
 * The canvas is two squares side by side: the left one is the front (the face
 * in the visor, the puck's face, the built head's features, the sticker), the
 * right one the back (the helmet's roundel, the puck's number). Character
 * geometry maps its UVs into one square or the other, so a head is one texture
 * and one draw call.
 *
 * DiceBear Adventurer layout (a 762 square): the head is a circle centered
 * near (385, 387) with a radius of about 223, drawn three quarters on (the ear
 * on the right); the eyebrows sit near y 345 and the mouth near 530.
 */

import { dicebearAvatar } from "@/lib/avatar/dicebear";
import type { CharacterLook, CharacterSpec } from "./types";

const AV = 762;
const HEAD = { x: 385, y: 387, r: 223 };

export interface CharacterTraits {
  /** Skin color (hex). */
  skin: string;
  /** Hair color (hex), or null when bald. */
  hair: string | null;
  /** DiceBear's hair name (short01…long26), or null. */
  hairStyle: string | null;
  glasses: boolean;
}

export interface CharacterArt {
  spec: CharacterSpec;
  /** The look actually drawn (a photo can't be built into a head, so "built" falls back to "token"). */
  look: CharacterLook;
  /** Two squares side by side: front (left), back (right). */
  canvas: HTMLCanvasElement;
  traits: CharacterTraits;
  photo: boolean;
  /** The cutout's die-cut outline in the front square (0 to 1, y down), the chin point and the head's radius there. */
  sticker: { outline: [number, number][]; chin: [number, number]; headR: number } | null;
}

/** A neutral skin for photo players (the neck and hands under a photo). */
const PHOTO_SKIN = "#e3b48f";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

async function svgImage(svg: string): Promise<HTMLImageElement> {
  // A size on the root, so the picture's source rectangle is in the avatar's own units.
  const sized = svg.replace("<svg ", `<svg width="${AV}" height="${AV}" `);
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  try {
    return await loadImage(url);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** The avatar's SVG without its head shape (eyes, brows, mouth, glasses and freckles only). */
function featuresOnly(svg: string): string {
  const open = '<g mask="url(#viewboxMask)">';
  const a = svg.indexOf(open);
  const b = svg.indexOf('<g transform="translate(-161 -83)">');
  if (a < 0 || b < 0 || b < a) return svg;
  return svg.slice(0, a + open.length) + svg.slice(b);
}

function hexMix(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace("#", ""), 16);
  const pb = parseInt(b.replace("#", ""), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

/** A centered square crop of a photo, drawn into a circle. */
function drawPhotoDisc(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, r: number) {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, sx, sy, side, side, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

/** A racer number (or a star) in a circle's middle. */
function drawBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, text: string | null | undefined, color: string) {
  ctx.fillStyle = color;
  if (text) {
    const t = text.slice(0, 2);
    const px = Math.round(size * (t.length > 1 ? 0.78 : 1));
    ctx.font = `800 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const m = ctx.measureText(t);
    // Center on the glyphs' own box (fonts sit their digits differently).
    const asc = m.actualBoundingBoxAscent || px * 0.72;
    const desc = m.actualBoundingBoxDescent || 0;
    ctx.fillText(t, cx, cy + (asc - desc) / 2);
    return;
  }
  const r = size * 0.62;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/** The die-cut outline round an avatar: for each direction from the head's middle, the farthest drawn pixel plus a border. */
function stickerOutline(img: HTMLImageElement): [number, number][] {
  const N = 128;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, N, N);
  const data = ctx.getImageData(0, 0, N, N).data;
  const opaque = (x: number, y: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= N || yi >= N) return false;
    return data[(yi * N + xi) * 4 + 3] > 60;
  };
  const cx = (HEAD.x / AV) * N;
  const cy = (HEAD.y / AV) * N;
  const steps = 72;
  const border = 5.5;
  const radii: number[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let found = (HEAD.r / AV) * N * 0.9;
    for (let r = N * 0.75; r > 0; r -= 0.5) {
      if (opaque(cx + dx * r, cy + dy * r)) {
        found = Math.max(found, r);
        break;
      }
    }
    radii.push(found + border);
  }
  // Close small notches (a max over neighbors), then soften.
  const closed = radii.map((_, i) => Math.max(radii[(i + steps - 1) % steps], radii[i], radii[(i + 1) % steps]));
  const soft = closed.map((_, i) => closed[(i + steps - 1) % steps] * 0.25 + closed[i] * 0.5 + closed[(i + 1) % steps] * 0.25);
  return soft.map((r, i) => {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.min(N - 1, Math.max(1, cx + Math.cos(a) * r));
    const y = Math.min(N - 1, Math.max(1, cy + Math.sin(a) * r));
    return [x / N, y / N] as [number, number];
  });
}

function circleOutline(cx: number, cy: number, r: number, steps = 48): [number, number][] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number];
  });
}

/**
 * Draws a character's pictures. `px` is the size of each square (256 is plenty
 * for a head on a phone; 512 for a big close-up).
 */
export async function characterArt(spec: CharacterSpec, opts: { px?: number } = {}): Promise<CharacterArt> {
  const S = Math.max(64, Math.min(1024, opts.px ?? 256));
  const canvas = document.createElement("canvas");
  canvas.width = S * 2;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  const [deep, bright] = spec.tone;

  let photo: HTMLImageElement | null = null;
  if (spec.avatar.kind === "photo") {
    try {
      photo = await loadImage(spec.avatar.url);
    } catch {
      photo = null;
    }
  }
  const seed = spec.avatar.kind === "dicebear" ? spec.avatar.seed : "shuffle-kart";
  const lookOpts = spec.avatar.kind === "dicebear" ? spec.avatar.look : null;
  const base = { ...(lookOpts ?? {}), backgroundColor: "transparent" };
  const full = dicebearAvatar(seed, base);
  const extra = full.toJson().extra as Record<string, string | undefined>;
  const traits: CharacterTraits = photo
    ? { skin: PHOTO_SKIN, hair: null, hairStyle: null, glasses: false }
    : {
        skin: extra.skinColor ?? "#ecad80",
        hair: extra.hair ? extra.hairColor ?? "#3a2a1e" : null,
        hairStyle: extra.hair ?? null,
        glasses: !!extra.glasses,
      };
  const look: CharacterLook = photo && spec.look === "built" ? "token" : spec.look;
  let sticker: CharacterArt["sticker"] = null;

  // Front (left square).
  if (look === "helmet") {
    if (photo) drawPhotoDisc(ctx, photo, S / 2, S / 2, S * 0.72);
    else {
      const face = await svgImage(dicebearAvatar(seed, base, { hairProbability: 0, earringsProbability: 0 }).toString());
      ctx.fillStyle = traits.skin;
      ctx.fillRect(0, 0, S, S);
      // Eyebrows to mouth fill the visor's band (the plate's middle half, top to bottom).
      ctx.drawImage(face, 86, 189, 488, 488, 0, 0, S, S);
    }
  } else if (look === "token") {
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = hexMix(bright, "#ffffff", 0.78);
    ctx.fillRect(0, 0, S, S);
    if (photo) drawPhotoDisc(ctx, photo, S / 2, S / 2, S / 2);
    else {
      const img = await svgImage(full.toString());
      // The avatar's face filling the disc, hair running off the edge.
      const k = (S * 1.3) / AV;
      ctx.drawImage(img, S / 2 - (HEAD.x - 20) * k, S * 0.5 - (HEAD.y + 10) * k, AV * k, AV * k);
    }
    ctx.restore();
    ctx.strokeStyle = deep;
    ctx.lineWidth = S * 0.025;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.487, 0, Math.PI * 2);
    ctx.stroke();
  } else if (look === "built") {
    const feat = await svgImage(featuresOnly(dicebearAvatar(seed, base, { hairProbability: 0, earringsProbability: 0 }).toString()));
    ctx.fillStyle = traits.skin;
    ctx.fillRect(0, 0, S, S);
    // The face centered on the head's front (the avatar draws it three quarters on, so its center sits left of the head's).
    ctx.drawImage(feat, 330 - 220, 395 - 220, 440, 440, 0, 0, S, S);
  } else {
    // Cutout: the avatar on a white die-cut shape.
    let outline: [number, number][];
    let chin: [number, number];
    let headR: number;
    let draw: () => void;
    if (photo) {
      outline = circleOutline(0.5, 0.5, 0.47);
      chin = [0.5, 0.9];
      headR = 0.4;
      const p = photo;
      draw = () => drawPhotoDisc(ctx, p, S / 2, S / 2, S * 0.4);
    } else {
      const img = await svgImage(full.toString());
      outline = stickerOutline(img);
      chin = [HEAD.x / AV, (HEAD.y + HEAD.r) / AV];
      headR = HEAD.r / AV;
      draw = () => ctx.drawImage(img, 0, 0, S, S);
    }
    ctx.beginPath();
    outline.forEach(([x, y], i) => (i ? ctx.lineTo(x * S, y * S) : ctx.moveTo(x * S, y * S)));
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    draw();
    ctx.strokeStyle = "rgba(10,14,30,0.22)";
    ctx.lineWidth = S * 0.012;
    ctx.stroke();
    sticker = { outline, chin, headR };
  }

  // Back (right square).
  const bx = S * 1.5;
  const by = S / 2;
  if (look === "helmet") {
    // A roundel: white disc, deep ring, the number.
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(bx, by, S * 0.44, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = deep;
    ctx.lineWidth = S * 0.06;
    ctx.beginPath();
    ctx.arc(bx, by, S * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    drawBadge(ctx, bx, by, S * 0.5, spec.badge, deep);
  } else if (look === "token") {
    ctx.fillStyle = deep;
    ctx.beginPath();
    ctx.arc(bx, by, S / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bright;
    ctx.beginPath();
    ctx.arc(bx, by, S * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = S * 0.035;
    ctx.beginPath();
    ctx.arc(bx, by, S * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    drawBadge(ctx, bx, by, S * 0.5, spec.badge, "#ffffff");
  } else if (look === "built") {
    ctx.fillStyle = traits.skin;
    ctx.fillRect(S, 0, S, S);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(S, 0, S, S);
  }

  return { spec, look, canvas, traits, photo: !!photo, sticker };
}
