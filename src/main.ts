import * as THREE from "three";
import "@fontsource/jetbrains-mono/latin-400.css";
import { BG, FOG_NEAR, FOG_FAR } from "./scene/colors";
import { createAtlas } from "./scene/text/atlas";
import { Cards } from "./scene/cards";
import { STOPS, type Stop } from "./content";
import { ScrollCamera } from "./scroll-camera";
import { Cave } from "./scene/cave/cave";
import {
  BloomEffect,
  EffectPass,
  RenderPass,
  VignetteEffect,
  EffectComposer,
  ToneMappingEffect,
  ToneMappingMode,
} from "postprocessing";

function mountHiddenText(stops: Stop[]) {
  const root = document.createElement("div");
  root.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
    pointer-events: none;
  `;

  for (const s of stops) {
    const sec = document.createElement("section");
    const h = document.createElement("h2");
    h.textContent = s.title.replace(/^[/\s]+/, "");
    sec.append(h);
    for (const b of s.body ?? []) {
      const p = document.createElement("p");
      p.textContent = b;
      sec.append(p);
    }
    for (const l of s.links ?? []) {
      const a = document.createElement("a");
      a.href = l.url;
      a.textContent = l.label;
      sec.append(a);
    }
    root.append(sec);
  }
  document.body.append(root);
}

export class World {
  public readonly scene = new THREE.Scene();
  public readonly renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
    stencil: false,
    depth: false,
  });
  public readonly camera = new ScrollCamera();
  public readonly composer: EffectComposer;

  private readonly timer = new THREE.Timer();
  private readonly updaters: ((delta: number) => void)[] = [];

  constructor(container: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.style.touchAction = "none";
    container.appendChild(this.renderer.domElement);

    this.camera.attach();

    this.composer = new EffectComposer(this.renderer, { multisampling: 4 });
    this.composer.addPass(new RenderPass(this.scene, this.camera.camera));
    this.composer.addPass(
      new EffectPass(
        this.camera.camera,
        new BloomEffect({
          intensity: 0.8,
          luminanceThreshold: 0.6,
          luminanceSmoothing: 0.2,
          mipmapBlur: true,
        }),
        new VignetteEffect({ offset: 0.3, darkness: 0.6 }),
        new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      ),
    );

    window.addEventListener("resize", () => this.onResize());

    this.timer.connect(document);
    this.renderer.setAnimationLoop(() => this.render());
  }

  public add(object: THREE.Object3D) {
    this.scene.add(object);
  }

  public onFrame(update: (delta: number) => void) {
    this.updaters.push(update);
  }

  private onResize() {
    this.camera.onWindowResize();
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  private render() {
    this.timer.update();
    const delta = this.timer.getDelta();

    this.camera.update(delta);
    for (const update of this.updaters) update(delta);

    this.composer.render(delta);
  }
}

async function main() {
  const world = new World(document.getElementById("app") ?? document.body);
  world.scene.background = new THREE.Color(BG);
  world.scene.fog = new THREE.Fog(BG, FOG_NEAR, FOG_FAR);

  const cave = await Cave.create(world.camera, (p) =>
    console.log(Math.round(p * 100) + "%"),
  );
  world.scene.add(cave.group);

  const atlas = await createAtlas();

  const cards = new Cards(
    world.camera,
    world.scene,
    atlas,
    STOPS,
    world.renderer.domElement,
  );

  const fit = () => cards.resize(window.innerWidth / window.innerHeight);
  window.addEventListener("resize", fit);
  fit();

  world.onFrame((delta) => {
    cave.update(delta);
    cards.update(delta);
  });

  mountHiddenText(STOPS);
}

main();
