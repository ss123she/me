import * as THREE from "three";
import type { ScrollCamera } from "../scroll-camera";

// Palette
export const BG = 0x060814;
export const COLOR_A = new THREE.Color(0x4de1ff);
export const COLOR_B = new THREE.Color(0xc77dff);

export const FOG_NEAR = 15;
export const FOG_FAR = 80;

const ARCH_RADIUS = 5;
const RING_RADIUS = 6.5;
const RING_SPACING = 6;
const PARTICLE_COUNT = 2500;

const AXIS_Z = new THREE.Vector3(0, 0, 1);
const tmpTangent = new THREE.Vector3();

const gradient = (t: number) =>
  new THREE.Color().lerpColors(COLOR_A, COLOR_B, t);

function placeOnPath(obj: THREE.Object3D, cam: ScrollCamera, u: number) {
  cam.path.getPointAt(u, obj.position);
  cam.path.getTangentAt(u, tmpTangent);
  obj.quaternion.setFromUnitVectors(AXIS_Z, tmpTangent);
}

export class Tunnel {
  public readonly group = new THREE.Group();
  private readonly uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
  };

  constructor(cam: ScrollCamera, stopCount: number, pixelRatio: number) {
    this.uniforms.uPixelRatio.value = pixelRatio;

    const archU: number[] = [];
    for (let i = 0; i < stopCount; i++) {
      archU.push(cam.archU(stopCount > 1 ? i / (stopCount - 1) : 0));
    }

    this.addArches(cam, archU);
    this.addRings(cam, archU);
    this.addParticles(cam);
  }

  public update(delta: number) {
    this.uniforms.uTime.value += delta;
  }

  public dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
  }

  private addArches(cam: ScrollCamera, archU: number[]) {
    const mainGeo = new THREE.TorusGeometry(ARCH_RADIUS, 0.08, 8, 96);
    const outerGeo = new THREE.TorusGeometry(ARCH_RADIUS * 1.18, 0.03, 6, 96);

    for (const u of archU) {
      const color = gradient(u);
      const arch = new THREE.Group();
      arch.add(new THREE.Mesh(mainGeo, new THREE.MeshBasicMaterial({ color })));
      arch.add(
        new THREE.Mesh(
          outerGeo,
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.5,
          }),
        ),
      );
      placeOnPath(arch, cam, u);
      this.group.add(arch);
    }
  }

  private addRings(cam: ScrollCamera, archU: number[]) {
    const us: number[] = [];
    for (let d = RING_SPACING; d < cam.length; d += RING_SPACING) {
      const u = d / cam.length;
      if (archU.some((a) => Math.abs(a - u) * cam.length < 2.5)) continue;
      us.push(u);
    }

    const rings = new THREE.InstancedMesh(
      new THREE.TorusGeometry(RING_RADIUS, 0.035, 6, 96),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.35,
      }),
      us.length,
    );

    const dummy = new THREE.Object3D();
    us.forEach((u, i) => {
      placeOnPath(dummy, cam, u);
      dummy.updateMatrix();
      rings.setMatrixAt(i, dummy.matrix);
      rings.setColorAt(i, gradient(u));
    });

    rings.frustumCulled = false;
    this.group.add(rings);
  }

  private addParticles(cam: ScrollCamera) {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const size = new Float32Array(PARTICLE_COUNT);
    const p = new THREE.Vector3();
    const dir = new THREE.Vector3();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const u = Math.random();
      cam.path.getPointAt(u, p);
      dir
        .set(
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
        )
        .normalize();
      p.addScaledVector(dir, 3 + Math.pow(Math.random(), 1.6) * 24);
      p.toArray(pos, i * 3);

      gradient(u)
        .multiplyScalar(0.4 + Math.random() * 0.6)
        .toArray(col, i * 3);
      size[i] = 0.6 + Math.random() * 1.2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute vec3 aColor;
        attribute float aSize;
        varying vec3 vColor;
        varying float vFade;

        void main() {
          vec3 p = position + 0.4 * vec3(
            sin(uTime * 0.4 + position.z * 0.3),
            cos(uTime * 0.3 + position.x * 0.5),
            sin(uTime * 0.35 + position.y * 0.4)
          );
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;

          gl_PointSize = clamp(
            aSize * uPixelRatio * 24.0 / max(d, 0.1),
            uPixelRatio,
            9.0 * uPixelRatio
          );
          vFade = smoothstep(1.5, 5.0, d) *
                  (1.0 - smoothstep(${FOG_NEAR.toFixed(1)}, ${FOG_FAR.toFixed(1)}, d));
          vColor = aColor;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vFade;

        void main() {
          float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vFade;
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }
      `,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.group.add(points);
  }
}
