/**
 * The City rooftops course in 3D (client, three.js), built once per level from
 * the sim's level (src/lib/airtime/level.ts). Nothing here changes how the game
 * plays: every roof, plank, mast and crane arm is drawn where the sim has it,
 * and everything else (rooftop clutter, the buildings behind, the skyline, the
 * clouds) stands behind the running line where nothing can touch you.
 *
 * Layers (real depth, so parallax comes from the camera itself):
 *   z = -6 .. +1.7   the rooftops you run on (the running line is z = 0)
 *   z = -24 .. -58   the buildings behind, with lit windows
 *   z = -170 .. -240 the far skyline in the haze
 *   z = -120 .. -160 clouds, drifting
 *
 * Draw calls stay low: each layer is one merged, vertex-colored mesh (lit
 * windows one more, unlit), so a level is about ten draw calls of scenery.
 */

import * as THREE from "three";
import type { Level, Solid } from "@/lib/airtime/level";
import { seeded } from "@/lib/airtime/rng";
import { at, atR, glow, Mesher, mix, paint, shade } from "./mesher";

/** The front face of the rooftop buildings (toward the camera) and their back. */
export const FRONT = 1.7;
export const BACK = -6;
const BOTTOM = -34;

/** Golden hour over the city. */
export const LOOK = {
  skyTop: "#3a6bd6",
  skyMid: "#86aef0",
  horizon: "#ffcf9e",
  sun: "#fff3cf",
  haze: "#f4c9a4",
  hemiSky: "#e8eeff",
  hemiGround: "#8c7c94",
  sunLight: "#ffe2bf",
  facades: [
    { wall: "#c1694f", trim: "#ecdccb" },
    { wall: "#d6a067", trim: "#f6e7cf" },
    { wall: "#5f7fa8", trim: "#dce6f2" },
    { wall: "#8b909a", trim: "#d9dce2" },
    { wall: "#dfcaa6", trim: "#fbf3e3" },
    { wall: "#4f6277", trim: "#c8d2de" },
    { wall: "#a35d6d", trim: "#efd6dc" },
    { wall: "#6e9a89", trim: "#dcebe4" },
  ],
  roof: ["#6f7279", "#7c7a77", "#8a857d", "#69707a"],
  glass: "#30507f",
  glassHi: "#5a7fb4",
  lit: ["#ffd98a", "#ffcb66", "#ffe6ad"],
  wood: "#b9844e",
  steel: "#c3c9d1",
  yellow: "#f2b134",
  mid: ["#a8746a", "#b99a7c", "#7f8fa8", "#9a9aa3", "#c9b597", "#76829a", "#a07884", "#86a093"],
  far: ["#9a90c0", "#8a86b6", "#a49ac4", "#8f8cb9", "#b3a5c8"],
  cloud: ["#fff6ee", "#ffe4d0", "#fde9f0"],
} as const;

export interface World {
  group: THREE.Group;
  /** Hidden in low quality. */
  extras: THREE.Object3D[];
  /** Red lights on the masts and crane (they blink). */
  beacons: THREE.Mesh | null;
  clouds: THREE.Group;
  dispose(): void;
}

function facadeOf(s: Solid) {
  return LOOK.facades[Math.floor(s.look * LOOK.facades.length) % LOOK.facades.length];
}

/** A flat, up-facing rectangle at height y. */
function flat(m: Mesher, x0: number, z0: number, x1: number, z1: number, y: number, tint: string | THREE.Color): void {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.add(g, tint);
}

/** One rooftop building: walls, the cornice, the roof deck, a low parapet, floor bands, windows. */
function building(body: Mesher, win: Mesher, s: Solid, rnd: () => number, rows: number): void {
  const f = facadeOf(s);
  const top = s.y1;
  // Walls (front, sides) and the roof deck.
  body.span(s.x0, BOTTOM, BACK, s.x1, top - 0.32, FRONT, f.wall);
  body.span(s.x0 - 0.1, top - 0.34, BACK - 0.1, s.x1 + 0.1, top, FRONT + 0.14, f.trim);
  flat(body, s.x0, BACK, s.x1, FRONT + 0.04, top + 0.003, LOOK.roof[Math.floor(s.look * 97) % LOOK.roof.length]);
  // A low parapet at the front and a taller one at the back.
  body.span(s.x0, top, FRONT - 0.04, s.x1, top + 0.2, FRONT + 0.14, f.trim);
  body.span(s.x0, top, BACK - 0.1, s.x1, top + 0.55, BACK + 0.2, f.trim);
  // Floors: a band every 2.6 m and windows between.
  const colW = 1.5 + (s.look * 7 % 1) * 0.6;
  const cols = Math.max(1, Math.floor((s.x1 - s.x0 - 1.2) / colW));
  const pad = (s.x1 - s.x0 - cols * colW) / 2;
  const winW = colW * 0.55;
  const tall = (s.look * 13) % 1 < 0.5;
  const litShare = 0.18 + ((s.look * 31) % 1) * 0.22;
  for (let r = 0; r < rows; r++) {
    const fy = top - 1.0 - r * 2.6;
    if (fy < BOTTOM + 3) break;
    body.span(s.x0, fy - 2.6 + 0.02, FRONT, s.x1, fy - 2.6 + 0.16, FRONT + 0.06, shade(f.wall, 0.86));
    const wh = tall ? 1.5 : 1.15;
    for (let c = 0; c < cols; c++) {
      const cx = s.x0 + pad + colW * (c + 0.5);
      const lit = rnd() < litShare;
      const tint = lit ? LOOK.lit[Math.floor(rnd() * LOOK.lit.length)] : mix(LOOK.glass, LOOK.glassHi, rnd() * 0.5);
      win.quad(cx - winW / 2, fy - wh, cx + winW / 2, fy, FRONT + 0.03, tint);
      // A sill under each window.
      body.span(cx - winW / 2 - 0.08, fy - wh - 0.12, FRONT, cx + winW / 2 + 0.08, fy - wh, FRONT + 0.12, f.trim);
    }
  }
}

/** Rooftop clutter (drawn behind the running line). */
function decorPiece(m: Mesher, d: Level["decor"][number], solids: Solid[]): void {
  const y = d.y;
  switch (d.kind) {
    case "vent": {
      const z = -1.6 - d.v * 2.5;
      m.cyl(0.18, 0.2, 0.75, 8, "#b6bcc4", at(d.x, y, z));
      m.cyl(0.32, 0.32, 0.08, 8, "#9aa1aa", at(d.x, y + 0.75, z));
      m.cyl(0.0, 0.3, 0.18, 8, "#9aa1aa", at(d.x, y + 0.83, z));
      return;
    }
    case "ac": {
      const z = -2.4 - d.v * 1.2;
      m.box(1.5, 0.95, 1.1, "#d9dee5", at(d.x, y, z));
      m.box(1.52, 0.08, 1.12, "#aeb5be", at(d.x, y + 0.9, z));
      m.cyl(0.36, 0.36, 0.04, 12, "#5b6370", at(d.x - 0.25, y + 0.98, z));
      m.box(0.5, 0.5, 0.02, "#8b939e", at(d.x + 0.4, y + 0.2, z + 0.56));
      return;
    }
    case "tank": {
      const z = -3.4;
      for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) m.box(0.14, 1.6, 0.14, "#5a4a3f", at(d.x + lx, y, z + lz));
      m.box(2.0, 0.12, 2.0, "#6b5646", at(d.x, y + 1.55, z));
      m.cyl(1.05, 1.05, 2.0, 12, "#a8744a", at(d.x, y + 1.66, z));
      for (const by of [0.35, 1.0, 1.65]) m.cyl(1.08, 1.08, 0.07, 12, "#5a4636", at(d.x, y + 1.66 + by, z));
      m.cyl(0.05, 1.18, 0.75, 12, "#6a5140", at(d.x, y + 3.66, z));
      return;
    }
    case "hut": {
      const z = -3.6;
      m.box(2.6, 2.1, 2.2, "#c7c1b6", at(d.x, y, z));
      m.prism([[-1.4, 0], [1.4, 0], [1.4, 0.15], [-1.4, 0.55]], 2.4, "#6c6f78", at(d.x, y + 2.1, z));
      m.box(0.9, 1.6, 0.06, "#4a5568", at(d.x + 0.5, y, z + 1.11));
      m.box(0.08, 0.08, 0.04, "#e3c14d", at(d.x + 0.82, y + 0.8, z + 1.15));
      return;
    }
    case "dish": {
      const z = -4.2;
      m.cyl(0.06, 0.08, 1.0, 6, "#9aa1aa", at(d.x, y, z));
      m.add(new THREE.CylinderGeometry(0.62, 0.18, 0.22, 14), "#eef0f3", atR(d.x - 0.1, y + 1.15, z, 0, 0, 0.75));
      return;
    }
    case "skylight": {
      const z = -3;
      m.box(2.0, 0.25, 1.4, "#c9ccd2", at(d.x, y, z));
      m.prism([[-1, 0], [1, 0], [0, 0.42]], 1.4, "#7fa6d6", at(d.x, y + 0.25, z));
      return;
    }
    case "chimney": {
      const z = -4.8;
      m.box(0.8, 1.5, 0.8, "#9b4f3c", at(d.x, y, z));
      m.box(0.95, 0.14, 0.95, "#d8cfc4", at(d.x, y + 1.5, z));
      return;
    }
    case "plants": {
      const z = -4.6;
      m.box(2.2, 0.45, 0.8, "#8a6440", at(d.x, y, z));
      for (let i = 0; i < 4; i++) m.blob(0.38 + (i % 2) * 0.1, i % 2 ? "#4f9a4a" : "#3f8540", at(d.x - 0.8 + i * 0.53, y + 0.6, z), 0);
      return;
    }
    case "gate": {
      const z = -2.6;
      const x0 = d.x - 1.9;
      const x1 = d.x + 1.9;
      m.box(0.24, d.h, 0.24, "#2f66ec", at(x0, y, z));
      m.box(0.24, d.h, 0.24, "#2f66ec", at(x1, y, z));
      m.box(0.42, 0.14, 0.42, "#ffffff", at(x0, y + d.h, z));
      m.box(0.42, 0.14, 0.42, "#ffffff", at(x1, y + d.h, z));
      // The checkered banner, facing the camera.
      const bw = (x1 - x0 - 0.24) / 8;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 2; j++) m.quad(x0 + 0.12 + i * bw, y + d.h - 1.3 + j * 0.6, x0 + 0.12 + (i + 1) * bw, y + d.h - 0.7 + j * 0.6, z + 0.13, (i + j) % 2 ? "#15182a" : "#ffffff");
      }
      // The finish line across the roof.
      for (let i = 0; i < 12; i++) {
        const za = BACK + 0.2 + (i * (FRONT - BACK - 0.2)) / 12;
        const zb = BACK + 0.2 + ((i + 1) * (FRONT - BACK - 0.2)) / 12;
        flat(m, d.x - 0.35, za, d.x, zb, y + 0.01, i % 2 ? "#15182a" : "#ffffff");
        flat(m, d.x, za, d.x + 0.35, zb, y + 0.01, i % 2 ? "#ffffff" : "#15182a");
      }
      // Little flags strung from the banner.
      for (let i = 0; i < 7; i++) {
        const fx = x0 + 0.4 + i * 0.5;
        m.prism([[-0.16, 0], [0.16, 0], [0, -0.32]], 0.02, ["#ff6b5b", "#ffd23e", "#4cc38a", "#5aa2ff"][i % 4], at(fx, y + d.h - 1.32, z + 0.16));
      }
      return;
    }
    case "crane": {
      // The tower on the far roof, behind the line, up to the arm; a cab on top.
      const z = -3.4;
      const top = y + d.h;
      const half = 0.55;
      for (const [cx, cz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) m.span(d.x + cx - 0.07, y, z + cz - 0.07, d.x + cx + 0.07, top + 1.6, z + cz + 0.07, LOOK.yellow);
      for (let h = y + 0.9; h < top + 1.4; h += 1.1) {
        m.span(d.x - half, h, z + half - 0.05, d.x + half, h + 0.08, z + half + 0.05, LOOK.yellow);
        const g = new THREE.BoxGeometry(0.06, 1.45, 0.06);
        m.add(g, LOOK.yellow, atR(d.x, h + 0.55, z + half, 0, 0, (Math.round(h * 10) % 2 ? 1 : -1) * 0.78));
      }
      m.box(1.5, 1.2, 1.6, "#eceff3", at(d.x + 0.2, top - 1.6, z + 0.2));
      m.box(0.9, 0.5, 0.05, "#4a6fa8", at(d.x + 0.35, top - 1.1, z + 1.02));
      // The slewing beam from the tower out to the arm on the running line.
      const arm = solids.find((s) => s.kind === "arm" && d.x > s.x0 && d.x < s.x1);
      if (arm) m.span(d.x - 0.35, arm.y1 - 0.05, z, d.x + 0.35, arm.y1 + 0.25, 0, LOOK.yellow);
      m.box(0.2, 1.8, 0.2, LOOK.yellow, at(d.x, top + 1.6, z));
      return;
    }
    case "scaffold":
      return;
  }
}

/** Scaffolding under each plank in the frame: tubes down to the street, rails and braces. */
function scaffold(m: Mesher, d: Level["decor"][number], level: Level): void {
  const planks = level.ledges.filter((l) => l.x0 >= d.x - 0.01 && l.x1 <= d.x + d.w + 0.01);
  for (const l of planks) {
    // The plank itself, with a toe board.
    m.span(l.x0, l.y - 0.18, -1.3, l.x1, l.y, 1.3, LOOK.wood);
    m.span(l.x0, l.y - 0.24, 1.22, l.x1, l.y - 0.02, 1.34, shade(LOOK.wood, 0.75));
    // Tubes: front and back, every ~2 m.
    const n = Math.max(2, Math.round((l.x1 - l.x0) / 2) + 1);
    for (let i = 0; i < n; i++) {
      const x = l.x0 + 0.15 + (i * (l.x1 - l.x0 - 0.3)) / (n - 1);
      for (const z of [-1.2, 1.2]) m.span(x - 0.05, BOTTOM, z - 0.05, x + 0.05, l.y + (z < 0 ? 1.15 : 0), z + 0.05, LOOK.steel);
    }
    // A guard rail at the back, ledgers every 2 m down, and braces.
    m.span(l.x0, l.y + 1.05, -1.25, l.x1, l.y + 1.13, -1.15, LOOK.steel);
    for (let y = l.y - 2; y > -6; y -= 2) {
      m.span(l.x0, y, -1.25, l.x1, y + 0.08, -1.15, LOOK.steel);
      m.span(l.x0, y, 1.15, l.x1, y + 0.08, 1.25, LOOK.steel);
      const len = Math.hypot(l.x1 - l.x0, 2);
      const g = new THREE.BoxGeometry(len, 0.07, 0.07);
      m.add(g, shade(LOOK.steel, 0.85), atR((l.x0 + l.x1) / 2, y + 1, -1.2, 0, 0, Math.atan2(2, l.x1 - l.x0)));
    }
  }
}

/** Antenna masts: a red and white banded pole on a base, crossbars, a whip and a red light on top. */
function mast(m: Mesher, s: Solid, lights: Mesher): void {
  const x = (s.x0 + s.x1) / 2;
  const h = s.y1 - s.y0;
  m.box(0.7, 0.16, 0.7, "#5b6370", at(x, s.y0, 0));
  const bands = Math.max(3, Math.round(h / 0.6));
  for (let i = 0; i < bands; i++) {
    const y0 = s.y0 + 0.16 + (i * (h - 0.16)) / bands;
    const y1 = s.y0 + 0.16 + ((i + 1) * (h - 0.16)) / bands;
    const r = 0.17 - (i / bands) * 0.05;
    m.add(new THREE.CylinderGeometry(r - 0.01, r, y1 - y0, 8).translate(0, (y1 + y0) / 2, 0), i % 2 ? "#ffffff" : "#e5484d", at(x, 0, 0));
  }
  for (const f of [0.45, 0.8]) m.span(x - 0.42, s.y0 + h * f, -0.05, x + 0.42, s.y0 + h * f + 0.08, 0.05, "#9aa3ae");
  m.cyl(0.025, 0.04, 0.55, 5, "#9aa3ae", at(x, s.y1, 0));
  lights.blob(0.14, "#ff3b30", at(x, s.y1 + 0.62, 0), 1);
}

/** The crane's arm on the running line: chords, a lattice, the counterweight. */
function craneArm(m: Mesher, s: Solid, lights: Mesher): void {
  const y0 = s.y0;
  const y1 = s.y1;
  for (const z of [-0.32, 0.32]) {
    m.span(s.x0, y0, z - 0.06, s.x1, y0 + 0.12, z + 0.06, LOOK.yellow);
    m.span(s.x0, y1 - 0.12, z - 0.06, s.x1, y1, z + 0.06, LOOK.yellow);
  }
  const step = 0.9;
  for (let x = s.x0 + 0.1, i = 0; x < s.x1 - 0.1; x += step, i++) {
    const g = new THREE.BoxGeometry(0.06, Math.hypot(step, y1 - y0) * 0.98, 0.06);
    m.add(g, LOOK.yellow, atR(x + step / 2, (y0 + y1) / 2, 0.32, 0, 0, (i % 2 ? 1 : -1) * Math.atan2(step, y1 - y0)));
    m.span(x - 0.03, y0, -0.32, x + 0.03, y1, 0.32, shade(LOOK.yellow, 0.9));
  }
  // Counterweight blocks at the far end.
  m.span(s.x1 - 2.4, y0 - 1.4, -0.5, s.x1 - 0.3, y0, 0.5, "#8e949c");
  m.span(s.x1 - 2.4, y0 - 0.5, -0.52, s.x1 - 0.3, y0 - 0.38, 0.52, "#f2b134");
  lights.blob(0.11, "#ff3b30", at(s.x0 + 0.2, y1 + 0.18, 0), 1);
}

/** Builds the level's scenery. `high` adds the rooftop clutter and every window row. */
export function buildWorld(level: Level, high: boolean): World {
  const group = new THREE.Group();
  const extras: THREE.Object3D[] = [];
  const disposers: { dispose(): void }[] = [];
  const rnd = seeded(level.seed ^ (level.number * 7919));
  const lambert = paint();
  const unlit = glow({ fog: true });
  disposers.push(lambert, unlit);
  const add = (m: Mesher, mat: THREE.Material, extra = false) => {
    const mesh = m.mesh(mat);
    if (!mesh) return null;
    disposers.push(mesh.geometry);
    group.add(mesh);
    if (extra) extras.push(mesh);
    return mesh;
  };

  // ── The rooftops you run on ──
  const fore = new Mesher();
  const foreWin = new Mesher();
  const clutter = new Mesher();
  const lights = new Mesher();
  for (const s of level.solids) {
    if (s.kind === "roof") building(fore, foreWin, s, rnd, 6);
    else if (s.kind === "mast") mast(fore, s, lights);
    else craneArm(fore, s, lights);
  }
  for (const d of level.decor) {
    if (d.kind === "scaffold") scaffold(fore, d, level);
    else if (d.kind === "gate" || d.kind === "crane") decorPiece(fore, d, level.solids);
    else decorPiece(clutter, d, level.solids);
  }
  add(fore, lambert);
  add(foreWin, unlit);
  add(clutter, lambert, true);
  const beaconMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true });
  disposers.push(beaconMat);
  const beacons = add(lights, beaconMat);

  // ── The buildings behind ──
  const x0 = level.start.x - 140;
  const x1 = level.endX + 140;
  const mid = new Mesher();
  const midWin = new Mesher();
  const midTop = new Mesher();
  for (let x = x0; x < x1; ) {
    const w = 5 + rnd() * 9;
    const z = -26 - rnd() * 30;
    // Mostly below the running line's sky, so the skyline and the sky show over them.
    const top = 1 + rnd() * 11 + (rnd() < 0.18 ? 6 + rnd() * 6 : 0);
    const wall = LOOK.mid[Math.floor(rnd() * LOOK.mid.length)];
    const tint = mix(wall, LOOK.haze, 0.32);
    mid.span(x, BOTTOM - 10, z - 6, x + w, top, z, tint);
    mid.span(x - 0.15, top - 0.3, z - 6.1, x + w + 0.15, top, z + 0.15, mix(wall, "#ffffff", 0.35));
    if (rnd() < 0.3) {
      const sw = w * (0.4 + rnd() * 0.35);
      const sx = x + (w - sw) * rnd();
      const sh = 2 + rnd() * 6;
      mid.span(sx, top, z - 5, sx + sw, top + sh, z - 0.6, tint.clone().multiplyScalar(0.94));
    }
    if (rnd() < 0.25) {
      // A water tank on a stand.
      midTop.box(1.4, 1.0, 1.4, "#5a4a3f", at(x + w * 0.3, top, z - 3));
      midTop.cyl(0.9, 0.9, 1.6, 8, "#8a6a52", at(x + w * 0.3, top + 1.0, z - 3));
      midTop.cyl(0.05, 1.0, 0.6, 8, "#6a5140", at(x + w * 0.3, top + 2.6, z - 3));
    }
    if (rnd() < 0.2) midTop.box(0.12, 3 + rnd() * 3, 0.12, "#7b8190", at(x + w * 0.7, top, z - 2));
    // Windows: most lit at this hour.
    const litShare = 0.15 + rnd() * 0.25;
    const cols = Math.max(1, Math.floor((w - 1) / 1.6));
    const pad = (w - cols * 1.6) / 2;
    const rows = high ? 9 : 5;
    for (let r = 0; r < rows; r++) {
      const fy = top - 1.4 - r * 2.3;
      if (fy < -12) break;
      for (let c = 0; c < cols; c++) {
        const cx = x + pad + 1.6 * (c + 0.5);
        const lit = rnd() < litShare;
        midWin.quad(cx - 0.42, fy - 1.1, cx + 0.42, fy, z + 0.02, lit ? mix(LOOK.lit[Math.floor(rnd() * 3)], LOOK.haze, 0.2) : mix(LOOK.glass, LOOK.haze, 0.4));
      }
    }
    x += w + (rnd() < 0.5 ? 0 : rnd() * 3);
  }
  add(mid, lambert);
  add(midWin, unlit);
  add(midTop, lambert, true);

  // ── The far skyline ──
  const far = new Mesher();
  for (let x = level.start.x - 420; x < level.endX + 420; ) {
    const w = 8 + rnd() * 16;
    const z = -175 - rnd() * 60;
    const top = 16 + rnd() * 40 + (rnd() < 0.12 ? 26 : 0);
    const tint = LOOK.far[Math.floor(rnd() * LOOK.far.length)];
    far.span(x, BOTTOM - 20, z - 10, x + w, top, z, tint);
    if (rnd() < 0.35) far.span(x + w * 0.25, top, z - 8, x + w * 0.75, top + 4 + rnd() * 8, z - 2, tint);
    if (rnd() < 0.15) far.span(x + w * 0.48, top, z - 6, x + w * 0.52, top + 10 + rnd() * 10, z - 4, tint);
    x += w * (0.6 + rnd() * 0.7);
  }
  add(far, lambert);

  // ── Clouds ──
  const clouds = new THREE.Group();
  const cm = new Mesher();
  for (let x = level.start.x - 260; x < level.endX + 260; x += 50 + rnd() * 70) {
    const cy = 30 + rnd() * 22;
    const cz = -130 - rnd() * 40;
    const n = 4 + Math.floor(rnd() * 4);
    const tint = LOOK.cloud[Math.floor(rnd() * LOOK.cloud.length)];
    for (let i = 0; i < n; i++) {
      const r = 3 + rnd() * 4;
      cm.blob(r, tint, at(x + (i - n / 2) * 4.2 + rnd() * 2, cy + rnd() * 2.5 - (i === 0 || i === n - 1 ? 1.2 : 0), cz + rnd() * 3, 0, 1.3, 0.75, 1), 1);
    }
  }
  // Clouds are lit by the low sun: bright, a little warm, never grey.
  const cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color("#c9a99a") });
  disposers.push(cloudMat);
  const cloudMesh = cm.mesh(cloudMat);
  if (cloudMesh) {
    clouds.add(cloudMesh);
    disposers.push(cloudMesh.geometry);
  }
  group.add(clouds);

  for (const o of extras) o.visible = high;
  return {
    group,
    extras,
    beacons,
    clouds,
    dispose() {
      for (const d of disposers) d.dispose();
    },
  };
}

/** The sky: a gradient dome with a low sun, drawn behind everything and following the camera. */
export function skyDome(): THREE.Mesh {
  const c = (hex: string) => new THREE.Color(hex);
  const g = new THREE.SphereGeometry(1500, 24, 12);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uTop: { value: c(LOOK.skyTop) },
      uMid: { value: c(LOOK.skyMid) },
      uHorizon: { value: c(LOOK.horizon) },
      uSunColor: { value: c(LOOK.sun) },
      uSun: { value: new THREE.Vector3(0.42, 0.045, -1).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uSunColor;
      uniform vec3 uSun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(uHorizon, uMid, smoothstep(-0.02, 0.16, h));
        c = mix(c, uTop, smoothstep(0.16, 0.6, h));
        float s = max(dot(d, uSun), 0.0);
        c += uSunColor * (pow(s, 900.0) * 1.2 + pow(s, 40.0) * 0.28 + pow(s, 6.0) * 0.1);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  // The colors are written as they are (no conversion), like the hex values read.
  m.uniforms.uTop.value.convertLinearToSRGB();
  m.uniforms.uMid.value.convertLinearToSRGB();
  m.uniforms.uHorizon.value.convertLinearToSRGB();
  m.uniforms.uSunColor.value.convertLinearToSRGB();
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
