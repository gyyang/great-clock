// Analysis of a 3-D frame by the direct stiffness method: linear, second order (P-delta), and
// elastic buckling.
//
// Nodes have six freedoms (three translations, three rotations). A member is a straight
// prismatic bar between two nodes, rigidly jointed at both ends (riveted or welded work), or
// `axial` (a tie rod: it can pull and push along its length and nothing else). Loads are forces
// at nodes, and loads spread uniformly along members (a member's own weight, the brick a girder
// carries, the wind on it). The result is the displacement of every node, the forces at each end
// of every member, and the reaction at every support, or, if the stiffness matrix is singular,
// the freedom that nothing resists: which is what "attached to nothing" means in numbers.
//
// The stiffness matrix of a building is almost all zeros: a joint is touched only by the
// members that meet there, and only what is not zero is stored. Factorising it fills in some of the
// zeros, and how many depends on the order the joints are numbered in. They are numbered by nested
// dissection: the structure is cut in two across its longest extent along a line of joints, each
// half is numbered (cut again the same way) before the joints on the cut, and so on down to pieces
// of a few dozen joints. Eliminating a piece then only fills in among its own joints and the cuts
// around it. The factorisation is exact, L D L', the same answer the dense one gives, and a pivot
// that vanishes still names a loose freedom.

// Stability. A member in compression is less stiff sideways than one that is not: a column
// pushed hard enough buckles with no sideways load at all. That is the geometric stiffness Kg,
// proportional to each member's axial force N (tension stiffens, compression softens). The
// structure buckles at the load factor lambda at which K + lambda Kg first becomes singular.
// critical() finds the lowest such lambda (the elastic critical load factor) by the Lanczos
// method, and definite() says exactly whether K + lambda Kg is still positive definite at a given
// lambda (by counting negative pivots). A frame loaded by N and analysed with K + Kg instead of K
// includes the extra moments from its own sway (P-delta).
//
// Springs. A node may be held to the ground by springs instead of being fixed (`spring`: six
// stiffnesses, N/m and N m/rad, in world axes): a foot on its foundation, which settles and rocks
// as the rock under it allows. And a spring element joins two nodes through a connector that is
// not modelled as a member (a tie from one frame to another): { a, b, spring: [[k, c], ...] },
// each c twelve numbers saying what stretches the spring in terms of the two nodes' freedoms
// (world axes), so that its stiffness is the sum of k c c'.
//
// The direct analysis (AISC 360 Chapter C). solveCases can scale the elastic stiffness (kScale) and
// the geometric stiffness (gScale) separately: (0.8 K + 1.6 Kg) u = 1.6 F, the frame at 1.6 times
// its working loads with its stiffness reduced to 0.8, is the same as (0.5 K + Kg) u = F, and the
// member forces it returns are then already divided back by 1.6.
//
// Imposed strains: a case may warm members (`strains`: member -> [axial strain, curvature of v'',
// curvature of w'']), which then push on whatever holds them. And modes() gives the natural
// frequency of a frame from its stiffness and its lumped masses.
//
// Pure numbers: nothing here knows about the scene, three.js or the physics world.

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

// Rows are the member's own axes in world coordinates: x' along it, y' as nearly
// upward as it can be, z' completing the set. Bending "in the vertical plane"
// is therefore bending about z', resisted by Iz.
export function axes(a, b) {
  const x = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const ref = Math.abs(x[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const z = norm(cross(x, ref)), y = cross(z, x);
  return [x, y, z];
}

// 12 x 12 stiffness of one member in its own axes (freedoms: u v w rx ry rz at each end), row-major.
function localK(m, L) {
  const k = new Float64Array(144);
  const set = (i, j, v) => { k[i * 12 + j] += v; if (i !== j) k[j * 12 + i] += v; };
  const EA = m.E * m.A / L;
  set(0, 0, EA); set(6, 6, EA); set(0, 6, -EA);
  if (m.axial) return k;
  const GJ = m.G * m.J / L; set(3, 3, GJ); set(9, 9, GJ); set(3, 9, -GJ);
  // bending about z' (deflection in y'), then about y' (deflection in z')
  for (const [EI, v, r, s] of [[m.E * m.Iz, 1, 5, 1], [m.E * m.Iy, 2, 4, -1]]) {
    const a = 12 * EI / L ** 3, b = 6 * EI / L ** 2 * s, c = 4 * EI / L, d = 2 * EI / L;
    set(v, v, a); set(v + 6, v + 6, a); set(v, v + 6, -a);
    set(v, r, b); set(v, r + 6, b); set(v + 6, r, -b); set(v + 6, r + 6, -b);
    set(r, r, c); set(r + 6, r + 6, c); set(r, r + 6, d);
  }
  return k;
}

// The geometric stiffness of one member carrying an axial force N (tension positive), in its own
// axes: the consistent matrix for cubic bending shapes (Przemieniecki), and for a rod the string
// stiffness N / L sideways. Its sign convention matches localK's.
function localKg(m, L, N) {
  const k = new Float64Array(144);
  const set = (i, j, v) => { k[i * 12 + j] += v; if (i !== j) k[j * 12 + i] += v; };
  const c = N / L;
  if (m.axial) { for (const v of [1, 2]) { set(v, v, c); set(v + 6, v + 6, c); set(v, v + 6, -c); } return k; }
  for (const [v, r, s] of [[1, 5, 1], [2, 4, -1]]) {
    set(v, v, 1.2 * c); set(v + 6, v + 6, 1.2 * c); set(v, v + 6, -1.2 * c);
    set(v, r, s * N / 10); set(v, r + 6, s * N / 10); set(v + 6, r, -s * N / 10); set(v + 6, r + 6, -s * N / 10);
    set(r, r, 2 * N * L / 15); set(r + 6, r + 6, 2 * N * L / 15); set(r, r + 6, -N * L / 30);
  }
  const ip = (m.Iy + m.Iz) / m.A;                                    // a pushed bar also twists more easily
  set(3, 3, c * ip); set(9, 9, c * ip); set(3, 9, -c * ip);
  return k;
}

// global = T' k T, with T four copies of the 3 x 3 rotation R (rows: the member's axes)
function rotate(k, R) {
  const out = new Float64Array(144), t = new Float64Array(144);
  // t = k T
  for (let i = 0; i < 12; i++) for (let b = 0; b < 4; b++) for (let j = 0; j < 3; j++) {
    let s = 0; for (let p = 0; p < 3; p++) s += k[i * 12 + 3 * b + p] * R[p][j];
    t[i * 12 + 3 * b + j] = s;
  }
  // out = T' t
  for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) for (let j = 0; j < 12; j++) {
    let s = 0; for (let p = 0; p < 3; p++) s += R[p][i] * t[(3 * b + p) * 12 + j];
    out[(3 * b + i) * 12 + j] = s;
  }
  return out;
}
const toLocal = (R, v) => { const o = new Float64Array(12); for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) o[3 * b + i] = R[i][0] * v[3 * b] + R[i][1] * v[3 * b + 1] + R[i][2] * v[3 * b + 2]; return o; };

// Nested dissection, by the joints' positions: cut the set at its middle joint across each of the three axes in turn;
// the joints on one side that touch the other (the smaller such set) are that cut's separator. The cut with the
// smallest separator for how evenly it halves the set is taken, its separator numbered after both sides, which are
// numbered the same way first.
function dissect(nodes, adj) {
  const n = nodes.length, out = [], side = new Int8Array(n).fill(-1);
  const touching = (S, other) => S.filter(v => adj[v].some(w => side[w] === other));
  const cut = (set) => {
    if (set.length <= 8) { for (const v of set) out.push(v); return; }
    let best = null;
    for (let d = 0; d < 3; d++) {
      const sorted = set.slice().sort((a, b) => nodes[a].p[d] - nodes[b].p[d]), half = sorted.length >> 1, mid = nodes[sorted[half]].p[d];
      let L = [], R = [];
      for (const v of set) (nodes[v].p[d] < mid ? L : R).push(v);
      if (!L.length || !R.length) { L = sorted.slice(0, half); R = sorted.slice(half); }       // (many joints at one place)
      for (const v of L) side[v] = 0;
      for (const v of R) side[v] = 1;
      const bL = touching(L, 1), bR = touching(R, 0), S = bL.length <= bR.length ? bL : bR;
      for (const v of set) side[v] = -1;
      const score = S.length / Math.max(0.2, Math.min(L.length, R.length) / set.length);
      if (!best || score < best.score) best = { score, L, R, S };
    }
    const sep = new Set(best.S);
    cut(best.L.filter(v => !sep.has(v)));
    cut(best.R.filter(v => !sep.has(v)));
    for (const v of sep) out.push(v);
  };
  cut([...Array(n).keys()]);
  return out;
}

// Everything about a frame that does not depend on the loads: its numbering, its members'
// matrices, and the shape of its stiffness matrix.
//   nodes:   [{ p: [x, y, z], fix: [6 booleans] | undefined, spring: [6 stiffnesses] | undefined }]
//   members: [{ a, b (node indices), E, G, A, Iy, Iz, J, axial }] or [{ a, b, spring: [[k, c], ...] }]
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
function springK(m) {
  const k = new Float64Array(144);
  for (const [s, c] of m.spring) for (let i = 0; i < 12; i++) if (c[i]) for (let j = 0; j < 12; j++) k[i * 12 + j] += s * c[i] * c[j];
  return k;
}
export function prepare(nodes, members) {
  const n = nodes.length, dof = new Int32Array(6 * n).fill(-1);
  const framed = new Uint8Array(n), adj = Array.from({ length: n }, () => []);
  for (const m of members) {
    if (m.spring) { for (const [, c] of m.spring) { if (c[3] || c[4] || c[5]) framed[m.a] = 1; if (c[9] || c[10] || c[11]) framed[m.b] = 1; } }
    else if (!m.axial) { framed[m.a] = 1; framed[m.b] = 1; }
    adj[m.a].push(m.b); adj[m.b].push(m.a);
  }
  nodes.forEach((nd, i) => { if (nd.spring && (nd.spring[3] || nd.spring[4] || nd.spring[5])) framed[i] = 1; });
  let neq = 0;
  for (const i of dissect(nodes, adj)) for (let d = 0; d < 6; d++) {
    if (nodes[i].fix && nodes[i].fix[d]) continue;
    if (d >= 3 && !framed[i]) continue;          // a node touched only by tie rods has no rotational stiffness: leave its rotations out
    dof[6 * i + d] = neq++;
  }
  const el = members.map((m) => {
    const pa = nodes[m.a].p, pb = nodes[m.b].p, L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    const idx = new Int32Array(12), eq = new Int32Array(12);
    for (let d = 0; d < 6; d++) { idx[d] = 6 * m.a + d; idx[6 + d] = 6 * m.b + d; }
    for (let i = 0; i < 12; i++) eq[i] = dof[idx[i]];
    if (m.spring) { const k = springK(m); return { L, R: I3, kl: k, kg: k, idx, eq, spring: true }; }        // (already in world axes)
    const R = axes(pa, pb), kl = localK(m, L);
    return { L, R, kl, kg: rotate(kl, R), idx, eq };
  });
  // the springs that hold nodes to the ground, by equation
  const ground = [];
  nodes.forEach((nd, i) => { if (nd.spring) for (let d = 0; d < 6; d++) if (nd.spring[d] && dof[6 * i + d] >= 0) ground.push([6 * i + d, dof[6 * i + d], nd.spring[d]]); });
  // the upper triangle's pattern, column by column, rows in order: a joint's freedoms with its own and its neighbours'
  const near = adj.map((a, i) => [...new Set([i, ...a])]);
  const cp = new Int32Array(neq + 1);
  const rowsOf = (i, j, put) => { for (const w of near[i]) for (let d = 0; d < 6; d++) { const q = dof[6 * w + d]; if (q >= 0 && q <= j) put(q); } };
  for (let i = 0; i < n; i++) for (let d = 0; d < 6; d++) { const j = dof[6 * i + d]; if (j < 0) continue; let c = 0; rowsOf(i, j, () => c++); cp[j + 1] = c; }
  for (let j = 0; j < neq; j++) cp[j + 1] += cp[j];
  const ri = new Int32Array(cp[neq]), diag = new Int32Array(neq);
  for (let i = 0; i < n; i++) for (let d = 0; d < 6; d++) {
    const j = dof[6 * i + d]; if (j < 0) continue;
    let c = cp[j]; rowsOf(i, j, (q) => { ri[c++] = q; });
    ri.subarray(cp[j], cp[j + 1]).sort();
    diag[j] = cp[j + 1] - 1;
  }
  const where = (i, j) => { let lo = cp[j], hi = cp[j + 1] - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (ri[m] < i) lo = m + 1; else hi = m; } return lo; };
  for (const e of el) {
    e.pos = new Int32Array(144).fill(-1);
    for (let i = 0; i < 12; i++) { const gi = e.eq[i]; if (gi < 0) continue; for (let j = 0; j < 12; j++) { const gj = e.eq[j]; if (gj >= gi) e.pos[i * 12 + j] = where(gi, gj); } }
  }
  // the shape of the factor (Liu's elimination tree, and how many entries each column of L has)
  const parent = new Int32Array(neq), Lnz = new Int32Array(neq), flag = new Int32Array(neq), Lp = new Int32Array(neq + 1);
  for (let k = 0; k < neq; k++) {
    parent[k] = -1; flag[k] = k;
    for (let q = cp[k]; q < cp[k + 1]; q++) for (let i = ri[q]; i < k && flag[i] !== k; i = parent[i]) { if (parent[i] === -1) parent[i] = k; Lnz[i]++; flag[i] = k; }
  }
  for (let k = 0; k < neq; k++) Lp[k + 1] = Lp[k] + Lnz[k];
  return { nodes, members, n, neq, dof, el, cp, ri, diag, parent, Lp, Li: new Int32Array(Lp[neq]), size: cp[neq], ground };
}

function addTo(M, vals, e, k, scale = 1) {
  const pos = e.pos;
  for (let t = 0; t < 144; t++) { const q = pos[t]; if (q >= 0) vals[q] += scale * k[t]; }
}
export function stiffness(M) {
  const K = new Float64Array(M.size);
  for (const e of M.el) addTo(M, K, e, e.kg);
  for (const [, q, k] of M.ground) K[M.diag[q]] += k;
  return K;
}
// N: axial force in each member (tension positive)
export function geometric(M, N) {
  const Kg = new Float64Array(M.size);
  M.el.forEach((e, k) => { if (N[k] && !e.spring) addTo(M, Kg, e, rotate(localKg(M.members[k], e.L, N[k]), e.R)); });
  return Kg;
}

// L D L', row by row (the up-looking method: row k of L is found by a sparse triangular solve with
// the rows above it, along the elimination tree). Returns { ok, D, negatives, Lx }, or { ok: false, at }
// with `at` the first equation whose pivot vanished (a freedom nothing resists), when `strict` asks for that.
export function factor(M, A, { strict = true } = {}) {
  const { cp, ri, diag, parent, Lp, Li, neq: n } = M;
  const D = new Float64Array(n), Lx = new Float64Array(Lp[n]), Y = new Float64Array(n);
  const pattern = new Int32Array(n), flag = new Int32Array(n), Lnz = new Int32Array(n);
  let scale = 0; for (let j = 0; j < n; j++) scale = Math.max(scale, Math.abs(A[diag[j]]));
  let negatives = 0;
  for (let k = 0; k < n; k++) {
    let top = n; flag[k] = k;
    for (let q = cp[k]; q < cp[k + 1]; q++) {
      let i = ri[q]; Y[i] += A[q];
      let len = 0;
      for (; flag[i] !== k; i = parent[i]) { pattern[len++] = i; flag[i] = k; }
      while (len > 0) pattern[--top] = pattern[--len];
    }
    let d = Y[k]; Y[k] = 0;
    for (; top < n; top++) {
      const i = pattern[top], yi = Y[i], end = Lp[i] + Lnz[i]; Y[i] = 0;
      for (let q = Lp[i]; q < end; q++) Y[Li[q]] -= Lx[q] * yi;
      const l = yi / D[i]; d -= l * yi;
      Li[end] = k; Lx[end] = l; Lnz[i]++;
    }
    const a = A[diag[k]];
    if (strict && !(d > 1e-10 * Math.abs(a) && d > 1e-13 * scale)) return { ok: false, at: k };
    if (d <= 0) negatives++;
    D[k] = d;
  }
  return { ok: true, D, negatives, Lx };
}
// solve with a factorised matrix, in place on b
export function back(M, F, b) {
  const { Lp, Li, neq: n } = M, Lx = F.Lx, D = F.D;
  for (let j = 0; j < n; j++) { const x = b[j]; if (x) for (let q = Lp[j]; q < Lp[j + 1]; q++) b[Li[q]] -= Lx[q] * x; }
  for (let j = 0; j < n; j++) b[j] /= D[j];
  for (let j = n - 1; j >= 0; j--) { let s = b[j]; for (let q = Lp[j]; q < Lp[j + 1]; q++) s -= Lx[q] * b[Li[q]]; b[j] = s; }
  return b;
}
// A symmetric matrix in that pattern as the list of what is in it that is not zero (a geometric stiffness or a mass,
// multiplied by many times, is mostly zeros), so that multiplying by it costs what is in it.
function compact(M, A) {
  const { cp, ri, neq } = M; let nz = 0;
  for (let i = 0; i < A.length; i++) if (A[i]) nz++;
  const row = new Int32Array(nz), col = new Int32Array(nz), val = new Float64Array(nz); let q = 0;
  for (let j = 0; j < neq; j++) for (let t = cp[j]; t < cp[j + 1]; t++) { const a = A[t]; if (a) { row[q] = ri[t]; col[q] = j; val[q++] = a; } }
  return { row, col, val };
}
// y = A x for such a list
function multSparse(S, x, y) {
  const { row, col, val } = S; y.fill(0);
  for (let q = 0; q < val.length; q++) { const i = row[q], j = col[q], a = val[q]; y[i] += a * x[j]; if (i !== j) y[j] += a * x[i]; }
  return y;
}

// Is K + lambda Kg positive definite? Exactly, by counting the negative pivots of its
// factorisation (Sylvester's law of inertia): none means the frame is still stable at lambda.
export function definite(M, K, Kg, lambda) {
  const A = new Float64Array(M.size);
  for (let i = 0; i < A.length; i++) A[i] = K[i] + lambda * Kg[i];
  const F = factor(M, A, { strict: false });
  let neg = 0; for (let j = 0; j < M.neq; j++) if (!(F.D[j] > 0)) neg++;
  return neg === 0;
}

// The lowest load factor at which the frame buckles, and the shape it buckles in.
// K phi = lambda (-Kg) phi, solved as -Kg phi = mu K phi with mu = 1 / lambda by the Lanczos
// method in the K inner product (each step: one product with Kg, one solve with K), with full
// reorthogonalisation. The largest mu is the lowest lambda. Returns { lambda, mode, converged }.
export function critical(M, FK, Kg, { steps = 60, tol = 1e-7 } = {}) {
  const n = M.neq;
  if (!n) return { lambda: Infinity, converged: true };
  const Q = [], P = [], alpha = [], beta = [];
  // start from r = K^-1 s for an arbitrary s, so that K r = s is known without multiplying by K
  const s0 = new Float64Array(n); for (let i = 0; i < n; i++) s0[i] = Math.sin(i * 12.9898 + 1) * 0.5 + 0.7;
  const r = back(M, FK, Float64Array.from(s0)), bn = Math.sqrt(dot(r, s0));
  if (!(bn > 0)) return { lambda: Infinity, converged: true };
  let q = r.map(v => v / bn), pk = s0.map(v => v / bn);              // pk = K q, kept alongside q throughout
  let best = { lambda: Infinity, converged: false }, last = 0;
  const S = compact(M, Kg);
  for (let j = 0; j < Math.min(steps, n); j++) {
    Q.push(q); P.push(pk);
    const w = multSparse(S, q, new Float64Array(n)); for (let i = 0; i < n; i++) w[i] = -w[i];     // w = -Kg q
    const z = back(M, FK, Float64Array.from(w));                                           // z = K^-1 w, so K z = w
    const a = dot(q, w); alpha.push(a);
    const kz = Float64Array.from(w);
    // orthogonalise z against every earlier q in the K inner product (twice, for safety)
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < Q.length; i++) {
      const c = dot(P[i], z); if (!c) continue;
      const qi = Q[i], pi = P[i];
      for (let t = 0; t < n; t++) { z[t] -= c * qi[t]; kz[t] -= c * pi[t]; }
    }
    const b = Math.sqrt(Math.max(0, dot(z, kz)));
    // the largest eigenvalue of the tridiagonal so far, and whether it has settled
    const top = Math.max(...tql(alpha, beta).values);
    const done = !(b > 1e-12 * Math.abs(a) + 1e-300);
    if (top > 0 && j > 4 && Math.abs(top - last) < tol * top) { best.converged = true; break; }
    last = top;
    if (done) { best.converged = true; break; }
    beta.push(b);
    q = z.map(v => v / b); pk = kz.map(v => v / b);
  }
  const { values, vectors } = tql(alpha, beta.slice(0, alpha.length - 1), true);
  let top = -Infinity, at = -1;
  values.forEach((v, i) => { if (v > top) { top = v; at = i; } });
  if (!(top > 0)) return { lambda: Infinity, converged: true };
  // the buckled shape, in the equations' numbering
  const mode = new Float64Array(n), y = vectors[at];
  for (let i = 0; i < alpha.length; i++) { const c = y[i], qi = Q[i]; for (let t = 0; t < n; t++) mode[t] += c * qi[t]; }
  return { lambda: 1 / top, converged: best.converged, mode, steps: alpha.length };
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// Eigenvalues (and, if asked, eigenvectors) of a symmetric tridiagonal matrix with diagonal a and
// off-diagonal b, by the QL method with implicit shifts.
function tql(a, b, wantVectors = false) {
  const m = a.length, d = Float64Array.from(a), e = new Float64Array(m);
  for (let i = 0; i < m - 1; i++) e[i] = b[i] || 0;
  const Z = wantVectors ? Array.from({ length: m }, (_, i) => { const r = new Float64Array(m); r[i] = 1; return r; }) : null;
  for (let l = 0; l < m; l++) {
    for (let iter = 0; iter < 60; iter++) {
      let k = l;
      for (; k < m - 1; k++) { const dd = Math.abs(d[k]) + Math.abs(d[k + 1]); if (Math.abs(e[k]) <= 1e-15 * dd) break; }
      if (k === l) break;
      let g = (d[l + 1] - d[l]) / (2 * e[l]), r = Math.hypot(g, 1);
      g = d[k] - d[l] + e[l] / (g + (g >= 0 ? r : -r));
      let s = 1, c = 1, p = 0, i = k - 1;
      for (; i >= l; i--) {
        let f = s * e[i]; const bb = c * e[i];
        r = Math.hypot(f, g); e[i + 1] = r;
        if (r === 0) { d[i + 1] -= p; e[k] = 0; break; }
        s = f / r; c = g / r; g = d[i + 1] - p; r = (d[i] - g) * s + 2 * c * bb; p = s * r; d[i + 1] = g + p; g = c * r - bb;
        if (Z) for (let t = 0; t < m; t++) { f = Z[t][i + 1]; Z[t][i + 1] = s * Z[t][i] + c * f; Z[t][i] = c * Z[t][i] - s * f; }
      }
      if (r === 0 && i >= l) continue;
      d[l] -= p; e[l] = g; e[k] = 0;
    }
  }
  return { values: Array.from(d), vectors: Z ? Array.from({ length: m }, (_, j) => Z.map(row => row[j])) : null };
}

// The loads a uniform load along a member puts on its ends, in its own axes, if the ends were
// held (fixed-end forces with the opposite sign): half the load at each end and, sideways,
// q L^2 / 12 of moment. q: the load per metre in the member's own axes.
function lineLoads(q, L) {
  const f = new Float64Array(12);
  f[0] = f[6] = q[0] * L / 2;
  f[1] = f[7] = q[1] * L / 2; f[5] = q[1] * L * L / 12; f[11] = -q[1] * L * L / 12;
  f[2] = f[8] = q[2] * L / 2; f[4] = -q[2] * L * L / 12; f[10] = q[2] * L * L / 12;
  return f;
}

// Solve a prepared frame for several load cases at once, with K (first order) or with
// K + Kg(N) (second order, when `N` is given: the axial forces the geometric stiffness is
// taken at). Each case: { loads: Float64Array(6 n) of nodal forces and moments in world axes,
// lines: Map(member index -> [wx, wy, wz] world N per metre) }.
// Returns { unstable } or { cases: [{ u, forces, reactions }], K, FK }. A member's `forces` are
// { L, N, f, q }: f the twelve end forces in its own axes (by the nodes on the member), q its
// load per metre in its own axes, N its axial force (tension positive) at end b.
// Imposed strains (c.strains: Map(member index -> [eps, kv, kw]), the free axial strain and the free
// curvatures v'' and w'' of a member warmed evenly and warmed more on one side): the forces that hold
// its ends where they are, put on the joints instead. They are taken at the members' full stiffness.
function strainLoads(m, s) {
  const f = new Float64Array(12), EA = m.E * m.A * s[0];
  f[0] = -EA; f[6] = EA;
  if (!m.axial) { const Mz = m.E * m.Iz * (s[1] || 0), My = m.E * m.Iy * (s[2] || 0); f[5] = -Mz; f[11] = Mz; f[4] = My; f[10] = -My; }
  return f;
}
export function solveCases(M, cases, { N = null, K = null, kScale = 1, gScale = 1 } = {}) {
  const { neq, dof, el, n } = M;
  K = K || stiffness(M);
  let A;
  if (N) { const Kg = geometric(M, N); A = new Float64Array(M.size); for (let i = 0; i < A.length; i++) A[i] = kScale * K[i] + gScale * Kg[i]; }
  else { A = Float64Array.from(K); if (kScale !== 1) for (let i = 0; i < A.length; i++) A[i] *= kScale; }
  const F = factor(M, A);
  if (!F.ok) {
    let g = 0; for (; g < dof.length; g++) if (dof[g] === F.at) break;
    // (every equation belongs to a freedom of some node; if not, say so rather than name a node that is not there)
    return { unstable: g < dof.length ? { node: Math.floor(g / 6), freedom: g % 6 } : { node: -1, freedom: -1 } };
  }
  const gk = N ? el.map((e, k) => (N[k] && !e.spring ? localKg(M.members[k], e.L, N[k]) : null)) : null;
  const out = cases.map((c) => {
    const loads = Float64Array.from(c.loads), fes = new Array(el.length), qs = new Array(el.length);
    const put = (e, fe) => { const R = e.R; for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) loads[e.idx[3 * b + i]] += R[0][i] * fe[3 * b] + R[1][i] * fe[3 * b + 1] + R[2][i] * fe[3 * b + 2]; };
    // what the members' own loads put on the joints
    if (c.lines) for (const [k, w] of c.lines) {
      const e = el[k], R = e.R, q = [0, 1, 2].map(i => R[i][0] * w[0] + R[i][1] * w[1] + R[i][2] * w[2]), fe = lineLoads(q, e.L);
      fes[k] = fe; qs[k] = q;
      put(e, fe);
    }
    if (c.strains) for (const [k, s] of c.strains) {
      const e = el[k]; if (e.spring) continue;
      const fe = strainLoads(M.members[k], s);
      put(e, fe);
      if (fes[k]) for (let i = 0; i < 12; i++) fes[k][i] += fe[i]; else fes[k] = fe;
    }
    const u = new Float64Array(neq);
    for (let i = 0; i < 6 * n; i++) if (dof[i] >= 0) u[dof[i]] = loads[i];
    back(M, F, u);
    const U = new Float64Array(6 * n);
    for (let i = 0; i < 6 * n; i++) if (dof[i] >= 0) U[i] = u[dof[i]];
    const R = new Float64Array(6 * n), ul = new Float64Array(12), forces = new Array(el.length);
    for (let k = 0; k < el.length; k++) {
      const e = el[k], Rm = e.R, idx = e.idx, kl = e.kl, fl = new Float64Array(12);
      for (let b = 0; b < 4; b++) {
        const x = U[idx[3 * b]], y = U[idx[3 * b + 1]], z = U[idx[3 * b + 2]];
        for (let i = 0; i < 3; i++) ul[3 * b + i] = Rm[i][0] * x + Rm[i][1] * y + Rm[i][2] * z;
      }
      for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += kl[i * 12 + j] * ul[j]; fl[i] = kScale * s; }
      if (gk && gk[k]) { const g = gk[k]; for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += g[i * 12 + j] * ul[j]; fl[i] += gScale * s; } }
      const fe = fes[k];
      if (fe) for (let i = 0; i < 12; i++) fl[i] -= fe[i];
      for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) R[idx[3 * b + i]] += Rm[0][i] * fl[3 * b] + Rm[1][i] * fl[3 * b + 1] + Rm[2][i] * fl[3 * b + 2];
      // (a spring's force: what its first part is stretched by, times its stiffness)
      if (e.spring) { const [s, cv] = M.members[k].spring[0]; let d = 0; for (let i = 0; i < 12; i++) d += cv[i] * U[idx[i]]; forces[k] = { L: e.L, N: kScale * s * d, f: fl, q: [0, 0, 0], spring: true }; }
      else forces[k] = { L: e.L, N: fl[6], f: fl, q: qs[k] || [0, 0, 0] };
    }
    for (let i = 0; i < 6 * n; i++) R[i] = dof[i] >= 0 ? 0 : R[i] - c.loads[i];
    for (const [i, , k] of M.ground) R[i] = -kScale * k * U[i];            // what a spring to the ground holds back with is the ground's reaction
    return { u: U, forces, reactions: R };
  });
  return { cases: out, K, FK: F };
}

// The lowest natural frequency of a prepared frame, Hz, with `mass` (6 n numbers: kg on each
// translational freedom that is to move; others zero) lumped at its nodes: K phi = w^2 M phi,
// solved by the same Lanczos iteration as buckling (critical() with -M in place of Kg).
export function modes(M, FK, mass) {
  const Mm = new Float64Array(M.size);
  for (let i = 0; i < 6 * M.n; i++) { const q = M.dof[i]; if (q >= 0 && mass[i]) Mm[M.diag[q]] = -mass[i]; }
  const r = critical(M, FK, Mm, { steps: 80, tol: 1e-6 });
  return { hz: Math.sqrt(r.lambda) / (2 * Math.PI), mode: r.mode, converged: r.converged };
}

// The simple interface: one load vector of nodal forces, first order.
export function solveFrame(nodes, members, loads) {
  const M = prepare(nodes, members), r = solveCases(M, [{ loads }]);
  if (r.unstable) return r;
  const c = r.cases[0];
  return { u: c.u, reactions: c.reactions, forces: c.forces.map(f => ({ L: f.L, N: f.N, Ma: [f.f[3], f.f[4], f.f[5]], Mb: [f.f[9], f.f[10], f.f[11]], f: f.f })) };
}

// Elastic critical load factor of a frame under given member axial forces N, and the mode.
// `exact` also confirms by the inertia count that K + 0.99 lambda Kg is positive definite.
export function buckling(M, N, { K = null, FK = null } = {}) {
  K = K || stiffness(M);
  if (!FK) { FK = factor(M, Float64Array.from(K)); if (!FK.ok) return { lambda: 0 }; }
  const Kg = geometric(M, N);
  const r = critical(M, FK, Kg);
  return { ...r, Kg, K };
}
