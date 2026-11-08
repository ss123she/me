import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { ScrollCamera } from "../../scroll-camera";
import { BG, FOG_NEAR, FOG_FAR } from "../colors";
import { buildCaveGeometry } from "./cave-geometry";
import { bakeCrystalLight, nextFrame } from "./cave-baker";
import { Crystals } from "./crystals";
import { Spores } from "./spores";

export class Cave {
  public readonly group = new THREE.Group();
  public readonly mesh: THREE.Mesh;
  public readonly crystals: Crystals;
  public readonly spores: Spores;

  static async create(
    cam: ScrollCamera,
    onProgress?: (p: number) => void,
  ): Promise<Cave> {
    const report = (p: number) => onProgress?.(p);

    report(0);
    await nextFrame();
    const { geo, centers } = buildCaveGeometry(cam);

    report(0.1);
    await nextFrame();
    const bvh = new MeshBVH(geo);
    const crystals = new Crystals(cam, bvh);

    report(0.15);
    await nextFrame();
    await bakeCrystalLight(geo, bvh, crystals.items, centers, (p) =>
      report(0.15 + p * 0.85),
    );

    const spores = new Spores(cam);

    report(1);
    return new Cave(geo, crystals, spores);
  }

  private constructor(
    geo: THREE.BufferGeometry,
    crystals: Crystals,
    spores: Spores,
  ) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uBg: { value: new THREE.Color(BG) } },
      vertexShader: /* glsl */ `
        attribute vec3 aBake;
        varying vec3 vWorld;
        varying vec3 vBake;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vBake = aBake;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uBg;
        varying vec3 vWorld;
        varying vec3 vBake;
        void main() {
          float d = distance(cameraPosition, vWorld);
          float fog = smoothstep(${FOG_NEAR.toFixed(1)}, ${FOG_FAR.toFixed(1)}, d);
          gl_FragColor = vec4(mix(vBake, uBg, fog), 1.0);
          #include <colorspace_fragment>
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.crystals = crystals;
    this.spores = spores;

    this.group.add(this.mesh);
    this.group.add(this.crystals.mesh);
    this.group.add(this.spores.points);
  }

  public update(delta: number) {
    this.crystals.update(delta);
    this.spores.update(delta);
  }

  public dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.crystals.dispose();
    this.spores.dispose();
  }
}
