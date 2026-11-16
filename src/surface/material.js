// A MeshStandardMaterial that wears a generated surface.
//
// The surface is projected along the three axes of the mesh's own space, in
// metres, so it needs no UVs: a 20 mm baluster and a 240 m wall both get the
// texture at true scale, and instanced parts stretched from a unit box do not
// stretch it.
//
// A tile only ever holds grain: casting skin, scratches, the shape of a brick.
// Anything you could recognise if you saw it twice (a patch of rust, a stain,
// one dark brick, a tarnished area) is computed here from the point's position
// in the mesh's own space, so it never repeats, and it moves with the part.
import * as THREE from 'three';
import { surfaceSet } from './generate.js';

const VERT_PARS = /* glsl */`
varying vec3 vSfP; varying vec3 vSfN;
varying vec3 vSfL; varying vec3 vSfS;      // instanced boxes: where on the unit box, and the box's size in metres
attribute vec3 sfBevel;       // chamfered boxes only: which way each corner vertex pulls back (kit.js)
uniform float sfBevelR;       // chamfer width, metres
uniform float sfPixel;        // how many metres one pixel covers, per metre of distance
`;
// A rod thinner than a pixel is drawn in fragments: a dashed line where there is a rail, a hanger or a
// distant column. Whatever is thin to begin with is therefore never drawn thinner than about a pixel.
export const PIXEL = { value: 0.001 };
const THIN = /* glsl */`
  #ifdef USE_INSTANCING
  {
    vec3 sfT = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    float sfWant = -(modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z * sfPixel * 1.1;
    transformed *= mix(vec3(1.0), max(vec3(1.0), sfWant / sfT), step(sfT, vec3(0.3)));
  }
  #endif
`;
// The same for a plain material that is used for instanced parts.
export function keepVisible(mat) {
  if (mat.userData.surface || mat.userData.thin || mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
  mat.userData.thin = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.sfPixel = PIXEL;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float sfPixel;').replace('#include <begin_vertex>', '#include <begin_vertex>\n' + THIN);
  };
  mat.customProgramCacheKey = () => 'thin';
}
const VERT = /* glsl */`
{
  #ifdef USE_INSTANCING
    vec3 sfS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    transformed -= sfBevel * min(sfBevelR, 0.25 * min(sfS.x, min(sfS.y, sfS.z))) / sfS;
  #endif
` + THIN + /* glsl */`
  vec4 sfP = vec4(transformed, 1.0); vec3 sfN = objectNormal;
  vSfL = position; vSfS = vec3(0.0);
  #ifdef USE_INSTANCING
    vSfS = sfS;
    sfP = instanceMatrix * sfP;
    mat3 sfM = mat3(instanceMatrix);
    sfN /= vec3(dot(sfM[0], sfM[0]), dot(sfM[1], sfM[1]), dot(sfM[2], sfM[2]));
    sfN = sfM * sfN;
  #endif
  vSfP = sfP.xyz; vSfN = normalize(sfN);
}
`;

const FRAG_PARS = /* glsl */`
varying vec3 vSfP; varying vec3 vSfN;
varying vec3 vSfL; varying vec3 vSfS;
uniform vec3 sfLining;
uniform sampler2D sfAlbedo; uniform sampler2D sfORM; uniform sampler2D sfNormal;
uniform vec2 sfTile;          // metres per repeat
uniform vec4 sfMacro;         // colour swing, roughness swing, cycles per metre, grime
uniform vec4 sfWall;          // streaks, damp height (m), patch contrast, soot toward the top
uniform vec4 sfAge;           // what the surface turns into where it is neglected (rgb multiplier), and how much
uniform vec4 sfWeather;       // corrosion: threshold (lower = more), patches per metre, run-off below patches, metalness left
uniform vec3 sfWeatherCol;
uniform mat3 normalMatrix;
vec3 sfOrm; vec3 sfNrm;

float sfHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sfNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sfHash(i), sfHash(i + vec3(1, 0, 0)), f.x), mix(sfHash(i + vec3(0, 1, 0)), sfHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sfHash(i + vec3(0, 0, 1)), sfHash(i + vec3(1, 0, 1)), f.x), mix(sfHash(i + vec3(0, 1, 1)), sfHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float sfFbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * sfNoise(p); p = p * 2.03 + 17.3; a *= 0.5; }
  return v / 0.9375;
}
vec4 sfTri(sampler2D t, vec2 ux, vec2 uy, vec2 uz, vec3 w) { return texture2D(t, ux) * w.x + texture2D(t, uy) * w.y + texture2D(t, uz) * w.z; }
`;

// Replaces <map_fragment>: sample the three projections and blend.
const FRAG_MAP = /* glsl */`
{
  vec3 n = normalize(vSfN);
  #ifdef DOUBLE_SIDED
    n *= gl_FrontFacing ? 1.0 : -1.0;
  #endif
  vec3 w = pow(abs(n), vec3(6.0)); w /= w.x + w.y + w.z;
  vec2 ux = vSfP.zy / sfTile, uy = vSfP.xz / sfTile, uz = vSfP.xy / sfTile;
  vec4 a = sfTri(sfAlbedo, ux, uy, uz, w);
  sfOrm = sfTri(sfORM, ux, uy, uz, w).rgb;
  vec3 tx = texture2D(sfNormal, ux).xyz * 2.0 - 1.0, ty = texture2D(sfNormal, uy).xyz * 2.0 - 1.0, tz = texture2D(sfNormal, uz).xyz * 2.0 - 1.0;
  float sfFlat = 1.0 - (length(tx) * w.x + length(ty) * w.y + length(tz) * w.z);     // how much the mip has averaged the bumps away

  #ifdef SF_BREAK
    // Grain with no structure: lay the tile down a second time, turned a quarter and at
    // another scale, and fade between the two over a metre or so. Neither copy's period survives.
    float bk = smoothstep(0.32, 0.68, sfNoise(vSfP * 1.1 + 5.0) * 0.7 + sfNoise(vSfP * 3.3 + 2.0) * 0.3);
    vec2 vx = ux.yx * 0.71 + 0.37, vy = uy.yx * 0.71 + 0.13, vz = uz.yx * 0.71 + 0.59;
    a = mix(a, sfTri(sfAlbedo, vx, vy, vz, w), bk);
    sfOrm = mix(sfOrm, sfTri(sfORM, vx, vy, vz, w).rgb, bk);
    tx = mix(tx, (texture2D(sfNormal, vx).xyz * 2.0 - 1.0).yxz, bk);
    ty = mix(ty, (texture2D(sfNormal, vy).xyz * 2.0 - 1.0).yxz, bk);
    tz = mix(tz, (texture2D(sfNormal, vz).xyz * 2.0 - 1.0).yxz, bk);
  #endif

  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x); ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  sfNrm = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);

  #ifdef SF_TINT
    vec3 col = a.rgb + diffuseColor.rgb * a.a;
  #else
    vec3 col = a.rgb * diffuseColor.rgb;
  #endif

  #ifdef SF_BRICK
    // Every brick gets its own firing. The lattice is the recipe's (12 x 36 to the tile, a
    // header course every sixth), but the brick is identified by where it is in the wall.
    vec2 buv = w.y > max(w.x, w.z) ? uy : (w.x > w.z ? ux : uz);
    float brow = floor(buv.y * 36.0), bhead = step(mod(brow, 6.0), 0.5), bnx = 12.0 * (1.0 + bhead);
    vec3 bid = vec3(floor(buv.x * bnx + mod(brow, 2.0) * 0.5 + bhead * 0.25), brow, w.x > w.z ? 3.0 : 8.0);
    float b1 = sfHash(bid), b2 = sfHash(bid.yzx + 4.7), b3 = sfHash(bid.zxy + 9.2);
    vec3 fired = b1 < 0.1 ? vec3(0.5, 0.54, 0.62) : b1 < 0.34 ? vec3(0.8, 0.8, 0.84) : b1 < 0.56 ? vec3(1.18, 1.04, 0.92) : vec3(1.0);
    fired *= 0.74 + 0.5 * b2;
    float onBrick = smoothstep(0.6, 0.85, sfOrm.r) * (1.0 - smoothstep(0.25, 0.9, fwidth(buv.y) * 36.0));   // not the mortar; not when a course is a pixel
    col = mix(col, col * fired, onBrick);
    sfOrm.g -= step(b1, 0.1) * onBrick * 0.26 * b3;                                // the over-fired ones are half glazed
  #endif

  // variation at the scale of rooms, not tiles
  vec3 mp = vSfP * sfMacro.z;
  float m1 = sfNoise(mp), m2 = sfNoise(mp * 3.7 + 11.3);
  col *= 1.0 + sfMacro.x * (m1 * 0.65 + m2 * 0.35 - 0.5) * 2.0;
  float grime = smoothstep(0.5, 0.85, m1 * 0.6 + m2 * 0.4 + (1.0 - sfOrm.r) * 0.3) * sfMacro.w;   // dirt settles in the hollows
  col *= 1.0 - grime * 0.35;
  float aged = smoothstep(0.42, 0.78, m1 * 0.55 + m2 * 0.45) * sfAge.a;                            // tarnish and weathering come in patches metres across
  col = mix(col, col * sfAge.rgb, aged);
  sfOrm.g += sfMacro.y * ((m2 - 0.5) * 1.4 + (m1 - 0.5) * 0.8) + grime * 0.1 + aged * 0.22;

  #ifdef SF_WEATHER
  {
    // Corrosion: breaks out in patches, eats along the grain of the surface, and
    // on upright faces runs down from wherever it has started.
    vec3 wp = vSfP * sfWeather.y;
    float wf = sfNoise(vSfP * 19.0), wg = sfNoise(vSfP * 67.0);
    float ragged = (wf - 0.5) * 0.11 + (wg - 0.5) * 0.05 + (1.0 - sfOrm.r) * 0.1;
    float th = sfWeather.x;
    float wn = sfFbm(wp);
    float wm = smoothstep(th, th + 0.035, wn + ragged);
    float halo = smoothstep(th - 0.07, th, wn + ragged * 0.5) * (1.0 - wm);
    float run = 0.0;
    if (sfWeather.z > 0.0) {
      float up = 1.0 - w.y;                                                        // only where there is a "down"
      run = smoothstep(th - 0.02, th + 0.03, sfFbm(wp + vec3(0.0, 0.1 * sfWeather.y, 0.0))) * 0.7
          + smoothstep(th - 0.02, th + 0.03, sfFbm(wp + vec3(0.0, 0.24 * sfWeather.y, 0.0))) * 0.4;
      run *= up * (1.0 - wm) * smoothstep(0.3, 0.75, sfNoise(vec3(vSfP.x * 31.0, vSfP.y * 1.3, vSfP.z * 31.0))) * sfWeather.z;
    }
    col = mix(col, col * 0.6 + sfWeatherCol * 0.3, clamp(halo * 0.5 + run, 0.0, 1.0));
    col = mix(col, sfWeatherCol * (0.4 + 0.75 * wf * (0.5 + wg)), wm);
    sfOrm.g = mix(sfOrm.g, 0.93, wm); sfOrm.g += (halo * 0.5 + run) * 0.2;
    sfOrm.b *= 1.0 - wm * (1.0 - sfWeather.w);
  }
  #endif

  #ifdef SF_LINING
  {
    // Coach lining: a thin gold line set in from the edges of every painted panel
    // big enough to carry one, the way clock and engine makers finished their castings.
    vec3 dE = (0.5 - abs(vSfL)) * vSfS;                                            // metres in from each pair of faces
    float dmin = min(dE.x, min(dE.y, dE.z));
    vec2 o = dE.x == dmin ? dE.yz : (dE.y == dmin ? dE.xz : dE.xy);
    vec2 sz = dE.x == dmin ? vSfS.yz : (dE.y == dmin ? vSfS.xz : vSfS.xy);
    float d = min(o.x, o.y), aa = fwidth(d) + 1e-5;
    float line = (1.0 - smoothstep(0.0025, 0.0025 + aa, abs(d - 0.032))) * step(0.2, min(sz.x, sz.y)) * clamp(0.005 / aa, 0.0, 1.0);
    col = mix(col, sfLining, line * 0.9);
    sfOrm.g = mix(sfOrm.g, 0.4, line); sfOrm.b = mix(sfOrm.b, 1.0, line);
  }
  #endif

  #ifdef SF_WALL
    // a wall has a history: water runs down it, damp rises into it, soot gathers
    // under the roof, and stretches of it were rebuilt in a different brick
    float streak = sfNoise(vec3(vSfP.x * 1.7, vSfP.y * 0.045, vSfP.z * 1.7)) * 0.6 + sfNoise(vec3(vSfP.x * 5.3, vSfP.y * 0.11, vSfP.z * 5.3)) * 0.4;
    col *= 1.0 - sfWall.x * smoothstep(0.45, 0.85, streak) * (1.0 - w.y);
    float sfPatch = sfNoise(vSfP * vec3(0.045, 0.07, 0.045) + 3.1);
    float rebuilt = smoothstep(0.62, 0.66, sfPatch + (m2 - 0.5) * 0.06);
    col = mix(col, col * vec3(1.18, 1.02, 0.92) + 0.004, rebuilt * sfWall.z);
    float damp = smoothstep(sfWall.y * (0.5 + m1), 0.0, vSfP.y) ;
    col *= 1.0 - 0.45 * damp; sfOrm.g -= 0.3 * damp;
    col *= 1.0 - sfWall.w * smoothstep(60.0, 240.0, vSfP.y + (m1 - 0.5) * 40.0);
  #endif

  sfOrm.g = max(sfOrm.g, 0.05);
  sfOrm.g = sqrt(sfOrm.g * sfOrm.g + clamp(sfFlat, 0.0, 1.0) * 0.6);                 // distant bumps become roughness, not sparkle
  diffuseColor.rgb = col;
}
`;
const FRAG_ROUGH = /* glsl */`
roughnessFactor = clamp(roughnessFactor * sfOrm.g, 0.045, 1.0);
`;
const FRAG_METAL = /* glsl */`
metalnessFactor *= sfOrm.b;
`;
const FRAG_NORMAL = /* glsl */`
normal = normalize(normalMatrix * sfNrm);
`;
const FRAG_AO = /* glsl */`
reflectedLight.indirectDiffuse *= sfOrm.r;
reflectedLight.indirectSpecular *= mix(1.0, sfOrm.r, 0.7);
reflectedLight.directDiffuse *= mix(1.0, sfOrm.r, 0.5);
`;

// name: a recipe in recipes.js. opts: any MeshStandardMaterial parameter, plus
//   p, seed   variant of the recipe
//   macro     [colour swing, roughness swing, cycles per metre, grime]
//   wall      [streaks, damp height, patch contrast, soot] for walls in world space
//   age       [r, g, b, amount]: colour multiplier where the surface has weathered
//   weather   [threshold, patches per metre, run-off, metalness left] and weatherColor: corrosion
//   lining    colour of a gold line set in from the edges of instanced boxes (painted castings)
//   bevel     chamfer width in metres on instanced boxes
// roughness and metalness multiply the texture's own values.
export function surface(name, { p, seed, macro = [0.14, 0.1, 0.8, 0.2], wall = null, age = [1, 1, 1, 0], weather = null, weatherColor = 0x4a2a17, lining = null, bevel = 0.012, ...params } = {}) {
  const set = surfaceSet(name, { p, seed });
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1, ...params });
  const uniforms = {
    sfAlbedo: { value: set.albedo }, sfORM: { value: set.orm }, sfNormal: { value: set.normal },
    sfTile: { value: new THREE.Vector2(set.tile[0], set.tile[1]) },
    sfMacro: { value: new THREE.Vector4(...macro) },
    sfWall: { value: new THREE.Vector4(...(wall || [0, 0, 0, 0])) },
    sfAge: { value: new THREE.Vector4(...age) },
    sfWeather: { value: new THREE.Vector4(...(weather || [9, 1, 0, 0])) },
    sfWeatherCol: { value: new THREE.Color(weatherColor) },
    sfLining: { value: new THREE.Color(lining || 0) },
    sfBevelR: { value: bevel },
    sfPixel: PIXEL,
  };
  const flags = { SF_TINT: set.tint, SF_WALL: !!wall, SF_WEATHER: !!weather, SF_BREAK: set.grain, SF_BRICK: name === 'brick', SF_LINING: lining !== null };
  mat.defines = Object.fromEntries(Object.entries(flags).filter(([, on]) => on).map(([k]) => [k, '']));
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + FRAG_METAL)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + FRAG_AO);
  };
  mat.customProgramCacheKey = () => 'sf|' + Object.keys(mat.defines).join('|');
  mat.userData.surface = set;
  return mat;
}
