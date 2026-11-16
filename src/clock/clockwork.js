// The movement. A real pendulum is integrated every physics step; an anchor
// escapement lets one tooth through per beat; the escape wheel's angle then
// drives every other wheel, and finally the hands, through true gear ratios.
import * as THREE from 'three';
import { G, MAT, QX, ibox, icyl, sbox, deck, rail, stair, lamp } from '../kit.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { spec, gearGeometry, escapeSpec, escapeOutline, extrude, planarUV, addGearColliders, addEscapeColliders, meshOffset, rivetRing, boltCircle } from './gears.js';
import { DEG, GRAV, PEND, ESC, ARBOR, LAYER, DIAL, LEVELS, LIFT, FLOOR, TOWER } from '../layout.js';

const TAU = Math.PI * 2;
const ZAXIS = new THREE.Vector3(0, 0, 1);
const QFLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); // local z -> world up
const _w = new THREE.Vector3();

// A kinematic body that turns about one axis. Meshes hang off `group`.
class Rotor {
  constructor(x, y, z, base = null) {
    this.center = new THREE.Vector3(x, y, z);
    this.base = base ? base.clone() : new THREE.Quaternion();
    this.axis = ZAXIS.clone().applyQuaternion(this.base);
    this.group = new THREE.Group(); this.group.position.copy(this.center); G.scene.add(this.group);
    this.body = G.world.createRigidBody(G.R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    this.q = new THREE.Quaternion(); this.angle = 0; this.omega = 0; this.k = 0; this.c = 0;
  }
  addCollider(desc) { const col = G.world.createCollider(desc, this.body); G.parts.set(col.handle, this); return col; }
  _apply() { this.q.setFromAxisAngle(ZAXIS, this.angle).premultiply(this.base); this.group.quaternion.copy(this.q); }
  init(angle) { this.angle = angle; this.omega = 0; this._apply(); this.body.setRotation(this.q, true); }
  set(angle, dt) { this.omega = (angle - this.angle) / dt; this.angle = angle; this._apply(); this.body.setNextKinematicRotation(this.q); }
  velAt(p, out) { _w.copy(this.axis).multiplyScalar(this.omega); return out.copy(p).sub(this.center).cross(_w).negate(); }
  angVelY() { return this.axis.y * this.omega; }
}

// A kinematic body that translates (lift platforms).
class Mover {
  constructor(mesh, pos) {
    this.mesh = mesh; this.pos = pos.clone(); this.vel = new THREE.Vector3();
    this.body = G.world.createRigidBody(G.R.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z));
    mesh.position.copy(pos); G.scene.add(mesh);
  }
  addCollider(desc) { const col = G.world.createCollider(desc, this.body); G.parts.set(col.handle, this); return col; }
  set(p, dt) { this.vel.copy(p).sub(this.pos).divideScalar(dt); this.pos.copy(p); this.mesh.position.copy(p); this.body.setNextKinematicTranslation(p); }
  velAt(p, out) { return out.copy(this.vel); }
  angVelY() { return 0; }
}

// ------------------------------------------------------------- part makers
function mountGear(rotor, s, z, mat) {
  const m = new THREE.Mesh(gearGeometry(s), mat); m.position.z = z; rotor.group.add(m);
  addGearColliders(rotor, s, z);
  if (s.spokes || s.recess) {
    rivetRing(m, (s.rr + s.rimIn) / 2, Math.round(s.r * 3.2), s.t / 2);
    boltCircle(m, s.hubR * 0.7, s.spokes ? 8 : 6, s.t * 0.64, Math.min(0.34, s.hubR * 0.1));
  } else rivetRing(m, s.rr * 0.6, Math.max(8, Math.round(s.r * 2)), s.t / 2);
  return m;
}
function mountArbor(rotor, z0, z1, r) {
  const g = new THREE.CylinderGeometry(r, r, z1 - z0, 28); g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, MAT.steel); m.position.z = (z0 + z1) / 2; rotor.group.add(m);
  rotor.addCollider(G.R.ColliderDesc.cylinder((z1 - z0) / 2, r).setRotation(QX).setTranslation(0, 0, (z0 + z1) / 2));
  for (const z of [z0, z1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.35, r * 1.35, 0.5, 8).rotateX(Math.PI / 2), MAT.bronze);
    cap.position.z = z; rotor.group.add(cap);
  }
}
function gbox(parent, mat, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); parent.add(m); return m;
}
// Gear b is driven by gear a (tooth counts Na, Nb).
function link(a, Na, b, Nb) {
  const beta = Math.atan2(b.center.y - a.center.y, b.center.x - a.center.x);
  b.k = -a.k * Na / Nb;
  b.c = -a.c * Na / Nb + meshOffset(beta, Na, Nb);
}

function thickPath(pts, width) {
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const w = typeof width === 'function' ? width(i / (pts.length - 1)) : width;
    const t = new THREE.Vector2(b[0] - a[0], b[1] - a[1]).normalize();
    left.push(new THREE.Vector2(p[0] - t.y * w, p[1] + t.x * w));
    right.push(new THREE.Vector2(p[0] + t.y * w, p[1] - t.x * w));
  }
  return new THREE.Shape([...left, ...right.reverse()]);
}

// ------------------------------------------------------------------ build
export function buildClockwork() {
  const R = G.R, listeners = { release: [], impact: [], hour: [], half: [] };
  const emit = (name, arg) => listeners[name].forEach(fn => fn(arg));

  // ---- pendulum + anchor (one rigid piece, like a real crutch-coupled pair)
  const pen = new Rotor(0, PEND.pivotY, 0);
  const pz = PEND.z, L = PEND.L, deckY = -(L - PEND.deckDrop);
  {
    const g = pen.group;
    // gridiron rod: alternating steel and brass, as on a temperature-compensated pendulum
    const rodLen = L - 9, rodY = -(1.5 + rodLen / 2);
    for (let i = -2; i <= 2; i++) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, rodLen, 20), i % 2 ? MAT.brass : MAT.steel);
      rod.position.set(i * 0.46, rodY, pz); g.add(rod);
    }
    for (let y = -4; y > -(L - 9); y -= 9.5) gbox(g, MAT.bronze, 2.5, 0.45, 0.6, 0, y, pz);
    // the bob: a brass lens, turned on a lathe
    const bR = PEND.bobR, prof = [];
    const hAt = (r) => 0.3 + 1.25 * Math.sqrt(Math.max(0, 1 - (r / bR) ** 2)) + 0.2 * Math.exp(-(((r - 0.8 * bR) / 0.28) ** 2)) + 0.3 * Math.exp(-((r / 1.5) ** 4));
    // a lathe profile has to run from the bottom up for its surface to face outward
    for (let i = 0; i <= 40; i++) { const r = Math.max(0.01, bR * i / 40); prof.push(new THREE.Vector2(r, -hAt(r))); }
    for (let i = 40; i >= 0; i--) { const r = Math.max(0.01, bR * i / 40); prof.push(new THREE.Vector2(r, hAt(r))); }
    const bob = new THREE.Mesh(planarUV(new THREE.LatheGeometry(prof, 128).rotateX(Math.PI / 2)), MAT.brass);
    bob.position.set(0, -L, pz); g.add(bob);
    rivetRing(g, 5.2, 28, 1.3, 0.22).position.set(0, -L, pz);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.4, 8), MAT.bronze); nut.position.set(0, -L - PEND.bobR - 1, pz); g.add(nut);
    gbox(g, MAT.iron, 3.4, 3.4, 2.2, 0, 0, pz);                                               // suspension block
    // riding deck on top of the bob
    const ex = PEND.deckHalfX, ez = PEND.deckHalfZ;
    gbox(g, MAT.plate, 2 * ex, 0.3, 2 * ez, 0, deckY - 0.15, pz);
    for (const sz of [-1, 1]) {
      gbox(g, MAT.rail, 2 * ex, 0.08, 0.08, 0, deckY + 1.1, pz + sz * ez);
      gbox(g, MAT.rail, 2 * ex, 0.05, 0.05, 0, deckY + 0.55, pz + sz * ez);
      for (let i = 0; i <= 6; i++) gbox(g, MAT.rail, 0.08, 1.1, 0.08, -ex + i * 2 * ex / 6, deckY + 0.55, pz + sz * ez);
      pen.addCollider(R.ColliderDesc.cuboid(ex, 0.6, 0.05).setTranslation(0, deckY + 0.6, pz + sz * ez));
    }
    pen.addCollider(R.ColliderDesc.cuboid(ex, 0.15, ez).setTranslation(0, deckY - 0.15, pz));
    pen.addCollider(R.ColliderDesc.cuboid(1.15, (L - 9) / 2, 0.3).setTranslation(0, -(1.5 + (L - 9) / 2), pz));
    pen.addCollider(R.ColliderDesc.cylinder(1.5, PEND.bobR).setRotation(QX).setTranslation(0, -L, pz));
    pen.addCollider(R.ColliderDesc.cylinder(0.7, 1.6).setTranslation(0, -L - PEND.bobR - 1, pz));       // rating nut: it skims the floor

    // anchor: pallet tips sit on tangents from the pivot to the escape wheel's tip circle
    const rp = ESC.R - 0.2, tx = rp * Math.sin(ESC.pallet), ty = -ESC.D + rp * Math.cos(ESC.pallet);
    const path = [[-tx, ty], [-tx - 3.3, ty + 3.9], [-7.5, 1.2], [0, 2.4], [7.5, 1.2], [tx + 3.3, ty + 3.9], [tx, ty]];
    const curve = new THREE.SplineCurve(path.map(p => new THREE.Vector2(p[0], p[1]))).getPoints(60).map(v => [v.x, v.y]);
    const anchorGeo = toCreasedNormals(extrude(thickPath(curve, (u) => 0.72 + 0.55 * Math.sin(Math.PI * u)), 1.6, 0.12, 10, 2), 0.7);
    const anchor = new THREE.Mesh(anchorGeo, MAT.steel); anchor.position.z = ESC.z; g.add(anchor);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 2.0, 32).rotateX(Math.PI / 2), MAT.bronze); hub.position.z = ESC.z; g.add(hub);
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      pen.addCollider(R.ColliderDesc.cuboid(len / 2, 0.8, 0.8).setTranslation((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ESC.z)
        .setRotation({ x: 0, y: 0, z: Math.sin(ang / 2), w: Math.cos(ang / 2) }));
    }
    mountArbor(pen, -13.3, -0.8, 1.0);
  }

  // ---- going train
  const S = {
    esc: escapeSpec(ESC.R, ESC.N, ESC.depth, 2.2),
    escP: spec(16, 0.9, 3.2), third: spec(48, 0.9, 2.5, { spokes: 6 }),
    thirdP: spec(20, 1.1, 3.2, { spokes: 4 }), center: spec(40, 1.1, 2.5, { spokes: 6 }),
    centerP: spec(10, 0.8, 3.2), great: spec(80, 0.8, 2.5, { spokes: 8 }),
    cannon: spec(20, 0.5, 1.8), minuteW: spec(60, 0.5, 1.6, { spokes: 5 }),
    minuteP: spec(15, 8 / 15, 1.8), hourW: spec(60, 8 / 15, 1.6, { spokes: 6 }),
  };
  const rEsc = new Rotor(ARBOR.esc.x, ARBOR.esc.y, 0);
  const rThird = new Rotor(ARBOR.third.x, ARBOR.third.y, 0);
  const rCenter = new Rotor(ARBOR.center.x, ARBOR.center.y, 0);
  const rGreat = new Rotor(ARBOR.great.x, ARBOR.great.y, 0);
  const rMinute = new Rotor(ARBOR.minute.x, ARBOR.minute.y, 0);
  const rHour = new Rotor(ARBOR.center.x, ARBOR.center.y, 0);

  {
    const m = new THREE.Mesh(gearGeometry(S.esc, escapeOutline(S.esc)), MAT.brass); m.position.z = LAYER.esc; rEsc.group.add(m);
    addEscapeColliders(rEsc, S.esc, LAYER.esc);
    rivetRing(m, (S.esc.rr + S.esc.rimIn) / 2, 40, S.esc.t / 2);
    boltCircle(m, S.esc.hubR * 0.7, 8, S.esc.t * 0.64, 0.26);
  }
  mountGear(rEsc, S.escP, LAYER.A, MAT.steel); mountArbor(rEsc, -3.6, 9, 1.1);
  mountGear(rThird, S.third, LAYER.A, MAT.brass); mountGear(rThird, S.thirdP, LAYER.B, MAT.steel); mountArbor(rThird, 2.5, 15.7, 1.2);
  mountGear(rCenter, S.center, LAYER.B, MAT.brass); mountGear(rCenter, S.centerP, LAYER.C, MAT.steel);
  mountGear(rCenter, S.cannon, LAYER.motionA, MAT.steel); mountArbor(rCenter, 12.3, 49.6, 1.3);
  mountGear(rGreat, S.great, LAYER.C, MAT.brass); mountArbor(rGreat, 20.2, 31.2, 1.4);
  mountGear(rMinute, S.minuteW, LAYER.motionA, MAT.brass); mountGear(rMinute, S.minuteP, LAYER.motionB, MAT.steel); mountArbor(rMinute, 27, 36, 1.0);
  mountGear(rHour, S.hourW, LAYER.motionB, MAT.brass);

  // Escape wheel: tooth 0 sits at clock-angle (alpha + 11deg) from the top, turning clockwise seen from the dial side.
  rEsc.k = -1; rEsc.c = Math.PI / 2 - 11 * DEG;
  link(rEsc, 16, rThird, 48); link(rThird, 20, rCenter, 40); link(rCenter, 10, rGreat, 80);
  link(rCenter, 20, rMinute, 60); link(rMinute, 15, rHour, 60);
  const train = [rEsc, rThird, rCenter, rGreat, rMinute, rHour];

  // barrel, chain and driving weight
  {
    const g = new THREE.CylinderGeometry(5, 5, 4, 40); g.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(g, MAT.bronze); barrel.position.z = 27; rGreat.group.add(barrel);
    rGreat.addCollider(R.ColliderDesc.cylinder(2, 5).setRotation(QX).setTranslation(0, 0, 27));
    for (const z of [25, 29]) { const fl = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.4, 40).rotateX(Math.PI / 2), MAT.iron); fl.position.z = z; rGreat.group.add(fl); }
    const now = new Date(), frac = ((now.getHours() % 8) * 3600 + now.getMinutes() * 60) / 28800;
    const wx = ARBOR.great.x - 5, wTop = 72 - TAU * 5 * frac;
    ibox('iron', 0.5, ARBOR.great.y - wTop, 0.35, wx, (ARBOR.great.y + wTop) / 2, 27);
    icyl('iron', 4.5, 16, wx, wTop - 8, 27); icyl('bronze', 4.7, 0.6, wx, wTop - 1.5, 27); icyl('bronze', 4.7, 0.6, wx, wTop - 14.5, 27);
    G.world.createCollider(R.ColliderDesc.cylinder(8, 4.5).setTranslation(wx, wTop - 8, 27));
  }

  // hands (outside the glass) and their shadows (seen from inside, through it)
  {
    const minuteShape = new THREE.Shape([[-1.2, -10], [1.2, -10], [2.0, -2], [2.4, 6], [1.0, 46], [0, 50], [-1.0, 46], [-2.4, 6], [-2.0, -2]].map(p => new THREE.Vector2(...p)));
    const hourShape = new THREE.Shape([[-1.6, -8], [1.6, -8], [2.6, 0], [3.6, 18], [1.7, 30], [0, 34], [-1.7, 30], [-3.6, 18], [-2.6, 0]].map(p => new THREE.Vector2(...p)));
    const mk = (rotor, shape, z, zShadow, len) => {
      const holder = new THREE.Group(); holder.rotation.z = -rotor.c; rotor.group.add(holder);
      const hand = new THREE.Mesh(extrude(shape, 0.7, 0.14, 10, 2), MAT.rail); hand.position.z = z; holder.add(hand);
      const sh = new THREE.Mesh(new THREE.ShapeGeometry(shape), MAT.shadow); sh.position.z = zShadow; holder.add(sh);
      const boss = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 1.0, 32).rotateX(Math.PI / 2), MAT.bronze); boss.position.z = z; holder.add(boss);
      const a = Math.PI / 2 - rotor.c;   // direction the hand points in the rotor's own frame
      rotor.addCollider(R.ColliderDesc.cuboid(len / 2, 1.5, 0.35).setTranslation(Math.cos(a) * len * 0.42, Math.sin(a) * len * 0.42, z)
        .setRotation({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) }));
    };
    mk(rCenter, minuteShape, 48.6, 40.55, 56);
    mk(rHour, hourShape, 47, 40.7, 40);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 15.6, 28).rotateX(Math.PI / 2), MAT.bronze); pipe.position.z = 39.8; rHour.group.add(pipe);
  }

  // ---- floor gears: always turning, shrouded so you can walk across the mesh
  const floorRotors = [], nips = [];
  {
    const F = FLOOR, t = 1.6, cy = F.top - 0.1 - t / 2;
    const mk = (d) => {
      const s = spec(d.N, F.m, t), r = new Rotor(d.x, cy, d.z, QFLAT);
      const m = new THREE.Mesh(gearGeometry(s), MAT.brass); r.group.add(m);
      const fg = new THREE.CylinderGeometry(s.r, s.r, 0.1, 96); fg.rotateX(Math.PI / 2);
      const fl = new THREE.Mesh(fg, [MAT.bronze, MAT.turntable, MAT.bronze]); fl.position.z = t / 2 + 0.05; r.group.add(fl);
      addGearColliders(r, s, 0);                                                                      // every tooth is solid: stand in its way and it hits you
      r.addCollider(R.ColliderDesc.cylinder(0.05, s.r).setRotation(QX).setTranslation(0, 0, t / 2 + 0.05));   // the shroud you walk on
      icyl('iron', Math.min(3, s.r * 0.4), cy - t / 2, d.x, (cy - t / 2) / 2, d.z);
      r.spec = s; floorRotors.push(r); return r;
    };
    const h1 = mk(F.h1), h2 = mk(F.h2), h3 = mk(F.h3);
    const flat = (a, b) => Math.atan2(-(b.center.z - a.center.z), b.center.x - a.center.x);
    h1.k = F.w1; h1.c = 0;
    for (const [a, b] of [[h1, h2], [h1, h3]]) {
      b.k = -a.k * a.spec.N / b.spec.N; b.c = meshOffset(flat(a, b), a.spec.N, b.spec.N);
      // Nip guards: an iron plate either side of the mesh, where the gap between the wheels
      // narrows to a body's width. Teeth will knock you about; the nip would not let go.
      const Ra = a.spec.r, Rb = b.spec.r, curv = 1 / Ra + 1 / Rb;
      nips.push({ a: a.center, ra: a.spec.ra - 0.2, b: b.center, rb: b.spec.ra - 0.2 });
      const dx = b.center.x - a.center.x, dz = b.center.z - a.center.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
      const d = Math.sqrt(2 * (1.1 + 2 * F.m) / curv), off = d * d * (1 / Rb - 1 / Ra) / 4;       // where the gap is 1.1 m, and its middle
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-uz, ux));
      for (const sg of [-1, 1]) {
        const gx = a.center.x + ux * (Ra + off) - uz * d * sg, gz = a.center.z + uz * (Ra + off) + ux * d * sg;
        sbox('iron', 1.0, 2.1, 0.12, gx, 1.05, gz, q);
        ibox('rail', 1.1, 0.1, 0.2, gx, 2.15, gz, q);
      }
    }
    // main shaft rising out of the big wheel
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 14, 24).rotateX(Math.PI / 2), MAT.steel); shaft.position.z = 7.9; h1.group.add(shaft);
    h1.addCollider(R.ColliderDesc.cylinder(7, 1.1).setRotation(QX).setTranslation(0, 0, 7.9));
    for (const a of [0, Math.PI]) { const ball = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14), MAT.brass); ball.position.set(Math.cos(a) * 3.2, Math.sin(a) * 3.2, 12.5); h1.group.add(ball); gbox(h1.group, MAT.steel, 3.2, 0.25, 0.25, Math.cos(a) * 1.6, 0, 13.6).rotation.y = a ? -0.35 : 0.35; }
    // the flywheel on the fast pinion's shaft: at the rim, grip runs out
    const fz = F.flyTop - 0.4 - cy;
    const fwg = new THREE.CylinderGeometry(F.flyR, F.flyR, 0.8, 96); fwg.rotateX(Math.PI / 2);
    const fw = new THREE.Mesh(fwg, [MAT.bronze, MAT.turntable, MAT.bronze]); fw.position.z = fz; h3.group.add(fw);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(F.flyR - 0.25, 0.42, 10, 96), MAT.brass); rim.position.z = fz; h3.group.add(rim);
    const fs = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, fz, 24).rotateX(Math.PI / 2), MAT.steel); fs.position.z = fz / 2 + 0.4; h3.group.add(fs);
    h3.addCollider(R.ColliderDesc.cylinder(0.4, F.flyR).setRotation(QX).setTranslation(0, 0, fz));
    h3.addCollider(R.ColliderDesc.cylinder(fz / 2, 1.0).setRotation(QX).setTranslation(0, 0, fz / 2 + 0.4));

    // ways up
    stair([F.h1.x, 0, F.h1.z - h1.spec.ra - 5.6], [F.h1.x, F.top, F.h1.z - h1.spec.ra - 0.25], 3);
    stair([F.h2.x, 0, F.h2.z - h2.spec.ra - 5.6], [F.h2.x, F.top, F.h2.z - h2.spec.ra - 0.25], 3);
    const px0 = F.h3.x + F.flyR + 0.25, px1 = TOWER.hx - 0.4, pzc = F.h3.z;
    deck(px0, px1, pzc - 2, pzc + 2, F.flyTop);
    rail([px0, F.flyTop, pzc - 2], [px1, F.flyTop, pzc - 2]); rail([px0, F.flyTop, pzc + 2], [px1 - 2.5, F.flyTop, pzc + 2]);
    stair([px1 - 1.25, 0, pzc + 2 + F.flyTop / Math.tan(31 * DEG)], [px1 - 1.25, F.flyTop, pzc + 2], 2.3);
    lamp(px0 + 0.2, F.flyTop, pzc - 2);
  }

  // ---- paternoster lifts: every platform moves one storey on each beat
  const stations = [], platforms = [];
  {
    const ys = [0, ...LEVELS];
    for (const y of ys) stations.push(new THREE.Vector3(LIFT.xu, y + 0.02, LIFT.z));
    for (const y of [...ys].reverse()) stations.push(new THREE.Vector3(LIFT.xd, y + 0.02, LIFT.z));
    const geo = new THREE.BoxGeometry(LIFT.hx * 2, 0.3, LIFT.hz * 2); geo.translate(0, -0.15, 0);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.2, uv.getY(i));
    for (let i = 0; i < stations.length; i++) {
      const mesh = new THREE.Mesh(geo, MAT.plate);
      gbox(mesh, MAT.bronze, LIFT.hx * 2 + 0.1, 0.12, 0.12, 0, -0.06, LIFT.hz); gbox(mesh, MAT.bronze, LIFT.hx * 2 + 0.1, 0.12, 0.12, 0, -0.06, -LIFT.hz);
      const mv = new Mover(mesh, stations[i]);
      mv.addCollider(R.ColliderDesc.cuboid(LIFT.hx, 0.15, LIFT.hz).setTranslation(0, -0.15, 0));
      platforms.push(mv);
    }
  }

  // ------------------------------------------------------------ simulation
  const TH0 = PEND.theta0, REL = PEND.thetaRel, STEP = 6 * DEG, DROP = 0.45, RECOIL = 1.0 * DEG, DAMP = 0.004, LIFT_T = 6;
  const beatsNow = () => { const d = new Date(); return Math.floor(((d.getHours() % 12) * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 10); };
  const s = { n: beatsNow(), th: 0, om: 0, dropT: 10, landed: true, liftT: -1, liftShift: 0, floorA: 0, floorRate: 1 };   // n: beats since 12:00; floorRate: set by the steam engine
  const rest = () => { s.th = (s.n % 2 === 0 ? -1 : 1) * TH0 * 0.999; s.om = 0; s.dropT = 10; s.landed = true; };  // even count: resting on the right-hand pallet
  rest();
  const _lp = new THREE.Vector3();

  function alpha() {
    const e = Math.min(1, s.dropT / DROP);
    const rec = s.landed ? RECOIL * Math.max(0, Math.abs(s.th) - REL) / (TH0 - REL) : 0;
    return (s.n - 1 + e * e) * STEP - rec;
  }
  function tick() {
    s.n++; s.dropT = 0; s.landed = false;
    // impulse: the escape wheel gives back exactly the energy the swing has lost
    const E = 0.5 * s.om * s.om + (GRAV / L) * (1 - Math.cos(s.th)), Et = (GRAV / L) * (1 - Math.cos(TH0));
    if (E < Et) s.om = Math.sign(s.om) * Math.sqrt(s.om * s.om + 2 * (Et - E));
    emit('release', s.n);
  }
  function placeLifts(dt) {
    const u = s.liftT < 0 ? 0 : Math.min(1, s.liftT / LIFT_T), e = (1 - Math.cos(Math.PI * u)) / 2, N = stations.length;
    for (let i = 0; i < N; i++) {
      _lp.lerpVectors(stations[(i + s.liftShift) % N], stations[(i + s.liftShift + 1) % N], e);
      if (dt) platforms[i].set(_lp, dt); else { platforms[i].pos.copy(_lp); platforms[i].mesh.position.copy(_lp); platforms[i].body.setTranslation(_lp, true); }
    }
  }

  const setTrain = () => { pen.init(s.th); const a = alpha(); for (const r of train) r.init(r.k * a + r.c); };
  setTrain();
  for (const r of floorRotors) r.init(r.c);
  placeLifts(0);

  function update(dt) {
    // pendulum: theta'' = -(g/L) sin(theta), semi-implicit Euler
    s.om += (-(GRAV / L) * Math.sin(s.th) - DAMP * s.om) * dt;
    const prev = s.th; s.th += s.om * dt;
    if ((prev < REL && s.th >= REL) || (prev > -REL && s.th <= -REL)) tick();
    s.dropT += dt;
    if (!s.landed && s.dropT >= DROP) {
      s.landed = true; emit('impact', s.n);
      if (s.liftT < 0) s.liftT = 0;
      if (s.n % 360 === 0) emit('hour', (s.n / 360) % 12 || 12); else if (s.n % 360 === 180) emit('half');
    }
    pen.set(s.th, dt);
    const a = alpha();
    for (const r of train) r.set(r.k * a + r.c, dt);
    s.floorA += dt * s.floorRate;
    for (const r of floorRotors) r.set(r.k * s.floorA + r.c, dt);
    if (s.liftT >= 0) { s.liftT += dt; if (s.liftT >= LIFT_T) { s.liftT = -1; s.liftShift = (s.liftShift + 1) % stations.length; } }
    placeLifts(dt);
  }

  return {
    update, state: s,
    floor: floorRotors,          // [great wheel, idler, flywheel pinion]: driven by the steam engine
    // Is a body at p down among the teeth where two floor wheels mesh? Nothing comes out of there.
    caught(p) {
      if (p.y > FLOOR.top - 0.1) return false;
      return nips.some(n => Math.hypot(p.x - n.a.x, p.z - n.a.z) < n.ra && Math.hypot(p.x - n.b.x, p.z - n.b.z) < n.rb);
    },
    // If the mechanism has fallen more than half a minute behind the wall clock, set it right.
    resync() { let d = Math.abs(beatsNow() - s.n); d = Math.min(d, 4320 - d); if (d > 3) { s.n = beatsNow(); rest(); setTrain(); } },
    on(name, fn) { listeners[name].push(fn); },
    seconds() { return s.n * 10; },
    escapement: new THREE.Vector3(0, ESC.y + 10, ESC.z),
  };
}
