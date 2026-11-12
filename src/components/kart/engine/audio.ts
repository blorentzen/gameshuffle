/**
 * Sound (client): our own effects made with Web Audio, no files and no music.
 * An engine hum that follows speed, a squeal while drifting, a rumble on the
 * grass, countdown beeps, a lap chime and a few bumps. It only starts after a
 * tap (the browser's rule) and has a mute switch.
 */

/** One audio context for the page, opened on the first tap (iPhones only allow it inside a tap). */
let shared: AudioContext | null = null;

export class Sound {
  /** Call inside a tap or key press (the Race button) so sound can play once the race starts. */
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
  private sources: AudioScheduledSourceNode[] = [];
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private squeal: GainNode | null = null;
  private squealFilter: BiquadFilterNode | null = null;
  private rumble: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted: boolean;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  /** Call from a tap or key press. */
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
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(ctx.destination);

    // Noise for the squeal, the grass and the bumps.
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 500;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = "sawtooth";
    this.osc2 = ctx.createOscillator();
    this.osc2.type = "square";
    this.osc1.frequency.value = 50;
    this.osc2.frequency.value = 25;
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    this.osc1.connect(this.filter);
    this.osc2.connect(g2).connect(this.filter);
    this.filter.connect(this.engineGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();
    this.sources.push(this.osc1, this.osc2);

    const loop = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master!);
      src.start();
      this.sources.push(src);
      return { g, f };
    };
    const sq = loop("bandpass", 2300, 7);
    this.squeal = sq.g;
    this.squealFilter = sq.f;
    this.rumble = loop("lowpass", 260, 1).g;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.02);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  /** Engine, squeal and rumble levels for this frame. */
  drive(speedShare: number, revving: boolean, drifting: number, grass: boolean, boosting: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.osc1 || !this.osc2 || !this.filter || !this.engineGain || !this.squeal || !this.rumble || !this.squealFilter) return;
    const t = ctx.currentTime;
    const s = Math.max(0, Math.min(1.4, speedShare));
    const f = 48 + s * 120 + (boosting ? 26 : 0) + (revving ? 8 : 0);
    this.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f / 2, t, 0.05);
    this.filter.frequency.setTargetAtTime(380 + s * 900 + (boosting ? 500 : 0), t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.05 + s * 0.06, t, 0.08);
    this.squeal.gain.setTargetAtTime(drifting > 0 ? 0.035 + drifting * 0.012 : 0, t, 0.04);
    this.squealFilter.frequency.setTargetAtTime(2100 + drifting * 500, t, 0.05);
    this.rumble.gain.setTargetAtTime(grass && s > 0.1 ? 0.12 * s : 0, t, 0.06);
  }

  /** Silences the engine (paused, finished). */
  quiet(): void {
    if (!this.ctx || !this.engineGain || !this.squeal || !this.rumble) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0, t, 0.1);
    this.squeal.gain.setTargetAtTime(0, t, 0.05);
    this.rumble.gain.setTargetAtTime(0, t, 0.05);
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType = "sine", vol = 0.18, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(at: number, dur: number, freq: number, vol: number, sweepTo?: number): void {
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

  beep(): void {
    this.tone(523, 0, 0.18, "square", 0.12);
  }

  go(): void {
    this.tone(1046, 0, 0.45, "square", 0.14);
  }

  lap(): void {
    this.tone(784, 0, 0.18, "triangle", 0.2);
    this.tone(988, 0.09, 0.18, "triangle", 0.2);
    this.tone(1319, 0.18, 0.3, "triangle", 0.2);
  }

  finish(): void {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, i * 0.11, 0.26, "triangle", 0.2));
  }

  boost(big: boolean): void {
    this.burst(0, big ? 0.6 : 0.4, 500, 0.25, 2600);
    this.tone(220, 0, big ? 0.5 : 0.35, "sawtooth", 0.06, 660);
  }

  spark(tier: number): void {
    this.tone(tier === 2 ? 1568 : 1175, 0, 0.12, "square", 0.07);
  }

  bump(strength: number): void {
    const v = Math.min(1, strength / 200);
    this.tone(90, 0, 0.22, "sine", 0.25 * v + 0.08, 50);
    this.burst(0, 0.12, 400, 0.15 * v + 0.05);
  }

  land(): void {
    this.tone(120, 0, 0.16, "sine", 0.18, 60);
  }

  /** Stops this race's sounds (the page keeps its audio context for the next race). */
  close(): void {
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    this.master?.disconnect();
    this.ctx = null;
  }
}
