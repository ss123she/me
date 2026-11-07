import * as THREE from "three";
import { LEAD, type ScrollCamera } from "../scroll-camera";
import type { Stop } from "../content";
import type { Atlas } from "./text/atlas";
import {
  TextBlock,
  COLS,
  CW,
  LH,
  type Row,
  type Shared,
} from "./text/text-block";

const PAD = 0.6;
const W = COLS * CW + PAD * 2;
const HUD_DIST = 10;
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const TAN30 = Math.tan(THREE.MathUtils.degToRad(30));

const sstep = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function wrap(text: string, cols: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > cols) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function layout(stop: Stop): Row[] {
  const rows: Row[] = [
    { text: stop.title, kind: 1 },
    { text: "", kind: 0 },
  ];
  for (const para of stop.body ?? []) {
    for (const line of wrap(para, COLS)) rows.push({ text: line, kind: 0 });
    rows.push({ text: "", kind: 0 });
  }
  (stop.links ?? []).forEach((l, i) => {
    rows.push({
      text: `[ ${l.label.slice(0, COLS - 6)} ↗ ]`,
      kind: 2,
      link: i,
    });
  });
  while (rows[rows.length - 1]?.text === "") rows.pop();
  return rows;
}

const planeVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const planeFrag = /* glsl */ `
  uniform vec2 uSize;
  uniform float uTime, uAlpha, uHover;
  uniform vec3 uAccent;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * uSize;
    vec2 h = uSize * 0.5;
    float d = min(h.x - abs(p.x), h.y - abs(p.y));
    float line = 1.0 - smoothstep(0.0, 0.025, abs(d - 0.12));
    float corner = step(h.x - abs(p.x), 0.9) * step(h.y - abs(p.y), 0.9);
    float edge = line * mix(0.3, 1.0, corner) * (1.0 + uHover * 0.6);
    float scan = 0.04 * sin((vUv.y * uSize.y - uTime * 0.6) * 40.0);
    vec3 fillCol = mix(vec3(0.03, 0.04, 0.09), uAccent * 0.15, uHover * 0.5);
    vec3 col = mix(fillCol, uAccent, clamp(edge, 0.0, 1.0));
    float a = max((0.55 + scan) * step(0.0, d), edge) * uAlpha;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

interface Card {
  stop: Stop;
  rows: Row[];
  size: THREE.Vector2;
  root: THREE.Group;
  pivot: THREE.Group;
  plane: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  text: TextBlock;
  hud: TextBlock;
  alpha: number;
  reveal: number;
  hover: number;
  tilt: THREE.Vector2;
}

export class Cards {
  private readonly cards: Card[] = [];
  private readonly shared: Shared = {
    uTime: { value: 0 },
    uGlitch: { value: 0 },
  };
  private readonly hud = new THREE.Group();
  private readonly ray = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(9, 9);
  private readonly tan = new THREE.Vector3();
  private best: Card | null = null;
  private prevP = 0;
  private glitch = 0;

  constructor(
    private readonly cam: ScrollCamera,
    scene: THREE.Scene,
    atlas: Atlas,
    stops: Stop[],
    private readonly dom: HTMLElement,
  ) {
    const n = stops.length;
    cam.snapStops = n;
    scene.add(cam.camera);
    cam.camera.add(this.hud);

    stops.forEach((stop, i) => {
      const rows = layout(stop);
      const size = new THREE.Vector2(W, rows.length * LH + PAD * 2);

      const root = new THREE.Group();
      const u = cam.archU(n > 1 ? i / (n - 1) : 0);
      cam.path.getPointAt(u, root.position);
      cam.path.getTangentAt(u, this.tan);
      root.quaternion.setFromUnitVectors(AXIS_Z, this.tan.negate());

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uSize: { value: size },
          uTime: this.shared.uTime,
          uAlpha: { value: 0 },
          uHover: { value: 0 },
          uAccent: { value: new THREE.Color(0x4de1ff) },
        },
        vertexShader: planeVert,
        fragmentShader: planeFrag,
        transparent: true,
        depthWrite: false,
      });
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(size.x, size.y),
        mat,
      );
      plane.renderOrder = 9;

      const text = new TextBlock(
        atlas,
        rows,
        new THREE.Vector2(-size.x / 2 + PAD, size.y / 2 - PAD),
        this.shared,
      );
      text.mesh.position.z = 0.02;

      const pivot = new THREE.Group();
      pivot.add(plane, text.mesh);
      root.add(pivot);
      scene.add(root);

      const label = `${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}  ${stop.label.toUpperCase()}`;
      const hud = new TextBlock(
        atlas,
        [{ text: label, kind: 3 }],
        new THREE.Vector2(0, 0),
        this.shared,
      );
      hud.mesh.scale.setScalar(0.45);
      this.hud.add(hud.mesh);

      this.cards.push({
        stop,
        rows,
        size,
        root,
        pivot,
        plane,
        mat,
        text,
        hud,
        alpha: 0,
        reveal: 0,
        hover: 0,
        tilt: new THREE.Vector2(),
      });
    });

    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerdown", this.onMove);
    dom.addEventListener("click", this.onClick);
  }

  public resize(aspect: number) {
    const s = Math.min(1, (2 * TAN30 * LEAD * aspect * 0.9) / W);
    for (const c of this.cards) c.root.scale.setScalar(s);
    const h = 2 * TAN30 * HUD_DIST;
    this.hud.position.set((-h * aspect) / 2 + 0.7, h / 2 - 0.7, -HUD_DIST);
  }

  public update(delta: number) {
    const p = this.cam.progress;
    this.shared.uTime.value += delta;

    const vel = Math.abs(p - this.prevP) / Math.max(delta, 1e-3);
    this.prevP = p;
    this.glitch +=
      (Math.min(vel * 3, 1) - this.glitch) * (1 - Math.exp(-delta * 10));
    this.shared.uGlitch.value = this.glitch;

    const span = 1 / Math.max(this.cards.length - 1, 1);
    let best: Card | null = null;
    for (const [i, c] of this.cards.entries()) {
      const d = (p - i * span) / span;
      c.alpha = sstep(-0.3, -0.08, d) * (1 - sstep(0.02, 0.16, d));
      const on = d > -0.12 && d < 0.05;
      c.reveal = THREE.MathUtils.clamp(
        c.reveal + (on ? delta / 1.1 : -delta / 0.35),
        0,
        1,
      );

      c.root.visible = c.hud.mesh.visible = c.alpha > 0.005;
      for (const b of [c.text, c.hud]) {
        b.u.uAlpha.value = c.alpha;
        b.u.uProgress.value = c.reveal;
      }
      c.mat.uniforms.uAlpha!.value = c.alpha;
      if (c.alpha > 0.6 && (!best || c.alpha > best.alpha)) best = c;
    }
    this.best = best;

    const k = 1 - Math.exp(-delta * 6);
    let overLink = false;
    for (const c of this.cards) {
      const isBest = c === best;
      c.tilt.x += ((isBest ? -this.pointer.y * 0.1 : 0) - c.tilt.x) * k;
      c.tilt.y += ((isBest ? this.pointer.x * 0.16 : 0) - c.tilt.y) * k;
      c.pivot.rotation.set(c.tilt.x, c.tilt.y, 0);

      const row = isBest ? this.pickRow(c) : null;
      c.hover += ((row !== null ? 1 : 0) - c.hover) * k;
      c.mat.uniforms.uHover!.value = c.hover;

      const onLink = row !== null && c.rows[row]?.kind === 2;
      c.text.setHover(onLink ? row : -1);
      overLink ||= onLink;
    }
    this.dom.style.cursor = overLink ? "pointer" : "default";
  }

  private setPointer(e: PointerEvent | MouseEvent) {
    this.pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
  }

  private pickRow(c: Card): number | null {
    this.ray.setFromCamera(this.pointer, this.cam.camera);
    const hit = this.ray.intersectObject(c.plane)[0];
    if (!hit?.uv) return null;
    const localY = (hit.uv.y - 0.5) * c.size.y;
    return Math.floor((c.size.y / 2 - PAD - localY) / LH);
  }

  private onMove = (e: PointerEvent) => this.setPointer(e);

  private onClick = (e: MouseEvent) => {
    this.setPointer(e);
    const c = this.best;
    if (!c) return;
    const row = this.pickRow(c);
    const link = row === null ? undefined : c.rows[row]?.link;
    if (link === undefined) return;
    const url = c.stop.links![link]!.url;
    if (url.startsWith("mailto:")) location.href = url;
    else window.open(url, "_blank", "noopener");
  };
}
