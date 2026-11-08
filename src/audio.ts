const MASTER_VOLUME = 0.15;

export class BlizzardAudio {
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private masterGain: GainNode | null = null;
  private bodyFilter: BiquadFilterNode | null = null;
  private bodyGain: GainNode | null = null;
  private airFilter: BiquadFilterNode | null = null;
  private airGain: GainNode | null = null;
  private howlFilter1: BiquadFilterNode | null = null;
  private howlGain1: GainNode | null = null;
  private howlFilter2: BiquadFilterNode | null = null;
  private howlGain2: GainNode | null = null;
  private hissGain: GainNode | null = null;
  private whooshGain: GainNode | null = null;
  private nextGustTime = 0;
  private currentGustStrength = 0.3;
  private howlBaseFreq = 520;

  constructor() {
    const unlock = () => {
      this.init();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("wheel", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("wheel", unlock);
    window.addEventListener("keydown", unlock);
  }

  // Pink noise (Paul Kellett), cycled.
  private createPinkNoiseBuffer(ctx: AudioContext, seconds: number) {
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * seconds);
    const fade = Math.floor(sr * 0.5);
    const raw = new Float32Array(n + fade);

    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < raw.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    const buffer = ctx.createBuffer(1, n, sr);
    const out = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) {
      if (i < fade) {
        const t = i / fade;
        out[i] = raw[i]! * t + raw[n + i]! * (1 - t);
      } else {
        out[i] = raw[i]!;
      }
    }
    return buffer;
  }

  private makeSource(ctx: AudioContext, buffer: AudioBuffer, offset: number) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start(0, offset);
    return src;
  }

  private init() {
    if (this.ctx) return;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AudioContextClass();
    const ctx = this.ctx;

    const buffer = this.createPinkNoiseBuffer(ctx, 8);
    const noiseA = this.makeSource(ctx, buffer, 0);
    const noiseB = this.makeSource(ctx, buffer, 3.7);

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = MASTER_VOLUME;
    this.masterGain.connect(ctx.destination);

    // Wind
    this.bodyFilter = ctx.createBiquadFilter();
    this.bodyFilter.type = "lowpass";
    this.bodyFilter.frequency.value = 300;
    this.bodyGain = ctx.createGain();
    this.bodyGain.gain.value = 0.5;
    noiseA.connect(this.bodyFilter);
    this.bodyFilter.connect(this.bodyGain);
    this.bodyGain.connect(this.masterGain);

    // Air
    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = "bandpass";
    this.airFilter.frequency.value = 700;
    this.airFilter.Q.value = 0.6;
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0.2;
    noiseB.connect(this.airFilter);
    this.airFilter.connect(this.airGain);
    this.airGain.connect(this.masterGain);

    // Howls
    this.howlFilter1 = ctx.createBiquadFilter();
    this.howlFilter1.type = "bandpass";
    this.howlFilter1.Q.value = 10;
    this.howlFilter1.frequency.value = 520;
    this.howlGain1 = ctx.createGain();
    this.howlGain1.gain.value = 0;
    noiseA.connect(this.howlFilter1);
    this.howlFilter1.connect(this.howlGain1);
    this.howlGain1.connect(this.masterGain);

    this.howlFilter2 = ctx.createBiquadFilter();
    this.howlFilter2.type = "bandpass";
    this.howlFilter2.Q.value = 8;
    this.howlFilter2.frequency.value = 780;
    this.howlGain2 = ctx.createGain();
    this.howlGain2.gain.value = 0;
    noiseB.connect(this.howlFilter2);
    this.howlFilter2.connect(this.howlGain2);
    this.howlGain2.connect(this.masterGain);

    // Quiet hiss
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = "highpass";
    hissFilter.frequency.value = 3000;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0.02;
    noiseB.connect(hissFilter);
    hissFilter.connect(this.hissGain);
    this.hissGain.connect(this.masterGain);

    // Whoosh
    const whooshFilter = ctx.createBiquadFilter();
    whooshFilter.type = "bandpass";
    whooshFilter.frequency.value = 500;
    whooshFilter.Q.value = 0.7;
    this.whooshGain = ctx.createGain();
    this.whooshGain.gain.value = 0;
    noiseA.connect(whooshFilter);
    whooshFilter.connect(this.whooshGain);
    this.whooshGain.connect(this.masterGain);
  }

  public update(speed: number) {
    if (
      !this.ctx ||
      this.isMuted ||
      !this.bodyFilter ||
      !this.bodyGain ||
      !this.airFilter ||
      !this.airGain ||
      !this.howlFilter1 ||
      !this.howlGain1 ||
      !this.howlFilter2 ||
      !this.howlGain2
    )
      return;

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    const clampedSpeed = Math.min(Math.max(speed, 0), 1.5);

    if (now > this.nextGustTime) {
      this.currentGustStrength =
        Math.random() < 0.25 ? Math.random() * 0.2 : 0.3 + Math.random() * 0.7;
      this.howlBaseFreq = 420 + Math.random() * 380;
      this.nextGustTime = now + 2 + Math.random() * 4;

      this.howlFilter1.frequency.setTargetAtTime(this.howlBaseFreq, now, 1.2);
      this.howlFilter2.frequency.setTargetAtTime(
        this.howlBaseFreq * 1.47,
        now,
        1.5,
      );
    }

    const energy = Math.min(
      this.currentGustStrength * 0.55 + clampedSpeed * 0.45,
      1.2,
    );

    this.bodyGain.gain.setTargetAtTime(0.35 + energy * 0.45, now, 0.7);
    this.bodyFilter.frequency.setTargetAtTime(220 + energy * 260, now, 0.7);

    this.airGain.gain.setTargetAtTime(0.08 + energy * 0.3, now, 0.6);
    this.airFilter.frequency.setTargetAtTime(550 + energy * 600, now, 0.8);

    const howl = Math.max(0, energy - 0.45);
    this.howlGain1.gain.setTargetAtTime(howl * 0.09, now, 0.9);
    this.howlGain2.gain.setTargetAtTime(howl * 0.05, now, 1.1);
  }

  public triggerWhoosh() {
    if (!this.ctx || !this.whooshGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    this.whooshGain.gain.cancelScheduledValues(now);
    this.whooshGain.gain.setValueAtTime(this.whooshGain.gain.value, now);
    this.whooshGain.gain.linearRampToValueAtTime(0.025, now + 0.3);
    this.whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.isMuted ? 0 : MASTER_VOLUME,
        this.ctx.currentTime,
        0.05,
      );
    }
    return this.isMuted;
  }
}

export const windSound = new BlizzardAudio();
