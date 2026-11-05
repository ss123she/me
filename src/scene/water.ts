import * as THREE from "three";
import { WaveSimulation } from "./wave-sim";
import { OceanCascades } from "./ocean-cascades";

export const WATER_DEPTH = 1.2;
const MEAN_WAVE_LEVEL = 0.466;
const SURFACE_Y = WATER_DEPTH * (MEAN_WAVE_LEVEL - 1.0);
const BODY_FOLLOW = 1 / 0.045;

export type Quality = "high" | "low";

interface Preset {
  simSize: number;
  nearRes: number;
  farRes: number;
  nearSize: number;
  farSize: number;
  raymarchSteps: number;
  nearOctaves: number;
  farOctaves: number;
  farCutoff: number;
}

const PRESETS: Record<Quality, Preset> = {
  high: {
    simSize: 512,
    nearRes: 384,
    farRes: 256,
    nearSize: 60.0,
    farSize: 240.0,
    raymarchSteps: 12,
    nearOctaves: 18,
    farOctaves: 14,
    farCutoff: 220,
  },
  low: {
    simSize: 256,
    nearRes: 256,
    farRes: 192,
    nearSize: 50.0,
    farSize: 180.0,
    raymarchSteps: 9,
    nearOctaves: 12,
    farOctaves: 8,
    farCutoff: 150,
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

export class OceanWorld {
  public readonly mesh: THREE.Mesh;
  public readonly waveSim: WaveSimulation;
  public readonly cascades: OceanCascades;

  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly camera: THREE.PerspectiveCamera;

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
    this.cascades = new OceanCascades(
      {
        resolution: p.nearRes,
        worldSize: p.nearSize,
        octaves: p.nearOctaves,
        eps: 0.01,
      },
      {
        resolution: p.farRes,
        worldSize: p.farSize,
        octaves: p.farOctaves,
        eps: 0.02,
      },
    );

    this.geometry = new THREE.PlaneGeometry(2, 2);

    this.material = new THREE.ShaderMaterial({
      depthWrite: false,
      depthTest: false,
      uniforms: {
        iTime: { value: 0 },
        uProjectionInverse: { value: new THREE.Matrix4() },
        uMatrixWorld: { value: new THREE.Matrix4() },

        uCascadeNear: { value: this.cascades.targetNear.texture },
        uCascadeFar: { value: this.cascades.targetFar.texture },
        uNearCenter: { value: this.cascades.centerNear },
        uFarCenter: { value: this.cascades.centerFar },
        uNearSize: { value: p.nearSize },
        uFarSize: { value: p.farSize },
      },
      defines: {
        RAYMARCH_STEPS: p.raymarchSteps,
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

        uniform sampler2D uCascadeNear;
        uniform sampler2D uCascadeFar;
        uniform vec2 uNearCenter;
        uniform vec2 uFarCenter;
        uniform float uNearSize;
        uniform float uFarSize;

        #define WATER_DEPTH ${WATER_DEPTH.toFixed(3)}
        #define WATER_TOP 0.3
        #define MEAN_Y (${SURFACE_Y.toFixed(3)})

        vec3 sampleWaves(vec2 pos) {
          vec2 uvNear = (pos - uNearCenter) / uNearSize + 0.5;
          vec2 uvFar  = (pos - uFarCenter) / uFarSize + 0.5;

          float distToCam = distance(pos, cameraPosition.xz);

          float blend = smoothstep(22.0, 36.0, distToCam);

          vec3 farData = (uvFar.x >= 0.0 && uvFar.x <= 1.0 && uvFar.y >= 0.0 && uvFar.y <= 1.0)
            ? texture2D(uCascadeFar, uvFar).rgb
            : vec3(MEAN_Y, 0.0, 0.0);

          if (blend >= 1.0) {
            return farData;
          }

          vec3 nearData = (uvNear.x >= 0.0 && uvNear.x <= 1.0 && uvNear.y >= 0.0 && uvNear.y <= 1.0)
            ? texture2D(uCascadeNear, uvNear).rgb
            : farData;

          if (blend <= 0.0) {
            return nearData;
          }

          return mix(nearData, farData, blend);
        }

        float getBakedHeight(vec2 pos) {
          return sampleWaves(pos).r;
        }

        float raymarchwater(vec3 camera, vec3 start, vec3 end) {
          vec3 seg = end - start;
          float segLen = length(seg);
          vec3 dir = seg / segLen;

          float stepSize = segLen / float(RAYMARCH_STEPS);
          float prevDist = 0.0;
          float prevDiff = start.y - getBakedHeight(start.xz);

          if (prevDiff <= 0.0) return distance(camera, start);

          for (int i = 1; i <= RAYMARCH_STEPS; i++) {
            float curDist = float(i) * stepSize;
            vec3 p = start + dir * curDist;
            float h = getBakedHeight(p.xz);
            float curDiff = p.y - h;

            if (curDiff <= 0.0) {
              float frac = prevDiff / (prevDiff - curDiff + 1e-6);
              float hitDist = mix(prevDist, curDist, clamp(frac, 0.0, 1.0));
              return distance(camera, start + dir * hitDist);
            }

            prevDist = curDist;
            prevDiff = curDiff;
          }

          return distance(camera, end);
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
            dist = intersectPlane(origin, ray, vec3(0.0, MEAN_Y, 0.0), up);
            N = up;
          } else {
            float lowPlaneHit = intersectPlane(origin, ray, waterPlaneLow, up);
            vec3 highHitPos = origin + ray * highPlaneHit;
            vec3 lowHitPos  = origin + ray * lowPlaneHit;

            dist = raymarchwater(origin, highHitPos, lowHitPos);
            vec3 hit = origin + ray * dist;

            vec3 sampleData = sampleWaves(hit.xz);
            vec2 grad = sampleData.gb;
            N = normalize(vec3(-grad.x, 1.0, -grad.y));

            float flatten = clamp(
              0.8 * min(1.0, sqrt(dist * 0.01) * 1.1)
                + 0.2 * smoothstep(0.5 * FAR_CUTOFF, FAR_CUTOFF, dist),
              0.0, 1.0);
            N = normalize(mix(N, up, flatten));
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

    this.material.uniforms.iTime!.value += delta;
    this.camera.updateMatrixWorld();
    this.material.uniforms.uProjectionInverse!.value.copy(
      this.camera.projectionMatrixInverse,
    );
    this.material.uniforms.uMatrixWorld!.value.copy(this.camera.matrixWorld);

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

    this.waveSim.update(renderer, dt, this.body.x, this.body.y, speed, active);

    this.cascades.update(
      renderer,
      this.camera.position,
      this.material.uniforms.iTime!.value,
      this.waveSim,
    );

    this.material.uniforms.uNearCenter!.value.copy(this.cascades.centerNear);
    this.material.uniforms.uFarCenter!.value.copy(this.cascades.centerFar);
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
    this.cascades.dispose();
  }
}
