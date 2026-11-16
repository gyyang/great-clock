// The static building: shell, galleries, stairs, lift cage, bridges, the dial,
// and the iron frame that carries the arbors. The town outside is city.js.
//
// What carries the wheels and hangs the walkways is structure.js, which sizes it by
// analysis. Here: galleries bracketed off the walls with knee braces, and each flight
// of stairs resting every eight metres on a cantilever from the back wall.
import * as THREE from 'three';
import { G, MAT, QX, ibox, icyl, isph, iknob, cbox, sbox, tbox, tplane, beam, tube, deck, rail, railRun, stair, lamp, cagePanel } from '../kit.js';
import { TOWER, LEVELS, DIAL, STAIRS, LIFT, BRIDGES, ROOF, DEG, GRAV, bobLanding, ARCH, STAIR_TOWER, ESCAPE, STACK, FLUE, SERVICE, LAMP, PORTAL, GREAT_WINDOW, CRADLE, ENGINE, FLOOR, HOIST } from '../layout.js';
import { assembly, SECTION, MATERIAL } from '../structure/model.js';
import { doorway } from './doors.js';
import { EDGES, LAMP_FLOOR } from './structure.js';
import { traceryBays, lightsOf, opening } from './facade.js';

const TAU = Math.PI * 2;

// The lancets behind the tracery (facade.js), as openings [u0, u1, sill, spring, apex] in the wall of the face that
// matches, and whether each is glazed (the sides' windows) or louvred (the top storey's, which ventilate the roof space).
const LIGHTS = traceryBays().flatMap(b => b.f.front && !b.top ? [] : lightsOf(b).map(l => ({ face: b.f.nz ? (b.f.nz > 0 ? 'front' : 'back') : (b.f.nx > 0 ? 'right' : 'left'), hole: [l.u0, l.u1, l.sill, l.spring, l.apex], glazed: !b.top })));
const lightsIn = (face) => LIGHTS.filter(l => l.face === face);

// A wall across the front or the back of the hall, its inner face at z (it runs to z + wall), pierced by openings
// [x0, x1, y0, y1, apex?] (those at the floor are notches in its outline) and, on the front, by the dial.
function pierced(z, holes, dial) {
  const { hx, H, wall } = TOWER, ox = hx + wall;
  const ground = holes.filter(h => h[2] <= 0).sort((a, b) => a[0] - b[0]), up = holes.filter(h => h[2] > 0);
  const sh = new THREE.Shape(); sh.moveTo(-ox, 0);
  for (const [x0, x1, , y1] of ground) { sh.lineTo(x0, 0); sh.lineTo(x0, y1); sh.lineTo(x1, y1); sh.lineTo(x1, 0); }
  sh.lineTo(ox, 0); sh.lineTo(ox, H); sh.lineTo(-ox, H); sh.closePath();
  for (const h of up) { const p = new THREE.Path(); opening(p, ...h); sh.holes.push(p); }
  if (dial) { const hole = new THREE.Path(); hole.absarc(DIAL.x, DIAL.y, DIAL.r, 0, TAU, true); sh.holes.push(hole); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: wall, bevelEnabled: false, curveSegments: 96 });
  g.translate(0, 0, z);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
  G.scene.add(new THREE.Mesh(g, MAT.brick));
  const pos = new Float32Array(g.attributes.position.array), idx = new Uint32Array(pos.length / 3);
  for (let i = 0; i < idx.length; i++) idx[i] = i;
  G.world.createCollider(G.R.ColliderDesc.trimesh(pos, idx));
}

// A side wall of the hall (sx: which), pierced by its lancets. What collides is the whole wall, solid: the glass lets
// no one through, and the louvres no one either.
function sideWall(sx) {
  const { hx, hz, H, wall } = TOWER, sh = new THREE.Shape(), lights = lightsIn(sx > 0 ? 'right' : 'left');
  sh.moveTo(-hz, 0); sh.lineTo(hz, 0); sh.lineTo(hz, H); sh.lineTo(-hz, H); sh.closePath();
  for (const l of lights) { const p = new THREE.Path(); opening(p, ...l.hole); sh.holes.push(p); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: wall, bevelEnabled: false, curveSegments: 6 });
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
  g.rotateY(-Math.PI / 2).translate(sx > 0 ? hx + wall : -hx, 0, 0);          // (the outline's x along +z, its thickness along -x)
  G.scene.add(new THREE.Mesh(g, MAT.brick));
  cbox(wall, H, 2 * hz, sx * (hx + wall / 2), H / 2, 0);
  // the leaded lights, in the middle of the wall's thickness: diamond quarries of glass in lead cames
  const shapes = lights.filter(l => l.glazed).map(l => { const q = new THREE.Shape(); opening(q, ...l.hole); return q; });
  const gl = new THREE.ShapeGeometry(shapes, 6); gl.rotateY(-Math.PI / 2).translate(sx * (hx + wall / 2), 0, 0);
  G.scene.add(new THREE.Mesh(gl, leaded()));
}
let LEADED = null;
function leaded() {
  if (LEADED) return LEADED;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(178, 196, 182, 0.42)'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${200 + Math.random() * 40 | 0}, ${205 + Math.random() * 40 | 0}, ${190 + Math.random() * 30 | 0}, 0.06)`; x.fillRect(Math.random() * 256, Math.random() * 256, 6, 3); }
  x.strokeStyle = 'rgb(38, 38, 40)'; x.lineWidth = 5;
  for (let k = -2; k <= 2; k++) { x.beginPath(); x.moveTo(k * 128, 0); x.lineTo(k * 128 + 256, 256); x.stroke(); x.beginPath(); x.moveTo(k * 128, 256); x.lineTo(k * 128 + 256, 0); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 0.62, 1 / 0.9); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  LEADED = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.18, metalness: 0.15, side: THREE.DoubleSide, depthWrite: false });
  LEADED.userData.outdoor = true;
  return LEADED;
}

// The doors through the hall's walls: the main portal under the dial; a door into each stair tower from the floor and
// from each side gallery; into each escape turret from the floor and from the back gallery; and the service door by the
// boiler, from the coal yard. [x0, x1, y0, y1]
const T = STAIR_TOWER, H = HOIST, DOOR_H = 3.4, STREET_DOOR = 3.4;
export const DOORS = {
  front: [[-PORTAL.w / 2, PORTAL.w / 2, 0, PORTAL.h], ...[-1, 1].flatMap(sx => [0, ...LEVELS].map(y => [sx < 0 ? -T.door[1] : T.door[0], sx < 0 ? -T.door[0] : T.door[1], y, y + DOOR_H]))],
  back: [...[-1, 1].flatMap(sx => ESCAPE.levels.filter(y => y < TOWER.H).map(y => [sx < 0 ? -ESCAPE.door[1] : ESCAPE.door[0], sx < 0 ? -ESCAPE.door[0] : ESCAPE.door[1], y, y + DOOR_H])),
    [SERVICE.x0, SERVICE.x1, 0, SERVICE.h]],
};

function shell() {
  const { hx, hz, H, wall } = TOWER, ox = hx + wall, oz = hz + wall, scene = G.scene;

  G.ground = cbox(6000, 2, 6000, 0, -1, 0);                       // the ground, inside and out
  tplane(MAT.plate, -ox, ox, -oz, oz, 0, 4);
  const E = 3000;
  tplane(MAT.ground, -E, E, oz, E, 0); tplane(MAT.ground, -E, E, -E, -oz, 0);
  tplane(MAT.ground, -E, -ox, -oz, oz, 0); tplane(MAT.ground, ox, E, -oz, oz, 0);

  pierced(-hz - wall, [...DOORS.back, ...lightsIn('back').map(l => l.hole)], false);
  sideWall(-1); sideWall(1);
  // (the brick is panels in a steel frame: columns every 10 m and a girder at every 30 m level, drawn by structure.js)

  // Front wall: the portal, the stair towers' doors, and the dial opening.
  const GW = GREAT_WINDOW;
  pierced(hz, [...DOORS.front, ...lightsIn('front').map(l => l.hole), [-GW.half, GW.half, GW.sill, GW.spring, GW.apex]], true);
  portalDoors();
  // the service door, from the coal yard
  G.clear.push({ name: 'the service door', lo: [SERVICE.x0 + 0.1, 0.1, -oz - 2.5], hi: [SERVICE.x1 - 0.1, SERVICE.door - 0.2, -hz + 2.0] });
  doorway({ c: [(SERVICE.x0 + SERVICE.x1) / 2, 0, -hz - 0.1], along: 'x', w: SERVICE.x1 - SERVICE.x0, h: SERVICE.door, fan: SERVICE.h, zone: 'the service door' });

  // The dial itself
  const glass = new THREE.Mesh(new THREE.CircleGeometry(DIAL.r + 0.4, 128), MAT.dial);
  glass.position.set(DIAL.x, DIAL.y, DIAL.z); scene.add(glass);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(DIAL.r, 1.4, 12, 128), MAT.bronze);
  bezel.position.copy(glass.position); scene.add(bezel);
  G.glass = G.world.createCollider(G.R.ColliderDesc.cylinder(0.25, DIAL.r).setRotation(QX).setTranslation(DIAL.x, DIAL.y, DIAL.z));

  // (plinth, piers, the clock panel, the stair towers, the attic and everything above the cornice: facade.js)
}

// The main entrance. The portal's doorway is parted by an iron mullion into two, each with a pair of leaves under a
// transom and a fanlight up to the lintel; PORTAL.lobby in front of the wall's face, across the porch from side to side and
// from the floor to the vault, an iron screen, glazed, with a pair of glazed leaves in its middle. Between them is a
// draught lobby: each pair opens away from whoever comes to it, so that someone in the lobby has the one behind them
// shut before the one ahead is open.
function portalDoors() {
  const { hz, wall } = TOWER, oz = hz + wall, P = PORTAL, zs = oz + P.lobby, dh = P.door;
  const L = 'the main doorway, left', R = 'the main doorway, right', I = 'the porch\'s inner doors';
  G.clear.push({ name: L, lo: [-P.w / 2 + 0.2, 0.1, hz - 3], hi: [-0.2, dh - 0.2, zs - 0.2] });
  G.clear.push({ name: R, lo: [0.2, 0.1, hz - 3], hi: [P.w / 2 - 0.2, dh - 0.2, zs - 0.2] });
  G.clear.push({ name: I, lo: [-1.8, 0.1, zs - 0.6], hi: [1.8, dh - 0.2, oz + P.porch + 0.5] });
  for (const s of [-1, 1]) doorway({ c: [s * P.w / 4, 0, oz - 0.15], along: 'x', w: P.w / 2, h: dh, fan: P.h, zone: s < 0 ? L : R });
  doorway({ c: [0, 0, zs], along: 'x', w: 4, h: dh, glazed: true, zone: [I, L, R] });
  // the screen: posts either side of the door, between it and the porch's sides and against them (on the arcade's shafts),
  // a transom over the door, rails at a third and two thirds, and a head under the vault; a sheet dado, glass above it
  const top = 18.95, posts = [-5.63, -3.9, -2.06, 2.06, 3.9, 5.63], rails = [9.0, 13.5];
  for (const x of posts) ibox('iron', 0.12, top, 0.2, x, top / 2, zs);
  ibox('iron', 0.12, top - dh - 0.12, 0.2, 0, (top + dh + 0.12) / 2, zs);
  ibox('iron', 2 * 5.69, 0.12, 0.2, 0, dh + 0.06, zs);
  for (const y of rails) ibox('iron', 2 * 5.69, 0.12, 0.2, 0, y, zs);
  ibox('iron', 2 * 5.98, 0.12, 0.2, 0, top - 0.06, zs);
  for (const s of [-1, 1]) ibox('iron', 0.29, top - 8.8, 0.2, s * 5.835, (top + 8.8) / 2, zs);           // (above the arcade, out to the wall)
  const bays = [[-5.57, -3.96], [-3.84, -2.12], [2.12, 3.84], [3.96, 5.57]], over = [[-2.0, -0.06], [0.06, 2.0]];
  const pane = (x0, x1, y0, y1) => { ibox('glazing', x1 - x0, y1 - y0, 0.03, (x0 + x1) / 2, (y0 + y1) / 2, zs); };
  const bar = (x0, x1, y) => ibox('iron', x1 - x0, 0.05, 0.1, (x0 + x1) / 2, y, zs);
  for (const [x0, x1] of bays) {
    ibox('iron', x1 - x0, 1.0, 0.04, (x0 + x1) / 2, 0.5, zs); pane(x0, x1, 1.0, dh); bar(x0, x1, 2.8);
  }
  for (const [x0, x1] of [...bays, ...over]) {
    const ys = [dh + 0.12, ...rails, top - 0.12];
    for (let k = 0; k < ys.length - 1; k++) { const y0 = ys[k] + (k ? 0.06 : 0), y1 = ys[k + 1] - (k < ys.length - 2 ? 0.06 : 0); pane(x0, x1, y0, y1); bar(x0, x1, (y0 + y1) / 2); }
  }
  for (const s of [-1, 1]) cbox(5.69 - 2.0, top, 0.2, s * (5.69 + 2.0) / 2, top / 2, zs);
  cbox(4.0, top - dh, 0.2, 0, (top + dh) / 2, zs);
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
// The one just above half way up the storey is tied from above as well: that leaves the wall
// clear between it and the one below, where the storey's wind truss runs along the wall
// (structure.js, section 3), with nothing of the stair's crossing its plane.
function stairBrackets(a, b, width) {
  const n = Math.round(Math.abs(b[0] - a[0]) / 8), wall = -TOWER.hz + 0.06, zi = a[2] - width / 2, zo = a[2] + width / 2, rise = Math.abs(b[1] - a[1]);
  for (let k = 1; k < n; k++) {
    const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n - 0.44, up = y - a[1];
    beam('iron', [x, y, wall], [x, y, zo + 0.2], 0.32, 0.2);
    ibox('iron', 0.6, 0.8, 0.07, x, y, wall);                                         // wall plate
    for (const z of [zi, zo]) for (const dx of [-0.07, 0.07]) iknob('rivet', 0.022, x + dx, y + 0.18, z);    // stringer cleats
    if (up > 9 && !(up > rise / 2 && up < rise / 2 + rise / n)) { beam('iron', [x, y - 5.2, wall], [x, y - 0.14, zi - 0.4], 0.2, 0.16); ibox('iron', 0.5, 0.7, 0.07, x, y - 5.2, wall); }
    else { tube('steel', [x, y + 5.6, wall], [x, y + 0.2, zi - 0.16], 0.035); ibox('iron', 0.5, 0.5, 0.07, x, y + 5.6, wall); iknob('steel', 0.07, x, y + 0.2, zi - 0.16); }
  }
}

function liftCage() {
  const L = LIFT, ys = [0, ...LEVELS], xm = (L.xu + L.xd) / 2;
  // (open below the guard height: the bottom wheels, their belts and the cars coming round are there)
  const top = L.yt - 4;                                      // the panels stop under the top wheels, whose axles go out through the sides
  cagePanel(L.x0, L.x1, L.guard, top, L.z1 + 0.05, L.z1 + 0.05);
  cagePanel(L.x0, L.x0, L.guard, top, L.z0, L.z1);
  cagePanel(L.x1, L.x1, L.guard, top, L.z0, L.z1);
  cagePanel(xm, xm, L.guard, 177, L.z0, L.z1);
  const zb = L.z0 - 0.05;
  cagePanel(L.x0, L.x1, L.guard, ys[1] - 0.35, zb, zb);
  // (the openings are tall: you step off while the deck is still coming up to the landing, or has just gone past it)
  for (let li = 1; li < ys.length - 1; li++) cagePanel(L.x0, L.x1, ys[li] + 3.8, ys[li + 1] - 0.35, zb, zb);
  cagePanel(L.x0, L.x1, ys[ys.length - 1] + 3.8, top, zb, zb);
  // Each landing's sill: a plate reaching in from the gallery's edge, across the gap the chains run in, to within a
  // finger of a passing deck. It is notched where the two chains and the ends of the cars' axles go by, and stands on
  // brackets off the gallery's edge beam.
  const zs = L.z - L.hz - L.gap, cuts = [L.x0 + 0.15, L.xu - L.notch, L.xu + L.notch, L.xd - L.notch, L.xd + L.notch, L.x1 - 0.15];
  for (let li = 1; li < ys.length; li++) for (let k = 0; k < 6; k += 2) {
    const xa = cuts[k], xb = cuts[k + 1], y = ys[li];
    sbox('iron', xb - xa, 0.08, zs - L.z0, (xa + xb) / 2, y - 0.04, (L.z0 + zs) / 2);
    for (const x of [xa + 0.05, xb - 0.05]) ibox('iron', 0.06, 0.28, zs - L.z0 - 0.04, x, y - 0.22, (L.z0 + zs) / 2 - 0.02);
  }
  for (const x of [L.x0, L.x1]) for (const z of [L.z0, L.z1]) ibox('iron', 0.3, L.top, 0.3, x, L.top / 2, z);
  for (const z of [L.z0, L.z1]) ibox('iron', 0.3, 177 - L.guard, 0.3, xm, (177 + L.guard) / 2, z);       // (the middle posts stop short of the wheels)
  ibox('iron', L.x1 - L.x0 + 0.6, 0.3, L.z1 - L.z0 + 0.6, xm, L.top + 0.15, L.z);
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
  // The flue. The fire is under the boiler; its gases go along beneath it and out at the back into a brick chamber, where
  // they turn down through the floor into the flue (FLUE), which takes them out under the back wall and the yard to the
  // stack (facade.js). In the chamber's top, the damper: an iron plate sliding across the way down, hung from a chain over
  // a pulley on a frame above, with a counterweight; the fireman sets it from the floor with the chain. In front of the
  // chamber, over the flue, an iron hatch in the floor: the way down for the sweeps.
  const F = FLUE, cx0 = F.x - F.w / 2 - 0.6, cx1 = F.x + F.w / 2 + 0.6, cz0 = bz - 4.6 - 3.4, cz1 = bz - 4.6, ch = 4.4;
  sbox('brick', cx1 - cx0, ch, cz1 - cz0, F.x, ch / 2, (cz0 + cz1) / 2);
  ibox('stone', cx1 - cx0 + 0.3, 0.25, cz1 - cz0 + 0.3, F.x, ch + 0.12, (cz0 + cz1) / 2);
  ibox('iron', cx1 - cx0 + 0.4, ch - 0.3, 0.5, F.x, (ch - 0.3) / 2, cz1 + 0.1);                   // the boiler's back plate and smokebox door
  icyl('iron', 0.5, 0.4, F.x, ch * 0.5, cz1 + 0.45, QX);
  // the damper's frame, pulley, chain and counterweight
  const dz = (cz0 + cz1) / 2;
  for (const dx of [-1.5, 1.5]) ibox('iron', 0.16, 2.6, 0.16, F.x + dx, ch + 1.55, dz);
  ibox('iron', 3.2, 0.2, 0.2, F.x, ch + 2.9, dz); icyl('iron', 0.45, 0.12, F.x + 1.2, ch + 3.2, dz, QX);
  ibox('iron', 1.9, 0.12, 0.6, F.x, ch + 0.32, dz);                                                // the damper plate's top edge, in its slot
  ibox('rail', 0.05, 2.7, 0.05, F.x, ch + 1.7, dz); ibox('rail', 1.25, 0.05, 0.05, F.x + 0.6, ch + 3.62, dz);
  ibox('rail', 0.05, ch + 3.2 - 1.6, 0.05, F.x + 1.65, (ch + 3.2 + 1.6) / 2, dz);                  // the chain down to the fireman's hand
  ibox('iron', 0.5, 0.9, 0.5, F.x + 1.65, 2.6, dz); sbox('iron', 0.3, 0.3, 0.3, F.x + 1.65, 1.45, dz);
  // the hatch, and under it the shaft down to the flue
  { const hz = cz0 - 1.6; ibox('stone', 1.9, 0.06, 1.9, F.x, 0.03, hz); ibox('plate', 1.4, 0.05, 1.4, F.x, 0.06, hz); for (const dx of [-0.4, 0.4]) icyl('iron', 0.1, 0.04, F.x + dx, 0.1, hz, QX); }
  // (below the floor, in the raft and under it: the drop and the flue)
  G.tag = 'outside'; G.on = 'flue';
  const fy = -F.depth, fh = F.h, wt = 0.6;
  ibox('brick', cx1 - cx0, F.depth, cz1 - cz0, F.x, -F.depth / 2, (cz0 + cz1) / 2);
  const tunnel = (x0, x1, z0, z1) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongZ = Math.abs(z1 - z0) > Math.abs(x1 - x0), L = alongZ ? Math.abs(z1 - z0) : Math.abs(x1 - x0), W = F.w + 2 * wt;
    const put = (w, h, y, off) => alongZ ? ibox('brick', w, h, L, cx + off, y, cz) : ibox('brick', L, h, w, cx, y, cz + off);
    put(W, wt, fy - wt / 2, 0); put(W, wt, fy + fh + wt / 2, 0);
    for (const s of [-1, 1]) put(wt, fh, fy + fh / 2, s * (F.w + wt) / 2);
  };
  tunnel(F.x, F.x, cz0, F.turn - F.w / 2 - wt); tunnel(F.x - F.w / 2 - wt, STACK.x + STACK.ped - 0.5, F.turn, F.turn);
  G.tag = ''; G.on = '';
  // The engine's exhaust: from the foot of its riser down under the floor, in a trench under iron covers, back to the
  // wall and along it to the flue's chamber, which it enters to go up the stack with the smoke.
  const ex = FLOOR.h3.x + ENGINE.stackX, ez = FLOOR.h3.z - ENGINE.cylS, tz = -hz + 1.6, tw = 1.1;
  icyl('copper', 0.4, 0.8, ex, 0.4, ez); icyl('bronze', 0.55, 0.12, ex, 0.06, ez);
  const cover = (x0, x1, z0, z1) => tplane(MAT.plate, x0, x1, z0, z1, 0.012, 1);
  cover(ex - tw / 2, ex + tw / 2, tz - tw / 2, ez - 0.6); cover(cx1, ex + tw / 2, tz - tw / 2, tz + tw / 2);
  for (let x = cx1 + 2; x < ex; x += 6) ibox('iron', 0.08, 0.02, tw, x, 0.02, tz);                 // the covers' bearers, flush with the floor
  icyl('copper', 0.3, ez - 0.6 - tz, ex, -0.7, (ez - 0.6 + tz) / 2, QX); icyl('copper', 0.3, ex - cx1, (ex + cx1) / 2, -0.7, tz, qzr);
}

// ---- the keepers' workshop, on the floor by the service door (the boiler is the other side of it): benches with vices
// and a lathe, in front of the exhaust's trench along the back wall, and a rack of spares
function workshop() {
  const { hz } = TOWER, z = -hz + 4.0;
  for (const x of [-27.5, -20.5]) {
    ibox('iron', 6.4, 0.1, 1.4, x, 0.9, z); for (const dx of [-3, 3]) for (const dz of [-0.6, 0.6]) ibox('iron', 0.1, 0.85, 0.1, x + dx, 0.43, z + dz);
    ibox('iron', 0.3, 0.25, 0.3, x - 2.2, 1.08, z - 0.5); ibox('iron', 0.3, 0.25, 0.3, x + 1.6, 1.08, z - 0.5);
  }
  { const x = -13; ibox('iron', 7, 0.5, 0.9, x, 1.05, z); for (const dx of [-3, 3]) ibox('iron', 0.7, 0.8, 0.8, x + dx, 0.4, z);
    ibox('iron', 1.4, 1.3, 1.1, x - 2.8, 1.9, z); icyl('steel', 0.18, 2.4, x - 1.2, 1.85, z, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2))); ibox('iron', 0.8, 0.9, 0.9, x + 2.4, 1.7, z); }
  { const x = -6; for (const dx of [-3, 3]) ibox('iron', 0.1, 3.2, 1.0, x + dx, 1.6, z); for (const h of [0.3, 1.3, 2.3, 3.1]) ibox('iron', 6.1, 0.06, 1.0, x, h, z); }
  lamp(-24, 0, z - 1.2); lamp(-10, 0, z - 1.2);
}

export function buildTower() {
  shell(); galleries(); liftCage(); bridges(); bobLandings(); decor(); workshop();
  stairTowers(); escapeStair(); attic(); roofTop(); cradle();
}

// ---- stairs round a well
// In the well's own coordinates (u, v) it is the rectangle [0, U] x [0, V]; M(u, v) gives the world [x, z]. A storey is a
// landing on the v = 0 side from u = 0, `land` long (the whole side if land >= U), then flights round the walls, with
// square landings w on a side at the corners, until the next storey's landing; laps(rise) turns of the well to a storey.
// A side may be split at splits[k] (a u or v along it) into two flights with a landing between. No flight has more
// than sixteen risers: the storey's rise is shared equally among its flights, each flight takes as many treads (going
// `going`) as its risers need, and the rest of its side is landing. sw: the width of a flight (its strip is w).
// Every landing and every flight's end stands on a steel bearer across its strip, built into the wall (or, for a
// stair standing free, on its posts; reach(k, s): how far beyond the strip's outer edge the wall is, where it is not
// against it): `bearers` lists them, `chains` the stringers between (a flight and the landing after it are one
// stringer); `landings` every landing that is not the storey's own, for the windows.
const GOING = 0.27, MAX_RISERS = 16;
function wellStair({ U, V, M, w, levels, land, laps, splits = [null, null, null, null], sw = w - 0.2, name, open = null, foot = true, going = GOING, reach = null, bearerSize = [0.4, 0.2], landGaps = [] }) {
  const box = (r) => { const a = M(r[0], r[2]), b = M(r[1], r[3]); return [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])]; };
  const at = (u, v, y) => { const p = M(u, v); return [p[0], y, p[1]]; };
  const SIDE = [
    { strip: (a, b, e) => [Math.min(a, b), Math.max(a, b), e, w - e], c: (s) => [s, w / 2], wall: (s) => [s, 0], well: [0, 1] },            // along v = 0, u increasing
    { strip: (a, b, e) => [U - w + e, U - e, Math.min(a, b), Math.max(a, b)], c: (s) => [U - w / 2, s], wall: (s) => [U, s], well: [-1, 0] }, // along u = U, v increasing
    { strip: (a, b, e) => [Math.min(a, b), Math.max(a, b), V - w + e, V - e], c: (s) => [s, V - w / 2], wall: (s) => [s, V], well: [0, -1] }, // along v = V, u decreasing
    { strip: (a, b, e) => [e, w - e, Math.min(a, b), Math.max(a, b)], c: (s) => [w / 2, s], wall: (s) => [0, s], well: [1, 0] },            // along u = 0, v decreasing
  ];
  const span = [[w, U - w], [w, V - w], [U - w, w], [V - w, w]];
  const corner = [[U - w, U, 0, w], [U - w, U, V - w, V], [0, w, V - w, V], [0, w, 0, w]];     // the corner after side k
  const flat = (r, y) => { const b = box(r); deck(b[0], b[1], b[2], b[3], y); };
  const edge = (u0, v0, u1, v1, y) => rail(at(u0, v0, y), at(u1, v1, y));
  // (where the stair's outer side is not against a wall, a rail along each edge of a landing on the outline of the
  // square, but for the gaps given, [u0, u1] along v = 0)
  const fence = (r, y, gaps) => {
    const [u0, u1, v0, v1] = r;
    if (v0 === 0) { let c = u0; for (const [g0, g1] of gaps) { if (g0 > c) edge(c, 0, Math.min(g0, u1), 0, y); c = Math.max(c, g1); } if (c < u1) edge(c, 0, u1, 0, y); }
    if (v1 === V) edge(u0, V, u1, V, y);
    if (u0 === 0) edge(0, v0, 0, v1, y);
    if (u1 === U) edge(U, v0, U, v1, y);
  };
  // a bearer across side k's strip at s, at height y, from the wall to the well's edge
  const bearers = [], chains = [], landings = [], out = [];
  const bearer = (k, s, y) => {
    const S = SIDE[k], o = reach ? reach(k, s) : 0, r0 = S.wall(s), r1 = [r0[0] + S.well[0] * w, r0[1] + S.well[1] * w], w0 = [r0[0] - S.well[0] * o, r0[1] - S.well[1] * o];
    const a = at(w0[0] - S.well[0] * 0.3, w0[1] - S.well[1] * 0.3, y - 0.45), b = at(r1[0], r1[1], y - 0.45);
    beam('iron', a, b, bearerSize[0], bearerSize[1]); const pl = at(w0[0], w0[1], y - 0.45); ibox('iron', 0.5, 0.7, 0.5, pl[0], pl[1], pl[2]);
    bearers.push({ root: at(w0[0], w0[1], y - 0.45), tip: b, k, s, y });
  };
  for (let s = 0; s < levels.length - 1; s++) {
    const y0 = levels[s], y1 = levels[s + 1], sides = [];
    if (land < U) sides.push({ k: 0, a: land, b: U - w });
    sides.push({ k: 1 }, { k: 2 }, { k: 3 });
    for (let n = 1; n < laps(y1 - y0); n++) sides.push({ k: 0 }, { k: 1 }, { k: 2 }, { k: 3 });
    const legs = [];
    for (const L of sides) {
      if (L.a === undefined) [L.a, L.b] = span[L.k];
      const m = splits[L.k];
      if (m !== null && Math.min(Math.abs(m - L.a), Math.abs(L.b - m)) >= 3.4 && (m - L.a) * (L.b - m) > 0) legs.push({ k: L.k, a: L.a, b: m, mid: true }, { k: L.k, a: m, b: L.b });
      else legs.push({ k: L.k, a: L.a, b: L.b });
    }
    const dy = (y1 - y0) / legs.length, risers = Math.round(dy / 0.19);
    if (risers > MAX_RISERS) console.warn(`the ${name} stair: ${risers} risers in a flight`);
    // the storey's landing, and the rail along its edge over the well
    // (but where something else guards it: landGaps, [u0, u1] along v = w)
    if (y0 > 0 && (s > 0 || foot)) {
      flat([0, Math.min(land, U), 0, w], y0);
      let c = w; for (const [g0, g1] of landGaps) { if (g0 > c) edge(c, w, g0, w, y0); c = Math.max(c, g1); }
      edge(c, w, land < U ? land : U - w, w, y0);
      if (open) fence([0, Math.min(land, U), 0, w], y0, open);
    }
    let y = y0;
    legs.forEach((L, i) => {
      const S = SIDE[L.k], ya = y, yb = y + dy, dir = Math.sign(L.b - L.a), len = Math.abs(L.b - L.a), run = Math.min(len, risers * going), e = L.a + dir * run; y = yb;
      const a = at(...S.c(L.a), ya), b = at(...S.c(e), yb);
      const d = [b[0] - a[0], b[2] - a[2]], p = [-d[1], d[0]], c0 = S.c(L.a), q0 = M(c0[0], c0[1]), q1 = M(c0[0] + S.well[0], c0[1] + S.well[1]);
      const toWell = Math.sign(p[0] * (q1[0] - q0[0]) + p[1] * (q1[1] - q0[1]));
      stair(a, b, sw, open ? [true, true] : [toWell < 0, toWell > 0]);
      // headroom over a metre in the middle of the flight, from above its highest tread there to a man's height over its lowest
      const mm = (L.a + e) / 2, f = (t) => ya + (yb - ya) * t, t0 = (run / 2 - 0.5) / run, t1 = (run / 2 + 0.5) / run;
      const r = box(S.strip(mm - 0.5, mm + 0.5, 0.35));
      G.clear.push({ name: `the headroom over the ${name} stair`, lo: [r[0], f(t1) + 0.3, r[2]], hi: [r[1], f(t0) + 2.05, r[3]] });
      // the landing after it, to the split or the corner
      const chain = [at(...S.c(L.a), ya), b];
      if (len - run > 0.05) {
        const st = S.strip(e, L.b, 0); flat(st, yb);
        const w0 = S.c(e), w1 = S.c(L.b), off = [S.well[0] * w / 2, S.well[1] * w / 2];
        edge(w0[0] + off[0], w0[1] + off[1], w1[0] + off[0], w1[1] + off[1], yb);
        if (open) { const o0 = [w0[0] - off[0], w0[1] - off[1]], o1 = [w1[0] - off[0], w1[1] - off[1]]; edge(o0[0], o0[1], o1[0], o1[1], yb); }
        landings.push({ k: L.k, s0: Math.min(e, L.b), s1: Math.max(e, L.b), y: yb });
        chain.push(at(...S.c(L.b), yb));
      }
      chains.push({ pts: chain, k: L.k, w });
      // its bearers: where it starts (but where it goes on from a split, whose bearer is already there), and where it
      // ends, at the split or the corner
      if (i === 0 || !legs[i - 1].mid) bearer(L.k, L.a, ya);
      bearer(L.k, L.b, yb);
      if (!L.mid && i < legs.length - 1) { flat(corner[L.k], yb); if (open) fence(corner[L.k], yb, []); }
      out.push({ k: L.k, a: L.a, b: L.b, ya, yb, run, mid: !!L.mid });
    });
  }
  return { out, box, at, edge, flat, fence, bearers, chains, landings, SIDE };
}

// The bearers and stringers of a stair declared: the bearers built into the frame `on` (at a column or a girder of it,
// within its reach), each stringer pair one member along its strip's middle, carrying the treads and a crowd on them.
const STAIR_KG_M2 = 120 + 400;
function declareStair(W, name, on, note, bearer = SECTION.box(0.4, 0.2, 0.012)) {
  const A = assembly(name, note), st = MATERIAL.steel, stringer = SECTION.box(0.4, 0.2, 0.012);
  for (const b of W.bearers) { A.member(b.root, b.tip, bearer, st, 'beam', 'bearer'); A.rest(b.root, on, 'fix'); }
  for (const c of W.chains) for (let i = 0; i < c.pts.length - 1; i++) {
    const p = c.pts[i], q = c.pts[i + 1], lift = (pt) => [pt[0], pt[1] - 0.45, pt[2]];
    A.member(lift(p), lift(q), stringer, st, 'beam', 'stringers', null, STAIR_KG_M2 * c.w * GRAV);
  }
  return A;
}

// ---- the two stair towers either side of the dial (their walls, windows and spires: facade.js)
// Each is a well 19 m by 17 m inside walls 1.5 m thick; its stair goes twice round it to a storey. On every landing a
// bench and a lamp: the landings are the refuges where people coming down can wait out of the way of others. A door
// from the floor, and from every side gallery of the hall, through the front wall; one to the street; one into the
// attic; at 210 m, in the right-hand tower, one onto the cradle's platform when it is parked there; and at the top,
// where the stair comes up into the lookout under the spire, one onto the bridge to the mansard's flat.
function stairTowers() {
  const S = T, w = S.w, i0 = S.x0 + S.wall, i1 = S.x1 - S.wall, j0 = S.z0 + S.wall, j1 = S.z1 - S.wall, top = S.levels[S.levels.length - 1];
  for (const sx of [-1, 1]) {
    const X = (x) => sx * x, side = sx < 0 ? 'left' : 'right';
    const U = i1 - i0, V = j1 - j0;
    // (in the right-hand one the hoistway's fence guards the landings' edges where it stands beside them: hoist.js)
    const W = wellStair({ U, V, M: (u, v) => [X(i0 + u), j0 + v], w, levels: S.levels, land: S.land, laps: () => 2, splits: [U / 2, V / 2, U / 2, V / 2], name: `${side} tower's`, bearerSize: [0.5, 0.25],
      landGaps: sx > 0 ? [[HOIST.hole[0], HOIST.hole[1]]] : [] });
    declareStair(W, `stairs, ${side} tower`, `stair tower ${side}`, 'the bearers and stringers of a stair tower\'s stair, on its frame', SECTION.box(0.5, 0.25, 0.016));
    G.stairLights = G.stairLights || {}; G.stairLights[side] = W.landings;
    // its floor (in the right-hand tower, round the hoist's pit: hoist.js)
    for (const [a, b, c, d] of sx > 0 ? [[0, U, 0, H.hole[2]], [0, H.hole[0], H.hole[2], V], [H.hole[1], U, H.hole[2], V], [H.hole[0], H.hole[1], H.pit, V]] : [[0, U, 0, V]]) {
      const p = W.at(a, c, 0), q = W.at(b, d, 0); tplane(MAT.plate, Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(p[2], q[2]), Math.max(p[2], q[2]), 0.01, 4);
    }
    // the lookout at the top: a floor over the whole well but the last side's strip, up which the stair arrives (and in
    // the right-hand tower the hoistway, which comes up through it)
    const last = W.out[W.out.length - 1], arrive = last.a - last.run;
    W.flat([0, U, 0, w], top); W.flat([0, w, V - w, V], top);
    if (sx > 0) { const [h0, h1, , h3] = H.hole; W.flat([w, h0, w, V], top); W.flat([h1, U, w, V], top); W.flat([h0, h1, h3, V], top); }
    else W.flat([w, U, w, V], top);
    stage(W, sx, U, V);
    W.edge(w, arrive, w, V - w, top); W.edge(0, V - w, w, V - w, top);
    // on each landing, a bench against the wall beyond the door, and a lamp on the near side of it
    for (const y of S.levels.slice(1, -1)) {
      const b = W.at(S.land - 0.75, 0.28, y + 0.22); ibox('iron', 1.3, 0.08, 0.42, b[0], b[1], b[2]);
      for (const du of [-0.55, 0.55]) { const l = W.at(S.land - 0.75 + du, 0.28, y + 0.11); ibox('iron', 0.06, 0.22, 0.38, l[0], l[1], l[2]); }
      const l = W.at(3.0, 0.24, y); lamp(l[0], y, l[2]);
    }
    // the doors through the back wall: onto the side galleries (and the floor), and into the attic
    const [d0, d1] = sx < 0 ? [-S.door[1], -S.door[0]] : S.door;
    for (const y of [0, ...LEVELS, ARCH.cornice]) {
      const attic = y === ARCH.cornice, zA = attic ? TOWER.hz - 1 : TOWER.hz - 0.4;
      G.clear.push({ name: `the ${side} tower's door at ${y} m`, lo: [d0 + 0.1, y + 0.1, zA], hi: [d1 - 0.1, y + DOOR_H - 0.2, j0 - 0.1] });
      if (y > 0) { const z0 = attic ? S.z0 : TOWER.hz; cbox(d1 - d0, 0.3, j0 - z0, (d0 + d1) / 2, y - 0.15, (z0 + j0) / 2); tplane(MAT.plate, d0, d1, z0, j0, y + 0.005, 2); }
      // (hung at the tower wall's outer face, the leaves open into the tower, the way out of the hall, within the wall)
      doorway({ c: [(d0 + d1) / 2, y, S.z0 + 0.15], along: 'x', w: d1 - d0, h: DOOR_H, swing: [1], zone: `the ${side} tower's door at ${y} m` });
    }
    // to the street
    const [s0, s1] = sx < 0 ? [-S.street[1], -S.street[0]] : S.street;
    G.clear.push({ name: `the ${side} tower's street door`, lo: [s0 + 0.1, 0.1, j1 - 0.5], hi: [s1 - 0.1, STREET_DOOR - 0.2, S.z1 + 1.5] });
    doorway({ c: [(s0 + s1) / 2, 0, j1 + 0.15], along: 'x', w: s1 - s0, h: STREET_DOOR, fan: 5.2, zone: `the ${side} tower's street door` });
    // onto the bridge to the flat (see roofTop), from the head of the stair
    const b0 = X(i0 + 0.1), b1 = X(i0 + w - 0.1);
    G.clear.push({ name: `the ${side} tower's door onto the bridge`, lo: [Math.min(b0, b1) + 0.1, top + 0.1, S.z0 - 0.6], hi: [Math.max(b0, b1) - 0.1, top + 2.5, j0 - 0.1] });
    cbox(Math.abs(b1 - b0), 0.3, S.wall + 0.3, (b0 + b1) / 2, top - 0.15, S.z0 + S.wall / 2 - 0.15); tplane(MAT.plate, Math.min(b0, b1), Math.max(b0, b1), S.z0 - 0.3, j0, top + 0.005, 2);
    doorway({ c: [X(i0 + w / 2), top, j0 - 0.15], along: 'x', w, h: 2.6, zone: `the ${side} tower's door onto the bridge` });
    // and, in the right-hand tower, onto the cradle (see cradle)
    if (sx > 0) {
      const cz = CRADLE.z;
      G.clear.push({ name: 'the door onto the cradle', lo: [S.x0 + 0.05, CRADLE.deck + 0.1, cz - 0.75], hi: [i0 - 0.05, CRADLE.deck + 2.3, cz + 0.75] });
      cbox(S.wall, 0.3, 1.6, S.x0 + S.wall / 2, CRADLE.deck - 0.15, cz);
      doorway({ c: [S.x0 + S.wall - 0.15, CRADLE.deck, cz], along: 'z', w: 1.7, h: 2.5, leaves: 1, swing: [1], zone: 'the door onto the cradle' });   // (it opens inward only)
    }
    // The gas for the lamp (the town's coal gas, from its main under the street) comes up the right-hand tower in an
    // iron pipe in the corner of the well, and goes on under the bridge and the flat to the lamp room.
    if (sx > 0) { const g = W.at(0.3, 0.3, 0); icyl('iron', 0.09, top - 0.6, g[0], (top - 0.6) / 2, g[2]); for (const y of S.levels.slice(1)) ibox('iron', 0.3, 0.1, 0.3, g[0], y - 0.35, g[2]); }
  }
}

// ---- the stage under a stair tower's spire, over its lookout
// Its floor (the lookout's ceiling: facade.js) is stone on steel joists across the well, trimmed round the hoistway in
// the right-hand tower. A ladder goes up to it from the lookout through a hatch, against the pier in the middle of the
// outer wall. In the right-hand tower it is the hoist's sheave room (hoist.js); in the left it holds the tank that
// gives a head of water to the hose reels in the lookouts, on the bridges and in the lamp room, filled by the engine's
// feed pump through a rising main up the corner of the well.
export const HATCH = { u: [-1.35, -0.05], v: [-0.7, 0.7] };          // from the outer wall (u = U) and the well's middle (v = V / 2)
function stage(W, sx, U, V) {
  const S = T, y = S.stage, side = sx < 0 ? 'left' : 'right', hl = H.hole;
  G.on = `stair tower ${side}`;
  const joist = (u0, u1, v) => { const a = W.at(u0, v, y - 0.3), b = W.at(u1, v, y - 0.3); beam('iron', a, b, 0.6, 0.25); };
  for (const v of [1.4, 4.2, 7.0, 9.8, 13.2, 15.8]) {
    if (sx > 0 && v > hl[2] && v < hl[3]) { joist(-0.3, hl[0] - 0.15, v); joist(hl[1] + 0.15, U + 0.3, v); }
    else joist(-0.3, U + 0.3, v);
  }
  if (sx > 0) for (const u of [hl[0] - 0.15, hl[1] + 0.15]) { const a = W.at(u, 1.4, y - 0.3), b = W.at(u, 13.2, y - 0.3); beam('iron', a, b, 0.6, 0.3); }   // the trimmers, on the joists either side of the hole
  // the ladder, its stiles 0.5 apart, a rung every 0.3 m, and hoops round the climber from 2.4 m up
  const lu = U - 0.22, lv = V / 2, top = S.levels[S.levels.length - 1];
  for (const dv of [-0.25, 0.25]) { const p = W.at(lu, lv + dv, 0); ibox('iron', 0.06, y + 1.1 - top, 0.06, p[0], (top + y + 1.1) / 2, p[2]); }
  for (let h = top + 0.3; h < y + 0.9; h += 0.3) { const p = W.at(lu, lv, 0); ibox('iron', 0.04, 0.04, 0.5, p[0], h, p[2]); }
  for (let h = top + 2.4; h < y - 0.6; h += 1.2) for (const [a, b] of [[[lu, lv - 0.38], [lu - 0.75, lv - 0.38]], [[lu - 0.75, lv - 0.38], [lu - 0.75, lv + 0.38]], [[lu - 0.75, lv + 0.38], [lu, lv + 0.38]]]) beam('iron', W.at(a[0], a[1], h), W.at(b[0], b[1], h), 0.05, 0.03);
  // a curb round the hatch, and its lid, open, against the wall
  const [hu0, hu1] = HATCH.u.map(d => U + d), [hv0, hv1] = HATCH.v.map(d => lv + d);
  for (const [a, b] of [[[hu0, hv0], [hu1, hv0]], [[hu1, hv0], [hu1, hv1]], [[hu1, hv1], [hu0, hv1]], [[hu0, hv1], [hu0, hv0]]]) beam('iron', W.at(a[0], a[1], y + 0.45), W.at(b[0], b[1], y + 0.45), 0.2, 0.06);
  { const p = W.at(U - 0.12, lv, 0); ibox('plate', 0.05, 1.3, 1.4, p[0], y + 1.2, p[2]); }
  if (sx < 0) {
    // the tank: riveted iron plates on two beams across the well, which bear on its walls
    const tu = 9.0, tv = 10.6, a = 4.0, h = 2.2;
    for (const u of [tu - 1.4, tu + 1.4]) beam('iron', W.at(u, -0.3, y + 0.65), W.at(u, V + 0.3, y + 0.65), 0.6, 0.3);
    const c = W.at(tu, tv, 0); ibox('iron', a, h, a, c[0], y + 0.95 + h / 2, c[2]);
    for (let k = -1; k <= 1; k++) { ibox('iron', 0.06, h + 0.04, a + 0.04, c[0] + k * a / 3, y + 0.95 + h / 2, c[2]); ibox('iron', a + 0.04, h + 0.04, 0.06, c[0], y + 0.95 + h / 2, c[2] + k * a / 3); }
    const g = W.at(U - 0.3, 0.3, 0); icyl('iron', 0.08, y + 0.6, g[0], (y + 0.6) / 2, g[2]);         // (in the corner away from the bridge's door)
    for (const yy of S.levels.slice(1)) ibox('iron', 0.3, 0.1, 0.3, g[0], yy - 0.35, g[2]);
    beam('iron', W.at(U - 0.3, 0.3, y + 0.6), W.at(tu + a / 2, tv - a / 2 + 0.3, y + 0.6), 0.16, 0.16);
    const T2 = assembly('tank, left tower', 'the tank in the stage under the left-hand tower\'s spire, and its two beams across the well');
    for (const u of [tu - 1.4, tu + 1.4]) {
      const p0 = W.at(u, 0, y + 0.65), p1 = W.at(u, V, y + 0.65), m = W.at(u, tv, y + 0.65);
      T2.member(p0, m, SECTION.box(0.6, 0.3, 0.02), MATERIAL.steel, 'beam', 'tank beam').member(m, p1, SECTION.box(0.6, 0.3, 0.02), MATERIAL.steel, 'beam', 'tank beam');
      T2.mass(m, (a * a * h * 1000 + 6e3) / 2, 'the tank, full').rest(p0, 'stair tower left', 'fix').rest(p1, 'stair tower left', 'fix');
    }
  }
  G.on = '';
}

// ---- the escape stairs, in the turrets at the back corners
// A square stair inside each round turret, three turns to a storey (six up to the attic, which is twice as high), with a
// door at every storey's landing onto the hall's back gallery, one into the attic at the top, and one to the street at
// the foot. Its well's four corners are columns, from the floor to the attic's landing, tied to the turret's frame at
// every storey: the corner landings' bearers reach from them to the wall.
function escapeStair() {
  const E = ESCAPE, h = E.half, w = E.w, ri = E.r - E.wall, top = E.levels[E.levels.length - 1];
  for (const sx of [-1, 1]) {
    const ex = sx * E.x, side = sx < 0 ? 'left' : 'right', z0 = E.z - h, z1 = E.z + h, xo = ex + sx * h;       // xo: the square's side at u = 0
    const M = (u, v) => [xo - sx * u, z1 - v], [d0, d1] = sx > 0 ? E.door : [-E.door[1], -E.door[0]];
    const gap = [[E.x + h - E.door[1], E.x + h - E.door[0]]];
    // (the square's corners stand just inside the round wall; a bearer reaches out from a side to the wall)
    const W = wellStair({ U: 2 * h, V: 2 * h, M, w, sw: w - 0.15, levels: E.levels, land: 2 * h, laps: (r) => (r > 40 ? 6 : 3), name: `${side} escape`, open: gap,
      reach: (k, s) => Math.sqrt(ri * ri - (s - h) ** 2) - h - 0.05 });
    W.flat([0, 2 * h, 0, w], top); W.edge(w, w, 2 * h, w, top); W.edge(2 * h, 0, 2 * h, w, top); W.edge(0, 0, 0, w, top);
    W.edge(0, 0, gap[0][0], 0, top); W.edge(gap[0][1], 0, 2 * h, 0, top);
    // the four columns at the corners of the well, from the floor to the attic's landing: the bearers at the corners
    // reach from them to the wall
    const A = declareStair(W, `stairs, ${side} escape turret`, `escape turret ${side}`, 'the escape stair: four columns at the corners of its well, and the bearers and stringers on them');
    for (const [u, v] of [[w, w], [2 * h - w, w], [2 * h - w, 2 * h - w], [w, 2 * h - w]]) {
      const [cx, cz] = M(u, v); ibox('iron', 0.36, top - 0.45, 0.36, cx, (top - 0.45) / 2, cz); cbox(0.36, top - 0.45, 0.36, cx, (top - 0.45) / 2, cz); ibox('iron', 0.8, 0.3, 0.8, cx, 0.15, cz);
      A.member([cx, 0, cz], [cx, top - 0.45, cz], SECTION.box(0.36, 0.36, 0.016), MATERIAL.steel, 'beam', 'column').rest([cx, 0, cz], 'ground', 'fix');
      const a = Math.atan2(cz - E.z, cx - ex), ro = (E.r - E.wall / 2) * Math.cos(Math.PI / 8);
      for (const y of E.levels.slice(1)) { const p = [cx, y - 0.45, cz], to = [ex + ro * Math.cos(a), y, E.z + ro * Math.sin(a)]; A.brace(p, 'x', `escape turret ${side}`, to).brace(p, 'z', `escape turret ${side}`, to); }
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ri + 0.05, 16).rotateX(-Math.PI / 2), MAT.plate); floor.position.set(ex, 0.01, E.z); G.scene.add(floor);
    for (const y of E.levels) {
      const attic = y === top, zB = attic ? -TOWER.hz + 1 : -TOWER.hz + 0.4;
      G.clear.push({ name: `the ${side} escape stair's door at ${y} m`, lo: [d0 + 0.1, y + 0.1, z1 + 0.15], hi: [d1 - 0.1, y + DOOR_H - 0.2, zB] });
      doorway({ c: [(d0 + d1) / 2, y, E.z + ri + 0.15], along: 'x', w: d1 - d0, h: DOOR_H, zone: `the ${side} escape stair's door at ${y} m` });
      // from the landing to the door: a floor across the turret's segment and through the walls
      if (y > 0) { const zEnd = attic ? -TOWER.hz - TOWER.wall : -TOWER.hz; cbox(d1 - d0, 0.3, zEnd - z1, (d0 + d1) / 2, y - 0.15, (z1 + zEnd) / 2); tplane(MAT.plate, d0, d1, z1, zEnd, y + 0.005, 2); }
    }
    G.clear.push({ name: `the ${side} escape stair's street door`, lo: [d0 + 0.1, 0.1, E.z - E.r - 0.8], hi: [d1 - 0.1, 3.0, z0 - 0.05] });
    doorway({ c: [(d0 + d1) / 2, 0, E.z - ri - 0.15], along: 'x', w: d1 - d0, h: 3.2, fan: 4.0, zone: `the ${side} escape stair's street door` });
  }
}

// ---- the attic: the storey between the cornice and the mansard's eaves
// Its floor is a concrete slab on the top wind truss, 8 m wide all round, with a rail along its open inner edge: inside
// that is the hall's own roof, 5 to 23 m below. It is lit by its windows, and from above by the mansard's dormers.
// Along the front, between the two stair towers, are the stores (racks of spares, and crates: lamp glass, mantles,
// rope, oil); along the back are the fire tanks (the mansard's rainwater, kept for the hose reels on the galleries and
// stairs). Doors from both stair towers and from both escape stairs. (The workshop is on the floor: see workshop.)
function attic() {
  const { hx, hz, wall } = TOWER, ox = hx + wall, oz = hz + wall, A = ARCH, y = A.cornice, t = A.slab, ix = ox - A.band, iz = oz - A.band;
  for (const sz of [-1, 1]) tbox(MAT.stone, 2 * ox, t, A.band, 0, y - t / 2, sz * (oz - A.band / 2));
  for (const sx of [-1, 1]) tbox(MAT.stone, A.band, t, 2 * iz, sx * (ox - A.band / 2), y - t / 2, 0);
  railRun('x', iz, -ix, ix, y); railRun('x', -iz, -ix, ix, y); railRun('z', ix, -iz, iz, y); railRun('z', -ix, -iz, iz, y);
  // headroom along the walk round the inner edge (the posts and the furniture are against the walls)
  for (const sz of [-1, 1]) G.clear.push({ name: 'the headroom in the attic', lo: [-ix + 0.4, y + 0.2, sz > 0 ? iz + 0.4 : -iz - 3.0], hi: [ix - 0.4, y + 2.3, sz > 0 ? iz + 3.0 : -iz - 0.4] });
  for (const sx of [-1, 1]) G.clear.push({ name: 'the headroom in the attic', lo: [sx > 0 ? ix + 0.4 : -ix - 3.0, y + 0.2, -iz + 0.4], hi: [sx > 0 ? ix + 3.0 : -ix - 0.4, y + 2.3, iz - 0.4] });
  for (const x of [-48, -16, 16, 48]) for (const sz of [-1, 1]) lamp(x, y, sz * (iz + 0.12));
  for (const z of [-20, 20]) for (const sx of [-1, 1]) lamp(sx * (ix + 0.12), y, z);
  // the stores: under every window a rack of spares, as high as the sill, and crates on the floor in front of some
  for (const x of [-55, -45, -35, -25, -15, -5, 5, 15, 25, 35, 45, 55]) { for (const dx of [-3, 3]) ibox('iron', 0.1, 0.9, 1.0, x + dx, y + 0.45, oz - 1.6); for (const h of [0.1, 0.5, 0.88]) ibox('iron', 6.1, 0.05, 1.0, x, y + h, oz - 1.6); }
  for (const [x, n] of [[-45, 3], [-15, 2], [15, 3], [45, 2]]) for (let k = 0; k < n; k++) ibox('plate', 1.6, 0.8, 0.9, x - 2 + k * 1.8, y + 0.4, oz - 2.75);
  // the fire tanks along the back, on iron bearers
  for (const x of A.tanks) {
    for (const dx of [-3, 0, 3]) ibox('iron', 0.3, 0.3, 2.8, x + dx, y + 0.15, -oz + 2.4);
    ibox('iron', 7.0, 3.0, 2.8, x, y + 1.8, -oz + 2.4);
    for (let k = -3; k <= 3; k++) ibox('iron', 0.08, 3.04, 2.84, x + k * 1.08, y + 1.8, -oz + 2.4);
    icyl('iron', 0.12, 0.8, x, y + 0.75, -oz + 4.0, QX);
  }
}

// ---- on the mansard's flat: the walk to the lamp room, its railing, and the bridges to it from the stair towers
function roofTop() {
  const y = ARCH.flat, X = ARCH.flatX + 0.8, Z = ARCH.flatZ + 0.8, e = 0.3;
  const zinc = tplane(MAT.zinc, -X, X, -Z, Z, y, 4); zinc.receiveShadow = true;
  cbox(2 * X, 0.3, 2 * Z, 0, y - 0.15, 0);
  railRun('x', Z - e, -X + e, X - e, y, [[-X + e - 0.1, -57.6], [57.6, X - e + 0.1]]); railRun('x', -Z + e, -X + e, X - e, y);
  railRun('z', X - e, -Z + e, Z - e, y); railRun('z', -X + e, -Z + e, Z - e, y);
  G.clear.push({ name: 'the walk on the flat', lo: [-54, y + 0.2, LAMP.R + 1.5], hi: [54, y + 2.2, Z - 1.0] });
  // The bridges: from each stair tower's lookout, over the mansard's slope where it falls to the hip, to the flat's
  // front corner: two plate girders under a grating, resting on the tower's frame and on the crown's.
  const S = T, w = 2.0;
  for (const sx of [-1, 1]) {
    const a = [sx * (S.x0 + S.wall + S.w / 2), S.z0 + 0.2], b = [sx * 58.6, Z - 1.0];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const g = new THREE.PlaneGeometry(L, w); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L, uv.getY(i) * w);
    const m = new THREE.Mesh(g, MAT.grate); m.position.set((a[0] + b[0]) / 2, y + 0.02, (a[1] + b[1]) / 2); m.rotation.y = yaw; G.scene.add(m);
    const te = (a[1] - Z) / (a[1] - b[1]);                                                              // (the girders end where the flat begins)
    cbox(L, 0.3, w, (a[0] + b[0]) / 2, y - 0.15, (a[1] + b[1]) / 2, q);
    const n = [-dz / L * w / 2, dx / L * w / 2], A = assembly(`bridge to the flat, ${sx < 0 ? 'left' : 'right'}`, 'two plate girders from a stair tower\'s lookout to the flat');
    const t0 = (a[1] - (S.z0 - 0.7)) / (a[1] - b[1]);                                                 // (the rails start outside the door)
    for (const s of [-1, 1]) {
      const pa = [a[0] + s * n[0], y, a[1] + s * n[1]], pb = [b[0] + s * n[0], y, b[1] + s * n[1]];
      rail([pa[0] + (pb[0] - pa[0]) * t0, y, pa[2] + (pb[2] - pa[2]) * t0], pb);
      const ga = [pa[0], y - 0.62, pa[2]], gb = [pa[0] + (pb[0] - pa[0]) * te, y - 0.62, pa[2] + (pb[2] - pa[2]) * te];
      beam('iron', ga, gb, 1.2, 0.22);
      A.member(ga, gb, SECTION.box(1.2, 0.22, 0.03), MATERIAL.steel, 'beam', 'girder', null, (120 + 400) * w / 2 * GRAV);
      A.rest(ga, `stair tower ${sx < 0 ? 'left' : 'right'}`).rest(gb, 'crown', 'xy');
    }
    for (const t of [0, te]) A.member([a[0] + (b[0] - a[0]) * t + n[0], y - 0.62, a[1] + (b[1] - a[1]) * t + n[1]], [a[0] + (b[0] - a[0]) * t - n[0], y - 0.62, a[1] + (b[1] - a[1]) * t - n[1]], SECTION.box(0.4, 0.2, 0.012), MATERIAL.steel, 'beam', 'cross girder');
    // (the gas main, out of the tower under the door's sill and along under the deck, into the roof under the flat)
    if (sx > 0) { const g0 = [T.x0 + T.wall + 0.3, y - 0.6, T.z0 + T.wall + 0.3], g1 = [a[0], y - 0.5, T.z0 + T.wall + 0.3], g2 = [a[0], y - 0.5, a[1]], g3 = [a[0] + (b[0] - a[0]) * te, y - 0.5, a[1] + (b[1] - a[1]) * te]; tube('iron', g0, g1, 0.09); tube('iron', g1, g2, 0.09); tube('iron', g2, g3, 0.09); }
  }
  lampRoom();
}

// ---- the lamp room (its drum, glass, gallery and cap: facade.js)
// Inside the drum the stair goes once round a square well, from the door up to the lamp floor at the drum's head. The
// floor spans from the well's edge to the wall on iron joists; at the well's corners stand four iron posts, which carry
// the floor's edge and the stair's landings at the corners. In the middle of the well an iron column carries the lamp
// on its platform, which a bridge reaches from the floor's front edge: a ring of coal-gas burners with incandescent
// mantles inside a fixed lens of glass prisms in a brass frame. The keeper tends it from the platform, through the
// lens's door; from the floor a glazed door gives onto the gallery outside, from which the glass is cleaned.
function lampRoom() {
  const L = LAMP, y = ARCH.flat, R = L.R, yg = y + L.drum, h = L.well / 2, w = 2.1, rf = R - L.drumWall, hp = h + 0.5, yt = ARCH.flat - 1;
  const W = wellStair({ U: L.well, V: L.well, M: (u, v) => [-h + u, h - v], w, levels: [y, yg], land: 4, laps: () => 1, splits: [h, h, h, h], name: 'lamp room', open: [], foot: false });
  const floor0 = new THREE.Mesh(new THREE.CircleGeometry(rf, 48).rotateX(-Math.PI / 2), MAT.plate); floor0.position.set(0, y + 0.01, 0); G.scene.add(floor0);
  // the lamp floor: round, less the well; the stair comes up into its corner at the front left
  const shape = new THREE.Shape(); shape.absarc(0, 0, rf, 0, TAU, false);
  const hole = new THREE.Path(); hole.moveTo(-h, -h); hole.lineTo(h, -h); hole.lineTo(h, h); hole.lineTo(-h, h); hole.lineTo(-h, -h); shape.holes.push(hole);
  const fg = new THREE.ShapeGeometry(shape, 48); fg.rotateX(-Math.PI / 2);
  const fm = new THREE.Mesh(fg, MAT.grate); fm.position.y = yg; G.scene.add(fm);
  const edges = [-rf]; for (let z = -Math.floor(rf); z <= Math.floor(rf); z++) edges.push(z); edges.push(rf);
  for (let i = 0; i < edges.length - 1; i++) {
    const za = edges[i], zb = edges[i + 1], zn = za < 0 && zb > 0 ? 0 : Math.min(Math.abs(za), Math.abs(zb)), xm = Math.sqrt(rf * rf - zn * zn), zc = (za + zb) / 2;
    if (Math.min(Math.abs(za), Math.abs(zb)) >= h - 1e-6 && !(za < 0 && zb > 0)) cbox(2 * xm, 0.3, zb - za, 0, yg - 0.15, zc);
    else for (const s of [-1, 1]) cbox(xm - h, 0.3, zb - za, s * (h + xm) / 2, yg - 0.15, zc);
  }
  W.flat([0, w, 0, w], yg); W.edge(w, 0, w, w, yg);
  // its joists, on the beams along the well's edges and on the wall
  const xe = Math.sqrt(rf * rf - hp * hp);
  for (const s of [-1, 1]) {
    beam('iron', [-xe, yg - 0.65, s * hp], [xe, yg - 0.65, s * hp], 1.2, 0.5); beam('iron', [s * hp, yg - 0.65, -hp + 0.25], [s * hp, yg - 0.65, hp - 0.25], 1.2, 0.5);
    for (let v = -20; v <= 20; v += 2) { const e = Math.sqrt(Math.max(0, rf * rf - v * v)) - 0.05; if (e > hp + 0.6) beam('iron', [v, yg - 0.2, s * (hp + 0.25)], [v, yg - 0.2, s * e], 0.3, 0.15); }
    for (let v = -7; v <= 7; v += 2) beam('iron', [s * (hp + 0.25), yg - 0.2, v], [s * (Math.sqrt(rf * rf - v * v) - 0.05), yg - 0.2, v], 0.3, 0.15);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { beam('iron', [sx * hp, y + 0.3, sz * hp], [sx * hp, yg - 1.25, sz * hp], 0.9, 0.9); ibox('iron', 1.5, 0.3, 1.5, sx * hp, y + 0.15, sz * hp); }
  // round the well, but where the stair arrives and the bridge leaves
  railRun('x', h, -h + w, h, yg, [[-0.8, 0.8]]); railRun('x', -h, -h, h, yg); railRun('z', h, -h, h, yg); railRun('z', -h, -h, h - w, yg);
  // the column, the bridge, the platform and the lamp
  const pr = 4.4, base = yg + 1.0, lh = 5.0;
  beam('iron', [0, y + 0.4, 0], [0, yg - 0.55, 0], 0.6, 0.6); ibox('iron', 1.4, 0.4, 1.4, 0, y + 0.2, 0);
  tube('iron', [0.5, y - 0.6, 0.0], [0.5, base, 0.0], 0.08);                                           // (the gas, from the main under the flat)
  deck(-0.8, 0.8, pr, h, yg); rail([-0.8, yg, h], [-0.8, yg, pr]); rail([0.8, yg, h], [0.8, yg, pr]);
  tplane(MAT.grate, -pr, pr, -pr, pr, yg, 1); cbox(2 * pr, 0.3, 2 * pr, 0, yg - 0.15, 0);
  for (const s of [-1, 1]) { beam('iron', [-pr, yg - 0.3, s * pr], [pr, yg - 0.3, s * pr], 0.5, 0.25); beam('iron', [s * pr, yg - 0.3, -pr], [s * pr, yg - 0.3, pr], 0.5, 0.25); beam('iron', [0, yg - 0.3, 0], [s * pr, yg - 0.3, 0], 0.5, 0.25); }
  railRun('x', pr, -pr, pr, yg, [[-0.8, 0.8]]); railRun('x', -pr, -pr, pr, yg); railRun('z', pr, -pr, pr, yg); railRun('z', -pr, -pr, pr, yg);
  icyl('iron', 2.8, 0.3, 0, yg + 0.15, 0); icyl('iron', 2.2, base - yg - 0.3, 0, (yg + 0.3 + base) / 2, 0);
  icyl('glazing', 3.0, lh, 0, base + lh / 2, 0);
  for (let k = 0; k <= 8; k++) icyl('brass', 3.08, 0.14, 0, base + k * lh / 8, 0);
  for (let k = 0; k < 12; k++) { const a = k * TAU / 12; ibox('brass', 0.12, lh, 0.12, 3.05 * Math.cos(a), base + lh / 2, 3.05 * Math.sin(a)); }
  icyl('brass', 3.2, 0.4, 0, base + lh + 0.2, 0); icyl('brass', 0.6, 1.8, 0, base + lh + 1.3, 0);
  for (let k = 0; k < 6; k++) { const a = k * TAU / 6; isph('bulb', 0.35, 0.9 * Math.cos(a), base + lh / 2, 0.9 * Math.sin(a)); }
  icyl('iron', 0.25, lh / 2, 0, base + lh / 4, 0);
  lamp(4.5, y, 12.0); lamp(-11.8, yg, 0); lamp(11.8, yg, 0);
  // headroom: through the door, on the way round the floor to the gallery's door, round the lamp, and out onto the gallery
  G.clear.push({ name: 'the lamp room\'s door', lo: [-1.1, y + 0.1, R - L.drumWall - 0.6], hi: [1.1, y + 3.0, R + 1.0] });
  G.clear.push({ name: 'the walk on the lamp floor', lo: [-7.5, yg + 0.2, h + 0.4], hi: [7.5, yg + 2.2, h + 3.0] });
  for (const s of [-1, 1]) G.clear.push({ name: 'the walk round the lamp', lo: [-pr + 0.3, yg + 0.2, s > 0 ? 3.35 : -pr + 0.3], hi: [pr - 0.3, yg + 2.0, s > 0 ? pr - 0.3 : -3.35] });
  G.clear.push({ name: 'the door onto the lamp room\'s gallery', lo: [-0.6, yg + 0.1, R - 1.3], hi: [0.6, yg + 2.3, R + 0.7] });
  doorway({ c: [0, y, R - L.drumWall / 2], along: 'x', w: 2.5, h: 3.2, zone: 'the lamp room\'s door' });
  doorway({ c: [0, yg, R - 0.575], along: 'x', w: 1.4, h: 2.4, leaves: 1, glazed: true, zone: 'the door onto the lamp room\'s gallery' });
  // The floor's frame (the drum takes the outer half of the floor and the gallery: see the crown, structure.js)
  const A = assembly('lamp floor', 'the lamp room\'s floor: four posts at the corners of the stair\'s well, the beams along its edges, and the column under the lamp');
  const post = SECTION.box(0.9, 0.9, 0.03), edge = SECTION.box(1.2, 0.5, 0.03), col = SECTION.box(0.6, 0.6, 0.025), yb = yg - 0.65;
  const ring = 8 * hp, half = 0.5 * (Math.PI * rf * rf - L.well * L.well) * LAMP_FLOOR * GRAV;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { A.member([sx * hp, yt, sz * hp], [sx * hp, yb, sz * hp], post, MATERIAL.steel, 'beam', 'post'); A.rest([sx * hp, yt, sz * hp], 'crown', 'fix'); }
  for (const s of [-1, 1]) {
    A.member([-hp, yb, s * hp], [hp, yb, s * hp], edge, MATERIAL.steel, 'beam', 'edge beam', null, half / ring);
    A.member([s * hp, yb, -hp], [s * hp, yb, hp], edge, MATERIAL.steel, 'beam', 'edge beam', null, half / ring);
  }
  A.member([0, yt, 0], [0, yb, 0], col, MATERIAL.steel, 'beam', 'column').rest([0, yt, 0], 'crown', 'fix');
  A.member([0, yb, hp], [0, yb, 0], edge, MATERIAL.steel, 'beam', 'bridge', null, 1.6 * LAMP_FLOOR * GRAV);
  A.mass([0, yb, 0], (2 * pr) ** 2 * LAMP_FLOOR + 30e3, 'the lamp, its lens and its platform');
  // the stair's flights bear on its landings at the corners, and they on the posts
  const corner = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (const o of W.out) { const [sx, sz] = corner[o.k]; A.mass([sx * hp, Math.min(o.yb, yb), sz * hp], 7e3, 'the stair'); }
}

// ---- the dial-cleaning cradle (all of it outside)
// A monorail runs under the cornice between the two stair towers, on brackets bolted to the piers, 2.9 m out from the
// wall: in front of the dial's stone rim and behind its hands (which turn 1.7 m further out), so that the cradle can be
// let down the face of the dial and the wall between them without touching either. On the rail runs a trolley; from
// it hang two wire ropes to the cradle, which climbs and descends them on two hand winches, one at each end, as a
// window cleaner's cradle does. It parks against the right-hand stair tower, level with its 210 m landing, through
// whose door the keepers board it (the gate is shut while it is away).
function cradle() {
  G.tag = 'outside';
  const C = CRADLE, y = C.y, z = C.z, oz = TOWER.hz + TOWER.wall, x1 = T.x0 - 0.05;
  ibox('iron', 2 * x1, 0.6, 0.12, 0, y, z); ibox('iron', 2 * x1, 0.05, 0.45, 0, y - 0.3, z); ibox('iron', 2 * x1, 0.05, 0.45, 0, y + 0.3, z);
  const A = assembly('cradle rail', 'the dial-cleaning cradle\'s monorail, on brackets off the front wall'), alloy = MATERIAL.steel, sec = SECTION.box(0.6, 0.45, 0.03);
  const posts = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];
  A.member([-x1, y, z], [x1, y, z], sec, alloy, 'beam', 'rail');
  for (const x of posts) {
    beam('iron', [x, y + 0.5, oz + 1.3], [x, y + 0.5, z + 0.25], 0.5, 0.3); beam('iron', [x, y - 2.8, oz + 1.3], [x, y + 0.25, z], 0.3, 0.25);
    ibox('iron', 0.9, 4.0, 0.08, x, y - 1.1, oz + 1.34);
    A.member([x, y, TOWER.hz + TOWER.wall / 2], [x, y, z], SECTION.box(0.5, 0.3, 0.02), alloy, 'beam', 'bracket');
    A.rest([x, y, TOWER.hz + TOWER.wall / 2], 'shell front', 'fix');
  }
  for (const sx of [-1, 1]) { ibox('iron', 0.1, 1.2, 1.0, sx * (x1 + 0.0), y, z); A.rest([sx * x1, y, z], `stair tower ${sx < 0 ? 'left' : 'right'}`, 'yz'); }
  // the trolley, and the cradle where it parks
  const px = C.park, cy = C.deck, hl = C.len / 2, hd = C.depth / 2;
  ibox('iron', 1.8, 0.5, 0.9, px, y - 0.75, z); for (const dx of [-0.6, 0.6]) for (const dz of [-0.18, 0.18]) icyl('steel', 0.14, 0.08, px + dx, y - 0.26, z + dz, QX);
  A.mass([px, y, z], 3200, 'the cradle, parked, with two men and their gear');
  for (const dx of [-hl + 0.5, hl - 0.5]) { tube('steel', [px + dx * 0.25, y - 1.0, z], [px + dx, cy + 1.6, z], 0.022); }
  ibox('plate', C.len, 0.08, C.depth, px, cy - 0.04, z); cbox(C.len, 0.2, C.depth, px, cy - 0.1, z);
  ibox('iron', C.len, 0.15, 0.05, px, cy - 0.15, z - hd); ibox('iron', C.len, 0.15, 0.05, px, cy - 0.15, z + hd);
  rail([px - hl, cy, z + hd], [px + hl, cy, z + hd]); rail([px - hl, cy, z - hd], [px + hl, cy, z - hd]); rail([px - hl, cy, z - hd], [px - hl, cy, z + hd]);
  for (const dx of [-hl + 0.5, hl - 0.5]) {
    beam('iron', [px + dx, cy, z - hd], [px + dx, cy + 1.6, z], 0.08, 0.08); beam('iron', [px + dx, cy, z + hd], [px + dx, cy + 1.6, z], 0.08, 0.08);
    icyl('iron', 0.24, 0.5, px + dx, cy + 0.9, z, QX); ibox('iron', 0.05, 0.5, 0.05, px + dx + 0.3, cy + 0.9, z + 0.3);
  }
  G.tag = '';
}
