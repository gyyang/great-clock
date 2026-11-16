// The engineer. Stands the going train on the floor and hangs the walkways from the
// roof, sizing every member by analysis and drawing it at the size the analysis gave.
//
// The wheels are solid brass and weigh what that weighs: about 84,000 tonnes with their
// arbors, the pendulum and the driving weight. That goes straight down, in compression:
//   - an arbor rests in two bearings;
//   - under each bearing stands an A-frame of alloy-steel box sections, in the gap
//     between two layers of wheels: two legs from the bearing to the floor, tied and
//     braced every 18 m. The two frames of one arbor are strutted to each other wherever
//     a strut can pass between the wheels, making one braced tower per arbor;
//   - each leg stands on a stone plinth big enough for the ground under it.
// Where a leg, tie or strut would foul a wheel, an arbor, a walkway, the swing of the
// pendulum or the fall of the driving weight, it is left out (found by casting rays
// through the physics world), and the members that remain are sized for the frame that
// is actually there.
// The roof carries only itself and the walkways, which hang from it on carbon-fibre rods.
//
// The shell is a steel frame with brick between. Columns stand every 10 m in each wall and a
// girder runs round at every 30 m level; each girder carries the 30 m of brick panel above
// it, so no brick holds up more than its own panel. The girders are as wide as the wall is
// thick, and span sideways from side wall to side wall to take the wind. A steel ring
// carries the front wall over the dial.
//
// designLoop() declares all of that to the structural model, runs the analysis, enlarges
// whatever is overworked and repeats until everything holds. Only then is it drawn.
import * as THREE from 'three';
import { G, DRAWN, ibox, icyl, iknob, sbox, beam, sbeam, tube } from '../kit.js';
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Vector3();
import { TOWER, ARBOR, SHAFT, ROOF, PEND, DIAL, LIFT, BRIDGES, LAYER, WIND, ARCH, STAIR_TOWER, ESCAPE, STACK, LAMP } from '../layout.js';
import { assembly, redeclare, getAssembly, analyse, report, displacement, SECTION, MATERIAL, GRAVITY, WIND_Q, BUCKLING_FACTOR } from '../structure/model.js';
import { MESH_STONE, stackR, stackWall, STACK_RINGS } from './facade.js';
import { ENVELOPES, WINDGEAR, LIFTGEAR, POWER } from '../clock/clockwork.js';
import { DOOR_LEAVES, leafBox } from './doors.js';
import { HOISTGEAR } from './hoist.js';
import SEED from '../structure/design.json';

export const EDGES = [];            // edges of crossings that want hanging: { name, y, yc, z }, filled by tower.js
// The lamp room's floor and its gallery, kg per square metre: an iron floor (150) and the people on it (400). The
// inner half of the floor is on its own frame (tower.js, 'lamp floor'); the outer half and the gallery are on the drum.
export const LAMP_FLOOR = 550;
const ALLOY = MATERIAL.alloy, TENDON = MATERIAL.tendon;
const TRUSS_Z = [-32, -16, 0, 16, 32];
const PAD = 0.4;                                   // height of the stone pad a trestle's foot stands on
const BAY = 18, FOOT = 0.6, DEPTH = 0.9;          // tie spacing; top of a plinth; how thick a frame is where it passes between wheels
const THICK = [3.0, 2.2, 1.6, 1.2, DEPTH];        // thicknesses a leg may have, best first
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- oriented boxes: do two overlap? (separating-axis test)
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const axesOf = (q) => { const e = new THREE.Matrix4().makeRotationFromQuaternion(q).elements; return [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]]; };
function obb(c, ax, half) {
  const ext = [0, 1, 2].map(i => Math.abs(ax[0][i]) * half[0] + Math.abs(ax[1][i]) * half[1] + Math.abs(ax[2][i]) * half[2]);
  return { c, ax, half, lo: c.map((v, i) => v - ext[i]), hi: c.map((v, i) => v + ext[i]) };
}
function overlaps(A, B) {
  for (let i = 0; i < 3; i++) if (A.lo[i] > B.hi[i] || B.lo[i] > A.hi[i]) return false;
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], d = [B.c[0] - A.c[0], B.c[1] - A.c[1], B.c[2] - A.c[2]];
  const R = A.ax.map(a => B.ax.map(b => dot(a, b))), Q = R.map(r => r.map(v => Math.abs(v) + 1e-9)), t = A.ax.map(a => dot(d, a));
  for (let i = 0; i < 3; i++) if (Math.abs(t[i]) > A.half[i] + B.half[0] * Q[i][0] + B.half[1] * Q[i][1] + B.half[2] * Q[i][2]) return false;
  for (let j = 0; j < 3; j++) if (Math.abs(t[0] * R[0][j] + t[1] * R[1][j] + t[2] * R[2][j]) > B.half[j] + A.half[0] * Q[0][j] + A.half[1] * Q[1][j] + A.half[2] * Q[2][j]) return false;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const i1 = (i + 1) % 3, i2 = (i + 2) % 3, j1 = (j + 1) % 3, j2 = (j + 2) % 3;
    if (Math.abs(t[i2] * R[i1][j] - t[i1] * R[i2][j]) > A.half[i1] * Q[i2][j] + A.half[i2] * Q[i1][j] + B.half[j1] * Q[i][j2] + B.half[j2] * Q[i][j1]) return false;
  }
  return true;
}
// Everything drawn that is not this structure and not outdoors, as boxes.
const drawnBoxes = () => DRAWN.filter(o => o.tag === '').map(o => obb(o.c, axesOf(o.q), o.half));
// The same, filed by where they are (in cells CELL m on a side), so that a question about one place looks only at
// what is near it: hit(box) is the first that overlaps the box, or null.
let boxStamp = 0;                                    // (one count for every index: they share their boxes)
function boxIndex(list, CELL = 6) {
  const grid = new Map(), cells = (lo, hi, fn) => { for (let i = Math.floor(lo[0] / CELL); i <= Math.floor(hi[0] / CELL); i++) for (let j = Math.floor(lo[1] / CELL); j <= Math.floor(hi[1] / CELL); j++) for (let k = Math.floor(lo[2] / CELL); k <= Math.floor(hi[2] / CELL); k++) fn(`${i},${j},${k}`); };
  list.forEach((o) => cells(o.lo, o.hi, (key) => (grid.get(key) || grid.set(key, []).get(key)).push(o)));
  return { list, hit(me) { const stamp = ++boxStamp; let found = null; cells(me.lo, me.hi, (key) => { if (found) return; for (const o of grid.get(key) || []) { if (o._seen === stamp) continue; o._seen = stamp; if (overlaps(me, o)) { found = o; return; } } }); return found; } };
}

const SOLID = new Set(['leg', 'tie beam', 'brace', 'strut', 'trestle', 'post', 'jib', 'yoke', 'yoke arm', 'lever bracket', 'steady', 'lift head', 'link', 'detent', 'wind truss', 'ring truss']);       // what is drawn solid, and tested for clearance
let plan = '';
let towers = [], hung = [], sizes = new Map(), passes = 0, feet = [], solids = [], bearings = [], wind = null, links = [], detent = null;

// ---- geometry of two segments: how near they come
function gap(p1, q1, p2, q2) {
  const d1 = q1.map((v, i) => v - p1[i]), d2 = q2.map((v, i) => v - p2[i]), r = p1.map((v, i) => v - p2[i]);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), c = dot(d1, r), b = dot(d1, d2), den = a * e - b * b;
  let s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0, t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  return Math.hypot(...p1.map((v, i) => v + d1[i] * s - p2[i] - d2[i] * t));
}

export function buildStructure() {
  const t0 = performance.now(), laps = {};
  let tl = t0; const lap = (k) => { const n = performance.now(); laps[k] = Math.round(n - tl); tl = n; };
  G.world.step();                                    // lets the ray casts below see every collider made so far
  const R = G.R, placed = [];
  const ray = (a, b) => {
    const d = b.map((v, i) => v - a[i]), L = Math.hypot(...d);
    return L < 0.7 ? false : !!G.world.castRay(new R.Ray({ x: a[0] + d[0] / L * 0.3, y: a[1] + d[1] / L * 0.3, z: a[2] + d[2] / L * 0.3 }, { x: d[0] / L, y: d[1] / L, z: d[2] / L }), L - 0.6, true);
  };
  // Where nothing fixed may stand: the pendulum's swing and the driving weight's fall.
  const forbidden = (p) => {
    if (p[2] > PEND.z - 3.2 && p[2] < PEND.z + 3.2 && p[1] < PEND.pivotY + 3 && Math.abs(p[0]) < (p[1] < 23 ? 18.5 : 4 + (PEND.pivotY - p[1]) * 0.115)) return true;
    return p[2] > 22 && p[2] < 32 && p[1] > 18 && p[1] < 75 && p[0] > ARBOR.great.x - 10.6 && p[0] < ARBOR.great.x + 0.4;
  };
  // Would a member from a to b, h deep in its own plane and w thick, foul anything that is
  // already there? Rays down its middle and well outside its edges (a tooth that is clear now
  // will not be in a minute), and the places nothing may stand.
  let self = null;                                    // the arbor whose tower is being planned: its legs end under it
  const fouls = (a, b, h, w) => {
    const d = b.map((v, i) => v - a[i]), L = Math.hypot(...d), along = Math.abs(d[2]) / L > 0.3;
    const p = along ? [1, 0, 0] : [-d[1] / L, d[0] / L, 0], q = along ? [0, 1, 0] : [0, 0, 1];
    for (const [op, oq] of [[0, 0], [h / 2 + 0.7, 0], [-h / 2 - 0.7, 0], [0, w / 2 + 0.1], [0, -w / 2 - 0.1]])
      if (ray(a.map((v, i) => v + p[i] * op + q[i] * oq), b.map((v, i) => v + p[i] * op + q[i] * oq))) return true;
    // and a box the size of the member itself, for things too thin for a ray to find (a handrail)
    if (L > 1.2) {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(d[0] / L, d[1] / L, d[2] / L));
      if (G.world.intersectionWithShape({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2 }, q, new R.Cuboid(L / 2 - 0.5, (along ? Math.max(h, w) : h) / 2 + 0.1, (along ? Math.max(h, w) : w) / 2 + 0.1), undefined, undefined, G.ground)) return true;
    }
    if (L > 1.2) {                     // and against everything drawn, collider or not
      const u = d.map(v => v / L), qq = cross3(u, p), ql = Math.hypot(...qq), q2 = qq.map(v => v / ql), p2 = cross3(q2, u);
      const me = obb(a.map((v, i) => (v + b[i]) / 2), [u, p2, q2], [L / 2 - 0.4, (along ? Math.max(h, w) : h) / 2 + 0.15, (along ? Math.max(h, w) : w) / 2 + 0.15]);
      if (drawn.hit(me)) return true;
    }
    for (let k = 0; k <= 12; k++) for (const dz of along ? [0] : [0, w / 2, -w / 2]) { const pt = a.map((v, i) => v + d[i] * k / 12); pt[2] += dz; if (forbidden(pt)) return true; }       // (its faces too, not only its middle)
    // what the turning parts sweep, wherever their teeth are now
    const n = Math.max(2, Math.ceil(L / 0.7)), thick = (along ? Math.max(h, w) : w) / 2, deep = (along ? Math.max(h, w) : h) / 2;
    for (let k = 0; k <= n; k++) {
      const pt = a.map((v, i) => v + d[i] * k / n);
      for (const e of ENVELOPES) {
        if (self && !e.floor && e.r < 2.5 && e.x === self.x && e.y === self.y) continue;
        if (e.floor ? pt[1] - deep < e.top + 0.2 && Math.hypot(pt[0] - e.x, pt[2] - e.z) < e.r + Math.max(deep, thick) + 0.5
          : pt[2] + thick + 0.15 > e.z0 && pt[2] - thick - 0.15 < e.z1 && Math.hypot(pt[0] - e.x, pt[1] - e.y) < e.r + deep + 0.3) return true;
      }
    }
    return false;
  };
  // Is there room on the floor for a leg to stand here, on a pedestal, with space to get round it?
  const standing = (p) => !drawn.hit(obb([p[0], 2.0, p[2]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [3.2, 1.6, 2.0])) && !G.world.intersectionWithShape({ x: p[0], y: 2.0, z: p[2] }, { x: 0, y: 0, z: 0, w: 1 }, new R.Cuboid(3.2, 1.6, 2.0), undefined, undefined, G.ground)
    && !ENVELOPES.some(e => e.floor && Math.hypot(p[0] - e.x, p[2] - e.z) < e.r + 3.5);
  // Not on another tower's pedestal, nor under a floor wheel's teeth; unless it is so near another tower's foot that
  // the two can stand side by side on one block of concrete, a combined footing (see pedestals())
  const apart = (p) => stood.every(f => Math.abs(f[0] - p[0]) >= 5.4 || Math.abs(f[2] - p[2]) >= 3.7 || (Math.abs(f[0] - p[0]) <= SHARE[0] && Math.abs(f[2] - p[2]) <= SHARE[1] && Math.abs(f[2] - p[2]) >= SHARE[2]))
    && !ENVELOPES.some(e => e.floor && Math.hypot(p[0] - e.x, p[2] - e.z) < e.r + 2.8);
  // A strut from one frame to the other must also miss the frames of every other tower,
  // which are planned but not yet built (their legs taken as 3 m deep).
  // The towers stand among one another, so a member must also miss every member of every other tower planned
  // so far, taken at the size it may grow to when it is designed (a leg up to LEG_H deep in its frame).
  const stood = [];
  const memberBox = (a, b, h, w) => {
    const d = b.map((v, i) => v - a[i]), L = Math.hypot(...d), u = d.map(v => v / L), along = Math.abs(d[2]) / L > 0.3;
    const p = along ? [1, 0, 0] : [-d[1] / L, d[0] / L, 0], qq = cross3(u, p), ql = Math.hypot(...qq), q2 = qq.map(v => v / ql), p2 = cross3(q2, u);
    return obb(a.map((v, i) => (v + b[i]) / 2), [u, p2, q2], [L / 2, (along ? Math.max(h, w) : h) / 2 + 0.12, (along ? Math.max(h, w) : w) / 2 + 0.12]);
  };
  // (a link belongs to both the towers it joins: m.owner is then the pair)
  const taken = (a, b, h, w, owner) => { const me = memberBox(a, b, h, w); return placed.some(m => (Array.isArray(m.owner) ? !m.owner.includes(owner) : m.owner !== owner) && overlaps(me, m.box)); };
  const strutFouls = (a, b, owner) => fouls(a, b, 1.5, 1.1) || taken(a, b, 1.5, 1.1, owner);
  // No frame may be thicker than leaves room for the frame in the next gap along.
  const all = Object.values(SHAFT).flatMap(sh => sh.bearings), room = (z) => Math.min(THICK[0], Math.min(...all.filter(o => o !== z).map(o => Math.abs(o - z))) - 0.2);

  const drawn = boxIndex(drawnBoxes());        // posts, brackets, beams, lamp standards: most of what is drawn has no collider
  // ---- 1. a tower under each arbor
  towers = [];
  // Legs first, for every tower; then the ties and braces in each frame; then the struts from frame to frame.
  // Each has to miss whatever is already there, so what matters most is placed first, and it is a strut that gives way.
  for (const [name, sh] of Object.entries(SHAFT)) {
    const a = ARBOR[name], A = assembly(`arbor ${name}`), [z1, z2] = sh.bearings, yh = a.y - sh.r - 0.6;
    self = a;
    let W = Math.PI * sh.r ** 2 * (sh.z[1] - sh.z[0]) * ALLOY.rho, M = W * ((sh.z[0] + sh.z[1]) / 2 - z1);
    for (const q of A.masses) { W += q.kg; M += q.kg * (A.nodes[q.n].p[2] - z1); }
    const R2 = M / (z2 - z1), loads = [(W - R2) * GRAVITY, R2 * GRAVITY];
    // how far each leg can splay: as near one in five as will clear everything, in both frames
    // (a negative splay leans the leg the other way: both feet then stand on the same side of the arbor, when the other side is taken)
    const frac = [0.2, 0.16, 0.24, 0.12, 0.28, 0.08, 0.05, 0.03, -0.03, -0.06, -0.1, -0.14], H = (z) => [a.x, yh, z], foot = (side, sp, z) => [a.x + side * sp * yh, FOOT, z];
    const clear = (side, sp, z) => apart(foot(side, sp, z)) && !fouls(H(z), foot(side, sp, z), LEG_H, DEPTH) && !taken(H(z), foot(side, sp, z), LEG_H, DEPTH, name);
    const levels = [], half = [];
    for (let y = BAY; y < yh - BAY / 2; y += BAY) levels.push(y);
    for (let y = BAY / 2; y < yh - 3; y += BAY / 2) half.push(y);                    // struts front to back are tried twice as often as ties
    // Of the splays that clear everything, take the first that leaves room for nearly as many struts between the two
    // frames as the best of them does: a leg that cannot be strutted has to be made up for in depth.
    // The two sides are chosen together: a frame's feet must stand at least MIN_BASE of its height apart, or it is a
    // leaning post, not a frame (both feet on one side of the arbor, when the other side is taken, need this most).
    const stays = (side, sp) => half.filter(y => { const p = (z) => [a.x + side * sp * yh * (yh - y) / (yh - FOOT), y, z]; return !strutFouls(p(z1), p(z2), name); }).length;
    const options = (side) => { for (const ok of [(sd, sp, z) => standing(foot(sd, sp, z)) && clear(sd, sp, z), clear]) { const c = frac.filter(sp => sh.bearings.every(z => ok(side, sp, z))); if (c.length) return c; } const f = frac.find(sp => sh.bearings.every(z => !fouls(H(z), foot(side, sp, z), 1.6, DEPTH))); return [f ?? 0.02]; };
    const oL = options(-1).map(sp => ({ sp, n: stays(-1, sp) })), oR = options(1).map(sp => ({ sp, n: stays(1, sp) })), pairs = [];
    for (const l of oL) for (const r of oR) pairs.push({ l: l.sp, r: r.sp, n: l.n + r.n, rank: frac.indexOf(l.sp) + frac.indexOf(r.sp), base: l.sp + r.sp });
    const wide = pairs.filter(q => q.base >= MIN_BASE - 1e-9), top = Math.max(...(wide.length ? wide : pairs).map(q => q.n));
    // (and of those, one whose feet stand a fifth of its height apart, if any does: the minute arbor's tower, whose
    // right-hand legs can lean only a little the wrong way, then stands on the widest base its left-hand ones allow)
    const pool = wide.filter(q => q.n >= top - 2), fifth = pool.filter(q => q.base >= 0.2 - 1e-9);
    const best = wide.length ? (fifth.length ? fifth : pool).sort((p, q) => p.rank - q.rank)[0] : pairs.sort((p, q) => q.base - p.base)[0];
    const s = { '-1': best.l, '1': best.r };
    const at = (side, y, z) => [a.x + side * s[side] * yh * (yh - y) / (yh - FOOT), y, z];
    const T = { name: `tower ${name}`, arbor: name, a, r: sh.r, yh, planes: sh.bearings, loads, s, legs: [], feet: [], ties: [], braces: [], struts: [], stayed: {}, at, levels, half };
    // each leg in pieces from joint to joint, each piece as thick as its place between the wheels allows
    const ys = [FOOT, ...levels, yh];
    for (const side of [-1, 1]) for (const z of sh.bearings) {
      T.feet.push(at(side, FOOT, z));
      for (let k = 0; k < ys.length - 1; k++) {
        const p = at(side, ys[k], z), q = at(side, ys[k + 1], z);
        // (under the bearing, no thicker than leaves the nut on the arbor's end clear of it)
        const cap = k === ys.length - 2 ? 2 * (Math.min(Math.abs(z - sh.z[0]), Math.abs(z - sh.z[1])) - 0.45) : 9;
        T.legs.push([p, q, 0, THICK.find(t => t <= room(z) && t <= cap && !fouls(p, q, LEG_H, t) && !taken(p, q, LEG_H, t, name)) ?? DEPTH, side, ys[k], ys[k + 1]]);
      }
    }
    for (const m of T.legs) placed.push({ a: m[0], b: m[1], owner: name, box: memberBox(m[0], m[1], LEG_H, m[3]) });
    stood.push(...T.feet);
    towers.push(T);
  }
  // Where a leg of one tower crosses a leg of another in the next gap along, the two are bolted together through a
  // distance piece. Neither can then bow out of its own plane there without taking the other with it, and the other
  // is held by its own struts: so each is a stay to the other (and is designed for the push that asks of it).
  self = null; links = [];
  for (let i = 0; i < towers.length; i++) for (let j = i + 1; j < towers.length; j++) {
    const A = towers[i], B = towers[j];
    for (const za of A.planes) for (const zb of B.planes) {
      if (Math.abs(za - zb) > 6 || Math.abs(za - zb) < 0.5) continue;
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
        const qA = -sa * A.s[sa] * A.yh / (A.yh - FOOT), qB = -sb * B.s[sb] * B.yh / (B.yh - FOOT), pA = A.a.x - qA * A.yh, pB = B.a.x - qB * B.yh;      // x = p + q y along each leg
        if (Math.abs(qA - qB) < 1e-6) continue;
        const y = (pB - pA) / (qA - qB);
        if (y < 6 || y > Math.min(A.yh, B.yh) - 6) continue;
        const a = A.at(sa, y, za), b = B.at(sb, y, zb);
        if (!fouls(a, b, 0.8, 0.8)) links.push({ a, b, A, B, sa, sb, y });
      }
    }
  }
  // (and the ties and braces planned next must miss them: a link between two towers may pass through the frame of a third)
  for (const l of links) { const f = faces(l); if (f) placed.push({ a: f[0], b: f[1], owner: [l.A.arbor, l.B.arbor], box: memberBox(f[0], f[1], 0.8, 0.8) }); }
  for (const T of towers) {
    const { at, levels, arbor: name } = T; self = T.a;
    for (const z of T.planes) levels.forEach((y, k) => {
      if (!fouls(at(-1, y, z), at(1, y, z), 1.2, DEPTH) && !taken(at(-1, y, z), at(1, y, z), 1.2, DEPTH, name)) T.ties.push([at(-1, y, z), at(1, y, z)]);
      const up = levels[k + 1], [sa, sb] = k % 2 ? [1, -1] : [-1, 1];
      if (up && !fouls(at(sa, y, z), at(sb, up, z), 1.4, DEPTH) && !taken(at(sa, y, z), at(sb, up, z), 1.4, DEPTH, name)) T.braces.push([at(sa, y, z), at(sb, up, z)]);
    });
    for (const m of [...T.ties, ...T.braces]) placed.push({ a: m[0], b: m[1], owner: name, box: memberBox(m[0], m[1], 1.4, DEPTH) });
  }
  for (const T of towers) {
    const { at, half, yh, arbor: name } = T, [z1, z2] = T.planes; self = T.a;
    for (const side of [-1, 1]) {
      const stayed = [FOOT];                                         // heights at which this pair of legs is held apart from front to back
      // a strut wherever one will pass, about every nine metres: where another tower's frame stands between
      // these two, the strut goes through one of its open panels, a little higher or lower
      for (let y = BAY / 4, last = -99; y < yh - 3; y += 0.75) {
        if (y - last < BAY / 2 - 0.1 || strutFouls(at(side, y, z1), at(side, y, z2), name)) continue;
        T.struts.push([at(side, y, z1), at(side, y, z2)]);
        if (last > 0 && y - last < BAY) { const [za, zb] = stayed.length % 2 ? [z1, z2] : [z2, z1]; if (!strutFouls(at(side, last, za), at(side, y, zb), name)) T.struts.push([at(side, last, za), at(side, y, zb)]); }      // and a diagonal up the side face
        stayed.push(y); last = y;
      }
      stayed.push(yh);                                               // the arbor itself holds the two heads apart
      T.stayed[side] = stayed.map(y => Math.round(y)); (T.raw ||= {})[side] = stayed;
    }
    for (const m of T.struts) placed.push({ a: m[0], b: m[1], owner: name, strut: true, box: memberBox(m[0], m[1], 1.5, 1.1) });
  }
  // how far each piece of each leg runs without a stay from front to back: its own tower's struts, and the links to a
  // neighbour wherever that neighbour is itself strutted within 14 m
  const held = (U, side, y) => U.raw[side].some(v => Math.abs(v - y) < 14);
  for (const T of towers) for (const side of [-1, 1]) {
    const rake = Math.cos(Math.atan(T.s[side]));
    for (const m of T.legs) if (m[4] === side) {
      const st = [...T.raw[side], ...links.filter(l => (l.A === T && l.sa === side && l.a[2] === m[0][2] && held(l.B, l.sb, l.y)) || (l.B === T && l.sb === side && l.b[2] === m[0][2] && held(l.A, l.sa, l.y))).map(l => l.y)];
      m[2] = (Math.min(...st.filter(y => y >= m[6] - 0.1)) - Math.max(...st.filter(y => y <= m[5] + 0.1))) / rake;
    }
  }
  self = null;
  lap('towers');
  // ---- 1b. what holds the winding gear up. The clockwork draws its shafts; they have to stand on something.
  wind = null;
  if (WINDGEAR.len) {
    const W = WINDGEAR, Tg = towers.find(t => t.arbor === 'great'), zf = Tg.planes[1], ax = Tg.a.x;
    const atG = (side, y) => [ax + side * Tg.s[side] * Tg.yh * (Tg.yh - y) / (Tg.yh - FOOT), y, zf];
    const free = (a, b, h = WG_H, w = WG_B) => !fouls(a, b, h, w) && !taken(a, b, h, w, 'winding') && !stood.some(f => Math.abs(f[0] - b[0]) < 3.4 && Math.abs(f[2] - b[2]) < 2.6);
    const ytop = W.lineY - 0.6, short = (a, b, cut) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); return b.map((v, i) => v - (v - a[i]) * cut / L); };
    wind = { trestles: [], tips: [], steadies: [], head: [] };
    for (const sh of W.shafts) {
      const on = (t, y) => [sh.A1[0] + sh.d[0] * t, y, sh.A1[2] + sh.d[2] * t], yaw = Math.atan2(-sh.d[2], sh.d[0]), share = sh.kg / sh.bearings.length;
      const beside = (t, sg) => [sh.A1[0] + sh.d[0] * t - sh.d[2] * 1.7 * sg, PAD, sh.A1[2] + sh.d[2] * t + sh.d[0] * 1.7 * sg];
      // a trestle under each bearing of a line shaft, moved along a little where something is in the way
      const mine = [];
      for (const t0 of sh.jib === false ? sh.bearings : sh.bearings.slice(1)) {
        const t = [0, 1, -1, 2, -2, 3, -3, 4, -4].map(o => t0 + o).find(t => [-1, 1].every(sg => free(on(t, ytop), beside(t, sg))));
        if (t !== undefined) { const tr = { top: on(t, ytop), feet: [beside(t, -1), beside(t, 1)], kg: share, yaw, t }; wind.trestles.push(tr); mine.push(tr); }
      }
      // what the bevel wheels at a shaft's end push its pinion with, while winding, goes to the trestle nearest
      for (const e of sh.ends || []) { const tr = mine.reduce((b, q) => Math.abs(q.t - e.t) < Math.abs(b.t - e.t) ? q : b, mine[0]); if (tr) tr.push = (tr.push || [0, 0, 0]).map((v, i) => v + e.push[i]); }
      if (sh.jib === false) continue;
      // The bearing next to the idler's mitre wheel is over the wheel itself. A jib reaches in to it from two
      // posts standing clear of the rim, one either side, so that it is held against the push of the teeth.
      const tip = on(sh.bearings[0], ytop), ang = Math.atan2(sh.d[2], sh.d[0]), post = (sg, deg) => [sh.A1[0] + Math.cos(ang + sg * deg * Math.PI / 180) * 10, PAD, sh.A1[2] + Math.sin(ang + sg * deg * Math.PI / 180) * 10], posts = [];
      for (const sg of [-1, 1]) {
        const deg = [40, 30, 50, 22, 60, 70].find(deg => { const f = post(sg, deg), h = [f[0], ytop, f[2]]; return free(h, f) && free(short(h, tip, 1.2), h, JIB_H, JIB_B); });       // (the last of the jib is under the shaft it carries)
        if (deg !== undefined) posts.push(post(sg, deg));
      }
      const push = W.mitrePush * sh.load;
      wind.tips.push({ tip, posts, kg: share + 4e3, push: [-sh.d[2] * push, 0.36 * push, sh.d[0] * push], yaw });       // across the shaft, and a third as much pushing the wheels apart
    }
    // the lift: a stand under each bottom wheel's bearing, and a frame bracketed off the back wall for the top pair, which carry the cars and the chains
    for (const st of W.stands) if (st.foot) wind.trestles.push({ top: st.top, feet: st.feet, kg: st.kg, yaw: 0, y: st.top[1] + 0.45 }); else wind.head.push(st.p);
    // Each upright shaft is kept in line by arms from the nearer front leg of the great arbor's tower, wherever one will
    // pass, at the tower's own tie levels (where the leg has a joint): [leg, end, which upright]. None lower than 36 m:
    // the bevels at the shaft's foot push it sideways each winding, and an arm that near would take a share of that at
    // the end of a 16 m cantilever; the shaft's foot, held as if built in, takes it instead.
    for (const u of W.uprights) for (let y = 2 * BAY; y < W.bearings[0] - 8; y += BAY) {
      const leg = atG(u.side, y), end = short(leg, [u.x, y, W.wz], 0.75);
      if (!fouls(leg, end, STEADY, STEADY) && !taken(leg, end, STEADY + 0.1, STEADY, 'great')) wind.steadies.push([leg, end, u.x]);
    }
    // The yoke. The teeth push the two worms off the wheel, opposite ways, 2.9 MN each; and the worms' turning forces
    // push both the same way along the arbor, 1.2 MN each, while the wheel is pushed the other way, into its thrust collar
    // at the front bearing. Each upright runs in a radial bearing just above its worm and one just below; the yoke ties the
    // four together and to that bearing, so both pairs of forces close in it and the tower is asked for nothing. It is a
    // rectangle in the plane of the tower's front frame, between the barrel and the winding wheel: a beam over the front
    // bearing, bolted to its cap, and a beam under it, bolted under the head casting, the two joined by a post at each end,
    // with an arm from each corner forward to the bearing on the upright. (Through the frame, behind the wheel: the wheel
    // fills the space in front of the arbor out to its rim, and the clutch and its lever the space in front of that.)
    {
      // (its posts stand outside the worms, which reach back to within 1.3 m of the frame's plane)
      const [yL, yU] = W.bearings, [xR, xL] = [W.uprights[0].x + 1.9, W.uprights[1].x - 1.9], Y = (x, y) => [x, y, zf];
      wind.yoke = {
        beams: [[Y(xL, yU), Y(xR, yU)], [Y(xL, yL), Y(xR, yL)]], posts: [[Y(xL, yL), Y(xL, yU)], [Y(xR, yL), Y(xR, yU)]],
        arms: W.uprights.flatMap(u => [yL, yU].map(y => [Y(u.x, y), [u.x, y, W.wz - 0.75], u.x])),
        caps: [[Y(ax, ARBOR.great.y), Y(ax, yU)], [Y(ax, Tg.yh), Y(ax, yL)]],
      };
      const Yk = wind.yoke;
      for (const m of [...Yk.beams, ...Yk.posts]) placed.push({ a: m[0], b: m[1], owner: 'great', box: memberBox(m[0], m[1], YOKE_H, YOKE_B) });
      for (const m of Yk.arms) placed.push({ a: m[0], b: m[1], owner: 'great', box: memberBox(m[0], m[1], YOKE_H, YOKE_ARM) });
    }
    // The clutch lever's pivot, under the wheel and in front of it: a post up from an arm that comes forward under the
    // wheel's rim from a tie across the front frame. (Nothing may cross the wheel, so this is the way round.)
    {
      const ys = ARBOR.great.y - WIND.wheelR - 2.3, zp = WIND.z + 2.1, Lm = atG(-1, ys), Lp = atG(1, ys), mid = [ax, ys, zf];
      const tied = !fouls(Lm, Lp, 1.2, DEPTH) && !taken(Lm, Lp, 1.2, DEPTH, 'great');
      if (tied) Tg.ties.push([Lm, Lp]);
      wind.lever = { tied, tie: [Lm, Lp], arm: [mid, [ax, ys, zp]], post: [[ax, ys, zp], [ax, ARBOR.great.y - WIND.wheelR - WIND.wormR + 1.75, zp]] };
      for (const m of [wind.lever.tie, wind.lever.arm, wind.lever.post]) placed.push({ a: m[0], b: m[1], owner: 'great', box: memberBox(m[0], m[1], 0.4, 0.4) });
    }
  }
  lap('winding');
  // ---- 1c. the detent of the great wheel's maintaining power: a pawl on the end of a bracket off the centre arbor's tower
  {
    // The pawl must stand in the ring's own plane (PAWL_Z), reaching in to its teeth. The bracket that carries it
    // comes across from the centre tower's leg as near to the ring as it can: its end and the pawl are tested against
    // everything that goes round on the great arbor, through a whole turn (sweepOf), as well as against everything
    // else. The shortest pawl that will pass, on the deepest bracket. The bracket is 12 m long and the pawl holds the
    // ring against 0.8 MN at every winding, so it is not left a cantilever: a strut from its end down to the same leg
    // makes it a triangle (behind the ring, where nothing goes round), and it carries the pawl's load by axial force.
    const Tc = towers.find(t => t.arbor === 'center'), g = ARBOR.great, y = g.y, p0 = Tc.at(-1, y, Tc.planes[0]), swept = sweepOf(g);
    const clear = (a, b, h, w) => !fouls(a, b, h, w) && !swept(memberBox(a, b, h, w)) && !taken(a, b, h, w, 'center');
    detent = null;
    for (const R of DETENT_RS) {
      if (swept(pawlBox(R, y))) continue;
      for (const ze of [PAWL_Z - 0.2, PAWL_Z - 0.35, PAWL_Z]) {
        const p1 = [g.x + R, y, ze];
        for (const [h, w] of [[1.6, 0.8], [1.4, 0.7], [1.2, 0.7], [1.6, 0.6], [1.2, 0.5], [0.6, 0.5]]) if (clear(p0, p1, h, w)) {
          // the strut: from the bracket's end (the pawl's root) back down to the leg, as steep as will pass
          let strut = null;
          for (const drop of [6, 7.5, 5, 9, 4, 11]) {
            const p2 = Tc.at(-1, y - drop, Tc.planes[0]), from = p1.map((v, i) => v + (p2[i] - v) * 0.9 / Math.hypot(...p2.map((u, j) => u - p1[j])));
            for (const [sh, sw] of [[0.9, 0.6], [0.7, 0.5], [0.5, 0.4]]) if (clear(from, p2, sh, sw)) { strut = { p2, sh, sw }; break; }
            if (strut) break;
          }
          detent = { p0, p1, h, w, R, strut }; break;
        }
        if (detent?.strut) break;
      }
      if (detent?.strut) break;
    }
  }
  lap('detent');
  // ---- 2. the walkways' rods to the roof, wherever a line straight up is clear
  hung = [];
  for (const e of EDGES) for (const x of ROOF.purlins) {
    if ([0, -0.7, 0.7].some(dx => [0, -0.25, 0.25].some(dz => ray([x + dx, e.y - 0.25, e.z + dz], [x + dx, ROOF.at(x) + 0.3, e.z + dz])))) continue;
    if (placed.some(m => gap([x, e.y, e.z], [x, ROOF.at(x), e.z], m.a, m.b) < (m.strut ? 0.5 : 1.8))) continue;
    assembly(e.name).member([x, e.yc, e.z], [x, ROOF.at(x), e.z], SECTION.round(0.03), TENDON, 'tie', 'hanger').rest([x, ROOF.at(x), e.z], `purlin ${x}`);
    hung.push({ x, e });
  }
  lap('hangers');
  // ---- 3. the wind trusses. A wall 142 m long cannot span that far sideways against the wind by itself. Half way
  // up each storey a horizontal truss runs round the inside of the four walls: its outer chord is the wall's wind
  // girder, its inner chord runs parallel to the wall as far in as it can, with a post at every column and a
  // diagonal in every bay where one will pass (a bay without one works as a Vierendeel panel). Each truss spans
  // from corner to corner, where the two walls it meets take its ends in their own planes. Over the height of the
  // dial the front wall has a hole 112 m across, and the front's trusses at those levels run from the side walls
  // to it, ending on the wall where the ring cuts them, so that they hold the ring's sides; the ring, a box as wide as
  // the wall, spans between them and the columns below the dial against the wind on the dial. Every member is planned
  // against everything else in the hall at the size it may grow to.
  windTrusses = [];
  {
    const cx = TOWER.hx + TOWER.wall / 2, cz = TOWER.hz + TOWER.wall / 2, CH = WT_CHORD, WEB = WT_WEB;
    const roofBars = [...ROOF.purlins.map(x => [[x, ROOF.at(x), -TOWER.hz], [x, ROOF.at(x), TOWER.hz], 1.6]),
      ...TRUSS_Z.flatMap(z => [[[-TOWER.hx, ROOF.eaves, z], [TOWER.hx, ROOF.eaves, z], 2.1], [[-TOWER.hx, ROOF.eaves, z], [0, ROOF.ridge, z], 2.1], [[TOWER.hx, ROOF.eaves, z], [0, ROOF.ridge, z], 2.1]])];
    const hangLines = hung.map(h => [[h.x, h.e.y, h.e.z], [h.x, ROOF.at(h.x) + 0.4, h.e.z]]);
    const headroom = G.clear.map(zn => obb(zn.lo.map((v, i) => (v + zn.hi[i]) / 2), [[1, 0, 0], [0, 1, 0], [0, 0, 1]], zn.lo.map((v, i) => (zn.hi[i] - v) / 2)));
    // (a member that meets the wall is tested from 1.5 m in: its end is in the wall, which is its joint)
    const offWall = (a, b) => { const inA = Math.abs(Math.abs(a[0]) - cx) < 0.05 || Math.abs(Math.abs(a[2]) - cz) < 0.05; if (!inA) return [a, b]; const d = b.map((v, i) => v - a[i]), L = Math.hypot(...d); return [a.map((v, i) => v + d[i] / L * Math.min(1.5, L / 2)), b]; };
    const memo = new Map(), clearOf = (a0, b0, sz) => { const key = `${a0}|${b0}|${sz}`; if (memo.has(key)) return memo.get(key); const [a, b] = offWall(a0, b0), v = Math.abs(a[1] - TOP_TRUSS) < 0.01 ? clearTop(a, b, sz) : clear1(a, b, sz); memo.set(key, v); return v; };
    // (in the flat at the top there is nothing else; only what reaches up into it, and the roof under it, can be in the way)
    // (and what is drawn up to it: the steam mains in the corners run up to the flat)
    const drawnTop = boxIndex(drawn.list.filter(o => !(o.half[0] > TOWER.hx && o.half[2] > TOWER.hz))), inTop = (a, b, sz) => { const d = b.map((v, i) => v - a[i]), L = Math.hypot(...d); return L > 1.2 && !!drawnTop.hit(memberBox(a.map((v, i) => v + d[i] / L * 0.4), b.map((v, i) => v - d[i] / L * 0.4), sz, sz)); };
    const clearTop = (a, b, sz) => !inTop(a, b, sz) && !taken(a, b, sz, sz, 'wind') && !hangLines.some(([p, q]) => gap(a, b, p, q) < sz / 2 + 0.25) && !roofBars.some(([p, q, r]) => gap(a, b, p, q) < (sz + r) / 2 + 0.2);
    // (and the inner chord's joints themselves, which a member's test stops short of: a chord runs on through a
    // column line where no post meets it, and a stair's bracket may stand on that line)
    const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const nodeClear = (p, sz) => Math.abs(p[1] - TOP_TRUSS) < 0.01 || (!drawn.hit(obb(p, I3, [sz / 2 + 0.15, sz / 2 + 0.15, sz / 2 + 0.15]))
      && !G.world.intersectionWithShape({ x: p[0], y: p[1], z: p[2] }, { x: 0, y: 0, z: 0, w: 1 }, new R.Cuboid(sz / 2 + 0.1, sz / 2 + 0.1, sz / 2 + 0.1), undefined, undefined, G.ground) && !forbidden(p));
    const clear1 = (a, b, sz) => !fouls(a, b, sz, sz) && !taken(a, b, sz, sz, 'wind') && !hangLines.some(([p, q]) => gap(a, b, p, q) < sz / 2 + 0.25)
      && !roofBars.some(([p, q, r]) => gap(a, b, p, q) < (sz + r) / 2 + 0.2) && !headroom.some(o => overlaps(memberBox(a, b, sz, sz), o));
    const walls = { 'shell back': { at: -cz, along: 'x', ends: [-cx, cx], lines: [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60] }, 'shell front': { at: cz, along: 'x', ends: [-cx, cx], lines: [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60], dial: true },
      'shell left': { at: -cx, along: 'z', ends: [-cz, cz], lines: [-30, -20, -10, 0, 10, 20, 30] }, 'shell right': { at: cx, along: 'z', ends: [-cz, cz], lines: [-30, -20, -10, 0, 10, 20, 30] } };
    // a point on the wall's centre line (d = 0) or d in from it, at c along it
    const pt = (W, c, y, d = 0) => { const inn = W.at - Math.sign(W.at) * d; return W.along === 'x' ? [c, y, inn] : [inn, y, c]; };
    const chordAt = (y) => Math.sqrt(Math.max(0, RING * RING - (y - DIAL.y) ** 2));
    for (const y of [...WIND_LEVELS, TOP_TRUSS]) {
      // the stretches of each wall a truss can run along at this height (the front is cut by the dial)
      const runs = {};
      for (const [name, W] of Object.entries(walls)) {
        const cut = W.dial && Math.abs(y - DIAL.y) < RING ? chordAt(y) : 0;
        const spans = cut ? [[W.ends[0], DIAL.x - cut], [DIAL.x + cut, W.ends[1]]] : [[W.ends[0], W.ends[1]]];
        // the deepest that lets its inner chord run unbroken from end to end of each stretch, with posts at most columns;
        // where nothing will pass half way up the storey (along the back the flights of stairs and their cantilevers are
        // there, one every 8 m at a different height), a little higher or lower, up to 6.5 m
        const fits = (d, yy) => spans.every(([e0, e1]) => {
          const st = W.lines.filter(c => c > e0 + 1 && c < e1 - 1);
          return st.length && st.filter(c => clearOf(pt(W, c, yy), pt(W, c, yy, d), WEB)).length >= st.length / 2 && st.every((c, i) => nodeClear(pt(W, c, yy, d), CH) && (i === 0 || clearOf(pt(W, st[i - 1], yy, d), pt(W, c, yy, d), CH)));
        });
        for (const yy of cut || y === TOP_TRUSS ? [y] : [0, 2, -2, 3.5, -3.5, 5, -5, 6.5, -6.5].map(dy => y + dy)) { const d = [8, 6, 5, 4, 3, 2.5].find(d => fits(d, yy)); if (d) { runs[name] = { W, d, spans, y: yy }; break; } }
      }
      // members, wall by wall; where two trusses meet in a corner their inner chords meet at the inner corner
      const corner = (W, e, yy) => { const other = Object.values(runs).find(r => r.W.along !== W.along && Math.abs(r.W.at - e) < 0.01 && r.y === yy); return other ? { d: other.d, W: other.W } : null; };
      for (const [name, r0] of Object.entries(runs)) {
        const { W, d } = r0, r = r0, y = r0.y, ms = [], add = (a, b, label, sz) => { if (clearOf(a, b, sz)) { ms.push({ a, b, label }); return true; } return false; };
        for (const [e0, e1] of r.spans) {
          const st = W.lines.filter(c => c > e0 + 1 && c < e1 - 1);
          for (const c of st) add(pt(W, c, y), pt(W, c, y, d), 'post', WEB);
          for (let i = 1; i < st.length; i++) ms.push({ a: pt(W, st[i - 1], y, d), b: pt(W, st[i], y, d), label: 'chord' });
          for (let i = 1; i < st.length; i++) add(pt(W, st[i - 1], y, i % 2 ? 0 : d), pt(W, st[i], y, i % 2 ? d : 0), 'diagonal', WEB) || add(pt(W, st[i - 1], y, i % 2 ? d : 0), pt(W, st[i], y, i % 2 ? 0 : d), 'diagonal', WEB);
          // the ends: into the corner, where the wall beside takes it; or, at the dial, back to the wall where the ring cuts it
          for (const [e, c] of [[e0, st[0]], [e1, st[st.length - 1]]]) {
            if (Math.abs(e - W.ends[0]) > 0.01 && Math.abs(e - W.ends[1]) > 0.01) { add(pt(W, c, y, d), pt(W, e, y), 'diagonal', WEB); continue; }
            const o = corner(W, e, y), cw = pt(W, e, y);
            add(cw, pt(W, c, y, d), 'diagonal', WEB);
            if (o) {
              const ic = W.along === 'x' ? [o.W.at - Math.sign(o.W.at) * o.d, y, W.at - Math.sign(W.at) * d] : [W.at - Math.sign(W.at) * d, y, o.W.at - Math.sign(o.W.at) * o.d];
              if (nodeClear(ic, CH)) add(pt(W, c, y, d), ic, 'chord', CH);
            }
          }
        }
        windTrusses.push({ wall: name, y, d, members: ms });
      }
    }
  }
  lap('wind trusses');
  weighStone();
  lap('stone');
  timing.plan = performance.now() - t0; timing.laps = laps;
  // Start from the sizes the last design of this same plan converged to, if there is one (see SEED): the loop then
  // only has to confirm them. A seed for a different plan is not used.
  plan = planSignature();
  const seed = [readSeed(), SEED].find(x => x && x.plan === plan && x.sizes);
  timing.seed = seed ? (seed === SEED ? 'design.json' : 'this browser') : 'none';
  if (seed) for (const [k, v] of Object.entries(seed.sizes)) sizes.set(k, v);
  designLoop();
  writeSeed();
  const t1 = performance.now();
  draw();
  timing.draw = performance.now() - t1;
  const count = (k) => towers.reduce((n, t) => n + t[k].length, 0);
  return { towers: towers.map(t => ({ name: t.name, height: +t.yh.toFixed(1), splay: [t.s['-1'], t.s['1']], unbraced: Math.round(Math.max(...t.legs.map(l => l[2]))), thick: [Math.min(...t.legs.map(l => l[3])), Math.max(...t.legs.map(l => l[3]))], ties: t.ties.length, braces: t.braces.length, struts: t.struts.length, stayed: t.stayed })),
    members: count('legs') + count('ties') + count('braces') + count('struts'), links: links.length, hangers: hung.length, winding: wind && { yoke: wind.yoke.beams.length + wind.yoke.posts.length + wind.yoke.arms.length, lever: wind.lever.tied, steadiesAt: wind.steadies.map(m => [Math.round(m[2]), Math.round(m[1][1])]), at: wind.trestles.map(t => t.top.map(v => Math.round(v))), trestles: wind.trestles.length, posts: wind.tips.map(j => j.posts.length), steadies: wind.steadies.length }, detent: detent && { ...detent }, passes, timing, analysis: () => lastResult, service: () => ({ bearings: bearingMoves(lastResult), walls: wallMoves(lastResult) }), stone: () => stone && { faces: Object.fromEntries(Object.entries(stone.faces).map(([k, f]) => [k, Math.round(f.total / 1e3)])), crown: Object.fromEntries(Object.entries(stone.crown).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, Math.round(k === 'e' ? v * 100 : v / 1e3)])), own: Object.fromEntries(Object.entries(stone.own).map(([k, l]) => [k, Math.round(l.reduce((t, p) => t + p.kg, 0) / 1e3)])), rim: Math.round(stone.rim / 1e3) }, windTrusses: windTrusses.map(t => [t.wall, t.y, t.d, t.members.length]), seed: seedOut, sizes: Object.fromEntries([...sizes].map(([k, v]) => [k, +v.toFixed(2)])) };
}

// ---- the seed. The design loop only ever enlarges, so starting it from sizes that held before can make nothing
// pass that does not: every pass analyses what is declared at the sizes it has, and the check analyses it all again,
// exactly. The seed is the sizes of the last converged design, kept in this browser and, for a first visit, in
// src/structure/design.json (window.__game.structure.seed() gives what to put there). Each is tied to the plan it
// was made for: a fingerprint of every member's place, so that a seed for another plan is never used.
const SEED_KEY = 'great-clock: structure sizes';
const DESIGN_VERSION = 6;                             // (raise it when the loads or the rules change, so that no seed outlives them)
function planSignature() {
  const r = (p) => p.map(v => Math.round(v * 100)).join(',');
  const parts = [...towers.map(T => [T.name, ...T.legs.map(m => r(m[0]) + ':' + r(m[1]) + ':' + m[3]), ...T.ties.map(m => r(m[0])), ...T.braces.map(m => r(m[0]) + r(m[1])), ...T.struts.map(m => r(m[0]) + r(m[1]))].join(';')),
    links.map(l => r(l.a) + r(l.b)).join(';'), hung.map(h => h.x + h.e.name).join(';'), windTrusses.map(t => t.wall + t.y + ':' + t.d + ':' + t.members.map(m => r(m.a) + r(m.b)).join('')).join(';'),
    wind ? JSON.stringify([wind.trestles.map(t => t.top), wind.tips.map(t => t.posts), wind.steadies, wind.yoke, wind.lever]) : '', detent ? r(detent.p0) + r(detent.p1) + detent.h + detent.w + ':' + detent.R + (detent.strut ? r(detent.strut.p2) : '') : '',
    // and the loads that are not fixed in code: the stone as drawn, by face and on the crown (tonnes), and the brick
    stone ? Object.values(stone.faces).map(f => Math.round(f.total / 1e3)).join(',') + ':' + Math.round(stone.crown.total / 1e3) + ':' + Object.values(stone.own).map(l => Math.round(l.reduce((t, p) => t + p.kg, 0) / 1e3)).join(',') : '', Math.round(BRICK_PER_M2), String(DESIGN_VERSION)].join('|');
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < parts.length; i++) { const c = parts.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c; }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + parts.length.toString(36);
}
const readSeed = () => { try { return JSON.parse(localStorage.getItem(SEED_KEY) || 'null'); } catch { return null; } };
const writeSeed = () => { try { localStorage.setItem(SEED_KEY, JSON.stringify(seedOut())); } catch { /* (private window: start cold next time) */ } };
const seedOut = () => ({ plan, sizes: Object.fromEntries(sizes) });

// The size of one group of members: remembered between passes, enlarged when overworked.
const size = (key, start) => { if (!sizes.has(key)) sizes.set(key, start); return sizes.get(key); };
// How each group grows when it is overworked: grow.get(key)(factor) enlarges the dimension that helps, and
// says false when it cannot grow any more (it is as big as the room it was planned in).
const grow = new Map();
const PLATE = 20;                                    // a box's plates start at a twentieth of its width: c/t = 18, inside the limit of 21.5 for this steel
const TMAX = 0.25;                                   // and may thicken to a quarter of its smaller side, no further
// A welded box, h deep in the plane it bends in most and b wide (no wider than bmax). Its depth grows first, up to
// hmax, the depth its clearance was tested at when the structure was planned; then its plates thicken.
function boxSized(owner, label, start, bmax, hmax = Infinity, wide = 0.7) {
  const k = `${owner}|${label}`, h = Math.min(size(k, start), hmax), tk = size(`${k}|plate`, 1), b = Math.min(wide * h, bmax);
  const t = Math.min(TMAX * Math.min(h, b), Math.max(0.012, Math.max(h, b) / PLATE) * tk);
  grow.set(k, (f) => {
    if (h < hmax - 1e-6) { sizes.set(k, Math.min(hmax, h * f)); return true; }
    if (t < TMAX * Math.min(h, b) - 1e-6) { sizes.set(`${k}|plate`, tk * f); return true; }
    return false;
  });
  return SECTION.box(h, b, t);
}
// A piece of a tower's leg: m[3] thick across its frame (as much as its place between the wheels allows), and deep
// in the plane of its frame as the analysis asks, up to four times its thickness or the 4 m its clearance was planned
// for. A blade between two wheels that needs more than that is given thicker plates, not more depth: what holds a
// thin leg from buckling sideways is a strut to the other frame, not depth.
const legLabel = (T, m) => `leg, ${Math.abs(m[0][2] - T.planes[0]) < 0.01 ? 'back' : 'front'} frame, ${m[3]} m thick`;
const LEG_H = 4.0;
// the most a member of the winding gear's trestles and jibs may be: what their places were planned for. A jib's depth
// is fixed by the room under the shaft it reaches in beneath; it takes the teeth's push across the shaft as well as
// the weight, so it is planned as wide as it is deep and may grow sideways as far.
const WG_H = 0.9, WG_B = 0.6, JIB_H = 0.5, JIB_B = 0.6;
const YOKE_H = 0.6, YOKE_B = 1.6, YOKE_ARM = 1.0, STEADY = 0.5;
// The right-hand upright shaft's foot is pulled up while the weight is wound. Its footstep is double-acting, and its
// casting is held down by rods cast into the raft: n of them, d across (grade 8.8, fub), anchored hef deep. (EN 1992-4.)
const ANCHOR = { n: 8, d: 0.1, D: 2.3, hef: 4.0, fub: 800e6, k1: 7.7 };          // the yoke's beams, no deeper than passes between the front bearing and the arbor's sweep, and as wide as the room between barrel and winding wheel
function legSection(T, m) {
  const w = m[3], hmax = Math.min(LEG_H, 4 * w);
  return boxSized(T.name, legLabel(T, m), Math.min(1.0 * Math.max(1, w), hmax), w, hmax, 99);
}

// A link is drawn from the face of one leg to the face of the other: the legs it is bolted between are its joints.
function faces(l) {
  const thick = (T, side, p) => (T.legs.find(m => m[4] === side && Math.abs(m[0][2] - p[2]) < 0.01 && p[1] >= m[5] - 0.01 && p[1] <= m[6] + 0.01) || [0, 0, 0, DEPTH])[3];
  const d = l.b.map((v, i) => v - l.a[i]), L = Math.hypot(...d), u = d.map(v => v / L), ca = thick(l.A, l.sa, l.a) / 2 / Math.max(0.3, Math.abs(u[2])), cb = thick(l.B, l.sb, l.b) / 2 / Math.max(0.3, Math.abs(u[2]));
  return ca + cb > L - 0.2 ? null : [l.a.map((v, i) => v + u[i] * ca), l.b.map((v, i) => v - u[i] * cb)];       // (none drawn where the legs all but touch: a packing plate)
}

// Declares the towers and the roof at their present sizes. With `out`, also lists what to draw.
function declare(out = null) {
  const hx = TOWER.hx, hz = TOWER.hz, top = ROOF.at, y0 = ROOF.eaves;
  for (const T of towers) {
    // All six towers, and the links between them, are one frame: they are analysed together, so that what a
    // link asks of the tower it is tied to is found, not assumed, and nothing is held still by fiat.
    const A = redeclare(T.name, 'braced tower of two A-frames, standing on the floor'), S = (label, start) => size(`${T.name}|${label}`, start);
    A.frame = 'towers';
    const put = (m, section, h, w, label) => { A.member(m[0], m[1], section, ALLOY, 'beam', label); if (out) out.push({ a: m[0], b: m[1], h, w, label, owner: T.name }); };
    // Legs are sized by where they are, frame by frame: the pieces that pass between two wheels are thin. A leg
    // has two sizes, its depth in the plane of its frame and its plate; see legSection().
    for (const m of T.legs) { const label = legLabel(T, m), sec = legSection(T, m); put(m, sec, sec.dims.h, m[3], label); }
    for (const p of T.feet) A.rest(p, 'ground', 'fix');
    for (const m of T.ties) { const s = boxSized(T.name, 'tie beam', 0.5, DEPTH, 1.2); put(m, s, s.dims.h, s.dims.b, 'tie beam'); }
    for (const m of T.braces) { const s = boxSized(T.name, 'brace', 0.4, DEPTH, 1.4); put(m, s, s.dims.h, s.dims.b, 'brace'); }
    for (const m of T.struts) { const s = boxSized(T.name, 'strut', 0.4, 1.1, 1.5); put(m, s, s.dims.h, s.dims.b, 'strut'); }
    if (T.arbor === 'great' && wind) {
      // The steadies that keep the upright shafts in line, the yoke that holds the worms' bearings (see the plan), and
      // the bracket the clutch lever is pinned to. What the shafts push them with is handed to them by the shafts' braces.
      const sy = boxSized(T.name, 'steady', 0.3, STEADY, STEADY, 1), yk = boxSized(T.name, 'yoke', 0.4, YOKE_B, YOKE_H, 4), ya = boxSized(T.name, 'yoke arm', 0.4, YOKE_ARM, YOKE_H, 4), lb = boxSized(T.name, 'lever bracket', 0.3, 0.4, 0.4, 1);
      for (const m of wind.steadies) put(m, sy, sy.dims.h, sy.dims.b, 'steady');
      const Yk = wind.yoke;
      for (const m of [...Yk.beams, ...Yk.posts]) put(m, yk, yk.dims.h, yk.dims.b, 'yoke');
      for (const m of Yk.arms) put(m, ya, ya.dims.h, ya.dims.b, 'yoke arm');
      // (the cap over the front bearing, and the stub under the head casting, are castings as stiff as the pillow block)
      for (const m of Yk.caps) A.member(m[0], m[1], SECTION.box(2 * T.r + 1.2, DEPTH, 0.3), ALLOY, 'beam', 'yoke cap');
      for (const m of Yk.arms) A.mass(m[1], WINDGEAR.wormKg / 4 + 12e3, 'bearing housing');
      const L = wind.lever;
      put(L.arm, lb, lb.dims.h, lb.dims.b, 'lever bracket'); put(L.post, lb, lb.dims.h, lb.dims.b, 'lever bracket');
      A.mass(L.post[1], 6e3, 'clutch lever');
    }
    for (const l of links) {
      // a distance piece bolted between a leg of this tower and a leg of the next: a member like any other
      // (pinned at both ends: it holds the two legs at their distance and passes nothing else between the towers)
      if (l.A === T) { const s = boxSized(T.name, 'link', 0.7, 0.8, 0.8); A.member(l.a, l.b, s, ALLOY, 'link', 'link'); const f = out && faces(l); if (f) out.push({ a: f[0], b: f[1], h: s.dims.h, w: s.dims.b, label: 'link', owner: T.name, joins: [l.A.name, l.B.name] }); }
      if (l.B === T) A.node(l.b);                                    // the other tower's leg is joined there
    }
    T.planes.forEach((z) => A.member([T.a.x, T.yh, z], [T.a.x, T.a.y, z], SECTION.box(2 * T.r + 1.2, DEPTH, 0.3), ALLOY, 'strut', 'pillow block'));
    // the arbor, held endwise in both bearings, ties the two heads together (see clockwork.js); it is the arbor's
    // own steel, so its weight is not counted again here
    A.member([T.a.x, T.a.y, T.planes[0]], [T.a.x, T.a.y, T.planes[1]], SECTION.round(T.r), { ...ALLOY, rho: 0 }, 'link', 'arbor, as a tie');
  }
  if (wind) {
    const W = WINDGEAR, A = redeclare('winding gear', 'trestles and a jib under the line shafts, standing on the floor');
    const put = (a, b, label, start) => { const s = label === 'jib' ? boxSized('winding gear', label, start, JIB_B, JIB_H, 1.2) : boxSized('winding gear', label, start, WG_B, WG_H); A.member(a, b, s, ALLOY, 'beam', label); if (out) out.push({ a, b, h: s.dims.h, w: s.dims.b, label, owner: 'winding gear' }); };
    for (const t of wind.trestles) {
      for (const f of t.feet) { put(f, t.top, 'trestle', 0.25); A.rest(f, 'ground', 'fix'); }
      A.mass(t.top, t.kg, 'shaft');
      if (t.push) A.force(t.top, t.push, 'the bevel wheels, while winding', 'winding');
    }
    for (const j of wind.tips) {
      for (const f of j.posts) { const head = [f[0], j.tip[1], f[2]]; put(f, head, 'post', 0.5); put(head, j.tip, 'jib', 0.35); A.rest(f, 'ground', 'fix'); }
      A.mass(j.tip, j.kg, 'line shaft and mitre wheel').force(j.tip, j.push, 'the mitre wheels, while winding', 'winding');
    }
    if (wind.head.length) {
      // the lift's head frame: two girders out from the back wall, one either side of the shaft, each on a raking strut,
      // and a beam across them in front of and behind the wheels to carry the two top bearings
      const H = redeclare('lift head', 'frame carrying the lift\'s top wheels, bracketed off the back wall'), zw = -TOWER.hz + 0.35, y = wind.head[0][1], zf = Math.max(...wind.head.map(p => p[2]));
      const bar = (a, b) => { const s = boxSized('lift head', 'girder', 0.4, 0.6, 1.0); H.member(a, b, s, ALLOY, 'beam', 'girder'); if (out) out.push({ a, b, h: s.dims.h, w: s.dims.b, label: 'lift head', owner: 'lift head' }); };
      for (const x of [LIFT.x0 - 0.6, LIFT.x1 + 0.6]) {
        bar([x, y, zw], [x, y, zf]); bar([x, y - 4.5, zw], [x, y, zf]);
        H.rest([x, y, zw], 'shell back').rest([x, y - 4.5, zw], 'shell back');
      }
      for (const p of wind.head) { bar([LIFT.x0 - 0.6, y, p[2]], [LIFT.x1 + 0.6, y, p[2]]); H.mass(p, 60e3, 'cars, chains and a wheel'); }
    }
    // The two upright shafts. Each stands on a footstep in a casting on its pedestal (a thrust bearing, with a neck
    // bearing above it under the crown wheel: together they hold the foot as if built in), and is held sideways by the
    // steadies and, either side of its worm, by the yoke's bearings: what it pushes them with is theirs. While the weight
    // is wound the teeth push its worm along it (up the right-hand shaft, down the left), off the wheel and across; the
    // first goes down the shaft to the footstep, the rest to the yoke. The bevels at its foot push its crown wheel.
    for (const u of W.uprights) {
      const B = redeclare(`upright shaft ${u.name}`, `steel shaft standing on a footstep${u.side > 0 ? ', held down' : ''}, the ${u.name}-hand worm on it`), P = (y) => [u.x, y, W.wz];
      B.member(P(0.6), P(W.top), SECTION.round(W.upR), ALLOY, 'beam', 'shaft').mass(P(W.crownY - 0.4), W.crownKg, 'crown wheel').mass(P(W.y), W.wormKg, 'worm').rest(P(0.6), 'ground', 'fix');
      B.force(P(W.y), u.push, 'the winding wheel\'s teeth, while winding', 'winding').force(P(W.crownY), u.crown, 'the bevel wheels, while winding', 'winding');
      for (const m of wind.steadies.filter(m => m[2] === u.x)) B.brace(P(m[1][1]), 'x', 'tower great', m[1]).brace(P(m[1][1]), 'z', 'tower great', m[1]);
      for (const m of wind.yoke.arms.filter(m => m[2] === u.x)) B.brace(P(m[1][1]), 'x', 'tower great', m[1]).brace(P(m[1][1]), 'z', 'tower great', m[1]);
    }
  }
  if (detent) {
    // (welded to the centre tower's leg: part of that frame)
    const D = redeclare('maintaining detent', 'bracket carrying the pawl that holds the maintaining ratchet while the clock is wound'), s = boxSized('maintaining detent', 'bracket', 0.5, detent.w, detent.h);
    if (detent.strut) { const st = detent.strut, ss = boxSized('maintaining detent', 'strut', 0.5, st.sw, st.sh); D.member(st.p2, detent.p1, ss, ALLOY, 'beam', 'strut').rest(st.p2, 'tower center', 'fix'); if (out) out.push({ a: st.p2, b: detent.p1, h: ss.dims.h, w: ss.dims.b, label: 'detent', owner: 'tower center' }); }
    D.frame = 'towers';
    // the pawl is a solid steel bar built into the bracket's end, the ring's tooth bearing on its tip: a cantilever
    const tip = [ARBOR.great.x + PAWL_TIP, detent.p1[1], PAWL_Z], root = [detent.p1[0], detent.p1[1], PAWL_Z];
    D.member(detent.p0, detent.p1, s, ALLOY, 'beam', 'bracket').member(detent.p1, root, SECTION.box(PAWL[0], PAWL[1], PAWL[1] / 2), ALLOY, 'beam', 'pawl').member(root, tip, SECTION.box(PAWL[0], PAWL[1], PAWL[1] / 2), ALLOY, 'beam', 'pawl')
      .force(tip, [0, -0.5 * 2.6e6 * GRAVITY * 5 / 7.7 / 10, 0], 'the ring, held', 'winding').rest(detent.p0, 'tower center', 'fix');      // (a tenth of the weight's pull at the ring's rim: the springs carry the rest round to the wheel)
    if (out) out.push({ a: detent.p0, b: detent.p1, h: s.dims.h, w: s.dims.b, label: 'detent', owner: 'tower center' });
  }
  // The crossings (tower.js) are each two lattice girders, one along either edge of the deck, hung from the
  // purlins. Alone, a girder 1.2 m deep and 130 m long has nothing to hold its top chord sideways. A cross beam
  // under the deck at every vertical of the lattice, built into both verticals, makes each pair of verticals and
  // their cross beam a U-frame, which holds the top chords; the two girders and the cross beams are one frame.
  for (const [name, b] of Object.entries(BRIDGES)) {
    const edges = EDGES.filter(e => e.name.startsWith(`crossing ${name} `));
    if (edges.length !== 2) continue;
    const D = redeclare(`deck ${name}`, 'cross beams under a crossing\'s deck, joining its two girders'), lo = b.y - 0.2, s = SECTION.box(0.3, 0.12, 0.016), P = 8.75 / 4;
    D.frame = `crossing ${name}`;
    for (const e of edges) { const g = getAssembly(e.name); if (g) g.frame = D.frame; }
    const xs = [-65, 65];
    for (let x = ROOF.purlins[0] + Math.ceil((-65 - ROOF.purlins[0]) / P) * P; x < 65; x += P) if (x > -65) xs.push(x);
    for (const x of xs) {
      const a = [x, lo, edges[0].z], c = [x, lo, edges[1].z];
      D.member(a, c, s, ALLOY, 'beam', 'cross beam');
      if (out) out.push({ a: [x, b.y - 0.19, edges[0].z], b: [x, b.y - 0.19, edges[1].z], h: 0.3, w: 0.12, label: 'cross beam' });
    }
  }
  for (const x of ROOF.purlins) {
    const A = redeclare(`purlin ${x}`, 'purlin'), s = boxSized(`purlin ${x}`, 'purlin', 0.35, 1.0, 1.5);
    A.member([x, top(x), -hz], [x, top(x), hz], s, ALLOY, 'beam', 'purlin');
    for (const z of TRUSS_Z) A.rest([x, top(x), z], `roof truss ${z}`);
    A.rest([x, top(x), -hz], 'shell back').rest([x, top(x), hz], 'shell front');
    if (out) out.push({ a: [x, top(x) + 0.45, -hz], b: [x, top(x) + 0.45, hz], h: s.dims.h, w: s.dims.b, label: 'purlin' });
  }
  const xs = [-hx, ...ROOF.purlins, hx];
  for (const z of TRUSS_Z) {
    const name = `roof truss ${z}`, A = redeclare(name, 'spans the hall, wall to wall');
    const bar = (a, b, label, start) => { const s = boxSized(name, label, start, 1.2, 2.0); A.member(a, b, s, ALLOY, 'beam', label); if (out) out.push({ a, b, h: s.dims.h, w: s.dims.b, label }); };
    bar([-hx, y0, z], [hx, y0, z], 'bottom chord', 0.45);
    bar([-hx, y0, z], [0, ROOF.ridge, z], 'rafter', 0.45); bar([hx, y0, z], [0, ROOF.ridge, z], 'rafter', 0.45);
    for (let i = 1; i < xs.length - 1; i++) {
      bar([xs[i], y0, z], [xs[i], top(xs[i]), z], 'post', 0.25);
      const j = xs[i] < 0 ? i + 1 : i - 1;
      if (xs[i] !== 0) bar([xs[i], y0, z], [xs[j], top(xs[j]), z], 'diagonal', 0.25);
      A.brace([xs[i], top(xs[i]), z], 'z', 'shell back', [xs[i], top(xs[i]), -hz]);       // the purlins keep it upright, and take what that asks to the back wall
    }
    A.rest([-hx, y0, z], 'shell left').rest([hx, y0, z], 'shell right', 'yz');           // one shoe fixed, the other free to slide as the truss stretches
  }
  declareShell(out);
}

// ---- the shell: a steel frame with brick panels between
const LINTEL = 9;                                     // height of the girder over the door
const WALL_T = TOWER.wall + 0.3;                      // frame members are a little thicker than the brick, so they show on both faces
const LEVELS = [30, 60, 90, 120, 150, 180, ROOF.eaves, TOWER.H], RING = DIAL.r + 1.2;
// The brick panels are diaphragm walls: as thick overall as they are drawn, but two leaves of brick with cross-ribs
// of brick between them, bonded into both, like a cavity wall with its cavity walled across. Per metre of wall face:
const DIAPHRAGM = (() => {
  const T = TOWER.wall, leaf = 0.45, rib = 0.33, every = 1.5, gapT = T - 2 * leaf;
  const A = 2 * leaf + rib * gapT / every;                                                       // m2 of brick in a metre's run of wall
  const I = 2 * (leaf ** 3 / 12 + leaf * (T / 2 - leaf / 2) ** 2) + rib / every * gapT ** 3 / 12;     // m4 per metre, bending out of the wall's plane
  return { T, leaf, rib, every, A, I, Z: I / (T / 2), solid: A / T };
})();
const BRICK_PER_M2 = DIAPHRAGM.A * MATERIAL.brick.rho * GRAVITY;       // weight of a square metre of wall face, N
// what the attic's walls and floor put on a metre of the top girder (see weighStone): the wall heads are 2 (142 + 82) m round
const atticPerM = () => (stone.crown.slab + stone.crown.attic) * GRAVITY / (4 * (TOWER.hx + TOWER.hz + TOWER.wall));

// A member of the wall frame: a welded box `across` wide through the wall and as deep along it as the analysis asks,
// up to `cap`; past that its plates thicken. orient 'h': it grows in its own y' direction; 'b': in z'.
function wallBox(key, start, cap, across, orient = 'h') {
  const g = Math.min(size(key, start), cap), tk = size(`${key}|plate`, 1);
  const [h, b] = orient === 'h' ? [g, across] : [across, g];
  const tw = Math.min(0.25 * b, Math.max(0.03, h / PLATE) * tk), tf = Math.min(0.25 * h, Math.max(0.03, b / PLATE) * tk);
  grow.set(key, (f) => {
    if (g < cap - 1e-6) { sizes.set(key, Math.min(cap, g * f)); return true; }
    if (tw < 0.25 * b - 1e-6 || tf < 0.25 * h - 1e-6) { sizes.set(`${key}|plate`, tk * f); return true; }
    return false;
  });
  return SECTION.box(h, b, tw, tf);
}

// Wind. The peak velocity pressure at the top of the tower, WIND_Q, is taken over its whole height (which
// overstates it lower down). On the face it blows on it pushes with 0.8 of that, on the face behind it pulls with
// 0.6, and on the two faces it runs along it pulls with 0.9 (an average of zones A and B, EN 1991-1-4 7.2.2), with
// an inside pressure of +0.2 or -0.3 on every wall from inside, whichever is worse (the door is the only opening).
// The brick panels span up and down between girders, so a girder takes the wind on half the panel above it and half
// the panel below. Wind on the roof is not applied (it would lighten it, and the crown is heavy).
const WINDS = { 'wind +x': [1, 0, 0], 'wind -x': [-1, 0, 0], 'wind +z': [0, 0, 1], 'wind -z': [0, 0, -1] };
const cpOf = (n, d) => { const c = n[0] * d[0] + n[2] * d[2]; return c < -0.5 ? 0.8 : c > 0.5 ? -0.6 : -0.9; };
// what one square metre of a wall facing n is pushed with, by case (N/m^2, world axes)
const windOn = (n) => Object.fromEntries([...Object.entries(WINDS).map(([k, d]) => { const cp = cpOf(n, d); return [k, n.map(v => -cp * WIND_Q * v)]; }), ['inside', n.map(v => 1e3 * v)]]);

// ---- the stone, weighed. Every piece of stone facade.js draws on a wall's face is found in DRAWN and weighed
// where it is, storey by storey: a pier runs unbroken from the plinth to the cornice to look at, but it is built
// in storey-high lifts, each standing on a steel shelf off the girder below it with a soft joint under the next
// shelf up, as stone on a steel frame is, so that no stone carries more than one storey of itself. What stands
// below the first girder stands on the raft. Pieces set against the wall are united where they overlap (a depth
// map of each face at half-metre squares), others are added whole. The clock panel and the rim round the dial are
// meshes, not parts: they are weighed from their dimensions in facade.js, and so are the other stone meshes it
// lists (MESH_STONE). The attic's brick, on the wall line above the cornice, is weighed as drawn too, as solid
// brick, and stands on the top girder with the attic's stone. What is drawn for the stair towers, the escape turret
// and the stack (marked with their names) is weighed for them; what stands above the attic is the crown's. (What is
// drawn for the coal yard and the flue stands on the ground, and is set aside.)
const STONE_RHO = MATERIAL.stone.rho, CELL = 0.5;
const FRACTION = { box: 1, tread: 1, cyl: Math.PI / 4, rod: Math.PI / 4, tube: Math.PI / 4, cone: Math.PI / 12, sph: Math.PI / 6, knob: Math.PI / 6, arch: 0.55, pyr: 1 / 3, wedge: 0.5 };
const volumeOf = (o) => (FRACTION[o.kind] ?? 0.5) * (['arch', 'pyr', 'wedge'].includes(o.kind) ? 1 : 8) * o.half[0] * o.half[1] * o.half[2];
// The brick of what stands outside the walls, as a fraction of solid: the stair towers' 1.5 m walls and the turret's
// 1.2 m are cavity walls like the hall's (two leaves with cross-ribs between); the stack's are solid.
const BRICK_SOLID = { 'stair tower left': 0.52, 'stair tower right': 0.52, 'escape turret left': 0.6, 'escape turret right': 0.6, stack: 1, yard: 1, flue: 1 };
// the attic's floor: a slab ARCH.slab thick and ARCH.band wide all round, with the workshop and the keepers on it
const SLAB_KG_M = ARCH.slab * ARCH.band * 2400 + 250 * ARCH.band;
let stone = null;
function weighStone() {
  const ox = TOWER.hx + TOWER.wall, oz = TOWER.hz + TOWER.wall, top = ARCH.attic + 1;
  const faces = {
    'shell back': { n: [0, 0, -1], off: oz, half: ox + 8 }, 'shell front': { n: [0, 0, 1], off: oz, half: ox + 8 },
    'shell left': { n: [-1, 0, 0], off: ox, half: oz + 8 }, 'shell right': { n: [1, 0, 0], off: ox, half: oz + 8 },
  };
  for (const f of Object.values(faces)) { f.nu = Math.ceil(2 * f.half / CELL); f.ny = Math.ceil(top / CELL); f.depth = new Float32Array(f.nu * f.ny); f.kg = new Float64Array(f.nu * f.ny); f.attic = new Float64Array(f.nu); f.ax = f.n[2] ? 2 : 0; f.ua = f.n[2] ? 0 : 2; }
  const cell = (f, u, y) => { const i = Math.floor((u + f.half) / CELL), j = Math.floor(y / CELL); return i >= 0 && i < f.nu && j >= 0 && j < f.ny ? j * f.nu + i : -1; };
  const faceOf = (c) => { const ex = Math.abs(c[0]) - ox, ez = Math.abs(c[2]) - oz; return ez >= ex ? faces[c[2] < 0 ? 'shell back' : 'shell front'] : faces[c[0] < 0 ? 'shell left' : 'shell right']; };
  const crown = { stone: 0, pieces: [] }, own = Object.fromEntries(Object.keys(BRICK_SOLID).map(k => [k, []]));
  for (const o of DRAWN) {
    if (o.tag !== 'outside' || (o.mat !== 'facade' && o.mat !== 'brick')) continue;
    const brick = o.mat === 'brick', c = o.c;
    if (o.on && own[o.on]) { own[o.on].push({ c, kg: volumeOf(o) * (brick ? MATERIAL.brick.rho * BRICK_SOLID[o.on] : STONE_RHO), brick }); continue; }
    if (brick) {                                                                                  // the attic's walls
      if (c[1] > TOWER.H) { const f = faceOf(c), i = Math.floor((c[f.ua] + f.half) / CELL); if (i >= 0 && i < f.nu) f.attic[i] += volumeOf(o) * MATERIAL.brick.rho; }
      continue;
    }
    const kg = volumeOf(o) * STONE_RHO;
    if (c[1] > ARCH.attic || (Math.abs(c[0]) < ox - 0.3 && Math.abs(c[2]) < oz - 0.3)) { crown.stone += kg; crown.pieces.push([c[0], c[1], c[2], kg]); continue; }      // above the attic: on the crown
    const f = faceOf(c);
    const square = (o.kind === 'box' || o.kind === 'tread') && Math.abs(o.q.w) > 0.9995;
    const inner = Math.abs(c[f.ax]) - o.half[f.ax];
    if (square && Math.abs(inner - f.off) < 0.15) {
      const d = Math.abs(c[f.ax]) + o.half[f.ax] - f.off;
      for (let y = c[1] - o.half[1] + CELL / 2; y < c[1] + o.half[1]; y += CELL) for (let u = c[f.ua] - o.half[f.ua] + CELL / 2; u < c[f.ua] + o.half[f.ua]; u += CELL) {
        const k = cell(f, u, y); if (k >= 0 && f.depth[k] < d) f.depth[k] = d;
      }
    } else { const k = cell(f, c[f.ua], c[1]); if (k >= 0) f.kg[k] += kg; }
  }
  for (const m of MESH_STONE) { const f = faceOf(m.c), k = cell(f, m.c[f.ua], m.c[1]); if (k >= 0) f.kg[k] += m.kg; }
  // the clock panel: 0.7 m of stone, a square with the dial's hole in it; the rim round the dial is carried by the ring
  const fr = faces['shell front'];
  for (let y = 90 + CELL / 2; y < 210; y += CELL) for (let u = -60 + CELL / 2; u < 60; u += CELL) if (Math.hypot(u - DIAL.x, y - DIAL.y) > DIAL.r + 0.4) { const k = cell(fr, u, y); fr.depth[k] = Math.max(fr.depth[k], 0.7); }
  const rim = 2 * Math.PI * (DIAL.r + 1.6) * Math.PI * 1.3 ** 2 * STONE_RHO;
  // by storey: kg in each half-metre of the face's length, for the stone standing on the girder at each level
  const bands = [0, ...LEVELS];
  for (const f of Object.values(faces)) {
    f.bands = bands.map(() => new Float64Array(f.nu)); f.total = 0;
    for (let j = 0; j < f.ny; j++) {
      const y = (j + 0.5) * CELL; let b = bands.length - 1; while (bands[b] > y) b--;
      for (let i = 0; i < f.nu; i++) { const w = f.depth[j * f.nu + i] * CELL * CELL * STONE_RHO + f.kg[j * f.nu + i]; f.bands[b][i] += w; f.total += w; }
    }
    f.depth = f.kg = null; f.covered = bands.map(() => 0); f.atticT = f.attic.reduce((t, v) => t + v, 0);
  }
  // The crown. Its stone is weighed as drawn, and so is the attic's brick (above); the rest from facade.js's dimensions
  // and these allowances: the mansard is copper on boarding on rails between the rafters, 1.2 kN/m2 of its surface;
  // the flat is zinc on boarding on joists, 1.0 kN/m2, with 1.5 kN/m2 more for snow and people; the lamp room's glass
  // in its iron frame and its cap, 300 t, with the outer half of its floor and the people on its gallery (whose stone
  // is drawn, and weighed with the drum's).
  const perim = 4 * (TOWER.hx + TOWER.hz + TOWER.wall), sl = Math.hypot(11, ARCH.flat - ARCH.attic), rf = LAMP.R - LAMP.drumWall;
  crown.clad = 1.2e3; crown.flat = 2.5e3;
  crown.lamp = 300e3 + 0.5 * (Math.PI * rf * rf - LAMP.well ** 2) * LAMP_FLOOR + Math.PI * ((LAMP.R + LAMP.gallery) ** 2 - LAMP.R ** 2) * 400;
  crown.roof = ((2 * (ox + ARCH.flatX + 0.8) + 2 * (oz + ARCH.flatZ + 0.8)) * sl * crown.clad + 4 * (ARCH.flatX + 0.8) * (ARCH.flatZ + 0.8) * crown.flat) / GRAVITY;
  crown.attic = Object.values(faces).reduce((t, f) => t + f.atticT, 0); crown.slab = SLAB_KG_M * perim;
  crown.total = crown.stone + crown.roof + crown.lamp + crown.attic + crown.slab;
  // how far in from the wall's centre line the attic's floor and walls stand on the top girder, on average (the slab's
  // middle 4 m in from the outer face, the attic's wall half a metre out from the centre line): it twists the wall head
  const cz = TOWER.hz + TOWER.wall / 2;
  crown.e = (crown.slab * (cz - (oz - ARCH.band / 2)) - crown.attic * 0.5) / (crown.slab + crown.attic);
  stone = { faces, crown, rim, bands, own };
}
// kg of stone standing on the piece of girder from a to b (along the wall) at storey level index k (0: the raft), and
// on the top girder the attic's brick
function stoneOn(name, k, a, b, first, last) {
  const f = stone.faces[name]; let kg = 0, brick = 0;
  for (let i = 0; i < f.nu; i++) { const u = -f.half + (i + 0.5) * CELL; if ((u >= a || first) && (u < b || last)) { kg += f.bands[k][i]; if (k === f.bands.length - 1) brick += f.attic[i]; } }
  f.covered[k] += kg; return kg + brick;
}

// The maintaining detent (see 1c): its bracket ends one of DETENT_RS from the great arbor, and its pawl, PAWL deep
// and wide, in the plane of the maintaining ring (PAWL_Z: the ring is 19.95 to 20.35, clockwork.js), reaches in from
// there to PAWL_TIP, just clear of the tips of the ring's teeth (7.7 m), which it drops between. Nothing else goes
// round in that plane beyond the teeth: the maintaining springs lie between the ring's face and the wheel's.
const DETENT_RS = [8.4, 8.8, 9.2, 9.6, 10.2], PAWL_TIP = 7.75, PAWL = [0.8, 0.36], PAWL_Z = 20.15;
const pawlBox = (R, y) => obb([ARBOR.great.x + (R + PAWL_TIP) / 2, y, PAWL_Z], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [(R - PAWL_TIP) / 2, PAWL[0] / 2, PAWL[1] / 2]);
// What goes round on an arbor sweeps a solid of revolution: everything drawn on it, every vertex, turned through a whole
// turn. sweepOf(a)(box) says whether a box that stands still (an oriented box, obb()) is anywhere in it: whether, at
// some height along the arbor, some vertex is as far from the axis as some part of the box at that height.
function sweepOf(a) {
  const pts = [], w = new THREE.Vector3(), v = new THREE.Vector3();
  for (const grp of G.machines) {
    grp.updateWorldMatrix(true, true); grp.getWorldPosition(w);
    if (Math.hypot(w.x - a.x, w.y - a.y) > 0.05) continue;
    grp.traverse((o) => { if (!o.isMesh || o.isInstancedMesh) return; const pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); pts.push(Math.hypot(v.x - a.x, v.y - a.y), v.z); } });
  }
  return (box) => {
    // the box's nearest and furthest from the axis, slice by slice along it (sampled every 5 cm)
    const BIN = 0.05, span = new Map(), n = box.half.map(h => Math.max(2, Math.ceil(2 * h / 0.08)));
    for (let i = 0; i <= n[0]; i++) for (let j = 0; j <= n[1]; j++) for (let k = 0; k <= n[2]; k++) {
      const f = [i / n[0] * 2 - 1, j / n[1] * 2 - 1, k / n[2] * 2 - 1], p = box.c.map((c, m) => c + box.ax[0][m] * f[0] * box.half[0] + box.ax[1][m] * f[1] * box.half[1] + box.ax[2][m] * f[2] * box.half[2]);
      const r = Math.hypot(p[0] - a.x, p[1] - a.y), b = Math.floor(p[2] / BIN), s = span.get(b);
      if (s) { s[0] = Math.min(s[0], r); s[1] = Math.max(s[1], r); } else span.set(b, [r, r]);
    }
    for (let i = 0; i < pts.length; i += 2) { const s = span.get(Math.floor(pts[i + 1] / BIN)); if (s && pts[i] > s[0] - 0.03 && pts[i] < s[1] + 0.03) return { r: pts[i], z: pts[i + 1] }; }
    return null;
  };
}
const DIAL_KG_M2 = 120;                               // the dial: 30 mm of glass in iron glazing bars, kg per square metre
// Wind girders: half way up each storey, where the horizontal wind trusses are
const WIND_LEVELS = LEVELS.map((y, k) => (y + (k ? LEVELS[k - 1] : 0)) / 2);
let windTrusses = [];
const WT_CHORD = 1.6, WT_WEB = 1.0;
// The top one is at the wall head, under the flat that tower.js draws over it (240 to 242 m, from the outer face in
// to the foot of the attic, 5 m): that flat is this truss's deck. Where the truss is deeper than the band, its inner
// chord is bare under the attic. It is what holds the four wall heads in line, and with them the crown, which stands
// 4.5 m in from the walls.
const TOP_TRUSS = TOWER.H;                  // the most a wind truss's chord and its posts and diagonals may be: what they were planned at
// one wall's wind trusses, all levels: members of the shell's frame
function declareWindTrusses(out) {
  for (const name of [...new Set(windTrusses.map(t => t.wall))]) {
    const owner = `wind truss ${name.slice(6)}`, A = redeclare(owner, 'horizontal trusses half way up each storey, carrying the wind on the wall to the walls either side');
    A.frame = 'shell';
    for (const t of windTrusses.filter(t => t.wall === name)) for (const m of t.members) {
      const s = m.label === 'chord' ? boxSized(owner, 'chord', 0.8, WT_CHORD, WT_CHORD, 1) : boxSized(owner, m.label, 0.5, WT_WEB, WT_WEB, 1);
      A.member(m.a, m.b, s, ALLOY, 'beam', m.label);
      if (out) {
        // drawn from the face of the wall's column, which it is welded to
        const cx = TOWER.hx + TOWER.wall / 2, cz = TOWER.hz + TOWER.wall / 2, on = (p) => Math.abs(Math.abs(p[0]) - cx) < 0.05 || Math.abs(Math.abs(p[2]) - cz) < 0.05;
        const [p0, p1] = on(m.b) && !on(m.a) ? [m.b, m.a] : [m.a, m.b];
        // (a corner is on two walls: the one it leaves at the shallower angle governs)
        const d = p1.map((v, i) => v - p0[i]), L = Math.hypot(...d), inn = Math.min(Math.abs(Math.abs(p0[0]) - cx) < 0.05 ? Math.abs(d[0]) / L : 1, Math.abs(Math.abs(p0[2]) - cz) < 0.05 ? Math.abs(d[2]) / L : 1);
        const a = on(p0) ? p0.map((v, i) => v + d[i] / L * Math.min(L / 2, (WALL_T / 2 + 0.1 + s.dims.b / 2 * Math.sqrt(Math.max(0, 1 - inn * inn))) / Math.max(0.2, inn))) : p0;
        out.push({ a, b: p1, h: s.dims.h, w: s.dims.b, label: 'wind truss', owner: 'shell' });
      }
    }
  }
}

function declareShell(out) {
  for (const f of Object.values(stone.faces)) f.covered.fill(0);
  const cx = TOWER.hx + TOWER.wall / 2, cz = TOWER.hz + TOWER.wall / 2, H = TOWER.H;
  const xs = [], zs = [];
  for (let v = -60; v <= 60; v += 10) xs.push(v);
  for (let v = -30; v <= 30; v += 10) zs.push(v);
  const walls = [
    { name: 'shell back', along: 'x', at: -cz, lines: xs, ends: [-cx, cx], n: [0, 0, -1] },
    { name: 'shell front', along: 'x', at: cz, lines: xs, ends: [-cx, cx], dial: true, n: [0, 0, 1] },
    { name: 'shell left', along: 'z', at: -cx, lines: [-cz, ...zs, cz], n: [-1, 0, 0] },
    { name: 'shell right', along: 'z', at: cx, lines: [-cz, ...zs, cz], n: [1, 0, 0] },
  ];
  // the four walls, their wind girders and the ring round the dial are one frame
  for (const W of walls) {
    // its storeys, and its wind trusses' levels (half way up each storey, or near it)
    const heights = [...new Set([...LEVELS, ...WIND_LEVELS, ...windTrusses.filter(t => t.wall === W.name && t.y !== TOP_TRUSS).map(t => t.y)])].sort((a, b) => a - b);
    const trib = (y) => { const k = heights.indexOf(y), below = k ? heights[k - 1] : 0, above = heights[k + 1]; return (above === undefined ? y - below : above - below) / 2; };
    const A = redeclare(W.name, 'steel frame carrying the brick panels of one wall'); A.reach = 8; A.frame = 'shell';
    const P = (c, y) => W.along === 'x' ? [c, y, W.at] : [W.at, y, c];
    const press = windOn(W.n), lines = (h) => Object.fromEntries(Object.entries(press).map(([k, v]) => [k, v.map(x => x * h)]));
    const colSec = wallBox(`${W.name}|column`, 1.0, 2.8, WALL_T, W.along === 'x' ? 'h' : 'b'), wc = W.along === 'x' ? colSec.dims.h : colSec.dims.b;
    const girSec = wallBox(`${W.name}|girder`, 1.2, 4.0, WALL_T);
    // drawn a hand's breadth inside the wall's centre line, so the frame shows indoors and the stone hides it outdoors
    const inward = (p) => W.along === 'x' ? [p[0], p[1], p[2] - Math.sign(W.at) * 0.2] : [p[0] - Math.sign(W.at) * 0.2, p[1], p[2]];
    const draw = (a, b, h, w, label) => { if (out) out.push({ a: inward(a), b: inward(b), h, w, label }); };
    const inDial = (c, y) => W.dial && Math.hypot(c - DIAL.x, y - DIAL.y) < RING, chord = (d) => Math.sqrt(Math.max(0, RING * RING - d * d));
    const ringPts = [];
    // (the top wind truss meets the columns just under the top girder, which is its outer chord)
    if (windTrusses.some(t => t.y === TOP_TRUSS)) for (const c of W.lines) A.node(P(c, TOP_TRUSS));
    // columns, from the ground to the top; the ones under the dial stop at its ring and start again above it
    for (const c of W.lines) {
      const cut = W.dial && Math.abs(c - DIAL.x) < RING ? chord(c - DIAL.x) : 0;
      // the column on the centre line of the front would stand in the doorway: it stops on a lintel girder over the door,
      // which carries it across to the columns either side
      const over = W.dial && Math.abs(c) < 5, foot = over ? LINTEL : 0;
      const pieces = cut ? [[foot, DIAL.y - cut], [DIAL.y + cut, H]] : [[foot, H]];
      if (over) { const s = wallBox(`${W.name}|lintel`, 1.4, 4.0, WALL_T); A.member(P(c - 10, LINTEL), P(c + 10, LINTEL), s, ALLOY, 'beam', 'lintel'); draw(P(c - 10, LINTEL), P(c + 10, LINTEL), s.dims.h, WALL_T, 'lintel'); }
      for (const [y0, y1] of pieces) { A.member(P(c, y0), P(c, y1), colSec, ALLOY, 'beam', 'column'); draw(P(c, y0), P(c, y1), W.along === 'x' ? wc : WALL_T, W.along === 'x' ? WALL_T : wc, 'column'); }
      if (cut) ringPts.push([c, DIAL.y - cut], [c, DIAL.y + cut]);
      if (!over) A.rest(P(c, 0), 'ground', 'fix');
    }
    // Girders at each storey, bay by bay; each carries the brick panel standing on it. Between storeys a wind girder
    // runs round at mid-height, where the wind trusses inside the hall are (they carry no brick, only the wind).
    const stops = W.ends ? [W.ends[0], ...W.lines, W.ends[1]] : W.lines, tiers = [0, ...LEVELS];
    heights.forEach((y) => {
      const storey = LEVELS.includes(y), k = LEVELS.indexOf(y);
      // what stands on it: the brick panel up to the next girder (on the top one, the attic's floor; its walls come
      // with the stone), and the stone on the wall's face over the same height (see weighStone)
      const panel = !storey ? 0 : k < LEVELS.length - 1 ? (LEVELS[k + 1] - y) * BRICK_PER_M2 : SLAB_KG_M * GRAVITY;
      const sec = storey ? girSec : wallBox(`${W.name}|wind girder`, 1.0, 2.5, WALL_T), hg = sec.dims.h;
      for (let i = 0; i < stops.length - 1; i++) {
        let a = stops[i], b = stops[i + 1];
        if (inDial(a, y) && inDial(b, y)) continue;
        if (inDial(a, y)) { a = DIAL.x + Math.sign(b - DIAL.x) * chord(y - DIAL.y); ringPts.push([a, y]); }
        if (inDial(b, y)) { b = DIAL.x + Math.sign(a - DIAL.x) * chord(y - DIAL.y); ringPts.push([b, y]); }
        const carry = storey ? panel + stoneOn(W.name, k + 1, a, b, i === 0, i === stops.length - 2) * GRAVITY / (b - a) : 0;
        // (a wind girder is jointed to the diagonal that crosses it)
        const t = tiers.findIndex((v, j) => v < y && tiers[j + 1] > y), li = W.lines.indexOf(stops[i]), par = li >= 0 ? li : i;
        let mid = null;
        if (!storey) { const [c0, c1] = (par + t) % 2 ? [stops[i + 1], stops[i]] : [stops[i], stops[i + 1]]; mid = c0 + (c1 - c0) * (y - tiers[t]) / (tiers[t + 1] - tiers[t]); if (!(mid > a + 0.1 && mid < b - 0.1)) mid = null; }
        // (the top one takes the wind on the wall head, the cornice and the lower half of the attic's wall; the upper half
        // goes to the crown's ring at the attic's head)
        const pieces = mid === null ? [[a, b]] : [[a, mid], [mid, b]], ln = lines(trib(y) + (y === H ? ARCH.cornice - H + (ARCH.attic - ARCH.cornice) / 2 : 0));
        for (const [p0, p1] of pieces) A.member(P(p0, y), P(p1, y), sec, ALLOY, 'beam', storey ? 'girder' : 'wind girder', { lines: ln }, carry);
        draw(P(a, y - hg / 2), P(b, y - hg / 2), hg, WALL_T, storey ? 'girder' : 'wind girder');
      }
    });
    // The attic's floor reaches in from the wall head and its wall stands a little outside the girder's middle, so
    // between them they twist the wall head as well as pressing on it: a moment at every column's head, for its share
    // of the wall's length. (The crown proper stands on its own posts over the columns: declareCrown.)
    stops.forEach((c, i) => {
      const t = ((stops[i + 1] ?? c) - (stops[i - 1] ?? c)) / 2, m = atticPerM() * stone.crown.e * t;
      A.force(P(c, H), [0, 0, 0, -W.n[2] * m, 0, W.n[0] * m], 'the attic, standing in from the wall');
    });
    // the fire tanks in the attic, along the back, on the top girder
    if (W.name === 'shell back') for (const x of ARCH.tanks) A.mass(P(x, H), TANK_KG, 'a fire tank, full');
    // Diagonals, one to a bay at each storey, leaning alternately: it is these, not the columns bending, that carry
    // the wind down the side walls to the ground.
    // (on the front and back the end bays, from the last column line to the corner, are braced too: beside the dial
    // they are most of what the front has to carry the wind along it)
    const bays = W.ends ? stops : W.lines;
    for (let k = 0; k < tiers.length - 1; k++) for (let i = 0; i < bays.length - 1; i++) {
      const li = W.lines.indexOf(bays[i]), par = li >= 0 ? li : i;
      const [c0, c1] = (par + k) % 2 ? [bays[i + 1], bays[i]] : [bays[i], bays[i + 1]], y0 = tiers[k], y1 = tiers[k + 1];
      if (W.dial && [0, 0.25, 0.5, 0.75, 1].some(t => Math.hypot(c0 + (c1 - c0) * t - DIAL.x, y0 + (y1 - y0) * t - DIAL.y) < RING + 1)) continue;
      if (W.dial && y0 === 0 && Math.abs((c0 + c1) / 2) < 6) continue;                            // the door
      const s = wallBox(`${W.name}|bracing`, 0.5, 2.0, WALL_T);
      A.member(P(c0, y0), P(c1, y1), s, ALLOY, 'beam', 'bracing'); draw(P(c0, y0), P(c1, y1), s.dims.h, WALL_T + 0.04, 'bracing');
    }
    // the roof line on the front and back walls: a raking girder the purlins sit on
    if (W.ends) {
      const s = wallBox(`${W.name}|gable`, 0.8, 3.0, WALL_T), gs = [...new Set([-TOWER.hx, ...W.lines, TOWER.hx])].sort((p, q) => p - q);
      for (let i = 0; i < gs.length - 1; i++) {
        const a = P(gs[i], ROOF.at(gs[i])), b = P(gs[i + 1], ROOF.at(gs[i + 1]));
        A.member(a, b, s, ALLOY, 'beam', 'gable'); draw(a, b, s.dims.h, WALL_T, 'gable');
      }
    }
    // the ring round the dial: the wall over the opening stands on it, and it carries that round to the columns
    // either side; the dial's glass, and the wind on it, bear on it all round (half its radius to a metre of ring)
    if (W.dial) {
      const meets = ringPts.slice();
      for (let k = 0; k < 36; k++) {
        const p = [DIAL.x + RING * Math.cos(k * Math.PI / 18), DIAL.y + RING * Math.sin(k * Math.PI / 18)];
        if (!meets.some(m => Math.hypot(m[0] - p[0], m[1] - p[1]) < 2.5)) ringPts.push(p);
      }
      ringPts.sort((p, q) => Math.atan2(p[1] - DIAL.y, p[0] - DIAL.x) - Math.atan2(q[1] - DIAL.y, q[0] - DIAL.x));
      const f = stone.faces[W.name], left = f.bands.reduce((t, band, k) => t + (k ? band.reduce((x, v) => x + v, 0) - f.covered[k] : 0), 0);
      const around = ringPts.reduce((t, p, i) => t + Math.hypot(ringPts[(i + 1) % ringPts.length][0] - p[0], ringPts[(i + 1) % ringPts.length][1] - p[1]), 0);
      // the dial's glass, the stone rim round it, and the stone of the clock panel that stands over the opening, all round the ring
      const sec = wallBox(`${W.name}|ring`, 1.2, 4.0, WALL_T), glass = DIAL_KG_M2 * GRAVITY * DIAL.r / 2 + (stone.rim + left) * GRAVITY / around;
      ringPts.forEach((p, i) => {
        const q = ringPts[(i + 1) % ringPts.length], ym = (p[1] + q[1]) / 2, xm = (p[0] + q[0]) / 2, len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (len < 0.1) return;
        // above the dial the wall up to the next girder stands on the ring
        const over = ym > DIAL.y ? ((Math.abs(xm - DIAL.x) < chord(180 - DIAL.y) ? ROOF.eaves : 180) - ym) : 0;
        A.member(P(p[0], p[1]), P(q[0], q[1]), sec, ALLOY, 'beam', 'ring', { lines: lines(DIAL.r / 2) }, Math.max(0, over) * BRICK_PER_M2 * Math.abs(q[0] - p[0]) / len + glass);
        draw(P(p[0], p[1]), P(q[0], q[1]), sec.dims.h, WALL_T, 'ring');
      });
    }
  }
  declareStairTowers(); declareEscape(); declareStack(); declareCrown(out);
  declareWindTrusses(out);
}

// ---- what stands outside the walls: the two stair towers at the front corners, the two escape stairs' turrets at the
// back corners, and the stack behind the building. Each is a steel frame in its own brick walls, on a footing of its
// own outside the raft: columns from the footing to the top, a girder round at every landing carrying the brick and
// stone of the storey over it, and, for the towers and the turrets, at every storey up to the attic a tie to the frame
// of the wall beside it, which takes the wind on it there (the frame is held at that point: brace()). They have
// windows where diagonals would go, so their columns and girders are framed rigidly together instead. The stack has
// no windows, but diagonals built in with its columns would take a share of the brick's weight as the columns shorten
// under it, which is not what they are for, so it too is framed rigidly: eight columns and a ring at every stone band,
// with the brick between, and it stands alone, its wind taken down to its own footing. What is drawn of each is
// weighed (weighStone), storey by storey, as it stands on each girder.
const TANK_KG = 7.0 * 3.0 * 2.8 * 1000 * 0.95 + 9e3;          // a fire tank in the attic, full: its water and its iron
const OUT_FOOT = {};                                           // the footings outside the raft, by what stands on them
// the brick and stone drawn for `name`, by storey (in `levels`) and, within a storey, by which of `sides` (tests of a
// piece's centre) it is on: kg
function masonry(name, levels, sides = [() => true]) {
  const bins = levels.map(() => sides.map(() => 0));
  for (const p of stone.own[name]) { let b = levels.length - 1; while (b > 0 && levels[b] > p.c[1]) b--; bins[b][Math.max(0, sides.findIndex(f => f(p.c)))] += p.kg; }
  return bins;
}
const addLines = (a, b) => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(k => [k, [0, 1, 2].map(d => (a[k]?.[d] || 0) + (b[k]?.[d] || 0))]));
// wind on a strip of wall w wide facing n, and on a round or many-sided thing w across (force coefficient cf) shared by
// k members: lines, N per metre, by case
const faceWind = (n, w) => Object.fromEntries(Object.entries(windOn(n)).map(([k, v]) => [k, v.map(x => x * w)]));
const roundWind = (w, cf, k) => Object.fromEntries(Object.entries(WINDS).map(([c, d]) => [c, d.map(v => v * cf * WIND_Q * w / k)]));
// the wind on a cap, spire or lantern standing on the points `at` (round its foot): its push F, shared among them, and
// its overturning, F times the height h of its middle over them, as a push down on the leeward ones and a pull up on
// the windward
function capWind(A, at, F, h, label) {
  for (const [c, d] of Object.entries(WINDS)) {
    const s = at.map(p => p[0] * d[0] + p[2] * d[2]), m = s.reduce((t, v) => t + v, 0) / s.length, I = s.reduce((t, v) => t + (v - m) ** 2, 0);
    at.forEach((p, i) => A.force(p, [d[0] * F / at.length, -F * h * (s[i] - m) / I, d[2] * F / at.length], label, c));
  }
}
// a ring of columns (points [x, z] in order round it) through the storeys `lv`, with a girder round at every level but
// the first carrying what bins says stands on it; returns where they are
function columnsAndGirders(A, name, ring, lv, bins, segFace, faceLen, labelOf, colLines) {
  const col = (k) => boxSized(name, labelOf(k), 0.8, 1.3, 1.3, 1), gir = boxSized(name, 'girder', 1.0, 1.3, 3.0, 0.5);
  ring.forEach(([x, z], r) => { for (let k = 0; k < lv.length - 1; k++) A.member([x, lv[k], z], [x, lv[k + 1], z], col(k), ALLOY, 'beam', labelOf(k), { lines: colLines[r] }); A.rest([x, 0, z], 'ground', 'fix'); });
  for (let k = 1; k < lv.length; k++) ring.forEach(([x, z], r) => {
    const [x1, z1] = ring[(r + 1) % ring.length], f = segFace(r);
    A.member([x, lv[k], z], [x1, lv[k], z1], gir, ALLOY, 'beam', 'girder', null, bins[k][f] * GRAVITY / faceLen[f]);
  });
  // what stands below the first girder stands on the footing
  const foot = bins[0].reduce((t, v) => t + v, 0) / ring.length;
  for (const [x, z] of ring) A.mass([x, 0, z], foot, 'brick and stone of the lowest storey');
}

function declareStairTowers() {
  const S = STAIR_TOWER, lv = [...S.levels, S.stage, S.top], cx = TOWER.hx + TOWER.wall / 2, cz = TOWER.hz + TOWER.wall / 2;
  const mx = (S.x0 + S.x1) / 2, mz = (S.z0 + S.z1) / 2, X = [S.x0 + S.wall / 2, mx, S.x1 - S.wall / 2], Z = [S.z0 + S.wall / 2, mz, S.z1 - S.wall / 2];
  for (const sx of [-1, 1]) {
    const name = `stair tower ${sx < 0 ? 'left' : 'right'}`, A = redeclare(name, 'steel frame in the walls of a stair tower, tied to the front wall at every storey up to the attic');
    A.reach = 4;
    // eight columns round its walls: [0, 1] the back (against the front wall), [2, 3] the outer side, [4, 5] the front, [6, 7] the inner side
    const ring = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]].map(([i, j]) => [sx * X[i], Z[j]]);
    const normals = [[0, 0, -1], [sx, 0, 0], [0, 0, 1], [-sx, 0, 0]], faceLen = [X[2] - X[0], Z[2] - Z[0], X[2] - X[0], Z[2] - Z[0]];
    const rel = (c) => [(Math.abs(c[0]) - mx) / (S.x1 - S.x0), (c[2] - mz) / (S.z1 - S.z0)];
    const sides = [(c) => { const [u, v] = rel(c); return Math.abs(v) >= Math.abs(u) && v < 0; }, (c) => { const [u, v] = rel(c); return Math.abs(u) > Math.abs(v) && u > 0; }, (c) => { const [u, v] = rel(c); return Math.abs(v) >= Math.abs(u); }, () => true];
    const bins = masonry(name, lv, sides);
    // the wind on its walls, on the columns either side of each piece of wall (the back's inner half is against the front wall)
    const seg = (r) => Math.hypot(ring[(r + 1) % 8][0] - ring[r][0], ring[(r + 1) % 8][1] - ring[r][1]);
    const colLines = ring.map((_, r) => [r, (r + 7) % 8].reduce((L, k) => k === 0 ? L : addLines(L, faceWind(normals[Math.floor(k / 2)], seg(k) / 2)), {}));
    columnsAndGirders(A, name, ring, lv, bins, (r) => Math.floor(r / 2), faceLen, (k) => lv[k] < 120 ? 'column, foot' : lv[k] < ARCH.cornice ? 'column, middle' : 'column, head', colLines);
    // (its stair is declared on its own, resting on this frame, and so are the hoist and the tank in the stage under the
    // spire: tower.js, hoist.js) the floors through the walls at the doors; the lookout's floor (and the people on it), its
    // stone ceiling, which is the floor of the stage over it; the stone roof of that stage, and the spire on it, copper on
    // a steel frame
    const slab = (S.x1 - S.x0 - 2 * S.wall) * (S.z1 - S.z0 - 2 * S.wall) * 0.35 * 2400;
    for (const y of S.levels.slice(1)) for (const [x, z] of ring) A.mass([x, y, z], (y === S.levels[S.levels.length - 1] ? 120e3 : 10e3) / 8, y === S.levels[S.levels.length - 1] ? 'the lookout\'s floor' : 'the floor through the wall at the door');
    for (const [x, z] of ring) A.mass([x, S.stage, z], slab / 8, 'the lookout\'s ceiling');
    for (const [x, z] of ring) A.mass([x, S.top, z], (slab + 300e3) / 8, 'roof and spire');
    const r0 = 10.2, h = S.spire - S.top - 4;
    capWind(A, ring.map(([x, z]) => [x, S.top, z]), 0.8 * WIND_Q * r0 * h, 4 + h / 3, 'wind on the spire');
    // tied to the front wall's column beside it and to the corner column, at every storey up to the attic's floor, and to
    // the crown's posts at the attic's head
    for (const y of lv.slice(1)) {
      if (y > ARCH.attic) continue;
      const on = (wall) => (y > TOWER.H + 2.5 ? 'crown' : wall);
      A.brace([ring[0][0], y, ring[0][1]], 'x', on('shell front'), [sx * 60, y, cz]).brace([ring[0][0], y, ring[0][1]], 'z', on('shell front'), [sx * 60, y, cz]);
      A.brace([ring[1][0], y, ring[1][1]], 'z', on(sx < 0 ? 'shell left' : 'shell right'), [sx * cx, y, cz]);
    }
    OUT_FOOT[name] = { area: (S.x1 - S.x0 + 2) * (S.z1 - S.z0 + 1), n: ring.length, box: [sx * mx, mz + 0.5, S.x1 - S.x0 + 2, S.z1 - S.z0 + 1] };
  }
}

function declareEscape() {
  const E = ESCAPE, cz = TOWER.hz + TOWER.wall / 2, r = E.r - E.wall / 2, lv = [0, 30, 60, 90, 120, 150, 180, 210, 242, E.top];
  for (const sx of [-1, 1]) {
    const name = `escape turret ${sx < 0 ? 'left' : 'right'}`, ex = sx * E.x;
    const A = redeclare(name, 'steel frame in the wall of an escape stair\'s turret, tied to the back wall at every storey'); A.reach = 4;
    const ring = Array.from({ length: 8 }, (_, k) => { const a = Math.PI / 8 + k * Math.PI / 4; return [ex + r * Math.cos(a), E.z + r * Math.sin(a)]; });
    const bins = masonry(name, lv), around = 8 * 2 * r * Math.sin(Math.PI / 8);
    columnsAndGirders(A, name, ring, lv, bins, () => 0, [around], (k) => lv[k] < 150 ? 'column, foot' : 'column, head', ring.map(() => roundWind(2 * E.r, 0.9, 8)));
    for (const y of E.levels.slice(1)) for (const [x, z] of ring) A.mass([x, y, z], 6e3 / 8, 'the floor through the wall at the door');        // (its stair stands on its own columns and bears on this frame: tower.js)
    for (const [x, z] of ring) A.mass([x, E.top, z], 130e3 / 8, 'cap');
    capWind(A, ring.map(([x, z]) => [x, E.top, z]), 0.6 * WIND_Q * (E.r + 1) * (E.cap - E.top), (E.cap - E.top) / 3, 'wind on the cap');
    // the two columns next to the wall, tied to it (and at the head to the crown's ring)
    for (const y of lv.slice(1)) { const on = y > TOWER.H + 2.5 ? 'crown' : 'shell back'; for (const k of [1, 2]) A.brace([ring[k][0], y, ring[k][1]], 'z', on, [ring[k][0], y, -cz]); A.brace([ring[1][0], y, ring[1][1]], 'x', on, [ring[1][0], y, -cz]); }
    OUT_FOOT[name] = { area: Math.PI * (E.r + 1) ** 2, n: 8, c: [ex, E.z], r: E.r + 1 };
  }
}

// The stack, standing on its own behind the building: a steel frame in its brick, eight columns leaning in with the
// batter from the footing to its head, and a ring at every stone band. The shaft's brick is weighed from its
// dimensions (it is drawn as a mesh), storey by storey, onto the ring under it; its stone and its pedestal as drawn. The
// wind on it is taken down the frame to its footing: nothing ties it to anything.
function declareStack() {
  const S = STACK, name = 'stack', n = STACK_RINGS, H = S.top - S.pedH, lv = [0, ...Array.from({ length: n + 1 }, (_, k) => S.pedH + H * k / n)];
  const A = redeclare(name, 'steel frame in the brick of the stack behind the building, free-standing on its own footing'); A.reach = 4;
  // its columns stand in the middle of the brick, from the pedestal's foot (where they are in its walls) to the head
  const rc = (y) => (y <= S.pedH ? stackR(S.pedH) - stackWall(S.pedH + 0.1) / 2 : stackR(y) - stackWall(Math.min(S.top - 0.1, y)) / 2) / Math.cos(Math.PI / 8);
  const at = (k, y) => { const a = Math.PI / 8 + k * Math.PI / 4; return [S.x + rc(y) * Math.cos(a), y, S.z + rc(y) * Math.sin(a)]; };
  const bins = masonry(name, lv);
  // the shaft's brick between each two rings: solid brick, outside radius stackR, wall stackWall
  for (let s = 1; s < lv.length - 1; s++) { let kg = 0; for (let y = lv[s] + 0.25; y < lv[s + 1]; y += 0.5) { const r = stackR(y), t = stackWall(y); kg += Math.PI * (r * r - (r - t) ** 2) * 0.5 * MATERIAL.brick.rho; } bins[s][0] += kg; }
  const col = (s) => boxSized(name, s < 4 ? 'column, foot' : 'column, head', 0.8, 1.2, 1.2, 1), ringS = boxSized(name, 'ring', 0.6, 0.8, 1.6, 1);
  for (let s = 0; s < lv.length - 1; s++) {
    const y0 = lv[s], y1 = lv[s + 1], width = y1 <= S.pedH ? 2 * S.ped * 1.1 : 2 * stackR((y0 + y1) / 2), lines = roundWind(width, y1 <= S.pedH ? 1.6 : 0.8, 8), per = 8 * 2 * rc(y1) * Math.sin(Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      A.member(at(k, y0), at(k, y1), col(s), ALLOY, 'beam', s < 4 ? 'column, foot' : 'column, head', { lines });
      A.member(at(k, y1), at((k + 1) % 8, y1), ringS, ALLOY, 'beam', 'ring', null, (bins[s + 1]?.[0] || 0) * GRAVITY / per);
    }
  }
  for (let k = 0; k < 8; k++) { A.rest(at(k, 0), 'ground', 'fix'); A.mass(at(k, 0), bins[0][0] / 8, 'the pedestal, and the brick and stone of its foot'); }
  OUT_FOOT[name] = { area: (2 * S.ped + 4) ** 2, n: 8, box: [S.x, S.z, 2 * S.ped + 4, 2 * S.ped + 4] };
}

// ---- the crown: the attic's posts, carried up from the walls' columns to the attic's head, with a ring girder round
// their heads; on that, a truss across the building on every column line of the front, its rafters under the
// mansard's slopes, its top chord under the flat, in two tiers with a chord half way up; rafters down the two end
// slopes and the four hips; a girder round the mansard half way up its slopes, holding the rafters there; purlins
// under the flat, and binders along the trusses' feet. It stands on the shell's column heads (the posts are built in to
// them), and carries the mansard's cladding, the flat, the stone above the attic's cornice (as drawn: the dormers,
// the pinnacles, the lamp room's drum) and the lamp room on the middle of the flat. Drawn: it is what is seen in the
// roof over the attic.
function declareCrown(out) {
  const A = redeclare('crown', 'the attic\'s posts, and the trusses, rafters and purlins of the mansard and its flat'); A.reach = 4;
  const cx = TOWER.hx + TOWER.wall / 2, cz = TOWER.hz + TOWER.wall / 2, y0 = TOWER.H, ye = ARCH.attic, yt = ARCH.flat - 1, fx = ARCH.flatX, fz = ARCH.flatZ, C = stone.crown;
  const xs = [], zs = [];
  for (let v = -60; v <= 60; v += 10) xs.push(v);
  for (let v = -30; v <= 30; v += 10) zs.push(v);
  const mem = (a, b, sec, label, opts = null, carries = 0) => { A.member(a, b, sec, ALLOY, 'beam', label, opts, carries); if (out) out.push({ a, b, h: sec.dims.h, w: sec.dims.b, label: 'crown', owner: 'crown' }); };
  const rafter = boxSized('crown', 'rafter', 0.8, 0.9, 1.3, 1), hip = boxSized('crown', 'hip', 0.8, 0.9, 1.3, 1), tie = boxSized('crown', 'tie', 0.5, 0.7, 1.0, 1);
  const vert = boxSized('crown', 'vertical', 0.5, 0.8, 1.0, 1), diag = boxSized('crown', 'diagonal', 0.5, 0.8, 1.0, 1), chord = boxSized('crown', 'chord', 0.6, 0.9, 1.3, 1);
  const purlin = boxSized('crown', 'purlin', 0.6, 0.7, 1.3, 0.6), binder = boxSized('crown', 'binder', 0.4, 0.6, 0.8, 1);
  const ringS = wallBox('crown|ring', 1.0, 2.0, 0.9);
  // the posts and the ring, all round
  const heads = [...[-cx, ...xs, cx].map(x => [x, -cz]), ...zs.map(z => [cx, z]), ...[cx, ...[...xs].reverse(), -cx].map(x => [x, cz]), ...[...zs].reverse().map(z => [-cx, z])];
  const wallOf = ([x, z]) => Math.abs(Math.abs(x) - cx) < 0.01 ? (x < 0 ? 'shell left' : 'shell right') : z < 0 ? 'shell back' : 'shell front';
  const normalOf = (p, q) => Math.abs(p[1] - q[1]) < 0.01 ? [0, 0, Math.sign(p[1])] : [Math.sign(p[0]), 0, 0];
  heads.forEach(([x, z], i) => {
    const side = Math.abs(Math.abs(x) - cx) < 0.01, s = wallBox('crown|post', 1.0, 2.4, 0.9, side ? 'b' : 'h');
    A.member([x, y0, z], [x, ye, z], s, ALLOY, 'beam', 'post');
    if (out) out.push({ a: [x, y0, z], b: [x, ye, z], h: side ? 0.9 : s.dims.h, w: side ? s.dims.b : 0.9, label: 'crown', owner: 'crown' });
    A.rest([x, y0, z], wallOf([x, z]), 'fix');
    const q = heads[(i + 1) % heads.length];
    mem([x, ye, z], [q[0], ye, q[1]], ringS, 'ring', { lines: faceWind(normalOf([x, z], q), (ARCH.attic - ARCH.cornice) / 2) });
  });
  const trib = (v, edge) => (Math.abs(Math.abs(v) - edge) < 0.01 ? 5 + 2.75 : 10);
  // a truss across on every column line of the front and back: tie, chord half way up, top chord; verticals on the
  // lines of the side walls' columns, and diagonals rising toward the middle in each tier
  const ym = (ye + yt) / 2, mx = (cx + fx) / 2, mz = (cz + fz) / 2;
  for (const x of xs) {
    const zz = [-cz, ...zs, cz], zm = [-mz, ...zs, mz];
    for (let i = 0; i < zz.length - 1; i++) { mem([x, ye, zz[i]], [x, ye, zz[i + 1]], tie, 'tie'); mem([x, ym, zm[i]], [x, ym, zm[i + 1]], tie, 'tie'); }
    for (const z of zs) mem([x, ye, z], [x, yt, z], vert, 'vertical');
    for (let i = 0; i < zs.length - 1; i++) {
      mem([x, yt, zs[i]], [x, yt, zs[i + 1]], chord, 'chord');
      const [o, n] = Math.abs(zs[i]) > Math.abs(zs[i + 1]) ? [zs[i], zs[i + 1]] : [zs[i + 1], zs[i]];
      mem([x, ye, o], [x, ym, n], diag, 'diagonal'); mem([x, ym, o], [x, yt, n], diag, 'diagonal');
    }
    for (const s of [-1, 1]) {
      mem([x, ye, s * cz], [x, yt, s * fz], rafter, 'rafter', { lines: faceWind([0, 0, s], trib(x, fx)) }, C.clad * trib(x, fx));
      mem([x, ye, s * cz], [x, ym, s * fz], diag, 'diagonal');
    }
  }
  // down the ends: a rafter on every column line of the side walls, with a tie at its foot and a strut half way up to
  // the end truss; the hips
  for (const s of [-1, 1]) for (const z of zs) {
    mem([s * cx, ye, z], [s * fx, yt, z], rafter, 'rafter', { lines: faceWind([s, 0, 0], trib(z, fz)) }, C.clad * trib(z, fz));
    mem([s * cx, ye, z], [s * fx, ye, z], tie, 'tie'); mem([s * mx, ym, z], [s * fx, ym, z], tie, 'tie');
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mem([sx * cx, ye, sz * cz], [sx * fx, yt, sz * fz], hip, 'hip', null, C.clad * 5.5);
  // the girder round the slopes half way up, through the rafters' and the hips' middles
  const mid = [...[-mx, ...xs, mx].map(x => [x, -mz]), ...zs.map(z => [mx, z]), ...[mx, ...[...xs].reverse(), -mx].map(x => [x, mz]), ...[...zs].reverse().map(z => [-mx, z])];
  mid.forEach(([x, z], i) => { const q = mid[(i + 1) % mid.length]; mem([x, ym, z], [q[0], ym, q[1]], binder, 'girder round the slopes'); });
  // the purlins under the flat, and the binders along the feet of the trusses
  for (const z of zs) for (let i = 0; i < xs.length - 1; i++) {
    mem([xs[i], yt, z], [xs[i + 1], yt, z], purlin, 'purlin', null, C.flat * (Math.abs(Math.abs(z) - fz) < 0.01 ? 5.8 : 10));
    mem([xs[i], ye, z], [xs[i + 1], ye, z], binder, 'binder');
  }
  // the stone over the attic's cornice, where it stands: the lamp room's on the eight joints under its drum, the rest
  // (the dormers, the pinnacles) on the ring under it
  const lamp = [[20, 10], [10, 20], [-10, 20], [-20, 10], [-20, -10], [-10, -20], [10, -20], [20, -10]].map(([x, z]) => [x, yt, z]);
  let onLamp = C.lamp;
  const ringKg = heads.map(() => 0);
  for (const [x, , z, kg] of C.pieces) {
    if (Math.hypot(x, z) < LAMP.R + 3) { onLamp += kg; continue; }
    let best = 0, bd = Infinity; heads.forEach(([hx, hz], i) => { const d = Math.hypot(hx - x, hz - z); if (d < bd) { bd = d; best = i; } }); ringKg[best] += kg;
  }
  heads.forEach(([x, z], i) => { if (ringKg[i]) A.mass([x, ye, z], ringKg[i], 'stone over the attic'); });
  for (const p of lamp) A.mass(p, onLamp / lamp.length, 'the lamp room');
  const L = LAMP, hd = L.drum + L.glass + 2.2, hc = L.cap;
  capWind(A, lamp, 0.8 * WIND_Q * (2 * L.R * hd + (L.R + 1.6) * hc), 1 + (2 * L.R * hd * hd / 2 + (L.R + 1.6) * hc * (hd + hc / 3)) / (2 * L.R * hd + (L.R + 1.6) * hc), 'wind on the lamp room');
}

// Declare, analyse, enlarge what is overworked, and again, until it all holds. A group of members that is
// overworked grows (by the dimension that helps, see boxSized and wallBox); in a frame that would buckle too soon,
// the members its buckled shape bends most grow. Nothing is made smaller again: a size that holds is kept.
let timing = {}, lastResult = null;
export const lastAnalysis = () => lastResult;

// ---- serviceability: how far things move, against how far they may
// The bearings: under what changes while the clock goes (the pendulum's swing, one way and back, and the winding)
// a bearing may move no more than BEARING_MOVE, and an arbor's two bearings may not move apart across it by more than
// one part in ARBOR_SLOPE of their distance (its gears would no longer mesh true). What the permanent loads do is
// taken up when the bearings are set: they are shimmed to line under the clock's own weight.
const BEARING_MOVE = 0.005, ARBOR_SLOPE = 2000;
// What the winding does to the great arbor, said in the bearings row: nothing but a couple and a push along it, the
// worms' halves of the weight's pull going down their own shafts. Those shafts stretch and shorten a little under it;
// that is lost motion in the drive at the start of each winding, not a bearing moving.
function windingNote() {
  if (!wind || !WINDGEAR.uprights) return '';
  const W = WINDGEAR, A = Math.PI * W.upR ** 2, L = W.y - 0.6, stretch = W.half * L / (ALLOY.E * A);
  return `. The great arbor is wound by two worms either side of its winding wheel, on upright shafts that take their halves of the weight's pull (${(W.half / 1e6).toFixed(1)} MN each) straight down to the floor, so the arbor itself is turned by a couple and pushed along by ${(Math.abs(W.thrust) / 1e6).toFixed(1)} MN, which the yoke holding the worms takes back at the same bearing. The shafts stretch and shorten ${(stretch * 1000).toFixed(1)} mm under their halves: lost motion in the drive as each winding begins (the wheel turns ${(stretch / WIND.wheelR * 180 / Math.PI * 60).toFixed(2)} minutes of arc less), not a bearing moving`;
}
function bearingMoves(res) {
  const out = [];
  for (const [name, sh] of Object.entries(SHAFT)) {
    const a = ARBOR[name], T = towers.find(t => t.arbor === name); if (!T) continue;
    const at = (z, f) => displacement(res, 'towers', [a.x, a.y, z], f) || [0, 0, 0];
    const cases = [[{ pendulum: 2 }, 'the pendulum, one way and back'], [{ winding: 1 }, 'winding']];
    let worst = { move: 0, slope: 0 };
    const each = [];
    for (const [f, why] of cases) {
      const d = sh.bearings.map(z => at(z, f)), mv = Math.max(...d.map(v => Math.hypot(...v)));
      const sl = Math.hypot(d[1][0] - d[0][0], d[1][1] - d[0][1]) / Math.abs(sh.bearings[1] - sh.bearings[0]);
      each.push({ kase: Object.keys(f)[0], d, ratio: Math.max(mv / BEARING_MOVE, sl * ARBOR_SLOPE) });
      if (mv / BEARING_MOVE > worst.move / BEARING_MOVE || sl * ARBOR_SLOPE > worst.slope * ARBOR_SLOPE) worst = { move: Math.max(worst.move, mv), slope: Math.max(worst.slope, sl), why };
    }
    // and what the clock's own weight does, bearing by bearing: the seats are pre-set against it (see PRESET)
    const deadV = sh.bearings.map(z => at(z, { dead: 1, teeth: 1 })), dead = Math.max(...deadV.map(v => Math.hypot(...v)));
    out.push({ tower: T.name, arbor: name, ...worst, each, dead, deadV, ratio: Math.max(worst.move / BEARING_MOVE, worst.slope * ARBOR_SLOPE) });
  }
  return out;
}
// The walls: under the wind (each way, with the worse pressure inside) and the permanent loads together, no point of a
// wall may move out of its plane by more than its length / 500 (the brick between the girders must not be bent
// more than that), and no wall head may move along its wall by more than its height / 500.
// The bearings under the clock's own weight. They are built as such things are built: each seat is set high (and over)
// by what the computed weight of the clock will move it, the wheels are landed, and the bearings are then lined with
// shims. What is left for the shims is what the computation may be out by, taken as PRESET_DOUBT of the movement, and
// whatever differs between the weight wound up and run down; the shims hold SHIM. With the seats pre-set, every pair of
// meshing wheels must be at its drawn centre distance under the clock's weight: MESHES, driver, follower, and where.
const PRESET_DOUBT = 0.1, SHIM = 0.05;
const MESHES = [['great', 'center', LAYER.C, 'great wheel and centre pinion'], ['center', 'third', LAYER.B, 'centre wheel and third pinion'], ['third', 'esc', LAYER.A, 'third wheel and escape pinion'],
  ['center', 'minute', LAYER.motionA, 'cannon pinion and minute wheel'], ['minute', 'center', LAYER.motionB, 'minute pinion and hour wheel']];
function presets(res, bm) {
  const by = Object.fromEntries(bm.map(b => [b.arbor, b]));
  // where an arbor is at height z along it: between its bearings, in proportion
  const at = (name, z, v) => { const zs = SHAFT[name].bearings, t = (z - zs[0]) / (zs[1] - zs[0]); return [0, 1].map(i => v[0][i] * (1 - t) + v[1][i] * t); };
  const meshes = MESHES.filter(([a, b]) => by[a] && by[b]).map(([a, b, z, what]) => {
    const A = ARBOR[a], B = ARBOR[b], d0 = [B.x - A.x, B.y - A.y], L = Math.hypot(...d0), u = d0.map(v => v / L);
    const moved = (preset) => { const da = at(a, z, by[a].deadV.map(v => v.map((c, i) => c + (preset ? -v[i] : 0)))), db = at(b, z, by[b].deadV.map(v => v.map((c, i) => c + (preset ? -v[i] : 0)))); return Math.hypot(d0[0] + db[0] - da[0], d0[1] + db[1] - da[1]) - L; };
    const doubt = PRESET_DOUBT * Math.abs([0, 1].reduce((t, i) => t + (at(b, z, by[b].deadV)[i] - at(a, z, by[a].deadV)[i]) * u[i], 0));
    return { what, bare: moved(false), preset: moved(true), doubt };
  });
  const residual = bm.map(b => ({ arbor: b.arbor, tower: b.tower, preset: b.dead, left: PRESET_DOUBT * b.dead + 0 }));     // (+ wound against run down: nothing, see the row)
  return { meshes, residual };
}

const WALL_LIMIT = 500;
function wallMoves(res) {
  const F = res.frames.get('shell'); if (!F) return [];
  const cx = TOWER.hx + TOWER.wall / 2, cz = TOWER.hz + TOWER.wall / 2, out = [];
  const walls = [['shell back', 2, -cz, 2 * cx], ['shell front', 2, cz, 2 * cx], ['shell left', 0, -cx, 2 * cz], ['shell right', 0, cx, 2 * cz]];
  const combos = [];
  for (const wd of ['wind +x', 'wind -x', 'wind +z', 'wind -z']) for (const cpi of [0.2, -0.3]) combos.push([`${wd}, ${cpi > 0 ? 'pressure' : 'suction'} inside`, { dead: 1, [wd]: 1, inside: cpi * WIND_Q / 1e3 }]);
  for (const [name, ax, at, L] of walls) {
    let worst = { out: 0, along: 0 };
    for (let n = 0; n < F.nodes.length; n++) {
      const p = F.nodes[n].p; if (Math.abs(p[ax] - at) > 0.05) continue;
      for (const [cname, f] of combos) {
        let dn = 0, da = 0;
        for (const [c, v] of Object.entries(f)) { const u = F.cases[c]; if (!u) continue; dn += v * u[6 * n + ax]; da += v * u[6 * n + (2 - ax)]; }
        if (Math.abs(dn) > worst.out) Object.assign(worst, { out: Math.abs(dn), at: p, combo: cname });
        if (p[1] >= TOWER.H - 0.1 && Math.abs(da) > worst.along) Object.assign(worst, { along: Math.abs(da), alongAt: p, alongCombo: cname });
      }
    }
    out.push({ wall: name, L, ...worst, ratio: Math.max(worst.out / (L / WALL_LIMIT), worst.along / (TOWER.H / WALL_LIMIT)) });
  }
  return out;
}

// Declare, analyse, enlarge what is overworked, and again, until it all holds. A group of members that is
// overworked grows (by the dimension that helps, see boxSized and wallBox); in a frame that would buckle too soon,
// the members its buckled shape bends most grow; where a bearing or a wall moves too far, the members of that tower
// or that wall's wind trusses grow. Nothing is made smaller again: a size that holds is kept.
// The weight of the members of one label in one assembly, kg.
function tonnes(name, label) {
  const A = getAssembly(name); let kg = 0;
  if (A) for (const m of A.members) if (m.label === label) { const p = A.nodes[m.a].p, q = A.nodes[m.b].p; kg += m.section.A * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * (m.material.rho || 0); }
  return kg || Infinity;
}
function designLoop() {
  let res; const t0 = performance.now();
  for (passes = 1; passes <= 14; passes++) {           // (a page has to load: what still does not hold after this many tries is reported as it is)
    grow.clear();
    declare();
    res = analyse({ fast: true });
    let grew = false;
    const bump = (row, label, f) => { const g = grow.get(`${row.name ?? row}|${label}`); if (g && g(f)) { grew = true; return true; } return false; };
    const unstable = new Map();
    for (const row of res.rows) {
      for (const [label, u] of Object.entries(row.byLabel || {})) if (u > 0.92) bump(row, label, clamp(Math.pow(u / 0.85, 0.8), 1.05, 2.5));
      if (row.lambda < BUCKLING_FACTOR * 1.03 && row.shareLabel) for (const [label, sh] of Object.entries(row.shareLabel)) {
        if (!unstable.has(row.frame)) unstable.set(row.frame, []);
        unstable.get(row.frame).push({ row, label, sh });
      }
    }
    // A frame that would buckle too soon: enlarge the members that hold it in its buckling mode. What a group of members
    // does to hold it is its share of the mode's strain energy, and what that costs is its weight: the groups that do
    // most for each tonne are grown first, as many as hold a third of the mode's energy between them; never one with
    // almost none, nor one that does less than a tenth as much for its weight as the best of those that can still grow.
    // (The groups that do most of all may already be as big as their room allows, as a tower's legs are where they
    // pass between wheels: then it is the next ones, and the frame is made stiff where it still can be, not heavy.)
    for (const list of unstable.values()) {
      let held = 0, best = 0;
      for (const e of list.filter(e => e.sh >= 0.004).map(e => ({ ...e, per: e.sh / tonnes(e.row.name, e.label) })).sort((a, b) => b.per - a.per)) {
        if (held >= 1 / 3 || e.per < best / 10) break;
        if (bump(e.row, e.label, clamp(Math.pow(BUCKLING_FACTOR * 1.1 / Math.max(e.row.lambda, 0.1), 0.5), 1.05, 1.6))) { held += e.sh; best ||= e.per; }
      }
    }
    // A tower whose bearing moves too far: enlarge the members that would hold that bearing still, those of the frame it
    // is in where it moves in that frame's plane (the frame's legs, ties and braces), its legs in both frames and the
    // struts between them where it moves along the arbor. The passes here are the quick analysis and the check is the
    // exact one, so each is designed with something in hand; under the pendulum's swing, to four fifths of what it may
    // move. That is the movement that comes back with every beat, and the pendulum's own suspension is one of the
    // bearings: a frame that gives with the swing takes energy from it and alters its rate, and the clock's rate is
    // the thing it is for. (Under the winding, which comes three times a day, a bearing is let come nearer its limit.)
    // (The quick analysis amplifies every movement by 1 / (1 - 1 / lambda), the amplification of a frame's sway, where
    // lambda is how many times its load the frame would buckle under; a tower not yet stiff enough not to buckle at
    // 2.5 times its load is grown for that above, and its movements are judged as they will be when it is: amplified
    // as for 2.5. Otherwise a frame halfway there would have its bearings' movements counted several times over, and
    // be made heavy for movements it will not have. And towers that would buckle under their own weight, as they do in
    // the first passes from cold, have no movements to speak of: they are only grown to stand up.)
    const lt = res.frames.get('towers')?.lambda ?? BUCKLING_FACTOR, amp = (l) => l > 1.05 && isFinite(l) ? 1 / (1 - 1 / l) : 1;
    const asIf = amp(Math.max(lt, BUCKLING_FACTOR)) / amp(lt);
    if (lt > 1.05) for (const b of bearingMoves(res)) for (const c0 of b.each) {
      const c = { ...c0, ratio: c0.ratio * asIf }, limit = c.kase === 'pendulum' ? 0.8 : 0.95;
      if (c.ratio <= limit) continue;
      const row = res.rows.find(r => r.name === b.tower), big = Math.max(...c.d.map(v => Math.hypot(...v)), 1e-12);
      const moving = c.d.map((v, i) => ({ v, side: i ? 'front' : 'back' })).filter(q => Math.hypot(...q.v) >= 0.5 * big);
      const along = moving.some(q => Math.abs(q.v[2]) >= Math.hypot(q.v[0], q.v[1])), across = moving.some(q => Math.abs(q.v[2]) < Math.hypot(q.v[0], q.v[1]));
      const wanted = (label) => label.startsWith('leg') ? (along || moving.some(q => label.startsWith(`leg, ${q.side} frame`))) : label === 'strut' ? along : (label === 'brace' || label === 'tie beam') && across;
      for (const label of Object.keys(row?.byLabel || {})) if (wanted(label)) bump(row, label, clamp(Math.pow(c.ratio / (limit - 0.05), 0.6), 1.05, 1.6));
    }
    for (const w of wallMoves(res)) if (w.ratio > 0.95) {
      const f = clamp(Math.pow(w.ratio / 0.9, 0.6), 1.05, 1.6), wt = `wind truss ${w.wall.slice(6)}`;
      for (const label of ['chord', 'post', 'diagonal']) bump(wt, label, f);
      bump(w.wall, 'wind girder', f);
    }
    if (!grew) break;
  }
  timing.design = performance.now() - t0; timing.frames = res.ms; lastResult = res;
  feet = res.terminal.ground.filter(t => t.from.startsWith('tower')).map(t => ({ p: t.p, load: Math.abs(t.f[1]), tower: t.from }));
}

// A leg's pedestal: big enough that the concrete under its bearing plate is worked no harder than it may be, and no
// smaller than the foot of the leg; no bigger than the room that was kept clear for it on the floor (6.4 by 4 m).
function pedestal(f) {
  const T = towers.find(t => t.name === (f.tower || f.from)), p = f.p, piece = T && T.legs.find(l => Math.hypot(l[0][0] - p[0], l[0][2] - p[2]) < 0.1);
  const hl = piece ? legSection(T, piece).dims.h : 1.6, w = piece ? piece[3] : DEPTH, N = f.load ?? f.N, need = N / (PED_USE * MATERIAL.concrete.fc);
  let B = hl + 1.0, D = w + 0.5;
  if (B * D < need) { const k = Math.sqrt(need / (B * D)); B *= k; D *= k; }
  if (D > 4.0) { B = Math.min(6.4, need / 4.0); D = 4.0; }
  if (B > 6.4) { D = Math.min(4.0, need / 6.4); B = 6.4; }
  // (too big only if it cannot have the area it needs in that room, whatever its shape: a block grown in proportion
  // past one side of the room is made longer the other way instead)
  return { B, D, capped: B * D < need * (1 - 1e-6) };
}

// Two feet of different towers near enough to stand on one block of concrete: within SHARE[0] of each other along
// the frames and SHARE[1] across them, and no nearer across them than SHARE[2], so that their legs and bearing plates
// stand side by side, not one on the other.
const SHARE = [3.0, 2.6, 1.6];
const PED_USE = 0.9;                                  // a pedestal is sized to work its concrete to no more than nine tenths of what it may bear
const MIN_BASE = 0.12;                                // a tower's feet at least an eighth of its height apart
// The pedestals: one under each foot, or one under each group of feet whose pedestals would overlap (a combined
// footing). A group's block is the rectangle round its feet's own pedestals, enlarged if the concrete under it would
// be worked harder than it may be by all of them together.
function pedestals(list) {
  const ps = list.map(f => ({ f, ...pedestal(f) })), groups = [];
  for (const q of ps) {
    const touching = groups.filter(g => g.ps.some(o => Math.abs(o.f.p[0] - q.f.p[0]) < (o.B + q.B) / 2 && Math.abs(o.f.p[2] - q.f.p[2]) < (o.D + q.D) / 2));
    const g = { ps: [q, ...touching.flatMap(t => t.ps)] };
    for (const t of touching) groups.splice(groups.indexOf(t), 1);
    groups.push(g);
  }
  return groups.map(g => {
    const lo = [0, 2].map(i => Math.min(...g.ps.map(o => o.f.p[i] - (i ? o.D : o.B) / 2))), hi = [0, 2].map(i => Math.max(...g.ps.map(o => o.f.p[i] + (i ? o.D : o.B) / 2)));
    let B = hi[0] - lo[0], D = hi[1] - lo[1];
    const N = g.ps.reduce((t, o) => t + (o.f.load ?? o.f.N), 0), need = N / (PED_USE * MATERIAL.concrete.fc);
    if (g.ps.length > 1 && B * D < need) { const k = Math.sqrt(need / (B * D)); B *= k; D *= k; }
    // (a foot's bearing plate must not overlap its neighbour's)
    // (the room kept for it is the rectangle round the room kept for each of its feet)
    const room = [0, 2].map(i => Math.max(...g.ps.map(o => o.f.p[i])) - Math.min(...g.ps.map(o => o.f.p[i])) + (i ? 4.0 : 6.4));
    return { ps: g.ps, c: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], B, D, N, capped: g.ps.length > 1 ? B > room[0] + 1e-6 || D > room[1] + 1e-6 : g.ps[0].capped, towers: [...new Set(g.ps.map(o => o.f.tower || o.f.from))] };
  });
}

// ---- the foundations. Under the floor is one raft of reinforced concrete on rock, as big as the building. Each leg
// of a tower stands on a pedestal on it (above); each column of the walls on a steel grillage cast into the raft's
// top at the column's foot, long along the wall and reaching in from the raft's edge as far as the rock under it needs;
// each column of the stair towers, the escape turrets and the stack, which stand outside the raft, on a grillage in
// the top of a footing of its own under the whole of what it is under, which it shares with the other columns there. They are designed here
// from the loads the design loop found, drawn at that size, and checked in structuralCheck against the exact analysis.
// The rock is a site requirement: strong rock, taken at ROCK (the usual presumed bearing value for strong limestone or
// hard sandstone), to be proved by investigation before anything is built.
const ROCK = 4.0e6, RAFTS = [3, 4, 5, 6, 8, 10], GRILLAGE_MAX = 10;
const vRdc = (d) => 0.12 * Math.min(2, 1 + Math.sqrt(0.2 / d)) * Math.cbrt(100 * 0.005 * 40) * 1e6;      // EN 1992-1-1 6.4.4, rho 0.5 %, fck 40
const VRD_MAX = 0.4 * 0.6 * (1 - 40 / 250) * 40e6 / 1.5;                                                // at the face of the loaded area, 6.4.5(3)
// Punching of a column base, EN 1992-1-1 6.4.4(2): on a control perimeter a out from the loaded area (B by D), the
// load less the rock's reaction inside it, against v_Rd,c 2d/a; the worst a up to 2d. edges: how many free edges of the
// raft the loaded area stands on (0, 1 along B, or 2 at a corner); s: where the perimeters of the columns either side
// meet, along the wall. The service load times 1.4.
function punching(N, B, D, raft, spread, edges = 0, s = Infinity) {
  const d = raft - 0.3, p = N / spread, vr = vRdc(d);
  let worst = 1.4 * N / ((edges === 2 ? B + D : edges ? B + 2 * D : 2 * (B + D)) * d) / VRD_MAX;
  for (let k = 1; k <= 24; k++) {
    const a = 2 * d * k / 24;
    let u, A;
    if (edges === 2) { u = B + D + Math.PI * a / 2; A = B * D + a * (B + D) + Math.PI * a * a / 4; }
    else if (edges === 1) { if (B + 2 * a >= s) { u = s; A = s * (D + a); } else { u = B + 2 * D + Math.PI * a; A = B * D + a * (B + 2 * D) + Math.PI * a * a / 2; } }
    else { u = 2 * (B + D) + 2 * Math.PI * a; A = B * D + 2 * a * (B + D) + Math.PI * a * a; }
    worst = Math.max(worst, 1.4 * Math.max(0, N - p * Math.min(A, spread)) / (u * d) / (vr * 2 * d / a));
  }
  return worst;
}
let foundation = null;
// What stands on the ground, as it presses down: the clock going (its own weight and the teeth), and for the upright
// shafts of the winding gear the worms' push down them while the weight is wound too, when that is down (the left).
const UPRIGHT_PAD = 3.0;                              // the upright shafts' pedestals, as drawn
function groundLoads(res) {
  return res.terminal.ground.map(t => ({ p: t.p, N: -t.f[1] + (t.from.startsWith('upright') ? Math.max(0, -(t.cases.winding?.[1] || 0)) : 0), from: t.from })).filter(t => t.N > 0);
}
// The right-hand upright shaft's foot, which the worm pulls up while the weight is wound. Its footstep is double-acting
// and its casting is held down by ANCHOR.n rods round a circle ANCHOR.D across, headed and cast into the raft ANCHOR.hef
// deep. Designed for the pull at 1.5 against the shaft's own weight at 0.9 (EN 1990, the equilibrium case), and for the
// bevels' push sideways at 1.5, taken as all on the rods on one side: each rod (EN 1993-1-8, F_t,Rd = 0.9 fub As / 1.25)
// and the cone of raft they pull out (EN 1992-4 7.2.1.4: cracked, k1 7.7; the rods ANCHOR.D apart in a cone 3 hef across,
// further than 1.5 hef from the raft's edge; gamma 1.5).
function uprightAnchor(res) {
  const u = WINDGEAR.uprights?.find(q => q.side > 0), t = u && res.terminal.ground.find(q => q.from === `upright shaft ${u.name}`);
  if (!t || !t.cases.winding) return null;
  const W = -t.cases.dead[1], P = t.cases.winding[1], M = Math.hypot(t.cases.winding[3], t.cases.winding[5]), A = ANCHOR, D = A.D;
  const N = Math.max(0, 1.5 * P - 0.9 * W), Md = 1.5 * M, As = Math.PI / 4 * (A.d - 0.0056) ** 2, FtRd = 0.9 * A.fub * As / 1.25, bolt = N / A.n + 4 * Md / (A.n * D);
  const fck = MATERIAL.concrete.fc / 0.3 / 1e6, scr = 3 * A.hef, N0 = A.k1 * Math.sqrt(fck) * (A.hef * 1000) ** 1.5, NRdc = N0 * ((scr + D) / scr) ** 2 / 1.5, T = N + Md / (D / 2);
  const edge = TOWER.hz + TOWER.wall - Math.abs(t.p[2]);
  return { W, P, M, N, Md, bolt, FtRd, T, NRdc, edge, ok: bolt <= FtRd && T <= NRdc && edge >= 1.5 * A.hef };
}
function designFoundations(res) {
  const conc = MATERIAL.concrete, ox = TOWER.hx + TOWER.wall, oz = TOWER.hz + TOWER.wall;
  const loads = groundLoads(res);
  const peds = pedestals(loads.filter(t => t.from.startsWith('tower')).map(t => ({ p: t.p, load: t.N, tower: t.from })));
  // the wall columns, wall by wall in order along it, and how far each is from the next
  const cols = [];
  for (const w of ['shell back', 'shell front', 'shell left', 'shell right']) {
    const ax = w.endsWith('back') || w.endsWith('front') ? 0 : 2, list = loads.filter(t => t.from === w).sort((a, b) => a.p[ax] - b.p[ax]);
    const end = ax === 0 ? ox : oz, out = ax === 0 ? 2 : 0, face = Math.sign(list[0]?.p[out] || 1) * (ax === 0 ? oz : ox);
    list.forEach((t, i) => {
      const gaps = [i ? t.p[ax] - list[i - 1].p[ax] : Infinity, i < list.length - 1 ? list[i + 1].p[ax] - t.p[ax] : Infinity], s = Math.min(...gaps);
      const corner = end - Math.abs(t.p[ax]) < 2, B = Math.min(9.4, s - 0.6);
      // (a corner column's grillage runs from the corner along its wall; the others are centred on their columns)
      const c = corner ? Math.sign(t.p[ax]) * (end - B / 2) : t.p[ax];
      cols.push({ t, wall: w, ax, out, face, s, B, c, corner });
    });
  }
  const trial = (raft) => {
    const own = raft * conc.rho * GRAVITY, net = ROCK - own;
    const g = cols.map(o => {
      // as deep into the hall as the concrete under it and the rock under the raft need
      const L = o.corner ? Math.min(o.s, o.B + raft / 2) : Math.min(o.s, o.B + raft);
      const D = Math.max(WALL_T + 0.4, o.t.N / (PED_USE * conc.fc * o.B), o.t.N / (PED_USE * net * L) - raft / 2), spread = L * (D + raft / 2);
      return { ...o, D, spread, bearing: o.t.N / (o.B * D), rock: o.t.N / spread + own, punch: punching(o.t.N, o.B, D, raft, spread, o.corner ? 2 : 1, o.s), big: D > GRILLAGE_MAX };
    });
    const p = peds.map(q => { const spread = (q.B + raft) * (q.D + raft); return { ...q, spread, bearing: q.N / (q.B * q.D), rock: q.N / spread + own, punch: punching(q.N, q.B, q.D, raft, spread) }; });
    const others = loads.filter(t => !t.from.startsWith('tower') && !t.from.startsWith('shell')).map(t => {
      // (a column outside the raft stands on a grillage at the top of its footing, as big as the concrete under it
      // needs, and has its share of the footing's area to spread its load on the rock)
      const o = OUT_FOOT[t.from], B = o ? Math.max(2.0, Math.sqrt(t.N / (PED_USE * conc.fc))) : t.from.startsWith('upright') ? UPRIGHT_PAD : 1.6, spread = o ? o.area / o.n : (B + raft) ** 2;
      return { t, outside: !!o, B, D: B, spread, bearing: t.N / (B * B), rock: t.N / spread + own, punch: punching(t.N, B, B, raft, spread) };
    });
    const all = [...g, ...p, ...others];
    // (designed with a little in hand, as the pedestals are: the check is against the exact analysis's loads)
    return { raft, own, grillages: g, peds: p, others, ok: all.every(f => f.punch <= 0.95 && f.rock <= ROCK && f.bearing <= conc.fc && !f.big && !f.capped) };
  };
  foundation = RAFTS.map(trial).find(f => f.ok) || trial(RAFTS[RAFTS.length - 1]);
  return foundation;
}

function draw() {
  const out = [];
  G.tag = 'structure';
  declare(out);
  solids = []; bearings = [];
  for (const m of out) {
    if (SOLID.has(m.label) || m.label.startsWith('leg')) solids.push({ collider: sbeam('iron', m.a, m.b, m.h, m.w), what: m.label, at: m.a.map((v, i) => (v + m.b[i]) / 2), owner: m.owner, joins: m.joins });
    else beam('iron', m.a, m.b, m.h, m.w);
  }
  for (const T of towers) {
    const hl = Math.min(2.4, ...T.legs.map(m => legSection(T, m).dims.h)), { a, r } = T;
    for (const m of [...T.ties, ...T.braces]) for (const p of m) ibox('iron', hl * 1.5, hl * 1.5, DEPTH + 0.08, p[0], p[1], p[2]);     // gusset plates at the joints
    for (const z of T.planes) {
      ibox('iron', 2 * r + 3.2, 0.5, DEPTH, a.x, T.yh - 0.1, z);                                                // head casting the two legs meet under
      // pillow block: iron housing, bronze bearing shell
      G.tag = 'bearing';
      bearings.push(sbox('iron', r * 2 + 2.4, 0.5, 0.9, a.x, a.y - r - 0.45, z), sbox('iron', r * 2 + 1.2, r * 2 + 0.7, 0.9, a.x, a.y - 0.1, z));       // (no thicker than the frame: wheels' hubs come close on both sides)
      if (!SHAFT[T.arbor].beam) icyl('bronze', r + 0.3, 0.96, a.x, a.y, z, { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 });       // (the pendulum's head beam sits in a saddle, not a bearing)
      for (const dx of [-(r + 0.9), r + 0.9]) icyl('steel', 0.2, 0.5, a.x + dx, a.y - r - 0.1, z);
      G.tag = 'structure';
    }
  }
  // Each leg stands on a pedestal no bigger than its own foot needs. The foundation proper is
  // under the floor: one raft beneath the whole building (checked in structuralCheck).
  const F = designFoundations(lastResult);
  for (const g of F.peds) {
    solids.push({ collider: sbox('stone', g.B, FOOT, g.D, g.c[0], FOOT / 2, g.c[1]), what: 'pedestal', at: [g.c[0], FOOT / 2, g.c[1]], owner: g.towers[0], joins: g.towers });
    // a foot's bearing plate, held down by four bolts; feet that share a pedestal stand on one grillage, a plate as big
    // as the block, which spreads them both over it
    for (const { f, B: dx, D: dz } of g.ps.length > 1 ? [{ f: { p: [g.c[0], 0, g.c[1]] }, B: g.B, D: g.D }] : g.ps) {
      ibox('iron', dx - 0.4, 0.08, dz - 0.2, f.p[0], FOOT + 0.04, f.p[2]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) iknob('steel', 0.07, f.p[0] + sx * (dx / 2 - 0.35), FOOT + 0.1, f.p[2] + sz * (dz / 2 - 0.2));
    }
  }
  // the wall columns' grillages, cast into the top of the raft under the floor (two layers of steel beams crossing), and
  // the footings outside the raft under the ground: drawn, though nothing shows of them
  for (const g of F.grillages) {
    const along = g.ax === 0, mid = g.face - Math.sign(g.face) * g.D / 2;
    for (const [k, h] of [[0, 0.5], [1, 0.5]]) {
      const y = -0.3 - k * 0.5, w = k ? g.B : 0.6, dpt = k ? 0.6 : g.D, n = k ? Math.max(2, Math.round(g.D / 1.2)) : Math.max(2, Math.round(g.B / 1.2));
      for (let i = 0; i < n; i++) {
        const o = (i + 0.5) / n - 0.5, pa = k ? g.c : g.c + o * g.B, pb = k ? mid + o * g.D : mid;
        if (along) ibox('iron', w, h, dpt, pa, y, pb); else ibox('iron', dpt, h, w, pb, y, pa);
      }
    }
  }
  for (const o of Object.values(OUT_FOOT)) {
    if (!o.box) { icyl('stone', o.r, F.raft, o.c[0], -F.raft / 2 - 0.05, o.c[1]); continue; }
    // (the hoist's pit is cast into the right-hand stair tower's footing: HOISTGEAR.pit, [x0, x1, z0, z1, depth])
    const [cx, cz, bx, bz] = o.box, p = HOISTGEAR.pit, x0 = cx - bx / 2, x1 = cx + bx / 2, z0 = cz - bz / 2, z1 = cz + bz / 2;
    if (!p || p[0] < x0 || p[1] > x1 || p[2] < z0 || p[3] > z1) { ibox('stone', bx, F.raft, bz, cx, -F.raft / 2 - 0.05, cz); continue; }
    const d = p[4] - 0.05, yt = -0.05 - d / 2;
    ibox('stone', bx, F.raft - d, bz, cx, -0.05 - d - (F.raft - d) / 2, cz);
    for (const [a, b, c, e] of [[x0, x1, z0, p[2]], [x0, x1, p[3], z1], [x0, p[0], p[2], p[3]], [p[1], x1, p[2], p[3]]]) ibox('stone', b - a, d, e - c, (a + b) / 2, yt, (c + e) / 2);
  }
  for (const o of F.others) if (o.outside) {
    // and the grillage each column stands on, in the footing's top
    for (const [k, y] of [[0, -0.3], [1, -0.8]]) for (let i = 0, n = Math.max(2, Math.round(o.B / 1.2)); i < n; i++) { const u = ((i + 0.5) / n - 0.5) * o.B; if (k) ibox('iron', o.B, 0.5, 0.6, o.t.p[0], y, o.t.p[2] + u); else ibox('iron', 0.6, 0.5, o.B, o.t.p[0] + u, y, o.t.p[2]); }
  }
  if (wind) {
    const W = WINDGEAR, turn = (yaw) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    // plummer blocks under the line shafts and the lift's wheels, and plates under the feet
    G.tag = 'bearing';
    for (const t of [...wind.trestles, ...wind.tips.map(j => ({ top: j.tip, yaw: j.yaw }))]) {
      const p = t.top, y = t.y ?? W.lineY, q = turn(t.yaw);
      ibox('iron', 0.8, 1.25, t.y ? 0.5 : 1.0, p[0], y - 0.12, p[2], q); ibox('bronze', 0.84, 0.16, t.y ? 0.4 : 0.7, p[0], y, p[2], q);
    }
    for (const p of wind.head) { ibox('iron', 1.0, 1.25, 0.5, p[0], p[1] - 0.12, p[2]); ibox('bronze', 0.84, 0.16, 0.4, p[0], p[1], p[2]); }
    G.tag = 'structure';
    for (const f of [...wind.trestles.flatMap(t => t.feet), ...wind.tips.flatMap(j => j.posts)]) { ibox('stone', 1.1, PAD, 1.1, f[0], PAD / 2, f[2]); ibox('iron', 0.8, 0.06, 0.8, f[0], PAD + 0.03, f[2]); }
    // each upright shaft's pedestal, and on it the casting with its footstep and neck bearing (the right-hand one held
    // down to the raft by eight rods); a collar where each steady holds it; and the yoke's bearing housings either side
    // of the worm, each a casting round its bronze bush on the end of an arm
    for (const u of W.uprights) {
      solids.push({ collider: sbox('stone', UPRIGHT_PAD, 0.5, UPRIGHT_PAD, u.x, 0.25, W.wz), what: 'pedestal', at: [u.x, 0, W.wz] });
      if (u.side > 0) for (let i = 0; i < ANCHOR.n; i++) { const a = (i + 0.5) * 2 * Math.PI / ANCHOR.n; iknob('steel', 0.1, u.x + Math.cos(a) * ANCHOR.D / 2, 0.85, W.wz + Math.sin(a) * ANCHOR.D / 2); }
      G.tag = 'bearing';
      icyl('iron', W.upR + 0.35, 2.7, u.x, 0.5 + 1.35, W.wz); icyl('iron', ANCHOR.D / 2 + 0.2, 0.3, u.x, 0.65, W.wz);
      for (const m of wind.steadies.filter(m => m[2] === u.x)) { ibox('iron', 2 * W.upR + 0.5, 0.5, 2 * W.upR + 0.5, u.x, m[1][1], W.wz); icyl('bronze', W.upR + 0.12, 0.6, u.x, m[1][1], W.wz); }
      for (const m of wind.yoke.arms.filter(m => m[2] === u.x)) { ibox('iron', 2 * W.upR + 0.6, 0.6, 2 * W.upR + 0.6, u.x, m[1][1], W.wz); icyl('bronze', W.upR + 0.12, 0.66, u.x, m[1][1], W.wz); }
      G.tag = 'structure';
    }
    // the cap over the front bearing that the yoke's upper beam is bolted to (the lower is bolted under the head casting)
    { const c = wind.yoke.caps[0]; ibox('iron', 2 * SHAFT.great.r + 1.2, c[1][1] - c[0][1] - 1.75 - 0.3, 0.9, c[0][0], (c[0][1] + 1.75 + c[1][1] - 0.3) / 2, c[0][2]); }
  }
  if (detent) { G.tag = 'bearing'; ibox('steel', detent.R - PAWL_TIP, PAWL[0], PAWL[1], ARBOR.great.x + (detent.R + PAWL_TIP) / 2, detent.p1[1], PAWL_Z); G.tag = 'structure'; }       // the pawl itself, bolted to the bracket's side
  for (const h of hung) {
    tube('tendon', [h.x, h.e.y, h.e.z], [h.x, ROOF.at(h.x) + 0.4, h.e.z], 0.03);
    iknob('steel', 0.07, h.x, h.e.y, h.e.z); ibox('iron', 0.1, 0.5, 0.1, h.x, h.e.y + 1.9, h.e.z);
  }
  G.tag = '';
}

// Runs the structural model over everything declared so far and adds the checks that are
// not frames: the ground under the plinths, and the shell. Returns { ok, rows, text }.
export function structuralCheck() {
  const t0 = performance.now(), res = analyse({ exact: true }), extra = [], MPa = (v) => (v / 1e6).toFixed(1);
  timing.check = performance.now() - t0; lastResult = res;
  // Interference: does any structural solid occupy the same space as something that is not
  // structure (a wheel, an arbor, the engine, a walkway)? Structure touching structure is a joint.
  const own = new Set([...solids.map(q => q.collider.handle), ...bearings.map(c => c.handle)]), clashes = [];        // (a leg ends under its bearing: that is a joint)
  // the attic's floor over the wall heads is the deck of the top wind truss (see TOP_TRUSS): structure
  // (its four pieces, a band round the top in from the outer face: see tower.js)
  const sy = ARCH.cornice - ARCH.slab / 2;
  G.world.colliders.forEach((c) => { const t = c.translation(), he = c.shape.halfExtents; if (he && Math.abs(t.y - sy) < 0.05 && Math.abs(he.y - ARCH.slab / 2) < 0.05 && (Math.abs(t.x) + he.x > TOWER.hx + TOWER.wall - 0.05 || Math.abs(t.z) + he.z > TOWER.hz + TOWER.wall - 0.05)) own.add(c.handle); });
  for (const q of solids) {
    const c = q.collider;
    G.world.intersectionsWithShape(c.translation(), c.rotation(), c.shape, (o) => {
      const body = o.parent();
      if (own.has(o.handle) || o.handle === G.ground?.handle || (body && body.isDynamic())) return true;
      const t = o.translation(), part = G.parts.get(o.handle);
      clashes.push(`${q.what} at (${q.at.map(v => v.toFixed(0)).join(', ')}) against ${part ? 'a moving part' : 'something fixed'} at (${[t.x, t.y, t.z].map(v => v.toFixed(0)).join(', ')})`);
      return false;
    }, undefined, undefined, c);
  }
  // ... and against everything drawn that has no collider at all
  const drawn = boxIndex(drawnBoxes());
  for (const q of solids) {
    const c = q.collider, t = c.translation(), he = c.shape.halfExtents;
    if (!he) continue;
    const r = c.rotation(), me = obb([t.x, t.y, t.z], axesOf(new THREE.Quaternion(r.x, r.y, r.z, r.w)), [he.x - 0.03, he.y - 0.03, he.z - 0.03]), hit = drawn.hit(me);
    if (hit) clashes.push(`${q.what} at (${q.at.map(v => v.toFixed(0)).join(', ')}) against a drawn part at (${hit.c.map(v => v.toFixed(0)).join(', ')})`);
  }
  // ... one frame's members against another's. Members of the same frame meet at joints; two different
  // towers, or a tower and a trestle, have no business in the same place.
  const boxes = solids.map(q => { const c = q.collider, t = c.translation(), he = c.shape.halfExtents, r = c.rotation(); return he && obb([t.x, t.y, t.z], axesOf(new THREE.Quaternion(r.x, r.y, r.z, r.w)), [he.x - 0.05, he.y - 0.05, he.z - 0.05]); });
  const where = (q) => `(${q.at.map(v => v.toFixed(0)).join(', ')})`;
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++)
    if (boxes[i] && boxes[j] && solids[i].owner && solids[j].owner && solids[i].owner !== solids[j].owner && !solids[i].joins?.includes(solids[j].owner) && !solids[j].joins?.includes(solids[i].owner) && overlaps(boxes[i], boxes[j]))       // (a link is bolted to both towers it joins)
      clashes.push(`${solids[i].what} of ${solids[i].owner} at ${where(solids[i])} against ${solids[j].what} of ${solids[j].owner} at ${where(solids[j])}`);
  // ... the machinery against everything fixed that is not machinery: each of its colliders,
  const machine = (h) => G.parts.has(h) || G.machineFixed.has(h), seen = new Set();
  G.world.colliders.forEach((c) => {
    if (!machine(c.handle)) return;
    const sh = c.shape, he = sh.halfExtents, slim = he ? new G.R.Cuboid(he.x - 0.04, he.y - 0.04, he.z - 0.04) : sh.halfHeight !== undefined && sh.radius > 0.1 ? new G.R.Cylinder(sh.halfHeight - 0.04, sh.radius - 0.04) : sh;      // (touching is not overlapping)
    G.world.intersectionsWithShape(c.translation(), c.rotation(), slim, (o) => {
      const body = o.parent();
      if (machine(o.handle) || own.has(o.handle) || o.handle === G.ground?.handle || o.handle === G.glass?.handle || (body && body.isDynamic())) return true;      // (the hands' arbor goes out through the middle of the dial glass)
      const t = c.translation(), u = o.translation(), key = `${Math.round(t.x)},${Math.round(t.y)},${Math.round(t.z)}|${o.handle}`;
      if (!seen.has(key)) { seen.add(key); clashes.push(`machinery at (${[t.x, t.y, t.z].map(v => v.toFixed(0)).join(', ')}) against something fixed at (${[u.x, u.y, u.z].map(v => v.toFixed(0)).join(', ')})`); }
      return true;
    }, undefined, undefined, c);
  });
  const fixed = DRAWN.filter(o => o.tag !== 'outside' && o.tag !== 'bearing').map(o => obb(o.c, axesOf(o.q), o.half));
  let parts = 0;
  // ... and the drawn shape itself of every moving part: its vertices, and every bolt and rivet on it. A wheel's
  // collider stops at its face, but its hub and the bolts in it stand proud of that. Only a shaft may be inside a bearing.
  const CELL = 8, grid = new Map(), housings = DRAWN.filter(o => o.tag === 'bearing').map(o => obb(o.c, axesOf(o.q), o.half)), all = [...fixed, ...housings];
  all.forEach((o, n) => { for (let i = Math.floor(o.lo[0] / CELL); i <= Math.floor(o.hi[0] / CELL); i++) for (let j = Math.floor(o.lo[1] / CELL); j <= Math.floor(o.hi[1] / CELL); j++) for (let k = Math.floor(o.lo[2] / CELL); k <= Math.floor(o.hi[2] / CELL); k++) { const key = i + ',' + j + ',' + k; (grid.get(key) || grid.set(key, []).get(key)).push(n); } });
  const inside = (o, p) => [0, 1, 2].every(i => Math.abs((p.x - o.c[0]) * o.ax[i][0] + (p.y - o.c[1]) * o.ax[i][1] + (p.z - o.c[2]) * o.ax[i][2]) < o.half[i] - 0.03);
  const bearingSet = new Set(bearings.map(c => c.handle)), _v = new THREE.Vector3(), _m = new THREE.Matrix4();
  let points = 0;
  const probe = (p, shaft) => {                                // what fixed thing, if any, is this point inside?
    points++;
    for (const n of grid.get(Math.floor(p.x / CELL) + ',' + Math.floor(p.y / CELL) + ',' + Math.floor(p.z / CELL)) || []) if (!(shaft && n >= fixed.length) && inside(all[n], p)) return all[n].c;
    let hit = null;
    G.world.intersectionsWithPoint(p, (o) => {
      const body = o.parent();
      if (machine(o.handle) || o.handle === G.ground?.handle || o.handle === G.glass?.handle || (shaft && bearingSet.has(o.handle)) || (body && !body.isFixed())) return true;
      const t = o.translation(); hit = [t.x, t.y, t.z]; return false;
    });
    return hit;
  };
  for (const grp of G.machines) grp.updateWorldMatrix(true, true);          // (they are only brought up to date when a frame is drawn)
  for (const grp of G.machines) grp.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, shaft = !!o.userData.shaft; let hit = null, at = null; parts++;
    if (o.isInstancedMesh) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox, ends = [[0, 0, 0], [b.max.x, 0, 0], [b.min.x, 0, 0], [0, b.max.y, 0], [0, b.min.y, 0], [0, 0, b.max.z], [0, 0, b.min.z]];
      for (let i = 0; i < o.count && !hit; i++) { o.getMatrixAt(i, _m); _m.premultiply(o.matrixWorld); for (const d of ends) { _v.set(d[0], d[1], d[2]).applyMatrix4(_m); if ((hit = probe(_v, false))) { at = _v.toArray(); break; } } }
    } else for (let i = 0, step = Math.max(1, Math.floor(pos.count / 900)); i < pos.count && !hit; i += step) { _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if ((hit = probe(_v, shaft))) at = _v.toArray(); }
    if (hit) clashes.push(`the machinery at (${at.map(v => v.toFixed(1)).join(', ')}) against something fixed at (${hit.map(v => v.toFixed(0)).join(', ')})`);
  });
  // ... and the lift's cars, which travel. One car is carried right round the loop, a hand's breadth at a time, and every
  // piece of it tested against all it passes: everything fixed, any machinery that is not the lift's own cars, and the
  // four chain wheels it goes between (which only its axle, riding in their teeth as the chain's rollers do, may touch).
  if (LIFTGEAR.car) {
    const car = LIFTGEAR.car, pieces = [], _p = new THREE.Vector3(), _c = new THREE.Vector3(), near = boxIndex(DRAWN.filter(o => o.tag !== 'outside').map(o => obb(o.c, axesOf(o.q), o.half)));
    car.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(car.matrixWorld).invert();
    car.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox, m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), q = new THREE.Quaternion().setFromRotationMatrix(m), h = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const half = [Math.max(0.005, h.x - 0.015), Math.max(0.005, h.y - 0.015), Math.max(0.005, h.z - 0.015)];          // (touching is not overlapping)
      pieces.push({ c: b.getCenter(new THREE.Vector3()).applyMatrix4(m), rot: { x: q.x, y: q.y, z: q.z, w: q.w }, ax: axesOf(q), half, shape: new G.R.Cuboid(half[0], half[1], half[2]), axle: !!o.userData.axle });
    });
    let found = null;
    const say = (u) => `a lift car, ${_p.y.toFixed(1)} m up on the ${_p.x < (LIFT.xu + LIFT.xd) / 2 ? 'rising' : 'falling'} side, against something at (${u.map(v => v.toFixed(1)).join(', ')})`;
    for (let d = 0; d < LIFTGEAR.loop && !found; d += 0.1) {
      LIFTGEAR.at(d, _p);
      for (const pc of pieces) {
        _c.copy(pc.c).add(_p);
        const hit = near.hit(obb([_c.x, _c.y, _c.z], pc.ax, pc.half));
        if (hit) { found = say(hit.c); break; }
        G.world.intersectionsWithShape(_c, pc.rot, pc.shape, (o) => {
          const body = o.parent();
          if (LIFTGEAR.own.has(o.handle) || o.handle === G.ground?.handle || (pc.axle && LIFTGEAR.wheels.has(o.handle)) || (body && !body.isFixed() && !G.parts.has(o.handle))) return true;
          const u = o.translation(); found = say([u.x, u.y, u.z]); return false;
        });
        if (found) break;
      }
    }
    if (found) clashes.push(found);
  }
  // ... and the hoist's cage and counterweight, carried the whole height of their travel a fifth of a metre at a time,
  // every piece of each tested against all they pass: everything drawn that is not outside, and every fixed collider
  // but their own
  if (HOISTGEAR.cage) {
    const near = boxIndex(DRAWN.filter(o => o.tag !== 'outside').map(o => obb(o.c, axesOf(o.q), o.half))), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
    const was = HOISTGEAR.st.y, [y0, y1] = HOISTGEAR.travel, pieces = [];
    HOISTGEAR.at(y0);
    for (const [what, grp] of [['the hoist\'s cage', HOISTGEAR.cage], ['the hoist\'s counterweight', HOISTGEAR.weight]]) grp.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox, h = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      o.matrixWorld.decompose(_c, _q, _s);
      const half = [Math.max(0.005, h.x * _s.x - 0.015), Math.max(0.005, h.y * _s.y - 0.015), Math.max(0.005, h.z * _s.z - 0.015)];
      const c0 = b.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld), rel = c0.clone().sub(grp.position);
      pieces.push({ what, grp, rel, q: _q.clone(), ax: axesOf(_q), half, shape: new G.R.Cuboid(half[0], half[1], half[2]), sign: grp === HOISTGEAR.cage ? 1 : -1 });
    });
    let found = null, steps = 0;
    for (let y = y0; y <= y1 + 1e-6 && !found; y += 0.2) {
      steps++;
      for (const pc of pieces) {
        _c.copy(pc.rel).add(pc.grp.position); _c.y += pc.sign * (y - y0);
        const hit = near.hit(obb([_c.x, _c.y, _c.z], pc.ax, pc.half));
        if (hit) { found = `${pc.what}, the cage's floor ${y.toFixed(1)} m up, against something drawn at (${hit.c.map(v => v.toFixed(1)).join(', ')})`; break; }
        G.world.intersectionsWithShape(_c, pc.q, pc.shape, (o) => {
          const body = o.parent();
          if (HOISTGEAR.own.has(o.handle) || o.handle === G.ground?.handle || (body && !body.isFixed())) return true;
          const u = o.translation(); found = `${pc.what}, the cage's floor ${y.toFixed(1)} m up, against a collider at (${[u.x, u.y, u.z].map(v => v.toFixed(1)).join(', ')})`; return false;
        });
        if (found) break;
      }
    }
    HOISTGEAR.at(was);
    if (found) clashes.push(found);
    HOISTGEAR.swept = { pieces: pieces.length, steps };
  }
  // ... and the detent against what goes round past it. The pawl and its bracket stand still while everything on the
  // great arbor turns, so they are tested against all of that turned through a whole turn, not where it is now.
  if (detent) {
    const swept = sweepOf(ARBOR.great), boxOf = (c) => { const t = c.translation(), he = c.shape.halfExtents, r = c.rotation(); return obb([t.x, t.y, t.z], axesOf(new THREE.Quaternion(r.x, r.y, r.z, r.w)), [he.x, he.y, he.z]); };
    for (const [what, box] of [['pawl', pawlBox(detent.R, detent.p1[1])], ...solids.filter(q => q.what === 'detent').map((q, i) => [i ? 'strut' : 'bracket', boxOf(q.collider)])]) {
      const hit = swept(box);
      if (hit) clashes.push(`the maintaining detent's ${what} stands in the path of something carried round on the great arbor (${hit.r.toFixed(2)} m out, at z ${hit.z.toFixed(2)}), which will strike it once a turn`);
    }
  }
  // ... and the spaces that must be empty: nothing drawn, and no collider, may stand in a doorway or in the headroom over a walkway
  const anything = boxIndex(DRAWN.filter(o => o.tag !== 'outside').map(o => obb(o.c, axesOf(o.q), o.half)));
  for (const zn of G.clear) {
    const c = zn.lo.map((v, i) => (v + zn.hi[i]) / 2), half = zn.lo.map((v, i) => (zn.hi[i] - v) / 2), me = obb(c, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], half);
    let hit = anything.hit(me)?.c;
    if (!hit) G.world.intersectionsWithShape({ x: c[0], y: c[1], z: c[2] }, { x: 0, y: 0, z: 0, w: 1 }, new G.R.Cuboid(half[0], half[1], half[2]), (o) => {
      const body = o.parent();
      if (o.handle === G.ground?.handle || (body && body.isDynamic()) || o.shape.type === G.R.ShapeType.TriMesh) return true;
      const t = o.translation(); hit = [t.x, t.y, t.z]; return false;
    });
    if (hit) clashes.push(`${zn.name} at (${c.map(v => v.toFixed(0)).join(', ')}) has something in it, at (${hit.map(v => v.toFixed(0)).join(', ')})`);
  }
  extra.push({ name: 'clearance: structure against everything else', ok: clashes.length === 0,
    verdict: clashes.length ? `${clashes.length} of ${solids.length} solids overlap something: ${clashes.slice(0, 6).join('; ')}${clashes.length > 6 ? '; ...' : ''}` : `${solids.length} structural solids, ${parts} parts of the machinery and ${points.toLocaleString('en')} points on its surfaces, none overlapping a wheel, an arbor, a walkway, the engine, another frame or any other drawn part (as they stand now)` });
  // ... and the doors: every leaf swung through its whole travel, each way it may go, a twelfth of it at a time, and at
  // every step tested against everything fixed (drawn, or a collider) and every space that must be kept clear but its
  // own doorway's
  {
    const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], zones = G.clear.map(zn => ({ name: zn.name, box: obb(zn.lo.map((v, i) => (v + zn.hi[i]) / 2), I, zn.lo.map((v, i) => (zn.hi[i] - v) / 2)) }));
    const fouls = (L, a) => {
      const b = leafBox(L, a), me = obb(b.c, axesOf(b.q), b.half.map(v => v - 0.015)), own = L.door.zone;
      const hit = anything.hit(me);
      if (hit) return `something drawn at (${hit.c.map(v => v.toFixed(1)).join(', ')})`;
      const z = zones.find(z => !own.includes(z.name) && overlaps(me, z.box));
      if (z) return z.name;
      let found = null;
      G.world.intersectionsWithShape({ x: b.c[0], y: b.c[1], z: b.c[2] }, { x: b.q.x, y: b.q.y, z: b.q.z, w: b.q.w }, new G.R.Cuboid(...me.half), (o) => {
        const body = o.parent();
        if (o.handle === G.ground?.handle || (body && !body.isFixed()) || o.isSensor()) return true;
        const t = o.translation(); found = `a collider at (${[t.x, t.y, t.z].map(v => v.toFixed(1)).join(', ')})`; return false;
      });
      return found;
    };
    const bad = [];
    let steps = 0;
    for (const L of DOOR_LEAVES) {
      let found = null;
      for (const s of L.door.swing) for (let k = 0; k <= 12 && !found; k++) { steps++; const f = fouls(L, s * L.door.max * k / 12); if (f) found = `${f}, opened ${(L.door.max * k / 12 * 180 / Math.PI).toFixed(0)} deg to ${s > 0 ? '+' : '-'}${L.door.n[0] ? 'x' : 'z'}`; }
      if (found) bad.push(`the leaf hung at (${L.hinge.map(v => v.toFixed(1)).join(', ')}) fouls ${found}`);
    }
    clashes.push(...bad);
    const ways = DOOR_LEAVES.filter(L => L.door.swing.length > 1).length;
    extra.push({ name: 'doors: every leaf swung', ok: bad.length === 0,
      verdict: bad.length ? `${bad.length} of ${DOOR_LEAVES.length} leaves foul something: ${bad.slice(0, 6).join('; ')}${bad.length > 6 ? '; ...' : ''}` : `${DOOR_LEAVES.length} leaves in ${new Set(DOOR_LEAVES.map(L => L.door)).size} doorways (${ways} of them double-acting), each swung through its travel in ${steps.toLocaleString('en')} steps in all, foul nothing fixed and no space kept clear but their own doorway's` });
  }
  // Power: can the driving weight keep the clock going?
  if (POWER.budget) {
    const b = POWER.budget(), kW = (v) => (v / 1000).toFixed(1);
    extra.push({ name: 'power: the driving weight against friction', ok: b.supply >= 1.25 * b.need,
      verdict: `the weight's fall gives ${kW(b.supply)} kW; the arbors' bearings take ${kW(b.journals)} (roller bearings, friction ${b.mu}), the teeth ${kW(b.teeth)}, and winding the remontoire ${kW(b.remontoire)}, of which ${kW(b.arms)} reaches the pendulum (Q ${b.Q}); the brake takes the other ${kW(b.supply - b.need)}. The weight is ${Math.round(b.weightKg / 1000).toLocaleString('en')} t, each gravity arm ${Math.round(b.armKg).toLocaleString('en')} kg, the remontoire's weight ${Math.round(b.remKg)} kg, and the escape wheel takes ${b.turn.toFixed(1)} s over its sixth of a turn` });
  }
  // Stability: every frame's elastic critical load factor, found with every member's axial force at its worst.
  const frames = [...res.frames.values()].filter(F => isFinite(F.lambda)).sort((p, q) => p.lambda - q.lambda);
  const weak = frames.filter(F => F.lambda < BUCKLING_FACTOR || F.exact === false);
  extra.push({ name: 'stability: each frame', ok: !weak.length,
    verdict: `${frames.length} frames; the least stable ${frames.slice(0, 4).map(F => `${F.name} ${F.lambda.toFixed(2)}`).join(', ')} times their loads before they buckle (each needs ${BUCKLING_FACTOR}; confirmed by factorising K + ${BUCKLING_FACTOR} Kg)${weak.length ? `; too low: ${weak.map(F => F.name).join(', ')}` : ''}` });
  // Serviceability: the bearings, and the walls.
  const bm = bearingMoves(res), bad = bm.filter(b => b.ratio > 1), mm = (v) => (v * 1000).toFixed(1);
  extra.push({ name: 'serviceability: bearings', ok: !bad.length,
    verdict: `under the pendulum's swing and the winding, the worst bearing moves ${mm(Math.max(...bm.map(b => b.move)))} mm (allowed ${mm(BEARING_MOVE)}), and an arbor's bearings move across it by 1 in ${Math.round(1 / Math.max(...bm.map(b => b.slope), 1e-9)).toLocaleString('en')} of their distance (allowed 1 in ${ARBOR_SLOPE}): ${bm.map(b => `${b.arbor} ${mm(b.move)} mm`).join(', ')}${bad.length ? `; too much at ${bad.map(b => `${b.arbor} (${b.why})`).join(', ')}` : ''}${windingNote()}` });
  const P = presets(res, bm), sag = P.residual.filter(b => b.left > SHIM), off = P.meshes.filter(m => Math.abs(m.preset) > 0.0005);
  extra.push({ name: 'serviceability: bearings under the clock\'s weight', ok: !sag.length && !off.length,
    verdict: `the bearing seats are pre-set: each is set high and over by what the clock's own weight will move it (${bm.map(b => `${b.arbor} ${mm(b.dead)}`).join(', ')} mm), the wheels landed, and the bearings then lined with shims. Left to the shims is what that computation may be out by, taken as a tenth of it, at most ${mm(Math.max(...P.residual.map(b => b.left)))} mm (${P.residual.map(b => `${b.arbor} ${mm(b.left)}`).join(', ')}) against the ${mm(SHIM)} mm they hold; the weight wound up and run down makes no difference (it hangs on its line either way, and the 2 m it falls between windings is a sixteenth of a turn of the barrel). With the seats pre-set every pair of meshing wheels is at its drawn centre distance under the clock's weight (${P.meshes.map(m => `${m.what} ${mm(m.preset)} mm off, against ${mm(m.bare)} without the preset`).join('; ')}); the shims take up the rest (at most ${mm(Math.max(...P.meshes.map(m => m.doubt)))} mm along a line of centres)${sag.length ? `; too much left to shim at ${sag.map(b => b.tower).join(', ')}` : ''}${off.length ? `; off centre: ${off.map(m => m.what).join(', ')}` : ''}` });
  const wm = wallMoves(res), wbad = wm.filter(w => w.ratio > 1);
  extra.push({ name: 'serviceability: the walls in the wind', ok: !wbad.length,
    verdict: wm.map(w => `${w.wall.slice(6)} ${mm(w.out)} mm out of its plane (allowed ${mm(w.L / WALL_LIMIT)}), its head ${mm(w.along)} mm along it (allowed ${mm(TOWER.H / WALL_LIMIT)})`).join('; ') + (wbad.length ? `; too much: ${wbad.map(w => `${w.wall} (${w.combo})`).join(', ')}` : '') });
  // Foundations (see designFoundations): the footings as drawn, against the exact analysis's loads. Each load is
  // matched to its footing by where it is.
  const conc = MATERIAL.concrete, F = foundation, raft = F.raft, raftP = raft * conc.rho * GRAVITY, area = (2 * (TOWER.hx + TOWER.wall)) * (2 * (TOWER.hz + TOWER.wall));
  const loads = groundLoads(res);
  const near = (p, q) => Math.hypot(p[0] - q[0], p[2] - q[2]) < 0.5;
  const fset = [
    ...F.peds.map(q => { const N = loads.filter(t => q.ps.some(o => near(o.f.p, t.p))).reduce((a, t) => a + t.N, 0); return { what: `pedestal under ${q.towers.join(' and ')}`, N, B: q.B, D: q.D, spread: q.spread, edges: 0, s: Infinity, capped: q.capped }; }),
    ...F.grillages.map(g => { const N = loads.filter(t => t.from === g.wall && near(t.p, g.t.p)).reduce((a, t) => a + t.N, 0); return { what: `grillage under ${g.wall.slice(6)} wall column at ${g.t.p[g.ax].toFixed(0)}`, N, B: g.B, D: g.D, spread: g.spread, edges: g.corner ? 2 : 1, s: g.s, wall: true }; }),
    ...F.others.map(o => { const N = loads.filter(t => t.from === o.t.from && near(t.p, o.t.p)).reduce((a, t) => a + t.N, 0); return { what: o.outside ? `a column of the ${o.t.from} on its footing` : `pad under ${o.t.from}`, N, B: o.B, D: o.D, spread: o.spread, edges: 0, s: Infinity, outside: o.outside, from: o.t.from }; }),
  ].map(f => ({ ...f, bearing: f.N / (f.B * f.D), rock: f.N / f.spread + raftP, punch: punching(f.N, f.B, f.D, raft, f.spread, f.edges, f.s) }));
  const matched = fset.reduce((a, f) => a + f.N, 0), carried = loads.reduce((a, t) => a + t.N, 0);
  const worstOf = (list, k) => list.reduce((m, c) => c[k] > m[k] ? c : m, list[0]);
  const footed = fset.filter(f => !f.outside), wb = worstOf(fset, 'bearing'), wp = worstOf(fset, 'punch'), wr = worstOf(fset, 'rock'), tooBig = fset.filter(f => f.capped || (f.wall && f.D > GRILLAGE_MAX));
  const gs = fset.filter(f => f.wall), tr = fset.filter(f => f.outside);
  const ua = uprightAnchor(res), up = fset.filter(f => f.what.startsWith('pad under upright')), MN = (v) => (v / 1e6).toFixed(1);
  const upText = ua ? `. The winding gear's upright shafts stand on pedestals ${UPRIGHT_PAD} m square: under the left, the shaft's weight and the worm's push down it while winding, ${MN(Math.max(...up.map(f => f.N)))} MN, ${MPa(Math.max(...up.map(f => f.bearing)))} MPa. The right-hand worm pulls its shaft up with ${MN(ua.P)} MN against the shaft's ${MN(ua.W)} MN of weight, so its footstep is double-acting and held down by ${ANCHOR.n} rods ${ANCHOR.d * 1000} mm across, headed ${ANCHOR.hef} m deep in the raft: at 1.5 times the pull less 0.9 times the weight, ${MN(ua.N)} MN, and the bevels' push at its foot, ${MN(ua.Md)} MN m, the worst rod carries ${MN(ua.bolt)} MN (it may ${MN(ua.FtRd)}), and the cone of raft they pull at ${MN(ua.T)} MN against ${MN(ua.NRdc)} (EN 1992-4, cracked; ${ua.edge.toFixed(1)} m from the raft's edge)` : '';
  extra.push({ name: 'foundations: under each foot', ok: wb.bearing <= conc.fc && wp.punch <= 1 && wr.rock <= ROCK && !tooBig.length && Math.abs(matched - carried) < 1e-3 * carried && (!ua || ua.ok),
    verdict: `a raft ${raft} m thick under the whole building; ${F.peds.length} pedestals under the towers' legs${F.peds.some(q => q.ps.length > 1) ? ` (${F.peds.filter(q => q.ps.length > 1).map(q => `${q.towers.join(' and ')} share one, ${q.B.toFixed(1)} x ${q.D.toFixed(1)} m, on a grillage`).join('; ')})` : ''}; under the wall columns, steel grillages cast into the raft's top, ${Math.min(...gs.map(f => f.B)).toFixed(1)} to ${Math.max(...gs.map(f => f.B)).toFixed(1)} m along the wall and ${Math.min(...gs.map(f => f.D)).toFixed(1)} to ${Math.max(...gs.map(f => f.D)).toFixed(1)} m in from the raft's edge; under the two stair towers, the two escape turrets and the stack, outside the raft, footings of their own as big as what stands on them (${Object.entries(OUT_FOOT).map(([k, o]) => `${k} ${Math.round(o.area)} m2`).join(', ')}), each column on a grillage ${Math.min(...tr.map(f => f.B)).toFixed(1)} to ${Math.max(...tr.map(f => f.B)).toFixed(1)} m square in its top. The concrete under the worst (${wb.what}, ${Math.round(wb.N / GRAVITY / 1e3).toLocaleString('en')} t) bears ${MPa(wb.bearing)} MPa (allowed ${MPa(conc.fc)}). Punching of a column base (EN 1992-1-1 6.4.4(2): the rock's reaction inside the control perimeter taken off, the free edge of the raft and the next column's perimeter allowed for, the worst perimeter out to 2d, 1.4 times the service load) at worst ${(wp.punch * 100).toFixed(0)}% of the raft's strength (${wp.what}). The rock under the worst foot ${MPa(wr.rock)} MPa with the raft's weight (${wr.what}), against ${MPa(ROCK)}: strong rock is a requirement of the site, to be proved by investigation${tooBig.length ? `; footings that would need more room than there is: ${tooBig.map(f => f.what).join(', ')}` : ''}${upText}${ua && !ua.ok ? ' (too much)' : ''}` });
  // The ground in all: everything the raft carries, the raft, and what stands on it directly (the brick and stone below
  // the first girder); the stair towers, the escape turrets and the stack stand on footings of their own outside it
  const below = 4 * (TOWER.hx + TOWER.hz + TOWER.wall) * LEVELS[0] * BRICK_PER_M2 + Object.values(stone.faces).reduce((t, f) => t + f.bands[0].reduce((x, v) => x + v, 0), 0) * GRAVITY;
  const raftW = area * raft * conc.rho * GRAVITY, onRaft = footed.reduce((t, f) => t + f.N, 0), total = onRaft + below + raftW;
  extra.push({ name: 'ground: under the raft', ok: total / area <= ROCK,
    verdict: `${Math.round(total / GRAVITY / 1000).toLocaleString('en')} t (of it the raft ${Math.round(raftW / GRAVITY / 1000).toLocaleString('en')} t) on ${Math.round(area).toLocaleString('en')} m2: ${MPa(total / area)} MPa on average, and ${MPa(wr.rock)} under the worst foot, against ${MPa(ROCK)} for strong rock (the usual presumed bearing value for strong limestone or hard sandstone; strong igneous rock would be taken at 10): a requirement of the site, to be proved by investigation. Outside the raft, on footings of their own, the stair towers, the escape turrets and the stack put ${[...new Set(tr.map(f => f.from))].map(k => `${Math.round(tr.filter(f => f.from === k).reduce((t, f) => t + f.N, 0) / GRAVITY / 1000).toLocaleString('en')} t (${k})`).join(', ')} on the rock, ${MPa(Math.max(...tr.map(f => f.rock)))} MPa at worst` });
  // The brick and the stone. Each storey of brick stands on its own girder; each storey of stone on its own shelf.
  const brick = MATERIAL.brick, tallest = Math.max(...LEVELS.map((y, k) => y - (k ? LEVELS[k - 1] : 0))), foot = brick.rho * GRAVITY * tallest;
  extra.push({ name: 'shell: brick, crushing', ok: foot <= brick.fc,
    verdict: `${MPa(foot)} MPa at the foot of the tallest storey of brick (${tallest} m; the diaphragm's leaves and ribs carry their own weight, so it is the same as for solid brick) against ${MPa(brick.fc)} for brickwork` });
  const spans = ['shell back', 'shell front', 'shell left', 'shell right'].map(w => { const hs = [0, ...new Set([...LEVELS, ...WIND_LEVELS, ...windTrusses.filter(t => t.wall === w).map(t => t.y)])].sort((p, q) => p - q); return Math.max(...hs.slice(1).map((y, i) => y - hs[i])); }), span = Math.max(...spans);
  // (a metre strip of the diaphragm wall spanning from girder to girder: its leaves bend as the flanges of a beam, held
  // shut by the weight of the half storey above, which bears on the same brick: rho g h, whatever the section)
  const DW = DIAPHRAGM, bend = 1.1 * WIND_Q * span ** 2 / 8 / DW.Z, shut = brick.rho * GRAVITY * span / 2;
  extra.push({ name: 'shell: brick in the wind', ok: bend <= shut,
    verdict: `the panels are diaphragm walls ${DW.T} m overall, two ${DW.leaf * 1000} mm leaves joined by ${DW.rib * 1000} mm cross-ribs every ${DW.every} m (${DW.A.toFixed(2)} m2 of brick per metre, ${Math.round(DW.solid * 100)}% of solid; I ${DW.I.toFixed(3)} m4 per metre); ${MPa(bend)} MPa of bending in a strip spanning ${span.toFixed(1)} m between girders (0.8 of the wind outside, 0.3 suction inside), against ${MPa(shut)} of its own weight holding it shut at the middle` });
  const sf = stone.faces, stoneT = Object.values(sf).reduce((t, f) => t + f.total, 0), lift = STONE_RHO * GRAVITY * tallest;
  extra.push({ name: 'shell: the stone', ok: lift <= MATERIAL.stone.fc,
    verdict: `${Math.round(stoneT / 1e3).toLocaleString('en')} t of stone on the four faces (as drawn), ${Math.round(stone.crown.total / 1e3).toLocaleString('en')} t of attic and crown (${Math.round(stone.crown.stone / 1e3).toLocaleString('en')} t of it stone, ${Math.round(stone.crown.attic / 1e3).toLocaleString('en')} t the attic's brick), and ${Object.entries(stone.own).map(([k, l]) => `${Math.round(l.reduce((t, p) => t + p.kg, 0) / 1e3).toLocaleString('en')} t of brick and stone in the ${k}`).join(', ')}; built in storey-high lifts, each on a shelf off its girder, so the most any stone carries is ${tallest} m of itself, ${MPa(lift)} MPa against ${MPa(MATERIAL.stone.fc)} for granite` });
  return { ok: res.ok && extra.every(e => e.ok), clashes, rows: res.rows, extra, terminal: res.terminal, text: report(res, extra) };
}
