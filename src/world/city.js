// The town outside, generated from a seed.
//
// Five districts, each with its own street grid at its own angle, meet at
// irregular seams. A block is one of: terraced rows around a yard, a mill
// with a saw-tooth roof and a stack, a gasworks, a church, a civic building
// with a dome, or an open square. A river runs across in front of the dial
// with three bridges over it. Everything is merged into two meshes (walls,
// which carry the lit windows, and roofs) plus one instanced mesh of lamps.
import * as THREE from 'three';
import { G, MAT, mulberry32, cbox } from '../kit.js';
import { TOWER, STACK } from '../layout.js';

const RADIUS = 1150;                    // the haze has swallowed everything by here
const BLOCK = [84, 118], STREET = 13;   // a block and the street round it, metres
const RIVER = { z: 372, half: 38, slope: 0.07 };          // centre line z = RIVER.z + slope * x
const STOREY = 3.2;                     // the facade texture is 5 storeys by 5 bays to a 16 m tile
const PLAIN_UV = [0.02, 0.98];          // a spot on the facade texture with no window

export function buildCity() {
  const rand = mulberry32(1887), R = (a, b) => a + (b - a) * rand(), pick = (a) => a[Math.floor(rand() * a.length)];
  const walls = { p: [], n: [], uv: [], c: [] }, roofs = { p: [], n: [], uv: null, c: [] };
  const lamps = [], blocks = [];
  let cs = 1, sn = 0, tx = 0, tz = 0, inside = [0, 0, 0], colliders = 0, dry = false;      // dry: draw nothing (but use up the same random numbers)

  // ---- geometry: everything is emitted in world space, in the current block's frame
  const P = (x, y, z) => [tx + x * cs - z * sn, y, tz + x * sn + z * cs];
  const a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), c3 = new THREE.Vector3(), n3 = new THREE.Vector3();
  function tri(t, a, b, c, col, ua, ub, uc) {
    if (dry) return;
    a3.fromArray(a); b3.fromArray(b); c3.fromArray(c);
    n3.copy(b3).sub(a3).cross(c3.sub(a3));
    if (n3.lengthSq() < 1e-10) return;
    n3.normalize();
    // face away from the inside of whatever is being built
    if (n3.x * ((a[0] + b[0] + c[0]) / 3 - inside[0]) + n3.y * ((a[1] + b[1] + c[1]) / 3 - inside[1]) + n3.z * ((a[2] + b[2] + c[2]) / 3 - inside[2]) < 0) { n3.negate(); [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    for (const v of [a, b, c]) { t.p.push(v[0], v[1], v[2]); t.n.push(n3.x, n3.y, n3.z); t.c.push(col[0], col[1], col[2]); }
    if (t.uv) for (const u of [ua, ub, uc]) t.uv.push(...(u || PLAIN_UV));
  }
  const quad = (t, a, b, c, d, col, uv) => { tri(t, a, b, c, col, uv && uv[0], uv && uv[1], uv && uv[2]); tri(t, a, c, d, col, uv && uv[0], uv && uv[2], uv && uv[3]); };

  // A wall with whole storeys and whole bays of windows on it.
  function wall(ax, az, bx, bz, y0, y1, col, windows = true) {
    let uv = null;
    if (windows) {
      const bays = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / STOREY)), floors = Math.max(1, Math.round((y1 - y0) / STOREY));
      const u0 = Math.floor(rand() * 5) / 5, v0 = Math.floor(rand() * 5) / 5;
      uv = [[u0, v0], [u0 + bays / 5, v0], [u0 + bays / 5, v0 + floors / 5], [u0, v0 + floors / 5]];
    }
    quad(walls, P(ax, y0, az), P(bx, y0, bz), P(bx, y1, bz), P(ax, y1, az), col, uv);
  }
  function box(x0, x1, z0, z1, y0, y1, col, { windows = true, top = null } = {}) {
    inside = P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    wall(x0, z0, x1, z0, y0, y1, col, windows); wall(x1, z0, x1, z1, y0, y1, col, windows);
    wall(x1, z1, x0, z1, y0, y1, col, windows); wall(x0, z1, x0, z0, y0, y1, col, windows);
    if (top) quad(roofs, P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1), top);
  }
  // Pitched roof on a rectangle, ridge along its longer side (or along x if forced).
  function gable(x0, x1, z0, z1, y, rise, roofCol, wallCol, alongX = (x1 - x0) >= (z1 - z0), over = 0.35) {
    inside = P((x0 + x1) / 2, y, (z0 + z1) / 2);
    if (alongX) {
      const zm = (z0 + z1) / 2;
      quad(roofs, P(x0, y, z0 - over), P(x1, y, z0 - over), P(x1, y + rise, zm), P(x0, y + rise, zm), roofCol);
      quad(roofs, P(x0, y, z1 + over), P(x1, y, z1 + over), P(x1, y + rise, zm), P(x0, y + rise, zm), roofCol);
      tri(walls, P(x0, y, z0), P(x0, y, z1), P(x0, y + rise, zm), wallCol); tri(walls, P(x1, y, z0), P(x1, y, z1), P(x1, y + rise, zm), wallCol);
    } else {
      const xm = (x0 + x1) / 2;
      quad(roofs, P(x0 - over, y, z0), P(x0 - over, y, z1), P(xm, y + rise, z1), P(xm, y + rise, z0), roofCol);
      quad(roofs, P(x1 + over, y, z0), P(x1 + over, y, z1), P(xm, y + rise, z1), P(xm, y + rise, z0), roofCol);
      tri(walls, P(x0, y, z0), P(x1, y, z0), P(xm, y + rise, z0), wallCol); tri(walls, P(x0, y, z1), P(x1, y, z1), P(xm, y + rise, z1), wallCol);
    }
  }
  // Four slopes meeting at a point (spires) or at a short ridge (hipped roofs).
  function hip(x0, x1, z0, z1, y, rise, col, ridge = 0) {
    inside = P((x0 + x1) / 2, y, (z0 + z1) / 2);
    const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, a = P(xm - ridge, y + rise, zm), b = P(xm + ridge, y + rise, zm);
    tri(roofs, P(x0, y, z0), P(x0, y, z1), a, col); tri(roofs, P(x1, y, z0), P(x1, y, z1), b, col);
    quad(roofs, P(x0, y, z0), P(x1, y, z0), b, a, col); quad(roofs, P(x0, y, z1), P(x1, y, z1), b, a, col);
  }
  // Round things: stacks, gasholders, drums. Tapered if r1 differs from r0.
  function drum(t, cx, cz, r0, r1, y0, y1, seg, col, cap = null) {
    inside = P(cx, (y0 + y1) / 2, cz);
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2;
      const p = (r, ang, y) => P(cx + Math.cos(ang) * r, y, cz + Math.sin(ang) * r);
      quad(t, p(r0, a, y0), p(r0, b, y0), p(r1, b, y1), p(r1, a, y1), col);
      if (cap) tri(roofs, p(r1, a, y1), p(r1, b, y1), P(cx, y1 + (cap.rise || 0), cz), cap.col);
    }
  }
  const lamp = (x, z, y = 5.2) => { if (dry) return; const w = P(x, y, z); lamps.push(w); };
  const solid = (x0, x1, z0, z1, h) => {
    if (dry) return;
    const c = P((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    if (Math.hypot(c[0], c[2]) > 520 || colliders > 700) return;
    colliders++;
    cbox(x1 - x0, h, z1 - z0, c[0], c[1], c[2], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(sn, cs)));
  };

  // ---- colours (they multiply the facade texture, which is a warm grey)
  const BRICK = [[1.35, 0.85, 0.68], [1.15, 0.8, 0.68], [0.95, 0.8, 0.72], [0.72, 0.68, 0.66], [1.2, 1.1, 0.95]];
  const SLATE = [[0.19, 0.2, 0.23], [0.15, 0.16, 0.19], [0.23, 0.22, 0.24]], TILE = [[0.3, 0.16, 0.12], [0.25, 0.14, 0.11]];
  const STONE = [1.25, 1.18, 1.05], SOOT = [0.5, 0.47, 0.45], LEAD = [0.3, 0.32, 0.34], COPPER = [0.24, 0.42, 0.36];
  const PAVE = [0.2, 0.19, 0.175], YARD = [0.1, 0.095, 0.085], GRASS = [0.09, 0.13, 0.07];
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  // ---- what stands on a block. Local frame: x across (w), z along (d), origin at the block's centre.
  function terraces(w, d, far, rich) {
    const depth = R(9, 11.5), baseH = (rich ? 12.5 : 7.5) + R(0, 3), roofSet = rand() < 0.3 ? TILE : SLATE;
    const row = (x0, x1, z0, z1, alongX) => {
      const len = alongX ? x1 - x0 : z1 - z0;
      let s = 0;
      while (s < len - 4) {
        const seg = Math.min(len - s, R(16, 38)), e = s + seg;
        const h = baseH + R(-0.8, 1.6), col = shade(pick(BRICK), R(0.8, 1.1)), rc = shade(pick(roofSet), R(0.85, 1.15));
        const [a0, a1, b0, b1] = alongX ? [x0 + s, x0 + e, z0, z1] : [x0, x1, z0 + s, z0 + e];
        box(a0, a1, b0, b1, 0.2, h, col);
        gable(a0, a1, b0, b1, h, depth * R(0.3, 0.42), rc, col, alongX);
        solid(a0, a1, b0, b1, h);
        if (!far) for (let c = 3; c < seg - 1; c += R(5.2, 6.4)) {                   // a stack on the party wall of every house
          const [cx, cz] = alongX ? [a0 + c, (b0 + b1) / 2] : [(a0 + a1) / 2, b0 + c];
          box(cx - 0.55, cx + 0.55, cz - 0.4, cz + 0.4, h + depth * 0.2, h + depth * 0.36 + 1.5, SOOT, { windows: false, top: [0.05, 0.05, 0.05] });
        }
        s = e + (rand() < 0.12 ? R(3, 5) : 0);                                      // now and then a ginnel through to the yard
      }
    };
    const hw = w / 2, hd = d / 2;
    row(-hw, -hw + depth, -hd, hd, false); row(hw - depth, hw, -hd, hd, false);
    row(-hw + depth + 1, hw - depth - 1, -hd, -hd + depth, true); row(-hw + depth + 1, hw - depth - 1, hd - depth, hd, true);
    if (!far && d > 60) for (const sx of [-1, 1]) for (let z = -hd + depth + 5; z < hd - depth - 5; z += R(5.5, 7))      // back extensions into the yard
      { const x0 = sx * (hw - depth - 5.5), x1 = sx * (hw - depth); box(Math.min(x0, x1), Math.max(x0, x1), z, z + 3.4, 0.2, 5.2, shade(pick(BRICK), 0.85), { windows: false, top: shade(SLATE[0], 0.9) }); }
  }

  function mill(w, d, far) {
    const hw = w / 2 - 4, hd = d / 2 - 6, h = R(13, 21), col = shade(pick(BRICK), R(0.8, 1.0));
    box(-hw, hw, -hd, hd, 0.2, h, col); solid(-hw, hw, -hd, hd, h);
    // north-light roof: a row of saw teeth, steep glazed face one way, slate the other
    const bays = Math.round((2 * hd) / 8.5), bay = (2 * hd) / bays, rise = 3.6;
    for (let i = 0; i < bays; i++) {
      const z0 = -hd + i * bay, z1 = z0 + bay;
      inside = P(0, h, z0 + bay * 0.4);
      quad(roofs, P(-hw, h, z0), P(hw, h, z0), P(hw, h + rise, z0 + bay * 0.82), P(-hw, h + rise, z0 + bay * 0.82), shade(SLATE[1], R(0.9, 1.1)));
      const n = Math.max(1, Math.round(2 * hw / STOREY)), u0 = Math.floor(rand() * 5) / 5, v0 = Math.floor(rand() * 5) / 5;
      quad(walls, P(-hw, h + rise, z0 + bay * 0.82), P(hw, h + rise, z0 + bay * 0.82), P(hw, h, z1), P(-hw, h, z1), [0.8, 0.85, 0.9], [[u0, v0 + 0.2], [u0 + n / 5, v0 + 0.2], [u0 + n / 5, v0], [u0, v0]]);
      for (const sx of [-1, 1]) tri(walls, P(sx * hw, h, z0), P(sx * hw, h + rise, z0 + bay * 0.82), P(sx * hw, h, z1), col);
    }
    // engine house and the stack
    const ex = hw - 9, ez = -hd - 0.5;
    box(ex - 8, ex + 8, ez - 9, ez, 0.2, h + 5, col); gable(ex - 8, ex + 8, ez - 9, ez, h + 5, 3.5, SLATE[0], col);
    const sx = -hw + 7, sz = hd - 7, sh = R(48, 82), r = R(2.6, 3.6);
    box(sx - r * 1.5, sx + r * 1.5, sz - r * 1.5, sz + r * 1.5, h, h + 7, col, { windows: false, top: SOOT });
    drum(walls, sx, sz, r, r * 0.62, h + 7, sh, far ? 6 : 10, shade(BRICK[0], 0.8));
    drum(walls, sx, sz, r * 0.72, r * 0.72, sh, sh + 1.6, far ? 6 : 10, SOOT);
    for (const lx of [-hw - 2, hw + 2]) for (let z = -hd; z <= hd; z += 28) lamp(lx, z);
  }

  function gasworks(w, d) {
    const n = rand() < 0.5 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const r = R(15, 22), cz = n === 1 ? 0 : (i ? 1 : -1) * (d / 4), h = R(10, 26);
      drum(walls, 0, cz, r, r, 0.2, h, 20, [0.42, 0.44, 0.46], { rise: 2.2, col: LEAD });
      for (let k = 0; k < 10; k++) {                                              // guide frame
        const a = k / 10 * Math.PI * 2, px = Math.cos(a) * (r + 1.2), pz = cz + Math.sin(a) * (r + 1.2);
        box(px - 0.35, px + 0.35, pz - 0.35, pz + 0.35, 0.2, 31, [0.3, 0.3, 0.32], { windows: false });
      }
      for (const y of [16, 30.6]) drum(walls, 0, cz, r + 1.5, r + 1.5, y, y + 0.7, 20, [0.3, 0.3, 0.32]);
      solid(-r, r, cz - r, cz + r, h);
    }
    box(-w / 2 + 3, -w / 2 + 17, -8, 8, 0.2, 8, shade(BRICK[1], 0.9)); gable(-w / 2 + 3, -w / 2 + 17, -8, 8, 8, 3.2, SLATE[1], shade(BRICK[1], 0.9));
  }

  function church(w, d) {
    const hw = Math.min(11, w / 2 - 8), z0 = -d / 2 + 16, z1 = d / 2 - 22, h = R(13, 17), col = shade(STONE, R(0.55, 0.75));
    box(-hw, hw, z0, z1, 0.2, h, col); gable(-hw, hw, z0, z1, h, hw * 1.15, shade(SLATE[0], 0.9), col, false);
    for (const sx of [-1, 1]) { const x0 = sx * hw, x1 = sx * (hw + 5.5); box(Math.min(x0, x1), Math.max(x0, x1), z0 + 3, z1 - 3, 0.2, h * 0.55, col, { top: LEAD }); }   // aisles
    const t = 4.6, tz0 = z1, th = h + R(14, 24);
    box(-t, t, tz0, tz0 + 2 * t, 0.2, th, col); hip(-t - 0.3, t + 0.3, tz0 - 0.3, tz0 + 2 * t + 0.3, th, R(22, 38), rand() < 0.5 ? COPPER : shade(SLATE[1], 0.9));
    solid(-hw, hw, z0, z1 + 2 * t, h);
    quad(roofs, P(-w / 2 + 2, 0.32, -d / 2 + 2), P(w / 2 - 2, 0.32, -d / 2 + 2), P(w / 2 - 2, 0.32, d / 2 - 2), P(-w / 2 + 2, 0.32, d / 2 - 2), GRASS);   // churchyard
  }

  function civic(w, d) {
    const hw = w / 2 - 9, hd = Math.min(d / 2 - 12, 34), h = R(17, 24), col = shade(STONE, R(0.7, 0.9));
    box(-hw, hw, -hd, hd, 0.2, h, col); hip(-hw - 0.6, hw + 0.6, -hd - 0.6, hd + 0.6, h, 6, LEAD, hw * 0.45); solid(-hw, hw, -hd, hd, h);
    box(-hw * 0.45, hw * 0.45, -hd - 5, -hd, 0.2, h + 3, col); gable(-hw * 0.45, hw * 0.45, -hd - 5, -hd, h + 3, 4, LEAD, col, true, 0.6);   // portico
    const r = Math.min(hw, hd) * 0.42;
    drum(walls, 0, 0, r, r, h + 4, h + 12, 14, col);
    for (let k = 0; k < 5; k++) { const a = k / 5, b = (k + 1) / 5, ra = r * Math.cos(a * 1.45), rb = r * Math.cos(b * 1.45); drum(roofs, 0, 0, ra, rb, h + 12 + Math.sin(a * 1.45) * r, h + 12 + Math.sin(b * 1.45) * r, 14, COPPER); }
    drum(walls, 0, 0, 1.3, 1.3, h + 12 + r * 0.99, h + 17 + r, 6, col, { rise: 4, col: COPPER });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lamp(sx * (hw + 4), sz * (hd + 4), 6);
  }

  // The stack's yard (the stack itself: facade.js). The block is given up to it: a yard of setts inside a brick wall,
  // with a gate onto the street the flue comes along, and the gatekeeper's lodge beside it. (sx, sz): the stack, here.
  function stackYard(w, d, sx, sz) {
    const col = shade(BRICK[0], 0.9), hw = 2.6, gate = [sz - 5, sz + 5];
    quad(roofs, P(-w / 2 + 0.6, 0.27, -d / 2 + 0.6), P(w / 2 - 0.6, 0.27, -d / 2 + 0.6), P(w / 2 - 0.6, 0.27, d / 2 - 0.6), P(-w / 2 + 0.6, 0.27, d / 2 - 0.6), shade(PAVE, 1.3));
    const run = (x0, x1, z0, z1) => { box(x0, x1, z0, z1, 0.2, hw, col, { windows: false, top: shade(STONE, 0.6) }); solid(x0, x1, z0, z1, hw); };
    run(-w / 2, w / 2, -d / 2, -d / 2 + 0.5); run(-w / 2, w / 2, d / 2 - 0.5, d / 2); run(-w / 2, -w / 2 + 0.5, -d / 2, d / 2);
    run(w / 2 - 0.5, w / 2, -d / 2, gate[0]); run(w / 2 - 0.5, w / 2, gate[1], d / 2);
    box(w / 2 - 7, w / 2 - 1, gate[1] + 2, gate[1] + 8, 0.2, 5.5, col, { top: null }); gable(w / 2 - 7, w / 2 - 1, gate[1] + 2, gate[1] + 8, 5.5, 2.2, SLATE[0], col); solid(w / 2 - 7, w / 2 - 1, gate[1] + 2, gate[1] + 8, 5.5);
    for (const z of gate) lamp(w / 2 + 1.6, z);
  }

  function square(w, d) {
    quad(roofs, P(-w / 2 + 6, 0.32, -d / 2 + 6), P(w / 2 - 6, 0.32, -d / 2 + 6), P(w / 2 - 6, 0.32, d / 2 - 6), P(-w / 2 + 6, 0.32, d / 2 - 6), GRASS);
    box(-2.2, 2.2, -2.2, 2.2, 0.2, 3.5, shade(STONE, 0.8), { windows: false, top: shade(STONE, 0.5) });
    drum(walls, 0, 0, 0.9, 0.7, 3.5, 19, 8, shade(STONE, 0.8), { rise: 2.5, col: COPPER });
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; lamp(Math.cos(a) * 16, Math.sin(a) * 16, 5.5); }
  }

  // ---- lay the districts out
  const districts = [{ x: 0, z: 0, a: 0, rich: true }];
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + R(0.4, 1.1), r = R(520, 760); districts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, a: R(-0.6, 0.6), rich: rand() < 0.3 }); }
  const owner = (x, z) => { let best = 0, bd = Infinity; districts.forEach((d, i) => { const q = (x - d.x) ** 2 + (z - d.z) ** 2; if (q < bd) { bd = q; best = i; } }); return best; };
  const inRiver = (x, z, margin) => Math.abs(z - (RIVER.z + RIVER.slope * x)) < RIVER.half + margin;
  const pitchX = BLOCK[0] + STREET, pitchZ = BLOCK[1] + STREET;

  districts.forEach((dist, di) => {
    const c = Math.cos(dist.a), s = Math.sin(dist.a), n = Math.ceil(RADIUS * 1.3 / pitchX);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const lx = i * pitchX, lz = j * pitchZ + (i % 2 ? pitchZ / 2 : 0);          // staggered, so cross streets do not run straight through
      cs = c; sn = s; tx = dist.x + lx * c - lz * s; tz = dist.z + lx * s + lz * c;
      const dc = Math.hypot(tx, tz);
      if (dc > RADIUS) continue;
      // Blocks vary in size; the remainder is street. Where districts meet, a block that would
      // cross the seam is cut down until it fits, so the seams become odd corners and wide junctions.
      const w0 = BLOCK[0] - R(0, 16), d0 = BLOCK[1] - R(0, 26);
      const fits = (k) => [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]].map(([a, b]) => P(a * (w0 * k / 2 + STREET / 2), 0, b * (d0 * k / 2 + STREET / 2)))
        .every(p => owner(p[0], p[2]) === di && !inRiver(p[0], p[2], 8) && !(Math.abs(p[0]) < TOWER.hx + 62 && Math.abs(p[2]) < TOWER.hz + 78));   // nor in the river, nor in the tower's square
      const k = [1, 0.74, 0.52].find(fits);
      if (!k) continue;
      const w = w0 * k, d = d0 * k, far = dc > 620, roll = rand(), big = k === 1;
      blocks.push({ x: tx, z: tz, a: dist.a, w, d, roll: +roll.toFixed(2), big });
      inside = P(0, -5, 0);
      quad(roofs, P(-w / 2 - 2.5, 0.2, -d / 2 - 2.5), P(w / 2 + 2.5, 0.2, -d / 2 - 2.5), P(w / 2 + 2.5, 0.2, d / 2 + 2.5), P(-w / 2 - 2.5, 0.2, d / 2 + 2.5), shade(PAVE, R(0.9, 1.1)));   // pavement
      quad(roofs, P(-w / 2 + 10, 0.26, -d / 2 + 10), P(w / 2 - 10, 0.26, -d / 2 + 10), P(w / 2 - 10, 0.26, d / 2 - 10), P(-w / 2 + 10, 0.26, d / 2 - 10), YARD);
      // (the block the stack stands in is built dry, so that the rest of the town is as it would be, and given to the stack)
      const lsx = (STACK.x - tx) * cs + (STACK.z - tz) * sn, lsz = -(STACK.x - tx) * sn + (STACK.z - tz) * cs, works = Math.abs(lsx) < w / 2 && Math.abs(lsz) < d / 2;
      dry = works;
      if (roll < 0.66 || !big) { if (roll < 0.9) terraces(w, d, far, dist.rich); else square(w, d); }
      else if (roll < 0.8) mill(w, d, far);
      else if (roll < 0.86) gasworks(w, d);
      else if (roll < 0.91) church(w, d);
      else if (roll < 0.96) civic(w, d);
      else square(w, d);
      dry = false;
      if (works) stackYard(w, d, lsx, lsz);
      if (!far || rand() < 0.4) for (const sx of [-1, 1]) for (let z = -d / 2; z <= d / 2; z += 29) lamp(sx * (w / 2 + 1.6), z);
    }
  });

  // ---- the river, its embankments and bridges (world frame)
  cs = 1; sn = 0; tx = 0; tz = 0;
  const rz = (x) => RIVER.z + RIVER.slope * x, X = RADIUS + 300;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2 * X, 2 * RIVER.half).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0b1114, roughness: 0.12, metalness: 0.0, envMapIntensity: 1.6 }));
  water.material.userData.outdoor = true;
  water.rotation.y = -Math.atan(RIVER.slope); water.position.set(0, 0.45, RIVER.z); G.scene.add(water);
  for (const sg of [-1, 1]) for (let x = -X; x < X; x += 60) {                                   // stone embankments
    const z0 = rz(x) + sg * RIVER.half, z1 = rz(x + 60) + sg * RIVER.half;
    inside = [x + 30, -3, (z0 + z1) / 2 + sg * 2];
    quad(walls, [x, 0.3, z0], [x + 60, 0.3, z1], [x + 60, 1.7, z1], [x, 1.7, z0], shade(STONE, 0.55));
    quad(walls, [x, 0.0, z0 + sg * 1.6], [x + 60, 0.0, z1 + sg * 1.6], [x + 60, 1.7, z1 + sg * 1.6], [x, 1.7, z0 + sg * 1.6], shade(STONE, 0.55));
    quad(roofs, [x, 1.7, z0], [x + 60, 1.7, z1], [x + 60, 1.7, z1 + sg * 1.6], [x, 1.7, z0 + sg * 1.6], shade(STONE, 0.3));
    if (Math.abs(x) < 800) lamps.push([x + 30, 6.5, (z0 + z1) / 2 + sg * 3]);
  }
  for (const bx of [-470, -20, 430]) {                                                          // bridges
    sn = Math.sin(Math.atan(RIVER.slope)); cs = Math.cos(Math.atan(RIVER.slope)); tx = bx; tz = rz(bx);
    const L = RIVER.half + 14, col = shade(STONE, 0.6);
    box(-7.5, 7.5, -L, L, 4.6, 6.2, col, { windows: false, top: PAVE });
    for (const sx of [-1, 1]) box(sx * 7.5 - 0.3, sx * 7.5 + 0.3, -L, L, 6.2, 7.3, col, { windows: false, top: shade(STONE, 0.4) });   // parapets
    for (const pz of [-RIVER.half * 0.55, 0, RIVER.half * 0.55]) box(-8.5, 8.5, pz - 2.2, pz + 2.2, 0, 4.6, col, { windows: false });
    for (const sz of [-1, 1]) { inside = P(0, -4, sz * (L + 9)); quad(roofs, P(-7.5, 6.2, sz * L), P(7.5, 6.2, sz * L), P(7.5, 0.2, sz * (L + 34)), P(-7.5, 0.2, sz * (L + 34)), PAVE); }   // ramps down to the streets
    cbox(15, 1.6, 2 * L, bx, 5.4, rz(bx), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan(RIVER.slope)));
    for (const sx of [-1, 1]) for (let z = -L; z <= L; z += 17) lamp(sx * 7.5, z, 10);
  }

  // ---- into the scene
  const geo = (t) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(t.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(t.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(t.c, 3));
    if (t.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(t.uv, 2));
    return g;
  };
  MAT.city.vertexColors = true; MAT.city.userData.outdoor = true;
  MAT.cityRoof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05 });
  MAT.cityRoof.userData.outdoor = true;
  G.scene.add(new THREE.Mesh(geo(walls), MAT.city), new THREE.Mesh(geo(roofs), MAT.cityRoof));

  // gas lamps: small, bright, and not dimmed by the haze, so the far streets read as strings of light
  const lm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), MAT.bulb, lamps.length), m4 = new THREE.Matrix4();
  lamps.forEach((p, i) => { const r = 0.2 + Math.hypot(p[0], p[2]) * 0.0011; lm.setMatrixAt(i, m4.makeScale(r, r, r).setPosition(p[0], p[1], p[2])); });
  lm.frustumCulled = false; G.scene.add(lm);

  return { triangles: (walls.p.length + roofs.p.length) / 9, lamps: lamps.length, colliders, blocks };
}
