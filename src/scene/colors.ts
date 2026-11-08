import * as THREE from "three";

export const FOG_NEAR = 15;
export const FOG_FAR = 80;

function createPrng(a: number) {
  return function rand() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveSeed(): number {
  const urlParam = new URLSearchParams(window.location.search).get("seed");
  if (urlParam) {
    const parsed = Number(urlParam);
    if (!isNaN(parsed)) return Math.floor(Math.abs(parsed));
  }
  return Math.floor(Math.random() * 1_000_000);
}

export const SEED: number = resolveSeed();
const rand = createPrng(SEED);

const baseHue = rand();

const highlightHue = (baseHue + 0.05 + rand() * 0.04) % 1.0;

const bgColor = new THREE.Color().setHSL(
  baseHue,
  0.65 + rand() * 0.15, // Saturation: 65-80%
  0.07 + rand() * 0.04, // Lightness: 7-11%
);

export const COLOR_A = new THREE.Color().setHSL(
  baseHue,
  0.72 + rand() * 0.18, // Saturation: 72-90%
  0.3 + rand() * 0.08, // Lightness: 30-38%
);

export const COLOR_B = new THREE.Color().setHSL(
  highlightHue,
  0.55 + rand() * 0.25, // Saturation: 55-80%
  0.8 + rand() * 0.08, // Lightness: 80-88%
);

export const BG = bgColor.getHex();

console.log(
  `%c[CAVE] Sector seed: #${SEED}`,
  `color: #${COLOR_B.getHexString()}; font-weight: bold;`,
);
