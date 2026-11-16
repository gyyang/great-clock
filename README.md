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

### Things to try

The regulator (key 7, then walk up to the lever) has four notches: shut, half, full, and full with the
governor tied down. At half you can stand anywhere on the flywheel. With the governor tied down the
engine runs away to about 16 rev/min and the flywheel will not keep you past a few metres from its centre.
The three crates riding the flywheel stay put at the governed speed and are flung across the hall when it runs away.

Stand at the rim of the great floor wheel and let a tooth catch you. Push a barrel into its teeth. Wait by
the crate stack under the pendulum for the next swing.

## Layout

```
index.html            page, overlay, HUD
src/
  main.js             start-up, input, HUD, the fixed-step loop
  layout.js           every dimension, in metres
  kit.js              materials, procedural textures, instanced primitives, walkways and rails
  player.js           the character's physics
  audio.js            all sound, synthesised
  world/
    tower.js          the building and the city outside
    props.js          loose crates, barrels and shot
    env.js            renderer, light, shadow, haze, sky, post-processing
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
(`__game.advance(seconds)` fast-forwards the simulation).
