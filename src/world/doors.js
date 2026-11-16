// The doors: every doorway in the building has a leaf, or a pair, hung in an iron frame set in its reveal. They are
// double-acting (they swing either way, as far as the doorway allows) on floor springs, which shut them: a brass plate in
// the floor under each leaf's hinge is the spring's cover. Each leaf is an iron frame with a panel of sheet below and a
// vision panel of wired glass above, or (`glazed`) all glass between glazing bars; a brass push plate on each face.
// Where a doorway is taller than a person needs, a transom carries a fanlight of glass over the leaves.
//
// Here they are swung by the nearness of the person: a pair starts to open, away from whoever is coming, when they come
// within reach of it, faster than a person walks, and the springs bring it back slowly once they are through. A leaf has
// no collider (it gives way to whoever pushes it): what it must not do is foul anything as it swings, and the structural
// check (structure.js) swings every leaf through its whole travel and tests it against everything fixed and every space
// that has to be kept clear but its own doorway's.
import * as THREE from 'three';
import { G, MAT, ibox } from '../kit.js';

export const DOOR_LEAVES = [];          // { hinge, len, h, t, yaw0, dir, angle, door, glazed }
const DOORWAYS = [];                    // { c, ax, n, w, h, swing, max, zone, leaves }
const FJ = 0.09, FD = 0.2;              // the frame's jambs and head: how far into the opening, and how deep
const Y = new THREE.Vector3(0, 1, 0);

// A doorway w wide whose leaves stand h high (to the underside of the head), hung in the plane through c (its middle,
// at the floor), running along `along` ('x' or 'z'). leaves: 1 (hung at its low end, or its high end if hang = 1) or 2.
// swing: the sides it may open to, as signs along the doorway's normal (+z for a doorway along x, +x for one along z),
// as far as max. zone: the name (or names) of the keep-clear spaces its leaves may stand and swing in. fan: if the
// opening goes on above the leaves, the height of its top (a transom at h, and a fanlight over it).
export function doorway({ c, along, w, h, leaves = 2, swing = [-1, 1], max = Math.PI / 2, t = 0.07, hang = -1, zone = null, glazed = false, fan = 0 }) {
  const ax = along === 'x' ? [1, 0, 0] : [0, 0, 1], n = along === 'x' ? [0, 0, 1] : [1, 0, 0];
  const D = { c, ax, n, w, h, swing, max, zone: [].concat(zone || []), leaves: [], side: 0, want: 0 };
  DOORWAYS.push(D);
  const at = (u, y = c[1]) => [c[0] + ax[0] * u, y, c[2] + ax[2] * u];
  const half = w / 2 - FJ, e = t / 2 + 0.005;                 // the clear half-width; the hinge's line, in from the jamb
  const len = leaves === 2 ? half - e - 0.005 : 2 * half - e - 0.01, hl = h - FJ - 0.035;
  const ends = leaves === 2 ? [[-half + e, 1], [half - e, -1]] : [[hang * (half - e), -hang]];
  for (const [u, dir] of ends) {
    // the leaf runs from its hinge toward the other jamb (dir along the doorway's axis); yaw0 turns the leaf's own +x onto that
    const yaw0 = Math.atan2(-ax[2] * dir, ax[0] * dir);
    const L = { hinge: at(u, c[1] + 0.025), len, h: hl, t, yaw0, dir, angle: 0, door: D, glazed };
    DOOR_LEAVES.push(L); D.leaves.push(L);
    const sp = at(u + dir * 0.12, c[1] + 0.006);                 // the floor spring's cover
    along === 'x' ? ibox('brass', 0.36, 0.012, 0.16, sp[0], sp[1], sp[2]) : ibox('brass', 0.16, 0.012, 0.36, sp[0], sp[1], sp[2]);
  }
  // the frame: two jambs and a head of iron, in the opening against its reveal; with a fanlight, the jambs go on up to
  // the top, the head is a transom, and a second head closes the top, with glazing bars between
  const top = fan || h, box = (u, y, du, dy) => { const p = at(u, y); along === 'x' ? ibox('iron', du, dy, FD, p[0], p[1], p[2]) : ibox('iron', FD, dy, du, p[0], p[1], p[2]); };
  for (const s of [-1, 1]) box(s * (w / 2 - FJ / 2), c[1] + top / 2, FJ, top);
  box(0, c[1] + h - FJ / 2, w - 2 * FJ, FJ);
  if (fan) {
    box(0, c[1] + fan - FJ / 2, w - 2 * FJ, FJ);
    const bays = Math.ceil((w - 2 * FJ) / 0.9), y0 = c[1] + h, y1 = c[1] + fan - FJ;
    for (let k = 1; k < bays; k++) box(-half + k * 2 * half / bays, (y0 + y1) / 2, 0.05, y1 - y0);
    if (y1 - y0 > 2.0) box(0, (y0 + y1) / 2, w - 2 * FJ, 0.05);
    const g = at(0, (y0 + y1) / 2);
    along === 'x' ? ibox('glazing', 2 * half, y1 - y0, 0.03, g[0], g[1], g[2]) : ibox('glazing', 0.03, y1 - y0, 2 * half, g[0], g[1], g[2]);
  }
  return D;
}

// a leaf at angle a (radians, + opens toward +n): its oriented box { c, q, half }
export function leafBox(L, a) {
  const yaw = L.yaw0 + leafTurn(L, a), q = new THREE.Quaternion().setFromAxisAngle(Y, yaw);
  const dx = Math.cos(yaw), dz = -Math.sin(yaw);
  return { c: [L.hinge[0] + dx * L.len / 2, L.hinge[1] + L.h / 2, L.hinge[2] + dz * L.len / 2], q, half: [L.len / 2, L.h / 2, L.t / 2] };
}
// which way round a leaf turns to open toward +n by a: a turn by +b about y carries its free end along
// (-sin yaw, 0, -cos yaw), so the sign of that along n is the sign of the turn
function leafTurn(L, a) {
  const D = L.door, s = -Math.sin(L.yaw0) * D.n[0] - Math.cos(L.yaw0) * D.n[2];
  return (s >= 0 ? 1 : -1) * a;
}

// A leaf's geometry, at its own size: from its hinge along +x, from its foot up, centred on its thickness. Groups: the
// iron (0), the glass (1), the brass (2).
function leafGeometry(len, h, t, glazed) {
  const parts = [[], [], []];
  const add = (m, x0, x1, y0, y1, d) => { if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return; const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, d); g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0); parts[m].push(g); };
  const st = glazed ? 0.1 : 0.12, x0 = st, x1 = len - st;
  add(0, 0, st, 0, h, t); add(0, x1, len, 0, h, t);                                   // the stiles
  add(0, x0, x1, h - (glazed ? 0.12 : 0.15), h, t);                                   // the top rail
  if (glazed) {
    add(0, x0, x1, 0, 0.3, t);                                                        // the bottom rail
    const n = Math.max(1, Math.round((h - 0.42) / 1.15));                              // glazing bars, the panes about 1.1 m high
    for (let k = 1; k < n; k++) { const y = 0.3 + k * (h - 0.42) / n; add(0, x0, x1, y - 0.025, y + 0.025, t * 0.7); }
    add(1, x0, x1, 0.3, h - 0.12, 0.012);
  } else {
    const mid = Math.min(1.05, h * 0.3), v0 = mid + 0.25, v1 = Math.min(h - 0.5, v0 + 0.9), vw = Math.min(0.42, (x1 - x0) / 2 - 0.05), vc = len / 2;
    add(0, x0, x1, 0, 0.25, t); add(0, x0, x1, mid, mid + 0.12, t);                   // the bottom and middle rails
    add(0, x0, x1, 0.25, mid, t * 0.45);                                               // the lower panel, sunk
    add(0, x0, x1, mid + 0.12, v0, t * 0.45); add(0, x0, x1, v1, h - 0.15, t * 0.45);  // the upper panel, round the vision panel
    add(0, x0, vc - vw, v0, v1, t * 0.45); add(0, vc + vw, x1, v0, v1, t * 0.45);
    add(0, vc - vw - 0.04, vc - vw, v0, v1, t); add(0, vc + vw, vc + vw + 0.04, v0, v1, t); add(0, vc - vw, vc + vw, v0 - 0.04, v0, t); add(0, vc - vw, vc + vw, v1, v1 + 0.04, t);  // its bead
    add(1, vc - vw, vc + vw, v0, v1, 0.012);
  }
  add(2, len - 0.32, len - 0.18, 0.85, 1.35, t + 0.016);                              // the push plates, either face
  const g = mergeGroups(parts);
  for (const list of parts) for (const p of list) p.dispose();
  return g;
}
function mergeGroups(groups) {
  const pos = [], nor = [], uv = [], idx = [], out = new THREE.BufferGeometry(); let off = 0;
  groups.forEach((list, m) => {
    const start = idx.length;
    for (const g of list) {
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
      for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
      off += p.count;
    }
    if (idx.length > start) out.addGroup(start, idx.length - start, m);
  });
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); out.setIndex(idx);
  return out;
}

// Build the leaves' meshes (after every doorway is declared): one instanced mesh for each size of leaf.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
export function buildDoors() {
  const kinds = new Map();
  for (const L of DOOR_LEAVES) {
    const key = `${L.len.toFixed(3)} ${L.h.toFixed(3)} ${L.t} ${L.glazed}`;
    if (!kinds.has(key)) kinds.set(key, []);
    kinds.get(key).push(L);
  }
  for (const list of kinds.values()) {
    const L0 = list[0], mesh = new THREE.InstancedMesh(leafGeometry(L0.len, L0.h, L0.t, L0.glazed), [MAT.iron, MAT.glazing, MAT.brass], list.length);
    mesh.castShadow = mesh.receiveShadow = true;
    list.forEach((L, i) => { L.mesh = mesh; L.i = i; place(L); });
    mesh.computeBoundingSphere(); mesh.boundingSphere.radius += L0.len;     // (as far as a leaf can swing)
    G.scene.add(mesh);
  }
  return { update, count: DOOR_LEAVES.length, doorways: DOORWAYS.length };
}
function place(L) {
  _q.setFromAxisAngle(Y, L.yaw0 + leafTurn(L, L.angle));
  _m.compose(_p.set(L.hinge[0], L.hinge[1], L.hinge[2]), _q, ONE);
  L.mesh.setMatrixAt(L.i, _m);
  L.mesh.instanceMatrix.needsUpdate = true;
}

// Open what someone is walking up to, away from them, and keep it open that way while they are in it; let the springs
// shut the rest.
const OPEN_RATE = 4.0, CLOSE_RATE = 1.1, REACH = 2.6;
function update(dt, p) {
  for (const D of DOORWAYS) {
    const dx = p.x - D.c[0], dy = p.y - D.c[1], dz = p.z - D.c[2];
    const sn = dx * D.n[0] + dz * D.n[2], sa = dx * D.ax[0] + dz * D.ax[2];
    if (Math.abs(sn) < REACH && Math.abs(sa) < D.w / 2 + 0.8 && dy > -0.5 && dy < D.h + 0.5) {
      if (!D.side) { const away = sn > 0 ? -1 : 1; D.side = D.swing.includes(away) ? away : D.swing[0]; }
      D.want = D.side * D.max;
    } else { D.want = 0; D.side = 0; }
  }
  for (const L of DOOR_LEAVES) {
    const want = L.door.want, a = L.angle;
    if (a === want) continue;
    // (it goes back through shut before it opens the other way)
    const target = a !== 0 && Math.sign(want) !== Math.sign(a) ? 0 : want, step = (target === 0 ? CLOSE_RATE : OPEN_RATE) * dt;
    L.angle = Math.abs(target - a) <= step ? target : a + Math.sign(target - a) * step;
    place(L);
  }
}
export const doorways = () => DOORWAYS;
