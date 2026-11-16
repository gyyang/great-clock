// The frame after the scene is drawn: ambient occlusion, light shafts, bloom, and
// a film-style grade.
//
// The shafts are real. A half-resolution pass marches each view ray through the
// hall and, at every step, asks the dial light's own shadow map whether that
// point of air is lit, and the dial's glass what colour the light is there. So
// the beams carry the shadows of the hands, the tracery and every wheel they pass.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const quadMat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });

const COPY = /* glsl */`uniform sampler2D tColor; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tColor, vUv); }`;

const SHAFTS = /* glsl */`
  #define STEPS 28
  precision highp sampler2DShadow;
  uniform sampler2D tDepth; uniform sampler2DShadow tShadow; uniform sampler2D tGlass;
  uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform mat4 uShadowMatrix;
  uniform vec3 uLightPos; uniform vec3 uLightCol; uniform float uDensity; uniform float uMaxDist; uniform float uTime;
  varying vec2 vUv;
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float hg(float mu, float g) { float d = 1.0 + g * g - 2.0 * g * mu; return (1.0 - g * g) / (d * sqrt(d)); }
  void main() {
    float d = texture2D(tDepth, vUv).r;
    vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w;
    vec3 ro = uCamWorld[3].xyz, wp = (uCamWorld * v).xyz, rd = wp - ro;
    float dist = min(length(rd), uMaxDist); rd = normalize(rd);
    float dt = dist / float(STEPS), j = ign(gl_FragCoord.xy);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < STEPS; i++) {
      vec3 p = ro + rd * ((float(i) + j) * dt);
      vec4 sc = uShadowMatrix * vec4(p, 1.0);
      if (sc.w <= 0.0) continue;
      vec3 s = sc.xyz / sc.w;
      if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) continue;
      float lit = texture(tShadow, vec3(s.xy, s.z - 0.0004));
      if (lit <= 0.0) continue;
      vec3 glass = texture2D(tGlass, s.xy).rgb;
      float mu = dot(rd, normalize(uLightPos - p));
      float dust = 0.55 + 0.9 * noise(p * 0.11 + vec3(uTime * 0.05, -uTime * 0.02, uTime * 0.03)) * noise(p * 0.37 - uTime * 0.04);
      acc += glass * (lit * dust * min(hg(mu, 0.6) * 0.5 + hg(mu, 0.15) * 0.5, 1.5)) * dt;
    }
    gl_FragColor = vec4(acc * uLightCol * uDensity, 1.0);
  }`;

// Adds the half-resolution shafts to the picture, keeping them from bleeding over
// the edges of nearer things.
const MERGE = /* glsl */`
  uniform sampler2D tColor; uniform sampler2D tShafts; uniform sampler2D tDepth; uniform vec2 uHalfPx; uniform vec2 uNearFar;
  varying vec2 vUv;
  float lin(float d) { return uNearFar.x * uNearFar.y / (uNearFar.y - d * (uNearFar.y - uNearFar.x)); }
  void main() {
    float zc = lin(texture2D(tDepth, vUv).r);
    vec3 sum = vec3(0.0); float ws = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 uv = vUv + vec2(float(x), float(y)) * uHalfPx;
      float w = (1.0 - 0.3 * float(abs(x) + abs(y))) / (0.02 + abs(lin(texture2D(tDepth, uv).r) - zc) / zc);
      sum += texture2D(tShafts, uv).rgb * w; ws += w;
    }
    vec3 s = sum / ws;
    s /= 1.0 + 0.55 * dot(s, vec3(0.2126, 0.7152, 0.0722));                    // lit air can veil what is behind it, never blot it out
    gl_FragColor = vec4(texture2D(tColor, vUv).rgb + s, 1.0);
  }`;

// How bright the picture is on the whole: a log-average over a grid of samples, weighted
// to the middle of the view, eased toward over about a second. One texel, kept between frames.
const ADAPT = /* glsl */`
  uniform sampler2D tColor; uniform sampler2D tPrev; uniform float uRate;
  void main() {
    float sum = 0.0, ws = 0.0;
    for (int y = 0; y < 8; y++) for (int x = 0; x < 12; x++) {
      vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(12.0, 8.0);
      float w = 1.0 - 0.6 * smoothstep(0.15, 0.6, length(uv - 0.5));
      sum += log(max(dot(texture2D(tColor, uv).rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-4)) * w; ws += w;
    }
    gl_FragColor = vec4(mix(texture2D(tPrev, vec2(0.5)).r, exp(sum / ws), uRate), 0.0, 0.0, 1.0);
  }`;

const GRADE = /* glsl */`
  uniform sampler2D tColor; uniform sampler2D tAdapt; uniform float uKey; uniform float uExposure; uniform float uTime; uniform float uVignette;
  varying vec2 vUv;
  vec3 aces(vec3 x) {                                   // Hill's fit of the ACES reference transform
    x = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777) * x;
    x = (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.4329510) + 0.238081);
    return clamp(mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602) * x, 0.0, 1.0);
  }
  float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  void main() {
    vec2 c = vUv - 0.5; float r2 = dot(c, c) * 2.0;
    vec2 off = c * r2 * 0.0035;                                              // the lens splits colour toward the corners
    vec3 col = vec3(texture2D(tColor, vUv + off).r, texture2D(tColor, vUv).g, texture2D(tColor, vUv - off).b);
    // the eye adapts: stop down when the view is full of light, open up a little in the dark
    float adapt = clamp(pow(uKey / max(texture2D(tAdapt, vec2(0.5)).r, 1e-4), 0.5), 0.3, 1.35);
    col = aces(col * uExposure * adapt / 0.6);
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col *= mix(vec3(0.88, 1.0, 1.1), vec3(1.05, 1.0, 0.93), smoothstep(0.03, 0.55, l));   // cool shadows, warm highlights
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.2);                       // a little more contrast in the middle
    col = col * 0.99 + vec3(0.004, 0.0055, 0.007);                            // blacks never quite reach black
    float vr = smoothstep(0.15, 1.05, r2);
    col *= 1.0 - uVignette * vr * vr * (3.0 - 2.0 * vr);
    col = mix(col * 12.92, 1.055 * pow(max(col, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
    float g = hash(gl_FragCoord.xy + fract(uTime) * 517.0) + hash(gl_FragCoord.xy * 1.37 + fract(uTime * 1.3) * 311.0) - 1.0;
    col += g * 0.022 * mix(1.0, 0.3, smoothstep(0.25, 0.9, l));               // film grain, strongest in the shadows
    gl_FragColor = vec4(col, 1.0);
  }`;

// Draws the scene into its own HDR target (which keeps a readable depth texture)
// and hands the colour on to the rest of the chain.
class ScenePass extends Pass {
  constructor(scene, camera, target) {
    super(); this.scene = scene; this.camera = camera; this.target = target;
    this.quad = new FullScreenQuad(quadMat(COPY, { tColor: { value: target.texture } }));
  }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.target); renderer.clear(); renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(writeBuffer); this.quad.render(renderer);
  }
}

class ShaftPass extends Pass {
  constructor(camera, depth, light) {
    super(); this.camera = camera; this.light = light; this.time = 0; this.strength = 1;
    this.half = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.march = new FullScreenQuad(quadMat(SHAFTS, {
      tDepth: { value: depth }, tShadow: { value: null }, tGlass: { value: null },
      uInvProj: { value: camera.projectionMatrixInverse }, uCamWorld: { value: camera.matrixWorld }, uShadowMatrix: { value: light.shadow.matrix },
      uLightPos: { value: light.position }, uLightCol: { value: new THREE.Color() }, uDensity: { value: 0.012 }, uMaxDist: { value: 320 }, uTime: { value: 0 },
    }));
    this.merge = new FullScreenQuad(quadMat(MERGE, {
      tColor: { value: null }, tShafts: { value: this.half.texture }, tDepth: { value: depth },
      uHalfPx: { value: new THREE.Vector2() }, uNearFar: { value: new THREE.Vector2(camera.near, camera.far) },
    }));
  }
  setGlass(texture) { this.march.material.uniforms.tGlass.value = texture; }
  setSize(w, h) {
    const hw = Math.max(2, Math.ceil(w / 2)), hh = Math.max(2, Math.ceil(h / 2));
    this.half.setSize(hw, hh); this.merge.material.uniforms.uHalfPx.value.set(1 / hw, 1 / hh);
  }
  render(renderer, writeBuffer, readBuffer, dt) {
    const u = this.march.material.uniforms, map = this.light.shadow.map, on = this.light.visible && this.strength > 0.002 && map && map.depthTexture;
    this.time += dt; u.uTime.value = this.time;
    renderer.setRenderTarget(this.half);
    if (on) {
      u.tShadow.value = map.depthTexture;
      u.uLightCol.value.copy(this.light.color).multiplyScalar(this.light.intensity * this.strength);
      this.march.render(renderer);
    } else { renderer.setClearColor(0, 1); renderer.clear(); }
    this.merge.material.uniforms.tColor.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.merge.render(renderer);
  }
}

class GradePass extends Pass {
  constructor() {
    super(); this.time = 0; this.first = true;
    const one = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.lum = [one(), one()];
    this.meter = new FullScreenQuad(quadMat(ADAPT, { tColor: { value: null }, tPrev: { value: null }, uRate: { value: 1 } }));
    this.quad = new FullScreenQuad(quadMat(GRADE, { tColor: { value: null }, tAdapt: { value: null }, uKey: { value: 0.07 }, uExposure: { value: 1 }, uTime: { value: 0 }, uVignette: { value: 0.34 } }));
  }
  render(renderer, writeBuffer, readBuffer, dt) {
    const u = this.quad.material.uniforms, m = this.meter.material.uniforms;
    m.tColor.value = readBuffer.texture; m.tPrev.value = this.lum[0].texture; m.uRate.value = this.first ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) / 0.9);
    renderer.setRenderTarget(this.lum[1]); this.meter.render(renderer);
    this.lum.reverse(); this.first = false; u.tAdapt.value = this.lum[0].texture;
    this.time += dt; u.uTime.value = this.time; u.tColor.value = readBuffer.texture; u.uExposure.value = renderer.toneMappingExposure;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
  }
}

export function createPost(renderer, scene, camera, keyLight) {
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  const sceneRT = new THREE.WebGLRenderTarget(db.x, db.y, { type: THREE.HalfFloatType, samples: 4 });
  sceneRT.depthTexture = new THREE.DepthTexture(db.x, db.y);

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(db.x, db.y, { type: THREE.HalfFloatType, depthBuffer: false }));
  composer.addPass(new ScenePass(scene, camera, sceneRT));
  const gtao = new GTAOPass(scene, camera, db.x, db.y, undefined,
    { radius: 1.3, distanceExponent: 1.4, thickness: 1.6, scale: 1.25, samples: 12, distanceFallOff: 1, screenSpaceRadius: false },
    { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1.4, rings: 2, samples: 12 });
  composer.addPass(gtao);
  const shafts = new ShaftPass(camera, sceneRT.depthTexture, keyLight);
  composer.addPass(shafts);
  const bloom = new UnrealBloomPass(new THREE.Vector2(db.x, db.y), 0.32, 0.7, 1.15);
  composer.addPass(bloom);
  const grade = new GradePass();
  composer.addPass(grade);

  return {
    gtao, shafts, bloom, grade,
    setSize(w, h) {
      composer.setSize(w, h);
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      sceneRT.setSize(s.x, s.y); shafts.setSize(s.x, s.y);
    },
    render: () => composer.render(),
  };
}
