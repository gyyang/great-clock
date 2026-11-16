// The outside of the tower: what the town sees.
//
// The steel frame is inside the wall (structure.js). Out here it is dressed the way a
// tall building's frame is: every column line is a stone pier running unbroken from the
// plinth to the cornice, every girder a slight string course, and the bracing is hidden
// in the brick. The clock is the point of the building, so the front is composed round
// it: the dial fills a square stone panel between two giant piers.
//
// The manner is that of the works inside: a Victorian engine house grown to the size of
// a mountain, in the colours of the movement itself: the green of its enamel on the roofs,
// gilding on the ironwork, red brick and grey stone below. Each corner has a stair turret
// under a conical cap. Above the cornice come a lit attic, a steep mansard with dormers,
// and on its flat an iron-and-glass lamp room with a weathervane.
import * as THREE from 'three';
import { G, MAT, ibox, icyl, cbox } from '../kit.js';
import { TOWER, DIAL, LEDGE } from '../layout.js';
import { assembly, SECTION, MATERIAL } from '../structure/model.js';

const TAU = Math.PI * 2;
export const CROWN = { attic: 24, roof: 52, lantern: 20, cap: 12, inset: 5 };          // heights of the stages above the cornice, m
export const TURRET = { r: 8, top: 268 };

export function buildFacade() {
  G.tag = 'outside';
  const { hx, hz, H, wall } = TOWER, ox = hx + wall, oz = hz + wall, scene = G.scene;
  const xs = [], zs = [], levels = [30, 60, 90, 120, 150, 180, 219];
  for (let v = -60; v <= 60; v += 10) xs.push(v);
  for (let v = -30; v <= 30; v += 10) zs.push(v);
  const PLINTH = 14, CORNICE = H + wall + 4, panel = { x: 60, y0: 90, y1: 210 };
  // a box on one of the four faces: u along the face, y up, w wide, h tall, standing `proud` of the wall
  const faces = [{ nz: 1, off: oz, half: ox, lines: xs, front: true }, { nz: -1, off: oz, half: ox, lines: xs }, { nx: 1, off: ox, half: oz, lines: zs }, { nx: -1, off: ox, half: oz, lines: zs }];
  const put = (f, mat, u, y, w, h, proud) => f.nz ? ibox(mat, w, h, proud, u, y, f.nz * (f.off + proud / 2)) : ibox(mat, proud, h, w, f.nx * (f.off + proud / 2), y, u);

  for (const f of faces) {
    // plinth: a battered stone base, open at the door
    if (f.front) {
      for (const sg of [-1, 1]) { put(f, 'facade', sg * (f.half + 1.5 + 5) / 2, PLINTH / 2, f.half + 1.5 - 5, PLINTH, 1.6); cbox(f.half - 3.5, PLINTH, 1.6, sg * (f.half + 6.5) / 2, PLINTH / 2, oz + 0.8); }
      put(f, 'facade', 0, 9.5, 10, PLINTH - 5, 1.6);                                    // over the door
      for (const sg of [-1, 1]) put(f, 'facade', sg * 4.2, 2.5, 1.6, 5, 2.2);            // door jambs
      put(f, 'facade', 0, 5.6, 10.4, 1.2, 2.4);                                          // and its hood
    } else { put(f, 'facade', 0, PLINTH / 2, 2 * f.half + 3, PLINTH, 1.6); if (f.nz) cbox(2 * f.half + 3, PLINTH, 1.6, 0, PLINTH / 2, -(oz + 0.8)); else cbox(1.6, PLINTH, 2 * f.half + 3, f.nx * (ox + 0.8), PLINTH / 2, 0); }
    put(f, 'facade', 0, PLINTH + 0.6, 2 * f.half + 3.6, 1.2, 2.0);                       // plinth cap

    // piers on every column line, plinth to cornice. On the front the two that flank the dial are giants,
    // and those between them stop under the clock panel and start again above it.
    for (const u of f.lines) {
      const giant = f.front && Math.abs(u) === panel.x, w = giant ? 6.4 : 2.8, proud = giant ? 2.6 : 1.3;
      const runs = f.front && Math.abs(u) < panel.x ? [[PLINTH, panel.y0], [panel.y1, CORNICE - 6]] : [[PLINTH, CORNICE - 6]];
      for (const [y0, y1] of runs) {
        put(f, 'facade', u, (y0 + y1) / 2, w, y1 - y0, proud);
        put(f, 'facade', u, y0 + 1, w + 0.8, 2, proud + 0.4);                             // base
        put(f, 'facade', u, y1 - 1, w + 1.0, 2, proud + 0.5);                             // capital
      }
    }
    // string courses at every girder; on the front they stop either side of the clock panel
    for (const y of levels) {
      // (kept slight, so that the piers, not the storeys, are what the eye follows)
      if (f.front && y > panel.y0 && y < panel.y1) for (const sg of [-1, 1]) put(f, 'facade', sg * (panel.x + f.half) / 2, y - 0.5, f.half - panel.x, 1.1, 0.4);
      else put(f, 'facade', 0, y - 0.5, 2 * f.half, 1.1, 0.4);
    }
    // cornice: three oversailing courses
    for (const [dy, out, h] of [[-5, 1.2, 2], [-3, 2.4, 2], [-1, 3.6, 2.2]]) put(f, 'facade', 0, CORNICE + dy, 2 * f.half + 2 * out, h, out);
  }

  // ---- the clock panel: a square of stone with the dial let into it
  {
    const sh = new THREE.Shape();
    sh.moveTo(-panel.x, panel.y0); sh.lineTo(panel.x, panel.y0); sh.lineTo(panel.x, panel.y1); sh.lineTo(-panel.x, panel.y1); sh.closePath();
    const hole = new THREE.Path(); hole.absarc(DIAL.x, DIAL.y, DIAL.r + 0.4, 0, TAU, true); sh.holes.push(hole);
    for (const sg of [-1, 1]) {                                                           // the two doors out to the ledge
      const x = sg * LEDGE.doorX, y = LEDGE.y, p = new THREE.Path();
      p.moveTo(x - 1.5, y); p.lineTo(x + 1.5, y); p.lineTo(x + 1.5, y + 3.8); p.lineTo(x - 1.5, y + 3.8); p.closePath(); sh.holes.push(p);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: false, curveSegments: 96 }); g.translate(0, 0, oz);
    scene.add(new THREE.Mesh(g, MAT.facade));
    // a moulded rim round the dial
    const rim = new THREE.Mesh(new THREE.TorusGeometry(DIAL.r + 1.6, 1.3, 10, 128), MAT.facade); rim.position.set(DIAL.x, DIAL.y, oz + 0.7); scene.add(rim);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {                                // a lit porthole behind an iron grille in each corner of the square
      const x = sx * 49, y = DIAL.y + sy * 49;
      icyl('facade', 8.5, 0.9, x, y, oz + 1.0, q); icyl('window', 6.2, 0.3, x, y, oz + 1.4, q);
      for (const a of [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4]) ibox('rail', 12.6, 0.35, 0.3, x, y, oz + 1.7, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6.3, 0.45, 8, 48), MAT.gilt); ring.position.set(x, y, oz + 1.7); scene.add(ring);
      const hub = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.3, 8, 32), MAT.rail); hub.position.set(x, y, oz + 1.7); scene.add(hub);
    }
    // frame of the panel
    for (const sy of [panel.y0, panel.y1]) ibox('facade', 2 * panel.x, 2.4, 1.6, 0, sy, oz + 0.8);
    // corbels under the ledge, a pace apart: what it stands on
    for (let x = -LEDGE.hx + 2; x <= LEDGE.hx - 2; x += 6) { ibox('facade', 0.9, 2.6, LEDGE.z1 - oz, x, LEDGE.y - 1.7, (LEDGE.z1 + oz) / 2); ibox('facade', 0.9, 1.4, (LEDGE.z1 - oz) * 0.55, x, LEDGE.y - 3.6, oz + (LEDGE.z1 - oz) * 0.28); }
  }

  // ---- the crown: attic, roof, lantern, spire
  {
    const C = CROWN, ax = ox - C.inset, az = oz - C.inset, y0 = CORNICE, y1 = y0 + C.attic;
    const attic = new THREE.Mesh(new THREE.BoxGeometry(2 * ax, C.attic, 2 * az).translate(0, y0 + C.attic / 2, 0), MAT.brick); scene.add(attic);
    // an arcade of lit windows between stone piers, all the way round
    const bays = (half, n) => Array.from({ length: n }, (_, i) => -half + (i + 0.5) * 2 * half / n);
    for (const [nz, nx, half, n, off] of [[1, 0, ax, 13, az], [-1, 0, ax, 13, az], [0, 1, az, 7, ax], [0, -1, az, 7, ax]]) {
      const f = nz ? { nz, off, half } : { nx, off, half }, step = 2 * half / n;
      for (const u of bays(half, n)) {
        put(f, 'window', u, y0 + 11, step - 3.4, 13, 0.15);
        put(f, 'facade', u, y0 + 18.6, step - 3.0, 2.2, 0.5);                               // window head
        put(f, 'facade', u - step / 2, y0 + C.attic / 2, 2.4, C.attic, 0.8);                // pier
      }
      put(f, 'facade', half, y0 + C.attic / 2, 2.4, C.attic, 0.8);
      put(f, 'facade', 0, y0 + 1.2, 2 * half + 1.6, 2.4, 1.0); put(f, 'facade', 0, y1 - 1, 2 * half + 3.2, 2, 1.6); put(f, 'facade', 0, y1 + 0.8, 2 * half + 5, 1.6, 2.5);
    }
    // the roof: a steep slate mansard, ending in a flat with an iron cresting round it
    const tx = ax - 13, tz = az - 13, roof = new THREE.Mesh(frustum(ax + 2.5, az + 2.5, tx, tz, C.roof), MAT.verdigris);
    roof.position.y = y1 + 1.6; scene.add(roof);
    for (const nz of [-1, 1]) for (const row of [0.2, 0.55]) for (let k = 1; k <= 7; k++) {    // two rows of lit dormers on the long slopes
      const hw = (ax + 2.5) * (1 - row) + tx * row, zz = (az + 2.5) * (1 - row) + tz * row, x = -hw + k * 2 * hw / 8, y = y1 + 1.6 + C.roof * row;
      ibox('facade', 4.4, 5.6, 2.4, x, y + 2.6, nz * (zz - 0.2)); ibox('window', 2.4, 3.4, 0.3, x, y + 2.4, nz * (zz + 1.05)); ibox('verdigris', 5.4, 0.7, 3.6, x, y + 5.7, nz * (zz - 0.2));
    }
    const ly = y1 + 1.6 + C.roof;
    for (const [w, d, x, z] of [[2 * tx, 0.4, 0, tz], [2 * tx, 0.4, 0, -tz], [0.4, 2 * tz, tx, 0], [0.4, 2 * tz, -tx, 0]]) { ibox('verdigris', w + 1.6, 1.0, d + 1.6, x, ly + 0.5, z); ibox('gilt', w, 0.18, d, x, ly + 3.4, z); }
    for (let x = -tx; x <= tx + 0.1; x += 2 * tx / 28) for (const z of [-tz, tz]) { ibox('rail', 0.22, 4.2, 0.22, x, ly + 2.1, z); ibox('gilt', 0.5, 0.5, 0.5, x, ly + 4.4, z, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 4, 0, Math.PI / 4))); }
    for (let z = -tz; z <= tz + 0.1; z += 2 * tz / 12) for (const x of [-tx, tx]) { ibox('rail', 0.22, 4.2, 0.22, x, ly + 2.1, z); ibox('gilt', 0.5, 0.5, 0.5, x, ly + 4.4, z, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 4, 0, Math.PI / 4))); }
    // the lamp room: glass between iron mullions on a stone drum, under a zinc cap
    const R = 11;
    icyl('facade', R + 1.6, 4, 0, ly + 2, 0); icyl('rail', R + 2.2, 0.5, 0, ly + 4.25, 0);
    icyl('window', R - 0.6, C.lantern - 4, 0, ly + 4 + (C.lantern - 4) / 2, 0);
    for (let k = 0; k < 16; k++) { const a = k * TAU / 16; ibox('rail', 0.5, C.lantern - 4, 0.5, Math.cos(a) * R, ly + 4 + (C.lantern - 4) / 2, Math.sin(a) * R); }
    for (const h of [0.34, 0.67]) icyl('rail', R + 0.25, 0.4, 0, ly + 4 + (C.lantern - 4) * h, 0);
    icyl('rail', R + 1.8, 0.8, 0, ly + C.lantern + 0.4, 0);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(R + 2.4, C.cap, 16).translate(0, ly + C.lantern + 0.8 + C.cap / 2, 0), MAT.verdigris); scene.add(cap);
    // weathervane: a rod, the four quarters, and an arrow
    const vy = ly + C.lantern + 0.8 + C.cap;
    icyl('rail', 0.3, 16, 0, vy + 8, 0);
    ibox('rail', 9, 0.3, 0.3, 0, vy + 7, 0); ibox('rail', 0.3, 0.3, 9, 0, vy + 7, 0);
    const vq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6);
    ibox('gilt', 13, 0.5, 0.2, 0, vy + 12.5, 0, vq); ibox('gilt', 3.2, 2.6, 0.2, -5.2 * Math.cos(0.6), vy + 12.5, 5.2 * Math.sin(0.6), vq);
    const head = new THREE.Mesh(new THREE.ConeGeometry(1.3, 3.4, 4).rotateZ(-Math.PI / 2), MAT.gilt); head.position.set(7.6 * Math.cos(0.6), vy + 12.5, -7.6 * Math.sin(0.6)); head.rotation.y = 0.6; scene.add(head);
  }

  // ---- a stair turret at each corner, three-quarters round, under a conical cap
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (ox + 4.3), z = sz * (oz + 4.3), T = TURRET, r = T.r;      // set out from the corner, so that none of it comes through into the hall
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, T.top, 24).translate(x, T.top / 2, z), MAT.brick); scene.add(shaft);
    G.world.createCollider(G.R.ColliderDesc.cylinder(T.top / 2, r).setTranslation(x, T.top / 2, z));
    icyl('facade', r + 1.4, PLINTH, x, PLINTH / 2, z); icyl('facade', r + 1.8, 1.2, x, PLINTH + 0.6, z);
    for (const y of levels) icyl('facade', r + 0.5, 1.8, x, y - 0.6, z);
    // slit windows up the stair, on the side that faces outward
    for (let y = 22; y < T.top - 20; y += 15) { const a = Math.atan2(sz, sx) + (((y / 15) | 0) % 3 - 1) * 0.5; ibox('window', 0.7, 2.6, 0.5, x + Math.cos(a) * (r + 0.05), y, z + Math.sin(a) * (r + 0.05), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - a)); }
    // the top: a corbelled stone gallery with an iron rail, and a conical slate cap with an iron spike
    icyl('facade', r + 0.9, 1.4, x, T.top - 0.7, z); icyl('facade', r + 1.8, 1.4, x, T.top + 0.7, z); icyl('facade', r + 2.6, 1.0, x, T.top + 1.9, z);
    for (let k = 0; k < 16; k++) { const a = k * TAU / 16; ibox('rail', 0.16, 1.5, 0.16, x + Math.cos(a) * (r + 2.3), T.top + 3.15, z + Math.sin(a) * (r + 2.3)); }
    icyl('rail', r + 2.4, 0.14, x, T.top + 3.9, z);
    icyl('facade', r - 0.4, 7, x, T.top + 5.9, z);
    for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + 0.3; ibox('window', 0.8, 3, 0.5, x + Math.cos(a) * (r - 0.35), T.top + 6, z + Math.sin(a) * (r - 0.35), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - a)); }
    icyl('facade', r + 0.6, 1.0, x, T.top + 9.9, z);
    const capT = new THREE.Mesh(new THREE.ConeGeometry(r + 1.2, 30, 24).translate(x, T.top + 10.4 + 15, z), MAT.verdigris); scene.add(capT);
    icyl('rail', 0.18, 9, x, T.top + 40.4 + 4, z); ibox('rail', 2.4, 0.2, 0.2, x, T.top + 46, z); ibox('rail', 0.2, 0.2, 2.4, x, T.top + 46, z);

    // structurally: a steel core carrying its own brick, tied to the shell frame at every girder
    const A = assembly(`turret ${sx < 0 ? 'left' : 'right'} ${sz < 0 ? 'back' : 'front'}`, 'steel core of a corner stair turret');
    const skin = TAU * r * 0.6 * MATERIAL.brick.rho * 9.81;                                // N per metre of height: 0.6 m of brick round it
    A.member([x, 0, z], [x, T.top + 30, z], SECTION.box(3.2, 3.2, 0.12), MATERIAL.alloy, 'beam', 'core', 0, 0);
    for (let y = 30; y <= T.top; y += 30) { A.mass([x, y, z], skin * 30 / 9.81, 'brick'); A.brace([x, y, z], 'x').brace([x, y, z], 'z'); }
    A.mass([x, T.top + 30, z], 90e3, 'cap'); A.rest([x, 0, z], 'ground', 'fix');
  }
  G.tag = '';
}

// A four-sided roof whose slopes stop at a flat top: half-widths a x b at the eaves, c x d at the top.
function frustum(a, b, c, d, h) {
  const v = [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b], [-c, h, -d], [c, h, -d], [c, h, d], [-c, h, d]];
  const quads = [[0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0], [4, 7, 6, 5]], pos = [];
  for (const q of quads) for (const i of [q[0], q[1], q[2], q[0], q[2], q[3]]) pos.push(...v[i]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
