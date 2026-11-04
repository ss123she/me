import gsap from "gsap";
import * as THREE from "three";

export class ScrollCamera {
  public readonly camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    1,
    20000,
  );

  readonly scrollState = {
    progress: 0,
    targetProgress: 0,
  };

  cameraPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3000, 2200, 3000),
    new THREE.Vector3(-1000, 1400, 1200),
    new THREE.Vector3(1200, 1600, -800),
    new THREE.Vector3(3000, 2400, -3000),
  ]);
  targetPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-500, 200, 500),
    new THREE.Vector3(0, 100, 0),
    new THREE.Vector3(200, 100, -200),
    new THREE.Vector3(0, 200, 0),
  ]);

  currentCameraPos = new THREE.Vector3();
  currentTargetPos = new THREE.Vector3();

  constructor() {
    this.updateCameraFromProgress();
  }

  public addWheel() {
    window.addEventListener("wheel", (p) => this.onWheel(p), {
      passive: false,
    });
  }

  public onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  onWheel(e: WheelEvent) {
    e.preventDefault();
    const sensivity = 0.0008;

    this.scrollState.targetProgress = THREE.MathUtils.clamp(
      this.scrollState.targetProgress + e.deltaY * sensivity,
      0,
      1,
    );

    gsap.to(this.scrollState, {
      progress: this.scrollState.targetProgress,
      duration: 1.2,
      ease: "power2.out",
      overwrite: "auto",
      onUpdate: () => this.updateCameraFromProgress(),
    });
  }

  updateCameraFromProgress() {
    const p = this.scrollState.progress;

    // Camera position
    this.cameraPath.getPointAt(p, this.currentCameraPos);
    this.camera.position.copy(this.currentCameraPos);

    // Target position
    this.targetPath.getPointAt(p, this.currentTargetPos);
    this.camera.lookAt(this.currentTargetPos);
  }
}
