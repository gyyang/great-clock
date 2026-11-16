// The outside of the tower: what the town sees.
//
// The steel frame is inside the wall (structure.js). Out here it is dressed the way a
// tall building's frame is: every column line is a stone pier running unbroken from the
// plinth to the cornice, every girder a string course, and the bracing is hidden in the
// brick. The clock is the point of the building, so the front is composed round it: the
// dial fills a square stone panel between two giant piers. Above the cornice the tower
// keeps rising: a lit attic, a steep copper roof, a lantern and a gilded spire, with a
// domed stair turret at each corner. The lessons are those of the Mecca clock tower:
// unbroken verticals, the structure clothed, ornament saved for the clock and the crown.
import * as THREE from 'three';
import { G, MAT, ibox, icyl, isph, cbox } from '../kit.js';
import { TOWER, DIAL, LEDGE } from '../layout.js';
import { assembly, SECTION, MATERIAL } from '../structure/model.js';

const TAU = Math.PI * 2;
export const CROWN = { attic: 24, roof: 100, lantern: 22, spire: 46, inset: 5 };       // heights of the stages above the cornice, m
export const TURRET = { r: 8, top: 268 };

export function buildFacade() {
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
    // a moulded rim round the dial, and a gilt boss in each corner of the square
    const rim = new THREE.Mesh(new THREE.TorusGeometry(DIAL.r + 1.6, 1.3, 10, 128), MAT.facade); rim.position.set(DIAL.x, DIAL.y, oz + 0.7); scene.add(rim);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      icyl('facade', 8.5, 0.8, sx * 49, DIAL.y + sy * 49, oz + 1.0, q); icyl('gilt', 6.4, 0.5, sx * 49, DIAL.y + sy * 49, oz + 1.5, q);
      icyl('facade', 2.2, 0.6, sx * 49, DIAL.y + sy * 49, oz + 1.9, q);
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
    // the roof: four copper slopes, ending in a platform that the lantern stands on
    const top = 9, roof = new THREE.Mesh(frustum(ax + 2.5, az + 2.5, top, top * az / ax, C.roof), MAT.verdigris);
    roof.position.y = y1 + 1.6; scene.add(roof);
    for (let k = 1; k <= 5; k++) {                                                          // lit dormers in two rows on the long slopes
      for (const nz of [-1, 1]) for (const row of [0.16, 0.38]) {
        const t = row, hw = (ax + 2.5) * (1 - t) + top * t, zz = (az + 2.5) * (1 - t) + top * az / ax * t;
        const x = -hw + k * 2 * hw / 6; ibox('window', 2.2, 3.2, 0.4, x, y1 + 1.6 + C.roof * t + 2.2, nz * (zz - 0.6)); ibox('verdigris', 3.4, 1.0, 3.0, x, y1 + 1.6 + C.roof * t + 4.3, nz * (zz - 1.2));
      }
    }
    const ly = y1 + 1.6 + C.roof;
    icyl('facade', top + 1.5, 1.6, 0, ly + 0.8, 0);
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8; icyl('facade', 0.9, C.lantern, Math.cos(a) * (top - 1), ly + C.lantern / 2, Math.sin(a) * (top - 1)); }
    icyl('window', top - 2.6, C.lantern - 4, 0, ly + C.lantern / 2, 0);                      // the light inside it
    icyl('facade', top + 1.2, 2, 0, ly + C.lantern + 1, 0);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(top + 0.6, C.spire, 8).translate(0, ly + C.lantern + 2 + C.spire / 2, 0), MAT.verdigris); scene.add(spire);
    const tip = ly + C.lantern + 2 + C.spire;
    isph('gilt', 2.6, 0, tip + 1.5, 0); icyl('gilt', 0.35, 14, 0, tip + 9, 0); isph('gilt', 1.1, 0, tip + 16.5, 0);
  }

  // ---- a stair turret at each corner, three-quarters round, with a dome
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * ox, z = sz * oz, T = TURRET, r = T.r;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, T.top, 24).translate(x, T.top / 2, z), MAT.brick); scene.add(shaft);
    G.world.createCollider(G.R.ColliderDesc.cylinder(T.top / 2, r).setTranslation(x, T.top / 2, z));
    icyl('facade', r + 1.4, PLINTH, x, PLINTH / 2, z); icyl('facade', r + 1.8, 1.2, x, PLINTH + 0.6, z);
    for (const y of levels) icyl('facade', r + 0.5, 1.8, x, y - 0.6, z);
    // slit windows up the stair, on the side that faces outward
    for (let y = 22; y < T.top - 20; y += 15) { const a = Math.atan2(sz, sx) + (((y / 15) | 0) % 3 - 1) * 0.5; ibox('window', 0.7, 2.6, 0.5, x + Math.cos(a) * (r + 0.05), y, z + Math.sin(a) * (r + 0.05), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - a)); }
    // belvedere: a ring of columns under the dome
    icyl('facade', r + 1.6, 2, x, T.top + 1, z);
    for (let k = 0; k < 10; k++) { const a = k * TAU / 10; icyl('facade', 0.7, 12, x + Math.cos(a) * (r - 0.4), T.top + 8, z + Math.sin(a) * (r - 0.4)); }
    icyl('window', r - 2.4, 9, x, T.top + 7.5, z);
    icyl('facade', r + 1.4, 2, x, T.top + 15, z);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r + 0.6, 24, 12, 0, TAU, 0, Math.PI / 2), MAT.verdigris); dome.scale.y = 1.35; dome.position.set(x, T.top + 16, z); scene.add(dome);
    isph('gilt', 1.5, x, T.top + 16 + (r + 0.6) * 1.35 + 1, z); icyl('gilt', 0.22, 8, x, T.top + 16 + (r + 0.6) * 1.35 + 5.5, z);

    // structurally: a steel core carrying its own brick, tied to the shell frame at every girder
    const A = assembly(`turret ${sx < 0 ? 'left' : 'right'} ${sz < 0 ? 'back' : 'front'}`, 'steel core of a corner stair turret');
    const skin = TAU * r * 0.6 * MATERIAL.brick.rho * 9.81;                                // N per metre of height: 0.6 m of brick round it
    A.member([x, 0, z], [x, T.top + 30, z], SECTION.box(3.2, 3.2, 0.12), MATERIAL.alloy, 'beam', 'core', 0, 0);
    for (let y = 30; y <= T.top; y += 30) { A.mass([x, y, z], skin * 30 / 9.81, 'brick'); A.brace([x, y, z], 'x').brace([x, y, z], 'z'); }
    A.mass([x, T.top + 30, z], 180e3, 'dome'); A.rest([x, 0, z], 'ground', 'fix');
  }
}

// A four-sided roof whose slopes stop at a flat top: half-widths a x b at the eaves, c x d at the top.
function frustum(a, b, c, d, h) {
  const v = [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b], [-c, h, -d], [c, h, -d], [c, h, d], [-c, h, d]];
  const quads = [[0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0], [4, 7, 6, 5]], pos = [];
  for (const q of quads) for (const i of [q[0], q[1], q[2], q[0], q[2], q[3]]) pos.push(...v[i]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
