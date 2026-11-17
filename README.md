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
| E | use what is in reach: the engine's regulator lever, the whistle chain, the hoist's hand rope; or read the brass plate in front of you (E again or Esc puts it down) |
| 1 – 9, 0, − | fast travel: floor, pendulum landing, escapement, between the wheels, behind the dial, the engine, the winding gear, the square, across the river, the attic, the lamp room |
| R | back to the floor |
| M | mute |
| L | light or put out your lantern |
| Q | detail level (it also steps down by itself if the frame rate drops) |

## What is real

- **Pendulum** – 99 m long, with a 3,760 t brass bob on a rod of five super-invar bars, integrated as `θ'' = -(g/L)·sin θ`. It hangs from four leaves of maraging steel, each 1.2 m wide and 200 mm thick, side by side in one plane, clamped in chops in a head beam and 7.8 m long between the upper chops and the lower ones at the head of the rod. A strip under tension T bends over a length λ = √(EI/T) below its clamp, and turns about a point about λ below it: here λ is 3.9 m and the pendulum's pivot is 4.0 m below the upper clamp. It swings 3° either way, which bends the leaves 264 MPa at the clamp on top of 42 MPa of tension: 96 % of what maraging steel will take for ever (Goodman, with 1.35 in hand); the chops' cheeks are radiused 40 m so they never touch the bent leaf. The rod runs through the bob, which sits on a collar 7.4 m below its middle, so that the brass, growing upward from the collar, makes up the rod's, the leaves' and the chops' growing downward. What is left is the leaves' own: their modulus falls as they warm, λ grows with it, and the pivot moves 0.5 mm a degree, 0.22 s a day a degree. That, and the rate, are taken out by the **rating tray** half way down the rod: 378 kg on it gains a second a day. (There is no landing at the tray: the keeper would need one at 60 m.) The arc is set by the weight of the escapement's arms (3.5 t each); measured over 32 beats the pendulum swings 3.000° and beats 9.99989 s, a gain of 1.0 s a day, which is 0.37 t off the tray.
- **Escapement** – a three-legged gravity escapement, in Denison's manner. On the escape wheel are three legs and three lifting pins; beside the suspension hang two long arms. The wheel is locked with a leg lying against one arm's stop. The pendulum, coming over, meets that arm's beat pin and carries the arm outward; the stop slides off the leg and the wheel turns a sixth of a turn, until the next leg meets the other arm's stop, lifting that other arm with a pin as it goes. The first arm comes back resting on the pendulum and follows it down past where it was picked up, to be set down on a pin. So each arm gives the pendulum a little more than it took, by a fixed drop, and that is the whole impulse. (The contacts were checked over whole beats: a leg never enters a stop by more than 15 mm, and a pin never enters a pallet.) The escape wheel and its remontoire are heavy and would hit the stop with 5.7 kJ at every beat; so a **fly** is geared to the wheel, 30 times its speed through a crown wheel on the wheel's sleeve and a pinion on an upright arbor beside it: four aluminium vanes 1.0 by 0.45 m, whose drag holds the wheel to 0.21 rad/s. The wheel now takes 7.0 s over its sixth of a turn and strikes its stop with 281 J; the fly runs on, on a ratchet, and slows. Behind each stop is a 50 mm buffer of disc springs and an oil dashpot (assumed, not drawn), which keeps the blow on a leg's root to 34 MPa (47.9 allowed in fatigue). A fly straight on the escape arbor, as on a turret clock, would do nothing at a sixth of a turn in seven seconds.
- **Remontoire** – the going train weighs tens of thousands of tonnes and could not stop and start every ten seconds, so it does not. It turns without stopping. On the end of its last arbor is a differential whose arm carries a 185 kg weight, and that weight is the only thing that ever turns the escape wheel, against the wheel's inertia and the fly's drag. Each step lets the arm drop; the train, coming on steadily behind, raises it again. The arm's height sets a brake on the train (a copper disc turning between magnets), so the train keeps pace with the escapement on average and the hands sweep. The disc is 35 mm thick: under the magnets it moves at 0.37 m/s, and an eddy-current brake's drag rises with speed only up to about 2/(μ₀σd), 0.78 m/s for this disc (a 120 mm disc would be past it); 0.17 T across the poles takes the brake's 16 kW. (The magnets are still drawn fixed; in the simulation the arm sets the brake through the train's rate.) If the train ever falls more than two steps behind, the arm lies on its banking, the escape wheel has nothing to turn it, and the escapement stops.
- **Gear train** – every wheel's angle is derived from the train's last arbor through its tooth counts. That arbor turns once a minute; 12:96 and 16:120 bring that to once an hour at the centre arbor, and 10:80 to once in eight hours at the great wheel. Cannon pinion → minute wheel → hour wheel is 12:1. The hands show your local time because the train drives them. The big wheels are fabricated, not cast: a steel centre of box arms and a box ring, and a rim of bronze segments bolted to it with steel joint plates (the great wheel 7,410 t); the hour pipe is steel plate. Every arbor runs in a bearing either side of its heavy wheel, and the centre arbor in a third, in the boss of the dial's frame; each is checked in rotating bending for the turns of a century (the escape arbor 53 million) at the stress range the weight and the teeth give it. The **hands** are steel lattice spines (3.0 m and 2.2 m deep at the root, tapering to 0.4 m), clad in painted copper; in a 1.9 kPa wind on their faces the chords work at 110 MPa and the tips move 0.63 and 0.38 m, and they keep 0.6 m between them and 2.7 m off the dial's frame. Each is balanced inside the hall by a lens of iron on a bar off its arbor or pipe (57 t at 9 m, 41 t at 8 m). Edge on, the wind twists the centre arbor with 5.6 MN m; what the weight gives it after friction (9.3 MN m) must be at least 1.5 times that, and that is what sets the weight.
- **Steam engine** – a double-acting cylinder on a slider-crank. Steam is admitted for the first 40 % of each stroke and then expands; the crank torque follows from the linkage geometry and works against a 12 000 t·m² flywheel and what it turns, which is worked out from what is there: the floor train, 12,300 t on roller thrust bearings, and the line shaft, 185 kN m at the crank (222 kW) all the time; and the rest of the winding gear, which is put in only while it winds (192 s in every 34 minutes), 3 kN m to turn it and 364 kN m to lift the weight through the worms. On average the engine gives 264 kW. The engine's speed *is* the speed of the floor wheels.
- **Winding** – the clock is driven by a 2,565 t weight hanging from a barrel on the great wheel's arbor, and the engine's job is to wind it up again. The weight hangs on **four steel ropes**, 240 mm, 6 x 36 with a steel core, from an **equalising beam** (a main beam and two pair beams, so each rope carries its quarter): each breaks at 40.2 MN, 6.4 times its share; the barrel, 10 m across, is 41.7 rope diameters, and has a groove for each rope, 3.7 turns, two of them dead. If the ropes or the train ever let it go, it falls at most 53 m onto a **crib** of oak baulks laid crosswise, 13 m high and 7.8 m across the flats, which crushing at 5 MPa over half its height takes 1,640 MJ against the 1,510 MJ it would bring. The floor wheels are the first part of the winding gear: the idler carries a mitre wheel, a line shaft runs from it across the floor to a crown wheel at the foot of an upright shaft, and a cross shaft takes the drive on to the crown wheel of a second. The two uprights stand either side of the 80-tooth winding wheel on the arbor, 127 m tall, and each carries a worm level with the arbor, at three o'clock and nine, so that the weight's pull at the rim is shared between them: one worm is pushed up and the other down, the arbor feels a pure couple, and each half goes straight down its own shaft to a thrust bearing on the floor. The winding wheel is a hobbed worm wheel, phosphor-bronze segments on a steel centre, rated 9.8 MN a worm against the 7.9 they push. The worms' lead is 5.2° and their friction 0.06, so they are 60 % efficient and can be driven backward (34 %): what holds the weight is never the worms but the clicks of the going ratchet. The weight falls 1.1 mm a second as the clock runs; when it has fallen two metres a dog collar on the line shaft locks on its pinion, which otherwise runs loose on the shaft's end (the floor clutch, on the fast side where the torque is least), and puts the winding gear in; a second clutch takes the winding wheel onto the arbor, and the weight is hauled back at 10 mm a second: 192 s at the engine's governed speed (about 200, as the governor lets it slow under the load). At the top the floor clutch comes out first; the worms run back until a click holds the weight (the trip is set just past where a click drops home, so the weight settles only by its clearance), and only then, unloaded, does the wheel's clutch come out. Between windings the line shaft turns, but its pinion, the uprights, the worms and the cross shaft stand. While it is wound the great wheel is kept driven by Harrison's **maintaining power**: the arbor's ratchet drives a loose ring through clicks, the ring drives the wheel through four leaf springs 8.2 m out, and a detent on the frame holds the ring while the arbor turns back. The springs are set up against stops: pressed home, as the weight keeps them, they push with 90 % of its torque and the stops take the last tenth, which keeps them home; while it winds they drive the train on, falling as they open to the 41 % the train takes in still air after 307 s, half as long again as a winding, and still giving 59 % when a winding ends. What they give over the train's need is all there is for the wind on the hands meanwhile: in a gale a winding can still hold the hands back until it is done. The detent takes only the springs' push, 14.7 MN. **If it is not wound** (stop the engine), the maintaining springs run the train for five minutes, then the train stops, the remontoire's arm runs down onto its banking and the escapement stops; the pendulum swings on, free, dying away over hours. Start the engine and it winds, the train takes up the arm again and the escapement starts on the next swing; if the pendulum has stopped, `__game.clock.start()` swings it by hand. The clock says what it is doing in the line at the foot of the screen.
- **Governor** – flyballs lifted by centrifugal force against gravity throttle the steam, holding 11.5 rev/min. Watch them bob with each stroke.
- **Boiler** – pressure falls as the engine draws steam and recovers as the fire catches up; shut the regulator and the safety valve lifts at 6 bar.
- **You** – a dynamic rigid body (Rapier). Your feet can only push with friction (μ·g), which is also all that holds you on a turning gear: stand too far out on the flywheel and it throws you. Falling has air drag (terminal ≈ 55 m/s).
- **Lift** – a paternoster. Thirty-five cars hang from two endless roller chains (one link to a tooth, a car on every fourteenth pin) that run over a pair of toothed wheels at the top of the shaft and a pair at the bottom, up one side and down the other, so the cars going up balance the cars coming down. Each car swings from an axle between the chains and stays upright over the top and under the bottom. A car goes between the two wheels of each pair, so nothing on it but the axle is wider than its deck: the chains run in a 0.4 m gap between the deck's edge and the landing, and each landing has a sill plate that reaches in across that gap to within 30 mm of a passing deck, notched where the chains and the axles' ends go by. It does not stop: step on and off as a car passes, up the sloping sill at the deck's edge (at the ground, as it comes round under the bottom wheels, its lip 35 mm clear of the floor). Going up you can get off any time from a little before the landing to a little after; going down, step off before the deck reaches the landing. The bottom wheels are turned by crossed belts from a second line shaft off the idler's mitre wheel, at 1.2 m/s when the engine is at speed, so a car comes by every nine seconds; stop the engine and the lift stops.
- **Hoist** – in the right-hand stair tower's well, a cage for the lamp's stores and the lookout's visitors, so the stair is left to those who want to climb. The cage and its counterweight run in guides up a fenced hoistway from a pit in the tower's floor to the sheave room under the spire; their ropes go over two head sheaves there and back down to one drum on the tower's floor, wound opposite ways, so one pays off as the other winds on. The drum is turned through 3.5:1 spur gearing by a twin-cylinder steam engine beside it, fed by a lagged pipe from the boiler; it stands on a stone bed inside a railing, and you can watch its cranks, rods and crossheads turn as the cage moves. It stops at the street (where the street door and the door into the hall are), the attic (242 m) and the lookout (315 m), at 2.5 m/s, about 100 s from the street to the attic. Pull the hand rope (E) in the cage or at a landing gate and the cage goes to the next stop. The gates are shut while it moves. Its engine draws its steam from the same boiler as the main engine: below 2.5 bar it will not start, and a cage caught between landings by a falling boiler waits on its brake for the pressure to come back.
- **Everything is solid** – every tooth of every wheel, the pendulum and the foot of its rod, the engine's crank and connecting rod are moving colliders. Stand in a tooth's way and it hits you at the speed it is travelling (about 5 m/s at the rim of the floor wheels). Go down between two meshing wheels and you do not come out.
- **Loose things** – crates, barrels and brass shot are ordinary rigid bodies. Shove them, stack them, roll them into the teeth. The foot of the pendulum's rod knocks over whatever stands in its path; a turning wheel carries what stands on it for as long as friction can supply the centripetal force (μ·g) and throws it off beyond that.

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
- **The plates** – as in a museum, each exhibit has a brass plate engraved with its name, on a cast-iron lectern or
  bracketed to a catwalk's handrail (`src/world/plaques.js`, where all their texts are kept together). Stand at one,
  face it and press E to read what the thing is, how it works, what to watch from there, and a line read live from
  the simulation; the label keeps count of how many you have read. They are solid and in the structural check like
  any other part. Nineteen: the Great Clock (in the square, by the portal), the floor wheels, the steam engine, the
  regulator and governor, the boiler, the winding gear, the driving weight (by its crib), the towers (at the great
  wheel's tower's foot), the paternoster lift, the hoist (in the right-hand stair tower), the pendulum (on its
  landing), the escapement and the remontoire (on the escapement's catwalk), the going train (on the crossing
  between the wheels), the motion work and hands (behind the dial), the attic, the lookout (in the right-hand stair
  tower), the lamp room, and the coal yard and the stack (in the yard).

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
  engine's feed pump through a rising main up the corner of the well. Over that, in the foot of each spire, hangs the
  tower's damper (see Wind on slender stacks).
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
engine runs away to about 40 rev/min, held back by nothing but the floor train and how fast the boiler can steam
(its pressure falls below 1 bar), and the flywheel will not keep you anywhere but at its centre.
Push a crate onto the flywheel: it rides at the governed speed and is flung across the hall when the engine runs away.

Stand at the rim of the great floor wheel and let a tooth catch you. Push a barrel into its teeth, or
leave a crate where the foot of the pendulum's rod sweeps the floor.

## Does it stand up?

By calculation, and the game checks itself. The aim is a building that could actually be built. `__game.check()`
in the browser console runs the whole thing (one to two seconds) and returns `{ ok, clashes, rows, extra, terminal, text }`.
At present `ok` is **true**: every row passes and nothing clashes, and that stays so through a winding and at every
clock position tried. That is not the same as nothing left to do (see *What is not right yet*).

**What is analysed is what is drawn.** As each part is drawn it also declares what it is structurally: its members
with their real sections and materials, the masses it carries, the loads put on it, and what it rests on. The
stone is weighed from the stone facade.js actually draws (each face's parts, overlaps counted once), the brick
from the panels, the dial from its glass. The check then does an engineer's load take-down over the whole scene.

- **The analysis** (`src/structure/solve.js`, `src/structure/model.js`). Each frame is solved as a 3-D frame by the
  stiffness method: a sparse LDLᵀ factorisation in nested-dissection order, which finds a mechanism rather than
  returning numbers for one. Everything that works together is one frame (52 in all): the six towers with the links
  between them, the four walls with their wind trusses, the crown, the stair towers and turrets braced to them and
  the ring over the dial, each crossing with its deck, each line shaft on its bearings. Forces come from the
  **direct analysis** of AISC 360-16 chapter C: the loads at 1.6 on 0.8 of the stiffness, a notional sideways load of
  1/200 of the weight in every combination, solved to second order outright where a frame would buckle under less
  than 9 times its working loads, so that each member is amplified by as much as the frame's modes bend it (a stair
  tower's own buckling does not amplify the walls it is braced to), and by B2 otherwise (then at most 1.29); then
  divided back by 1.6. Each frame's elastic critical load factor is found by
  a Lanczos iteration and must be at least 4.5 at working load, confirmed by factorising K + 4.5 K_g (Sylvester's
  inertia); the least are the walls and the towers 4.64, the balcony crossing 7.86. Ties that would have to push are
  dropped and the frame solved again. There is no effective-length guess anywhere: what holds a member is found.
- **The steel.** Plate is S690QL (EN 10025-6), its yield falling with thickness (690 MPa to 50 mm, 650 to 100), and
  none is thicker than 100 mm: a thicker wall is laminated from plies stitched by preloaded M36 bolts 300 mm apart
  both ways, each ply checked buckling between stitches and the net section through the holes. Mild steel is S235
  and S355, solid shafts NiCrMoV forgings by ruling section. Every member is checked at working stress against its
  worst combination: axial force with buckling, bending both ways, shear and torsion together, the slenderness of its
  plates, and fatigue for what is loaded every beat, every winding or (a shaft) every turn.
- **The loads.** Its own weight, as drawn; the clock going and being wound (the pendulum's reaction at its head both
  ways, the push of the teeth at every mesh, the worms', the bevels', the barrel's pull, the maintaining detent);
  crowds of 5 kPa on every floor, stair, landing, deck and gallery, in 20 m squares, all and alternate; wind to
  EN 1991-1-4 (vb 25 m/s, terrain II: 1.90 kPa at the walls' head, 2.06 at 380 m) on the walls, the crown and the
  flat, with the inside at +0.2 or -0.3 and, the dial's glass broken, at 0.9 of the outside on the dial; the frames
  25 K warmer or colder than the ground, the walls 5 K more across where the sun is; an earthquake of 5 % of the
  weight sideways (equivalent static); and the sway imperfection of 1/200 in every combination. Warmth moves the
  meshes apart or together by at most 8.7 mm: that is the backlash the teeth are cut with.
- **The design loop** (`src/world/structure.js`). Plan the members' places, each tested for clearance at the largest
  size it may grow to; analyse; enlarge whatever is overworked within the room it was planned for; and for each
  thing that is not yet good enough (a bearing that moves too far, a crossing too lively up and down or sideways, a
  stack whose vortices would shed in step with its sway, a wall that moves too far, a frame that would buckle too
  soon) grow the groups of members that do most for it per tonne: their share of that movement (by virtual work) or
  of that mode's strain energy. A member already as big as its room allows that still buckles has the frame it
  buckles with stiffened instead. A measure that three passes of help have not improved by 1 % is stuck (passes in
  which its frame was still being stiffened against buckling do not count), and is reported, not hidden. When
  nothing more grows on the quick analysis the loop goes on with the exact one the check runs, and tries again what
  was stuck. From nothing it converges in 33 passes (of the 40 it may take; about 80 s in a background browser tab),
  with nothing stuck. The sizes it converges to are kept, in the browser and in `src/structure/design.json` for a
  first visit, tied to a fingerprint of the plan and of the loads that are not fixed
  in code; the next load starts from them and confirms them in one pass (planning 1 s, the pass 2 to 4 s, most of
  it the walls' frame solved to second order). Nothing is ever made smaller, so a seed that no longer holds is grown
  like any other start, and one for another plan is not used at all.
- **Interference.** Every structural solid (1,392) is tested against everything else: wheels, arbors, walkways,
  the engine, every drawn part with or without a collider, the members of the other frames, and the drawn surface of
  the machinery itself (112,525 points on 864 parts: every vertex, bolt and rivet), and whatever is under a floor
  wheel's rim, where its teeth will be in a moment if they are not now. The winding gear's supports are planned
  against the machinery's drawn surface too. Also the spaces that must be empty: the doorways, the headroom over every walkway and
  round the lamp. Every door leaf is swung through its whole travel, the hoist's cage and counterweight are carried
  through theirs, and a lift car right round its loop, each against everything fixed.
- **Serviceability.** The bearings: under the pendulum and the winding a bearing may move no more than 5 mm and an
  arbor's two bearings no more than 1 in 2000 across it. The pendulum's own suspension moves 4.0 mm as it swings; the
  great arbor's moves 4.6 mm while the weight is wound. Under the clock's own weight the towers move a
  long way (the third's bearing 148 mm, the minute's 91, the centre's 84), so **the bearing seats are pre-set**: each
  is set high and over by its computed movement and the wheels land on line; left to the 120 mm shim packs is a
  quarter of that, what the computation may be out by (at most 37 mm). With the preset every pair of meshing wheels
  is at its drawn centre distance (without it the great wheel and centre pinion would be 43 mm out). The walls: no
  more than L/500 out of their plane in the wind, their heads no more than H/500 along it (the worst, the back,
  247 mm of 284).
- **People walking.** Each crossing's deck is hung on rods from its trusses and braced in plan. Up and down every deck
  is above 2.6 Hz, out of what walking excites (Setra 2006). Sideways, a crowd locks in to a deck that sways between
  0.5 and 1.2 Hz, each person a negative damping of 300 Ns/m (Dallard et al. 2001, the Millennium Bridge): a deck in
  that band must not lock in under a person a square metre (Setra class I), its own damping taken as 0.5 %. The
  centre and between crossings sway at 0.61 and 0.53 Hz, so each carries a **tuned pendulum damper** under its deck
  at mid span, drawn: a steel block on four rods with two dashpots, 7.0 t tuned to 0.59 Hz and 5.8 t to 0.52 Hz
  (Den Hartog's tuning, the pair's stability by Routh–Hurwitz), sized for a quarter more people than the deck holds.
- **Line shafts.** Each winding line shaft is a frame of its own on its bearings, which stand on trestles (or a post
  where a trestle's legs will not stand) placed under its bearings, in any span too long and beside a wheel that
  overhangs too far. A shaft may sag no more than 1/1200 of a span (0.01 inch to the foot, the old rule for line
  shafting), an end no more than 1/1200 of twice its length (at worst 43 %), and is checked in rotating bending for
  a hundred million turns.
- **Wind on slender stacks.** The escape turrets (0.65 Hz) are stiff enough that their vortices would shed in step
  with their sway only above 1.25 times the strongest mean wind at their heads (EN 1991-1-4 E.1.3.1); the stack (0.21
  Hz) and the stair towers (0.27 and 0.26 Hz, in step at 49 and 48 m/s against 42 at their heads) are not, and are
  checked for it (E.1.5.2). The stack sways 23 mm. Each stair tower carries a **tuned pendulum damper** in the foot of
  its spire, drawn and in the model: a steel block on four rods 3.7 m long, with four dashpots to the rails round it,
  on a frame of girders, posts and a head (43 t) resting on the tower's top; 219 t and 243 t (2.1 and 2.4 % of the
  mode's mass), tuned to 0.26 Hz (Den Hartog), the lightest that keeps the sway's push within the wind with a
  twentieth in hand. Its damping, as a decrement (0.32 and 0.34, from the pair's response at its peak), is added to
  the structure's 0.07 (F.5): they sway 93 and 95 mm, their inertia 59 kN/m at the head against the 62 of wind they
  are designed for. Where the heaviest block that fits (301 t) would not do, the tower's steel is grown for its sway
  and the block sized again: here, from 14,500 t to 22,400 and 21,100.
- **Foundations.** One raft of reinforced concrete under the whole building, **8 m thick**. Each tower's foot on a
  pedestal sized for the concrete under its base plate: 19 of the 21 are **reinforced concrete**, two (under the
  minute tower) blocks of steel on grillages cast into the raft where no concrete pedestal would fit; feet close
  together share one. Each wall column stands on a steel grillage cast into the raft's top, 9.4 m along the wall and
  up to 7.1 m in (two neighbouring columns would share one where one alone reached too far in; none does). The
  stair towers, the turrets and the stack stand outside the raft on footings of their own (504, 246 and 449 m²). Every footing is designed for every
  combination with the moments and the push the analysis hands down: its base plate on grout with anchors round its
  edge (2,240 bars of grade 10.9, AISC Design Guide 1), the anchors' pull taken down by reinforcement (EN 1992-4),
  sliding (friction 0.2 with 1.5 in hand), punching (EN 1992-1-1 6.4.4, at worst 76 %), and the raft as a strip on
  the rock under the heaviest feet (Hetényi, 78 % of its strength at 0.5 % steel). The raft and all it carries,
  1,315,000 t, put 1.1 MPa on the rock on average and 4.0 under the worst foot; outside it, 84,300 and 82,100 t under
  the stair towers, 31,000 t under each turret and 28,400 t under the stack, 2.0 MPa at worst. The rock is taken as strong
  rock, 4.0 MPa and a modulus of 15 GPa, the feet standing on it as springs so that the analysis settles them:
  **that is a requirement of the site, to be proved by investigation**. The upright shaft whose worm pulls it up is
  held down by its weight and eight headed rods 4 m deep in the raft.
- **Ties, braces, connections.** Every girder of the walls is a horizontal tie round the building and every column
  a vertical one (EN 1991-1-7 A.5, A.6, at worst 8 %). The 554 braces and ties from frame to frame carry what the
  analysis gives them, at least 2 % of the push in what they hold, and are stiff enough to hold it (AISC 360-16
  appendix 6). Checked joints: the feet, the bearing seats on their shims, the hangers' pins, the laminations'
  stitches; the links between towers and the struts are pinned and checked as members.

`npm test` checks the solver against textbook cases: cantilevers, torsion, P-Δ, Euler buckling in several
restraints and orientations, the sparse solver against a dense one, doubled members, mechanisms, links in
compression, and load paths through assemblies.

**The wheels stand on towers.** The wheels are fabricated, bronze segments on steel centres: the great wheel 7,410 t;
the arbors and all they carry, the weight included, about 35,000 t. Under each arbor stands a tower of two A-frames of
S690QL box sections, one in the gap either side of the arbor's wheels, tied across and braced in plan wherever a
member can pass between the wheels, and their feet pinned in the frame's plane. Where a leg of one tower passes
within 8 m of a leg of another, the two are joined by a pinned link (15 of them), so the six towers are one frame.
The towers weigh **64,700 t** (escapement 1,500, pivot 11,400, third 5,400, centre 18,100, great 10,600, minute
17,700), the upright shafts 1,125 t each; their least critical load factor is 4.64. The centre arbor runs in three
bearings, the third in the boss of the dial's frame (10,500 t).

**The winding gear puts nothing on the towers but a couple.** The two worms share the weight's pull, 7.9 MN each,
pushing the rim opposite ways 18 m apart, so the arbor is turned by a couple and its bearings are asked for nothing
but the worms' end-thrust along it (2.4 MN, into the thrust collar at the front bearing). Each worm's half goes down
its own upright to the floor: the left-hand one in compression, the right-hand one in tension. Both shafts are solid
steel 1.2 m through, steadied from the great tower's front legs below and above the driving weight's fall. The teeth
also push each worm off the wheel; each upright runs in a radial bearing above and below its worm, and the four are
tied by a **yoke** in the plane of the tower's front frame, bolted over and under the front bearing, so those forces
close in it too. The uprights stretch and shorten about 4 mm under their halves: lost motion in the drive as each
winding begins, not a bearing moving. The maintaining detent, which holds the maintaining ring for the 192 s of a
winding, is a beam across the great tower's back frame below the arbor, with a pawl bolted over its face; it holds
the springs' push, 14.7 MN at the ring's teeth, and the ring pushes back on the arbor as hard, so the tower is asked
for a couple, not a force. Down the back frame's legs, which are thin where they pass between the wheels, that couple
would rock the tower's head; so the back frame has a **head beam** over the arbor, 1.6 m deep, carrying the bearing's
pillow block, and two struts 1.6 by 0.9 m from its middle down to the detent's ends, clear of all that turns: the
couple closes in that triangle, and the great bearing moves 4.6 mm while the weight is wound.

**The shell is a braced steel frame with brick between.** Columns every 10 m, a girder at every 30 m level carrying
the storey of brick above it and a shelf for the storey of stone in front, so that no brick or stone carries more
than one storey of itself (0.8 and 1.0 MPa). The brick panels are **diaphragm walls**: 2 m overall as drawn, two
450 mm leaves joined by 330 mm cross-ribs every 1.5 m; the wind check bends them with that real section. Half way up
each storey (or near it) a horizontal wind truss runs round the inside of the walls, and one more at the wall head:
34 trusses, 640 members, each tested for clearance, carrying the wind on a wall to the walls either side of it. A
steel ring as wide as the wall carries the front over the dial. Over the attic the **crown**: a steel post on every
column head, a ring at the eaves, a two-tier truss across on every column line, rafters, hips, purlins and a girder
round the slopes. The stair towers and escape turrets are steel frames of their own, carrying their brick storey by
storey and braced to the walls and the crown; the stack stands free on its own footing. Steel: the walls' frames
204,500 t, their wind trusses 19,200 t, the crown 26,400 t, the stair towers 22,400 and 21,100 t (with their dampers'
frames, 43 t each), the turrets 5,700 t each, the stack 1,800 t. With 199,000 t of stone on the faces and the brick,
the building puts 1,315,000 t on the rock under the raft.

**The hoist is in the model.** Its hoistway is a frame of its own: corner posts and the guides, with a beam across
the well at every storey carrying the fence, the guides and the landing gates. The sheaves' beams in the sheave room
carry each sheave with both falls of its rope, the cage loaded or the counterweight; the left tower's tank is on beams
in its stage. These rest on the stair towers' frames. The drum and the engine stand on stone beds on the tower's floor.

**Does it go?** The check also draws up a power budget. The driving weight's fall is all the power the going
train has: 27 kW. Turning the wheels takes 8.3 kW in the arbors' bearings and 2.5 kW in the teeth; winding the
remontoire takes 0.4 kW, of which 0.3 kW is all that ever reaches the pendulum; the brake takes the other 16 kW.
The weight is sized for the wind on the hands; in still air that margin is what the brake throws away. That is with
roller bearings (friction 0.003). In plain oiled journals, at these loads and this slowly, the friction would be
thirty times that and the clock would stop.

**Assumptions** worth knowing, since they decide sizes: the towers' feet are pinned in their frames' plane; a link between two towers' legs is a pinned 0.8 m box, used where the legs are within
8 m; an escape stair stands on its own columns, its bearers sliding in pockets in the turret's wall, so it hands the
turret only its sideways push; a crowd on a deck is a person a square metre, 70 kg each, and the deck's own damping
0.5 %; a line shaft turns a hundred million times in its life; the driving weight's crib is oak baulks crushing at
5 MPa; a frame resting on another (a stair, a walkway) is held only in the ways its seat holds it; the crossings
hang on vertical rods; the earthquake is 5 % of the weight; the rock is strong rock.

Not covered: fire, erection, a wind-tunnel test (a building this size wants one), and one moving part against
another except where it is said to be (the detent against what turns past it, the escapement's legs and stops, a
lift car round its loop, the hoist's cage and counterweight over their travel, every door leaf through its swing).
The stairs and galleries in the hall, the lift cage and the pendulum landings are drawn by tower.js but are not in
the model; the stairs in the stair towers and the turrets are, their bearers and stringers members of their frames.

## What is not right yet

The aim is a clock a clockmaker and an engineer would sign. It is not there, and these are the things each would
still send back. They are as it stands, not hidden by the check passing.

The clock:

- **The two worms are not equalised.** Each is meant to take half the weight's pull at the winding wheel's rim;
  nothing shares it between them as they wear.
- **The maintaining springs stop at 90 %** of the weight's drive, the stops taking the last tenth so that they stay
  pressed home; while a winding lasts that leaves the wind on the hands less than the weight leaves it, and in a gale
  a winding can hold the hands back.
- **Drawn or modelled only in part:** the clutch's trip is described as timed to the clicks but is not simulated;
  the 50 mm buffer behind the escapement's stops is assumed, not drawn; the brake's magnets have no carriage to set
  them by; there is no landing from which to reach the pendulum's rating tray; the crib that would catch the weight
  is checked for the energy, but its blow is not a load on the floor.
- **Temperature.** The suspension leaves leave an error of about 0.22 s a day per degree that nothing compensates.

The structure:

- **The stair towers' dampers** are tuned to the towers as computed; a real one is tuned on the built tower, and its
  dashpots are taken as linear. Strakes, which would cost the spire its outline, were not tried.
- **Laminated plate.** The heaviest members are built of up to five plies of 100 mm. Each ply, and the net section
  through the stitches, is checked; that the plies act as one, the preloaded stitches never slipping under the shear
  between them, is assumed.
- **Connections** other than the feet, the bearing seats, the hangers' pins and the stitches are taken as full
  strength, not designed. The loss of a hanger or a wall column has not been analysed.
- **The earthquake** is 5 % of the weight as a static force, not a site's spectrum, and the wind is the code's
  where a building this size wants a wind tunnel.
- **The raft** is checked as a strip on the rock under its heaviest feet (78 % of its strength), not as a plate, and
  the worst foot puts on the rock exactly the 4.0 MPa it is assumed to take.
- And what is listed above as not covered: fire, erection, and the hall's stairs and galleries, the lift cage and the
  pendulum landings, which are drawn but not in the model.

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
    masses.js         what solid parts weigh, from the dimensions they are drawn with (the fabricated wheels are weighed in clockwork.js)
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
