// The static building: shell, galleries, stairs, lift cage, bridges, the dial,
// and the iron frame that carries the arbors. The town outside is city.js.
//
// What carries the wheels and hangs the walkways is structure.js, which sizes it by
// analysis. Here: galleries bracketed off the walls with knee braces, and each flight
// of stairs resting every eight metres on a cantilever from the back wall.
import * as THREE from 'three';
import { G, MAT, QX, ibox, icyl, iknob, cbox, sbox, tbox, tplane, beam, tube, deck, rail, railRun, stair, lamp, cagePanel } from '../kit.js';
import { TOWER, LEVELS, DIAL, STAIRS, LIFT, BRIDGES, LEDGE, ROOF, DEG, bobLanding } from '../layout.js';
import { assembly, SECTION, MATERIAL } from '../structure/model.js';
import { EDGES } from './structure.js';

const TAU = Math.PI * 2;

function shell() {
  const { hx, hz, H, wall } = TOWER, ox = hx + wall, oz = hz + wall, scene = G.scene;

  cbox(6000, 2, 6000, 0, -1, 0);                                  // the ground, inside and out
  tplane(MAT.plate, -ox, ox, -oz, oz, 0, 4);
  const E = 3000;
  tplane(MAT.ground, -E, E, oz, E, 0); tplane(MAT.ground, -E, E, -E, -oz, 0);
  tplane(MAT.ground, -E, -ox, -oz, oz, 0); tplane(MAT.ground, ox, E, -oz, oz, 0);

  tbox(MAT.brick, 2 * ox, H, wall, 0, H / 2, -hz - wall / 2);
  tbox(MAT.brick, wall, H, 2 * hz, -hx - wall / 2, H / 2, 0);
  tbox(MAT.brick, wall, H, 2 * hz, hx + wall / 2, H / 2, 0);
  tbox(MAT.slate, 2 * ox, wall, 2 * oz, 0, H + wall / 2, 0);
  // (the brick is panels in a steel frame: columns every 10 m and a girder at every 30 m level, drawn by structure.js)

  // Front wall: a ground door, the dial opening, and two doors out to the ledge.
  const sh = new THREE.Shape();
  sh.moveTo(-ox, 0); sh.lineTo(-1.6, 0); sh.lineTo(-1.6, 3.4); sh.lineTo(1.6, 3.4); sh.lineTo(1.6, 0);
  sh.lineTo(ox, 0); sh.lineTo(ox, H); sh.lineTo(-ox, H); sh.closePath();
  const hole = new THREE.Path(); hole.absarc(DIAL.x, DIAL.y, DIAL.r, 0, TAU, true); sh.holes.push(hole);
  for (const sg of [-1, 1]) {
    const x = sg * LEDGE.doorX, y = LEDGE.y, p = new THREE.Path();
    p.moveTo(x - 1.3, y); p.lineTo(x + 1.3, y); p.lineTo(x + 1.3, y + 3.4); p.lineTo(x - 1.3, y + 3.4); p.closePath();
    sh.holes.push(p);
  }
  const fg = new THREE.ExtrudeGeometry(sh, { depth: wall, bevelEnabled: false, curveSegments: 96 });
  fg.translate(0, 0, hz);
  const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
  scene.add(new THREE.Mesh(fg, MAT.brick));
  const pos = new Float32Array(fg.attributes.position.array), idx = new Uint32Array(pos.length / 3);
  for (let i = 0; i < idx.length; i++) idx[i] = i;
  G.world.createCollider(G.R.ColliderDesc.trimesh(pos, idx));

  // The dial itself
  const glass = new THREE.Mesh(new THREE.CircleGeometry(DIAL.r + 0.4, 128), MAT.dial);
  glass.position.set(DIAL.x, DIAL.y, DIAL.z); scene.add(glass);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(DIAL.r, 1.4, 12, 128), MAT.bronze);
  bezel.position.copy(glass.position); scene.add(bezel);
  G.world.createCollider(G.R.ColliderDesc.cylinder(0.25, DIAL.r).setRotation(QX).setTranslation(DIAL.x, DIAL.y, DIAL.z));

  // Roof and cornice (seen from outside)
  ibox('stone', 2 * ox + 6, 4, 2 * oz + 6, 0, H + wall + 2, 0);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 70, 4, 1).rotateY(Math.PI / 4), MAT.slate);
  roof.scale.set((ox + 3) / Math.SQRT1_2, 1, (oz + 3) / Math.SQRT1_2);
  roof.position.set(0, H + wall + 4 + 35, 0); scene.add(roof);

  // Facade relief. The windows are person-sized: they are what tells you how big the dial is.
  const zf = hz + wall;
  for (let y = 8; y <= 62; y += 9) for (let x = -54; x <= 54; x += 6) {
    if (Math.abs(x) < 4 && y < 12) continue;
    if (Math.abs(x - Math.round(x / 10) * 10) < 2 || Math.abs(y - Math.round(y / 30) * 30) < 3.5) continue;     // not where a column or a girder runs
    ibox('stone', 1.9, 3.6, 0.3, x, y, zf + 0.1); ibox('window', 1.3, 3, 0.3, x, y, zf + 0.16);
  }
}

function galleries() {
  const { hx, hz } = TOWER, ys = [0, ...LEVELS], S = STAIRS;
  for (let li = 1; li < ys.length; li++) {
    const y = ys[li];
    deck(-hx, hx, -hz, -35, y);
    deck(-hx, -65, -35, hz, y); deck(65, hx, -35, hz, y);
    const pad = li % 2 ? [S.xb, S.xb + S.pad] : [S.xa - S.pad, S.xa];
    railRun('x', -35, -65, 65, y, [pad, [LIFT.x0 - 0.1, LIFT.x1 + 0.1]]);
    const gaps = Object.values(BRIDGES).filter(b => b.y === y).map(b => [b.z0, b.z1]);
    railRun('z', -65, -35, hz, y, gaps); railRun('z', 65, -35, hz, y, gaps);
    for (const x of [-48, -24, 0, 20, 48]) lamp(x, y, -35);
    for (const z of [-20, 0, 24]) { lamp(-65, y, z); lamp(65, y, z); }
    // cast-iron brackets back to the wall
    for (let x = -66; x <= 66; x += 6) beam('iron', [x, y - 3.4, -hz + 0.05], [x, y - 0.42, -35.3], 0.16, 0.16);
    for (const sx of [-1, 1]) for (let z = -31; z <= 39; z += 7) beam('iron', [sx * (hx - 0.05), y - 3.4, z], [sx * 65.3, y - 0.42, z], 0.16, 0.16);

    // stair landing
    if (li % 2) {
      const x0 = S.xb, x1 = S.xb + S.pad;
      deck(x0, x1, -35, -30, y); rail([x1, y, -35], [x1, y, -30]); rail([x0, y, -30], [x1, y, -30]);
    } else {
      const x0 = S.xa - S.pad, x1 = S.xa;
      deck(x0, x1, -35, -30, y); rail([x0, y, -35], [x0, y, -30]); rail([x0, y, -30], [x1, y, -30]);
      if (li === ys.length - 1) rail([x1, y, -35], [x1, y, -32.5]);
    }
  }
  // Zig-zag flights up the back wall: 30 m of climb each, carried off the wall.
  for (let i = 0; i < ys.length - 1; i++) {
    const [a, b] = i % 2 === 0 ? [[S.xa, ys[i], S.zA], [S.xb, ys[i + 1], S.zA]] : [[S.xb, ys[i], S.zB], [S.xa, ys[i + 1], S.zB]];
    stair(a, b, S.width); stairBrackets(a, b, S.width);
  }
}

// A flight this long cannot span from landing to landing. Every eight metres a cantilever
// comes out of the back wall under both stringers. Near the bottom, where a brace below
// would cut through the gallery's headroom, it is tied back to the wall from above (the tie
// lands on the wall-side stringer, clear of the treads); higher up it is braced from below.
function stairBrackets(a, b, width) {
  const n = Math.round(Math.abs(b[0] - a[0]) / 8), wall = -TOWER.hz + 0.06, zi = a[2] - width / 2, zo = a[2] + width / 2;
  for (let k = 1; k < n; k++) {
    const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n - 0.44;
    beam('iron', [x, y, wall], [x, y, zo + 0.2], 0.32, 0.2);
    ibox('iron', 0.6, 0.8, 0.07, x, y, wall);                                         // wall plate
    for (const z of [zi, zo]) for (const dx of [-0.07, 0.07]) iknob('rivet', 0.022, x + dx, y + 0.18, z);    // stringer cleats
    if (y - a[1] > 9) { beam('iron', [x, y - 5.2, wall], [x, y - 0.14, zi - 0.4], 0.2, 0.16); ibox('iron', 0.5, 0.7, 0.07, x, y - 5.2, wall); }
    else { tube('steel', [x, y + 5.6, wall], [x, y + 0.2, zi - 0.16], 0.035); ibox('iron', 0.5, 0.5, 0.07, x, y + 5.6, wall); iknob('steel', 0.07, x, y + 0.2, zi - 0.16); }
  }
}

function liftCage() {
  const L = LIFT, ys = [0, ...LEVELS], xm = (L.xu + L.xd) / 2;
  cagePanel(L.x0, L.x1, 2.6, L.top, L.z1 + 0.05, L.z1 + 0.05);
  cagePanel(L.x0, L.x0, 2.6, L.top, L.z0, L.z1);
  cagePanel(L.x1, L.x1, 2.6, L.top, L.z0, L.z1);
  cagePanel(xm, xm, 2.6, 177, L.z0, L.z1);
  const zb = L.z0 - 0.05;
  cagePanel(L.x0, L.x1, 2.6, ys[1] - 0.35, zb, zb);
  for (let li = 1; li < ys.length - 1; li++) cagePanel(L.x0, L.x1, ys[li] + 2.6, ys[li + 1] - 0.35, zb, zb);
  cagePanel(L.x0, L.x1, ys[ys.length - 1] + 2.6, L.top, zb, zb);
  for (const x of [L.x0, xm, L.x1]) for (const z of [L.z0, L.z1]) ibox('iron', 0.3, L.top, 0.3, x, L.top / 2, z);
  ibox('iron', L.x1 - L.x0 + 0.6, 0.5, L.z1 - L.z0 + 0.6, xm, L.top + 0.25, L.z);
  for (const x of [L.xu, L.xd]) icyl('bronze', 1.6, 0.8, x, L.top + 1.2, L.z, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
}

// The parapet of a crossing is its girder: a lattice 1.2 m deep along each edge, panels a
// quarter of the hanger spacing, diagonals falling toward the middle of each bay (in tension).
const PANEL = 8.75 / 4, GIRDER_H = 1.24;
function latticeGirder(name, y, z, width, wallAt = null) {
  const top = y + GIRDER_H, x0 = -65, x1 = 65, lo = y - 0.2, alloy = MATERIAL.alloy;
  const A = assembly(`crossing ${name} ${z.toFixed(2)}`, 'lattice parapet girder, hung from the roof');
  const tubeOf = (side) => SECTION.box(side, side, side / 12);
  const bar = (a, b, side, label) => { beam('iron', a, b, side, side); A.member(a, b, tubeOf(side), alloy, 'beam', label); };
  beam('iron', [x0, top, z], [x1, top, z], 0.2, 0.14); A.member([x0, top, z], [x1, top, z], SECTION.box(0.2, 0.14, 0.014), alloy, 'beam', 'top chord');
  A.member([x0, lo, z], [x1, lo, z], SECTION.box(0.42, 0.18, 0.02), alloy, 'beam', 'bottom chord');           // the deck's edge beam (drawn by deck())
  const first = Math.ceil((x0 - ROOF.purlins[0]) / PANEL), deckLoad = (120 + 400) * width / 2;                // kg per metre of edge: grating and beams, and a crowd
  for (let i = first; ROOF.purlins[0] + i * PANEL < x1; i++) {
    const xa = Math.max(x0, ROOF.purlins[0] + i * PANEL), xb = Math.min(x1, ROOF.purlins[0] + (i + 1) * PANEL), k = ((i % 4) + 4) % 4;
    bar([xa, lo, z], [xa, top, z], 0.1, 'vertical');
    if (k < 2) bar([xa, top, z], [xb, lo, z], 0.1, 'diagonal'); else bar([xa, lo, z], [xb, top, z], 0.1, 'diagonal');
    if (k === 0) ibox('iron', 0.34, 0.3, 0.02, xa, top - 0.1, z);                           // gusset where a hanger takes the load
    A.mass([xa, lo, z], deckLoad * (xb - xa), 'deck');
  }
  A.rest([x0, lo, z], 'shell left').rest([x1, lo, z], 'shell right', 'yz');              // by way of the side galleries; one end fixed, the other free to slide
  // an edge that runs along a wall sits on corbels built into it, wherever there is wall to build into
  if (wallAt) for (let x = ROOF.purlins[0]; x < x1; x += 2 * PANEL) if (wallAt(x)) { A.rest([x, lo, z], 'shell front'); ibox('stone', 0.5, 0.7, 0.9, x, lo - 0.55, z + 0.25); }
  EDGES.push({ name: A.name, y: top + 0.06, yc: top, z });
}

function bridges() {
  for (const [name, b] of Object.entries(BRIDGES)) {
    deck(-65, 65, b.z0, b.z1, b.y);
    latticeGirder(name, b.y, b.z0 - 0.1, b.z1 - b.z0); latticeGirder(name, b.y, b.z1 + (name === 'balcony' ? -0.45 : 0.1), b.z1 - b.z0,          // (the balcony's girder stands clear of the wall, so its hangers can pass the dial's rim)
      name === 'balcony' ? (x) => Math.hypot(x - DIAL.x, b.y - DIAL.y) > DIAL.r + 1 : null);   // the balcony runs along the front wall, except across the dial
    rail([-65, b.y, b.z0], [65, b.y, b.z0]);
    if (name !== 'balcony') rail([-65, b.y, b.z1], [65, b.y, b.z1]);
    for (const x of [-45, -15, 15, 45]) lamp(x, b.y, b.z0);
  }
  const g = LEDGE;
  deck(-g.hx, g.hx, g.z0, g.z1, g.y);
  rail([-g.hx, g.y, g.z1], [g.hx, g.y, g.z1]);
  rail([-g.hx, g.y, g.z0], [-g.hx, g.y, g.z1]); rail([g.hx, g.y, g.z0], [g.hx, g.y, g.z1]);
  for (const x of [-40, 0, 40]) lamp(x, g.y, g.z1);
}

function bobLandings() {
  // The landing sits just above the bob's deck and reaches out over it, so the
  // deck slides in underneath and you step down onto it as the swing pauses.
  const bl = bobLanding(), y = bl.y + 0.13;
  for (const sg of [1, -1]) {
    const xA = sg * bl.x, xB = sg * (bl.x + 6);
    tbox(MAT.plate, 1.75, 0.08, 4, sg * (bl.x - 0.85), y - 0.04, -10);
    rail([xA, y, -13], [xA, y, -12]); rail([xA, y, -8], [xA, y, -7]);
    deck(Math.min(xA, xB), Math.max(xA, xB), -13, -7, y);
    rail([xA, y, -13], [xB, y, -13]); rail([xA, y, -7], [xB, y, -7]);
    rail([xB, y, -13], [xB, y, -11.2]); rail([xB, y, -8.8], [xB, y, -7]);
    stair([sg * (bl.x + 6 + y / Math.tan(32 * DEG)), 0, -10], [xB, y, -10], 2.3);
    for (const z of [-12.7, -7.3]) ibox('iron', 0.4, y - 0.4, 0.4, sg * (bl.x + 4.6), (y - 0.4) / 2, z);
    lamp(sg * (bl.x + 5.8), y, -13);
  }
}

// Wall-to-wall iron I-beams with pillow blocks: the "plates" of this movement.
function decor() {
  const { hx, hz, H } = TOWER;
  // copper steam mains in the corners
  for (const sx of [-1, 1]) for (const z of [-hz + 1.2, hz - 1.2]) {
    icyl('copper', 0.6, H, sx * (hx - 1.2), H / 2, z);
    for (let y = 15; y < H; y += 30) icyl('bronze', 0.85, 0.5, sx * (hx - 1.2), y, z);
  }
  // boiler
  const qzr = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  const bx = -45, bz = -22;
  icyl('copper', 5, 16, bx, 6.2, bz, qzr);
  G.world.createCollider(G.R.ColliderDesc.cylinder(8, 5).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }).setTranslation(bx, 6.2, bz));
  for (const dx of [-8, 8]) { const s = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), MAT.copper); s.scale.x = 0.45; s.position.set(bx + dx, 6.2, bz); G.scene.add(s); }
  for (const dx of [-6, -2, 2, 6]) icyl('bronze', 5.12, 0.5, bx + dx, 6.2, bz, qzr);
  for (const dx of [-5, 5]) sbox('iron', 2, 3, 8, bx + dx, 1.5, bz);
  ibox('iron', 3.2, 2.6, 0.5, bx, 2.2, bz + 4.6);
  ibox('fire', 2.2, 1.2, 0.2, bx, 2.0, bz + 4.9);
  icyl('copper', 0.9, H - 11, bx, 11 + (H - 11) / 2, bz);
  icyl('bronze', 1.2, 0.6, bx, 11.4, bz);
}

export function buildTower() {
  shell(); galleries(); liftCage(); bridges(); bobLandings(); decor();
}
