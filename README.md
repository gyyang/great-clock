# The Great Clock

You are a 1.8 m person inside a working, steam-driven tower clock the size of a dam
(240 m tall hall, 110 m dial; the Hoover Dam is 221 m).

**Play it: <https://gyyang.github.io/great-clock/>**

It runs in a desktop browser with WebGL 2 (Chrome, Edge, Firefox, Safari) and wants a keyboard and a mouse. There is
nothing to download but the page: about 2 MB, and a few seconds while the structure is designed and the surfaces are
made.

To run it from the source:

```bash
npm install
npm run dev
```

Then open the URL it prints. `npm test` runs the structural solver against textbook cases, and `npm run build` makes
the page in `dist/`. Every push to `main` is tested, built and published to the address above
(`.github/workflows/deploy.yml`).

## Controls

| Key | Action |
| --- | --- |
| W A S D / mouse | walk / look |
| Shift | run |
| Space | jump |
| E | use what is in reach: the engine's regulator lever, the whistle chain, the hoist's hand rope |
| 1 – 9, 0, − | fast travel: floor, pendulum landing, escapement, between the wheels, behind the dial, the engine, the winding gear, the square, across the river, the attic, the lamp room |
| R | back to the floor |
| M | mute |
| L | light or put out your lantern |
| Q | detail level (it also steps down by itself if the frame rate drops) |

## What is real

- **Pendulum** – 99 m long, with a 3,760 t bob on an invar rod, integrated as `θ'' = -(g/L)·sin θ`. It hangs from twelve leaves of spring steel clamped in a head beam and swings by bending them, so there is no pivot to wear or to rob it. It swings 3° either way: a wider arc would fatigue the leaves (77 MPa of tension and 360 MPa of bending, twice every twenty seconds). The arc is set where a clockmaker sets it, by the weight of the escapement's arms (3.5 t each), and the rate the same way, by running it, timing it and adjusting its length until it beats ten seconds.
- **Escapement** – a three-legged gravity escapement, in Denison's manner. On the escape wheel are three legs and three lifting pins; beside the suspension hang two long arms. The wheel is locked with a leg lying against one arm's stop. The pendulum, coming over, meets that arm's beat pin and carries the arm outward; the stop slides off the leg and the wheel turns a sixth of a turn, until the next leg meets the other arm's stop, lifting that other arm with a pin as it goes. The first arm comes back resting on the pendulum and follows it down past where it was picked up, to be set down on a pin. So each arm gives the pendulum a little more than it took, by a fixed drop, and that is the whole impulse. (The contacts were checked over whole beats: a leg never enters a stop by more than 15 mm, and a pin never enters a pallet.)
- **Remontoire** – the going train weighs tens of thousands of tonnes and could not stop and start every ten seconds, so it does not. It turns without stopping. On the end of its last arbor is a differential whose arm carries a 370 kg weight, and that weight is the only thing that ever turns the escape wheel (which is light, and takes 1.7 s over each step). Each step lets the arm drop; the train, coming on steadily behind, raises it again. The arm's height sets a brake on the train (a copper disc turning between magnets), so the train keeps pace with the escapement on average and the hands sweep.
- **Gear train** – every wheel's angle is derived from the train's last arbor through its tooth counts. That arbor turns once a minute; 12:96 and 16:120 bring that to once an hour at the centre arbor, and 10:80 to once in eight hours at the great wheel. Cannon pinion → minute wheel → hour wheel is 12:1. The hands show your local time because the train drives them. They are hollow copper, and each is counterpoised inside the hall.
- **Steam engine** – a double-acting cylinder on a slider-crank. Steam is admitted for the first 40 % of each stroke and then expands; the crank torque follows from the linkage geometry and works against the load of the floor train and a 12 000 t·m² flywheel. It takes about forty seconds to run up from rest and twenty to coast down. The engine's speed *is* the speed of the floor wheels.
- **Winding** – the clock is driven by a 2,560 t weight hanging from a barrel on the great wheel's arbor, and the engine's job is to wind it up again. The floor wheels are the first part of that: the idler carries a mitre wheel, a line shaft runs from it across the floor to a crown wheel at the foot of an upright shaft, and a cross shaft takes the drive on to the crown wheel of a second. The two uprights stand either side of the 80-tooth winding wheel on the arbor, 125 m tall, and each carries a worm level with the arbor, at three o'clock and nine, so that the weight's pull at the rim is shared between them: one worm is pushed up and the other down, the arbor feels a pure couple, and each half goes straight down its own shaft to a thrust bearing on the floor. The weight falls 1.1 mm a second as the clock runs; when it has fallen two metres a clutch takes the winding wheel onto the arbor and it is hauled back at 10 mm a second. The clutch is thrown by two arms on the arbor itself, whose angle is the weight's height. While it is wound the great wheel is kept driven by Harrison's maintaining power: the arbor's ratchet drives a loose ring through clicks, the ring drives the wheel through springs, and a detent on the frame holds the ring while the arbor turns back.
- **Governor** – flyballs lifted by centrifugal force against gravity throttle the steam, holding 11.5 rev/min. Watch them bob with each stroke.
- **Boiler** – pressure falls as the engine draws steam and recovers as the fire catches up; shut the regulator and the safety valve lifts at 6 bar.
- **You** – a dynamic rigid body (Rapier). Your feet can only push with friction (μ·g), which is also all that holds you on a turning gear: stand too far out on the flywheel and it throws you. Falling has air drag (terminal ≈ 55 m/s).
- **Lift** – a paternoster. Thirty-five cars hang from two endless roller chains (one link to a tooth, a car on every fourteenth pin) that run over a pair of toothed wheels at the top of the shaft and a pair at the bottom, up one side and down the other, so the cars going up balance the cars coming down. Each car swings from an axle between the chains and stays upright over the top and under the bottom. A car goes between the two wheels of each pair, so nothing on it but the axle is wider than its deck: the chains run in a 0.4 m gap between the deck's edge and the landing, and each landing has a sill plate that reaches in across that gap to within 30 mm of a passing deck, notched where the chains and the axles' ends go by. It does not stop: step on and off as a car passes, up the sloping sill at the deck's edge (at the ground, as it comes round under the bottom wheels, its lip 35 mm clear of the floor). Going up you can get off any time from a little before the landing to a little after; going down, step off before the deck reaches the landing. The bottom wheels are turned by crossed belts from a second line shaft off the idler's mitre wheel, at 1.2 m/s when the engine is at speed, so a car comes by every nine seconds; stop the engine and the lift stops.
- **Hoist** – in the right-hand stair tower's well, a cage for the lamp's stores and the lookout's visitors, so the stair is left to those who want to climb. The cage and its counterweight run in guides up a fenced hoistway from a pit in the tower's floor to the sheave room under the spire; their ropes go over two head sheaves there and back down to one drum on the tower's floor, wound opposite ways, so one pays off as the other winds on. The drum is turned through 3.5:1 spur gearing by a twin-cylinder steam engine beside it, fed by a lagged pipe from the boiler; it stands on a stone bed inside a railing, and you can watch its cranks, rods and crossheads turn as the cage moves. It stops at the street (where the street door and the door into the hall are), the attic (242 m) and the lookout (315 m), at 2.5 m/s, about 95 s from the street to the attic. Pull the hand rope (E) in the cage or at a landing gate and the cage goes to the next stop. The gates are shut while it moves. Its engine draws its steam from the same boiler as the main engine: below 2.5 bar it will not start, and a cage caught between landings by a falling boiler waits on its brake for the pressure to come back.
- **Everything is solid** – every tooth of every wheel, the pendulum and its rating nut, the engine's crank and connecting rod are moving colliders. Stand in a tooth's way and it hits you at the speed it is travelling (about 5 m/s at the rim of the floor wheels). Go down between two meshing wheels and you do not come out.
- **Loose things** – crates, barrels and brass shot are ordinary rigid bodies. Shove them, stack them, roll them into the teeth. The pendulum's nut knocks over whatever stands in its path; a turning wheel carries what stands on it for as long as friction can supply the centripetal force (μ·g) and throws it off beyond that.

### What you see

There are no image, model or sound files: everything is generated when the page loads.

- **Surfaces** – each material is a small program (`src/surface/recipes.js`) run once on the graphics card: real-size bricks on lime mortar, enamelled cast iron, brass with polishing scratches, bolted tread plate. They are laid onto every part in true metres, so nothing stretches. A tile holds only grain; anything you would recognise the second time is computed from where the point is on the part (`src/surface/material.js`): the firing of each individual brick, the dulling of brass in patches, damp at the foot of a wall. Nothing repeats.
- **A clock that is looked after** – the castings are in green enamel with gold lining, as on a real tower-clock movement; the brass is dull rather than tarnished; nothing is rusting. (The materials can corrode: `weather` in `surface()` breaks out rust or verdigris in spots and runs it down upright faces. Nothing uses it.)
- **Light shafts** – daylight through the dial is marched through the air against the same shadow map that lights the hall, so the beams carry the shadows of the hands, the tracery and every wheel they pass.
- **The town** – generated from a seed (`src/world/city.js`): five districts whose street grids meet at odd angles, terraced rows round their yards with a chimney stack on every party wall, mills with saw-tooth roofs and tall stacks, gasworks, churches, a domed civic building, a river with three bridges, and gas lamps along the streets.
- **Nothing is quite true** – every part is set a few millimetres and a fraction of a degree off (one place in `kit.js`), handrails run in lengths from baluster to baluster, and stair stringers come in five-metre sections joined by riveted splice plates.
- **Exposure adapts** – the picture stops down when the view is full of light (behind the dial) and opens up in the dark, over about a second.
- **Edges** – every box has a chamfer a centimetre wide that catches the light, whatever its size.
- **Grade** – filmic tone curve, cool shadows and warm highlights, vignette and grain.

### The building

It was designed as a building, not a box with a clock in it, and everything about it is what it looks like. Every
window lights a room or a stair you can walk to, and every doorway has its doors.

- **The front** – the dial is set in a stone panel that spans from one stair tower to the other, so nothing runs
  into it; quatrefoil roundels in its corners. Below it, on the middle column line, the **portal**: a doorway 8 m
  wide and 7 high in a porch 12 m wide and 9 deep under a gable, with a pointed arch of three orders on shafts,
  buttresses with pinnacles either side, a ribbed vault, and its gates folded back against the porch's walls. The
  doorway is parted by a mullion into two, each with a pair of leaves under a transom and a fanlight, and a glazed
  screen across the porch in front of the wall has a second pair: between them, a draught lobby. Over the porch, in
  the middle bay, the **great window**, from pier to pier and from 35.5 m to a pointed head at 80 m, glazed in an iron
  screen just outside the wall's frame (whose column and girders stand behind it as its mullion and transoms) under a
  recessed arch of three orders; it lights the hall's floor. Either side of it the tracery is blind, drawn as stone.
- **The sides** – every bay of every storey is a pair of tall stone lancets with transoms and a roundel between their
  heads; the brick behind is pierced and glazed with leaded lights, which light the hall. In the top storey, which is
  the hall's roof space, they are louvred on every face and air it.
- **The back** is plainer: piers and brick panels between stone bands, the service door to the coal yard, and a
  turret at each corner.
- **The two stair towers** stand at the front corners, 22 m by 20, brick on a steel frame, to 334 m, with an
  octagonal copper spire to 392. Each stair goes twice round its well to a storey, in flights of no more than sixteen
  risers, every landing and every flight's end on a steel bearer built into the tower's frame; windows light its
  landings, and on every storey's landing are a bench and a lamp: the landings are refuges where people coming down
  can wait out of the way. Doors from the street, onto every side gallery of the hall, into the attic, at the top
  onto a bridge to the mansard's flat, and in the right tower, at 210 m, onto the dial-cleaning cradle. At the top,
  over the mansard's flat, the stair comes up into the **lookout** (315 m), an open stage with an arcade on every
  face, a parapet at sill height and an iron grille in each arch. Over it, under the spire, a closed stage aired by
  louvres and reached by a ladder through a hatch: in the right tower the hoist's sheave room, in the left a tank
  that gives a head of water to the hose reels in the lookouts, on the bridges and in the lamp room, filled by the
  engine's feed pump through a rising main up the corner of the well.
- **The escape stairs** – a sixteen-sided turret on the back wall at each back corner, brick on a steel frame, under
  a conical cap to 304 m. Inside, a square stair round a well whose corners are four steel columns, three turns to a
  storey, with a door onto the back gallery at every level, one into the attic and one to the street.
- **The stack** – the boiler's smoke and the engine's exhaust leave the hall underground, by a brick flue 2.4 m wide
  and 3 high whose floor is 8 m under the street. It runs out under the back wall and the coal yard, back under the
  street behind, and across to the foot of the stack: a round brick shaft on a steel frame, 140 m tall, on a square
  stone pedestal in a walled yard of its own in the town, 260 m behind the building. The wind here blows mostly off
  the river, across the front, so the stack stands on the lee side, beyond the eddy the building sheds behind itself.
- **The coal yard** – behind the building by the service door: a brick wall with a gate to the back street, a cart
  track of setts, staithes and coal bays, the ash heap, and the flue's access chamber. Coal is wheeled in through the
  service door and round the end of the boiler to its firing floor, and the ash out the same way: neither crosses the
  machine floor. On the floor by the service door is the keepers' **workshop**: benches with vices, a lathe, a rack
  of spares.
- **The attic** (242 to 268 m) stands on the wall line, with a window 5.6 m wide in every bay, its sill a metre over
  the floor. Its floor is an 8 m band all round with the stores along the front (racks of spares under the windows,
  crates) and the fire tanks along the back; the hall's roof is inside it. Over it a steep copper **mansard** with a
  dormer to every bay, on steel trusses, to a flat at 315 m; above each dormer, high on the slope, a lucarne (a stone
  face with one light, a gable and a copper roof back into the slope) lights the trusses.
- **The lamp room** stands on the middle of the flat: a stone drum 44 m across and 14 m high, which lifts the lamp and
  its glass clear of the mansard's edges (they would hide them from the town), then 18 m of glass between iron
  mullions and glazing bars (no pane more than 1.2 m wide or 2 m high), with a stone gallery round it from which the
  glass is cleaned, and a copper cone to 389 m with a louvred ventilator for the lamp's fumes. Inside, a stair round a
  square well to the lamp floor, and in the middle a ring of coal-gas burners with incandescent mantles in a fixed
  lens of glass prisms, on an iron column. The gas comes up the right-hand stair tower. A weathervane on the lamp
  room, on each spire and on each turret's cap, all turned into the wind off the river.
- **Doors** – 88 leaves in 45 doorways, iron-framed, with wired-glass vision panels (or all glass), double-acting on
  floor springs. They open away from you as you come and the springs shut them behind you.
- **Keeping it** – a monorail under the cornice between the stair towers carries a window cleaner's cradle down the
  face of the dial; it parks against the right-hand tower and is boarded from its 210 m landing.

### Things to try

The regulator (key 7, then walk up to the lever) has four notches: shut, half, full, and full with the
governor tied down. At half you can stand anywhere on the flywheel. With the governor tied down the
engine runs away to about 16 rev/min and the flywheel will not keep you past a few metres from its centre.
Push a crate onto the flywheel: it rides at the governed speed and is flung across the hall when the engine runs away.

Stand at the rim of the great floor wheel and let a tooth catch you. Push a barrel into its teeth, or
leave a crate where the pendulum's rating nut sweeps the floor.

## Does it stand up?

By calculation, and the game checks itself. The aim is a building that could actually be built. `__game.check()`
in the browser console runs the whole thing (about 3 s) and returns `{ ok, clashes, rows, extra, terminal, text }`;
at present `ok` is true, with no clashes, whether the design is grown from nothing or from the seed.

**What is analysed is what is drawn.** As each part is drawn it also declares what it is structurally: its members
with their real sections and materials, the masses it carries, the loads put on it, and what it rests on. The
stone is weighed from the stone facade.js actually draws (each face's parts, overlaps counted once), the brick
from the panels, the dial from its glass. The check then does an engineer's load take-down over the whole scene.

- **The analysis** (`src/structure/solve.js`). Each frame is solved as a 3-D frame by the stiffness method: a
  sparse (skyline) LDLᵀ factorisation in reverse Cuthill–McKee order, which finds a mechanism rather than returning
  numbers for one. Everything that works together is one frame: the six towers with the links between them, the four
  walls with their wind trusses and the ring over the dial, each crossing with its deck. Second order: the geometric
  stiffness of every member's axial force is added, and each frame's elastic critical load factor is found by a
  Lanczos iteration and confirmed by factorising K + 2.5 K_g (Sylvester's inertia: positive definite means it does
  not buckle below 2.5 times its loads). Moments are amplified by the P-Δ that follows. Ties that would have to push
  are dropped and the frame solved again. There is no effective-length guess anywhere: what holds a member is found.
- **The loads.** Dead weight (steel, brick, stone, the dial, the crown, the clock's wheels); the pendulum's swing
  (its reaction at the head, both ways); the push of the teeth at every mesh; the winding (the worms' pushes on the
  wheel and down their shafts, the bevel wheels', the barrel's pull, the detent holding the maintaining ring); wind from all four directions at 1.9 kPa with pressure
  and suction coefficients, internal pressure and suction, and wind on the crown, the lamp room, the stair towers, the
  turrets and the stack. They are combined as
  they can occur together (stopped; going or winding, with the pendulum at either end of its swing; wind from each
  direction with pressure or suction inside), each with every frame leaning 1 in 200 the same way as an erection
  tolerance, and every member is checked at working stress against the worst: axial force with buckling, bending
  both ways, shear and torsion together, the slenderness of its plates, and fatigue for what is loaded every beat or
  every winding.
- **The design loop** (`src/world/structure.js`). Plan the members' places, each tested for clearance at the
  largest size it may grow to; analyse; enlarge whatever is overworked, or too flexible, within the room it was
  planned for; repeat (up to fourteen passes from nothing). A frame that would buckle too soon has the members
  grown that do most to hold it for their weight (their share of the buckled shape's strain energy per tonne), so
  that where the members that matter most are already as big as their room allows, the frame is made stiff where it
  can be rather than heavy where it cannot. A tower whose bearing moves too far has the members grown that hold that
  bearing (that frame's legs, ties and braces when it moves in the frame's plane), designed with a fifth in hand
  under the pendulum's swing, which comes back every beat. The sizes are the ones the loads asked for, and a member that
  cannot grow any more is reported, not hidden. The sizes it converges to are kept, in the browser and in
  `src/structure/design.json` for a first visit, tied to a fingerprint of the plan and of the loads that are not
  fixed in code (the stone as drawn, the brick); the next load starts from them and still analyses everything before
  anything is drawn, so a seed only saves the passes. Nothing is ever made smaller, so a seed that no longer holds is
  grown like any other start, and one for another plan or other loads is not used at all. Ready in about 2 s.
- **Interference.** Every structural solid is tested against everything else: wheels, arbors, walkways, the engine,
  every drawn part with or without a collider, the members of the other frames, and the drawn surface of the
  machinery itself (every vertex, bolt and rivet). Also the spaces that must be empty: the doorway, the headroom over
  every walkway, through every door and round the lamp. Every door leaf is swung through its whole travel and tested
  against everything fixed, and the hoist's cage and counterweight, as drawn, are carried through their whole travel
  in 0.2 m steps (1,576 positions) against everything fixed in the tower.
- **Serviceability.** The bearings: under the pendulum and the winding a bearing may move no more than 5 mm and an
  arbor's two bearings no more than 1 in 2000 across it. The worst is the pendulum's own suspension, 2.7 mm as it
  swings; the great arbor's bearings move 0.2 mm while the weight is wound. Under the clock's own weight the towers
  move a long way (great 346 mm, centre 278, minute 194, third 185, escapement 10, pivot 4), so **the bearing seats
  are pre-set**: each is set high and over by its computed movement, and the wheels land on line. What is left to the
  50 mm of shims is what that computation may be out by, taken as a tenth of it (at most 35 mm); the weight wound up
  or run down makes no difference. With the preset every pair of meshing wheels is at its drawn centre distance
  (without it the centre wheel and third pinion would be 73 mm out). The walls: no more than L/500 out of their plane in the wind,
  their heads no more than H/500 along it.
- **Foundations.** One raft of reinforced concrete under the whole building, 6 m thick. Each tower's foot on a
  pedestal sized for the concrete under its bearing plate with a tenth in hand (two feet close together share one,
  on a grillage); each wall column on a steel grillage cast into the raft's top, 9.4 m along the wall and up to 6.5 m
  in. The two stair towers, the two escape turrets and the stack stand outside the raft, each on a footing of its own
  as big as its plan (504 m² each stair tower, 246 m² each turret, 449 m² the stack) with each column on a grillage in
  its top; they put 66,500 t and 66,800 t (the left and right stair towers: the right carries the hoist), 27,000 t
  (each turret) and 20,600 t (the stack) on the rock, 1.5 MPa at worst. Punching of every base through the raft is
  checked to EN 1992-1-1 6.4.4(2) (at worst 87%). The rock is taken as strong rock at 4.0 MPa, the usual
  presumed bearing value for strong limestone or hard sandstone: **that is a requirement of the site, to be proved by
  investigation**. Against it the raft puts 1.0 MPa on the rock on average and 3.6 MPa under the worst foot (a column
  of the left wall). The winding uprights stand on pedestals 3 m square; the one whose worm
  pulls it up is held down by its own weight (12.2 MN against a pull of 7.4) and by eight headed rods 4 m deep in the
  raft, checked for the pull at 1.5 less the weight at 0.9 and for the bevels' push at its foot (EN 1993-1-8 for the
  rods, EN 1992-4 for the cone of concrete they would pull out).

`npm test` checks the solver against textbook cases: cantilevers, torsion, P-Δ, Euler buckling in several
restraints and orientations, the sparse solver against a dense one, doubled members, mechanisms, links in
compression, and load paths through assemblies.

**The wheels stand on towers.** They are solid brass castings: the great wheel 17,000 t, the going train about
84,000 t. Under each arbor stands a tower of two A-frames of alloy-steel box sections (450 MPa), one in the gap
either side of the arbor's wheels, strutted together wherever a strut can pass between the wheels. Where a leg of
one tower crosses a leg of another in the next gap, the two are bolted through a pinned link (16 of them), so the
six towers are one frame. A frame's feet stand at least an eighth of its height apart, and a fifth where a tower can
have it. The towers weigh 73,600 t (escapement 1,600, pivot 25,200, third 7,000, centre 20,200, great 7,800, minute
11,700); their least critical load factor is 2.60.

**The winding gear puts nothing on the towers.** The two worms share the weight's pull, 7.9 MN each, pushing the
rim opposite ways 18 m apart, so the arbor is turned by a couple and its bearings are asked for nothing but the worms'
end-thrust along it (2.4 MN, into the thrust collar at the front bearing). Each worm's half goes down its own upright
to the floor: the left-hand one in compression, the right-hand one in tension. Both shafts are solid steel 1.2 m
through, 1,120 t each: the left-hand one can be steadied only below and above the driving weight's fall (arms from
the great tower's front legs at 36 m and 90 m), and over the 54 m between, a shaft a metre through would buckle at
2.4 times its push; at 1.2 m it is 4.2 (the check works it to 60%). The teeth also push each worm off the wheel,
2.9 MN, opposite ways on the two sides: each upright runs in a radial bearing just above its worm and one just below,
and the four are tied together by a **yoke**, a rectangle in the plane of the tower's front frame between the barrel
and the winding wheel, bolted over and under the front bearing, with an arm forward from each corner to a bearing; the
worms' end-thrust closes through it to the same bearing. So both pairs of forces close in the yoke, and the tower
carries only its weight. The uprights stretch and shorten about 4 mm under their halves: that is lost motion in the
drive as each winding begins (the wheel turns two minutes of arc less), not a bearing moving. The clutch lever's
pivot stands on a post from an arm under the wheel's rim, off a tie across the front frame. The maintaining detent,
which holds the maintaining ring for the two and a half minutes of a winding, is a bracket 12 m long off the centre
tower with a strut under its end, behind the ring where nothing goes round, and nothing carried round on the great
arbor passes through it in a whole turn; it is what moves a bearing most while winding (the centre arbor's, 1.9 mm).

**The shell is a braced steel frame with brick between.** Columns every 10 m, a girder at every 30 m level carrying
the storey of brick above it and a shelf for the storey of stone in front, so that no brick or stone carries more
than one storey of itself (0.8 and 1.0 MPa). The brick panels are **diaphragm walls**: 2 m overall as drawn, two
450 mm leaves joined by 330 mm cross-ribs every 1.5 m, which is 57% of the brick of a solid wall; the wind check
bends them with that real section. Half way up each storey (or near it) a horizontal wind truss runs round the
inside of the walls (along the back, the stairs' bracket just above it is tied from above to leave it room), and one
more at the wall head: 34 trusses, 640 members, each tested for clearance. They carry the wind on a wall to the walls
either side of it, which take it down to the ground by their bracing. A steel ring as wide as the wall carries the
front over the dial. The attic's floor is a concrete slab on the top truss; its walls stand on the wall line, and
the slab, standing in from it, twists the top girders, which is carried. Over it the **crown**: a steel post on every
column head, a ring at the eaves, and a two-tier truss across on every column line of the front and back, with
rafters, hips, purlins and a girder round the slopes half way up (26,650 t of steel, 38,200 t of brick and stone on
it). The lamp room's drum stands on eight joints of the trusses on a circle under it, and its floor's inner half on
a frame of its own (four posts at the corners of the stair's well and a column under the lamp). The stair towers
(11,400 t of steel each) and the escape turrets (3,900 t each) are steel frames of their own, carrying their brick
storey by storey as the walls do and braced to the shell's walls; the stack (1,900 t) stands free on its own
footing, its frame a ring at every stone band. The walls' frames are 281,000 t of steel and their wind trusses
48,800 t; with 199,000 t of stone on the faces (weighed from what facade.js draws; it counts each face's brick as if
it had no openings, which is on the safe side for the glazed sides), the brick and the crown, the raft and what it
carries put 1,175,000 t on the rock.

**The hoist is in the model.** Its hoistway is a frame of its own: four corner posts and the guides, with a beam
across the well at every storey from the tower's back wall to its front, carrying the fence, the guides and the
landing gates (λ 17). The sheaves' beams in the sheave room carry each sheave with both falls of its rope, the
cage loaded (1.8 t and ten people) or the counterweight; the left tower's tank is on beams in its stage. These rest
on the stair towers' frames, which carry them to their footings. The drum and the engine stand on stone beds on the
tower's floor.

**Does it go?** The check also draws up a power budget. The driving weight's fall is all the power the going
train has: 27 kW. Turning the wheels takes 12 kW in the arbors' bearings and 2.5 kW in the teeth; winding the
remontoire takes 0.9 kW, of which 0.3 kW is all that ever reaches the pendulum; the brake takes the other 12 kW,
which is the margin the weight is sized with. That is with roller bearings (friction 0.003). In plain oiled
journals, at these loads and this slowly, the friction would be thirty times that and the clock would stop.

Not covered: earthquake, the connections themselves, the raft as a plate, erection, temperature, and one moving
part against another except where it is said to be (the detent against what turns past it, the escapement's legs
and stops, a lift car carried right round its loop against everything it passes, its own chain wheels included, the
hoist's cage and counterweight over their travel, and every door leaf through its swing). The stairs and galleries in
the hall, the lift cage and the pendulum landings are drawn by tower.js but are not in the model; the stairs in the
stair towers and the turrets are, their bearers and stringers members of their frames, and the lamp room's as weights
on its floor.

## What is not right yet

The aim is a clock a clockmaker and an engineer would sign. It is not there, and these are the things each would
still send back. They are as it stands, not hidden by the check passing.

The clock:

- **The suspension.** The pendulum's twelve leaves are spaced along the swing, where they brace each other like the
  legs of a frame and could not bend as they are said to. They belong in one plane, side by side along the axis the
  pendulum turns about.
- **No fly.** A gravity escapement's wheel needs a fan on its arbor to take up the energy of each step before a leg
  lands on its stop. There is none.
- **Overhung arbors.** The centre and third arbors carry their wheels outside their bearings, which bends a turning
  shaft back and forth once a turn. They want a bearing each side, and a fatigue check per revolution.
- **The hands** are not designed for the wind: the minute hand's stress and the movement of its tip toward the glass
  have not been brought inside what copper and the clearance allow.
- **It cannot run down.** The simulation winds the weight before it ever reaches the bottom, the train's rate does
  not depend on the weight, and the maintaining power never runs out; so stopping the engine does not, in time, stop
  the clock, as it must.
- **The winding wheel** is drawn with straight teeth where a worm wants a throated wheel, steel on steel where one
  of the two should be bronze, and is said both to hold against the weight and to pass most of its power.
- **The driving weight** hangs from one rope, bent over a barrel too small for it, with nothing to catch it.

The structure:

- **The steel.** The towers and walls are sized in a quenched and tempered steel of 900 MPa yield at any thickness.
  It is made in plate up to about a tenth of the thickest drawn here.
- **Stability** is shown at 2.5 times the working loads with feet taken as fully fixed; the stair towers, turrets
  and lamp room lean on the shell without their weight being in its stability.
- **Wind on the foundations** of the hall, a broken dial as a load case, uplift on the roof, and the stack in a
  steady wind (vortex shedding) are not checked.
- **Pedestals** are drawn in stone and checked as concrete.
- And what is listed above as not covered: connections, fire, earthquake, temperature, erection, the raft as a plate.

## Layout

```
index.html            page, overlay, HUD
src/
  main.js             start-up, input, HUD, the fixed-step loop
  layout.js           every dimension, in metres
  kit.js              materials, instanced primitives (chamfered boxes), walkways and rails
  surface/
    glsl.js           tileable noise and the output packing every surface recipe shares
    recipes.js        brick, stone, painted iron, brass, steel, floor plate: one GLSL function each
    generate.js       bakes a recipe to colour, normal and roughness/metal/occlusion maps on the GPU
    material.js       the material that wears them: projected in metres, varied in world space
  player.js           the character's physics
  audio.js            all sound, synthesised
  world/
    tower.js          the building: shell, galleries, stairs, crossings, the portal's lobby, the workshop; the stair
                      towers', the turrets' and the lamp room's stairs, the towers' top stages, the attic, the flat and
                      its bridges, the cradle
    doors.js          every doorway's leaves, and how they swing
    hoist.js          the hoist in the right-hand stair tower: hoistway, cage, counterweight, sheaves, drum, engine
    structure.js      the engineer: plans the towers, shell frame, wind trusses and foundations, sizes them by analysis, draws them, checks them
    facade.js         the outside: piers, the clock panel, the portal, the great window, the stair towers, the escape
                      turrets, the stack, the coal yard, the attic, the mansard and the lamp room
    city.js           the town outside, generated from a seed
    props.js          loose crates, barrels and shot
    env.js            renderer, light, shadow, haze, sky
    post.js           ambient occlusion, light shafts, bloom, film grade
  structure/
    solve.js          3-D frame analysis, numbers only: sparse LDLᵀ, second order, buckling (Lanczos, Sylvester)
    model.js          materials, sections, loads and combinations, assemblies, frames, member checks
    masses.js         what the wheels weigh, from the dimensions they are drawn with
    solve.test.mjs    the solver against textbook cases (`npm test`)
  clock/
    clockwork.js      pendulum, escapement, going train, hands, floor wheels, lifts, and their simulation
    gears.js          tooth geometry, colliders, mesh phasing
  engine/
    physics.js        cylinder, crank, governor and boiler: numbers only
    model.js          the engine you see, and its pipework and gauges
    steam.js          steam particles
    engine.js         ties the three together; the controls
```

Simulation code never draws and drawing code never integrates: `clock/clockwork.js` and
`engine/physics.js` advance on a fixed 1/120 s step, and everything visible is posed from their state.
Rigid-body contact (you, the props, every moving part) is Rapier's.
From the browser console, `__game` exposes the player, clock, engine and a few helpers
(`__game.advance(seconds)` fast-forwards the simulation; `__game.shot(position, yaw, pitch)` draws one frame from a viewpoint).
