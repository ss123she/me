import * as THREE from "three";

export const WATER_DEPTH = 1.2;

export class OceanWorld {
  public readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly camera: THREE.PerspectiveCamera;

  private readonly gridSize = 350;
  private readonly gridSegments = 130;
  private readonly snapStep: number;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.snapStep = this.gridSize / this.gridSegments;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        uSunDirection: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */ `
        uniform float iTime;
        varying vec3 vWorldPos;
        varying float vDist;

        #define DRAG_MULT 0.38
        #define WATER_DEPTH ${WATER_DEPTH.toFixed(3)}

        float getDisplacement(vec2 pos) {
          float wavePhase = length(pos) * 0.1;
          float iter = 0.0, freq = 0.8, tMult = 2.0, w = 1.0;
          float sumVal = 0.0, sumW = 0.0;

          for (int i = 0; i < 4; i++) {
            vec2 dir = vec2(sin(iter), cos(iter));
            float x = dot(dir, pos) * freq + iTime * tMult + wavePhase;
            float wave = exp(sin(x) - 1.0);
            pos += dir * (-wave * cos(x)) * w * DRAG_MULT;

            sumVal += wave * w;
            sumW += w;
            w = mix(w, 0.0, 0.2);
            freq *= 1.18;
            tMult *= 1.07;
            iter += 1232.399;
          }

          return (sumVal / sumW) * WATER_DEPTH - WATER_DEPTH;
        }

        void main() {
          vec3 wPos = (modelMatrix * vec4(position, 1.0)).xyz;
          wPos.y = getDisplacement(wPos.xz);

          vWorldPos = wPos;
          vDist = distance(wPos, cameraPosition);

          gl_Position = projectionMatrix * viewMatrix * vec4(wPos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float iTime;
        uniform vec3 uSunDirection;
        varying vec3 vWorldPos;
        varying float vDist;

        #define DRAG_MULT 0.38
        #define WATER_DEPTH ${WATER_DEPTH.toFixed(3)}
        #define FOG_DENSITY 0.009

        float getwaves(vec2 pos, int iters) {
          float wavePhase = length(pos) * 0.1;
          float iter = 0.0, freq = 0.8, tMult = 2.0, w = 1.0;
          float sumVal = 0.0, totalW = 0.0;
          vec2 p;

          for (int i = 0; i < 12; i++) {
            if (i >= iters) break;
            p = vec2(sin(iter), cos(iter));
            float x = dot(p, pos) * freq + iTime * tMult + wavePhase;
            float wave = exp(sin(x) - 1.0);
            pos += p * (-wave * cos(x)) * w * DRAG_MULT;

            sumVal += wave * w;
            totalW += w;
            w = mix(w, 0.0, 0.2);
            freq *= 1.18;
            tMult *= 1.07;
            iter += 1232.399;
          }
          return (sumVal / totalW) * WATER_DEPTH;
        }

        vec3 getNormal(vec2 p, float dist) {
          float eps = max(0.015, 0.0015 * dist);
          vec2 h = vec2(eps, 0.0);
          int iters = int(mix(10.0, 3.0, smoothstep(5.0, 150.0, dist)));

          return normalize(vec3(
            getwaves(p - h.xy, iters) - getwaves(p + h.xy, iters),
            2.0 * h.x,
            getwaves(p - h.yx, iters) - getwaves(p + h.yx, iters)
          ));
        }

        vec3 skyColor(vec3 dir, vec3 sun) {
          float rY = max(dir.y, 0.0) + 0.15;
          float sY = sun.y * 11.0 + 1.0;
          vec3 sunc = mix(vec3(1.0), max(vec3(0.0), vec3(1.0) - vec3(5.5, 13.0, 22.4) / 22.4), 1.0 / sY);
          vec3 sky = max(vec3(0.0), vec3(5.5, 13.0, 22.4) / 22.4 * sunc - vec3(5.5, 13.0, 22.4) * 0.002 * (1.0 / rY - 6.0 * sun.y * sun.y));
          sky = sky * (1.0 / rY) * (0.24 + pow(abs(dot(sun, dir)), 2.0) * 0.24) * (1.0 + pow(1.0 - max(dir.y, 0.0), 3.0));
          float sunSpec = pow(max(0.0, dot(dir, sun)), 500.0) * 35.0;
          return sky * 0.45 + sunSpec;
        }

        void main() {
          vec3 ray = normalize(vWorldPos - cameraPosition);
          vec3 sun = uSunDirection;

          vec3 N = getNormal(vWorldPos.xz, vDist);

          float fresnel = 0.04 + 0.96 * pow(1.0 - max(0.0, dot(-N, ray)), 5.0);

          vec3 R = reflect(ray, N);
          R.y = abs(R.y);
          vec3 reflection = skyColor(R, sun);

          vec3 scattering = vec3(0.03, 0.07, 0.17) * 0.15 * (0.2 + (vWorldPos.y + WATER_DEPTH) / WATER_DEPTH);
          vec3 waterColor = fresnel * reflection + scattering;

          vec3 horizonFog = skyColor(normalize(vec3(ray.x, 0.02, ray.z)), sun);
          float fog = 1.0 - exp(-vDist * FOG_DENSITY);

          float edgeFade = smoothstep(130.0, 170.0, vDist);
          float totalFog = clamp(max(fog, edgeFade), 0.0, 1.0);

          gl_FragColor = vec4(mix(waterColor, horizonFog, totalFog), 1.0);
        }
      `,
    });

    const waterGeo = new THREE.PlaneGeometry(
      this.gridSize,
      this.gridSize,
      this.gridSegments,
      this.gridSegments,
    );
    waterGeo.rotateX(-Math.PI / 2);

    this.mesh = new THREE.Mesh(waterGeo, this.material);
    this.mesh.frustumCulled = false;
  }

  public update(delta: number, sunDir: THREE.Vector3) {
    this.material.uniforms.iTime!.value += delta;
    this.material.uniforms.uSunDirection!.value.copy(sunDir);

    const camX = this.camera.position.x;
    const camZ = this.camera.position.z;
    this.mesh.position.x = Math.floor(camX / this.snapStep) * this.snapStep;
    this.mesh.position.z = Math.floor(camZ / this.snapStep) * this.snapStep;
  }

  public dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
