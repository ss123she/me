import * as THREE from "three";

import Stats from "stats.js";
import { ScrollCamera } from "./scroll-camera";
import { Scene } from "./scene";

let container: Element,
  stats: Stats,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  mesh: THREE.Mesh;

const worldWidth = 256,
  worldDepth = 256;
const timer = new THREE.Timer();
timer.connect(document);

const camera = new ScrollCamera();

init();

function init() {
  container = document.createElement("container");
  document.body.append(container);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xefd1b5);

  const data = generateHeight(worldWidth, worldDepth);

  const geometry = new THREE.PlaneGeometry(
    7500,
    7500,
    worldWidth - 1,
    worldDepth - 1,
  );
  geometry.rotateX(-Math.PI / 2);

  const positionAttribute = geometry.getAttribute("position");
  for (let i = 0; i < positionAttribute.count; i++) {
    positionAttribute.setY(i, (data[i] ?? 0) * 10);
  }

  const terrainTexture = new Scene(data, worldWidth, worldDepth);

  const material = new THREE.MeshBasicMaterial({
    map: terrainTexture.texture,
  });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  container.appendChild(renderer.domElement);

  camera.addWheel();
  stats = new Stats();
  container.appendChild(stats.dom);

  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  camera.onWindowResize();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function generateHeight(width: number, height: number) {
  const size = width * height;
  const data = new Uint8Array(size);

  for (let i = 0; i < size; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const wave = Math.sin(x * 0.05) * Math.cos(y * 0.05);
    data[i] = Math.floor((wave + 1) * 0.5 * 128);
  }

  return data;
}

function animate() {
  timer.update();

  render();
  stats.update();
}

function render() {
  renderer.render(scene, camera.camera);
}
