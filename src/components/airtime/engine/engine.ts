/**
 * Airtime's game loop (client). The sim (src/lib/airtime) runs at a fixed 60
 * steps a second, separate from drawing: each animation frame runs however
 * many steps have come due, then draws the in-between pose, so the game is the
 * same on a 60, 90 or 120 Hz screen.
 *
 * Drawing is one three.js scene in 2.5D: a side view through a perspective
 * camera that follows you with a little room ahead, looking slightly down so
 * the roof decks show. Low-poly, flat shaded, vertex colored, under a golden
 * hour sky (world.ts); the enemies, shots and pickups (actors.ts); you
 * (player.ts, the seam for the shared character module); sparks and smoke
 * (fx.ts). This module is only ever loaded with a dynamic import, so three.js
 * stays out of every other page's bundle.
 *
 * Quality: "high" (rooftop clutter, every window row, pixel ratio up to 2),
 * "low" (no clutter, fewer windows and particles, pixel ratio up to 1.25) or
 * "auto", which starts high and drops to low if the first seconds run under
 * about 45 frames a second.
 */

import * as THREE from "three";
import { autopilot } from "@/lib/airtime/autopilot";
import { WEAPON_NAMES, type WeaponKind } from "@/lib/airtime/content";
import { groundUnder } from "@/lib/airtime/level";
import { bank, createRun, nextLevel, progress, step, type Input, type LevelStats, type Run, type StepEvents } from "@/lib/airtime/sim";
import { TUNING } from "@/lib/airtime/tuning";
import { Actors, weaponColor } from "./actors";
import { Sound } from "./audio";
import { faceCanvas, type OwnAvatar } from "./avatar";
import { Particles } from "./fx";
import { Controls } from "./input";
import { buildPlayer, type PlayerRig } from "./player";
import { buildWorld, LOOK, skyDome, type World } from "./world";

export type Quality = "auto" | "high" | "low";

/** The camera: field of view, the least it shows (meters, top to bottom and across), where you sit across the screen. */
const CAM = {
  fov: 36,
  minH: 14.2,
  minW: 14,
  /** Your place across the screen (0 = left edge). */
  at: 0.27,
  /** The height the view centers on in landscape. */
  center: 6.3,
  /** How far it looks down (camera height over distance). */
  tilt: 0.13,
};

export interface Status {
  hearts: number;
  weapon: WeaponKind;
  /** Seconds left on Spread or Rapid (0 for the Blaster). */
  weaponSecs: number;
  level: number;
  /** 0..100 */
  progress: number;
}

export interface EngineHooks {
  onStatus(s: Status): void;
  /** The level was cleared (after a short pause to see it). */
  onCleared(stats: LevelStats, run: Run): void;
  /** The run is over (no hearts left). */
  onOver(run: Run): void;
  onPause(paused: boolean): void;
  /** Short lines for screen readers. */
  onSay(text: string): void;
  /** A big line in the middle of the screen for a moment. */
  onBanner(text: string, tone: "level" | "weapon" | "heart" | "hit"): void;
  /** A hit: flash the screen. */
  onHurt(): void;
  /** Development (autopilot only): each step's input, so the on-screen controls can show what it does. */
  onInput?(input: Input): void;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  /** Where "+100" pops are drawn. */
  pops: HTMLElement | null;
  hud: { score: HTMLElement | null; debug: HTMLElement | null };
  seed: number;
  startLevel: number;
  own: OwnAvatar;
  muted: boolean;
  reducedMotion: boolean;
  touch: boolean;
  quality: Quality;
  /** Development only: the autopilot plays. */
  autopilot: boolean;
  hooks: EngineHooks;
}

/** What the screenshot and check scripts read in development. */
export interface DevState {
  phase: Run["phase"];
  level: number;
  tick: number;
  x: number;
  y: number;
  grounded: boolean;
  hearts: number;
  weapon: WeaponKind;
  score: number;
  /** On screen now: */
  walkers: number;
  flyers: number;
  turrets: number;
  charging: number;
  foeShots: number;
  myShots: number;
  /** A walker on screen being shot at. */
  walkerHit: boolean;
  aim: number;
  firing: boolean;
  /** Flyers on screen above your gun, walkers on screen below your feet. */
  flyersAbove: number;
  walkersBelow: number;
  fps: number;
  quality: "high" | "low";
}

export class AirtimeEngine {
  readonly controls = new Controls();
  readonly sound: Sound;
  private opts: EngineOptions;
  private run: Run;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(CAM.fov, 1, 1, 2400);
  private sky: THREE.Mesh;
  private world: World;
  private actors = new Actors();
  private player: PlayerRig;
  private shadow: THREE.Mesh;
  private sparks = new Particles(420, true, 18, 0.12);
  private embers = new Particles(260, true, -2, 0.1);
  private smoke = new Particles(320, false, -3, 0.2);
  private prevPlayer = { x: 0, y: 0 };
  private prev = new Map<number, [number, number]>();
  private cam = { x: 0, y: CAM.center };
  private shake = 0;
  private thrust = 0;
  private aimArm = 0;
  private aimLine: THREE.Group;
  private aimMats: THREE.MeshBasicMaterial[] = [];
  private aimShade: THREE.MeshBasicMaterial[] = [];
  private aimSides: THREE.Object3D[] = [];
  private lastInput: Input = { hold: false, fire: false, aim: 0 };
  private raf = 0;
  private last = 0;
  private acc = 0;
  private t = 0;
  private paused = false;
  private pausedDrawn = false;
  private running = false;
  private ended = false;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private fps = 60;
  private size = { w: 1, h: 1, dpr: 1 };
  private quality: "high" | "low";
  private prCap = 2;
  private perf = { start: 0, frames: 0, done: false };
  private last_status = "";
  private popEls: HTMLElement[] = [];
  private popNext = 0;
  private lastImpactSound = 0;
  private tmp = new THREE.Vector3();
  private walkerHit = 0;
  /** Development (filming): the sim holds still until this time while frames keep drawing. */
  private frozenUntil = 0;

  private constructor(opts: EngineOptions, face: HTMLCanvasElement, renderer: THREE.WebGLRenderer) {
    this.opts = opts;
    this.renderer = renderer;
    this.sound = new Sound(opts.muted);
    this.controls.onPause = () => (this.paused ? this.resume() : this.pause());
    this.run = createRun(opts.seed, opts.startLevel);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    const haze = new THREE.Color(LOOK.haze);
    this.scene.fog = new THREE.Fog(haze, 60, 330);
    this.scene.background = haze;
    this.sky = skyDome();
    this.scene.add(this.sky);
    this.scene.add(new THREE.HemisphereLight(LOOK.hemiSky, LOOK.hemiGround, 1.55));
    const sun = new THREE.DirectionalLight(LOOK.sunLight, 1.85);
    sun.position.set(0.5, 0.82, 0.62);
    this.scene.add(sun);

    this.quality = opts.quality === "low" ? "low" : "high";
    this.world = buildWorld(this.run.level, this.quality === "high");
    this.scene.add(this.world.group);
    this.scene.add(this.actors.group);
    this.actors.setLevel(this.run);

    this.player = buildPlayer(face);
    this.scene.add(this.player.group);
    // A soft shadow under you on whatever you're over.
    const sg = new THREE.CircleGeometry(0.55, 20);
    sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: "#1a1424", transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.renderOrder = 2;
    this.scene.add(this.shadow);
    this.scene.add(this.smoke.points, this.embers.points, this.sparks.points);
    this.aimLine = this.buildAimLine();
    this.scene.add(this.aimLine);

    if (opts.pops) {
      opts.pops.textContent = "";
      for (let i = 0; i < 8; i++) {
        const el = document.createElement("span");
        el.className = "airtime-pop";
        opts.pops.appendChild(el);
        this.popEls.push(el);
      }
    }
    this.applyQuality(this.quality);
    this.snapCamera();
    this.status(true);
  }

  /** Builds everything (your face, the world, the renderer). Null when WebGL isn't available. */
  static async create(opts: EngineOptions): Promise<AirtimeEngine | null> {
    const face = await faceCanvas(opts.own, 256);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: opts.canvas,
        antialias: (window.devicePixelRatio || 1) < 1.5 && opts.quality !== "low",
        alpha: false,
        stencil: false,
        powerPreference: "high-performance",
      });
    } catch {
      return null;
    }
    return new AirtimeEngine(opts, face, renderer);
  }

  private applyQuality(q: "high" | "low"): void {
    this.quality = q;
    const high = q === "high";
    for (const o of this.world.extras) o.visible = high;
    this.sparks.density = high ? 1 : 0.6;
    this.smoke.density = high ? 1 : 0.5;
    this.embers.density = high ? 1 : 0.5;
    this.prCap = high ? Math.min(this.prCap, 2) : 1.25;
    this.applySize();
  }

  private applySize(): void {
    this.renderer.setPixelRatio(Math.min(this.size.dpr, this.prCap));
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.camera.aspect = this.size.w / this.size.h;
    this.camera.updateProjectionMatrix();
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.size = { w: Math.max(1, Math.round(cssW)), h: Math.max(1, Math.round(cssH)), dpr: Math.min(dpr, 2) };
    this.applySize();
    this.snapCamera();
    this.pausedDrawn = false;
    if (!this.running) this.draw(1, 0);
  }

  start(): void {
    this.sound.start();
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.opts.hooks.onBanner(`Level ${this.run.level.number}`, "level");
  }

  pause(): void {
    if (!this.running || this.paused || this.ended) return;
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

  get state(): Run {
    return this.run;
  }

  setMuted(m: boolean): void {
    this.sound.setMuted(m);
  }

  /** "Continue" on the Level cleared card. */
  continueRun(): void {
    if (this.run.phase !== "cleared") return;
    nextLevel(this.run);
    this.scene.remove(this.world.group);
    this.world.dispose();
    this.world = buildWorld(this.run.level, this.quality === "high");
    this.scene.add(this.world.group);
    this.actors.setLevel(this.run);
    this.sparks.clear();
    this.smoke.clear();
    this.embers.clear();
    this.prev.clear();
    this.ended = false;
    this.acc = 0;
    this.last = performance.now();
    this.snapCamera();
    this.sound.resume();
    this.status(true);
    this.opts.hooks.onBanner(`Level ${this.run.level.number}`, "level");
    this.opts.hooks.onSay(`Level ${this.run.level.number}. ${this.run.hearts} hearts.`);
  }

  /** "Bank my score" on the Level cleared card. */
  bankScore(): void {
    bank(this.run);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.endTimer) clearTimeout(this.endTimer);
    this.sound.close();
    this.world.dispose();
    this.actors.dispose();
    this.player.dispose();
    this.aimLine.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    for (const m of [...this.aimMats, ...this.aimShade]) m.dispose();
    (this.aimLine.userData.tex as THREE.Texture | undefined)?.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.sparks.dispose();
    this.embers.dispose();
    this.smoke.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.sky.geometry.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    if (this.opts.pops) this.opts.pops.textContent = "";
  }

  /** Development (filming): hold the sim still for `ms` (the picture keeps drawing). */
  freeze(ms: number): void {
    this.frozenUntil = performance.now() + ms;
  }

  devState(): DevState {
    const r = this.run;
    const camX = this.cam.x;
    const view = this.viewW() / 2 + 1;
    const on = (x: number) => Math.abs(x - camX) < view;
    const live = r.enemies.filter((e) => e.alive && !e.gone && on(e.x));
    return {
      phase: r.phase,
      level: r.level.number,
      tick: r.tick,
      x: r.player.x,
      y: r.player.y,
      grounded: r.player.grounded,
      hearts: r.hearts,
      weapon: r.weapon,
      score: r.score,
      walkers: live.filter((e) => e.kind === "walker").length,
      flyers: live.filter((e) => e.kind === "flyer").length,
      turrets: live.filter((e) => e.kind === "turret").length,
      charging: live.filter((e) => e.kind === "turret" && e.charge > 0).length,
      foeShots: r.shots.filter((s) => s.foe && on(s.x)).length,
      myShots: r.shots.filter((s) => !s.foe && on(s.x)).length,
      walkerHit: this.walkerHit > 0,
      aim: r.aim,
      firing: r.firing,
      flyersAbove: live.filter((e) => e.kind === "flyer" && e.y + e.h / 2 > r.player.y + 1.6 && e.x > r.player.x).length,
      walkersBelow: live.filter((e) => e.kind === "walker" && e.y + e.h < r.player.y - 0.3 && e.x > r.player.x).length,
      fps: Math.round(this.fps),
      quality: this.quality,
    };
  }

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.measure(now);
    const stepT = TUNING.dt;
    const frozen = now < this.frozenUntil;
    if (frozen) this.acc = 0;
    if (!this.paused && !frozen) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= stepT && n < 8) {
        this.tick();
        this.acc -= stepT;
        n++;
      }
      if (n === 8) this.acc = 0;
    }
    if (this.paused && this.pausedDrawn) return;
    this.draw(this.paused ? 1 : this.acc / stepT, this.paused ? 0 : dt);
    if (this.paused) this.pausedDrawn = true;
  };

  /**
   * The aim line: a fading dashed line out of your gun with a small ring where it points (and, with
   * Spread, two fainter lines for the fan). Shown while you aim (a thumb on the stick, fire held).
   */
  private buildAimLine(): THREE.Group {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 16;
    const g = c.getContext("2d")!;
    for (let x = 0; x < 256; x += 22) {
      const a = Math.max(0, 1 - x / 256);
      g.fillStyle = `rgba(255,255,255,${(0.95 * a).toFixed(3)})`;
      g.fillRect(x, 4, 13, 8);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const group = new THREE.Group();
    // Each line is colored dashes over a darker, wider copy, so it reads on a bright sky and a pale roof alike.
    const line = (len: number, width: number, opacity: number) => {
      const holder = new THREE.Group();
      const under = new THREE.PlaneGeometry(len, width * 2.2);
      under.translate(0.9 + len / 2, 0, 0);
      const shade = new THREE.MeshBasicMaterial({ map: tex, color: "#0e142c", transparent: true, opacity: opacity * 0.5, depthWrite: false, depthTest: false });
      this.aimShade.push(shade);
      const u = new THREE.Mesh(under, shade);
      u.renderOrder = 29;
      const geo = new THREE.PlaneGeometry(len, width);
      geo.translate(0.9 + len / 2, 0, 0);
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: "#7fe8ff", transparent: true, opacity, depthWrite: false, depthTest: false });
      this.aimMats.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 30;
      holder.add(u, m);
      return holder;
    };
    group.add(line(6.2, 0.14, 0.95));
    for (const a of [0.2268928, -0.2268928]) {
      const side = line(4.6, 0.1, 0.7);
      side.rotation.z = a;
      group.add(side);
      this.aimSides.push(side);
    }
    const ringShade = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.42, 28), new THREE.MeshBasicMaterial({ color: "#0e142c", transparent: true, opacity: 0.45, depthWrite: false, depthTest: false }));
    this.aimShade.push(ringShade.material as THREE.MeshBasicMaterial);
    ringShade.position.x = 7.4;
    ringShade.renderOrder = 29;
    group.add(ringShade);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.36, 28), new THREE.MeshBasicMaterial({ color: "#7fe8ff", transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }));
    this.aimMats.push(ring.material as THREE.MeshBasicMaterial);
    ring.position.x = 7.4;
    ring.renderOrder = 30;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), ring.material);
    dot.position.x = 7.4;
    dot.renderOrder = 30;
    group.add(ring, dot);
    group.visible = false;
    group.userData.tex = tex;
    return group;
  }

  /** Your gun on screen (CSS px within the game view), or null before the first frame. */
  gunOnScreen(): { x: number; y: number } | null {
    return this.controls.gun;
  }

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
    const r = this.run;
    if (r.phase !== "play") return;
    const p = r.player;
    this.prevPlayer = { x: p.x, y: p.y };
    this.prev.clear();
    for (const e of r.enemies) if (e.alive) this.prev.set(e.id, [e.x, e.y]);
    for (const s of r.shots) this.prev.set(s.id, [s.x, s.y]);
    const input = this.opts.autopilot ? autopilot(r) : this.controls.read();
    this.lastInput = input;
    if (this.opts.autopilot) this.opts.hooks.onInput?.(input);
    const ev = step(r, input);
    this.react(ev);
  }

  /** Sounds, effects, banners and lines for one step's events. */
  private react(ev: StepEvents): void {
    const r = this.run;
    const hooks = this.opts.hooks;
    const motion = !this.opts.reducedMotion;
    for (const f of ev.fired) {
      const c = weaponColor(f.kind);
      for (let i = 0; i < 4; i++) this.sparks.emit(f.x + 0.1, f.y, 0.3, f.vx * 0.12 + (Math.random() - 0.5) * 3, f.vy * 0.12 + (Math.random() - 0.5) * 3, 0, 0.12, 0.55, i % 2 ? "#ffffff" : c);
    }
    if (ev.fired.length) this.sound.shot(ev.fired[0].kind);
    for (const im of ev.impacts) {
      this.sparks.burst(im.x, im.y, 0.3, im.enemy ? 8 : 5, im.enemy ? 7 : 5, im.enemy ? ["#ffffff", "#ffe08a", "#7fe8ff"] : ["#d6dde6", "#ffe08a"], 0.25, 0.4);
      if (this.t - this.lastImpactSound > 0.05) {
        this.lastImpactSound = this.t;
        this.sound.impact();
      }
    }
    for (const k of ev.kills) {
      this.actors.defeated(k.id);
      const colors = k.kind === "walker" ? ["#f0644a", "#ffd23e", "#ffffff"] : k.kind === "flyer" ? ["#7b5cff", "#7cf3ff", "#ffffff"] : ["#ff6a3d", "#ffd23e", "#c3c9d1"];
      this.sparks.burst(k.x, k.y, 0.3, 22, 11, colors, 0.5, 0.6);
      for (let i = 0; i < 6; i++) this.smoke.emit(k.x + (Math.random() - 0.5), k.y + (Math.random() - 0.5), 0, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, 0, 0.7, 1.1, "#c9c3d6", 1.2);
      this.popAt(k.x, k.y + 0.8, `+${k.points}`, "kill");
      this.sound.kill(k.kind === "turret");
      if (k.stomp) this.sound.stomp();
    }
    for (const f of ev.foeFired) {
      this.sparks.burst(f.x, f.y, 0.3, 6, 4, ["#ff9a3c", "#ffd2a8"], 0.25, 0.5);
      this.sound.foeShot();
    }
    if (ev.hurt) {
      if (motion) this.shake = 1;
      this.sparks.burst(ev.hurt.x, ev.hurt.y, 0.4, 16, 9, ["#ff4d6d", "#ffffff", "#ffd23e"], 0.4, 0.6);
      this.sound.hurt();
      hooks.onHurt();
      if (r.hearts > 0) hooks.onSay(ev.fell ? `You fell. ${r.hearts} ${r.hearts === 1 ? "heart" : "hearts"} left.` : `Hit. ${r.hearts} ${r.hearts === 1 ? "heart" : "hearts"} left.`);
    }
    if (ev.fell) this.sound.fall();
    if (ev.respawned) for (let i = 0; i < 10; i++) this.smoke.emit(r.player.x + (Math.random() - 0.5) * 1.5, r.player.y + 0.8, 0, (Math.random() - 0.5) * 2, Math.random(), 0, 0.6, 1, "#ffffff", 1.4);
    if (ev.landed > 3) {
      for (let i = 0; i < 8; i++) this.smoke.emit(r.player.x + (Math.random() - 0.5) * 0.8, r.player.y + 0.1, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 4, 0.4 + Math.random(), (Math.random() - 0.5) * 2, 0.45, 0.6, "#e3dccf", 1.2);
      this.sound.land(ev.landed);
    }
    if (ev.liftOff) for (let i = 0; i < 5; i++) this.smoke.emit(r.player.x - 0.3, r.player.y + 0.1, (Math.random() - 0.5) * 0.6, -1 - Math.random() * 2, 0.3, 0, 0.4, 0.55, "#efe9df", 1.3);
    for (const c of ev.collected) {
      if (c.kind === "star") {
        this.sparks.burst(c.x, c.y, 0.3, 8, 5, ["#ffd23e", "#fff3b0"], 0.3, 0.4);
        this.sound.star();
      } else if (c.kind === "heart") {
        this.sparks.burst(c.x, c.y, 0.3, 16, 6, ["#ff4d6d", "#ffd0da"], 0.45, 0.5);
        this.sound.heart();
        hooks.onBanner(c.full ? `+${c.points}` : "+1 heart", "heart");
        hooks.onSay(c.full ? `Hearts full: ${c.points} points.` : `A heart back. ${r.hearts} hearts.`);
      } else {
        this.sparks.burst(c.x, c.y, 0.3, 18, 7, [c.kind === "spread" ? "#c49bff" : "#5fe3f0", "#ffffff"], 0.45, 0.5);
        this.sound.pickup();
        hooks.onBanner(WEAPON_NAMES[c.kind], "weapon");
        hooks.onSay(`${WEAPON_NAMES[c.kind]} for 20 seconds.`);
      }
      if (c.points && c.kind !== "heart") this.popAt(c.x, c.y + 0.5, `+${c.points}`, c.kind === "star" ? "star" : "kill");
    }
    if (ev.weaponOut) hooks.onSay("Back to the Blaster.");
    if (ev.cleared && !this.ended) {
      this.ended = true;
      this.sound.cleared();
      this.sound.quiet();
      const g = r.level.gateX;
      const top = groundUnder(r.level, g) ?? r.player.y;
      for (let i = 0; i < 40; i++) this.sparks.emit(g + (Math.random() - 0.5) * 4, top + 5.4 + Math.random(), 0, (Math.random() - 0.5) * 10, 2 + Math.random() * 8, (Math.random() - 0.5) * 4, 1.2, 0.7, ["#ffd23e", "#ff6b5b", "#4cc38a", "#5aa2ff", "#ffffff"][i % 5]);
      const stats = { ...r.stats };
      hooks.onSay(`Level ${stats.level} cleared.`);
      this.endTimer = setTimeout(() => hooks.onCleared(stats, r), 1100);
    }
    if (ev.over && !this.ended) {
      this.ended = true;
      this.sound.quiet();
      this.sound.over();
      hooks.onSay("Out of hearts. The run is over.");
      this.endTimer = setTimeout(() => hooks.onOver(r), 1300);
    }
    for (const s of ev.impacts) if (s.enemy) this.walkerHit = 0.3;
  }

  private viewH(): number {
    const aspect = this.size.w / this.size.h;
    return Math.max(CAM.minH, CAM.minW / aspect);
  }

  private viewW(): number {
    return this.viewH() * (this.size.w / this.size.h);
  }

  private camTarget(px: number, py: number): { x: number; y: number } {
    const vh = this.viewH();
    const vw = this.viewW();
    // Portrait (a taller view) centers a little lower, so the roofs sit in the middle and the top of the
    // flying band stays just under the HUD; a little follow on your height.
    const base = CAM.center - (vh - CAM.minH) * 0.13;
    const follow = Math.max(-2, Math.min(5, py - 4.5)) * 0.32;
    return { x: px + (0.5 - CAM.at) * vw, y: base + follow };
  }

  private snapCamera(): void {
    const p = this.run.player;
    const c = this.camTarget(p.x, p.y);
    this.cam.x = c.x;
    this.cam.y = c.y;
    this.prevPlayer = { x: p.x, y: p.y };
  }

  private popAt(x: number, y: number, text: string, tone: "kill" | "star"): void {
    const el = this.popEls[this.popNext];
    if (!el) return;
    this.popNext = (this.popNext + 1) % this.popEls.length;
    const v = this.tmp.set(x, y, 0).project(this.camera);
    if (v.z > 1) return;
    el.textContent = text;
    el.className = "airtime-pop";
    el.style.left = `${((v.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - v.y) / 2) * 100}%`;
    // Restart the rise-and-fade.
    void el.offsetWidth;
    el.className = `airtime-pop airtime-pop--on airtime-pop--${tone}`;
  }

  private status(force = false): void {
    const r = this.run;
    const s: Status = {
      hearts: r.hearts,
      weapon: r.weapon,
      weaponSecs: r.weapon === "blaster" ? 0 : Math.ceil(r.weaponTicks / 60),
      level: r.level.number,
      progress: Math.round(progress(r) * 100),
    };
    const key = `${s.hearts}|${s.weapon}|${s.weaponSecs}|${s.level}|${s.progress}`;
    if (!force && key === this.last_status) return;
    this.last_status = key;
    this.opts.hooks.onStatus(s);
  }

  private draw(alpha: number, dt: number): void {
    this.t += dt;
    const r = this.run;
    const p = r.player;
    const a = Math.max(0, Math.min(1, alpha));
    const playing = r.phase === "play";
    const px = playing ? this.prevPlayer.x + (p.x - this.prevPlayer.x) * a : p.x;
    const py = playing ? this.prevPlayer.y + (p.y - this.prevPlayer.y) * a : p.y;
    const motion = !this.opts.reducedMotion;
    const blended = r.tick - 1 + (playing ? a : 1);

    // Camera.
    const vh = this.viewH();
    const dist = vh / 2 / Math.tan((CAM.fov * Math.PI) / 360);
    const target = this.camTarget(px, py);
    if (dt > 0) {
      const k = 1 - Math.exp(-10 * dt);
      this.cam.x += (target.x - this.cam.x) * k;
      this.cam.y += (target.y - this.cam.y) * (1 - Math.exp(-3 * dt));
    } else {
      this.cam.x = target.x;
      this.cam.y = target.y;
    }
    this.shake = Math.max(0, this.shake - dt * 3.2);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.5 : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.4 : 0;
    const cam = this.camera;
    cam.position.set(this.cam.x + sx, this.cam.y + dist * CAM.tilt + sy, dist);
    cam.lookAt(this.cam.x + sx, this.cam.y + sy, 0);
    this.sky.position.copy(cam.position);

    // You.
    // The gun arm follows your aim (smoothed a touch between steps).
    const aimRad = (r.aim * Math.PI) / 180;
    this.aimArm = dt > 0 ? this.aimArm + (aimRad - this.aimArm) * Math.min(1, dt * 30) : aimRad;
    const wantThrust = p.holding && !p.grounded && playing ? 1 : 0;
    this.thrust += (wantThrust - this.thrust) * Math.min(1, dt * (wantThrust ? 18 : 9));
    this.player.group.position.set(px, py, 0);
    this.player.update({
      t: this.t,
      dt,
      vy: p.vy,
      grounded: p.grounded,
      thrust: this.thrust,
      speed: r.level.speed,
      aim: this.aimArm,
      hidden: p.invuln > 0 && playing && Math.floor(p.invuln / 5) % 2 === 1,
      motion,
    });
    this.sound.thrust(playing ? this.thrust : 0);
    if (dt > 0 && this.thrust > 0.05) {
      for (const n of this.player.nozzles) {
        this.tmp.copy(n);
        this.player.group.localToWorld(this.tmp);
        const rate = this.thrust * 70 * dt;
        for (let i = Math.floor(rate + Math.random()); i > 0; i--) {
          this.embers.emit(this.tmp.x + (Math.random() - 0.5) * 0.1, this.tmp.y - 0.25, this.tmp.z, -r.level.speed * 0.3 + (Math.random() - 0.5) * 1.2, -7 - Math.random() * 4, (Math.random() - 0.5) * 1.2, 0.18, 0.4, Math.random() < 0.5 ? "#ffd23e" : "#ff7a1c");
        }
        for (let i = Math.floor(this.thrust * 22 * dt + Math.random()); i > 0; i--) {
          this.smoke.emit(this.tmp.x, this.tmp.y - 0.6, this.tmp.z, -r.level.speed * 0.6 + (Math.random() - 0.5), -2.5 - Math.random() * 2, (Math.random() - 0.5) * 1.2, 0.6, 0.55, Math.random() < 0.5 ? "#f2ece4" : "#d9d2cb", 2.2, 1.5);
        }
      }
    }
    // Turret shots leave a short trail.
    if (dt > 0) {
      const camX = this.cam.x;
      for (const s of r.shots) {
        if (!s.foe || Math.abs(s.x - camX) > 20 || Math.random() > dt * 40) continue;
        this.embers.emit(s.x, s.y, 0.05, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0, 0.35, 0.5, Math.random() < 0.5 ? "#ff7a3d" : "#ffb347");
      }
    }
    if (dt > 0 && p.grounded && playing && Math.random() < dt * 6) this.smoke.emit(px - 0.2, py + 0.05, (Math.random() - 0.5) * 0.4, -2, 0.5, 0, 0.35, 0.35, "#ddd5c8", 1.4);

    // The aim line, while you aim.
    const aiming = playing && !this.paused && (this.controls.aiming || (this.opts.autopilot && this.lastInput.fire));
    this.aimLine.visible = aiming;
    if (aiming) {
      this.aimLine.position.set(px + TUNING.gunX, py + TUNING.gunY, 0.4);
      this.aimLine.rotation.z = (r.aim * Math.PI) / 180;
      const color = weaponColor(r.weapon);
      for (const m of this.aimMats) m.color.set(color);
      for (const side of this.aimSides) side.visible = r.weapon === "spread";
    }

    // Your shadow on what's under you.
    const g = groundUnder(r.level, px);
    if (g !== null && g <= py + 0.01) {
      const h = py - g;
      this.shadow.visible = true;
      this.shadow.position.set(px, g + 0.02, 0);
      const s = Math.max(0.35, 1 - h * 0.08);
      this.shadow.scale.set(s, 1, s * 0.8);
      (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.06, 0.32 - h * 0.025);
    } else this.shadow.visible = false;

    // Everything else.
    const view = this.viewW() / 2 + 3;
    this.actors.update(r, this.prev, playing ? a : 1, Math.max(0, blended), this.t, dt, this.cam.x, view, motion);
    if (this.world.beacons) {
      const m = this.world.beacons.material as THREE.MeshBasicMaterial;
      m.opacity = Math.sin(this.t * 4.2) > 0 ? 1 : 0.25;
    }
    this.world.clouds.position.x = this.t * 0.9;
    this.walkerHit = Math.max(0, this.walkerHit - dt);

    if (dt > 0) {
      this.sparks.update(dt);
      this.embers.update(dt);
      this.smoke.update(dt);
    }
    const pxScale = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y / 2 / Math.tan((CAM.fov * Math.PI) / 360);
    this.sparks.setScale(pxScale);
    this.embers.setScale(pxScale);
    this.smoke.setScale(pxScale);

    this.renderer.render(this.scene, cam);
    // Where your gun is on screen (the mouse aims from here).
    {
      const v = this.tmp.set(px + TUNING.gunX, py + TUNING.gunY, 0).project(cam);
      this.controls.gun = { x: ((v.x + 1) / 2) * this.size.w, y: ((1 - v.y) / 2) * this.size.h };
    }

    if (this.opts.hud.score) this.opts.hud.score.textContent = r.score.toLocaleString("en-US");
    this.status();
    const dbg = this.opts.hud.debug;
    if (dbg) {
      const info = this.renderer.info.render;
      dbg.textContent = `${Math.round(this.fps)} fps · ${this.quality} ×${this.renderer.getPixelRatio()} · ${info.calls} calls · ${(info.triangles / 1000).toFixed(1)}k tris · x ${p.x.toFixed(1)} y ${p.y.toFixed(2)} vy ${p.vy.toFixed(1)}${p.grounded ? " · ground" : ""} · tick ${r.tick}`;
    }
  }
}
