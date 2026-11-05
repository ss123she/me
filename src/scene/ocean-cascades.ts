import * as THREE from "three";
import type { WaveSimulation } from "./wave-sim";
import { WATER_DEPTH } from "./water";

export interface CascadeConfig {
  resolution: number;
  worldSize: number;
  octaves: number;
  eps: number;
}

export class OceanCascades {
  public readonly nearConfig: CascadeConfig;
  public readonly farConfig: CascadeConfig;

  public readonly targetNear: THREE.WebGLRenderTarget;
  public readonly targetFar: THREE.WebGLRenderTarget;

  public readonly centerNear = new THREE.Vector2();
  public readonly centerFar = new THREE.Vector2();

  private readonly bakeScene = new THREE.Scene();
  private readonly bakeCamera = new THREE.OrthographicCamera(
    -1,
    1,
    1,
    -1,
    0,
    1,
  );
  private readonly quadGeo = new THREE.PlaneGeometry(2, 2);
  private readonly bakeMaterial: THREE.ShaderMaterial;

  constructor(near: CascadeConfig, far: CascadeConfig) {
    this.nearConfig = near;
    this.farConfig = far;

    const rtOptions: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
    };

    this.targetNear = new THREE.WebGLRenderTarget(
      near.resolution,
      near.resolution,
      rtOptions,
    );
    this.targetFar = new THREE.WebGLRenderTarget(
      far.resolution,
      far.resolution,
      rtOptions,
    );

    this.bakeMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        iTime: { value: 0 },
        uCenter: { value: new THREE.Vector2() },
        uWorldSize: { value: near.worldSize },
        uIterations: { value: near.octaves },
        uEps: { value: near.eps },
        uWaveTexture: { value: null as THREE.Texture | null },
        uSimWorldSize: { value: 40 },
        uSimRes: { value: 512 },
        uWakeOn: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;

        uniform float iTime;
        uniform vec2 uCenter;
        uniform float uWorldSize;
        uniform int uIterations;
        uniform float uEps;

        uniform sampler2D uWaveTexture;
        uniform float uSimWorldSize;
        uniform float uSimRes;
        uniform float uWakeOn;

        #define DRAG_MULT 0.38
        #define WATER_DEPTH ${WATER_DEPTH.toFixed(3)}

        vec2 wavedx(vec2 position, vec2 direction, float frequency, float timeshift) {
          float x = dot(direction, position) * frequency + timeshift;
          float wave = exp(sin(x) - 1.0);
          float dx = wave * cos(x);
          return vec2(wave, -dx);
        }

        float sampleBicubicWake(vec2 uv) {
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

        float getWake(vec2 pos) {
          if (uWakeOn < 0.5) return 0.0;
          vec2 uv = pos / uSimWorldSize + 0.5;
          if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return 0.0;
          return sampleBicubicWake(uv);
        }

        float evaluateOcean(vec2 position, int iterations) {
          float wavePhaseShift = length(position) * 0.1;
          float iter = 0.0;
          float frequency = 0.8;
          float timeMultiplier = 2.0;
          float weight = 1.0;
          float sumOfValues = 0.0;
          float sumOfWeights = 0.0;

          for (int i = 0; i < 20; i++) {
            if (i >= iterations) break;

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

          return sumOfValues / max(sumOfWeights, 0.0001);
        }

        float getWaveHeight(vec2 worldPos) {
          float ocean = evaluateOcean(worldPos, uIterations);
          float wake = getWake(worldPos) / WATER_DEPTH;
          return (ocean + wake) * WATER_DEPTH - WATER_DEPTH;
        }

        void main() {
          vec2 worldPos = uCenter + (vUv - 0.5) * uWorldSize;

          float H = getWaveHeight(worldPos);

          float e = uEps;
          vec2 ex = vec2(e, 0.0);
          vec2 ey = vec2(0.0, e);

          float hPx = getWaveHeight(worldPos + ex);
          float hMx = getWaveHeight(worldPos - ex);
          float hPy = getWaveHeight(worldPos + ey);
          float hMy = getWaveHeight(worldPos - ey);

          float dHdx = (hPx - hMx) / (2.0 * e);
          float dHdz = (hPy - hMy) / (2.0 * e);

          gl_FragColor = vec4(H, dHdx, dHdz, 1.0);
        }
      `,
    });

    this.bakeScene.add(new THREE.Mesh(this.quadGeo, this.bakeMaterial));
  }

  public update(
    renderer: THREE.WebGLRenderer,
    cameraPos: THREE.Vector3,
    time: number,
    waveSim: WaveSimulation,
  ) {
    // Привязка к текселям относительно позиции камеры
    const snapNear = this.nearConfig.worldSize / this.nearConfig.resolution;
    this.centerNear.set(
      Math.floor(cameraPos.x / snapNear) * snapNear,
      Math.floor(cameraPos.z / snapNear) * snapNear,
    );

    const snapFar = this.farConfig.worldSize / this.farConfig.resolution;
    this.centerFar.set(
      Math.floor(cameraPos.x / snapFar) * snapFar,
      Math.floor(cameraPos.z / snapFar) * snapFar,
    );

    const prevTarget = renderer.getRenderTarget();

    const u = this.bakeMaterial.uniforms;
    u.iTime!.value = time;
    u.uWaveTexture!.value = waveSim.texture;
    u.uSimWorldSize!.value = waveSim.worldSize;
    u.uSimRes!.value = waveSim.size;
    u.uWakeOn!.value = waveSim.awake ? 1 : 0;

    // 1. Ближний каскад
    u.uCenter!.value.copy(this.centerNear);
    u.uWorldSize!.value = this.nearConfig.worldSize;
    u.uIterations!.value = this.nearConfig.octaves;
    u.uEps!.value = this.nearConfig.eps;

    renderer.setRenderTarget(this.targetNear);
    renderer.render(this.bakeScene, this.bakeCamera);

    // 2. Дальний каскад (каждый кадр для идеальной синхронности)
    u.uCenter!.value.copy(this.centerFar);
    u.uWorldSize!.value = this.farConfig.worldSize;
    u.uIterations!.value = this.farConfig.octaves;
    u.uEps!.value = this.farConfig.eps;

    renderer.setRenderTarget(this.targetFar);
    renderer.render(this.bakeScene, this.bakeCamera);

    renderer.setRenderTarget(prevTarget);
  }

  public dispose() {
    this.targetNear.dispose();
    this.targetFar.dispose();
    this.quadGeo.dispose();
    this.bakeMaterial.dispose();
  }
}
