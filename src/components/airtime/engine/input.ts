/**
 * Controls (client): fly, fire and aim, read once per sim step.
 *
 *   Phone       hold the left half to fly (the Fly button marks the spot); the right half is a
 *               floating fire stick: press to fire, drag to aim, let go to stop
 *   Keyboard    Space, W or Up to fly; J fires; I and K turn the aim up and down
 *   Mouse       aims from your gun to the pointer; hold the left button to fire
 *   Controller  A or the left trigger flies; the right stick aims; the right trigger or bumper fires
 *
 * Aim is degrees, 0 straight ahead, 90 up, -90 down: you always face forward, so anything behind
 * you clamps to straight up or straight down. The sim rounds it to whole degrees.
 */

import type { Input } from "@/lib/airtime/sim";

const FLY_KEYS = new Set(["Space", "ArrowUp", "KeyW"]);
const FIRE_KEYS = new Set(["KeyJ"]);
const AIM_KEYS: Record<string, number> = { KeyI: 1, KeyK: -1 };
/** Keys the game uses, so the page doesn't scroll or type on them. */
export const GAME_KEYS = new Set([...FLY_KEYS, ...FIRE_KEYS, ...Object.keys(AIM_KEYS)]);

/** The fire stick: how far the knob travels (CSS px), and how far a thumb moves before it aims. */
export const STICK = { reach: 44, dead: 10 };
/** I and K turn the aim this many degrees a step (120 a second). */
const NUDGE = 2;

export type AimSource = "keys" | "mouse" | "stick" | "pad";

/** Degrees from a screen vector (x right, y down), clamped to the front half circle. */
export function aimFromScreen(dx: number, dy: number): number {
  const deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  return Math.max(-90, Math.min(90, deg));
}

interface Stick {
  id: number;
  /** Where the thumb landed, and how far it has moved from there (CSS px). */
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  dragged: boolean;
}

export class Controls {
  private flyKeys = new Set<string>();
  private fireKeys = new Set<string>();
  private aimKeys = new Set<string>();
  private flyTouches = new Set<number>();
  private mouseDown = false;
  private mouse: { x: number; y: number } | null = null;
  private padIndex: number | null = null;
  private padPause = false;
  private padAiming = false;
  stick: Stick | null = null;
  /** Your gun on screen (CSS px within the game view), set by the engine each frame. */
  gun: { x: number; y: number } | null = null;
  /** The aim in degrees (the sim rounds it). */
  aim = 0;
  source: AimSource = "keys";
  onPause: (() => void) | null = null;

  keyDown(code: string): void {
    if (FLY_KEYS.has(code)) this.flyKeys.add(code);
    if (FIRE_KEYS.has(code)) this.fireKeys.add(code);
    if (code in AIM_KEYS) {
      this.aimKeys.add(code);
      this.source = "keys";
    }
  }

  keyUp(code: string): void {
    this.flyKeys.delete(code);
    this.fireKeys.delete(code);
    this.aimKeys.delete(code);
  }

  /** A finger on the left half (fly). */
  fly(id: number, on: boolean): void {
    if (on) this.flyTouches.add(id);
    else this.flyTouches.delete(id);
  }

  /** A thumb lands on the right half: the stick starts where it lands, firing straight ahead until it's dragged. */
  stickStart(id: number, x: number, y: number): void {
    this.stick = { id, ox: x, oy: y, dx: 0, dy: 0, dragged: false };
    this.aim = 0;
    this.source = "stick";
  }

  /** The thumb moves: returns the knob's offset (clamped to the stick's reach). */
  stickMove(id: number, x: number, y: number): { x: number; y: number } {
    const s = this.stick;
    if (!s || s.id !== id) return { x: 0, y: 0 };
    s.dx = x - s.ox;
    s.dy = y - s.oy;
    const d = Math.hypot(s.dx, s.dy);
    if (d > STICK.dead) {
      s.dragged = true;
      this.aim = aimFromScreen(s.dx, s.dy);
    }
    const k = d > STICK.reach ? STICK.reach / d : 1;
    return { x: s.dx * k, y: s.dy * k };
  }

  stickEnd(id: number): void {
    if (this.stick?.id === id) this.stick = null;
  }

  mouseMove(x: number, y: number): void {
    this.mouse = { x, y };
    this.source = "mouse";
  }

  mouseFire(on: boolean): void {
    this.mouseDown = on;
    if (on) this.source = "mouse";
  }

  /** Lets go of everything (paused, the tab hidden, a card opened). */
  clear(): void {
    this.flyKeys.clear();
    this.fireKeys.clear();
    this.aimKeys.clear();
    this.flyTouches.clear();
    this.mouseDown = false;
    this.stick = null;
  }

  /** Aiming right now (the thumb on the stick, fire held, or the right stick pushed): show the aim line. */
  get aiming(): boolean {
    return this.stick !== null || this.mouseDown || this.fireKeys.size > 0 || this.padAiming;
  }

  private pad(): Gamepad | null {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this.padIndex !== null && pads[this.padIndex]) return pads[this.padIndex];
    for (const p of pads) {
      if (p && p.connected) {
        this.padIndex = p.index;
        return p;
      }
    }
    return null;
  }

  read(): Input {
    let hold = this.flyKeys.size > 0 || this.flyTouches.size > 0;
    let fire = this.fireKeys.size > 0 || this.mouseDown || this.stick !== null;
    // I and K turn the aim.
    let nudge = 0;
    for (const k of this.aimKeys) nudge += AIM_KEYS[k];
    if (nudge) this.aim = Math.max(-90, Math.min(90, this.aim + nudge * NUDGE));
    // The mouse aims from your gun.
    if (this.source === "mouse" && this.mouse && this.gun) {
      const dx = this.mouse.x - this.gun.x;
      const dy = this.mouse.y - this.gun.y;
      if (Math.hypot(dx, dy) > 8) this.aim = aimFromScreen(dx, dy);
    }
    const p = this.pad();
    this.padAiming = false;
    if (p) {
      const b = (i: number) => p.buttons[i]?.pressed ?? false;
      const v = (i: number) => p.buttons[i]?.value ?? 0;
      hold = hold || b(0) || v(6) > 0.3;
      const padFire = v(7) > 0.3 || b(5);
      fire = fire || padFire;
      const ax = p.axes[2] ?? 0;
      const ay = p.axes[3] ?? 0;
      if (Math.hypot(ax, ay) > 0.35) {
        this.aim = aimFromScreen(ax, ay);
        this.source = "pad";
        this.padAiming = true;
      }
      if (padFire) this.padAiming = true;
      const start = b(9);
      if (start && !this.padPause) this.onPause?.();
      this.padPause = start;
    }
    return { hold, fire, aim: this.aim };
  }
}
