import * as THREE from "three";

import Stats from "stats.js";
import { ScrollCamera } from "./scroll-camera";

let container: Element,
  stats: Stats,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  mesh: THREE.Mesh,
  texture: THREE.CanvasTexture;

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

  const vertices = geometry.attributes.position.array;

  for (let i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
    vertices[j + 1] = data[i] * 10;
  }

  texture = new THREE.CanvasTexture(
    generateTexture(data, worldWidth, worldDepth),
  );
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0x00f00, wireframe: true }),
  );
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
  let seed = Math.PI / 4;
  window.Math.random = function () {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  const size = width * height,
    data = new Uint8Array(size);

  return data;
}

function generateTexture(
  data: Uint8Array<ArrayBuffer>,
  width: number,
  height: number,
) {
  let context, image, imageData, shade;

  const vector3 = new THREE.Vector3(0, 0, 0);

  const sun = new THREE.Vector3(1, 1, 1);
  sun.normalize();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  context = canvas.getContext("2d");
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);

  image = context.getImageData(0, 0, canvas.width, canvas.height);
  imageData = image.data;

  for (let i = 0, j = 0, l = imageData.length; i < l; i += 4, j++) {
    vector3.x = data[j - 2] - data[j + 2];
    vector3.y = 2;
    vector3.z = data[j - width * 2] - data[j + width * 2];
    vector3.normalize();

    shade = vector3.dot(sun);

    imageData[i] = (96 + shade * 128) * (0.5 + data[j] * 0.007);
    imageData[i + 1] = (32 + shade * 96) * (0.5 + data[j] * 0.007);
    imageData[i + 2] = shade * 96 * (0.5 + data[j] * 0.007);
  }

  context.putImageData(image, 0, 0);

  // Scaled 4x

  const canvasScaled = document.createElement("canvas");
  canvasScaled.width = width * 4;
  canvasScaled.height = height * 4;

  context = canvasScaled.getContext("2d");
  context.scale(4, 4);
  context.drawImage(canvas, 0, 0);

  image = context.getImageData(0, 0, canvasScaled.width, canvasScaled.height);
  imageData = image.data;

  for (let i = 0, l = imageData.length; i < l; i += 4) {
    const v = ~~(Math.random() * 5);

    imageData[i] += v;
    imageData[i + 1] += v;
    imageData[i + 2] += v;
  }

  context.putImageData(image, 0, 0);

  return canvasScaled;
}

function animate() {
  timer.update();

  render();
  stats.update();
}

function render() {
  renderer.render(scene, camera.camera);
}
