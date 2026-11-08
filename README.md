# me (ss123she.github.io)

Interactive 3D portfolio website navigating through a procedural crystal cave via virtual scroll.

**Demo:** [https://ss123she.github.io/](https://ss123she.github.io/)

## What it is

A personal portfolio which is terminal inside a procedural cave with virtual spline scrolling, interactive ice-shatter intro, and procedural wind audio.

## How it was built

- **Engine & Graphics:** Three.js + custom GLSL shaders (procedural cave mesh, vertex-baked lighting).
- **Audio:** Real-time blizzard wind synthesis via Web Audio API (0 audio files downloaded).
- **Tooling:** Bun, Vite, TypeScript.
- **Optimization:** Zero external 3D/sound assets, text rendered inside canvas.

## How to run

### 1. Install dependencies

```bash
bun install
```

### 2. Run locally

```bash
bun run dev
```

### 3. Build

```bash
bun run build
```

## License

[MIT](LICENSE)
