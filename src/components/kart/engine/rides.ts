/**
 * The rides (client, three.js): every kart is an everyday ride built in code
 * from simple solids (no model files), painted in the driver's colors: the
 * Shopping Cart, Golf Cart and Minivan the roll deals, and the five waiting to
 * join it (Rental Scooter, Moped, Hand-Me-Down Sedan, Ice Cream Truck, Riding
 * Mower). The sedan doubles as the parked cars round the track.
 *
 * Model space: x forward, y up, z right; one unit is one world unit. Wheels
 * are separate meshes so they spin with speed and the front ones steer; the
 * body leans in turns, squats on a boost and bounces on landing. The driver is
 * a camera-facing picture (head and shoulders) on a block in the kart's color.
 * Every driver's head tops out near 25 units, so it stays on screen under the
 * landscape chase camera.
 */

import * as THREE from "three";
import type { RideId, WheelId } from "@/lib/kart/content";
import { Character, CHARACTER_SIZE, type CharacterArt, type CharacterGrip } from "@/components/games3d/character";
import { DRIVER_H, DRIVER_UNITS, DRIVER_W } from "./avatars";
import { atR, Mesher, mix } from "./mesher";

const TIRE = "#23262d";
const STEEL = "#c3c9d2";
const DARK = "#2f3440";
const GLASS = "#2e4157";
const WHITE = "#f6f5f1";
const LIGHT = "#fff2c2";
const TAIL = "#e5533c";

export interface WheelSpot {
  x: number;
  z: number;
  front: boolean;
}

export interface RideParts {
  /** The body (and the driver's block), vertex-colored. */
  body: THREE.BufferGeometry;
  /** The shopping cart's wire basket (textured, see-through). */
  wire: THREE.BufferGeometry | null;
  wheel: THREE.BufferGeometry;
  wheels: WheelSpot[];
  /** Wheel radius. */
  r: number;
  /** Where the bottom of the driver's picture sits. */
  seat: THREE.Vector3;
  /** Where the boost flame comes out. */
  exhaust: THREE.Vector3;
  /** Two wheels (leans into turns). */
  bike: boolean;
  /** Where a 3D driver (development's ?look=) sits and holds on; null for parked cars. */
  figure: FigureSpot | null;
}

/** A 3D driver's place in a ride (model space): hips, the floor under the feet, how it sits and what it holds. */
export interface FigureSpot {
  hip: THREE.Vector3;
  floor: number;
  pose: "seated" | "stand";
  /** Forward lean (radians), for rides you reach forward on. */
  hunch: number;
  grip: CharacterGrip;
}

interface WheelSpec { r: number; w: number; hub: "steel" | "tone" | "white" }
const WHEEL_SPECS: Record<WheelId, WheelSpec> = {
  chunky: { r: 3.9, w: 3.8, hub: "steel" },
  slim: { r: 3.9, w: 2, hub: "tone" },
  small: { r: 3.1, w: 2.6, hub: "white" },
};

/** A box centered on (x, y, z) (not sitting on its base), turned by rx, ry, rz. */
function B(m: Mesher, w: number, h: number, d: number, color: string | THREE.Color, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  m.add(new THREE.BoxGeometry(w, h, d), color, atR(x, y, z, rx, ry, rz));
}

/** A cylinder along z (axles, bars), centered. */
function barZ(m: Mesher, r: number, len: number, color: string, x: number, y: number, z: number, sides = 8) {
  const g = new THREE.CylinderGeometry(r, r, len, sides);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  m.add(g, color);
}

/** A thin rod between two points. */
function strut(m: Mesher, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, color: string) {
  const d = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const mtx = new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, new THREE.Vector3(1, 1, 1));
  m.add(new THREE.CylinderGeometry(r, r, len, 6), color, mtx);
}

/** A side outline (x forward, y up) extruded across the ride's width, edges rounded a little. */
function shell(m: Mesher, outline: [number, number][], width: number, color: string | THREE.Color, bevel = 0.8) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = Math.max(0.1, width - bevel * 2);
  // The bevel is offset inward, so the outline's size is the ride's size.
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelOffset: -bevel * 0.8, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  m.add(g, color);
}

function wheelGeometry(spec: WheelSpec, tone: string): THREE.BufferGeometry {
  const m = new Mesher();
  const tire = new THREE.CylinderGeometry(spec.r, spec.r, spec.w, 14);
  tire.rotateX(Math.PI / 2);
  m.add(tire, TIRE);
  const hubColor = spec.hub === "steel" ? STEEL : spec.hub === "white" ? WHITE : tone;
  const hub = new THREE.CylinderGeometry(spec.r * 0.56, spec.r * 0.56, spec.w + 0.3, 10);
  hub.rotateX(Math.PI / 2);
  m.add(hub, hubColor);
  // Spokes, so you can see the wheel turn.
  for (const a of [0, Math.PI / 2]) m.add(new THREE.BoxGeometry(spec.r * 1.02, spec.r * 0.2, spec.w + 0.5), mix(hubColor, "#000000", 0.35), atR(0, 0, 0, 0, 0, a));
  return m.build();
}

/** The driver's block (a torso in the kart's color) sitting at `seat`, the picture's bottom just above it. */
function torso(m: Mesher, tone: [string, string], x: number, y0: number, y1: number, w = 8.4, d = 6) {
  B(m, d, y1 - y0, w, tone[0], x, (y0 + y1) / 2, 0);
  B(m, d * 0.7, 1.2, w * 0.55, tone[1], x + 0.6, y1 - 0.3, 0);
}

export interface RideOptions {
  /** A roof on the sedan (parked cars). */
  roof?: boolean;
  /** No driver block (parked cars). */
  parked?: boolean;
  /** A 3D driver rides it (development's ?look=): no driver block; the golf cart's wheel moves to the middle and the sedan gets one. */
  figure?: boolean;
}

/** The parts of a ride in a paint (deep and bright) and on a set of wheels. */
export function rideParts(id: RideId, wheels: WheelId, tone: [string, string], opts: RideOptions = {}): RideParts {
  const spec = WHEEL_SPECS[wheels] ?? WHEEL_SPECS.chunky;
  const r = spec.r;
  const [deep, bright] = tone;
  const m = new Mesher();
  let wire: THREE.BufferGeometry | null = null;
  let spots: WheelSpot[] = [];
  let seat = new THREE.Vector3(-2, 12, 0);
  let exhaust = new THREE.Vector3(-14, 4, 0);
  let bike = false;
  let figure: FigureSpot | null = null;
  const fig = !!opts.figure;
  const spot = (hip: [number, number, number], floor: number, grip: CharacterGrip, pose: "seated" | "stand" = "seated", hunch = 0): FigureSpot => ({ hip: new THREE.Vector3(...hip), floor, pose, hunch, grip });
  const four = (x: number, z: number): WheelSpot[] => [
    { x, z, front: true },
    { x, z: -z, front: true },
    { x: -x, z, front: false },
    { x: -x, z: -z, front: false },
  ];

  switch (id) {
    case "round": {
      // Shopping Cart: a wire basket on a frame, a plastic handle, corner bumpers and a pennant.
      spots = four(7.6, 6.8);
      // Low and short, so the handle and back wall stay under the driver's chin from the chase camera.
      const y0 = 2 * r + 0.5;
      const y1 = y0 + 6.6;
      const rail = 2 * r + 0.1;
      for (const z of [-5.4, 5.4]) B(m, 22, 1, 1.1, STEEL, -0.5, rail, z);
      for (const x of [-9, 0, 9]) B(m, 1.1, 1, 11.9, STEEL, x, rail, 0);
      for (const s of spots) B(m, 1.4, rail - r, 1.4, DARK, s.x, r + (rail - r) / 2, s.z * 0.82);
      // The basket's rims (top and bottom) and corner posts.
      const bot = { x0: -9, x1: 9, z: 6.2 };
      const top = { x0: -12, x1: 11, z: 8.2 };
      for (const z of [-1, 1]) {
        B(m, top.x1 - top.x0, 0.9, 0.9, STEEL, (top.x0 + top.x1) / 2, y1, z * top.z);
        B(m, bot.x1 - bot.x0, 0.7, 0.7, STEEL, 0, y0, z * bot.z);
      }
      for (const x of [top.x0, top.x1]) B(m, 0.9, 0.9, top.z * 2, STEEL, x, y1, 0);
      for (const [bx, tx] of [[bot.x0, top.x0], [bot.x1, top.x1]]) {
        for (const z of [-1, 1]) strut(m, bx, y0, bot.z * z, tx, y1, top.z * z, 0.45, STEEL);
      }
      // The wire walls and floor (see-through).
      {
        const q: number[] = [];
        const uv: number[] = [];
        const P = (x: number, y: number, z: number) => [x, y, z];
        const quad = (a: number[], b: number[], c: number[], d: number[], u: number, v: number) => {
          q.push(...a, ...b, ...c, ...a, ...c, ...d);
          uv.push(0, 0, u, 0, u, v, 0, 0, u, v, 0, v);
        };
        const s = 6.5;
        const hv = (y1 - y0) / s;
        quad(P(bot.x0, y0, -bot.z), P(bot.x1, y0, -bot.z), P(top.x1, y1, -top.z), P(top.x0, y1, -top.z), 22 / s, hv);
        quad(P(bot.x1, y0, bot.z), P(bot.x0, y0, bot.z), P(top.x0, y1, top.z), P(top.x1, y1, top.z), 22 / s, hv);
        quad(P(bot.x1, y0, -bot.z), P(bot.x1, y0, bot.z), P(top.x1, y1, top.z), P(top.x1, y1, -top.z), 16 / s, hv);
        quad(P(bot.x0, y0, bot.z), P(bot.x0, y0, -bot.z), P(top.x0, y1, -top.z), P(top.x0, y1, top.z), 16 / s, hv);
        quad(P(bot.x0, y0, -bot.z), P(bot.x0, y0, bot.z), P(bot.x1, y0, bot.z), P(bot.x1, y0, -bot.z), 12 / s, 18 / s);
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(q, 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        g.computeVertexNormals();
        wire = g;
      }
      // The handle (the driver's color), its arms, bumpers on the front corners, a plate.
      barZ(m, 0.95, 18.5, bright, top.x0 - 2.6, y1 + 0.6, 0, 10);
      for (const z of [-7.6, 7.6]) B(m, 3, 0.8, 0.8, STEEL, top.x0 - 1.3, y1 + 0.3, z, 0, 0, -0.25);
      for (const z of [-1, 1]) B(m, 2.2, 2.2, 2.2, bright, top.x1, y1, z * top.z);
      B(m, 1, 3.6, 9, bright, top.x1 + 0.2, y0 + 3.6, 0, 0, 0, -0.2);
      // A pennant on a pole at the back corner.
      B(m, 0.5, 17, 0.5, STEEL, top.x0 + 0.4, y1 + 8.5, top.z - 0.4);
      m.prism([[0, 0], [0, 5.2], [-8, 2.6]], 0.3, bright, atR(top.x0 + 0.4, y1 + 11.5, top.z - 0.4, 0, 0, 0));
      if (!fig) torso(m, tone, -1.5, y0, y1 - 1.2, 8, 5.6);
      seat = new THREE.Vector3(-1.5, y1 - 1.8, 0);
      // Sitting in the basket, holding its sides.
      figure = spot([-1.5, y0 + 1.8, 0], y0 + 0.35, { kind: "rail", center: [0.4, y1 + 0.5, 0], half: 7.7 });
      exhaust = new THREE.Vector3(top.x0 - 2, y0, 0);
      break;
    }

    case "low": {
      // Golf Cart: a cream tub, a painted nose, a bench seat, a golf bag and a sunshade.
      spots = four(8, 7);
      const base = r + 0.5;
      B(m, 22, 2.2, 11.5, DARK, 0, r + 0.2, 0);
      B(m, 22.5, 4.4, 14.5, WHITE, -0.5, base + 2.2, 0);
      shell(m, [[3.6, base], [12.4, base], [12.8, base + 3], [11.2, base + 5.6], [4.6, base + 8.2], [3.4, base + 8.2]], 14, bright, 0.7);
      B(m, 0.8, 1.6, 12.5, DARK, 12.6, base + 1, 0);
      for (const z of [-4.5, 4.5]) B(m, 0.6, 1.4, 2.6, LIGHT, 12.4, base + 3.2, z);
      // Steering wheel on its column (in the middle when a 3D driver holds it).
      const wz = fig ? 0 : 2.6;
      B(m, 0.8, 4.5, 0.8, DARK, 3.1, base + 8.8, wz, 0, 0, 0.5);
      const wheel = new THREE.TorusGeometry(2.1, 0.45, 5, 10);
      wheel.rotateY(Math.PI / 2);
      wheel.rotateZ(0.5);
      wheel.translate(1.6, base + 11, wz);
      m.add(wheel, DARK);
      // The bench: cushion and back, in the driver's color.
      B(m, 7, 2.2, 13.2, deep, -3.6, base + 5.4, 0);
      B(m, 1.6, 4.2, 13.2, deep, -7.5, base + 7.3, 0, 0, 0, 0.12);
      B(m, 1.7, 0.8, 13.4, WHITE, -7.75, base + 9.4, 0, 0, 0, 0.12);
      // Bag rack and a golf bag.
      B(m, 4, 1, 12, DARK, -11, base + 4.2, 0);
      // A golf bag (slim, club heads showing) leaning on the rack, all of it under the driver's chin from behind.
      const lean = 0.5;
      const bag = new THREE.CylinderGeometry(1.35, 1.5, 5.4, 8);
      bag.rotateZ(lean);
      bag.translate(-11.4, base + 6.4, 4.6);
      m.add(bag, bright);
      const band = new THREE.CylinderGeometry(1.55, 1.55, 0.8, 8);
      band.rotateZ(lean);
      band.translate(-12.2, base + 7.8, 4.6);
      m.add(band, WHITE);
      for (const [dz, dy] of [[-0.6, 0], [0.5, 0.35], [0, 0.7]]) B(m, 1.3, 0.7, 0.9, DARK, -13.2, base + 9.1 + dy, 4.6 + dz, 0, 0, lean);
      // A sunshade over the front, held on two posts (clear of the driver's head).
      for (const z of [-6.2, 6.2]) B(m, 0.7, 26.6 - base - 8, 0.7, DARK, 5.6, base + 8 + (26.6 - base - 8) / 2, z);
      B(m, 13.5, 1.1, 15.4, bright, 5, 27.1, 0);
      B(m, 13.9, 0.5, 15.8, WHITE, 5, 26.4, 0);
      if (!fig) torso(m, tone, -3.6, base + 6.5, base + 8.6);
      seat = new THREE.Vector3(-3.8, base + 8, 0);
      figure = spot([-3.0, base + 7.0, 0], base + 4.4, { kind: "wheel", center: [1.6, base + 11, 0], radius: 2.1, tilt: 0.5 });
      exhaust = new THREE.Vector3(-12.6, base + 1, 0);
      break;
    }

    case "box": {
      // Minivan: a chunky van in the driver's color, glass all round, the driver up through the sunroof.
      spots = four(8.6, 7.7);
      const yb = r * 0.55;
      const roof = 12.2;
      shell(m, [[-13.4, yb], [13.6, yb], [14.2, 6.6], [9.6, 7.6], [4.4, roof], [-11.6, roof], [-13.5, roof - 1.6]], 15.2, bright, 0.9);
      // Glass: side windows, windshield, rear window.
      for (const z of [-7.62, 7.62]) {
        B(m, 14, 3.4, 0.3, GLASS, -3.8, 9.7, z);
        B(m, 1.2, 3.6, 0.36, bright, -4.2, 9.7, z);
        B(m, 24, 1.1, 0.3, deep, 0.2, 6.2, z);
      }
      const ang = Math.atan2(roof - 7.6, 4.4 - 9.6);
      B(m, Math.hypot(5.2, roof - 7.6) - 0.6, 0.35, 12.4, GLASS, 7 + 0.18, (7.6 + roof) / 2 + 0.22, 0, 0, 0, ang);
      B(m, 0.3, 3.4, 11.6, GLASS, -13.62, 9.4, 0, 0, 0, -0.08);
      // Lights, plate, bumpers and a step.
      for (const z of [-5.2, 5.2]) {
        B(m, 0.5, 1.6, 2.8, LIGHT, 14.25, 5.6, z);
        B(m, 0.4, 2.8, 1.5, TAIL, -13.55, 7.4, z * 1.2);
      }
      B(m, 0.3, 1.5, 4.2, WHITE, -13.6, 4.6, 0);
      B(m, 1.2, 2, 15.4, DARK, 14.2, yb + 1.1, 0);
      B(m, 1.4, 2, 15.4, DARK, -13.8, yb + 1.1, 0);
      // Roof rails and the sunroof's frame.
      for (const z of [-5.6, 5.6]) B(m, 13.6, 0.6, 0.7, DARK, -3.4, roof + 0.5, z);
      B(m, 8.4, 0.7, 9.6, DARK, -2.4, roof + 0.3, 0);
      if (!fig) torso(m, tone, -2.4, roof - 1, roof + 1.4);
      seat = new THREE.Vector3(-2.4, roof + 0.8, 0);
      // Up through the sunroof, hands on its front edge.
      figure = spot([-2.4, roof - 1.0, 0], roof - 8, { kind: "rail", center: [1.3, roof + 0.95, 0], half: 3.5 });
      exhaust = new THREE.Vector3(-14, yb + 1, 4.2);
      break;
    }

    case "sedan": {
      // Hand-Me-Down Sedan: an old family car (roof cut off when you drive it), one door a different color.
      spots = four(10.6, 7.3);
      const yb = r * 0.5;
      const belt = 7.4;
      const paint = opts.parked ? bright : mix(deep, "#8f8a80", 0.25).getStyle();
      shell(m, [[-16.6, yb], [16.8, yb], [17.2, 5.6], [16, belt], [-15.6, belt], [-16.9, 5.8]], 14.6, paint, 0.9);
      B(m, 1, 1.9, 14.8, "#8b9099", 17.3, yb + 1, 0);
      B(m, 1, 1.9, 14.8, "#8b9099", -16.9, yb + 1, 0);
      for (const z of [-5, 5]) {
        B(m, 0.5, 1.4, 2.8, LIGHT, 17.2, 5.4, z);
        B(m, 0.4, 1.6, 2.4, TAIL, -16.95, 5.8, z);
      }
      if (opts.roof) {
        // The cabin: glass between thin pillars.
        shell(m, [[-7.4, belt], [7.2, belt], [3.6, belt + 5.2], [-5.4, belt + 5.2]], 13.2, paint, 0.6);
        for (const z of [-6.62, 6.62]) B(m, 11.2, 3.6, 0.3, GLASS, -0.6, belt + 2.5, z);
        B(m, 0.3, 3.8, 11.2, GLASS, 5.5, belt + 2.6, 0, 0, 0, 0.95);
        B(m, 0.3, 3.8, 11.2, GLASS, -6.5, belt + 2.6, 0, 0, 0, -0.85);
      } else {
        // Roof cut off: a windshield frame, seats and the mismatched door.
        B(m, 0.6, 5, 13.4, DARK, 6.2, belt + 2.4, 0, 0, 0, 0.45);
        B(m, 0.3, 4.2, 12, GLASS, 6.6, belt + 2.2, 0, 0, 0, 0.45);
        B(m, 6.5, 2.6, 12.6, DARK, -2, belt - 0.6, 0);
        B(m, 1.4, 4.6, 12.6, DARK, -5.6, belt + 1.2, 0, 0, 0, 0.12);
        B(m, 9, 4.6, 0.3, "#9aa1ad", -1.5, 4.9, 7.42);
        if (!fig) torso(m, tone, -2, belt, belt + 2.6);
        else {
          // A steering wheel for the 3D driver.
          B(m, 0.8, 4, 0.8, DARK, 4.6, belt + 1.8, 0, 0, 0, 0.6);
          const wheel = new THREE.TorusGeometry(2.0, 0.42, 5, 10);
          wheel.rotateY(Math.PI / 2);
          wheel.rotateZ(0.6);
          wheel.translate(3.4, belt + 3.6, 0);
          m.add(wheel, DARK);
        }
        seat = new THREE.Vector3(-2, belt + 2, 0);
        figure = spot([-2.4, belt + 1.4, 0], belt - 3, { kind: "wheel", center: [3.4, belt + 3.6, 0], radius: 2.0, tilt: 0.6 });
      }
      exhaust = new THREE.Vector3(-17, yb + 0.8, 4.6);
      break;
    }

    case "icecream": {
      // Ice Cream Truck: a white box with a cab, stripes, a serving hatch and a giant cone on top.
      spots = four(10, 7.8);
      const yb = r * 0.55;
      const top = 12.4;
      shell(m, [[-15.4, yb], [15.6, yb], [16, 6], [12.6, 7.4], [9.4, 11.2], [6.6, 11.2], [6.6, top], [-15.4, top]], 15.4, WHITE, 0.8);
      for (const z of [-7.7, 7.7]) {
        B(m, 21, 1.4, 0.3, bright, -4.6, 4.2, z);
        B(m, 21, 0.7, 0.3, deep, -4.6, 5.6, z);
      }
      B(m, 3.4, 3, 0.3, GLASS, 9.3, 8.4, 7.72);
      B(m, 3.4, 3, 0.3, GLASS, 9.3, 8.4, -7.72);
      B(m, 0.3, 3, 12, GLASS, 11, 9.2, 0, 0, 0, 0.9);
      // The serving hatch on the right side, with a striped awning.
      B(m, 10, 4.2, 0.3, DARK, -5, 9, 7.75);
      for (let k = 0; k < 5; k++) B(m, 2.2, 0.5, 3.2, k % 2 ? WHITE : bright, -9 + k * 2.2, 11.6, 9, 0.35, 0, 0);
      // The cone on the cab roof.
      const cone = new THREE.ConeGeometry(2.4, 7, 8);
      cone.rotateX(Math.PI);
      cone.translate(10, 11.2 + 3.5, 0);
      m.add(cone, "#d9a35b");
      m.blob(3.2, "#f3a6c8", atR(10, 11.2 + 7.6, 0, 0, 0.4, 0), 1);
      m.blob(1.1, "#d6324f", atR(10, 11.2 + 10.8, 0, 0, 0, 0), 0);
      for (const z of [-5, 5]) {
        B(m, 0.5, 1.4, 2.6, LIGHT, 16, 5.2, z);
        B(m, 0.4, 2.4, 1.4, TAIL, -15.55, 7.6, z * 1.2);
      }
      B(m, 1.1, 1.9, 15.4, DARK, 16, yb + 1, 0);
      B(m, 8.4, 0.7, 9.6, DARK, -5.4, top + 0.3, 0);
      if (!fig) torso(m, tone, -5.4, top - 1, top + 1.2);
      seat = new THREE.Vector3(-5.4, top + 0.6, 0);
      figure = spot([-5.4, top - 1.0, 0], top - 8, { kind: "rail", center: [-1.6, top + 0.95, 0], half: 3.6 });
      exhaust = new THREE.Vector3(-15.8, yb + 1, -4.4);
      break;
    }

    case "mower": {
      // Riding Mower: a painted hood, a cutting deck under the middle, a high-back seat.
      spots = four(7.6, 6.6);
      B(m, 19, 1.8, 10, DARK, 0, r + 0.3, 0);
      B(m, 12, 2.2, 15.6, deep, 0.6, r - 0.6, 0);
      shell(m, [[1.6, r + 1], [11.4, r + 1], [11.8, r + 4.4], [9.4, r + 6.4], [1.6, r + 6.4]], 11, bright, 0.8);
      B(m, 0.4, 1.4, 6, DARK, 11.8, r + 3, 0);
      B(m, 0.8, 4, 0.8, DARK, 1.2, r + 8, 0, 0, 0, 0.45);
      const wheel = new THREE.TorusGeometry(1.9, 0.42, 5, 10);
      wheel.rotateY(Math.PI / 2);
      wheel.rotateZ(0.45);
      wheel.translate(0, r + 10.2, 0);
      m.add(wheel, DARK);
      B(m, 9, 1.4, 11, bright, -4.6, r + 2.6, 0);
      B(m, 6, 1.8, 9, DARK, -4.4, r + 4.2, 0);
      B(m, 1.5, 6.4, 9, DARK, -7.6, r + 7.6, 0, 0, 0, 0.14);
      B(m, 2.2, 3.2, 2.2, "#8b9099", -9.6, r + 4.2, 4.4);
      if (!fig) torso(m, tone, -4.2, r + 5.1, r + 7.8);
      seat = new THREE.Vector3(-4.2, r + 7.2, 0);
      figure = spot([-4.0, r + 5.9, 0], r + 3.3, { kind: "wheel", center: [0, r + 10.2, 0], radius: 1.9, tilt: 0.45 });
      exhaust = new THREE.Vector3(-9.6, r + 6, 4.4);
      break;
    }

    case "moped": {
      // Moped: two wheels, a leg shield and a top box.
      bike = true;
      spots = [
        { x: 9, z: 0, front: true },
        { x: -8, z: 0, front: false },
      ];
      B(m, 14, 1.2, 5.4, DARK, 0.5, r + 0.6, 0);
      shell(m, [[-10.6, r + 0.2], [-0.6, r + 0.2], [-0.6, r + 3.6], [-3, r + 6.6], [-11.4, r + 6.6], [-12, r + 3.6]], 6.6, bright, 0.8);
      B(m, 1.6, 12, 7, bright, 6.4, r + 6, 0, 0, 0, -0.18);
      B(m, 0.8, 7, 0.8, STEEL, 8.6, r + 7, 0, 0, 0, -0.32);
      B(m, 1.2, 1.2, 10, DARK, 7.2, r + 12.4, 0);
      B(m, 1, 2, 3, LIGHT, 8.4, r + 10.4, 0);
      B(m, 8, 1.6, 5.8, DARK, -5.4, r + 7.2, 0);
      B(m, 5.6, 4.6, 7, deep, -11, r + 9.6, 0);
      if (!fig) torso(m, tone, -4.6, r + 8, r + 10.4, 7.6, 5.4);
      seat = new THREE.Vector3(-4.6, r + 9.8, 0);
      figure = spot([-0.6, r + 8.8, 0], r + 1.2, { kind: "bar", center: [7.2, r + 12.4, 0], half: 4.2 }, "seated", 0.4);
      exhaust = new THREE.Vector3(-10.4, r + 1.6, 3);
      break;
    }

    case "scooter":
    default: {
      // Rental Scooter: a deck, a tall stem with a plate, two small wheels; you stand on it.
      bike = true;
      spots = [
        { x: 7.6, z: 0, front: true },
        { x: -7.2, z: 0, front: false },
      ];
      B(m, 15, 1.4, 5, bright, 0, r * 0.75 + 0.9, 0);
      B(m, 2, 0.8, 4.4, DARK, -7.6, r * 1.3, 0);
      B(m, 1.1, 15.4, 1.1, STEEL, 6.6, r + 7.6, 0, 0, 0, -0.16);
      B(m, 1, 1, 11, DARK, 7.6, r + 15.2, 0);
      B(m, 0.5, 3.6, 3.4, bright, 7.7, r + 9.2, 0, 0, 0, -0.16);
      B(m, 0.8, 1.6, 2.2, LIGHT, 7.9, r + 12, 0);
      if (!fig) torso(m, tone, -0.6, r * 0.75 + 1.6, r * 0.75 + 9.6, 6.6, 4.6);
      seat = new THREE.Vector3(-0.6, r * 0.75 + 9, 0);
      // Standing on the deck, reaching for the bar.
      figure = spot([1.6, r * 0.75 + 1.6 + CHARACTER_SIZE.standHip, 0], r * 0.75 + 1.6, { kind: "bar", center: [7.6, r + 15.2, 0], half: 4.6 }, "stand", 0.3);
      exhaust = new THREE.Vector3(-8.4, r * 0.8, 0);
      break;
    }
  }

  if (opts.parked) {
    seat = new THREE.Vector3(-2, 0, 0);
    figure = null;
  }
  return { body: m.build(), wire, wheel: wheelGeometry(spec, bright), wheels: spots, r, seat, exhaust, bike, figure };
}

/** A parked car (the sedan with its roof on, plain wheels): one static geometry for the town. */
export function parkedCar(color: string): THREE.BufferGeometry {
  const p = rideParts("sedan", "slim", [color, color], { roof: true, parked: true });
  const m = new Mesher();
  m.add(p.body, null, undefined, true);
  const wheel = new THREE.CylinderGeometry(p.r, p.r, 2.2, 8);
  wheel.rotateX(Math.PI / 2);
  for (const s of p.wheels) m.add(wheel.clone(), TIRE, atR(s.x, p.r, s.z * 1.02, 0, 0, 0));
  wheel.dispose();
  p.wheel.dispose();
  return m.build();
}

/** A ride as one static geometry, wheels included. */
export function buildRideGeometry(id: RideId, wheels: WheelId, tone: [string, string], opts: RideOptions = {}): THREE.BufferGeometry {
  const p = rideParts(id, wheels, tone, opts);
  const m = new Mesher();
  m.add(p.body, null, undefined, true);
  for (const s of p.wheels) m.add(p.wheel.clone(), null, atR(s.x, p.r, s.z, 0, 0, 0), true);
  p.wheel.dispose();
  p.wire?.dispose();
  return m.build();
}

export interface RidePose {
  x: number;
  y: number;
  z: number;
  h: number;
  steer: number;
  speed: number;
}

export interface RideFx {
  boost: number;
  drift: number;
  grounded: boolean;
}

/**
 * One ride in the scene: its body, wheels, driver and boost flame, posed each
 * frame. A ghost draws see-through: a depth-only pass first, then the color,
 * so only its nearest surface shows.
 */
export class RideModel {
  readonly root = new THREE.Group();
  readonly parts: RideParts;
  private body = new THREE.Group();
  private wheels: { pivot: THREE.Group; mesh: THREE.Mesh; r: number; front: boolean }[] = [];
  private sprite: THREE.Sprite | null = null;
  /** A 3D driver (development's ?look=) in place of the picture. */
  private figure: Character | null = null;
  private flame: THREE.Group | null = null;
  private blob: THREE.Mesh;
  /** Meshes that cast shadow-map shadows (none for a ghost). */
  private casters: THREE.Mesh[] = [];
  private owned: { dispose(): void }[] = [];
  private roll = 0;
  private lean = 0;
  private pitch = 0;
  private bob = 0;
  private bobV = 0;
  private t = 0;

  constructor(parts: RideParts, driver: THREE.Texture | null, opts: { ghost?: boolean; wire: THREE.Texture | null; flame?: boolean; character?: CharacterArt | null }) {
    this.parts = parts;
    const ghost = !!opts.ghost;
    this.root.add(this.body);
    const paint = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.owned.push(parts.body, parts.wheel, paint);
    const meshes: THREE.Mesh[] = [];
    const body = new THREE.Mesh(parts.body, paint);
    this.body.add(body);
    meshes.push(body);
    if (parts.wire) {
      const wireMat = new THREE.MeshLambertMaterial({ color: STEEL, map: opts.wire, alphaTest: 0.5, side: THREE.DoubleSide });
      const wire = new THREE.Mesh(parts.wire, wireMat);
      this.body.add(wire);
      meshes.push(wire);
      this.owned.push(parts.wire, wireMat);
    }
    for (const s of parts.wheels) {
      const pivot = new THREE.Group();
      pivot.position.set(s.x, parts.r, s.z);
      const mesh = new THREE.Mesh(parts.wheel, paint);
      pivot.add(mesh);
      this.root.add(pivot);
      this.wheels.push({ pivot, mesh, r: parts.r, front: s.front });
      meshes.push(mesh);
    }
    if (opts.character && parts.figure) {
      const spot = parts.figure;
      const fig = new Character(opts.character, { ghost });
      fig.root.position.copy(spot.hip);
      fig.setPose(spot.pose, { floor: spot.floor - spot.hip.y, hunch: spot.hunch });
      const g = spot.grip;
      const c: [number, number, number] = [g.center[0] - spot.hip.x, g.center[1] - spot.hip.y, g.center[2] - spot.hip.z];
      fig.setGrip({ ...g, center: c });
      this.body.add(fig.root);
      this.figure = fig;
    } else if (driver) {
      const mat = new THREE.SpriteMaterial({ map: driver, transparent: true, alphaTest: 0.05, opacity: ghost ? 0.5 : 1, depthWrite: !ghost });
      const sprite = new THREE.Sprite(mat);
      sprite.center.set(0.5, 0);
      sprite.scale.set((DRIVER_UNITS * DRIVER_W) / DRIVER_H, DRIVER_UNITS, 1);
      sprite.position.copy(parts.seat);
      if (ghost) sprite.renderOrder = 12;
      this.body.add(sprite);
      this.sprite = sprite;
      this.owned.push(mat);
    }
    if (opts.flame && !ghost) {
      const g = new THREE.Group();
      const outerGeo = new THREE.ConeGeometry(1.9, 8, 8, 1, true);
      outerGeo.rotateZ(Math.PI / 2);
      outerGeo.translate(-4, 0, 0);
      const innerGeo = new THREE.ConeGeometry(1.1, 5, 8, 1, true);
      innerGeo.rotateZ(Math.PI / 2);
      innerGeo.translate(-2.5, 0, 0);
      const outerMat = new THREE.MeshBasicMaterial({ color: "#ff8a1c", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const innerMat = new THREE.MeshBasicMaterial({ color: "#fff1a8", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const outer = new THREE.Mesh(outerGeo, outerMat);
      const inner = new THREE.Mesh(innerGeo, innerMat);
      outer.renderOrder = inner.renderOrder = 21;
      g.add(outer, inner);
      g.position.copy(parts.exhaust);
      g.visible = false;
      this.body.add(g);
      this.flame = g;
      this.owned.push(outerGeo, innerGeo, outerMat, innerMat);
    }
    // A soft spot of shade, used when the shadow map is off (low quality).
    const blobGeo = new THREE.CircleGeometry(12, 20);
    blobGeo.rotateX(-Math.PI / 2);
    const blobMat = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: ghost ? 0.12 : 0.26, depthWrite: false });
    this.blob = new THREE.Mesh(blobGeo, blobMat);
    this.blob.visible = false;
    this.blob.renderOrder = 2;
    this.root.add(this.blob);
    this.owned.push(blobGeo, blobMat);

    if (ghost) {
      const ghostPaint = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false });
      const depth = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
      this.owned.push(ghostPaint, depth);
      for (const mesh of meshes) {
        const wired = mesh.geometry === parts.wire;
        const d = new THREE.Mesh(mesh.geometry, wired ? new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, map: opts.wire, alphaTest: 0.5, side: THREE.DoubleSide }) : depth);
        d.renderOrder = 10;
        // A child, so it turns with the mesh (wheels spin).
        mesh.add(d);
        if (wired) {
          const gm = (mesh.material as THREE.MeshLambertMaterial).clone();
          gm.transparent = true;
          gm.opacity = 0.42;
          gm.depthWrite = false;
          mesh.material = gm;
          this.owned.push(gm, d.material as THREE.Material);
        } else mesh.material = ghostPaint;
        mesh.renderOrder = 11;
      }
    } else {
      for (const mesh of meshes) mesh.castShadow = true;
      this.casters = meshes;
    }
  }

  /** Shadow-map shadows on (the blob hides) or off (the blob shows). */
  setShadows(on: boolean): void {
    for (const mesh of this.casters) mesh.castShadow = on;
    this.figure?.setShadows(on);
    this.blob.visible = !on;
  }

  /** The camera a 3D driver's cutout turns toward. */
  setViewer(camera: THREE.Camera | null): void {
    this.figure?.setViewer(camera);
  }

  /** A landing: the body dips and springs back. */
  land(speed: number): void {
    this.bobV -= Math.min(speed, 260) * 0.014;
    this.figure?.jolt(speed);
  }

  update(p: RidePose, dt: number, fx: RideFx, groundY: number, motion = true): void {
    this.t += dt;
    this.root.position.set(p.x, p.z + groundY, p.y);
    this.root.rotation.y = -p.h;
    this.roll += p.speed * dt;
    const steerAngle = -p.steer * 0.42;
    for (const w of this.wheels) {
      w.mesh.rotation.z = -this.roll / w.r;
      w.pivot.rotation.y = w.front ? steerAngle : 0;
    }
    const fast = Math.min(1, Math.abs(p.speed) / 160);
    // Cars lean out of a turn, two-wheelers into it; a drift leans a bit more.
    let leanTo = this.parts.bike ? p.steer * 0.32 * fast : -p.steer * 0.075 * fast;
    if (fx.drift) leanTo += (this.parts.bike ? 0.12 : -0.045) * fx.drift;
    const boosting = fx.boost > 0;
    const pitchTo = boosting ? 0.05 : 0;
    const k = motion ? 1 : 0;
    if (dt > 0) {
      this.lean += (leanTo * k - this.lean) * (1 - Math.exp(-8 * dt));
      this.pitch += (pitchTo * k - this.pitch) * (1 - Math.exp(-6 * dt));
      this.bobV += (-190 * this.bob - 13 * this.bobV) * dt;
      this.bob += this.bobV * dt;
      if (!motion) this.bob = this.bobV = 0;
    }
    this.body.rotation.set(this.lean, 0, this.pitch);
    this.body.position.y = this.bob - (boosting ? 0.35 * k : 0);
    if (this.flame) {
      this.flame.visible = boosting;
      if (boosting) {
        const f = Math.min(1, fx.boost / 0.35);
        const flick = 0.82 + 0.18 * Math.sin(this.t * 61) * Math.sin(this.t * 23);
        this.flame.scale.set(f * flick * 1.15, 0.8 + 0.2 * f, 0.8 + 0.2 * f);
      }
    }
    this.blob.position.y = -p.z + 0.06;
    // Standing riders (the scooter) don't run; speed only bounces a seated one.
    this.figure?.update(dt, { steer: p.steer, speed: this.parts.figure?.pose === "stand" ? 0 : p.speed, motion });
  }

  dispose(): void {
    this.figure?.dispose();
    for (const o of this.owned) o.dispose();
    this.root.removeFromParent();
  }
}
