const MASTER_VOLUME = 0.3;
const TICK_INTERVAL = 0.022;
const MAX_BACKLOG = 0.12;
const PITCH = 0.5;

export class TextTickAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private tone: BiquadFilterNode | null = null;
  private input: AudioNode | null = null;
  private isMuted = false;
  private nextTickTime = 0;
  private drift = 0;

  constructor() {
    const events = ["pointerdown", "click", "touchend", "keydown"] as const;
    const unlock = () => {
      this.init();
      this.ctx?.resume().then(() => {
        if (this.ctx?.state === "running") {
          for (const e of events) window.removeEventListener(e, unlock);
        }
      });
    };
    for (const e of events) window.addEventListener(e, unlock);
  }

  private init() {
    if (this.ctx) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AudioContextClass();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.isMuted ? 0 : MASTER_VOLUME;
    this.master.connect(this.ctx.destination);

    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3000 * PITCH;

    hp.connect(this.master);
    this.input = hp;

    this.tone = this.ctx.createBiquadFilter();
    this.tone.type = "bandpass";
    this.tone.frequency.value = 6000 * PITCH;
    this.tone.Q.value = 0.8;
    this.tone.connect(this.master);
  }

  private scheduleTick(when: number, strength: number) {
    if (!this.ctx || !this.input) return;

    this.drift = Math.max(
      -1,
      Math.min(1, this.drift + (Math.random() - 0.5) * 0.6),
    );

    const pitchVar = Math.pow(
      2,
      this.drift * 0.2 + (Math.random() - 0.5) * 0.15,
    );

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const bp = this.ctx.createBiquadFilter();

    osc.type = Math.random() < 0.7 ? "triangle" : "square";

    const f = (4500 + Math.random() * 3000) * PITCH * pitchVar;
    osc.frequency.setValueAtTime(f, when);
    osc.frequency.exponentialRampToValueAtTime(
      f * (0.85 + Math.random() * 0.1),
      when + 0.008,
    );

    bp.type = "bandpass";
    bp.frequency.value = (5000 + Math.random() * 2500) * PITCH * pitchVar;
    bp.Q.value = 0.5 + Math.random() * 0.7;

    const decay = 0.01 + Math.random() * 0.01;
    const vol = (0.5 + Math.random() * 0.5) * strength;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.0005);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);

    osc.connect(gain);
    gain.connect(bp);
    bp.connect(this.input);
    osc.start(when);
    osc.stop(when + decay + 0.01);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      bp.disconnect();
    };
  }

  public tick(count = 1, strength = 1) {
    if (!this.ctx || this.isMuted || count <= 0) return;
    if (this.ctx.state === "suspended") this.ctx.resume();

    const now = this.ctx.currentTime;
    if (this.nextTickTime < now) this.nextTickTime = now;

    for (let i = 0; i < count; i++) {
      if (this.nextTickTime > now + MAX_BACKLOG) break;
      this.scheduleTick(this.nextTickTime, strength);
      this.nextTickTime += TICK_INTERVAL * (0.8 + Math.random() * 0.5);
    }
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        this.isMuted ? 0 : MASTER_VOLUME,
        this.ctx.currentTime,
        0.05,
      );
    }
    return this.isMuted;
  }
}

export const tickSound = new TextTickAudio();
