import * as THREE from "three";
import "@fontsource/jetbrains-mono/latin-400.css";
import { BG, FOG_NEAR, FOG_FAR } from "./scene/colors";
import { createAtlas } from "./scene/text/atlas";
import { Cards } from "./scene/cards";
import { STOPS, type Stop } from "./content";
import { Cave } from "./scene/cave/cave";
import { World, type Impact } from "./world";

function mountHiddenText(stops: Stop[]) {
  const root = document.createElement("div");
  root.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
    pointer-events: none;
  `;

  for (const s of stops) {
    const sec = document.createElement("section");
    const h = document.createElement("h2");
    h.textContent = s.title.replace(/^[/\s]+/, "");
    sec.append(h);
    for (const b of s.body ?? []) {
      const p = document.createElement("p");
      p.textContent = b;
      sec.append(p);
    }
    for (const l of s.links ?? []) {
      const a = document.createElement("a");
      a.href = l.url;
      a.textContent = l.label;
      sec.append(a);
    }
    root.append(sec);
  }
  document.body.append(root);
}

function mountGate() {
  const el = document.createElement("div");
  el.style.cssText = `
    position: fixed; inset: 0; z-index: 10;
    display: flex; align-items: center; justify-content: center;
    font-family: "JetBrains Mono", monospace;
    font-size: 14px; letter-spacing: 0.2em; text-transform: uppercase;
    color: #dff6ff; user-select: none;
    text-shadow: 0 0 12px rgba(0, 30, 30, 0.5);
    transition: opacity 0.3s ease;
  `;
  const label = document.createElement("span");
  label.textContent = "0%";
  el.append(label);
  document.body.append(el);

  return {
    setProgress(p: number) {
      label.textContent = `${Math.round(p * 100)}%`;
    },
    waitForClick() {
      return new Promise<Impact>((resolve) => {
        label.textContent = "click to unfreeze";
        el.style.cursor = "pointer";
        label.animate([{ opacity: 0.4 }, { opacity: 1 }, { opacity: 0.4 }], {
          duration: 2000,
          iterations: Infinity,
        });

        const ac = new AbortController();
        const go = (e: Event) => {
          ac.abort();
          el.style.pointerEvents = "none";
          el.style.opacity = "0";
          setTimeout(() => el.remove(), 500);
          const m = e instanceof MouseEvent ? e : null;
          resolve({
            x: m ? m.clientX / window.innerWidth : 0.5,
            y: m ? 1 - m.clientY / window.innerHeight : 0.5,
          });
        };
        el.addEventListener("click", go, { signal: ac.signal });
        window.addEventListener("keydown", go, { signal: ac.signal });
      });
    },
  };
}

async function main() {
  const gate = mountGate();

  const world = new World(document.getElementById("app") ?? document.body);
  world.scene.background = new THREE.Color(BG);
  world.scene.fog = new THREE.Fog(BG, FOG_NEAR, FOG_FAR);

  const cave = await Cave.create(world.camera, (p) => gate.setProgress(p));
  world.scene.add(cave.group);

  const atlas = await createAtlas();

  const cards = new Cards(
    world.camera,
    world.scene,
    atlas,
    STOPS,
    world.renderer.domElement,
  );

  const fit = () => cards.resize(window.innerWidth / window.innerHeight);
  window.addEventListener("resize", fit);
  fit();

  world.onFrame((delta) => {
    cave.update(delta);
    cards.update(delta);
  });

  mountHiddenText(STOPS);

  const impact = await gate.waitForClick();
  world.thaw(impact);
}

main();
