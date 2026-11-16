// Linear static analysis of a 3-D frame by the direct stiffness method.
//
// Nodes have six freedoms (three translations, three rotations). A member is a
// straight prismatic bar between two nodes, rigidly jointed at both ends (riveted
// work), or `axial` (a tie rod: it can pull and push along its length and nothing
// else). Loads are forces at nodes. The result is the displacement of every node,
// the force in every member, and the reaction at every support, or, if the
// stiffness matrix is singular, the node at which the structure is free to move:
// which is what "attached to nothing" means in numbers.
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

// 12 x 12 stiffness of one member in its own axes (freedoms: u v w rx ry rz at each end).
function localK(m, L) {
  const k = Array.from({ length: 12 }, () => new Float64Array(12));
  const set = (i, j, v) => { k[i][j] += v; if (i !== j) k[j][i] += v; };
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

// nodes:   [{ p: [x, y, z], fix: [6 booleans] | undefined }]
// members: [{ a, b (node indices), E, G, A, Iy, Iz, J, axial }]
// loads:   Float64Array(6 * nodes.length), forces and moments in world axes
export function solveFrame(nodes, members, loads) {
  const n = nodes.length, dof = new Int32Array(6 * n).fill(-1);
  // a node touched only by tie rods has no rotational stiffness: leave its rotations out
  const framed = new Uint8Array(n);
  for (const m of members) if (!m.axial) { framed[m.a] = 1; framed[m.b] = 1; }
  let nf = 0;
  for (let i = 0; i < n; i++) for (let d = 0; d < 6; d++) {
    if (nodes[i].fix && nodes[i].fix[d]) continue;
    if (d >= 3 && !framed[i]) continue;
    dof[6 * i + d] = nf++;
  }
  const K = new Float64Array(nf * nf), f = new Float64Array(nf);
  for (let i = 0; i < 6 * n; i++) if (dof[i] >= 0) f[dof[i]] = loads[i];

  const el = members.map((m) => {
    const pa = nodes[m.a].p, pb = nodes[m.b].p, L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    const R = axes(pa, pb), kl = localK(m, L);
    // global k = T' kl T, with T made of four copies of R
    const T = (v) => { const o = new Float64Array(12); for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) o[3 * b + i] = R[i][0] * v[3 * b] + R[i][1] * v[3 * b + 1] + R[i][2] * v[3 * b + 2]; return o; };
    const kg = Array.from({ length: 12 }, () => new Float64Array(12));
    for (let b1 = 0; b1 < 4; b1++) for (let b2 = 0; b2 < 4; b2++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) s += R[p][i] * kl[3 * b1 + p][3 * b2 + q] * R[q][j];
      kg[3 * b1 + i][3 * b2 + j] = s;
    }
    const idx = [...Array(6).keys()].map(d => 6 * m.a + d).concat([...Array(6).keys()].map(d => 6 * m.b + d));
    for (let i = 0; i < 12; i++) { const gi = dof[idx[i]]; if (gi < 0) continue; for (let j = 0; j < 12; j++) { const gj = dof[idx[j]]; if (gj >= 0) K[gi * nf + gj] += kg[i][j]; } }
    return { L, kl, T, idx };
  });

  let scale = 0; for (let i = 0; i < nf; i++) scale = Math.max(scale, K[i * nf + i]);
  // Cholesky, in place. A pivot that vanishes is a freedom nothing resists.
  for (let j = 0; j < nf; j++) {
    let d = K[j * nf + j];
    for (let k = 0; k < j; k++) d -= K[j * nf + k] ** 2;
    if (!(d > scale * 1e-11)) { const g = dof.indexOf(j); return { unstable: { node: Math.floor(g / 6), freedom: g % 6 } }; }
    d = Math.sqrt(d); K[j * nf + j] = d;
    for (let i = j + 1; i < nf; i++) {
      let s = K[i * nf + j];
      for (let k = 0; k < j; k++) s -= K[i * nf + k] * K[j * nf + k];
      K[i * nf + j] = s / d;
    }
  }
  const u = new Float64Array(nf);
  for (let i = 0; i < nf; i++) { let s = f[i]; for (let k = 0; k < i; k++) s -= K[i * nf + k] * u[k]; u[i] = s / K[i * nf + i]; }
  for (let i = nf - 1; i >= 0; i--) { let s = u[i]; for (let k = i + 1; k < nf; k++) s -= K[k * nf + i] * u[k]; u[i] = s / K[i * nf + i]; }

  const U = new Float64Array(6 * n);
  for (let i = 0; i < 6 * n; i++) if (dof[i] >= 0) U[i] = u[dof[i]];
  // member end forces in the member's own axes, and what the supports push back with
  const R = new Float64Array(6 * n);
  const forces = el.map((e, k) => {
    const ul = e.T(e.idx.map(i => U[i])), fl = new Float64Array(12);
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) fl[i] += e.kl[i][j] * ul[j];
    // back to world axes to accumulate reactions
    const pa = nodes[members[k].a].p, pb = nodes[members[k].b].p, Rm = axes(pa, pb);
    for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) R[e.idx[3 * b + i]] += Rm[0][i] * fl[3 * b] + Rm[1][i] * fl[3 * b + 1] + Rm[2][i] * fl[3 * b + 2];
    return { L: e.L, N: fl[6], Ma: [fl[3], fl[4], fl[5]], Mb: [fl[9], fl[10], fl[11]] };     // N > 0: tension
  });
  for (let i = 0; i < 6 * n; i++) R[i] = dof[i] >= 0 ? 0 : R[i] - loads[i];
  return { u: U, forces, reactions: R };
}
