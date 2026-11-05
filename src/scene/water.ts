import * as THREE from "three";
import { WaveSimulation } from "./wave-sim";

export const WATER_DEPTH = 1.2;
// Average of exp(sin(x)-1) = e^-1 * I0(1) ≈ 0.466
const MEAN_WAVE_LEVEL = 0.466;
const SURFACE_Y = WATER_DEPTH * (MEAN_WAVE_LEVEL - 1.0);
// How fast body follows cursor (1/s).
const BODY_FOLLOW = 1 / 0.045;

export type Quality = "high" | "low";

interface Preset {
  simSize: number; // Resolution of simulation
  raymarchSteps: number; // Maximum raymarch steps
  raymarchIter: number; // Amount of octaves
  raymarchIterFar: number; // Amount of octaves far
  normalIter: number; // Amount of octaves of waves
  normalIterFar: number; // Amount of octaves of waves far
  farCutoff: number; // Further - early exit
}

const PRESETS: Record<Quality, Preset> = {
  high: {
    simSize: 512,
    raymarchSteps: 32,
    raymarchIter: 10,
    raymarchIterFar: 5,
    normalIter: 18,
    normalIterFar: 8,
    farCutoff: 220,
  },
  low: {
    simSize: 256,
    raymarchSteps: 18,
    raymarchIter: 6,
    raymarchIterFar: 3,
    normalIter: 10,
    normalIterFar: 5,
    farCutoff: 120,
  },
};

export function detectQuality(): Quality {
  if (
    typeof matchMedia === "function" &&
    matchMedia("(pointer: coarse)").matches
  ) {
    return "low";
  }
  return "high";
}

type OceanUniforms = {
  iTime: THREE.IUniform<number>;
  uProjectionInverse: THREE.IUniform<THREE.Matrix4>;
  uMatrixWorld: THREE.IUniform<THREE.Matrix4>;
  uWaveTexture: THREE.IUniform<THREE.Texture>;
  uSimWorldSize: THREE.IUniform<number>;
  uSimRes: THREE.IUniform<number>;
  uWakeOn: THREE.IUniform<number>;
};

export class OceanWorld {
  public readonly mesh: THREE.Mesh;
  public readonly waveSim: WaveSimulation;

  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly uniforms: OceanUniforms;

  private readonly raycaster = new THREE.Raycaster();
  private readonly mouseNdc = new THREE.Vector2();
  private pointerInside = false;
  private readonly target = new THREE.Vector2();
  private readonly body = new THREE.Vector2();
  private readonly bodyPrev = new THREE.Vector2();
  private bodyReady = false;

  private readonly onPointerMove = (e: PointerEvent) => {
    this.mouseNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.pointerInside = true;
  };
  private readonly onPointerLeave = () => {
    this.pointerInside = false;
  };
  private readonly onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") this.pointerInside = false;
  };

  constructor(
    camera: THREE.PerspectiveCamera,
    quality: Quality = detectQuality(),
  ) {
    this.camera = camera;
    const p = PRESETS[quality];

    this.waveSim = new WaveSimulation(p.simSize);
    this.geometry = new THREE.PlaneGeometry(2, 2);

    this.uniforms = {
      iTime: { value: 0 },
      uProjectionInverse: { value: new THREE.Matrix4() },
      uMatrixWorld: { value: new THREE.Matrix4() },
      uWaveTexture: { value: this.waveSim.texture },
      uSimWorldSize: { value: this.waveSim.worldSize },
      uSimRes: { value: this.waveSim.size },
      uWakeOn: { value: 1 },
    };

    this.material = new THREE.ShaderMaterial({
      depthWrite: false,
      depthTest: false,
      uniforms: this.uniforms,
      defines: {
        RAYMARCH_STEPS: p.raymarchSteps,
        ITER_RAYMARCH: p.raymarchIter,
        ITER_RAYMARCH_FAR: p.raymarchIterFar,
        ITER_NORMAL: p.normalIter,
        ITER_NORMAL_FAR: p.normalIterFar,
        FAR_CUTOFF: p.farCutoff.toFixed(1),
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 1.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float iTime;
        uniform mat4 uProjectionInverse;
        uniform mat4 uMatrixWorld;

        uniform sampler2D uWaveTexture;
        uniform float uSimWorldSize;
        uniform float uSimRes;
        uniform float uWakeOn;

        #define DRAG_MULT 0.38
        #define WATER_DEPTH ${WATER_DEPTH.toFixed(3)}
        #define WATER_TOP 0.3
        #define MEAN_Y (${SURFACE_Y.toFixed(3)})

        vec2 wavedx(vec2 position, vec2 direction, float frequency, float timeshift) {
          float x = dot(direction, position) * frequency + timeshift;
          float wave = exp(sin(x) - 1.0);
          float dx = wave * cos(x);
          return vec2(wave, -dx);
        }

        float sampleBicubic(vec2 uv) {
          vec2 coord = uv * uSimRes - 0.5;
          vec2 idx = floor(coord);
          vec2 f = coord - idx;

          vec2 w0 = (1.0 / 6.0) * (f * (f * (-f + 3.0) - 3.0) + 1.0);
          vec2 w1 = (1.0 / 6.0) * (f * f * (3.0 * f - 6.0) + 4.0);
          vec2 w2 = (1.0 / 6.0) * (f * (f * (-3.0 * f + 3.0) + 3.0) + 1.0);
          vec2 w3 = (1.0 / 6.0) * (f * f * f);

          vec2 g0 = w0 + w1;
          vec2 g1 = w2 + w3;
          vec2 p0 = (idx + (w1 / g0 - 1.0) + 0.5) / uSimRes;
          vec2 p1 = (idx + (w3 / g1 + 1.0) + 0.5) / uSimRes;

          float t00 = texture2D(uWaveTexture, vec2(p0.x, p0.y)).r;
          float t10 = texture2D(uWaveTexture, vec2(p1.x, p0.y)).r;
          float t01 = texture2D(uWaveTexture, vec2(p0.x, p1.y)).r;
          float t11 = texture2D(uWaveTexture, vec2(p1.x, p1.y)).r;

          float row0 = mix(t10, t00, g0.x);
          float row1 = mix(t11, t01, g0.x);
          return mix(row1, row0, g0.y);
        }

        float getSimulatedWaves(vec2 pos, bool smoothSample) {
          if (uWakeOn < 0.5) return 0.0;
          vec2 uv = pos / uSimWorldSize + 0.5;
          if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return 0.0;
          if (smoothSample) return sampleBicubic(uv);
          return texture2D(uWaveTexture, uv).r;
        }

        float getwaves(vec2 position, int iterations, bool smoothSample) {
          vec2 simPos = position;

          float wavePhaseShift = length(position) * 0.1;
          float iter = 0.0;
          float frequency = 0.8;
          float timeMultiplier = 2.0;
          float weight = 1.0;
          float sumOfValues = 0.0;
          float sumOfWeights = 0.0;

          for (int i = 0; i < iterations; i++) {
            vec2 p = vec2(sin(iter), cos(iter));
            vec2 res = wavedx(position, p, frequency, iTime * timeMultiplier + wavePhaseShift);

            position += p * res.y * weight * DRAG_MULT;

            sumOfValues += res.x * weight;
            sumOfWeights += weight;

            weight = mix(weight, 0.0, 0.2);
            frequency *= 1.18;
            timeMultiplier *= 1.07;
            iter += 1232.399;
          }

          float ocean = sumOfValues / sumOfWeights;
          float wake = getSimulatedWaves(simPos, smoothSample) / WATER_DEPTH;
          return ocean + wake;
        }

        float raymarchwater(vec3 camera, vec3 start, vec3 end, float depth) {
          vec3 pos = start;
          vec3 dir = normalize(end - start);

          float startDist = distance(start, camera);
          int iters = int(mix(float(ITER_RAYMARCH), float(ITER_RAYMARCH_FAR),
                              smoothstep(30.0, FAR_CUTOFF, startDist)));

          for (int i = 0; i < RAYMARCH_STEPS; i++) {
            float height = getwaves(pos.xz, iters, false) * depth - depth;
            if (height + 0.01 > pos.y) return distance(pos, camera);
            pos += dir * (pos.y - height);
          }
          return distance(start, camera);
        }

        vec3 normal(vec2 pos, float e, float depth, int iters, bool smoothSample) {
          vec2 ex = vec2(e, 0.0);
          float H = getwaves(pos.xy, iters, smoothSample) * depth;
          vec3 a = vec3(pos.x, H, pos.y);
          return normalize(
            cross(
              a - vec3(pos.x - e, getwaves(pos.xy - ex.xy, iters, smoothSample) * depth, pos.y),
              a - vec3(pos.x, getwaves(pos.xy + ex.yx, iters, smoothSample) * depth, pos.y + e)
            )
          );
        }

        vec3 getSunDirection() {
          return normalize(vec3(-0.08, 0.35 + sin(iTime * 0.15 + 2.6) * 0.25, 0.58));
        }

        vec3 extra_cheap_atmosphere(vec3 raydir, vec3 sundir) {
          float special_trick = 1.0 / (raydir.y * 1.0 + 0.1);
          float special_trick2 = 1.0 / (sundir.y * 11.0 + 1.0);
          float raysundt = pow(abs(dot(sundir, raydir)), 2.0);
          float sundt = pow(max(0.0, dot(sundir, raydir)), 8.0);
          vec3 suncolor = mix(vec3(1.0), max(vec3(0.0), vec3(1.0) - vec3(5.5, 13.0, 22.4) / 22.4), special_trick2);
          vec3 bluesky = vec3(5.5, 13.0, 22.4) / 22.4 * suncolor;
          vec3 bluesky2 = max(vec3(0.0), bluesky - vec3(5.5, 13.0, 22.4) * 0.002 * (special_trick + -6.0 * sundir.y * sundir.y));
          bluesky2 *= special_trick * (0.24 + raysundt * 0.24);
          return bluesky2 * (1.0 + 1.0 * pow(1.0 - raydir.y, 3.0));
        }

        vec3 getAtmosphere(vec3 dir) {
          return extra_cheap_atmosphere(dir, getSunDirection()) * 0.5;
        }

        float getSun(vec3 dir) {
          return pow(max(0.0, dot(dir, getSunDirection())), 600.0) * 160.0;
        }

        float intersectPlane(vec3 origin, vec3 direction, vec3 point, vec3 norm) {
          return clamp(dot(point - origin, norm) / dot(direction, norm), -1.0, 999999.0);
        }

        vec3 getRay(vec2 uv) {
          vec2 ndc = uv * 2.0 - 1.0;
          vec4 target = uProjectionInverse * vec4(ndc.x, ndc.y, 1.0, 1.0);
          vec3 rayView = target.xyz / target.w;
          return normalize((uMatrixWorld * vec4(normalize(rayView), 0.0)).xyz);
        }

        void main() {
          vec3 ray = getRay(vUv);
          vec3 origin = cameraPosition;

          // Early exit
          if (ray.y >= 0.0) {
            vec3 C = getAtmosphere(ray) + getSun(ray);
            gl_FragColor = vec4(C * 2.0, 1.0);
            return;
          }

          vec3 up = vec3(0.0, 1.0, 0.0);
          vec3 waterPlaneHigh = vec3(0.0, WATER_TOP, 0.0);
          vec3 waterPlaneLow = vec3(0.0, -WATER_DEPTH, 0.0);

          float highPlaneHit = intersectPlane(origin, ray, waterPlaneHigh, up);

          float dist;
          vec3 N;

          if (highPlaneHit > FAR_CUTOFF) {
            // Early exit
            dist = intersectPlane(origin, ray, vec3(0.0, MEAN_Y, 0.0), up);
            N = up;
          } else {
            float lowPlaneHit = intersectPlane(origin, ray, waterPlaneLow, up);
            vec3 highHitPos = origin + ray * highPlaneHit;
            vec3 lowHitPos = origin + ray * lowPlaneHit;

            dist = raymarchwater(origin, highHitPos, lowHitPos, WATER_DEPTH);
            vec3 hit = origin + ray * dist;

            int itN = int(mix(float(ITER_NORMAL), float(ITER_NORMAL_FAR),
                              smoothstep(20.0, FAR_CUTOFF, dist)));
            N = normal(hit.xz, 0.01, WATER_DEPTH, itN, dist < 80.0);

            float flatten = clamp(
              0.8 * min(1.0, sqrt(dist * 0.01) * 1.1)
                + 0.2 * smoothstep(0.5 * FAR_CUTOFF, FAR_CUTOFF, dist),
              0.0, 1.0);
            N = mix(N, up, flatten);
          }

          vec3 waterHitPos = origin + ray * dist;

          float fresnel = 0.04 + (1.0 - 0.04) * pow(1.0 - max(0.0, dot(-N, ray)), 5.0);

          vec3 R = normalize(reflect(ray, N));
          R.y = abs(R.y);

          vec3 reflection = getAtmosphere(R) + getSun(R);
          vec3 scattering = vec3(0.0293, 0.0698, 0.1717) * 0.1 * (0.2 + (waterHitPos.y + WATER_DEPTH) / WATER_DEPTH);

          vec3 C = fresnel * reflection + scattering;
          gl_FragColor = vec4(C * 2.0, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;

    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerdown", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerLeave);
    document.documentElement.addEventListener(
      "pointerleave",
      this.onPointerLeave,
    );
    window.addEventListener("blur", this.onPointerLeave);
  }

  public update(renderer: THREE.WebGLRenderer, delta: number) {
    const dt = THREE.MathUtils.clamp(delta, 1 / 240, 0.1);

    this.uniforms.iTime.value += delta;
    this.camera.updateMatrixWorld();
    this.uniforms.uProjectionInverse.value.copy(
      this.camera.projectionMatrixInverse,
    );
    this.uniforms.uMatrixWorld.value.copy(this.camera.matrixWorld);

    // Where cursor points on water surface
    let active = false;
    if (this.pointerInside) {
      this.raycaster.setFromCamera(this.mouseNdc, this.camera);
      const { origin, direction } = this.raycaster.ray;

      if (direction.y < -0.02 && origin.y > SURFACE_Y) {
        const t = (SURFACE_Y - origin.y) / direction.y;
        const hx = origin.x + direction.x * t;
        const hz = origin.z + direction.z * t;
        const half = this.waveSim.worldSize * 0.5 - 1.0;

        if (Math.abs(hx) < half && Math.abs(hz) < half) {
          this.target.set(hx, hz);
          active = true;
        }
      }
    }

    // Body moves to cursor
    let speed = 0;
    if (active) {
      if (!this.bodyReady) {
        this.body.copy(this.target);
        this.bodyReady = true;
      } else {
        this.bodyPrev.copy(this.body);
        const k = 1 - Math.exp(-BODY_FOLLOW * dt);
        this.body.lerp(this.target, k);
        speed = this.body.distanceTo(this.bodyPrev) / dt;
      }
    } else {
      this.bodyReady = false;
    }

    // Water simulation
    this.waveSim.update(renderer, dt, this.body.x, this.body.y, speed, active);
    this.uniforms.uWaveTexture.value = this.waveSim.texture;
    this.uniforms.uWakeOn.value = this.waveSim.awake ? 1 : 0;
  }

  public dispose() {
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerLeave);
    document.documentElement.removeEventListener(
      "pointerleave",
      this.onPointerLeave,
    );
    window.removeEventListener("blur", this.onPointerLeave);
    this.geometry.dispose();
    this.material.dispose();
    this.waveSim.dispose();
  }
}
