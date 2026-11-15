// The steam engine: ties the simulation (physics.js) to the thing you see
// (model.js), the steam it gives off (steam.js), and what you can do to it.
//
// The crank is on the flywheel shaft, so the engine's speed *is* the speed of
// the floor train: open the regulator and the wheels you stand on turn faster.
import { ENGINE as E, FLOOR } from '../layout.js';
import { EngineSim, NOTCHES, NOMINAL, crosshead } from './physics.js';
import { buildEngineModel } from './model.js';
import { SteamCloud } from './steam.js';

const REACH = 2.2;        // how close you must stand to use a control, m

export function buildEngine(clock, scene) {
  const h3 = clock.floor[2], O = FLOOR.h3;
  const sim = new EngineSim(), model = buildEngineModel(h3), steam = new SteamCloud(scene);
  const pts = model.points;
  const listeners = { chuff: [], vent: [], whistle: [], regulator: [] };
  const emit = (name, arg) => listeners[name].forEach(fn => fn(arg));

  let puff = 0, whistleT = 0, leverA = 0;
  sim.onExhaust = (strength) => { puff = Math.max(puff, strength); emit('chuff', strength); };
  sim.onVent = (open) => emit('vent', open);
  const crankAngle = () => Math.PI / 2 - h3.angle;      // 0 with the crank pointing at the cylinder

  // ---- once per physics step
  function update(dt) {
    sim.step(dt, crankAngle());
    clock.state.floorRate = sim.w / NOMINAL;
  }

  // ---- once per rendered frame
  const flow = {};
  function trickle(key, rate, dt, fn) {
    flow[key] = (flow[key] || 0) + rate * dt;
    while (flow[key] >= 1) { flow[key]--; fn(); }
  }
  function pose(dt) {
    const a = crankAngle(), sc = crosshead(a), z = O.z - sc;
    model.slide.position.z = z;
    model.rod.position.z = z;
    model.rod.rotation.y = Math.atan2(-(sc - E.crank * Math.cos(a)), E.crank * Math.sin(a));
    model.valveRod.position.z = 3.0 - 0.28 * Math.sin(a);                 // the valve leads the piston by a quarter turn
    model.gov.rotation.y += sim.govSpeed * dt;
    const drop = -E.govArm * Math.cos(sim.gov);
    for (const arm of model.arms) arm.rotation.z = arm.userData.side * sim.gov;
    for (const link of model.links) { link.position.y = drop; link.rotation.z = -link.userData.side * sim.gov; }
    model.sleeve.position.y = drop;
    leverA += ((sim.notch - 1.5) * 0.42 - leverA) * Math.min(1, dt * 10);
    model.lever.rotation.x = leverA;
    model.setPressure(sim.p); model.setSpeed(sim.rpm);
  }
  function vent(dt) {
    if (puff > 0) {
      for (let i = 0; i < 26; i++) steam.emit(pts.exhaust, [0, 4 + 6 * puff * Math.random(), 0], { spread: 1.5, life: 5.5, s0: 1.0, s1: 5.5, alpha: 0.4 * puff });
      puff = 0;
    }
    const live = sim.throttle > 0;
    trickle('gland', live ? 5 : 0.6, dt, () => steam.emit(pts.gland, [0, 0.5, 0.6], { spread: 0.35, life: 1.8, s0: 0.15, s1: 1.0, alpha: 0.22 }));
    trickle('drain', live ? 3 : 0, dt, () => steam.emit(pts.drain, [Math.sign(E.stackX) * 0.7, -0.2, 0], { spread: 0.3, life: 1.6, s0: 0.15, s1: 0.9, alpha: 0.2 }));
    trickle('leak', 2.5, dt, () => steam.emit(pts.leak, [-0.8, 0.3, 0.8], { spread: 0.3, life: 2.4, s0: 0.2, s1: 1.6, alpha: 0.22 }));
    if (sim.venting) trickle('safety', 70, dt, () => steam.emit(pts.safety, [0, 11, 0], { spread: 1.3, life: 3.2, s0: 0.4, s1: 5.5, alpha: 0.3 }));
    if (whistleT > 0) {
      whistleT -= dt;
      trickle('whistle', 60, dt, () => steam.emit(pts.whistle, [0, 5, 0], { spread: 2.2, life: 1.4, s0: 0.2, s1: 2.4, alpha: 0.3 }));
    }
    steam.update(dt, scene.fog);
  }
  function frame(dt) { pose(dt); vent(dt); }

  // ---- controls
  const flat = (a, p) => Math.hypot(p.x - a.x, p.z - a.z);
  function control(p) {
    if (p.y > 4) return null;
    const dl = flat(pts.lever, p), dc = flat(pts.chain, p);
    if (Math.min(dl, dc) > REACH) return null;
    return dl <= dc ? 'regulator' : 'whistle';
  }
  function whistle(seconds = 1.6) { whistleT = Math.max(whistleT, seconds); emit('whistle', seconds); }

  return {
    sim, update, frame, whistle,
    on(name, fn) { listeners[name].push(fn); },
    // Use whatever control is within reach of a player at p. Returns what happened, or null.
    use(p) {
      const c = control(p);
      if (c === 'regulator') { sim.notch = (sim.notch + 1) % NOTCHES.length; emit('regulator', sim.notch); return `Regulator: ${sim.regulator.name}`; }
      if (c === 'whistle') { whistle(); return 'Whistle'; }
      return null;
    },
    hint(p) {
      const c = control(p);
      return c === 'regulator' ? `E — regulator (${sim.regulator.name})` : c === 'whistle' ? 'E — pull the whistle chain' : '';
    },
    readout(p) {
      return p.y < 30 && flat(pts.centre, p) < 45 ? `${sim.rpm.toFixed(1)} rev/min · ${sim.p.toFixed(1)} bar` : '';
    },
    // 0..1: how loud the engine is from p
    loudness(p) {
      return Math.min(1, Math.max(0.2, 1.25 - Math.hypot(p.x - pts.centre.x, p.y - pts.centre.y, p.z - pts.centre.z) / 110));
    },
  };
}
