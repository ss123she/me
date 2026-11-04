import * as THREE from "three";
import Stats from "stats.js";
import { ScrollCamera } from "./scroll-camera";

export class World {
  public readonly scene = new THREE.Scene();
  public readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  public readonly camera = new ScrollCamera();

  private readonly stats = new Stats();
  private readonly timer = new THREE.Timer();

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(0xefd1b5);

    // Renderer settings
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

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

  private onResize() {
    this.camera.onWindowResize();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private render() {
    this.timer.update();
    this.renderer.render(this.scene, this.camera.camera);
    this.stats.update();
  }
}
