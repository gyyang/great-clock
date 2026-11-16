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
  theta0: 3 * DEG,        // the swing it is designed for (more than this and the suspension spring would not last)
  bobR: 8, deckDrop: 8.3, deckHalfX: 6, deckHalfZ: 3,
};
PEND.kg = Math.PI * PEND.bobR ** 2 * 2.2 * 8500 + 5 * Math.PI * 0.17 ** 2 * (PEND.L - 9) * 7850;      // the bob and the rod (clockwork.js weighs them the same way)
// The suspension: four leaves of maraging steel side by side along the pivot's axis, all in one plane, each 1.2 m wide
// and 200 mm thick. A strip clamped under a tension T bends over a length lambda = sqrt(E I / T) below its clamp and,
// if it is much longer than that, turns about a point lambda below the clamp: there is the pendulum's pivot (pivotY),
// and the strip's stiffness is in that, since what it stores bending exactly makes up what the pendulum loses by
// turning about a point lambda lower. These are 2 lambda long; the lower end then bends too, a little, and the pivot
// is `top` lambda below the clamp, the moment there `top` times a long strip's and at the lower clamp `bottom` times it.
PEND.leaf = { n: 4, w: 1.2, gap: 0.13, t: 0.2, E: 190e9, uts: 1.8e9, alpha: 10.1e-6, cheek: 40 };     // cheek: radius of the chops' faces where the leaves leave them
{
  const f = PEND.leaf;
  f.tension = PEND.kg * GRAV / (f.n * f.w * f.t);
  f.lambda = f.t * Math.sqrt(f.E / (12 * f.tension)); f.free = 2 * f.lambda;
  const E1 = Math.exp(-f.free / f.lambda), lb = PEND.L - f.lambda, k = (lb - f.lambda) / (lb + f.lambda);
  f.top = (1 + E1 * E1 * k) / (1 - E1 * E1 * k); f.bottom = E1 * (1 + k) / (1 - E1 * E1 * k);
  f.clampY = PEND.pivotY + f.top * f.lambda;           // where the leaves leave the upper chops
  f.chopsY = f.clampY - f.free;                        // ... and go into the lower ones, at the head of the rod
}

// Anchor escapement: 30-tooth escape wheel, pallets span 6.5 teeth.
export const ESC = { R: 13, N: 30, depth: 2.3, pallet: 39 * DEG, z: -2 };
ESC.D = ESC.R / Math.cos(ESC.pallet);     // how far the escape arbor is below the pendulum's suspension (16.7 m; the figures are those of the anchor it once had, kept so that nothing else moves)
ESC.y = PEND.pivotY - ESC.D;

// The gravity escapement, on the back end of the escape arbor. A three-legged wheel, three lifting pins and a fly turn
// with the arbor; two arms hang from beside the pendulum's suspension, one either side of the arbor.
export const GESC = {
  legs: 4.5, pins: 0.8, pinR: 0.15,                // length of a leg, radius of the pin circle, radius of a pin
  zBrake: 0.55, zDiff: -1.3, bevelR: 0.5,          // the train's brake disc; the middle of the remontoire's differential, and its wheels' radius
  zWheel: -2.6, zArm: -3.5,                        // planes of the legs, and of the arms and pins
  pivotX: 0.25, pivotUp: 0.5,                      // an arm's pivot: this far out from the pendulum's, and this far above it
  armX: 4.3,                                       // where an arm passes the arbor's height when it is lifted
  beatY: ESC.y - 13.3,                             // height of the beat pins, by which an arm rests on the pendulum rod
  low: 0.4 * DEG,                                  // the pendulum's angle when it sets an arm down on a pin
};
GESC.up = GESC.low + GESC.pins * 0.5 / (PEND.pivotY + GESC.pivotUp - ESC.y);     // ... and when it picks one up: a pin lifts an arm by half the pin circle's radius

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
  pivot: { x: 0, y: PEND.leaf.clampY + 1.5 },      // not an arbor: the head beam the pendulum's suspension spring is clamped in
  third: { x: Math.sqrt(aA * aA - h * h), y: ESC.y + h },
  center: { x: 0, y: DIAL.y },
  great: { x: -25.5, y: DIAL.y - Math.sqrt(aC * aC - 25.5 * 25.5) },
  minute: { x: 20 * Math.cos(60 * DEG), y: DIAL.y + 20 * Math.sin(60 * DEG) },
};

// Each arbor: its radius, how far it runs in z, and the z of its two bearings. A bearing
// plane lies in a gap between the layers of wheels, clear of every crossing, because a
// tower stands in it from the floor up.
export const SHAFT = {
  esc: { r: 1.1, z: [-0.6, 10.3], bearings: [1.6, 8.9] },            // the last arbor of the train; the remontoire and the escape wheel ride on a spigot on its back end
  pivot: { r: 1.0, z: [-14.6, -2.2], bearings: [-13.8, -6.3], beam: true },       // the suspension's head beam: it runs on forward to carry the gravity arms' pivots
  third: { r: 1.2, z: [1.9, 15.95], bearings: [3.2, 10.9] },
  center: { r: 1.45, z: [11.55, 52.4], bearings: [12.0, 26], dial: 41.5 },        // a bearing either side of its wheels, and a third in the boss of the dial's frame (dial), which the hands are just outside
  great: { r: 1.4, z: [19.15, 35.2], bearings: [19.6, 30.5] },        // a bearing either side of the great wheel and the barrel; the winding wheel and its clutch overhang the front one
  minute: { r: 1.0, z: [26.5, 36.5], bearings: [27.8, 35.2] },
};

// Walkways
export const STAIRS = { xa: -56, xb: -8, zA: -33.75, zB: -31.25, width: 2.3, pad: 4 };
// The lift is a paternoster: cars hung from two endless chains that run over a pair of wheels at the top (yt) and a
// pair at the bottom (yb), up one side (xu) and down the other (xd). A car's deck hangs `hang` below its pivot on the chains.
export const LIFT = { xu: 30, xd: 36, z: -33, hx: 2.0, hz: 1.6, top: 197, x0: 27.5, x1: 38.5, z0: -35, z1: -31,
  yb: 6.65, hang: 3.4, cars: 35, guard: 10.5, pulley: 0.8, driven: 1.2, teeth: 24,
  // yb: a car's deck clears the floor by 50 mm as it swings under the bottom wheels. A car goes between the two wheels of
  // each pair, so nothing on it but its axle is wider than its deck: the chains run `chain` outside the deck's edges, and
  // the last `sill` of the deck on each open side is a ramp down to its edge. Each landing has a sill plate that reaches in
  // across the chains' gap to the deck, notched where a chain and the axle's end go by.
  deck: 0.2, chain: 0.2, sill: 0.37, gap: 0.03, notch: 0.35 };
LIFT.pitch = Math.PI * (LIFT.xd - LIFT.xu) / LIFT.teeth;          // of the chain: one link to a tooth of the wheels
LIFT.yt = LIFT.yb + 233 * LIFT.pitch;                             // a whole number of links between the wheels, so the chain closes (about 190 m)
export const BRIDGES = {
  escapement: { y: 90, z0: -5.3, z1: -3.8 },         // a catwalk: behind the escapement, in front of the pendulum's frame         // behind the escapement, in front of the pendulum's frame
  centre: { y: 150, z0: 8.7, z1: 11.3 },
  between: { y: 120, z0: 16.8, z1: 18.8 },          // (clear of the third pinion's hub on one side and the great wheel's ratchet on the other)
  balcony: { y: 120, z0: 36, z1: 40 },
};
// Roof: trusses rise from the wall heads to the ridge; purlins run front to back on them
// every 8.75 m. Whatever cannot stand on the floor or bear on a wall hangs from a purlin.
export const ROOF = { eaves: 219, ridge: 237, purlins: Array.from({ length: 15 }, (_, i) => -61.25 + i * 8.75) };
ROOF.at = (x) => ROOF.eaves + (ROOF.ridge - ROOF.eaves) * (1 - Math.abs(x) / TOWER.hx);


// ---- The architecture: what stands round the hall and over it (facade.js draws it, tower.js its insides, structure.js
// declares and sizes what carries it).
export const ARCH = {
  cornice: 242,            // top of the main cornice: the attic's floor, a concrete slab on the top wind truss
  slab: 0.4,               // ... that thick (241.6 to 242), and reaching in from the outer face as far as the truss is deep
  band: 8,
  attic: 268,              // head of the attic storey: the mansard's eaves, on a ring girder over the attic's posts
  flat: 315,               // the mansard's flat, and the floor of the lamp room on it
  flatX: 60, flatZ: 30,    // half-sizes of the flat: its edges stand over column lines
  tanks: [-45, -15, 15, 45],          // the attic's fire tanks, along the back wall: 7 x 3 x 2.8 m, 59 t of water each
};
// The two stair towers that flank the dial (this is the right-hand one; the left is its mirror in x). Outside faces
// x0..x1, z0..z1; brick walls `wall` thick on a steel frame. The stair goes round the walls of the well, two turns to a
// storey: a landing (`land` long, on the back wall, with the door onto the hall's gallery) and flights `w` wide. At the
// top, over the mansard's flat, an open stage, the lookout (its floor the last level, its ceiling at `stage`), and over
// that a closed one under the spire: in the right-hand tower the hoist's sheave room (hoist.js), in the left its tank.
export const STAIR_TOWER = { x0: 60, x1: 82, z0: 42, z1: 62, wall: 1.5, top: 334, stage: 327.5, spire: 392, w: 2.1, land: 8,
  levels: [0, 30, 60, 90, 120, 150, 180, 210, 242, 266, 290, 315], door: [65.2, 68.0], street: [74.4, 77.8] };
// The hoist in the right-hand stair tower's well (hoist.js): a cage and its counterweight running in guides, hung on
// ropes over two head sheaves in the sheave room under the spire and wound by a drum and a geared steam engine on the
// tower's floor. Places are in the well's own terms: u from its inner wall (x = x0 + wall) outward, v from its back wall
// (z = z0 + wall) toward the front; heights from the street.
export const HOIST = {
  stops: [0, 242, 315],                  // the tower's floor (the street door, the hall), the attic, the lookout
  hole: [2.8, 6.4, 2.1, 12.4],           // the hoistway in plan: fenced from the floor to the sheave room, open through the lookout's floor and ceiling
  gate: [3.6, 5.6],                      // the landing gates, in its fence on the side toward the landings (v = hole[2])
  pit: 4.6,                              // the cage's pit in the floor runs from the fence back to here
  cage: { u: 4.6, v: 3.25, w: 2.4, d: 2.1, h: 2.4 },          // centre of its floor in plan, and its size inside
  weight: { u: 5.35, v: 11.65, w: 1.1, d: 0.7, h: 3.0, lift: 315.6 },   // its foot is `lift` less the cage's floor above the street
  sheave: { y: 330.6, r: 1.5, u: [4.6, 5.35] },              // the head sheaves' axles (along u) and radius to the rope; the cage's and the weight's
  drum: { v: 7.45, y: 2.0, r: 1.2, u0: 3.1, u1: 6.1, mid: 4.6 },   // its axle along u; the cage's rope winds on [u0, mid], the weight's on [mid, u1], the other way
  gear: 3.5,                             // the engine turns 3.5 times to the drum's once
  speed: 2.5, accel: 0.5,                // m/s and m/s2
  steam: 2.5,                            // bar: below this the engine cannot lift the cage
};

// The escape stairs: a round turret (sixteen-sided) on the back wall at each corner (this is the right-hand one; the
// left is its mirror in x). Its stair goes round a square well, three turns to a storey; a door onto the back gallery at every level, onto the attic, and to the street.
export const ESCAPE = { x: 66, r: 7.85, wall: 1.2, top: 268, cap: 304, half: 4.6, w: 1.5,
  levels: [0, 30, 60, 90, 120, 150, 180, 242], door: [64.8, 67.2] };
ESCAPE.z = -(TOWER.hz + TOWER.wall) - ESCAPE.r;
// The boiler's smoke and the engine's exhaust leave the hall underground. From the back of the boiler the gases turn
// down into a brick flue (`FLUE`: w wide and h high inside, its floor `depth` under the street), which runs out under
// the back wall and the coal yard, straight back under the street behind (x = FLUE.x) as far as z = FLUE.turn, and
// then across to the foot of the stack: a round brick shaft on a steel frame, on a square stone pedestal, standing on a
// footing of its own in a walled yard in the town, 260 m behind the building. The wind here blows mostly from the
// river, across the front: the back is the lee side. The stack stands down-wind of the building, beyond the eddy the
// building sheds behind itself, and high enough over the roofs round it that its smoke goes on away over the town.
// r0, r1: the shaft's outside radius over the pedestal and at its head; ped: the pedestal's half-width, pedH its height.
export const STACK = { x: -80, z: -300, r0: 6.4, r1: 4.0, top: 140, ped: 8.6, pedH: 18, wall: [1.3, 0.95, 0.6] };      // wall: the shaft's brick, by thirds of its height
export const FLUE = { x: -46, w: 2.4, h: 3.0, depth: 8, turn: -300 };
// The service door in the back wall, by the boiler: coal comes in from the yard behind, and the ash goes out.
export const SERVICE = { x0: -36, x1: -32, h: 4.2, door: 3.2 };
// The lamp room on the flat: a stone drum `drum` high (its stair hall), then the lamp floor and the glass between iron
// mullions, `glass` high, with a gallery round it outside; a copper cap. The drum lifts the lamp and its glass clear of
// the mansard's edges, which would otherwise hide them from the city. The stair inside goes once round a square
// `well` on a side, the lamp's column standing in the middle of it.
export const LAMP = { R: 22, drumWall: 0.6, drum: 14, glass: 18, cap: 40, well: 16, gallery: 1.6 };
// The main entrance: a portal in the front wall under the dial, with a deep porch.
// Its doorway is parted by a mullion into two, each with a pair of leaves door high under a transom and a fanlight; a
// glazed screen across the porch, lobby in front of the wall's face, has a second pair: between them, a draught lobby.
export const PORTAL = { w: 8, h: 7, porch: 9, iw: 6, spring: 11, door: 4.6, lobby: 2.6 };
// Over the porch, in the middle bay of the front, the great window: an opening in the wall from pier to pier, from over
// the porch's roof to a pointed head, glazed in an iron screen just outside the wall's frame (whose column and girders
// stand behind it as its mullion and transoms), under a recessed arch of three orders. It lights the hall's floor.
export const GREAT_WINDOW = { half: 8.6, sill: 35.5, spring: 64, apex: 80, z: TOWER.hz + TOWER.wall + 0.25 };
// The dial-cleaning cradle: a monorail under the cornice, between the two stair towers; the cradle parks against the
// right-hand tower, level with its 210 m landing, whose door it is boarded from.
export const CRADLE = { y: 230, z: 44.9, park: 57, deck: 210, len: 5.6, depth: 1.2 };

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
  stackX: -2.4, stackTop: 6.4,                        // exhaust riser, on the other side: at its foot it turns down into the exhaust main, in a trench under the floor to the flue
  pipeY: 7.5, pipeWallX: 68.4,                        // steam supply from the corner main
  safety: { x: -41, y: 11.2, z: -22 },                // safety valve, on top of the boiler
};

// Winding. The driving weight falls the barrel's circumference in the great wheel's eight-hour turn; the
// engine raises it again through the floor train, a line shaft and a cross shaft, and two upright shafts with a worm
// on each, either side of the winding wheel (clock/clockwork.js).
export const WIND = {
  z: 32.6,                 // plane of the winding wheel on the great arbor, and of the worms and upright shafts that drive it
  wheelR: 8.0, teeth: 80,  // the winding wheel: a worm wheel, loose on the arbor until its clutch goes in. Its teeth carry the whole weight: 200 mm module
  wormR: 1.1,              // pitch radius of the worms, which stand at three o'clock and nine (a 5 degree lead, which the weight could drive backward: the clicks hold it)
  weightR: 4.5, weightH: 5.6,          // the driving weight: 2,560 t of cast iron; what sets it is the wind on the hands (clockwork.js)
  shaftY: 5.2,             // height of the line shaft over the floor
  barrelR: 5, top: 72, band: 2,        // the weight's top: where winding stops, and how far it falls before winding starts
  efficiency: 0.6,         // of the whole winding train; nearly all the loss is in the worms
  ropes: 4, ropeD: 0.24,   // it hangs on four steel ropes, 240 mm (6 x 36, 1,960 MPa wire), from an equalising beam
  crib: { r: 3.9, h: 13, crush: 5e6, strain: 0.5 },     // under its fall, an octagonal crib of oak baulks laid crosswise, to be crushed if it ever falls: across its flats / 2, height, crushing stress across the grain, how far it can be crushed
};
WIND.bottom = WIND.crib.h + 0.05 + WIND.weightH;     // the weight's top when it has run down and sits on the crib

// Heights of the two webs of the flywheel shaft's crank; the connecting rod works between them.
export const CRANK = { lower: 3.66, upper: 4.44 };

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
