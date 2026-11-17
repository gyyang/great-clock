// The structural model of the scene, and the check that is run over it.
//
// As each part of the building is drawn, the code that draws it also declares what it is
// structurally: an *assembly* (a girder with its hangers, one truss, one arbor, one tower) made of
// members with real sections and materials, carrying real masses and forces, resting on the
// ground, on a wall, or on another assembly. analyse() then does what an engineer does: works down
// the load path. Assemblies that are joined to one another, rather than resting on one another
// (the six towers and the links between them; the four walls of the shell and its wind trusses),
// are given the same `frame` and solved together as one structure; so is whatever is braced to a
// frame (a stair tower tied to the wall beside it leans on that wall, and the wall must hold it up
// as well as itself). Each frame is solved on its own supports (solve.js) for every load case, its
// stability is found from its geometric stiffness, it is solved again to second order, every
// member is checked against every combination of the cases, and the reactions, forces and
// moments both, are handed on as loads to whatever it rests on.
//
// It can be run at any time over whatever has been declared, so a change to the building can be
// checked the moment it is made.
//
// ---- Design basis (the one place it is stated; README "Does it stand up?" says the same)
// Steel: AISC 360-16, allowable strength design (ASD), by the direct analysis method (Chapter C):
//   - each frame is analysed to second order at 1.6 times its ASD loads, with every stiffness (members,
//     connectors, foundations) reduced to 0.8, and the forces divided back by 1.6 (solve.js: 0.5 K + Kg);
//     the sway imperfection is a notional sideways load of 1/200 of the weight in every combination
//     (more than C2.2b asks); a member's own crookedness is in its column curve and in B1;
//   - members: K = 1, the length between the points that actually hold it in each plane (a joint where
//     nothing meets it across that plane does not count); compression E3, tension D2 (yield 0.6 fy on
//     the gross section, rupture 0.5 fu on the net), bending 0.6 fy on the elastic modulus (no plate
//     may be slender: Table B4.1a), combined H1-1 with B1 = Cm / (1 - 1.6 Pr / Pe1*), Pe1* from 0.8 EI;
//     shear and torsion 0.6 fy / 1.67, combined by H3-6;
//   - the elastic critical load factor of each frame at its working loads, nominal stiffness, must be
//     at least BUCKLING_FACTOR (4.5), confirmed exactly by the inertia of K + 4.5 Kg;
//   - braces (connectors from one frame to another) are springs of the stiffness of what is drawn, and
//     each is checked for 2% of the force in what it braces and for the stiffness AISC Appendix 6 asks;
//   - fatigue (EN 1993-1-9): what the pendulum alternates every ten seconds (some 160 million times a
//     century) stays below the cut-off of a welded detail, category 71, 0.405 of it over 1.35 = 21.3 MPa,
//     reduced for thick plate by (25 mm / t)^0.2 (t the ply); each winding (four hundred thousand times)
//     within its endurance, 87 MPa at that size; a solid forging category 112.
// Steel grades: plate is S690QL to EN 10025-6 (yield 690 MPa to 50 mm, 650 to 100, 630 to 150) and no
//   plate is thicker than 100 mm: a thicker wall is a lamination of plies, stitched with preloaded M36
//   bolts at 300 mm both ways (so the plies act as one; the net section at the holes is 87% of the
//   gross, and each ply must not buckle between stitches, E6.2: pitch <= 0.75 t sqrt(E / fy)). Mild
//   steel is S235 and S355 to EN 10025-2, by thickness. Solid shafts are quenched and tempered NiCrMoV
//   forgings, by ruling section. Castings are G20Mn5+QT to EN 10340. Rods are high-strength tension bars.
// Foundations: each foot on springs from its footprint spread through the raft onto the rock (Gazetas,
//   rock mass modulus GROUND.E, a requirement of the site), so that the analysis gives settlement and the
//   rocking a foot allows; checked by structure.js in every combination.
// Loads (ASD combinations, ASCE 7-16 2.4.1 with the wind at its characteristic value): see COMBOS.
import { prepare, solveCases, critical, definite, geometric, stiffness, axes, modes, back } from './solve.js';

export const GRAVITY = 9.81;

// Yield and ultimate strength by thickness, N/m^2: [up to this thickness (m), fy, fu]
const S690QL = [[0.05, 690e6, 770e6], [0.1, 650e6, 760e6], [0.15, 630e6, 710e6]];
const S355 = [[0.016, 355e6, 470e6], [0.04, 345e6, 470e6], [0.063, 335e6, 470e6], [0.08, 325e6, 470e6], [0.1, 315e6, 470e6], [0.15, 295e6, 450e6], [0.2, 285e6, 450e6], [0.25, 275e6, 450e6]];
const S235 = [[0.016, 235e6, 360e6], [0.04, 225e6, 360e6], [0.1, 215e6, 360e6], [0.15, 195e6, 350e6], [0.2, 185e6, 340e6], [0.25, 175e6, 340e6]];
// quenched and tempered NiCrMoV forgings (as for turbine rotors), by ruling section: the yield falls off toward the core
const FORGED = [[0.25, 600e6, 750e6], [0.5, 550e6, 700e6], [1.0, 520e6, 670e6], [2.0, 480e6, 640e6], [4.0, 450e6, 620e6]];
const CAST = [[0.1, 300e6, 480e6], [0.25, 280e6, 450e6], [1.0, 260e6, 430e6]];
const BAR = [[0.1, 460e6, 610e6], [0.16, 440e6, 590e6]];          // high-strength tension bar (Macalloy 460 type, EN 1993-1-11)

// Steels carry `bands` (by plate thickness, or by diameter for a solid section) and `ply`, the thickest plate
// that is rolled in that grade (a thicker wall is laminated). Other materials carry a working stress f (tension
// and bending) or fc (bearing). Masonry takes no tension.
export const MATERIAL = {
  alloy: { name: 'S690QL quenched and tempered steel (EN 10025-6)', rho: 7850, E: 205e9, G: 79e9, steel: true, bands: S690QL, ply: 0.1, forged: FORGED },
  s355: { name: 'S355J2 structural steel (EN 10025-2)', rho: 7850, E: 205e9, G: 79e9, steel: true, bands: S355, ply: 0.15 },
  steel: { name: 'S235 mild steel (EN 10025-2)', rho: 7850, E: 205e9, G: 79e9, steel: true, bands: S235, ply: 0.1 },
  castSteel: { name: 'cast steel G20Mn5+QT (EN 10340)', rho: 7850, E: 205e9, G: 79e9, steel: true, bands: CAST, cast: true },
  bar: { name: 'high-strength steel tension bar (EN 1993-1-11)', rho: 7850, E: 205e9, G: 79e9, steel: true, bands: BAR, ply: 0.16, rod: true },
  tendon: { name: 'carbon-fibre tendon', rho: 1600, E: 160e9, G: 5e9, f: 1100e6 },                                  // (no longer used for anything that carries load: it fails in a fire)
  uhpc: { name: 'prestressed ultra-high-performance concrete', rho: 2500, E: 50e9, G: 20e9, f: 0, fc: 60e6 },
  brass: { name: 'brass', rho: 8500, E: 100e9, G: 38e9, f: 50e6, fy: 200e6 },
  castIron: { name: 'cast iron', rho: 7200, E: 100e9, G: 40e9, f: 20e6, fc: 100e6 },
  brick: { name: 'engineering brick in cement mortar', rho: 2100, f: 0, fc: 2.0e6 },
  stone: { name: 'granite', rho: 2650, f: 0, fc: 4.0e6 },
  concrete: { name: 'reinforced concrete, C40/50', rho: 2500, E: 35e9, f: 0, fc: 12e6 },                 // working bearing stress 0.3 fck
  oak: { name: 'oak baulks laid crosswise (EN 338 D30, loaded across the grain)', rho: 750, E: 0.6e9, G: 0.04e9, f: 0, fc: 2.0e6 },   // fc,90,k 5.3 MPa x kmod 0.6 / 1.3, rounded down; a crib takes no tension
};
export const BUCKLING_FACTOR = 4.5;          // what each frame's elastic critical load factor at working load must at least be
export const PHI = 1 / 200;                  // sway imperfection: the notional sideways load, a fraction of the weight
export const DAM = { stiff: 0.8, load: 1.6 };                 // the direct analysis: stiffness factor, and the ASD load factor it is run at
export const ALPHA = 12e-6;                  // steel's thermal expansion per K
export const WARM = 25;                      // the frame warmer (or colder) than its foundation, K
export const QUAKE = 0.05;                   // the earthquake as an equivalent static sideways force, a fraction of the weight (strength level)
// How thick plate is laminated: preloaded M36 stitch bolts in 39 mm holes, at this pitch both ways
export const STITCH = { d: 0.036, hole: 0.039, pitch: 0.3 };
// The foundation under each foot: the rock mass's modulus and Poisson's ratio (a requirement of the site), and how far
// the raft spreads a foot's base plate (half the thinnest raft each side).
export const GROUND = { E: 15e9, nu: 0.25, spread: 3.0 };

// Turning shafts (opts.turns: how many turns one makes in a century). Each fibre of a shaft that carries a bending
// moment goes from tension to compression and back once a turn, so a shaft is checked for fatigue in rotating bending:
// alloy steel of 1,000 MPa, its endurance 195 MPa (half its strength, times 0.6 for the size, 0.8 for a turned surface
// and 0.814 for 99 % survival) from a million turns on, and from 0.9 of its strength at a thousand turns along a straight
// line on log-log axes below that. At the seat of a wheel's hub, where every moment on an arbor peaks, a shrink fit
// raises the stress by Kf; gamma on the stress; the mean shear of the torque it carries, by Goodman.
export const ROTATING = { uts: 1000e6, Se: 195e6, knee: 1e6, Kf: 2.0, gamma: 1.35 };
export const rotatingAllowed = (N) => { const R = ROTATING; return N >= R.knee ? R.Se : 0.9 * R.uts * (Math.max(N, 1e3) / 1e3) ** (Math.log10(R.Se / (0.9 * R.uts)) / 3); };

// A joint within a frame that lands off its point (a stair's bearer built into a wall, on the wall's frame): held to
// where it lands by springs this stiff, N/m and N m/rad, in effect rigid
export const LINK = { k: 1e11, kr: 1e12 };

// What a steel is at thickness t (a plate's, or a solid section's ruling section): { fy, fu }
export function grade(mat, t, bands = mat.bands) {
  if (!bands) return { fy: mat.fy || 0, fu: mat.fu || 0 };
  const b = bands.find(r => t <= r[0] + 1e-9) || bands[bands.length - 1];
  return { fy: b[1], fu: b[2], over: t > bands[bands.length - 1][0] + 1e-9 };
}
// What a section is made of in a steel: how many plies its thickest wall is laminated of and how thick each is,
// the yield and ultimate of the plies, what fraction of it is left at a line of stitch holes, the allowable
// tension stress, how far each ply's stitches are apart against what it may be, and the fatigue size factor.
export function plies(s, mat) {
  const cache = s._g || (s._g = new Map());
  if (cache.has(mat)) return cache.get(mat);
  let out;
  if (!s.plates || !s.plates.length || mat.cast) {
    // a solid section (a forged shaft, a bar), or a casting: one piece, its strength set by its ruling section
    const t = s.plates && s.plates.length ? Math.max(...s.plates.map(p => p.t)) : Math.min(s.dims.h, s.dims.b);
    const g = grade(mat, t, !mat.cast && mat.forged ? mat.forged : mat.bands);
    out = { n: 1, ply: t, fy: g.fy, fu: g.fu, net: mat.rod ? 0.75 : 1, laminated: false, stitch: 0, ks: 1, cat: mat.rod || mat.forged ? 112 : 71, solid: true };
  } else {
    let n = 1, ply = 0, fy = Infinity, fu = Infinity, stitch = 0;
    for (const p of s.plates) {
      const k = Math.max(1, Math.ceil(p.t / mat.ply - 1e-9)), tp = p.t / k, g = grade(mat, tp);
      n = Math.max(n, k); ply = Math.max(ply, tp); fy = Math.min(fy, g.fy); fu = Math.min(fu, g.fu);
      if (k > 1) stitch = Math.max(stitch, STITCH.pitch / (tp * 0.75 * Math.sqrt(mat.E / g.fy)));
    }
    out = { n, ply, fy, fu, net: n > 1 ? 1 - STITCH.hole / STITCH.pitch : 1, laminated: n > 1, stitch, ks: Math.min(1, Math.pow(0.025 / ply, 0.2)), cat: 71 };
  }
  out.Ft = Math.min(0.6 * out.fy, 0.5 * out.fu * out.net);          // AISC D2: yield on the gross section, rupture on the net
  cache.set(mat, out);
  return out;
}

// Sections. Iz resists bending in the vertical plane (see solve.js axes()); Z = I / c.
// Each also knows its plates (for local buckling and lamination), its shear areas and its torsion modulus.
const plyLabel = (t) => { const n = Math.max(1, Math.ceil(t / 0.1 - 1e-9)); return n > 1 ? `${n} x ${Math.round(t / n * 1000)}` : `${Math.round(t * 1000)}`; };
export const SECTION = {
  round: (r) => ({ A: Math.PI * r * r, Iy: Math.PI * r ** 4 / 4, Iz: Math.PI * r ** 4 / 4, J: Math.PI * r ** 4 / 2, Zy: Math.PI * r ** 3 / 4, Zz: Math.PI * r ** 3 / 4, Avy: 0.9 * Math.PI * r * r, Avz: 0.9 * Math.PI * r * r, Wt: Math.PI * r ** 3 / 2, plates: [], dims: { h: 2 * r, b: 2 * r }, label: `${Math.round(r * 2000)} mm round` }),
  bar: (h, b) => ({ A: b * h, Iz: b * h ** 3 / 12, Iy: h * b ** 3 / 12, J: Math.min(b, h) ** 3 * Math.max(b, h) / 3, Zz: b * h * h / 6, Zy: h * b * b / 6, Avy: b * h / 1.2, Avz: b * h / 1.2, Wt: Math.min(b, h) ** 2 * Math.max(b, h) / 3, plates: [], dims: { h, b }, label: `${Math.round(h * 1000)} x ${Math.round(b * 1000)} bar` }),
  // a welded box, h deep (in the member's y'), b wide, of plate t (or tw in the webs and tf in the flanges); a wall
  // thicker than a plate is rolled is laminated of plies (the label says so: '3 x 95' is three plies of 95 mm)
  box: (h, b, t, tf = t) => {
    const tw = t, hi = h - 2 * tf, bi = b - 2 * tw, Iz = (b * h ** 3 - bi * hi ** 3) / 12, Iy = (h * b ** 3 - hi * bi ** 3) / 12, Am = (b - tw) * (h - tf);
    return { A: b * h - bi * hi, Iz, Iy, J: 4 * Am * Am / (2 * (b - tw) / tf + 2 * (h - tf) / tw), Zz: Iz / (h / 2), Zy: Iy / (b / 2), Avy: 2 * tw * h, Avz: 2 * tf * b, Wt: 2 * Am * Math.min(tw, tf),
      plates: [{ c: hi, t: tw }, { c: bi, t: tf }], dims: { h, b, t: tw, tf }, label: `${Math.round(h * 1000)} x ${Math.round(b * 1000)} box, ${plyLabel(tw)}${tf !== tw ? '/' + plyLabel(tf) : ''} plate` };
  },
  // plate girder or I-beam: depth h, flange width b, flange thickness tf, web tw
  I: (h, b, tf, tw) => {
    const hw = h - 2 * tf, Iz = (b * h ** 3 - (b - tw) * hw ** 3) / 12, Iy = (2 * tf * b ** 3 + hw * tw ** 3) / 12, J = (2 * b * tf ** 3 + hw * tw ** 3) / 3;
    return { A: 2 * b * tf + hw * tw, Iz, Iy, J, Zz: Iz / (h / 2), Zy: Iy / (b / 2), Avy: h * tw, Avz: 2 * b * tf, Wt: J / Math.max(tf, tw), plates: [{ c: hw, t: tw }, { c: (b - tw) / 2, t: tf, outstand: true }], dims: { h, b, tf, tw }, label: `${Math.round(h * 1000)} x ${Math.round(b * 1000)} girder` };
  },
};
// how slender a plate may be before it buckles before it yields: AISC 360 Table B4.1a, walls of a box 1.40 sqrt(E / fy),
// an outstand 0.56 sqrt(E / fy)
export const plateLimit = (fy, outstand = false, E = 205e9) => (outstand ? 0.56 : 1.40) * Math.sqrt(E / fy);

// ---- wind
// The basic wind speed is a requirement of the site: 25 m/s (10-minute mean at 10 m, open country, terrain category
// II, 50 years). EN 1991-1-4's profile then gives a peak velocity pressure of 1.85 kPa at the wall head, 240 m: WIND_Q is
// taken over the whole height of the walls (which overstates it lower down). Above 240 m it follows the same profile
// (EN 1991-1-4 stops at 200 m; a wind tunnel test is required before anything is built): windAt(y).
export const WIND_Q = 1.9e3;
const prof = (z) => { const l = Math.log(Math.max(z, 10) / 0.05); return (1 + 7 / l) * l * l; };
export const windAt = (y) => WIND_Q * Math.max(1, prof(y) / prof(240));
// External pressure coefficients on a face with outward normal n in a wind blowing along d: 0.8 on the face it blows on,
// -0.6 on the face behind, -0.9 on the faces it runs along (an average of zones A and B, EN 1991-1-4 7.2.2)
export const cpe = (n, d) => { const c = n[0] * d[0] + n[2] * d[2]; return c < -0.5 ? 0.8 : c > 0.5 ? -0.6 : -0.9; };
export const WINDS = { 'wind +x': [1, 0, 0], 'wind -x': [-1, 0, 0], 'wind +z': [0, 0, 1], 'wind -z': [0, 0, -1] };

// ---- load cases and their combinations
// Each force, and each load along a member, belongs to a case. 'dead' is what is always there
// (every weight); 'teeth' the wheels pushing on one another while the weight drives the train,
// which is as permanent as the weight; 'pendulum' the pendulum's pull at the end of its swing,
// which reverses every beat; 'winding' what the engine's winding gear puts on while it winds;
// 'sway x' and 'sway z' the sway imperfection (filled in by analyse()); 'wind ±x', 'wind ±z' the
// outside pressure of a wind blowing that way, and 'inside' an inside pressure of 1 kPa outward;
// 'live 1' and 'live 2' the crowds on the public floors, in two patterns (a checkerboard, see LIVE);
// 'warm' every steel member WARM degrees warmer than the foundation (an assembly's `temp`, if it says otherwise), and
// the faces that see the sun warmer still (an assembly's `warm`: { n, dT }). The earthquake is QUAKE of the weight sideways: QUAKE / PHI times a sway case.
export const CASES = ['dead', 'teeth', 'pendulum', 'winding', 'sway x', 'sway z', 'wind +x', 'wind -x', 'wind +z', 'wind -z', 'inside', 'live 1', 'live 2', 'warm'];
// The crowds: LIVE.q on every public floor, stair and landing, in squares LIVE.cell on a side, alternate squares in the
// two patterns.
export const LIVE = { q: 5.0e3, cell: 20 };
export const liveCase = (p) => ((Math.floor(p[0] / LIVE.cell) + Math.floor(p[2] / LIVE.cell)) & 1) ? 'live 2' : 'live 1';
const SWAYS = [['sway x', 1, '+x'], ['sway x', -1, '-x'], ['sway z', 1, '+z'], ['sway z', -1, '-z']];
const WIND_SWAY = [['wind +x', 'sway x', 1], ['wind -x', 'sway x', -1], ['wind +z', 'sway z', 1], ['wind -z', 'sway z', -1]];
const PATTERNS = [[{ 'live 1': 1, 'live 2': 1 }, 'crowds everywhere'], [{ 'live 1': 1 }, 'crowds on one pattern'], [{ 'live 2': 1 }, 'crowds on the other']];
export const COMBOS = [];
// A dominant opening (the dial, if its glass were broken): the inside then takes 0.9 of the outside pressure where the
// opening is (EN 1991-1-4 7.2.9). An accidental situation, checked here as an ordinary one.
let opening = null;
export function setOpening(n) { opening = n; buildCombos(); }
function buildCombos() {
  COMBOS.length = 0;
  const add = (name, f) => COMBOS.push({ name, f });
  const pen = (p) => `pendulum ${p > 0 ? 'right' : 'left'}`;
  for (const [s, k, d] of SWAYS) add(`stopped, leaning ${d}`, { dead: 1, [s]: k });
  for (const w of [0, 1]) for (const p of [1, -1]) for (const [s, k, d] of SWAYS) add(`${w ? 'winding' : 'going'}, ${pen(p)}, leaning ${d}`, { dead: 1, teeth: 1, pendulum: p, winding: w, [s]: k });
  for (const [L, ln] of PATTERNS) for (const p of [1, -1]) for (const [s, k, d] of SWAYS) add(`${ln}, ${pen(p)}, leaning ${d}`, { dead: 1, teeth: 1, pendulum: p, ...L, [s]: k });
  for (const [wd, s, k] of WIND_SWAY) for (const cpi of [0.2, -0.3]) for (const p of [1, -1]) {
    const inside = cpi * WIND_Q / 1e3, ins = `${cpi > 0 ? 'pressure' : 'suction'} inside`;
    add(`${wd}, ${ins}, ${pen(p)}`, { dead: 1, teeth: 1, pendulum: p, [wd]: 1, inside, [s]: k });
    add(`${wd} at 0.75 with crowds at 0.75, ${ins}, ${pen(p)}`, { dead: 1, teeth: 1, pendulum: p, 'live 1': 0.75, 'live 2': 0.75, [wd]: 0.75, inside: 0.75 * inside, [s]: k });
    add(`${wd} lifting 0.6 of the weight, ${ins}, ${pen(p)}`, { dead: 0.6, teeth: 0.6, pendulum: 0.6 * p, [wd]: 1, inside, [s]: 0.6 * k });
  }
  if (opening) for (const [wd, s, k] of WIND_SWAY) for (const p of [1, -1])
    add(`${wd}, the dial's glass broken (inside ${(0.9 * cpe(opening, WINDS[wd])).toFixed(2)}), ${pen(p)}`, { dead: 1, teeth: 1, pendulum: p, [wd]: 1, inside: 0.9 * cpe(opening, WINDS[wd]) * WIND_Q / 1e3, [s]: k });
  for (const t of [1, -1]) for (const p of [1, -1]) for (const [s, k, d] of SWAYS) add(`${t > 0 ? 'warm' : 'cold'}, ${pen(p)}, leaning ${d}`, { dead: 1, teeth: 1, pendulum: p, warm: t, [s]: k });
  // the earthquake at 0.7 (ASCE 7 ASD), with the sway imperfection on top
  const E = 0.7 * QUAKE / PHI;
  for (const p of [1, -1]) for (const [s, k, d] of SWAYS) { add(`earthquake ${d}, ${pen(p)}`, { dead: 1, teeth: 1, pendulum: p, [s]: k * (E + 1) }); add(`earthquake ${d} lifting 0.6 of the weight, ${pen(p)}`, { dead: 0.6, teeth: 0.6, pendulum: 0.6 * p, [s]: k * (E + 0.6) }); }
}
buildCombos();
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
  // On the ground it stands on springs (GROUND): opts.foot [along x, along z] is its base plate, if it is not the
  // size of what stands on it.
  // (hold: 'fix', 'pin', the axes held ('xz'...), or six 0/1, the translations and rotations held)
  rest(p, on, hold = 'pin', opts = null) { this.rests.push({ n: this.node(p), on, hold, foot: opts && opts.foot }); return this; }
  // This point is kept from moving along one axis ('x', 'y' or 'z') by something that carries no
  // weight from it: the purlins that stop a truss falling over sideways, for instance. What it
  // pushes with is handed on to `on` (an assembly) at the point `at`, so it is not lost. It is a
  // connector of opts.section in opts.material (S355 box 500 x 500 x 25 if not said) from the point to `at`,
  // as stiff as that; opts.drawn says it is drawn by whoever declared it (otherwise structure.js draws it); opts.buckle
  // the length it would buckle over, if it is held part way along (a purlin, by every truss it passes).
  brace(p, axis, on = null, at = null, opts = null) { this.braces.push({ n: this.node(p), d: 'xyz'.indexOf(axis), on, at, ...(opts || {}) }); return this; }
}

export function assembly(name, note = '') {
  if (!assemblies.has(name)) assemblies.set(name, new Assembly(name, note));
  return assemblies.get(name);
}
export function resetStructure() { assemblies.clear(); cache.clear(); }
// Start an assembly again from nothing (used while the designer is trying sizes).
export function redeclare(name, note = '') { assemblies.delete(name); return assembly(name, note); }
export const forget = (name) => assemblies.delete(name);
export const getAssembly = (name) => assemblies.get(name);
export const allAssemblies = () => [...assemblies.values()];
export const BRACE_SECTION = () => SECTION.box(0.5, 0.5, 0.025);

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

// AISC 360 E3: the critical stress of a column of slenderness KL/r (K = 1)
function fcr(fy, E, Lr) {
  if (!(Lr > 0)) return fy;
  const Fe = Math.PI ** 2 * E / (Lr * Lr);
  return fy / Fe <= 2.25 ? Math.pow(0.658, fy / Fe) * fy : 0.877 * Fe;
}
const OMEGA = 1.67;
const RIGOROUS = 2 * BUCKLING_FACTOR;      // below it the second-order analysis is done outright (above, B2 is at most 1.29)

// The largest |M| along a member: end moments joined by the parabola of a uniform load.
// m(x) = m0 + v x + w x^2 / 2.
function peak(m0, v, w, L) {
  let best = Math.max(Math.abs(m0), Math.abs(m0 + v * L + w * L * L / 2));
  if (w) { const x = -v / w; if (x > 0 && x < L) best = Math.max(best, Math.abs(m0 + v * x + w * x * x / 2)); }
  return best;
}
// moment-gradient factor for a member's own bowing (AISC App. 8 Cm): 1 with a load along it, 0.6 - 0.4 M1 / M2 otherwise
function cm(ma, mb, w, L) {
  const big = Math.max(Math.abs(ma), Math.abs(mb));
  if (!big || Math.abs(w) * L * L / 8 > 0.1 * big) return 1;
  const s = Math.min(Math.abs(ma), Math.abs(mb)) / big * Math.sign(ma * mb);
  return Math.max(0.4, 0.6 + 0.4 * s);
}

// How hard one member is working in one combination, as a fraction of what it can take.
// f: its twelve end forces in its own axes (from the direct analysis, divided back to working level), q: its load per
// metre in its own axes, L its length, Ls its system lengths [in its y', in its z'].
function utilisation(m, f, q, L, Ls) {
  const s = m.section, mat = m.material;
  const Na = -f[0], Nb = f[6], N = Math.min(Na, Nb), Nt = Math.max(Na, Nb);
  if (!mat.steel) return masonryOrBrass(m, f, q, L);
  const g = plies(s, mat), fy = g.fy, E = mat.E, rz = Math.sqrt(s.Iz / s.A), ry = Math.sqrt(s.Iy / s.A);
  const Fc = Math.min(fcr(fy, E, Ls[0] / rz), fcr(fy, E, Ls[1] / ry)) / OMEGA;
  if (m.kind === 'tie') {
    // (one that this combination would push goes slack in it: what it held is then held by what else holds it there)
    if (N < -0.02 * s.A * g.Ft) return { u: 0, why: 'slack', slackIn: true, stress: 0 };
    return { u: Math.max(0, Nt) / s.A / g.Ft, why: 'tension', stress: Math.max(0, Nt) / s.A };
  }
  if (m.kind === 'link') {
    if (N >= 0) return { u: Nt / s.A / g.Ft, why: 'tension', stress: Nt / s.A };
    return { u: -N / s.A / Fc, why: 'buckling', stress: -N / s.A };
  }
  // bending about z' (in the member's y' direction) and about y'
  const mz0 = -f[5], mzL = f[11], my0 = -f[4], myL = f[10];
  const Mz = peak(mz0, f[1], q[1], L), My = peak(my0, -f[2], -q[2], L);
  const Mcz = 0.6 * fy * s.Zz, Mcy = 0.6 * fy * s.Zy;
  let Pr, Pc, Bz = 1, By = 1, why;
  if (N < 0) {
    Pr = -N; Pc = Fc * s.A;
    // B1: the member's own bowing between the points that hold it, with 0.8 EI, at 1.6 times its force
    const Pez = Math.PI ** 2 * DAM.stiff * E * s.Iz / Ls[0] ** 2, Pey = Math.PI ** 2 * DAM.stiff * E * s.Iy / Ls[1] ** 2;
    const az = 1 - DAM.load * Pr / Pez, ay = 1 - DAM.load * Pr / Pey;
    if (az <= 0 || ay <= 0) return { u: Infinity, why: 'buckling', stress: Pr / s.A };
    Bz = Math.max(1, cm(mz0, mzL, q[1], L) / az); By = Math.max(1, cm(my0, myL, q[2], L) / ay);
  } else { Pr = Nt; Pc = g.Ft * s.A; }
  const mr = Bz * Mz / Mcz + By * My / Mcy, pr = Pr / Pc;
  let u = pr >= 0.2 ? pr + 8 / 9 * mr : pr / 2 + mr;
  why = mr > pr ? (N < 0 && pr > 0.1 ? 'buckling with bending' : 'bending') : N < 0 ? 'buckling' : 'tension';
  // shear and twisting (AISC G and H3): 0.6 fy / 1.67 each, together by H3-6 where the twisting counts
  const Vc = 0.6 * fy / OMEGA, V = Math.max(Math.abs(f[1]), Math.abs(f[7])) / s.Avy + Math.max(Math.abs(f[2]), Math.abs(f[8])) / s.Avz, T = Math.abs(f[3]) / s.Wt;
  const uv = V / Vc, ut = T / Vc;
  if (uv + ut > u) { u = uv + ut; why = ut > uv ? 'torsion' : 'shear'; }
  if (ut > 0.2) { const c = (pr >= 0.2 ? pr + 8 / 9 * mr : pr / 2 + mr) + (uv + ut) ** 2; if (c > u) { u = c; why = 'bending with torsion'; } }
  // a laminated wall in compression: each ply between its stitches
  if (g.laminated && (N < 0 || mr > 0) && g.stitch > u) { u = g.stitch; why = 'plies buckling between stitches'; }
  return { u, why, stress: (Pr / s.A) + Mz / s.Zz + My / s.Zy, B: Math.max(Bz, By) };
}
// brass, cast iron, concrete: their working stress, as before
function masonryOrBrass(m, f, q, L) {
  const s = m.section, mat = m.material, fw = mat.f || mat.fc || 1;
  const Na = -f[0], Nb = f[6], N = Math.min(Na, Nb), Nt = Math.max(Na, Nb);
  if (m.kind === 'tie') {
    if (N < -0.02 * s.A * fw) return { u: Infinity, why: 'a rod cannot push', stress: -N / s.A };
    return { u: Math.max(0, Nt) / s.A / fw, why: 'tension', stress: Math.max(0, Nt) / s.A };
  }
  const Mz = peak(-f[5], f[1], q[1], L), My = peak(-f[4], -f[2], -q[2], L);
  const fa = Math.max(Math.abs(Na), Math.abs(Nb)) / s.A, fb = Mz / s.Zz + My / s.Zy;
  return { u: (fa + fb) / fw, why: fb > fa ? 'bending' : N < 0 ? 'compression' : 'tension', stress: fa + fb };
}
// The stress range in a member from one case alone (the pendulum, a winding).
function range(m, f, q, L) {
  const s = m.section, Mz = peak(-f[5], f[1], q[1], L), My = peak(-f[4], -f[2], -q[2], L);
  return Math.max(Math.abs(f[0]), Math.abs(f[6])) / s.A + (m.kind === 'tie' ? 0 : Mz / s.Zz + My / s.Zy);
}
// The fatigue limits (EN 1993-1-9, gamma_Mf 1.35) of a detail category: below the cut-off, for what comes every beat;
// the endurance at 440,000 cycles, for the windings
// (cat in MPa, as the code names it; the limits in Pa)
export const FATIGUE = { pendulum: (cat) => cat * 1e6 * 0.737 * 0.549 / 1.35, winding: (cat) => cat * 1e6 * Math.cbrt(2e6 / 4.4e5) / 1.35 };
// The plate that is most slender for what its steel can take, as a fraction of the limit (a laminated wall is one
// plate: its plies are stitched to act as one).
function plates(m) {
  const mat = m.material, s = m.section;
  if (!mat.steel || !s.plates || !s.plates.length) return 0;
  const fy = plies(s, mat).fy;
  return Math.max(0, ...s.plates.map(p => p.c / p.t / plateLimit(fy, p.outstand, mat.E)));
}

// The springs a foot stands on: its base plate B (along x) by D (along z), spread through the raft onto the rock,
// on an elastic half-space (Gazetas 1991): [x, y, z, rx, ry, rz], with x, z and the twist held.
export function footSprings(B, D) {
  const { E, nu, spread } = GROUND, Gs = E / (2 * (1 + nu)), bx = B + spread, dz = D + spread;
  const L = Math.max(bx, dz) / 2, b = Math.min(bx, dz) / 2, chi = b / L;
  const kv = 2 * Gs * L / (1 - nu) * (0.73 + 1.54 * chi ** 0.75);
  const Ilong = (2 * L) * (2 * b) ** 3 / 12, Ishort = (2 * b) * (2 * L) ** 3 / 12;
  const kLong = Gs / (1 - nu) * Ilong ** 0.75 * (L / b) ** 0.25 * (2.4 + 0.5 * b / L), kShort = 3 * Gs / (1 - nu) * Ishort ** 0.75 * (L / b) ** 0.15;
  // rocking about the long axis is the softer
  const [krx, krz] = bx >= dz ? [kLong, kShort] : [kShort, kLong];
  return { kv, krx, krz, area: bx * dz };
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
// opts.exact: also confirm each frame's stability exactly (a factorisation of K + 4.5 Kg).
export function analyse(opts = {}) {
  const groups = new Map(), groupOf = new Map();
  // Frames joined by a brace are one frame (what leans on a frame is that frame's load), unless one also rests on the
  // other on bearings that let it move (a roof truss on its shoe is held sideways by its purlins, not built in).
  const root = new Map(), find = (g) => { while (root.get(g) !== g) g = root.get(g); return g; };
  const size = new Map();
  for (const A of assemblies.values()) { const g = A.frame || A.name; root.set(g, g); size.set(g, (size.get(g) || 0) + 1); }
  const g0 = (A) => A.frame || A.name, loose = new Set();
  for (const A of assemblies.values()) for (const r of A.rests) { const B = assemblies.get(r.on); if (B && r.hold !== 'fix') loose.add(`${g0(A)}|${g0(B)}`); }
  for (const A of assemblies.values()) for (const b of A.braces) {
    const B = b.on && assemblies.get(b.on); if (!B) continue;
    const ga = g0(A), gb = g0(B);
    if (ga === gb || loose.has(`${ga}|${gb}`) || loose.has(`${gb}|${ga}`)) continue;
    const ra = find(ga), rb = find(gb); if (ra === rb) continue;
    const [big, small] = (size.get(ra) || 0) >= (size.get(rb) || 0) ? [ra, rb] : [rb, ra];
    root.set(small, big); size.set(big, (size.get(big) || 0) + (size.get(small) || 0));
  }
  for (const A of assemblies.values()) {
    const g = find(g0(A));
    if (!groups.has(g)) groups.set(g, { name: g, list: [] });
    groups.get(g).list.push(A); groupOf.set(A.name, g);
  }
  // joints inside a frame: a rest on an assembly of the same frame is a joint, where it lands on that assembly (on its
  // nearest member, where it reaches, as a load from another frame would); and a brace within a frame lands on the
  // nearest member of what it is braced to
  for (const A of assemblies.values()) for (const r of A.rests) {
    r.land = null;
    if (groupOf.get(r.on) !== groupOf.get(A.name) || r.on === A.name) continue;
    const B = assemblies.get(r.on), q = A.nodes[r.n].p; r.land = B.reach ? nearest(B, q) : q; B.node(r.land);
  }
  for (const A of assemblies.values()) for (const b of A.braces) {
    const B = b.on && assemblies.get(b.on); b.land = null;
    if (B && groupOf.get(b.on) === groupOf.get(A.name)) { const q = b.at || A.nodes[b.n].p; b.land = B.reach ? nearest(B, q) : q; B.node(b.land); }
  }
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
  return { rows, terminal, frames, groupOf, ok: rows.every(r => r.ok), ms: Object.fromEntries([...frames].map(([k, f]) => [k, f.ms])) };
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
  const nm = members.length;
  const rows = list.map(A => ({ name: A.name, note: A.note, frame: grp.name, members: A.members.length, weight: 0, carried: 0, byLabel: {}, whyLabel: {} }));
  const supports = [], springs = [];
  const holds = (h) => (Array.isArray(h) ? h.slice() : h === 'fix' ? [1, 1, 1, 1, 1, 1] : h === 'pin' ? [1, 1, 1, 0, 0, 0] : [+h.includes('x'), +h.includes('y'), +h.includes('z'), 0, 0, 0]);
  list.forEach((A, ai) => {
    for (const r of A.rests) {
      if (groupOf.get(r.on) === grp.name) {
        // a joint within the frame. Where it lands off the point (on the nearest member of a frame in a wall, the wall
        // between), it is held to where it lands in the freedoms the joint holds: LINK, many times stiffer than any member
        const n = local[ai][r.n], q = r.land ? nodeOf(r.land) : n, h = holds(r.hold);
        if (q !== n) {
          const p = nodes[n].p, rr = [0, 1, 2].map(i => p[i] - nodes[q].p[i]);
          for (let d = 0; d < 3; d++) {
            const e = [0, 0, 0]; e[d] = 1; const rxd = [rr[1] * e[2] - rr[2] * e[1], rr[2] * e[0] - rr[0] * e[2], rr[0] * e[1] - rr[1] * e[0]];
            if (h[d]) springs.push({ a: n, b: q, spring: [[LINK.k, [...e, 0, 0, 0, ...e.map(v => -v), ...rxd.map(v => -v)]]], link: true, k: LINK.k });
            if (h[3 + d]) springs.push({ a: n, b: q, spring: [[LINK.kr, [0, 0, 0, ...e, 0, 0, 0, ...e.map(v => -v)]]], link: true, k: LINK.kr });
          }
        }
        continue;
      }
      const n = local[ai][r.n];
      let fix = holds(r.hold);
      let foot = null;
      if (r.on === 'ground' && fix[1]) {
        // on the ground: on the springs of its foot, held sideways and against twisting
        let B = r.foot?.[0], D = r.foot?.[1];
        if (!B) {
          B = 1.0; D = 1.0;
          for (const m of A.members) if (m.a === r.n || m.b === r.n) {
            const pa = A.nodes[m.a].p, pb = A.nodes[m.b].p, R = axes(pa, pb), h = m.section.dims.h, w = m.section.dims.b;
            B = Math.max(B, Math.abs(R[1][0]) * h + Math.abs(R[2][0]) * w + 1.0); D = Math.max(D, Math.abs(R[1][2]) * h + Math.abs(R[2][2]) * w + 0.5);
          }
        }
        const k = footSprings(B, D);
        foot = { B, D, ...k };
        const sp = [0, k.kv, 0, fix[3] ? k.krx : 0, 0, fix[5] ? k.krz : 0];
        fix = [fix[0], 0, fix[2], 0, fix[4], 0];
        nodes[n].spring = nodes[n].spring ? nodes[n].spring.map((v, i) => v + sp[i]) : sp;
      }
      nodes[n].fix = nodes[n].fix ? nodes[n].fix.map((v, i) => v || fix[i]) : fix;
      supports.push({ n, on: r.on, from: A.name, p: nodes[n].p, hold: r.hold, foot });
    }
    for (const b of A.braces) {
      const n = local[ai][b.n], p = nodes[n].p, d = [0, 0, 0]; d[b.d] = 1;
      const sec = b.section || BRACE_SECTION(), mat = b.material || MATERIAL.s355;
      if (b.land) {
        // within the frame: a spring from the point to where it lands, along the axis (the far end a rigid arm)
        const q = nodeOf(b.land), r = [0, 1, 2].map(i => p[i] - nodes[q].p[i]), L = Math.max(0.3, Math.hypot(...r)), k = mat.E * sec.A / L;
        const rxd = [r[1] * d[2] - r[2] * d[1], r[2] * d[0] - r[0] * d[2], r[0] * d[1] - r[1] * d[0]];
        springs.push({ a: n, b: q, spring: [[k, [...d, 0, 0, 0, ...d.map(v => -v), ...rxd.map(v => -v)]]], brace: b, owner: ai, L, sec, mat, k });
        continue;
      }
      // on another frame (or on nothing, in a test): a spring to it as stiff as the connector, or held rigidly if there is none
      const L = b.at ? Math.max(0.3, Math.hypot(...[0, 1, 2].map(i => p[i] - b.at[i]))) : 0.3;
      if (b.section || b.k) { const k = b.k || mat.E * sec.A / L; nodes[n].spring = nodes[n].spring || [0, 0, 0, 0, 0, 0]; nodes[n].spring[b.d] += k; supports.push({ n, on: b.on, from: A.name, p: b.at || p, only: b.d, brace: true, k, L, sec, mat, b, owner: ai }); }
      else { nodes[n].fix = nodes[n].fix || [0, 0, 0, 0, 0, 0]; nodes[n].fix[b.d] = 1; supports.push({ n, on: b.on, from: A.name, p: b.at || p, only: b.d, brace: true, b, owner: ai, L, sec, mat }); }
    }
  });
  if (!supports.some(s => !s.brace)) { rows.forEach(r => { r.ok = false; r.verdict = 'rests on nothing'; }); return { rows, handed: [] }; }
  // A lone member on simple bearings is free to spin about its own axis: a mechanism on paper,
  // of no interest in practice. Where only one line of members reaches a bearing, the bearing
  // also stops it turning about that line.
  for (const s of supports) {
    if (s.brace || s.hold === 'fix' || Array.isArray(s.hold)) continue;
    const dirs = mem.map((m, k) => [m, members[k]]).filter(([m, mm]) => mm.kind !== 'tie' && (m.a === s.n || m.b === s.n)).map(([m]) => { const a = nodes[m.a].p, b = nodes[m.b].p, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d); return d.map(v => Math.abs(v) / l); });
    if (dirs.length && dirs.every(d => d.every((v, k) => Math.abs(v - dirs[0][k]) < 0.02))) nodes[s.n].fix[3 + dirs[0].indexOf(Math.max(...dirs[0]))] = 1;
  }

  // ---- the loads, case by case
  const nn = nodes.length, cases = new Map();
  const C = (name) => { if (!cases.has(name)) cases.set(name, { name, loads: new Float64Array(6 * nn), lines: new Map(), strains: null }); return cases.get(name); };
  C('dead');
  const vertical = new Float64Array(nn);                    // the frame's own weight at each joint, for its sway imperfection
  const massAt = new Float64Array(nn);                      // and its mass, for its natural frequencies
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
    for (const q of A.incoming) { const n = local[ai][q.n]; for (const [cs, f] of Object.entries(q.cases)) { const L = C(cs).loads; for (let d = 0; d < 6; d++) L[6 * n + d] += f[d]; } rows[ai].carried += Math.abs(q.cases.dead ? q.cases.dead[1] : 0); if (q.cases.dead) massAt[n] += Math.max(0, -q.cases.dead[1]) / GRAVITY; }
  });
  for (let n = 0; n < nn; n++) { massAt[n] += vertical[n] / GRAVITY; if (vertical[n] > 0) { C('sway x').loads[6 * n] += PHI * vertical[n]; C('sway z').loads[6 * n + 2] += PHI * vertical[n]; } }
  // warmth: every steel member WARM degrees over its foundation, and an assembly's sunny face warmer still across it.
  // Only the ground holds a frame against growing as it warms: one that rests on another frame (a roof truss on the
  // walls, a walkway hung from the roof) moves with it, the two being equally warm, and is only bent by its sunny face.
  {
    const st = new Map(), grounded = supports.every(s => s.brace || s.on === 'ground');
    members.forEach((m, k) => {
      if (!m.material.steel) return;
      const sun = list[owner[k]].warm, s = [grounded ? ALPHA * (list[owner[k]].temp ?? WARM) : 0, 0, 0];
      if (!sun && !s[0]) return;
      if (sun) {
        const R = axes(nodes[mem[k].a].p, nodes[mem[k].b].p), ny = sun.n[0] * R[1][0] + sun.n[1] * R[1][1] + sun.n[2] * R[1][2], nz = sun.n[0] * R[2][0] + sun.n[1] * R[2][1] + sun.n[2] * R[2][2];
        const across = Math.abs(ny) * m.section.dims.h + Math.abs(nz) * m.section.dims.b, g = sun.dT / Math.max(0.1, across);
        s[1] = -ALPHA * g * ny; s[2] = -ALPHA * g * nz;
      }
      st.set(k, s);
    });
    if (st.size) C('warm').strains = st;
  }
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
  for (const nd of nodes) { for (const v of nd.p) hs.num(v); if (nd.fix) hs.str(nd.fix.join('')); if (nd.spring) for (const v of nd.spring) hs.num(v); }
  members.forEach((m, k) => { hs.num(mem[k].a); hs.num(mem[k].b); for (const v of [m.section.A, m.section.Iy, m.section.Iz, m.section.J, m.section.Zy, m.section.Zz, m.material.E, m.material.rho]) hs.num(v); hs.str(m.kind + m.label + m.material.name); });
  for (const s of springs) { hs.num(s.a); hs.num(s.b); hs.num(s.k); }
  for (const c of caseList) { hs.str(c.name); for (let i = 0; i < c.loads.length; i++) if (c.loads[i]) { hs.num(i); hs.num(c.loads[i]); } for (const [k, v] of c.lines) { hs.num(k); for (const x of v) hs.num(x); } if (c.strains) for (const [k, v] of c.strains) { hs.num(k); for (const x of v) hs.num(x); } }
  for (const cb of combos) hs.str(cb.name);
  for (const A of list) { if (A.dynamic) hs.str('dyn'); if (A.slender) hs.str('slender' + JSON.stringify(A.slender)); }
  const sig = hs.done();
  const hit = cache.get(grp.name);
  if (hit && hit.sig === sig) {
    // (the same frame asked for again, now to be confirmed exactly: only that is still to do)
    if (opts.exact && !hit.confirmed && hit.M) confirm(hit);
    return hit.out;
  }

  // ---- first order. A rod that the first solution puts in compression would in fact hang
  // slack. Take the slack ones out and solve again, until every rod left is pulling.
  const tA = performance.now();
  let live = members.map((_, k) => k), sol = null, slack = 0, M = null;
  const asSolver = (k) => { const m = members[k]; return { a: mem[k].a, b: mem[k].b, E: m.material.E, G: m.material.G, ...m.section, axial: m.kind === 'tie' || m.kind === 'link' }; };
  const caseFor = (ks) => caseList.map(c => ({ loads: c.loads, lines: new Map([...c.lines].filter(([k]) => ks.has(k)).map(([k, v]) => [ks.get(k), v])), strains: c.strains && new Map([...c.strains].filter(([k]) => ks.has(k)).map(([k, v]) => [ks.get(k), v])) }));
  let map;
  for (let pass = 0; pass < 12; pass++) {
    map = new Map(live.map((k, i) => [k, i]));
    M = prepare(nodes, [...live.map(asSolver), ...springs]);
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
  const nl = live.length;
  // the axial force in each member, at its most compressive over every combination (springs: none)
  const Nof = (cs, i) => { const f = cs.forces[i].f; return Math.min(-f[0], f[6]); };
  // (a rod cannot push: one that some combination would push goes slack in it, and adds nothing to the frame's buckling)
  const Nenv = [...live.map((k, i) => members[k].kind === 'tie' ? 0 : Math.min(0, ...combos.map(cb => cb.f.reduce((s, [c, v]) => s + v * Nof(sol.cases[c], i), 0)))), ...springs.map(() => 0)];
  // ---- stability, at working load, nominal stiffness
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
    share = M.el.slice(0, nl).map((e) => { const u = Array.from(e.idx, i => U[i]); let s = 0; for (let i = 0; i < 12; i++) { let t = 0; for (let j = 0; j < 12; j++) t += e.kg[i * 12 + j] * u[j]; s += u[i] * t; } return s; });
    const tot = share.reduce((a, b) => a + b, 0) || 1; share = share.map(v => v / tot);
  }
  // ---- the direct analysis: 1.6 times the loads, 0.8 of the stiffness, divided back (solve.js). A frame less stable than
  // RIGOROUS is solved to second order outright, so that each member is amplified by as much as the frame's modes bend
  // it: in a frame of many parts (the walls with the stair towers braced to them) the least stable mode may be one part's
  // alone, and amplifying every member by it would load the walls with a stair tower's instability. A frame stable
  // enough is analysed to first order and amplified (AISC 360 Appendix 8 with the direct analysis's reduced stiffness and
  // notional loads): every force, not only the sway's, by B2 = 1 / (1 - 1.6 / (0.8 lambda)), the largest any of its modes
  // is amplified by (at most 1.29), and its movements at working load by 1 / (1 - 1 / lambda).
  const kS = DAM.stiff / DAM.load, damOK = lambda * kS > 1.02;
  let dam = sol, svc = sol;
  const scaled = (s, a) => ({ ...s, cases: s.cases.map(c => ({ ...c, u: c.u.map(v => v * a), reactions: c.reactions, forces: c.forces.map(f => ({ ...f, f: f.f.map(v => v * a), q: f.q })) })) });
  if (damOK && lambda < RIGOROUS) {
    // (should the solve find the frame unstable after all, it is amplified as a stable one would be, never left at first order)
    const d2 = solveCases(M, caseFor(map), { N: Nenv, K: sol.K, kScale: kS, gScale: 1 });
    dam = d2.unstable ? scaled(sol, 1 / (1 - 1 / (lambda * kS))) : d2;
    const s2 = solveCases(M, caseFor(map), { N: Nenv, K: sol.K });
    svc = s2.unstable ? scaled(sol, 1 / (1 - 1 / lambda)) : s2;
  } else if (damOK && isFinite(lambda)) { dam = scaled(sol, 1 / (1 - 1 / (lambda * kS))); svc = scaled(sol, 1 / (1 - 1 / lambda)); }
  const tD = performance.now();
  const frame = { name: grp.name, nodes, index, lambda, exact, converged: crit.converged, mode: U, parts: [tB - tA, tC - tB, tD - tC].map(Math.round), steps: crit.steps, cases: Object.fromEntries(caseList.map((c, i) => [c.name, svc.cases[i].u])), members: nl, eqs: M.neq, assemblies: list.map(A => A.name) };
  // ---- what each group of members does for a movement of the frame, or for a natural frequency. A movement is c'u: c
  // unit pushes at the points it is measured at, u the frame's displacement under some combination of cases. With v the
  // displacement c itself would cause, c'u = v'Ku = the sum over the members of v'K_m u: each member's share of the
  // movement, of which stiffening it k times takes off about (1 - 1/k) (exactly, were the frame statically determinate).
  // A mode's frequency squared is its strain energy over its kinetic energy, and stiffening a member k times adds (k - 1)
  // times its share of the strain energy. energy(u, v) gives the shares by group (assembly|label), with what the joints'
  // springs and the ground take as 'joints' and 'ground'; virtual(c) gives v.
  const keyOf = live.map(k => `${list[owner[k]].name}|${members[k].label}`);
  frame.energy = (Uu, V = Uu) => {
    const out = { joints: 0, ground: 0 };
    for (let i = 0; i < M.el.length; i++) {
      const e = M.el[i], kk = i < nl ? keyOf[i] : 'joints'; let s = 0;
      for (let a = 0; a < 12; a++) { const ua = Uu[e.idx[a]]; if (!ua) continue; let t = 0; for (let b = 0; b < 12; b++) t += e.kg[a * 12 + b] * V[e.idx[b]]; s += ua * t; }
      if (s) out[kk] = (out[kk] || 0) + s;
    }
    for (const [g, , k] of M.ground) out.ground += k * Uu[g] * V[g];
    return out;
  };
  frame.virtual = (c) => {
    const u = new Float64Array(M.neq); for (let i = 0; i < 6 * nn; i++) if (M.dof[i] >= 0) u[M.dof[i]] = c[i];
    back(M, sol.FK, u);
    const V = new Float64Array(6 * nn); for (let i = 0; i < 6 * nn; i++) if (M.dof[i] >= 0) V[i] = u[M.dof[i]];
    return V;
  };

  // ---- the members' system lengths: how far each runs, in each plane, between points that hold it there
  const ends = live.map(k => [mem[k].a, mem[k].b]), dirOf = live.map(k => { const a = nodes[mem[k].a].p, b = nodes[mem[k].b].p, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d); return d.map(v => v / l); });
  const inc = Array.from({ length: nn }, () => []);
  live.forEach((k, i) => { inc[ends[i][0]].push(i); inc[ends[i][1]].push(i); });
  const held = new Map();                 // node -> axes it is held along by springs
  for (const s of springs) { const d = s.spring[0][1]; for (const n of [s.a, s.b]) (held.get(n) || held.set(n, []).get(n)).push([d[0], d[1], d[2]]); }
  for (let n = 0; n < nn; n++) if (nodes[n].spring) { const v = nodes[n].spring; for (let t = 0; t < 3; t++) if (v[t]) (held.get(n) || held.set(n, []).get(n)).push([+(t === 0), +(t === 1), +(t === 2)]); }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const braced = (n, i, d) => {
    const fx = nodes[n].fix; if (fx) for (let t = 0; t < 3; t++) if (fx[t] && Math.abs(d[t]) > 0.3) return true;
    for (const j of inc[n]) if (j !== i && members[live[j]].kind !== 'tie' && Math.abs(dot(dirOf[j], dirOf[i])) < 0.95 && Math.abs(dot(dirOf[j], d)) > 0.2) return true;
    for (const e of held.get(n) || []) if (Math.abs(dot(e, d)) > 0.3) return true;
    return false;
  };
  const sysLen = (i, d) => {
    let total = M.el[i].L;
    for (const side of [0, 1]) {
      let cur = i, n = ends[i][side];
      for (let step = 0; step < 200 && !braced(n, i, d); step++) {
        const j = inc[n].find(j => j !== cur && Math.abs(dot(dirOf[j], dirOf[i])) > 0.995);
        if (j === undefined) break;
        total += M.el[j].L; n = ends[j][0] === n ? ends[j][1] : ends[j][0]; cur = j;
      }
    }
    return total;
  };
  // (where nothing holds it outright, as a chord held only by the U-frames it is part of, no further than the length it
  // would buckle over as the frame buckles: pi sqrt(EI / (lambda N)), EN 1993-1-1 5.2.2(8))
  const Lcr = (k, i, I) => { const N = -Nenv[i], m = members[k]; return N > 0 && isFinite(lambda) && lambda > 0 ? Math.PI * Math.sqrt(m.material.E * I / (lambda * N)) : Infinity; };
  const Ls = live.map((k, i) => { const R = M.el[i].R, s = members[k].section; return members[k].kind === 'tie' ? [M.el[i].L, M.el[i].L] : [Math.max(M.el[i].L, Math.min(sysLen(i, R[1]), Lcr(k, i, s.Iz))), Math.max(M.el[i].L, Math.min(sysLen(i, R[2]), Lcr(k, i, s.Iy)))]; });

  // ---- every member against every combination (the direct analysis), and for fatigue at working load
  const worst = list.map(() => ({ u: 0 })), slackSome = new Set();
  const comb = new Float64Array(12), cq = [0, 0, 0];
  const ip = cix.get('pendulum'), iw = cix.get('winding'), idd = cix.get('dead'), itt = cix.get('teeth');
  live.forEach((k, i) => {
    const m = members[k], ai = owner[k], L = dam.cases[0].forces[i].L;
    let best = { u: 0 };
    for (const cb of combos) {
      comb.fill(0); cq[0] = cq[1] = cq[2] = 0;
      for (const [c, v] of cb.f) { const F = dam.cases[c].forces[i]; for (let t = 0; t < 12; t++) comb[t] += v * F.f[t]; for (let t = 0; t < 3; t++) cq[t] += v * F.q[t]; }
      const c = utilisation(m, comb, cq, L, Ls[i]);
      if (c.slackIn) slackSome.add(k);
      if (c.u > best.u) best = { ...c, combo: cb.name, N: Math.min(-comb[0], comb[6]) };
    }
    if (m.material.steel) {
      const g = plies(m.section, m.material);
      for (const [c, limit, name, k2] of [[ip, FATIGUE.pendulum(g.cat) * g.ks, 'fatigue (the pendulum)', 2], [iw, FATIGUE.winding(g.cat) * g.ks, 'fatigue (winding)', 1]]) {
        if (c === undefined) continue;
        const F = svc.cases[c].forces[i], r = k2 * range(m, F.f, F.q, L) / limit;
        if (r > best.u) best = { u: r, why: name, stress: k2 * range(m, F.f, F.q, L), N: F.N, limit };
      }
    }
    if (m.turns && idd !== undefined) {
      // a solid round shaft: bending under its own weight, its wheels' and the teeth's pushes, which stand still while it turns
      const s = m.section, r = Math.sqrt(s.A / Math.PI), R = ROTATING, at = rotatingAllowed(m.turns) / (R.Kf * R.gamma);
      for (const e of [0, 6]) {
        let My = 0, Mz = 0, T = 0;
        for (const c of [idd, itt]) if (c !== undefined) { const f = svc.cases[c].forces[i].f; My += f[e + 4]; Mz += f[e + 5]; T += f[e + 3]; }
        const sa = Math.hypot(My, Mz) * r / s.Iz, sm = Math.sqrt(3) * Math.abs(T) * r / (2 * s.Iz), u = sa / (at * Math.max(0.05, 1 - sm / R.uts));
        if (u > best.u) best = { u, why: `fatigue (turning, ${m.turns.toExponential(1)} turns)`, stress: sa };
      }
    }
    const pl = plates(m);
    if (pl > 1 && pl > best.u) best = { u: pl, why: 'plate too slender', stress: 0 };
    const row = rows[ai], lab = m.label;
    if (!(row.byLabel[lab] >= best.u)) { row.byLabel[lab] = best.u; row.whyLabel[lab] = best.why; }
    if (share) row.shareLabel = row.shareLabel || {}, row.shareLabel[lab] = (row.shareLabel[lab] || 0) + share[i];
    if (best.u > worst[ai].u) worst[ai] = { ...best, member: m, L, Ls: Ls[i], at: nodes[mem[k].a].p.map((v, t) => (v + nodes[mem[k].b].p[t]) / 2) };
  });
  // ---- the braces: each must hold 2% of the push in what it braces, and be stiff enough to brace it (AISC App. 6.2,
  // nodal: 2 x 8 Pr / Lb in ASD), and its connector must carry what the analysis gives it
  const braceRows = [];
  const pushAt = (n, d) => {                       // the most any member through n, across d, is pushed, and how far it runs
    let Pr = 0, Lb = 0;
    for (const j of inc[n]) if (Math.abs(dot(dirOf[j], d)) < 0.3) { const P = -Nenv[j]; if (P > Pr) { Pr = P; Lb = Math.max(...Ls[j]); } }
    return { Pr, Lb };
  };
  const braceCheck = (s, F, n, d) => {
    const { Pr, Lb } = pushAt(n, d), need = Math.max(Math.abs(F), 0.02 * Pr), sec = s.sec, mat = s.mat, g = plies(sec, mat);
    const r = Math.sqrt(Math.min(sec.Iy, sec.Iz) / sec.A), Lk = (s.b || s.brace)?.buckle || s.L, cap = Math.min(fcr(g.fy, mat.E, Lk / r) / OMEGA, g.Ft) * sec.A, beta = Lb > 0 ? 2 * 8 * Pr / Lb : 0;
    const u = Math.max(need / cap, s.k ? beta / s.k : 0);
    const ai = s.owner, lab = `brace to ${s.b?.on ?? s.brace?.on}`;
    if (!(rows[ai].byLabel[lab] >= u)) { rows[ai].byLabel[lab] = u; rows[ai].whyLabel[lab] = need / cap >= beta / (s.k || Infinity) ? 'brace force' : 'brace stiffness'; }
    if (u > worst[ai].u) worst[ai] = { u, why: need / cap >= beta / (s.k || Infinity) ? 'brace force' : 'brace stiffness', member: { label: lab, kind: 'brace', section: sec }, stress: need / sec.A, at: nodes[n].p, combo: '' };
    braceRows.push({ from: list[ai].name, on: s.b?.on ?? s.brace?.on, at: nodes[n].p, F, need, cap, k: s.k, beta, Pr, Lb, u });
  };
  springs.forEach((s, j) => {
    if (s.link) return;
    const i = nl + j, d = s.spring[0][1].slice(0, 3);
    const F = Math.max(...combos.map(cb => Math.abs(cb.f.reduce((t, [c, v]) => t + v * dam.cases[c].forces[i].N, 0))));
    braceCheck(s, F, s.a, d);
  });
  for (const s of supports) if (s.brace && s.sec) {
    const R = (c) => -dam.cases[c].reactions[6 * s.n + s.only], F = Math.max(...combos.map(cb => Math.abs(cb.f.reduce((t, [c, v]) => t + v * R(c), 0)))), d = [0, 0, 0]; d[s.only] = 1;
    braceCheck(s, F, s.n, d);
  }
  // ---- what it hands on, case by case (from the direct analysis)
  const handed = [];
  for (const s of supports) {
    const fc = {};
    caseList.forEach((c, ci) => {
      const R = dam.cases[ci].reactions, f = [0, 1, 2, 3, 4, 5].map(d => -R[6 * s.n + d]);
      if (s.brace) for (let d = 0; d < 6; d++) if (d !== s.only) f[d] = 0;
      fc[c.name] = f;
    });
    if (s.brace && !s.on) continue;                    // (a brace whose reaction nobody claims: only allowed for tests)
    const f = [0, 1, 2, 3, 4, 5].map(d => service.reduce((t, [c, v]) => t + v * fc[caseList[c].name][d], 0));
    handed.push({ from: s.from, on: s.on, p: s.p, f, cases: fc, label: s.from, foot: s.foot, hold: s.hold });
  }
  // ---- natural frequencies, where they matter: a deck people walk on, sideways and up and down; a slender stack
  frame.modes = {};
  for (const [ai, A] of list.entries()) {
    if (!A.dynamic && !A.slender) continue;
    const own = new Set(local[ai]), mm = (axs) => { const v = new Float64Array(6 * nn); for (let n = 0; n < nn; n++) if (A.slender ? own.has(n) : true) for (const t of axs) v[6 * n + t] = massAt[n]; return v; };
    const res = {}, shape = (r) => { const V = new Float64Array(6 * nn); if (r.mode) for (let i = 0; i < 6 * nn; i++) if (M.dof[i] >= 0) V[i] = r.mode[M.dof[i]]; return V; };
    // (with each mode, each group's share of its strain energy: see energy above)
    const share = (r) => { const e = frame.energy(shape(r)), t = Object.values(e).reduce((a, b) => a + b, 0) || 1; for (const k in e) e[k] /= t; return e; };
    // (and the sideways mode's modal mass, its shape scaled to 1 where it moves most on the deck, and that place; its
    // shape along the deck, [x, movement] at each place along it; and the mean of the shape squared along it: what a
    // damper tuned to it works against, and what share of a crowd spread along the deck moves with it)
    const modal = (r, d) => {
      const V = shape(r); let mx = 0, at = local[ai][0], Mm = 0; const along = new Map();
      for (const n of local[ai]) { const v = Math.abs(V[6 * n + d]), x = Math.round(nodes[n].p[0] * 10) / 10; if (v > mx) { mx = v; at = n; } along.set(x, Math.max(along.get(x) ?? 0, v)); }
      for (let n = 0; n < nn; n++) Mm += massAt[n] * V[6 * n + d] ** 2;
      const shapeAlong = [...along].sort((p, q) => p[0] - q[0]).map(([x, v]) => [x, mx ? v / mx : 0]);
      let s2 = 0, len = 0; for (let i = 0; i + 1 < shapeAlong.length; i++) { const dx = shapeAlong[i + 1][0] - shapeAlong[i][0]; s2 += dx * (shapeAlong[i][1] ** 2 + shapeAlong[i + 1][1] ** 2) / 2; len += dx; }
      return { lateralMass: mx ? Mm / (mx * mx) : 0, lateralAt: [...nodes[at].p], lateralAxis: d, lateralAlong: shapeAlong, lateralMean: len ? s2 / len : 0 };
    };
    if (A.dynamic) { const x = modes(M, sol.FK, mm([0])), z = modes(M, sol.FK, mm([2])), y = modes(M, sol.FK, mm([1])), l = x.hz < z.hz ? x : z; Object.assign(res, { lateral: l.hz, lateralShare: share(l), vertical: y.hz, verticalShare: share(y) }, modal(l, l === x ? 0 : 2)); res.mass = local[ai].reduce((t, n) => t + massAt[n], 0); }
    if (A.slender) {
      const r = modes(M, sol.FK, mm([0, 2])); res.lateral = r.hz; res.lateralShare = share(r); res.mass = local[ai].reduce((t, n) => t + massAt[n], 0);
      // (and its modal mass, the shape scaled to 1 where it moves most, and that place: what a damper there works against;
      // and how far its head moves as a whole, the mean of its top's movements one way and the other, on that scale: a
      // damper hung in the middle of the head moves with that, not with a corner that the mode also twists)
      const V = shape(r); let mx = 0, at = local[ai][0], Mm = 0, top = -Infinity;
      for (const n of local[ai]) { const v2 = V[6 * n] ** 2 + V[6 * n + 2] ** 2; Mm += massAt[n] * v2; if (v2 > mx) { mx = v2; at = n; } top = Math.max(top, nodes[n].p[1]); }
      const head = local[ai].filter(n => nodes[n].p[1] > top - 0.01), hx = head.reduce((t, n) => t + V[6 * n], 0) / head.length, hz = head.reduce((t, n) => t + V[6 * n + 2], 0) / head.length;
      Object.assign(res, { lateralMass: mx ? Mm / mx : 0, lateralAt: [...nodes[at].p], lateralTop: mx ? Math.hypot(hx, hz) / Math.sqrt(mx) : 0 });
    }
    frame.modes[A.name] = res;
  }
  frame.braces = braceRows;
  // ---- the verdicts
  let sag = 0; for (let n = 0; n < nn; n++) sag = Math.max(sag, -frame.cases.dead[6 * n + 1]);
  rows.forEach((row, ai) => {
    const w = worst[ai];
    Object.assign(row, { slack, slackSome: [...slackSome].filter(k => owner[k] === ai).length, lambda, exact, u: w.u, why: w.why, stress: w.stress, combo: w.combo, worst: w.member && `${w.member.label || w.member.kind} (${w.member.section.label})`, at: w.at, N: w.N, L: w.L, Ls: w.Ls, sag });
  });
  const out = { rows, handed, frame };
  verdicts(out);
  cache.set(grp.name, { sig, out, M, Nenv, confirmed: !!opts.exact });
  return out;
}
function verdicts(out) {
  for (const row of out.rows) {
    const lambda = row.lambda, exact = out.frame.exact;
    row.exact = exact;
    const stable = lambda >= BUCKLING_FACTOR && exact !== false;
    row.ok = row.u <= 1 && stable;
    row.verdict = !stable ? `buckles at ${lambda.toFixed(2)} times its load (needs ${BUCKLING_FACTOR})`
      : (row.u <= 1 ? 'holds' : row.u === Infinity ? row.why : `overloaded ${row.u.toFixed(1)}x in ${row.why}`) + (row.slack ? ` (${row.slack} rods slack)` : '') + (row.slackSome ? ` (${row.slackSome} rods slack in some combinations)` : '');
  }
}
// confirm a frame solved before, exactly: is K + 4.5 Kg positive definite?
function confirm(hit) {
  const F = hit.out.frame;
  if (isFinite(F.lambda) && F.lambda > 0) F.exact = definite(hit.M, stiffness(hit.M), geometric(hit.M, hit.Nenv), BUCKLING_FACTOR);
  hit.confirmed = true;
  verdicts(hit.out);
}

// Displacement of the point p of a frame under a combination of cases ({ case: factor }): [dx, dy, dz].
export function displacement(res, frameName, p, factors) {
  const F = res.frames.get(res.groupOf?.get(frameName) ?? frameName) || res.frames.get(frameName); if (!F) return null;
  const n = F.index.get(key(p)); if (n === undefined) return null;
  const d = [0, 0, 0];
  for (const [c, v] of Object.entries(factors)) { const u = F.cases[c]; if (u) for (let i = 0; i < 3; i++) d[i] += v * u[6 * n + i]; }
  return d;
}
// What each group of members does for a movement (see energy in solveGroup): the movement is the sum over `at` ([point,
// direction] pairs) of the displacement there along the direction, under the combination `factors`. Returns { d, shares },
// shares as fractions of the whole (what the ground and the joints take included), or null.
export function sensitivity(res, frameName, at, factors) {
  const F = res.frames.get(res.groupOf?.get(frameName) ?? frameName) || res.frames.get(frameName); if (!F?.virtual) return null;
  const n6 = F.nodes.length * 6, c = new Float64Array(n6), u = new Float64Array(n6);
  for (const [p, dir] of at) { const n = F.index.get(key(p)); if (n === undefined) return null; for (let i = 0; i < 3; i++) c[6 * n + i] += dir[i]; }
  for (const [k, v] of Object.entries(factors)) { const w = F.cases[k]; if (w) for (let i = 0; i < n6; i++) u[i] += v * w[i]; }
  let d = 0; for (let i = 0; i < n6; i++) d += c[i] * u[i];
  const e = F.energy(F.virtual(c), u), t = Object.values(e).reduce((a, b) => a + b, 0) || 1;
  for (const k in e) e[k] /= t;
  return { d, shares: e };
}
// The frame an assembly was solved in
export const frameOf = (res, name) => res.frames.get(res.groupOf?.get(name) ?? name);

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
