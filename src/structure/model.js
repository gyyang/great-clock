// The structural model of the scene, and the check that is run over it.
//
// As each part of the building is drawn, the code that draws it also declares what it is
// structurally: an *assembly* (a girder with its hangers, one truss, one arbor, one tower) made of
// members with real sections and materials, carrying real masses and forces, resting on the
// ground, on a wall, or on another assembly. analyse() then does what an engineer does: works down
// the load path. Assemblies that are joined to one another, rather than resting on one another
// (the six towers and the links between them; the four walls of the shell and its wind trusses),
// are given the same `frame` and solved together as one structure. Each frame is solved on its
// own supports (solve.js) for every load case, its stability is found from its geometric
// stiffness, it is solved again to second order (P-delta), every member is checked against every
// combination of the cases, and the reactions, forces and moments both, are handed on as loads to
// whatever it rests on.
//
// It can be run at any time over whatever has been declared, so a change to the building can be
// checked the moment it is made.
//
// Design basis. Working stresses (the safety factor is in the allowable stress), as the period
// would have done it, with these modern rules for what working stress alone does not cover:
//   - stability: the elastic critical load factor of each frame, from K + lambda Kg with the
//     axial forces of the worst combination for each member, must be at least BUCKLING_FACTOR;
//   - second order: forces are taken from an analysis with K + Kg, so the sway of a frame adds
//     the moments it should; sway imperfection is a notional sideways load of 1/200 of the weight
//     (EN 1993-1-1 5.3.2) in each direction; a member's own crookedness is in its buckling curve;
//   - member check: axial force with bending in both planes, amplified for the member's own
//     bowing (as AISC ASD H1), buckling between joints by the European curve c (welded boxes),
//     shear and torsion, and the slenderness of every plate (EN 1993-1-1 Table 5.2, class 3);
//   - fatigue: what the pendulum alternates every ten seconds (some 160 million times a century)
//     must stay below the cut-off of a welded detail (category 71, EN 1993-1-9), and what each
//     winding adds (four hundred thousand times) within its endurance.
import { prepare, solveCases, critical, definite, geometric, stiffness } from './solve.js';

export const GRAVITY = 9.81;

// Working stresses f, N/m^2: what a designer would allow, with the safety factor already in;
// fy is the yield stress, which sets the buckling curve and how slender a plate may be. The first
// group is what the 1890s had; masonry takes no tension. The wheels are that brass. What carries
// them is not: at this size nothing of the period could.
export const MATERIAL = {
  alloy: { name: 'high-strength alloy steel', rho: 7850, E: 205e9, G: 79e9, f: 450e6, fy: 900e6, steel: true },     // quenched and tempered
  tendon: { name: 'carbon-fibre tendon', rho: 1600, E: 160e9, G: 5e9, f: 1100e6 },                                  // breaks near 2800 MPa; pulls only
  uhpc: { name: 'prestressed ultra-high-performance concrete', rho: 2500, E: 50e9, G: 20e9, f: 0, fc: 60e6 },
  steel: { name: 'mild steel', rho: 7850, E: 200e9, G: 77e9, f: 110e6, fy: 235e6, steel: true },
  brass: { name: 'brass', rho: 8500, E: 100e9, G: 38e9, f: 50e6, fy: 200e6 },
  castIron: { name: 'cast iron', rho: 7200, E: 100e9, G: 40e9, f: 20e6, fc: 100e6 },
  brick: { name: 'engineering brick in cement mortar', rho: 2100, f: 0, fc: 2.0e6 },
  stone: { name: 'granite', rho: 2650, f: 0, fc: 4.0e6 },
  concrete: { name: 'reinforced concrete, C40', rho: 2500, f: 0, fc: 12e6 },                 // working bearing stress 0.3 fck
};
export const BUCKLING_FACTOR = 2.5;          // what each frame's elastic critical load factor must at least be
export const PHI = 1 / 200;                  // sway imperfection
export const FATIGUE = { pendulum: 52e6 * 0.549 / 0.737 / 1.35, winding: 71e6 * Math.cbrt(2e6 / 4.4e5) / 1.35 };   // stress ranges: below the cut-off; at 440,000 cycles
// Turning shafts (opts.turns: how many turns one makes in a century). Each fibre of a shaft that carries a bending
// moment goes from tension to compression and back once a turn, so a shaft is checked for fatigue in rotating bending:
// alloy steel of 1,000 MPa, its endurance 195 MPa (half its strength, times 0.6 for the size, 0.8 for a turned surface
// and 0.814 for 99 % survival) from a million turns on, and from 0.9 of its strength at a thousand turns along a straight
// line on log-log axes below that. At the seat of a wheel's hub, where every moment on an arbor peaks, a shrink fit
// raises the stress by Kf; gamma on the stress; the mean shear of the torque it carries, by Goodman.
export const ROTATING = { uts: 1000e6, Se: 195e6, knee: 1e6, Kf: 2.0, gamma: 1.35 };
export const rotatingAllowed = (N) => { const R = ROTATING; return N >= R.knee ? R.Se : 0.9 * R.uts * (Math.max(N, 1e3) / 1e3) ** (Math.log10(R.Se / (0.9 * R.uts)) / 3); };

// Sections. Iz resists bending in the vertical plane (see solve.js axes()); Z = I / c.
// Each also knows its plates (for local buckling), its shear areas and its torsion modulus.
export const SECTION = {
  round: (r) => ({ A: Math.PI * r * r, Iy: Math.PI * r ** 4 / 4, Iz: Math.PI * r ** 4 / 4, J: Math.PI * r ** 4 / 2, Zy: Math.PI * r ** 3 / 4, Zz: Math.PI * r ** 3 / 4, Avy: 0.9 * Math.PI * r * r, Avz: 0.9 * Math.PI * r * r, Wt: Math.PI * r ** 3 / 2, plates: [], dims: { h: 2 * r, b: 2 * r }, label: `${Math.round(r * 2000)} mm round` }),
  bar: (h, b) => ({ A: b * h, Iz: b * h ** 3 / 12, Iy: h * b ** 3 / 12, J: Math.min(b, h) ** 3 * Math.max(b, h) / 3, Zz: b * h * h / 6, Zy: h * b * b / 6, Avy: b * h / 1.2, Avz: b * h / 1.2, Wt: Math.min(b, h) ** 2 * Math.max(b, h) / 3, plates: [], dims: { h, b }, label: `${Math.round(h * 1000)} x ${Math.round(b * 1000)} bar` }),
  // a welded box, h deep (in the member's y'), b wide, of plate t (or tw in the webs and tf in the flanges)
  box: (h, b, t, tf = t) => {
    const tw = t, hi = h - 2 * tf, bi = b - 2 * tw, Iz = (b * h ** 3 - bi * hi ** 3) / 12, Iy = (h * b ** 3 - hi * bi ** 3) / 12, Am = (b - tw) * (h - tf);
    return { A: b * h - bi * hi, Iz, Iy, J: 4 * Am * Am / (2 * (b - tw) / tf + 2 * (h - tf) / tw), Zz: Iz / (h / 2), Zy: Iy / (b / 2), Avy: 2 * tw * h, Avz: 2 * tf * b, Wt: 2 * Am * Math.min(tw, tf),
      plates: [{ c: hi, t: tw }, { c: bi, t: tf }], dims: { h, b, t: tw, tf }, label: `${Math.round(h * 1000)} x ${Math.round(b * 1000)} box, ${Math.round(tw * 1000)}${tf !== tw ? '/' + Math.round(tf * 1000) : ''} plate` };
  },
  // plate girder or I-beam: depth h, flange width b, flange thickness tf, web tw
  I: (h, b, tf, tw) => {
    const hw = h - 2 * tf, Iz = (b * h ** 3 - (b - tw) * hw ** 3) / 12, Iy = (2 * tf * b ** 3 + hw * tw ** 3) / 12, J = (2 * b * tf ** 3 + hw * tw ** 3) / 3;
    return { A: 2 * b * tf + hw * tw, Iz, Iy, J, Zz: Iz / (h / 2), Zy: Iy / (b / 2), Avy: h * tw, Avz: 2 * b * tf, Wt: J / Math.max(tf, tw), plates: [{ c: hw, t: tw }, { c: (b - tw) / 2, t: tf, outstand: true }], dims: { h, b, tf, tw }, label: `${Math.round(h * 1000)} x ${Math.round(b * 1000)} girder` };
  },
};
// how slender a plate may be before it buckles before it yields: EN 1993-1-1 Table 5.2, class 3
export const plateLimit = (fy, outstand = false) => (outstand ? 14 : 42) * Math.sqrt(235e6 / fy);

// ---- load cases and their combinations
// Each force, and each load along a member, belongs to a case. 'dead' is what is always there
// (every weight); 'teeth' the wheels pushing on one another while the weight drives the train,
// which is as permanent as the weight; 'pendulum' the pendulum's pull at the end of its swing,
// which reverses every beat; 'winding' what the engine's winding gear puts on while it winds;
// 'sway x' and 'sway z' the sway imperfection (filled in by analyse()); 'wind ±x', 'wind ±z' the
// outside pressure of a wind blowing that way, and 'inside' an inside pressure of 1 kPa outward.
export const CASES = ['dead', 'teeth', 'pendulum', 'winding', 'sway x', 'sway z', 'wind +x', 'wind -x', 'wind +z', 'wind -z', 'inside'];
export const WIND_Q = 1.9e3;                 // peak velocity pressure at the top of the tower, Pa
const SWAYS = [['sway x', 1, '+x'], ['sway x', -1, '-x'], ['sway z', 1, '+z'], ['sway z', -1, '-z']];
export const COMBOS = [];
for (const [s, k, d] of SWAYS) COMBOS.push({ name: `stopped, leaning ${d}`, f: { dead: 1, [s]: k } });
for (const w of [0, 1]) for (const p of [1, -1]) for (const [s, k, d] of SWAYS) COMBOS.push({ name: `${w ? 'winding' : 'going'}, pendulum ${p > 0 ? 'right' : 'left'}, leaning ${d}`, f: { dead: 1, teeth: 1, pendulum: p, winding: w, [s]: k } });
for (const [wd, s, k] of [['wind +x', 'sway x', 1], ['wind -x', 'sway x', -1], ['wind +z', 'sway z', 1], ['wind -z', 'sway z', -1]]) for (const cpi of [0.2, -0.3]) for (const p of [1, -1])
  COMBOS.push({ name: `${wd}, ${cpi > 0 ? 'pressure' : 'suction'} inside, pendulum ${p > 0 ? 'right' : 'left'}`, f: { dead: 1, teeth: 1, pendulum: p, [wd]: 1, inside: cpi * WIND_Q / 1e3, [s]: k } });
export const SERVICE = { dead: 1, teeth: 1 };

const SNAP = 0.03;
const key = (p) => `${Math.round(p[0] / SNAP)},${Math.round(p[1] / SNAP)},${Math.round(p[2] / SNAP)}`;
const assemblies = new Map();

class Assembly {
  constructor(name, note) { this.name = name; this.note = note; this.nodes = []; this.index = new Map(); this.members = []; this.masses = []; this.forces = []; this.rests = []; this.braces = []; this.frame = null; }
  node(p) { const k = key(p); if (!this.index.has(k)) { this.index.set(k, this.nodes.length); this.nodes.push({ p: [...p] }); this.cut = false; } return this.index.get(k); }
  // kind: 'beam' (default), 'tie' (rod: carries tension only), 'strut', 'link' (pinned at both ends:
  // carries push or pull along its length and nothing else).
  // opts: { lines: { case: [wx, wy, wz] } }, loads along it in N per metre, world axes, by case
  // (a number here is the old unbraced length, which is no longer used: what restrains a member is
  // found by the analysis). carries: a load spread along it, N per metre downward, beyond its own
  // weight (the wall standing on a girder).
  member(a, b, section, material = MATERIAL.steel, kind = 'beam', label = '', opts = null, carries = 0) {
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 2 * SNAP) return this;
    this.members.push({ a: this.node(a), b: this.node(b), section, material, kind, label, carries, lines: (opts && typeof opts === 'object' && opts.lines) || null, turns: (opts && typeof opts === 'object' && opts.turns) || 0 });
    return this;
  }
  mass(p, kg, label = '') { this.masses.push({ n: this.node(p), kg, label }); return this; }
  // f: [fx, fy, fz] or [fx, fy, fz, mx, my, mz], newtons (and newton metres), in case `kase`
  force(p, f, label = '', kase = 'dead') { this.forces.push({ n: this.node(p), f, label, kase }); return this; }
  // This point is held by `on`: 'ground', 'wall', or the name of another assembly.
  // hold: 'pin' stops it moving; 'fix' also stops it turning (built in); or the axes it is held
  // along, e.g. 'yz' for a bearing that is free to slide in x (one end of every long span is).
  rest(p, on, hold = 'pin') { this.rests.push({ n: this.node(p), on, hold }); return this; }
  // This point is kept from moving along one axis ('x', 'y' or 'z') by something that carries no
  // weight from it: the purlins that stop a truss falling over sideways, for instance. What it
  // pushes with is handed on to `on` (an assembly) at the point `at`, so it is not lost.
  brace(p, axis, on = null, at = null) { this.braces.push({ n: this.node(p), d: 'xyz'.indexOf(axis), on, at }); return this; }
}

export function assembly(name, note = '') {
  if (!assemblies.has(name)) assemblies.set(name, new Assembly(name, note));
  return assemblies.get(name);
}
export function resetStructure() { assemblies.clear(); cache.clear(); }
// Start an assembly again from nothing (used while the designer is trying sizes).
export function redeclare(name, note = '') { assemblies.delete(name); return assembly(name, note); }
export const getAssembly = (name) => assemblies.get(name);

// A member that passes through other nodes of its assembly is one continuous piece
// joined to whatever meets it there: cut it at those nodes.
function split(A) {
  const out = [];
  for (const m of A.members) {
    const a = A.nodes[m.a].p, b = A.nodes[m.b].p, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const lo = [0, 1, 2].map(i => Math.min(a[i], b[i]) - SNAP), hi = [0, 1, 2].map(i => Math.max(a[i], b[i]) + SNAP);
    const cuts = [];
    A.nodes.forEach((nd, i) => {
      if (i === m.a || i === m.b) return;
      const q = nd.p;
      if (q[0] < lo[0] || q[0] > hi[0] || q[1] < lo[1] || q[1] > hi[1] || q[2] < lo[2] || q[2] > hi[2]) return;
      const t = ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1] + (q[2] - a[2]) * d[2]) / L2;
      if (t <= 0.001 || t >= 0.999) return;
      if (Math.hypot(q[0] - a[0] - d[0] * t, q[1] - a[1] - d[1] * t, q[2] - a[2] - d[2] * t) < SNAP) cuts.push([t, i]);
    });
    cuts.sort((p, q) => p[0] - q[0]);
    let from = m.a;
    for (const [, i] of cuts) { out.push({ ...m, a: from, b: i }); from = i; }
    out.push({ ...m, a: from, b: m.b });
  }
  A.members = out; A.cut = true;
}

// Where a load lands on an assembly that takes whatever is brought to it within reach (a
// wall frame: things bear on the nearest column or girder, not on a point named in advance).
function nearest(A, p) {
  let best = p, bd = A.reach;
  for (const m of A.members) {
    const a = A.nodes[m.a].p, b = A.nodes[m.b].p, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / (d[0] * d[0] + d[1] * d[1] + d[2] * d[2])));
    const q = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t], dist = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (dist < bd) { bd = dist; best = q; }
  }
  return best;
}

// European buckling curve c (welded box sections, EN 1993-1-1 6.3.1.2)
function chi(lbar) { const ph = 0.5 * (1 + 0.49 * (lbar - 0.2) + lbar * lbar); return Math.min(1, 1 / (ph + Math.sqrt(Math.max(0, ph * ph - lbar * lbar)))); }

// The largest |M| along a member: end moments joined by the parabola of a uniform load.
// m(x) = m0 + v x + w x^2 / 2.
function peak(m0, v, w, L) {
  let best = Math.max(Math.abs(m0), Math.abs(m0 + v * L + w * L * L / 2));
  if (w) { const x = -v / w; if (x > 0 && x < L) best = Math.max(best, Math.abs(m0 + v * x + w * x * x / 2)); }
  return best;
}
// moment-gradient factor for a member's own bowing: 1 for uniform bending, down to 0.4 for double curvature
function cm(ma, mb, w, L) {
  const big = Math.max(Math.abs(ma), Math.abs(mb));
  if (!big || Math.abs(w) * L * L / 8 > 0.1 * big) return 1;
  const s = Math.min(Math.abs(ma), Math.abs(mb)) / big * Math.sign(ma * mb);
  return Math.max(0.4, 0.6 + 0.4 * s);
}

// How hard one member is working in one combination, as a fraction of what it can take.
// f: its twelve end forces in its own axes, q: its load per metre in its own axes.
function utilisation(m, f, q, L) {
  const s = m.section, mat = m.material, fw = mat.f || mat.fc || 1;
  const Na = -f[0], Nb = f[6], N = Math.min(Na, Nb), Nt = Math.max(Na, Nb);
  if (m.kind === 'tie') {
    if (N < -0.02 * s.A * mat.f) return { u: Infinity, why: 'a rod cannot push', stress: -N / s.A };
    return { u: Math.max(0, Nt) / s.A / mat.f, why: 'tension', stress: Math.max(0, Nt) / s.A };
  }
  if (m.kind === 'link') {
    if (N >= 0) return { u: Nt / s.A / fw, why: 'tension', stress: Nt / s.A };
    const sE = Math.PI ** 2 * mat.E * Math.min(s.Iy, s.Iz) / (s.A * L * L), Fa = Math.min(chi(Math.sqrt((mat.fy || 2 * fw) / sE)) * fw, sE / BUCKLING_FACTOR);
    return { u: -N / s.A / Fa, why: 'buckling', stress: -N / s.A };
  }
  // bending about z' (in the member's y' direction) and about y'
  const mz0 = -f[5], mzL = f[11], my0 = -f[4], myL = f[10];
  const Mz = peak(mz0, f[1], q[1], L), My = peak(my0, -f[2], -q[2], L);
  const fa = Math.max(Math.abs(Na), Math.abs(Nb)) / s.A, fbz = Mz / s.Zz, fby = My / s.Zy;
  let u = (fa + fbz + fby) / fw, why = fbz + fby > fa ? 'bending' : N < 0 ? 'compression' : 'tension';
  if (N < 0 && mat.E) {
    // buckling between its joints, about each axis, with its own bowing amplifying its moments
    const sEz = Math.PI ** 2 * mat.E * s.Iz / (s.A * L * L), sEy = Math.PI ** 2 * mat.E * s.Iy / (s.A * L * L), sE = Math.min(sEz, sEy);
    const Fa = Math.min(chi(Math.sqrt((mat.fy || 2 * fw) / sE)) * fw, sE / BUCKLING_FACTOR), fc = -N / s.A;
    const az = 1 - fc / (sEz / BUCKLING_FACTOR), ay = 1 - fc / (sEy / BUCKLING_FACTOR);
    const ub = az <= 0 || ay <= 0 ? Infinity : fc / Fa + cm(mz0, mzL, q[1], L) * fbz / (az * fw) + cm(my0, myL, q[2], L) * fby / (ay * fw);
    if (ub > u) { u = ub; why = fbz + fby > 0.3 * fc ? 'buckling with bending' : 'buckling'; }
  }
  // shear and twisting
  const V = Math.max(Math.abs(f[1]), Math.abs(f[7])) / s.Avy + Math.max(Math.abs(f[2]), Math.abs(f[8])) / s.Avz, T = Math.abs(f[3]) / s.Wt, tau = V + T;
  if (mat.f && tau / (mat.f / Math.sqrt(3)) > u) { u = tau / (mat.f / Math.sqrt(3)); why = T > V ? 'torsion' : 'shear'; }
  if (mat.f && tau > 0.5 * mat.f / Math.sqrt(3)) {           // shear high enough to eat into the bending strength
    const vm = Math.sqrt((fa + fbz + fby) ** 2 + 3 * tau * tau) / mat.f;
    if (vm > u) { u = vm; why = 'bending with shear'; }
  }
  return { u, why, stress: fa + fbz + fby };
}
// The stress range in a member from one case alone (the pendulum, a winding).
function range(m, f, q, L) {
  const s = m.section, Mz = peak(-f[5], f[1], q[1], L), My = peak(-f[4], -f[2], -q[2], L);
  return Math.max(Math.abs(f[0]), Math.abs(f[6])) / s.A + (m.kind === 'tie' ? 0 : Mz / s.Zz + My / s.Zy);
}
// The plate that is most slender for what its steel can take, as a fraction of the limit.
function plates(m) {
  const mat = m.material, s = m.section;
  if (!mat.fy || !s.plates) return 0;
  return Math.max(0, ...s.plates.map(p => p.c / p.t / plateLimit(mat.fy, p.outstand)));
}

// ---- running the analysis
const cache = new Map();
// a fingerprint of a frame as declared, to know when it has not changed since it was last solved
const _dv = new DataView(new ArrayBuffer(8));
function hasher() {
  let h1 = 2166136261 >>> 0, h2 = 0x9747b28c >>> 0;
  const word = (w) => { h1 = Math.imul(h1 ^ w, 16777619) >>> 0; h2 = Math.imul(h2 ^ w, 2246822507) >>> 0; h2 = (h2 ^ (h2 >>> 13)) >>> 0; };
  return { num(v) { _dv.setFloat64(0, v); word(_dv.getUint32(0)); word(_dv.getUint32(4)); }, str(s) { for (let i = 0; i < s.length; i++) word(s.charCodeAt(i)); }, done: () => `${h1.toString(36)}${h2.toString(36)}` };
}

// Works down the load path. Returns one row per assembly, the frames (their displacements and
// stability), and what each terminal support (ground, wall) is asked to carry, case by case.
// opts.exact: also confirm each frame's stability exactly (a factorisation of K + 2.5 Kg).
// opts.fast: amplify first-order results instead of solving again with K + Kg (see solveGroup).
export function analyse(opts = {}) {
  const groups = new Map(), groupOf = new Map();
  for (const A of assemblies.values()) {
    const g = A.frame || A.name;
    if (!groups.has(g)) groups.set(g, { name: g, list: [] });
    groups.get(g).list.push(A); groupOf.set(A.name, g);
  }
  // joints inside a frame: a rest on an assembly of the same frame is a joint, so that assembly needs a node there
  for (const A of assemblies.values()) for (const r of A.rests) if (groupOf.get(r.on) === groupOf.get(A.name) && r.on !== A.name) assemblies.get(r.on).node(A.nodes[r.n].p);
  for (const A of assemblies.values()) { if (!A.cut) split(A); A.incoming = []; }
  // whatever rests on (or is braced by) a frame must be solved before that frame
  const order = [], state = new Map();
  const visit = (g) => {
    if (state.get(g) === 2) return; if (state.get(g) === 1) throw new Error(`[structure] ${g} rests on itself`);
    state.set(g, 1);
    for (const H of groups.values()) if (H.name !== g && H.list.some(B => B.rests.some(r => groupOf.get(r.on) === g) || B.braces.some(b => b.on && groupOf.get(b.on) === g))) visit(H.name);
    state.set(g, 2); order.push(groups.get(g));
  };
  for (const g of groups.keys()) visit(g);

  const rows = [], terminal = { ground: [], wall: [] }, frames = new Map();
  for (const grp of order) {
    const t0 = performance.now(), out = solveGroup(grp, groupOf, opts);
    if (out.frame && !out.frame.ms) out.frame.ms = Math.round(performance.now() - t0);
    rows.push(...out.rows);
    if (out.frame) frames.set(grp.name, out.frame);
    for (const t of out.handed) {
      if (terminal[t.on]) terminal[t.on].push(t);
      else if (assemblies.has(t.on)) assemblies.get(t.on).incoming.push(t);
    }
  }
  return { rows, terminal, frames, ok: rows.every(r => r.ok), ms: Object.fromEntries([...frames].map(([k, f]) => [k, f.ms])) };
}

// One frame: every assembly in it, solved as one structure.
function solveGroup(grp, groupOf, opts) {
  const list = grp.list;
  // what is brought to it from elsewhere lands on its nearest member, where it reaches
  for (const A of list) {
    for (const inc of A.incoming) { inc.n = A.node(A.reach ? nearest(A, inc.p) : inc.p); }
    if (!A.cut) { split(A); for (const inc of A.incoming) inc.n = A.node(A.reach ? nearest(A, inc.p) : inc.p); }
  }
  // one numbering for the whole frame: points that coincide are one joint
  const nodes = [], index = new Map(), members = [], owner = [], mem = [];
  const nodeOf = (p) => { const k = key(p); if (!index.has(k)) { index.set(k, nodes.length); nodes.push({ p, fix: null }); } return index.get(k); };
  const local = list.map(A => A.nodes.map(nd => nodeOf(nd.p)));
  list.forEach((A, ai) => A.members.forEach((m) => { members.push(m); owner.push(ai); mem.push({ a: local[ai][m.a], b: local[ai][m.b] }); }));
  const rows = list.map(A => ({ name: A.name, note: A.note, frame: grp.name, members: A.members.length, weight: 0, carried: 0, byLabel: {}, whyLabel: {} }));
  const supports = [];
  list.forEach((A, ai) => {
    for (const r of A.rests) {
      if (groupOf.get(r.on) === grp.name) continue;                          // a joint within the frame
      const n = local[ai][r.n], fix = r.hold === 'fix' ? [1, 1, 1, 1, 1, 1] : r.hold === 'pin' ? [1, 1, 1, 0, 0, 0] : [+r.hold.includes('x'), +r.hold.includes('y'), +r.hold.includes('z'), 0, 0, 0];
      nodes[n].fix = nodes[n].fix ? nodes[n].fix.map((v, i) => v || fix[i]) : fix;
      supports.push({ n, on: r.on, from: A.name, p: nodes[n].p, hold: r.hold });
    }
    for (const b of A.braces) {
      const n = local[ai][b.n]; nodes[n].fix = nodes[n].fix || [0, 0, 0, 0, 0, 0]; nodes[n].fix[b.d] = 1;
      supports.push({ n, on: b.on, from: A.name, p: b.at || nodes[n].p, only: b.d, brace: true });
    }
  });
  if (!supports.some(s => !s.brace)) { rows.forEach(r => { r.ok = false; r.verdict = 'rests on nothing'; }); return { rows, handed: [] }; }
  // A lone member on simple bearings is free to spin about its own axis: a mechanism on paper,
  // of no interest in practice. Where only one line of members reaches a bearing, the bearing
  // also stops it turning about that line.
  for (const s of supports) {
    if (s.brace || s.hold === 'fix') continue;
    const dirs = mem.map((m, k) => [m, members[k]]).filter(([m, mm]) => mm.kind !== 'tie' && (m.a === s.n || m.b === s.n)).map(([m]) => { const a = nodes[m.a].p, b = nodes[m.b].p, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d); return d.map(v => Math.abs(v) / l); });
    if (dirs.length && dirs.every(d => d.every((v, k) => Math.abs(v - dirs[0][k]) < 0.02))) nodes[s.n].fix[3 + dirs[0].indexOf(Math.max(...dirs[0]))] = 1;
  }

  // ---- the loads, case by case
  const nn = nodes.length, cases = new Map();
  const C = (name) => { if (!cases.has(name)) cases.set(name, { name, loads: new Float64Array(6 * nn), lines: new Map() }); return cases.get(name); };
  C('dead');
  const vertical = new Float64Array(nn);                    // the frame's own weight at each joint, for its sway imperfection
  members.forEach((m, k) => {
    const pa = nodes[mem[k].a].p, pb = nodes[mem[k].b].p, L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    const own = m.material.rho * m.section.A * GRAVITY, w = own + (m.carries || 0);
    C('dead').lines.set(k, [0, -w, 0]);
    vertical[mem[k].a] += w * L / 2; vertical[mem[k].b] += w * L / 2;
    rows[owner[k]].weight += own * L; rows[owner[k]].carried += (m.carries || 0) * L;
    if (m.lines) for (const [cs, v] of Object.entries(m.lines)) C(cs).lines.set(k, v);
  });
  list.forEach((A, ai) => {
    for (const q of A.masses) { const n = local[ai][q.n]; C('dead').loads[6 * n + 1] -= q.kg * GRAVITY; vertical[n] += q.kg * GRAVITY; rows[ai].carried += q.kg * GRAVITY; }
    for (const q of A.forces) { const n = local[ai][q.n], L = C(q.kase).loads; for (let d = 0; d < q.f.length; d++) L[6 * n + d] += q.f[d]; if (q.kase === 'dead') { vertical[n] -= q.f[1]; rows[ai].carried += Math.abs(q.f[1]); } }
    for (const q of A.incoming) { const n = local[ai][q.n]; for (const [cs, f] of Object.entries(q.cases)) { const L = C(cs).loads; for (let d = 0; d < 6; d++) L[6 * n + d] += f[d]; } rows[ai].carried += Math.abs(q.cases.dead ? q.cases.dead[1] : 0); }
  });
  for (let n = 0; n < nn; n++) if (vertical[n] > 0) { C('sway x').loads[6 * n] += PHI * vertical[n]; C('sway z').loads[6 * n + 2] += PHI * vertical[n]; }
  const caseList = [...cases.values()], cix = new Map(caseList.map((c, i) => [c.name, i]));
  // the combinations, as they apply to this frame (two that differ only in cases it does not have are one)
  const combos = [], seen = new Set();
  for (const cb of COMBOS) {
    const f = Object.entries(cb.f).filter(([k, v]) => v && cix.has(k)).map(([k, v]) => [cix.get(k), v]), id = f.map(x => x.join(':')).join(' ');
    if (!seen.has(id)) { seen.add(id); combos.push({ name: cb.name, f }); }
  }
  const service = Object.entries(SERVICE).filter(([k]) => cix.has(k)).map(([k, v]) => [cix.get(k), v]);

  // ---- has it been solved before, exactly as it is now?
  const hs = hasher();
  for (const nd of nodes) { for (const v of nd.p) hs.num(v); if (nd.fix) hs.str(nd.fix.join('')); }
  members.forEach((m, k) => { hs.num(mem[k].a); hs.num(mem[k].b); for (const v of [m.section.A, m.section.Iy, m.section.Iz, m.section.J, m.section.Zy, m.section.Zz, m.material.E]) hs.num(v); hs.str(m.kind + m.label); });
  for (const c of caseList) { hs.str(c.name); for (let i = 0; i < c.loads.length; i++) if (c.loads[i]) { hs.num(i); hs.num(c.loads[i]); } for (const [k, v] of c.lines) { hs.num(k); for (const x of v) hs.num(x); } }
  hs.str((opts.exact ? 'exact' : '') + (opts.fast ? 'fast' : ''));
  const sig = hs.done();
  const hit = cache.get(grp.name);
  if (hit && hit.sig === sig) return hit.out;

  // ---- first order. A rod that the first solution puts in compression would in fact hang
  // slack. Take the slack ones out and solve again, until every rod left is pulling.
  const tA = performance.now();
  let live = members.map((_, k) => k), sol = null, slack = 0, M = null;
  const asSolver = (k) => { const m = members[k]; return { a: mem[k].a, b: mem[k].b, E: m.material.E, G: m.material.G, ...m.section, axial: m.kind === 'tie' || m.kind === 'link' }; };
  const caseFor = (ks) => caseList.map(c => ({ loads: c.loads, lines: new Map([...c.lines].filter(([k]) => ks.has(k)).map(([k, v]) => [ks.get(k), v])) }));
  let map;
  for (let pass = 0; pass < 12; pass++) {
    map = new Map(live.map((k, i) => [k, i]));
    M = prepare(nodes, live.map(asSolver));
    sol = solveCases(M, caseFor(map));
    if (sol.unstable) break;
    const keep = live.filter((k, i) => !(members[k].kind === 'tie' && service.reduce((s, [c, v]) => s + v * sol.cases[c].forces[i].N, 0) < 0));
    if (keep.length === live.length) break;
    slack += live.length - keep.length; live = keep;
  }
  if (sol.unstable) {
    const at = nodes[sol.unstable.node]?.p ?? null, ai = sol.unstable.node < 0 ? -1 : list.findIndex((A, i) => local[i].includes(sol.unstable.node));
    rows.forEach((r, i) => { r.ok = false; r.verdict = i === ai || ai < 0 ? (sol.unstable.freedom < 0 ? 'free to move' : `free to move (${'xyz'[sol.unstable.freedom % 3]}${sol.unstable.freedom >= 3 ? ' rotation' : ''})`) : `in a frame that is free to move at ${list[ai].name}`; r.at = at; });
    const out = { rows, handed: [] };
    cache.set(grp.name, { sig, out });
    return out;
  }
  // the axial force in each member, at its most compressive over every combination
  const Nof = (cs, i) => { const f = cs.forces[i].f; return Math.min(-f[0], f[6]); };
  const Nenv = live.map((k, i) => Math.min(0, ...combos.map(cb => cb.f.reduce((s, [c, v]) => s + v * Nof(sol.cases[c], i), 0))));
  // ---- stability
  const tB = performance.now();
  const Kg = geometric(M, Nenv);
  const crit = critical(M, sol.FK, Kg);
  const tC = performance.now();
  let lambda = crit.lambda, exact = null;
  if (opts.exact && isFinite(lambda) && lambda > 0) exact = definite(M, sol.K, Kg, BUCKLING_FACTOR);
  // which members the buckled shape bends: their share of its strain energy
  let share = null, U = null;
  if (crit.mode && lambda < 2 * BUCKLING_FACTOR) {
    U = new Float64Array(6 * nn); for (let i = 0; i < 6 * nn; i++) if (M.dof[i] >= 0) U[i] = crit.mode[M.dof[i]];
    share = M.el.map((e) => { const u = Array.from(e.idx, i => U[i]); let s = 0; for (let i = 0; i < 12; i++) { let t = 0; for (let j = 0; j < 12; j++) t += e.kg[i * 12 + j] * u[j]; s += u[i] * t; } return s; });
    const tot = share.reduce((a, b) => a + b, 0) || 1; share = share.map(v => v / tot);
  }
  // ---- second order, with every member's axial force at its worst
  // (opts.fast, while a design is being tried: the first-order forces and movements are instead multiplied by
  // 1 / (1 - 1 / lambda), the amplification of the sway they would have; the final check is always made exactly)
  let second = sol;
  if (lambda > 1.05 && !opts.fast) { const s2 = solveCases(M, caseFor(map), { N: Nenv, K: sol.K }); if (!s2.unstable) second = s2; }
  else if (lambda > 1.05 && isFinite(lambda)) {
    const amp = 1 / (1 - 1 / lambda);
    second = { ...sol, cases: sol.cases.map(c => ({ ...c, u: c.u.map(v => v * amp), forces: c.forces.map(f => ({ ...f, f: f.f.map(v => v * amp), q: f.q.map(v => v * amp) })) })) };
  }
  const tD = performance.now();
  const frame = { name: grp.name, nodes, index, lambda, exact, converged: crit.converged, mode: U, parts: [tB - tA, tC - tB, tD - tC].map(Math.round), steps: crit.steps, cases: Object.fromEntries(caseList.map((c, i) => [c.name, second.cases[i].u])), members: live.length, eqs: M.neq };

  // ---- every member against every combination
  const worst = list.map(() => ({ u: 0 }));
  const comb = new Float64Array(12), cq = [0, 0, 0];
  const ip = cix.get('pendulum'), iw = cix.get('winding'), idd = cix.get('dead'), itt = cix.get('teeth');
  live.forEach((k, i) => {
    const m = members[k], ai = owner[k], L = second.cases[0].forces[i].L;
    let best = { u: 0 };
    for (const cb of combos) {
      comb.fill(0); cq[0] = cq[1] = cq[2] = 0;
      for (const [c, v] of cb.f) { const F = second.cases[c].forces[i]; for (let t = 0; t < 12; t++) comb[t] += v * F.f[t]; for (let t = 0; t < 3; t++) cq[t] += v * F.q[t]; }
      const c = utilisation(m, comb, cq, L);
      if (c.u > best.u) best = { ...c, combo: cb.name, N: Math.min(-comb[0], comb[6]) };
    }
    if (m.material.steel) {
      for (const [c, limit, name, k2] of [[ip, FATIGUE.pendulum, 'fatigue (the pendulum)', 2], [iw, FATIGUE.winding, 'fatigue (winding)', 1]]) {
        if (c === undefined) continue;
        const F = second.cases[c].forces[i], r = k2 * range(m, F.f, F.q, L) / limit;
        if (r > best.u) best = { u: r, why: name, stress: k2 * range(m, F.f, F.q, L), N: F.N };
      }
    }
    if (m.turns && idd !== undefined) {
      // a solid round shaft: bending under its own weight, its wheels' and the teeth's pushes, which stand still while it turns
      const s = m.section, r = Math.sqrt(s.A / Math.PI), R = ROTATING, at = rotatingAllowed(m.turns) / (R.Kf * R.gamma);
      for (const e of [0, 6]) {
        let My = 0, Mz = 0, T = 0;
        for (const c of [idd, itt]) if (c !== undefined) { const f = second.cases[c].forces[i].f; My += f[e + 4]; Mz += f[e + 5]; T += f[e + 3]; }
        const sa = Math.hypot(My, Mz) * r / s.Iz, sm = Math.sqrt(3) * Math.abs(T) * r / (2 * s.Iz), u = sa / (at * Math.max(0.05, 1 - sm / R.uts));
        if (u > best.u) best = { u, why: `fatigue (turning, ${m.turns.toExponential(1)} turns)`, stress: sa };
      }
    }
    const pl = plates(m);
    if (pl > 1 && pl > best.u) best = { u: pl, why: 'plate too slender', stress: 0 };
    const row = rows[ai], lab = m.label;
    if (!(row.byLabel[lab] >= best.u)) { row.byLabel[lab] = best.u; row.whyLabel[lab] = best.why; }
    if (share) row.shareLabel = row.shareLabel || {}, row.shareLabel[lab] = (row.shareLabel[lab] || 0) + share[i];
    if (best.u > worst[ai].u) worst[ai] = { ...best, member: m, L, at: nodes[mem[k].a].p.map((v, t) => (v + nodes[mem[k].b].p[t]) / 2) };
  });
  // ---- what it hands on, case by case
  const handed = [];
  for (const s of supports) {
    const fc = {};
    caseList.forEach((c, ci) => {
      const R = second.cases[ci].reactions, f = [0, 1, 2, 3, 4, 5].map(d => -R[6 * s.n + d]);
      if (s.brace) for (let d = 0; d < 6; d++) if (d !== s.only) f[d] = 0;
      fc[c.name] = f;
    });
    if (s.brace && !s.on) continue;                    // (a brace whose reaction nobody claims: only allowed for tests)
    const f = [0, 1, 2, 3, 4, 5].map(d => service.reduce((t, [c, v]) => t + v * fc[caseList[c].name][d], 0));
    handed.push({ from: s.from, on: s.on, p: s.p, f, cases: fc, label: s.from });
  }
  // ---- the verdicts
  let sag = 0; for (let n = 0; n < nn; n++) sag = Math.max(sag, -frame.cases.dead[6 * n + 1]);
  rows.forEach((row, ai) => {
    const w = worst[ai];
    Object.assign(row, { slack, lambda, exact, u: w.u, why: w.why, stress: w.stress, combo: w.combo, worst: w.member && `${w.member.label || w.member.kind} (${w.member.section.label})`, at: w.at, N: w.N, L: w.L, sag });
    const stable = lambda >= BUCKLING_FACTOR && exact !== false;
    row.ok = w.u <= 1 && stable;
    row.verdict = !stable ? `buckles at ${lambda.toFixed(2)} times its load (needs ${BUCKLING_FACTOR})`
      : (w.u <= 1 ? 'holds' : w.u === Infinity ? w.why : `overloaded ${w.u.toFixed(1)}x in ${w.why}`) + (slack ? ` (${slack} rods slack)` : '');
  });
  const out = { rows, handed, frame };
  cache.set(grp.name, { sig, out });
  return out;
}

// Displacement of the point p of a frame under a combination of cases ({ case: factor }): [dx, dy, dz].
export function displacement(res, frameName, p, factors) {
  const F = res.frames.get(frameName); if (!F) return null;
  const n = F.index.get(key(p)); if (n === undefined) return null;
  const d = [0, 0, 0];
  for (const [c, v] of Object.entries(factors)) { const u = F.cases[c]; if (u) for (let i = 0; i < 3; i++) d[i] += v * u[6 * n + i]; }
  return d;
}

const tonnes = (N) => `${(N / GRAVITY / 1000).toLocaleString('en', { maximumFractionDigits: N / GRAVITY / 1000 < 100 ? 1 : 0 })} t`;
export function report(result, extra = []) {
  const lines = [], pad = (s, n) => String(s).padEnd(n);
  for (const r of [...result.rows].sort((a, b) => (b.u ?? 1e9) - (a.u ?? 1e9))) {
    lines.push(`${r.ok ? '  ok  ' : ' FAIL '} ${pad(r.name, 26)} ${pad(r.verdict, 46)} carries ${pad(tonnes(r.carried), 10)} own weight ${pad(tonnes(r.weight), 9)}${r.worst ? ` worst: ${r.worst}, ${(r.u * 100).toFixed(0)}% in ${r.why}${r.combo ? ` (${r.combo})` : ''}` : ''}`);
  }
  for (const e of extra) lines.push(`${e.ok ? '  ok  ' : ' FAIL '} ${pad(e.name, 26)} ${e.verdict}`);
  const down = (list) => list.reduce((s, t) => s - t.f[1], 0);
  lines.push('', `onto the walls: ${tonnes(down(result.terminal.wall))}   onto the ground: ${tonnes(down(result.terminal.ground))} (the clock going, no wind)`);
  return lines.join('\n');
}
