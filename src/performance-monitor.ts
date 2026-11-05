import type GUI from "lil-gui";
import type * as THREE from "three";

interface TimerQueryExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

export class PerformanceMonitor {
  private gl: WebGL2RenderingContext | null = null;
  private ext: TimerQueryExtension | null = null;
  private queryPool: { query: WebGLQuery; inFlight: boolean }[][] = [];
  private ringIdx = 0;

  private gpuTime = 0;
  private cpuStartTime = 0;
  private cpuTime = 0;
  private lastGuiUpdate = 0;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly metrics = {
    fps: 60,
    gpuTime: "0.00 ms",
    cpuTime: "0.00 ms",
    pixelRatio: 1,
    triangles: 0,
  };

  constructor(renderer: THREE.WebGLRenderer, gui: GUI) {
    this.renderer = renderer;

    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (
      typeof WebGL2RenderingContext !== "undefined" &&
      gl instanceof WebGL2RenderingContext
    ) {
      this.gl = gl;
      this.ext = gl.getExtension(
        "EXT_disjoint_timer_query_webgl2",
      ) as TimerQueryExtension | null;
      if (this.ext) {
        this.queryPool = [
          [{ query: gl.createQuery()!, inFlight: false }],
          [{ query: gl.createQuery()!, inFlight: false }],
        ];
      }
    }

    const folder = gui.addFolder("Performance");
    folder.add(this.metrics, "fps").name("FPS").listen().disable();
    folder.add(this.metrics, "gpuTime").name("GPU Time").listen().disable();
    folder
      .add(this.metrics, "cpuTime")
      .name("CPU Time (JS)")
      .listen()
      .disable();
    folder
      .add(this.metrics, "pixelRatio")
      .name("Pixel Ratio")
      .listen()
      .disable();
    folder.add(this.metrics, "triangles").name("Polygons").listen().disable();
    folder.open();
  }

  public beginCpu() {
    this.cpuStartTime = performance.now();
  }

  public endCpu() {
    this.cpuTime = performance.now() - this.cpuStartTime;
  }

  public beginGpu() {
    if (!this.gl || !this.ext) return;
    const gl = this.gl;
    const curr = this.queryPool[this.ringIdx]![0]!;
    const prev = this.queryPool[1 - this.ringIdx]![0]!;

    if (prev.inFlight) {
      const available = gl.getQueryParameter(
        prev.query,
        gl.QUERY_RESULT_AVAILABLE,
      );
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);

      if (available && !disjoint) {
        const timeNs = gl.getQueryParameter(prev.query, gl.QUERY_RESULT);
        const timeMs = timeNs / 1_000_000;
        this.gpuTime =
          this.gpuTime === 0 ? timeMs : this.gpuTime * 0.85 + timeMs * 0.15;
        prev.inFlight = false;
      }
    }

    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, curr.query);
    curr.inFlight = true;
  }

  public endGpu() {
    if (!this.gl || !this.ext) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.ringIdx = 1 - this.ringIdx;
  }

  public update(delta: number) {
    this.lastGuiUpdate += delta;
    if (this.lastGuiUpdate < 0.1) return;
    this.lastGuiUpdate = 0;

    this.metrics.fps = Math.round(1 / Math.max(delta, 0.001));
    this.metrics.cpuTime = `${this.cpuTime.toFixed(2)} ms`;
    this.metrics.gpuTime = this.ext
      ? `${this.gpuTime.toFixed(2)} ms`
      : "N/A (WebGL1)";
    this.metrics.pixelRatio = Number(this.renderer.getPixelRatio().toFixed(2));
    this.metrics.triangles = this.renderer.info.render.triangles;
  }
}
