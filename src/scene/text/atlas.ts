import * as THREE from "three";

const FONT = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
const CHARS =
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") +
  "↗↓→←·—«»№…•";

const CELL = 64;
const PER_ROW = 16;
const SIZE = 36;
const RADIUS = 8;
const INF = 1e20;

export interface Atlas {
  texture: THREE.DataTexture;
  cols: number;
  rows: number;
  scramble: number;
  indexOf(ch: string): number;
}

function dt1d(
  f: Float32Array,
  d: Float32Array,
  v: Int32Array,
  z: Float32Array,
  n: number,
) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s: number;
    for (;;) {
      const p = v[k]!;
      s = (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p);
      if (s <= z[k]!) k--;
      else break;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const p = v[k]!;
    d[q] = (q - p) * (q - p) + f[p]!;
  }
}

function edt(g: Float32Array, w: number, h: number) {
  const m = Math.max(w, h);
  const f = new Float32Array(m);
  const d = new Float32Array(m);
  const v = new Int32Array(m);
  const z = new Float32Array(m + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x]!;
    dt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x]!;
    dt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) g[y * w + x] = d[x]!;
  }
}

export async function createAtlas(): Promise<Atlas> {
  try {
    await document.fonts.load(`${SIZE}px ${FONT}`, CHARS);
  } catch {
    /* System font. */
  }

  const rows = Math.ceil(CHARS.length / PER_ROW);
  const W = PER_ROW * CELL;
  const H = rows * CELL;

  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.font = `${SIZE}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  Array.from(CHARS).forEach((ch, i) => {
    ctx.fillText(
      ch,
      (i % PER_ROW) * CELL + CELL / 2,
      Math.floor(i / PER_ROW) * CELL + CELL / 2 + 2,
    );
  });

  const px = ctx.getImageData(0, 0, W, H).data;
  const n = W * H;
  const outside = new Float32Array(n);
  const inside = new Float32Array(n);
  const inMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const on = px[i * 4 + 3]! > 127;
    inMask[i] = on ? 1 : 0;
    outside[i] = on ? 0 : INF;
    inside[i] = on ? INF : 0;
  }
  edt(outside, W, H);
  edt(inside, W, H);

  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const d = inMask[i]
      ? Math.sqrt(inside[i]!) - 0.5
      : -(Math.sqrt(outside[i]!) - 0.5);
    data[i] = Math.round(
      THREE.MathUtils.clamp(0.5 + d / (2 * RADIUS), 0, 1) * 255,
    );
  }

  const texture = new THREE.DataTexture(
    data,
    W,
    H,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const index = new Map(Array.from(CHARS).map((c, i) => [c, i] as const));
  return {
    texture,
    cols: PER_ROW,
    rows,
    scramble: 94,
    indexOf: (ch) => index.get(ch) ?? index.get("?")!,
  };
}
