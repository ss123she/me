import * as THREE from "three";

export class Sky {
  public readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly camera: THREE.PerspectiveCamera;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;

    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDirection: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorldPos;
        uniform vec3 uSunDirection;

        vec3 skyColor(vec3 dir, vec3 sun) {
          float rY = max(dir.y, 0.0) + 0.15;
          float sY = sun.y * 11.0 + 1.0;
          vec3 sunc = mix(vec3(1.0), max(vec3(0.0), vec3(1.0) - vec3(5.5, 13.0, 22.4) / 22.4), 1.0 / sY);
          vec3 sky = max(vec3(0.0), vec3(5.5, 13.0, 22.4) / 22.4 * sunc - vec3(5.5, 13.0, 22.4) * 0.002 * (1.0 / rY - 6.0 * sun.y * sun.y));
          sky = sky * (1.0 / rY) * (0.24 + pow(abs(dot(sun, dir)), 2.0) * 0.24) * (1.0 + pow(1.0 - max(dir.y, 0.0), 3.0));

          float sunSpec = pow(max(0.0, dot(dir, sun)), 500.0) * 35.0;
          return sky * 0.45 + sunSpec;
        }

        void main() {
          vec3 dir = normalize(vWorldPos - cameraPosition);
          gl_FragColor = vec4(skyColor(dir, uSunDirection), 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(800, 32, 16),
      this.material,
    );
    this.mesh.renderOrder = -100;
  }

  public update(sunDir: THREE.Vector3) {
    this.material.uniforms.uSunDirection!.value.copy(sunDir);
    this.mesh.position.copy(this.camera.position);
  }

  public dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
