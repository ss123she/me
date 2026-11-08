import * as THREE from "three";

const CRACK_SPEED = 1.8;
const GRAVITY = 3.2;
const FALL_TIME = 1.8;

const vertex = /* glsl */ `
const float CRACK_SPEED = ${CRACK_SPEED.toFixed(3)};
const float GRAVITY = ${GRAVITY.toFixed(3)};

uniform float uTime;
uniform float uAspect;
uniform vec2 uImpact;

attribute vec2 aCenter;
attribute float aEdge;
attribute vec4 aRand;
attribute vec2 aVel;

varying vec2 vUv;
varying float vEdge;
varying float vCrack;
varying float vDetach;
varying float vAlpha;
varying float vBack;
varying float vGlint;
varying float vDist;
varying float vRnd;

void main() {
  vec2 p0 = position.xy;
  vUv = vec2(p0.x / uAspect, p0.y);
  vDist = length(p0 - uImpact);
  vEdge = aEdge;
  vRnd = aRand.w;

  float front = uTime * CRACK_SPEED - (vDist + (aRand.w - 0.5) * 0.1);
  vCrack = clamp(front / 0.12, 0.0, 1.0);

  float t = max(uTime - aRand.x, 0.0);
  vDetach = smoothstep(0.0, 0.08, t);

  vec2 local = p0 - aCenter;
  float ang = aRand.y * t * t;
  float flip = aRand.z * t * t;
  float fc = cos(flip);
  float ca = cos(ang);
  float sa = sin(ang);

  vec2 r = vec2(ca * local.x - sa * local.y, sa * local.x + ca * local.y);
  r.x *= fc;
  r *= 1.0 + 0.35 * aRand.w * t;

  vec2 disp = aVel * t + vec2(0.0, -0.5 * GRAVITY * t * t);
  vec2 pos = aCenter + r + disp;

  vBack = step(fc, 0.0);
  vGlint = pow(max(0.0, sin(ang * 2.0 + aRand.x * 40.0)), 12.0) * vDetach;
  vAlpha = 1.0 - smoothstep(1.1, 1.7, t);

  gl_Position = vec4(pos.x / uAspect * 2.0 - 1.0, pos.y * 2.0 - 1.0, 0.0, 1.0);
}
`;

const fragment = /* glsl */ `
uniform sampler2D uIce;
uniform float uTime;
uniform float uPx;

varying vec2 vUv;
varying float vEdge;
varying float vCrack;
varying float vDetach;
varying float vAlpha;
varying float vBack;
varying float vGlint;
varying float vDist;
varying float vRnd;

void main() {
  if (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0) discard;

  vec3 col = texture2D(uIce, vUv).rgb;

  float strength = 0.35 + 0.65 * fract(vRnd * 7.31);
  float line = 1.0 - smoothstep(0.0, uPx * 1.6, vEdge);
  float dark = 1.0 - smoothstep(uPx * 1.5, uPx * 4.5, vEdge);
  col *= 1.0 - dark * vCrack * 0.14;
  col = mix(col, vec3(0.95, 1.0, 1.0) * 1.4, line * vCrack * strength);

  float bevel = 1.0 - smoothstep(0.0, 0.012, vEdge);
  col += bevel * vDetach * vec3(0.35, 0.5, 0.5) * 0.4;
  col += vGlint * vec3(0.55, 0.75, 0.75) * 0.3;

  col = mix(col, col * vec3(0.55, 0.75, 0.82) + 0.04, vBack);
  col += exp(-vDist * 7.0) * exp(-uTime * 7.0) * vec3(0.8, 1.0, 0.95);

  float feather = mix(1.0, smoothstep(0.0, uPx * 1.2, vEdge), vDetach);

  gl_FragColor = vec4(col, vAlpha * feather);
}
`;

type Pt = [number, number];

interface Ray {
  id: number;
  th: number;
}

function makeShards(cx: number, cy: number, aspect: number): Pt[][] {
  const seed = Math.random() * 1000;
  const h = (a: number, b: number, c = 0) => {
    const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + seed) * 43758.5453;
    return s - Math.floor(s);
  };

  const maxR =
    Math.hypot(Math.max(cx, aspect - cx), Math.max(cy, 1 - cy)) * 1.1;

  const radii = [0];
  let r = 0.05 + Math.random() * 0.03;
  for (;;) {
    radii.push(r);
    if (r > maxR) break;
    r += Math.min(r * (0.55 + Math.random() * 0.4), 0.42);
  }
  const K = radii.length - 1;

  const n0 = 8 + Math.floor(Math.random() * 4);
  const base = Math.random() * Math.PI * 2;
  let nextId = 0;
  let cur: Ray[] = [];
  for (let i = 0; i < n0; i++) {
    cur.push({
      id: nextId++,
      th: base + ((i + (Math.random() - 0.5) * 0.7) / n0) * Math.PI * 2,
    });
  }
  const rays: Ray[][] = [cur];
  for (let k = 0; k < K; k++) {
    const next: Ray[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i]!;
      const bTh =
        i + 1 < cur.length ? cur[i + 1]!.th : cur[0]!.th + Math.PI * 2;
      next.push(a);
      const width = (bTh - a.th) * radii[k + 1]!;
      if (width > 0.3 + Math.random() * 0.25) {
        next.push({
          id: nextId++,
          th: a.th + (bTh - a.th) * (0.3 + Math.random() * 0.4),
        });
      }
    }
    rays.push(next);
    cur = next;
  }

  const P = (k: number, ray: Ray): Pt => {
    if (k === 0) return [cx, cy];
    const th = ray.th + (h(k, ray.id, 1) - 0.5) * 0.2;
    const rad = radii[k]! * (1 + (h(k, ray.id, 2) - 0.5) * 0.3);
    return [cx + Math.cos(th) * rad, cy + Math.sin(th) * rad];
  };

  const jag = (a: Pt, b: Pt, k1: number, k2: number, k3: number): Pt => {
    const o = (h(k1, k2, k3) - 0.5) * 0.35;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return [(a[0] + b[0]) / 2 - dy * o, (a[1] + b[1]) / 2 + dx * o];
  };

  const shards: Pt[][] = [];

  for (let k = 0; k < K; k++) {
    const Rk = rays[k]!;
    const Rk1 = rays[k + 1]!;
    const n1 = Rk1.length;

    for (let i = 0; i < Rk.length; i++) {
      const a = Rk[i]!;
      const b = Rk[(i + 1) % Rk.length]!;
      const poly: Pt[] = [];

      const pa = P(k, a);
      const pb = P(k, b);
      if (k === 0) poly.push(pa);
      else poly.push(pa, jag(pa, pb, k, a.id * 1000 + b.id, 4), pb);

      const qb = P(k + 1, b);
      poly.push(jag(pb, qb, k, b.id, 3), qb);

      let j = Rk1.indexOf(b);
      const ia = Rk1.indexOf(a);
      while (j !== ia) {
        const jp = (j - 1 + n1) % n1;
        const u = Rk1[jp]!;
        const v = Rk1[j]!;
        const pu = P(k + 1, u);
        poly.push(jag(pu, P(k + 1, v), k + 1, u.id * 1000 + v.id, 4), pu);
        j = jp;
      }

      poly.push(jag(pa, P(k + 1, a), k, a.id, 3));

      let minx = Infinity;
      let maxx = -Infinity;
      let miny = Infinity;
      let maxy = -Infinity;
      for (const [x, y] of poly) {
        minx = Math.min(minx, x);
        maxx = Math.max(maxx, x);
        miny = Math.min(miny, y);
        maxy = Math.max(maxy, y);
      }
      if (maxx < 0 || minx > aspect || maxy < 0 || miny > 1) continue;

      shards.push(poly);
    }
  }
  return shards;
}

export class IceShatter {
  public readonly scene = new THREE.Scene();
  public active = false;

  private readonly camera = new THREE.Camera();
  private readonly material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh | null = null;
  private iceTex: THREE.FramebufferTexture | null = null;
  private time = 0;
  private duration = 0;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uPx: { value: 1 / 1000 },
        uImpact: { value: new THREE.Vector2() },
        uIce: { value: null },
      },
    });
  }

  public capture(renderer: THREE.WebGLRenderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.iceTex?.dispose();
    this.iceTex = new THREE.FramebufferTexture(size.x, size.y);
    this.iceTex.minFilter = THREE.LinearFilter;
    this.iceTex.magFilter = THREE.LinearFilter;
    renderer.setRenderTarget(null);
    renderer.copyFramebufferToTexture(this.iceTex);
    this.material.uniforms.uIce!.value = this.iceTex;
    this.material.uniforms.uPx!.value = 1 / size.y;
  }

  public start(impact: { x: number; y: number }, aspect: number) {
    const cx = impact.x * aspect;
    const cy = impact.y;
    const shards = makeShards(cx, cy, aspect);

    const pos: number[] = [];
    const center: number[] = [];
    const edge: number[] = [];
    const rnd: number[] = [];
    const vel: number[] = [];
    let maxDelay = 0;

    for (const pts of shards) {
      let mx = 0;
      let my = 0;
      for (const [x, y] of pts) {
        mx += x;
        my += y;
      }
      mx /= pts.length;
      my /= pts.length;

      let size = 0;
      let far = 0;
      for (const [x, y] of pts) {
        size = Math.max(size, Math.hypot(x - mx, y - my));
        const sx = Math.min(Math.max(x, 0), aspect);
        const sy = Math.min(Math.max(y, 0), 1);
        far = Math.max(far, Math.hypot(sx - cx, sy - cy));
      }

      const dx = mx - cx;
      const dy = my - cy;
      const dist = Math.hypot(dx, dy);

      const delay = far / CRACK_SPEED + 0.08 + Math.random() * 0.35;
      maxDelay = Math.max(maxDelay, delay);

      const spin = ((Math.random() - 0.5) * 10) / (1 + size * 6);
      const flip = ((Math.random() - 0.5) * 8) / (1 + size * 4);
      const depth = Math.random();

      const kick = (0.5 / (1 + dist * 5)) * (0.4 + Math.random());
      const len = dist || 1;
      const vx = (dx / len) * kick + (Math.random() - 0.5) * 0.05;
      const vy = (dy / len) * kick + (Math.random() - 0.5) * 0.05;

      for (let k = 0; k < pts.length; k++) {
        const a = pts[k]!;
        const b = pts[(k + 1) % pts.length]!;
        const ex = b[0] - a[0];
        const ey = b[1] - a[1];
        const el = Math.hypot(ex, ey) || 1;
        const d = Math.abs(ex * (my - a[1]) - ey * (mx - a[0])) / el;

        const verts: [number, number, number][] = [
          [mx, my, d],
          [a[0], a[1], 0],
          [b[0], b[1], 0],
        ];
        for (const [x, y, e] of verts) {
          pos.push(x, y, 0);
          center.push(mx, my);
          edge.push(e);
          rnd.push(delay, spin, flip, depth);
          vel.push(vx, vy);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("aCenter", new THREE.Float32BufferAttribute(center, 2));
    geo.setAttribute("aEdge", new THREE.Float32BufferAttribute(edge, 1));
    geo.setAttribute("aRand", new THREE.Float32BufferAttribute(rnd, 4));
    geo.setAttribute("aVel", new THREE.Float32BufferAttribute(vel, 2));

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.material.uniforms.uAspect!.value = aspect;
    this.material.uniforms.uImpact!.value.set(cx, cy);
    this.time = 0;
    this.duration = maxDelay + FALL_TIME;
    this.active = true;
  }

  public resize(aspect: number) {
    this.material.uniforms.uAspect!.value = aspect;
  }

  public update(delta: number) {
    if (!this.active) return;
    this.time += delta;
    this.material.uniforms.uTime!.value = this.time;
    if (this.time > this.duration) this.dispose();
  }

  public render(renderer: THREE.WebGLRenderer) {
    if (!this.active) return;
    const prev = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prev;
  }

  private dispose() {
    this.active = false;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.iceTex?.dispose();
    this.iceTex = null;
  }
}
