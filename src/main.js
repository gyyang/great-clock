import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createEnv } from './world/env.js';
import { initKit, flushBatches, MAT, G, DRAWN } from './kit.js';
import { buildTower } from './world/tower.js';
import { buildStructure, structuralCheck } from './world/structure.js';
import { buildCity } from './world/city.js';
import { buildFacade } from './world/facade.js';
import { buildDoors } from './world/doors.js';
import { buildHoist } from './world/hoist.js';
import { buildProps } from './world/props.js';
import { buildPlaques } from './world/plaques.js';
import { buildClockwork } from './clock/clockwork.js';
import { buildEngine } from './engine/engine.js';
import { Player } from './player.js';
import { Sound } from './audio.js';
import { GRAV, BRIDGES, FLOOR, bobLanding, LIFT, ARCH, LAMP } from './layout.js';

const DT = 1 / 120;                       // fixed physics step
const $ = (id) => document.getElementById(id);
const face = (dx, dz) => Math.atan2(-dx, -dz);   // yaw that looks along (dx, dz)

async function main() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -GRAV, z: 0 });
  world.timestep = DT;

  const canvas = $('view');
  const env = createEnv(canvas);
  initKit(env.scene, world, RAPIER, env.renderer);
  buildTower();
  buildFacade();
  const doors = buildDoors();
  const city = buildCity();
  const clock = buildClockwork();
  const before = new Set(); world.colliders.forEach(c => before.add(c.handle));
  const engine = buildEngine(clock, env.scene);
  world.colliders.forEach(c => { if (!before.has(c.handle)) G.machineFixed.add(c.handle); });       // the engine is machinery: its parts bear on one another by design
  const hoist = buildHoist(engine);
  const structure = buildStructure();
  const plaques = buildPlaques({ clock, engine, hoist });      // after the structure is planned, so they do not change it; checked with everything else
  const props = buildProps(clock.floor);
  flushBatches();
  // everything solid both casts and receives the dial light's shadows
  env.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m.isMeshStandardMaterial || m === MAT.dial || m === MAT.ground || m.userData.outdoor) return;   // the town is outside the dial light's reach
    o.castShadow = true; o.receiveShadow = true;
  });

  const bl = bobLanding();
  const SPOTS = [
    { name: 'The floor', p: [12, 0.95, -29], yaw: face(-0.45, 1), pitch: 0.22 },
    { name: 'The pendulum landing', p: [bl.x + 4.5, bl.y + 1.1, -10], yaw: face(-1, 0), pitch: 0.05 },
    { name: 'The escapement', p: [9.5, BRIDGES.escapement.y + 0.95, (BRIDGES.escapement.z0 + BRIDGES.escapement.z1) / 2], yaw: face(-1, 0.2), pitch: 0.1 },     // on the catwalk beside it
    { name: 'Between the wheels', p: [-34, BRIDGES.between.y + 0.95, 17.3], yaw: face(1, 0.05), pitch: 0.2 },
    { name: 'Behind the dial', p: [-38, BRIDGES.balcony.y + 0.95, 37.3], yaw: face(1, 0.3), pitch: 0.55 },
    { name: 'The engine', p: [FLOOR.h3.x + 9.5, 0.95, FLOOR.h3.z - 14.5], yaw: face(-1, 0.42), pitch: 0.22 },
    { name: 'The winding gear', p: [-12, 0.95, 38], yaw: face(-0.75, -0.6), pitch: 0.25 },
    { name: 'The square', p: [34, 0.95, 118], yaw: face(-0.4, -1), pitch: 0.78 },
    { name: 'Across the river', p: [-190, 0.95, 420], yaw: face(0.5, -1), pitch: 0.42 },
    { name: 'The attic', p: [-24, ARCH.cornice + 0.95, 36.2], yaw: face(0.55, 0.45), pitch: 0.12 },
    { name: 'The lamp room', p: [-16, ARCH.flat + LAMP.drum + 0.95, 9], yaw: face(1, -0.55), pitch: 0.04 },
  ];
  const player = new Player(SPOTS[0]);
  const sound = new Sound();

  // ---- the clock speaks
  let shake = 0;
  const near = () => {
    const p = player.position, e = clock.escapement;
    return THREE.MathUtils.clamp(1.25 - Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z) / 170, 0.4, 1);
  };
  clock.on('release', () => sound.release(near()));
  clock.on('impact', (n) => { const v = near() * (1 - outside * 0.5); sound.tock(n % 2 === 0, v); shake = Math.max(shake, 0.5 * v); if (player.grounded) player.dipV -= 0.3 * v; });
  clock.on('hour', () => engine.whistle(2.4));        // the engine's whistle marks the hour. (There is no striking train yet, so nothing strikes.)
  // ---- the engine speaks
  let ventOpen = false;
  const engineVol = () => engine.loudness(player.position) * (1 - outside * 0.6);
  engine.on('chuff', (strength) => sound.chuff(strength * engineVol()));
  engine.on('vent', (open) => { ventOpen = open; });
  engine.on('whistle', (seconds) => sound.whistle(seconds, engineVol()));
  engine.on('regulator', () => sound.clunk(1));
  hoist.on('bell', () => sound.clunk(0.7));         // the hand rope's catch, and the brake going on
  player.onStep = (s) => sound.step(s);
  player.onLand = (v) => { sound.land(v); shake = Math.max(shake, Math.min(1, v / 25)); };

  // ---- input
  const overlay = $('overlay'), enter = $('enter'), toast = $('toast'), hint = $('hint');
  const shots = new URLSearchParams(location.search).has('shots');
  let toastTimer = 0;
  const say = (text) => { toast.textContent = text; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); };
  const go = (i) => { const s = SPOTS[i]; player.teleport(s.p, s.yaw, s.pitch); say(s.name); };

  let dragging = false;
  const locked = () => document.pointerLockElement === canvas;
  const begin = () => {
    sound.start(); overlay.classList.add('hidden');
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* drag-to-look still works */ }
  };
  enter.addEventListener('click', begin);
  canvas.addEventListener('mousedown', () => { dragging = true; if (!locked()) begin(); });
  window.addEventListener('mouseup', () => { dragging = false; });
  document.addEventListener('pointerlockchange', () => { if (!locked() && !shots) { overlay.classList.remove('hidden'); enter.textContent = 'Return to the tower'; player.keys.clear(); plaques.close(); } });
  window.addEventListener('mousemove', (e) => {
    if (!locked() && !dragging) return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * 0.0022, -1.54, 1.54);
  });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    player.keys.add(e.code);
    if (e.code === 'Space') { player.jumpBuf = 0.15; e.preventDefault(); }
    if (e.code === 'KeyR') go(0);
    if (e.code === 'KeyM') say(sound.toggleMute() ? 'Muted' : 'Sound on');
    if (e.code === 'KeyQ') { autoQuality = false; say(['Detail: low', 'Detail: medium', 'Detail: high'][env.setQuality((env.quality + 2) % 3)]); }
    if (e.code === 'KeyL') say(env.toggleLantern() ? 'Lantern lit' : 'Lantern out');
    if (e.code === 'KeyE') { const done = engine.use(player.position) || hoist.use(player.position); if (done) { say(done); plaques.close(); } else plaques.use(player.position, player.yaw); }
    if (e.code === 'Escape') plaques.close();
    if (/^Digit[1-9]$/.test(e.code)) go(+e.code.slice(5) - 1);
    if (e.code === 'Digit0') go(9);
    if (e.code === 'Minus') go(10);
  });
  window.addEventListener('keyup', (e) => player.keys.delete(e.code));
  window.addEventListener('blur', () => player.keys.clear());
  // the simulation sleeps while the tab is hidden; set the clock right again on return
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); clock.resync(); } });

  // ---- HUD
  const hudTime = $('hud-time'), hudAlt = $('hud-alt'), hudWhere = $('hud-where'), hudEngine = $('hud-engine');
  const pad = (n) => String(n).padStart(2, '0');
  function hud() {
    const s = clock.seconds(), h = Math.floor(s / 3600) % 12 || 12;
    hudTime.textContent = `${h}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)} by the mechanism`;
    hudAlt.textContent = `${Math.max(0, player.feet).toFixed(0)} m up`;
    hudWhere.textContent = player.speed > 12 && !player.grounded ? `${(player.speed * 3.6).toFixed(0)} km/h` : (player.slip > 0.6 ? 'losing grip' : '');
    hudWhere.style.display = hudWhere.textContent ? '' : 'none';
    const run = engine.readout(player.position);
    hudEngine.textContent = run && `${run} · ${clock.status()}`;
    hudEngine.style.display = hudEngine.textContent ? '' : 'none';
    const pp = player.position, atLift = pp.x > LIFT.x0 - 1.5 && pp.x < LIFT.x1 + 1.5 && pp.z > LIFT.z0 - 2.6 && pp.z < LIFT.z1 + 2.6;
    const h2 = engine.hint(player.position) || hoist.hint(player.position) || (atLift ? 'The lift never stops. Step on as a deck comes up to the floor (left side up, right side down); going down, step off just before your landing' : '') || plaques.hint(player.position, player.yaw);
    plaques.update(player.position);
    if (hint.textContent !== h2) hint.textContent = h2;
    hint.classList.toggle('show', !!h2);
  }

  // ---- loop
  let last = performance.now(), acc = 0, hudT = 0, outside = 0, fov = 75, autoQuality = true, slow = 0, warm = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 14) {
      clock.update(DT);
      engine.update(DT);
      hoist.update(DT);
      props.step();
      player.step(DT);
      doors.update(DT, player.position);
      world.step();
      acc -= DT; steps++;
    }
    if (steps === 14) acc = 0;
    const p = player.position;
    if (p.y < -60 || !Number.isFinite(p.y) || player.speed > 400) go(0);
    else if (clock.caught(p)) { go(0); say('Caught in the wheels'); sound.land(30); shake = 1; }

    player.updateCamera(env.camera, dt);
    shake = Math.max(0, shake - dt * 1.8);
    if (shake > 0.001) {
      const a = shake * shake * 0.012;
      env.camera.rotation.x += (Math.random() - 0.5) * a; env.camera.rotation.y += (Math.random() - 0.5) * a;
      env.camera.position.y += (Math.random() - 0.5) * a * 2;
    }
    const wantFov = 75 + THREE.MathUtils.clamp((player.speed - 9) / 40, 0, 1) * 17;
    fov += (wantFov - fov) * Math.min(1, dt * 4);
    if (Math.abs(env.camera.fov - fov) > 0.01) { env.camera.fov = fov; env.camera.updateProjectionMatrix(); }

    // if the machine can't hold ~40 fps, step the detail down rather than stutter
    warm += dt;
    if (autoQuality && warm > 4 && !document.hidden) {
      slow = dt > 1 / 38 ? slow + dt : Math.max(0, slow - dt * 2);
      if (slow > 2.5 && env.quality > 0) { env.setQuality(env.quality - 1); slow = 0; warm = 1; }
    }
    outside = env.update(dt, p);
    engine.frame(dt);
    hoist.frame(dt);
    props.sync();
    sound.setWind(player.speed, outside);
    sound.setHiss(ventOpen ? engineVol() : 0);
    hudT += dt; if (hudT > 0.2) { hudT = 0; hud(); }
    env.render();
    requestAnimationFrame(frame);
  }

  enter.disabled = false; enter.textContent = 'Enter the tower';
  if (shots) overlay.style.display = 'none';
  hud();
  requestAnimationFrame(frame);

  // handy from the console
  window.__game = { G, DRAWN, RAPIER, player, clock, engine, props, env, world, sound, go, SPOTS, city, structure, doors, hoist, plaques, check: structuralCheck,
    advance: (sec) => { for (let i = 0; i < sec / DT; i++) { clock.update(DT); engine.update(DT); hoist.update(DT); props.step(); player.step(DT); doors.update(DT, player.position); world.step(); } hoist.frame(sec); }, look: (yaw, pitch) => { player.yaw = yaw; player.pitch = pitch; },
    // stand at p, look along (yaw, pitch) and draw one frame: for screenshots while the page is in the background
    shot: (p, yaw, pitch = 0) => {
      player.teleport(p, yaw, pitch); player.updateCamera(env.camera, 0.016);
      for (let i = 0; i < 40; i++) env.update(0.1, player.position);
      engine.frame(0.016); hoist.frame(0.016); props.sync(); env.render();
    } };
}

main().catch((err) => {
  console.error(err);
  const b = document.getElementById('enter'); if (b) b.textContent = 'Failed to start — see console';
});
