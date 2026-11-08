import * as THREE from "three";
import "@fontsource/jetbrains-mono/latin-400.css";
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  VignetteEffect,
} from "postprocessing";
import { ScrollCamera } from "./scroll-camera";
import { FrostEffect } from "./scene/frost";
import { IceShatter } from "./scene/shatter";
import { COLOR_B } from "./scene/colors";

const WAKE_TIME = 1.8;

export type Impact = { x: number; y: number };

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

  frost = new FrostEffect(COLOR_B);
  private frostPass: EffectPass | null = null;
  private readonly shatter = new IceShatter();
  private pendingImpact: Impact | null = null;
  private shatterTime = -1;
  private timeScale = 0;

  constructor(container: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.style.touchAction = "none";
    container.appendChild(this.renderer.domElement);

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
      ),
    );
    this.frostPass = new EffectPass(this.camera.camera, this.frost);
    this.composer.addPass(this.frostPass);

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

  public thaw(impact: Impact) {
    if (this.pendingImpact || this.shatterTime >= 0) return;
    this.pendingImpact = impact;
  }

  private onResize() {
    this.camera.onWindowResize();
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.shatter.resize(window.innerWidth / window.innerHeight);
  }

  private beginShatter(impact: Impact) {
    this.composer.render(0);
    this.shatter.capture(this.renderer);
    this.shatter.start(impact, window.innerWidth / window.innerHeight);

    if (this.frostPass) {
      this.composer.removePass(this.frostPass);
      this.frostPass.dispose();
      this.frostPass = null;
    }

    this.camera.attach();
    this.shatterTime = 0;
    this.pendingImpact = null;
  }

  private render() {
    this.timer.update();
    const real = this.timer.getDelta();

    if (this.pendingImpact) this.beginShatter(this.pendingImpact);

    if (this.shatterTime >= 0) {
      this.shatterTime += real;
      const p = Math.min(1, this.shatterTime / WAKE_TIME);
      this.timeScale = p * p * (3 - 2 * p);
      this.shatter.update(real);
    }

    const delta = real * this.timeScale;
    this.camera.update(delta);
    for (const update of this.updaters) update(delta);

    this.composer.render(real);
    this.shatter.render(this.renderer);
  }
}
