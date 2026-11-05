import * as THREE from "three";
import Stats from "stats.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ScrollCamera } from "../scroll-camera";

export class World {
  public readonly scene = new THREE.Scene();
  public readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  public readonly camera = new ScrollCamera();
  public readonly bloom: UnrealBloomPass;

  private readonly composer: EffectComposer;
  private readonly stats = new Stats();
  private readonly timer = new THREE.Timer();
  private readonly updaters: ((delta: number) => void)[] = [];

  constructor(container: HTMLElement) {
    const skyColor = new THREE.Color(0xa0c3df);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(0xa0c3df, 0.00025);

    // Renderer settings
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    // Post-processing settings
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.25, // strength
      0.4, // radius
      1.2, // threshold
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // Scroll camera
    this.camera.addWheel();

    // Event listeners
    window.addEventListener("resize", () => this.onResize());

    // Launch cycle
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
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  private render() {
    this.timer.update();
    const delta = this.timer.getDelta();

    for (const update of this.updaters) update(delta);

    this.composer.render();

    this.stats.update();
  }
}
