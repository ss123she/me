import gsap from "gsap";
import * as THREE from "three";

export class ScrollCamera {
  public readonly camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    1,
    10000,
  );

  readonly scrollState = {
    progress: 0,
    targetProgress: 0,
  };

  cameraPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-100, 200, 0),
    new THREE.Vector3(0, 100, 0),
    new THREE.Vector3(800, 0, 0),
  ]);
  targetPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(100, 300, 0),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(900, 0, 0),
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

    const scrollState = this.scrollState;
    scrollState.targetProgress = THREE.MathUtils.clamp(
      scrollState.targetProgress + e.deltaY * sensivity,
      0,
      1,
    );

    gsap.to(scrollState, {
      progress: scrollState.targetProgress,
      duration: 1.2,
      ease: "power2.out",
      overwrite: "auto",
      onUpdate: () => this.updateCameraFromProgress(),
    });
  }

  updateCameraFromProgress() {
    const p = this.scrollState.progress;
    this.cameraPath.getPointAt(p, this.currentCameraPos);
    this.camera.position.copy(this.currentCameraPos);

    this.targetPath.getPointAt(p, this.currentTargetPos);

    this.camera.lookAt(this.currentTargetPos);
  }
}
