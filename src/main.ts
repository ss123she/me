import GUI from "lil-gui";
import * as THREE from "three";
import { World } from "./scene/world";
import { OceanWorld } from "./scene/water";
import { AdaptiveResolution } from "./scene/adaptive-res";
import { Sky } from "./scene/sky";
import { PerformanceMonitor } from "./performance-monitor";

const appContainer = document.getElementById("app") ?? document.body;
const world = new World(appContainer);

const gui = new GUI({ title: "Settings" });
const perf = new PerformanceMonitor(world.renderer, gui);

const adaptive = new AdaptiveResolution(world.renderer, {
  minRatio: 0.5,
  maxRatio: Math.min(window.devicePixelRatio, 2),
  targetFps: 60,
});

const ocean = new OceanWorld(world.camera.camera);
const sky = new Sky(world.camera.camera);

world.add(ocean.mesh);
world.add(sky.mesh);

const sunDirection = new THREE.Vector3();
let totalTime = 0;

world.onFrame((delta) => {
  perf.beginCpu();

  totalTime += delta;
  sunDirection
    .set(-0.08, 0.35 + Math.sin(totalTime * 0.15 + 2.6) * 0.25, 0.58)
    .normalize();

  adaptive.update(delta);
  sky.update(sunDirection);
  ocean.update(delta, sunDirection);

  perf.endCpu();
  perf.update(delta);
});

const camFolder = gui.addFolder("Camera & Bloom");
camFolder
  .add(world.camera.scrollState, "progress", 0, 1)
  .name("Scroll")
  .listen();
camFolder.add(world.bloom, "strength", 0, 2).name("Bloom Glow");
