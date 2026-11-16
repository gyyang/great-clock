// The hoist, in the right-hand stair tower's well (HOIST): what carries the lamp's stores and the lookout's visitors up
// the tower, so that the stair is left to those who want to climb it.
//
// A cage runs in guides up a hoistway fenced from the floor to the stage under the spire, and stops at three landings:
// the tower's floor (by its street door and its door into the hall), the attic and the lookout. Its rope goes up over
// a head sheave in the sheave room under the spire and back down to a drum on the tower's floor; the counterweight's rope
// goes over a sheave beside it and down to the same drum, wound the other way, so that one pays off as the other winds
// on. The drum is turned through spur gearing by a twin-cylinder steam engine beside it, which has its steam from the
// boiler by a lagged pipe off the main engine's supply, along the hall's right-hand wall and through the front wall.
// It is worked from the cage, or from a landing, by a hand rope that runs up the hoistway past every gate and down to
// the engine's valve: pull it and the engine starts the cage toward the next landing, where a stop on the rope brings
// it to rest, level. With too little steam it will not start, and a cage caught between landings by a falling boiler
// waits on its brake for the pressure to come back. The landing gates and the cage's own gate are shut while it moves.
import * as THREE from 'three';
import { G, MAT, ibox, icyl, beam, rail, cagePanel } from '../kit.js';
import { STAIR_TOWER, HOIST, TOWER, ENGINE, FLOOR } from '../layout.js';
import { assembly, SECTION, MATERIAL } from '../structure/model.js';

const T = STAIR_TOWER, H = HOIST, I0 = T.x0 + T.wall, J0 = T.z0 + T.wall;
const X = (u) => I0 + u, Z = (v) => J0 + v, P = (u, y, v) => [X(u), y, Z(v)];
const QU = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };          // a cylinder's axis along u (world x)
const QV = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };          // ... along v (world z)
const NAMES = ['the street', 'the attic (242 m)', 'the lookout (315 m)'];
const TOP = T.stage;                                                 // the hoistway's fence runs up to the sheave room's floor

// The hoist, for the clearance check (structure.js): the cage and the counterweight as drawn, at(y) to put them where
// they are with the cage's floor at y, the travel, the colliders that belong to them, and its state (st.y: where it is).
export const HOISTGEAR = { cage: null, weight: null, at: null, travel: [H.stops[0], H.stops[H.stops.length - 1]], own: new Set(), st: null };

const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
const boxG = (sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz);
const cylU = (r, len, seg = 24) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
// a spur wheel, its axis along x: teeth round its rim and its web cut away between six arms
function spurGeometry(r, width, teeth, spokes = 6) {
  const s = new THREE.Shape(), m = 2 * Math.PI * r / Math.max(1, teeth), a = 0.45 * m;
  if (!teeth) s.absarc(0, 0, r, 0, 2 * Math.PI, false);
  for (let i = 0; i < teeth; i++) {
    const t0 = i * 2 * Math.PI / teeth, d = 2 * Math.PI / teeth;
    for (const [f, rr] of [[0, r - a], [0.18, r + a * 0.8], [0.5, r + a * 0.8], [0.68, r - a]]) { const t = t0 + f * d; i === 0 && f === 0 ? s.moveTo(rr * Math.cos(t), rr * Math.sin(t)) : s.lineTo(rr * Math.cos(t), rr * Math.sin(t)); }
  }
  if (spokes) {
    const ri = r * 0.28, ro = r * 0.8;
    for (let k = 0; k < spokes; k++) {
      const h = new THREE.Path(), a0 = (k + 0.14) * 2 * Math.PI / spokes, a1 = (k + 0.86) * 2 * Math.PI / spokes;
      h.moveTo(ri * Math.cos(a0), ri * Math.sin(a0)); h.absarc(0, 0, ro, a0, a1, false); h.lineTo(ri * Math.cos(a1), ri * Math.sin(a1)); h.absarc(0, 0, ri, a1, a0, true); s.holes.push(h);
    }
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, curveSegments: 6 });
  return g.translate(0, 0, -width / 2).rotateY(Math.PI / 2);
}

export function buildHoist(engine) {
  const st = { y: H.stops[0], vel: 0, target: null, at: 0, dir: 1, stalled: false }; HOISTGEAR.st = st;
  const listeners = { bell: [] }, emit = (n, a) => listeners[n].forEach(fn => fn(a));
  G.on = '';

  // ---- the hoistway: four corner posts and a guide post each side of the cage and of the counterweight, a lattice
  // fence round it. At every storey two beams across the well from its back wall to its front carry it, with a girt
  // across each end between them; the posts and guides are spliced with slotted joints at every storey, so that each
  // storey's length hangs from the beams at its head. The faces either side are braced with crossed flats storey by
  // storey. (Its gate face is clear of the cage; the landing's rail stops where the fence begins: tower.js.)
  const [h0, h1, h2, h3] = H.hole, c = H.cage, w = H.weight, D = H.drum;
  const cu = [h0 + 0.125, h1 - 0.125], cv = [h2 + 0.125, h3 - 0.125];            // the corner posts' centre lines
  const girtY = [...T.levels.slice(1), TOP].map(y => y - 1.2), postTop = TOP - 0.6;
  const A = assembly('hoistway', 'the hoist\'s posts, guides and fence in the right-hand stair tower, hung storey by storey from beams across the well');
  const st_ = MATERIAL.steel, POST = SECTION.box(0.15, 0.15, 0.01), CORNER = SECTION.box(0.25, 0.25, 0.01), GIRT = SECTION.box(0.15, 0.1, 0.008), CROSS = SECTION.box(0.45, 0.2, 0.016), FLAT = SECTION.box(0.1, 0.03, 0.015);
  const hs = [0, ...girtY], VW = T.z1 - T.z0 - 2 * T.wall;
  const posts = [[cu[0], cv[0]], [cu[1], cv[0]], [cu[0], cv[1]], [cu[1], cv[1]], [cu[0], c.v], [cu[1], c.v], [w.u - w.w / 2 - 0.15, cv[1]], [w.u + w.w / 2 + 0.15, cv[1]]];
  posts.forEach(([u, v], i) => {
    const foot = v < H.pit ? -0.8 : 0, sz = i < 4 ? 0.25 : 0.15;            // (those in the pit stand on its floor)
    ibox('iron', sz, postTop - foot, sz, X(u), (postTop + foot) / 2, Z(v));
    for (let k = 0; k < hs.length - 1; k++) A.member(P(u, hs[k], v), P(u, hs[k + 1], v), i < 4 ? CORNER : POST, st_, 'beam', 'post');
    A.brace(P(u, 0, v), 'x', 'ground').brace(P(u, 0, v), 'z', 'ground');           // (its foot, in a socket in the floor, is held sideways but free to slide)
  });
  // the guides: a rail on a web off each guide post, its face a hand's breadth from the cage's side (or the weight's)
  for (const sg of [-1, 1]) {
    const u0 = sg < 0 ? cu[0] + 0.075 : cu[1] - 0.075, u1 = c.u + sg * (c.w / 2 + 0.15);
    ibox('steel', Math.abs(u1 - u0), postTop + 0.8, 0.06, X((u0 + u1) / 2), (postTop - 0.8) / 2, Z(c.v));
    const wu = w.u + sg * (w.w / 2 + 0.15);
    ibox('steel', 0.06, postTop, cv[1] - 0.075 - (w.v - 0.2), X(wu), postTop / 2, Z((cv[1] - 0.075 + w.v - 0.2) / 2));
  }
  // at every storey the beams across the well (into its back and front walls), the girts between them at each end of
  // the hoistway, and the crossed flats in its two long faces
  const ring = [[cu[0], cv[0]], [cu[1], cv[0]], [cu[1], c.v], [cu[1], cv[1]], [posts[7][0], cv[1]], [posts[6][0], cv[1]], [cu[0], cv[1]], [cu[0], c.v]];
  for (const y of girtY) {
    for (const u of cu) {
      const vs = [0, cv[0], c.v, cv[1], VW];
      for (let i = 0; i < vs.length - 1; i++) A.member(P(u, y, vs[i]), P(u, y, vs[i + 1]), CROSS, st_, 'beam', 'beam across the well');
      A.rest(P(u, y, 0), 'stair tower right', 'fix').rest(P(u, y, VW), 'stair tower right', 'fix');
      beam('iron', P(u, y, -0.25), P(u, y, VW + 0.25), 0.45, 0.2);
    }
    A.member(P(cu[0], y, cv[0]), P(cu[1], y, cv[0]), GIRT, st_, 'beam', 'girt');
    for (const [a, b] of [[cu[0], posts[6][0]], [posts[6][0], posts[7][0]], [posts[7][0], cu[1]]]) A.member(P(a, y, cv[1]), P(b, y, cv[1]), GIRT, st_, 'beam', 'girt');
    // (drawn: the gate face's girt outside the fence, under the landing, clear of the cage)
    beam('iron', P(cu[0], y, h2 - 0.08), P(cu[1], y, h2 - 0.08), 0.15, 0.1);
    beam('iron', P(cu[0], y, cv[1]), P(cu[1], y, cv[1]), 0.15, 0.1);
  }
  for (let k = 0; k < hs.length - 1; k++) for (const u of cu) {
    const o = u < c.u ? -0.2 : 0.2;
    for (const [va, vb] of [[cv[0], cv[1]], [cv[1], cv[0]]]) {
      beam('iron', P(u + o, hs[k], va), P(u + o, hs[k + 1], vb), 0.1, 0.03);
      A.member(P(u, hs[k], va), P(u, hs[k + 1], vb), FLAT, st_, 'tie', 'brace');         // (flats: in tension only)
    }
  }
  // the fence, and its weight with the guides' on the girts (6 kg/m2 of wire lattice; 20 kg/m of each guide rail)
  const fence = (u0, u1, v0, v1, y0, y1) => { if (y1 - y0 > 0.05) cagePanel(X(u0), X(u1), y0, y1, Z(v0), Z(v1)); };
  const [g0, g1] = H.gate;
  fence(h0, g0, h2, h2, 0, TOP); fence(g1, h1, h2, h2, 0, TOP);
  H.stops.forEach((s, i) => fence(g0, g1, h2, h2, s + 2.5, i + 1 < H.stops.length ? H.stops[i + 1] : TOP));
  for (const u of [h0, h1]) { fence(u, u, h2, H.pit, 0, 4); fence(u, u, h2, h3, 4, TOP); }
  fence(h0, h1, H.pit, H.pit, 0, 4); fence(h0, h1, h3, h3, 4, TOP);
  const perStorey = (2 * (h1 - h0 + h3 - h2) * 6 + 4 * 20) * 30;
  for (const y of girtY) for (const [u, v] of ring) A.mass(P(u, y, v), perStorey / ring.length, 'fence, guides and posts');

  // ---- the gates: at each landing a frame in the fence and a folding gate in it, shut but when the cage stands there
  // (it folds back against the frame's left post); the threshold, a steel plate to within 30 mm of the cage's floor
  const gates = H.stops.map((s) => {
    for (const u of [g0 - 0.05, g1 + 0.05]) ibox('iron', 0.1, 2.5, 0.12, X(u), s + 1.25, Z(h2));
    ibox('iron', g1 - g0 + 0.2, 0.12, 0.12, X((g0 + g1) / 2), s + 2.46, Z(h2));
    ibox('plate', g1 - g0, 0.03, c.v - c.d / 2 - 0.03 - (h2 - 0.1), X((g0 + g1) / 2), s - 0.015, Z((h2 - 0.1 + c.v - c.d / 2 - 0.03) / 2));
    const leaf = mesh(new THREE.PlaneGeometry(g1 - g0, 2.3), MAT.lattice, G.scene, X((g0 + g1) / 2), s + 1.18, Z(h2) + 0.02);
    leaf.material = MAT.lattice.clone(); leaf.material.map = MAT.lattice.map.clone(); leaf.material.map.repeat.set((g1 - g0) / 0.5, 2.3 / 0.5); leaf.material.map.needsUpdate = true;
    const col = G.world.createCollider(G.R.ColliderDesc.cuboid((g1 - g0) / 2, 1.15, 0.03).setTranslation(X((g0 + g1) / 2), s + 1.18, Z(h2)));
    return { s, leaf, col, open: 1 };
  });

  // ---- the pit under the lowest landing, cast into the tower's footing: concrete, with two spring buffers for the cage,
  // and two for the weight on the floor
  HOISTGEAR.pit = [X(h0 - 0.15), X(h1 + 0.15), Z(h2 - 0.15), Z(H.pit + 0.15), 1.0];
  {
    const pu = (h0 + h1) / 2, pv = (h2 + H.pit) / 2, du = h1 - h0 + 0.3, dv = H.pit - h2 + 0.3;
    ibox('stone', du, 0.2, dv, X(pu), -0.9, Z(pv));
    for (const [sx, sz, x, z] of [[0.15, dv, h0 - 0.075, pv], [0.15, dv, h1 + 0.075, pv], [du, 0.15, pu, h2 - 0.075], [du, 0.15, pu, H.pit + 0.075]]) ibox('stone', sx, 0.8, sz, X(x), -0.4, Z(z));
    for (const du2 of [-0.7, 0.7]) { icyl('iron', 0.14, 0.35, X(c.u + du2), -0.62, Z(c.v)); icyl('steel', 0.1, 0.12, X(c.u + du2), -0.39, Z(c.v)); }
    for (const dv2 of [-0.18, 0.18]) icyl('iron', 0.12, 0.45, X(w.u), 0.225, Z(w.v + dv2));
  }

  // ---- the cage: a steel floor, lattice sides and back, a roof, a folding gate at its front; a crosshead over it with
  // the rope's socket, and guide shoes at its four corners. A kinematic body: you ride it.
  const cage = new THREE.Group(); G.scene.add(cage); G.machines.push(cage);
  const cageBody = G.world.createRigidBody(G.R.RigidBodyDesc.kinematicPositionBased().setTranslation(X(c.u), st.y, Z(c.v)));
  const rider = { vel: 0, velAt(p, out) { return out.set(0, this.vel, 0); }, angVelY() { return 0; } };
  const own = (desc) => { const col = G.world.createCollider(desc, cageBody); G.parts.set(col.handle, rider); HOISTGEAR.own.add(col.handle); return col; };
  const hw = c.w / 2, hd = c.d / 2;
  mesh(boxG(c.w, 0.25, c.d), MAT.plate, cage, 0, -0.125, 0); own(G.R.ColliderDesc.cuboid(hw, 0.125, hd).setTranslation(0, -0.125, 0));
  mesh(boxG(c.w, 0.08, c.d), MAT.iron, cage, 0, c.h + 0.04, 0); own(G.R.ColliderDesc.cuboid(hw, 0.04, hd).setTranslation(0, c.h + 0.04, 0));
  const lat = (wid, hgt) => { const m = MAT.lattice.clone(); m.map = MAT.lattice.map.clone(); m.map.repeat.set(wid / 0.5, hgt / 0.5); m.map.needsUpdate = true; return m; };
  for (const sg of [-1, 1]) { const p = mesh(new THREE.PlaneGeometry(c.d, c.h), lat(c.d, c.h), cage, sg * (hw - 0.03), c.h / 2, 0); p.rotation.y = Math.PI / 2; own(G.R.ColliderDesc.cuboid(0.03, c.h / 2, hd).setTranslation(sg * (hw - 0.03), c.h / 2, 0)); }
  mesh(new THREE.PlaneGeometry(c.w, c.h), lat(c.w, c.h), cage, 0, c.h / 2, hd - 0.03); own(G.R.ColliderDesc.cuboid(hw, c.h / 2, 0.03).setTranslation(0, c.h / 2, hd - 0.03));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(boxG(0.08, c.h, 0.08), MAT.iron, cage, sx * (hw - 0.04), c.h / 2, sz * (hd - 0.04));
  mesh(boxG(c.w, 0.08, 0.08), MAT.iron, cage, 0, 1.05, hd - 0.04);
  const cageGate = mesh(new THREE.PlaneGeometry(c.w - 0.2, c.h - 0.1), lat(c.w - 0.2, c.h - 0.1), cage, 0, c.h / 2, -hd + 0.04);
  const cageGateCol = own(G.R.ColliderDesc.cuboid(hw - 0.1, c.h / 2 - 0.05, 0.03).setTranslation(0, c.h / 2, -hd + 0.04));
  mesh(boxG(c.w + 0.3, 0.3, 0.3), MAT.iron, cage, 0, c.h + 0.3, 0);
  mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.45, 12), MAT.steel, cage, 0, c.h + 0.66, 0);
  for (const sx of [-1, 1]) for (const y of [-0.1, c.h + 0.3]) mesh(boxG(0.11, 0.3, 0.2), MAT.steel, cage, sx * (hw + 0.065), y, 0);
  // a lamp in the roof, and the bell the hand rope rings
  mesh(new THREE.SphereGeometry(0.1, 12, 8), MAT.bulb, cage, 0, c.h - 0.12, 0.3);
  mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.brass, cage, hw - 0.2, c.h - 0.1, hd - 0.2).rotation.x = Math.PI;
  HOISTGEAR.cage = cage;

  // ---- the counterweight: cast-iron slabs in a frame, with shoes on its guides
  const weight = new THREE.Group(); G.scene.add(weight); G.machines.push(weight);
  const weightBody = G.world.createRigidBody(G.R.RigidBodyDesc.kinematicPositionBased().setTranslation(X(w.u), H.weight.lift - st.y, Z(w.v)));
  for (let k = 0; k < 6; k++) mesh(boxG(w.w - 0.1, w.h / 6 - 0.04, w.d), MAT.iron, weight, 0, (k + 0.5) * w.h / 6, 0);
  for (const sx of [-1, 1]) { mesh(boxG(0.08, w.h + 0.2, w.d + 0.1), MAT.steel, weight, sx * (w.w / 2 - 0.04), w.h / 2, 0); mesh(boxG(0.06, 0.3, 0.2), MAT.steel, weight, sx * (w.w / 2 + 0.03), w.h - 0.2, 0); mesh(boxG(0.06, 0.3, 0.2), MAT.steel, weight, sx * (w.w / 2 + 0.03), 0.2, 0); }
  mesh(boxG(w.w + 0.06, 0.2, w.d + 0.1), MAT.steel, weight, 0, w.h + 0.1, 0);
  { const col = G.world.createCollider(G.R.ColliderDesc.cuboid(w.w / 2, w.h / 2, w.d / 2).setTranslation(0, w.h / 2, 0), weightBody); HOISTGEAR.own.add(col.handle); G.parts.set(col.handle, { velAt: (p, out) => out.set(0, -rider.vel, 0), angVelY: () => 0 }); }
  HOISTGEAR.weight = weight;
  const _p = new THREE.Vector3();
  HOISTGEAR.at = (y) => { cage.position.set(X(c.u), y, Z(c.v)); weight.position.set(X(w.u), H.weight.lift - y, Z(w.v)); cage.updateWorldMatrix(true, true); weight.updateWorldMatrix(true, true); };

  // ---- the head sheaves, in the sheave room: each on an axle in bearings on two beams across the well, which bear on
  // its front and back walls at the stage's floor
  const S = H.sheave, beamU = [3.75, 6.2], by = TOP + 1.1, sv = [c.v + S.r, D.v + D.r + S.r];
  const SB = assembly('hoist sheaves', 'the two beams in the right-hand tower\'s sheave room that carry the hoist\'s head sheaves');
  for (const u of beamU) {
    beam('iron', P(u, by, -0.3), P(u, by, T.z1 - T.z0 - 2 * T.wall + 0.3), 0.8, 0.35);
    const V = T.z1 - T.z0 - 2 * T.wall, nodes = [0, ...sv, V];
    for (let k = 0; k < nodes.length - 1; k++) SB.member(P(u, by, nodes[k]), P(u, by, nodes[k + 1]), SECTION.box(0.8, 0.35, 0.02), st_, 'beam', 'sheave beam');
    SB.rest(P(u, by, 0), 'stair tower right', 'fix').rest(P(u, by, V), 'stair tower right', 'fix');
  }
  // what hangs on them: each sheave carries both falls of its rope, the cage loaded (1.8 t and ten people) or the weight,
  // and the ropes (330 m of 28 mm wire each side, 2.6 kg/m), half again for a stop on the brake; and the sheaves, 1.5 t
  const rope = 330 * 2.6, cageT = 1800 + 800 + rope, weightT = 2200 + rope;
  sv.forEach((v, i) => { for (const u of beamU) SB.mass(P(u, by, v), (1.5 * 2 * (i ? weightT : cageT) + 1500) / 2, i ? 'the weight\'s sheave and its ropes' : 'the cage\'s sheave and its ropes'); });
  G.tag = 'bearing';
  for (const v of sv) for (const u of beamU) { ibox('iron', 0.35, S.y - by - 0.4, 0.6, X(u), (by + 0.4 + S.y) / 2 - 0.1, Z(v)); ibox('iron', 0.4, 0.4, 0.5, X(u), S.y, Z(v)); }
  G.tag = '';
  const sheaves = sv.map((v, i) => {
    const g = new THREE.Group(); g.position.set(X(S.u[i]), S.y, Z(v)); G.scene.add(g); G.machines.push(g);
    mesh(spurGeometry(S.r + 0.08, 0.22, 0, 6), MAT.iron, g);
    const ax = mesh(cylU(0.1, beamU[1] - beamU[0] + 0.4), MAT.steel, g, (beamU[0] + beamU[1]) / 2 - S.u[i], 0, 0); ax.userData.shaft = true;
    mesh(cylU(0.3, 0.4), MAT.iron, g);
    return g;
  });

  // ---- the ropes: the falls that stand still (from each sheave down to the drum) drawn once; the cage's and the
  // weight's own falls, which lengthen and shorten, drawn each frame
  const ropeMat = MAT.tendon;
  { const rc = (D.u0 + D.mid) / 2, rw = (D.mid + D.u1) / 2; beam('tendon', P(rc, D.y, D.v - D.r), P(S.u[0], S.y, D.v - D.r), 0.028, 0.028); beam('tendon', P(rw, D.y, D.v + D.r), P(S.u[1], S.y, D.v + D.r), 0.028, 0.028); }
  const fall = (u, v) => { const m = mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 6), ropeMat, G.scene, X(u), 0, Z(v)); return m; };
  const cageFall = fall(c.u, c.v), weightFall = fall(w.u, w.v);
  // the hand rope, from a pulley in the pit up through the cage's corner to one under the sheave beams (and from the
  // pit, in a pipe under the floor, to the engine's valve)
  { const hu = c.u - hw + 0.18, hv = c.v - hd + 0.18; mesh(new THREE.CylinderGeometry(0.012, 0.012, TOP + 1.2, 6), ropeMat, G.scene, X(hu), (TOP + 1.2) / 2 - 0.6, Z(hv)); }

  // ---- the drum and the engine, on the tower's floor inside a railing
  const drum = new THREE.Group(); drum.position.set(X(0), D.y, Z(D.v)); G.scene.add(drum); G.machines.push(drum);
  mesh(cylU(D.r, D.u1 - D.u0, 40), MAT.iron, drum, (D.u0 + D.u1) / 2, 0, 0);
  for (const u of [D.u0, D.mid, D.u1]) mesh(spurGeometry(D.r + 0.18, 0.06, 0, u === D.mid ? 0 : 6), MAT.iron, drum, u, 0, 0);
  { const shaft = mesh(cylU(0.14, 4.65), MAT.steel, drum, 4.775, 0, 0); shaft.userData.shaft = true; }
  const R2 = 1.4, rp = 0.4, gearU = 6.8, kv = D.v + R2 + rp;
  mesh(spurGeometry(R2, 0.25, 70, 6), MAT.iron, drum, gearU, 0, 0);
  // a band of rope on each half: the turns wound on, cage's and weight's
  mesh(cylU(D.r + 0.02, (D.mid - D.u0) * 0.6, 40), ropeMat, drum, D.u0 + 0.05 + (D.mid - D.u0) * 0.3, 0, 0);
  mesh(cylU(D.r + 0.02, (D.u1 - D.mid) * 0.4, 40), ropeMat, drum, D.mid + 0.05 + (D.u1 - D.mid) * 0.2, 0, 0);
  G.tag = 'bearing';
  for (const u of [2.75, 6.35]) { ibox('iron', 0.3, D.y - 0.15, 0.7, X(u), (D.y - 0.15) / 2, Z(D.v)); ibox('iron', 0.34, 0.4, 0.6, X(u), D.y, Z(D.v)); }
  G.tag = '';
  // the engine: two cylinders side by side, their pistons' crossheads in guides, connecting rods to a crankshaft with
  // its cranks at right angles, and on its end the pinion that turns the drum's wheel. Bore 300 mm, stroke 600 mm.
  const cr = 0.3, L = 1.6, cranks = [7.8, 9.1], ky = D.y, cyl0 = 11.6, cyl1 = 12.8;
  const crank = new THREE.Group(); crank.position.set(X(0), ky, Z(kv)); G.scene.add(crank); G.machines.push(crank);
  { const s = mesh(cylU(0.12, 3.4), MAT.steel, crank, 8.25, 0, 0); s.userData.shaft = true; }
  mesh(spurGeometry(rp, 0.3, 20, 0), MAT.steel, crank, gearU, 0, 0);
  cranks.forEach((u, i) => {
    const ph = i * Math.PI / 2, g = new THREE.Group(); g.position.x = u; g.rotation.x = ph; crank.add(g);
    for (const du of [-0.17, 0.17]) mesh(boxG(0.08, 0.3, cr + 0.3), MAT.steel, g, du, 0, cr / 2);
    mesh(cylU(0.07, 0.42), MAT.steel, g, 0, 0, cr);
  });
  const rods = cranks.map(u => {
    const rod = new THREE.Group(); rod.position.x = X(u); G.scene.add(rod); G.machines.push(rod);
    mesh(boxG(0.1, 0.14, L - 0.2), MAT.steel, rod, 0, 0, L / 2);
    mesh(boxG(0.12, 0.26, 0.2), MAT.steel, rod, 0, 0, 0.05);
    const xh = new THREE.Group(); xh.position.x = X(u); G.scene.add(xh); G.machines.push(xh);
    mesh(boxG(0.28, 0.3, 0.35), MAT.steel, xh);
    const pr = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.15, 10).rotateX(Math.PI / 2), MAT.steel, xh, 0, 0, 0.75); pr.userData.shaft = true;
    return { rod, xh };
  });
  G.tag = 'bearing';
  for (const u of [7.15, 8.45, 9.75]) { ibox('iron', 0.25, ky - 1.0 - 0.13, 0.6, X(u), (1.0 + ky - 0.13) / 2, Z(kv)); ibox('iron', 0.3, 0.32, 0.5, X(u), ky, Z(kv)); }
  for (const u of cranks) { icyl('iron', 0.3, cyl1 - cyl0, X(u), ky, Z((cyl0 + cyl1) / 2), QV); ibox('iron', 0.4, 0.3, 0.9, X(u), ky + 0.45, Z((cyl0 + cyl1) / 2)); }
  G.tag = '';
  for (const u of cranks) {
    for (const dy of [-0.26, 0.26]) for (const du of [-0.17, 0.17]) ibox('steel', 0.06, 0.08, 1.2, X(u + du), ky + dy, Z(10.9));
    ibox('iron', 0.5, ky - 0.3 - 1.0, 0.3, X(u), (1.0 + ky - 0.3) / 2, Z(10.9));
    for (const v of [cyl0 + 0.2, cyl1 - 0.2]) ibox('iron', 0.3, ky - 0.3 - 1.0, 0.25, X(u), (1.0 + ky - 0.3) / 2, Z(v));
  }
  ibox('stone', 2.9, 1.0, 4.1, X(8.45), 0.5, Z(10.95));                    // the engine's bed, brick capped with stone
  ibox('stone', 0.9, 0.5, 1.3, X(2.75), 0.25, Z(D.v)); ibox('stone', 0.9, 0.5, 1.3, X(6.35), 0.25, Z(D.v));
  { const col = G.world.createCollider(G.R.ColliderDesc.cuboid(1.45, 0.5, 2.05).setTranslation(X(8.45), 0.5, Z(10.95))); void col; }
  // the brake: a post brake on the rim of the drum's outer flange, a shoe either side, held on by a weight and lifted
  // off by a steam cylinder whenever the engine has steam to run
  for (const sg of [-1, 1]) { ibox('iron', 0.2, D.y + 0.4, 0.2, X(D.u0), (D.y + 0.4) / 2, Z(D.v + sg * (D.r + 0.36))); ibox('plate', 0.14, 0.7, 0.1, X(D.u0), D.y, Z(D.v + sg * (D.r + 0.27))); }

  // ---- its steam: from the corner of the main engine's supply along the hall's right-hand wall to the front wall,
  // through it into the tower, and down to the valve chests; lagged. (Its exhaust goes back beside it to the main's.)
  {
    const zc = FLOOR.h3.z - ENGINE.cylS, xw = ENGINE.pipeWallX, y = ENGINE.pipeY, uw = xw - I0, r = 0.2;
    const run = (a, b) => { beam('ash', a, b, 2 * r, 2 * r); };
    run([xw, y, zc + 0.4], P(uw, y, cyl1 - 0.6));
    run(P(uw, y - 0.2, cyl1 - 0.6), P(uw, ky + 0.9, cyl1 - 0.6));
    run(P(uw, ky + 0.9, cyl1 - 0.6), P(cranks[1], ky + 0.9, cyl1 - 0.6));
    for (const u of cranks) run(P(u, ky + 0.9, cyl1 - 0.6), P(u, ky + 0.6, cyl1 - 0.6));
    // the exhaust, from the far side of the chests down into a pipe under the floor to the main engine's exhaust trench
    beam('iron', P(cranks[1] + 0.3, ky + 0.45, cyl1 - 0.6), P(cranks[1] + 0.7, ky + 0.45, cyl1 - 0.6), 0.24, 0.24);
    beam('iron', P(cranks[1] + 0.7, ky + 0.45, cyl1 - 0.6), P(cranks[1] + 0.7, 0, cyl1 - 0.6), 0.24, 0.24);
    for (let z = zc + 4; z < TOWER.hz - 1; z += 6) ibox('iron', TOWER.hx - xw, 0.1, 0.1, (TOWER.hx + xw) / 2, y - 0.3, z);
    icyl('bronze', 0.32, 0.3, X(uw), y, Z(cyl1 - 0.6) - 1.2, QV);                                                   // the stop valve
  }

  // ---- the railing round the machinery
  rail(P(2.2, 0, H.pit), P(2.2, 0, 14.4)); rail(P(2.2, 0, 14.4), P(10.4, 0, 14.4)); rail(P(10.4, 0, 14.4), P(10.4, 0, H.pit)); rail(P(10.4, 0, H.pit), P(h1, 0, H.pit)); rail(P(h0, 0, H.pit), P(2.2, 0, H.pit));

  // ---- the drum, the engine and the weight's buffers are on the floor, which is the ground's
  {
    const E = assembly('hoist engine', 'the hoist\'s drum and winding engine, on the right-hand stair tower\'s floor');
    const a = P(2.75, 0, D.v), b = P(6.35, 0, D.v), e = P(8.45, 0, 10.95);
    E.member(a, b, SECTION.box(0.6, 0.6, 0.03), st_, 'beam', 'drum bed').member(b, e, SECTION.box(0.6, 0.6, 0.03), st_, 'beam', 'engine bed');
    E.mass(a, 4e3, 'drum').mass(b, 4e3, 'drum and wheel').mass(e, 9e3, 'engine');
    for (const p of [a, b, e]) E.rest(p, 'ground', 'fix');
  }

  // ---- what it does
  const atStop = (k) => st.target === null && Math.abs(st.y - H.stops[k]) < 0.01;
  const steamOk = () => engine.sim.p >= H.steam;
  const inCage = (p) => Math.abs(p.x - X(c.u)) < hw && Math.abs(p.z - Z(c.v)) < hd && p.y - st.y > 0.3 && p.y - st.y < 2.2;
  const atGate = (p) => H.stops.findIndex(s => Math.abs(p.y - (s + 0.95)) < 0.8 && p.x > X(g0 - 0.3) && p.x < X(g1 + 0.3) && p.z > Z(h2 - 1.9) && p.z < Z(h2));
  const next = () => { const k = st.at; if (k === 0) return 1; if (k === H.stops.length - 1) return k - 1; return st.dir > 0 ? k + 1 : k - 1; };
  function go(k) {
    if (!steamOk()) return `The hoist's engine has too little steam to start (${engine.sim.p.toFixed(1)} bar; it wants ${H.steam})`;
    st.target = k; st.dir = Math.sign(H.stops[k] - st.y) || st.dir; st.at = -1; emit('bell', 1);
    return null;
  }
  function update(dt) {
    if (st.target !== null) {
      const goal = H.stops[st.target], d = goal - st.y, ok = steamOk();
      st.stalled = !ok;
      const want = ok ? Math.sign(d) * Math.min(H.speed, Math.sqrt(2 * H.accel * Math.abs(d))) : 0;
      const dv = want - st.vel, lim = H.accel * 1.6 * dt;
      st.vel += Math.max(-lim, Math.min(lim, dv));
      st.y += st.vel * dt;
      if ((Math.abs(d) < 0.004 || Math.sign(goal - st.y) !== Math.sign(d)) && ok) { st.y = goal; st.vel = 0; st.at = st.target; st.target = null; emit('bell', 2); }
    }
    engine.sim.tap = Math.abs(st.vel) > 0.01 ? 0.12 * Math.abs(st.vel) / H.speed + 0.03 : 0;
    rider.vel = st.vel;
    const moving = st.target !== null;
    gates.forEach((g, k) => { const want = !moving && st.at === k; if (g.col.isEnabled() === want) g.col.setEnabled(!want); });
    if (cageGateCol.isEnabled() !== moving) cageGateCol.setEnabled(moving);
    cageBody.setNextKinematicTranslation({ x: X(c.u), y: st.y, z: Z(c.v) });
    weightBody.setNextKinematicTranslation({ x: X(w.u), y: H.weight.lift - st.y, z: Z(w.v) });
  }
  function frame(dt) {
    const y = st.y, wy = H.weight.lift - y, moving = st.target !== null;
    cage.position.set(X(c.u), y, Z(c.v)); weight.position.set(X(w.u), wy, Z(w.v));
    const ct = y + c.h + 0.88, wt = wy + w.h + 0.2;
    cageFall.position.y = (ct + S.y) / 2; cageFall.scale.y = S.y - ct;
    weightFall.position.y = (wt + S.y) / 2; weightFall.scale.y = S.y - wt;
    const a = -y / D.r;                                                         // the drum turns as the rope winds on
    drum.rotation.x = a; crank.rotation.x = -a * R2 / rp;
    for (const g of sheaves) g.rotation.x = -y / S.r;
    cranks.forEach((u, i) => {
      const th = crank.rotation.x + i * Math.PI / 2, py = -cr * Math.sin(th), pz = cr * Math.cos(th);
      const xz = pz + Math.sqrt(L * L - py * py);
      rods[i].rod.position.set(X(u), ky + py, Z(kv) + pz); rods[i].rod.rotation.x = Math.atan2(py, xz - pz);
      rods[i].xh.position.set(X(u), ky, Z(kv) + xz);
    });
    // the gates: folding back while it stands, shut while it moves
    for (let k = 0; k < gates.length; k++) {
      const g = gates[k], want = !moving && st.at === k ? 0.08 : 1;
      g.open = want === 1 ? Math.min(1, g.open + dt * 1.5) : Math.max(0.08, g.open - dt * 1.5);
      if (!dt) g.open = want;
      g.leaf.scale.x = g.open; g.leaf.position.x = X(g0) + (g1 - g0) * g.open / 2;
    }
    const cg = moving ? 1 : 0.08;
    cageGate.scale.x = cg; cageGate.position.x = -hw + 0.1 + (c.w - 0.2) * cg / 2;
  }
  frame(0);

  return {
    update, frame, state: st, gear: HOISTGEAR,
    on(name, fn) { listeners[name].push(fn); },
    use(p) {
      if (inCage(p)) {
        if (st.target !== null) return st.stalled ? `The cage waits on its brake for steam (${engine.sim.p.toFixed(1)} bar)` : 'The cage is moving';
        const k = next(), msg = go(k);
        return msg || `Hand rope: ${H.stops[k] > st.y ? 'up' : 'down'} to ${NAMES[k]}`;
      }
      const k = atGate(p);
      if (k < 0) return null;
      if (atStop(k)) return 'The cage is here: step in';
      if (st.target !== null) return 'The cage is on its way';
      return go(k) || `Hand rope: the cage is coming ${H.stops[k] > st.y ? 'up' : 'down'} from ${NAMES[st.at] || 'the hoistway'}`;
    },
    hint(p) {
      if (inCage(p)) return st.target !== null ? '' : `E — pull the hand rope: ${H.stops[next()] > st.y ? 'up' : 'down'} to ${NAMES[next()]}`;
      const k = atGate(p);
      if (k < 0 || atStop(k) || st.target !== null) return '';
      return 'E — pull the hand rope: call the hoist\'s cage';
    },
  };
}
