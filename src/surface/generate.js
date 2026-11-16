// Bakes a surface recipe into three tiling, mipmapped textures on the GPU:
// colour (+ tint shade in alpha), occlusion/roughness/metalness, and a normal map
// derived from the recipe's height field.
import * as THREE from 'three';
import { HEAD, TAIL, QUAD_VERT, COPY_ALBEDO, COPY, NORMAL } from './glsl.js';
import { RECIPES } from './recipes.js';

const BASE = 1024;
const cache = new Map();
let renderer = null, quad = null, cam = null, scene = null;

export function initSurfaces(r) { renderer = r; }

function pass(fragment, uniforms, target) {
  if (!quad) {
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene = new THREE.Scene(); scene.add(quad);
  }
  const mat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: QUAD_VERT, fragmentShader: fragment, uniforms, depthTest: false, depthWrite: false });
  quad.material = mat;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target); renderer.render(scene, cam); renderer.setRenderTarget(prev);
  mat.dispose();
}

function finalTarget(size, srgb) {
  const t = new THREE.WebGLRenderTarget(size, size, {
    depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
  });
  t.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

// name: a recipe; p: the recipe's four knobs; seed: a different roll of the same surface.
export function surfaceSet(name, { p = [0, 0, 0, 0], seed = 0 } = {}) {
  const key = `${name}|${p.join(',')}|${seed}`;
  if (cache.has(key)) return cache.get(key);
  const R = RECIPES[name];
  if (!R) throw new Error(`[surface] no recipe "${name}"`);
  const size = Math.max(32, Math.round(BASE * R.size));

  const scratch = new THREE.WebGLRenderTarget(size, size, {
    count: 3, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
  });
  pass(HEAD + R.glsl + TAIL, { uSeed: { value: seed }, uP: { value: new THREE.Vector4(...p) } }, scratch);

  const albedo = finalTarget(size, true), orm = finalTarget(size, false), normal = finalTarget(size, false);
  pass(COPY_ALBEDO, { tA: { value: scratch.textures[0] } }, albedo);
  pass(COPY, { tA: { value: scratch.textures[1] } }, orm);
  // slope = dh/dx with h in metres: bump (mm) over a tile (m) sampled at 'size' texels
  const k = (i) => R.bump * 0.001 * size / R.tile[i];
  pass(NORMAL, { tH: { value: scratch.textures[2] }, uPx: { value: new THREE.Vector2(1 / size, 1 / size) }, uK: { value: new THREE.Vector2(k(0), k(1)) } }, normal);
  scratch.dispose();

  const set = { name, albedo: albedo.texture, orm: orm.texture, normal: normal.texture, tile: R.tile, tint: !!R.tint, grain: !!R.grain, size };
  cache.set(key, set);
  return set;
}
