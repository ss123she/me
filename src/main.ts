import * as THREE from "three";
import "@fontsource/jetbrains-mono/latin-400.css";
import { Tunnel, BG, FOG_NEAR, FOG_FAR } from "./scene/tunnel";
import { createAtlas } from "./scene/text/atlas";
import { Cards } from "./scene/cards";
import { Crystals } from "./scene/crystals";
import { STOPS, type Stop } from "./content";
import { ScrollCamera } from "./scroll-camera";

function mountHiddenText(stops: Stop[]) {
  const root = document.createElement("div");
  root.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";
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
  public readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  public readonly camera = new ScrollCamera();

  private readonly timer = new THREE.Timer();
  private readonly updaters: ((delta: number) => void)[] = [];

  constructor(container: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.style.touchAction = "none";
    container.appendChild(this.renderer.domElement);

    this.camera.attach();
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
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private render() {
    this.timer.update();
    const delta = this.timer.getDelta();

    this.camera.update(delta);
    for (const update of this.updaters) update(delta);

    this.renderer.render(this.scene, this.camera.camera);
  }
}

async function main() {
  const world = new World(document.getElementById("app") ?? document.body);
  world.scene.background = new THREE.Color(BG);
  world.scene.fog = new THREE.Fog(BG, FOG_NEAR, FOG_FAR);

  const atlas = await createAtlas();
  const tunnel = new Tunnel(
    world.camera,
    STOPS.length,
    world.renderer.getPixelRatio(),
  );
  const cards = new Cards(
    world.camera,
    world.scene,
    atlas,
    STOPS,
    world.renderer.domElement,
  );
  const crystals = new Crystals(world.camera);
  world.add(tunnel.group);
  world.add(crystals.mesh);

  const fit = () => cards.resize(window.innerWidth / window.innerHeight);
  window.addEventListener("resize", fit);
  fit();

  world.onFrame((delta) => {
    tunnel.update(delta);
    crystals.update(delta);
    cards.update(delta);
  });

  mountHiddenText(STOPS);
}

main();
