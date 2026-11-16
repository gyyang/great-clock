// The static building: shell, galleries, stairs, lift cage, bridges, the dial,
// and the iron frame that carries the arbors. The town outside is city.js.
import * as THREE from 'three';
import { G, MAT, QX, ibox, icyl, cbox, sbox, tbox, tplane, beam, deck, rail, railRun, stair, lamp, cagePanel } from '../kit.js';
import { TOWER, LEVELS, DIAL, ARBOR, STAIRS, LIFT, BRIDGES, LEDGE, DEG, bobLanding } from '../layout.js';

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
  // brick piers break up the walls and give the light something to rake across
  for (const x of [-60, -40, -20, 0, 20, 40, 60]) tbox(MAT.brick, 3, H, 0.9, x, H / 2, -hz + 0.45);
  for (const sx of [-1, 1]) for (const z of [-22, 0, 22]) tbox(MAT.brick, 0.9, H, 3, sx * (hx - 0.45), H / 2, z);

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
  for (const x of [-70.5, -62, 62, 70.5]) ibox('stone', 3, H, 1.2, x, H / 2, zf + 0.6);
  for (const y of [70, 86, 214, 236]) ibox('stone', 2 * ox + 1, 2, 1.4, 0, y, zf + 0.7);
  for (let y = 8; y <= 62; y += 9) for (let x = -54; x <= 54; x += 6) {
    if (Math.abs(x) < 4 && y < 12) continue;
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
  // Zig-zag flights up the back wall: 30 m of climb each.
  for (let i = 0; i < ys.length - 1; i++) {
    if (i % 2 === 0) stair([S.xa, ys[i], S.zA], [S.xb, ys[i + 1], S.zA], S.width);
    else stair([S.xb, ys[i], S.zB], [S.xa, ys[i + 1], S.zB], S.width);
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

function bridges() {
  for (const [name, b] of Object.entries(BRIDGES)) {
    deck(-65, 65, b.z0, b.z1, b.y);
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
function frame() {
  const beams = [
    ['esc', 1.6, 1.1], ['esc', 8.3, 1.1], ['pivot', -6.25, 1.0], ['pivot', -12.6, 1.0],
    ['third', 3.2, 1.2], ['third', 10, 1.2], ['center', 18.3, 1.3], ['center', 26, 1.3],
    ['great', 24.2, 1.4], ['great', 30.5, 1.4], ['minute', 27.8, 1.0], ['minute', 35.2, 1.0],
  ];
  const qz90 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  for (const [name, z, r] of beams) {
    const a = ARBOR[name], yc = a.y - r - 1.0, len = 2 * TOWER.hx;
    cbox(len, 1.6, 1.0, 0, yc, z);
    ibox('iron', len, 0.16, 1.0, 0, yc + 0.72, z); ibox('iron', len, 0.16, 1.0, 0, yc - 0.72, z); ibox('iron', len, 1.28, 0.14, 0, yc, z);
    for (let x = -68; x <= 68; x += 4) ibox('iron', 0.1, 1.28, 0.9, x, yc, z);
    for (let x = -60; x <= 60; x += 20) { ibox('iron', 2.4, 0.06, 1.06, x, yc + 0.82, z); for (const dx of [-0.8, 0, 0.8]) for (const dz of [-0.35, 0.35]) ibox('rivet', 0.14, 0.1, 0.14, x + dx, yc + 0.88, z + dz); }
    // pillow block: iron housing, bronze bearing shell
    sbox('iron', r * 2 + 2.4, 0.5, 1.5, a.x, a.y - r - 0.45, z);
    sbox('iron', r * 2 + 1.2, r * 2 + 0.7, 1.2, a.x, a.y - 0.1, z);
    icyl('bronze', r + 0.3, 1.36, a.x, a.y, z, qz90);
    for (const dx of [-(r + 0.9), r + 0.9]) icyl('steel', 0.2, 0.5, a.x + dx, a.y - r - 0.1, z);
  }
}

// Riveted roof trusses, far overhead.
function trusses() {
  const y0 = 219, apex = 237, hx = TOWER.hx, top = (x) => y0 + (apex - y0) * (1 - Math.abs(x) / hx);
  const xs = [-70, -52.5, -35, -17.5, 0, 17.5, 35, 52.5, 70];
  for (const z of [-32, -16, 0, 16, 32]) {
    beam('iron', [-hx, y0, z], [hx, y0, z], 0.7, 0.45);
    beam('iron', [-hx, y0, z], [0, apex, z], 0.6, 0.45); beam('iron', [hx, y0, z], [0, apex, z], 0.6, 0.45);
    for (let i = 1; i < xs.length - 1; i++) {
      beam('iron', [xs[i], y0, z], [xs[i], top(xs[i]), z], 0.3, 0.3);
      const j = xs[i] < 0 ? i + 1 : i - 1;
      if (xs[i] !== 0) beam('iron', [xs[i], y0, z], [xs[j], top(xs[j]), z], 0.26, 0.26);
    }
  }
  for (const x of xs.slice(1, -1)) beam('iron', [x, top(x) + 0.4, -TOWER.hz], [x, top(x) + 0.4, TOWER.hz], 0.3, 0.3);
}

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
  shell(); galleries(); liftCage(); bridges(); bobLandings(); frame(); trusses(); decor();
}
