// The engineer. Carries the going train and the walkways to the walls, sizing every
// member by analysis and drawing it at the size the analysis arrived at.
//
// The wheels are solid brass and weigh what that weighs: about 84,000 tonnes with their
// arbors, the pendulum and the driving weight. Nothing of the 1890s holds that up across
// a 140 m hall, so what carries them is modern: alloy steel for anything that bends or is
// squeezed, carbon-fibre tendons for anything that hangs.
//
// The scheme, from the wheel down:
//   - an arbor rests in two bearings;
//   - each bearing sits on a plate girder, and right beside it, either side, a tendon
//     goes straight up to the roof (found by casting rays up through the physics world
//     until a line clears every wheel). The girder only has to carry the bearing the few
//     metres between its two tendons; lighter rods hold up the rest of its length;
//   - each tendon hangs from a box purlin of its own, spanning between two roof trusses;
//   - the trusses take it to the walls.
// designLoop() declares all of that to the structural model, runs the analysis, enlarges
// whatever is overworked and repeats until everything holds. Only then is it drawn.
import { G, ibox, icyl, iknob, cbox, sbox, beam, tube } from '../kit.js';
import { TOWER, ARBOR, SHAFT, ROOF } from '../layout.js';
import { assembly, redeclare, analyse, report, SECTION, MATERIAL, GRAVITY } from '../structure/model.js';

export const EDGES = [];            // edges of crossings that want hanging: { name, y, yc, z }, filled by tower.js
const ALLOY = MATERIAL.alloy, TENDON = MATERIAL.tendon;
const TRUSS_Z = [-32, -16, 0, 16, 32];
const snap = (x) => Math.round(x * 4) / 4;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// hollow box sections, proportioned alike so that one number sizes them
const boxOf = (h) => SECTION.box(h, 0.7 * h, h / 12);
const girderOf = (h, w) => SECTION.I(h, w, h / 9, h / 11);

let girders = [], lines = [], hung = [], sizes = new Map(), passes = 0;

export function buildStructure() {
  G.world.step();                                    // lets the ray casts below see every collider made so far
  const R = G.R, hx = TOWER.hx, hz = TOWER.hz;
  // Can a tendon rise from here to the roof? Several rays, spread wider than a tooth,
  // because a tooth that is clear now will not be in a minute.
  const clear = (x, y, z) => {
    for (const dx of [0, -0.7, 0.7, -1.4, 1.4]) for (const dz of [0, -0.25, 0.25])
      if (G.world.castRay(new R.Ray({ x: x + dx, y: y + 0.05, z: z + dz }, { x: 0, y: 1, z: 0 }), ROOF.at(x) - y, true)) return false;
    return true;
  };

  // ---- 1. what each bearing carries (statics of the arbor), and where its tendons can go
  girders = [];
  for (const [name, sh] of Object.entries(SHAFT)) {
    const a = ARBOR[name], A = assembly(`arbor ${name}`), [z1, z2] = sh.bearings;
    let W = Math.PI * sh.r ** 2 * (sh.z[1] - sh.z[0]) * ALLOY.rho, M = W * ((sh.z[0] + sh.z[1]) / 2 - z1);
    for (const q of A.masses) { W += q.kg; M += q.kg * (A.nodes[q.n].p[2] - z1); }
    const R2 = M / (z2 - z1), R1 = W - R2;
    sh.bearings.forEach((z, i) => {
      const w = name === 'third' && z > 10 ? 0.8 : 1.0, top = a.y - sh.r - 0.2, load = Math.abs(i ? R2 : R1) * GRAVITY;
      let left = null, right = null;
      for (let d = sh.r + 1.5; d <= 14 && (left === null || right === null); d += 0.25) {
        if (left === null && clear(snap(a.x - d), top, z)) left = snap(a.x - d);
        if (right === null && clear(snap(a.x + d), top, z)) right = snap(a.x + d);
      }
      const both = left !== null && right !== null, span = both ? right - left : 1;
      const yoke = [left, right].filter(x => x !== null).map(x => ({ x, r: Math.max(0.06, Math.sqrt(load * (both ? 1 - Math.abs(x - a.x) / span : 1) / (0.7 * TENDON.f) / Math.PI)) }));
      const rods = ROOF.purlins.filter(x => (x < (left ?? a.x) - 6 || x > (right ?? a.x) + 6) && clear(x, top, z));
      girders.push({ name: `girder ${name} ${z}`, a, r: sh.r, z, w, top, load, yoke, rods, under: [] });
    });
  }
  // ---- 2. where the walkways' rods can go: to the roof, or to a girder that runs overhead
  hung = [];
  for (const e of EDGES) for (const x of ROOF.purlins) {
    const over = girders.find(g => Math.abs(g.z - e.z) < g.w / 2 + 0.1 && g.top > e.y + 2);
    if (over) {                                       // rays from just under the girder, down, would be the same test: use the upward one to its underside
      let blocked = false;
      for (const dx of [0, -0.7, 0.7]) if (G.world.castRay(new R.Ray({ x: x + dx, y: e.y + 0.05, z: e.z }, { x: 0, y: 1, z: 0 }), over.top - 3 - e.y, true)) blocked = true;
      if (!blocked) { over.under.push({ x, e }); assembly(e.name).rest([x, e.yc, e.z], over.name); hung.push({ x, e, over }); }
    } else if (clear(x, e.y, e.z)) {
      assembly(e.name).member([x, e.yc, e.z], [x, ROOF.at(x), e.z], SECTION.round(0.03), TENDON, 'tie', 'hanger').rest([x, ROOF.at(x), e.z], `purlin ${x}`);
      hung.push({ x, e, over: null });
    }
  }
  // ---- 3. the roof lines: a regular purlin every 8.75 m, and one under the head of every tendon
  lines = ROOF.purlins.map(x => ({ x, crown: false }));
  for (const g of girders) for (const y of g.yoke) { const near = lines.find(l => Math.abs(l.x - y.x) < 0.3); if (near) { y.x = near.x; near.crown = true; } else lines.push({ x: y.x, crown: true }); }
  lines.sort((p, q) => p.x - q.x);

  designLoop();
  draw();
  return { rods: hung.length + girders.reduce((n, g) => n + g.yoke.length + g.rods.length, 0), passes, sizes: Object.fromEntries([...sizes].map(([k, v]) => [k, +v.toFixed(2)])) };
}

// The size of one group of members: remembered between passes, enlarged when overworked.
const size = (key, start) => { if (!sizes.has(key)) sizes.set(key, start); return sizes.get(key); };

// Declares girders, tendons, purlins and trusses at their present sizes. With `out`, also
// lists what to draw.
function declare(out = null) {
  const hx = TOWER.hx, hz = TOWER.hz, top = ROOF.at, y0 = ROOF.eaves;
  const put = (A, a, b, h, w, section, material, kind, label) => { A.member(a, b, section, material, kind, label); if (out) out.push({ a, b, h, w, kind, label }); };
  for (const g of girders) {
    const A = redeclare(g.name, 'plate girder under a bearing, hung on a tendon either side of it');
    const h = size(`${g.name}|girder`, 1.6), yc = g.top - h / 2; g.h = h; g.yc = yc;
    A.member([-hx, yc, g.z], [hx, yc, g.z], girderOf(h, g.w), ALLOY, 'beam', 'girder')
      .member([g.a.x, yc, g.z], [g.a.x, g.a.y, g.z], SECTION.box(2 * g.r + 1.2, 1.2 * g.w, 0.3), ALLOY, 'strut', 'pillow block')
      .rest([-hx, yc, g.z], 'wall').rest([hx, yc, g.z], 'wall');
    const k = size(`${g.name}|tendon`, 1), kr = size(`${g.name}|rod`, 1);
    for (const y of g.yoke) put(A, [y.x, yc, g.z], [y.x, top(y.x), g.z], y.r * k, y.r * k, SECTION.round(y.r * k), TENDON, 'tie', 'tendon'), A.rest([y.x, top(y.x), g.z], `purlin ${y.x}`);
    for (const x of g.rods) put(A, [x, yc, g.z], [x, top(x), g.z], 0.05 * kr, 0.05 * kr, SECTION.round(0.05 * kr), TENDON, 'tie', 'rod'), A.rest([x, top(x), g.z], `purlin ${x}`);
    for (const u of g.under) {                                                             // a walkway hung from this girder; the walkway itself keeps the hanger's foot from swinging
      put(A, [u.x, yc, g.z], [u.x, u.e.yc, u.e.z], 0.03, 0.03, SECTION.round(0.03), TENDON, 'tie', 'hanger');
      A.brace([u.x, u.e.yc, u.e.z], 'x').brace([u.x, u.e.yc, u.e.z], 'z');
    }
  }
  for (const l of lines) {
    const A = redeclare(`purlin ${l.x}`, l.crown ? 'box purlin under the head of a tendon' : 'purlin'), y = top(l.x);
    const h = size(`purlin ${l.x}|purlin`, l.crown ? 1.2 : 0.5); l.h = h;
    A.member([l.x, y, -hz], [l.x, y, hz], boxOf(h), ALLOY, 'beam', 'purlin');
    for (const z of TRUSS_Z) A.rest([l.x, y, z], `roof truss ${z}`);
    A.rest([l.x, y, -hz], 'wall').rest([l.x, y, hz], 'wall');
  }
  const xs = [...new Set([-hx, ...lines.map(l => l.x), 0, hx])].sort((p, q) => p - q);
  for (const z of TRUSS_Z) {
    const name = `roof truss ${z}`, A = redeclare(name, 'spans the hall, wall to wall'), S = (label, start) => size(`${name}|${label}`, start);
    const bar = (a, b, label, start) => { const h = S(label, start); put(A, a, b, h, 0.7 * h, boxOf(h), ALLOY, 'beam', label); };
    bar([-hx, y0, z], [hx, y0, z], 'bottom chord', 0.9);
    bar([-hx, y0, z], [0, ROOF.ridge, z], 'rafter', 0.9); bar([hx, y0, z], [0, ROOF.ridge, z], 'rafter', 0.9);
    for (let i = 1; i < xs.length - 1; i++) {
      bar([xs[i], y0, z], [xs[i], top(xs[i]), z], 'post', 0.4);
      const j = xs[i] < 0 ? i + 1 : i - 1;
      if (xs[i] !== 0) bar([xs[i], y0, z], [xs[j], top(xs[j]), z], 'diagonal', 0.4);
      A.brace([xs[i], top(xs[i]), z], 'z');                                            // the purlins keep it upright
    }
    A.rest([-hx, y0, z], 'wall').rest([hx, y0, z], 'wall');
  }
}

// Declare, analyse, enlarge what is overworked, and again, until it all holds.
function designLoop() {
  for (passes = 1; passes <= 14; passes++) {
    declare();
    const res = analyse();
    let grew = false;
    for (const row of res.rows) for (const [label, u] of Object.entries(row.byLabel || {})) {
      const key = `${row.name}|${label}`;
      if (!sizes.has(key) || !(u > 0.92)) continue;
      // a rod's strength goes with its diameter squared; a box's or a girder's in bending nearer its depth cubed
      sizes.set(key, sizes.get(key) * clamp(Math.pow(u / 0.8, label === 'tendon' || label === 'rod' ? 0.5 : 0.4), 1.05, 3));
      grew = true;
    }
    if (!grew) break;
  }
}

function draw() {
  const hx = TOWER.hx, out = [];
  declare(out);
  for (const m of out) {
    if (m.kind === 'tie') {                                               // tendon or rod, with a socket at each end and a turnbuckle
      tube('tendon', m.a, m.b, m.h);
      iknob('steel', m.h * 1.9, ...m.a); iknob('steel', m.h * 1.9, ...m.b);
      if (m.label !== 'hanger') ibox('iron', m.h * 3.2, Math.max(0.6, m.h * 5), m.h * 3.2, m.a[0], m.a[1] + 2.4 + m.h * 4, m.a[2]);
    } else beam('iron', m.a, m.b, m.h, m.w);                              // truss members
  }
  for (const l of lines) { const y = ROOF.at(l.x) + 0.3 + l.h / 2; beam('iron', [l.x, y, -TOWER.hz], [l.x, y, TOWER.hz], l.h, 0.7 * l.h); }
  for (const h of hung) if (!h.over) {
    tube('tendon', [h.x, h.e.y, h.e.z], [h.x, ROOF.at(h.x), h.e.z], 0.03);
    iknob('steel', 0.07, h.x, h.e.y, h.e.z); ibox('iron', 0.1, 0.5, 0.1, h.x, h.e.y + 1.9, h.e.z);
  }
  for (const g of girders) {
    const { h, yc, z, w, a, r } = g, tf = h / 9, len = 2 * hx;
    cbox(len, h, w, 0, yc, z);
    ibox('iron', len, tf, w, 0, yc + h / 2 - tf / 2, z); ibox('iron', len, tf, w, 0, yc - h / 2 + tf / 2, z); ibox('iron', len, h - 2 * tf, h / 11, 0, yc, z);
    for (let x = -68; x <= 68; x += 4) ibox('iron', 0.1, h - 2 * tf, w - 0.1, x, yc, z);                          // web stiffeners
    for (const y of g.yoke) {                                                                                     // the saddle each tendon lifts the girder by
      ibox('iron', 1.2, 0.3, w + 0.5, y.x, yc - h / 2 - 0.15, z);
      for (const sz of [-1, 1]) ibox('iron', 0.5, h + 0.6, 0.12, y.x, yc, z + sz * (w / 2 + 0.2));
    }
    for (const sx of [-1, 1]) {                                                                                   // bearing pad in each wall
      ibox('stone', 1.5, 1.2, w + 1.2, sx * (hx - 0.75), yc - h / 2 - 0.62, z); ibox('iron', 1.3, 0.06, w + 0.3, sx * (hx - 0.7), yc - h / 2 + 0.01, z);
    }
    // pillow block: iron housing, bronze bearing shell
    sbox('iron', r * 2 + 2.4, 0.5, 1.5 * w, a.x, a.y - r - 0.45, z);
    sbox('iron', r * 2 + 1.2, r * 2 + 0.7, 1.2 * w, a.x, a.y - 0.1, z);
    icyl('bronze', r + 0.3, 1.36 * w, a.x, a.y, z, { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 });
    for (const dx of [-(r + 0.9), r + 0.9]) icyl('steel', 0.2, 0.5, a.x + dx, a.y - r - 0.1, z);
  }
}

// Runs the structural model over everything declared so far and adds the checks that are
// not frames: the shell. Returns { ok, rows, text }.
export function structuralCheck() {
  const res = analyse(), c = MATERIAL.uhpc, extra = [];
  const plan = 2 * (2 * (TOWER.hx + TOWER.wall) + 2 * TOWER.hz) * TOWER.wall;                       // m2 of wall on plan
  const imposed = res.terminal.wall.reduce((s, t) => s - t.f[1], 0) / plan, self = c.rho * GRAVITY * TOWER.H;
  extra.push({ name: 'shell: wall in compression', ok: self + imposed <= c.fc,
    verdict: `${((self + imposed) / 1e6).toFixed(1)} MPa at the foot (${(self / 1e6).toFixed(1)} its own weight) against ${(c.fc / 1e6).toFixed(0)} MPa for ${c.name}` });
  const wind = 1500, bend = wind * TOWER.H ** 2 / 8 / (TOWER.wall ** 2 / 6), need = Math.max(0, bend - self / 2);     // a 1 m strip, ground to roof
  extra.push({ name: 'shell: wall in the wind', ok: need + bend + self <= c.fc,
    verdict: `${(bend / 1e6).toFixed(0)} MPa of bending; needs ${(need / 1e6).toFixed(0)} MPa of prestress, giving ${((need + bend + self) / 1e6).toFixed(0)} MPa at worst against ${(c.fc / 1e6).toFixed(0)}` });
  const pad = 2.2 * 3.0, worst = res.terminal.wall.reduce((m, t) => Math.max(m, -t.f[1]), 0);
  extra.push({ name: 'shell: under the bearing pads', ok: worst / pad <= c.fc,
    verdict: `worst ${(worst / GRAVITY / 1000).toFixed(0)} t on ${pad.toFixed(1)} m2 = ${(worst / pad / 1e6).toFixed(0)} MPa against ${(c.fc / 1e6).toFixed(0)}` });
  return { ok: res.ok && extra.every(e => e.ok), rows: res.rows, extra, terminal: res.terminal, text: report(res, extra) };
}
