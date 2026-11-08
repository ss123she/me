import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import type { ScrollCamera } from "../../scroll-camera";

const CAVE_RADIUS = 11.0;
const NOISE_SCALE = 0.1;
const NOISE_AMP = 12.0;
const NOISE_DETAIL = 4;
const NOISE_ROUGHNESS = 0.55;
const RING_STEP = 0.5;
export const SEGMENTS = 64;
const SEED = 7;

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise() {
  const noise3 = createNoise3D(mulberry32(SEED));
  const octaves = NOISE_DETAIL + 1;
  return (x: number, y: number, z: number) => {
    let sum = 0,
      amp = 1,
      freq = NOISE_SCALE,
      norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise3(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= NOISE_ROUGHNESS;
      freq *= 2.0;
    }
    return 0.5 + 0.5 * (sum / norm);
  };
}

export function buildCaveGeometry(cam: ScrollCamera) {
  const noise = makeNoise();
  const rings = Math.max(16, Math.ceil(cam.length / RING_STEP));
  const vertCount = (rings + 1) * SEGMENTS;

  const positions = new Float32Array(vertCount * 3);
  const centers = new Float32Array((rings + 1) * 3);

  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const prevNormal = new THREE.Vector3(0, 1, 0);

  const cosT = new Float32Array(SEGMENTS);
  const sinT = new Float32Array(SEGMENTS);
  for (let j = 0; j < SEGMENTS; j++) {
    const th = (j / SEGMENTS) * Math.PI * 2;
    cosT[j] = Math.cos(th);
    sinT[j] = Math.sin(th);
  }

  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    cam.path.getPointAt(u, p);
    cam.path.getTangentAt(u, t).normalize();

    a.copy(prevNormal).addScaledVector(t, -prevNormal.dot(t));
    if (a.lengthSq() < 1e-4) a.set(1, 0, 0).addScaledVector(t, -t.x);
    a.normalize();
    b.crossVectors(t, a).normalize();
    prevNormal.copy(a);

    centers[i * 3] = p.x;
    centers[i * 3 + 1] = p.y;
    centers[i * 3 + 2] = p.z;

    for (let j = 0; j < SEGMENTS; j++) {
      const dx = a.x * cosT[j]! + b.x * sinT[j]!;
      const dy = a.y * cosT[j]! + b.y * sinT[j]!;
      const dz = a.z * cosT[j]! + b.z * sinT[j]!;

      const vx = p.x + dx * CAVE_RADIUS;
      const vy = p.y + dy * CAVE_RADIUS;
      const vz = p.z + dz * CAVE_RADIUS;
      const off = (noise(vx, vy, vz) - 0.5) * NOISE_AMP;

      const k = (i * SEGMENTS + j) * 3;
      positions[k] = vx + dx * off;
      positions[k + 1] = vy + dy * off;
      positions[k + 2] = vz + dz * off;
    }
  }

  const indices = new Uint32Array(rings * SEGMENTS * 6);
  let w = 0;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const j2 = (j + 1) % SEGMENTS;
      const i0 = i * SEGMENTS + j;
      const i1 = (i + 1) * SEGMENTS + j;
      const i2 = (i + 1) * SEGMENTS + j2;
      const i3 = i * SEGMENTS + j2;
      indices[w++] = i0;
      indices[w++] = i1;
      indices[w++] = i3;
      indices[w++] = i1;
      indices[w++] = i2;
      indices[w++] = i3;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();

  fixNormalsInward(geo, centers);
  return { geo, centers, rings };
}

function fixNormalsInward(geo: THREE.BufferGeometry, centers: Float32Array) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const n = pos.count;
  const step = Math.max(1, Math.floor(n / 500));
  let score = 0;
  for (let v = 0; v < n; v += step) {
    const c = Math.floor(v / SEGMENTS) * 3;
    score +=
      nor.getX(v) * (centers[c]! - pos.getX(v)) +
      nor.getY(v) * (centers[c + 1]! - pos.getY(v)) +
      nor.getZ(v) * (centers[c + 2]! - pos.getZ(v));
  }
  if (score < 0) {
    const idx = geo.index!.array as Uint32Array;
    for (let k = 0; k < idx.length; k += 3) {
      const tmp = idx[k + 1]!;
      idx[k + 1] = idx[k + 2]!;
      idx[k + 2] = tmp;
    }
    geo.index!.needsUpdate = true;
    geo.computeVertexNormals();
  }
}
