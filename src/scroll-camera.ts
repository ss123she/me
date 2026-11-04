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
  readonly lookTarget = new THREE.Vector3(0, 200, 0);

  constructor() {
    this.camera.position.set(100, 800, -800);
    this.camera.lookAt(-100, 700, -800);
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

    const camera = this.camera;
    camera.position.x = Math.sin(p * Math.PI) * 200;
    camera.position.y = 500 + Math.sin(p * Math.PI * 2) * 150;
    camera.position.z = -1200 + p * 2400;
    this.lookTarget.set(0, 150, camera.position.z + 500);
    camera.lookAt(this.lookTarget);
  }
}
