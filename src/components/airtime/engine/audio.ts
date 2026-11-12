/**
 * Sound (client): small effects made in the browser with Web Audio, no files,
 * no music. The jetpack's roar follows how hard you're holding; short sounds
 * for each weapon, hits, defeats, pickups, a stomp and the level's end. Starts
 * after a tap (the browser's rule) and has a mute switch.
 */

let shared: AudioContext | null = null;

export class Sound {
  /** Call inside a tap or key press (the Play button) so sound can start. */
  static prime(): void {
    try {
      if (!shared) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) shared = new AC();
      }
      void shared?.resume();
    } catch {
      shared = null;
    }
  }

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private jet: GainNode | null = null;
  private jetFilter: BiquadFilterNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private muted: boolean;
  private lastShot = 0;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    Sound.prime();
    if (!shared) return;
    const ctx = shared;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // The jetpack: looping noise, band-passed into a roar.
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.jetFilter = ctx.createBiquadFilter();
    this.jetFilter.type = "bandpass";
    this.jetFilter.frequency.value = 700;
    this.jetFilter.Q.value = 0.8;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 2200;
    this.jet = ctx.createGain();
    this.jet.gain.value = 0;
    src.connect(this.jetFilter).connect(low).connect(this.jet).connect(this.master);
    src.start();
    this.sources.push(src);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.02);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  /** The jetpack's roar: 0 (off) to 1 (full). */
  thrust(level: number): void {
    if (!this.ctx || !this.jet || !this.jetFilter) return;
    const t = this.ctx.currentTime;
    this.jet.gain.setTargetAtTime(level * 0.16, t, level > 0 ? 0.03 : 0.08);
    this.jetFilter.frequency.setTargetAtTime(500 + level * 600, t, 0.05);
  }

  quiet(): void {
    this.thrust(0);
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType = "sine", vol = 0.16, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(at: number, dur: number, freq: number, vol: number, sweepTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  shot(kind: "blaster" | "spread" | "rapid"): void {
    const now = this.ctx?.currentTime ?? 0;
    if (now - this.lastShot < 0.03) return;
    this.lastShot = now;
    if (kind === "rapid") this.tone(1180, 0, 0.05, "square", 0.045, 880);
    else if (kind === "spread") this.tone(760, 0, 0.09, "sawtooth", 0.05, 380);
    else this.tone(980, 0, 0.07, "square", 0.05, 620);
  }

  impact(): void {
    this.hiss(0, 0.05, 2400, 0.05);
  }

  kill(big: boolean): void {
    this.hiss(0, big ? 0.32 : 0.2, 900, 0.2, 200);
    this.tone(big ? 220 : 300, 0, 0.22, "triangle", 0.12, 70);
  }

  stomp(): void {
    this.tone(240, 0, 0.18, "sine", 0.2, 620);
  }

  foeShot(): void {
    this.tone(520, 0, 0.18, "sine", 0.07, 240);
  }

  charge(): void {
    this.tone(300, 0, 0.3, "triangle", 0.035, 900);
  }

  hurt(): void {
    this.tone(160, 0, 0.3, "sawtooth", 0.14, 60);
    this.hiss(0, 0.2, 500, 0.18);
  }

  fall(): void {
    this.tone(660, 0, 0.5, "triangle", 0.12, 110);
  }

  land(speed: number): void {
    const v = Math.min(1, speed / 14);
    if (v < 0.2) return;
    this.tone(110, 0, 0.12, "sine", 0.1 * v + 0.04, 60);
  }

  pickup(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, i * 0.06, 0.16, "triangle", 0.14));
  }

  star(): void {
    this.tone(1568, 0, 0.09, "sine", 0.07);
    this.tone(2093, 0.04, 0.12, "sine", 0.05);
  }

  heart(): void {
    this.tone(660, 0, 0.18, "triangle", 0.15);
    this.tone(990, 0.1, 0.28, "triangle", 0.15);
  }

  cleared(): void {
    [523, 659, 784, 1046, 1319, 1568].forEach((f, i) => this.tone(f, i * 0.09, 0.3, "triangle", 0.16));
  }

  over(): void {
    [392, 330, 262].forEach((f, i) => this.tone(f, i * 0.18, 0.4, "triangle", 0.14));
  }

  /** Stops this run's sounds (the page keeps its audio context). */
  close(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    this.master?.disconnect();
    this.ctx = null;
  }
}
