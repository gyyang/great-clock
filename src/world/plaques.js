// The museum's plates: a brass plate at each exhibit, on a cast-iron lectern on the floor or bracketed to a
// handrail on a catwalk. Walk up to one, face it and press E, and its label opens over the view: what the thing is,
// how it works, what to look for from where you stand, and a line read live from the simulation.
//
// Every plate is drawn with the kit and has colliders, so it is in DRAWN and the structural check tests it like
// anything else (it is built after the structure is planned, so it does not change the design). The engraved face is
// a canvas painted at load. The texts are all here, in PLATES, so they can be proofread together; every number in them
// is from README.md or the code, and where the two disagreed the code was taken.
import * as THREE from 'three';
import { G, ibox, icyl, iknob, beam, cbox, mulberry32 } from '../kit.js';
import { DEG, BRIDGES, ARCH, LAMP, HOIST, LIFT, bobLanding } from '../layout.js';

const face = (dx, dz) => Math.atan2(-dx, -dz);       // the reader's yaw when looking along (dx, dz)
const READ = 2.2;          // how close you must stand to read a plate, m (horizontally, to its face)
const LEAVE = 3.4;         // walk further than this from an open plate and it is put down
const KEY = 'greatclock.plates';
const bl = bobLanding();
const railX = (i) => -65 + 130 * i / Math.round(130 / 1.7);   // the hall's crossings: the balusters along their rails (kit.js rail)
const between = (i) => (railX(i) + railX(i + 1)) / 2;        // half way between two balusters

const pad = (n) => String(n).padStart(2, '0');
const clockTime = (s) => `${Math.floor(s / 3600) % 12 || 12}:${pad(Math.floor(s / 60) % 60)}`;
const STOPS = ['the street', 'the attic', 'the lookout'];
function cage(h) {
  const st = h.state; if (!st) return '';
  if (st.target !== null && st.target !== undefined) return st.stalled ? `the cage waits on its brake for steam, at ${st.y.toFixed(0)} m` : `the cage is going ${HOIST.stops[st.target] > st.y ? 'up' : 'down'} to ${STOPS[st.target]}, at ${st.y.toFixed(0)} m`;
  return `the cage is standing at ${STOPS[st.at] || `${st.y.toFixed(0)} m`}`;
}

// ---------------------------------------------------------------- the plates
// at: where the plate stands (on the floor or a deck: y is the walking surface); yaw: the way its reader faces;
// mount: 'stand' (a lectern) or 'rail' (bracketed to the handrail; at is then on the rail's line); out: in the open air.
// now(S) gives the live line, from S = { clock, engine, hoist }.
export const PLATES = [
  {
    id: 'clock', title: 'The Great Clock', at: [-7, 0, 56.5], yaw: face(0.3, -1), mount: 'stand', out: true,
    what: 'A tower clock the size of a dam, driven by a falling weight and wound by a steam engine.',
    how: [
      'The hall is 240 m tall and the dial 110 m across; the stair towers either side rise to 334 m and their spires to 392. Inside, a pendulum 99 m long swings once every ten seconds, and each swing lets the escape wheel turn a sixth of a turn. A train of wheels counts those steps down to the hands, so the hands can go no faster than the pendulum lets them.',
      'The power is a 2,565 t weight hanging on ropes from the great wheel\'s arbor. It sinks about a millimetre a second, and every 34 minutes a steam engine on the floor winds it back up. The hands were set from your computer\'s clock when the page loaded; since then the pendulum has kept the time.',
    ],
    look: 'the hands: the minute hand is 50 m long, and its tip sweeps about 9 cm a second.',
    now: (S) => `${clockTime(S.clock.seconds())} by the mechanism; ${S.clock.status()}`,
  },
  {
    id: 'floor', title: 'The Floor Wheels', at: [44.8, 0, -3.4], yaw: face(0.2, 1), mount: 'stand',
    what: 'Three wheels lying flat on the floor, turned by the engine: they are the first of the winding gear.',
    how: [
      'The engine\'s crankshaft stands upright and carries a 10-tooth pinion with the 8 m flywheel above it. The pinion drives the great floor wheel, 40 teeth and 16 m to its teeth, at a quarter of the engine\'s speed, and that drives the idler, 20 teeth, at half. The engine\'s speed is their speed: at the governed 11.5 rev/min the great wheel\'s rim moves at 4.8 m/s and the flywheel\'s at 9.6 m/s.',
      'The idler carries a bevel wheel that drives two line shafts, one to the winding gear and one to the lift. The wheels weigh 12,300 t and run on roller thrust bearings. On a turning wheel only friction holds you: on the flywheel at full speed it runs out about 6.8 m from the centre.',
    ],
    look: 'the flywheel\'s brass rim up on your left, and ahead the great wheel\'s rim and teeth going by.',
    now: (S) => { const w = S.engine.sim.w; return `the engine at ${S.engine.sim.rpm.toFixed(1)} rev/min; the great wheel\'s rim at ${(4 * w).toFixed(1)} m/s, the flywheel\'s at ${(8 * w).toFixed(1)} m/s`; },
  },
  {
    id: 'engine', title: 'The Steam Engine', at: [64.2, 0, -9.2], yaw: face(-1, 0.25), mount: 'stand',
    what: 'A double-acting steam engine of one cylinder, which turns the floor wheels and winds the clock.',
    how: [
      'Steam from the boiler is let into one end of the cylinder, 2.2 m across, and pushes the piston. After 40 % of the stroke the valve shuts (the cut-off) and the steam inside goes on pushing as it expands, more and more weakly, to the end of the 3.6 m stroke. Then steam is let into the other end and pushes it back: it works both ways.',
      'The piston drives an 8 m connecting rod, which turns a crank 1.8 m long. The push turns the crank hardest with crank and rod at right angles and not at all at the two dead centres, where the flywheel carries it through. It turns against 185 kN m all the time, and 552 kN m while it winds the weight.',
    ],
    look: 'the crosshead sliding in its guides, and a puff of exhaust at the end of every stroke, two to a turn.',
    now: (S) => { const e = S.engine.sim; return `${e.rpm.toFixed(1)} rev/min; the throttle ${(e.throttle * 100).toFixed(0)} % open; ${(e.load / 1000).toFixed(0)} kN m on the crank; the boiler at ${e.p.toFixed(2)} bar`; },
  },
  {
    id: 'regulator', title: 'The Regulator and Governor', at: [63.6, 0, -4.4], yaw: face(-1, -0.6), mount: 'stand',
    what: 'The lever that lets steam to the cylinder, and the flyball governor that holds the engine\'s speed.',
    how: [
      'The regulator lever has four notches: shut, half (three tenths open), full, and full with the governor tied down. In the first three the governor has the last word. Its spindle turns 2.4 times as fast as the crank and swings its balls on arms 1.6 m long. The faster it turns, the further the balls fly out and up; as the arms rise from 18° to 46° off the spindle they close the throttle from wide open to shut.',
      'So the engine gets less steam when it speeds up and more when the load slows it, and it settles at 11.5 rev/min. Tie the governor down and nothing holds it: it runs away to about 40 rev/min, held back only by the load and the boiler.',
    ],
    look: 'the governor\'s balls at the top of the engine, rising as it speeds up and dropping as it slows. The lever is ahead of you.',
    now: (S) => { const e = S.engine.sim; return `regulator at ${e.regulator.name}; the governor\'s arms at ${(e.gov / DEG).toFixed(1)}°; the throttle ${(e.throttle * 100).toFixed(0)} % open; ${e.rpm.toFixed(1)} rev/min`; },
  },
  {
    id: 'boiler', title: 'The Boiler', at: [-50.5, 0, -14], yaw: face(1, -0.9), mount: 'stand',
    what: 'A coal-fired boiler, 10 m across and 16 m long, that raises the steam for the main engine and the hoist\'s.',
    how: [
      'The fire burns under the boiler, behind the fire door; its gases run along beneath it and out at the back into the flue. The pressure rises when the fire makes steam faster than the engines use it and falls when they take more. A damper answers a fall with a harder fire, so the pressure settles near 5.2 bar while the engine turns the floor wheels, and dips while it winds.',
      'If the steam is not used (shut the regulator) the pressure climbs until the safety valve on top lifts at 6 bar, and blows off until it is down to 5.55. The hoist in the right-hand stair tower draws on this boiler too: its engine will not start below 2.5 bar.',
    ],
    look: 'the glow at the fire door, and on top of the boiler ahead of you the safety valve, which roars when it lifts.',
    now: (S) => { const e = S.engine.sim; return `${e.p.toFixed(2)} bar; the safety valve ${e.venting ? 'is blowing off' : 'is shut (it lifts at 6.0)'}; the hoist ${e.tap > 0 ? 'is drawing steam' : 'is not drawing'}`; },
  },
  {
    id: 'winding', title: 'The Winding Gear', at: [-13.6, 0, 36.6], yaw: face(-0.75, -0.6), mount: 'stand',
    what: 'How the engine on the floor winds a weight that hangs from an arbor 125 m up.',
    how: [
      'A line shaft runs from the idler\'s bevel wheel across the floor to a crown wheel at the foot of an upright shaft, and a cross shaft takes the drive on to a second. The two uprights, 127 m tall, stand either side of the 80-tooth winding wheel on the great arbor, each with a worm (a screw thread) meshing with it, at three o\'clock and nine.',
      'Why two: the weight\'s pull is shared, 7.9 MN on each worm, one pushed up and one down, so the arbor feels a pure twist and each push goes straight down its own shaft to the floor. Ratchet clicks, not the worms, hold the weight. Between windings the line shaft turns idle; a dog clutch puts it in when winding is due.',
    ],
    look: 'the upright shaft rising ahead of you; when winding is due, the clutch collar sliding home and the uprights turning.',
    now: (S) => `the floor clutch is ${S.clock.state.clutch > 0.5 ? 'in' : 'out'}; ${S.clock.status()}`,
  },
  {
    id: 'weight', title: 'The Driving Weight', at: [-24.5, 0, 24], yaw: face(-1, 0.55), mount: 'stand',
    what: 'The power of the going train: 2,565 t hanging from a barrel on the great wheel\'s arbor.',
    how: [
      'The weight hangs from an equalising beam on four steel ropes 240 mm thick, each strong enough for 6.4 times its share. They are wound on a barrel 10 m across, so as the weight sinks it turns the great wheel and through it the whole train. It falls 1.1 mm a second: 2 m in about half an hour.',
      'Then the engine winds it back up in 192 s. Meanwhile four leaf springs on a ratchet ring (Harrison\'s maintaining power) keep the train going. Stop the engine and nothing winds: the springs run the train for about five minutes, then it stops, and so does the escapement. Under the weight stands a crib of oak baulks 13 m high, to catch it if the ropes ever let go.',
    ],
    look: 'the crib of oak beside you, and some 65 m above it the weight on its four ropes.',
    now: (S) => S.clock.status(),
  },
  {
    id: 'towers', title: 'The Towers', at: [3.0, 0, 31.4], yaw: face(-1, 0), mount: 'stand',
    what: 'What carries the wheels: a steel tower under each arbor, six in all, standing on the building\'s raft.',
    how: [
      'Each tower is two A-frames of steel box sections, one either side of its arbor\'s wheels, strutted together wherever a strut can pass between them. Where a leg of one tower crosses a leg of the next, the two are pinned together (13 links), so the six are one frame. They weigh 70,600 t and stand on pedestals on a concrete raft 6 m thick.',
      'Under the clock\'s weight they give a long way (the third arbor\'s bearings 190 mm), so every bearing seat is built high by its computed movement and the wheels settle onto their line. The game checks all this itself: type __game.check() in the browser\'s console and it analyses every member, buckling included, and looks for any part that runs into another.',
    ],
    look: 'the stone pedestal ahead of you, and the great wheel\'s tower rising from it to the arbor 125 m up.',
    now: null,
  },
  {
    id: 'lift', title: 'The Paternoster Lift', at: [24.8, 0, -27.6], yaw: face(0.75, -0.65), mount: 'stand',
    what: 'A lift that never stops: 35 cars hung from two endless chains, up one side and down the other.',
    how: [
      'The cars hang from axles between two roller chains, which run over toothed wheels at the top and bottom of the shaft; the cars going up balance those coming down, and each swings level round the ends. A line shaft from the floor wheels turns the bottom wheels by crossed belts: with the engine at speed the chains move at 1.2 m/s, a car every nine seconds.',
      'To ride, face the shaft and step onto a car as its deck comes level with the floor: on the left they go up, on the right down. Going up, step off at a landing a little before or after it is level; going down, step off just before the deck reaches the landing. Stop the engine and the lift stops.',
    ],
    look: 'the cars rising on the left and sinking on the right, each swinging free on its axle.',
    now: (S) => { const v = 1.2 * S.clock.state.floorRate; return v > 0.05 ? `the chains at ${v.toFixed(2)} m/s; a car every ${(14 * LIFT.pitch / v).toFixed(0)} s` : 'stopped: the engine is not turning'; },
  },
  {
    id: 'pendulum', title: 'The Pendulum', at: [bl.x, bl.y + 0.13, -12.5], yaw: face(-1, 0), mount: 'rail',
    what: 'The clock\'s timekeeper: a pendulum 99 m long with a 3,760 t brass bob, beating once every ten seconds.',
    how: [
      'Each swing takes ten seconds, set by the pendulum\'s length, not by the bob\'s weight. It hangs from four flat leaves of maraging steel, each 1.2 m wide and 200 mm thick, which bend instead of rubbing: a hinge without friction or wear. They flex over 7.8 m, and the pendulum turns about a point 4.0 m below their top clamp.',
      'It swings 3° either way: that is what the escapement\'s arms give it, and about as far as the leaves allow, for at 3° they bend at 96 % of what the steel will bear for ever. Half way down the rod is a rating tray: 378 kg added to it makes the clock gain a second a day. Warmth still costs 0.22 s a day per degree.',
    ],
    look: 'the bob\'s deck sliding in under this landing and out again, pausing at the end of each swing.',
    now: (S) => { const s = S.clock.state; return `${Math.abs(s.th / DEG).toFixed(2)}° from the vertical, the bob moving at ${Math.abs(s.om * 99).toFixed(2)} m/s; it swings ${(s.arc / DEG).toFixed(3)}° either way`; },
  },
  {
    id: 'escapement', title: 'The Escapement', at: [between(42), BRIDGES.escapement.y, BRIDGES.escapement.z1], yaw: Math.PI, mount: 'rail',
    what: 'What lets the clock\'s power out in equal steps, one every ten seconds, and keeps the pendulum swinging.',
    how: [
      'A three-legged gravity escapement. The escape wheel has three legs and three pins; beside the pendulum hang two arms of 3.5 t. A leg resting on one arm\'s stop holds the wheel. The pendulum swings over and carries that arm outward; the stop slides off, and the wheel turns a sixth until the next leg meets the other arm\'s stop, lifting that arm by a pin.',
      'The first arm rides back down on the pendulum past where it was picked up, so it gives a little more than it took: that is the whole push, whatever the train does. A fly geared 30 times faster, four vanes 1.0 by 0.45 m, slows each step to 7 s, so a leg meets its stop with 281 J, not 5.7 kJ.',
    ],
    look: 'the escape wheel standing still, then turning a sixth; and the fly spinning up and coasting on.',
    now: (S) => { const s = S.clock.state; return `${s.landed ? 'locked: a leg lies on a stop' : 'turning'}; the fly at ${(s.fw * 30 / Math.PI).toFixed(0)} rev/min${s.lockJ > 0 ? `; the last blow on a stop ${s.lockJ.toFixed(0)} J` : ''}`; },
  },
  {
    id: 'remontoire', title: 'The Remontoire', at: [between(35), BRIDGES.escapement.y, BRIDGES.escapement.z1], yaw: Math.PI, mount: 'rail',
    what: 'A small weight between the train and the escape wheel, so the heavy train never has to stop and start.',
    how: [
      'The going train weighs tens of thousands of tonnes; it could not stop and start every ten seconds, so it never stops. On its last arbor is a differential whose arm carries a 185 kg weight; that weight alone turns the escape wheel. Each step lets the arm drop a little; the train, turning steadily behind it, lifts it again.',
      'The arm also sets a brake on the train, a copper disc 35 mm thick turning between magnets: if the arm sinks the train is let run faster, if it rises it is held back. So the train keeps pace on average, and the brake takes 16 kW of the weight\'s 27. Should the train fall two steps behind, the arm lies on its banking and the escapement stops.',
    ],
    look: 'behind the escape wheel, the differential\'s arm dipping at each step and being lifted again.',
    now: (S) => {
      const s = S.clock.state, esc = s.n - 1 + (s.landed ? 1 : Math.min(1, s.ea / (60 * DEG))), d = esc - s.phi - 0.7;
      return s.stalled ? 'the arm is on its banking: the escapement has stopped' : `the train at ${(s.rate / 0.1 * 100).toFixed(1)} % of the escapement\'s pace; the arm ${Math.abs(d).toFixed(2)} of a step ${d > 0 ? 'below' : 'above'} its mean (it banks at 2)`;
    },
  },
  {
    id: 'train', title: 'The Going Train', at: [between(19), BRIDGES.between.y, BRIDGES.between.z1], yaw: Math.PI, mount: 'rail',
    what: 'The wheels that count the escape wheel\'s steps down to the hands, and carry the weight\'s drive up to it.',
    how: [
      'The train\'s last arbor, beside the escape wheel, turns once a minute: six steps of ten seconds. Pairs of wheels gear it down: 12 teeth driving 96 and 16 driving 120 bring it to once an hour at the centre arbor, which carries the minute hand; 10 driving 80 bring that to once in eight hours at the great wheel, which the weight turns.',
      'The big wheels are fabricated, not cast: a steel centre of box arms and a box ring, with a rim of bronze segments bolted on. The great wheel alone weighs 7,410 t. Every arbor runs in a roller bearing either side of its wheel; in plain oiled bearings the friction would be thirty times as much and the clock would stop.',
    ],
    look: 'the great wheel beside the crossing; pick a spoke against something fixed and wait to see it move.',
    now: (S) => { const s = S.clock.seconds(); return `the last arbor ${s % 60} s into its minute; the centre arbor ${Math.floor(s / 60) % 60} min into its hour; the great wheel ${Math.floor(s % 28800 / 3600)} h ${Math.floor(s / 60) % 60} min into its eight`; },
  },
  {
    id: 'dial', title: 'The Motion Work and Hands', at: [-36.5, BRIDGES.balcony.y, 36.32], yaw: face(1, 0), mount: 'stand', size: [0.44, 0.3],
    what: 'How one arbor turning once an hour drives two hands, and how hands 50 m and 34 m long are carried.',
    how: [
      'The centre arbor turns once an hour and carries the minute hand. A pinion on it drives a minute wheel, whose own pinion drives the hour wheel on a steel pipe round the arbor: 20 to 60, then 15 to 60, twelve turns of the minute hand to one of the hour hand.',
      'The hands are steel lattice spines, 3.0 and 2.2 m deep at the root, clad in painted copper. Each is balanced inside the hall by a lens of iron on a bar off its arbor or pipe (57 t at 9 m, 41 t at 8 m), so neither pulls the train one way going up and the other coming down. The arbor\'s third bearing is in the boss of the dial\'s frame.',
    ],
    look: 'ahead and high above you, the counterpoises turning slowly on their bars, and the backs of the hands through the glass.',
    now: (S) => { const s = S.clock.seconds(); return `the hands show ${clockTime(s)}: the minute hand ${(s % 3600 / 10).toFixed(0)}° past twelve, the hour hand ${(s % 43200 / 120).toFixed(1)}°`; },
  },
  {
    id: 'hoist', title: 'The Hoist', at: [73.4, 0, 52.5], yaw: face(-1, 0), mount: 'stand',
    what: 'A steam hoist in the stair tower\'s well, from the street to the attic (242 m) and the lookout (315 m).',
    how: [
      'The cage and a counterweight run in guides up the fenced hoistway. Their ropes go over sheaves under the spire and back down to one drum here, wound on opposite ways, so one rope pays off as the other winds on. The drum is turned through 3.5 to 1 gearing by the twin-cylinder engine beside it, fed by a lagged pipe from the main boiler.',
      'The cage runs at 2.5 m/s, about 100 s from the street to the attic, with its gates shut. Below 2.5 bar the engine cannot lift it, so it will not start, and a cage caught between landings waits on its brake for steam. Pull the hand rope (E) in the cage or at a gate to send it to the next stop.',
    ],
    look: 'the engine\'s cranks and crossheads turning, and the drum winding, while the cage moves.',
    now: (S) => `${cage(S.hoist)}; the boiler at ${S.engine.sim.p.toFixed(1)} bar (it needs 2.5)`,
  },
  {
    id: 'attic', title: 'The Attic', at: [-22.3, ARCH.cornice, 37.9], yaw: Math.PI, mount: 'stand',
    what: 'The storey over the hall, from 242 to 268 m: the clock\'s stores, its fire water, and the roof\'s trusses.',
    how: [
      'The attic\'s floor is an 8 m band all round, a slab on the top wind truss, with a rail along its inner edge; inside it is the hall\'s own roof, 5 to 23 m below. Along the front, under windows 5.6 m wide, are racks of spares and crates of stores: lamp glass, mantles, rope and oil. Along the back stand the fire tanks, which keep the mansard\'s rainwater for the hose reels on the galleries and stairs.',
      'Overhead, steel trusses carry the copper mansard up to the flat at 315 m, which carries the lamp room. A lucarne high on the slope over each dormer lights them. Doors from both stair towers and both escape stairs open here, and the hoist stops at the right-hand tower.',
    ],
    look: 'the trusses overhead, lit from the lucarnes, and the racks of spares under the windows.',
    now: (S) => `the hoist: ${cage(S.hoist)}`,
  },
  {
    id: 'lookout', title: 'The Lookout', at: [71.0, HOIST.stops[2], 59.3], yaw: Math.PI, mount: 'stand', out: true,
    what: 'The open stage at the top of the right-hand stair tower, 315 m up, with an arcade on every face.',
    how: [
      'The stair and the hoist both come up here, over the mansard\'s flat. Each face is an arcade with a parapet at sill height and an iron grille in each arch. Above, under the spire, is a closed stage reached by a ladder through a hatch: in this tower it holds the hoist\'s sheaves, and in the other a tank that gives the hose reels their head of water.',
      'Below lies the town, generated from a seed: five districts whose street grids meet at odd angles, terraces round their yards with a chimney stack on every party wall, mills with saw-tooth roofs, gasworks, churches, a domed civic building, and a river with three bridges. The wind here blows mostly off the river, across the front of the building.',
    ],
    look: 'the river and its three bridges, and the square in front of the portal, 315 m below.',
    now: (S) => `the hoist: ${cage(S.hoist)}`,
  },
  {
    id: 'lamp', title: 'The Lamp Room', at: [-12.6, ARCH.flat + LAMP.drum, 9.6], yaw: face(1, -0.75), mount: 'stand',
    what: 'The lamp on top of the building: a ring of coal-gas burners inside a fixed lens of glass prisms.',
    how: [
      'The room is a stone drum 44 m across and 14 m high, which lifts the lamp and its glass clear of the mansard\'s edges so the town can see them. Above the drum are 18 m of glass between iron mullions and glazing bars, no pane more than 1.2 m wide or 2 m high, with a stone gallery outside from which it is cleaned.',
      'In the middle, on an iron column, a ring of coal-gas burners with incandescent mantles stands inside a fixed lens of glass prisms. The gas comes up the right-hand stair tower; the fumes go out through a louvred ventilator in the copper cone over the glass, which rises to 389 m.',
    ],
    look: 'the ring of prisms round the burners, and past the glass, the mansard\'s copper and the town.',
    now: null,
  },
  {
    id: 'yard', title: 'The Coal Yard and the Stack', at: [-43, 0, -67.5], yaw: face(-0.16, -1), mount: 'stand', out: true,
    what: 'Where the coal comes in and the smoke goes out: the coal yard, the flue under it and the stack.',
    how: [
      'Coal comes in through the yard\'s gate from the back street, and is wheeled through the service door and round the end of the boiler to its firing floor; the ash comes out the same way, so neither crosses the machine floor. The boiler\'s smoke and the engine\'s exhaust leave the hall underground, by a brick flue 2.4 m wide and 3 m high whose floor is 8 m below the street.',
      'It runs under the back wall, this yard and the street behind to the foot of the stack: a round brick shaft 140 m tall on a stone pedestal, 260 m behind the building. The wind blows mostly off the river across the front, so the stack stands on the lee side, beyond the eddy the building sheds.',
    ],
    look: 'the iron hatch beside you, over the flue\'s access chamber, and the stack beyond the wall.',
    now: (S) => { const e = S.engine.sim; return e.rpm > 0.1 ? `the engine exhausting ${(2 * e.rpm).toFixed(0)} times a minute; the boiler at ${e.p.toFixed(2)} bar` : `the engine is still; the boiler at ${e.p.toFixed(2)} bar`; },
  },
];

// ---------------------------------------------------------------- the engraved face
// A brass plate with a double rule, a screw at each corner, the number, the title and the one-line description,
// cut in and filled with black wax. Two canvases: colour, and one that is at once the bump (red), the roughness
// (green) and the metalness (blue), so the letters are rough, dull and sunk and the brass round them is not.
const FONT = 'Georgia, "Times New Roman", serif';
function wrap(c, text, max) {
  const words = text.split(' '), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}
function engrave(no, pl, W, H) {
  const w = 512, h = Math.round(w * H / W), r = mulberry32(9000 + no * 77);
  const col = document.createElement('canvas'), dat = document.createElement('canvas');
  col.width = dat.width = w; col.height = dat.height = h;
  const c = col.getContext('2d'), d = dat.getContext('2d');
  // the brass, brushed across
  const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#c49a52'); g.addColorStop(0.55, '#d6b26a'); g.addColorStop(1, '#b48a46');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  d.fillStyle = 'rgb(190,96,255)'; d.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    const y = r() * h, x = r() * w - 40, len = 30 + r() * 220, lw = 0.5 + r() * 1.2, light = r() < 0.5;
    c.strokeStyle = light ? `rgba(255,238,196,${0.03 + r() * 0.07})` : `rgba(96,64,24,${0.03 + r() * 0.07})`;
    c.lineWidth = lw; c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y + (r() - 0.5)); c.stroke();
    d.strokeStyle = `rgba(190,${light ? 80 : 120},255,0.35)`; d.lineWidth = lw; d.beginPath(); d.moveTo(x, y); d.lineTo(x + len, y); d.stroke();
  }
  // everything cut: a light edge where the cut catches the light, then the wax
  const cut = (fn) => {
    c.save(); c.translate(0.9, 1.1); c.fillStyle = c.strokeStyle = 'rgba(255,240,200,0.55)'; fn(c); c.restore();
    c.fillStyle = c.strokeStyle = '#1e160d'; fn(c);
    d.fillStyle = d.strokeStyle = 'rgb(40,230,25)'; fn(d);
  };
  const m = 22;
  cut((x) => { x.lineWidth = 3.2; x.strokeRect(m, m, w - 2 * m, h - 2 * m); x.lineWidth = 1.2; x.strokeRect(m + 7, m + 7, w - 2 * m - 14, h - 2 * m - 14); });
  // the screws: a sunk round head with its slot
  for (const [sx, sy] of [[11, 11], [w - 11, 11], [11, h - 11], [w - 11, h - 11]]) {
    const a = r() * Math.PI;
    c.fillStyle = '#7c5d2c'; c.beginPath(); c.arc(sx, sy, 7.5, 0, 7); c.fill();
    c.fillStyle = '#d9bd80'; c.beginPath(); c.arc(sx - 0.8, sy - 0.8, 6, 0, 7); c.fill();
    c.strokeStyle = '#2a1e10'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(sx - Math.cos(a) * 5, sy - Math.sin(a) * 5); c.lineTo(sx + Math.cos(a) * 5, sy + Math.sin(a) * 5); c.stroke();
    d.fillStyle = 'rgb(150,110,255)'; d.beginPath(); d.arc(sx, sy, 7.5, 0, 7); d.fill();
  }
  const ctx = [c, d];
  const set = (font, spacing = '0px') => { for (const x of ctx) { x.font = font; x.textAlign = 'center'; x.textBaseline = 'alphabetic'; if ('letterSpacing' in x) x.letterSpacing = spacing; } };
  // the number and the clock's name
  set(`15px ${FONT}`, '3px');
  cut((x) => x.fillText(`No. ${no}  ·  THE GREAT CLOCK`, w / 2, m + 36));
  // the title, as large as fits in two lines
  let size = 52, lines;
  for (; size > 26; size -= 2) { set(`bold ${size}px ${FONT}`, '1px'); lines = wrap(c, pl.title.toUpperCase(), w - 2 * m - 40); if (lines.length <= 2 && lines.every((l) => c.measureText(l).width <= w - 2 * m - 40)) break; }
  const top = lines.length > 1 ? h * 0.36 : h * 0.45, step = size * 1.12;
  cut((x) => lines.forEach((l, i) => x.fillText(l, w / 2, top + i * step)));
  // a rule with a lozenge
  const ry = top + (lines.length - 1) * step + size * 0.55;
  cut((x) => { x.lineWidth = 1.4; x.beginPath(); x.moveTo(w / 2 - 90, ry); x.lineTo(w / 2 - 10, ry); x.moveTo(w / 2 + 10, ry); x.lineTo(w / 2 + 90, ry); x.stroke(); x.beginPath(); x.moveTo(w / 2, ry - 5); x.lineTo(w / 2 + 6, ry); x.lineTo(w / 2, ry + 5); x.lineTo(w / 2 - 6, ry); x.closePath(); x.fill(); });
  // what it is, small
  set(`italic 17px ${FONT}`);
  const small = wrap(c, pl.what, w - 2 * m - 60).slice(0, 3);
  cut((x) => small.forEach((l, i) => x.fillText(l, w / 2, ry + 30 + i * 21)));
  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const data = new THREE.CanvasTexture(dat); data.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map, roughnessMap: data, metalnessMap: data, bumpMap: data, bumpScale: 1.5, roughness: 1, metalness: 1, color: 0xffffff });
  if (pl.out) mat.userData.outdoor = true;
  return mat;
}

// ---------------------------------------------------------------- the stands
const _v = new THREE.Vector3();
const EDGE = new THREE.MeshStandardMaterial({ color: 0xb98f4c, metalness: 1, roughness: 0.42 });      // the plate's cut edges
function build(no, pl) {
  const [ax, ay, az] = pl.at, rail = pl.mount === 'rail';
  const tilt = (rail ? 35 : 40) * DEG, [W, H] = pl.size || (rail ? [0.5, 0.34] : [0.56, 0.38]);
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.yaw);
  const qt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, pl.yaw, 0, 'YXZ'));
  const at = (x, y, z) => { _v.set(x, y, z).applyQuaternion(qy); return [ax + _v.x, ay + _v.y, az + _v.z]; };
  const n = [0, Math.sin(tilt), Math.cos(tilt)], up = [0, Math.cos(tilt), -Math.sin(tilt)];
  // the plate's centre in the stand's own frame (+z toward the reader), from where its top edge has to be
  const c = rail ? [0, 1.03 - up[1] * H / 2, 0.08 - up[2] * H / 2] : [0, 1.05, 0];
  const along = (p, k, s = 0) => [p[0] + s, p[1] + n[1] * k, p[2] + n[2] * k];
  const rear = along(c, -0.073);
  // The plate, from the front: the engraved brass, 10 mm thick, on a brass mount a little larger, on an enamelled iron
  // back, with a screw at each corner. (The kit sets every part a few millimetres off true; the engraved plate is its
  // own mesh, thick enough that the mount behind it never shows through its face.)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.01), [EDGE, EDGE, EDGE, EDGE, engrave(no, pl, W, H), EDGE]);
  slab.position.set(...at(...along(c, -0.005))); slab.quaternion.copy(qt); G.scene.add(slab);
  ibox('brass', W + 0.024, H + 0.024, 0.008, ...at(...along(c, -0.014)), qt);
  ibox('iron', W + 0.07, H + 0.07, 0.03, ...at(...along(c, -0.033)), qt);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const k = sy * (H / 2 + 0.024), p = [c[0] + sx * (W / 2 + 0.024), c[1] + up[1] * k, c[2] + up[2] * k];
    iknob('brass', 0.008, ...at(...along(p, -0.017)));
  }
  ibox('iron', 0.18, 0.12, 0.05, ...at(...rear), qt);                                  // the boss it is bolted to
  cbox(W + 0.07, H + 0.07, 0.06, ...at(...along(c, -0.028)), qt);
  if (rail) {
    // a standard on the deck's edge just inside the rail, clamped to the mid rail and strapped to the handrail
    const z = 0.15, top = rear[1] - 0.05;
    ibox('iron', 0.14, 0.025, 0.14, ...at(0, 0.0125, z), qy);
    icyl('iron', 0.028, top, ...at(0, top / 2, z), qy);
    beam('iron', at(0, 0.58, 0.015), at(0, 0.58, z - 0.02), 0.04, 0.03);
    iknob('rail', 0.03, ...at(0, 0.58, 0.0));
    for (const sx of [-1, 1]) beam('iron', at(sx * (W / 2 - 0.04), c[1] + up[1] * (H / 2 + 0.03), c[2] + up[2] * (H / 2 + 0.03) - 0.02), at(sx * (W / 2 - 0.04), 1.072, 0.004), 0.025, 0.01);
    cbox(0.07, top, 0.07, ...at(0, top / 2, z), qy);
  } else {
    // a lectern: a base, a plinth, a turned post and a collar under the boss
    const z = rear[2] - 0.01, top = rear[1] - 0.05;
    ibox('iron', 0.46, 0.05, 0.38, ...at(0, 0.025, z), qy);
    ibox('iron', 0.28, 0.05, 0.24, ...at(0, 0.075, z), qy);
    icyl('iron', 0.042, top - 0.1, ...at(0, 0.1 + (top - 0.1) / 2, z), qy);
    iknob('iron', 0.065, ...at(0, 0.14, z));
    iknob('brass', 0.055, ...at(0, top - 0.02, z));
    cbox(0.46, 0.1, 0.38, ...at(0, 0.05, z), qy);
    cbox(0.1, top, 0.1, ...at(0, top / 2, z), qy);
  }
  // where to read it from
  const f = at(...c), nx = Math.sin(pl.yaw), nz = Math.cos(pl.yaw);
  return { ...pl, no, cx: f[0], cy: f[1], cz: f[2], nx, nz, floor: ay, reader: [f[0] + nx * 0.9, ay + 0.95, f[2] + nz * 0.9] };
}

// ---------------------------------------------------------------- reading them
export function buildPlaques(S) {
  const tag = G.tag, on = G.on; G.tag = ''; G.on = '';            // the kit's own parts: tested like any other drawn part
  const list = PLATES.map((pl, i) => build(i + 1, pl));
  G.tag = tag; G.on = on;

  let read = new Set();
  try { read = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { /* private window: count from nothing */ }
  const $ = (id) => document.getElementById(id);
  const el = { box: $('plaque'), no: $('plaque-no'), title: $('plaque-title'), what: $('plaque-what'), how: $('plaque-how'), look: $('plaque-look'), nowRow: $('plaque-now-row'), now: $('plaque-now'), count: $('plaque-count') };
  let open = null;

  // the plate you are standing at and looking toward, if any
  function nearest(p, yaw) {
    const vx = -Math.sin(yaw), vz = -Math.cos(yaw);
    let best = null, bd = Infinity;
    for (const pl of list) {
      const dy = p.y - 0.95 - pl.floor; if (dy < -0.7 || dy > 1.0) continue;
      const dx = p.x - pl.cx, dz = p.z - pl.cz, d = Math.hypot(dx, dz);
      if (d > READ || d < 0.05 || dx * pl.nx + dz * pl.nz < 0.1) continue;           // in reach, and in front of it
      if (-(dx * vx + dz * vz) / d < 0.55) continue;                                   // and looking its way
      if (d < bd) { bd = d; best = pl; }
    }
    return best;
  }
  // a number and its unit stay on one line
  const nb = (t) => t.replace(/(\d) (?=(kJ|J|kg|kW|kN|MN|mm|cm|m\/s|m|s|t|bar|rev\/min|h|min|%|°)(?![\w]))/g, '$1 ');
  const live = (pl) => { try { return pl.now ? nb(pl.now(S)) : ''; } catch (e) { return ''; } };
  function show(pl) {
    open = pl;
    read.add(pl.id);
    try { localStorage.setItem(KEY, JSON.stringify([...read])); } catch (e) { /* not kept: still counted for this visit */ }
    if (!el.box) return;
    el.no.textContent = `No. ${pl.no}`;
    el.title.textContent = pl.title;
    el.what.textContent = nb(pl.what);
    el.how.replaceChildren(...pl.how.map((t) => { const q = document.createElement('p'); q.textContent = nb(t); return q; }));
    el.look.textContent = nb(pl.look);
    el.nowRow.style.display = pl.now ? '' : 'none';
    el.now.textContent = live(pl);
    el.count.textContent = `${[...read].filter((id) => list.some((q) => q.id === id)).length} of ${list.length} plates read`;
    el.box.classList.add('show');
  }
  function close() {
    if (!open) return false;
    open = null; if (el.box) el.box.classList.remove('show');
    return true;
  }
  return {
    list, get open() { return open && open.id; }, get read() { return read.size; },
    // E: put down the plate you are reading, or pick up the one in front of you
    use(p, yaw) {
      if (open) { close(); return true; }
      const pl = nearest(p, yaw); if (!pl) return false;
      show(pl); return true;
    },
    hint(p, yaw) {
      if (open) return '';
      const pl = nearest(p, yaw);
      return pl ? `E — read the plate: ${pl.title}` : '';
    },
    // a few times a second: the live line, and walking away puts it down
    update(p) {
      if (!open) return;
      if (Math.hypot(p.x - open.cx, p.z - open.cz) > LEAVE || Math.abs(p.y - 0.95 - open.floor) > 1.5) { close(); return; }
      if (open.now && el.now) { const t = live(open); if (el.now.textContent !== t) el.now.textContent = t; }
    },
    close,
    show: (id) => { const pl = list.find((q) => q.id === id); if (pl) show(pl); return !!pl; },      // for the console
  };
}
