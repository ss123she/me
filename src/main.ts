import GUI from "lil-gui";
import { World } from "./scene/world";
import { OceanWorld } from "./scene/water";
import { AdaptiveResolution } from "./scene/adaptive-res";

const appContainer = document.getElementById("app") ?? document.body;
const world = new World(appContainer);

const ocean = new OceanWorld(world.camera.camera);
const adaptive = new AdaptiveResolution(world.renderer);
world.add(ocean.mesh);

world.onFrame((delta) => {
  adaptive.update(delta);
  ocean.update(world.renderer, delta);
});

const gui = new GUI();
gui.add(world.camera.scrollState, "progress", 0, 1).listen();
gui.add(world.bloom, "strength", 0, 2).name("Bloom Glow");
