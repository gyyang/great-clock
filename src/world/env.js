// Renderer, light, shadow, haze, sky and dust. The frame's post-processing is in post.js.
//
// Indoors there is one key light: daylight pouring in through the dial. It is a
// shadow-casting spotlight outside the tower whose cone exactly fills the dial
// opening, tinted by the dial's own glass, so the whole movement throws moving
// shadows across the hall and onto the back wall.
import * as THREE from 'three';
import { createPost } from './post.js';
import { TOWER, DIAL } from '../layout.js';
import { MAT, TEX } from '../kit.js';

const IN = { fog: new THREE.Color(0x1a130c), density: 0.0046, hemi: 0.42, fill: 0.3, key: 2.3, exposure: 1.2 };
const OUT = { fog: new THREE.Color(0xc9925f), density: 0.0016, hemi: 0.7, sun: 1.9, exposure: 1.5 };   // (the grade's eye adaptation stops this down again)

const SKY_FRAG = `
  varying vec3 vDir; uniform vec3 sunDir;
  void main(){
    vec3 d = normalize(vDir);
    float h = smoothstep(-0.02, 0.75, d.y);
    vec3 col = mix(vec3(0.80,0.50,0.28), vec3(0.10,0.19,0.36), pow(h, 0.55));
    col = mix(vec3(0.72,0.50,0.32), col, smoothstep(-0.08, 0.06, d.y));
    float s = max(dot(d, sunDir), 0.0);
    col += vec3(1.0,0.72,0.42) * (pow(s, 600.0) * 5.0 + pow(s, 12.0) * 0.3);
    gl_FragColor = vec4(col, 1.0);
  }`;
const SKY_VERT = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

// What the brass reflects indoors: a dark hall, the glowing dial on one side,
// the lit back wall on the other, and a scatter of gas lamps.
function interiorEnv(pmrem) {
  const s = new THREE.Scene(), basic = (r, g, b, side) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: side || THREE.FrontSide });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), basic(0.055, 0.04, 0.026, THREE.BackSide)));
  const disc = (radius, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), mat); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
  disc(8, 0, 3, 13, basic(5.2, 4.2, 2.8));
  disc(13, 0, 2, -17, basic(0.42, 0.3, 0.17));
  disc(30, 0, -9, 0, basic(0.035, 0.028, 0.022));
  const r = (() => { let a = 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  for (let i = 0; i < 22; i++) {
    const a = r() * 6.283, y = -6 + r() * 14, d = 14 + r() * 6;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), basic(18, 9, 3)); m.position.set(Math.cos(a) * d, y, Math.sin(a) * d); s.add(m);
  }
  return pmrem.fromScene(s, 0.02).texture;
}
function exteriorEnv(pmrem, sunDir) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { sunDir: { value: sunDir } }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG })));
  return pmrem.fromScene(s, 0.02).texture;
}

export function createEnv(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = IN.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.12, 5000);
  camera.rotation.order = 'YXZ';
  scene.fog = new THREE.FogExp2(IN.fog.getHex(), IN.density);

  const sunDir = new THREE.Vector3(0.3, 0.42, 0.86).normalize();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envIn = interiorEnv(pmrem), envOut = exteriorEnv(pmrem, sunDir);
  scene.environment = envIn; scene.environmentIntensity = 1;

  // ---- lights
  const hemi = new THREE.HemisphereLight(0xffdcb0, 0x231810, IN.hemi); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a8, 0); sun.position.copy(sunDir).multiplyScalar(100); scene.add(sun);   // outdoors only
  const fill = new THREE.DirectionalLight(0xc89a68, IN.fill); fill.position.set(-20, 60, -100); scene.add(fill);       // bounce off the back wall

  const keyPos = new THREE.Vector3(26, 256, 332), keyAim = new THREE.Vector3(DIAL.x, DIAL.y, DIAL.z);
  const keyDist = keyPos.distanceTo(keyAim);
  const key = new THREE.SpotLight(0xffe6c0, IN.key, 0, Math.atan((DIAL.r + 0.8) / keyDist), 0.03, 0);
  key.position.copy(keyPos); key.target.position.copy(keyAim); scene.add(key, key.target);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.camera.near = keyDist - 40; key.shadow.camera.far = keyDist + 150;
  key.shadow.bias = -0.0002; key.shadow.normalBias = 0.07; key.shadow.radius = 2.5;

  const lantern = new THREE.PointLight(0xffb066, 0, 34, 2); scene.add(lantern);     // a hand lantern you can light (L); out by default
  let lit = false;
  for (const [x, y, z, col, power] of [[44, 14, 12, 0xffa050, 420], [-45, 4, -13, 0xff6a28, 260], [0, 26, -26, 0xffa860, 520], [33, 9, -26, 0xffa050, 200]]) {
    const p = new THREE.PointLight(col, power, 75, 2); p.position.set(x, y, z); scene.add(p);
  }

  // ---- sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sunDir: { value: sunDir } }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
  }));
  sky.frustumCulled = false; scene.add(sky);

  // ---- dust motes that wrap around the camera
  const N = 2600, SIZE = 70, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = Math.random() * SIZE; pos[i * 3 + 1] = Math.random() * SIZE; pos[i * 3 + 2] = Math.random() * SIZE; seed[i] = Math.random(); }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dg.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { cam: { value: new THREE.Vector3() }, t: { value: 0 }, amount: { value: 1 }, px: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float seed; uniform vec3 cam; uniform float t; uniform float px; varying float vA;
      void main(){
        vec3 p = position + vec3(sin(t*0.11+seed*40.0), t*0.12*(0.3+seed), cos(t*0.09+seed*23.0)) * 1.6;
        p = mod(p - cam + ${(SIZE / 2).toFixed(1)}, ${SIZE.toFixed(1)}) - ${(SIZE / 2).toFixed(1)} + cam;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(px * 26.0 / d, 1.0, 5.0 * px);
        vA = smoothstep(${(SIZE / 2).toFixed(1)}, ${(SIZE / 4).toFixed(1)}, d) * smoothstep(0.6, 3.0, d) * (0.35 + 0.65 * seed);
      }`,
    fragmentShader: `
      varying float vA; uniform float amount;
      void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, r) * vA * amount * 0.5; gl_FragColor = vec4(vec3(1.0,0.86,0.62) * a, a); }`,
  });
  const dust = new THREE.Points(dg, dustMat); dust.frustumCulled = false; scene.add(dust);

  // ---- post: ambient occlusion, light shafts, bloom, grade (see post.js)
  const post = createPost(renderer, scene, camera, key);
  const gtao = post.gtao;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); post.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // 2: 4096 shadows + ambient occlusion, 1: 2048 shadows, 0: 1024 shadows
  let quality = 2;
  function setQuality(q) {
    quality = Math.max(0, Math.min(2, q));
    gtao.enabled = quality === 2;
    const size = [1024, 2048, 4096][quality];
    if (key.shadow.mapSize.x !== size) {
      key.shadow.mapSize.set(size, size);
      if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    }
    return quality;
  }

  let outside = 0, time = 0;
  const { hx, hz, H, wall } = TOWER, fogCol = new THREE.Color();
  function update(dt, p) {
    time += dt;
    if (!key.map && TEX.dial) { key.map = TEX.dial; post.shafts.setGlass(TEX.dial); }      // the light, and its shafts, take the colour of the glass they pass through
    const isOut = Math.abs(p.x) > hx + wall * 0.5 || p.z > hz + wall * 0.5 || p.z < -hz - wall * 0.5 || p.y > H + 1;
    outside += ((isOut ? 1 : 0) - outside) * Math.min(1, dt * 2.5);
    const k = outside, mix = (a, b) => a + (b - a) * k;
    scene.fog.color.copy(fogCol.copy(IN.fog).lerp(OUT.fog, k));
    scene.fog.density = mix(IN.density, OUT.density);
    hemi.intensity = mix(IN.hemi, OUT.hemi);
    sun.intensity = OUT.sun * k;
    fill.intensity = IN.fill * (1 - k);
    key.intensity = IN.key * (1 - k); key.visible = k < 0.985;
    post.shafts.strength = 1 - k;
    scene.environment = k > 0.5 ? envOut : envIn;
    lantern.intensity = lit ? 40 * (1 - k) : 0;
    lantern.position.set(camera.position.x, camera.position.y - 0.4, camera.position.z);
    renderer.toneMappingExposure = mix(IN.exposure, OUT.exposure);
    if (MAT.dial) MAT.dial.emissiveIntensity = 1.0 - 0.72 * k;      // lit from behind indoors, by daylight outdoors
    sky.position.copy(camera.position);
    dustMat.uniforms.cam.value.copy(camera.position); dustMat.uniforms.t.value = time; dustMat.uniforms.amount.value = 1 - k;
    return k;
  }

  return { renderer, scene, camera, post, update, setQuality, toggleLantern: () => (lit = !lit), get quality() { return quality; }, render: post.render };
}
