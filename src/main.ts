import GUI from "lil-gui";
import { World } from "./scene/world";
import { OceanWorld } from "./scene/water";
import { AdaptiveResolution } from "./scene/adaptive-res";

const appContainer = document.getElementById("app") ?? document.body;
const world = new World(appContainer);

const adaptive = new AdaptiveResolution(world.renderer, {
  minRatio: 0.5,
  maxRatio: Math.min(window.devicePixelRatio, 2),
  targetFps: 60,
});

const ocean = new OceanWorld(world.camera.camera);
world.add(ocean.mesh);

const metrics = {
  fps: 60,
  cpuTime: "0.00 ms",
  gpuTime: "0.00 ms",
  pixelRatio: 1,
  triangles: 0,
};

let lastGuiUpdate = 0;

world.onFrame((delta) => {
  const startCpu = performance.now();

  adaptive.update(delta);
  ocean.update(delta);

  const cpuMs = performance.now() - startCpu;

  lastGuiUpdate += delta;
  if (lastGuiUpdate > 0.1) {
    lastGuiUpdate = 0;

    metrics.fps = Math.round(1 / Math.max(delta, 0.001));
    metrics.cpuTime = `${cpuMs.toFixed(2)} ms`;

    const gpuMs = world.profiler.timings.get("frame_gpu");
    metrics.gpuTime =
      gpuMs !== undefined
        ? `${gpuMs.toFixed(2)} ms`
        : world.profiler.isSupported
          ? "..."
          : "N/A (WebGL1)";

    metrics.pixelRatio = Number(world.renderer.getPixelRatio().toFixed(2));
    metrics.triangles = world.renderer.info.render.triangles;
  }
});

// GUI
const gui = new GUI({ title: "Settings" });

const camFolder = gui.addFolder("Camera & Bloom");
camFolder
  .add(world.camera.scrollState, "progress", 0, 1)
  .name("Scroll")
  .listen();
camFolder.add(world.bloom, "strength", 0, 2).name("Bloom Glow");

const perfFolder = gui.addFolder("Performance");
perfFolder.add(metrics, "fps").name("FPS").listen().disable();
perfFolder.add(metrics, "gpuTime").name("GPU Time").listen().disable();
perfFolder.add(metrics, "cpuTime").name("CPU Time (JS)").listen().disable();
perfFolder.add(metrics, "pixelRatio").name("Pixel Ratio").listen().disable();
perfFolder.add(metrics, "triangles").name("Polygons").listen().disable();
perfFolder.open();
