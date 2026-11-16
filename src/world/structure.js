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
import { TOWER, ARBOR, SHAFT, ROOF, PEND, DIAL } from '../layout.js';
import { assembly, redeclare, analyse, report, SECTION, MATERIAL, GRAVITY } from '../structure/model.js';
import { ENVELOPES } from '../clock/clockwork.js';

export const EDGES = [];            // edges of crossings that want hanging: { name, y, yc, z }, filled by tower.js
const ALLOY = MATERIAL.alloy, TENDON = MATERIAL.tendon;
const TRUSS_Z = [-32, -16, 0, 16, 32];
const BAY = 18, FOOT = 0.6, DEPTH = 0.9;          // tie spacing; top of a plinth; how thick a frame is where it passes between wheels
const THICK = [3.0, 2.2, 1.6, 1.2, DEPTH];        // thicknesses a leg may have, best first
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const boxOf = (h) => SECTION.box(h, Math.min(0.7 * h, DEPTH), h / 12);
// a leg piece: h deep in the plane of its frame (set by the analysis), w thick across it (set by what it must pass between)
const legOf = (h, w) => SECTION.box(h, w, Math.min(Math.max(h / 10, 0.06), 0.499 * Math.min(h, w)));

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

let towers = [], hung = [], sizes = new Map(), passes = 0, feet = [], solids = [], bearings = [];

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
      if (drawn.some(o => overlaps(me, o))) return true;
    }
    for (let k = 0; k <= 12; k++) if (forbidden(a.map((v, i) => v + d[i] * k / 12))) return true;
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
  const standing = (p) => !drawn.some(o => overlaps(obb([p[0], 2.0, p[2]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [3.2, 1.6, 2.0]), o)) && !G.world.intersectionWithShape({ x: p[0], y: 2.0, z: p[2] }, { x: 0, y: 0, z: 0, w: 1 }, new R.Cuboid(3.2, 1.6, 2.0), undefined, undefined, G.ground)
    && !ENVELOPES.some(e => e.floor && Math.hypot(p[0] - e.x, p[2] - e.z) < e.r + 3.5);
  // A strut from one frame to the other must also miss the frames of every other tower,
  // which are planned but not yet built (their legs taken as 3 m deep).
  const strutFouls = (a, b, owner) => fouls(a, b, 0.5, 0.5) || placed.some(m => m.owner !== owner && gap(a, b, m.a, m.b) < 0.25 + (m.strut ? 0.25 : 1.5) + 0.2);
  // No frame may be thicker than leaves room for the frame in the next gap along.
  const all = Object.values(SHAFT).flatMap(sh => sh.bearings), room = (z) => Math.min(THICK[0], Math.min(...all.filter(o => o !== z).map(o => Math.abs(o - z))) - 0.2);

  const drawn = drawnBoxes();        // posts, brackets, beams, lamp standards: most of what is drawn has no collider
  // ---- 1. a tower under each arbor
  towers = [];
  for (const [name, sh] of Object.entries(SHAFT)) {
    const a = ARBOR[name], A = assembly(`arbor ${name}`), [z1, z2] = sh.bearings, yh = a.y - sh.r - 0.6;
    self = a;
    let W = Math.PI * sh.r ** 2 * (sh.z[1] - sh.z[0]) * ALLOY.rho, M = W * ((sh.z[0] + sh.z[1]) / 2 - z1);
    for (const q of A.masses) { W += q.kg; M += q.kg * (A.nodes[q.n].p[2] - z1); }
    const R2 = M / (z2 - z1), loads = [(W - R2) * GRAVITY, R2 * GRAVITY];
    // how far each leg can splay: as near one in five as will clear everything, in both frames
    // (a negative splay leans the leg the other way: both feet then stand on the same side of the arbor, when the other side is taken)
    const frac = [0.2, 0.16, 0.24, 0.12, 0.28, 0.08, 0.05, 0.03, -0.03, -0.06, -0.1, -0.14], H = (z) => [a.x, yh, z], foot = (side, sp, z) => [a.x + side * sp * yh, FOOT, z];
    const splay = (side) => frac.find(sp => sh.bearings.every(z => standing(foot(side, sp, z)) && !fouls(H(z), foot(side, sp, z), 1.6, DEPTH)))
      ?? frac.find(sp => sh.bearings.every(z => !fouls(H(z), foot(side, sp, z), 1.6, DEPTH))) ?? 0.02;
    const s = { '-1': splay(-1), '1': splay(1) }, levels = [], half = [];
    for (let y = BAY; y < yh - BAY / 2; y += BAY) levels.push(y);
    for (let y = BAY / 2; y < yh - 3; y += BAY / 2) half.push(y);                    // struts front to back are tried twice as often as ties
    const at = (side, y, z) => [a.x + side * s[side] * yh * (yh - y) / (yh - FOOT), y, z];
    const T = { name: `tower ${name}`, arbor: name, a, r: sh.r, yh, planes: sh.bearings, loads, s, legs: [], feet: [], ties: [], braces: [], struts: [], stayed: {} };
    for (const side of [-1, 1]) {
      const stayed = [FOOT];                                         // heights at which this pair of legs is held apart from front to back
      half.forEach((y, k) => {
        if (!strutFouls(at(side, y, z1), at(side, y, z2), name)) { T.struts.push([at(side, y, z1), at(side, y, z2)]); stayed.push(y); }
        const up = half[k + 1], [za, zb] = k % 2 ? [z1, z2] : [z2, z1];
        if (up && !strutFouls(at(side, y, za), at(side, up, zb), name)) T.struts.push([at(side, y, za), at(side, up, zb)]);        // a diagonal up the side face
      });
      stayed.push(yh);                                               // the arbor itself holds the two heads apart
      T.stayed[side] = stayed.map(y => Math.round(y));
      // each leg in pieces from joint to joint, each piece as thick as its place between the wheels allows
      const ys = [FOOT, ...levels, yh], rake = Math.cos(Math.atan(s[side]));
      for (const z of sh.bearings) {
        T.feet.push(at(side, FOOT, z));
        for (let k = 0; k < ys.length - 1; k++) {
          const p = at(side, ys[k], z), q = at(side, ys[k + 1], z);
          const w = THICK.find(t => t <= room(z) && !fouls(p, q, 1.6, t)) ?? DEPTH;
          const below = Math.max(...stayed.filter(y => y <= ys[k] + 0.1)), above = Math.min(...stayed.filter(y => y >= ys[k + 1] - 0.1));
          T.legs.push([p, q, (above - below) / rake, w]);
        }
      }
    }
    for (const z of sh.bearings) levels.forEach((y, k) => {
      if (!fouls(at(-1, y, z), at(1, y, z), 0.6, DEPTH)) T.ties.push([at(-1, y, z), at(1, y, z)]);
      const up = levels[k + 1], [sa, sb] = k % 2 ? [1, -1] : [-1, 1];
      if (up && !fouls(at(sa, y, z), at(sb, up, z), 0.5, DEPTH)) T.braces.push([at(sa, y, z), at(sb, up, z)]);
    });
    for (const m of [...T.legs, ...T.ties, ...T.braces]) placed.push({ a: m[0], b: m[1], owner: name });
    for (const m of T.struts) placed.push({ a: m[0], b: m[1], owner: name, strut: true });
    towers.push(T);
  }
  self = null;
  // ---- 2. the walkways' rods to the roof, wherever a line straight up is clear
  hung = [];
  for (const e of EDGES) for (const x of ROOF.purlins) {
    if ([0, -0.7, 0.7].some(dx => [0, -0.25, 0.25].some(dz => ray([x + dx, e.y - 0.25, e.z + dz], [x + dx, ROOF.at(x) + 0.3, e.z + dz])))) continue;
    if (placed.some(m => gap([x, e.y, e.z], [x, ROOF.at(x), e.z], m.a, m.b) < (m.strut ? 0.5 : 1.8))) continue;
    assembly(e.name).member([x, e.yc, e.z], [x, ROOF.at(x), e.z], SECTION.round(0.03), TENDON, 'tie', 'hanger').rest([x, ROOF.at(x), e.z], `purlin ${x}`);
    hung.push({ x, e });
  }
  designLoop();
  draw();
  const count = (k) => towers.reduce((n, t) => n + t[k].length, 0);
  return { towers: towers.map(t => ({ name: t.name, height: +t.yh.toFixed(1), splay: [t.s['-1'], t.s['1']], unbraced: Math.round(Math.max(...t.legs.map(l => l[2]))), thick: [Math.min(...t.legs.map(l => l[3])), Math.max(...t.legs.map(l => l[3]))], ties: t.ties.length, braces: t.braces.length, struts: t.struts.length })),
    members: count('legs') + count('ties') + count('braces') + count('struts'), hangers: hung.length, passes, sizes: Object.fromEntries([...sizes].map(([k, v]) => [k, +v.toFixed(2)])) };
}

// The size of one group of members: remembered between passes, enlarged when overworked.
const size = (key, start) => { if (!sizes.has(key)) sizes.set(key, start); return sizes.get(key); };

// Declares the towers and the roof at their present sizes. With `out`, also lists what to draw.
function declare(out = null) {
  const hx = TOWER.hx, hz = TOWER.hz, top = ROOF.at, y0 = ROOF.eaves;
  for (const T of towers) {
    const A = redeclare(T.name, 'braced tower of two A-frames, standing on the floor'), S = (label, start) => size(`${T.name}|${label}`, start);
    const put = (m, section, h, w, label, lout = 0) => { A.member(m[0], m[1], section, ALLOY, 'beam', label, lout); if (out) out.push({ a: m[0], b: m[1], h, w, label }); };
    const hl = S('leg', 1.0), ht = S('tie beam', 0.5), hb = S('brace', 0.4), hs = S('strut', 0.4);
    for (const m of T.legs) put(m, legOf(hl, m[3]), hl, m[3], 'leg', m[2]);
    for (const p of T.feet) A.rest(p, 'ground', 'fix');
    for (const m of T.ties) put(m, boxOf(ht), ht, Math.min(0.7 * ht, DEPTH), 'tie beam');
    for (const m of T.braces) put(m, boxOf(hb), hb, Math.min(0.7 * hb, DEPTH), 'brace');
    for (const m of T.struts) put(m, boxOf(hs), hs, 0.7 * hs, 'strut');
    T.planes.forEach((z, i) => {
      A.member([T.a.x, T.yh, z], [T.a.x, T.a.y, z], SECTION.box(2 * T.r + 1.2, DEPTH, 0.3), ALLOY, 'strut', 'pillow block');
      A.force([T.a.x, T.yh, z], [0.025 * Math.abs(T.loads[i]), 0, 0.025 * Math.abs(T.loads[i])], 'out of true');       // nothing is perfectly plumb, and the teeth push sideways
    });
  }
  for (const x of ROOF.purlins) {
    const A = redeclare(`purlin ${x}`, 'purlin'), h = size(`purlin ${x}|purlin`, 0.35);
    A.member([x, top(x), -hz], [x, top(x), hz], boxOf(h), ALLOY, 'beam', 'purlin');
    for (const z of TRUSS_Z) A.rest([x, top(x), z], `roof truss ${z}`);
    A.rest([x, top(x), -hz], 'shell back').rest([x, top(x), hz], 'shell front');
    if (out) out.push({ a: [x, top(x) + 0.45, -hz], b: [x, top(x) + 0.45, hz], h, w: 0.7 * h, label: 'purlin' });
  }
  const xs = [-hx, ...ROOF.purlins, hx];
  for (const z of TRUSS_Z) {
    const name = `roof truss ${z}`, A = redeclare(name, 'spans the hall, wall to wall');
    const bar = (a, b, label, start) => { const h = size(`${name}|${label}`, start); A.member(a, b, boxOf(h), ALLOY, 'beam', label); if (out) out.push({ a, b, h, w: 0.7 * h, label }); };
    bar([-hx, y0, z], [hx, y0, z], 'bottom chord', 0.45);
    bar([-hx, y0, z], [0, ROOF.ridge, z], 'rafter', 0.45); bar([hx, y0, z], [0, ROOF.ridge, z], 'rafter', 0.45);
    for (let i = 1; i < xs.length - 1; i++) {
      bar([xs[i], y0, z], [xs[i], top(xs[i]), z], 'post', 0.25);
      const j = xs[i] < 0 ? i + 1 : i - 1;
      if (xs[i] !== 0) bar([xs[i], y0, z], [xs[j], top(xs[j]), z], 'diagonal', 0.25);
      A.brace([xs[i], top(xs[i]), z], 'z');                                            // the purlins keep it upright
    }
    A.rest([-hx, y0, z], 'shell left').rest([hx, y0, z], 'shell right', 'yz');           // one shoe fixed, the other free to slide as the truss stretches
  }
  declareShell(out);
}

// ---- the shell: a steel frame with brick panels between
const WALL_T = TOWER.wall + 0.3;                      // frame members are a little thicker than the brick, so they show on both faces
const LEVELS = [30, 60, 90, 120, 150, 180, ROOF.eaves, TOWER.H], RING = DIAL.r + 1.2;
const BRICK_PER_M2 = TOWER.wall * MATERIAL.brick.rho * GRAVITY;       // weight of a square metre of wall face, N
const WIND = 1500;                                    // N/m2 on the back wall, blowing toward the dial
const CROWN_PER_M = 5.0e5;                            // N per metre of wall head: the attic, copper roof, lantern and spire (about 23,000 t in all)

function declareShell(out) {
  const cx = TOWER.hx + TOWER.wall / 2, cz = TOWER.hz + TOWER.wall / 2, H = TOWER.H;
  const xs = [], zs = [];
  for (let v = -60; v <= 60; v += 10) xs.push(v);
  for (let v = -30; v <= 30; v += 10) zs.push(v);
  const walls = [
    { name: 'shell back', along: 'x', at: -cz, lines: xs, ends: [-cx, cx], wind: true },
    { name: 'shell front', along: 'x', at: cz, lines: xs, ends: [-cx, cx], dial: true },
    { name: 'shell left', along: 'z', at: -cx, lines: [-cz, ...zs, cz] },
    { name: 'shell right', along: 'z', at: cx, lines: [-cz, ...zs, cz] },
  ];
  for (const W of walls) {
    const A = redeclare(W.name, 'steel frame carrying the brick panels of one wall'); A.reach = 8;
    const P = (c, y) => W.along === 'x' ? [c, y, W.at] : [W.at, y, c];
    const wc = size(`${W.name}|column`, 1.0), hs = size(`${W.name}|girder`, 1.2), tc = clamp(wc / 12, 0.05, 0.25);
    const colSec = W.along === 'x' ? SECTION.box(wc, WALL_T, tc) : SECTION.box(WALL_T, wc, tc), girSec = SECTION.box(hs, WALL_T, clamp(hs / 14, 0.04, 0.2));
    // drawn a hand's breadth inside the wall's centre line, so the frame shows indoors and the stone hides it outdoors
    const inward = (p) => W.along === 'x' ? [p[0], p[1], p[2] - Math.sign(W.at) * 0.2] : [p[0] - Math.sign(W.at) * 0.2, p[1], p[2]];
    const draw = (a, b, h, w, label) => { if (out) out.push({ a: inward(a), b: inward(b), h, w, label }); };
    const inDial = (c, y) => W.dial && Math.hypot(c - DIAL.x, y - DIAL.y) < RING, chord = (d) => Math.sqrt(Math.max(0, RING * RING - d * d));
    const ringPts = [];
    // columns, from the ground to the top; the ones under the dial stop at its ring and start again above it
    for (const c of W.lines) {
      const cut = W.dial && Math.abs(c - DIAL.x) < RING ? chord(c - DIAL.x) : 0;
      const pieces = cut ? [[0, DIAL.y - cut], [DIAL.y + cut, H]] : [[0, H]];
      for (const [y0, y1] of pieces) { A.member(P(c, y0), P(c, y1), colSec, ALLOY, 'beam', 'column'); draw(P(c, y0), P(c, y1), W.along === 'x' ? wc : WALL_T, W.along === 'x' ? WALL_T : wc, 'column'); }
      if (cut) ringPts.push([c, DIAL.y - cut], [c, DIAL.y + cut]);
      A.rest(P(c, 0), 'ground', 'fix');
    }
    // girders at each level, bay by bay; each carries the brick panel standing on it
    const stops = W.ends ? [W.ends[0], ...W.lines, W.ends[1]] : W.lines;
    LEVELS.forEach((y, k) => {
      const panel = k < LEVELS.length - 1 ? (LEVELS[k + 1] - y) * BRICK_PER_M2 : CROWN_PER_M;      // the top girder carries the crown instead
      for (let i = 0; i < stops.length - 1; i++) {
        let a = stops[i], b = stops[i + 1];
        if (inDial(a, y) && inDial(b, y)) continue;
        if (inDial(a, y)) { a = DIAL.x + Math.sign(b - DIAL.x) * chord(y - DIAL.y); ringPts.push([a, y]); }
        if (inDial(b, y)) { b = DIAL.x + Math.sign(a - DIAL.x) * chord(y - DIAL.y); ringPts.push([b, y]); }
        A.member(P(a, y), P(b, y), girSec, ALLOY, 'beam', 'girder', 0, panel); draw(P(a, y - hs / 2), P(b, y - hs / 2), hs, WALL_T, 'girder');
      }
      // the girder runs on to the side walls, which carry its end and hold it against the wind; along its
      // own length it is free, so each wall resists what is in its own plane with its own bracing
      if (W.ends) A.rest(P(W.ends[0], y), 'shell left', 'yz').rest(P(W.ends[1], y), 'shell right', 'yz');
      if (W.wind) for (const c of W.lines) A.force(P(c, y), [0, 0, WIND * 10 * (k < LEVELS.length - 1 ? 30 : 12)], 'wind');
    });
    // diagonals, one to a bay at each storey, leaning alternately: it is these, not the columns
    // bending, that carry the wind down the side walls to the ground
    const hb = size(`${W.name}|bracing`, 0.5), tiers = [0, ...LEVELS];
    for (let k = 0; k < tiers.length - 1; k++) for (let i = 0; i < W.lines.length - 1; i++) {
      const [c0, c1] = (i + k) % 2 ? [W.lines[i + 1], W.lines[i]] : [W.lines[i], W.lines[i + 1]], y0 = tiers[k], y1 = tiers[k + 1];
      if (W.dial && [0, 0.25, 0.5, 0.75, 1].some(t => Math.hypot(c0 + (c1 - c0) * t - DIAL.x, y0 + (y1 - y0) * t - DIAL.y) < RING + 1)) continue;
      if (W.dial && y0 === 0 && Math.abs((c0 + c1) / 2) < 6) continue;                            // the door
      A.member(P(c0, y0), P(c1, y1), SECTION.box(hb, WALL_T, clamp(hb / 12, 0.03, 0.15)), ALLOY, 'beam', 'bracing'); draw(P(c0, y0), P(c1, y1), hb, WALL_T + 0.04, 'bracing');
    }
    // the roof line on the front and back walls: a raking girder the purlins sit on
    if (W.ends) {
      const hg = size(`${W.name}|gable`, 0.8), gs = [...new Set([-TOWER.hx, ...W.lines, TOWER.hx])].sort((p, q) => p - q);
      for (let i = 0; i < gs.length - 1; i++) {
        const a = P(gs[i], ROOF.at(gs[i])), b = P(gs[i + 1], ROOF.at(gs[i + 1]));
        A.member(a, b, SECTION.box(hg, WALL_T, clamp(hg / 14, 0.04, 0.2)), ALLOY, 'beam', 'gable'); draw(a, b, hg, WALL_T, 'gable');
      }
    }
    // the ring round the dial: the wall over the opening stands on it, and it carries that round to the columns either side
    if (W.dial) {
      // its corners: wherever a column or a girder meets it, and enough others between to keep it round
      const meets = ringPts.slice();
      for (let k = 0; k < 36; k++) {
        const p = [DIAL.x + RING * Math.cos(k * Math.PI / 18), DIAL.y + RING * Math.sin(k * Math.PI / 18)];
        if (!meets.some(m => Math.hypot(m[0] - p[0], m[1] - p[1]) < 2.5)) ringPts.push(p);
      }
      ringPts.sort((p, q) => Math.atan2(p[1] - DIAL.y, p[0] - DIAL.x) - Math.atan2(q[1] - DIAL.y, q[0] - DIAL.x));
      const hr = size(`${W.name}|ring`, 1.2), sec = SECTION.box(hr, WALL_T, clamp(hr / 12, 0.05, 0.25));
      ringPts.forEach((p, i) => {
        const q = ringPts[(i + 1) % ringPts.length], ym = (p[1] + q[1]) / 2, xm = (p[0] + q[0]) / 2, len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (len < 0.1) return;
        // above the dial the wall up to the next girder stands on the ring
        const over = ym > DIAL.y ? ((Math.abs(xm - DIAL.x) < chord(180 - DIAL.y) ? ROOF.eaves : 180) - ym) : 0;
        A.member(P(p[0], p[1]), P(q[0], q[1]), sec, ALLOY, 'beam', 'ring', 0, Math.max(0, over) * BRICK_PER_M2 * Math.abs(q[0] - p[0]) / len);
        draw(P(p[0], p[1]), P(q[0], q[1]), hr, WALL_T, 'ring');
      });
    }
  }
}

// Declare, analyse, enlarge what is overworked, and again, until it all holds.
function designLoop() {
  let res;
  for (passes = 1; passes <= 16; passes++) {
    declare();
    res = analyse();
    let grew = false;
    for (const row of res.rows) for (const [label, u] of Object.entries(row.byLabel || {})) {
      const key = `${row.name}|${label}`;
      if (!sizes.has(key) || !(u > 0.92)) continue;
      sizes.set(key, sizes.get(key) * clamp(Math.pow(u / 0.8, 0.4), 1.05, 3));
      grew = true;
    }
    if (!grew) break;
  }
  feet = res.terminal.ground.filter(t => t.from.startsWith('tower')).map(t => ({ p: t.p, load: Math.abs(t.f[1]), tower: t.from }));
}

function draw() {
  const out = [];
  G.tag = 'structure';
  declare(out);
  solids = []; bearings = [];
  for (const m of out) {
    if (m.label === 'leg' || m.label === 'tie beam' || m.label === 'brace' || m.label === 'strut') solids.push({ collider: sbeam('iron', m.a, m.b, m.h, m.w), what: m.label, at: m.a.map((v, i) => (v + m.b[i]) / 2) });
    else beam('iron', m.a, m.b, m.h, m.w);
  }
  for (const T of towers) {
    const hl = sizes.get(`${T.name}|leg`), { a, r } = T;
    for (const m of [...T.ties, ...T.braces]) for (const p of m) ibox('iron', hl * 1.5, hl * 1.5, DEPTH + 0.08, p[0], p[1], p[2]);     // gusset plates at the joints
    for (const z of T.planes) {
      ibox('iron', 2 * r + 3.2, 0.5, DEPTH + 0.5, a.x, T.yh - 0.1, z);                                                // head casting the two legs meet under
      // pillow block: iron housing, bronze bearing shell
      bearings.push(sbox('iron', r * 2 + 2.4, 0.5, 1.4, a.x, a.y - r - 0.45, z), sbox('iron', r * 2 + 1.2, r * 2 + 0.7, 1.15, a.x, a.y - 0.1, z));
      icyl('bronze', r + 0.3, 1.3, a.x, a.y, z, { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 });
      for (const dx of [-(r + 0.9), r + 0.9]) icyl('steel', 0.2, 0.5, a.x + dx, a.y - r - 0.1, z);
    }
  }
  // Each leg stands on a pedestal no bigger than its own foot needs. The foundation proper is
  // under the floor: one raft beneath the whole building (checked in structuralCheck).
  for (const f of feet) {
    const T = towers.find(t => t.name === f.tower), hl = sizes.get(`${T.name}|leg`), piece = T.legs.find(l => Math.hypot(l[0][0] - f.p[0], l[0][2] - f.p[2]) < 0.1);
    const dx = hl + 1.0, dz = (piece ? piece[3] : DEPTH) + 0.5;
    solids.push({ collider: sbox('stone', dx, FOOT, dz, f.p[0], FOOT / 2, f.p[2]), what: 'pedestal', at: f.p });
    ibox('iron', dx - 0.4, 0.08, dz - 0.2, f.p[0], FOOT + 0.04, f.p[2]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) iknob('steel', 0.07, f.p[0] + sx * (dx / 2 - 0.35), FOOT + 0.1, f.p[2] + sz * (dz / 2 - 0.2));
  }
  for (const h of hung) {
    tube('tendon', [h.x, h.e.y, h.e.z], [h.x, ROOF.at(h.x) + 0.4, h.e.z], 0.03);
    iknob('steel', 0.07, h.x, h.e.y, h.e.z); ibox('iron', 0.1, 0.5, 0.1, h.x, h.e.y + 1.9, h.e.z);
  }
  G.tag = '';
}

// Runs the structural model over everything declared so far and adds the checks that are
// not frames: the ground under the plinths, and the shell. Returns { ok, rows, text }.
export function structuralCheck() {
  const res = analyse(), extra = [], MPa = (v) => (v / 1e6).toFixed(1);
  // Interference: does any structural solid occupy the same space as something that is not
  // structure (a wheel, an arbor, the engine, a walkway)? Structure touching structure is a joint.
  const own = new Set([...solids.map(q => q.collider.handle), ...bearings.map(c => c.handle)]), clashes = [];        // (a leg ends under its bearing: that is a joint)
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
  const drawn = drawnBoxes();
  for (const q of solids) {
    const c = q.collider, t = c.translation(), he = c.shape.halfExtents;
    if (!he) continue;
    const r = c.rotation(), me = obb([t.x, t.y, t.z], axesOf(new THREE.Quaternion(r.x, r.y, r.z, r.w)), [he.x - 0.03, he.y - 0.03, he.z - 0.03]), hit = drawn.find(o => overlaps(me, o));
    if (hit) clashes.push(`${q.what} at (${q.at.map(v => v.toFixed(0)).join(', ')}) against a drawn part at (${hit.c.map(v => v.toFixed(0)).join(', ')})`);
  }
  extra.push({ name: 'clearance: structure against everything else', ok: clashes.length === 0,
    verdict: clashes.length ? `${clashes.length} of ${solids.length} solids overlap something: ${clashes.slice(0, 6).join('; ')}${clashes.length > 6 ? '; ...' : ''}` : `${solids.length} solids, none overlapping a wheel, an arbor, a walkway, the engine or any other drawn part (as they stand now)` });
  // The ground: one raft under the whole building, on rock.
  const total = res.terminal.ground.reduce((sum, t) => sum - t.f[1], 0), area = (2 * (TOWER.hx + TOWER.wall)) * (2 * (TOWER.hz + TOWER.wall)), rock = 1.0e6;
  extra.push({ name: 'ground: under the raft', ok: total / area <= rock,
    verdict: `${Math.round(total / GRAVITY / 1000).toLocaleString('en')} t on ${Math.round(area).toLocaleString('en')} m2 = ${MPa(total / area)} MPa against ${MPa(rock)} for sound rock (average; the towers' feet need thickening under them)` });
  // The brick: each panel stands on its own girder, 30 m of it, and spans that 30 m against the wind.
  const brick = MATERIAL.brick, panel = 30, foot = brick.rho * GRAVITY * panel;
  extra.push({ name: 'shell: a brick panel, crushing', ok: foot <= brick.fc,
    verdict: `${MPa(foot)} MPa at the foot of a ${panel} m panel against ${MPa(brick.fc)} for brickwork` });
  const bend = WIND * panel ** 2 / 8 / (TOWER.wall ** 2 / 6);                                        // a 1 m strip spanning from girder to girder
  extra.push({ name: 'shell: a brick panel, in the wind', ok: bend <= foot / 2,
    verdict: `${MPa(bend)} MPa of bending in a strip spanning ${panel} m between girders, against ${MPa(foot / 2)} of its own weight holding it shut` });
  return { ok: res.ok && extra.every(e => e.ok), clashes, rows: res.rows, extra, terminal: res.terminal, text: report(res, extra) };
}
