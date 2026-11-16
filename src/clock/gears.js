// Gear geometry, colliders, and the phase maths that keeps meshing teeth interleaved.
//
// Wheels are modelled the way big cast wheels are made: a toothed rim, a thinner
// web cut into tapered spokes with filleted corners, and a proud hub. Teeth are
// true involutes (20 degree pressure angle), so meshing pairs roll cleanly.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, MAT, QX } from '../kit.js';

const TAU = Math.PI * 2, PA = 20 * Math.PI / 180;
const pol = (r, a) => new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));
const qz = (a) => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });
const inv = (a) => Math.tan(a) - a;

// N teeth, module m (pitch diameter = m*N), face width t. Tooth 0 points along +x.
export function spec(N, m, t, o = {}) {
  const r = m * N / 2, rr = r - 1.25 * m, spokes = o.spokes || 0;
  const rimIn = o.rimIn || (spokes ? rr - Math.max(1.6, m * 2.2) : rr - Math.max(0.9, m * 1.3));
  const hubR = o.hubR || (spokes ? Math.max(2.2, r * 0.15) : Math.max(1.8, r * 0.3));
  return {
    N, m, t, r, ra: r + m, rr, rb: r * Math.cos(PA), pa: TAU / N, spokes,
    spokeW: o.spokeW || Math.min(2.6, m * 2.4), hubR, rimIn,
    recess: !spokes && rimIn - hubR > 0.8,          // solid pinions still get a dished face
  };
}

// How far a wheel's hub stands out from its middle: proud of the rim on both faces, by at most 0.3 m.
export const hubHalf = (s) => Math.min(s.t * 0.64, s.t / 2 + 0.3);

// Involute tooth outline, counter-clockwise.
export function gearOutline(s) {
  const { N, m, ra, rr, rb, pa } = s, pts = [], nF = 6;
  const r0 = Math.max(rb, rr + 0.25 * m);
  const half = (rho) => Math.PI / (2 * N) + inv(PA) - inv(Math.acos(Math.min(1, rb / rho))) - 0.035 * pa;
  const h0 = half(r0), flank = [];
  for (let i = 0; i <= nF; i++) { const rho = r0 + (ra - r0) * i / nF; flank.push([rho, Math.max(0.012 * pa, half(rho))]); }
  for (let k = 0; k < N; k++) {
    const c = k * pa;
    pts.push(pol(rr, c - pa / 2), pol(rr, c - (h0 + 0.07 * pa)), pol(rr + 0.1 * m, c - (h0 + 0.028 * pa)));
    for (let i = 0; i <= nF; i++) pts.push(pol(flank[i][0], c - flank[i][1]));
    pts.push(pol(ra, c));
    for (let i = nF; i >= 0; i--) pts.push(pol(flank[i][0], c + flank[i][1]));
    pts.push(pol(rr + 0.1 * m, c + (h0 + 0.028 * pa)), pol(rr, c + (h0 + 0.07 * pa)));
  }
  return pts;
}

// Escape wheel: pointed teeth with a steep leading face and a hollowed back.
// It turns toward decreasing angle.
export function escapeSpec(R, N, depth, t) {
  const rr = R - depth;
  return { N, t, R, rr, depth, pa: TAU / N, spokes: 5, spokeW: 2.0, hubR: 2.6, rimIn: rr - 1.8, recess: false };
}
export function escapeOutline(s) {
  const pts = [];
  for (let k = 0; k < s.N; k++) {
    const c = k * s.pa;
    pts.push(pol(s.rr, c - 0.07 * s.pa), pol(s.R, c), pol(s.R - 0.12, c + 0.035 * s.pa));
    for (let i = 1; i <= 6; i++) { const u = i / 6; pts.push(pol(s.rr + (s.R - 0.12 - s.rr) * Math.pow(1 - u, 2.2), c + (0.035 + 0.7 * u) * s.pa)); }
  }
  return pts;
}

// Openings between spokes: a rounded rectangle laid out in polar coordinates.
function spokeHoles(shape, s, rIn, rOut) {
  const S = s.spokes, halfA = Math.PI / S, rm = (rIn + rOut) / 2, hr = (rOut - rIn) / 2;
  const width = (rho) => s.spokeW * (1 + 0.35 * (rOut - rho) / (rOut - rIn));     // spokes thicken toward the hub
  const A = (rho) => halfA - Math.asin(Math.min(0.95, width(rho) / 2 / rho));
  const cr = Math.min(1.3, hr * 0.45, rm * A(rm) * 0.45), cv = cr / hr;
  const cuAt = (rho) => Math.min(0.95, cr / (rho * A(rho)));
  const cuO = cuAt(rOut - cr), cuI = cuAt(rIn + cr);
  for (let i = 0; i < S; i++) {
    const mid = (i + 0.5) * TAU / S, p = [];
    const add = (u, v) => { const rho = rm + v * hr; p.push(pol(rho, mid + u * A(rho))); };
    const corner = (su, sv, cu, a0) => { for (let j = 0; j <= 5; j++) { const th = a0 + j / 5 * Math.PI / 2; add(su * (1 - cu) + cu * Math.cos(th), sv * (1 - cv) + cv * Math.sin(th)); } };
    corner(1, -1, cuI, -Math.PI / 2);
    corner(1, 1, cuO, 0);
    for (let j = 1; j < 14; j++) add((1 - cuO) * (1 - 2 * j / 14), 1);
    corner(-1, 1, cuO, Math.PI / 2);
    corner(-1, -1, cuI, Math.PI);
    for (let j = 1; j < 5; j++) add(-(1 - cuI) * (1 - 2 * j / 5), -1);
    shape.holes.push(new THREE.Path(p));
  }
}

// Give a turned (lathe) part the same metre-scaled UVs the extruded parts have.
export function planarUV(g) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + p.getZ(i) * 0.5, p.getY(i) + p.getZ(i) * 0.5);
  return g;
}

export function extrude(shape, t, bevel = 0.1, curveSegments = 10, bevelSegments = 1) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: t - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments, curveSegments,
  });
  g.translate(0, 0, -(t - 2 * bevel) / 2);
  return g;
}

// Rim + web + hub merged into one mesh, with smooth normals across curved faces.
export function gearGeometry(s, outline) {
  const parts = [], cs = (R) => Math.min(220, Math.max(48, Math.round(R * 5)));
  const cut = s.spokes > 0 || s.recess;
  const rim = new THREE.Shape(outline || gearOutline(s));
  if (cut) rim.holes.push(new THREE.Path().absarc(0, 0, s.rimIn, 0, TAU, true));
  parts.push(extrude(rim, s.t, Math.min(0.09, 0.3 * (s.m || 1)), cs(s.rimIn), 2));
  if (cut) {
    const web = new THREE.Shape().absarc(0, 0, s.rimIn + 0.25, 0, TAU, false);
    if (s.spokes) spokeHoles(web, s, s.hubR + 0.5, s.rimIn - 0.45);
    parts.push(extrude(web, s.t * (s.spokes ? 0.5 : 0.68), 0.06, cs(s.rimIn), 1));
    const h = hubHalf(s), c = Math.min(0.22, h * 0.3), R = s.hubR;
    parts.push(planarUV(new THREE.LatheGeometry([[0.01, -h], [R - c, -h], [R, -h + c], [R, h - c], [R - c, h], [0.01, h]].map(p => new THREE.Vector2(p[0], p[1])), 56).rotateX(Math.PI / 2)));
  }
  const merged = mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)));
  return toCreasedNormals(merged, 0.7);
}

// A straight bevel gear. Its teeth lie on a cone whose point is where the two shafts' axes meet, and
// every section of a tooth is the same involute, smaller the nearer that point. The point is at the
// origin and the gear's body lies along -z; r is the pitch radius at the large end, cone the pitch half-angle.
export function bevelGeometry(N, r, face, cone, hubR = 0.5 * r, hubLen = 0.6 * r) {
  const s = spec(N, 2 * r / N, 1), out = gearOutline(s), D0 = r / Math.sin(cone), k1 = (D0 - face) / D0, cs = Math.cos(cone), sn = Math.sin(cone);
  const at = (v, k) => { const rho = v.length(), h = rho - r, f = (r + h * cs) / rho * k; return [v.x * f, v.y * f, (h * sn - D0 * cs) * k]; };
  const pos = [], tri = (a, b, c) => pos.push(...a, ...b, ...c);
  out.forEach((v, i) => { const w = out[(i + 1) % out.length]; tri(at(v, 1), at(w, 1), at(w, k1)); tri(at(v, 1), at(w, k1), at(v, k1)); });
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(out, [])) { tri(at(out[c], 1), at(out[b], 1), at(out[a], 1)); tri(at(out[a], k1), at(out[b], k1), at(out[c], k1)); }
  const teeth = new THREE.BufferGeometry();
  teeth.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  teeth.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  teeth.computeVertexNormals();
  const zb = -D0 * cs - 1.25 * s.m * sn;                              // the back of the large end, at the roots
  const hub = new THREE.CylinderGeometry(hubR, hubR, hubLen, 32).rotateX(Math.PI / 2).translate(0, 0, zb - hubLen / 2 + 0.03).toNonIndexed();
  return toCreasedNormals(mergeGeometries([teeth, hub]), 0.7);
}

// A worm: a screw thread turned on a shaft. Axis along z, centred on the origin, with a crest at angle 0
// there. rp is its pitch radius, m the module of the wheel it drives; hand = 1 for a right-hand thread.
// The thread runs out into the shaft over its last turn at each end.
export function wormGeometry(rp, m, length, hand = 1) {
  const p = Math.PI * m, rr = rp - 1.25 * m, ra = rp + m, w0 = p / 4 + 1.25 * m * Math.tan(PA), w1 = Math.max(0.02, p / 4 - m * Math.tan(PA));
  const turns = length / p, n = Math.round(turns * 40), pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = (u - 0.5) * turns * TAU, z = hand * p * a / TAU, f = Math.min(1, Math.min(u, 1 - u) * turns), top = rr + (ra - rr) * f * f * (3 - 2 * f), c = Math.cos(a), sn = Math.sin(a);
    for (const [r, dz] of [[rr - 0.03, -w0], [top, -w1], [top, w1], [rr - 0.03, w0]]) pos.push(r * c, r * sn, z + dz);
    if (i < n) for (let j = 0; j < 3; j++) { const q = i * 4 + j; idx.push(q, q + 4, q + 1, q + 1, q + 4, q + 5); }
  }
  let thread = new THREE.BufferGeometry();
  thread.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); thread.setIndex(idx);
  thread = thread.toNonIndexed();
  thread.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(thread.attributes.position.count * 2), 2));
  thread.computeVertexNormals();
  const core = new THREE.CylinderGeometry(rr, rr, length + 0.5, 40).rotateX(Math.PI / 2).toNonIndexed();
  return toCreasedNormals(mergeGeometries([thread, core]), 0.5);
}

// ---------------------------------------------------------------- colliders
// Solid primitives rather than a hollow trimesh: nothing can get inside a tooth.
function rimSpokesHub(rotor, s, z, rOuter) {
  const R = G.R, hz = s.t / 2;
  if (!s.spokes) { rotor.addCollider(R.ColliderDesc.cylinder(hz, rOuter).setRotation(QX).setTranslation(0, 0, z)); return; }
  const nSeg = Math.min(48, Math.max(16, Math.round(TAU * rOuter / 4)));
  const rm = (rOuter + s.rimIn) / 2, hx = (rOuter - s.rimIn) / 2 + 0.05, hy = rm * Math.tan(Math.PI / nSeg) + 0.2;
  for (let j = 0; j < nSeg; j++) {
    const a = (j + 0.5) * TAU / nSeg;
    rotor.addCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(rm * Math.cos(a), rm * Math.sin(a), z).setRotation(qz(a)));
  }
  const sm = (s.rimIn + s.hubR) / 2, sl = (s.rimIn - s.hubR) / 2 + 0.3;
  for (let i = 0; i < s.spokes; i++) {
    const a = i * TAU / s.spokes;
    rotor.addCollider(R.ColliderDesc.cuboid(sl, s.spokeW / 2, hz).setTranslation(sm * Math.cos(a), sm * Math.sin(a), z).setRotation(qz(a)));
  }
  rotor.addCollider(R.ColliderDesc.cylinder(hubHalf(s), s.hubR).setRotation(QX).setTranslation(0, 0, z));      // the hub stands proud of the rim on both faces
}

export function addGearColliders(rotor, s, z) {
  const R = G.R, hz = s.t / 2;
  const rm = (s.ra + s.rr) / 2, hl = (s.ra - s.rr) / 2 + 0.1, hw = 0.2 * s.pa * s.r;
  for (let k = 0; k < s.N; k++) {
    const a = k * s.pa;
    rotor.addCollider(R.ColliderDesc.cuboid(hl, hw, hz).setTranslation(rm * Math.cos(a), rm * Math.sin(a), z).setRotation(qz(a)));
  }
  rimSpokesHub(rotor, s, z, s.rr + 0.05);
}

export function addEscapeColliders(rotor, s, z) {
  const R = G.R, hz = s.t / 2, rm = s.R - s.depth / 2;
  for (let k = 0; k < s.N; k++) {
    const a = k * s.pa + 0.2 * s.pa;
    rotor.addCollider(R.ColliderDesc.cuboid(s.depth / 2, 0.55, hz).setTranslation(rm * Math.cos(a), rm * Math.sin(a), z).setRotation(qz(a - 0.35)));
  }
  rimSpokesHub(rotor, s, z, s.rr + 0.05);
}

// Rotation offset for gear 2 so its gaps meet gear 1's teeth.
// beta: direction from gear 1's centre to gear 2's. If gear 1 sits at angle a1,
// gear 2 sits at -a1*N1/N2 + meshOffset.
export function meshOffset(beta, N1, N2) {
  return beta + Math.PI + Math.PI / N2 + beta * N1 / N2;
}

// ---------------------------------------------------------------- fasteners
// Small detail that tells the eye how big the wheel is.
const RIVET = new THREE.SphereGeometry(1, 10, 6);
// A nut on its stud: washer, hexagon with both faces chamfered, and the domed end of the stud
// standing through it. Radius 1 across the corners, axis along z, seated at z = -0.5.
export const NUT = (() => {
  const hex = new THREE.Shape();
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6, x = Math.cos(a), y = Math.sin(a); if (i) hex.lineTo(x, y); else hex.moveTo(x, y); }
  hex.closePath();
  const body = new THREE.ExtrudeGeometry(hex, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.11, bevelSize: 0.13, bevelOffset: -0.13, bevelSegments: 2, curveSegments: 1 }).translate(0, 0, -0.27);
  const washer = new THREE.CylinderGeometry(1.26, 1.26, 0.12, 24).rotateX(Math.PI / 2).translate(0, 0, -0.44);
  const collar = new THREE.CylinderGeometry(0.86, 0.9, 0.08, 20).rotateX(Math.PI / 2).translate(0, 0, 0.3);
  const stud = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16).rotateX(Math.PI / 2).translate(0, 0, 0.47);
  const dome = new THREE.SphereGeometry(0.5, 16, 6, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.5).translate(0, 0, 0.62);
  return toCreasedNormals(mergeGeometries([body, washer, collar, stud, dome].map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; })), 0.6);
})();
const HEX = NUT;
function ring(geo, mat, parent, radius, count, halfT, sc, phase) {
  const im = new THREE.InstancedMesh(geo, mat, count * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3();
  let i = 0;
  for (const sg of [1, -1]) for (let k = 0; k < count; k++) {
    const a = phase + k * TAU / count;
    im.setMatrixAt(i++, m.compose(p.set(radius * Math.cos(a), radius * Math.sin(a), sg * halfT), q, sc));
  }
  im.instanceMatrix.needsUpdate = true;
  parent.add(im);
  return im;
}
export function rivetRing(parent, radius, count, halfT, size = 0.16, phase = 0) {
  return ring(RIVET, MAT.rivet, parent, radius, count, halfT, new THREE.Vector3(size, size, size * 0.6), phase);
}
export function boltCircle(parent, radius, count, halfT, size = 0.24) {
  return ring(HEX, MAT.steel, parent, radius, count, halfT, new THREE.Vector3(size, size, size * 1.1), 0.2);
}
