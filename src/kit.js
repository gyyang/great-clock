// Build kit: materials, procedural textures (colour + normal + roughness),
// instanced primitives, and the walkway / railing / stair helpers that give
// the tower its human scale.
import * as THREE from 'three';

export const G = { scene: null, world: null, R: null, parts: new Map() };
export const MAT = {};
export const TEX = {};
export const QID = new THREE.Quaternion();
// Rapier cylinders lie along Y; this turns them to lie along Z.
export const QX = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };

const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

export function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20261115);

// ------------------------------------------------------- texture machinery
function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }
function tex(c, { srgb = true, aniso = 8, repeat = 1 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function draw(size, fn) { const c = canvas(size), x = c.getContext('2d'); fn(x, size); return c; }

// Tiling fractal value noise in [0,1].
function fbm(size, freq, octaves, seed) {
  const out = new Float32Array(size * size), r = mulberry32(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const f = freq << o, lat = new Float32Array(f * f);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    const i0 = new Int32Array(size), i1 = new Int32Array(size), ft = new Float32Array(size);
    for (let x = 0; x < size; x++) { const fx = x / size * f, x0 = Math.floor(fx), t = fx - x0; i0[x] = x0 % f; i1[x] = (x0 + 1) % f; ft[x] = t * t * (3 - 2 * t); }
    for (let y = 0; y < size; y++) {
      const r0 = i0[y] * f, r1 = i1[y] * f, ty = ft[y], row = y * size;
      for (let x = 0; x < size; x++) {
        const tx = ft[x], top = lat[r0 + i0[x]] + (lat[r0 + i1[x]] - lat[r0 + i0[x]]) * tx, bot = lat[r1 + i0[x]] + (lat[r1 + i1[x]] - lat[r1 + i0[x]]) * tx;
        out[row + x] += amp * (top + (bot - top) * ty);
      }
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function heightOf(c) {
  const s = c.width, d = c.getContext('2d').getImageData(0, 0, s, s).data, h = new Float32Array(s * s);
  for (let i = 0; i < h.length; i++) h[i] = d[i * 4] / 255;
  return h;
}
// Tangent-space normal map from a tiling height field.
function normalFrom(h, s, strength) {
  const c = canvas(s), x2 = c.getContext('2d'), img = x2.createImageData(s, s), d = img.data;
  for (let y = 0; y < s; y++) {
    const yu = ((y - 1 + s) % s) * s, yd = ((y + 1) % s) * s, row = y * s;
    for (let x = 0; x < s; x++) {
      const dx = (h[row + (x + 1) % s] - h[row + (x - 1 + s) % s]) * strength, dy = (h[yd + x] - h[yu + x]) * strength;
      const il = 1 / Math.hypot(dx, dy, 1), k = (row + x) * 4;
      d[k] = (-dx * il * 0.5 + 0.5) * 255; d[k + 1] = (dy * il * 0.5 + 0.5) * 255; d[k + 2] = (il * 0.5 + 0.5) * 255; d[k + 3] = 255;
    }
  }
  x2.putImageData(img, 0, 0);
  return c;
}
// Run a per-pixel function over a canvas: fn(i, r, g, b) -> [r, g, b]
function shade(c, fn) {
  const s = c.width, x2 = c.getContext('2d'), img = x2.getImageData(0, 0, s, s), d = img.data;
  for (let i = 0; i < s * s; i++) { const o = fn(i, d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); d[i * 4] = o[0]; d[i * 4 + 1] = o[1]; d[i * 4 + 2] = o[2]; d[i * 4 + 3] = 255; }
  x2.putImageData(img, 0, 0);
  return c;
}
function gray(fn, size) {
  const c = canvas(size), x2 = c.getContext('2d'), img = x2.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) { const v = Math.min(255, Math.max(0, fn(i) * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  x2.putImageData(img, 0, 0);
  return c;
}

function makeTextures() {
  // ---- brick: 4 m tile, 0.5 x 0.25 m bricks, with relief
  {
    const S = 1024, rows = 16, rh = S / rows, bw = S / 8;
    const col = canvas(S), hgt = canvas(S), cx = col.getContext('2d'), hx = hgt.getContext('2d');
    cx.fillStyle = '#17110d'; cx.fillRect(0, 0, S, S); hx.fillStyle = 'rgb(62,62,62)'; hx.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) for (let b = -1; b < 8; b++) {
      const x = b * bw + (r % 2 ? bw / 2 : 0), y = r * rh, burnt = rnd() < 0.1 ? 0.55 : 1;
      cx.fillStyle = `hsl(${8 + rnd() * 14},${26 + rnd() * 24}%,${(15 + rnd() * 13) * burnt}%)`;
      cx.fillRect(x + 3, y + 3, bw - 6, rh - 6);
      const hv = Math.round(150 + rnd() * 70);
      hx.fillStyle = `rgb(${hv - 50},${hv - 50},${hv - 50})`; hx.fillRect(x + 3, y + 3, bw - 6, rh - 6);
      hx.fillStyle = `rgb(${hv},${hv},${hv})`; hx.fillRect(x + 7, y + 7, bw - 14, rh - 14);
    }
    const soot = fbm(S, 3, 4, 11), grain = fbm(S, 96, 2, 12), h = heightOf(hgt);
    shade(col, (i, r, g, b) => { const k = (0.82 + 0.36 * soot[i]) * (0.85 + 0.3 * grain[i]); return [r * k, g * k, b * k]; });
    for (let i = 0; i < h.length; i++) h[i] += (grain[i] - 0.5) * 0.16;
    TEX.brick = tex(col); TEX.brickN = tex(normalFrom(h, S, 5), { srgb: false });
  }

  // ---- floor: 4 m tile of riveted tread plate (2 m plates, 6 cm diamonds)
  {
    const S = 1024, P = 16;
    const hgt = draw(S, (c, s) => {
      c.fillStyle = 'rgb(110,110,110)'; c.fillRect(0, 0, s, s);
      c.fillStyle = 'rgb(205,205,205)';
      for (let j = 0; j < s / P; j++) for (let i = 0; i < s / P; i++) {
        c.save(); c.translate(i * P + P / 2, j * P + P / 2); c.rotate((i + j) % 2 ? Math.PI / 4 : -Math.PI / 4);
        c.beginPath(); c.ellipse(0, 0, 5.6, 1.9, 0, 0, 7); c.fill(); c.restore();
      }
      for (let k = 0; k < 2; k++) {
        const v = k * s / 2;
        c.fillStyle = 'rgb(110,110,110)';
        for (const o of [-s, 0, s]) { c.fillRect(v + o - 30, 0, 60, s); c.fillRect(0, v + o - 30, s, 60); }
      }
      for (let k = 0; k < 2; k++) {
        const v = k * s / 2;
        c.fillStyle = 'rgb(25,25,25)';
        for (const o of [-s, 0, s]) { c.fillRect(v + o - 3, 0, 6, s); c.fillRect(0, v + o - 3, s, 6); }
        c.fillStyle = 'rgb(240,240,240)';
        for (let i = 0; i < 16; i++) for (const o of [-18, 18]) {
          const u = (i + 0.5) * s / 16;
          for (const [x, y] of [[v + o, u], [u, v + o]]) for (const [ox, oy] of [[0, 0], [s, 0], [0, s]]) { c.beginPath(); c.arc(x + ox, y + oy, 6, 0, 7); c.fill(); }
        }
      }
    });
    const h = heightOf(hgt), wear = fbm(S, 3, 4, 21), rust = fbm(S, 6, 4, 22), grain = fbm(S, 128, 2, 23);
    const col = gray(() => 0, S);
    shade(col, (i) => {
      const hi = h[i], w = 0.7 + 0.6 * wear[i], ru = sstep(0.58, 0.8, rust[i]) * 0.55, g = 0.9 + 0.2 * grain[i];
      const k = w * g * (hi > 0.7 ? 1.45 : hi < 0.2 ? 0.35 : 1);
      return [(52 * (1 - ru) + 96 * ru) * k, (55 * (1 - ru) + 58 * ru) * k, (60 * (1 - ru) + 38 * ru) * k];
    });
    TEX.plate = tex(col); TEX.plateN = tex(normalFrom(h, S, 4), { srgb: false });
    TEX.plateR = tex(gray((i) => 0.5 + 0.38 * wear[i] - (h[i] > 0.7 ? 0.2 : 0) + sstep(0.58, 0.8, rust[i]) * 0.3, S), { srgb: false });
  }

  // ---- 1 m tile of open bar grating (you can see through it)
  TEX.grate = tex(draw(512, (c, s) => {
    c.fillStyle = '#54575c'; c.fillRect(0, 0, s, s);
    const n = 8, bh = s / n;
    for (let i = 0; i < n; i++) { c.fillStyle = '#7a7e85'; c.fillRect(0, i * bh, s, bh * 0.1); c.fillStyle = '#34363a'; c.fillRect(0, i * bh + bh * 0.2, s, bh * 0.07); }
    for (let j = 0; j < 2; j++) { c.fillStyle = '#6c7076'; c.fillRect(j * s / 2 - 5, 0, 10, s); }
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) c.fillRect(j * s / 2 + s * 0.035, i * bh + bh * 0.27, s / 2 - s * 0.07, bh * 0.46);
  }));

  // ---- 2 m tile of cage lattice
  TEX.lattice = tex(draw(512, (c, s) => {
    for (const [w, colr] of [[18, '#2e3034'], [10, '#5a5e64']]) {
      c.strokeStyle = colr; c.lineWidth = w;
      for (let i = -4; i <= 8; i++) {
        c.beginPath(); c.moveTo(i * s / 4, 0); c.lineTo(i * s / 4 + s, s); c.stroke();
        c.beginPath(); c.moveTo(i * s / 4, 0); c.lineTo(i * s / 4 - s, s); c.stroke();
      }
    }
  }));

  // ---- brass: tarnish drives both colour and roughness; a fine cast-metal normal on top
  {
    const S = 1024, n1 = fbm(S, 4, 5, 31), n2 = fbm(S, 18, 4, 32), sp = fbm(S, 160, 2, 33);
    const tarnish = new Float32Array(S * S);
    for (let i = 0; i < tarnish.length; i++) tarnish[i] = sstep(0.38, 0.86, n1[i] * 0.6 + n2[i] * 0.4);
    const col = gray(() => 0, S);
    shade(col, (i) => {
      const t = tarnish[i] * 0.5, v = sstep(0.66, 0.84, n2[i]) * t * 0.5, k = 0.93 + 0.14 * sp[i];
      const r = 236 + (122 - 236) * t, g = 226 + (100 - 226) * t, b = 206 + (68 - 206) * t;
      return [(r + (104 - r) * v) * k, (g + (140 - g) * v) * k, (b + (118 - b) * v) * k];
    });
    TEX.patina = tex(col, { repeat: 1 / 12 });
    TEX.patinaR = tex(gray((i) => 0.5 + 0.42 * tarnish[i] + (sp[i] - 0.5) * 0.12, S), { srgb: false, repeat: 1 / 12 });
    TEX.micro = tex(normalFrom(fbm(512, 64, 3, 34), 512, 2.0), { srgb: false, repeat: 1 / 1.1 });
  }

  // ---- machined turntable face for the flat gears: sectors make the spin readable
  TEX.turntable = tex(draw(1024, (c, s) => {
    const R = s / 2; c.translate(R, R);
    for (let i = 0; i < 24; i++) {
      c.fillStyle = i % 2 ? '#a58a55' : '#8a7245';
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, i * Math.PI / 12, (i + 1) * Math.PI / 12); c.fill();
    }
    for (let i = 0; i < 260; i++) { c.strokeStyle = `rgba(${rnd() < 0.5 ? '255,240,200' : '40,30,15'},${0.03 + rnd() * 0.05})`; c.lineWidth = 1 + rnd() * 2; c.beginPath(); c.arc(0, 0, R * rnd(), 0, 7); c.stroke(); }
    c.strokeStyle = '#2a2217';
    for (const [r, w] of [[0.18, 10], [0.5, 6], [0.8, 6], [0.985, 12]]) { c.lineWidth = w; c.beginPath(); c.arc(0, 0, R * r, 0, 7); c.stroke(); }
    c.lineWidth = 3;
    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; c.beginPath(); c.moveTo(Math.cos(a) * R * 0.18, Math.sin(a) * R * 0.18); c.lineTo(Math.cos(a) * R, Math.sin(a) * R); c.stroke(); }
    for (const [r, n] of [[0.34, 24], [0.65, 48], [0.9, 72]]) for (let i = 0; i < n; i++) {
      const a = (i + 0.5) * 2 * Math.PI / n;
      c.fillStyle = '#3a2f1e'; c.beginPath(); c.arc(Math.cos(a) * R * r + 1.5, Math.sin(a) * R * r + 1.5, 6, 0, 7); c.fill();
      c.fillStyle = '#d9c38c'; c.beginPath(); c.arc(Math.cos(a) * R * r, Math.sin(a) * R * r, 5, 0, 7); c.fill();
    }
  }));
  TEX.turntable.wrapS = TEX.turntable.wrapT = THREE.ClampToEdgeWrapping;

  // ---- the dial: opal glass, iron tracery, Roman numerals
  TEX.dial = tex(draw(2048, (c, s) => {
    const R = s / 2; c.translate(R, R);
    const g = c.createRadialGradient(0, 0, R * 0.05, 0, 0, R);
    g.addColorStop(0, '#fff1d0'); g.addColorStop(0.65, '#f0d7a4'); g.addColorStop(1, '#c79f62');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = `rgba(120,80,30,${rnd() * 0.035})`;
      const a = rnd() * 7, r = Math.sqrt(rnd()) * R;
      c.beginPath(); c.arc(Math.cos(a) * r, Math.sin(a) * r, 6 + rnd() * 50, 0, 7); c.fill();
    }
    const ink = '#17110b'; c.strokeStyle = ink; c.fillStyle = ink;
    for (const [r, w] of [[0.12, 0.012], [0.5, 0.008], [0.86, 0.01], [0.955, 0.006], [0.99, 0.024]]) { c.lineWidth = R * w; c.beginPath(); c.arc(0, 0, R * r, 0, 7); c.stroke(); }
    for (let i = 0; i < 24; i++) {
      c.lineWidth = R * (i % 2 ? 0.004 : 0.008); const a = i * Math.PI / 12;
      c.beginPath(); c.moveTo(Math.cos(a) * R * 0.12, Math.sin(a) * R * 0.12); c.lineTo(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5); c.stroke();
    }
    for (let i = 0; i < 60; i++) {
      const a = i * Math.PI / 30, five = i % 5 === 0; c.lineWidth = R * (five ? 0.016 : 0.006);
      c.beginPath(); c.moveTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86); c.lineTo(Math.cos(a) * R * 0.955, Math.sin(a) * R * 0.955); c.stroke();
    }
    const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${R * 0.19}px "Times New Roman", Georgia, serif`;
    for (let hNum = 0; hNum < 12; hNum++) { c.save(); c.rotate(hNum * Math.PI / 6); c.translate(0, -R * 0.68); c.scale(0.72, 1.3); c.fillText(roman[hNum], 0, 0); c.restore(); }
  }), { aniso: 16 });
  TEX.dial.wrapS = TEX.dial.wrapT = THREE.ClampToEdgeWrapping;

  // ---- city facades: 16 m tile, five storeys of windows, some lit
  {
    const S = 512, lit = canvas(S), lx = lit.getContext('2d'); lx.fillStyle = '#000'; lx.fillRect(0, 0, S, S);
    const col = draw(S, (c, s) => {
      c.fillStyle = '#4a433c'; c.fillRect(0, 0, s, s);
      const n = 5, cw = s / n;
      for (let j = 0; j < n; j++) {
        c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, j * cw + cw * 0.92, s, cw * 0.08);
        for (let i = 0; i < n; i++) {
          const x = i * cw + cw * 0.3, y = j * cw + cw * 0.22, w = cw * 0.4, hgt = cw * 0.52;
          c.fillStyle = '#2c2722'; c.fillRect(x - 4, y - 4, w + 8, hgt + 8);
          c.fillStyle = '#14161a'; c.fillRect(x, y, w, hgt);
          if (rnd() < 0.32) { lx.fillStyle = `rgb(255,${Math.round(150 + rnd() * 70)},${Math.round(60 + rnd() * 70)})`; lx.fillRect(x, y, w, hgt); }
        }
      }
    });
    const n = fbm(S, 4, 4, 41);
    shade(col, (i, r, g, b) => { const k = 0.7 + 0.6 * n[i]; return [r * k, g * k, b * k]; });
    TEX.facade = tex(col); TEX.facadeLit = tex(lit);
  }
}

// --------------------------------------------------------------- materials
function makeMaterials() {
  const S = (o) => new THREE.MeshStandardMaterial(o), v2 = (a) => new THREE.Vector2(a, a);
  MAT.brass = S({ color: 0xcfa650, metalness: 1, roughness: 0.6, map: TEX.patina, roughnessMap: TEX.patinaR, normalMap: TEX.micro, normalScale: v2(0.3) });
  MAT.bronze = S({ color: 0x8f6c38, metalness: 1, roughness: 0.7, map: TEX.patina, roughnessMap: TEX.patinaR, normalMap: TEX.micro, normalScale: v2(0.34) });
  MAT.copper = S({ color: 0xc46a3c, metalness: 1, roughness: 0.55, roughnessMap: TEX.patinaR });
  MAT.steel = S({ color: 0x8f959d, metalness: 1, roughness: 0.66, roughnessMap: TEX.patinaR, normalMap: TEX.micro, normalScale: v2(0.22) });
  MAT.iron = S({ color: 0x2e3135, metalness: 0.85, roughness: 0.62 });
  MAT.rail = S({ color: 0x25272b, metalness: 0.9, roughness: 0.45 });
  MAT.rivet = S({ color: 0x7a6238, metalness: 1, roughness: 0.42 });
  MAT.brick = S({ map: TEX.brick, normalMap: TEX.brickN, normalScale: v2(1.2), roughness: 0.93, metalness: 0 });
  MAT.plate = S({ map: TEX.plate, normalMap: TEX.plateN, normalScale: v2(1.1), roughnessMap: TEX.plateR, roughness: 0.95, metalness: 0.7 });
  MAT.grate = S({ map: TEX.grate, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.85 });
  MAT.lattice = S({ map: TEX.lattice, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.8 });
  MAT.turntable = S({ map: TEX.turntable, metalness: 0.9, roughness: 0.5, normalMap: TEX.micro, normalScale: v2(0.3) });
  MAT.stone = S({ color: 0x6d6459, roughness: 1 });
  MAT.slate = S({ color: 0x25282d, roughness: 0.8, metalness: 0.2 });
  MAT.ground = S({ color: 0x2d2924, roughness: 1 });
  MAT.city = S({ map: TEX.facade, emissive: 0xffffff, emissiveMap: TEX.facadeLit, emissiveIntensity: 1.1, roughness: 0.95 });
  MAT.dial = S({ color: 0x6a5f4c, map: TEX.dial, emissive: 0xffffff, emissiveMap: TEX.dial, emissiveIntensity: 1.0, roughness: 0.45, side: THREE.DoubleSide });
  MAT.shadow = new THREE.MeshBasicMaterial({ color: 0x150f09, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
  MAT.bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.8, 0.62), fog: false });
  MAT.window = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.85, 0.35) });
  MAT.fire = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.1, 0.25) });
}

export function initKit(scene, world, RAPIER) {
  G.scene = scene; G.world = world; G.R = RAPIER;
  makeTextures(); makeMaterials();
}

// ------------------------------------------------------ instanced primitives
const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 48),
  sph: new THREE.SphereGeometry(1, 16, 12),
};
const batches = new Map();
function push(kind, mat, sx, sy, sz, x, y, z, q) {
  const key = kind + ':' + mat;
  let b = batches.get(key);
  if (!b) batches.set(key, b = { geo: UNIT[kind], mat, list: [] });
  b.list.push(new THREE.Matrix4().compose(_p.set(x, y, z), q || QID, _s.set(sx, sy, sz)));
}
export const ibox = (mat, sx, sy, sz, x, y, z, q) => push('box', mat, sx, sy, sz, x, y, z, q);
export const icyl = (mat, r, h, x, y, z, q) => push('cyl', mat, r, h, r, x, y, z, q);
export const isph = (mat, r, x, y, z) => push('sph', mat, r, r, r, x, y, z);

export function flushBatches() {
  for (const b of batches.values()) {
    const im = new THREE.InstancedMesh(b.geo, MAT[b.mat], b.list.length);
    b.list.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    G.scene.add(im);
  }
  batches.clear();
}

// ------------------------------------------------------------- colliders
export function cbox(sx, sy, sz, x, y, z, q) {
  const d = G.R.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setTranslation(x, y, z);
  if (q) d.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  return G.world.createCollider(d);
}
export function sbox(mat, sx, sy, sz, x, y, z, q) { ibox(mat, sx, sy, sz, x, y, z, q); return cbox(sx, sy, sz, x, y, z, q); }

function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
}
// Box geometry whose UVs are in world metres / tile.
export function boxGeo(sx, sy, sz, tile = 4) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv, dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile); }
  return g;
}
export function tbox(material, sx, sy, sz, x, y, z, tile = 4, collide = true) {
  const m = new THREE.Mesh(boxGeo(sx, sy, sz, tile), material); m.position.set(x, y, z); G.scene.add(m);
  if (collide) cbox(sx, sy, sz, x, y, z);
  return m;
}
export function tplane(material, x0, x1, z0, z1, y, tile = 1) {
  const sx = x1 - x0, sz = z1 - z0;
  const g = new THREE.PlaneGeometry(sx, sz); g.rotateX(-Math.PI / 2); scaleUV(g, sx / tile, sz / tile);
  const m = new THREE.Mesh(g, material); m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); G.scene.add(m);
  return m;
}

// ----------------------------------------------------- walkway components
// Open-grate deck with a walking surface at height y.
export function deck(x0, x1, z0, z1, y) {
  const sx = x1 - x0, sz = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  tplane(MAT.grate, x0, x1, z0, z1, y, 1);
  cbox(sx, 0.3, sz, cx, y - 0.15, cz);
  if (sx >= sz) {
    ibox('iron', sx, 0.42, 0.18, cx, y - 0.23, z0 + 0.09); ibox('iron', sx, 0.42, 0.18, cx, y - 0.23, z1 - 0.09);
    const n = Math.max(1, Math.round(sx / 3));
    for (let i = 0; i <= n; i++) ibox('iron', 0.12, 0.3, sz, x0 + sx * i / n, y - 0.18, cz);
  } else {
    ibox('iron', 0.18, 0.42, sz, x0 + 0.09, y - 0.23, cz); ibox('iron', 0.18, 0.42, sz, x1 - 0.09, y - 0.23, cz);
    const n = Math.max(1, Math.round(sz / 3));
    for (let i = 0; i <= n; i++) ibox('iron', sx, 0.3, 0.12, cx, y - 0.18, z0 + sz * i / n);
  }
}

function frame(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const hl = Math.hypot(dx, dz), len = Math.hypot(hl, dy), yaw = Math.atan2(-dz, dx);
  return {
    dx, dy, dz, hl, len,
    q: new THREE.Quaternion().setFromEuler(_e.set(0, yaw, Math.atan2(dy, hl), 'YZX')),
    qy: new THREE.Quaternion().setFromEuler(_e.set(0, yaw, 0, 'YZX')),
    mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, mz: (a[2] + b[2]) / 2,
  };
}

// A straight member between two points (brackets, truss chords).
export function beam(mat, a, b, h = 0.2, w = 0.2) {
  const f = frame(a, b);
  ibox(mat, f.len, h, w, f.mx, f.my, f.mz, f.q);
}

// Handrail from a to b (points at walking-surface height). May slope.
export function rail(a, b, collide = true) {
  const f = frame(a, b);
  if (f.len < 0.05) return;
  ibox('rail', f.len, 0.08, 0.08, f.mx, f.my + 1.1, f.mz, f.q);
  ibox('rail', f.len, 0.05, 0.05, f.mx, f.my + 0.55, f.mz, f.q);
  ibox('rail', f.len, 0.14, 0.03, f.mx, f.my + 0.08, f.mz, f.q);     // toe board
  const n = Math.max(1, Math.round(f.len / 2.5));
  for (let i = 0; i <= n; i++) { const t = i / n; ibox('rail', 0.08, 1.1, 0.08, a[0] + f.dx * t, a[1] + f.dy * t + 0.55, a[2] + f.dz * t, f.qy); }
  if (collide) cbox(f.len, 1.2, 0.1, f.mx, f.my + 0.6, f.mz, f.q);
}

// Rail along one axis with openings. axis 'x': runs in x at z = c.
export function railRun(axis, c, from, to, y, gaps = []) {
  const seg = (a, b) => { if (b - a > 0.2) rail(axis === 'x' ? [a, y, c] : [c, y, a], axis === 'x' ? [b, y, c] : [c, y, b]); };
  let cur = from;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > cur) seg(cur, Math.min(g0, to)); cur = Math.max(cur, g1); }
  if (cur < to) seg(cur, to);
}

// Open-tread stair from a (bottom) to b (top). Collides as a smooth ramp.
export function stair(a, b, width, rails = [true, true]) {
  const f = frame(a, b);
  const n = new THREE.Vector3(0, 1, 0).applyQuaternion(f.q);
  cbox(f.len, 0.3, width, f.mx - n.x * 0.15, f.my - n.y * 0.15, f.mz - n.z * 0.15, f.q);
  const steps = Math.max(2, Math.round(f.dy / 0.19)), rise = f.dy / steps, run = f.hl / steps;
  const ux = f.dx / f.hl, uz = f.dz / f.hl;
  for (let i = 0; i < steps; i++) {
    const s = (i + 0.5) * run;
    ibox('iron', run * 0.92, 0.05, width, a[0] + ux * s, a[1] + (i + 0.5) * rise, a[2] + uz * s, f.qy);
  }
  for (const [k, sg] of [[0, -1], [1, 1]]) {
    const ox = -uz * width / 2 * sg, oz = ux * width / 2 * sg;
    ibox('iron', f.len, 0.36, 0.1, f.mx + ox, f.my - 0.14, f.mz + oz, f.q);
    if (rails[k]) rail([a[0] + ox, a[1], a[2] + oz], [b[0] + ox, b[1], b[2] + oz]);
  }
}

// Gas lamp on a post. The bulbs are what let you read distance in the haze.
export function lamp(x, y, z) {
  ibox('rail', 0.1, 2.6, 0.1, x, y + 1.3, z);
  icyl('rail', 0.32, 0.05, x, y + 3.04, z); icyl('rail', 0.07, 0.16, x, y + 3.14, z);
  icyl('rail', 0.2, 0.05, x, y + 2.55, z);
  isph('bulb', 0.19, x, y + 2.8, z);
}

// Thin see-through cage panel (axis-aligned), with collision.
export function cagePanel(x0, x1, y0, y1, z0, z1) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const w = alongX ? x1 - x0 : z1 - z0, hgt = y1 - y0;
  const g = new THREE.PlaneGeometry(w, hgt); scaleUV(g, w / 2, hgt / 2);
  if (!alongX) g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, MAT.lattice);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); G.scene.add(m);
  cbox(alongX ? w : 0.1, hgt, alongX ? 0.1 : w, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
