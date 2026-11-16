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
- **It stands up** – everything has a path to the ground, sized for its span. The wheels' arbors sit in pillow blocks on plate girders that bear on padstones in the side walls and, since nothing that shallow spans 140 m, hang every 8.75 m on tie rods from the roof purlins. The crossings are lattice girders (their parapets) hung the same way, or from an arbor girder where one runs overhead. Each flight of stairs rests every eight metres on a cantilever from the back wall, tied back from above low down and braced from below higher up. A rod is only placed where the line straight up from it is clear of every wheel: the builder casts rays through the physics world to check (`buildStructure` in `src/world/tower.js`).
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
    tower.js          the building: shell, galleries, stairs, bridges, the frame
    city.js           the town outside, generated from a seed
    props.js          loose crates, barrels and shot
    env.js            renderer, light, shadow, haze, sky
    post.js           ambient occlusion, light shafts, bloom, film grade
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
