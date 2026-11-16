# The Great Clock

You are a 1.8 m person inside a working, steam-driven tower clock the size of a dam
(240 m tall hall, 110 m dial; the Hoover Dam is 221 m).

```bash
npm install
npm run dev
```

Then open the URL it prints.

## Controls

| Key | Action |
| --- | --- |
| W A S D / mouse | walk / look |
| Shift | run |
| Space | jump |
| E | use what is in reach: the engine's regulator lever, the whistle chain |
| 1 – 7 | fast travel: floor, pendulum landing, escapement, between the wheels, behind the dial, the ledge, the engine |
| R | back to the floor |
| M | mute |
| L | light or put out your lantern |
| Q | detail level (it also steps down by itself if the frame rate drops) |

## What is real

- **Pendulum** – integrated as `θ'' = -(g/L)·sin θ`. At 99 m long it has a 20 s period, so the clock beats every 10 s.
- **Escapement** – an anchor releases one tooth of the 30-tooth escape wheel per beat and gives the pendulum back the energy it lost; the wheel recoils as the pallet digs in.
- **Gear train** – every wheel's angle is derived from the escape wheel through its tooth counts (escape → third → centre → great wheel; cannon pinion → minute wheel → hour wheel, 12:1). The hands show your local time because the train drives them.
- **Steam engine** – a double-acting cylinder on a slider-crank. Steam is admitted for the first 40 % of each stroke and then expands; the crank torque follows from the linkage geometry and works against the load of the floor train and a 12 000 t·m² flywheel. It takes about forty seconds to run up from rest and twenty to coast down. The engine's speed *is* the speed of the floor wheels.
- **Governor** – flyballs lifted by centrifugal force against gravity throttle the steam, holding 11.5 rev/min. Watch them bob with each stroke.
- **Boiler** – pressure falls as the engine draws steam and recovers as the fire catches up; shut the regulator and the safety valve lifts at 6 bar.
- **You** – a dynamic rigid body (Rapier). Your feet can only push with friction (μ·g), which is also all that holds you on a turning gear: stand too far out on the flywheel and it throws you. Falling has air drag (terminal ≈ 55 m/s).
- **Lifts** – the paternoster platforms move one storey on every beat.
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

### Things to try

The regulator (key 7, then walk up to the lever) has four notches: shut, half, full, and full with the
governor tied down. At half you can stand anywhere on the flywheel. With the governor tied down the
engine runs away to about 16 rev/min and the flywheel will not keep you past a few metres from its centre.
Push a crate onto the flywheel: it rides at the governed speed and is flung across the hall when the engine runs away.

Stand at the rim of the great floor wheel and let a tooth catch you. Push a barrel into its teeth, or
leave a crate where the pendulum's rating nut sweeps the floor.

## Does it stand up?

By calculation, yes, and the game can check itself. The aim is a building that could actually be built.

As each part is drawn it also declares what it is structurally: its members with their real sections and materials,
the masses it carries, and what it rests on. `__game.check()` in the browser console then does an engineer's load
take-down over the whole scene: it solves each assembly as a 3-D frame by the stiffness method
(`src/structure/solve.js`), drops any tie that would have to push, checks every member for stress and buckling, and
hands the reactions down to whatever carries that assembly, ending at the ground. It reports, per assembly, whether
it holds, the member working hardest and by what factor, or the point at which it is attached to nothing. It then
tests every structural solid for interference: nothing that carries load may occupy the same space as a wheel, an
arbor, a walkway or the engine. `npm test` checks the solver against textbook cases.

The structure is designed by the same analysis that checks it (`src/world/structure.js`): declare, analyse, enlarge
whatever is overworked, repeat until everything holds, and only then draw. So the sizes are the ones the loads asked for.

**The wheels stand on the floor.** They are solid brass castings and weigh what that weighs: the great wheel
17,000 t, the going train about 84,000 t with its arbors, pendulum and driving weight. Under each bearing stands an
A-frame of alloy-steel box sections (450 MPa working stress), in the gap between two layers of wheels, and the two
frames of each arbor are strutted together wherever a strut can pass between the wheels: one braced tower per arbor.
Where a member would foul a wheel, a walkway, the swing of the pendulum or the fall of the driving weight it is left
out (found by casting rays through the physics world), and what remains is sized for the frame that is actually
there. Clearance is tested three ways: rays for whatever stands in the line of a member, a box the size of the member
for things too thin for a ray, and the disc each wheel sweeps as it turns, so that a gap between teeth is never
mistaken for room. A leg is up to 3 m thick where there is room and thins to a blade between wheels; where the
floor wheels take the ground on one side, both legs stand on the other. Each stands on a small pedestal; the
foundation proper is one raft under the whole building. The six towers weigh about 46,000 t; the heaviest is the
one under the great wheel, because its bracing leaves a shaft open for the driving weight to fall through.

**The shell is a steel frame with brick between.** Brick cannot carry 240 m of itself (5 MPa at the foot against
the 2 MPa it is good for). So columns stand every 10 m in each wall and a girder runs round at every 30 m level;
each girder carries the panel of brick above it, and no brick holds up more than its own 30 m (0.6 MPa). The
girders are as wide as the wall is thick and span sideways to the side walls against the wind; diagonal bracing in
every bay takes it down to the ground; a steel ring carries the front wall over the dial. Long spans (roof trusses,
crossings) have one fixed bearing and one free to slide, so they do not push the walls apart. The frame shows
indoors. Outdoors it is dressed in stone, as a tall building's frame is (`src/world/facade.js`): every column line a
pier running unbroken from plinth to cornice, every girder a string course, the bracing hidden in the brick. The
dial fills a square stone panel between two giant piers; above the cornice come a lit attic, a steep copper roof,
a lantern and a gilded spire, and each corner has a domed stair turret on a steel core of its own.

**The roof** carries only itself and the walkways, which hang from it on carbon-fibre rods.

In round numbers the ground carries 714,000 t (0.6 MPa under the raft): about 390,000 t of brick, 118,000 t of
steel in the shell frame, 84,000 t of clock, 46,000 t of towers, 23,000 t of crown, and the turrets. Most of that is the brick, because the panels are drawn 2 m thick; a
real design would make them a quarter of that with intermediate rails, and the frame would shrink with them.

What the check does not cover, and a real design would need: wind from the side and on the towers, earthquake,
fatigue, the connections, the raft itself, and how any of it would be erected. The interference test looks at the
moving parts where they stand when it is run. Stairs, galleries,
the lift cage, the pendulum landings and the ledge outside are not in the model yet.

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
    tower.js          the building: shell, galleries, stairs, crossings
    structure.js      the engineer: plans the towers and the shell frame, sizes them by analysis, draws them
    facade.js         the outside: piers, the clock panel, corner turrets, attic, roof, lantern and spire
    city.js           the town outside, generated from a seed
    props.js          loose crates, barrels and shot
    env.js            renderer, light, shadow, haze, sky
    post.js           ambient occlusion, light shafts, bloom, film grade
  structure/
    solve.js          3-D frame analysis by the direct stiffness method: numbers only
    model.js          materials, sections, assemblies and the load take-down run over them
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
