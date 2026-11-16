// Build kit: materials, procedural textures (colour + normal + roughness),
// instanced primitives, and the walkway / railing / stair helpers that give
// the tower its human scale.
import * as THREE from 'three';
import { initSurfaces } from './surface/generate.js';
import { surface } from './surface/material.js';

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

  // ---- fine cast-metal normal for the turntable faces
  TEX.micro = tex(normalFrom(fbm(512, 64, 3, 34), 512, 2.0), { srgb: false, repeat: 1 / 1.1 });

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
  // Generated surfaces (see surface/): colour is the tint of the metal or the paint.
  // Colour is the tint of the metal or the paint. This is a clock that is looked after:
  // the castings are enamelled and lined, the brass is dull rather than tarnished, and
  // nothing is rusting. `age` is the slow dulling that comes in patches metres across;
  // `weather` (corrosion that breaks out in spots and runs down) is there for a part that
  // should look neglected, and nothing here uses it.
  const dull = [0.8, 0.72, 0.62, 0.22];                           // brass a season after its last polish
  MAT.brass = surface('brass', { color: 0xcfa650, age: dull, macro: [0.06, 0.08, 0.35, 0.1] });
  MAT.bronze = surface('brass', { color: 0x8f6c38, roughness: 1.2, p: [0.5, 0, 0, 0], seed: 1, age: dull, macro: [0.07, 0.08, 0.5, 0.12] });
  MAT.copper = surface('brass', { color: 0xc46a3c, p: [0.2, 0, 0, 0], seed: 2, age: [0.78, 0.72, 0.66, 0.2], macro: [0.06, 0.08, 0.12, 0.12] });
  MAT.steel = surface('steel', { color: 0x9aa0a8, age: [0.82, 0.78, 0.74, 0.15], macro: [0.06, 0.08, 0.6, 0.1] });
  // cast iron in the works' green enamel with gold lining; railings and small fittings in black
  MAT.iron = surface('iron', { color: 0x1f5245, roughness: 0.8, lining: 0xc9a24a, age: [0.85, 0.85, 0.82, 0.12], macro: [0.06, 0.06, 0.5, 0.1] });
  MAT.rail = surface('iron', { color: 0x17191c, roughness: 0.75, seed: 1, macro: [0.05, 0.06, 0.8, 0.08] });
  MAT.tendon = S({ color: 0x0c0d0f, roughness: 0.38, metalness: 0.15 });                                // carbon-fibre tendons: what the heavy loads hang on
  MAT.rivet = surface('brass', { color: 0x8a6f40, p: [0.5, 0, 0, 0], seed: 3 });
  MAT.handrail = surface('brass', { color: 0xc9983f, roughness: 0.8, seed: 4, macro: [0.05, 0.06, 0.8, 0.05] });       // polished by hands
  MAT.brick = surface('brick', { macro: [0.14, 0.06, 0.22, 0.12], wall: [0.1, 1.2, 0.35, 0.18], age: [0.75, 0.75, 0.76, 0.3] });
  MAT.stone = surface('stone', { macro: [0.12, 0.06, 0.3, 0.12], wall: [0.15, 0.8, 0, 0] });
  MAT.plate = surface('plate', { macro: [0.12, 0.12, 0.13, 0.4], age: [0.8, 0.76, 0.72, 0.2] });
  MAT.grate = S({ map: TEX.grate, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.85 });
  MAT.lattice = S({ map: TEX.lattice, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.8 });
  MAT.turntable = S({ map: TEX.turntable, metalness: 0.9, roughness: 0.5, normalMap: TEX.micro, normalScale: v2(0.3) });
  MAT.slate = S({ color: 0x25282d, roughness: 0.8, metalness: 0.2 });
  MAT.ground = surface('stone', { color: 0x7d766c, macro: [0.16, 0.06, 0.05, 0.3] });      // the streets and the square: stone setts
  MAT.city = S({ map: TEX.facade, emissive: 0xffffff, emissiveMap: TEX.facadeLit, emissiveIntensity: 1.1, roughness: 0.95 });
  MAT.dial = S({ color: 0x6a5f4c, map: TEX.dial, emissive: 0xffffff, emissiveMap: TEX.dial, emissiveIntensity: 1.0, roughness: 0.45, side: THREE.DoubleSide });
  MAT.shadow = new THREE.MeshBasicMaterial({ color: 0x150f09, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
  MAT.bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.8, 0.62), fog: false });
  MAT.window = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.85, 0.35) });
  MAT.fire = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.1, 0.25) });
}

export function initKit(scene, world, RAPIER, renderer) {
  G.scene = scene; G.world = world; G.R = RAPIER;
  initSurfaces(renderer);
  makeTextures(); makeMaterials();
}

// ------------------------------------------------------ instanced primitives
// A stair tread: a unit box whose top and bottom carry a strip of the tread-plate
// texture at true scale (0.28 m of run, mirrored about the centre line across the width).
function treadGeo() {
  const g = new THREE.BoxGeometry(1, 1, 1, 1, 1, 2), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, 0.1 + (p.getX(i) + 0.5) * 0.07, 0.06 + Math.abs(p.getZ(i)) * 0.76);
    else uv.setXY(i, 0.11, 0.2);                                   // edges: plain metal
  }
  return g;
}
// A unit box with every edge chamfered. Each corner has three vertices, one per face it
// touches, all at the corner; the material's vertex shader pulls each one back along the
// other two axes by a fixed distance in metres (see surface/material.js), so the chamfer
// stays the same width however the box is stretched. The vertices keep their face's
// normal, so light rolls round the edge instead of snapping from one face to the next.
function chamferBoxGeo() {
  const pos = [], nor = [], bev = [], idx = [];
  const corner = (c) => ((c[0] > 0 ? 1 : 0) | (c[1] > 0 ? 2 : 0) | (c[2] > 0 ? 4 : 0));
  const id = (c, axis) => corner(c) * 3 + axis;
  for (let k = 0; k < 8; k++) {
    const c = [k & 1 ? 1 : -1, k & 2 ? 1 : -1, k & 4 ? 1 : -1];
    for (let a = 0; a < 3; a++) {
      pos.push(c[0] / 2, c[1] / 2, c[2] / 2);
      nor.push(a === 0 ? c[0] : 0, a === 1 ? c[1] : 0, a === 2 ? c[2] : 0);
      bev.push(a === 0 ? 0 : c[0], a === 1 ? 0 : c[1], a === 2 ? 0 : c[2]);
    }
  }
  // where a vertex ends up with a nominal chamfer, used only to get the winding right
  const at = (i) => new THREE.Vector3(pos[i * 3] - bev[i * 3] * 0.1, pos[i * 3 + 1] - bev[i * 3 + 1] * 0.1, pos[i * 3 + 2] - bev[i * 3 + 2] * 0.1);
  const tri = (a, b, c) => {
    const A = at(a), B = at(b), C = at(c), n = B.clone().sub(A).cross(C.clone().sub(A));
    if (n.dot(A.add(B).add(C)) < 0) idx.push(a, c, b); else idx.push(a, b, c);
  };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    for (const s of [-1, 1]) {                                           // faces
      const v = (sb, sc) => { const p = [0, 0, 0]; p[a] = s; p[b] = sb; p[c] = sc; return id(p, a); };
      quad(v(-1, -1), v(1, -1), v(1, 1), v(-1, 1));
    }
    for (const sb of [-1, 1]) for (const sc of [-1, 1]) {                // edges running along axis a
      const v = (sa, axis) => { const p = [0, 0, 0]; p[a] = sa; p[b] = sb; p[c] = sc; return id(p, axis); };
      quad(v(-1, b), v(1, b), v(1, c), v(-1, c));
    }
  }
  for (let k = 0; k < 8; k++) tri(k * 3, k * 3 + 1, k * 3 + 2);          // corners
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('sfBevel', new THREE.Float32BufferAttribute(bev, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(48), 2));
  g.setIndex(idx);
  return g;
}
const UNIT = {
  box: chamferBoxGeo(),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 48),
  sph: new THREE.SphereGeometry(1, 16, 12),
  // light versions for the thousands of small parts in railings, stairs and lamps
  tube: new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateZ(Math.PI / 2),   // lies along x, open ends
  rod: new THREE.CylinderGeometry(1, 1, 1, 10),                                  // stands on y
  knob: new THREE.IcosahedronGeometry(1, 1),
  stud: new THREE.IcosahedronGeometry(1, 0),
  cone: new THREE.ConeGeometry(1, 1, 12),
  tread: treadGeo(),
};
const batches = new Map();
// Nothing fitted by hand is exact. Every part is set a few millimetres and a fraction of
// a degree off true (less for long parts, so their ends still meet what they are fixed to).
const wob = () => (rnd() - 0.5) * 2, _q = new THREE.Quaternion(), _qj = new THREE.Quaternion(), _ej = new THREE.Euler();
function push(kind, mat, sx, sy, sz, x, y, z, q) {
  const key = kind + ':' + mat;
  let b = batches.get(key);
  if (!b) batches.set(key, b = { geo: UNIT[kind], mat, list: [] });
  const tilt = Math.min(0.012, 0.008 / Math.max(sx, sy, sz));
  _q.copy(q || QID).multiply(_qj.setFromEuler(_ej.set(wob() * tilt, wob() * tilt, wob() * tilt)));
  b.list.push(new THREE.Matrix4().compose(_p.set(x + wob() * 0.003, y + wob() * 0.002, z + wob() * 0.003), _q, _s.set(sx, sy, sz)));
}
export const ibox = (mat, sx, sy, sz, x, y, z, q) => push('box', mat, sx, sy, sz, x, y, z, q);
export const icyl = (mat, r, h, x, y, z, q) => push('cyl', mat, r, h, r, x, y, z, q);
export const isph = (mat, r, x, y, z) => push('sph', mat, r, r, r, x, y, z);
const irod = (mat, r, h, x, y, z) => push('rod', mat, r, h, r, x, y, z);        // vertical, centred on y
export const iknob = (mat, r, x, y, z) => push('knob', mat, r, r, r, x, y, z);

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
  const m = new THREE.Mesh(boxGeo(sx, sy, sz, tile).translate(x, y, z), material); G.scene.add(m);   // position baked in: surfaces are laid out in world space
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

// A round bar between two points.
export function tube(mat, a, b, r) {
  const f = frame(a, b);
  push('tube', mat, f.len, r, r, f.mx, f.my, f.mz, f.q);
}

// A turned baluster: foot, shaft, a knuckle where the mid rail passes and a ball under the hand.
function baluster(x, y, z) {
  irod('rail', 0.05, 0.06, x, y + 0.03, z);
  irod('rail', 0.024, 1.06, x, y + 0.55, z);
  iknob('rail', 0.042, x, y + 0.58, z);
  iknob('handrail', 0.056, x, y + 1.1, z);
}
// The heavier post that starts and ends a flight of stairs.
function newel(x, y, z) {
  irod('rail', 0.09, 0.1, x, y + 0.05, z);
  irod('rail', 0.045, 1.16, x, y + 0.62, z);
  iknob('rail', 0.07, x, y + 0.6, z);
  iknob('handrail', 0.09, x, y + 1.24, z);
}

// Handrail from a to b (points at walking-surface height). May slope.
export function rail(a, b, collide = true) {
  const f = frame(a, b);
  if (f.len < 0.05) return;
  ibox('rail', f.len, 0.12, 0.012, f.mx, f.my + 0.07, f.mz, f.q);     // kick plate
  const n = Math.max(1, Math.round(f.len / 1.7)), at = (i, h) => [a[0] + f.dx * i / n, a[1] + f.dy * i / n + h, a[2] + f.dz * i / n];
  for (let i = 0; i <= n; i++) {
    baluster(...at(i, 0));
    // the rails come in lengths that run from one baluster to the next, so they kink a little at each
    if (i < n) { tube('handrail', at(i, 1.1), at(i + 1, 1.1), 0.035); tube('rail', at(i, 0.58), at(i + 1, 0.58), 0.02); }
  }
  if (collide) cbox(f.len, 1.2, 0.1, f.mx, f.my + 0.6, f.mz, f.q);
}

// Rail along one axis with openings. axis 'x': runs in x at z = c.
export function railRun(axis, c, from, to, y, gaps = []) {
  const seg = (a, b) => { if (b - a > 0.2) rail(axis === 'x' ? [a, y, c] : [c, y, a], axis === 'x' ? [b, y, c] : [c, y, b]); };
  let cur = from;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > cur) seg(cur, Math.min(g0, to)); cur = Math.max(cur, g1); }
  if (cur < to) seg(cur, to);
}

// Stair from a (bottom) to b (top): tread-plate steps with a worn nosing, carried on
// brackets between two riveted channel stringers. Collides as a smooth ramp.
export function stair(a, b, width, rails = [true, true]) {
  const f = frame(a, b);
  const n = new THREE.Vector3(0, 1, 0).applyQuaternion(f.q);           // normal to the slope
  cbox(f.len, 0.3, width, f.mx - n.x * 0.15, f.my - n.y * 0.15, f.mz - n.z * 0.15, f.q);
  const steps = Math.max(2, Math.round(f.dy / 0.19)), rise = f.dy / steps, run = f.hl / steps;
  const ux = f.dx / f.hl, uz = f.dz / f.hl, px = -uz, pz = ux;         // along the flight, and across it
  const half = width / 2;
  for (let i = 0; i < steps; i++) {
    const s = (i + 0.5) * run, cx = a[0] + ux * s, cz = a[2] + uz * s, top = a[1] + (i + 0.5) * rise;
    push('tread', 'plate', run + 0.03, 0.035, width - 0.08, cx, top - 0.0175, cz, f.qy);
    const nx = cx - ux * run * 0.5, nz = cz - uz * run * 0.5, e = half - 0.05;
    tube('steel', [nx - px * e, top - 0.004, nz - pz * e], [nx + px * e, top - 0.004, nz + pz * e], 0.022);   // nosing
    for (const sg of [-1, 1]) {
      ibox('iron', run * 0.8, 0.05, 0.05, cx + px * sg * (half - 0.065), top - 0.06, cz + pz * sg * (half - 0.065), f.qy);   // bracket
      for (const u of [-0.07, 0.07])                                   // the two bolts that hold this tread's bracket to the stringer
        push('stud', 'rivet', 0.016, 0.016, 0.016, cx + ux * u + px * sg * (half + 0.014), top - 0.06 + f.dy / f.hl * u, cz + uz * u + pz * sg * (half + 0.014));
    }
  }
  for (const [k, sg] of [[0, -1], [1, 1]]) {
    const ox = px * half * sg, oz = pz * half * sg;
    const wx = f.mx + ox - n.x * 0.13, wy = f.my - n.y * 0.13, wz = f.mz + oz - n.z * 0.13;       // centre of the stringer's web
    // the stringer is rolled channel in lengths of about five metres, joined by riveted splice plates
    const m = Math.max(1, Math.round(f.len / 5)), sl = f.len / m, dx = f.dx / f.len, dy = f.dy / f.len, dz = f.dz / f.len;
    for (let k = 0; k < m; k++) {
      const t = (k + 0.5) * sl - f.len / 2, cx = wx + dx * t, cy = wy + dy * t, cz = wz + dz * t;
      ibox('iron', sl - 0.006, 0.34, 0.025, cx, cy, cz, f.q);
      for (const fl of [-1, 1]) ibox('iron', sl - 0.006, 0.03, 0.11, cx + px * sg * 0.045 + n.x * fl * 0.17, cy + n.y * fl * 0.17, cz + pz * sg * 0.045 + n.z * fl * 0.17, f.q);
      if (!k) continue;
      const j = t - sl / 2, jx = wx + dx * j + px * sg * 0.022, jy = wy + dy * j, jz = wz + dz * j + pz * sg * 0.022;
      ibox('iron', 0.46, 0.25, 0.018, jx, jy, jz, f.q);
      for (const u of [-0.16, -0.06, 0.06, 0.16]) for (const v of [-0.08, 0.08])
        push('stud', 'rivet', 0.02, 0.02, 0.02, jx + dx * u + n.x * v + px * sg * 0.012, jy + dy * u + n.y * v, jz + dz * u + n.z * v + pz * sg * 0.012);
    }
    if (rails[k]) {
      rail([a[0] + ox, a[1], a[2] + oz], [b[0] + ox, b[1], b[2] + oz]);
      newel(a[0] + ox, a[1], a[2] + oz); newel(b[0] + ox, b[1], b[2] + oz);
    }
  }
}

// Gas lamp: a turned post carrying a caged lantern under a hood.
// The bulbs are what let you read distance in the haze.
export function lamp(x, y, z) {
  irod('rail', 0.12, 0.16, x, y + 0.08, z);
  irod('rail', 0.075, 0.5, x, y + 0.41, z);
  iknob('rail', 0.095, x, y + 0.68, z);
  irod('rail', 0.038, 1.78, x, y + 1.57, z);
  iknob('handrail', 0.066, x, y + 2.46, z);
  irod('rail', 0.2, 0.03, x, y + 2.53, z);                             // lantern floor
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) irod('rail', 0.012, 0.52, x + dx * 0.13, y + 2.8, z + dz * 0.13);
  isph('bulb', 0.15, x, y + 2.8, z);
  push('cone', 'rail', 0.27, 0.2, 0.27, x, y + 3.16, z);               // hood
  iknob('handrail', 0.04, x, y + 3.28, z);
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
