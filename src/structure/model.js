// The structural model of the scene, and the check that is run over it.
//
// As each part of the building is drawn, the code that draws it also declares what
// it is structurally: an *assembly* (a girder with its hangers, one truss, one arbor)
// made of members with real sections and materials, carrying real masses, resting on
// the ground, on a wall, or on another assembly. analyse() then does what an engineer
// does by hand: works down the load path. It solves every assembly on its own
// supports (solve.js), checks each member against what its material can take, and
// hands the reactions on as loads to whatever that assembly rests on.
//
// It can be run at any time over whatever has been declared, so a change to the
// building can be checked the moment it is made.
import { solveFrame } from './solve.js';

export const GRAVITY = 9.81;

// Working stresses, N/m^2: what a designer would allow, with the safety factor already in.
// The first group is what the 1890s had; masonry takes no tension. The wheels are that
// brass. What carries them is not: at this size nothing of the period could.
export const MATERIAL = {
  alloy: { name: 'high-strength alloy steel', rho: 7850, E: 205e9, G: 79e9, f: 450e6 },                 // quenched and tempered, yield about 900 MPa
  tendon: { name: 'carbon-fibre tendon', rho: 1600, E: 160e9, G: 5e9, f: 1100e6 },                       // breaks near 2800 MPa; pulls only
  uhpc: { name: 'prestressed ultra-high-performance concrete', rho: 2500, E: 50e9, G: 20e9, f: 0, fc: 60e6 },
  steel: { name: 'mild steel', rho: 7850, E: 200e9, G: 77e9, f: 110e6 },
  brass: { name: 'brass', rho: 8500, E: 100e9, G: 38e9, f: 50e6 },
  castIron: { name: 'cast iron', rho: 7200, E: 100e9, G: 40e9, f: 20e6, fc: 100e6 },
  brick: { name: 'engineering brick in cement mortar', rho: 2100, f: 0, fc: 2.0e6 },
  stone: { name: 'granite', rho: 2650, f: 0, fc: 4.0e6 },
};
const BUCKLING_FACTOR = 2.5;          // Euler load divided by this

// Sections. Iz resists bending in the vertical plane (see solve.js axes()); Z = I / c.
export const SECTION = {
  round: (r) => ({ A: Math.PI * r * r, Iy: Math.PI * r ** 4 / 4, Iz: Math.PI * r ** 4 / 4, J: Math.PI * r ** 4 / 2, Zy: Math.PI * r ** 3 / 4, Zz: Math.PI * r ** 3 / 4, label: `${Math.round(r * 2000)} mm round` }),
  bar: (h, b) => ({ A: b * h, Iz: b * h ** 3 / 12, Iy: h * b ** 3 / 12, J: Math.min(b, h) ** 3 * Math.max(b, h) / 3, Zz: b * h * h / 6, Zy: h * b * b / 6, label: `${Math.round(h * 1000)} x ${Math.round(b * 1000)} bar` }),
  box: (h, b, t) => {
    const hi = h - 2 * t, bi = b - 2 * t, Iz = (b * h ** 3 - bi * hi ** 3) / 12, Iy = (h * b ** 3 - hi * bi ** 3) / 12;
    return { A: b * h - bi * hi, Iz, Iy, J: 2 * t * (b - t) ** 2 * (h - t) ** 2 / (b + h - 2 * t), Zz: Iz / (h / 2), Zy: Iy / (b / 2), label: `${Math.round(h * 1000)} x ${Math.round(b * 1000)} box, ${Math.round(t * 1000)} plate` };
  },
  // plate girder or I-beam: depth h, flange width b, flange thickness tf, web tw
  I: (h, b, tf, tw) => {
    const hw = h - 2 * tf, Iz = (b * h ** 3 - (b - tw) * hw ** 3) / 12, Iy = (2 * tf * b ** 3 + hw * tw ** 3) / 12;
    return { A: 2 * b * tf + hw * tw, Iz, Iy, J: (2 * b * tf ** 3 + hw * tw ** 3) / 3, Zz: Iz / (h / 2), Zy: Iy / (b / 2), label: `${Math.round(h * 1000)} x ${Math.round(b * 1000)} girder` };
  },
};

const SNAP = 0.03;
const key = (p) => `${Math.round(p[0] / SNAP)},${Math.round(p[1] / SNAP)},${Math.round(p[2] / SNAP)}`;
const assemblies = new Map();

class Assembly {
  constructor(name, note) { this.name = name; this.note = note; this.nodes = []; this.index = new Map(); this.members = []; this.masses = []; this.forces = []; this.rests = []; this.braces = []; }
  node(p) { const k = key(p); if (!this.index.has(k)) { this.index.set(k, this.nodes.length); this.nodes.push({ p: [...p] }); } return this.index.get(k); }
  // kind: 'beam' (default), 'tie' (rod: carries tension only), 'strut'
  // lout: for a member braced sideways less often than it is jointed, the length over which
  // it can buckle out of its plane (otherwise each piece between joints is taken as braced)
  // carries: a load spread along it, N per metre, beyond its own weight (the wall standing on a girder)
  member(a, b, section, material = MATERIAL.steel, kind = 'beam', label = '', lout = 0, carries = 0) {
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 2 * SNAP) return this;
    this.members.push({ a: this.node(a), b: this.node(b), section, material, kind, label, lout, carries });
    return this;
  }
  mass(p, kg, label = '') { this.masses.push({ n: this.node(p), kg, label }); return this; }
  force(p, f, label = '') { this.forces.push({ n: this.node(p), f, label }); return this; }
  // This point is held by `on`: 'ground', 'wall', or the name of another assembly.
  // hold: 'pin' stops it moving; 'fix' also stops it turning (built in); or the axes it is held
  // along, e.g. 'yz' for a bearing that is free to slide in x (one end of every long span is).
  rest(p, on, hold = 'pin') { this.rests.push({ n: this.node(p), on, hold }); return this; }
  // This point is kept from moving along one axis ('x', 'y' or 'z') by something that carries
  // no weight from it: the purlins that stop a truss falling over sideways, for instance.
  brace(p, axis) { this.braces.push({ n: this.node(p), d: 'xyz'.indexOf(axis) }); return this; }
}

export function assembly(name, note = '') {
  if (!assemblies.has(name)) assemblies.set(name, new Assembly(name, note));
  return assemblies.get(name);
}
export function resetStructure() { assemblies.clear(); }
// Start an assembly again from nothing (used while the designer is trying sizes).
export function redeclare(name, note = '') { assemblies.delete(name); return assembly(name, note); }

// A member that passes through other nodes of its assembly is one continuous piece
// joined to whatever meets it there: cut it at those nodes.
function split(A) {
  const out = [];
  for (const m of A.members) {
    const a = A.nodes[m.a].p, b = A.nodes[m.b].p, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const cuts = [];
    A.nodes.forEach((nd, i) => {
      if (i === m.a || i === m.b) return;
      const q = nd.p, t = ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1] + (q[2] - a[2]) * d[2]) / L2;
      if (t <= 0.001 || t >= 0.999) return;
      if (Math.hypot(q[0] - a[0] - d[0] * t, q[1] - a[1] - d[1] * t, q[2] - a[2] - d[2] * t) < SNAP) cuts.push([t, i]);
    });
    cuts.sort((p, q) => p[0] - q[0]);
    let from = m.a;
    for (const [, i] of cuts) { out.push({ ...m, a: from, b: i }); from = i; }
    out.push({ ...m, a: from, b: m.b });
  }
  A.members = out;
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

// How hard one member is working, as a fraction of what it can take.
function utilisation(m, F) {
  const s = m.section, mat = m.material;
  const My = Math.max(Math.abs(F.Ma[1]), Math.abs(F.Mb[1])), Mz = Math.max(Math.abs(F.Ma[2]), Math.abs(F.Mb[2])) + F.selfM;
  const bend = m.kind === 'tie' ? 0 : My / s.Zy + Mz / s.Zz, axial = Math.abs(F.N) / s.A;
  const allow = F.N < 0 && mat.fc ? mat.fc : mat.f;
  let u = (axial + bend) / allow, why = bend > axial ? 'bending' : F.N < 0 ? 'compression' : 'tension';
  if (F.N < 0) {
    if (m.kind === 'tie' && -F.N > 0.02 * s.A * mat.f) return { u: Infinity, why: 'a rod cannot push', stress: axial };
    const Pcr = Math.PI ** 2 * mat.E * (m.lout ? Math.min(s.Iz / F.L ** 2, s.Iy / m.lout ** 2) : Math.min(s.Iy, s.Iz) / F.L ** 2) / BUCKLING_FACTOR;
    if (m.kind !== 'tie' && -F.N / Pcr > u) { u = -F.N / Pcr; why = 'buckling'; }
  }
  return { u, why, stress: axial + bend };
}

// Works down the load path. Returns one row per assembly and a list of what each
// terminal support (ground, wall) is asked to carry.
export function analyse() {
  for (const A of assemblies.values()) { if (!A.cut) { split(A); A.cut = true; } A.incoming = []; }
  const order = [], state = new Map();
  const visit = (A) => {                                         // whatever rests on A must be solved before A
    if (state.get(A) === 2) return; if (state.get(A) === 1) throw new Error(`[structure] ${A.name} rests on itself`);
    state.set(A, 1);
    for (const B of assemblies.values()) if (B.rests.some(r => r.on === A.name)) visit(B);
    state.set(A, 2); order.push(A);
  };
  for (const A of assemblies.values()) visit(A);

  const rows = [], terminal = { ground: [], wall: [] };
  for (const A of order) {
    // nothing rests on it and it has been solved before: its answer has not changed
    if (A.solved && !A.incoming.length) {
      rows.push(A.solved.row);
      for (const t of A.solved.out) { if (terminal[t.on]) terminal[t.on].push(t); else if (assemblies.has(t.on)) assemblies.get(t.on).incoming.push({ p: t.p, f: t.f, label: A.name }); }
      continue;
    }
    for (const inc of A.incoming) A.forces.push({ n: A.node(A.reach ? nearest(A, inc.p) : inc.p), f: inc.f, label: inc.label, transferred: true });
    if (A.incoming.length) { A.cut = false; split(A); A.cut = true; }
    const nodes = A.nodes.map(nd => ({ p: nd.p, fix: null }));
    for (const r of A.rests) {
      nodes[r.n].fix = r.hold === 'fix' ? [1, 1, 1, 1, 1, 1] : r.hold === 'pin' ? [1, 1, 1, 0, 0, 0] : [+r.hold.includes('x'), +r.hold.includes('y'), +r.hold.includes('z'), 0, 0, 0];
      // A lone member on simple bearings is free to spin about its own axis: a mechanism on
      // paper, of no interest in practice. Where only one line of members reaches a bearing,
      // the bearing also stops it turning about that line.
      if (r.hold === 'fix') continue;
      const dirs = A.members.filter(m => m.kind !== 'tie' && (m.a === r.n || m.b === r.n)).map(m => { const a = A.nodes[m.a].p, b = A.nodes[m.b].p, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d); return d.map(v => Math.abs(v) / l); });
      if (dirs.length && dirs.every(d => d.every((v, k) => Math.abs(v - dirs[0][k]) < 0.02))) nodes[r.n].fix[3 + dirs[0].indexOf(Math.max(...dirs[0]))] = 1;
    }
    const loads = new Float64Array(6 * nodes.length);
    let weight = 0, carried = 0;
    const members = A.members.map((m) => {
      const pa = nodes[m.a].p, pb = nodes[m.b].p, L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
      const own = m.material.rho * m.section.A * GRAVITY, w = own + (m.carries || 0);      // N per metre
      loads[6 * m.a + 1] -= w * L / 2; loads[6 * m.b + 1] -= w * L / 2; weight += own * L; carried += (m.carries || 0) * L;
      const flat = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
      return { a: m.a, b: m.b, E: m.material.E, G: m.material.G, ...m.section, axial: m.kind === 'tie', selfM: w * (flat / L) * L * L / 8 };      // its own weight bends it between its ends
    });
    for (const q of A.masses) { loads[6 * q.n + 1] -= q.kg * GRAVITY; carried += q.kg * GRAVITY; }
    for (const q of A.forces) { for (let d = 0; d < 3; d++) loads[6 * q.n + d] += q.f[d]; carried += Math.hypot(...q.f); }
    A.forces = A.forces.filter(q => !q.transferred);

    const row = { name: A.name, note: A.note, weight, carried, members: A.members.length };
    if (!A.rests.length) { row.ok = false; row.verdict = 'rests on nothing'; rows.push(row); continue; }
    for (const b of A.braces) { nodes[b.n].fix = nodes[b.n].fix || [0, 0, 0, 0, 0, 0]; nodes[b.n].fix[b.d] = 1; }
    // A rod that the first solution puts in compression would in fact hang slack. Take the
    // slack ones out and solve again, until every rod left is pulling.
    let sol, live = members, map = members.map((_, i) => i), slack = 0;
    for (let pass = 0; pass < 12; pass++) {
      sol = solveFrame(nodes, live, loads);
      if (sol.unstable) break;
      const keep = map.filter((i, k) => !(A.members[i].kind === 'tie' && sol.forces[k].N < 0));
      if (keep.length === map.length) break;
      slack += map.length - keep.length; map = keep; live = keep.map(i => members[i]);
    }
    row.slack = slack;
    if (sol.unstable) { row.ok = false; row.verdict = 'free to move'; row.at = nodes[sol.unstable.node].p; rows.push(row); continue; }

    let worst = { u: 0 };
    row.byLabel = {};
    map.forEach((i, k) => {
      const m = A.members[i], F = { ...sol.forces[k], selfM: members[i].selfM }, c = utilisation(m, F);
      if (!(row.byLabel[m.label] >= c.u)) row.byLabel[m.label] = c.u;
      if (c.u > worst.u) worst = { ...c, member: m, N: F.N, L: F.L, at: nodes[m.a].p.map((v, k) => (v + nodes[m.b].p[k]) / 2) };
    });
    let sag = 0; for (let i = 0; i < nodes.length; i++) sag = Math.max(sag, -sol.u[6 * i + 1]);
    Object.assign(row, { ok: worst.u <= 1, u: worst.u, why: worst.why, stress: worst.stress, worst: worst.member && `${worst.member.label || worst.member.kind} (${worst.member.section.label})`, at: worst.at, N: worst.N, sag });
    row.verdict = (worst.u <= 1 ? 'holds' : worst.u === Infinity ? worst.why : `overloaded ${worst.u.toFixed(1)}x in ${worst.why}`) + (slack ? ` (${slack} rods slack)` : '');
    rows.push(row);

    // hand the reactions on
    const out = [];
    for (const r of A.rests) {
      const f = [-sol.reactions[6 * r.n], -sol.reactions[6 * r.n + 1], -sol.reactions[6 * r.n + 2]], p = nodes[r.n].p;
      out.push({ from: A.name, on: r.on, p, f });
      if (terminal[r.on]) terminal[r.on].push({ from: A.name, p, f });
      else if (assemblies.has(r.on)) assemblies.get(r.on).incoming.push({ p, f, label: A.name });
      else { row.ok = false; row.verdict = `rests on "${r.on}", which does not exist`; }
    }
    if (!A.incoming.length) A.solved = { row, out };
  }
  return { rows, terminal, ok: rows.every(r => r.ok) };
}

const tonnes = (N) => `${(N / GRAVITY / 1000).toLocaleString('en', { maximumFractionDigits: N / GRAVITY / 1000 < 100 ? 1 : 0 })} t`;
export function report(result, extra = []) {
  const lines = [], pad = (s, n) => String(s).padEnd(n);
  for (const r of [...result.rows].sort((a, b) => (b.u ?? 1e9) - (a.u ?? 1e9))) {
    lines.push(`${r.ok ? '  ok  ' : ' FAIL '} ${pad(r.name, 26)} ${pad(r.verdict, 46)} carries ${pad(tonnes(r.carried), 10)} own weight ${pad(tonnes(r.weight), 9)}${r.worst ? ` worst: ${r.worst}` : ''}`);
  }
  for (const e of extra) lines.push(`${e.ok ? '  ok  ' : ' FAIL '} ${pad(e.name, 26)} ${e.verdict}`);
  const down = (list) => list.reduce((s, t) => s - t.f[1], 0);
  lines.push('', `onto the walls: ${tonnes(down(result.terminal.wall))}   onto the ground: ${tonnes(down(result.terminal.ground))}`);
  return lines.join('\n');
}
