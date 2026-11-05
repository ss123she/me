import * as THREE from "three";

export const SIM = {
  worldSize: 40, // Simulation world size.
  step: 1 / 60, // Fixed simmulation step.
  maxStepsPerFrame: 3,

  waveC2: 0.22, // Square of wave speed (cells/step)^2.
  damping: 0.988, // Wave speed damping.
  diffuse: 0.015, // Light diffusion of high frequency.

  bodyRadius: 0.6, // World body radius.
  bodyStrength: 0.3, // Body strength in water (How hard its presence affect water).
  depthMin: 0.1, // Dent of still body.
  depthMax: 0.3, // Dent of fast-moving body.
  speedForMaxDepth: 25,

  sleepAfter: 6, // Simulation sleep after this amount of seconds.
};

function createUniforms() {
  return {
    uCurrent: { value: null as THREE.Texture | null },
    uP0: { value: new THREE.Vector2() },
    uP1: { value: new THREE.Vector2() },
    uRadius: { value: SIM.bodyRadius / SIM.worldSize },
    uDepth: { value: SIM.depthMin },
    uActive: { value: 0 },
    uStrength: { value: SIM.bodyStrength },
    uC2: { value: SIM.waveC2 },
    uDamping: { value: SIM.damping },
    uDiffuse: { value: SIM.diffuse },
    uTexel: { value: 1 },
  };
}

export class WaveSimulation {
  public readonly size: number;
  public readonly worldSize = SIM.worldSize;

  private targetA: THREE.WebGLRenderTarget;
  private targetB: THREE.WebGLRenderTarget;
  private current: THREE.WebGLRenderTarget;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly quadGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly uniforms = createUniforms();

  private accumulator = 0;
  private hasPrev = false;
  private prevU = 0;
  private prevV = 0;
  private idle = 0;
  private asleep = false;

  constructor(size = 512) {
    this.size = size;
    this.uniforms.uTexel.value = 1 / size;

    const options: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
    };

    this.targetA = new THREE.WebGLRenderTarget(size, size, options);
    this.targetB = new THREE.WebGLRenderTarget(size, size, options);
    this.current = this.targetA;

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uCurrent;
        uniform vec2 uP0;       // Start of movement of segment (uv)
        uniform vec2 uP1;       // End of movement segment (uv)
        uniform float uRadius;  // Body radius (uv)
        uniform float uDepth;   // Dent of body
        uniform float uActive;
        uniform float uStrength;
        uniform float uC2;
        uniform float uDamping;
        uniform float uDiffuse;
        uniform float uTexel;
        varying vec2 vUv;

        float distToSegment(vec2 p, vec2 a, vec2 b) {
          vec2 ab = b - a;
          float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
          return length(p - (a + ab * t));
        }

        void main() {
          vec2 dx = vec2(uTexel, 0.0);
          vec2 dy = vec2(0.0, uTexel);

          float left   = texture2D(uCurrent, vUv - dx).r;
          float right  = texture2D(uCurrent, vUv + dx).r;
          float top    = texture2D(uCurrent, vUv + dy).r;
          float bottom = texture2D(uCurrent, vUv - dy).r;

          vec2 data = texture2D(uCurrent, vUv).rg;
          float cur = data.r;
          float prev = data.g;

          float sum = left + right + top + bottom;
          float lap = sum - 4.0 * cur;
          float next = cur + (cur - prev) * uDamping + uC2 * lap;
          next = mix(next, sum * 0.25, uDiffuse);

          // Body dents water below itself and raises small wave around.
          float bodyDelta = 0.0;
          if (uActive > 0.5) {
            float d = distToSegment(vUv, uP0, uP1) / uRadius;
            float d2 = d * d;
            float profile = (d2 - 1.0) * exp(-d2);
            float influence = 1.0 - smoothstep(1.2, 2.2, d);
            bodyDelta = (uDepth * profile - next) * uStrength * influence;
            next += bodyDelta;
          }

          next = clamp(next, -0.35, 0.35);

          // Border for waves to not reflect at edges.
          float border = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) *
                         smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
          next *= border;

          gl_FragColor = vec4(next, cur + bodyDelta, 0.0, 1.0);
        }
      `,
    });

    this.scene.add(new THREE.Mesh(this.quadGeometry, this.material));
  }

  /** Texture with heights: r = current, g = previous. */
  public get texture(): THREE.Texture {
    return this.current.texture;
  }

  public get awake(): boolean {
    return !this.asleep;
  }

  public update(
    renderer: THREE.WebGLRenderer,
    delta: number,
    bodyX: number,
    bodyZ: number,
    bodySpeed: number,
    active: boolean,
  ) {
    const u = bodyX / this.worldSize + 0.5;
    const v = bodyZ / this.worldSize + 0.5;

    if (!active) {
      this.hasPrev = false;
      this.idle += delta;
    } else {
      this.idle = 0;
      this.asleep = false;
      if (!this.hasPrev) {
        this.prevU = u;
        this.prevV = v;
        this.hasPrev = true;
      }
    }

    // Stop running simulation after inactivity.
    if (!active && this.idle > SIM.sleepAfter) {
      if (!this.asleep) {
        this.clearTargets(renderer);
        this.asleep = true;
        this.accumulator = 0;
      }
      return;
    }

    // FPS doesn't affect Water behaviour
    this.accumulator = Math.min(
      this.accumulator + delta,
      SIM.step * SIM.maxStepsPerFrame,
    );
    const steps = Math.floor(this.accumulator / SIM.step);
    if (steps === 0) return;
    this.accumulator -= steps * SIM.step;

    const speedK = Math.min(bodySpeed / SIM.speedForMaxDepth, 1);
    this.uniforms.uDepth.value =
      SIM.depthMin + (SIM.depthMax - SIM.depthMin) * speedK;
    this.uniforms.uActive.value = active ? 1 : 0;

    const previousTarget = renderer.getRenderTarget();

    for (let i = 0; i < steps; i++) {
      const a = i / steps;
      const b = (i + 1) / steps;
      this.uniforms.uP0.value.set(
        this.prevU + (u - this.prevU) * a,
        this.prevV + (v - this.prevV) * a,
      );
      this.uniforms.uP1.value.set(
        this.prevU + (u - this.prevU) * b,
        this.prevV + (v - this.prevV) * b,
      );
      this.uniforms.uCurrent.value = this.targetA.texture;

      renderer.setRenderTarget(this.targetB);
      renderer.render(this.scene, this.camera);

      const tmp = this.targetA;
      this.targetA = this.targetB;
      this.targetB = tmp;
    }

    renderer.setRenderTarget(previousTarget);
    this.current = this.targetA;

    if (active) {
      this.prevU = u;
      this.prevV = v;
    }
  }

  private clearTargets(renderer: THREE.WebGLRenderer) {
    const color = new THREE.Color();
    renderer.getClearColor(color);
    const alpha = renderer.getClearAlpha();
    const previousTarget = renderer.getRenderTarget();

    renderer.setClearColor(0x000000, 0);
    for (const t of [this.targetA, this.targetB]) {
      renderer.setRenderTarget(t);
      renderer.clear();
    }

    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(color, alpha);
  }

  public dispose() {
    this.targetA.dispose();
    this.targetB.dispose();
    this.quadGeometry.dispose();
    this.material.dispose();
  }
}
