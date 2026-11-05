import * as THREE from "three";

export const WATER_DEPTH = 1.2;
const SURFACE_Y = WATER_DEPTH * (0.466 - 1.0);

export class OceanWorld {
  public readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly camera: THREE.PerspectiveCamera;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;

    this.material = new THREE.ShaderMaterial({
      depthWrite: false,
      depthTest: false,
      uniforms: {
        iTime: { value: 0 },
        uProjectionInverse: { value: new THREE.Matrix4() },
        uMatrixWorld: { value: new THREE.Matrix4() },
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

        #define DRAG_MULT 0.38
        #define WATER_DEPTH ${WATER_DEPTH.toFixed(3)}
        #define WATER_TOP 0.25
        #define MEAN_Y (${SURFACE_Y.toFixed(3)})
        #define FAR_CUTOFF 200.0

        float getwaves(vec2 pos, int iters) {
          float wavePhase = length(pos) * 0.1, iter = 0.0, freq = 0.8, tMult = 2.0, w = 1.0, val = 0.0, totalW = 0.0;
          vec2 p;
          for (int i = 0; i < 14; i++) {
            if (i >= iters) break;
            p = vec2(sin(iter), cos(iter));
            float x = dot(p, pos) * freq + iTime * tMult + wavePhase;
            float wave = exp(sin(x) - 1.0);
            pos += p * (-wave * cos(x)) * w * DRAG_MULT;
            val += wave * w;
            totalW += w;
            w = mix(w, 0.0, 0.2);
            freq *= 1.18;
            tMult *= 1.07;
            iter += 1232.399;
          }
          return (val / totalW) * WATER_DEPTH;
        }

        float raymarchwater(vec3 cam, vec3 start, vec3 end) {
          vec3 seg = end - start, dir = normalize(seg);
          float stepLen = length(seg) * 0.1, prevDist = 0.0;
          float prevDiff = start.y - (getwaves(start.xz, 4) - WATER_DEPTH);
          if (prevDiff <= 0.0) return distance(cam, start);

          for (int i = 1; i <= 10; i++) {
            float curDist = float(i) * stepLen;
            vec3 p = start + dir * curDist;
            float curDiff = p.y - (getwaves(p.xz, 4) - WATER_DEPTH);
            if (curDiff <= 0.0) {
              return distance(cam, start + dir * mix(prevDist, curDist, prevDiff / (prevDiff - curDiff + 1e-5)));
            }
            prevDist = curDist;
            prevDiff = curDiff;
          }
          return distance(cam, end);
        }

        vec3 getNormal(vec2 p, float dist) {
          float eps = max(0.015, 0.0012 * dist);
          vec2 h = vec2(eps, 0.0);

          int iters = int(mix(12.0, 4.0, smoothstep(10.0, FAR_CUTOFF, dist)));

          return normalize(vec3(
            getwaves(p - h.xy, iters) - getwaves(p + h.xy, iters),
            2.0 * h.x,
            getwaves(p - h.yx, iters) - getwaves(p + h.yx, iters)
          ));
        }

        vec3 skyColor(vec3 dir, vec3 sun) {
          float rY = dir.y + 0.1, sY = sun.y * 11.0 + 1.0;
          vec3 sunc = mix(vec3(1.0), max(vec3(0.0), vec3(1.0) - vec3(5.5, 13.0, 22.4) / 22.4), 1.0 / sY);
          vec3 sky = max(vec3(0.0), vec3(5.5, 13.0, 22.4) / 22.4 * sunc - vec3(5.5, 13.0, 22.4) * 0.002 * (1.0 / rY - 6.0 * sun.y * sun.y));
          sky = sky * (1.0 / rY) * (0.24 + pow(abs(dot(sun, dir)), 2.0) * 0.24) * (1.0 + pow(1.0 - dir.y, 3.0));
          return sky * 0.5 + pow(max(0.0, dot(dir, sun)), 600.0) * 160.0;
        }

        void main() {
          vec4 target = uProjectionInverse * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          vec3 ray = normalize((uMatrixWorld * vec4(normalize(target.xyz / target.w), 0.0)).xyz);
          vec3 sun = normalize(vec3(-0.08, 0.35 + sin(iTime * 0.15 + 2.6) * 0.25, 0.58));
          vec3 origin = cameraPosition, up = vec3(0.0, 1.0, 0.0);

          if (ray.y >= 0.0) {
            gl_FragColor = vec4(skyColor(ray, sun) * 2.0, 1.0);
            return;
          }

          float highHit = (WATER_TOP - origin.y) / ray.y, dist;
          vec3 N;

          if (highHit > FAR_CUTOFF) {
            dist = (MEAN_Y - origin.y) / ray.y;
            N = up;
          } else {
            float lowHit = (-WATER_DEPTH - origin.y) / ray.y;
            dist = raymarchwater(origin, origin + ray * highHit, origin + ray * lowHit);
            vec3 hit = origin + ray * dist;
            N = getNormal(hit.xz, dist);
          }

          vec3 hitPos = origin + ray * dist;
          float fresnel = 0.04 + 0.96 * pow(1.0 - max(0.0, dot(-N, ray)), 5.0);
          vec3 R = reflect(ray, N);
          R.y = abs(R.y);

          vec3 scattering = vec3(0.0293, 0.0698, 0.1717) * 0.1 * (0.2 + (hitPos.y + WATER_DEPTH) / WATER_DEPTH);
          gl_FragColor = vec4((fresnel * skyColor(R, sun) + scattering) * 2.0, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  public update(delta: number) {
    this.material.uniforms.iTime!.value += delta;
    this.camera.updateMatrixWorld();
    this.material.uniforms.uProjectionInverse!.value.copy(
      this.camera.projectionMatrixInverse,
    );
    this.material.uniforms.uMatrixWorld!.value.copy(this.camera.matrixWorld);
  }

  public dispose() {
    this.material.dispose();
  }
}
