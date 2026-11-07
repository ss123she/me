import * as THREE from "three";
import type { ScrollCamera } from "../scroll-camera";
import { COLOR_A, COLOR_B, FOG_NEAR, FOG_FAR } from "./tunnel";

const CLUSTERS = 70;
const Y = new THREE.Vector3(0, 1, 0);

export class Crystals {
  public readonly mesh: THREE.InstancedMesh;
  private readonly uniforms = {
    uTime: { value: 0 },
    uColA: { value: COLOR_A },
    uColB: { value: COLOR_B },
  };

  constructor(cam: ScrollCamera) {
    const geo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(1, 0),
        new THREE.Vector2(1, 3),
        new THREE.Vector2(0, 4),
      ],
      6,
    );

    const mats: THREE.Matrix4[] = [];
    const inst: number[] = [];
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const out = new THREE.Vector3();
    const center = new THREE.Vector3();
    const base = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const s = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const rnd = (k: number) => (Math.random() - 0.5) * k;

    for (let c = 0; c < CLUSTERS; c++) {
      const u = (c + Math.random()) / CLUSTERS;
      cam.path.getPointAt(u, p);
      cam.path.getTangentAt(u, t);
      a.set(0, 1, 0).cross(t).normalize();
      b.crossVectors(t, a);

      const th = Math.random() * Math.PI * 2;
      const R = 11 + Math.random() * 14;
      out.copy(a).multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th));
      center.copy(p).addScaledVector(out, R);

      const n = 4 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) {
        base.set(center.x + rnd(3), center.y + rnd(3), center.z + rnd(3));
        axis
          .copy(out)
          .negate()
          .add(tmp.set(rnd(1.2), rnd(1.2), rnd(1.2)))
          .normalize();

        const L = Math.min(2 + Math.pow(Math.random(), 2) * 6, R - 6.5);
        const r = L * (0.1 + Math.random() * 0.1);
        q.setFromUnitVectors(Y, axis);
        mats.push(new THREE.Matrix4().compose(base, q, s.set(r, L / 4, r)));
        inst.push(u, Math.random());
      }
    }

    geo.setAttribute(
      "aInst",
      new THREE.InstancedBufferAttribute(new Float32Array(inst), 2),
    );

    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute vec2 aInst;
          varying vec3 vWorld;
          varying vec2 vInst;
          void main() {
            vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            vInst = aInst;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uColA, uColB;
          varying vec3 vWorld;
          varying vec2 vInst;
          void main() {
            vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
            vec3 V = normalize(cameraPosition - vWorld);
            float fres = pow(1.0 - abs(dot(N, V)), 2.5);
            float light = abs(dot(N, normalize(vec3(0.4, 0.8, 0.3))));
            float facet = fract(sin(dot(floor(N * 4.0 + 0.5), vec3(12.9, 78.2, 37.7))) * 43758.5);
            float pulse = 0.85 + 0.15 * sin(uTime * 1.5 + vInst.y * 6.28);

            vec3 base = mix(uColA, uColB, vInst.x);
            vec3 col = base * (0.08 + 0.3 * light + 0.12 * facet)
                     + base * fres * 1.2
                     + vec3(0.85, 0.95, 1.0) * pow(fres, 6.0) * 0.5;

            float d = distance(cameraPosition, vWorld);
            float fade = 1.0 - smoothstep(${FOG_NEAR.toFixed(1)}, ${FOG_FAR.toFixed(1)}, d);
            gl_FragColor = vec4(col * pulse, fade);
            #include <colorspace_fragment>
          }
        `,
      }),
      mats.length,
    );
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.frustumCulled = false;
    this.mesh = mesh;
  }

  public update(delta: number) {
    this.uniforms.uTime.value += delta;
  }

  public dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
