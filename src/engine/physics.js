// Steam engine dynamics. Numbers only: nothing here knows about rendering.
//
// A double-acting cylinder turns a crank. Steam is admitted for the first part
// of each stroke and then expands; the torque that reaches the crank follows
// from the slider-crank geometry. That torque works against the load of the
// floor train and the inertia of the flywheel, a flyball governor throttles
// the steam as the speed rises, and the boiler's pressure falls as steam is
// drawn off and rises as the fire catches up.
import { GRAV, DEG, ENGINE } from '../layout.js';

export const NOMINAL = 1.2;          // governed crank speed, rad/s (11.5 rev/min)

export const NOTCHES = [
  { name: 'shut', open: 0, governed: true },
  { name: 'half', open: 0.3, governed: true },
  { name: 'full', open: 1, governed: true },
  { name: 'full, governor tied down', open: 1, governed: false },
];

const P = {
  area: Math.PI * ENGINE.bore ** 2,  // piston area, m^2
  cutoff: 0.4,                       // fraction of the stroke with the steam port open
  clearance: 0.05,                   // dead volume at each end, as a fraction of the swept volume
  back: 0.12e5,                      // exhaust back pressure, Pa
  inertia: 1.2e7,                    // flywheel and train, kg m^2
  c0: 2.5e5, c1: 2e5, c2: 3e5,       // load torque = c0 + c1 w + c2 w^2, N m
  barring: 0.03,                     // creep off a dead centre, rad/s
  govRatio: 2.4, govDamp: 3,         // governor spindle turns this much faster than the crank
  govMin: 17 * DEG, govMax: 69 * DEG,
  govOpen: 30 * DEG, govShut: 58 * DEG,   // arm angles between which the throttle goes from wide open to closed
  fire: 0.582, setPoint: 5.2,        // firing rate that holds the set pressure (bar) at the nominal load
  capacity: 10,                      // how slowly boiler pressure answers
  lift: 6.0, reseat: 5.55, vent: 0.14,    // safety valve, bar and bar/s
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Distance from the crankshaft to the crosshead pin at crank angle phi (0 = outer dead centre).
export function crosshead(phi) {
  const r = ENGINE.crank, sn = Math.sin(phi);
  return r * Math.cos(phi) + Math.sqrt(ENGINE.rod * ENGINE.rod - r * r * sn * sn);
}

// Torque on the crank at angle phi with steam admitted at pAdm (Pa, gauge).
function torque(phi, pAdm) {
  const r = ENGINE.crank, l = ENGINE.rod, sn = Math.sin(phi), cs = Math.cos(phi);
  const q = Math.sqrt(l * l - r * r * sn * sn);
  const x = r * cs + q, dxdphi = -r * sn - r * r * sn * cs / q;
  const y = (l + r - x) / (2 * r);              // piston position: 0 at the head end, 1 at the crank end
  const outward = sn >= 0;                      // the head end is driving
  const progress = outward ? y : 1 - y;
  const p = progress < P.cutoff ? pAdm : pAdm * (P.clearance + P.cutoff) / (P.clearance + progress);   // admission, then expansion
  const force = (outward ? -1 : 1) * (p - P.back) * P.area;
  return force * dxdphi;                        // virtual work: torque dphi = force dx
}

export class EngineSim {
  constructor() {
    this.w = NOMINAL;          // crank speed, rad/s
    this.p = P.setPoint;       // boiler pressure, bar (gauge)
    this.notch = 2;            // regulator position
    this.gov = 42 * DEG;       // governor arm angle from the spindle
    this.govV = 0;
    this.throttle = 0.56;      // what the regulator and governor together let through, 0..1
    this.venting = false;      // safety valve lifted
    this.extra = 0;            // further load on the crank, N m: the winding gear, when it is engaged
    this.tap = 0;              // steam taken off the boiler for something else (the hoist's engine), in the units of the draw below
    this.half = null;
    this.onExhaust = null;     // (strength) once per stroke
    this.onVent = null;        // (open)
  }

  get rpm() { return this.w * 30 / Math.PI; }
  get regulator() { return NOTCHES[this.notch]; }
  get govSpeed() { return P.govRatio * this.w; }     // governor spindle, rad/s

  // Advance by dt with the crank at angle phi.
  step(dt, phi) {
    const n = NOTCHES[this.notch];
    const gov = n.governed ? clamp((P.govShut - this.gov) / (P.govShut - P.govOpen), 0, 1) : 1;
    this.throttle = n.open * gov;

    // crank: steam torque against load and inertia
    const tq = torque(phi, this.p * 1e5 * this.throttle);
    if (this.w > 1e-4) this.w = Math.max(0, this.w + (tq - P.c0 - this.extra - P.c1 * this.w - P.c2 * this.w * this.w) / P.inertia * dt);
    else if (tq > P.c0 + this.extra) this.w = (tq - P.c0 - this.extra) / P.inertia * dt;
    else this.w = this.throttle > 0 ? P.barring : 0;      // stuck near a dead centre: bar it round

    const half = Math.floor(phi / Math.PI);
    if (this.half !== null && half !== this.half && this.throttle > 0.02 && this.onExhaust) this.onExhaust(Math.min(1.2, this.p * this.throttle / 5 + 0.15));
    this.half = half;

    // governor: centrifugal force lifts the balls, gravity pulls them down
    const om = P.govRatio * this.w;
    this.govV += ((om * om * Math.cos(this.gov) - GRAV / ENGINE.govArm) * Math.sin(this.gov) - P.govDamp * this.govV) * dt;
    this.gov += this.govV * dt;
    if (this.gov < P.govMin) { this.gov = P.govMin; this.govV = Math.max(0, this.govV); }
    if (this.gov > P.govMax) { this.gov = P.govMax; this.govV = Math.min(0, this.govV); }

    // boiler: the damper answers a pressure drop with a harder fire, and the safety valve caps it
    const fire = P.fire * clamp(1 + 1.5 * (P.setPoint - this.p), 0.35, 2.2);
    const draw = (this.w / NOMINAL) * this.throttle * this.p / 5 + this.tap;
    this.p += ((fire - draw) / P.capacity - (this.venting ? P.vent : 0)) * dt;
    if (!this.venting && this.p > P.lift) { this.venting = true; if (this.onVent) this.onVent(true); }
    else if (this.venting && this.p < P.reseat) { this.venting = false; if (this.onVent) this.onVent(false); }
  }
}
