import * as THREE from "three";

import Stats from "stats.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import gsap from "gsap";

let container: Element,
  stats: Stats,
  controls: OrbitControls,
  camera: THREE.PerspectiveCamera,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  mesh: THREE.Mesh,
  texture: THREE.CanvasTexture;

const worldWidth = 256,
  worldDepth = 256;
const timer = new THREE.Timer();
timer.connect(document);

const scrollState = {
  progress: 0,
  targetProgress: 0,
};
const lookTarget = new THREE.Vector3(0, 200, 0);
init();

function onWheel(e: WheelEvent) {
  e.preventDefault();
  const sensivity = 0.0008;
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
    onUpdate: updateCameraFromProgress,
  });
}

function updateCameraFromProgress() {
  const p = scrollState.progress;
  camera.position.x = Math.sin(p * Math.PI) * 200;
  camera.position.y = 500 + Math.sin(p * Math.PI * 2) * 150;
  camera.position.z = -1200 + p * 2400;
  lookTarget.set(0, 150, camera.position.z + 500);
  camera.lookAt(lookTarget);
}

function init() {
  container = document.createElement("container");
  document.body.append(container);
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    1,
    10000,
  );

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xefd1b5);

  const data = generateHeight(worldWidth, worldDepth);

  camera.position.set(100, 800, -800);
  camera.lookAt(-100, 700, -800);

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

  controls = new OrbitControls(camera, renderer.domElement);

  stats = new Stats();
  container.appendChild(stats.dom);

  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

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
  controls.update();
  renderer.render(scene, camera);
}
