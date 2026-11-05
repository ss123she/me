import gsap from "gsap";
import * as THREE from "three";

export class ScrollCamera {
  public readonly camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2000,
  );

  cameraPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-12, 4.0, 12),
    new THREE.Vector3(-4, 2.0, 6),
    new THREE.Vector3(5, 2.8, -4),
    new THREE.Vector3(12, 5.0, -12),
  ]);

  targetPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2, 1.2, 2),
    new THREE.Vector3(0, 0.8, 0),
    new THREE.Vector3(1, 0.8, -1),
    new THREE.Vector3(0, 1.5, 0),
  ]);

  readonly scrollState = {
    progress: 0,
    targetProgress: 0,
  };

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
