import { Effect, EffectAttribute, BlendFunction } from "postprocessing";
import { Color, Uniform } from "three";

const fragment = /* glsl */ `
uniform float thaw;
uniform vec3 tint;

const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = ROT * p * 2.0;
    a *= 0.5;
  }
  return v;
}

float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    float n = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
    v += a * n * n;
    p = ROT * p * 2.0;
    a *= 0.5;
  }
  return v;
}

float scratch(vec2 p, float ang, float freq) {
  float c = cos(ang);
  float s = sin(ang);
  vec2 q = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  return smoothstep(0.80, 0.97, vnoise(vec2(q.x * 3.0, q.y * freq)));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float aspect = resolution.x / resolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  float w = fbm(p * 1.6 + 3.0) * 0.55 + length(p) * 0.54;
  float t = mix(-0.7, 1.05, thaw);
  float ice = smoothstep(t, t + 0.5, w);
  float wet = 4.0 * ice * (1.0 - ice);

  float thick = fbm(p * 1.2 + 40.0);
  float cloud = smoothstep(0.42, 0.85, fbm(p * 2.4 + 11.0));
  float fine = fbm(p * 16.0);
  float edgeF = smoothstep(0.15, 0.95, length(p));
  float frost = clamp(cloud * (0.55 + 0.45 * fine) + edgeF * 0.35, 0.0, 1.0) * ice;

  vec2 warp = vec2(fbm(p * 3.0), fbm(p * 3.0 + 8.3)) - 0.5;
  vec2 off = warp * 0.05 * (ice * 0.7 + wet * 0.6) * vec2(1.0 / aspect, 1.0);

  float radius = (0.002 + 0.013 * frost) * ice;
  vec3 col = vec3(0.0);
  const int TAPS = 12;
  for (int i = 0; i < TAPS; i++) {
    float fi = float(i);
    float a = fi * 2.399963;
    float r = sqrt((fi + 0.5) / float(TAPS));
    vec2 d = vec2(cos(a), sin(a)) * r * radius * vec2(1.0 / aspect, 1.0);
    col += texture2D(inputBuffer, uv + off + d).rgb;
  }
  col /= float(TAPS);

  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, tint * (0.35 + 0.9 * luma), 0.75 * ice);
  col *= 1.0 - 0.28 * thick * ice;
  col = mix(col, tint * 1.35 + 0.18, frost * 0.5);

  vec2 wp = p + (vec2(fbm(p * 2.5), fbm(p * 2.5 + 4.1)) - 0.5) * 0.35;
  float veinMask = smoothstep(0.35, 0.75, fbm(p * 2.0 + 25.0));
  float veins = smoothstep(0.55, 0.95, ridged(wp * 3.5)) * veinMask;

  float sMask = smoothstep(0.45, 0.8, fbm(p * 2.0 + 60.0));
  float scr = (scratch(p, 0.5, 140.0) + scratch(p + 3.7, -0.9, 170.0)) * sMask;

  float ice2 = ice * ice;
  col += (veins * 0.20 + scr * 0.16) * vec3(0.85, 1.0, 0.96) * ice2;

  outputColor = vec4(col, inputColor.a);
}
`;

export class FrostEffect extends Effect {
  constructor(tint: Color = new Color(0.42, 0.7, 0.66)) {
    super("FrostEffect", fragment, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ["thaw", new Uniform(0)],
        ["tint", new Uniform(tint)],
      ]),
    });
  }

  get thaw(): number {
    return this.uniforms.get("thaw")!.value as number;
  }

  set thaw(v: number) {
    this.uniforms.get("thaw")!.value = v;
  }
}
