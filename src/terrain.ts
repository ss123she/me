import * as THREE from "three";

export class Terrain {
  public readonly mesh: THREE.Mesh;
  private readonly texture: THREE.CanvasTexture;

  constructor(width: number, depth: number) {
    const data = this.generateHeight(width, depth);

    const geometry = new THREE.PlaneGeometry(7500, 7500, width - 1, depth - 1);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, (data[i] ?? 0) * 10);
    }
    geometry.computeVertexNormals();

    this.texture = this.createTexture(data, width, depth);

    const material = new THREE.MeshBasicMaterial({ map: this.texture });
    this.mesh = new THREE.Mesh(geometry, material);
  }

  private generateHeight(width: number, height: number): Uint8Array {
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

  private createTexture(
    data: Uint8Array,
    w: number,
    h: number,
  ): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D canvas context");

    const imgData = ctx.createImageData(w, h);
    for (let i = 0, j = 0; i < imgData.data.length; i += 4, j++) {
      const val = data[j] ?? 0;
      imgData.data[i] = val * 2;
      imgData.data[i + 1] = val * 1.5;
      imgData.data[i + 2] = val;
      imgData.data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  public dispose() {
    this.mesh.geometry.dispose();
    this.texture.dispose();
  }
}
