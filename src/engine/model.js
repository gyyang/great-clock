// The engine as an object: bed, cylinder, motion work, governor, pipework and
// the operator's stand. Returns the handful of moving parts and the points
// where steam escapes; engine.js poses them from the simulation.
import * as THREE from 'three';
import { G, MAT, ibox, icyl, isph, cbox, tbox, lamp, cagePanel } from '../kit.js';
import { boltCircle } from '../clock/gears.js';
import { ENGINE as E, FLOOR, TOWER, DEG } from '../layout.js';

const Q_ALONG_Z = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));   // unit cylinders stand on y
const Q_ALONG_X = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
const zCyl = (r, len, seg = 32) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
const yCyl = (r, len, seg = 24) => new THREE.CylinderGeometry(r, r, len, seg);
const box = (sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz);
function add(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m;
}
function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
}

// A dial gauge facing along x (side = +1 or -1). Returns a function that sets its reading.
function gauge(x, y, z, side, max, step, label) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const d = c.getContext('2d'), R = S / 2, ang = (v) => (225 - 270 * v / max) * DEG;
  d.translate(R, R);
  d.fillStyle = '#efe2c2'; d.beginPath(); d.arc(0, 0, R, 0, 7); d.fill();
  d.strokeStyle = d.fillStyle = '#1b130c'; d.textAlign = 'center'; d.textBaseline = 'middle';
  for (let v = 0; v <= max + 1e-6; v += step / 2) {
    const a = ang(v), major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    d.lineWidth = major ? 5 : 2;
    d.beginPath(); d.moveTo(Math.cos(a) * R * 0.9, -Math.sin(a) * R * 0.9); d.lineTo(Math.cos(a) * R * (major ? 0.74 : 0.81), -Math.sin(a) * R * (major ? 0.74 : 0.81)); d.stroke();
    if (major) { d.font = `bold ${R * 0.19}px Georgia, serif`; d.fillText(String(v), Math.cos(a) * R * 0.57, -Math.sin(a) * R * 0.57); }
  }
  d.font = `${R * 0.15}px Georgia, serif`; d.fillText(label, 0, R * 0.52);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;

  const g = group(G.scene, x, y, z); g.rotation.y = side * Math.PI / 2;
  add(g, new THREE.CircleGeometry(0.42, 48), new THREE.MeshStandardMaterial({ color: 0x5a5348, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3, roughness: 0.6 }));
  add(g, new THREE.TorusGeometry(0.42, 0.05, 10, 48), MAT.bronze);
  add(g, zCyl(0.46, 0.12, 40), MAT.iron, 0, 0, -0.07);
  const needle = add(g, box(0.36, 0.028, 0.012).translate(0.13, 0, 0), new THREE.MeshBasicMaterial({ color: 0x1a0d08 }), 0, 0, 0.02);
  add(g, new THREE.SphereGeometry(0.035, 12, 8), MAT.bronze, 0, 0, 0.02);
  return (v) => { needle.rotation.z = ang(Math.min(max, Math.max(0, v))); };
}

export function buildEngineModel(h3) {
  const O = FLOOR.h3, at = (s) => O.z - s;          // world z of a point s metres along the cylinder axis
  const zCylc = at(E.cylS), scene = G.scene;
  const opSide = Math.sign(E.standX), stackSide = Math.sign(E.stackX);

  // ---- crank, on the flywheel shaft (h3's own frame: z is up, origin at the pinion's centre)
  {
    const up = (y) => y - h3.center.y, g = h3.group;
    add(g, zCyl(1.45, 0.25, 40), MAT.bronze, 0, 0, up(4.33));
    add(g, box(E.crank + 1.7, 1.0, 0.25), MAT.steel, (E.crank - 0.9) / 2, 0, up(4.33));
    add(g, box(1.3, 2.0, 0.25), MAT.bronze, -1.7, 0, up(4.33));                              // counterweight
    add(g, zCyl(0.26, 0.62, 20), MAT.steel, E.crank, 0, up(4.14));                           // crank pin
  }

  // ---- bed, guards and guide bars
  {
    const len = E.bedS1 - E.bedS0, zc = at((E.bedS0 + E.bedS1) / 2);
    tbox(MAT.brick, 2 * E.bedHalf, E.bedTop - 0.2, len, O.x, (E.bedTop - 0.2) / 2, zc);
    ibox('iron', 2 * E.bedHalf + 0.2, 0.2, len + 0.2, O.x, E.bedTop - 0.1, zc);
    cbox(3, 3, len, O.x, E.bedTop + 1.5, zc);                                                // the machinery itself
    cagePanel(O.x - 1.5, O.x + 1.5, E.bedTop, 3.7, at(E.bedS0 + 0.05), at(E.bedS0 + 0.05));
    for (const sx of [-1, 1]) cagePanel(O.x + sx * 1.5, O.x + sx * 1.5, E.bedTop, 3.7, at(10.6), at(E.bedS0));
    for (const sy of [-1, 1]) ibox('steel', 0.5, 0.14, 4.8, O.x, E.axisY + sy * 0.47, at(8.1));
    for (const s of [5.8, 10.4]) for (const sx of [-1, 1]) ibox('iron', 0.16, E.axisY + 0.54 - E.bedTop, 0.3, O.x + sx * 0.5, (E.axisY + 0.54 + E.bedTop) / 2, at(s));
    for (const ds of [-1.6, 1.6]) ibox('iron', 2.4, 0.5, 0.5, O.x, E.bedTop + 0.25, at(E.cylS + ds));     // cylinder saddles
  }

  // ---- cylinder and valve chest
  const cyl = group(scene, O.x, E.axisY, zCylc);
  add(cyl, zCyl(E.cylR, E.cylLen - 0.4, 56), MAT.brass);
  for (const z of [-1.5, 0, 1.5]) add(cyl, zCyl(E.cylR + 0.04, 0.2, 56), MAT.bronze, 0, 0, z);
  for (const sz of [-1, 1]) add(cyl, zCyl(E.cylR + 0.12, 0.22, 56), MAT.iron, 0, 0, sz * (E.cylLen / 2 - 0.11));
  boltCircle(cyl, E.cylR - 0.1, 18, E.cylLen / 2 + 0.02, 0.1);
  add(cyl, zCyl(0.36, 0.5, 20), MAT.bronze, 0, 0, E.cylLen / 2 + 0.25);                      // piston-rod gland
  add(cyl, box(1.5, 0.75, 3.4), MAT.bronze, 0, E.cylR + 0.3, 0);
  add(cyl, yCyl(0.22, 1.7).rotateZ(Math.PI / 2), MAT.copper, stackSide * 1.6, E.cylR + 0.3, 0);   // exhaust, across to the stack
  const valveRod = add(cyl, zCyl(0.07, 2.6, 10), MAT.steel, 0, E.cylR + 0.3, 3.0);

  // ---- motion work: crosshead with piston rod, and the connecting rod
  const slide = group(scene, O.x, E.axisY, 0);
  add(slide, box(0.9, 0.8, 0.9), MAT.steel);
  for (const sy of [-1, 1]) add(slide, box(0.6, 0.1, 1.0), MAT.bronze, 0, sy * 0.36, 0);
  add(slide, zCyl(0.15, E.pistonRod, 20), MAT.steel, 0, 0, -E.pistonRod / 2);
  const rod = group(scene, O.x, E.axisY, 0);                                                 // its own x axis runs crosshead -> crank pin
  add(rod, box(E.rod - 0.8, 0.26, 0.42), MAT.steel, E.rod / 2, 0, 0);
  add(rod, yCyl(0.52, 0.4), MAT.bronze, E.rod, 0, 0);
  add(rod, yCyl(0.4, 0.36), MAT.bronze, 0, 0, 0);

  // ---- governor
  const l = E.govArm, zg = at(E.govS);
  ibox('iron', 0.8, 1.0, 0.8, O.x, E.bedTop + 0.5, zg);
  icyl('steel', 0.08, E.govHinge + 0.25 - (E.bedTop + 1), O.x, (E.govHinge + 0.25 + E.bedTop + 1) / 2, zg);
  const gov = group(scene, O.x, E.govHinge, zg);
  add(gov, new THREE.SphereGeometry(0.16, 16, 12), MAT.bronze);
  add(gov, new THREE.SphereGeometry(0.11, 16, 12), MAT.brass, 0, 0.3, 0);
  const sleeve = add(gov, yCyl(0.17, 0.3, 16), MAT.bronze);
  const arms = [], links = [];
  for (const sg of [1, -1]) {
    const arm = group(gov); arm.userData.side = sg;
    add(arm, box(0.07, l, 0.07), MAT.steel, 0, -l / 2, 0);
    add(arm, new THREE.SphereGeometry(0.34, 24, 16), MAT.brass, 0, -l, 0);
    const link = group(gov); link.userData.side = sg;
    add(link, box(0.05, l / 2, 0.05), MAT.steel, 0, l / 4, 0);
    arms.push(arm); links.push(link);
  }

  // ---- pipework: supply from the corner main, exhaust stack, whistle
  {
    const top = E.axisY + E.cylR + 0.67, run = E.pipeWallX - O.x, zEnd = -(TOWER.hz - 1.2);
    icyl('copper', 0.3, E.pipeY - top, O.x, (E.pipeY + top) / 2, zCylc);
    icyl('copper', 0.3, run, O.x + run / 2, E.pipeY, zCylc, Q_ALONG_X);
    icyl('copper', 0.3, zCylc - zEnd, E.pipeWallX, E.pipeY, (zCylc + zEnd) / 2, Q_ALONG_Z);
    isph('copper', 0.36, E.pipeWallX, E.pipeY, zCylc);
    isph('bronze', 0.5, O.x, E.pipeY, zCylc);                                                // throttle valve
    for (let x = O.x + 3; x < E.pipeWallX - 1; x += 4) icyl('bronze', 0.42, 0.14, x, E.pipeY, zCylc, Q_ALONG_X);
    for (let z = zCylc - 3; z > zEnd + 1; z -= 6) {
      icyl('bronze', 0.42, 0.14, E.pipeWallX, E.pipeY, z, Q_ALONG_Z);
      ibox('iron', TOWER.hx - E.pipeWallX, 0.12, 0.12, (TOWER.hx + E.pipeWallX) / 2, E.pipeY - 0.36, z - 0.4);
    }
    const sx = O.x + E.stackX;
    icyl('copper', 0.4, E.stackTop, sx, E.stackTop / 2, zCylc); icyl('bronze', 0.5, 0.3, sx, E.stackTop, zCylc);
    G.world.createCollider(G.R.ColliderDesc.cylinder(E.stackTop / 2, 0.4).setTranslation(sx, E.stackTop / 2, zCylc));
    icyl('copper', 0.07, 0.9, O.x, E.pipeY + 0.9, zCylc); icyl('brass', 0.2, 0.7, O.x, E.pipeY + 1.6, zCylc); isph('brass', 0.2, O.x, E.pipeY + 1.95, zCylc);
    ibox('rail', Math.abs(E.standX), 0.05, 0.05, O.x + E.standX / 2, E.pipeY + 1.3, zCylc);            // whistle lever and its chain
    ibox('rail', 0.03, E.pipeY - 0.2, 0.03, O.x + E.standX, (E.pipeY + 1.3 + 1.5) / 2, at(E.chainS));
    isph('brass', 0.1, O.x + E.standX, 1.45, at(E.chainS));
    const v = E.safety;
    icyl('bronze', 0.3, 0.9, v.x, v.y + 0.45, v.z); isph('brass', 0.24, v.x, v.y + 1.05, v.z);
  }

  // ---- operator's stand: regulator lever, two gauges, a lamp to read them by
  const standX = O.x + E.standX, zl = at(E.leverS), zq = at(E.gaugeS);
  ibox('iron', 0.3, 0.9, 0.5, standX, 0.45, zl); ibox('bronze', 0.06, 0.5, 1.0, standX, 1.1, zl);
  cbox(0.3, 1.3, 1.0, standX, 0.65, zl);
  const lever = group(scene, standX, 0.9, zl);
  add(lever, box(0.07, 1.25, 0.07), MAT.rail, 0, 0.62, 0);
  add(lever, new THREE.SphereGeometry(0.09, 16, 12), MAT.brass, 0, 1.27, 0);
  const postX = standX - opSide * 0.5;                                                       // gauges stand back toward the bed, facing you
  ibox('iron', 0.16, 2.3, 0.16, postX, 1.15, zq); ibox('iron', 0.1, 0.1, 1.9, postX, 1.85, zq);
  cbox(0.16, 2.3, 0.16, postX, 1.15, zq);
  const setPressure = gauge(postX + opSide * 0.1, 1.85, zq + opSide * 0.5, opSide, 8, 2, 'BAR');
  const setSpeed = gauge(postX + opSide * 0.1, 1.85, zq - opSide * 0.5, opSide, 20, 5, 'REV / MIN');
  lamp(standX - opSide * 0.6, 0, at(E.gaugeS + 1.9));
  const glow = new THREE.PointLight(0xffa050, 120, 60, 2); glow.position.set(O.x + opSide * 7, 9, at(12)); scene.add(glow);

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  return {
    slide, rod, valveRod, gov, arms, links, sleeve, lever, setPressure, setSpeed,
    points: {
      centre: V(O.x, E.axisY, at(11)),
      exhaust: V(O.x + E.stackX, E.stackTop + 0.2, zCylc),
      gland: V(O.x, E.axisY + 0.3, at(E.cylS - E.cylLen / 2 - 0.5)),
      drain: V(O.x + stackSide * 1.2, E.bedTop + 0.3, at(E.cylS + E.cylLen / 2)),
      whistle: V(O.x, E.pipeY + 1.3, zCylc),
      safety: V(E.safety.x, E.safety.y + 1.3, E.safety.z),
      leak: V(TOWER.hx - 1.9, 15.4, -(TOWER.hz - 1.9)),
      lever: V(standX, 0, zl),
      chain: V(standX, 0, at(E.chainS)),
    },
  };
}
