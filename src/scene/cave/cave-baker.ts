import * as THREE from "three";
import type { MeshBVH } from "three-mesh-bvh";
import type { CrystalItem } from "./crystals";
import { COLOR_A, COLOR_B } from "../colors";
import { SEGMENTS } from "./cave-geometry";

const LIGHT_RADIUS = 16.0;
const SHADOWS = false;
const SHADOW_LIGHTS = 4;
const BAKE_STRIDE_RING = SHADOWS ? 2 : 1;
const BAKE_STRIDE_SEG = SHADOWS ? 2 : 1;
const INDIRECT = 0.2;
const SLICE_MS = 16;
const EMISSION = 15.0;
const ROCK_ALBEDO: [number, number, number] = [0.5, 0.55, 0.65];
const WORLD_AMBIENT: [number, number, number] = [0.01, 0.015, 0.04];

const yieldChannel = new MessageChannel();
export const nextFrame = () =>
  new Promise<void>((resolve) => {
    yieldChannel.port1.onmessage = () => resolve();
    yieldChannel.port2.postMessage(0);
  });

export async function bakeCrystalLight(
  geo: THREE.BufferGeometry,
  bvh: MeshBVH,
  items: CrystalItem[],
  centers: Float32Array,
  onProgress: (p: number) => void,
) {
  const pos = geo.attributes.position!.array as Float32Array;
  const nor = geo.attributes.normal!.array as Float32Array;
  const nv = pos.length / 3;
  const rings = nv / SEGMENTS;

  const nl = items.length;
  const lp = new Float32Array(nl * 3);
  const lc = new Float32Array(nl * 3);
  const col = new THREE.Color();

  for (let i = 0; i < nl; i++) {
    const it = items[i]!;
    lp[i * 3] = it.base.x + it.axis.x * it.length * 0.75;
    lp[i * 3 + 1] = it.base.y + it.axis.y * it.length * 0.75;
    lp[i * 3 + 2] = it.base.z + it.axis.z * it.length * 0.75;
    const I = (EMISSION * 4.5 * it.radius * it.length) / Math.PI;
    col.copy(COLOR_A).lerp(COLOR_B, it.u);
    lc[i * 3] = col.r * I;
    lc[i * 3 + 1] = col.g * I;
    lc[i * 3 + 2] = col.b * I;
  }

  const bake = new Float32Array(nv * 3);
  const ray = new THREE.Ray();
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const R2 = LIGHT_RADIUS * LIGHT_RADIUS;
  const ringReach = LIGHT_RADIUS + 11.0 + 6.0;
  const ringReach2 = ringReach * ringReach;

  const K = SHADOW_LIGHTS;
  const topW = new Float32Array(K);
  const topI = new Int32Array(K);
  const topD = new Float32Array(K);
  const cand = new Int32Array(nl);

  let sliceStart = performance.now();
  const SR = BAKE_STRIDE_RING;
  const SG = BAKE_STRIDE_SEG;
  const lastRow = rings - 1;
  const isSampledRow = (r: number) => r % SR === 0 || r === lastRow;

  for (let ri = 0; ri < rings; ri++) {
    if (!isSampledRow(ri)) continue;

    const cx = centers[ri * 3]!,
      cy = centers[ri * 3 + 1]!,
      cz = centers[ri * 3 + 2]!;
    let nc = 0;
    for (let i = 0; i < nl; i++) {
      const dx = lp[i * 3]! - cx,
        dy = lp[i * 3 + 1]! - cy,
        dz = lp[i * 3 + 2]! - cz;
      if (dx * dx + dy * dy + dz * dz < ringReach2) cand[nc++] = i;
    }

    for (let j = 0; j < SEGMENTS; j += SG) {
      const v = ri * SEGMENTS + j;
      const px = pos[v * 3]!,
        py = pos[v * 3 + 1]!,
        pz = pos[v * 3 + 2]!;
      const nx = nor[v * 3]!,
        ny = nor[v * 3 + 1]!,
        nz = nor[v * 3 + 2]!;
      let r = 0,
        g = 0,
        b = 0;
      let top = 0;
      topW.fill(0);

      for (let c = 0; c < nc; c++) {
        const i = cand[c]!;
        const lx = lp[i * 3]! - px,
          ly = lp[i * 3 + 1]! - py,
          lz = lp[i * 3 + 2]! - pz;
        const d2 = lx * lx + ly * ly + lz * lz;
        if (d2 > R2) continue;
        const dist = Math.sqrt(d2);
        const ndl = (nx * lx + ny * ly + nz * lz) / dist;
        const e = 1.0 / (d2 + 4.0);

        const ind = e * INDIRECT * (0.5 + 0.5 * ndl);
        r += lc[i * 3]! * ind;
        g += lc[i * 3 + 1]! * ind;
        b += lc[i * 3 + 2]! * ind;

        if (ndl <= 0.02) continue;

        if (!SHADOWS) {
          const kd = e * ndl;
          r += lc[i * 3]! * kd;
          g += lc[i * 3 + 1]! * kd;
          b += lc[i * 3 + 2]! * kd;
          continue;
        }

        const w =
          e * ndl * Math.max(lc[i * 3]!, lc[i * 3 + 1]!, lc[i * 3 + 2]!);
        if (top < K || w > topW[K - 1]!) {
          let s = top < K ? top++ : K - 1;
          while (s > 0 && topW[s - 1]! < w) {
            topW[s] = topW[s - 1]!;
            topI[s] = topI[s - 1]!;
            topD[s] = topD[s - 1]!;
            s--;
          }
          topW[s] = w;
          topI[s] = i;
          topD[s] = dist;
        }
      }

      if (SHADOWS) {
        origin.set(px + nx * 0.1, py + ny * 0.1, pz + nz * 0.1);
        for (let s = 0; s < top; s++) {
          const i = topI[s]!;
          const dist = topD[s]!;
          dir.set(
            lp[i * 3]! - origin.x,
            lp[i * 3 + 1]! - origin.y,
            lp[i * 3 + 2]! - origin.z,
          );
          const far = dir.length() - 0.6;
          dir.normalize();
          ray.set(origin, dir);
          const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, far);
          if (hit && hit.distance < far) continue;

          const ndl = nx * dir.x + ny * dir.y + nz * dir.z;
          const k = (1.0 / (dist * dist + 4.0)) * Math.max(0, ndl);
          r += lc[i * 3]! * k;
          g += lc[i * 3 + 1]! * k;
          b += lc[i * 3 + 2]! * k;
        }
      }

      bake[v * 3] = ROCK_ALBEDO[0] * (r + WORLD_AMBIENT[0]);
      bake[v * 3 + 1] = ROCK_ALBEDO[1] * (g + WORLD_AMBIENT[1]);
      bake[v * 3 + 2] = ROCK_ALBEDO[2] * (b + WORLD_AMBIENT[2]);
    }

    if (performance.now() - sliceStart > SLICE_MS) {
      onProgress(ri / rings);
      await nextFrame();
      sliceStart = performance.now();
    }
  }

  if (SG > 1) {
    for (let ri = 0; ri < rings; ri++) {
      if (!isSampledRow(ri)) continue;
      for (let j = 0; j < SEGMENTS; j++) {
        if (j % SG === 0) continue;
        const j0 = j - (j % SG);
        const j1 = (j0 + SG) % SEGMENTS;
        const t = (j - j0) / SG;
        for (let c = 0; c < 3; c++) {
          const a0 = bake[(ri * SEGMENTS + j0) * 3 + c]!;
          const a1 = bake[(ri * SEGMENTS + j1) * 3 + c]!;
          bake[(ri * SEGMENTS + j) * 3 + c] = a0 + (a1 - a0) * t;
        }
      }
    }
  }

  if (SR > 1) {
    const rowLen = SEGMENTS * 3;
    for (let ri = 0; ri < rings; ri++) {
      if (isSampledRow(ri)) continue;
      const r0 = ri - (ri % SR);
      const r1 = Math.min(r0 + SR, lastRow);
      const t = (ri - r0) / (r1 - r0);
      for (let k = 0; k < rowLen; k++) {
        const a0 = bake[r0 * rowLen + k]!;
        const a1 = bake[r1 * rowLen + k]!;
        bake[ri * rowLen + k] = a0 + (a1 - a0) * t;
      }
    }
  }

  const peaks = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    peaks[v] = Math.max(bake[v * 3]!, bake[v * 3 + 1]!, bake[v * 3 + 2]!);
  }
  peaks.sort();
  const scale = peaks[Math.min(nv - 1, Math.floor(nv * 0.995))]! || 1.0;
  for (let i = 0; i < bake.length; i++) bake[i] = Math.min(1, bake[i]! / scale);

  geo.setAttribute("aBake", new THREE.BufferAttribute(bake, 3));
  onProgress(1);
}
