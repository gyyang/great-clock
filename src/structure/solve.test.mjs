// Checks the solver against cases with textbook answers. Run: npm test
import { solveFrame, prepare, solveCases, buckling, stiffness, geometric, definite, axes, modes } from './solve.js';
import { assembly, analyse, resetStructure, SECTION, MATERIAL, GRAVITY, grade, plies } from './model.js';

let failed = 0;
const near = (name, got, want, tol = 1e-3) => {
  const ok = Math.abs(got - want) <= tol * Math.max(1e-12, Math.abs(want)) || (want === 0 && Math.abs(got) < tol);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${Number(got).toPrecision(6)} (expected ${Number(want).toPrecision(6)})`);
};
const steel = MATERIAL.steel, sec = SECTION.box(0.4, 0.3, 0.02), m = (a, b, extra = {}) => ({ a, b, E: steel.E, G: steel.G, ...sec, ...extra });
const fixed = [1, 1, 1, 1, 1, 1], pin = [1, 1, 1, 0, 0, 0];

{ // cantilever, load at the tip: deflection P L^3 / 3 E I, root moment P L
  const L = 10, P = 1e5, loads = new Float64Array(12); loads[6 + 1] = -P;
  const r = solveFrame([{ p: [0, 0, 0], fix: fixed }, { p: [L, 0, 0] }], [m(0, 1)], loads);
  near('cantilever tip deflection', -r.u[7], P * L ** 3 / (3 * steel.E * sec.Iz));
  near('cantilever root moment', Math.abs(r.forces[0].Ma[2]), P * L);
  near('cantilever reaction', r.reactions[1], P);
}
{ // the same beam on its side: the weak axis must be the one that bends
  const L = 10, P = 1e5, loads = new Float64Array(12); loads[6 + 2] = P;
  const r = solveFrame([{ p: [0, 0, 0], fix: fixed }, { p: [L, 0, 0] }], [m(0, 1)], loads);
  near('cantilever sideways deflection', r.u[8], P * L ** 3 / (3 * steel.E * sec.Iy));
}
{ // simply supported, load at mid-span: moment P L / 4, deflection P L^3 / 48 E I
  const L = 12, P = 2e5, loads = new Float64Array(18); loads[6 + 1] = -P;
  const r = solveFrame([{ p: [0, 5, 3], fix: [1, 1, 1, 1, 0, 0] }, { p: [L / 2, 5, 3] }, { p: [L, 5, 3], fix: [0, 1, 1, 0, 0, 0] }], [m(0, 1), m(1, 2)], loads);
  near('simple beam mid-span moment', Math.abs(r.forces[0].Mb[2]), P * L / 4);
  near('simple beam deflection', -r.u[7], P * L ** 3 / (48 * steel.E * sec.Iz));
}
{ // a column standing up, pushed sideways at the top
  const H = 8, P = 5e4, loads = new Float64Array(12); loads[6] = P;
  const r = solveFrame([{ p: [0, 0, 0], fix: fixed }, { p: [0, H, 0] }], [m(0, 1)], loads);
  near('column sway', r.u[6], P * H ** 3 / (3 * steel.E * sec.Iz));
}
{ // two rods at 45 degrees holding a weight: each carries W / sqrt 2
  const W = 1e5, loads = new Float64Array(18); loads[6 + 1] = -W;
  const rod = SECTION.round(0.02), t = (a, b) => ({ a, b, E: steel.E, G: steel.G, ...rod, axial: true });
  const r = solveFrame([{ p: [-1, 1, 0], fix: pin }, { p: [0, 0, 0], fix: [0, 0, 1, 0, 0, 0] }, { p: [1, 1, 0], fix: pin }], [t(0, 1), t(1, 2)], loads);
  near('rod tension', r.forces[0].N, W / Math.SQRT2);
}
{ // a beam held at one pin only can swing: the solver must say so, not return numbers
  const r = solveFrame([{ p: [0, 0, 0], fix: pin }, { p: [5, 0, 0] }], [m(0, 1)], new Float64Array(12));
  near('mechanism detected', r.unstable ? 1 : 0, 1);
}

// ---- torsion
{ // a cantilever twisted at its tip: rotation T L / G J
  const L = 6, T = 3e5, loads = new Float64Array(12); loads[6 + 3] = T;
  const r = solveFrame([{ p: [0, 0, 0], fix: fixed }, { p: [L, 0, 0] }], [m(0, 1)], loads);
  near('twisted cantilever rotation', r.u[9], T * L / (steel.G * sec.J));
  near('twisted cantilever torque', Math.abs(r.forces[0].f[3]), T);
}
{ // an L-shaped cantilever in plan, loaded at its tip: the first arm is twisted by the second.
  // Tip deflection P a^3 / 3EI + P b^3 / 3EI + P b^2 a / GJ
  const a = 8, b = 5, P = 1e5, loads = new Float64Array(18); loads[12 + 1] = -P;
  const r = solveFrame([{ p: [0, 2, 0], fix: fixed }, { p: [a, 2, 0] }, { p: [a, 2, b] }], [m(0, 1), m(1, 2)], loads);
  const want = P * a ** 3 / (3 * steel.E * sec.Iz) + P * b ** 3 / (3 * steel.E * sec.Iz) + P * b * b * a / (steel.G * sec.J);
  near('L-shaped cantilever tip deflection (torsion of the first arm)', -r.u[13], want);
  near('L-shaped cantilever: torque in the first arm', Math.abs(r.forces[0].f[3]), P * b);
}

// ---- loads along members
{ // uniform load on a simply supported beam (four pieces): mid-span deflection 5 w L^4 / 384 E I
  const L = 12, w = 3e4, n = 4, nodes = [], members = [];
  for (let i = 0; i <= n; i++) nodes.push({ p: [L * i / n, 0, 0], fix: i === 0 ? [1, 1, 1, 1, 0, 0] : i === n ? [0, 1, 1, 0, 0, 0] : null });
  for (let i = 0; i < n; i++) members.push(m(i, i + 1));
  const M = prepare(nodes, members), lines = new Map(members.map((_, k) => [k, [0, -w, 0]]));
  const r = solveCases(M, [{ loads: new Float64Array(6 * nodes.length), lines }]).cases[0];
  near('uniform load: mid-span deflection', -r.u[6 * 2 + 1], 5 * w * L ** 4 / (384 * steel.E * sec.Iz));
  near('uniform load: reaction', r.reactions[1], w * L / 2);
  near('uniform load: moment at mid-span', Math.abs(r.forces[1].f[11]), w * L * L / 8);
}
{ // fixed at both ends, one member: end moments w L^2 / 12
  const L = 9, w = 2e4, M = prepare([{ p: [0, 0, 0], fix: fixed }, { p: [L, 0, 0], fix: fixed }], [m(0, 1)]);
  const r = solveCases(M, [{ loads: new Float64Array(12), lines: new Map([[0, [0, -w, 0]]]) }]).cases[0];
  near('fixed-ended beam: end moment', Math.abs(r.forces[0].f[5]), w * L * L / 12);
}

// ---- buckling: the geometric stiffness against Euler
const column = (dir, L, n, fixA, fixB, P) => {
  const d = Math.hypot(...dir), u = dir.map(v => v / d), nodes = [], members = [];
  for (let i = 0; i <= n; i++) nodes.push({ p: u.map(v => v * L * i / n), fix: i === 0 ? fixA : i === n ? fixB : null });
  for (let i = 0; i < n; i++) members.push(m(i, i + 1));
  return { nodes, members, N: members.map(() => -P) };
};
const Ieff = Math.min(sec.Iy, sec.Iz);
{ // pinned both ends: pi^2 E I / L^2. The top end may slide along the column but not sideways.
  const L = 20, P = 1e5, c = column([0, 1, 0], L, 8, [1, 1, 1, 0, 1, 0], [1, 0, 1, 0, 0, 0], P);
  const b = buckling(prepare(c.nodes, c.members), c.N);
  near('Euler, pinned-pinned', b.lambda * P, Math.PI ** 2 * steel.E * Ieff / L ** 2, 2e-3);
}
{ // fixed at the foot, free at the top: pi^2 E I / 4 L^2
  const L = 15, P = 1e5, c = column([0, 1, 0], L, 8, fixed, null, P);
  const b = buckling(prepare(c.nodes, c.members), c.N);
  near('Euler, cantilever column', b.lambda * P, Math.PI ** 2 * steel.E * Ieff / (4 * L * L), 2e-3);
}
{ // the same cantilever column leaning at an odd angle in space: the answer must not change
  const L = 15, P = 1e5, c = column([1, 2.3, -1.7], L, 8, fixed, null, P);
  const b = buckling(prepare(c.nodes, c.members), c.N);
  near('Euler, cantilever column leaning in space', b.lambda * P, Math.PI ** 2 * steel.E * Ieff / (4 * L * L), 2e-3);
}
{ // a pinned column held sideways at its far end by two rods at right angles to it, lying at an odd
  // angle: pi^2 E I / L^2. (A twisting restraint at its foot, a stub with a rod at its tip, keeps it from spinning.)
  const L = 20, P = 1e5, c = column([1, 2.3, -1.7], L, 8, [1, 1, 1, 0, 0, 0], null, P);
  const R = axes(c.nodes[0].p, c.nodes[8].p), rod = SECTION.round(0.5), tie = (a, p) => { c.nodes.push({ p, fix: pin }); c.members.push({ a, b: c.nodes.length - 1, E: steel.E, G: steel.G, ...rod, axial: true }); c.N.push(0); };
  for (const k of [1, 2]) tie(8, c.nodes[8].p.map((v, i) => v + 30 * R[k][i]));
  c.nodes.push({ p: R[1].map(v => v * 2) }); c.members.push(m(0, c.nodes.length - 1, { Iy: 1e-6, Iz: 1e-6 })); c.N.push(0);
  tie(c.nodes.length - 1, R[1].map((v, i) => v * 2 + 30 * R[2][i]));
  const b = buckling(prepare(c.nodes, c.members), c.N);
  near('Euler, pinned-pinned, lying at an odd angle', b.lambda * P, Math.PI ** 2 * steel.E * Ieff / L ** 2, 5e-3);
}
{ // braced at mid-height by a stiff rod to a wall: it has to buckle in two half-waves, 4 pi^2 E I / L^2.
  // Braced by a very soft rod it buckles as if the rod were not there.
  for (const [r, want, name] of [[0.06, 4, 'braced at mid-height'], [0.0001, 1, 'with a brace too weak to count']]) {
    const L = 20, P = 1e5, c = column([0, 1, 0], L, 8, [1, 1, 1, 1, 1, 0], [1, 0, 1, 1, 1, 0], P);
    // the column is kept in its own plane and can buckle only in x; the rod holds its middle in x
    for (const nd of c.nodes) if (!nd.fix) nd.fix = [0, 0, 1, 1, 1, 0];
    c.nodes.push({ p: [-6, L / 2, 0], fix: pin });
    c.members.push({ a: 4, b: c.nodes.length - 1, E: steel.E, G: steel.G, ...SECTION.round(r), axial: true }); c.N.push(0);
    const b = buckling(prepare(c.nodes, c.members), c.N);
    near(`Euler, ${name}`, b.lambda * P, want * Math.PI ** 2 * steel.E * sec.Iz / L ** 2, want === 1 ? 0.02 : 5e-3);
  }
}
{ // a portal with a beam far stiffer than its columns, fixed at the feet: it sways, each column
  // fixed at both ends but free to move sideways at the top: pi^2 E I / H^2 each
  const H = 10, B = 8, P = 2e5, nodes = [], members = [], N = [];
  for (const x of [0, B]) { const i0 = nodes.length; for (let k = 0; k <= 6; k++) nodes.push({ p: [x, H * k / 6, 0], fix: k === 0 ? fixed : null }); for (let k = 0; k < 6; k++) { members.push(m(i0 + k, i0 + k + 1)); N.push(-P); } }
  members.push(m(6, 13, { Iz: sec.Iz * 1e4, Iy: sec.Iy * 1e4, A: sec.A * 100 })); N.push(0);
  // and keep it in its own plane
  for (const i of [6, 13]) nodes[i].fix = [0, 0, 1, 1, 1, 0];
  const b = buckling(prepare(nodes, members), N);
  near('portal sway buckling', b.lambda * P, Math.PI ** 2 * steel.E * sec.Iz / H ** 2, 5e-3);
  // and the inertia count agrees: positive definite just below, not just above
  const M = prepare(nodes, members), K = stiffness(M), Kg = geometric(M, N);
  near('positive definite below the critical load', definite(M, K, Kg, 0.98 * b.lambda) ? 1 : 0, 1);
  near('not positive definite above it', definite(M, K, Kg, 1.02 * b.lambda) ? 1 : 0, 0);
}
{ // second order: a cantilever column pushed down by P and sideways by H at its top.
  // Exact tip sway H (tan kL - kL) / (k^3 E I), k = sqrt(P / E I)
  const L = 12, P = 6e5, Hf = 2e4, c = column([0, 1, 0], L, 8, fixed, null, P);
  const loads = new Float64Array(6 * c.nodes.length); loads[6 * 8] = Hf; loads[6 * 8 + 1] = -P;
  const M = prepare(c.nodes, c.members), r = solveCases(M, [{ loads }], { N: c.N }).cases[0];
  const EI = steel.E * sec.Iz, k = Math.sqrt(P / EI);
  near('P-delta sway of a cantilever column', r.u[6 * 8], Hf * (Math.tan(k * L) - k * L) / (k ** 3 * EI), 2e-3);
}
{ // the direct analysis: the same column at 1.6 times its loads with its stiffness at 0.8, the forces divided back
  // by 1.6 (solved as 0.5 K + Kg against the loads themselves). Exact sway with EI* = 0.8 EI under 1.6 P and
  // 1.6 H, and the moment at the foot H L + P times that sway.
  const L = 12, P = 6e5, Hf = 2e4, c = column([0, 1, 0], L, 8, fixed, null, P);
  const loads = new Float64Array(6 * c.nodes.length); loads[6 * 8] = Hf; loads[6 * 8 + 1] = -P;
  const M = prepare(c.nodes, c.members), r = solveCases(M, [{ loads }], { N: c.N, kScale: 0.5, gScale: 1 }).cases[0];
  const EI = 0.8 * steel.E * sec.Iz, k = Math.sqrt(1.6 * P / EI), sway = 1.6 * Hf * (Math.tan(k * L) - k * L) / (k ** 3 * EI);
  near('direct analysis at 1.6 x the loads and 0.8 EI: sway', r.u[6 * 8], sway, 2e-3);
  near('direct analysis: moment at the foot, divided back by 1.6', Math.abs(r.forces[0].f[5]), Hf * L + P * sway, 2e-3);
}

// ---- springs: a foot on a rotational spring, two frames joined by a connector
{ // a cantilever column on a rotational spring c at its foot, pushed sideways: H L^3 / 3 E I + H L^2 / c
  const L = 10, Hf = 1e5, EI = steel.E * sec.Iz, c = 2 * EI / L, nodes = [{ p: [0, 0, 0], fix: [1, 1, 1, 1, 1, 0], spring: [0, 0, 0, 0, 0, c] }, { p: [0, L, 0] }];
  const loads = new Float64Array(12); loads[6] = Hf;
  const r = solveCases(prepare(nodes, [m(0, 1)]), [{ loads }]).cases[0];
  near('column on a rotational spring: sway', r.u[6], Hf * L ** 3 / (3 * EI) + Hf * L * L / c);
  near('column on a rotational spring: the spring\'s moment', Math.abs(r.reactions[5]), Hf * L);
  // and it buckles at P with kL tan kL = c L / E I (here 2: kL = 1.0769)
  let lo = 0.5, hi = 1.5; for (let i = 0; i < 60; i++) { const a = (lo + hi) / 2; if (a * Math.tan(a) < c * L / EI) lo = a; else hi = a; }
  const cc = column([0, 1, 0], L, 8, [1, 1, 1, 1, 1, 0], null, 1e5); cc.nodes[0].spring = [0, 0, 0, 0, 0, c];
  for (const nd of cc.nodes) if (!nd.fix) nd.fix = [0, 0, 1, 1, 1, 0];
  near('column on a rotational spring: buckling load', buckling(prepare(cc.nodes, cc.members), cc.N).lambda * 1e5, EI * (lo / L) ** 2, 3e-3);
  // a vertical spring: the foot settles by what it carries over its stiffness
  const s = solveCases(prepare([{ p: [0, 0, 0], fix: [1, 0, 1, 1, 1, 1], spring: [0, 2e9, 0, 0, 0, 0] }, { p: [0, L, 0] }], [m(0, 1)]), [{ loads: Float64Array.from({ length: 12 }, (_, i) => (i === 7 ? -4e6 : 0)) }]).cases[0];
  near('a foot on a vertical spring settles', -s.u[1], 4e6 / 2e9);
  near('...and the spring holds it up', s.reactions[1], 4e6);
}
{ // two equal cantilevers side by side, their tips joined by a stiff connector along x: a push on one is shared
  // equally; with a connector as stiff as one cantilever, the pushed one carries two thirds
  const L = 8, Hf = 1e5, EI = steel.E * sec.Iz, kc = 3 * EI / L ** 3;
  for (const [k, want] of [[1e6 * kc, 0.5], [kc, 2 / 3]]) {
    const nodes = [{ p: [0, 0, 0], fix: fixed }, { p: [0, L, 0] }, { p: [3, 0, 0], fix: fixed }, { p: [3, L, 0] }], d = [1, 0, 0];
    const conn = { a: 1, b: 3, spring: [[k, [...d, 0, 0, 0, ...d.map(v => -v), 0, 0, 0]]] };
    const loads = new Float64Array(24); loads[6] = Hf;
    const r = solveCases(prepare(nodes, [m(0, 1), m(2, 3), conn]), [{ loads }]).cases[0];
    near(`a connector ${want === 0.5 ? 'far stiffer than' : 'as stiff as'} the cantilevers: the pushed one's share`, Math.abs(r.reactions[0]) / Hf, want, 2e-3);
  }
}

// ---- imposed strains: warming
{ // a bar held at both ends, warmed 25 K: it pushes on them with E A alpha dT
  const L = 10, eps = 12e-6 * 25, M = prepare([{ p: [0, 0, 0], fix: fixed }, { p: [L / 2, 0, 0] }, { p: [L, 0, 0], fix: fixed }], [m(0, 1), m(1, 2)]);
  const r = solveCases(M, [{ loads: new Float64Array(18), strains: new Map([[0, [eps, 0, 0]], [1, [eps, 0, 0]]]) }]).cases[0];
  near('a bar warmed between two walls: its push', r.forces[0].N, -steel.E * sec.A * eps);
  near('...and it does not move', r.u[6], 0);
  // free at one end it grows by alpha dT L and pushes on nothing
  const F = solveCases(prepare([{ p: [0, 0, 0], fix: fixed }, { p: [L, 0, 0] }], [m(0, 1)]), [{ loads: new Float64Array(12), strains: new Map([[0, [eps, 0, 0]]]) }]).cases[0];
  near('a bar warmed, free at one end: it grows', F.u[6], eps * L);
}
{ // a cantilever warmer on one side (curvature kappa): free, its tip rises kappa L^2 / 2 and nothing is stressed;
  // built in at both ends it stays straight and the walls bend it back with E I kappa
  const L = 6, kap = 1e-4;
  for (const [s, idx, I, sign] of [[[0, kap, 0], 1, sec.Iz, 1], [[0, 0, kap], 2, sec.Iy, 1]]) {
    const free = solveCases(prepare([{ p: [0, 0, 0], fix: fixed }, { p: [L, 0, 0] }], [m(0, 1)]), [{ loads: new Float64Array(12), strains: new Map([[0, s]]) }]).cases[0];
    near(`warmed on one side, free (${idx === 1 ? 'v' : 'w'}): its tip moves`, sign * free.u[6 + idx], kap * L * L / 2);
    near(`warmed on one side, free (${idx === 1 ? 'v' : 'w'}): no moment`, Math.abs(free.forces[0].f[idx === 1 ? 5 : 4]), 0, 1e-6);
    const held = solveCases(prepare([{ p: [0, 0, 0], fix: fixed }, { p: [L / 2, 0, 0] }, { p: [L, 0, 0], fix: fixed }], [m(0, 1), m(1, 2)]), [{ loads: new Float64Array(18), strains: new Map([[0, s], [1, s]]) }]).cases[0];
    near(`warmed on one side, built in (${idx === 1 ? 'v' : 'w'}): its moment`, Math.abs(held.forces[0].f[idx === 1 ? 5 : 4]), steel.E * I * kap);
    near(`warmed on one side, built in (${idx === 1 ? 'v' : 'w'}): it stays straight`, held.u[6 + idx], 0);
  }
}

// ---- natural frequency
{ // a light cantilever with a mass m at its tip: f = sqrt(3 E I / (L^3 m)) / 2 pi
  const L = 7, mass = 5e4, nodes = [{ p: [0, 0, 0], fix: fixed }, { p: [0, L, 0] }], M = prepare(nodes, [m(0, 1)]);
  const r = solveCases(M, [{ loads: new Float64Array(12) }]), mm = new Float64Array(12); mm[6] = mass;
  near('natural frequency of a mass on a cantilever', modes(M, r.FK, mm).hz, Math.sqrt(3 * steel.E * sec.Iz / (L ** 3 * mass)) / (2 * Math.PI), 1e-4);
}

// ---- the steel: what yield a plate has, by its thickness (EN 10025-6 for S690QL, EN 10025-2 for S355)
{
  near('S690QL plate 40 mm', grade(MATERIAL.alloy, 0.04).fy / 1e6, 690);
  near('S690QL plate 80 mm', grade(MATERIAL.alloy, 0.08).fy / 1e6, 650);
  near('S690QL plate 140 mm', grade(MATERIAL.alloy, 0.14).fy / 1e6, 630);
  near('S355 plate 12 mm', grade(MATERIAL.s355, 0.012).fy / 1e6, 355);
  near('S355 plate 120 mm', grade(MATERIAL.s355, 0.12).fy / 1e6, 295);
  const s = SECTION.box(3, 2, 0.3);                    // a 300 mm wall is made of plies, none thicker than is rolled
  near('a 300 mm wall of S690QL is three plies of 100 mm', plies(s, MATERIAL.alloy).n, 3);
  near('...each yielding at 650 MPa', plies(s, MATERIAL.alloy).fy / 1e6, 650);
  near('a 40 mm wall is one plate', plies(SECTION.box(1, 1, 0.04), MATERIAL.alloy).n, 1);
}

// ---- the sparse solver against a dense one, on a frame big enough to be cut by the nested dissection
{
  // a braced lattice tower, leaning and twisted, with rods and beams, loaded every which way
  const nodes = [], members = [], lv = 14, rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let k = 0; k <= lv; k++) for (let c = 0; c < 4; c++) {
    const a = c * Math.PI / 2 + k * 0.05, r = 6 - k * 0.2;
    nodes.push({ p: [r * Math.cos(a) + k * 0.3, k * 4, r * Math.sin(a)], fix: k === 0 ? (c % 2 ? fixed : pin) : null });
  }
  const at = (k, c) => 4 * k + (c % 4);
  for (let k = 0; k < lv; k++) for (let c = 0; c < 4; c++) {
    members.push(m(at(k, c), at(k + 1, c)));
    members.push(m(at(k + 1, c), at(k + 1, c + 1), { A: sec.A * 0.6 }));
    members.push({ a: at(k, c), b: at(k + 1, c + 1), E: steel.E, G: steel.G, ...SECTION.round(0.04), axial: true });
  }
  const loads = new Float64Array(6 * nodes.length);
  for (let i = 4; i < 6 * nodes.length; i++) if (nodes[Math.floor(i / 6)].fix === null) loads[i] = (rnd() - 0.5) * 1e5;
  const sparse = solveFrame(nodes, members, loads), dense = denseSolve(nodes, members, loads);
  let err = 0, big = 0;
  for (let i = 0; i < dense.length; i++) { err = Math.max(err, Math.abs(sparse.u[i] - dense[i])); big = Math.max(big, Math.abs(dense[i])); }
  near('sparse solver against the dense one (largest difference / largest displacement)', err / big, 0, 1e-9);
}
{ // two members side by side between the same two nodes (a doubled bar): twice as stiff, and the ordering
  // must still number each node once
  const L = 10, P = 1e5, loads = new Float64Array(12); loads[6 + 1] = -P;
  const r = solveFrame([{ p: [0, 0, 0], fix: fixed }, { p: [L, 0, 0] }], [m(0, 1), m(0, 1)], loads);
  near('doubled cantilever: half the deflection', -r.u[7], P * L ** 3 / (6 * steel.E * sec.Iz));
  const loose = solveFrame([{ p: [0, 0, 0], fix: pin }, { p: [5, 0, 0] }, { p: [5, 3, 0] }], [m(0, 1), m(0, 1), m(1, 2)], new Float64Array(18));
  near('doubled members on a mechanism: still found to be one', loose.unstable ? 1 : 0, 1);
}

// ---- the load take-down, with cases and combinations
{ // load path: a weight on a beam, the beam on two posts, the posts on the ground
  resetStructure();
  const W = 20000;                                          // kg
  assembly('beam').member([0, 3, 0], [6, 3, 0], sec).mass([3, 3, 0], W).rest([0, 3, 0], 'posts').rest([6, 3, 0], 'posts', 'yz');
  const P = assembly('posts');
  for (const x of [0, 6]) P.member([x, 0, 0], [x, 3, 0], sec).rest([x, 0, 0], 'ground', 'fix');
  const res = analyse(), down = res.terminal.ground.reduce((s, t) => s - t.f[1], 0);
  const own = (6 + 3 + 3) * sec.A * steel.rho * GRAVITY;
  near('everything reaches the ground', down, W * GRAVITY + own);
  near('both assemblies hold', res.rows.filter(r => r.ok).length, 2);
}
{ // two posts joined into one frame by a beam that belongs to one of them: the frame is solved as one,
  // and a sideways push on one post is shared through the beam
  resetStructure();
  const A = assembly('post A'), B = assembly('post B'); A.frame = B.frame = 'pair';
  A.member([0, 0, 0], [0, 10, 0], sec).rest([0, 0, 0], 'ground', 'fix').member([0, 10, 0], [5, 10, 0], sec);
  B.member([5, 0, 0], [5, 10, 0], sec).rest([5, 0, 0], 'ground', 'fix');
  A.force([0, 10, 0], [1e5, 0, 0], 'push', 'wind +x');
  const res = analyse(), sh = res.terminal.ground.map(t => t.cases['wind +x'][0]);
  near('a frame of two assemblies: the push is shared', sh[1] / 1e5, 0.5, 0.05);
}
{ // a bracket of two links off a wall, a weight at its point: the level one pushes W, the one at 45 degrees
  // pulls W sqrt 2. A link carries push as well as pull (a tie in its place would go slack and let it fall).
  resetStructure();
  const W = 1e4, rod = SECTION.round(0.05);
  assembly('bracket').member([0, 0, 0], [2, 0, 0], rod, steel, 'link').member([0, 2, 0], [2, 0, 0], rod, steel, 'link')
    .mass([2, 0, 0], W).rest([0, 0, 0], 'wall', 'pin').rest([0, 2, 0], 'wall', 'pin').rest([2, 0, 0], 'wall', 'z');
  const res = analyse(), at = (y) => res.terminal.wall.find(t => Math.abs(t.p[0]) < 1e-6 && Math.abs(t.p[1] - y) < 1e-6);
  const own = rod.A * steel.rho * GRAVITY;          // N per metre of each link
  // the level link: W g plus half its own weight and half the other's, carried to the point and pushed back
  near('a link in compression: the push on the wall', Math.abs(at(0).f[0]), W * GRAVITY + own * (2 + 2 * Math.SQRT2) / 2, 2e-3);
  near('the bracket holds', res.rows.find(r => r.name === 'bracket').ok ? 1 : 0, 1);
}

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);

// The old dense solver, kept here as the reference the sparse solver is checked against.
function denseSolve(nodes, members, loads) {
  const n = nodes.length, dof = new Int32Array(6 * n).fill(-1), framed = new Uint8Array(n);
  for (const mm of members) if (!mm.axial) { framed[mm.a] = 1; framed[mm.b] = 1; }
  let nf = 0;
  for (let i = 0; i < n; i++) for (let d = 0; d < 6; d++) { if (nodes[i].fix && nodes[i].fix[d]) continue; if (d >= 3 && !framed[i]) continue; dof[6 * i + d] = nf++; }
  const K = new Float64Array(nf * nf), f = new Float64Array(nf);
  for (let i = 0; i < 6 * n; i++) if (dof[i] >= 0) f[dof[i]] = loads[i];
  for (const mm of members) {
    const pa = nodes[mm.a].p, pb = nodes[mm.b].p, L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]), R = axes(pa, pb);
    const k = Array.from({ length: 12 }, () => new Float64Array(12)), set = (i, j, v) => { k[i][j] += v; if (i !== j) k[j][i] += v; };
    const EA = mm.E * mm.A / L; set(0, 0, EA); set(6, 6, EA); set(0, 6, -EA);
    if (!mm.axial) {
      const GJ = mm.G * mm.J / L; set(3, 3, GJ); set(9, 9, GJ); set(3, 9, -GJ);
      for (const [EI, v, r, s] of [[mm.E * mm.Iz, 1, 5, 1], [mm.E * mm.Iy, 2, 4, -1]]) {
        const a = 12 * EI / L ** 3, b = 6 * EI / L ** 2 * s, c = 4 * EI / L, d = 2 * EI / L;
        set(v, v, a); set(v + 6, v + 6, a); set(v, v + 6, -a); set(v, r, b); set(v, r + 6, b); set(v + 6, r, -b); set(v + 6, r + 6, -b); set(r, r, c); set(r + 6, r + 6, c); set(r, r + 6, d);
      }
    }
    const idx = [...Array(6).keys()].map(d => 6 * mm.a + d).concat([...Array(6).keys()].map(d => 6 * mm.b + d));
    for (let b1 = 0; b1 < 4; b1++) for (let b2 = 0; b2 < 4; b2++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      let s = 0; for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) s += R[p][i] * k[3 * b1 + p][3 * b2 + q] * R[q][j];
      const gi = dof[idx[3 * b1 + i]], gj = dof[idx[3 * b2 + j]]; if (gi >= 0 && gj >= 0) K[gi * nf + gj] += s;
    }
  }
  for (let j = 0; j < nf; j++) {
    let d = K[j * nf + j]; for (let k = 0; k < j; k++) d -= K[j * nf + k] ** 2; d = Math.sqrt(d); K[j * nf + j] = d;
    for (let i = j + 1; i < nf; i++) { let s = K[i * nf + j]; for (let k = 0; k < j; k++) s -= K[i * nf + k] * K[j * nf + k]; K[i * nf + j] = s / d; }
  }
  const u = new Float64Array(nf);
  for (let i = 0; i < nf; i++) { let s = f[i]; for (let k = 0; k < i; k++) s -= K[i * nf + k] * u[k]; u[i] = s / K[i * nf + i]; }
  for (let i = nf - 1; i >= 0; i--) { let s = u[i]; for (let k = i + 1; k < nf; k++) s -= K[k * nf + i] * u[k]; u[i] = s / K[i * nf + i]; }
  const U = new Float64Array(6 * n); for (let i = 0; i < 6 * n; i++) if (dof[i] >= 0) U[i] = u[dof[i]];
  return U;
}
