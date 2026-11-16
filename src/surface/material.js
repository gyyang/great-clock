// A MeshStandardMaterial that wears a generated surface.
//
// The surface is projected along the three axes of the mesh's own space, in
// metres, so it needs no UVs: a 20 mm baluster and a 240 m wall both get the
// texture at true scale, and instanced parts stretched from a unit box do not
// stretch it. On top of the tile, noise in the same space varies colour and
// roughness over tens of metres, so no two stretches of a wall look alike.
import * as THREE from 'three';
import { surfaceSet } from './generate.js';

const VERT_PARS = /* glsl */`
varying vec3 vSfP; varying vec3 vSfN;
attribute vec3 sfBevel;       // chamfered boxes only: which way each corner vertex pulls back (kit.js)
uniform float sfBevelR;       // chamfer width, metres
`;
const VERT = /* glsl */`
{
  #ifdef USE_INSTANCING
    vec3 sfS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    transformed -= sfBevel * min(sfBevelR, 0.25 * min(sfS.x, min(sfS.y, sfS.z))) / sfS;
  #endif
  vec4 sfP = vec4(transformed, 1.0); vec3 sfN = objectNormal;
  #ifdef USE_INSTANCING
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
uniform sampler2D sfAlbedo; uniform sampler2D sfORM; uniform sampler2D sfNormal;
uniform vec2 sfTile;          // metres per repeat
uniform vec4 sfMacro;         // colour swing, roughness swing, cycles per metre, grime
uniform vec4 sfWall;          // streaks, damp height (m), patch contrast, soot toward the top
uniform vec4 sfAge;           // what the surface turns into where it is neglected (rgb multiplier), and how much
uniform mat3 normalMatrix;
vec3 sfOrm; vec3 sfNrm;

float sfHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sfNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sfHash(i), sfHash(i + vec3(1, 0, 0)), f.x), mix(sfHash(i + vec3(0, 1, 0)), sfHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sfHash(i + vec3(0, 0, 1)), sfHash(i + vec3(1, 0, 1)), f.x), mix(sfHash(i + vec3(0, 1, 1)), sfHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
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
  vec4 a = texture2D(sfAlbedo, ux) * w.x + texture2D(sfAlbedo, uy) * w.y + texture2D(sfAlbedo, uz) * w.z;
  sfOrm = (texture2D(sfORM, ux) * w.x + texture2D(sfORM, uy) * w.y + texture2D(sfORM, uz) * w.z).rgb;
  vec3 tx = texture2D(sfNormal, ux).xyz * 2.0 - 1.0, ty = texture2D(sfNormal, uy).xyz * 2.0 - 1.0, tz = texture2D(sfNormal, uz).xyz * 2.0 - 1.0;
  float sfFlat = 1.0 - (length(tx) * w.x + length(ty) * w.y + length(tz) * w.z);     // how much the mip has averaged the bumps away
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x); ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  sfNrm = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);

  #ifdef SF_TINT
    vec3 col = a.rgb + diffuseColor.rgb * a.a;
  #else
    vec3 col = a.rgb * diffuseColor.rgb;
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
//   bevel     chamfer width in metres on instanced boxes
// roughness and metalness multiply the texture's own values.
export function surface(name, { p, seed, macro = [0.14, 0.1, 0.8, 0.2], wall = null, age = [1, 1, 1, 0], bevel = 0.012, ...params } = {}) {
  const set = surfaceSet(name, { p, seed });
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1, ...params });
  const uniforms = {
    sfAlbedo: { value: set.albedo }, sfORM: { value: set.orm }, sfNormal: { value: set.normal },
    sfTile: { value: new THREE.Vector2(set.tile[0], set.tile[1]) },
    sfMacro: { value: new THREE.Vector4(...macro) },
    sfWall: { value: new THREE.Vector4(...(wall || [0, 0, 0, 0])) },
    sfAge: { value: new THREE.Vector4(...age) },
    sfBevelR: { value: bevel },
  };
  mat.defines = { ...(set.tint ? { SF_TINT: '' } : {}), ...(wall ? { SF_WALL: '' } : {}) };
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
  mat.customProgramCacheKey = () => `sf|${set.tint ? 't' : ''}|${wall ? 'w' : ''}`;
  mat.userData.surface = set;
  return mat;
}
