// Checks the solver against cases with textbook answers. Run: npm test
import { solveFrame } from './solve.js';
import { assembly, analyse, resetStructure, SECTION, MATERIAL, GRAVITY } from './model.js';

let failed = 0;
const near = (name, got, want, tol = 1e-3) => {
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got.toPrecision(6)} (expected ${want.toPrecision(6)})`);
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
{ // load path: a weight on a beam, the beam on two posts, the posts on the ground
  resetStructure();
  const W = 20000;                                          // kg
  assembly('beam').member([0, 3, 0], [6, 3, 0], sec).mass([3, 3, 0], W).rest([0, 3, 0], 'posts').rest([6, 3, 0], 'posts');
  const P = assembly('posts');
  for (const x of [0, 6]) P.member([x, 0, 0], [x, 3, 0], sec).rest([x, 0, 0], 'ground', 'fix');
  const res = analyse(), down = res.terminal.ground.reduce((s, t) => s - t.f[1], 0);
  const own = (6 + 3 + 3) * sec.A * steel.rho * GRAVITY;
  near('everything reaches the ground', down, W * GRAVITY + own);
  near('both assemblies hold', res.rows.filter(r => r.ok).length, 2);
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
