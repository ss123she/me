import type * as THREE from "three";

export interface AdaptiveResolutionOptions {
  /** Max border of pixel ratio. Default: min(devicePixelRatio, 2). */
  maxRatio?: number;
  /** Min border of pixel ratio. Default: 0.5. */
  minRatio?: number;
  /** Default: 0.15. */
  step?: number;
  /** Target fps. Default: 60. */
  targetFps?: number;
}

export class AdaptiveResolution {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly minRatio: number;
  private readonly step: number;
  private readonly budget: number;

  private ratio: number;
  private ceiling: number;
  private ema: number;
  private warmup = 1.5;
  private slowTime = 0;
  private fastTime = 0;
  private lockTime = 0;
  private sinceUp = Infinity;

  constructor(
    renderer: THREE.WebGLRenderer,
    options: AdaptiveResolutionOptions = {},
  ) {
    this.renderer = renderer;
    const maxRatio =
      options.maxRatio ?? Math.min(window.devicePixelRatio || 1, 2);
    this.minRatio = options.minRatio ?? 0.5;
    this.step = options.step ?? 0.15;
    this.budget = 1 / (options.targetFps ?? 60);
    this.ema = this.budget;

    this.ceiling = maxRatio;
    this.ratio = Math.min(maxRatio, 1);
    this.apply();
  }

  public get pixelRatio(): number {
    return this.ratio;
  }

  public update(delta: number) {
    if (delta <= 0 || delta > 0.25) return;
    if (this.warmup > 0) {
      this.warmup -= delta;
      return;
    }

    this.ema += (delta - this.ema) * 0.1;
    this.sinceUp += delta;
    this.lockTime = Math.max(0, this.lockTime - delta);

    if (this.ema > this.budget * 1.2) {
      this.slowTime += delta;
      this.fastTime = 0;
    } else if (this.ema < this.budget * 1.05) {
      this.fastTime += delta;
      this.slowTime = 0;
    } else {
      this.slowTime = 0;
      this.fastTime = 0;
    }

    if (this.slowTime > 0.8 && this.ratio > this.minRatio) {
      const justWentUp = this.sinceUp < 6;
      this.ratio = Math.max(this.minRatio, this.ratio - this.step);
      if (justWentUp) this.ceiling = this.ratio;
      this.slowTime = 0;
      this.fastTime = 0;
      this.lockTime = 10;
      this.apply();
      return;
    }

    if (this.fastTime > 6 && this.lockTime === 0 && this.ratio < this.ceiling) {
      this.ratio = Math.min(this.ceiling, this.ratio + this.step);
      this.sinceUp = 0;
      this.fastTime = 0;
      this.lockTime = 10;
      this.apply();
    }
  }

  private apply() {
    this.ratio = Math.round(this.ratio * 100) / 100;
    this.renderer.setPixelRatio(this.ratio);
  }
}
