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

// Each arbor: its radius, how far it runs in z, and the z of its two bearings.
export const SHAFT = {
  esc: { r: 1.1, z: [-3.6, 9], bearings: [1.6, 8.3] },
  pivot: { r: 1.0, z: [-13.3, -0.8], bearings: [-12.6, -6.25] },
  third: { r: 1.2, z: [2.5, 15.7], bearings: [3.2, 11.8] },
  center: { r: 1.45, z: [12.3, 49.6], bearings: [18.3, 26] },       // the thickest: its wheels and the hands all overhang its bearings
  great: { r: 1.4, z: [20.2, 31.2], bearings: [24.2, 30.5] },
  minute: { r: 1.0, z: [27, 36], bearings: [27.8, 35.2] },
};

// Walkways
export const STAIRS = { xa: -56, xb: -8, zA: -33.75, zB: -31.25, width: 2.3, pad: 4 };
export const LIFT = { xu: 30, xd: 36, z: -33, hx: 2.4, hz: 2, top: 186, x0: 27.5, x1: 38.5, z0: -35, z1: -31 };
export const BRIDGES = {
  escapement: { y: 90, z0: -7.75, z1: -4.75 },
  centre: { y: 150, z0: 8.7, z1: 11.3 },
  between: { y: 120, z0: 16.1, z1: 18.6 },
  balcony: { y: 120, z0: 36, z1: 40 },
};
// Roof: trusses rise from the wall heads to the ridge; purlins run front to back on them
// every 8.75 m. Whatever cannot stand on the floor or bear on a wall hangs from a purlin.
export const ROOF = { eaves: 219, ridge: 237, purlins: Array.from({ length: 15 }, (_, i) => -61.25 + i * 8.75) };
ROOF.at = (x) => ROOF.eaves + (ROOF.ridge - ROOF.eaves) * (1 - Math.abs(x) / TOWER.hx);

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

// Loose things, kept where a works would keep them: on the floor, clear of the machinery.
// [kind, x, y of its base, z]. (A fifth entry names a floor wheel to start out riding:
// 0 great wheel, 1 idler, 2 flywheel. Nothing does; whatever ends up on one is carried or thrown by friction.)
const crate = (x, y, z) => ['crate', x, y, z], barrel = (x, y, z) => ['barrel', x, y, z], shot = (x, y, z) => ['shot', x, y, z];
export const PROPS = [
  // stores by the door: two stacks of crates, a row of barrels, a few rounds of brass shot
  crate(7, 0, -23), crate(7.9, 0, -23.1), crate(7.4, 0.8, -23), crate(8.9, 0, -22.6),
  crate(10.4, 0, -24.6), crate(11.3, 0, -24.5), crate(10.8, 0.8, -24.6), crate(10.9, 1.6, -24.55),
  barrel(6, 0, -22.2), barrel(9.9, 0, -23.4), barrel(12.6, 0, -23.6),
  shot(5.2, 0, -24.4), shot(5.75, 0, -24.4), shot(6.3, 0, -24.4),
  // and a few set down beside the great floor wheel, within a shove of its teeth
  barrel(FLOOR.h1.x - 19.6, 0, FLOOR.h1.z - 2), barrel(FLOOR.h1.x - 19.8, 0, FLOOR.h1.z), crate(FLOOR.h1.x - 20, 0, FLOOR.h1.z + 2.2),
  shot(FLOOR.h1.x - 19.5, 0, FLOOR.h1.z + 4), shot(FLOOR.h1.x - 19.5, 0, FLOOR.h1.z + 4.6),
];
