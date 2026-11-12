/**
 * Shuffle Kart's race loop (client). The physics runs at a fixed 60 steps a
 * second (src/lib/kart), separate from drawing: each animation frame runs
 * however many steps have come due, then draws the in-between pose, so the
 * race is the same on a 60, 90 or 120 Hz screen.
 *
 * Drawing is one three.js scene (world.ts, rides.ts, fx.ts): a bright,
 * low-poly suburb under a warm sun with one shadow-casting light whose small
 * shadow box follows you, a sky dome and soft distance fog. This module is
 * only ever loaded with a dynamic import, so three.js stays out of every other
 * page's bundle.
 *
 * Quality: "high" (shadows, every prop, pixel ratio up to 2), "low" (no
 * shadows, fewer props, pixel ratio up to 1.25) or "auto", which starts high
 * and drops to low if the first seconds run under ~45 frames a second (or to
 * a 1.5 pixel ratio if they run a little slow).
 */

import * as THREE from "three";
import { autopilot } from "@/lib/kart/autopilot";
import { ghostPose, loadGhost, makeGhost, type Ghost, type GhostData, type GhostPose } from "@/lib/kart/ghost";
import { TRACK_LOOK, TRACKS, type RideId } from "@/lib/kart/content";
import { TUNING, type KartState } from "@/lib/kart/physics";
import { createRace, formatTime, raceStep, TICK_MS, ticksToMs, you, type Race } from "@/lib/kart/race";
import { parseRollKey, rollKey, type Roll } from "@/lib/kart/roll";
import { driverFor, statsFor, TONE_COLORS } from "@/lib/kart/roster";
import { buildTrack, type Track } from "@/lib/kart/track";
import { Sound } from "./audio";
import { driverCanvas, DRIVER_H, type OwnAvatar } from "./avatars";
import type { CharacterArt, CharacterLook } from "@/components/games3d/character";
import { figureArt } from "./figures";
import { Particles } from "./fx";
import { Controls } from "./input";
import { drawMinimap } from "./minimap";
import { RideModel, rideParts } from "./rides";
import { paintPictures, type Pictures } from "./textures";
import { buildWorld, ROAD_Y, type World } from "./world";

/**
 * Chase camera: distance behind, height, downward tilt and vertical field of view, for a wide
 * (landscape) screen and a tall (portrait) one; screens in between get a blend. Plus how fast it
 * swings round behind the kart, normally and through a drift.
 */
const CAM = {
  wide: { dist: 46, height: 19, pitch: 0.2, fov: (52 * Math.PI) / 180 },
  tall: { dist: 70, height: 40, pitch: 0.22, fov: (82 * Math.PI) / 180 },
  follow: 7,
  driftFollow: 3.2,
};
/** The sun's direction (toward it), and how big the shadow box around you is. */
const SUN = new THREE.Vector3(-0.42, 0.78, -0.46).normalize();
const SHADOW_BOX = 230;

export type Quality = "auto" | "high" | "low";

export interface RaceResult {
  totalMs: number;
  lapMs: number[];
  /** Your run as a ghost (to keep if it's your best). */
  ghost: GhostData | null;
}

export interface EngineHooks {
  /** 3, 2, 1, then 0 for GO. */
  onCountdown(n: number): void;
  /** A lap finished (1-based) and its time. */
  onLap(lap: number, lapMs: number): void;
  /** Time against your ghost at a split (negative = ahead). */
  onSplit(deltaMs: number): void;
  onWrongWay(on: boolean): void;
  onFinish(result: RaceResult): void;
  /** Paused or resumed, from any control (a button, Escape, a controller's Start, the tab hiding). */
  onPause(paused: boolean): void;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  minimap: HTMLCanvasElement | null;
  roll: Roll;
  own: OwnAvatar;
  ghost: GhostData | null;
  hud: { total: HTMLElement | null; lap: HTMLElement | null; debug: HTMLElement | null };
  muted: boolean;
  reducedMotion: boolean;
  touch: boolean;
  quality: Quality;
  /** Development only: draw this ride's model instead of the rolled one (looks only; the physics is the roll's). */
  ride?: RideId | null;
  /** Development only: the autopilot drives (for checking the race and filming it). */
  autopilot?: boolean;
  /** Development only: the drivers as 3D characters in this look (shared with GameShuffle's other games). */
  look?: CharacterLook | null;
  hooks: EngineHooks;
}

function wrap(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/** The sky: a gradient dome that follows the camera, drawn behind everything. */
function skyDome(): THREE.Mesh {
  const L = TRACK_LOOK;
  const raw = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  const g = new THREE.SphereGeometry(5000, 24, 12);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uTop: { value: raw(L.sky[0]) },
      uHorizon: { value: raw(L.sky[1]) },
      uHaze: { value: new THREE.Vector3(...L.haze) },
      uSun: { value: SUN.clone() },
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
      uniform vec3 uHorizon;
      uniform vec3 uHaze;
      uniform vec3 uSun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(uHorizon, uTop, smoothstep(0.0, 0.5, h));
        c = mix(uHaze, c, smoothstep(-0.02, 0.07, h));
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 0.9 + pow(s, 12.0) * 0.12);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

interface Built {
  track: Track;
  meTex: THREE.CanvasTexture;
  ghost: Ghost | null;
  ghostTex: THREE.CanvasTexture | null;
  ghostKart: { body: Roll["body"]; wheels: Roll["wheels"]; tone: [string, string] } | null;
  /** 3D drivers (development's ?look=); the textures are then unused. */
  meArt: CharacterArt | null;
  ghostArt: CharacterArt | null;
}

export class KartEngine {
  readonly controls: Controls;
  readonly sound: Sound;
  private opts: EngineOptions;
  private track: Track;
  private race!: Race;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(52, 1, 2, 6000);
  private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private world: World;
  private pics: Pictures;
  private me: RideModel;
  private ghostModel: RideModel | null = null;
  private ghost: Ghost | null;
  private textures: THREE.Texture[] = [];
  private sparks = new Particles(320, true, 240, 0.12);
  private dust = new Particles(260, false, 18, 0.05);
  private spray = new Particles(360, false, 130, 0.1);
  private minimap: { canvas: HTMLCanvasElement; toMap: (x: number, y: number) => [number, number] } | null;
  private prev = { x: 0, y: 0, z: 0, h: 0 };
  private camYaw = 0;
  private camRoll = 0;
  private shake = 0;
  private fovKick = 0;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private t = 0;
  private paused = false;
  private pausedDrawn = false;
  private running = false;
  private finished = false;
  private wrongShown = false;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;
  private fps = 60;
  private size = { w: 1, h: 1, dpr: 1 };
  private quality: "high" | "low";
  private prCap = 2;
  private perf = { start: 0, frames: 0, done: false };
  private landing = 0;
  private ghostPoseBuf: GhostPose = { x: 0, y: 0, z: 0, h: 0, flags: 0 };
  private tone: [string, string];

  private constructor(opts: EngineOptions, built: Built, renderer: THREE.WebGLRenderer) {
    this.opts = opts;
    this.track = built.track;
    this.ghost = built.ghost;
    this.renderer = renderer;
    this.controls = new Controls(opts.touch);
    this.controls.onPause = () => (this.paused ? this.resume() : this.pause());
    this.sound = new Sound(opts.muted);
    this.minimap = opts.minimap ? drawMinimap(this.track, opts.minimap.width) : null;

    const L = TRACK_LOOK;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const haze = new THREE.Color().setRGB(L.haze[0], L.haze[1], L.haze[2], THREE.SRGBColorSpace);
    this.scene.fog = new THREE.Fog(haze, 650, 3300);
    this.scene.background = haze;

    this.sky = skyDome();
    this.scene.add(this.sky);
    const hemi = new THREE.HemisphereLight(L.fill[0], L.fill[1], 1.85);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(L.sun, 2.35);
    this.sun.shadow.mapSize.set(opts.touch ? 1024 : 2048, opts.touch ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -SHADOW_BOX;
    sc.right = SHADOW_BOX;
    sc.top = SHADOW_BOX;
    sc.bottom = -SHADOW_BOX;
    sc.near = 20;
    sc.far = 1400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.8;
    this.scene.add(this.sun, this.sun.target);

    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.pics = paintPictures(this.track.def.name, aniso);
    this.world = buildWorld(this.track, this.pics);
    this.scene.add(this.world.group);

    const roll = opts.roll;
    const driver = driverFor(roll.driver);
    this.tone = TONE_COLORS[driver.tone] ?? TONE_COLORS.blue;
    this.textures.push(built.meTex);
    const fig = !!built.meArt;
    this.me = new RideModel(rideParts(opts.ride ?? roll.body, roll.wheels, this.tone, { figure: fig }), built.meTex, { wire: this.pics.wire, flame: true, character: built.meArt });
    this.me.setViewer(this.camera);
    this.scene.add(this.me.root);
    if (built.ghost && built.ghostKart) {
      if (built.ghostTex) this.textures.push(built.ghostTex);
      const k = built.ghostKart;
      this.ghostModel = new RideModel(rideParts(k.body, k.wheels, k.tone, { figure: fig }), built.ghostTex ?? built.meTex, { ghost: true, wire: this.pics.wire, character: built.ghostArt ?? built.meArt });
      this.ghostModel.setViewer(this.camera);
      this.ghostModel.setShadows(false);
      this.scene.add(this.ghostModel.root);
    }
    this.scene.add(this.sparks.points, this.dust.points, this.spray.points);

    this.quality = opts.quality === "low" ? "low" : "high";
    this.applyQuality(this.quality, false);
    this.newRace();
  }

  /** Builds everything a race needs (pictures, the world, the rides). Null when WebGL 2 isn't available. */
  static async create(opts: EngineOptions): Promise<KartEngine | null> {
    const def = TRACKS[opts.roll.track] ?? Object.values(TRACKS)[0];
    const track = buildTrack(def, opts.roll.twist === "mirror");
    // Size the driver pictures for this screen (about how tall they'll be in pixels, with room to spare).
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const devH = Math.max(window.innerHeight, 320) * dpr;
    const scale = Math.max(1, Math.min(2, ((devH / 2 / 22.4) * 13 * 1.3) / DRIVER_H));
    const texOf = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    const meTex = texOf(await driverCanvas(driverFor(opts.roll.driver), opts.own, scale));
    const ghost = opts.ghost && opts.ghost.track === track.key ? loadGhost(opts.ghost) : null;
    let ghostTex: THREE.CanvasTexture | null = null;
    let ghostKart: Built["ghostKart"] = null;
    if (ghost) {
      const k = parseRollKey(ghost.data.kart) ?? opts.roll;
      const gd = driverFor(k.driver);
      ghostKart = { body: k.body, wheels: k.wheels, tone: TONE_COLORS[gd.tone] ?? TONE_COLORS.blue };
      ghostTex = gd.id === driverFor(opts.roll.driver).id ? null : texOf(await driverCanvas(gd, opts.own, scale));
    }
    let meArt: CharacterArt | null = null;
    let ghostArt: CharacterArt | null = null;
    if (opts.look) {
      meArt = await figureArt(driverFor(opts.roll.driver), opts.own, opts.look);
      if (ghost) {
        const gd = driverFor((parseRollKey(ghost.data.kart) ?? opts.roll).driver);
        ghostArt = gd.id === driverFor(opts.roll.driver).id ? meArt : await figureArt(gd, opts.own, opts.look);
      }
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: opts.canvas,
        antialias: dpr < 1.5 && opts.quality !== "low",
        alpha: false,
        stencil: false,
        powerPreference: "high-performance",
      });
    } catch {
      meTex.dispose();
      ghostTex?.dispose();
      return null;
    }
    return new KartEngine(opts, { track, meTex, ghost, ghostTex, ghostKart, meArt, ghostArt }, renderer);
  }

  private applyQuality(q: "high" | "low", recompile = true): void {
    this.quality = q;
    const high = q === "high";
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    this.me.setShadows(high);
    for (const o of this.world.extras) o.visible = high;
    for (const [mesh, all, low] of this.world.thinned) mesh.count = high ? all : low;
    this.prCap = high ? Math.min(this.prCap, 2) : 1.25;
    if (recompile) {
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
    }
    this.applySize();
  }

  private newRace(): void {
    this.race = createRace(this.track, statsFor(this.opts.roll.driver, this.opts.roll.body, this.opts.roll.wheels));
    const k = you(this.race).kart;
    this.prev = { x: k.x, y: k.y, z: k.z, h: k.h };
    this.camYaw = k.h;
    this.camRoll = 0;
    this.sparks.clear();
    this.dust.clear();
    this.finished = false;
    this.wrongShown = false;
    this.acc = 0;
  }

  private applySize(): void {
    const pr = Math.min(this.size.dpr, this.prCap);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.camera.aspect = this.size.w / this.size.h;
    this.camera.updateProjectionMatrix();
  }

  /** Sizes the view to its element (call on mount and on resize). */
  resize(cssW: number, cssH: number, dpr: number): void {
    this.size = { w: Math.max(1, Math.round(cssW)), h: Math.max(1, Math.round(cssH)), dpr: Math.min(dpr, 2) };
    this.applySize();
    this.pausedDrawn = false;
    if (!this.running) this.draw(1, 0);
  }

  /** Starts the countdown (call from a tap or key press so sound can start). */
  start(): void {
    this.sound.start();
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  pause(): void {
    if (!this.running || this.paused || this.finished) return;
    this.paused = true;
    this.pausedDrawn = false;
    this.controls.clear();
    this.sound.quiet();
    this.sound.suspend();
    this.opts.hooks.onPause(true);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.last = performance.now();
    this.sound.resume();
    this.opts.hooks.onPause(false);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** The same roll again from the grid. */
  restart(): void {
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.finishTimer = null;
    this.newRace();
    this.paused = false;
    this.last = performance.now();
    this.sound.resume();
    if (!this.running) this.start();
  }

  setMuted(m: boolean): void {
    this.sound.setMuted(m);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.sound.close();
    this.me.dispose();
    this.ghostModel?.dispose();
    this.world.dispose();
    for (const t of [...this.pics.all, ...this.textures]) t.dispose();
    this.sparks.dispose();
    this.dust.dispose();
    this.spray.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.sky.geometry.dispose();
    // Never lose the context: the canvas keeps it, and the next race (or React's
    // second mount in development) gets the same one back.
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
  }

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.measure(now);
    const step = TUNING.dt;
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= step && n < 8) {
        this.tick();
        this.acc -= step;
        n++;
      }
      if (n === 8) this.acc = 0;
    }
    if (this.paused && this.pausedDrawn) return;
    this.draw(this.paused ? 1 : this.acc / step, this.paused ? 0 : dt);
    if (this.paused) this.pausedDrawn = true;
  };

  /** "auto": watches the first seconds and settles on a quality the device can hold. */
  private measure(now: number): void {
    if (this.opts.quality !== "auto" || this.perf.done || this.paused) return;
    if (!this.perf.start) this.perf.start = now;
    const t = now - this.perf.start;
    if (t < 800) return;
    this.perf.frames++;
    if (t < 3400) return;
    this.perf.done = true;
    const fps = this.perf.frames / ((t - 800) / 1000);
    if (fps < 45) this.applyQuality("low");
    else if (fps < 56 && this.size.dpr > 1.5) {
      this.prCap = 1.5;
      this.applySize();
    }
  }

  private tick(): void {
    const r = this.race;
    const me = you(r);
    const k = me.kart;
    this.prev = { x: k.x, y: k.y, z: k.z, h: k.h };
    const input = this.opts.autopilot ? autopilot(this.track, k, { drift: true }) : this.controls.read();
    const ev = raceStep(r, input);
    const hooks = this.opts.hooks;
    if (ev.beep) {
      this.sound.beep();
      hooks.onCountdown(ev.beep);
    }
    if (ev.go) {
      this.sound.go();
      hooks.onCountdown(0);
    }
    const mine = ev.racers[0];
    if (!mine) return;
    if (mine.kart) {
      const ke = mine.kart;
      if (ke.wall) {
        this.sound.bump(ke.wall);
        if (!this.opts.reducedMotion) this.shake = Math.min(1, ke.wall / 160);
        this.burst(k, Math.min(14, 4 + ke.wall / 20));
      }
      if (ke.tier) this.sound.spark(ke.tier);
      if (ke.boost === 1 || ke.boost === 2) {
        this.sound.boost(ke.boost === 2);
        if (!this.opts.reducedMotion) this.fovKick = ke.boost === 2 ? 1 : 0.6;
      }
      if (ke.land) {
        this.sound.land();
        this.landing = ke.land;
        if (!this.opts.reducedMotion) this.shake = Math.max(this.shake, 0.35);
      }
    }
    if (mine.split && this.ghost) {
      const K = this.track.gates.length;
      const m = mine.split;
      const g = this.ghost.data.splits[m];
      if ((m - 1) % (K / 2) === 0 && m > 1 && g) hooks.onSplit((me.splits[m] - g) * TICK_MS);
    }
    if (mine.lap) {
      if (!mine.finish) this.sound.lap();
      hooks.onLap(mine.lap, ticksToMs(mine.lapTime));
    }
    if (mine.finish && !this.finished) {
      this.finished = true;
      this.sound.finish();
      const result: RaceResult = {
        totalMs: ticksToMs(me.finishAt ?? 0),
        lapMs: me.lapTimes.map(ticksToMs),
        ghost: makeGhost(r, rollKey(this.opts.roll)),
      };
      this.finishTimer = setTimeout(() => {
        this.sound.quiet();
        hooks.onFinish(result);
      }, 1400);
    }
    const wrong = me.wrongWay > 45 && !this.finished;
    if (wrong !== this.wrongShown) {
      this.wrongShown = wrong;
      hooks.onWrongWay(wrong);
    }
  }

  /** A few sparks off a wall. */
  private burst(k: KartState, n: number): void {
    const fx = Math.cos(k.h);
    const fy = Math.sin(k.h);
    for (let i = 0; i < n; i++) {
      this.sparks.emit(k.x + fx * 10, ROAD_Y + 5, k.y + fy * 10, (Math.random() - 0.5) * 120, 40 + Math.random() * 80, (Math.random() - 0.5) * 120, 0.35, 1.6, i % 2 ? "#ffe08a" : "#ffffff");
    }
  }

  /** Sparks, embers, dust and spray for this frame. */
  private effects(k: KartState, x: number, y: number, h: number, dt: number) {
    if (dt <= 0) return;
    const fx = Math.cos(h);
    const fy = Math.sin(h);
    const rx = -fy;
    const ry = fx;
    const parts = this.me.parts;
    const back = parts.wheels.filter((w) => !w.front);
    const rear = back.length ? back : parts.wheels;
    const at = (lx: number, lz: number): [number, number] => [x + fx * lx + rx * lz, y + fy * lx + ry * lz];
    const count = (rate: number) => Math.floor(rate * dt + Math.random());
    const base = ROAD_Y + k.z;
    if (k.drift && k.grounded) {
      for (const w of rear) {
        const [px, py] = at(w.x - 1, w.z);
        if (k.tier) {
          const color = k.tier === 2 ? "#ff9a2e" : "#5aa2ff";
          for (let i = count(150); i > 0; i--) {
            this.sparks.emit(px, base + 0.8, py, -fx * 50 + (Math.random() - 0.5) * 70, 30 + Math.random() * 60, -fy * 50 + (Math.random() - 0.5) * 70, 0.26, i % 3 === 0 ? 1.1 : 1.7, i % 3 === 0 ? "#ffffff" : color);
          }
        }
        for (let i = count(22); i > 0; i--) this.dust.emit(px, base + 1, py, -fx * 22 + (Math.random() - 0.5) * 10, 8 + Math.random() * 8, -fy * 22 + (Math.random() - 0.5) * 10, 0.5, 2.4, "#eceae6", 1.2);
      }
    }
    if (k.boost > 0) {
      const ex = parts.exhaust;
      const [px, py] = at(ex.x, ex.z);
      for (let i = count(110); i > 0; i--) {
        this.sparks.emit(px, base + ex.y, py, -fx * 70 + (Math.random() - 0.5) * 26, (Math.random() - 0.3) * 24, -fy * 70 + (Math.random() - 0.5) * 26, 0.24, 2.2, Math.random() < 0.5 ? "#ffd23e" : "#ff7a1c");
      }
    }
    if (k.surface === "grass" && Math.abs(k.speed) > 40 && k.grounded) {
      for (const w of rear) {
        const [px, py] = at(w.x - 1, w.z);
        for (let i = count(32); i > 0; i--) this.dust.emit(px, base + 1, py, -fx * 26 + (Math.random() - 0.5) * 18, 14 + Math.random() * 18, -fy * 26 + (Math.random() - 0.5) * 18, 0.5, 3, Math.random() < 0.5 ? "#8f7a4c" : "#6f9a45", 1.4);
      }
    }
    if (this.landing > 0) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        this.dust.emit(x + Math.cos(a) * 8, ROAD_Y + 1, y + Math.sin(a) * 8, Math.cos(a) * 40, 12, Math.sin(a) * 40, 0.45, 3.2, "#d8d4ca", 1.3);
      }
      this.me.land(this.landing);
      this.landing = 0;
    }
    // Sprinklers near the camera sweep their spray.
    const cam = this.camera.position;
    this.world.sprinklers.forEach((s, i) => {
      if ((s.x - cam.x) ** 2 + (s.z - cam.z) ** 2 > 950 * 950) return;
      const a = i * 2.1 + Math.sin(this.t * 1.1 + i) * 1.25;
      for (let k2 = count(70); k2 > 0; k2--) {
        const spread = (Math.random() - 0.5) * 0.12;
        const sp = 40 + Math.random() * 10;
        this.spray.emit(s.x, s.y, s.z, Math.cos(a + spread) * sp, 48 + Math.random() * 8, Math.sin(a + spread) * sp, 0.85, 1.3, Math.random() < 0.6 ? "#e4f3ff" : "#bfe1ff");
      }
    });
    this.sparks.update(dt);
    this.dust.update(dt);
    this.spray.update(dt);
  }

  private draw(alpha: number, dt: number): void {
    this.t += dt;
    const r = this.race;
    const me = you(r);
    const k = me.kart;
    const a = Math.max(0, Math.min(1, alpha));
    const x = this.prev.x + (k.x - this.prev.x) * a;
    const y = this.prev.y + (k.y - this.prev.y) * a;
    const z = this.prev.z + (k.z - this.prev.z) * a;
    const h = this.prev.h + wrap(k.h - this.prev.h) * a;
    const reduced = this.opts.reducedMotion;

    // Camera: swings round behind the kart, a little lazier through a drift so the slide shows.
    const speed = Math.hypot(k.vx, k.vy);
    let target = h;
    if (speed > 30 && k.drift) target = h - k.drift * 0.28;
    const rate = k.drift ? CAM.driftFollow : CAM.follow;
    if (dt > 0) this.camYaw += wrap(target - this.camYaw) * (1 - Math.exp(-rate * dt));
    else if (!this.running) this.camYaw = h;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.fovKick = Math.max(0, this.fovKick - dt * 1.6);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 5 : 0;
    const sz = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 3 : 0;
    const cy = Math.cos(this.camYaw);
    const syy = Math.sin(this.camYaw);
    const aspect = this.size.w / this.size.h;
    const t = Math.max(0, Math.min(1, (aspect - 0.5) / 1.1));
    const mix = (key: "dist" | "height" | "pitch" | "fov") => CAM.tall[key] + (CAM.wide[key] - CAM.tall[key]) * t;
    const dist = mix("dist");
    const pitch = mix("pitch");
    const fov = mix("fov") + (reduced ? 0 : this.fovKick * 0.06 + Math.min(1, speed / 300) * 0.04);
    const camX = x - cy * dist + sx;
    const camY = y - syy * dist + sx;
    const camZ = mix("height") + z * 0.6 + sz;
    const cam = this.camera;
    cam.position.set(camX, camZ + ROAD_Y, camY);
    cam.up.set(0, 1, 0);
    cam.lookAt(camX + cy * Math.cos(pitch), camZ + ROAD_Y - Math.sin(pitch), camY + syy * Math.cos(pitch));
    // Lean a touch into the turn (not with reduced motion).
    const leanTo = reduced ? 0 : -(k.drift ? k.drift * 0.7 : k.steer) * 0.03 * Math.min(1, speed / 200);
    if (dt > 0) this.camRoll += (leanTo - this.camRoll) * (1 - Math.exp(-4 * dt));
    cam.rotateZ(this.camRoll);
    const fovDeg = (fov * 180) / Math.PI;
    if (Math.abs(cam.fov - fovDeg) > 1e-4) {
      cam.fov = fovDeg;
      cam.updateProjectionMatrix();
    }
    this.sky.position.copy(cam.position);

    // Your ride, and the ghost.
    const steer = k.drift ? k.drift * 0.9 : k.steer;
    this.me.update({ x, y, z, h, steer, speed: k.speed }, dt, { boost: k.boost, drift: k.drift, grounded: k.grounded }, ROAD_Y, !reduced);
    if (this.ghost && this.ghostModel) {
      const gt = r.tick < 0 ? 0 : r.tick - 1 + a;
      const gp = ghostPose(this.ghost, gt, this.ghostPoseBuf);
      const drift = (gp.flags & 3) - 1;
      const gSpeed = r.tick > 0 ? 200 : 0;
      this.ghostModel.update({ x: gp.x, y: gp.y, z: gp.z, h: gp.h, steer: drift * 0.8, speed: gSpeed }, dt, { boost: 0, drift, grounded: gp.z < 0.5 }, ROAD_Y, !reduced);
    }
    this.effects(k, x, y, h, dt);

    // The sun's shadow box follows you (a little ahead), snapped to its texels so shadows don't shimmer.
    {
      const ax = x + Math.cos(h) * 70;
      const ay = y + Math.sin(h) * 70;
      const texel = (SHADOW_BOX * 2) / this.sun.shadow.mapSize.x;
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN).normalize();
      const up = new THREE.Vector3().crossVectors(SUN, right).normalize();
      const p = new THREE.Vector3(ax, 0, ay);
      const u = Math.round(p.dot(right) / texel) * texel;
      const v = Math.round(p.dot(up) / texel) * texel;
      const w = p.dot(SUN);
      const snapped = right.multiplyScalar(u).add(up.multiplyScalar(v)).add(SUN.clone().multiplyScalar(w));
      this.sun.target.position.copy(snapped);
      this.sun.position.copy(snapped).addScaledVector(SUN, 700);
      this.sun.target.updateMatrixWorld();
    }

    const pxScale = (this.renderer.getDrawingBufferSize(new THREE.Vector2()).y / 2) / Math.tan((fov) / 2);
    this.sparks.setScale(pxScale);
    this.dust.setScale(pxScale);
    this.spray.setScale(pxScale);

    this.renderer.render(this.scene, cam);
    this.hud(a);
  }

  private hud(alpha: number): void {
    const r = this.race;
    const me = you(r);
    const { total, lap, debug } = this.opts.hud;
    const nowTicks = r.tick <= 0 ? 0 : Math.max(0, r.tick - 1 + (this.paused ? 1 : alpha));
    const totalTicks = me.finishAt ?? nowTicks;
    if (total) total.textContent = formatTime(ticksToMs(totalTicks));
    if (lap) {
      const K = this.track.gates.length;
      const done = me.lapTimes.length;
      const start = done === 0 ? 0 : me.splits[1 + done * K] ?? 0;
      const cur = me.finishAt !== null ? me.lapTimes[me.lapTimes.length - 1] ?? 0 : Math.max(0, totalTicks - start);
      lap.textContent = formatTime(ticksToMs(cur));
    }
    if (this.minimap && this.opts.minimap) {
      const m = this.opts.minimap.getContext("2d")!;
      m.clearRect(0, 0, this.opts.minimap.width, this.opts.minimap.height);
      m.drawImage(this.minimap.canvas, 0, 0);
      if (this.ghost) {
        const [gx, gy] = this.minimap.toMap(this.ghostPoseBuf.x, this.ghostPoseBuf.y);
        m.fillStyle = "rgba(255,255,255,0.75)";
        m.beginPath();
        m.arc(gx, gy, 4, 0, Math.PI * 2);
        m.fill();
      }
      const [px, py] = this.minimap.toMap(me.kart.x, me.kart.y);
      m.fillStyle = this.tone[1];
      m.strokeStyle = "#ffffff";
      m.lineWidth = 2;
      m.beginPath();
      m.arc(px, py, 5, 0, Math.PI * 2);
      m.fill();
      m.stroke();
    }
    if (debug) {
      const k = me.kart;
      const info = this.renderer.info.render;
      debug.textContent = `${Math.round(this.fps)} fps · ${this.quality} ×${this.renderer.getPixelRatio()} · ${info.calls} calls · ${(info.triangles / 1000).toFixed(1)}k tris · speed ${Math.round(k.speed)} · drift ${k.drift ? `${k.charge.toFixed(2)}s tier ${k.tier}` : "off"} · boost ${k.boost.toFixed(2)} · ${k.surface}${k.grounded ? "" : " · air"} · ${this.controls.mode}`;
    }
  }
}
