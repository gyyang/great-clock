// Every dimension of the tower and its movement, in metres.
// x: left/right, y: up, z: depth (the dial is on the +z wall).

export const DEG = Math.PI / 180;
export const GRAV = 9.81;

// Interior hall: 140 m wide, 80 m deep, 240 m tall (Hoover Dam is 221 m).
export const TOWER = { hx: 70, hz: 40, H: 240, wall: 2 };
export const LEVELS = [30, 60, 90, 120, 150, 180];

export const DIAL = { x: 0, y: 150, r: 55, z: 41 };

// Pendulum. T = 2*pi*sqrt(L/g)*(1 + theta0^2/16) = 20 s for L = 99 m: one beat every ten seconds.
export const PEND = {
  pivotY: 109.3, L: 99.0, z: -10,
  theta0: 6 * DEG,        // swing amplitude
  thetaRel: 1.05 * DEG,   // pallet releases its tooth this far past centre
  bobR: 8, deckDrop: 8.3, deckHalfX: 6, deckHalfZ: 3,
};

// Anchor escapement: 30-tooth escape wheel, pallets span 6.5 teeth.
export const ESC = { R: 13, N: 30, depth: 2.3, pallet: 39 * DEG, z: -2 };
ESC.D = ESC.R / Math.cos(ESC.pallet);     // pivot-to-wheel distance (pallets tangent to the tip circle)
ESC.y = PEND.pivotY - ESC.D;

// z of each layer of the going train, back to front.
export const LAYER = { esc: -2, A: 6, B: 14, C: 22, motionA: 30, motionB: 33 };

// Arbor positions in the dial plane, solved from gear centre distances.
const aA = 0.9 * (16 + 48) / 2;   // escape pinion <-> third wheel
const aB = 1.1 * (20 + 40) / 2;   // third pinion  <-> centre wheel
const aC = 0.8 * (10 + 80) / 2;   // centre pinion <-> great wheel
const d = DIAL.y - ESC.y;
const h = (aA * aA - aB * aB + d * d) / (2 * d);
export const ARBOR = {
  esc: { x: 0, y: ESC.y },
  pivot: { x: 0, y: PEND.pivotY },
  third: { x: Math.sqrt(aA * aA - h * h), y: ESC.y + h },
  center: { x: 0, y: DIAL.y },
  great: { x: -25.5, y: DIAL.y - Math.sqrt(aC * aC - 25.5 * 25.5) },
  minute: { x: 20 * Math.cos(60 * DEG), y: DIAL.y + 20 * Math.sin(60 * DEG) },
};

// Walkways
export const STAIRS = { xa: -56, xb: -8, zA: -33.75, zB: -31.25, width: 2.3, pad: 4 };
export const LIFT = { xu: 30, xd: 36, z: -33, hx: 2.4, hz: 2, top: 186, x0: 27.5, x1: 38.5, z0: -35, z1: -31 };
export const BRIDGES = {
  escapement: { y: 90, z0: -7.75, z1: -4.75 },
  centre: { y: 150, z0: 8.5, z1: 11.5 },
  between: { y: 120, z0: 15.8, z1: 18.8 },
  balcony: { y: 120, z0: 36, z1: 40 },
};
export const LEDGE = { y: 120, z0: 42, z1: 45, hx: 58, doorX: 52 };

// Where the bob's riding deck comes to rest at the top of its swing.
export function bobLanding() {
  const r = PEND.L - PEND.deckDrop, t = PEND.theta0, e = PEND.deckHalfX;
  return {
    x: e * Math.cos(t) + r * Math.sin(t) + 0.3,
    y: PEND.pivotY + e * Math.sin(t) - r * Math.cos(t),
  };
}

// Continuously turning floor gears (shrouded spur gears lying flat).
export const FLOOR = {
  top: 2.1,
  h1: { x: 44, z: 20, N: 40 },
  h2: { x: 20, z: 20, N: 20 },
  h3: { x: 44 + 20 * Math.cos(50 * DEG), z: 20 - 20 * Math.sin(50 * DEG), N: 10 },
  m: 0.8, w1: 0.3, flyR: 8, flyTop: 5.6,
};

// The steam engine that turns the floor train. Its crank sits on the flywheel
// shaft (floor gear h3) and the cylinder lies along -z from there.
// Fields ending in S are distances from that shaft along the cylinder axis.
export const ENGINE = {
  crank: 1.8, rod: 8, axisY: 4.05,                    // crank radius, connecting-rod length, height of the piston line
  bore: 1.1, pistonRod: 5.4,                          // cylinder bore radius, piston-rod length
  cylS: 13.4, cylLen: 4.8, cylR: 1.3,                 // cylinder centre, length, outer radius
  bedS0: 5.6, bedS1: 18.4, bedTop: 2.6, bedHalf: 1.9, // the brick bed everything stands on
  govS: 17.3, govArm: 1.6, govHinge: 6.1,             // flyball governor
  standX: 3.4, leverS: 11, gaugeS: 12.2, chainS: 13.4,    // the operator's side (toward the wall): regulator, gauges, whistle chain
  stackX: -2.4, stackTop: 15,                         // exhaust stack, on the other side
  pipeY: 7.5, pipeWallX: 68.4,                        // steam supply from the corner main
  safety: { x: -41, y: 11.2, z: -22 },                // safety valve, on top of the boiler
};

// Loose things lying about the hall: [kind, x, y of its base, z, floor wheel it starts out riding (0 great wheel, 1 idler, 2 flywheel)].
const crate = (x, y, z) => ['crate', x, y, z], barrel = (x, y, z) => ['barrel', x, y, z], shot = (x, y, z) => ['shot', x, y, z];
const onFly = (a, r) => [FLOOR.h3.x + r * Math.cos(a), FLOOR.flyTop, FLOOR.h3.z + r * Math.sin(a), 2];
export const PROPS = [
  // a pile by the door, to shove about
  crate(7, 0, -23), crate(7.9, 0, -23.1), crate(7.4, 0.8, -23), crate(8.9, 0, -22.6), barrel(6, 0, -22.2), barrel(9.9, 0, -23.4),
  shot(5.2, 0, -24.4), shot(5.75, 0, -24.4), shot(6.3, 0, -24.4),
  // a stack standing where the pendulum's rating nut sweeps the floor
  crate(6, 0, -10), crate(6, 0.8, -10), crate(6, 1.6, -10), barrel(7.4, 0, -10.2),
  // riding the idler wheel
  [...barrel(FLOOR.h2.x + 4, FLOOR.top, FLOOR.h2.z), 1], [...barrel(FLOOR.h2.x - 3, FLOOR.top, FLOOR.h2.z + 3), 1],
  // riding the flywheel: they stay put at the governed speed, and not when the governor is tied down
  ['crate', ...onFly(0.4, 2.4)], ['crate', ...onFly(2.5, 2.4)], ['crate', ...onFly(4.6, 2.4)],
  // within a shove of the great floor wheel's teeth
  barrel(FLOOR.h1.x - 19.6, 0, FLOOR.h1.z - 2), barrel(FLOOR.h1.x - 19.8, 0, FLOOR.h1.z), crate(FLOOR.h1.x - 20, 0, FLOOR.h1.z + 2.2),
  shot(FLOOR.h1.x - 19.5, 0, FLOOR.h1.z + 4), shot(FLOOR.h1.x - 19.5, 0, FLOOR.h1.z + 4.6),
];
