import * as THREE from "three";

export class Scene {
  public readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(data: Uint8Array, width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[Scene] Failed to get 2D canvas context");
    }
    this.ctx = ctx;

    this.draw(data);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  /* Generation of pixels. */
  private draw(data: Uint8Array): void {
    const imgData = this.ctx.createImageData(
      this.canvas.width,
      this.canvas.height,
    );
    const pixels = imgData.data;

    for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
      const h = data[j] ?? 0;
      pixels[i] = h * 2; // R
      pixels[i + 1] = h * 1.5; // G
      pixels[i + 2] = h; // B
      pixels[i + 3] = 255; // A
    }

    this.ctx.putImageData(imgData, 0, 0);
  }

  public update(newData: Uint8Array): void {
    this.draw(newData);
    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    this.texture.dispose();
  }
}
