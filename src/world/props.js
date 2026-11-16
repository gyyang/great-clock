// Loose things: crates, barrels and brass shot. They are ordinary rigid bodies, so
// whatever happens to them is the physics engine's doing: you can shove them, a
// turning wheel carries them, a tooth bats them, the flywheel throws them off.
import * as THREE from 'three';
import { G, MAT, mulberry32 } from '../kit.js';
import { PROPS, GRAV } from '../layout.js';

const rnd = mulberry32(77);

function woodTexture(draw) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const d = c.getContext('2d');
  draw(d, S);
  const img = d.getImageData(0, 0, S, S), px = img.data;              // grain
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = 0.86 + 0.14 * Math.sin(x * 0.9 + Math.sin(y * 0.07) * 3) + (rnd() - 0.5) * 0.1, i = (y * S + x) * 4;
    px[i] *= k; px[i + 1] *= k; px[i + 2] *= k;
  }
  d.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Each kind: how to draw one, and how it collides.
function makeKinds() {
  const R = G.R;
  const crateMat = new THREE.MeshStandardMaterial({ roughness: 0.85, map: woodTexture((d, S) => {
    for (let i = 0; i < 6; i++) { d.fillStyle = `hsl(${28 + rnd() * 8},${38 + rnd() * 12}%,${24 + rnd() * 9}%)`; d.fillRect(0, i * S / 6, S, S / 6 - 2); }
    d.fillStyle = '#3d2915'; const w = S * 0.13;                       // frame and brace
    d.fillRect(0, 0, S, w); d.fillRect(0, S - w, S, w); d.fillRect(0, 0, w, S); d.fillRect(S - w, 0, w, S);
    d.save(); d.translate(S / 2, S / 2); d.rotate(Math.PI / 4); d.fillRect(-S * 0.62, -w / 2, S * 1.24, w); d.restore();
    d.fillStyle = '#15100a'; for (const [x, y] of [[w / 2, w / 2], [S - w / 2, w / 2], [w / 2, S - w / 2], [S - w / 2, S - w / 2]]) { d.beginPath(); d.arc(x, y, 5, 0, 7); d.fill(); }
  }) });
  const staveMat = new THREE.MeshStandardMaterial({ roughness: 0.8, map: woodTexture((d, S) => {
    for (let i = 0; i < 14; i++) { d.fillStyle = `hsl(${24 + rnd() * 8},${40 + rnd() * 12}%,${20 + rnd() * 8}%)`; d.fillRect(i * S / 14, 0, S / 14 - 1.5, S); }
  }) });

  const crateGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const prof = [[0.01, -0.475], [0.3, -0.475], [0.345, -0.25], [0.365, 0], [0.345, 0.25], [0.3, 0.475], [0.01, 0.475]].map(p => new THREE.Vector2(p[0], p[1]));
  const barrelGeo = new THREE.LatheGeometry(prof, 28);
  const hoop = (y, r) => { const g = new THREE.TorusGeometry(r, 0.016, 6, 28); g.rotateX(Math.PI / 2); g.translate(0, y, 0); return g; };
  const hoops = [hoop(-0.4, 0.318), hoop(-0.2, 0.356), hoop(0.2, 0.356), hoop(0.4, 0.318)];
  const shotGeo = new THREE.SphereGeometry(0.24, 28, 20);

  return {
    crate: {
      half: 0.4, grip: 0.6,          // grip: friction against iron (the two coefficients averaged); null if it rolls

      mesh: () => new THREE.Mesh(crateGeo, crateMat),
      collider: () => R.ColliderDesc.cuboid(0.4, 0.4, 0.4).setDensity(70).setFriction(0.7),
    },
    barrel: {
      half: 0.475, grip: 0.55,
      mesh: () => { const m = new THREE.Mesh(barrelGeo, staveMat); for (const h of hoops) m.add(new THREE.Mesh(h, MAT.iron)); return m; },
      collider: () => R.ColliderDesc.cylinder(0.475, 0.35).setDensity(160).setFriction(0.6),
    },
    shot: {
      half: 0.24, grip: null,
      mesh: () => new THREE.Mesh(shotGeo, MAT.brass),
      collider: () => R.ColliderDesc.ball(0.24).setDensity(8400).setFriction(0.4).setRestitution(0.25),
    },
  };
}

// wheels: the floor rotors, so that things placed on one start out moving with it.
export function buildProps(wheels) {
  const kinds = makeKinds(), props = [];
  for (const [kind, x, y, z, riding] of PROPS) {
    const k = kinds[kind], home = { x, y: y + k.half + 0.01, z };
    const body = G.world.createRigidBody(G.R.RigidBodyDesc.dynamic().setTranslation(home.x, home.y, home.z)
      .setCcdEnabled(true).setLinearDamping(0.05).setAngularDamping(0.4));
    G.world.createCollider(k.collider(), body);
    if (riding !== undefined) {
      const w = wheels[riding], wy = w.k * w.axis.y;                  // the wheel's spin about the vertical, rad/s
      body.setLinvel({ x: wy * (z - w.center.z), y: 0, z: -wy * (x - w.center.x) }, true);
      body.setAngvel({ x: 0, y: wy, z: 0 }, true);
    }
    const mesh = k.mesh(); mesh.position.set(home.x, home.y, home.z); G.scene.add(mesh);
    for (const m of [mesh, ...mesh.children]) { m.castShadow = true; m.receiveShadow = true; }
    props.push({ body, mesh, home, half: k.half, grip: k.grip, wheel: null, stuckAt: 0 });
  }
  const ray = new G.R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  return {
    count: props.length, list: props,
    // Once per physics step, before the world advances.
    //
    // Static friction on a turntable, done by hand. The solver cannot hold a body that is
    // spinning along with the surface under it: it lets it creep outward at any speed, however
    // much grip there is. So something standing on a turning wheel *sticks* to it: it is given
    // the wheel's own velocity. It stays stuck only while the centripetal force that needs is
    // within its grip (mu * g) and nothing has knocked it loose. Past that it is an ordinary
    // sliding body again, and goes where the physics sends it.
    step() {
      for (const p of props) {
        const b = p.body;
        if (b.isSleeping()) continue;
        const v = b.linvel(), sp = Math.hypot(v.x, v.y, v.z);
        if (sp > 50) b.setLinvel({ x: v.x * 50 / sp, y: v.y * 50 / sp, z: v.z * 50 / sp }, true);     // spat out of a gear mesh
        if (p.grip === null) continue;                                                                 // shot rolls: nothing to hold
        const t = b.translation(), q = b.rotation();
        let wheel = null;
        if (1 - 2 * (q.x * q.x + q.z * q.z) > 0.9) {                                                   // still upright
          ray.origin.x = t.x; ray.origin.y = t.y; ray.origin.z = t.z;
          const hit = G.world.castRay(ray, p.half + 0.12, true, undefined, undefined, undefined, b);
          wheel = (hit && G.parts.get(hit.collider.handle)) || null;
          if (wheel && !(wheel.axis && Math.abs(wheel.axis.y) > 0.9)) wheel = null;                    // only wheels that lie flat
        }
        if (wheel !== p.wheel) { p.wheel = wheel; p.stuckAt = 0; }
        if (!wheel) continue;
        const w = wheel.axis.y * wheel.omega, rx = t.x - wheel.center.x, rz = t.z - wheel.center.z, r = Math.hypot(rx, rz);
        const gx = w * rz, gz = -w * rx;                                                               // the surface's velocity here
        const slip = Math.hypot(v.x - gx, v.z - gz);
        if (Math.abs(w) < 0.02 || r < 0.05 || w * w * r > p.grip * GRAV || slip > (p.stuckAt ? 1.0 : 0.5)) { p.stuckAt = 0; continue; }
        if (!p.stuckAt) p.stuckAt = r;
        const ease = (p.stuckAt - r) * 5 / r;                                                          // settle back to where it stuck
        b.setLinvel({ x: gx + rx * ease, y: v.y, z: gz + rz * ease }, true);
        const a = b.angvel(); b.setAngvel({ x: a.x, y: w, z: a.z }, true);
      }
    },
    // Copy each body's pose to its mesh. Anything that leaves the world goes back where it started.
    sync() {
      for (const p of props) {
        const t = p.body.translation();
        if (t.y < -20 || !Number.isFinite(t.y)) {
          p.body.setTranslation(p.home, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          p.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
          continue;
        }
        p.mesh.position.set(t.x, t.y, t.z);
        const r = p.body.rotation(); p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
    },
  };
}
