import * as THREE from "three";
import { windSound } from "./audio";

const WHEEL_SENSITIVITY = 0.0004;
const TOUCH_SENSITIVITY = 0.001;
const SMOOTHING = 3.5;
const LOOK_AHEAD = 10;
const MOUSE_STRENGTH_LOOK = 2.0;
const MOUSE_STRENGTH_POS = 0.8;
const MOUSE_SMOOTHING = 5.0;

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

  private readonly forwardTarget = new THREE.Vector3();
  private readonly cardTarget = new THREE.Vector3();

  private mouseTarget = new THREE.Vector2(0, 0);
  private mouseCurrent = new THREE.Vector2(0, 0);

  private readonly lookTarget = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly camUp = new THREE.Vector3();

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
    window.addEventListener("mousemove", this.onMouseMove);

    if (window.DeviceOrientationEvent && "ontouchstart" in window) {
      window.addEventListener("deviceorientation", this.onDeviceOrientation);
    }

    this.apply();
  }

  public detach() {
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("touchstart", this.onTouchStart);
    window.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("deviceorientation", this.onDeviceOrientation);
  }

  public onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  private onMouseMove = (e: MouseEvent) => {
    this.mouseTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseTarget.y = -(e.clientY / window.innerHeight) * 2 + 1;
  };

  private onDeviceOrientation = (e: DeviceOrientationEvent) => {
    if (e.gamma === null || e.beta === null) return;
    this.mouseTarget.x = THREE.MathUtils.clamp(e.gamma / 20, -1, 1);
    this.mouseTarget.y = THREE.MathUtils.clamp((e.beta - 45) / 20, -1, 1);
  };

  public update(delta: number) {
    const prev = this.current;

    const k = 1 - Math.exp(-delta * SMOOTHING);
    this.idle += delta;
    if (this.snapStops > 1 && this.idle > 0.18) {
      const n = this.snapStops - 1;
      this.target +=
        (Math.round(this.target * n) / n - this.target) *
        (1 - Math.exp(-delta * 3));
    }
    this.current += (this.target - this.current) * k;

    if (delta > 0) {
      const speed = (Math.abs(this.current - prev) / delta) * 3.5;
      windSound.update(speed);
    }

    const mouseK = 1 - Math.exp(-delta * MOUSE_SMOOTHING);
    this.mouseCurrent.lerp(this.mouseTarget, mouseK);

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
    this.path.getTangentAt(u, this.tan).normalize();

    this.right.crossVectors(this.tan, this.up).normalize();
    this.camUp.crossVectors(this.right, this.tan).normalize();

    this.camera.position
      .copy(this.pos)
      .addScaledVector(this.right, this.mouseCurrent.x * MOUSE_STRENGTH_POS)
      .addScaledVector(this.camUp, this.mouseCurrent.y * MOUSE_STRENGTH_POS);

    this.forwardTarget.copy(this.pos).addScaledVector(this.tan, LOOK_AHEAD);

    if (this.snapStops > 1) {
      const n = this.snapStops - 1;
      const nearestIdx = Math.round(this.current * n);
      const stopProgress = nearestIdx / n;

      const cardU = this.archU(stopProgress);
      this.path.getPointAt(cardU, this.cardTarget);

      const distToStop = Math.abs(this.current - stopProgress) * n;
      const focus = 1.0 - THREE.MathUtils.smoothstep(distToStop, 0.0, 0.35);

      this.lookTarget.lerpVectors(this.forwardTarget, this.cardTarget, focus);
    } else {
      this.lookTarget.copy(this.forwardTarget);
    }

    this.lookTarget
      .addScaledVector(this.right, this.mouseCurrent.x * MOUSE_STRENGTH_LOOK)
      .addScaledVector(this.camUp, this.mouseCurrent.y * MOUSE_STRENGTH_LOOK);

    this.camera.lookAt(this.lookTarget);
  }
}
