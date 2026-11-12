/**
 * Controls (client): keyboard (arrows or WASD, Space or Shift to drift), a
 * game controller through the Gamepad API, and touch (hold the left or right
 * half of the screen to steer, a Drift button; the kart drives itself on a
 * phone). Read once per physics step.
 */

import type { KartInput } from "@/lib/kart/physics";

export type InputMode = "keyboard" | "touch" | "pad";

const KEYS_LEFT = new Set(["ArrowLeft", "KeyA"]);
const KEYS_RIGHT = new Set(["ArrowRight", "KeyD"]);
const KEYS_GAS = new Set(["ArrowUp", "KeyW"]);
const KEYS_BRAKE = new Set(["ArrowDown", "KeyS"]);
const KEYS_DRIFT = new Set(["Space", "ShiftLeft", "ShiftRight", "KeyJ"]);
/** Keys the race uses, so the page doesn't scroll on them. */
export const GAME_KEYS = new Set([...KEYS_LEFT, ...KEYS_RIGHT, ...KEYS_GAS, ...KEYS_BRAKE, ...KEYS_DRIFT]);

export class Controls {
  private keys = new Set<string>();
  /** Touch pointers on each half, by pointer id. */
  private halves = new Map<number, -1 | 1>();
  driftHeld = false;
  mode: InputMode;
  private padIndex: number | null = null;
  private padPause = false;
  onPause: (() => void) | null = null;

  constructor(touchFirst: boolean) {
    this.mode = touchFirst ? "touch" : "keyboard";
  }

  keyDown(code: string): void {
    this.keys.add(code);
    this.mode = "keyboard";
  }

  keyUp(code: string): void {
    this.keys.delete(code);
  }

  /** A finger on one half of the screen. */
  touch(id: number, side: -1 | 1 | null): void {
    if (side === null) this.halves.delete(id);
    else this.halves.set(id, side);
    this.mode = "touch";
  }

  drift(on: boolean, fromTouch = true): void {
    this.driftHeld = on;
    if (fromTouch) this.mode = "touch";
  }

  /** Lets go of everything (the tab was hidden, the race paused). */
  clear(): void {
    this.keys.clear();
    this.halves.clear();
    this.driftHeld = false;
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

  read(): KartInput {
    let steer = 0;
    let gas = false;
    let brake = false;
    let drift = this.driftHeld;
    for (const c of this.keys) {
      if (KEYS_LEFT.has(c)) steer -= 1;
      if (KEYS_RIGHT.has(c)) steer += 1;
      if (KEYS_GAS.has(c)) gas = true;
      if (KEYS_BRAKE.has(c)) brake = true;
      if (KEYS_DRIFT.has(c)) drift = true;
    }
    let left = false;
    let right = false;
    for (const side of this.halves.values()) {
      if (side < 0) left = true;
      else right = true;
    }
    if (left) steer -= 1;
    if (right) steer += 1;

    const p = this.pad();
    if (p) {
      const b = (i: number) => p.buttons[i]?.pressed ?? false;
      const v = (i: number) => p.buttons[i]?.value ?? 0;
      const ax = p.axes[0] ?? 0;
      const stick = Math.abs(ax) > 0.18 ? (ax - Math.sign(ax) * 0.18) / 0.82 : 0;
      const dpad = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
      const padGas = b(0) || v(7) > 0.3;
      const padBrake = b(1) || v(6) > 0.3;
      const padDrift = b(5) || b(4) || b(2);
      if (stick !== 0 || dpad !== 0 || padGas || padBrake || padDrift) this.mode = "pad";
      steer += stick + dpad;
      gas = gas || padGas;
      brake = brake || padBrake;
      drift = drift || padDrift;
      const start = b(9);
      if (start && !this.padPause) this.onPause?.();
      this.padPause = start;
    }

    // On a phone the kart drives itself.
    if (this.mode === "touch") gas = true;
    return { steer: Math.max(-1, Math.min(1, steer)), gas, brake, drift, assist: this.mode === "touch" };
  }
}
