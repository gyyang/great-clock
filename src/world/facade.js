// The outside of the tower: what the town sees.
//
// The steel frame is inside the wall (structure.js). Out here it is dressed the way a tall building's frame is: every
// column line is a stone pier, every girder a slight string course, and the bracing is hidden in the brick. The stone is
// a facing on the frame, built a storey at a time on shelves off the girders, not a load-bearing wall.
//
// The clock is the point of the building, so the front is composed round it: two stair towers stand forward of the
// front wall at its ends, and the dial fills the deep bay between them, its stone panel running from one tower's face
// to the other's. The towers are real: their stairs go up from the street to the attic and on to a lookout under each
// spire, and every window lights a stair or a landing. Under the dial is the main portal, a deep stone porch with iron
// gates. The back is plainer: piers and brick panels between stone bands, a round escape-stair turret at each corner,
// and the service door to the coal yard; the stack stands well behind, in the town.
//
// The manner is that of the works inside: a Victorian engine house grown to the size of a mountain, in the colours of
// the movement itself: the green of its enamel on the roofs, gilding on the ironwork, red brick and grey stone below.
// Above the cornice is the attic, a storey of tall windows on the wall line with a stone pier on every column line;
// over it a steep copper mansard with a dormer to every bay (its clerestory), and on the mansard's flat the lamp room.
import * as THREE from 'three';
import { G, MAT, ibox, icyl, ipart, beam, tube, cbox, rail, lamp } from '../kit.js';
import { TOWER, DIAL, ARCH, STAIR_TOWER, ESCAPE, STACK, FLUE, SERVICE, LAMP, PORTAL, GREAT_WINDOW, CRADLE, HOIST } from '../layout.js';

const TAU = Math.PI * 2;
const QY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const rotY = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
// the way the vanes point: into the wind, which blows mostly off the river, across the front from the right (the smoke
// drifts the other way: engine.js)
const WIND_FROM = -0.8;
export const PLINTH = 14;
// the stone drawn as meshes rather than parts (so not in DRAWN), for structure.js to weigh: { c: centre, kg }. (The clock
// panel and the moulded rim round the dial it weighs from their dimensions.)
export const MESH_STONE = [];
const torusKg = (R, r) => 2 * Math.PI * R * Math.PI * r * r * 2650;
const CORNICE = ARCH.cornice, TOP = CORNICE - 6;
const DOOR_H = 3.4;

// ---- walls with openings
// A rectangle of wall [u0, u1] x [y0, y1], filling n0..n1 through its thickness, less the openings in it ({u0, u1, y0,
// y1, door}), cut into as few boxes as the openings allow. `along`: 'x' if u is x (n is then z), 'z' if u is z.
// Glass does not let anyone through, so only doors are cut out of what collides.
function pieces(u0, u1, y0, y1, holes) {
  const ys = [...new Set([y0, y1, ...holes.flatMap(h => [h.y0, h.y1])])].filter(y => y >= y0 - 1e-6 && y <= y1 + 1e-6).sort((a, b) => a - b), out = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const ya = ys[i], yb = ys[i + 1], cut = holes.filter(h => h.y0 < yb - 1e-6 && h.y1 > ya + 1e-6 && h.u1 > u0 && h.u0 < u1).sort((a, b) => a.u0 - b.u0);
    let c = u0;
    for (const h of cut) { if (h.u0 > c + 1e-6) out.push([c, h.u0, ya, yb]); c = Math.max(c, h.u1); }
    if (u1 > c + 1e-6) out.push([c, u1, ya, yb]);
  }
  // (one piece where a strip of the same width runs on up through several bands)
  out.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  const merged = [];
  for (const p of out) { const m = merged[merged.length - 1]; if (m && Math.abs(m[0] - p[0]) < 1e-6 && Math.abs(m[1] - p[1]) < 1e-6 && Math.abs(m[3] - p[2]) < 1e-6) m[3] = p[3]; else merged.push([...p]); }
  return merged;
}
function slab(along, u0, u1, y0, y1, n0, n1, holes, mat = 'brick', collide = true) {
  const put = (a, b, ya, yb, fn) => along === 'x' ? fn(b - a, yb - ya, n1 - n0, (a + b) / 2, (ya + yb) / 2, (n0 + n1) / 2) : fn(n1 - n0, yb - ya, b - a, (n0 + n1) / 2, (ya + yb) / 2, (a + b) / 2);
  for (const [a, b, ya, yb] of pieces(u0, u1, y0, y1, holes)) put(a, b, ya, yb, (sx, sy, sz, x, y, z) => ibox(mat, sx, sy, sz, x, y, z));
  if (collide) for (const [a, b, ya, yb] of pieces(u0, u1, y0, y1, holes.filter(h => h.door))) put(a, b, ya, yb, (sx, sy, sz, x, y, z) => cbox(sx, sy, sz, x, y, z));
}
// A window in such a wall: glass in the opening, a pointed stone head filling its top, a stone sill.
function window_(along, u0, u1, y0, y1, n0, n1, out, head = 2.6) {
  const uc = (u0 + u1) / 2, w = u1 - u0, nc = (n0 + n1) / 2, t = Math.abs(n1 - n0);
  const at = (u, n) => along === 'x' ? [u, n] : [n, u], q = along === 'x' ? undefined : QY;
  const [gx, gz] = at(uc, nc); ibox('glazing', along === 'x' ? w : 0.05, y1 - y0, along === 'x' ? 0.05 : w, gx, (y0 + y1) / 2, gz);
  const [hx, hz] = at(uc, nc); ipart('arch', 'facade', w + 0.02, head, t + 0.02, hx, y1 - head / 2, hz, q);
  const [sx, sz] = at(uc, nc + out * 0.15); ibox('facade', along === 'x' ? w + 0.6 : t + 0.3, 0.35, along === 'x' ? t + 0.3 : w + 0.6, sx, y0 - 0.17, sz);
  const [mx, mz] = at(uc, nc); if (w > 2.9) ibox('facade', along === 'x' ? 0.3 : t * 0.6, y1 - y0 - head + 0.6, along === 'x' ? t * 0.6 : 0.3, mx, (y0 + y1 - head) / 2 + 0.3, mz);      // a mullion in the wider ones
}

// An open arch in such a wall (a stage's arcade): a pointed stone head, a stone sill at parapet height, and in it an
// iron grille, flat bars at a hand's breadth and two rails, set in the middle of the wall. (The wall's collider is
// whole: the grille is what it stands for.)
function arch_(along, u0, u1, y0, y1, n0, n1, out) {
  const uc = (u0 + u1) / 2, w = u1 - u0, nc = (n0 + n1) / 2, t = Math.abs(n1 - n0), head = 0.8 * w;
  const at = (u, n) => along === 'x' ? [u, n] : [n, u], q = along === 'x' ? undefined : QY;
  const [hx, hz] = at(uc, nc); ipart('arch', 'facade', w + 0.02, head, t + 0.02, hx, y1 - head / 2, hz, q);
  const [sx, sz] = at(uc, nc + out * 0.15); ibox('facade', along === 'x' ? w + 0.6 : t + 0.3, 0.35, along === 'x' ? t + 0.3 : w + 0.6, sx, y0 - 0.17, sz);
  const top = y1 - head * 0.45;
  for (let u = u0 + 0.22; u < u1 - 0.1; u += 0.22) { const [x, z] = at(u, nc); ibox('iron', 0.025, top - y0, 0.025, x, (y0 + top) / 2, z); }
  for (const y of [y0 + 1.0, (y0 + top) / 2 + 0.5, top - 0.05]) { const [x, z] = at(uc, nc); ibox('iron', along === 'x' ? w : 0.06, 0.06, along === 'x' ? 0.06 : w, x, y, z); }
}
// A louvred opening: a stone head and sill, and iron blades across it sloping down and out, which let the air through
// and keep the rain out.
const _louvreQ = new THREE.Quaternion();
function louvre_(along, u0, u1, y0, y1, n0, n1, out) {
  const uc = (u0 + u1) / 2, w = u1 - u0, nc = (n0 + n1) / 2, t = Math.abs(n1 - n0), head = 1.4;
  const at = (u, n) => along === 'x' ? [u, n] : [n, u], q = along === 'x' ? undefined : QY;
  const [hx, hz] = at(uc, nc); ipart('arch', 'facade', w + 0.02, head, t + 0.02, hx, y1 - head / 2, hz, q);
  const [sx, sz] = at(uc, nc + out * 0.15); ibox('facade', along === 'x' ? w + 0.6 : t + 0.3, 0.35, along === 'x' ? t + 0.3 : w + 0.6, sx, y0 - 0.17, sz);
  along === 'x' ? _louvreQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), out * 0.7) : _louvreQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -out * 0.7);
  for (let y = y0 + 0.3; y < y1 - head * 0.5; y += 0.32) { const [x, z] = at(uc, nc + out * 0.2); ibox('verdigris', along === 'x' ? w - 0.1 : 0.42, 0.04, along === 'x' ? 0.42 : w - 0.1, x, y, z, _louvreQ); }
}

// The four faces of the main block, each between its limits [lo, hi]; free: whether that end is an open corner; piers:
// where a pier stands on it (on every column line, and one at a free corner).
const storeys = [30, 60, 90, 120, 150, 180, 219], panel = { x: STAIR_TOWER.x0, y0: 90, y1: 210 };
function mainFaces() {
  const { hx, hz, wall } = TOWER, ox = hx + wall, oz = hz + wall, xs = [], zs = [];
  for (let v = -60; v <= 60; v += 10) xs.push(v);
  for (let v = -30; v <= 30; v += 10) zs.push(v);
  const escLo = ESCAPE.x - ESCAPE.r - 1.0;
  const faces = [
    { nz: 1, off: oz, lines: xs.filter(x => Math.abs(x) < panel.x), lo: -panel.x, hi: panel.x, free: [false, false], front: true },
    { nz: -1, off: oz, lines: xs.filter(x => Math.abs(x) < escLo - 1.4), lo: -escLo, hi: escLo, free: [false, false], back: true },
    { nx: -1, off: ox, lines: zs, lo: -oz, hi: oz, free: [true, false] },
    { nx: 1, off: ox, lines: zs, lo: -oz, hi: oz, free: [true, false] },
  ];
  for (const f of faces) { f.piers = [...f.lines]; if (f.free[0]) f.piers.unshift(f.lo + 1.4); }
  return faces;
}
// Every bay of every storey that has tracery: { f, uc, cw (its width), y0, y1 (where its stone ends), top (the roof
// space's storey, open and louvred) }
export function traceryBays() {
  const out = [];
  for (const f of mainFaces()) {
    const piers = f.piers, stops = [f.lo, ...piers, f.hi], width = (u) => (piers.includes(u) ? 2.8 : 0);
    const tiers = [PLINTH + 1.2, ...storeys, TOP - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i] + width(stops[i]) / 2 + (piers.includes(stops[i]) ? 0 : 0.6), b = stops[i + 1] - width(stops[i + 1]) / 2 - (piers.includes(stops[i + 1]) ? 0 : 0.6);
      const uc = (a + b) / 2, cw = b - a - 1.0;
      if (cw < 3) continue;
      for (let k = 0; k < tiers.length - 1; k++) {
        const y0 = tiers[k], y1 = tiers[k + 1], top = k === tiers.length - 2;
        if (f.front && y1 > panel.y0 && y0 < panel.y1) continue;                          // the clock panel
        if (f.front && k === 0 && Math.abs(uc) < 12) continue;                             // the porch
        if (f.front && k > 0 && !top && Math.abs(uc) < 8) continue;                       // (the great window, over the porch)
        if (f.back && !top) continue;                                                       // (the back is plain brick between its bands)
        out.push({ f, uc, cw, y0, y1: y1 - (top ? 0 : 0.6), top });
      }
    }
  }
  return out;
}
// The outline of an opening: a rectangle, or (given its apex) a lancet, its sides upright to y1 and then a pointed head
// (the kit's arch's curve).
export function opening(p, x0, x1, y0, y1, apex) {
  p.moveTo(x0, y0); p.lineTo(x0, y1);
  if (apex) { const xc = (x0 + x1) / 2, r = apex - y1; p.quadraticCurveTo(x0, y1 + 0.64 * r, xc, apex); p.quadraticCurveTo(x1, y1 + 0.64 * r, x1, y1); } else p.lineTo(x1, y1);
  p.lineTo(x1, y0); p.closePath();
}
// The two lancets of a bay: the openings in the wall behind the stone, [u0, u1] wide, from the sill to the spring of the
// head and up to its apex
export function lightsOf(b) {
  const sill = b.y0 + 2.4, spring = b.y1 - 7.4, hw = b.cw / 2 - 0.2, lw = hw - 0.6;
  return [-1, 1].map(sg => { const ul = b.uc + sg * hw / 2; return { u0: ul - lw / 2, u1: ul + lw / 2, sill, spring, apex: spring + 3.1 }; });
}

export function buildFacade() {
  G.tag = 'outside';
  const { hx, hz, wall } = TOWER, ox = hx + wall, oz = hz + wall, scene = G.scene;
  const faces = mainFaces(), xs = [], zs = [], escLo = ESCAPE.x - ESCAPE.r - 1.0;
  for (let v = -60; v <= 60; v += 10) xs.push(v);
  for (let v = -30; v <= 30; v += 10) zs.push(v);
  // a box on one of the faces: u along the face, y up, w wide, h tall, standing `proud` of the wall
  const put = (f, mat, u, y, w, h, proud) => f.nz ? ibox(mat, w, h, proud, u, y, f.nz * (f.off + proud / 2)) : ibox(mat, proud, h, w, f.nx * (f.off + proud / 2), y, u);
  // one of the kit's masonry shapes on a face: w wide, h tall, d thick, its back `out` from the wall
  const part = (kind, f, mat, u, y, w, h, d, out = 0) => f.nz ? ipart(kind, mat, w, h, d, u, y, f.nz * (f.off + out + d / 2)) : ipart(kind, mat, w, h, d, f.nx * (f.off + out + d / 2), y, u, QY);
  const flat = (f) => f.nz ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2) : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const tilt = (f, a = 0.6) => f.nz ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), f.nz * a) : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -f.nx * a);
  const at = (f, u, y, n) => f.nz ? [u, y, f.nz * n] : [f.nx * n, y, u];

  // Tracery. Every bay of every storey is a pair of tall lancets in stone standing proud of the brick, with transoms
  // across them and a roundel between their heads. On the sides they are windows: the brick behind is pierced (tower.js)
  // and glazed with leaded lights; on the front, either side of the portal, the tracery is blind. In the top storey,
  // which is the hall's roof space, the lancets are open on every face, with louvres, and ventilate it.
  const tracery = (f, uc, y0, y1, cw, louvred) => {
    const sill = y0 + 2.4, spring = y1 - 7.4, hw = cw / 2 - 0.2;
    put(f, 'facade', uc, sill - 0.4, cw + 0.4, 0.8, 0.95);
    for (const du of [-hw, 0, hw]) put(f, 'facade', uc + du, (sill + spring) / 2, du ? 0.45 : 0.6, spring - sill, 0.7);
    for (const sg of [-1, 1]) {
      const ul = uc + sg * hw / 2;
      part('arch', f, 'facade', ul, spring + 1.9, hw + 0.45, 3.8, 0.7);
      if (louvred) for (let y = sill + 0.7; y < spring + 0.6; y += 1.15) f.nz ? ibox('verdigris', hw - 0.5, 0.12, 1.0, ul, y, f.nz * (f.off + 0.3), tilt(f)) : ibox('verdigris', 1.0, 0.12, hw - 0.5, f.nx * (f.off + 0.3), y, ul, tilt(f));
      else for (let k = 1; k < 4; k++) put(f, 'facade', ul, sill + (spring - sill) * k / 4, hw - 0.5, 0.36, 0.45);
    }
    put(f, 'facade', uc, spring + 4.4, cw + 0.4, 1.2, 0.7);
    f.nz ? icyl('facade', 0.8, 1.0, uc, spring + 3.0, f.nz * (f.off + 0.5), flat(f)) : icyl('facade', 0.8, 1.0, f.nx * (f.off + 0.5), spring + 3.0, uc, flat(f));
  };
  // a pier: plinth to the top of the wall, stepping back at two set-offs as a buttress does
  const pier = (f, u, y0, y1, w = 2.8, proud = 1.3) => {
    put(f, 'facade', u, (y0 + y1) / 2, w, y1 - y0, proud);
    put(f, 'facade', u, y0 + 1, w + 0.8, 2, proud + 0.4);
    put(f, 'facade', u, y1 - 1, w + 1.0, 2, proud + 0.5);
    for (const [ys, more] of [[90, 0.9], [150, 0.5]]) if (ys > y0 + 4 && ys < y1 - 4) {
      put(f, 'facade', u, (y0 + ys) / 2, w + 0.5, ys - y0, proud + more);
      f.nz ? ibox('facade', w + 0.7, 0.5, 1.4, u, ys + 0.25, f.nz * (f.off + proud + more / 2), tilt(f)) : ibox('facade', 1.4, 0.5, w + 0.7, f.nx * (f.off + proud + more / 2), ys + 0.25, u, tilt(f));
    }
  };

  const bays = traceryBays();
  for (const f of faces) {
    const lo = f.lo - (f.free[0] ? 1.6 : 0), hi = f.hi + (f.free[1] ? 1.6 : 0);
    // plinth: a battered stone base (on the front, open at the porch)
    const runs = f.front ? [[lo, -PORTAL.iw - 2.6], [PORTAL.iw + 2.6, hi]] : f.back ? [[lo, SERVICE.x0 - 0.7], [SERVICE.x1 + 0.7, hi]] : [[lo, hi]];
    for (const [a, b] of runs) { put(f, 'facade', (a + b) / 2, PLINTH / 2, b - a, PLINTH, 1.6); f.nz ? cbox(b - a, PLINTH, 1.6, (a + b) / 2, PLINTH / 2, f.nz * (f.off + 0.8)) : cbox(1.6, PLINTH, b - a, f.nx * (f.off + 0.8), PLINTH / 2, (a + b) / 2); }
    for (const [a, b] of runs) put(f, 'facade', (a + b) / 2 + (a === lo && f.free[0] ? -0.2 : 0) + (b === hi && f.free[1] ? 0.2 : 0), PLINTH + 0.6, b - a + (a === lo && f.free[0] ? 0.4 : 0) + (b === hi && f.free[1] ? 0.4 : 0), 1.2, 2.0);
    // piers on every column line, and at a free corner a pier on each face and a block between them
    const piers = f.piers;
    for (const u of piers) {
      const cut = f.front ? (Math.abs(u) < 1 ? [[panel.y1, TOP]] : [[PLINTH, panel.y0], [panel.y1, TOP]]) : [[PLINTH, TOP]];      // (none in the middle of the great window)
      for (const [y0, y1] of cut) pier(f, u, y0, y1);
    }
    if (f.free[0] && f.nz) { const x = -ox - 0.65, z = f.nz * (oz + 0.65); ibox('facade', 1.3, TOP - PLINTH, 1.3, x, (PLINTH + TOP) / 2, z); }
    // string courses at every girder (on the front, the clock panel is in the way of all but the lowest two); on the
    // back, which has no tracery, a band of stone half way up each storey as well, and a sill course under the louvres
    for (const y of storeys) if (!(f.front && y > panel.y0 && y < panel.y1)) {
      const GW = GREAT_WINDOW, cut = f.front && y > GW.sill && y < GW.apex + 4;          // (on the front, either side of the great window)
      for (const [a, b] of cut ? [[lo, -GW.half - 1.4], [GW.half + 1.4, hi]] : [[lo, hi]]) put(f, 'facade', (a + b) / 2, y - 0.5, b - a, 1.1, 0.4);
    }
    if (f.back) for (let k = 0; k < storeys.length; k++) { const ya = k ? storeys[k - 1] : PLINTH + 1.2, yb = storeys[k]; put(f, 'facade', (lo + hi) / 2, (ya + yb) / 2, hi - lo, 0.7, 0.3); put(f, 'facade', (lo + hi) / 2, (ya + yb) / 2 - 0.55, hi - lo, 0.4, 0.15); }
    // the bays between the piers
    for (const b of bays.filter(b => b.f.nz === f.nz && b.f.nx === f.nx)) tracery(f, b.uc, b.y0, b.y1, b.cw, b.top);
    // the cornice: a table of corbels and three oversailing courses, weathered on top (nothing to walk on)
    for (let u = lo + 1.2; u < hi; u += 2.4) put(f, 'facade', u, TOP - 1.1, 1.0, 1.9, 1.3);
    const ext = (out) => [lo - (f.free[0] ? out : 0), hi + (f.free[1] ? out : 0)];
    for (const [y, out, h] of [[TOP + 1, 1.2, 2], [TOP + 3, 2.4, 2], [CORNICE - 1.25, 3.4, 2.5]]) { const [a, b] = ext(out); put(f, 'facade', (a + b) / 2, y, b - a, h, out); }
    { const [a, b] = ext(3.4); f.nz ? ibox('facade', b - a, 0.4, 3.6, (a + b) / 2, CORNICE + 0.05, f.nz * (f.off + 1.7), tilt(f, 0.2)) : ibox('facade', 3.6, 0.4, b - a, f.nx * (f.off + 1.7), CORNICE + 0.05, (a + b) / 2, tilt(f, 0.2)); }
  }

  // ---- the service door in the back wall, to the coal yard: a stone surround through the plinth, and a hood on brackets
  {
    const f = faces[1], x0 = SERVICE.x0, x1 = SERVICE.x1, h = SERVICE.h, xc = (x0 + x1) / 2;
    for (const x of [x0 - 0.35, x1 + 0.35]) { put(f, 'facade', x, h / 2, 0.7, h, 1.9); cbox(0.7, h, 1.9, x, h / 2, -(oz + 0.95)); }
    put(f, 'facade', xc, h + 0.45, x1 - x0 + 1.4, 0.9, 1.9);
    put(f, 'facade', xc, h + 1.15, x1 - x0 + 2.4, 0.3, 2.9);
    for (const x of [x0 - 0.5, x1 + 0.5]) ipart('wedge', 'facade', 0.4, 1.0, 1.0, x, h + 0.5, -(oz + 2.35), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, Math.PI)));
    ibox('facade', x1 - x0 + 0.4, 0.15, 2.0, xc, 0.075, -(oz + 1.0));                                   // the threshold, worn
  }

  // ---- the clock panel: a square of stone with the dial let into it, from one stair tower to the other
  {
    const sh = new THREE.Shape();
    sh.moveTo(-panel.x, panel.y0); sh.lineTo(panel.x, panel.y0); sh.lineTo(panel.x, panel.y1); sh.lineTo(-panel.x, panel.y1); sh.closePath();
    const hole = new THREE.Path(); hole.absarc(DIAL.x, DIAL.y, DIAL.r + 0.4, 0, TAU, true); sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: false, curveSegments: 96 }); g.translate(0, 0, oz);
    scene.add(new THREE.Mesh(g, MAT.facade));
    // a moulded rim round the dial
    const rim = new THREE.Mesh(new THREE.TorusGeometry(DIAL.r + 1.6, 1.3, 10, 128), MAT.facade); rim.position.set(DIAL.x, DIAL.y, oz + 0.7); scene.add(rim);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    // in each corner of the square a blind roundel of carved stone, a quatrefoil in a ring (blind, like the tracery)
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const x = sx * 49, y = DIAL.y + sy * 49;
      icyl('facade', 8.0, 0.5, x, y, oz + 0.95, q);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7.4, 0.5, 8, 48), MAT.facade); ring.position.set(x, y, oz + 1.25); scene.add(ring);
      MESH_STONE.push({ c: [x, y, oz + 1.25], kg: torusKg(7.4, 0.5) });
      for (const a of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI]) { const lobe = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.35, 6, 32), MAT.facade); lobe.position.set(x + 2.7 * Math.cos(a), y + 2.7 * Math.sin(a), oz + 1.3); scene.add(lobe); MESH_STONE.push({ c: [x, y, oz + 1.3], kg: torusKg(2.6, 0.35) }); }
    }
    // frame of the panel, and a blind arcade along its head and foot wherever the dial and the roundels leave room
    for (const sy of [panel.y0, panel.y1]) ibox('facade', 2 * panel.x, 2.4, 1.6, 0, sy, oz + 0.8);
    for (const [y, yd] of [[panel.y0 + 3.4, panel.y0 + 5.2], [panel.y1 - 3.4, panel.y1 - 5.2]]) for (let u = -54; u <= 54.1; u += 3) {
      if (Math.hypot(u, yd - DIAL.y) < DIAL.r + 4.6 || Math.abs(Math.abs(u) - 49) < 10) continue;
      ipart('arch', 'facade', 3, 3.6, 0.5, u, y, oz + 0.95); ibox('facade', 0.4, 3.6, 0.6, u + 1.5, y, oz + 1.0);
    }
  }

  // ---- the main portal: a door 8 m wide and 7 high in the front wall under the dial, at the back of a porch 12 m wide
  // and 9 deep. Its arch is of three orders on shafts, 21 m to its point, under a gable between two buttresses on the
  // column lines either side, which end in pinnacles; over the door a carved tympanum, and a ribbed vault overhead. Its
  // iron gates, hung in the arch, stand open against the porch's sides by day and close it at night.
  {
    const P = PORTAL, d = P.porch, iw = P.iw, z0 = oz, z1 = oz + d, sp = P.spring, top = 20.5, side = 2.6;
    for (const sx of [-1, 1]) {
      // the porch's sides, with a blind arcade along each inside
      ibox('facade', side, 23, d, sx * (iw + side / 2), 11.5, z0 + d / 2); cbox(side, 23, d, sx * (iw + side / 2), 11.5, z0 + d / 2);
      cbox(2.6, sp, 1.6, sx * (iw + 1.3), sp / 2, z1 + 0.9);
      for (let z = z0 + 1.6; z < z1 - 1.0; z += 1.8) { ipart('arch', 'facade', 1.6, 2.6, 0.25, sx * (iw - 0.12), 7.4, z, QY); icyl('facade', 0.14, 6.1, sx * (iw - 0.14), 3.05, z - 0.8); }
      ibox('facade', 0.3, 0.5, d - 0.6, sx * (iw - 0.15), 0.25, z0 + d / 2);
      // the shafts of the arch's three orders
      for (const [k, dx] of [[0, 0.4], [1, 1.25], [2, 2.1]]) { icyl('facade', 0.38, sp, sx * (iw + dx), sp / 2, z1 + 0.4 + k * 0.5); icyl('facade', 0.55, 0.6, sx * (iw + dx), sp + 0.3, z1 + 0.4 + k * 0.5); icyl('facade', 0.55, 0.8, sx * (iw + dx), 0.4, z1 + 0.4 + k * 0.5); }
      // a buttress at each front corner, on the column line, set off twice and ending in a pinnacle
      const bx = sx * (iw + side + 1.4), bz = z1 + 0.2;
      ibox('facade', 2.8, 30, 3.0, bx, 15, bz); cbox(2.8, 30, 3.0, bx, 15, bz);
      ibox('facade', 3.4, 12, 3.8, bx, 6, bz + 0.2); ibox('facade', 3.4, 0.6, 1.4, bx, 12.25, bz + 1.6, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.6));
      ibox('facade', 2.2, 5, 2.4, bx, 32.5, bz); ipart('pyr', 'verdigris', 2.2, 9, 2.2, bx, 39.5, bz); ipart('pyr', 'gilt', 0.3, 1.4, 0.3, bx, 44.6, bz);
      for (const dz of [-1, 1]) ipart('pyr', 'verdigris', 0.7, 3, 0.7, bx + sx * 1.0, 36.5, bz + dz * 1.0);
      // a gate leaf, hung in the arch and opened back against the porch's side: bars between rails, spiked along its head
      const gx = sx * (iw - 0.6), gb = z1 - 0.3, ga = gb - iw + 0.2, gh = sp - 0.6;
      for (let z = ga + 0.1; z < gb; z += 0.3) ibox('rail', 0.08, gh - 0.3, 0.08, gx, (gh - 0.3) / 2, z);
      for (const y of [0.3, 3.0, gh * 0.62, gh - 0.6]) ibox('rail', 0.12, 0.16, gb - ga, gx, y, (ga + gb) / 2);
      for (let z = ga + 0.1; z < gb; z += 0.6) ipart('pyr', 'gilt', 0.14, 0.5, 0.14, gx, gh - 0.1, z);
      icyl('rail', 0.16, gh, gx, gh / 2, gb + 0.05);
      // the door's stone frame in the wall at the back
      ibox('facade', 1.0, P.h, 0.6, sx * (P.w / 2 + 0.5), P.h / 2, z0 + 0.3);
    }
    ibox('facade', 2 * iw, 1.5, d, 0, top - 0.75, z0 + d / 2);                                          // the vault
    for (let z = z0 + 1.5; z < z1; z += 3) ibox('facade', 2 * iw, 0.5, 0.5, 0, top - 1.75, z);           // its ribs
    ibox('facade', P.w + 2, 0.9, 0.7, 0, P.h + 0.45, z0 + 0.35);                                         // the lintel
    ibox('facade', 2 * iw, top - 1.5 - P.h - 0.9, 0.4, 0, (P.h + 0.9 + top - 1.5) / 2, z0 + 0.2);       // the tympanum, carved with an arcade
    for (let x = -iw + 1.2; x < iw - 1; x += 2.4) { ipart('arch', 'facade', 2.0, 4.2, 0.35, x, P.h + 5.5, z0 + 0.55); ibox('facade', 0.35, 3.6, 0.4, x - 1.2, P.h + 2.8, z0 + 0.55); }
    for (const [k, s, h] of [[0, 2 * iw, 10.5], [1, 2 * iw + 1.7, 11.3], [2, 2 * iw + 3.4, 12.1]]) ipart('arch', 'facade', s / 0.8, h, 0.5, 0, sp + h / 2, z1 + 0.4 + k * 0.5);
    const gw = 2 * (iw + side + 2.8);
    ipart('wedge', 'facade', gw, 12, 1.4, 0, sp + 12.1 + 6, z1 + 1.6);
    ipart('wedge', 'verdigris', gw - 1.6, 11, d + 0.4, 0, sp + 12.1 + 5.3, z0 + d / 2 + 0.2);
    ipart('pyr', 'gilt', 0.5, 2.4, 0.5, 0, sp + 12.1 + 13.2, z1 + 1.6);
    { const y = sp + 12.1 + 4.5; icyl('facade', 2.4, 0.6, 0, y, z1 + 2.3, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)); }
    ibox('stone', 2 * iw, 0.06, d + 0.8, 0, 0.03, z0 + d / 2 - 0.2);                                     // the paving, worn
  }

  // ---- the great window over the porch, in the middle bay from pier to pier: three orders of arch, each set further
  // forward and wider than the one inside it, on imposts on the piers; in the opening, the screen of plate glass in iron
  // bars, standing just outside the wall's steel frame, whose column (up the middle) and girder (at 60 m) are
  // behind it as its mullion and transom; a stone sill under it, weathered, over the porch's roof
  {
    const W = GREAT_WINDOW, r = W.apex - W.spring;
    for (let k = 0; k < 3; k++) {
      const half = W.half + 0.7 * k, wide = half / 0.4, tall = (r + 0.9 * k) / 0.86, z = oz + 0.35 + 0.7 * k;
      ipart('arch', 'facade', wide, tall, 0.7, 0, W.spring + tall / 2, z);
    }
    for (const sx of [-1, 1]) {
      ibox('facade', 4.2, 1.4, 3.0, sx * (W.half + 1.6), W.spring - 0.7, oz + 1.5);                       // the imposts
      ibox('facade', 3.4, 0.6, 2.6, sx * (W.half + 1.6), W.spring - 1.7, oz + 1.3);
    }
    ibox('facade', 2 * W.half + 1.0, 0.8, 1.6, 0, W.sill - 0.4, oz + 0.7, tilt({ nz: 1 }, 0.25));                // the sill
    // the screen: its outline is the opening's; bars every 1.43 m across and 2 m up
    const sh = new THREE.Shape(); opening(sh, -W.half, W.half, W.sill, W.spring, W.apex);
    const gm = new THREE.Mesh(new THREE.ShapeGeometry(sh, 12).translate(0, 0, W.z), MAT.glazing); scene.add(gm);
    const inside = (x, y) => y < W.spring || Math.abs(x) < W.half * (1 - Math.pow((y - W.spring) / r, 1.5));
    for (let i = -5; i <= 5; i++) {
      const x = i * 2 * W.half / 12; let y1 = W.spring; while (y1 < W.apex && inside(x, y1 + 0.25)) y1 += 0.25;
      ibox('iron', i === 0 ? 0.2 : 0.09, y1 - W.sill, 0.14, x, (W.sill + y1) / 2, W.z);
    }
    for (let y = W.sill + 2.0; y < W.apex - 1; y += 2.0) {
      let h = W.half; if (y > W.spring) { h = 0; while (h < W.half && inside(h + 0.1, y)) h += 0.1; }
      if (h > 0.6) ibox('iron', 2 * h, 0.09, 0.14, 0, y, W.z);
    }
    cbox(2 * W.half, W.apex - W.sill, 0.2, 0, (W.sill + W.apex) / 2, W.z);
  }

  // ---- the attic: brick on the wall line, a stone pier on every column line carried up from below, a tall window
  // in every bay; its cornice carries the gutter at the mansard's foot. (Its floor and what is in it: tower.js.)
  const A0 = CORNICE, A1 = ARCH.attic, AT = 1.0;
  {
    const sill = A0 + 1.0, head = A1 - 5.5, rows = [
      // [face, the bays' column lines, where windows are wanted, the doors in it]
      { f: { nz: 1, off: oz }, lines: [-ox, ...xs, ox], glaze: (u) => Math.abs(u) < panel.x, doors: [-1, 1].map(sx => [sx < 0 ? -STAIR_TOWER.door[1] : STAIR_TOWER.door[0], sx < 0 ? -STAIR_TOWER.door[0] : STAIR_TOWER.door[1]]) },
      { f: { nz: -1, off: oz }, lines: [-ox, ...xs, ox], glaze: (u) => Math.abs(u) < escLo, doors: [ESCAPE.door, [-ESCAPE.door[1], -ESCAPE.door[0]]] },
      { f: { nx: -1, off: ox }, lines: [-oz, ...zs, oz], glaze: () => true, doors: [] },
      { f: { nx: 1, off: ox }, lines: [-oz, ...zs, oz], glaze: () => true, doors: [] },
    ];
    for (const { f, lines, glaze, doors } of rows) {
      const along = f.nz ? 'x' : 'z', n1 = f.off * (f.nz || f.nx), n0 = n1 - (f.nz || f.nx) * AT, ns = [Math.min(n0, n1), Math.max(n0, n1)];
      const u0 = f.nz ? -ox : -(oz - AT), u1 = -u0;
      const holes = doors.map(([a, b]) => ({ u0: a, u1: b, y0: A0, y1: A0 + DOOR_H, door: true }));
      for (let i = 0; i < lines.length - 1; i++) {
        const a = lines[i], b = lines[i + 1], uc = (a + b) / 2;
        if (!glaze(uc)) continue;
        const w = Math.min(5.6, b - a - 4.4);
        holes.push({ u0: uc - w / 2, u1: uc + w / 2, y0: sill, y1: head });
      }
      slab(along, u0, u1, A0, A1, ns[0], ns[1], holes);
      for (const h of holes) if (!h.door) {
        window_(along, h.u0, h.u1, h.y0, h.y1, ns[0], ns[1], f.nz || f.nx, 3.6);
        for (const y of [h.y0 + (h.y1 - h.y0) * 0.36, h.y0 + (h.y1 - h.y0) * 0.68]) put(f, 'facade', (h.u0 + h.u1) / 2, y, h.u1 - h.u0, 0.3, -0.5);       // transoms
        put(f, 'facade', (h.u0 + h.u1) / 2, h.y1 + 0.6, h.u1 - h.u0 + 1.4, 1.2, 0.5);                                                             // hood mould
      }
      // piers on the column lines (and at the corners, where the faces' piers meet), and the attic's cornice
      const visible = (u) => (f.nz === 1 ? Math.abs(u) < panel.x - 0.5 : f.nz === -1 ? Math.abs(u) < escLo - 1 : true);
      for (const u of lines.slice(1, -1)) if (visible(u)) {
        put(f, 'facade', u, (A0 + A1 - 2) / 2, 2.6, A1 - A0 - 2, 0.8);
        put(f, 'facade', u, A1 - 3, 3.2, 1.4, 1.1);
        // a pinnacle over each, in front of the mansard
        const p = at(f, u, 0, f.off + 0.9); ibox('facade', 1.7, 5, 1.7, p[0], A1 + 3, p[2]); ipart('pyr', 'verdigris', 1.5, 6, 1.5, p[0], A1 + 8.5, p[2]); ipart('pyr', 'gilt', 0.2, 0.9, 0.2, p[0], A1 + 11.9, p[2]);
      }
      const cl = f.nz === 1 ? -panel.x : f.nz === -1 ? -escLo : -oz - 1.6, ch = f.nz === 1 ? panel.x : f.nz === -1 ? escLo : oz;
      for (let u = cl + 1.0; u < ch - 0.6; u += 2.0) put(f, 'facade', u, A1 - 1.9, 0.8, 1.2, 0.9);
      put(f, 'facade', (cl + ch) / 2, A1 - 0.9, ch - cl, 0.8, 1.4); put(f, 'facade', (cl + ch) / 2, A1 - 0.2, ch - cl + 0.6, 0.6, 1.8);
      put(f, 'facade', (cl + ch) / 2, A0 + 0.4, ch - cl, 0.8, 0.6);
    }
    // the attic's corner piers at the back
    for (const sx of [-1, 1]) ibox('facade', 2.2, A1 - A0, 2.2, sx * (ox + 0.2), (A0 + A1) / 2, -(oz + 0.2));
  }

  // ---- the mansard: a steep copper roof from the attic's cornice to its flat, 47 m up, with a dormer to every bay
  // (they light the attic and the roof's trusses), a copper roll down each hip and an iron cresting round the flat.
  {
    const e0 = 0.2, y0 = A1 + 0.5, y1 = ARCH.flat, run = 11, rise = y1 - y0, sl = Math.hypot(run, rise), cs = run / sl, sn = rise / sl;
    const X0 = ox - e0, Z0 = oz - e0, X1 = X0 - run, Z1 = Z0 - run;          // the slopes' feet and heads (the flat is X1 by Z1)
    const DW = 5.6, DY = 15, dTop = y0 + DY, gable = 4.0, vTop = (DY + 0.6) / sn;
    // and over each dormer, high on the slope, a lucarne: a stone face with one light, a gable and a copper roof back
    // into the slope, which is cut away behind it between two rafters (it lights the trusses)
    const LW = 3.6, ly0 = 292, ly1 = 298, lg = 2.6, vOf = (y) => (y - y0) / sn;
    const slopes = [
      { n: [0, 1], half0: X0, half1: X1, foot: Z0, bays: xs.slice(0, -1).map(x => x + 5).filter(u => Math.abs(u) < panel.x) },
      { n: [0, -1], half0: X0, half1: X1, foot: Z0, bays: xs.slice(0, -1).map(x => x + 5).filter(u => Math.abs(u) < escLo - 4) },
      { n: [-1, 0], half0: Z0, half1: Z1, foot: X0, bays: [-oz + 6, ...zs.slice(0, -1).map(z => z + 5), oz - 6] },
      { n: [1, 0], half0: Z0, half1: Z1, foot: X0, bays: [-oz + 6, ...zs.slice(0, -1).map(z => z + 5), oz - 6] },
    ];
    for (const S of slopes) {
      // the slope's outline in its own plane (u along the eaves, v up the slope), notched at its foot for each dormer
      const sh = new THREE.Shape(), bays = [...S.bays].sort((a, b) => a - b);
      sh.moveTo(-S.half0, 0);
      for (const u of bays) { sh.lineTo(u - DW / 2, 0); sh.lineTo(u - DW / 2, vTop); sh.lineTo(u + DW / 2, vTop); sh.lineTo(u + DW / 2, 0); }
      sh.lineTo(S.half0, 0); sh.lineTo(S.half1, sl); sh.lineTo(-S.half1, sl); sh.closePath();
      const halfAt = (v) => S.half0 + (S.half1 - S.half0) * v / sl, lucs = bays.filter(u => Math.abs(u) + LW / 2 + 1.2 < halfAt(vOf(ly1 + lg)));
      for (const u of lucs) {
        const h = new THREE.Path(), a = vOf(ly0), b = vOf(ly1), c = vOf(ly1 + lg + 0.2), hw = LW / 2 + 0.1;
        h.moveTo(u - hw, a); h.lineTo(u + hw, a); h.lineTo(u + hw, b); h.lineTo(u, c); h.lineTo(u - hw, b); h.closePath(); sh.holes.push(h);
      }
      const g = new THREE.ShapeGeometry(sh), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i), v = p.getY(i), y = y0 + v * sn, n = S.foot - v * cs;
        if (S.n[1]) p.setXYZ(i, S.n[1] > 0 ? u : -u, y, S.n[1] * n); else p.setXYZ(i, S.n[0] * n, y, S.n[0] > 0 ? -u : u);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, MAT.verdigris.clone()); m.material.side = THREE.DoubleSide; scene.add(m);
      // standing seams up the slope, between the dormers
      const f = S.n[1] ? { nz: S.n[1], off: S.foot } : { nx: S.n[0], off: S.foot }, sgn = S.n[1] ? (S.n[1] > 0 ? 1 : -1) : (S.n[0] > 0 ? -1 : 1);
      for (let u = -S.half1 + 2; u < S.half1 - 1; u += 4) {
        const wv = bays.some(b => Math.abs(b - u) < DW / 2 + 0.6) ? vTop + 1.5 : 0.4, past = lucs.some(b => Math.abs(b - u) < LW / 2 + 0.6);
        for (const [v0, v1] of past ? [[wv, vOf(ly0) - 0.2], [vOf(ly1 + lg + 0.6), sl - 0.2]] : [[wv, sl - 0.2]]) {
          const a = at(f, sgn * u, y0 + v0 * sn, S.foot - v0 * cs + 0.08), b = at(f, sgn * u, y0 + v1 * sn, S.foot - v1 * cs + 0.08);
          beam('verdigris', a, b, 0.12, 0.12);
        }
      }
      // the dormers: a stone face with a two-light window and a gable, copper cheeks and roof back into the slope
      for (const u0 of bays) {
        const u = sgn * u0, df = { ...f, off: S.foot - 0.1 };
        put(df, 'facade', u, y0 + 0.6, DW + 0.6, 1.2, 0.7);
        for (const sg of [-1, 1]) put(df, 'facade', u + sg * (DW / 2 - 0.35), y0 + DY / 2 + 0.6, 0.7, DY - 1.2, 0.7);
        put(df, 'facade', u, dTop - 0.5, DW + 0.4, 1.0, 0.75);
        put(df, 'facade', u, y0 + DY / 2 + 0.3, 0.4, DY - 2.4, 0.5);
        f.nz ? ibox('glazing', DW - 1.4, DY - 2.2, 0.05, u, y0 + DY / 2 + 0.3, f.nz * (df.off + 0.3)) : ibox('glazing', 0.05, DY - 2.2, DW - 1.4, f.nx * (df.off + 0.3), y0 + DY / 2 + 0.3, u);
        part('arch', df, 'facade', u, dTop - 2.6, DW - 1.3, 2.6, 0.5, 0.1);
        for (const sg of [-1, 1]) { const c = at(f, u + sg * (DW / 2 + 0.15), (y0 + dTop) / 2, df.off - 2.4); f.nz ? ibox('verdigris', 0.3, dTop - y0, 5.0, c[0], c[1], c[2]) : ibox('verdigris', 5.0, dTop - y0, 0.3, c[0], c[1], c[2]); }
        part('wedge', df, 'verdigris', u, dTop + gable / 2, DW + 1.0, gable, 6.2, -5.4);
        part('wedge', df, 'facade', u, dTop + gable / 2, DW + 0.6, gable, 0.7, 0.05);
        const t = at(f, u, dTop + gable + 0.6, df.off + 0.45); ipart('pyr', 'gilt', 0.22, 1.4, 0.22, t[0], t[1], t[2]);
      }
      for (const u0 of lucs) {
        const u = sgn * u0, nF = S.foot - vOf(ly0) * cs, lf = { ...f, off: nF - 0.45 }, ye = ly1 + 0.4;
        put(lf, 'facade', u, ly0 + 0.3, LW + 0.4, 0.6, 0.65);                                                           // sill
        for (const sg of [-1, 1]) put(lf, 'facade', u + sg * (LW / 2 - 0.3), (ly0 + ly1) / 2 + 0.3, 0.6, ly1 - ly0 - 0.6, 0.55);
        part('arch', lf, 'facade', u, ly1 - 1.0, LW - 0.6, 2.0, 0.45, 0.05);
        f.nz ? ibox('glazing', LW - 1.2, ly1 - ly0 - 1.0, 0.05, u, (ly0 + ly1) / 2 + 0.1, f.nz * (lf.off + 0.25)) : ibox('glazing', 0.05, ly1 - ly0 - 1.0, LW - 1.2, f.nx * (lf.off + 0.25), (ly0 + ly1) / 2 + 0.1, u);
        put(lf, 'facade', u, ly1 + 0.2, LW + 0.6, 0.4, 0.75);                                                           // its cornice
        for (const sg of [-1, 1]) { const c = at(f, u + sg * (LW / 2 + 0.12), (ly0 + 0.6 + ye) / 2, lf.off - 0.85); f.nz ? ibox('verdigris', 0.24, ye - ly0 - 0.6, 1.7, c[0], c[1], c[2]) : ibox('verdigris', 1.7, ye - ly0 - 0.6, 0.24, c[0], c[1], c[2]); }
        part('wedge', lf, 'verdigris', u, ye + lg / 2, LW + 0.9, lg, 3.2, -2.5);
        part('wedge', lf, 'facade', u, ye + lg / 2, LW + 0.3, lg, 0.6, 0.2);
        const t = at(f, u, ye + lg + 0.5, lf.off + 0.5); ipart('pyr', 'gilt', 0.18, 1.1, 0.18, t[0], t[1], t[2]);
      }
      // the gutter at its foot, behind the attic's cornice
      const gA = at(f, -S.half0, y0 - 0.2, S.foot + 0.3), gB = at(f, S.half0, y0 - 0.2, S.foot + 0.3);
      beam('verdigris', gA, gB, 0.6, 0.6);
    }
    // a roll down each hip, gilded where it catches the light
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const a = [sx * X0, y0, sz * Z0], b = [sx * X1, y1, sz * Z1];
      beam('verdigris', a, b, 1.0, 1.0); beam('gilt', [a[0] + sx * 0.3, a[1] + 0.2, a[2] + sz * 0.3], [b[0] + sx * 0.3, b[1] + 0.2, b[2] + sz * 0.3], 0.22, 0.22);
    }
    // the cresting round the flat, outside its railing
    for (const [len, along, c] of [[2 * X1, 'x', Z1], [2 * X1, 'x', -Z1], [2 * Z1, 'z', X1], [2 * Z1, 'z', -X1]]) {
      along === 'x' ? ibox('gilt', len, 0.14, 0.14, 0, y1 + 0.3, c) : ibox('gilt', 0.14, 0.14, len, c, y1 + 0.3, 0);
      for (let s = -len / 2 + 0.75; s < len / 2; s += 1.5) along === 'x' ? ipart('pyr', 'gilt', 0.22, 0.9, 0.22, s, y1 + 0.8, c) : ipart('pyr', 'gilt', 0.22, 0.9, 0.22, c, y1 + 0.8, s);
      along === 'x' ? ibox('verdigris', len + 0.4, 0.4, 0.5, 0, y1 + 0.05, c) : ibox('verdigris', 0.5, 0.4, len + 0.4, c, y1 + 0.05, 0);
    }
  }

  // ---- the lamp room, on the middle of the flat. Its drum is the stair hall: a stone drum with the door toward the
  // front, a lancet in every third face (over the door too) and a buttress strip between each two, and at its head a
  // corbel table carrying a stone gallery round the glass, railed, from which the glass is cleaned (a glazed door onto
  // it at the front). Above, the glass between iron mullions, a stone cornice, and a copper cap with a ventilator for
  // the lamp's fumes and a weathervane. The lamp floor, the stair and the lamp: tower.js (roofTop).
  {
    const L = LAMP, y0 = ARCH.flat, R = L.R, t = L.drumWall, n = 32, seg = 2 * R * Math.tan(Math.PI / n), yg = y0 + L.drum, yc = yg + L.glass;
    const FRONT = n / 4, wy0 = y0 + 4.6, wy1 = yg - 2.6, ww = 2.2;        // the face toward the front (a = 90 deg); the lancets
    const ring = (mat, r, d, ya, yb, holesOf = () => [], collide = false, width = seg * r / R) => {
      for (let k = 0; k < n; k++) {
        const a = k * TAU / n, q = rotY(-(a + Math.PI / 2)), ca = Math.cos(a), sa = Math.sin(a), hs = holesOf(k);
        const put = (fn, list) => { for (const [t0, t1, yA, yB] of list) { const tc = (t0 + t1) / 2; fn(t1 - t0, yB - yA, d, (r - d / 2) * ca - tc * sa, (yA + yB) / 2, (r - d / 2) * sa + tc * ca, q); } };
        put((...v) => ibox(mat, ...v), pieces(-width / 2, width / 2, ya, yb, hs));
        if (collide) put(cbox, pieces(-width / 2, width / 2, ya, yb, hs.filter(h => h.door)));
      }
    };
    // (the point at u along face k, radius r, and that face's turn)
    const onFace = (k, r, u) => { const a = k * TAU / n; return [r * Math.cos(a) - u * Math.sin(a), r * Math.sin(a) + u * Math.cos(a)]; };
    const faceQ = (k) => rotY(-(k * TAU / n + Math.PI / 2));
    ring('facade', R, t, y0, yg, (k) => [...(k % 4 === 0 ? [{ u0: -ww / 2, u1: ww / 2, y0: wy0, y1: wy1 }] : []), ...(k === FRONT ? [{ u0: -1.25, u1: 1.25, y0, y1: y0 + 3.2, door: true }] : [])], true);
    for (let k = 0; k < n; k += 4) {
      const [gx, gz] = onFace(k, R - t / 2, 0), q = faceQ(k);
      ibox('glazing', ww, wy1 - wy0, 0.05, gx, (wy0 + wy1) / 2, gz, q);
      ipart('arch', 'facade', ww + 0.02, 1.6, t + 0.02, gx, wy1 - 0.8, gz, q);
      const [lx, lz] = onFace(k, R - 0.15, 0); ibox('facade', ww + 0.6, 0.35, t + 0.3, lx, wy0 - 0.17, lz, q);
      const [hx, hz] = onFace(k, R + 0.12, 0); ibox('facade', ww + 0.9, 0.3, 0.3, hx, wy1 + 0.25, hz, q);      // the label over it
    }
    { const [x, z] = onFace(FRONT, R + 0.1, 0); ibox('facade', 3.4, 0.7, 0.4, x, y0 + 3.55, z, faceQ(FRONT)); }    // the door's lintel
    for (let k = 2; k < n; k += 4) { const [x, z] = onFace(k, R + 0.35, 0); ibox('facade', 1.2, yg - 1.9 - (y0 + 0.8), 0.7, x, (y0 + 0.8 + yg - 1.9) / 2, z, faceQ(k)); }   // the buttress strips
    ring('facade', R + 0.5, 1.1, y0, y0 + 0.8, (k) => (k === FRONT ? [{ u0: -1.25, u1: 1.25, y0, y1: y0 + 0.8 }] : []));
    ring('facade', R + 0.2, 0.8, y0 + 3.95, y0 + 4.25);                                                        // a string course under the sills
    // the corbel table and the gallery on it
    ring('facade', R + 0.35, 0.95, yg - 1.9, yg - 1.45);
    for (let k = 0; k < n; k++) for (const u of [-seg / 4, seg / 4]) { const [x, z] = onFace(k, R + 0.7, u); ibox('facade', 0.5, 1.0, 1.4, x, yg - 0.95, z, faceQ(k)); }
    ring('facade', R + L.gallery, L.gallery + t, yg - 0.45, yg, () => [], true);
    { const rr = R + L.gallery - 0.15, rv = rr / Math.cos(Math.PI / n);
      for (let k = 0; k < n; k++) { const a0 = (k - 0.5) * TAU / n, a1 = (k + 0.5) * TAU / n; rail([rv * Math.cos(a0), yg, rv * Math.sin(a0)], [rv * Math.cos(a1), yg, rv * Math.sin(a1)]); } }
    // the glass (with a glazed door in the front face: tower.js hangs it), the mullions, the bars
    ring('glazing', R - 0.55, 0.05, yg, yc, (k) => (k === FRONT ? [{ u0: -0.7, u1: 0.7, y0: yg, y1: yg + 2.4, door: true }] : []), true);
    for (let k = 0; k < n; k++) { const a = (k + 0.5) * TAU / n; ibox('iron', 0.45, L.glass, 0.45, (R - 0.55) * Math.cos(a), (yg + yc) / 2, (R - 0.55) * Math.sin(a), rotY(-a)); }
    // glazing bars, so that no pane is more than 1.2 m wide or 2 m high: three upright in each face (in the front face,
    // either side of the door and one over it), and rings round at the door's head and every 2 m above it, every third a
    // heavier one
    for (let k = 0; k < n; k++) for (const u of k === FRONT ? [-0.76, 0, 0.76] : [-1.08, 0, 1.08]) {
      const [x, z] = onFace(k, R - 0.575, u), y0 = k === FRONT && u === 0 ? yg + 2.5 : yg;
      ibox('iron', 0.08, yc - y0, 0.12, x, (y0 + yc) / 2, z, faceQ(k));
    }
    { const hw = (R - 0.575) * Math.tan(Math.PI / n) - 0.2;                     // (and a bar half way up the lowest, round the door)
      for (let k = 0; k < n; k++) for (const [u0, u1] of k === FRONT ? [[-hw, -0.72], [0.72, hw]] : [[-hw, hw]]) { const [x, z] = onFace(k, R - 0.575, (u0 + u1) / 2); ibox('iron', u1 - u0, 0.07, 0.12, x, yg + 1.23, z, faceQ(k)); } }
    for (let j = 0; yg + 2.46 + 2 * j < yc - 0.5; j++) { const b = new THREE.Mesh(new THREE.TorusGeometry(R - 0.575, j % 3 === 2 ? 0.14 : 0.06, 6, 128), MAT.iron); b.rotation.x = Math.PI / 2; b.position.y = yg + 2.46 + 2 * j; scene.add(b); }
    ring('facade', R + 0.9, 1.4, yc, yc + 1.2); ring('facade', R + 1.5, 1.4, yc + 1.2, yc + 2.2);
    // the roof: eight straight copper faces on the cornice, a plain roll on each hip and three down each face, and at
    // its head a louvred ventilator for the lamp's fumes, which carries the vane
    const capY = yc + 2.2;
    copperRoof(0, capY, 0, (R + 1.6) / Math.cos(Math.PI / 8), L.cap, 3);
    const vy = capY + L.cap;
    icyl('verdigris', 2.2, 0.5, 0, vy - 1.6, 0);
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8; ibox('verdigris', 1.6, 0.12, 0.6, 1.5 * Math.cos(a), vy - 0.4, 1.5 * Math.sin(a), rotY(-a + Math.PI / 2)); }
    icyl('verdigris', 1.7, 0.5, 0, vy + 0.6, 0); ipart('pyr', 'verdigris', 3.2, 1.6, 3.2, 0, vy + 1.65, 0);
    vane(0, vy + 2.4, 0, 2.4, WIND_FROM);
  }

  stairTowerShells(); escapeTurret(); stack(); coalYard();
  G.tag = '';
}

// ---- the stair towers' walls and dressings (their stairs: tower.js)
function stairTowerShells() {
  const S = STAIR_TOWER, t = S.wall, i0 = S.x0 + t, i1 = S.x1 - t, j0 = S.z0 + t, j1 = S.z1 - t;
  const oz = TOWER.hz + TOWER.wall, ox = TOWER.hx + TOWER.wall;
  for (const sx of [-1, 1]) {
    G.on = `stair tower ${sx < 0 ? 'left' : 'right'}`;
    const X = (x) => sx * x, xr = (a, b) => [Math.min(X(a), X(b)), Math.max(X(a), X(b))];
    // the four walls: [along, u range, n range (world), windows ({c, w, y0, y1}), doors]
    const [fx0, fx1] = xr(S.x0, S.x1), [nx0, nx1] = xr(S.x1 - t, S.x1), [ix0, ix1] = xr(S.x0, S.x0 + t);
    const street = xr(...S.street), door = xr(...S.door), bridge = xr(i0, i0 + S.w);
    // At the top, over the mansard's flat, two stages. The lookout is open: an arcade on every face, two arches to each
    // side of the middle column of the wall's frame (which stands in the pier between them), the sill a parapet 1.1 m
    // over the floor and an iron grille in each arch. Over it, under the spire, a closed stage aired by louvres: the
    // hoist's sheave room in the right-hand tower (hoist.js), the tank in the left (tower.js).
    const lookFloor = S.levels[S.levels.length - 1];
    const arcade = (cs, w) => cs.map(c => ({ c, w, y0: lookFloor + 1.1, y1: S.stage - 1.3, open: true }));
    const louvres = (cs) => cs.map(c => ({ c, w: 2.2, y0: S.stage + 0.5, y1: S.top - 1.5, louvred: true }));
    const AX = [63.6, 68.5, 73.5, 78.4], AZ = [45.4, 49.6, 54.4, 58.6], LX = [64.4, 68.4, 73.6, 77.6], LZ = [46.0, 49.4, 54.6, 58.0];
    // A window lights each landing of the stair, at a man's height over it, where it is clear of the frame's girders
    // (and the bands outside them), of its columns at the landing's ends, and of the doors; none crosses a flight.
    const landings = G.stairLights[sx < 0 ? 'left' : 'right'], bands = [...S.levels, S.stage, S.top];
    const lights = (k, doors, min = 0) => landings.filter(l => l.k === k && l.y > min && l.y < lookFloor - 0.1).flatMap(l => {
      const w = Math.min(2.2, l.s1 - l.s0 - 1.8), y0 = l.y + 1.0, y1 = l.y + 3.6, sc = (l.s0 + l.s1) / 2, c = k % 2 === 0 ? X(i0 + sc) : j0 + sc;
      if (w < 1.0 || bands.some(b => y1 > b - 1.4 && y0 < b + 1.0) || doors.some(d => y0 < d.y1 + 1.2 && y1 > d.y0 && c + w / 2 > d.u0 - 0.5 && c - w / 2 < d.u1 + 0.5)) return [];
      return [{ c, w, y0, y1 }];
    });
    const doorsF = [{ u0: street[0], u1: street[1], y0: 0, y1: 5.2 }], doorsI = sx > 0 ? [{ u0: CRADLE.z - 0.85, u1: CRADLE.z + 0.85, y0: CRADLE.deck, y1: CRADLE.deck + 2.5 }] : [];
    const doorsB = [...[0, 30, 60, 90, 120, 150, 180, ARCH.cornice].map(y => ({ u0: door[0], u1: door[1], y0: y, y1: y + DOOR_H })), { u0: bridge[0], u1: bridge[1], y0: lookFloor, y1: lookFloor + 2.6 }];
    const walls = [
      { along: 'x', u: [fx0, fx1], n: [j1, S.z1], wins: [...lights(2, doorsF), ...arcade(AX.map(X), 3.4), ...louvres(LX.map(X))], doors: doorsF },
      { along: 'z', u: [j0, j1], n: [nx0, nx1], wins: [...lights(1, []), ...arcade(AZ, 3.0), ...louvres(LZ)], doors: [] },
      { along: 'z', u: [j0, j1], n: [ix0, ix1], wins: [...lights(3, doorsI), ...arcade(AZ, 3.0), ...louvres(LZ)], doors: doorsI },
      { along: 'x', u: [fx0, fx1], n: [S.z0, j0], wins: [...lights(0, doorsB, ARCH.attic + 1), ...arcade(AX.slice(1).map(X), 3.4), ...louvres(LX.map(X))], doors: doorsB },
    ];
    for (const W of walls) {
      const holes = [...W.wins.map(o => ({ u0: o.c - o.w / 2, u1: o.c + o.w / 2, y0: o.y0, y1: o.y1 })), ...W.doors.map(d => ({ ...d, door: true }))];
      slab(W.along, W.u[0], W.u[1], 0, S.top, W.n[0], W.n[1], holes);
      const out = W.along === 'x' ? (W.n[0] > S.z0 + 1 ? 1 : -1) : Math.sign((W.n[0] + W.n[1]) / 2 - X((S.x0 + S.x1) / 2)) * 1;
      for (const o of W.wins) {
        if (o.open) arch_(W.along, o.c - o.w / 2, o.c + o.w / 2, o.y0, o.y1, W.n[0], W.n[1], out);
        else if (o.louvred) louvre_(W.along, o.c - o.w / 2, o.c + o.w / 2, o.y0, o.y1, W.n[0], W.n[1], out);
        else window_(W.along, o.c - o.w / 2, o.c + o.w / 2, o.y0, o.y1, W.n[0], W.n[1], out, Math.min(2.6, o.w));
      }
      for (const d of W.doors) { const uc = (d.u0 + d.u1) / 2, nc = (W.n[0] + W.n[1]) / 2, w = d.u1 - d.u0; W.along === 'x' ? ibox('facade', w + 1.0, 0.8, Math.abs(W.n[1] - W.n[0]) + 0.1, uc, d.y1 + 0.4, nc) : ibox('facade', Math.abs(W.n[1] - W.n[0]) + 0.1, 0.8, w + 1.0, nc, d.y1 + 0.4, uc); }
    }
    // the stone: plinth, quoins at the corners, a band at every landing, a corbel table and parapet at the top
    const outside = [
      { f: { nz: 1, off: S.z1 }, u: [fx0, fx1] }, { f: { nx: sx, off: S.x1 }, u: [S.z0, S.z1] }, { f: { nx: -sx, off: -S.x0 }, u: [S.z0, S.z1] },
    ];
    const putF = (f, mat, u, y, w, h, proud) => f.nz ? ibox(mat, w, h, proud, u, y, f.nz * (f.off + proud / 2)) : ibox(mat, proud, h, w, f.nx * (f.off + proud / 2) * (f.nx === sx ? 1 : 1), y, u);
    for (const { f, u } of outside) {
      const n0 = f.nz ? S.z1 : f.nx * f.off, dir = f.nz || f.nx;
      // (the plinth's facing has the street door cut through it)
      const holes = f.nz ? [{ u0: street[0], u1: street[1], y0: 0, y1: 5.2, door: true }] : [];
      const n = [n0, n0 + dir * 1.2].sort((a, b) => a - b);
      slab(f.nz ? 'x' : 'z', u[0] - (f.nz ? 1.2 : 0), u[1] + (f.nz ? 1.2 : 0), 0, PLINTH, n[0], n[1], holes, 'facade', true);
      putF(f, 'facade', (u[0] + u[1]) / 2, PLINTH + 0.5, u[1] - u[0] + 3.2, 1.0, 1.6);
      // over the street door a stone hood on corbels, and in it a granite threshold, level with the street and the floor
      if (f.nz) {
        const uc = (street[0] + street[1]) / 2, w = street[1] - street[0], z = S.z1 + 1.2;
        ibox('facade', w + 1.8, 0.5, 1.4, uc, 6.35, z + 0.7); ibox('facade', w + 2.1, 0.22, 1.6, uc, 6.71, z + 0.8);
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) ibox('facade', 0.5, 0.3, 0.45 + k * 0.4, uc + s * (w / 2 + 0.55), 5.35 + k * 0.3, z + (0.45 + k * 0.4) / 2);
        ibox('stone', w, 0.03, z - j1, uc, 0.015, (z + j1) / 2);
      }
      for (const y of [...S.levels.slice(1), S.stage]) putF(f, 'facade', (u[0] + u[1]) / 2, y - 0.6, u[1] - u[0] + 1.0, 0.9, 0.45);
      for (const c of [u[0] + 0.9, u[1] - 0.9]) { putF(f, 'facade', c, (PLINTH + 1 + 210) / 2, 1.8, 210 - PLINTH - 1, 0.55); putF(f, 'facade', c, (210 + S.top) / 2, 1.6, S.top - 210, 0.35); }
      for (let c = u[0] + 0.8; c < u[1]; c += 1.6) putF(f, 'facade', c, S.top - 0.6, 0.7, 1.2, 0.8);
      putF(f, 'facade', (u[0] + u[1]) / 2, S.top + 0.4, u[1] - u[0] + 1.8, 0.8, 1.0);
      putF(f, 'facade', (u[0] + u[1]) / 2, S.top + 2.4, u[1] - u[0] + 1.8, 3.2, 0.7);
    }
    // ... and on the back, where it rises clear of the attic, and between the main block's side and its own outer face
    { const f = { nz: -1, off: -S.z0 }, n0 = S.z0;
      const putB = (u, y, w, h, proud) => ibox('facade', w, h, proud, u, y, n0 - proud / 2);
      const [b0, b1] = xr(ox, S.x1);
      slab('x', b0, b1, 0, PLINTH, S.z0 - 1.2, S.z0, [], 'facade', true);
      for (const y of [...S.levels.slice(1), S.stage]) if (y > ARCH.attic) putB((fx0 + fx1) / 2, y - 0.6, fx1 - fx0 + 1.0, 0.9, 0.45);
      for (let c = fx0 + 0.8; c < fx1; c += 1.6) putB(c, S.top - 0.6, 0.7, 1.2, 0.8);
      putB((fx0 + fx1) / 2, S.top + 0.4, fx1 - fx0 + 1.8, 0.8, 1.0); putB((fx0 + fx1) / 2, S.top + 2.4, fx1 - fx0 + 1.8, 3.2, 0.7);
      void f; }
    // the lookout's ceiling (in the right-hand tower, open where the hoist's ropes and its counterweight come through:
    // HOIST.hole), the roof over the stage above it, and the spire: eight copper faces, a gilt roll on each hip, an iron
    // finial with a vane
    const hole = sx > 0 ? HOIST.hole : null;
    for (const [a, b, c, d] of hole ? [[0, i1 - i0, 0, hole[2]], [0, i1 - i0, hole[3], j1 - j0], [0, hole[0], hole[2], hole[3]], [hole[1], i1 - i0, hole[2], hole[3]]] : [[0, i1 - i0, 0, j1 - j0]])
      ibox('stone', b - a, 0.35, d - c, X(i0 + (a + b) / 2), S.stage + 0.18, j0 + (c + d) / 2);
    ibox('stone', i1 - i0, 0.35, j1 - j0, X((i0 + i1) / 2), S.top + 0.18, (j0 + j1) / 2);
    const cx = X((S.x0 + S.x1) / 2), cz = (S.z0 + S.z1) / 2, base = S.top + 4.0, r = 10.2, h = S.spire - base;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8).rotateY(Math.PI / 8).translate(cx, base + h / 2, cz), MAT.verdigris); G.scene.add(spire);
    for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * TAU / 8 + Math.PI / 8; beam('gilt', [cx + r * Math.cos(a - Math.PI / 8), base, cz + r * Math.sin(a - Math.PI / 8)], [cx, S.spire - 0.4, cz], 0.3, 0.3); }
    for (const [px, pz] of [[S.x0, S.z0], [S.x1, S.z0], [S.x0, S.z1], [S.x1, S.z1]]) {
      const x = X(px) + (X(px) > cx ? -0.9 : 0.9), z = pz + (pz > cz ? -0.9 : 0.9);
      ibox('facade', 2.2, 6, 2.2, x, S.top + 7, z); ipart('pyr', 'verdigris', 2.0, 9, 2.0, x, S.top + 14.5, z); ipart('pyr', 'gilt', 0.25, 1.2, 0.25, x, S.top + 19.6, z);
    }
    vane(cx, S.spire - 0.6, cz, 1.8, WIND_FROM);
    G.on = '';
  }
}

// ---- an eight-sided copper roof: straight faces from a ring of radius r (to its corners) at y up to a point h above,
// with a plain roll on each hip and `seams` rolls down each face
function copperRoof(x, y, z, r, h, seams) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8).rotateY(Math.PI / 8).translate(x, y + h / 2, z), MAT.verdigris); G.scene.add(m);
  const V = (k) => [x + r * Math.sin(k * TAU / 8 + Math.PI / 8), y, z + r * Math.cos(k * TAU / 8 + Math.PI / 8)], top = [x, y + h, z];
  for (let k = 0; k < 8; k++) {
    const a = V(k), b = V(k + 1), out = (p, d) => { const dx = p[0] - x, dz = p[2] - z, l = Math.hypot(dx, dz) || 1; return [p[0] + dx / l * d, p[1], p[2] + dz / l * d]; };
    beam('verdigris', out(a, 0.15), [top[0], top[1] - 0.6, top[2]], 0.5, 0.5);
    // the seams: each runs up its face's fall line from the eaves until it meets a hip
    const M = [(a[0] + b[0]) / 2, y, (a[2] + b[2]) / 2], t = [(b[0] - a[0]) / 2, 0, (b[2] - a[2]) / 2];
    for (let s = 1; s <= seams; s++) {
      const u = -1 + 2 * s / (seams + 1), f = 1 - Math.abs(u) - 0.04;
      const p0 = [M[0] + u * t[0], y, M[2] + u * t[2]], p1 = [p0[0] + f * (top[0] - M[0]), y + f * h, p0[2] + f * (top[2] - M[2])];
      beam('verdigris', out(p0, 0.06), out(p1, 0.06), 0.16, 0.16);
    }
  }
}

// ---- a weathervane of size s at (x, y, z), its banner turned to a: an iron stem with the four compass arms short and
// low on it, and above them the gilt banner, swallow-tailed, with its pointer and arrowhead (the banner is what reads)
function vane(x, y, z, s, a) {
  const q = rotY(a), along = (d) => [x + d * Math.cos(a), z - d * Math.sin(a)];
  icyl('rail', 0.09 * s, 4.2 * s, x, y + 2.1 * s, z);
  icyl('gilt', 0.22 * s, 0.3 * s, x, y + 1.0 * s, z);
  ibox('rail', 1.1 * s, 0.06 * s, 0.06 * s, x, y + 1.6 * s, z); ibox('rail', 0.06 * s, 0.06 * s, 1.1 * s, x, y + 1.6 * s, z);
  icyl('gilt', 0.16 * s, 0.24 * s, x, y + 4.25 * s, z);
  const vy = y + 3.4 * s;
  { const [bx, bz] = along(-1.3 * s); ibox('gilt', 2.2 * s, 1.3 * s, 0.07 * s, bx, vy, bz, q); }
  for (const sg of [-1, 1]) { const [tx, tz] = along(-2.75 * s); ipart('pyr', 'gilt', 0.65 * s, 0.75 * s, 0.07 * s, tx, vy + sg * 0.3 * s, tz, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, Math.PI / 2))); }
  { const [px, pz] = along(0.9 * s); ibox('gilt', 1.8 * s, 0.12 * s, 0.07 * s, px, vy, pz, q); }
  { const [hx, hz] = along(2.0 * s); ipart('pyr', 'gilt', 0.9 * s, 0.8 * s, 0.07 * s, hx, vy, hz, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, -Math.PI / 2))); }
}

// ---- the escape stairs' turrets, one at each back corner: sixteen-sided, of brick on a steel frame, with stone bands
// and a conical cap
function escapeTurret() {
  const E = ESCAPE, n = 16, seg = 2 * E.r * Math.tan(Math.PI / n), levels = [...E.levels, E.top], rc = E.r - E.wall / 2;
  const doorK = 4, streetK = 12;
  for (const sx of [-1, 1]) {
    const ex = sx * E.x;
    G.on = `escape turret ${sx < 0 ? 'left' : 'right'}`;
    for (let k = 0; k < n; k++) {
      const a = k * TAU / n, q = rotY(-(a + Math.PI / 2)), ca = Math.cos(a), sa = Math.sin(a), km = sx > 0 ? k : (n / 2 - k + n) % n;
      const holes = [];
      if (k === doorK) for (const y of E.levels) holes.push({ u0: -1.2, u1: 1.2, y0: y, y1: y + DOOR_H, door: true });
      if (k === streetK) holes.push({ u0: -1.2, u1: 1.2, y0: 0, y1: 4.0, door: true });
      // narrow windows up the stair, on the sides that look away from the building
      const looks = sa < 0.3 && k !== streetK;
      if (looks) for (let s = 0; s < levels.length - 1; s++) if ((s + km) % 3 === 0) { const ym = (levels[s] + levels[s + 1]) / 2; holes.push({ u0: -0.45, u1: 0.45, y0: ym - 2.6, y1: ym + 2.6 }); }
      const place = (t, r) => [ex + r * ca - t * sa, E.z + r * sa + t * ca];
      for (const [t0, t1, y0, y1] of pieces(-seg / 2, seg / 2, 0, E.top, holes)) { const [x, z] = place((t0 + t1) / 2, rc); ibox('brick', t1 - t0, y1 - y0, E.wall, x, (y0 + y1) / 2, z, q); }
      for (const [t0, t1, y0, y1] of pieces(-seg / 2, seg / 2, 0, E.top, holes.filter(h => h.door))) { const [x, z] = place((t0 + t1) / 2, rc); cbox(t1 - t0, y1 - y0, E.wall, x, (y0 + y1) / 2, z, q); }
      for (const h of holes) if (!h.door) { const [x, z] = place(0, rc); ibox('glazing', 0.9, h.y1 - h.y0, 0.05, x, (h.y0 + h.y1) / 2, z, q); ipart('arch', 'facade', 0.92, 0.9, E.wall + 0.02, x, h.y1 - 0.45, z, q); }
      // stone: the plinth, a band at every landing, corbels under the cap
      const S = (r, d, y0, y1, w = seg * r / E.r + 0.05) => { if (k === doorK || (Math.abs(k - doorK) === 1 && r > E.r + 0.5)) return; const [x, z] = place(0, r - d / 2); ibox('facade', w, y1 - y0, d, x, (y0 + y1) / 2, z, q); };
      if (k !== streetK) S(E.r + 0.8, 0.8, 0, PLINTH); else { for (const sg of [-1, 1]) { const [x, z] = place(sg * (seg / 2 + 1.3) / 2, E.r + 0.4); ibox('facade', (seg + 0.4) / 2 - 1.25, PLINTH, 0.8, x, PLINTH / 2, z, q); } const [x, z] = place(0, E.r + 0.4); ibox('facade', 2.6, PLINTH - 4.6, 0.8, x, (PLINTH + 4.6) / 2, z, q); }
      S(E.r + 1.1, 1.1, PLINTH, PLINTH + 1.0);
      // over the street door a stone hood on corbels, and in it a granite threshold
      if (k === streetK) {
        const at = (t, r, y, w, h, d) => { const [x, z] = place(t, r + d / 2); ibox('facade', w, h, d, x, y, z, q); };
        at(0, E.r + 0.8, 4.95, 3.5, 0.45, 1.3); at(0, E.r + 0.8, 5.28, 3.8, 0.2, 1.5);
        for (const sg of [-1, 1]) for (let j = 0; j < 2; j++) at(sg * 1.45, E.r + 0.8, 4.27 + j * 0.3, 0.4, 0.3, 0.45 + j * 0.4);
        const [x, z] = place(0, E.r - E.wall / 2 + 0.4); ibox('stone', 2.4, 0.03, E.wall + 0.8, x, 0.015, z, q);
      }
      for (const y of E.levels.slice(1)) S(E.r + 0.4, 0.4, y - 1.4, y - 0.5);
      S(E.r + 0.9, 0.9, E.top - 2.4, E.top - 1.2); S(E.r + 1.4, 1.4, E.top - 1.2, E.top);
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(E.r + 0.1, E.cap - E.top, 16).rotateY(Math.PI / 16).translate(ex, (E.top + E.cap) / 2, E.z), MAT.verdigris); G.scene.add(cap);
    vane(ex, E.cap - 0.4, E.z, 1.0, WIND_FROM);
  }
  G.on = '';
}

// ---- the stack, behind the building in a walled yard of its own in the town (city.js leaves the block to it). A square
// pedestal of brick with stone quoins, plinth, string course and cornice, the flue's chamber inside it and an iron soot
// door in its face to the street; on it the round shaft, of brick on a steel frame (structure.js), battered from 12.8 m
// across over the pedestal to 8 m at its head, its wall stepping thinner by thirds; a stone band at every ring of the
// frame and an iron band between; at the head the brick oversails in stone courses under an iron cope. A copper
// lightning conductor down its lee side. The flue comes into the pedestal's foot under the ground (tower.js); the smoke
// and the engine's exhaust leave at the top (engine.js).
const hoop = (mat, cx, cz, rOut, d, y0, y1, n = 32) => {
  const w = 2 * (rOut - d / 2) * Math.tan(Math.PI / n) + 0.04;
  for (let k = 0; k < n; k++) { const a = k * TAU / n; ibox(mat, w, y1 - y0, d, cx + (rOut - d / 2) * Math.cos(a), (y0 + y1) / 2, cz + (rOut - d / 2) * Math.sin(a), rotY(-(a + Math.PI / 2))); }
};
export const stackR = (y) => STACK.r0 + (STACK.r1 - STACK.r0) * (y - STACK.pedH) / (STACK.top - STACK.pedH);
export const stackWall = (y) => STACK.wall[Math.min(2, Math.floor(3 * (y - STACK.pedH) / (STACK.top - STACK.pedH)))];
export const STACK_RINGS = 9;
function stack() {
  const S = STACK, { x, z } = S, p = S.ped, ph = S.pedH, top = S.top, H = top - ph;
  G.tag = 'outside'; G.on = 'stack';
  // the pedestal: plinth, four brick walls round the flue's chamber, quoins, a string course, the cornice
  ibox('facade', 2 * p + 1.6, 2.0, 2 * p + 1.6, x, 1.0, z); ibox('facade', 2 * p + 1.0, 0.6, 2 * p + 1.0, x, 2.3, z);
  cbox(2 * p + 1.6, ph, 2 * p + 1.6, x, ph / 2, z);
  const wt = 3.2, y0 = 2.6, y1 = ph - 2.2, door = [-0.8, 0.8, y0, y0 + 2.4];
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const holes = nx === 1 ? [{ u0: door[0], u1: door[1], y0: door[2], y1: door[3] }] : [];
    for (const [u0, u1, ya, yb] of pieces(-p + 1.2, p - 1.2, y0, y1, holes)) {
      const uc = (u0 + u1) / 2, n = p - wt / 2;
      nx ? ibox('brick', wt, yb - ya, u1 - u0, x + nx * n, (ya + yb) / 2, z + uc) : ibox('brick', u1 - u0, yb - ya, wt, x + uc, (ya + yb) / 2, z + nz * n);
    }
    for (const u of [-p + 0.7, p - 0.7]) for (let y = y0; y < y1 - 0.1; y += 1.2) {
      const long = Math.round((y - y0) / 1.2) % 2 === 0, w = long ? 1.6 : 1.1, uu = u + Math.sign(u) * (long ? 0 : -0.25) * -1;
      nx ? ibox('facade', 1.5, 1.16, w, x + nx * (p - 0.7), y + 0.58, z + uu) : ibox('facade', w, 1.16, 1.5, x + uu, y + 0.58, z + nz * (p - 0.7));
    }
    nx ? ibox('facade', 0.5, 0.7, 2 * p, x + nx * (p + 0.1), (y0 + y1) / 2, z) : ibox('facade', 2 * p, 0.7, 0.5, x, (y0 + y1) / 2, z + nz * (p + 0.1));
  }
  ibox('facade', 2 * p + 0.8, 1.0, 2 * p + 0.8, x, y1 + 0.5, z); ibox('facade', 2 * p + 1.6, 1.2, 2 * p + 1.6, x, y1 + 1.6, z);
  // the soot door: iron, in a stone frame
  ibox('facade', 0.6, 3.2, 2.8, x + p + 0.05, y0 + 1.6, z); ibox('iron', 0.15, 2.4, 1.6, x + p + 0.32, y0 + 1.2, z);
  for (const dz of [-0.55, 0.55]) icyl('iron', 0.08, 2.2, x + p + 0.42, y0 + 1.2, z + dz);
  // the shaft
  const r0 = S.r0, r1 = S.r1, shaft = new THREE.CylinderGeometry(r1, r0, H, 48, 1, true);
  { const uv = shaft.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * (r0 + r1) / 2 / 4, uv.getY(i) * H / 4); }
  shaft.translate(x, ph + H / 2, z); G.scene.add(new THREE.Mesh(shaft, MAT.brick));
  const liner = new THREE.CylinderGeometry(r1 - stackWall(top - 1), r1 - stackWall(top - 1) + 0.1, 8, 32, 1, true).translate(x, top - 4, z);
  G.scene.add(new THREE.Mesh(liner, new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 1, side: THREE.BackSide })));
  for (let k = 0; k < 6; k++) { const ya = ph + H * k / 6, yb = ph + H * (k + 1) / 6; G.world.createCollider(G.R.ColliderDesc.cylinder((yb - ya) / 2, stackR(ya)).setTranslation(x, (ya + yb) / 2, z)); }
  hoop('facade', x, z, r0 + 0.5, 1.4, ph, ph + 1.4);                                                  // the shaft's base course
  for (let k = 1; k < STACK_RINGS; k++) {
    const y = ph + H * k / STACK_RINGS;
    hoop('facade', x, z, stackR(y) + 0.25, 0.6, y - 0.4, y + 0.4);
    const ym = y - H / STACK_RINGS / 2; hoop('iron', x, z, stackR(ym) + 0.08, 0.14, ym - 0.12, ym + 0.12, 24);
  }
  // the head: oversailing courses, a panel, more courses, the cope
  for (const [dr, ya, yb] of [[0.3, -9.4, -8.6], [0.6, -8.6, -7.8], [0.8, -3.4, -2.4], [1.1, -2.4, -1.4], [1.4, -1.4, -0.5]]) hoop('facade', x, z, r1 + dr, dr + 0.6, top + ya, top + yb);
  hoop('iron', x, z, r1 + 1.2, 1.7, top - 0.5, top);
  // the lightning conductor, down the lee side, and its points on the cope
  const lz = (y) => z - stackR(y) - 0.1;
  tube('copper', [x, top + 1.6, lz(top) - 1.0], [x, top - 0.4, lz(top) - 1.0], 0.04); tube('copper', [x, top - 0.4, lz(top) - 1.0], [x, top - 9.5, lz(top) - 0.3], 0.04);
  tube('copper', [x, top - 9.5, lz(top - 9.5)], [x, ph + 1.4, lz(ph + 1.4)], 0.04); tube('copper', [x, ph + 1.4, z - p - 0.9], [x, 0.1, z - p - 0.9], 0.04);
  G.tag = ''; G.on = '';
}

// ---- the coal yard, behind the building by the service door. A brick wall round it with a gate to the back street;
// a cart track of granite setts from the gate to the coal heap; staithes against the back wall by the door, bays of
// brick where the coal is tipped ready for the barrows, and the ash heap; the flue's access chamber, with its hatch,
// over the flue where it runs out under the yard. The coal is wheeled in through the service door and round the end of
// the boiler to its firing floor, and the ash out the same way: neither crosses the machine floor.
function coalYard() {
  const oz = TOWER.hz + TOWER.wall, X0 = -56, X1 = -10, Z0 = -(oz + 2.2), Z1 = -112, gate = [-42, -34], hw = 2.4;
  G.tag = 'outside'; G.on = 'yard';
  const wall = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), alongX = Math.abs(b[0] - a[0]) > 0.1, cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    alongX ? (ibox('brick', len, hw, 0.45, cx, hw / 2, cz), ibox('facade', len + 0.1, 0.18, 0.6, cx, hw + 0.09, cz), cbox(len, hw, 0.45, cx, hw / 2, cz))
      : (ibox('brick', 0.45, hw, len, cx, hw / 2, cz), ibox('facade', 0.6, 0.18, len + 0.1, cx, hw + 0.09, cz), cbox(0.45, hw, len, cx, hw / 2, cz));
    for (let t = 0; t <= len + 0.01; t += 6) { const px = a[0] + (b[0] - a[0]) * t / len, pz = a[1] + (b[1] - a[1]) * t / len; ibox('brick', 0.8, hw + 0.2, 0.8, px, (hw + 0.2) / 2, pz); }
  };
  wall([X0, Z0], [X0, Z1]); wall([X1, Z0], [X1, Z1]); wall([X0, Z1], [gate[0], Z1]); wall([gate[1], Z1], [X1, Z1]);
  for (const gx of gate) { ibox('facade', 1.0, 3.4, 1.0, gx, 1.7, Z1); cbox(1.0, 3.4, 1.0, gx, 1.7, Z1); ipart('pyr', 'facade', 1.2, 0.7, 1.2, gx, 3.75, Z1); }
  // the gates, folded back inside against the wall
  for (const [gx, s] of [[gate[0], 1], [gate[1], -1]]) {
    const z0 = Z1 + 0.6, len = (gate[1] - gate[0]) / 2 - 0.2, xs = gx + s * 0.5;
    for (let t = 0.1; t < len; t += 0.25) ibox('rail', 0.05, 2.1, 0.05, xs + s * 0.15, 1.15, z0 + t);
    for (const y of [0.3, 1.2, 2.1]) ibox('rail', 0.07, 0.1, len, xs + s * 0.15, y, z0 + len / 2);
  }
  // the cart track: two lines of granite setts from the gate to the heap
  for (const dx of [-0.8, 0.8]) ibox('stone', 0.5, 0.05, 30, -38 + dx, 0.025, Z1 + 15);
  // the coal heap, and the ash heap
  const heap = (mat, cx, cz, r, h, sx) => {
    const g = new THREE.ConeGeometry(r, h, 18, 3).scale(sx, 1, 1), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), k = (y + h / 2) / h; if (k > 0.02 && k < 0.98) pos.setY(i, y * (1 - 0.35 * Math.sin(k * Math.PI)) + 0.25 * Math.sin(i * 1.7)); }
    pos.needsUpdate = true; g.computeVertexNormals(); g.translate(cx, h / 2, cz);
    const m = new THREE.Mesh(g, MAT[mat]); m.receiveShadow = true; G.scene.add(m);
    G.world.createCollider(G.R.ColliderDesc.convexHull(new Float32Array(g.attributes.position.array)));
  };
  heap('coal', -24, -78, 8.5, 4.6, 1.5); heap('ash', -15, -55, 3.2, 1.6, 1.0);
  // the staithes: three bays against the back wall, beside the door
  const sz0 = Z0 + 0.2, sz1 = sz0 - 4.5;
  for (const bx of [-30.2, -26.4, -22.6, -18.8]) { ibox('brick', 0.45, 1.6, 4.5, bx, 0.8, (sz0 + sz1) / 2); cbox(0.45, 1.6, 4.5, bx, 0.8, (sz0 + sz1) / 2); ibox('facade', 0.6, 0.12, 4.6, bx, 1.66, (sz0 + sz1) / 2); }
  for (const bx of [-28.3, -24.5, -20.7]) { ibox('coal', 3.3, 1.1, 4.2, bx, 0.55, (sz0 + sz1) / 2 - 0.1); cbox(3.3, 1.1, 4.2, bx, 0.55, (sz0 + sz1) / 2 - 0.1); }
  // two barrows by the door, and a coal cart by the heap
  for (const [bx, bz, a] of [[-38.6, -46.2, 0.3], [-39.6, -48.4, -0.2]]) {
    const q = rotY(a), f = (u, v) => [bx + u * Math.cos(a) + v * Math.sin(a), bz - u * Math.sin(a) + v * Math.cos(a)];
    ibox('rail', 0.8, 0.45, 1.0, bx, 0.62, bz, q); { const [wx, wz] = f(0, 0.7); icyl('iron', 0.28, 0.08, wx, 0.28, wz, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, Math.PI / 2))); }
    for (const s of [-1, 1]) { const [hx, hz] = f(s * 0.32, -1.0); ibox('rail', 0.06, 0.06, 1.0, hx, 0.62, hz, q); }
  }
  { const cx = -36, cz = -92; ibox('rail', 2.0, 0.9, 1.8, cx, 1.35, cz); ibox('coal', 1.8, 0.2, 1.6, cx, 1.85, cz);
    for (const s of [-1, 1]) icyl('iron', 0.8, 0.12, cx + s * 1.12, 0.8, cz, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)));
    icyl('iron', 0.07, 2.4, cx, 0.8, cz, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)));
    for (const s of [-1, 1]) beam('rail', [cx + s * 0.8, 1.0, cz - 0.9], [cx + s * 0.6, 0.6, cz - 3.4], 0.1, 0.1);
    cbox(2.4, 1.8, 1.8, cx, 0.9, cz); }
  // the flue's access chambers: a stone curb and an iron hatch over the flue in the yard, and covers along the street
  for (const hz of [-66, -104]) { ibox('stone', 2.2, 0.1, 2.2, FLUE.x, 0.05, hz); ibox('iron', 1.6, 0.06, 1.6, FLUE.x, 0.11, hz); for (const d of [-0.5, 0.5]) icyl('iron', 0.09, 0.04, FLUE.x + d, 0.15, hz, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)); }
  for (let hz = -150; hz > FLUE.turn + 5; hz -= 50) icyl('iron', 0.5, 0.04, FLUE.x, 0.03, hz);
  lamp(X0 + 1.2, 0, -64); lamp(X1 - 1.2, 0, -100); lamp(-30, 0, Z0 - 0.8);
  G.tag = ''; G.on = '';
}
