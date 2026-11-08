import * as THREE from "three";
import type { MeshBVH } from "three-mesh-bvh";
import type { ScrollCamera } from "../../scroll-camera";
import { COLOR_A, COLOR_B, FOG_NEAR, FOG_FAR } from "../colors";

const CLUSTERS = 70;
const CLEARANCE = 5.0;
const TIP_HEIGHT = 4.0;
const UP = new THREE.Vector3(0, 1, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export interface CrystalItem {
  base: THREE.Vector3;
  axis: THREE.Vector3;
  length: number;
  radius: number;
  u: number;
}

export class Crystals {
  public readonly mesh: THREE.InstancedMesh;
  public readonly items: CrystalItem[];

  private readonly uniforms = {
    uTime: { value: 0 },
    uColA: { value: COLOR_A },
    uColB: { value: COLOR_B },
  };

  constructor(cam: ScrollCamera, bvh: MeshBVH) {
    this.items = this.placeOnWalls(cam, bvh);

    const geo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(1, 0),
        new THREE.Vector2(1, 3.0),
        new THREE.Vector2(0, TIP_HEIGHT),
      ],
      6,
    );

    const instData = new Float32Array(this.items.length * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    const mat = new THREE.ShaderMaterial({
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
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, this.items.length);
    this.mesh.frustumCulled = false;

    this.items.forEach((it, i) => {
      q.setFromUnitVectors(Y_AXIS, it.axis);
      s.set(it.radius, it.length / TIP_HEIGHT, it.radius);
      m.compose(it.base, q, s);
      this.mesh.setMatrixAt(i, m);

      instData[i * 2] = it.u;
      instData[i * 2 + 1] = Math.random();
    });

    geo.setAttribute("aInst", new THREE.InstancedBufferAttribute(instData, 2));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private placeOnWalls(cam: ScrollCamera, bvh: MeshBVH): CrystalItem[] {
    const items: CrystalItem[] = [];
    const p = new THREE.Vector3(),
      t = new THREE.Vector3();
    const a = new THREE.Vector3(),
      b = new THREE.Vector3();
    const out = new THREE.Vector3(),
      d = new THREE.Vector3();
    const n = new THREE.Vector3(),
      axis = new THREE.Vector3(),
      tmp = new THREE.Vector3();
    const ray = new THREE.Ray();
    const jitter = (amp: number) => (Math.random() * 2 - 1) * amp;

    for (let c = 0; c < CLUSTERS; c++) {
      const u = (c + Math.random()) / CLUSTERS;
      cam.path.getPointAt(u, p);
      cam.path.getTangentAt(u, t).normalize();

      a.crossVectors(UP, t);
      if (a.length() < 1e-4) a.set(1, 0, 0);
      a.normalize();
      b.crossVectors(t, a);

      const th = Math.random() * Math.PI * 2;
      out.copy(a).multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th));
      const count = 4 + Math.floor(Math.random() * 6);

      for (let k = 0; k < count; k++) {
        d.set(
          out.x + jitter(0.15),
          out.y + jitter(0.15),
          out.z + jitter(0.15),
        ).normalize();
        ray.set(p, d);
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
        if (!hit || hit.distance < CLEARANCE + 2.0) continue;

        n.copy(hit.face!.normal).normalize();
        if (n.dot(tmp.copy(p).sub(hit.point)) < 0) n.negate();

        axis
          .set(
            n.x * 0.75 + jitter(0.5),
            n.y * 0.75 + jitter(0.5),
            n.z * 0.75 + jitter(0.5),
          )
          .normalize();
        if (axis.dot(n) < 0.3) axis.copy(n);

        const base = hit.point.clone().addScaledVector(n, -0.3);
        let length = 2.0 + Math.pow(Math.random(), 2) * 5.0;
        while (
          length > 1.2 &&
          tmp.copy(base).addScaledVector(axis, length).sub(p).length() <
            CLEARANCE
        ) {
          length *= 0.85;
        }
        if (length <= 1.2) continue;

        items.push({
          base,
          axis: axis.clone(),
          length,
          radius: length * (0.1 + 0.1 * Math.random()),
          u,
        });
      }
    }
    return items;
  }

  public update(delta: number) {
    this.uniforms.uTime.value += delta;
  }

  public dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
