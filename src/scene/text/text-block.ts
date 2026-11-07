import * as THREE from "three";
import type { Atlas } from "./atlas";

export const COLS = 30;
export const CW = 0.22;
export const LH = 0.44;

/** kind: 0 text, 1 Header, 2 Link, 3 HUD */
export interface Row {
  text: string;
  kind: 0 | 1 | 2 | 3;
  link?: number;
}

export interface Shared {
  uTime: { value: number };
  uGlitch: { value: number };
}

const U0 = 0.28125;
const U1 = 0.71875;
const V0 = 0.0625;
const V1 = 0.9375;

const vertexShader = /* glsl */ `
  uniform float uTime, uProgress, uAlpha, uGlitch, uHoverRow, uHoverT, uScr;
  attribute vec4 aMeta; // char, row, order, col
  attribute vec2 aInfo; // seed, kind
  varying vec2 vUv;
  varying float vCell, vAlpha, vKind;
  varying vec2 vMix;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    float k = uProgress * 1.5 - aMeta.z;
    float scr = step(0.0, k) * (1.0 - step(0.35, k));
    float tick = floor(uTime * 16.0);
    float rnd = floor(hash(vec2(aInfo.x, tick)) * uScr) + 1.0;

    float hov = 1.0 - step(0.5, abs(aMeta.y - uHoverRow));
    float hk = (uTime - uHoverT) * 10.0 - aMeta.w * 3.0;
    float hscr = hov * step(0.0, hk) * (1.0 - step(1.0, hk));

    float sc = max(scr, hscr);
    vCell = sc > 0.5 ? rnd : aMeta.x;
    vMix = vec2(sc, hov);
    vKind = aInfo.y;
    vUv = uv;
    vAlpha = step(0.0, k) * uAlpha;

    vec3 p = position;
    float g = uGlitch * step(0.82, hash(vec2(aMeta.y, floor(uTime * 22.0))));
    p.x += g * (hash(vec2(aMeta.y, tick + 7.0)) - 0.5) * 1.2;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec2 uGrid;
  uniform vec3 uBody, uAccent, uDim;
  varying vec2 vUv;
  varying float vCell, vAlpha, vKind;
  varying vec2 vMix;

  void main() {
    if (vAlpha < 0.01) discard;
    float c = floor(vCell + 0.5);
    vec2 cell = vec2(mod(c, uGrid.x), floor(c / uGrid.x));
    float sd = texture2D(uAtlas, (cell + vec2(vUv.x, 1.0 - vUv.y)) / uGrid).r;
    float w = fwidth(sd) * 0.75 + 0.001;
    float a = smoothstep(0.5 - w, 0.5 + w, sd);

    vec3 col = vKind < 0.5 ? uBody : (vKind < 1.5 ? uAccent : (vKind < 2.5 ? uBody : uDim));
    col = mix(col, uAccent, max(vMix.x, vMix.y));
    gl_FragColor = vec4(col, a * vAlpha);
    #include <colorspace_fragment>
  }
`;

export class TextBlock {
  public readonly mesh: THREE.Mesh;
  public readonly u = {
    uProgress: { value: 0 },
    uAlpha: { value: 0 },
    uHoverRow: { value: -1 },
    uHoverT: { value: -100 },
  };
  private readonly shared: Shared;

  constructor(
    atlas: Atlas,
    rows: Row[],
    origin: THREE.Vector2,
    shared: Shared,
  ) {
    this.shared = shared;

    let n = 0;
    for (const r of rows) for (const ch of r.text) if (ch !== " ") n++;

    const pos = new Float32Array(n * 12);
    const uv = new Float32Array(n * 8);
    const meta = new Float32Array(n * 16);
    const info = new Float32Array(n * 8);
    const idx = new Uint16Array(n * 6);

    let g = 0;
    rows.forEach((row, ri) => {
      Array.from(row.text).forEach((ch, ci) => {
        if (ch === " ") return;
        const x0 = origin.x + ci * CW;
        const y1 = origin.y - ri * LH;
        pos.set(
          [x0, y1 - LH, 0, x0 + CW, y1 - LH, 0, x0 + CW, y1, 0, x0, y1, 0],
          g * 12,
        );
        uv.set([U0, V0, U1, V0, U1, V1, U0, V1], g * 8);
        const seed = Math.random();
        for (let k = 0; k < 4; k++) {
          meta.set(
            [
              atlas.indexOf(ch),
              ri,
              (ri * COLS + ci) / (rows.length * COLS),
              ci / COLS,
            ],
            (g * 4 + k) * 4,
          );
          info.set([seed, row.kind], (g * 4 + k) * 2);
        }
        const b = g * 4;
        idx.set([b, b + 1, b + 2, b, b + 2, b + 3], g * 6);
        g++;
      });
    });

    const geo = new THREE.BufferGeometry();
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("aMeta", new THREE.BufferAttribute(meta, 4));
    geo.setAttribute("aInfo", new THREE.BufferAttribute(info, 2));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        ...this.u,
        uAtlas: { value: atlas.texture },
        uGrid: { value: new THREE.Vector2(atlas.cols, atlas.rows) },
        uScr: { value: atlas.scramble },
        uBody: { value: new THREE.Color(0xdfe5ff) },
        uAccent: { value: new THREE.Color(0x4de1ff) },
        uDim: { value: new THREE.Color(0x7c86b8) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  /** row = Hower line index or -1. */
  public setHover(row: number) {
    if (row === this.u.uHoverRow.value) return;
    this.u.uHoverRow.value = row;
    if (row >= 0) this.u.uHoverT.value = this.shared.uTime.value;
  }
}
