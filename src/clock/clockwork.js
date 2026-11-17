// The movement. A real pendulum, hung from a suspension spring, is integrated every physics step. A gravity
// escapement lets the escape wheel turn a sixth of a turn on each beat and gives the pendulum its impulse by the
// fall of a weighted arm; the escape wheel's angle then drives every other wheel, and finally the hands, through
// true gear ratios.
import * as THREE from 'three';
import { G, MAT, QX, ibox, icyl, sbox, beam, deck, rail, stair, lamp } from '../kit.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { spec, gearGeometry, escapeSpec, escapeOutline, extrude, planarUV, addGearColliders, addEscapeColliders, meshOffset, rivetRing, boltCircle, NUT, bevelGeometry, wormGeometry, hubHalf } from './gears.js';
import { DEG, GRAV, PEND, ESC, ARBOR, LAYER, DIAL, LEVELS, LIFT, FLOOR, TOWER, SHAFT, CRANK, WIND, GESC } from '../layout.js';
import { assembly, SECTION, MATERIAL, WIND_Q } from '../structure/model.js';
import { wheelMass, cylinderMass } from '../structure/masses.js';

const TAU = Math.PI * 2;
const ZAXIS = new THREE.Vector3(0, 0, 1);
const QFLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); // local z -> world up
const _w = new THREE.Vector3();

// A kinematic body that turns about one axis. Meshes hang off `group`.
class Rotor {
  constructor(x, y, z, base = null) {
    this.center = new THREE.Vector3(x, y, z);
    this.base = base ? base.clone() : new THREE.Quaternion();
    this.axis = ZAXIS.clone().applyQuaternion(this.base);
    this.group = new THREE.Group(); this.group.position.copy(this.center); G.scene.add(this.group); G.machines.push(this.group);
    this.body = G.world.createRigidBody(G.R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    this.q = new THREE.Quaternion(); this.angle = 0; this.omega = 0; this.k = 0; this.c = 0;
  }
  addCollider(desc) { const col = G.world.createCollider(desc, this.body); G.parts.set(col.handle, this); return col; }
  _apply() { this.q.setFromAxisAngle(ZAXIS, this.angle).premultiply(this.base); this.group.quaternion.copy(this.q); }
  init(angle) { this.angle = angle; this.omega = 0; this._apply(); this.body.setRotation(this.q, true); }
  set(angle, dt) { this.omega = (angle - this.angle) / dt; this.angle = angle; this._apply(); this.body.setNextKinematicRotation(this.q); }
  velAt(p, out) { _w.copy(this.axis).multiplyScalar(this.omega); return out.copy(p).sub(this.center).cross(_w).negate(); }
  angVelY() { return this.axis.y * this.omega; }
}

// A kinematic body that translates (lift platforms).
class Mover {
  constructor(mesh, pos) {
    this.mesh = mesh; this.pos = pos.clone(); this.vel = new THREE.Vector3();
    this.body = G.world.createRigidBody(G.R.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z));
    mesh.position.copy(pos); G.scene.add(mesh); G.machines.push(mesh);
  }
  addCollider(desc) { const col = G.world.createCollider(desc, this.body); G.parts.set(col.handle, this); return col; }
  set(p, dt) { this.vel.copy(p).sub(this.pos).divideScalar(dt); this.pos.copy(p); this.mesh.position.copy(p); this.body.setNextKinematicTranslation(p); }
  velAt(p, out) { return out.copy(this.vel); }
  angVelY() { return 0; }
}

// A shaft that only turns in place and carries nobody: no body of its own, just a fixed collider where it is.
class Spinner {
  constructor(p, axis) {
    this.group = new THREE.Group(); this.group.position.copy(p); G.scene.add(this.group); G.machines.push(this.group);
    this.base = new THREE.Quaternion().setFromUnitVectors(ZAXIS, axis); this.q = new THREE.Quaternion(); this.k = 0; this.c = 0;
    this.group.quaternion.copy(this.base);        // (laid along its axis from the start, so that what plans round it sees it where it is)
  }
  set(angle) { this.group.quaternion.copy(this.base).multiply(this.q.setFromAxisAngle(ZAXIS, angle)); }
}
// Set shaft b's phase so that, where its bevel wheel meets a's, a tooth of one faces a gap of the other.
// toA and toB point from where the two axes meet toward each wheel; pitchB is the angle between b's teeth.
function meshBevels(a, toA, b, toB, pitchB) {
  const where = (sh, v) => { const l = v.clone().applyQuaternion(sh.base.clone().invert()); return Math.atan2(l.y, l.x); };
  const tau = (where(a, toB) - a.c) / a.k;                         // how far the drive has turned when a has a tooth on the line of contact
  b.c = where(b, toA) + pitchB / 2 - b.k * tau;
}
const YUP = new THREE.Vector3(0, 1, 0);
function solidCyl(p, q, r) {                                       // a fixed cylinder from p to q
  const d = q.clone().sub(p), L = d.length(), rot = new THREE.Quaternion().setFromUnitVectors(YUP, d.clone().divideScalar(L)), m = p.clone().add(q).multiplyScalar(0.5);
  const c = G.world.createCollider(G.R.ColliderDesc.cylinder(L / 2, r).setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }).setTranslation(m.x, m.y, m.z));
  G.machineFixed.add(c.handle); return c;
}

// Whether the driving weight can keep the clock going: filled in by buildClockwork, read by the structural check.
export const POWER = {};

// What the winding gear is and where, for the engineer who has to hold it up (world/structure.js).
export const WINDGEAR = {};
// The lift, for the clearance check: where a car is d metres round the loop (the point its deck hangs from), one car to
// carry round, the colliders of all the cars, and of the four chain wheels (which only an axle may touch).
export const LIFTGEAR = { wheels: new Set(), own: new Set(), car: null, at: null, loop: 0 };

// What each turning part sweeps as it turns: a disc of its tip radius between two planes (wheels
// and arbors on the going train), or a disc lying on the floor (the floor wheels). Anything fixed
// has to stay out of these, whatever the teeth happen to be doing when it is placed.
export const ENVELOPES = [];

// ---- the hands, designed. Each is a steel lattice spine, two chords `depth` apart (deepest at the root, tapering to the
// tip) and laced together, clad in copper 3 mm thick. The wind on its face is WIND_Q (model.js) with a drag coefficient
// of 1.2 on its outline; the chords are sized for it in mild steel at 110 MPa, rounded up to 1,000 mm2. Across the dial,
// a wind along the wall takes the hand edge on, with a drag coefficient of 2. Each is balanced by a counterpoise inside
// the hall, an iron lens on an iron bar `arm` long. back: the z of the hand's back face. The hour hand stands clear of
// the path of the dial-cleaning cradle (in front of the stone rim, world/tower.js), the minute hand clear of the hour hand.
const HAND_STEEL = 110e6, HAND_E = 205e9, CHORD_MIN = 0.002;
function handDesign(out, back, d0, d1, arm, cz) {
  const tip = Math.max(...out.map(p => p[1])), tail = Math.min(...out.map(p => p[1])), right = out.filter(p => p[0] >= 0).sort((a, b) => a[1] - b[1]);
  const halfW = (y) => { for (let i = 0; i < right.length - 1; i++) { const a = right[i], b = right[i + 1]; if (y >= a[1] && y <= b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]); } return 0; };
  const depth = (y) => (y <= 0 ? d0 : d0 + (d1 - d0) * y / tip), dy = 0.1, ys = [];
  for (let y = tail + dy / 2; y < tip; y += dy) ys.push(y);
  const w = (y) => WIND_Q * 1.2 * 2 * halfW(y);                       // N per metre along the hand, face on
  const M = ys.map(y => ys.reduce((t, e) => t + (y >= 0 ? (e > y ? w(e) * (e - y) : 0) : (e < y ? w(e) * (y - e) : 0)) * dy, 0));
  const Ac = M.map((m, i) => Math.ceil(Math.max(CHORD_MIN, m / (depth(ys[i]) * HAND_STEEL)) / 1e-3) * 1e-3);
  const per = ys.map((y, i) => 2 * Ac[i] * 7850 * 1.4 + (4 * halfW(y) + 2 * depth(y)) * 0.003 * 8960);      // chords and lacing; the copper
  const kg = per.reduce((t, m) => t + m * dy, 0), moment = per.reduce((t, m, i) => t + m * ys[i] * dy, 0);
  const stress = Math.max(...M.map((m, i) => m / (depth(ys[i]) * Ac[i])));
  // deflection of the spine under that wind, built in at the boss
  const defl = []; let slope = 0, d = 0;
  ys.forEach((y, i) => { if (y < 0) { defl.push(0); return; } slope += M[i] / (HAND_E * Ac[i] * depth(y) ** 2 / 2) * dy; d += slope * dy; defl.push(d); });
  const side = WIND_Q * 2.0 * ys.reduce((t, y) => t + depth(y) * y * dy, 0);      // torque about the arbor, wind along the wall
  const barKg = 0.9 * 0.4 * arm * 7200, lensR = 2.4, lensKg = Math.max(0, (moment - barKg * arm / 2) / arm), lensT = lensKg / (7200 * Math.PI * lensR ** 2);
  return { out, back, d0, d1, tip, tail, depth, ys, defl, Mroot: M[ys.findIndex(y => y >= 0)], stress, kg, moment, side, arm, cz, barKg, lensR, lensKg, lensT, ckg: barKg + lensKg, zc: back + d0 / 2 };
}
export const HANDS = {
  minute: handDesign([[-1.2, -10], [1.2, -10], [2.0, -2], [2.4, 6], [1.0, 46], [0, 50], [-1.0, 46], [-2.4, 6], [-2.0, -2]], 48.6, 3.0, 0.4, 9, 31.56),
  hour: handDesign([[-1.6, -8], [1.6, -8], [2.6, 0], [3.6, 18], [1.7, 30], [0, 34], [-1.7, 30], [-3.6, 18], [-2.6, 0]], 45.8, 2.2, 0.4, 8, 37.5),
  pipe: [32.2, 48.0],          // the hour pipe, fabricated of steel plate 50 mm thick, from the hour wheel's hub to the hour hand's front
};
// ---- the driving weight's ropes (WIND.ropes of WIND.ropeD, 6 x 36 with a steel core, 1,960 MPa wire: minimum breaking
// force 0.356 d^2 R, EN 12385-4) and the crib under its fall (WIND.crib)
export const ROPE = (() => {
  const W = cylinderMass(WIND.weightR, WIND.weightH, MATERIAL.castIron) * GRAV, d = WIND.ropeD, n = WIND.ropes;
  const mbl = 0.356 * d * d * 1960e6, pitch = 1.08 * d, turns = (WIND.top - WIND.bottom) / (TAU * WIND.barrelR) + 2;       // two dead turns always on the barrel
  const len = WIND.top - WIND.bottom + 2 * TAU * WIND.barrelR + 12, C = WIND.crib, area = 8 * C.r * C.r * Math.tan(Math.PI / 8);
  const F = C.crush * area, fall = WIND.top - WIND.weightH - C.h, need = W * (fall + C.strain * C.h), holds = F * C.strain * C.h;
  return { W, n, d, mbl, sf: n * mbl / W, Dd: 2 * WIND.barrelR / d, pitch, turns, width: n * turns * pitch, kg: n * 0.004e6 * d * d * len + 40e3, area, F, fall, need, holds };
})();
// ---- Harrison's maintaining power (see the barrel, below): four leaf springs between the loose ring and the great
// wheel's arms, MAINT.r out, set up against stops. Pressed home, as the weight keeps them while the clock goes, they
// push with MAINT.set of the weight's torque, and the stops carry the rest. While the weight is wound they drive the
// wheel on with that, falling as they open over MAINT.travel to what the going train takes in still air. What reaches
// the frame's detent is their push, not the weight's (world/structure.js 1c).
export const MAINT = { r: 8.2, travel: 0.55, set: 0.9 };
// ---- the train's brake: a copper disc (conductivity sigma, thickness d) between magnets r out. An eddy-current brake's
// drag rises with speed only up to the disc's critical speed, about 2 / (mu0 sigma d); past it, it falls. The disc is
// thin enough for that to be well above the speed it runs at, so that a train running fast is braked harder.
export const BRAKE = { d: 0.035, sigma: 5.8e7, r: 3.5, poles: 2 * 1.8 * 1.1 };

// ------------------------------------------------------------- part makers
function mountGear(rotor, s, z, mat) {
  const m = new THREE.Mesh(gearGeometry(s, undefined, s.fab ? 'centre' : null), s.fab ? MAT.steel : mat); m.position.z = z; rotor.group.add(m);
  if (s.fab) fabRim(m, s);
  ENVELOPES.push({ x: rotor.center.x, y: rotor.center.y, r: s.ra, z0: z - s.t / 2, z1: z + s.t / 2 });
  addGearColliders(rotor, s, z);
  if (s.spokes || s.recess) {
    ENVELOPES.push({ x: rotor.center.x, y: rotor.center.y, r: s.hubR + 0.1, z0: z - hubHalf(s) + 0.1, z1: z + hubHalf(s) - 0.1 });      // its hub, which is thicker than its rim
    rivetRing(m, (s.rr + s.rimIn) / 2, Math.round(s.r * 3.2), s.t / 2);
    boltCircle(m, s.hubR * 0.7, s.spokes ? 8 : 6, hubHalf(s) - 0.12, Math.min(0.3, s.hubR * 0.09));      // set in counterbores, their heads nearly flush
  } else rivetRing(m, s.rr * 0.6, Math.max(8, Math.round(s.r * 2)), s.t / 2);
  return m;
}
// A fabricated wheel's rim: bronze toothed segments, one to each arm, bolted to the steel centre, a joint plate over
// each joint.
function fabRim(m, s, segs = s.spokes || 6) {
  m.add(new THREE.Mesh(gearGeometry(s, undefined, 'rim'), MAT.bronze));
  for (let k = 0; k < segs; k++) {
    const a = (k + 0.5) * TAU / segs, rm = (s.rimIn + s.rr) / 2;
    gbox(m, MAT.steel, s.rr - s.rimIn - 0.1, 0.45, s.t + 0.08, Math.cos(a) * rm, Math.sin(a) * rm, 0).rotation.z = a;
  }
}
// What a fabricated wheel weighs: the bronze segments, from the pitch circle to 350 mm inside the roots of their teeth;
// a steel box ring under them (plates 50 mm); steel box arms (40 mm); a cast-steel hub, 60 % solid. (structure/masses.js
// weighs a wheel cast whole in brass.)
export const fabMass = (s) => {
  const seg = Math.PI * (s.r ** 2 - (s.rr - 0.35) ** 2) * s.t * 8800, dr = Math.min(1.6, Math.max(0.8, s.r * 0.05));
  const ring = 2 * Math.PI * (s.rr - 0.35 - dr / 2) * 2 * (dr + 0.7 * s.t) * 0.05 * 7850;
  const arms = (s.spokes || 6) * (s.rimIn - s.hubR) * 2 * (s.spokeW + 0.5 * s.t) * 0.04 * 7850;
  return seg + ring + arms + Math.PI * s.hubR ** 2 * 2 * hubHalf(s) * 0.6 * 7850;
};
function mountArbor(rotor, z0, z1, r, nuts = [true, true]) {
  ENVELOPES.push({ x: rotor.center.x, y: rotor.center.y, r: r * 1.35, z0: z0 - 0.3, z1: z1 + 0.3 });
  const g = new THREE.CylinderGeometry(r, r, z1 - z0, 28); g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, MAT.steel); m.position.z = (z0 + z1) / 2; m.userData.shaft = true; rotor.group.add(m);
  rotor.addCollider(G.R.ColliderDesc.cylinder((z1 - z0) / 2, r).setRotation(QX).setTranslation(0, 0, (z0 + z1) / 2));
  for (const z of [z0, z1].filter((_, i) => nuts[i])) {                         // each end is held by a great nut on the arbor's own thread
    const cap = new THREE.Mesh(NUT, MAT.bronze);
    cap.scale.set(r * 1.2, r * 1.2, r * 0.7); cap.position.z = z; if (z === z0) cap.rotation.y = Math.PI; rotor.group.add(cap);
  }
}
function gbox(parent, mat, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); parent.add(m); return m;
}
// Gear b is driven by gear a (tooth counts Na, Nb).
function link(a, Na, b, Nb) {
  const beta = Math.atan2(b.center.y - a.center.y, b.center.x - a.center.x);
  b.k = -a.k * Na / Nb;
  b.c = -a.c * Na / Nb + meshOffset(beta, Na, Nb);
}

function thickPath(pts, width) {
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const w = typeof width === 'function' ? width(i / (pts.length - 1)) : width;
    const t = new THREE.Vector2(b[0] - a[0], b[1] - a[1]).normalize();
    left.push(new THREE.Vector2(p[0] - t.y * w, p[1] + t.x * w));
    right.push(new THREE.Vector2(p[0] + t.y * w, p[1] - t.x * w));
  }
  return new THREE.Shape([...left, ...right.reverse()]);
}

// ------------------------------------------------------------------ build
export function buildClockwork() {
  const R = G.R, listeners = { release: [], impact: [], hour: [], half: [] };
  const spinners = [], winder = [];    // shafts the floor train turns all the time; the winding gear's, which turn only while it winds
  const emit = (name, arg) => listeners[name].forEach(fn => fn(arg));

  // ---- pendulum + anchor (one rigid piece, like a real crutch-coupled pair)
  const pen = new Rotor(0, PEND.pivotY, 0);       // turns about the middle of the suspension spring, where it bends
  let leafGeo, leafX0;
  const pz = PEND.z, L = PEND.L, deckY = -(L - PEND.deckDrop), lf = PEND.leaf, lw = lf.n * lf.w + (lf.n - 1) * lf.gap;
  const rodTop = lf.chopsY - PEND.pivotY - 1.0, rodFoot = -L - PEND.bobR - 1.2;
  {
    const g = pen.group;
    // The rod: five bars of super-invar (iron, nickel and cobalt), strapped together. It runs on down through a slot in
    // the bob, which sits on a collar on it below its middle (COMP, below), to the rating nut under the bob.
    const rodLen = rodTop - rodFoot, rodY = (rodTop + rodFoot) / 2;
    for (let i = -2; i <= 2; i++) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, rodLen, 20), MAT.steel);
      rod.position.set(i * 0.46, rodY, pz); g.add(rod);
    }
    for (let y = rodTop - 2.5; y > -(L - 9); y -= 9.5) gbox(g, MAT.bronze, 2.5, 0.45, 0.6, 0, y, pz);
    // the rating tray, clamped to the rod half way down: what is put on it makes the clock gain (COMP.trayKg a second a day)
    gbox(g, MAT.bronze, 3.4, 0.14, 1.6, 0, -L / 2, pz);
    for (const [x, h] of [[-1.1, 0.5], [-0.5, 0.35], [0.9, 0.5]]) { const wt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, h, 16), MAT.brass); wt.position.set(x, -L / 2 + 0.07 + h / 2, pz + 0.3); g.add(wt); }
    // the bob: a brass lens, turned on a lathe
    const bR = PEND.bobR, prof = [];
    const hAt = (r) => 0.3 + 1.25 * Math.sqrt(Math.max(0, 1 - (r / bR) ** 2)) + 0.2 * Math.exp(-(((r - 0.8 * bR) / 0.28) ** 2)) + 0.3 * Math.exp(-((r / 1.5) ** 4));
    // a lathe profile has to run from the bottom up for its surface to face outward
    for (let i = 0; i <= 40; i++) { const r = Math.max(0.01, bR * i / 40); prof.push(new THREE.Vector2(r, -hAt(r))); }
    for (let i = 40; i >= 0; i--) { const r = Math.max(0.01, bR * i / 40); prof.push(new THREE.Vector2(r, hAt(r))); }
    const bob = new THREE.Mesh(planarUV(new THREE.LatheGeometry(prof, 128).rotateX(Math.PI / 2)), MAT.brass);
    bob.position.set(0, -L, pz); g.add(bob);
    rivetRing(g, 5.2, 28, 1.3, 0.22).position.set(0, -L, pz);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.4, 8), MAT.bronze); nut.position.set(0, -L - PEND.bobR - 1, pz); g.add(nut);
    // riding deck on top of the bob
    const ex = PEND.deckHalfX, ez = PEND.deckHalfZ;
    gbox(g, MAT.plate, 2 * ex, 0.3, 2 * ez, 0, deckY - 0.15, pz);
    for (const sz of [-1, 1]) {
      gbox(g, MAT.rail, 2 * ex, 0.08, 0.08, 0, deckY + 1.1, pz + sz * ez);
      gbox(g, MAT.rail, 2 * ex, 0.05, 0.05, 0, deckY + 0.55, pz + sz * ez);
      for (let i = 0; i <= 6; i++) gbox(g, MAT.rail, 0.08, 1.1, 0.08, -ex + i * 2 * ex / 6, deckY + 0.55, pz + sz * ez);
      pen.addCollider(R.ColliderDesc.cuboid(ex, 0.6, 0.05).setTranslation(0, deckY + 0.6, pz + sz * ez));
    }
    pen.addCollider(R.ColliderDesc.cuboid(ex, 0.15, ez).setTranslation(0, deckY - 0.15, pz));
    pen.addCollider(R.ColliderDesc.cuboid(1.15, (rodTop + L - 8) / 2, 0.3).setTranslation(0, (rodTop - L + 8) / 2, pz));
    pen.addCollider(R.ColliderDesc.cylinder(1.5, PEND.bobR).setRotation(QX).setTranslation(0, -L, pz));
    pen.addCollider(R.ColliderDesc.cylinder(0.7, 1.6).setTranslation(0, -L - PEND.bobR - 1, pz));       // rating nut: it skims the floor

    // Suspension (PEND.leaf, layout.js): four leaves of maraging steel side by side along the pivot's axis, in one plane,
    // clamped above in the chops under the head beam and below in the chops at the head of the rod. Each bends most
    // within about lambda of the upper clamp and below that follows the rod (bendLeaves).
    leafGeo = new THREE.BoxGeometry(lf.t, lf.free + 0.9, lf.w, 1, 40, 1); leafGeo.translate(0, lf.clampY - PEND.pivotY + 0.4 - (lf.free + 0.9) / 2, 0);
    leafX0 = Float32Array.from(leafGeo.attributes.position.array);
    for (let i = 0; i < lf.n; i++) { const m = new THREE.Mesh(leafGeo, MAT.steel); m.position.set(0, 0, pz - lw / 2 + lf.w / 2 + i * (lf.w + lf.gap)); m.userData.shaft = true; m.frustumCulled = false; g.add(m); }       // (held in the chops, as a shaft is held in a bearing)
    gbox(g, MAT.iron, 1.6, 1.0, lw + 0.6, 0, lf.chopsY - PEND.pivotY - 0.5, pz);                     // the chops at the head of the rod
    G.tag = 'bearing';
    for (const sx of [-1, 1]) ibox('iron', 0.5, 1.6, lw + 0.6, sx * (lf.t / 2 + 0.25), lf.clampY + 0.8, pz);       // the chops' cheeks, their faces radiused where the leaves leave them
    ibox('iron', 1.6, 2.2, SHAFT.pivot.z[1] - SHAFT.pivot.z[0], 0, ARBOR.pivot.y, (SHAFT.pivot.z[0] + SHAFT.pivot.z[1]) / 2);       // the head beam, across the pendulum's tower
    G.tag = '';
  }

  // ---- going train
  const S = {
    // The escape arbor turns once a minute and the centre arbor once an hour: 8 x 7.5 = 60. (The centres are those
    // the arbors already stand on, 28.8 m and 33 m, so the pitches follow from the tooth counts.)
    // The wheels are fabricated (fabRim, fabMass): bronze toothed segments bolted round a steel centre of box arms. The
    // pinions are solid steel. (The faces are as wide as they were cast: the teeth work at a few MPa.)
    escP: spec(12, 28.8 / 54, 3.2), third: spec(96, 28.8 / 54, 2.5, { spokes: 6, fab: true }),
    thirdP: spec(16, 33 / 68, 3.2), center: spec(120, 33 / 68, 2.5, { spokes: 8, fab: true, hubH: 1.25 }),        // (its hub is short, for its back bearing)
    centerP: spec(10, 0.8, 3.2), great: spec(80, 0.8, 2.5, { spokes: 8, fab: true, hubH: 1.0 }),                 // (and this one, for the ratchets and the back bearing)
    cannon: spec(20, 0.5, 1.8), minuteW: spec(60, 0.5, 1.6, { spokes: 5, fab: true }),
    minuteP: spec(15, 8 / 15, 1.8), hourW: spec(60, 8 / 15, 1.6, { spokes: 6, fab: true }),
    // the winding wheel: a worm wheel, its teeth hobbed and throated to the worms, in eight segments of phosphor bronze
    wind: spec(WIND.teeth, 2 * WIND.wheelR / WIND.teeth, 1.4, { spokes: 8, spokeW: 1.0, hubR: 2.5, rimIn: 6.9, fab: true }),
  };
  const rEsc = new Rotor(ARBOR.esc.x, ARBOR.esc.y, 0);
  const rThird = new Rotor(ARBOR.third.x, ARBOR.third.y, 0);
  const rCenter = new Rotor(ARBOR.center.x, ARBOR.center.y, 0);
  const rGreat = new Rotor(ARBOR.great.x, ARBOR.great.y, 0);
  const rBarrel = new Rotor(ARBOR.great.x, ARBOR.great.y, 0);     // the great arbor, with the barrel fast on it: the great wheel rides loose and is driven through a ratchet
  const rWind = new Rotor(ARBOR.great.x, ARBOR.great.y, 0);       // the winding wheel, loose on the same arbor
  const rMinute = new Rotor(ARBOR.minute.x, ARBOR.minute.y, 0);
  const rHour = new Rotor(ARBOR.center.x, ARBOR.center.y, 0);
  const rE = new Rotor(ARBOR.esc.x, ARBOR.esc.y, 0);              // the escape wheel: light, and loose on a spigot on the end of the train's last arbor

  // ---- remontoire and escapement
  // The going train is far too heavy to stop and start every ten seconds, so it does not. It turns without
  // stopping, and drives the escape wheel only through a remontoire: a differential on the end of its last arbor
  // whose arm carries a small weight. The weight's pull on the arm is the only thing that ever turns the escape
  // wheel, and it is always the same. Each time the escape wheel takes a step the arm drops; the train, coming on
  // steadily behind, raises it again. The train's surplus goes into a brake (a copper disc turning between
  // magnets), which the arm's height sets, so that the train keeps pace with the escapement.
  //
  // The escapement is a three-legged gravity escapement, in Denison's manner. On the escape wheel's sleeve are
  // three legs and three lifting pins; beside the pendulum's suspension hang two arms. The wheel is locked with a
  // leg lying against one arm's stop, and a pin holding that arm up. The pendulum, coming over, meets the arm's
  // beat pin and carries the arm outward; the stop slides off the end of the leg and the wheel turns a sixth of
  // a turn, until the next leg meets the other arm's stop. As it turns, a pin lifts that other arm. The first arm
  // comes back resting on the pendulum and goes on down with it, past where it was picked up, until it is set
  // down on a pin. So each arm pushes the pendulum through a little more than the pendulum pushed it, by a fixed
  // drop, and that is the whole of the impulse.
  const GE = GESC, Yp = PEND.pivotY + GE.pivotUp, G_LOW = GE.low, G_UP = GE.up, TH0 = PEND.theta0, STEP = 60 * DEG;
  const Q = 6000;                                    // of this pendulum on its spring, in air: what it loses in a swing is its energy times pi / Q
  const AIR = Math.sqrt(GRAV / L) / Q;
  const pendKg = Math.PI * PEND.bobR ** 2 * 2.2 * MATERIAL.brass.rho + 5 * cylinderMass(0.17, PEND.L - 9);
  // An arm's push on the pendulum, as an angular acceleration of the pendulum: what makes up, in the arm's fall
  // from where it is picked up to where it is set down, exactly what the pendulum loses in a beat at the swing it
  // is designed for. The arm is then made the weight that gives that push (armKg, below): that is how the swing
  // of a gravity escapement is set, and it is the only place it is set.
  const ARM = Math.PI * 0.5 * (GRAV / L) * TH0 * TH0 / (Q * (G_UP - G_LOW)), liftJ = ARM * pendKg * L * L * (G_UP - G_LOW);       // liftJ: joules to lift an arm
  const REM = 1.5;                                   // the remontoire gives the escape wheel half as much again as lifting an arm takes; the fly spends the rest
  let armR, armL, armKg, spider, TURN, fly, LOCK;
  // The fly (drawn below): a crown wheel on the escape wheel's sleeve drives a pinion FLY.G times as fast on an upright
  // arbor, through a friction ratchet; on top, four vanes of aluminium sheet. Their drag goes as the square of their speed.
  const FLY = { G: 30, vanes: 4, r0: 0.35, r1: 1.35, h: 0.45, sheet: 0.0015 * 2700 };
  const flyC = FLY.vanes * 0.5 * 1.2 * 1.2 * FLY.h * (FLY.r1 ** 4 - FLY.r0 ** 4) / 4;          // N m s^2 at the fly: air 1.2 kg/m3, a flat plate's drag coefficient 1.2
  const flyI = FLY.vanes * FLY.sheet * FLY.h * (FLY.r1 ** 3 - FLY.r0 ** 3) / 3 + 2.5;            // kg m^2: the vanes, and the arbor and pinion
  let escI;                                          // the escape wheel's moment of inertia (below)
  // One step of the escape wheel while it turns: the remontoire's torque, less the lifting of an arm (the pallets are
  // shaped so that it is even over the step), against the fly. While the ratchet drives the fly, the fly's inertia
  // counts too; once the wheel would be slowed faster than the fly slows by itself, the fly runs on alone.
  const wheelStep = (w, dt) => {
    const Tn = (REM - 1) * liftJ / STEP;
    if (w.fw <= FLY.G * w.ew + 1e-9) { w.ew += (Tn - FLY.G ** 3 * flyC * w.ew * w.ew) / (escI + FLY.G ** 2 * flyI) * dt; w.fw = FLY.G * w.ew; }
    else { w.ew += Tn / escI * dt; w.fw = Math.max(0, w.fw - flyC * w.fw * w.fw / flyI * dt); }
    w.ea += w.ew * dt;
  };
  const planets = [];
  {
    const st = MAT.steel, cyl = (r, len) => new THREE.CylinderGeometry(r, r, len, 28).rotateX(Math.PI / 2);
    const on = (grp, mesh, x, y, z) => { mesh.position.set(x, y, z); grp.add(mesh); return mesh; };
    // on the train's last arbor: the brake disc, a spigot for the rest to turn on, and one wheel of the differential
    on(rEsc.group, new THREE.Mesh(cyl(4.0, BRAKE.d), MAT.copper), 0, 0, GE.zBrake);
    rEsc.addCollider(R.ColliderDesc.cylinder(BRAKE.d / 2, 4.0).setRotation(QX).setTranslation(0, 0, GE.zBrake));
    const spigot = on(rEsc.group, new THREE.Mesh(cyl(0.35, GE.zArm - 0.4 - SHAFT.esc.z[0]), st), 0, 0, (GE.zArm - 0.4 + SHAFT.esc.z[0]) / 2); spigot.userData.shaft = true;
    const bevel = bevelGeometry(12, GE.bevelR, 0.28, Math.PI / 4, 0.42, 0.35);
    on(rEsc.group, new THREE.Mesh(bevel, st), 0, 0, GE.zDiff).rotation.x = Math.PI;
    ENVELOPES.push({ x: rEsc.center.x, y: rEsc.center.y, r: 4.1, z0: GE.zBrake - 0.3, z1: GE.zBrake + 0.3 }, { x: rEsc.center.x, y: rEsc.center.y, r: 5.4, z0: GE.zDiff - 0.5, z1: GE.zDiff + 0.5 });
    G.tag = 'bearing';                                 // the magnets, either side of the disc's lower edge, on a bracket off the tower
    for (const dz of [-0.2, 0.2]) ibox('iron', 1.8, 1.1, 0.26, 0, ESC.y - 3.5, GE.zBrake + dz);
    ibox('iron', 0.4, 0.4, 1.6 - GE.zBrake + 0.5, 0, ESC.y - 4.25, (1.6 + GE.zBrake - 0.5) / 2);
    G.tag = '';
    // the remontoire's arm, with the two planet wheels of the differential on it and the weight at its end
    spider = new Spinner(new THREE.Vector3(ARBOR.esc.x, ARBOR.esc.y, GE.zDiff), ZAXIS);
    spider.group.add(new THREE.Mesh(cyl(0.5, 0.3), MAT.bronze));
    for (const sg of [-1, 1]) { const pg = new THREE.Group(); pg.rotation.y = -sg * Math.PI / 2; const pm = new THREE.Mesh(bevel, st); pg.add(pm); spider.group.add(pg); planets.push(pm); }
    gbox(spider.group, MAT.rail, 6.0, 0.22, 0.14, -1.6, 0, 0);                                   // the arm: the weight on the long end
    const remKg = 2 * REM * liftJ / STEP / GRAV / 4.5;                                           // what must hang 4.5 m out to give the escape wheel its torque
    on(spider.group, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, Math.max(0.3, remKg / (8500 * Math.PI * 0.09)), 20), MAT.brass), -4.5, -0.45, 0);
    // the escape wheel: three light legs and three lifting pins on a sleeve, and the other wheel of the differential
    const legKg = 4.5 * 1.4 * 0.01 * 7850; escI = 3 * legKg * GE.legs ** 2 / 3 + 2500 * 0.3 + 930 * 1.4 ** 2;     // legs of 10 mm plate, 400 x 300; the sleeve, hub and wheel as 2.5 t at 0.55 m; the fly's crown wheel
    // How long the wheel takes over its sixth of a turn, and what it strikes its stop with (wheelStep, below)
    { const w = { ew: 0, ea: 0, fw: 0 }; let t = 0; while (w.ea < STEP && t < 60) { wheelStep(w, 1 / 240); t += 1 / 240; } TURN = t; LOCK = { joules: 0.5 * escI * w.ew ** 2, omega: w.ew, run: w.fw }; }
    on(rE.group, new THREE.Mesh(bevel, st), 0, 0, GE.zDiff);
    on(rE.group, new THREE.Mesh(cyl(0.5, GE.zDiff - GE.bevelR - GE.zArm + 0.3), MAT.bronze), 0, 0, (GE.zDiff - GE.bevelR + GE.zArm - 0.3) / 2);
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3, c = Math.cos(a), sn = Math.sin(a), mid = (GE.legs + 0.6) / 2, len = GE.legs - 0.6;
      const leg = new THREE.Group(); leg.position.set(c * mid, sn * mid, GE.zWheel); leg.rotation.z = a; leg.name = 'leg'; rE.group.add(leg);       // a box of 10 mm plate, 400 by 300, open at its end
      for (const sy of [-1, 1]) { gbox(leg, st, len, 0.01, 0.3, 0, sy * 0.195, 0); gbox(leg, st, len, 0.38, 0.01, 0, 0, sy * 0.145); }
      rE.addCollider(R.ColliderDesc.cuboid(len / 2, 0.2, 0.15).setTranslation(c * mid, sn * mid, GE.zWheel).setRotation({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) }));
      on(rE.group, new THREE.Mesh(cyl(GE.pinR, 0.9), st), c * GE.pins, sn * GE.pins, GE.zArm + 0.1).name = 'pin';        // a lifting pin, in the plane of the arms
    }
    on(rE.group, new THREE.Mesh(cyl(0.8, 0.5), MAT.bronze), 0, 0, GE.zWheel); on(rE.group, new THREE.Mesh(cyl(GE.pins + 0.25, 0.2), MAT.bronze), 0, 0, GE.zArm + 0.5);
    ENVELOPES.push({ x: rE.center.x, y: rE.center.y, r: GE.legs + 0.1, z0: GE.zWheel - 0.3, z1: GE.zWheel + 0.3 }, { x: rE.center.x, y: rE.center.y, r: GE.pins + 0.4, z0: GE.zArm - 0.45, z1: GE.zArm + 0.7 });
    // The fly, between the legs and the differential. Its crown wheel's teeth face forward; its pinion is at the top of
    // the crown wheel, on an arbor that stands upright in two bearings hung from the head beam.
    {
      const zf = (GE.zWheel + GE.zDiff) / 2, Rc = 1.5, Nc = 180, Np = Nc / FLY.G, cp = Math.atan(Np / Nc), top = 7.6;
      on(rE.group, new THREE.Mesh(bevelGeometry(Nc, Rc, 0.14, Math.PI / 2 - cp, 0.7, 0.2), MAT.bronze), 0, 0, zf);
      on(rE.group, new THREE.Mesh(cyl(0.6, 0.2), MAT.bronze), 0, 0, zf - 0.2);
      fly = new Spinner(new THREE.Vector3(0, ESC.y, zf), YUP);
      const pin = new THREE.Mesh(bevelGeometry(Np, Rc * Np / Nc, 0.14, cp, 0.07, 0.15), st); pin.rotation.x = Math.PI; fly.group.add(pin);
      const arbor = new THREE.Mesh(cyl(0.07, top - Rc + 0.4), st); arbor.position.z = (top + Rc) / 2 + 0.1; arbor.userData.shaft = true; fly.group.add(arbor);
      const zv = top - 0.7;
      for (let i = 0; i < FLY.vanes; i++) { const a = i * TAU / FLY.vanes; gbox(fly.group, MAT.plate, FLY.r1 - FLY.r0, 0.015, FLY.h, Math.cos(a) * (FLY.r0 + FLY.r1) / 2, Math.sin(a) * (FLY.r0 + FLY.r1) / 2, zv).rotation.z = a; gbox(fly.group, st, FLY.r0, 0.06, 0.06, Math.cos(a) * FLY.r0 / 2, Math.sin(a) * FLY.r0 / 2, zv).rotation.z = a; }
      on(fly.group, new THREE.Mesh(cyl(0.18, 0.5), MAT.bronze), 0, 0, zv);
      // its bearings: the top one on a hanger straight down from the head beam's front end, the lower one, below the vanes,
      // on an arm from a hanger beside them
      G.tag = 'bearing';
      const yb = ARBOR.pivot.y - 1.1, y1 = ESC.y + top + 0.2, y0 = ESC.y + Rc + 0.55;
      ibox('iron', 0.3, yb - y1, 0.3, 0, (yb + y1) / 2, zf); ibox('iron', 0.5, 0.4, 0.5, 0, y1, zf);
      ibox('iron', 0.3, yb - y0 + 0.2, 0.3, -1.75, (yb + y0 - 0.2) / 2, zf); ibox('iron', 1.75, 0.3, 0.3, -0.875, y0, zf); ibox('iron', 0.5, 0.4, 0.5, 0, y0, zf);
      G.tag = '';
    }
    // The arms. Each is drawn as it hangs when lifted, and turns about its pivot from there. An arm is a light
    // tube: its weight, bearing inward because it hangs outward, is the impulse, and has to be what ARM asks.
    const dy = Yp - ESC.y, phi = Math.atan2(GE.armX - GE.pivotX, dy), len = (Yp - GE.beatY) / Math.cos(phi), xa = GE.armX - GE.pivotX, face = GE.pins + GE.pinR - GE.pivotX;
    const xfoot = Math.sin(phi) * len, xpin = (PEND.pivotY - GE.beatY) * Math.sin(G_UP) + 1.1 + 0.16 - GE.pivotX, back = GE.zArm - (PEND.z - 0.35);
    armKg = ARM * pendKg * L * L / (GRAV * xfoot / 2);                                           // its weight acts at the middle of its length, half its foot's distance out
    const arm = (sg) => {
      const A = new THREE.Group(); A.position.set(sg * GE.pivotX, Yp, GE.zArm); G.scene.add(A); G.machines.push(A);
      gbox(A, MAT.rail, 0.3, len, 0.22, sg * xfoot / 2, -(Yp - GE.beatY) / 2, 0).rotation.z = sg * phi;                             // the arm itself
      gbox(A, st, xa - face, 0.3, 0.2, sg * (xa + face) / 2, -dy, 0);                                                                // a finger in toward the sleeve,
      gbox(A, MAT.bronze, 0.2, 1.3, 0.5, sg * (face + 0.1), -dy - sg * 0.35, 0).name = 'pallet';                                     // ending in the pallet a pin pushes
      gbox(A, MAT.bronze, 0.6, 0.4, GE.zWheel - GE.zArm + 0.35, sg * (GE.legs - 0.03 + 0.3 - GE.pivotX), -dy + sg * 0.4, (GE.zWheel - GE.zArm + 0.1) / 2).name = 'stop';     // the stop: over the leg on one side, under it on the other
      gbox(A, st, xfoot - xpin + 0.3, 0.26, 0.2, sg * (xfoot + xpin) / 2, GE.beatY - Yp, 0);                                         // and at the foot, an arm in to the beat pin,
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, back, 14).rotateX(Math.PI / 2), st); pin.position.set(sg * xpin, GE.beatY - Yp, -back / 2); A.add(pin);       // which reaches back to the pendulum rod
      const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 16).rotateX(Math.PI / 2), MAT.bronze); stud.userData.shaft = true; A.add(stud);
      return A;
    };
    armR = arm(1); armL = arm(-1);
    for (const sg of [-1, 1]) ENVELOPES.push({ x: sg * (GE.pivotX + xpin + 0.35), y: GE.beatY, r: 0.75, z0: PEND.z, z1: GE.zArm + 0.2 });       // where the beat pins move
    G.tag = 'bearing';
    for (const sg of [-1, 1]) for (const dz of [-0.24, 0.24]) ibox('iron', 0.44, ARBOR.pivot.y - 1.1 - Yp + 0.45, 0.1, sg * GE.pivotX, (ARBOR.pivot.y - 1.1 + Yp - 0.45) / 2, GE.zArm + dz);       // the cocks the arms hang from, under the head beam: a cheek either side of each arm
    G.tag = '';
  }
  mountGear(rEsc, S.escP, LAYER.A, MAT.steel); mountArbor(rEsc, ...SHAFT.esc.z, SHAFT.esc.r, [false, true]);         // (behind, the escape wheel's hub is all but against the pendulum's frame)
  mountGear(rThird, S.third, LAYER.A, MAT.brass); mountGear(rThird, S.thirdP, LAYER.B, MAT.steel); mountArbor(rThird, ...SHAFT.third.z, SHAFT.third.r, [true, false]);       // (its front end stops just short of a walkway)
  mountGear(rCenter, S.center, LAYER.B, MAT.brass); mountGear(rCenter, S.centerP, LAYER.C, MAT.steel);
  mountGear(rCenter, S.cannon, LAYER.motionA, MAT.steel); mountArbor(rCenter, ...SHAFT.center.z, SHAFT.center.r, [false, true]);       // (its back end stops just short of a walkway)
  mountGear(rGreat, S.great, LAYER.C, MAT.brass); mountArbor(rBarrel, ...SHAFT.great.z, SHAFT.great.r, [false, false]);      // (the ratchet is its fitting at one end, the clutch gear at the other)
  mountGear(rMinute, S.minuteW, LAYER.motionA, MAT.brass); mountGear(rMinute, S.minuteP, LAYER.motionB, MAT.steel); mountArbor(rMinute, ...SHAFT.minute.z, SHAFT.minute.r);
  mountGear(rHour, S.hourW, LAYER.motionB, MAT.brass);

  // ---- what all this weighs, declared to the structural model (structure/model.js).
  // Each arbor is a steel shaft carrying its wheels as loads, resting in its two bearings.
  {
    const st = MATERIAL.steel;
    const on = {
      esc: [[GE.zBrake, 55e3, 'brake disc'], [SHAFT.esc.z[0], 4e3 + 930, 'remontoire, escape wheel and fly'], [LAYER.A, wheelMass(S.escP, st), 'pinion']],
      pivot: [[PEND.z, pendKg, 'pendulum'], [GE.zArm, 2 * armKg, 'gravity arms'], [SHAFT.pivot.z[1], 2.5e3, 'the fly\'s bearings and their hangers']],
      third: [[LAYER.A, fabMass(S.third), 'third wheel'], [LAYER.B, wheelMass(S.thirdP, st), 'third pinion']],
      center: [[LAYER.B, fabMass(S.center), 'centre wheel'], [LAYER.C, wheelMass(S.centerP, st), 'centre pinion'], [LAYER.motionA, wheelMass(S.cannon, st), 'cannon pinion'],
        [LAYER.motionB, fabMass(S.hourW), 'hour wheel'], [(HANDS.pipe[0] + HANDS.pipe[1]) / 2, cylinderMass(2.1, HANDS.pipe[1] - HANDS.pipe[0], st, 2.05), 'hour pipe (steel plate)'],
        [HANDS.hour.zc, HANDS.hour.kg, 'hour hand'], [HANDS.minute.zc, HANDS.minute.kg, 'minute hand'], [HANDS.hour.cz, HANDS.hour.ckg, 'hour hand\'s counterpoise'], [HANDS.minute.cz, HANDS.minute.ckg, 'minute hand\'s counterpoise']],
      great: [[LAYER.C, fabMass(S.great), 'great wheel'], [27, cylinderMass(5, 4.2, MATERIAL.brass, 3.5), 'barrel'], [27, cylinderMass(WIND.weightR, WIND.weightH, MATERIAL.castIron), 'driving weight'],
        [27, ROPE.kg, 'ropes and equaliser'], [WIND.z, fabMass(S.wind) + 60e3, 'winding wheel and clutch']],
      minute: [[LAYER.motionA, fabMass(S.minuteW), 'minute wheel'], [LAYER.motionB, wheelMass(S.minuteP, st), 'minute pinion']],
    };
    const TURNS = { esc: 1 / 60, third: 1 / 480, center: 1 / 3600, great: 1 / 28800, minute: 1 / 10800 };     // turns a second
    for (const [name, loads] of Object.entries(on)) {
      const sh = SHAFT[name], a = ARBOR[name], A = assembly(`arbor ${name}`, 'alloy-steel shaft on two bearings');
      A.member([a.x, a.y, sh.z[0]], [a.x, a.y, sh.z[1]], sh.beam ? SECTION.box(2.2, 1.6, 0.2) : SECTION.round(sh.r), MATERIAL.alloy, 'beam', sh.beam ? 'head beam' : 'arbor', sh.beam ? null : { turns: TURNS[name] * 3.156e9 });       // (turns in a century: model.js checks it in rotating bending)
      for (const [z, kg, label] of loads) A.mass([a.x, a.y, z], kg, label);
      // Both bearings hold the arbor endwise (a thrust collar either side of each, with a millimetre of end
      // shake), as an arbor is held between a clock's two plates. The wheels fill the space between the two
      // frames of its tower at the top, so the arbor is the only thing that can tie their heads together, and
      // it does (structure.js declares it in the tower as a tie). The arbor and the frames are the same steel
      // in the same air, so warming does not force them: a few degrees' difference over the 10 to 20 m
      // between bearings is half a millimetre, against a head that gives a millimetre to 20 kN.
      sh.bearings.forEach((z) => A.rest([a.x, a.y, z], `tower ${name}`, 'pin'));
      // The centre arbor has a third bearing, in the boss of the dial's frame (world/structure.js), which holds it sideways
      // only: the hour pipe turns in the boss, and the arbor in the pipe.
      if (sh.dial) A.rest([a.x, a.y, sh.dial], 'dial frame', 'xy');
    }
    // The teeth. The driving weight's pull on the barrel is a torque on the great arbor, and every pair of
    // wheels in the train passes it on at the pitch circles: a push along the common tangent, and (the teeth
    // are 20 degree involutes) a third as much again pushing the two arbors apart. The weight hangs whenever
    // the clock exists, so this is as permanent as the weights are; it is declared as its own case.
    const torque = cylinderMass(WIND.weightR, WIND.weightH, MATERIAL.castIron) * GRAV * WIND.barrelR, PA = Math.tan(20 * DEG);
    const pairs = [['great', S.great, 'center', S.centerP, LAYER.C], ['center', S.center, 'third', S.thirdP, LAYER.B], ['third', S.third, 'esc', S.escP, LAYER.A]];
    // (The weight hangs on the left of the great arbor, so that arbor turns anticlockwise seen from the dial,
    // and each arbor after it the other way. A driver's teeth push the follower the way the driver's rim is moving.)
    // Each arbor is also twisted, between where its torque comes in and where it goes out.
    let T = torque, sense = 1;
    assembly('arbor great').force([ARBOR.great.x, ARBOR.great.y, 27], [0, 0, 0, 0, 0, torque], 'the driving weight, on the barrel', 'teeth');
    for (const [dn, sd, fn, sf, z] of pairs) {
      const A = ARBOR[dn], B = ARBOR[fn], d = [B.x - A.x, B.y - A.y], l = Math.hypot(d[0], d[1]), u = [d[0] / l, d[1] / l], t = [-u[1] * sense, u[0] * sense];
      const F = T / sd.r, push = [t[0] * F + u[0] * F * PA, t[1] * F + u[1] * F * PA];       // on the follower; the driver gets the opposite
      assembly(`arbor ${fn}`).force([B.x, B.y, z], [push[0], push[1], 0, 0, 0, -sense * F * sf.r], `the ${dn} wheel's teeth`, 'teeth');
      assembly(`arbor ${dn}`).force([A.x, A.y, z], [-push[0], -push[1], 0, 0, 0, -sense * F * sd.r], `the ${fn} pinion's teeth`, 'teeth');
      T = F * sf.r; sense = -sense;
    }
    assembly('arbor esc').force([ARBOR.esc.x, ARBOR.esc.y, GE.zBrake], [0, 0, 0, 0, 0, -sense * T], 'the brake, which takes what the escapement does not', 'teeth');
    // The pendulum. At the end of each swing its rod leans 3 degrees and pulls the suspension sideways by
    // m g sin 3 cos 3, about 5 % of its weight, one way and then, ten seconds later, the other.
    assembly('arbor pivot').force([ARBOR.pivot.x, ARBOR.pivot.y, PEND.z], [pendKg * GRAV * Math.sin(PEND.theta0) * Math.cos(PEND.theta0), 0, 0], 'the pendulum at the end of its swing', 'pendulum');
  }

  rEsc.k = -1; rEsc.c = 0;                // the last arbor of the train: once a minute, without stopping
  link(rEsc, 12, rThird, 96); link(rThird, 16, rCenter, 120); link(rCenter, 10, rGreat, 80);
  link(rCenter, 20, rMinute, 60); link(rMinute, 15, rHour, 60);
  const train = [rEsc, rThird, rCenter, rGreat, rMinute, rHour];

  // ---- barrel, ropes and driving weight
  // The weight's fall is what drives the clock. The barrel is fast on the great arbor; the great wheel rides
  // loose on the same arbor, so the arbor can be turned back to wind the weight up without turning the clock
  // back. Between them is Harrison's maintaining power. The arbor's ratchet does not push the wheel itself but a
  // second, loose ratchet ring, through clicks; the ring pushes the wheel through springs, which the weight keeps
  // compressed. While the arbor is being turned back a detent on the frame stops the ring following it, and the
  // springs go on pushing the wheel (MAINT): set up against stops, they push with nine tenths of the weight's torque
  // (the weight keeps them pressed home, the stops taking the last tenth), enough to drive the train in still air for
  // half as long again as a winding takes. The weight hangs on four ropes
  // from an equalising beam (ROPE).
  const wx = ARBOR.great.x - WIND.barrelR, WH = WIND.weightH, weightKg = cylinderMass(WIND.weightR, WH, MATERIAL.castIron), fall = TAU * WIND.barrelR / 28800;      // m/s: one turn of the barrel in eight hours
  let weight, collar, lever, trip, placeWeight;
  const ropes = [], ropeZ = Array.from({ length: WIND.ropes }, (_, i) => 27 + (i - (WIND.ropes - 1) / 2) * ROPE.width / WIND.ropes);
  const collarOut = WIND.z + 1.8;
  {
    const g = new THREE.CylinderGeometry(WIND.barrelR - 0.1, WIND.barrelR - 0.1, 4.2, 40); g.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(g, MAT.bronze); barrel.position.z = 27; rBarrel.group.add(barrel);
    rBarrel.addCollider(R.ColliderDesc.cylinder(2.1, WIND.barrelR).setRotation(QX).setTranslation(0, 0, 27));
    ENVELOPES.push({ x: rBarrel.center.x, y: rBarrel.center.y, r: 6, z0: 24.6, z1: 29.4 });
    for (const z of [24.8, 29.2]) { const fl = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.2, 40).rotateX(Math.PI / 2), MAT.iron); fl.position.z = z; rBarrel.group.add(fl); }
    // its grooves, a helix for each rope (ROPE.pitch apart), and on each the dead turns of its rope that never come off
    for (const z0 of ropeZ) {
      const helix = (r, from, to) => new THREE.CatmullRomCurve3(Array.from({ length: Math.ceil((to - from) * 48) + 1 }, (_, k) => { const t = from + (to - from) * k / Math.ceil((to - from) * 48), a = t * TAU; return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z0 - ROPE.width / WIND.ropes / 2 + t * ROPE.pitch + 0.15); }));
      rBarrel.group.add(new THREE.Mesh(new THREE.TubeGeometry(helix(WIND.barrelR - 0.08, 0, ROPE.turns), Math.ceil(ROPE.turns * 64), 0.05, 6), MAT.iron));
      rBarrel.group.add(new THREE.Mesh(new THREE.TubeGeometry(helix(WIND.barrelR, 0, 2), 128, ROPE.d / 2, 8), MAT.steel));
    }
    // the going ratchet, on the arbor behind the great wheel, and the clicks on the wheel's spokes that it pushes
    const rs = { N: 48, t: 0.5, R: 5.7, rr: 5.2, depth: 0.5, pa: TAU / 48, spokes: 0, recess: false }, rz = LAYER.C - hubHalf(S.great) - 0.3;
    const ratchet = new THREE.Mesh(gearGeometry(rs, escapeOutline(rs)), MAT.steel); ratchet.position.z = rz; rBarrel.group.add(ratchet);
    ENVELOPES.push({ x: rBarrel.center.x, y: rBarrel.center.y, r: 8.0, z0: rz - 0.4, z1: rz + 0.4 });
    // the maintaining ratchet: a loose ring round the arbor's ratchet, toothed on its outer edge for the frame's detent
    const ms = { N: 60, R: 7.7, rr: 7.2, depth: 0.5, pa: TAU / 60 }, ringShape = new THREE.Shape(escapeOutline(ms)); ringShape.holes.push(new THREE.Path().absarc(0, 0, 6.3, 0, TAU, true));
    const ring = new THREE.Mesh(extrude(ringShape, 0.4, 0.04, 24, 1), MAT.steel); ring.position.z = rz; rGreat.group.add(ring);
    for (let i = 0; i < 4; i++) {
      // four clicks on the ring, a quarter of a tooth out of step with one another, so that one of them is always nearly home
      const an = i * TAU / 4 + i * rs.pa / 4, px = Math.cos(an) * 6.25, py = Math.sin(an) * 6.25;
      const click = gbox(rGreat.group, MAT.steel, 0.9, 0.3, 0.36, px - Math.cos(an + 1.2) * 0.35, py - Math.sin(an + 1.2) * 0.35, rz); click.rotation.z = an + 1.2;
      // and four springs from the ring to the wheel's spokes. They lie in the gap between the ring's face and the wheel's,
      // not in the ring's own plane: that plane has to stay empty outside the teeth, because the frame's detent stands in it
      const sa = (i + 0.5) * TAU / 4, sz = rz + 0.37, stud = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 14).rotateX(Math.PI / 2), MAT.steel); stud.position.set(Math.cos(sa) * 9.6, Math.sin(sa) * 9.6, sz + 0.1); rGreat.group.add(stud);
      gbox(rGreat.group, MAT.steel, 3.1, 0.5, 0.3, Math.cos(sa) * 8.2, Math.sin(sa) * 8.2, sz).rotation.z = sa;
      gbox(rGreat.group, MAT.iron, 3.1, 0.4, 0.3, Math.cos(sa - 0.07) * 8.2, Math.sin(sa - 0.07) * 8.2, sz).rotation.z = sa - 0.07;      // its stop, a stiff bar beside it from the same foot: the spring's tip comes home against it
      gbox(rGreat.group, MAT.steel, 0.5, 0.7, 0.34, Math.cos(sa) * 6.85, Math.sin(sa) * 6.85, sz).rotation.z = sa;                  // its foot, bolted to the ring's face
    }
    // the winding wheel, and the dogs on its hub that the clutch takes hold of
    const wheel = new THREE.Mesh(gearGeometry(S.wind, undefined, 'centre'), MAT.steel); wheel.position.z = WIND.z; rWind.group.add(wheel); fabRim(wheel, S.wind, 8);
    rivetRing(wheel, 7.3, 48, 0.7, 0.12);
    rWind.addCollider(R.ColliderDesc.cylinder(0.7, S.wind.ra).setRotation(QX).setTranslation(0, 0, WIND.z));
    ENVELOPES.push({ x: rWind.center.x, y: rWind.center.y, r: S.wind.ra, z0: WIND.z - 0.9, z1: WIND.z + 0.9 });
    for (let i = 0; i < 6; i++) gbox(rWind.group, MAT.steel, 0.7, 0.5, 0.35, Math.cos(i * TAU / 6) * 2.0, Math.sin(i * TAU / 6) * 2.0, WIND.z + 1.05).rotation.z = i * TAU / 6;
    // the clutch: a collar that slides on the arbor's key. In, its dogs take the winding wheel round with the arbor.
    collar = new THREE.Group(); collar.position.z = collarOut; rBarrel.group.add(collar);
    collar.add(new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.22, 36).rotateX(Math.PI / 2).translate(0, 0, -0.2), MAT.bronze));
    collar.add(new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.5, 36).rotateX(Math.PI / 2), MAT.bronze));
    collar.add(new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.22, 36).rotateX(Math.PI / 2).translate(0, 0, 0.2), MAT.bronze));
    for (let i = 0; i < 6; i++) gbox(collar, MAT.steel, 0.7, 0.5, 0.25, Math.cos((i + 0.5) * TAU / 6) * 2.0, Math.sin((i + 0.5) * TAU / 6) * 2.0, -0.4).rotation.z = (i + 0.5) * TAU / 6;
    // Two arms on the arbor's end. The arbor swings through 23 degrees between one winding and the next, and
    // nothing else: its angle is the weight's height. One arm reaches the clutch lever as the weight comes to
    // the top and knocks the clutch out; the other reaches it when the weight has fallen two metres and knocks it in.
    trip = new THREE.Group(); trip.position.z = WIND.z + 2.4; rBarrel.group.add(trip);
    trip.add(new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.3, 28).rotateX(Math.PI / 2), MAT.iron));
    for (const an of [0, -WIND.band / WIND.barrelR]) {
      const arm = gbox(trip, MAT.iron, 3.0, 0.4, 0.25, Math.cos(an) * 2.3, Math.sin(an) * 2.3, 0); arm.rotation.z = an;
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 14).rotateX(Math.PI / 2), MAT.steel); peg.position.set(Math.cos(an) * 3.6, Math.sin(an) * 3.6, -0.4); trip.add(peg);
    }
    // the clutch lever: pivoted below, forked round the collar above
    const py = ARBOR.great.y - WIND.wheelR - WIND.wormR + 1.6, pz = WIND.z + 1.75, len = ARBOR.great.y - 2.4 - py;
    lever = new THREE.Group(); lever.position.set(ARBOR.great.x, py, pz); G.scene.add(lever); G.machines.push(lever);
    gbox(lever, MAT.rail, 0.22, len, 0.16, 0, len / 2, 0);
    for (const sx of [-1, 1]) gbox(lever, MAT.rail, 0.16, 2.6, 0.16, sx * 2.1, len + 1.1, 0);
    gbox(lever, MAT.rail, 4.36, 0.2, 0.16, 0, len - 0.1, 0);
    // The weight: cast iron, banded. On its head, a crosshead pinned to the middle of an equalising beam; at each end of
    // that a shorter beam, pinned at its middle; and at each end of those a rope, in a socket. The beams share the weight
    // out equally among the four ropes, whatever their lengths.
    const wm = new THREE.Group(), eqY = WH / 2 + 1.4, ropeEnd = WH / 2 + 2.9, dz = ropeZ[1] - ropeZ[0];
    wm.add(new THREE.Mesh(new THREE.CylinderGeometry(WIND.weightR, WIND.weightR, WH, 48), MAT.iron));
    for (const y of [WH / 2 - 1.2, 0, -WH / 2 + 1.2]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(WIND.weightR + 0.12, WIND.weightR + 0.12, 0.6, 48), MAT.bronze); band.position.y = y; wm.add(band); }
    gbox(wm, MAT.iron, 1.6, 0.6, 1.0, 0, WH / 2 + 0.3, 0); gbox(wm, MAT.steel, 0.5, eqY - WH / 2 - 0.3, 0.5, 0, (eqY + WH / 2 + 0.3) / 2, 0);
    gbox(wm, MAT.iron, 0.7, 0.7, 2 * dz + 0.6, 0, eqY, 0);                                         // the equalising beam
    for (const sz of [-1, 1]) {
      gbox(wm, MAT.steel, 0.3, 0.6, 0.3, 0, eqY + 0.6, sz * dz);
      gbox(wm, MAT.iron, 0.6, 0.6, dz + 0.5, 0, eqY + 1.1, sz * dz);                               // a beam under each pair of ropes
      for (const s2 of [-1, 1]) { const so = new THREE.Mesh(new THREE.CylinderGeometry(ROPE.d * 0.6, ROPE.d * 1.6, 0.9, 16), MAT.steel); so.position.set(0, ropeEnd - 0.45, sz * dz + s2 * dz / 2); wm.add(so); }       // the sockets
    }
    wm.position.z = 0;
    weight = new Mover(wm, new THREE.Vector3(wx, WIND.top - WH / 2, 27));
    weight.addCollider(R.ColliderDesc.cylinder(WH / 2, WIND.weightR));
    for (const z of ropeZ) { const r = new THREE.Mesh(new THREE.CylinderGeometry(ROPE.d / 2, ROPE.d / 2, 1, 10), MAT.steel); r.position.set(wx, 0, z); G.scene.add(r); ropes.push(r); }
    // Under the weight's fall, standing on the floor, the crib that would stop it if the ropes or the train let go
    // (ROPE): oak baulks laid crosswise, an octagon, its top just under the weight when it has run right down.
    {
      const C = WIND.crib, oak = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.92 }), ro = C.r / Math.cos(Math.PI / 8);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(ro, ro, C.h, 8).rotateY(Math.PI / 8), oak); body.position.set(wx, C.h / 2, 27); G.scene.add(body);
      for (let y = 0.3; y < C.h; y += 0.6) { const band = new THREE.Mesh(new THREE.CylinderGeometry(ro + 0.02, ro + 0.02, 0.04, 8).rotateY(Math.PI / 8), MAT.iron); band.position.set(wx, y, 27); G.scene.add(band); }
      G.world.createCollider(R.ColliderDesc.cylinder(C.h / 2, C.r).setTranslation(wx, C.h / 2, 27));
      // declared: it stands on the raft (what it would put there in stopping the weight is in the check, ROPE)
      assembly('weight crib', 'oak crib under the driving weight\'s fall, standing on the floor').member([wx, 0, 27], [wx, C.h, 27], SECTION.bar(2 * C.r, 2 * C.r), { ...MATERIAL.oak, rho: 0 }, 'beam', 'crib')
        .mass([wx, C.h / 2, 27], ROPE.area * C.h * 750, 'oak').rest([wx, 0, 27], 'ground', 'fix');
    }
    const _wp = new THREE.Vector3();
    placeWeight = (dt) => {
      _wp.set(wx, s.weightTop - WH / 2, 27);
      if (dt) weight.set(_wp, dt); else { weight.pos.copy(_wp); weight.mesh.position.copy(_wp); weight.body.setTranslation(_wp, true); }
      const span = ARBOR.great.y - s.weightTop - ropeEnd; for (const r of ropes) { r.position.y = s.weightTop + ropeEnd + span / 2; r.scale.y = span; }
      collar.position.z = collarOut - 0.4 * s.clutch; lever.rotation.x = Math.atan2(collar.position.z - pz, len);
    };
  }

  // hands (outside the glass) and their shadows (seen from inside, through it). Each is drawn as HANDS designs it: its
  // outline, as deep at the root as its spine and tapering to the tip, its back face flat; a boss on its arbor or pipe;
  // and inside the hall its counterpoise, a lens on a bar, of the weight that balances it.
  {
    const mk = (rotor, H, zShadow) => {
      const holder = new THREE.Group(); holder.rotation.z = -rotor.c; rotor.group.add(holder);
      const shape = new THREE.Shape(H.out.map(p => new THREE.Vector2(...p)));
      gbox(holder, MAT.iron, 0.9, H.arm, 0.4, 0, -H.arm / 2, H.cz);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(H.lensR, H.lensR, H.lensT, 32).rotateX(Math.PI / 2), MAT.iron); lens.position.set(0, -H.arm, H.cz); holder.add(lens);
      ENVELOPES.push({ x: rotor.center.x, y: rotor.center.y, r: H.arm + H.lensR + 0.2, z0: H.cz - Math.max(0.3, H.lensT / 2 + 0.1), z1: H.cz + Math.max(0.3, H.lensT / 2 + 0.1) });
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 }), pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, H.back + pos.getZ(i) * H.depth(pos.getY(i)));
      geo.computeVertexNormals();
      const hand = new THREE.Mesh(geo, MAT.rail); holder.add(hand);          // (the copper painted, as the ironwork is)
      const sh = new THREE.Mesh(new THREE.ShapeGeometry(shape), MAT.shadow); sh.position.z = zShadow; sh.userData.ghost = true; holder.add(sh);
      const boss = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, H.d0 + 0.3, 32).rotateX(Math.PI / 2), MAT.bronze); boss.position.z = H.back + H.d0 / 2; holder.add(boss);
      const a = Math.PI / 2 - rotor.c, len = H.tip;   // direction the hand points in the rotor's own frame
      rotor.addCollider(R.ColliderDesc.cuboid(len / 2, 1.5, H.d0 / 2).setTranslation(Math.cos(a) * len * 0.42, Math.sin(a) * len * 0.42, H.back + H.d0 / 2)
        .setRotation({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) }));
    };
    mk(rCenter, HANDS.minute, 40.55); mk(rHour, HANDS.hour, 40.7);
    const P = HANDS.pipe, pipe = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, P[1] - P[0], 28, 32).rotateX(Math.PI / 2), MAT.steel);      // (in lengths, so that the clearance check tries it all along) pipe.position.z = (P[0] + P[1]) / 2; pipe.userData.shaft = true; rHour.group.add(pipe);       // (it turns in the dial frame's boss)
  }

  // ---- floor gears: always turning, shrouded so you can walk across the mesh
  const floorRotors = [], nips = [];
  {
    const F = FLOOR, t = 1.6, cy = F.top - 0.1 - t / 2;
    const mk = (d) => {
      const s = spec(d.N, F.m, t), r = new Rotor(d.x, cy, d.z, QFLAT);
      const m = new THREE.Mesh(gearGeometry(s), MAT.brass); m.userData.shaft = true; r.group.add(m);        // (its hub is its journal: it sits in the pivot)
      const fg = new THREE.CylinderGeometry(s.r, s.r, 0.1, 96); fg.rotateX(Math.PI / 2);
      const fl = new THREE.Mesh(fg, [MAT.bronze, MAT.turntable, MAT.bronze]); fl.position.z = t / 2 + 0.05; r.group.add(fl);
      addGearColliders(r, s, 0);                                                                      // every tooth is solid: stand in its way and it hits you
      r.addCollider(R.ColliderDesc.cylinder(0.05, s.r).setRotation(QX).setTranslation(0, 0, t / 2 + 0.05));   // the shroud you walk on
      G.tag = 'bearing'; icyl('iron', Math.min(3, s.r * 0.4), cy - t / 2 - 0.02, d.x, (cy - t / 2) / 2, d.z); G.tag = '';       // the pivot it turns on
      ENVELOPES.push({ floor: true, x: d.x, z: d.z, r: s.ra, top: F.top + 0.1, y0: cy - t / 2, y1: F.top });      // (y0, y1: its teeth's underside, and the shroud's top)
      r.spec = s; floorRotors.push(r); return r;
    };
    const h1 = mk(F.h1), h2 = mk(F.h2), h3 = mk(F.h3);
    const flat = (a, b) => Math.atan2(-(b.center.z - a.center.z), b.center.x - a.center.x);
    h1.k = F.w1; h1.c = 0;
    for (const [a, b] of [[h1, h2], [h1, h3]]) {
      b.k = -a.k * a.spec.N / b.spec.N; b.c = meshOffset(flat(a, b), a.spec.N, b.spec.N);
      // Nip guards: an iron plate either side of the mesh, where the gap between the wheels
      // narrows to a body's width. Teeth will knock you about; the nip would not let go.
      const Ra = a.spec.r, Rb = b.spec.r, curv = 1 / Ra + 1 / Rb;
      nips.push({ a: a.center, ra: a.spec.ra - 0.2, b: b.center, rb: b.spec.ra - 0.2 });
      const dx = b.center.x - a.center.x, dz = b.center.z - a.center.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
      const d = Math.sqrt(2 * (1.35 + 2 * F.m) / curv), off = d * d * (1 / Rb - 1 / Ra) / 4;       // where the gap is 1.1 m, and its middle
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-uz, ux));
      for (const sg of [-1, 1]) {
        const gx = a.center.x + ux * (Ra + off) - uz * d * sg, gz = a.center.z + uz * (Ra + off) + ux * d * sg;
        sbox('iron', 1.0, 2.1, 0.12, gx, 1.05, gz, q);
        ibox('rail', 1.1, 0.1, 0.2, gx, 2.15, gz, q);
      }
    }
    // the great floor wheel's hub is held down by a nut on its spindle
    const hn = new THREE.Mesh(NUT, MAT.bronze); hn.scale.set(2.4, 2.4, 1.3); hn.position.z = t / 2 + 0.1 + 0.65; h1.group.add(hn);
    h1.addCollider(R.ColliderDesc.cylinder(0.65, 2.1).setRotation(QX).setTranslation(0, 0, t / 2 + 0.75));
    // the flywheel on the fast pinion's shaft: at the rim, grip runs out
    const fz = F.flyTop - 0.4 - cy;
    const fwg = new THREE.CylinderGeometry(F.flyR, F.flyR, 0.8, 96); fwg.rotateX(Math.PI / 2);
    const fw = new THREE.Mesh(fwg, [MAT.bronze, MAT.turntable, MAT.bronze]); fw.position.z = fz; h3.group.add(fw);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(F.flyR - 0.25, 0.42, 10, 96), MAT.brass); rim.position.z = fz; h3.group.add(rim);
    // The shaft is cranked: it stops below the engine's connecting rod and starts again above it, the two
    // halves joined only by the crank webs and the pin between them (engine/model.js). A straight shaft
    // would stand in the rod's way once every turn.
    h3.addCollider(R.ColliderDesc.cylinder(0.4, F.flyR).setRotation(QX).setTranslation(0, 0, fz));
    for (const [z0, z1] of [[0.4, CRANK.lower - 0.125 - cy], [CRANK.upper + 0.125 - cy, fz + 0.4]]) {
      const fs = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, z1 - z0, 24).rotateX(Math.PI / 2), MAT.steel); fs.position.z = (z0 + z1) / 2; h3.group.add(fs);
      h3.addCollider(R.ColliderDesc.cylinder((z1 - z0) / 2, 1.0).setRotation(QX).setTranslation(0, 0, (z0 + z1) / 2));
    }

    // ways up
    stair([F.h1.x, 0, F.h1.z - h1.spec.ra - 5.6], [F.h1.x, F.top, F.h1.z - h1.spec.ra - 0.25], 3);
    stair([F.h2.x, 0, F.h2.z - h2.spec.ra - 5.6], [F.h2.x, F.top, F.h2.z - h2.spec.ra - 0.25], 3);
    const px0 = F.h3.x + F.flyR + 0.25, px1 = TOWER.hx - 0.4, pzc = F.h3.z;
    deck(px0, px1, pzc - 2, pzc + 2, F.flyTop);
    rail([px0, F.flyTop, pzc - 2], [px1, F.flyTop, pzc - 2]); rail([px0, F.flyTop, pzc + 2], [px1 - 2.5, F.flyTop, pzc + 2]);
    stair([px1 - 1.25, 0, pzc + 2 + F.flyTop / Math.tan(31 * DEG)], [px1 - 1.25, F.flyTop, pzc + 2], 2.3);
    lamp(px0 + 0.2, F.flyTop, pzc - 2);
  }

  // ---- the winding gear: how the engine raises the driving weight
  // Two worms drive the winding wheel, one either side of it, at three o'clock and nine, each on an upright shaft that
  // stands on the floor. The weight's whole pull at the wheel's rim, 16 MN, is shared between them: the worm on the side
  // where the rim comes down pushes it down and is pushed up, the one where it rises pushes it up and is pushed down. So
  // the arbor feels a pure couple, the two pushes being equal and opposite and 18 m apart, and nothing else but the
  // worms' small end-thrust along it; and each worm's half goes straight down its own shaft to a thrust bearing on the
  // floor, one shaft in tension and the other in compression. The torque never enters the tower. (A single worm could
  // not do this: its push on the rim is a force on the arbor, and the arbor's tower, an A-frame with a narrow head, is
  // the worst thing there is to hold 16 MN sideways at the top of.) The teeth also push each worm off the wheel, a third
  // as much again, opposite ways on the two sides; each shaft runs in a pair of radial bearings just above and below its
  // worm, and the four are tied to one another by a yoke through the tower's front frame (world/structure.js), so that
  // pair of forces closes in the yoke too.
  // The idler of the floor train carries an upright stub with a mitre wheel. From it a line shaft runs across the floor to
  // a crown wheel at the foot of the right-hand upright; a cross shaft at the same height takes the drive on from the
  // same crown wheel to the crown wheel at the foot of the left-hand one. The line shaft turns whenever the engine
  // does; its pinion runs loose on the shaft's end, and a dog collar on the shaft's key, between the last bearing and the
  // pinion, locks it on (the floor clutch: on the fast side, where the torque is least). It puts the rest of the winding
  // gear in when winding is due and takes it out when the weight is up: between windings it stands. With the floor
  // clutch in, the dog clutch on the winding wheel's hub goes in too, and the wheel takes the arbor and the barrel round
  // with it and the weight comes up. At the top the floor clutch comes out first: the worms run back (they can be driven
  // backward) until a click of the going ratchet holds the weight, and only then, unloaded, does the dog clutch come out.
  // The four clicks are a quarter of a tooth apart, so one drops home every 164 mm of rope; the trip that ends winding
  // is set on the barrel just past where one does, so the weight settles back by that click's clearance, a few mm.
  let windSpeed;
  {
    const st = MAT.steel, h2 = floorRotors[1], ar = ARBOR.great, wz = WIND.z, m = S.wind.m, N = WIND.teeth, off = WIND.wheelR + WIND.wormR;
    const xs = [ar.x + off, ar.x - off];                             // the right-hand upright, which the line shaft drives, and the left
    const A1 = new THREE.Vector3(FLOOR.h2.x, WIND.shaftY, FLOOR.h2.z), A2 = new THREE.Vector3(xs[0], WIND.shaftY, wz);
    const d = A2.clone().sub(A1), len = d.length(); d.normalize();
    const DOWN = new THREE.Vector3(0, -1, 0), WEST = new THREE.Vector3(-1, 0, 0), EAST = new THREE.Vector3(1, 0, 0), back = d.clone().negate(), span = xs[0] - xs[1];
    const mitre = { N: 18, r: 1.0, face: 0.5 }, pin = { N: 15, r: 0.75 }, crown = { N: 54, r: 2.7 }, cp = Math.atan(pin.N / crown.N);
    const add = (group, geo, z = 0, flip = false) => { const mesh = new THREE.Mesh(geo, st); mesh.position.z = z; if (flip) mesh.rotation.x = Math.PI; mesh.userData.shaft = !!geo.userData.shaft; group.add(mesh); return mesh; };
    const rod = (r, z0, z1) => { const g = new THREE.CylinderGeometry(r, r, z1 - z0, 20).rotateX(Math.PI / 2).translate(0, 0, (z0 + z1) / 2); g.userData.shaft = true; return g; };
    const mitreGeo = bevelGeometry(mitre.N, mitre.r, mitre.face, Math.PI / 4), pinGeo = bevelGeometry(pin.N, pin.r, 0.6, cp, 0.5, 0.8), crownGeo = bevelGeometry(crown.N, crown.r, 0.6, Math.PI / 2 - cp, 0.9, 0.9);
    const along = (p, u, t) => p.clone().addScaledVector(u, t), V = (x, y) => new THREE.Vector3(x, y, wz);
    // the idler's stub and its mitre wheel, teeth uppermost
    const cy = h2.center.y, top = WIND.shaftY - 0.3 - cy;
    add(h2.group, rod(0.45, 0.9, top)); add(h2.group, mitreGeo, WIND.shaftY - cy);
    h2.addCollider(R.ColliderDesc.cylinder((top - 0.9) / 2, 1.1).setRotation(QX).setTranslation(0, 0, (top + 0.9) / 2));
    // the line shaft: a mitre wheel at this end, a pinion at the other
    const lineR = 0.28, shaft = new Spinner(A1, d), lineHead = new Spinner(A1, d); shaft.k = lineHead.k = h2.k;
    add(lineHead.group, rod(lineR, 0.6, len - 2.4)); add(lineHead.group, mitreGeo, 0, true); add(shaft.group, pinGeo, len);
    meshBevels(h2, DOWN, lineHead, d, TAU / mitre.N); shaft.c = lineHead.c;
    // the floor clutch: a dog collar on the line shaft's key, thrown in and out by a fork, and the dogs on the back of the
    // pinion's hub, which it takes hold of (between the last bearing, 4.6 m from the end, and the pinion)
    for (const [g, t0, l, r] of [[lineHead.group, len - 4.0, 0.3, 0.55], [shaft.group, len - 3.7, 0.2, 0.5]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 20).rotateX(Math.PI / 2), MAT.bronze); c.position.z = t0 + l / 2; g.add(c); }
    solidCyl(along(A1, d, 1.9), along(A1, d, len - 3.7), lineR + 0.02); solidCyl(along(A1, d, 0.5), along(A1, d, 1.9), 1.15); solidCyl(along(A1, d, len - 3.7), along(A1, d, len - 2.3), 0.9);
    // The two upright shafts: solid steel, 1.2 m through, each with a crown wheel at its foot under the horizontal
    // shafts and its worm level with the arbor. The left-hand one is pushed down by its worm, and the arms that keep
    // it in line can reach it only below and above the driving weight's fall (36 m and 90 m up, structure.js): 54 m
    // unheld between, under its half of the pull and most of its own weight, a shaft a metre through would buckle
    // at 2.4 times its greatest push, short of the 2.5 every frame here is held to; at 1.2 m it is 4.2. Both are
    // made alike (one pattern, one set of bearings, a spare that fits either side). Their own weight (1,120 t each)
    // stands on their footsteps too, which matters for the one the worm pulls up: it is most of what holds that one
    // down (see structure.js).
    const upR = 0.6, head = 2.7, yc = ar.y;
    const upright = (x) => { const u = new Spinner(V(x, yc), YUP); add(u.group, rod(upR, 0.6 - yc, head)); add(u.group, crownGeo, WIND.shaftY - yc); return u; };
    const uR = upright(xs[0]), uL = upright(xs[1]);
    uR.k = -shaft.k * pin.N / crown.N;                               // the crown wheel turns 3.6 times slower than the line shaft
    meshBevels(shaft, back, uR, DOWN, TAU / crown.N);
    // the cross shaft, from beside the right-hand crown wheel to beside the left-hand one, a pinion at each end
    const cross = new Spinner(A2, WEST); cross.k = uR.k * crown.N / pin.N;
    add(cross.group, rod(lineR, 2.4, span - 2.4)); add(cross.group, pinGeo, 0, true); add(cross.group, pinGeo, span);
    meshBevels(uR, DOWN, cross, WEST, TAU / pin.N);
    // Both crown wheels are under their pinions, so the left-hand upright turns the other way to the right-hand one:
    // the worms' thread then has to be of the same hand on both, for each to drive its side of the rim the way it goes.
    uL.k = -uR.k;
    meshBevels(cross, EAST, uL, DOWN, TAU / crown.N);
    // The worms. The thread's surface where it meets the wheel moves along the shaft at -hand * pitch * omega / 2 pi: on
    // the right, where the rim comes down, that must be downward, so the hand goes with the right-hand shaft's turning.
    const hand = Math.sign(uR.k) || 1, wormGeo = wormGeometry(WIND.wormR, m, 3.2, hand);
    add(uR.group, wormGeo); const wL = add(uL.group, wormGeo);
    // Each colliding solid: the shaft, the crown wheel's hub and its toothed body (as drawn: the teeth from 4.33 to 4.69 m
    // up, 2.73 m out at most; the hub below them, 0.9 m round), the worm, the shaft above it. The worm's core runs on a
    // little past its thread (+-1.85 m); its bearings stand clear of that.
    for (const x of xs) {
      solidCyl(V(x, 0.6), V(x, 3.45), upR + 0.02); solidCyl(V(x, 3.45), V(x, 4.3), 0.95); solidCyl(V(x, 4.3), V(x, 4.74), 2.78); solidCyl(V(x, 4.74), V(x, yc - 1.9), upR + 0.02);
      solidCyl(V(x, yc - 1.9), V(x, yc + 1.9), WIND.wormR + m + 0.02); solidCyl(V(x, yc + 1.9), V(x, yc + head), upR + 0.02);
    }
    const alongW = (t) => along(A2, WEST, t);
    solidCyl(alongW(3.7), alongW(span - 3.7), lineR + 0.02); solidCyl(alongW(2.3), alongW(3.7), 0.9); solidCyl(alongW(span - 3.7), alongW(span - 2.3), 0.9);
    spinners.push(lineHead); winder.push(shaft, uR, cross, uL);
    // The wheel turns one tooth for each turn of a worm, and the right-hand worm's thread sits in a space between its
    // teeth. (Its teeth are at j 2 pi / N on it, its spaces half way between. A crest of the worm on the side facing the
    // wheel, angle pi in the shaft's own frame, is at height hand p (pi - a) / 2 pi for the shaft at angle a; the wheel's
    // spaces pass three o'clock at heights R (theta + (j + 1/2) 2 pi / N).) The left-hand worm, whose shaft turns the other
    // way, is then turned on its shaft so that its thread, facing the wheel at angle 0, sits in a space at nine o'clock,
    // where the spaces are at heights -R (theta + (j + 1/2) 2 pi / N - pi) (N being even, pi R is a whole number of pitches).
    rWind.k = -hand * uR.k / N;                                      // negative: clockwise from the dial, the way that raises the weight
    rWind.c = (hand * (Math.PI - uR.c) - Math.PI) / N;
    wL.rotation.z = hand * (N * rWind.c - Math.PI) - uL.c;
    windSpeed = Math.abs(rWind.k) * WIND.barrelR;                    // m/s the weight rises, in clutch, at the engine's governed speed
    // what the engineer needs to know to hold all this up. The forces are those while the weight is wound, per worm:
    // along its shaft, half the weight's pull at the rim; pushing it off the wheel, that times tan 20 degrees; and across,
    // the turning force of its own torque, tan(lead + friction) of the push along it, the friction being what makes the
    // gear's efficiency (the whole winding train's, taken as all in the worms: the most it can be).
    const tooth = weightKg * GRAV * WIND.barrelR / WIND.wheelR, half = tooth / 2;
    const lead = Math.atan(Math.PI * m / (TAU * WIND.wormR)), turning = half * Math.tan(lead) / WIND.efficiency, sense = Math.sign(uR.k) || 1;
    // The bevels at each crown wheel: tangential F (the torque the upright carries, 'turning' x wormR, over the crown
    // wheel's radius), and the 20 degree teeth push the pinion up off it (F tan 20 cos of its cone) and the crown wheel
    // out along its own axis, downward (the same), and apart sideways (F tan 20 sin). On the right-hand crown wheel the
    // line shaft's pinion delivers both shafts' torque and the cross shaft's takes the left one's away.
    const T1 = turning * WIND.wormR, F1 = T1 / crown.r, tz = Math.tan(20 * DEG);
    const onCrown = (F, u, driven, s) => { const t = new THREE.Vector3(0, 1, 0).cross(u).multiplyScalar(s * (driven ? F : -F)); return t.addScaledVector(u, -F * tz * Math.sin(cp)).add(new THREE.Vector3(0, -F * tz * Math.cos(cp), 0)); };
    const fLine = onCrown(2 * F1, back, true, sense), fCrossR = onCrown(F1, WEST, false, sense), fCrossL = onCrown(F1, EAST, true, -sense);
    const crownY = WIND.shaftY - crown.r * Math.tan(cp);            // height of the crown wheels' pitch circles
    Object.assign(WINDGEAR, {
      A1: A1.toArray(), d: d.toArray(), len, lineY: WIND.shaftY, lineKg: cylinderMass(lineR, len) + 9e3, lineBearings: [2.5, 10.6, 19.6, 28.6, len - 4.6],
      mitrePush: windSpeed * weightKg * GRAV / WIND.efficiency / Math.abs(shaft.k) / (mitre.r * 0.85),       // N at the teeth of the first mitre wheels
      wz, y: yc, upR, top: yc + head, bearings: [yc - 2.3, yc + 2.3],          // the uprights' radial bearings either side of the worms
      crownKg: 22e3, wormKg: cylinderMass(WIND.wormR, 3.2) + 6e3, crownY,
      // each upright: where it stands, which way the teeth push its worm (up on the right, down on the left; off the
      // wheel; across), and what the bevels do to its crown wheel
      uprights: [{ name: 'right', x: xs[0], side: 1, push: [half * tz, half, -sense * turning], crown: fLine.clone().add(fCrossR).toArray() },
        { name: 'left', x: xs[1], side: -1, push: [-half * tz, -half, -sense * turning], crown: fCrossL.toArray() }],
      half, apart: half * tz, turning, thrust: 2 * sense * turning,     // and the arbor: the worms' turning forces, both the same way, along it
      // what turns while it winds, for the engine's load: kg, the radius its weight bears at, how fast it turns
      always: [[cylinderMass(lineR, len) + 9e3, lineR, shaft.k]], turns: [[4e3, lineR, shaft.k], [cylinderMass(lineR, span) + 1e4, lineR, cross.k], ...[0, 1].map(() => [cylinderMass(upR, yc + head - 0.6) + 22e3 + cylinderMass(WIND.wormR, 3.2) + 6e3, upR / 2, uR.k])],
    });
    // every line shaft that wants trestles under it, and the pushes of its bevels on the trestle nearest each (the cross
    // shaft has a trestle under every bearing: neither end is over a wheel)
    const toArr = (v) => v.toArray().map(c => -c);
    // (and for the structure, each shaft's radius and length and what it carries along it, [t, kg]: its wheels)
    WINDGEAR.shafts = [{ A1: A1.toArray(), d: d.toArray(), kg: WINDGEAR.lineKg, bearings: WINDGEAR.lineBearings, load: 1, ends: [{ t: len - 2.7, push: toArr(fLine) }], r: lineR, len, masses: [[0, 4e3], [len, 5e3]] },
      { A1: A2.toArray(), d: WEST.toArray(), kg: cylinderMass(lineR, span) + 2 * 5e3, bearings: [4.6, span / 2, span - 4.6], load: 0, jib: false, ends: [{ t: 2.7, push: toArr(fCrossR) }, { t: span - 2.7, push: toArr(fCrossL) }], r: lineR, len: span, masses: [[0, 5e3], [span, 5e3]] }];
    WINDGEAR.stands = [];
    // The arbor: the two halves of the weight's pull at the rim are a couple, which turns it and the barrel and lifts the
    // weight; the worms' turning forces push the wheel along the arbor, both the same way, into its thrust collar at the
    // front bearing, where the yoke that holds the worms takes it back (structure.js).
    assembly('arbor great').force([ar.x, ar.y, WIND.z], [0, 0, WINDGEAR.thrust], 'the worms, while winding: their push along the arbor', 'winding');
    // The maintaining ring, loose on the arbor, is held at six o'clock by the detent while the weight is wound, and its
    // springs push it back on the pawl with what they are set up to, at its teeth, 7.7 m out (world/structure.js 1c).
    // It pushes the arbor the other way as hard: the great tower takes a couple, the detent's push and this.
    assembly('arbor great').force([ar.x, ar.y, LAYER.C - hubHalf(S.great) - 0.3], [MAINT.set * ROPE.W * WIND.barrelR / 7.7, 0, 0], 'the maintaining ring, held by the detent', 'winding');
  }

  // ---- the lift: a paternoster
  // Two endless chains run over a pair of wheels at the top of the shaft and a pair at the bottom. Each car hangs
  // from an axle between the chains, so it stays upright as it goes over the top and under the bottom, and the cars
  // going up balance the cars coming down. It never stops: you step on and off as a car passes. The bottom wheels
  // are turned by crossed belts from a second line shaft off the idler's mitre wheel, so the lift runs when the engine does.
  const platforms = []; let placeLifts;
  {
    const L = LIFT, R3 = (L.xd - L.xu) / 2, xm = (L.xu + L.xd) / 2, run = L.yt - L.yb, half = Math.PI * R3, loop = 2 * run + 2 * half, zs = [L.z - L.hz - L.chain, L.z + L.hz + L.chain];
    const h2 = floorRotors[1], A1 = new THREE.Vector3(FLOOR.h2.x, WIND.shaftY, FLOOR.h2.z), dB = new THREE.Vector3(0, 0, -1), DOWN = new THREE.Vector3(0, -1, 0);
    // where the chain is, d metres round the loop from the foot of the rising side, and which way it is heading there
    const at = (d, out, tan) => {
      d = ((d % loop) + loop) % loop;
      if (d < run) { out.set(L.xu, L.yb + d, 0); if (tan) tan.set(0, 1, 0); }
      else if (d < run + half) { const u = (d - run) / R3; out.set(xm - R3 * Math.cos(u), L.yt + R3 * Math.sin(u), 0); if (tan) tan.set(Math.sin(u), Math.cos(u), 0); }
      else if (d < 2 * run + half) { out.set(L.xd, L.yt - (d - run - half), 0); if (tan) tan.set(0, -1, 0); }
      else { const u = (d - 2 * run - half) / R3; out.set(xm + R3 * Math.cos(u), L.yb - R3 * Math.sin(u), 0); if (tan) tan.set(-Math.sin(u), -Math.cos(u), 0); }
      return out;
    };
    // The cars: a deck, and at each end a pair of hangers up to the axle it swings from. A car passes between the two
    // wheels of each pair, top and bottom, so everything on it but the axle stays inside the deck's own width. The last
    // of the deck on each open side slopes down to its edge: if the deck has come up a hand's breadth past the landing by
    // the time you reach it, you walk up the slope instead of into the edge of the deck.
    const flat = L.hz - L.sill, tilt = 0.45, drop = L.sill * Math.tan(tilt), zArm = L.hz - 0.06;
    const deckGeo = new THREE.BoxGeometry(L.hx * 2, L.deck, flat * 2).translate(0, -L.deck / 2, 0), armLen = Math.hypot(L.hx - 0.15, L.hang), lean = Math.atan2(L.hx - 0.15, L.hang);
    LIFTGEAR.own = new Set();
    for (let i = 0; i < L.cars; i++) {
      const car = new THREE.Mesh(deckGeo, MAT.plate);
      const mv = new Mover(car, new THREE.Vector3(L.xu, L.yb, L.z));
      LIFTGEAR.own.add(mv.addCollider(R.ColliderDesc.cuboid(L.hx, L.deck / 2, flat).setTranslation(0, -L.deck / 2, 0)).handle);
      for (const sz of [-1, 1]) {
        // the sloping sill (shallow: a steeper one is a wall to anyone walking onto it), and the edge bar under its lip
        const q = sz * tilt, zc = sz * (L.hz - L.sill / 2), yc = -drop / 2 - 0.02 * Math.cos(tilt);
        gbox(car, MAT.plate, 2 * L.hx, 0.04, L.sill / Math.cos(tilt), 0, yc, zc).rotation.x = q;
        LIFTGEAR.own.add(mv.addCollider(R.ColliderDesc.cuboid(L.hx, 0.02, L.sill / Math.cos(tilt) / 2).setTranslation(0, yc, zc).setRotation({ x: Math.sin(q / 2), y: 0, z: 0, w: Math.cos(q / 2) })).handle);
        gbox(car, MAT.bronze, 2 * L.hx, 0.06, 0.06, 0, -L.deck + 0.03, sz * (L.hz - 0.03));
        // the hangers stand on a foot at each corner, inside the deck's edge
        for (const sx of [-1, 1]) {
          gbox(car, MAT.rail, 0.14, armLen, 0.1, sx * (L.hx - 0.15) / 2, L.hang / 2, sz * zArm).rotation.z = sx * lean;
          gbox(car, MAT.rail, 0.2, L.deck, 0.1, sx * (L.hx - 0.1), -L.deck / 2, sz * zArm);
        }
      }
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2 * (L.hz + L.chain) + 0.3, 12).rotateX(Math.PI / 2), MAT.steel); axle.position.y = L.hang; axle.userData.axle = true; car.add(axle);
      platforms.push(mv);
    }
    // the four chain wheels, each on a stub axle in a bearing on its outer side: nothing can cross between them, where the cars pass
    const ws = spec(L.teeth, 2 * R3 / L.teeth, 0.3, { spokes: 6, spokeW: 0.3, hubR: 0.7, rimIn: R3 - 0.55 }), wheelGeo = gearGeometry(ws), wheels = [];
    const cyl = (r, z0, z1) => new THREE.CylinderGeometry(r, r, Math.abs(z1 - z0), 28).rotateX(Math.PI / 2).translate(0, 0, (z0 + z1) / 2);
    const pulleyR = L.driven, belts = [];      // the driven pulleys are the larger: the chain runs at walking pace, slow enough to step on and off
    for (const y of [L.yb, L.yt]) for (const z of zs) {
      const w = new Spinner(new THREE.Vector3(xm, y, z), ZAXIS), out = z < L.z ? -1 : 1;
      w.group.add(new THREE.Mesh(wheelGeo, MAT.iron));
      const stub = new THREE.Mesh(cyl(0.22, 0, out * (y === L.yb ? 1.8 : 1.15)), MAT.steel); stub.userData.shaft = true; w.group.add(stub);       // wheel, then its bearing, then (below) the belt pulley
      if (y === L.yb) { w.group.add(new THREE.Mesh(cyl(pulleyR, out * 1.2, out * 1.7), MAT.iron)); belts.push(z + out * 1.45); }
      LIFTGEAR.wheels.add(solidCyl(new THREE.Vector3(xm, y, z - 0.15), new THREE.Vector3(xm, y, z + 0.15), R3 + 0.28).handle);
      wheels.push(w);
      WINDGEAR.stands.push(y === L.yb ? { foot: true, top: [xm, y - 0.45, z + out * 0.75], feet: [[xm - R3, 0.4, z + out * 0.75], [xm + R3, 0.4, z + out * 0.75]], kg: 6e3 } : { head: true, p: [xm, y, z + out * 0.75] });
    }
    // the chains: links carried round with the cars
    // The chains: roller chain, a roller on every pin and a pair of side plates from each pin to the next, the pairs
    // alternately inside and outside one another. One link to a tooth; a car hangs from every fourteenth pin.
    const n = Math.round(loop / L.pitch), plates = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), MAT.rail, 4 * n), rollers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 10).rotateX(Math.PI / 2), MAT.steel, 2 * n);
    for (const im of [plates, rollers]) { im.frustumCulled = false; G.scene.add(im); }
    // the line shaft that drives it, from the same mitre wheel on the idler as the winding gear's, and its two belt pulleys
    const len = FLOOR.h2.z - belts[0] + 0.7, shaft = new Spinner(A1, dB); shaft.k = h2.k;
    const rodG = cyl(0.2, 0.6, len); rodG.userData.shaft = true;
    const rodM = new THREE.Mesh(rodG, MAT.steel); rodM.userData.shaft = true; shaft.group.add(rodM);
    const mit = new THREE.Mesh(bevelGeometry(18, 1.0, 0.5, Math.PI / 4), MAT.steel); mit.rotation.x = Math.PI; shaft.group.add(mit);
    for (const z of belts) shaft.group.add(new THREE.Mesh(cyl(L.pulley, FLOOR.h2.z - z - 0.25, FLOOR.h2.z - z + 0.25), MAT.iron));
    meshBevels(h2, DOWN, shaft, dB, TAU / 18);
    solidCyl(new THREE.Vector3(A1.x, A1.y, A1.z - 1.9), new THREE.Vector3(A1.x, A1.y, A1.z - len), 0.22); solidCyl(new THREE.Vector3(A1.x, A1.y, A1.z - 0.5), new THREE.Vector3(A1.x, A1.y, A1.z - 1.9), 1.15);
    spinners.push(shaft);
    WINDGEAR.shafts.push({ A1: A1.toArray(), d: dB.toArray(), kg: cylinderMass(0.2, len) + 14e3, bearings: [2.5, 11, 20, 29, 38, len - 9.4, len - 3.9], load: 0.15, r: 0.2, len, masses: [[0, 4e3], ...belts.map(z => [FLOOR.h2.z - z, 5e3])] });       // (the last is between the two pulleys)
    // crossed belts, which turn the wheels the opposite way to the shaft: the way that takes the near side up
    G.tag = 'bearing';
    for (const z of belts) for (const sg of [-1, 1]) beam('rail', [A1.x, A1.y + sg * L.pulley, z + sg * 0.07], [xm, L.yb - sg * pulleyR, z + sg * 0.07], 0.03, 0.4);
    G.tag = '';
    const speed = Math.abs(shaft.k) * L.pulley / pulleyR * R3;       // metres a second, at the engine's governed speed
    const _lp = new THREE.Vector3(), _lt = new THREE.Vector3(), _lm = new THREE.Matrix4(), _lq = new THREE.Quaternion(), _l1 = new THREE.Vector3(1, 1, 1), _l2 = new THREE.Vector3();
    LIFTGEAR.car = platforms[0].mesh; LIFTGEAR.loop = loop; LIFTGEAR.at = (d, out) => { at(d, out); out.y -= L.hang; out.z = L.z; return out; };
    placeLifts = (dt) => {
      const d0 = speed * s.floorA;
      platforms.forEach((mv, i) => {
        at(d0 + i * loop / L.cars, _lp); _lp.y -= L.hang; _lp.z = L.z;
        if (dt) mv.set(_lp, dt); else { mv.pos.copy(_lp); mv.mesh.position.copy(_lp); mv.body.setTranslation(_lp, true); }
      });
      for (const w of wheels) w.set(-d0 / R3 + Math.PI / L.teeth);              // a gap between teeth under every roller
      let k = 0, r = 0;
      for (const z of zs) for (let j = 0; j < n; j++) {
        at(d0 + j * L.pitch, _lp); at(d0 + (j + 1) * L.pitch, _lt);
        _lq.setFromAxisAngle(ZAXIS, Math.atan2(_lt.y - _lp.y, _lt.x - _lp.x)); _l2.set(_lp.distanceTo(_lt) + 0.24, 0.2, 0.035);
        _lt.add(_lp).multiplyScalar(0.5);
        for (const sg of [-1, 1]) { _lt.z = z + sg * (j % 2 ? 0.125 : 0.085); plates.setMatrixAt(k++, _lm.compose(_lt, _lq, _l2)); }
        _lp.z = z; rollers.setMatrixAt(r++, _lm.compose(_lp, _lq, _l1));
      }
      plates.instanceMatrix.needsUpdate = true; rollers.instanceMatrix.needsUpdate = true;
    };
  }

  // ------------------------------------------------------------ simulation
  const MU = 0.003;                                  // friction of a journal in its bearing: roller bearings (plain ones, at these loads and this slowly, would stall the clock)
  // One step of the pendulum and the two arms. An arm is 'up' (held up by a pin, the wheel locked on its stop),
  // 'ride' (resting on the pendulum) or 'low' (set down on the next pin). Returns 1 or -1 when the pendulum takes
  // the right or left arm off its pin, which is what unlocks the wheel.
  // (p.stalled: the escape wheel has nothing to turn it. The pendulum still takes an arm off its pin as it comes out, but
  // gives it back to the same pin on its way in, and gets back no more than it gave.)
  const stepPendulum = (p, len, dt) => {
    p.om += (-(GRAV / len) * Math.sin(p.th) - AIR * p.om - (p.R === 'ride' || p.R === 'free' ? ARM : 0) + (p.L === 'ride' || p.L === 'free' ? ARM : 0)) * dt;
    p.th += p.om * dt;
    let ev = 0;
    if (p.stalled) {
      for (const [k, a, sg] of [['R', 'aR', 1], ['L', 'aL', -1]]) {
        const th = sg * p.th, pin = p[k] === 'up' ? G_UP : G_LOW;
        if (p[k] !== 'free' && p[k] !== 'ride' && th >= pin) { p[k] = 'free'; p['pin' + k] = pin; }
        if (p[k] === 'free') { if (th < p['pin' + k]) { p[k] = p['pin' + k] === G_UP ? 'up' : 'low'; p[a] = p['pin' + k]; } else p[a] = th; }
      }
      if (p.R !== 'ride' && p.L !== 'ride') return 0;
    }
    if (p.R === 'up' && p.th >= G_UP) { p.R = 'ride'; ev = 1; }
    if (p.R === 'ride') { if (p.th <= G_LOW) { p.R = 'low'; p.aR = G_LOW; } else p.aR = p.th; }
    if (p.L === 'up' && -p.th >= G_UP) { p.L = 'ride'; ev = -1; }
    if (p.L === 'ride') { if (-p.th <= G_LOW) { p.L = 'low'; p.aL = G_LOW; } else p.aL = -p.th; }
    return ev;
  };
  // Rating. The arms hurry the pendulum a little and its arc slows it a little, so its length is found by trial,
  // as a clockmaker finds it with the rating nut: run it, time it, adjust, until it beats ten seconds.
  const beatOf = (len) => {
    const p = { th: -TH0, om: 0, R: 'up', L: 'ride', aR: G_UP, aL: TH0 }, dt = 1 / 60;
    let first = 0, last = 0, count = 0;
    for (let i = 1; i <= 60 * 250; i++) {
      const ev = stepPendulum(p, len, dt);
      if (!ev) continue;
      if (ev > 0) { p.L = 'up'; p.aL = G_UP; } else { p.R = 'up'; p.aR = G_UP; }
      if (!count++) first = i * dt; else last = i * dt;
    }
    return (last - first) / (count - 1);
  };
  let Leff = L;
  for (let k = 0, l0 = L, b0 = beatOf(L); k < 6; k++) { const l1 = l0 * (10 / b0) ** 2, b1 = beatOf(l1); Leff = l1; if (Math.abs(b1 - 10) < 2e-4) break; l0 = l1; b0 = b1; }
  const beatsNow = () => { const d = new Date(); return Math.floor(((d.getHours() % 12) * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 10); };
  const s = { n: beatsNow(), th: 0, om: 0, R: 'up', L: 'ride', aR: G_UP, aL: TH0, lift: 'L', dropT: 10, landed: true, phi: 0, rate: 0.1, floorA: 0, floorRate: 1,
    weightTop: WIND.top, winding: false, barrelA: 0, aPrev: 0, clutch: 0, windA: 0,   // n: beats since 12:00; floorRate: set by the steam engine; windA: how far the winding gear has turned
    ew: 0, ea: STEP, fw: 0, fa: 0, lockJ: 0,                             // the escape wheel's speed and how far through its step; the fly's speed and angle; the last locking blow, J
    drive: true, stalled: false, ms: MAINT.travel, arc: TH0, omPrev: 0 };  // what drives the train; the escapement stopped; the maintaining springs' travel left; the swing
  // At an even count the wheel is locked on the right-hand arm, which a pin holds up, and the pendulum is away to the
  // left with the left-hand arm resting on it; at an odd count, the other way about.
  const rest = () => {
    const right = s.n % 2 !== 0;
    s.th = (right ? 1 : -1) * TH0; s.om = 0; s.dropT = 10; s.landed = true; s.ea = STEP; s.ew = 0; s.stalled = false; s.arc = TH0;
    s.R = right ? 'ride' : 'up'; s.aR = right ? TH0 : G_UP; s.L = right ? 'up' : 'ride'; s.aL = right ? G_UP : TH0;
  };
  rest();
  // How far the escape wheel has got through its sixth of a turn. Nothing drives it but the remontoire's weight,
  // against its own inertia: it gathers speed steadily and is stopped dead by the next leg meeting the other stop.
  const turned = () => s.landed ? 1 : Math.min(1, s.ea / STEP);
  const escaped = () => s.n - 1 + turned();                // beats the escape wheel has let go, counting part-turns
  // The train does not stop and start: 60,000 t of wheels could not. It turns all the time, held back by its
  // brake. What the escape wheel has let go and what the train has delivered differ by the angle of the
  // remontoire's arm, and the arm sets the brake: if the train gets ahead the arm rises and the brake bites
  // harder, if it falls behind the brake eases. The train so follows the escapement on average, never beat by beat.
  const LAG = 0.7, RUN = 2, alpha = () => (s.phi + LAG) * STEP;
  // The leaves: in the pendulum's own frame, each is pushed back at its top by as much as the pendulum has turned, and
  // that dies away below over about lambda: a leaf that stays upright in its clamp and then follows the rod.
  const bendLeaves = (th) => {
    const p = leafGeo.attributes.position.array, c = lf.clampY - PEND.pivotY, e = Math.exp(-lf.free / lf.lambda);
    for (let i = 0; i < p.length; i += 3) { const d = Math.min(lf.free, Math.max(0, c - leafX0[i + 1])); p[i] = leafX0[i] + th * lf.top * lf.lambda * (Math.exp(-d / lf.lambda) - d / lf.free * e); }
    leafGeo.attributes.position.needsUpdate = true;
  };
  function tick(ev) {
    s.n++; s.dropT = 0; s.landed = false; s.ea = 0; s.ew = 0; s.lift = ev > 0 ? 'L' : 'R';      // the arm on the other side is the one the wheel now lifts
    emit('release', s.n);
  }

  const setTrain = () => {
    pen.init(s.th); s.phi = escaped() - LAG; s.rate = 0.1;
    const a = alpha(); s.aPrev = a;
    for (const r of train) r.init(r.k * a + r.c);
    rE.init(escaped() * STEP);
  };
  setTrain();
  {
    // Where the weight is now, by the wall clock: it falls for about half an hour and is wound up in a little over three minutes.
    const fallT = WIND.band / fall, windT = WIND.band / windSpeed, t0 = (Date.now() / 1000) % (fallT + windT);
    s.winding = t0 >= fallT; s.clutch = s.winding ? 1 : 0;
    s.weightTop = s.winding ? WIND.top - WIND.band + windSpeed * (t0 - fallT) : WIND.top - fall * t0;
    s.barrelA = rGreat.angle; rBarrel.init(s.barrelA); rWind.init(rWind.c);
    trip.rotation.z = -Math.PI / 2 - (s.barrelA - (WIND.top - s.weightTop) / WIND.barrelR);          // one arm hangs straight down when the weight is at the top, the other when it is due for winding
    placeWeight(0);
  }
  for (const r of floorRotors) r.init(r.c);
  placeLifts(0);

  function update(dt) {
    const ev = stepPendulum(s, Leff, dt);
    if (ev) tick(ev);
    if (Math.sign(s.om) !== Math.sign(s.omPrev)) s.arc = Math.abs(s.th); s.omPrev = s.om;      // the swing, at each end of it
    s.dropT += dt;
    if (!s.landed) {
      wheelStep(s, dt);
      // a lifting pin pushes the set-down arm's pallet outward as the wheel turns
      const lifted = G_LOW + (G_UP - G_LOW) * turned();
      if (s.lift === 'L') { s.L = 'lift'; s.aL = lifted; } else { s.R = 'lift'; s.aR = lifted; }
      if (s.ea >= STEP) {
        s.lockJ = 0.5 * escI * s.ew * s.ew; s.ew = 0; s.ea = STEP;            // the leg meets the stop: the wheel stops dead, the fly runs on
        s.landed = true; if (s.lift === 'L') { s.L = 'up'; s.aL = G_UP; } else { s.R = 'up'; s.aR = G_UP; }
        emit('impact', s.n);
        if (s.n % 360 === 0) emit('hour', (s.n / 360) % 12 || 12); else if (s.n % 360 === 180) emit('half');
      }
    }
    if (s.landed) s.fw = Math.max(0, s.fw - flyC * s.fw * s.fw / flyI * dt);
    s.fa += s.fw * dt; fly.set(s.fa);
    pen.set(s.th, dt); bendLeaves(s.th);
    armR.rotation.z = s.aR - G_UP; armL.rotation.z = G_UP - s.aL;
    // What drives the train: the weight, unless it has run down onto the crib; while it is being wound, the maintaining
    // springs, until their travel is spent. With it, the train's speed answers slowly to the brake, and the brake to how
    // far it lags the escapement; without it, the brake stops the train in a few seconds.
    s.drive = s.weightTop > WIND.bottom + 1e-6 && !(s.winding && s.ms <= 0);
    const lag = escaped() - s.phi;
    if (s.drive) s.rate += (0.1 * (1 + 0.5 * (lag - LAG)) - s.rate) * dt / 20; else s.rate *= Math.exp(-dt / 4);
    s.phi += s.rate * dt;
    // The remontoire's arm can fall RUN steps below where the train keeps it before it lies on its banking; after that
    // the escape wheel has nothing to turn it, and the escapement stops, until the train has wound the arm up again.
    if (!s.stalled && s.landed && lag > LAG + RUN) s.stalled = true; else if (s.stalled && lag < LAG + RUN - 0.5 && s.R !== 'free' && s.L !== 'free') s.stalled = false;
    const a = alpha(), esc = escaped() * STEP;
    for (const r of train) r.set(r.k * a + r.c, dt);
    rE.set(esc, dt);
    const spiderA = (rEsc.angle + esc) / 2, spin = (rEsc.angle - esc) / 2;      // the differential: its arm turns by half the sum, its planet wheels by half the difference
    spider.set(spiderA); planets[0].rotation.z = spin; planets[1].rotation.z = -spin;
    s.floorA += dt * s.floorRate;
    for (const r of floorRotors) r.set(r.k * s.floorA + r.c, dt);
    placeLifts(dt);
    // The driving weight. Out of clutch the barrel goes round with the great wheel, through the ratchet, and
    // the weight comes down; in clutch it goes round with the winding wheel instead, and the weight comes up.
    const dG = rGreat.k * (a - s.aPrev); s.aPrev = a;
    s.ms = s.winding ? Math.max(0, s.ms - Math.abs(dG) * MAINT.r) : MAINT.travel;      // the maintaining springs give while the barrel is turned back, and are pressed up again after
    if (s.weightTop <= WIND.top - WIND.band) s.winding = true; else if (s.weightTop >= WIND.top) s.winding = false;
    const dB = s.winding ? rWind.k * dt * s.floorRate : dG;
    s.barrelA += dB; s.weightTop = Math.min(WIND.top, Math.max(WIND.bottom, s.weightTop - WIND.barrelR * dB));
    s.clutch += Math.max(-dt * 1.5, Math.min(dt * 1.5, (s.winding ? 1 : 0) - s.clutch));
    if (s.winding) s.windA += dt * s.floorRate;                     // the floor clutch is in only while winding is due
    rBarrel.set(s.barrelA, dt); rWind.set(rWind.k * s.windA + rWind.c, dt);
    for (const sp of spinners) sp.set(sp.k * s.floorA + sp.c);
    for (const sp of winder) sp.set(sp.k * s.windA + sp.c);
    placeWeight(dt);
  }

  // What the steam engine turns (engine/physics.js), as torques at its crank, which is the flywheel pinion's shaft: the
  // floor train and the line shaft all the time, on its pivots (roller thrust bearings, MU, at half the pivot's radius); and while it winds,
  // the winding gear on its footsteps and journals, and the weight lifted through the worms (WIND.efficiency).
  const ENGINE_LOAD = (() => {
    const crank = Math.abs(floorRotors[2].k), kg = floorRotors.map((r, i) => wheelMass(r.spec, MATERIAL.steel) + (i === 2 ? cylinderMass(FLOOR.flyR, 0.8) : 0));
    const floor = floorRotors.reduce((t, r, i) => t + MU * kg[i] * GRAV * Math.min(3, r.spec.r * 0.4) / 2 * Math.abs(r.k) / crank, 0) + WINDGEAR.always.reduce((t, [m, r, k]) => t + MU * m * GRAV * r * Math.abs(k) / crank, 0);
    const winder = WINDGEAR.turns.reduce((t, [m, r, k]) => t + MU * m * GRAV * r * Math.abs(k) / crank, 0);
    return { crank, kg: kg.reduce((a, b) => a + b, 0), floor, winder, lift: weightKg * GRAV * windSpeed / WIND.efficiency / crank };
  })();

  // The power budget. The weight's fall is all the power the going train has; it is spent turning the
  // wheels in their bearings, keeping the pendulum swinging, and in the teeth.
  POWER.budget = () => {
    const rate = STEP / 10, kgOn = (name) => assembly(`arbor ${name}`).masses.reduce((t, q) => t + q.kg, 0) + cylinderMass(SHAFT[name].r, SHAFT[name].z[1] - SHAFT[name].z[0], MATERIAL.alloy);
    const turns = { esc: Math.abs(rEsc.k), third: Math.abs(rThird.k), center: Math.abs(rCenter.k), great: Math.abs(rGreat.k), minute: Math.abs(rMinute.k) };
    let journals = 0;
    for (const [name, k] of Object.entries(turns)) journals += MU * kgOn(name) * GRAV * SHAFT[name].r * k * rate;
    const arms = liftJ / 10, remontoire = REM * liftJ / 10;             // lifting an arm, once a beat, is all that reaches the pendulum; the remontoire is wound with three times that
    const supply = weightKg * GRAV * fall, teeth = 0.09 * supply;       // three meshes between the weight and the last arbor, 3 % each
    return { supply, journals, arms, remontoire, teeth, need: journals + remontoire + teeth, mu: MU, Q, length: Leff, armKg, turn: TURN, weightKg, remKg: 2 * REM * liftJ / STEP / GRAV / 4.5, lock: LOCK };
  };
  // The clock's own rows in the structural check (world/structure.js): what is a matter of strength or clearance in the
  // movement and is not a frame.
  POWER.rows = () => {
    const rows = [], f = (v, d = 0) => v.toLocaleString('en', { maximumFractionDigits: d, minimumFractionDigits: d }), MPa = (v) => f(v / 1e6), t = (kg) => f(kg / 1e3);
    // the suspension: tension, and bending at the upper clamp at the designed swing, against fatigue (Goodman); maraging
    // steel, its endurance 700 MPa (polished, rotating) times 0.9 for a ground surface, 0.75 for the size, 0.814 for 99 %
    const Se = 700e6 * 0.9 * 0.75 * 0.814, sb = lf.top * TH0 * Math.sqrt(3 * lf.E * lf.tension), u = 1.35 * (sb / Se + lf.tension / lf.uts);
    rows.push({ name: 'suspension leaves', ok: u <= 1 && lf.cheek < lf.lambda / TH0,
      verdict: `${lf.n} leaves ${f(lf.w * 1000)} x ${f(lf.t * 1000)} mm, ${f(lf.free, 2)} m free: ${MPa(lf.tension)} MPa in tension, and bent at the upper clamp ${MPa(sb)} MPa at ${f(TH0 / DEG, 1)} degrees (${f(lf.bottom * 100)} % of that at the lower); lambda ${f(lf.lambda, 2)} m, so the pivot is ${f(lf.top * lf.lambda, 2)} m below the clamp; fatigue (Goodman, gamma 1.35) ${f(u * 100)} % of endurance ${MPa(Se)} MPa; the chops' cheeks radiused ${lf.cheek} m (less than lambda / swing, ${f(lf.lambda / TH0)} m, so they never touch the bent leaf)` });
    // the escapement's locking: the wheel's energy when its leg meets the stop, taken by the buffer behind the stop (a disc-
    // spring stack and an oil dashpot, BUFFER m of travel): the push on the leg is at most twice the energy over the travel,
    // against the plate at the leg's root, rolled steel at a hundred million blows (EN 1993-1-9 detail 160, 64.7 MPa, / 1.35)
    const BUFFER = 0.05, I = (0.3 * 0.4 ** 3 - 0.28 * 0.38 ** 3) / 12, Fk = 2 * LOCK.joules / BUFFER + REM * liftJ / STEP / GE.legs, sl = Fk * GE.legs * 0.2 / I;
    rows.push({ name: 'escapement: fly and locking', ok: sl <= 64.7e6 / 1.35 && TURN < 8.5,
      verdict: `the fly (${FLY.vanes} vanes ${f(FLY.r1 - FLY.r0, 1)} x ${f(FLY.h, 2)} m, ${FLY.G} times the wheel's speed) holds the wheel to ${f(LOCK.omega, 3)} rad/s; it takes ${f(TURN, 1)} s over its step (the pendulum is back in 10), and strikes its stop with ${f(LOCK.joules)} J (without a fly, at the old three times, ${f(3 * liftJ - liftJ)} J); the buffer behind the stop takes that in ${BUFFER * 1000} mm at ${f(Fk / 1e3, 1)} kN, ${MPa(sl)} MPa at the leg's root (allowed ${f(64.7 / 1.35, 1)}); the fly runs on at ${f(LOCK.run, 1)} rad/s on its ratchet` });
    // the hands: chords' stress, deflection against what they could touch, and the wind's twist against the train
    const Hm = HANDS.minute, Hh = HANDS.hour, frame = DIAL.z + 1.7, at = (H, y) => { const i = Math.max(0, Math.min(H.ys.length - 1, Math.round((y - H.ys[0]) / (H.ys[1] - H.ys[0])))); return H.defl[i]; };
    let gap = Infinity; for (let y = 0; y <= Hh.tip; y += 0.5) gap = Math.min(gap, Hm.back - Hh.back - Hh.depth(y) - Math.abs(at(Hm, y) - at(Hh, y)));
    const b = POWER.budget(), Tc = weightKg * GRAV * WIND.barrelR / 8, avail = Tc * (1 - b.need / b.supply), Tw = Math.abs(Hm.side) + Math.abs(Hh.side) / 12;
    const Fh = Math.abs(Hh.side) / S.hourW.r, sh = Fh / (S.hourW.t * S.hourW.m * 0.35);
    const okH = Math.max(Hm.stress, Hh.stress) <= HAND_STEEL && gap >= 0.3 && Hh.back - frame - Math.max(...Hh.defl) >= 1 && Hm.back - frame - Math.max(...Hm.defl) >= 1 && avail >= 1.5 * Tw && sh <= 100e6;
    rows.push({ name: 'hands', ok: okH,
      verdict: `steel lattice spines ${f(Hm.d0, 1)} m and ${f(Hh.d0, 1)} m deep at the root, copper clad: minute hand ${t(Hm.kg)} t, ${f(Hm.moment / 1e3)} t m about the arbor, balanced by ${t(Hm.ckg)} t at ${Hm.arm} m; hour hand ${t(Hh.kg)} t, ${f(Hh.moment / 1e3)} t m, ${t(Hh.ckg)} t at ${Hh.arm} m. In a ${f(WIND_Q / 1e3, 1)} kPa wind on their faces the chords work at ${MPa(Math.max(Hm.stress, Hh.stress))} MPa (allowed ${MPa(HAND_STEEL)}), the tips move ${f(Math.max(...Hm.defl), 2)} and ${f(Math.max(...Hh.defl), 2)} m, and the hands keep ${f(gap, 2)} m between them (0.3 needed), and ${f(Hh.back - frame - Math.max(...Hh.defl), 2)} m off the dial's frame. Edge on, the wind twists the centre arbor with ${f(Tw / 1e6, 1)} MN m; the weight gives it ${f(Tc / 1e6, 1)} MN m, ${f(avail / 1e6, 1)} after friction (1.5 times the wind needed); the motion work's teeth ${f(sh / 1e6, 1)} MPa (allowed 100)` });
    // the winding wheel and its worms
    const W = WINDGEAR, cap = 100e6 * S.wind.t * S.wind.m * 0.35, lead = Math.atan(Math.PI * S.wind.m / (TAU * WIND.wormR)), phi = Math.atan(0.06), back = Math.tan(lead - phi) / Math.tan(lead);
    rows.push({ name: 'winding wheel and worms', ok: W.half <= cap && back > 0,
      verdict: `a worm wheel of phosphor bronze segments on a steel centre, its teeth hobbed: each worm pushes its teeth with ${f(W.half / 1e6, 2)} MN, against ${f(cap / 1e6, 1)} MN (bending, 100 MPa for the bronze at the ${f(48 * 365 * 100 * 5 / 80 * 2 / 1e3)} thousand loadings of a century); the worms' lead is ${f(lead / DEG, 1)} degrees, friction 0.06: ${f(Math.tan(lead) / Math.tan(lead + phi) * 100)} % efficient driving, and ${f(back * 100)} % driven backward, so the weight could drive them backward: what holds it, clutch in or out, is the going ratchet's clicks, which hand its pull to the train` });
    // the driving weight: ropes, and the crib under its fall
    const rc = MATERIAL.concrete.fc;
    rows.push({ name: 'driving weight: ropes and crib', ok: ROPE.sf >= 6 && ROPE.Dd >= 40 && ROPE.width <= 4.0 && ROPE.holds >= ROPE.need && WIND.crib.crush <= rc,
      verdict: `${ROPE.n} ropes of ${f(ROPE.d * 1000)} mm on an equalising beam, each breaking at ${f(ROPE.mbl / 1e6, 1)} MN: ${f(ROPE.sf, 2)} times the weight's ${f(ROPE.W / 1e6, 1)} MN (6 needed); the barrel ${f(ROPE.Dd, 1)} rope diameters across (40 needed), its grooves ${f(ROPE.width, 2)} m of its 4.0 m for ${f(ROPE.turns, 2)} turns each, two of them dead. If they or the train let go, the weight falls ${f(ROPE.fall, 1)} m onto the crib, ${f(ROPE.need / 1e6)} MJ with the crushing; the crib's ${f(ROPE.area, 1)} m2 of oak crushes at ${MPa(WIND.crib.crush)} MPa over ${f(WIND.crib.strain * WIND.crib.h, 1)} m, ${f(ROPE.holds / 1e6)} MJ, and presses the raft no harder than that (its concrete takes ${MPa(rc)})` });
    // the maintaining power
    const pb = POWER.budget(), f0 = pb.need / pb.supply, run = MAINT.travel / (TAU / 28800 * MAINT.r), windT = WIND.band / windSpeed, Fm = MAINT.set * weightKg * GRAV * WIND.barrelR / MAINT.r;
    const fEnd = MAINT.set - (MAINT.set - f0) * windT / run, pc = (v) => f(v * 100);
    rows.push({ name: 'maintaining power', ok: run >= 1.5 * windT && f0 < MAINT.set,
      verdict: `four leaf springs ${MAINT.r} m out on the great wheel's arms, set up against stops: pressed home, as the weight keeps them while the clock goes, they push with ${pc(MAINT.set)} % of its torque (${f(Fm / 1e6, 1)} MN), the stops taking the rest. While the barrel is turned back they drive the train on, their push falling as they open, over ${MAINT.travel * 1000} mm, to ${pc(f0)} %, what the going train takes in still air: ${f(run)} s of going, against a winding's ${f(windT)} s (1.5 times needed); at a winding's end they still give ${pc(fEnd)} %. What they give over the train's need, ${pc(MAINT.set - f0)} % falling to ${pc(fEnd - f0)} %, is all there is for the wind on the hands meanwhile (the weight keeps ${pc(1 - f0)} % for it): in a gale a winding can hold the hands back until it is done. The detent takes only the springs' push, ${f(MAINT.set * weightKg * GRAV * WIND.barrelR / 7.7 / 1e6, 1)} MN at the ring's teeth (world/structure.js)` });
    // the engine's load: what it turns, all the time and while it winds
    const EL = ENGINE_LOAD, wT = WIND.band / windSpeed, cyc = WIND.band / fall + wT, kW = (q) => f(q * EL.crank / 1e3);
    rows.push({ name: 'engine: what it turns', ok: true,
      verdict: `the floor train, ${t(EL.kg)} t on its pivots, asks ${f(EL.floor / 1e3)} kN m of the crank, ${kW(EL.floor)} kW at its governed ${f(EL.crank, 1)} rad/s, all the time; the winding gear is put in only while it winds, ${f(wT)} s in every ${f(cyc / 60)} minutes, and then asks ${f(EL.winder / 1e3)} kN m to turn it and ${f(EL.lift / 1e3)} kN m to lift the weight through the worms, ${kW(EL.winder + EL.lift)} kW; on average ${kW(EL.floor + (EL.winder + EL.lift) * wT / cyc)} kW` });
    // the brake: on the rising side of its curve, and what flux that asks over the poles drawn
    const vB = BRAKE.r * Math.abs(rEsc.k) * STEP / 10, vc = 2 / (4e-7 * Math.PI * BRAKE.sigma * BRAKE.d), Fb = (b.supply - b.need) / vB, Bt = Math.sqrt(Fb / (0.5 * BRAKE.sigma * BRAKE.d * vB * BRAKE.poles));
    rows.push({ name: 'remontoire brake', ok: vc >= 2 * vB && Bt <= 0.8,
      verdict: `a copper disc ${f(BRAKE.d * 1000)} mm thick: under the magnets it moves at ${f(vB, 2)} m/s, and its critical speed is ${f(vc, 2)} m/s (twice that needed), so its drag still rises with speed; it takes ${f((b.supply - b.need) / 1e3, 1)} kW, ${f(Fb / 1e3, 1)} kN, which over the poles' ${f(BRAKE.poles, 1)} m2 asks ${f(Bt, 2)} T in the gap (half the ideal sheet's drag; 0.8 T at most)` });
    // temperature and rating
    const aB = 19e-6, aR = 0.5e-6, chain = lf.alpha * lf.free + 11e-6 * 1.0 + aR * (L - (PEND.pivotY - lf.chopsY) - 1.0), hc = chain / (aB - aR), dTE = lf.top * lf.lambda * 0.5 * 2.5e-4, tray = pendKg / 10800;
    rows.push({ name: 'pendulum: temperature and rating', ok: hc < PEND.bobR,
      verdict: `the bob sits on a collar ${f(hc, 2)} m below its middle, so that its brass, growing upward, makes up the leaves', the chops' and the super-invar rod's growing downward; left over: the leaves stiffen as they cool (their modulus falls 0.025 % a degree as they warm, and lambda with its root), moving the pivot ${f(dTE * 1000, 2)} mm a degree, ${f(dTE / L / 2 * 86400, 2)} s a day a degree, which the rating tray takes out season by season: ${f(tray)} kg on it, half way down the rod, gains a second a day` });
    return rows;
  };

  return {
    update, state: s,
    engineLoad: () => ENGINE_LOAD.floor + (s.winding ? ENGINE_LOAD.winder + ENGINE_LOAD.lift : 0),       // all it asks of the crank now, N m
    floor: floorRotors,          // [great wheel, idler, flywheel pinion]: driven by the steam engine
    // Is a body at p down among the teeth where two floor wheels mesh? Nothing comes out of there.
    caught(p) {
      if (p.y > FLOOR.top - 0.1) return false;
      return nips.some(n => Math.hypot(p.x - n.a.x, p.z - n.a.z) < n.ra && Math.hypot(p.x - n.b.x, p.z - n.b.z) < n.rb);
    },
    // If the mechanism has fallen more than half a minute behind the wall clock, set it right.
    resync() { let d = Math.abs(beatsNow() - s.n); d = Math.min(d, 4320 - d); if (d > 3) { s.n = beatsNow(); rest(); setTrain(); } },
    on(name, fn) { listeners[name].push(fn); },
    seconds() { return s.n * 10; },
    // What the clock is doing, in a few words, for the keeper.
    status() {
      const left = Math.max(0, s.weightTop - (WIND.top - WIND.band)) / fall / 60;       // minutes until it has fallen its band and winding is due
      if (s.stalled) return s.arc > G_UP ? `stopped: the remontoire has run down; the pendulum swings free, ${(s.arc / DEG).toFixed(2)} degrees and dying away` : 'stopped: the pendulum has come to rest; wind the weight up and start it by hand';
      if (!s.drive) return s.weightTop <= WIND.bottom + 1e-6 ? 'the weight has run down onto its crib: the train has stopped and the remontoire is running down' : 'the maintaining springs are spent: the train has stopped';
      if (s.winding) return s.floorRate > 0.05 ? `winding: the weight is coming up, at ${s.weightTop.toFixed(2)} m; the maintaining springs drive the train` : `winding is due, but the engine is not turning: the maintaining springs drive the train, ${Math.round(s.ms / (TAU / 28800 * MAINT.r))} s more`;
      return `going: the weight is at ${s.weightTop.toFixed(2)} m, to be wound in ${Math.round(left)} min`;
    },
    // The keeper starts the pendulum: draws it aside and lets it go.
    start() { s.th = TH0; s.om = 0; s.arc = TH0; },
    escapement: new THREE.Vector3(0, ESC.y, GESC.zWheel),
    parts: { wheel: rE.group, arms: [armR, armL] },      // for the test that watches the escapement's moving parts meet
  };
}
