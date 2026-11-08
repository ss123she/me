import * as THREE from "three";
import type { ScrollCamera } from "../../scroll-camera";
import { COLOR_A, COLOR_B, FOG_NEAR, FOG_FAR } from "../colors";

const COUNT = 2500;
const MIN_RADIUS = 0.5;
const MAX_RADIUS = 9.0;
const UP = new THREE.Vector3(0, 1, 0);

export class Spores {
  public readonly points: THREE.Points;

  private readonly uniforms = {
    uTime: { value: 0 },
    uColA: { value: COLOR_A },
    uColB: { value: COLOR_B },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
  };

  constructor(cam: ScrollCamera, count = COUNT) {
    const geo = new THREE.BufferGeometry();

    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 2);
    const scales = new Float32Array(count);
    const uProgress = new Float32Array(count);

    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const u = Math.random();
      cam.path.getPointAt(u, p);
      cam.path.getTangentAt(u, t).normalize();

      a.crossVectors(UP, t);
      if (a.lengthSq() < 1e-4) a.set(1, 0, 0);
      a.normalize();
      b.crossVectors(t, a).normalize();

      const angle = Math.random() * Math.PI * 2;
      const r = THREE.MathUtils.lerp(
        MIN_RADIUS,
        MAX_RADIUS,
        Math.sqrt(Math.random()),
      );

      positions[i * 3] =
        p.x + (a.x * Math.cos(angle) + b.x * Math.sin(angle)) * r;
      positions[i * 3 + 1] =
        p.y + (a.y * Math.cos(angle) + b.y * Math.sin(angle)) * r;
      positions[i * 3 + 2] =
        p.z + (a.z * Math.cos(angle) + b.z * Math.sin(angle)) * r;

      seeds[i * 2] = Math.random();
      seeds[i * 2 + 1] = Math.random();

      scales[i] = Math.random() < 0.1 ? 1.4 : 0.5 + Math.random() * 0.5;
      uProgress[i] = u;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 2));
    geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    geo.setAttribute("aU", new THREE.BufferAttribute(uProgress, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute vec2 aSeed;
        attribute float aScale;
        attribute float aU;

        varying vec2 vSeed;
        varying float vU;
        varying vec3 vWorld;

        void main() {
          vSeed = aSeed;
          vU = aU;

          vec3 pos = position;
          pos.x += sin(uTime * 0.4 + aSeed.x * 6.28) * 0.15;
          pos.y += cos(uTime * 0.3 + aSeed.y * 6.28) * 0.20;
          pos.z += sin(uTime * 0.35 + (aSeed.x + aSeed.y) * 3.14) * 0.15;

          vec4 w = modelMatrix * vec4(pos, 1.0);
          vWorld = w.xyz;

          vec4 mv = viewMatrix * w;
          gl_Position = projectionMatrix * mv;

          gl_PointSize = aScale * (65.0 / -mv.z) * uPixelRatio;
          gl_PointSize = clamp(gl_PointSize, 1.5, 12.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColA, uColB;
        varying vec2 vSeed;
        varying float vU;
        varying vec3 vWorld;

        void main() {
          float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
          if (r > 1.0) discard;

          float edge = smoothstep(1.0, 0.75, r);
          float pinPoint = pow(max(0.0, 1.0 - r), 4.0);
          float twinkle = 0.7 + 0.3 * sin(uTime * 3.5 + vSeed.y * 25.0);

          float d = distance(cameraPosition, vWorld);

          float nearFade = smoothstep(0.5, 1.8, d);
          float fog = 1.0 - smoothstep(${FOG_NEAR.toFixed(1)}, ${FOG_FAR.toFixed(1)}, d);

          vec3 baseCol = mix(uColA, uColB, vU);
          vec3 col = mix(baseCol * 1.4, vec3(1.0, 1.0, 1.0), pinPoint);

          float alpha = (edge * 0.5 + pinPoint * 1.5) * nearFade * fog * twinkle;
          gl_FragColor = vec4(col * alpha, alpha);

          #include <colorspace_fragment>
        }
      `,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  public update(delta: number) {
    this.uniforms.uTime.value += delta;
  }

  public dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
