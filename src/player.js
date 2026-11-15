// You: an 80 kg capsule, 1.8 m tall, simulated as a real dynamic body.
//
// Everything you feel comes from one rule: your feet can only push against the
// ground with friction (mu * g). Walking, stopping, and being carried by a
// turning gear all draw on that same grip, so a fast enough wheel will throw you.
import * as THREE from 'three';
import { G } from './kit.js';
import { GRAV } from './layout.js';

const HH = 0.55, RAD = 0.35, EYE = 0.75;
const MU = 1.0, WALK = 4.3, RUN = 7.5, JUMP = 5.0;
const DRAG = GRAV / (55 * 55);                 // terminal velocity ~55 m/s
const PROBES = [[0, 0], [0.24, 0], [-0.24, 0], [0, 0.24], [0, -0.24]];
const _gv = new THREE.Vector3(), _pt = new THREE.Vector3();

export class Player {
  constructor(spawn) {
    const R = G.R;
    this.body = G.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(spawn.p[0], spawn.p[1], spawn.p[2])
      .lockRotations().setCcdEnabled(true).setCanSleep(false).setGravityScale(0));
    this.col = G.world.createCollider(R.ColliderDesc.capsule(HH, RAD).setFriction(0)
      .setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0).setDensity(125), this.body);
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.yaw = spawn.yaw || 0; this.pitch = spawn.pitch || 0;
    this.keys = new Set();
    this.grounded = false; this.jumpBuf = 0; this.jumpLock = 0; this.coyote = 0;
    this.stride = 0; this.dip = 0; this.dipV = 0; this.bobAmt = 0;
    this.speed = 0; this.fallV = 0; this.slip = 0;
    this.onStep = null; this.onLand = null;
  }

  teleport(p, yaw, pitch = 0) {
    this.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.yaw = yaw; this.pitch = pitch; this.fallV = 0;
  }
  get position() { return this.body.translation(); }
  get feet() { return this.body.translation().y - HH - RAD; }

  // Called once per physics step, before the world advances.
  step(dt) {
    const b = this.body, p = b.translation(), v = b.linvel(), w = G.world, ray = this.ray;

    // --- what are we standing on?
    let hit = null, toi = Infinity, hx = 0, hz = 0;
    const oy = p.y - HH + 0.05, reach = RAD + 0.05;
    for (const [ox, oz] of PROBES) {
      ray.origin.x = p.x + ox; ray.origin.y = oy; ray.origin.z = p.z + oz;
      const h = w.castRayAndGetNormal(ray, reach + 0.5, true, undefined, undefined, undefined, b);
      if (h && h.timeOfImpact < toi) { toi = h.timeOfImpact; hit = h; hx = ox; hz = oz; }
    }
    const gap = toi - reach;
    const walkable = hit && hit.normal.y > 0.65;
    let part = null; _gv.set(0, 0, 0);
    if (hit) {
      part = G.parts.get(hit.collider.handle) || null;
      if (part) part.velAt(_pt.set(p.x + hx, oy - toi, p.z + hz), _gv);
    }
    this.jumpLock = Math.max(0, this.jumpLock - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    const was = this.grounded;
    let grounded = walkable && gap < 0.12 && this.jumpLock <= 0;
    // stay glued when the floor falls away gently (stairs down, a lift starting to descend)
    const snap = !grounded && was && walkable && gap < 0.5 && this.jumpLock <= 0 && v.y - _gv.y < 1.5;
    if (snap) grounded = true;

    // --- what do we want?
    const k = this.keys;
    let ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let iz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const il = Math.hypot(ix, iz); if (il > 0) { ix /= il; iz /= il; }
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    const wx = ix * cs - iz * sn, wz = -ix * sn - iz * cs;
    const top = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK;

    let vx = v.x, vy = v.y, vz = v.z;
    if (grounded) {
      const n = hit.normal;
      // push toward the wanted velocity *relative to the ground*, limited by grip
      let dx = wx * top - (vx - _gv.x), dz = wz * top - (vz - _gv.z);
      const need = Math.hypot(dx, dz), grip = MU * GRAV * dt;
      this.slip = need > grip * 1.5 && il === 0 ? Math.min(1, this.slip + dt * 4) : Math.max(0, this.slip - dt * 4);
      if (need > grip) { dx *= grip / need; dz *= grip / need; }
      vx += dx; vz += dz;
      // follow the slope downhill instead of launching off it
      const rx = vx - _gv.x, rz = vz - _gv.z, vt = -(n.x * rx + n.z * rz) / n.y;
      if (vt < 0) vy = Math.min(vy, _gv.y + vt);
      if (snap) vy = Math.min(vy, _gv.y - Math.min(gap / dt, 4));
      // Gravity, applied by hand: on walkable ground static friction eats the downhill
      // part, so only the component pressing us into the surface remains.
      const gn = GRAV * n.y * dt; vx -= gn * n.x; vy -= gn * n.y; vz -= gn * n.z;
      if (part) this.yaw += part.angVelY() * dt;      // the floor turns you with it
      this.coyote = 0.1;
      const rs = Math.hypot(rx, rz);
      this.stride += rs * dt; this.bobAmt += ((rs > 0.5 ? Math.min(1, rs / WALK) : 0) - this.bobAmt) * Math.min(1, dt * 8);
      if (this.stride > (rs > 5.5 ? 2.9 : 2.1)) { this.stride = 0; if (this.onStep) this.onStep(rs); }
      if (!was) {
        const impact = Math.max(0, _gv.y - this.fallV);
        if (impact > 2.5) { this.dipV -= Math.min(impact, 30) * 0.16; if (this.onLand) this.onLand(impact); }
      }
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
      this.bobAmt += (0 - this.bobAmt) * Math.min(1, dt * 8);
      vy -= GRAV * dt;
      // air: drag, and a whisper of steering
      const sp = Math.hypot(vx, vy, vz), d = DRAG * sp * dt;
      vx -= vx * d; vy -= vy * d; vz -= vz * d;
      if (il > 0 && vx * wx + vz * wz < 3) { vx += wx * 2.5 * dt; vz += wz * 2.5 * dt; }
    }
    if (this.jumpBuf > 0 && (grounded || this.coyote > 0) && this.jumpLock <= 0) {
      vy = _gv.y + JUMP; this.jumpBuf = 0; this.jumpLock = 0.25; this.coyote = 0; grounded = false;
    }
    this.grounded = grounded;
    this.fallV = vy;
    this.speed = Math.hypot(vx, vy, vz);
    b.setLinvel({ x: vx, y: vy, z: vz }, true);
  }

  updateCamera(cam, dt) {
    const p = this.body.translation();
    this.dipV += (-this.dip * 110 - this.dipV * 15) * dt; this.dip += this.dipV * dt;
    this.dip = Math.max(-0.7, this.dip);
    const bob = Math.sin(this.stride / 2.1 * Math.PI * 2) * 0.035 * this.bobAmt;
    cam.position.set(p.x, p.y + EYE + this.dip + bob, p.z);
    cam.rotation.set(this.pitch, this.yaw, 0);
  }
}
