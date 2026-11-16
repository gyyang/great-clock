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
// members that meet there. The nodes are numbered so that joined nodes are numbered close
// together (reverse Cuthill-McKee), which keeps every column of the matrix short, and only the
// part of each column from its first non-zero down to the diagonal is stored and factorised
// (a skyline, or profile, solver). The factorisation is exact: L D L', the same answer the dense
// one gives, and a pivot that vanishes still names the loose freedom.
//
// Stability. A member in compression is less stiff sideways than one that is not: a column
// pushed hard enough buckles with no sideways load at all. That is the geometric stiffness Kg,
// proportional to each member's axial force N (tension stiffens, compression softens). The
// structure buckles at the load factor lambda at which K + lambda Kg first becomes singular.
// critical() finds the lowest such lambda (the elastic critical load factor) by the Lanczos
// method, and definite() says exactly whether K + lambda Kg is still positive definite at a given
// lambda (by counting negative pivots). A frame loaded by N and analysed with K + Kg instead of K
// includes the extra moments from its own sway (P-delta).
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

// Reverse Cuthill-McKee: number the nodes outward from one end of the structure, breadth first,
// fewest connections first, then reverse. Joined nodes end up close together in the numbering.
function rcm(n, adj) {
  const deg = adj.map(a => a.length), seen = new Uint8Array(n), scratch = new Uint8Array(n), order = [];
  const bfs = (s, mark) => {
    const lev = [s], out = [s]; mark[s] = 1;
    for (let h = 0; h < out.length; h++) {
      const v = out[h], nb = adj[v].filter(w => !mark[w]).sort((a, b) => deg[a] - deg[b]);
      for (const w of nb) if (!mark[w]) { mark[w] = 1; out.push(w); }        // (two members may join the same two nodes)
      lev.push(out.length);
    }
    return out;
  };
  for (let s0 = 0; s0 < n; s0++) {
    if (seen[s0]) continue;
    // a pseudo-peripheral start: the far end of a breadth-first sweep, twice
    let s = s0;
    if (adj[s0].length) for (let k = 0; k < 2; k++) { const o = bfs(s, scratch.fill(0)); s = o[o.length - 1]; }       // (marks only reach s0's own component, which nothing has seen yet)
    const comp = bfs(s, seen);
    order.push(...comp);
  }
  return order.reverse();
}

// Everything about a frame that does not depend on the loads: its numbering, its members'
// matrices, and the shape of its stiffness matrix.
//   nodes:   [{ p: [x, y, z], fix: [6 booleans] | undefined }]
//   members: [{ a, b (node indices), E, G, A, Iy, Iz, J, axial }]
export function prepare(nodes, members) {
  const n = nodes.length, dof = new Int32Array(6 * n).fill(-1);
  const framed = new Uint8Array(n), adj = Array.from({ length: n }, () => []);
  for (const m of members) { if (!m.axial) { framed[m.a] = 1; framed[m.b] = 1; } adj[m.a].push(m.b); adj[m.b].push(m.a); }
  let neq = 0;
  for (const i of rcm(n, adj)) for (let d = 0; d < 6; d++) {
    if (nodes[i].fix && nodes[i].fix[d]) continue;
    if (d >= 3 && !framed[i]) continue;          // a node touched only by tie rods has no rotational stiffness: leave its rotations out
    dof[6 * i + d] = neq++;
  }
  const el = members.map((m) => {
    const pa = nodes[m.a].p, pb = nodes[m.b].p, L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    const R = axes(pa, pb), kl = localK(m, L), idx = new Int32Array(12), eq = new Int32Array(12);
    for (let d = 0; d < 6; d++) { idx[d] = 6 * m.a + d; idx[6 + d] = 6 * m.b + d; }
    for (let i = 0; i < 12; i++) eq[i] = dof[idx[i]];
    return { L, R, kl, kg: rotate(kl, R), idx, eq };
  });
  // the skyline: for each equation, the first row in its column that is not zero
  const fr = new Int32Array(neq); for (let j = 0; j < neq; j++) fr[j] = j;
  for (const e of el) { let mn = Infinity; for (const q of e.eq) if (q >= 0 && q < mn) mn = q; for (const q of e.eq) if (q >= 0 && mn < fr[q]) fr[q] = mn; }
  const p = new Int32Array(neq + 1);
  for (let j = 0; j < neq; j++) p[j + 1] = p[j] + (j - fr[j] + 1);
  return { nodes, members, n, neq, dof, el, fr, p, size: p[neq] };
}

function addTo(M, vals, e, k, scale = 1) {
  const { fr, p } = M;
  for (let i = 0; i < 12; i++) {
    const gi = e.eq[i]; if (gi < 0) continue;
    for (let j = 0; j < 12; j++) { const gj = e.eq[j]; if (gj < gi) continue; vals[p[gj] + gi - fr[gj]] += scale * k[i * 12 + j]; }
  }
}
export function stiffness(M) {
  const K = new Float64Array(M.size);
  for (const e of M.el) addTo(M, K, e, e.kg);
  return K;
}
// N: axial force in each member (tension positive)
export function geometric(M, N) {
  const Kg = new Float64Array(M.size);
  M.el.forEach((e, k) => { if (N[k]) addTo(M, Kg, e, rotate(localKg(M.members[k], e.L, N[k]), e.R)); });
  return Kg;
}

// L D L' in place, column by column. Returns { ok, D, negatives, at }: `at` is the first
// equation whose pivot vanished (a freedom nothing resists), when `strict` asks for that.
export function factor(M, A, { strict = true } = {}) {
  const { fr, p, neq } = M, D = new Float64Array(neq);
  let scale = 0; for (let j = 0; j < neq; j++) scale = Math.max(scale, Math.abs(A[p[j] + j - fr[j]]));
  let negatives = 0;
  for (let j = 0; j < neq; j++) {
    const pj = p[j], fj = fr[j];
    for (let i = fj + 1; i < j; i++) {                // g_ij = a_ij - sum l_ki g_kj
      const fi = fr[i], pi = p[i], k0 = fi > fj ? fi : fj;
      let s = 0;
      for (let k = k0; k < i; k++) s += A[pi + k - fi] * A[pj + k - fj];
      A[pj + i - fj] -= s;
    }
    const diag = A[pj + j - fj];
    let d = diag;
    for (let i = fj; i < j; i++) { const g = A[pj + i - fj], l = g / D[i]; d -= l * g; A[pj + i - fj] = l; }
    if (strict && !(d > 1e-10 * Math.abs(diag) && d > 1e-13 * scale)) return { ok: false, at: j };
    if (d <= 0) negatives++;
    D[j] = d; A[pj + j - fj] = d;
  }
  return { ok: true, D, negatives, L: A };
}
// solve with a factorised matrix, in place on b
export function back(M, F, b) {
  const { fr, p, neq } = M, A = F.L, D = F.D;
  for (let j = 0; j < neq; j++) { const pj = p[j], fj = fr[j]; let s = b[j]; for (let i = fj; i < j; i++) s -= A[pj + i - fj] * b[i]; b[j] = s; }
  for (let j = 0; j < neq; j++) b[j] /= D[j];
  for (let j = neq - 1; j >= 0; j--) { const pj = p[j], fj = fr[j], x = b[j]; for (let i = fj; i < j; i++) b[i] -= A[pj + i - fj] * x; }
  return b;
}
// y = A x for a symmetric skyline matrix
function mult(M, A, x, y) {
  const { fr, p, neq } = M; y.fill(0);
  for (let j = 0; j < neq; j++) {
    const pj = p[j], fj = fr[j], xj = x[j]; let s = 0;
    for (let i = fj; i < j; i++) { const a = A[pj + i - fj]; y[i] += a * xj; s += a * x[i]; }
    y[j] += s + A[pj + j - fj] * xj;
  }
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
  for (let j = 0; j < Math.min(steps, n); j++) {
    Q.push(q); P.push(pk);
    const w = mult(M, Kg, q, new Float64Array(n)); for (let i = 0; i < n; i++) w[i] = -w[i];     // w = -Kg q
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
export function solveCases(M, cases, { N = null, K = null } = {}) {
  const { neq, dof, el, n } = M;
  K = K || stiffness(M);
  let A = K;
  if (N) { const Kg = geometric(M, N); A = new Float64Array(M.size); for (let i = 0; i < A.length; i++) A[i] = K[i] + Kg[i]; }
  else A = Float64Array.from(K);
  const F = factor(M, A);
  if (!F.ok) {
    let g = 0; for (; g < dof.length; g++) if (dof[g] === F.at) break;
    // (every equation belongs to a freedom of some node; if not, say so rather than name a node that is not there)
    return { unstable: g < dof.length ? { node: Math.floor(g / 6), freedom: g % 6 } : { node: -1, freedom: -1 } };
  }
  const out = cases.map((c) => {
    const loads = Float64Array.from(c.loads), local = new Map();
    // what the members' own loads put on the joints
    if (c.lines) for (const [k, w] of c.lines) {
      const e = el[k], R = e.R, q = [0, 1, 2].map(i => R[i][0] * w[0] + R[i][1] * w[1] + R[i][2] * w[2]), fe = lineLoads(q, e.L);
      local.set(k, { q, fe });
      for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) loads[e.idx[3 * b + i]] += R[0][i] * fe[3 * b] + R[1][i] * fe[3 * b + 1] + R[2][i] * fe[3 * b + 2];
    }
    const u = new Float64Array(neq);
    for (let i = 0; i < 6 * n; i++) if (dof[i] >= 0) u[dof[i]] = loads[i];
    back(M, F, u);
    const U = new Float64Array(6 * n);
    for (let i = 0; i < 6 * n; i++) if (dof[i] >= 0) U[i] = u[dof[i]];
    const R = new Float64Array(6 * n);
    const forces = el.map((e, k) => {
      const ul = toLocal(e.R, Array.from(e.idx, i => U[i])), fl = new Float64Array(12), Rm = e.R;
      for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += e.kl[i * 12 + j] * ul[j]; fl[i] = s; }
      if (N && N[k]) { const g = localKg(M.members[k], e.L, N[k]); for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += g[i * 12 + j] * ul[j]; fl[i] += s; } }
      const ln = local.get(k);
      if (ln) for (let i = 0; i < 12; i++) fl[i] -= ln.fe[i];
      for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) R[e.idx[3 * b + i]] += Rm[0][i] * fl[3 * b] + Rm[1][i] * fl[3 * b + 1] + Rm[2][i] * fl[3 * b + 2];
      return { L: e.L, N: fl[6], f: fl, q: ln ? ln.q : [0, 0, 0] };
    });
    for (let i = 0; i < 6 * n; i++) R[i] = dof[i] >= 0 ? 0 : R[i] - c.loads[i];
    return { u: U, forces, reactions: R };
  });
  return { cases: out, K, FK: F };
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
