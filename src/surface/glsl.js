// GLSL shared by every surface recipe: tileable noise and the output packing.
//
// A recipe is a function `void surf(vec2 uv)` over one tile (uv in 0..1) that ends
// by calling emit(). Every noise takes its integer frequency as its period, so
// anything built from them wraps seamlessly at the tile edge.
export const HEAD = /* glsl */`
precision highp float; precision highp int;
in vec2 vUv;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
uniform float uSeed;
uniform vec4 uP;                       // per-variant knobs, meaning set by the recipe

#define TAU 6.2831853
float sat(float x) { return clamp(x, 0.0, 1.0); }
vec3 L(float r, float g, float b) { return pow(vec3(r, g, b), vec3(2.2)); }   // author colours in sRGB

uvec3 pcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
// Three randoms for lattice cell c, wrapping every 'per' cells.
vec3 h3(vec2 c, vec2 per, float s) {
  c = mod(c, per);
  return vec3(pcg3(uvec3(uint(c.x + 0.5), uint(c.y + 0.5), uint(s + uSeed)))) * (1.0 / 4294967296.0);
}

// Gradient noise, roughly -0.7..0.7.
float gn(vec2 p, vec2 per, float s) {
  vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = h3(i, per, s).x * TAU, b = h3(i + vec2(1, 0), per, s).x * TAU;
  float c = h3(i + vec2(0, 1), per, s).x * TAU, d = h3(i + vec2(1, 1), per, s).x * TAU;
  return mix(mix(dot(vec2(cos(a), sin(a)), f), dot(vec2(cos(b), sin(b)), f - vec2(1, 0)), u.x),
             mix(dot(vec2(cos(c), sin(c)), f - vec2(0, 1)), dot(vec2(cos(d), sin(d)), f - vec2(1, 1)), u.x), u.y);
}
// Fractal noise in 0..1 (mostly 0.2..0.8). freq is cells per tile, and may differ in x and y.
float fbm(vec2 uv, vec2 freq, int oct, float s) {
  float v = 0.0, a = 1.0, t = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    v += a * gn(uv * freq, freq, s + float(i) * 7.0); t += a; a *= 0.5; freq *= 2.0;
  }
  return sat(v / t * 1.8 + 0.5);
}
float fbm(vec2 uv, float freq, int oct, float s) { return fbm(uv, vec2(freq), oct, s); }

// Worley cells: (distance to nearest, to second nearest, two randoms of the nearest cell).
vec4 vor(vec2 uv, vec2 freq, float s) {
  vec2 p = uv * freq, i = floor(p), f = fract(p);
  float f1 = 9.0, f2 = 9.0; vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)); vec3 r = h3(i + g, freq, s);
    float d = length(g + r.xy - f);
    if (d < f1) { f2 = f1; f1 = d; id = r.yz; } else if (d < f2) f2 = d;
  }
  return vec4(f1, f2, id);
}

// Straight scratches: 'cells' per tile, each cell holding at most one, of half-width hw (in cells),
// pointing along 'angle' give or take 'spread'. Returns 0..1 coverage.
float scr(vec2 uv, float cells, float s, float hw, float angle, float spread, float density) {
  vec2 p = uv * cells, i = floor(p), f = fract(p); float m = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec3 r = h3(i + g, vec2(cells), s), r2 = h3(i + g, vec2(cells), s + 31.0);
    if (r.z > density) continue;
    float a = angle + (r2.x - 0.5) * spread; vec2 dir = vec2(cos(a), sin(a)), q = f - g - r.xy;
    float len = 0.25 + 0.75 * r2.y;
    m = max(m, smoothstep(hw, hw * 0.35, abs(dot(q, vec2(-dir.y, dir.x)))) * smoothstep(len, len * 0.7, abs(dot(q, dir))) * (0.4 + 0.6 * r2.z));
  }
  return m;
}

// Patchy rust: 0 where sound, 1 where rusted through.
float rustMask(vec2 uv, float freq, float th, float s) {
  float n = fbm(uv, freq, 5, s) + (fbm(uv, freq * 14.0, 2, s + 3.0) - 0.5) * 0.3;
  return smoothstep(th, th + 0.14, n);
}

// Tinted surfaces write an untinted overlay colour 'nt' and a paint/metal shade 'ta'.
// The material rebuilds colour as nt + tint * ta, so one texture serves every tint.
vec3 nt = vec3(0.0); float ta = 1.0;
void OV(vec3 c, float k) { nt = mix(nt, c, k); ta = mix(ta, 0.0, k); }

// colour (linear), tint shade, height 0..1, cavity occlusion, roughness, metalness
void emit(vec3 c, float a, float h, float ao, float r, float m) {
  o0 = vec4(sqrt(clamp(c, 0.0, 1.0)), sat(a));
  o1 = vec4(sat(ao), clamp(r, 0.03, 1.0), sat(m), 1.0);
  float hh = sat(h) * 255.0, fl = floor(hh);
  o2 = vec4(fl / 255.0, hh - fl, 0.0, 1.0);          // 16-bit height across two channels
}
`;

export const TAIL = /* glsl */`
void main() { surf(vUv); }
`;

export const QUAD_VERT = /* glsl */`
precision highp float;
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Second passes: unpack the scratch target into the three maps a material samples.
export const COPY_ALBEDO = /* glsl */`
precision highp float;
in vec2 vUv; out vec4 o; uniform sampler2D tA;
void main() { vec4 t = texture(tA, vUv); o = vec4(t.rgb * t.rgb, t.a); }
`;
export const COPY = /* glsl */`
precision highp float;
in vec2 vUv; out vec4 o; uniform sampler2D tA;
void main() { o = texture(tA, vUv); }
`;
export const NORMAL = /* glsl */`
precision highp float;
in vec2 vUv; out vec4 o; uniform sampler2D tH; uniform vec2 uPx; uniform vec2 uK;
float H(vec2 uv) { vec4 t = texture(tH, uv); return t.r + t.g / 255.0; }
void main() {
  vec2 e = uPx;
  float l = H(vUv - vec2(e.x, 0)), r = H(vUv + vec2(e.x, 0)), d = H(vUv - vec2(0, e.y)), u = H(vUv + vec2(0, e.y));
  float ld = H(vUv - e), ru = H(vUv + e), lu = H(vUv + vec2(-e.x, e.y)), rd = H(vUv + vec2(e.x, -e.y));
  float gx = (r - l) * 0.5 + (ru + rd - lu - ld) * 0.25, gy = (u - d) * 0.5 + (ru + lu - rd - ld) * 0.25;
  vec3 n = normalize(vec3(-gx * uK.x * 0.5, -gy * uK.y * 0.5, 1.0));
  o = vec4(n * 0.5 + 0.5, 1.0);
}
`;
