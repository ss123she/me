import * as THREE from "three";

const WHEEL_SENSITIVITY = 0.0005;
const TOUCH_SENSITIVITY = 0.001;
const SMOOTHING = 3.5;
const LOOK_AHEAD = 10;

export const LEAD = 14;

const KEY_STEPS: Record<string, number> = {
  ArrowDown: 0.05,
  ArrowUp: -0.05,
  PageDown: 0.2,
  PageUp: -0.2,
  " ": 0.2,
};

export const PATH_POINTS = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(14, 6, -35),
  new THREE.Vector3(-12, -4, -75),
  new THREE.Vector3(-16, 8, -115),
  new THREE.Vector3(10, -6, -155),
  new THREE.Vector3(-4, 2, -190),
  new THREE.Vector3(0, 0, -220),
];

export class ScrollCamera {
  public readonly camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    300,
  );

  public readonly path = new THREE.CatmullRomCurve3(
    PATH_POINTS,
    false,
    "centripetal",
  );

  public readonly length = this.path.getLength();
  public readonly travel = this.length - LEAD;

  private readonly pos = new THREE.Vector3();
  private readonly tan = new THREE.Vector3();

  private current = 0;
  private target = 0;
  private lastTouchY = 0;
  private idle = 0;
  public snapStops = 0;

  public get progress(): number {
    return this.current;
  }

  public cameraU(progress: number): number {
    return (progress * this.travel) / this.length;
  }

  public archU(progress: number): number {
    return (progress * this.travel + LEAD) / this.length;
  }

  public attach() {
    window.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("touchstart", this.onTouchStart, { passive: true });
    window.addEventListener("touchmove", this.onTouchMove, { passive: false });
    window.addEventListener("keydown", this.onKey);
    this.apply();
  }

  public detach() {
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("touchstart", this.onTouchStart);
    window.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("keydown", this.onKey);
  }

  public onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  public update(delta: number) {
    const k = 1 - Math.exp(-delta * SMOOTHING);
    this.idle += delta;
    if (this.snapStops > 1 && this.idle > 0.18) {
      const n = this.snapStops - 1;
      this.target +=
        (Math.round(this.target * n) / n - this.target) *
        (1 - Math.exp(-delta * 3));
    }
    this.current += (this.target - this.current) * k;
    this.apply();
  }

  private scrollBy(amount: number) {
    this.idle = 0;
    amount = THREE.MathUtils.clamp(amount, -0.04, 0.04);
    this.target = THREE.MathUtils.clamp(this.target + amount, 0, 1);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
    this.scrollBy(e.deltaY * unit * WHEEL_SENSITIVITY);
  };

  private onTouchStart = (e: TouchEvent) => {
    this.lastTouchY = e.touches[0]!.clientY;
  };

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    const y = e.touches[0]!.clientY;
    this.scrollBy((this.lastTouchY - y) * TOUCH_SENSITIVITY);
    this.lastTouchY = y;
  };

  private onKey = (e: KeyboardEvent) => {
    const step = KEY_STEPS[e.key];
    if (step === undefined) return;
    e.preventDefault();
    this.scrollBy(step);
  };

  private apply() {
    const u = this.cameraU(this.current);
    this.path.getPointAt(u, this.pos);
    this.path.getTangentAt(u, this.tan);

    this.camera.position.copy(this.pos);
    this.camera.lookAt(
      this.pos.x + this.tan.x * LOOK_AHEAD,
      this.pos.y + this.tan.y * LOOK_AHEAD,
      this.pos.z + this.tan.z * LOOK_AHEAD,
    );
  }
}
