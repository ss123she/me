import type * as THREE from "three";

interface TimerQueryExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

export class GpuProfiler {
  private gl: WebGL2RenderingContext | null = null;
  private ext: TimerQueryExtension | null = null;

  private queryPool: { query: WebGLQuery; inFlight: boolean }[][] = [];
  private ringIdx = 0;
  public readonly timings = new Map<string, number>();

  constructor(renderer: THREE.WebGLRenderer) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (
      typeof WebGL2RenderingContext !== "undefined" &&
      gl instanceof WebGL2RenderingContext
    ) {
      this.gl = gl;
      this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      if (this.ext) {
        this.queryPool = [
          [{ query: gl.createQuery()!, inFlight: false }],
          [{ query: gl.createQuery()!, inFlight: false }],
        ];
      }
    }
  }

  public get isSupported(): boolean {
    return !!(this.gl && this.ext);
  }

  public begin(name: string) {
    if (!this.gl || !this.ext) return;
    const gl = this.gl;
    const curr = this.queryPool[this.ringIdx]![0];

    const prev = this.queryPool[1 - this.ringIdx]![0];
    if (prev!.inFlight) {
      const available = gl.getQueryParameter(
        prev!.query,
        gl.QUERY_RESULT_AVAILABLE,
      );
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);

      if (available && !disjoint) {
        const timeElapsedNs = gl.getQueryParameter(
          prev!.query,
          gl.QUERY_RESULT,
        );
        const timeMs = timeElapsedNs / 1_000_000;
        const old = this.timings.get(name) ?? timeMs;
        this.timings.set(name, old * 0.85 + timeMs * 0.15);
        prev!.inFlight = false;
      }
    }

    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, curr!.query);
    curr!.inFlight = true;
  }

  public end() {
    if (!this.gl || !this.ext) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.ringIdx = 1 - this.ringIdx;
  }
}
