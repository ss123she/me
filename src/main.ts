import GUI from "lil-gui";
import { World } from "./world";
import { Terrain } from "./terrain";

const appContainer = document.getElementById("app") ?? document.body;
const world = new World(appContainer);

const terrain = new Terrain(256, 256);
world.add(terrain.mesh);

const gui = new GUI();
gui.add(world.camera.scrollState, "progress").listen();
gui.add(world.camera.camera.position, "y", 0, 2500).name("Camera Height");
