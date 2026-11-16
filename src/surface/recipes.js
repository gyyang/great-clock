// Surface recipes. Each is a GLSL `surf(uv)` over one tile plus how that tile maps
// to the world: `tile` is metres per repeat (u, v) and `bump` is the full height
// range in millimetres. Colours are authored in sRGB through L().
//
// Tinted recipes (tint: true) build colour as  nt + tint * ta  so that the paint
// or the metal takes the material's colour while rust, dust and soot keep theirs.
//
// A tile repeats, so it must hold nothing you would recognise the second time:
// only grain, and structure that really is periodic (courses of brick, a floor
// plate). Rust, stains, tarnish and the colour of each individual brick are
// added by the material from position (material.js). `grain: true` marks a
// recipe with no structure at all, which the material also lays down twice at
// different scales so that even the grain has no period.

const brick = {
  size: 1, tile: [2.7, 2.7], bump: 16,
  glsl: /* glsl */`
  // Engineering brick, 225 x 75 mm on 10 mm lime mortar. Stretcher courses with a
  // header course every sixth, the way thick industrial walls were tied together.
  void surf(vec2 uv) {
    vec2 N = vec2(12.0, 36.0);
    float row = floor(uv.y * N.y), header = step(mod(row, 6.0), 0.5);
    float nx = N.x * (1.0 + header);
    vec2 q = vec2(uv.x * nx + mod(row, 2.0) * 0.5 + header * 0.25, uv.y * N.y);
    vec2 id = floor(q), f = fract(q), per = vec2(nx, N.y);
    vec3 r = h3(id, per, 3.0), r2 = h3(id, per, 9.0);

    // distance to the edge of this brick, in metres, with the arris nibbled by noise
    vec2 dm = min(f, 1.0 - f) * vec2(2.7 / nx, 0.075);
    float nib = fbm(uv, 110.0, 3, 7.0) - 0.5, coarse = fbm(uv, 28.0, 3, 8.0) - 0.5;
    float edge = min(dm.x, dm.y) + nib * 0.005 * (0.4 + 2.2 * r2.y) + coarse * 0.003;
    float body = smoothstep(0.0045, 0.0075, edge);            // 1 on the brick, 0 in the joint
    float arris = smoothstep(0.0075, 0.019, edge);            // rounded-over corner

    // the brick itself: one clay, lightly varied. Which bricks came out dark, pale or
    // over-fired is decided per brick in the wall, by the material.
    vec3 col = L(0.37, 0.215, 0.17) * (0.93 + 0.14 * r.y);
    float mott = fbm(uv, 64.0, 4, 11.0), sand = fbm(uv, 220.0, 2, 12.0);
    col *= 0.8 + 0.4 * mott;
    col = mix(col, col * vec3(0.6, 0.56, 0.58), smoothstep(0.6, 0.85, fbm(uv, vec2(nx, N.y) * 3.0, 2, 13.0)) * 0.4);   // kiln scorch
    vec4 pit = vor(uv, vec2(150.0), 14.0);
    float pits = smoothstep(0.28, 0.1, pit.x) * step(0.72, pit.z);

    // the joint: lime mortar, weathered back, sandy
    float msand = fbm(uv, 180.0, 3, 16.0);
    vec3 mort = L(0.47, 0.43, 0.37) * (0.7 + 0.5 * msand);

    // what a century of coal smoke does to both
    // (nothing here varies slower than a few bricks: anything larger would show the tile repeating;
    //  the material adds the wall-sized variation in world space)
    float soot = fbm(uv, 14.0, 4, 17.0), grime = fbm(uv, 36.0, 3, 18.0);
    float film = 0.55 + 0.45 * smoothstep(0.3, 0.75, soot * 0.6 + grime * 0.4);
    col *= 1.0 - 0.42 * film; mort *= 1.0 - 0.6 * film;
    float salt = smoothstep(0.66, 0.86, fbm(uv, 16.0, 3, 19.0)) * smoothstep(0.03, 0.006, edge) * body;   // efflorescence creeping out of the joints
    col = mix(col, L(0.62, 0.6, 0.56), salt * 0.14);

    float hBrick = 0.66 + (r.x - 0.5) * 0.16 + (mott - 0.5) * 0.07 + (sand - 0.5) * 0.03 - pits * 0.1;
    hBrick *= 0.86 + 0.14 * arris;
    float hMort = 0.26 + (msand - 0.5) * 0.08 + smoothstep(0.004, 0.0, edge) * 0.02;
    float ao = 1.0 - (1.0 - body) * 0.5 - (1.0 - arris) * body * 0.12 - pits * 0.12;
    float rough = mix(0.95, 0.86 + film * 0.08, body);
    emit(mix(mort, col, body), 0.0, mix(hMort, hBrick, body), ao, rough, 0.0);
  }`,
};

const stone = {
  size: 1, tile: [3.6, 3.6], bump: 22,
  glsl: /* glsl */`
  // Ashlar: 900 x 450 mm blocks with a drafted margin and a punched face.
  void surf(vec2 uv) {
    vec2 N = vec2(4.0, 8.0);
    float row = floor(uv.y * N.y);
    vec2 q = vec2(uv.x * N.x + mod(row, 2.0) * 0.5, uv.y * N.y), id = floor(q), f = fract(q);
    vec3 r = h3(id, N, 3.0);
    vec2 dm = min(f, 1.0 - f) * vec2(0.9, 0.45);
    float wob = (fbm(uv, 60.0, 3, 4.0) - 0.5) * 0.004;
    float edge = min(dm.x, dm.y) + wob;
    float body = smoothstep(0.003, 0.006, edge);              // 6 mm joints
    float margin = smoothstep(0.045, 0.06, edge);             // inside the smooth border
    float punch = fbm(uv, 90.0, 4, 5.0), bed = fbm(uv, vec2(12.0, 48.0), 3, 6.0);
    vec4 pk = vor(uv, vec2(120.0), 7.0);
    float pock = smoothstep(0.35, 0.1, pk.x) * step(0.5, pk.z);
    vec3 col = mix(L(0.53, 0.48, 0.41), L(0.44, 0.41, 0.37), r.x) * (0.82 + 0.3 * r.y);
    col *= 0.86 + 0.28 * bed;                                  // sedimentary banding
    col *= 1.0 - 0.25 * pock * margin;
    float run = fbm(uv, vec2(48.0, 2.0), 3, 8.0);              // rain washing dirt down the face
    float film = smoothstep(0.35, 0.8, fbm(uv, 14.0, 4, 9.0) * 0.6 + run * 0.4);
    col *= 1.0 - 0.45 * film;
    float lichen = smoothstep(0.7, 0.82, fbm(uv, 18.0, 3, 10.0)) * smoothstep(0.5, 0.7, fbm(uv, 70.0, 2, 11.0));
    col = mix(col, L(0.42, 0.44, 0.3), lichen * 0.35);
    vec3 mort = L(0.3, 0.28, 0.25) * (0.7 + 0.4 * fbm(uv, 160.0, 2, 12.0));
    float h = 0.55 + margin * (0.2 + (punch - 0.5) * 0.3 - pock * 0.12) + (bed - 0.5) * 0.05 + (r.z - 0.5) * 0.08;
    float ao = 1.0 - (1.0 - body) * 0.55 - pock * margin * 0.3 - (1.0 - margin) * body * 0.08;
    emit(mix(mort, col, body), 0.0, mix(0.2, h, body), ao, mix(0.96, 0.9 - 0.1 * (1.0 - margin), body), 0.0);
  }`,
};

const iron = {
  size: 0.5, tile: [1.3, 1.3], bump: 1.6, tint: true, grain: true,
  glsl: /* glsl */`
  // Painted cast iron: the sand-cast skin showing through many coats, brush drag,
  // and the small knocks every surface collects. Rust is the material's business.
  void surf(vec2 uv) {
    float skin = fbm(uv, 90.0, 3, 3.0), orange = fbm(uv, 30.0, 3, 4.0), fine = fbm(uv, 200.0, 2, 5.0);
    float sc = max(scr(uv, 16.0, 10.0, 0.012, 0.0, TAU, 0.12), scr(uv, 44.0, 11.0, 0.03, 0.0, TAU, 0.15));
    vec4 fs = vor(uv, vec2(64.0), 7.0);
    float nick = smoothstep(0.24, 0.1, fs.x + (fine - 0.5) * 0.2) * step(fs.z, 0.02);       // through to the primer
    ta = 0.86 + 0.24 * (orange - 0.5) + 0.12 * (skin - 0.5);
    OV(L(0.33, 0.2, 0.15), nick * 0.55);
    OV(L(0.46, 0.46, 0.46), sc * 0.22);
    float h = 0.6 + (skin - 0.5) * 0.5 + (orange - 0.5) * 0.25 - nick * 0.22 - sc * 0.18;
    float rough = 0.44 + (orange - 0.5) * 0.16 + (fine - 0.5) * 0.1 + nick * 0.25;
    emit(nt, ta, h, 1.0 - nick * 0.2 - (1.0 - skin) * 0.12, rough, sc * 0.25);
  }`,
};

const brass = {
  size: 0.5, tile: [1.1, 1.1], bump: 0.5, tint: true, grain: true,
  glsl: /* glsl */`
  // Brass (and, tinted, bronze and copper): fine polishing scratches in every
  // direction, casting pits, and the faint cloudiness of handled metal.
  // Tarnish and verdigris are the material's business. uP.x: how pitted.
  void surf(vec2 uv) {
    float fine = fbm(uv, 160.0, 2, 5.0), cloud = fbm(uv, 22.0, 3, 11.0);
    float s2 = scr(uv, 30.0, 7.0, 0.014, 0.0, TAU, 0.6), s3 = scr(uv, 72.0, 8.0, 0.03, 0.0, TAU, 0.6), s4 = scr(uv, 150.0, 9.0, 0.05, 0.0, TAU, 0.5);
    float sc = max(s2 * 0.6, max(s3 * 0.5, s4 * 0.35));
    vec4 pk = vor(uv, vec2(96.0), 9.0);
    float pit = smoothstep(0.3, 0.08, pk.x) * step(0.84 - 0.2 * uP.x, pk.z);
    ta = 0.96 - 0.1 * (fine - 0.5) + sc * 0.14 - pit * 0.3 - 0.08 * (cloud - 0.5);
    float h = 0.6 + (fine - 0.5) * 0.3 - sc * 0.45 - pit * 0.4;
    float rough = 0.27 + 0.1 * (fine - 0.5) + 0.14 * (cloud - 0.5) - sc * 0.05 + pit * 0.3;
    emit(nt, ta, h, 1.0 - pit * 0.4, rough, 1.0);
  }`,
};

const steel = {
  size: 0.5, tile: [1.0, 1.0], bump: 0.6, tint: true, grain: true,
  glsl: /* glsl */`
  // Bare machined steel: tool marks, working scratches, a film of oil. Rust is the material's business.
  void surf(vec2 uv) {
    float fine = fbm(uv, 140.0, 2, 3.0), scale = fbm(uv, 26.0, 3, 4.0), smudge = fbm(uv, 18.0, 3, 5.0);
    float s2 = scr(uv, 30.0, 7.0, 0.012, 0.0, TAU, 0.6), s3 = scr(uv, 70.0, 8.0, 0.03, 0.0, TAU, 0.6), s4 = scr(uv, 140.0, 9.0, 0.05, 0.0, TAU, 0.5);
    float sc = max(s2 * 0.6, max(s3 * 0.5, s4 * 0.3));
    ta = (0.86 + 0.2 * (fine - 0.5) + sc * 0.28) * (1.0 - 0.14 * smoothstep(0.4, 0.7, scale));
    float h = 0.55 + (fine - 0.5) * 0.25 - sc * 0.4;
    float rough = 0.4 + (smudge - 0.5) * 0.26 - sc * 0.12;
    emit(nt, ta, h, 1.0, rough, 1.0);
  }`,
};

const plate = {
  size: 1, tile: [1.8, 1.8], bump: 5,
  glsl: /* glsl */`
  // Cast-iron floor plate, 1.8 m square: raised lozenge tread, a plain margin bolted
  // down at the edges. The plates really are identical; what happened to each one
  // since (dirt, polish, rust) is the material's business. The occlusion channel marks
  // the hollows between the lozenges, which is where the material packs the dirt.
  void surf(vec2 uv) {
    vec2 m = min(uv, 1.0 - uv) * 1.8;                          // metres to the plate edge
    float e = min(m.x, m.y);
    float seam = smoothstep(0.004, 0.0015, e);                 // the gap between plates
    float lip = smoothstep(0.0, 0.012, e);                     // edges dressed over
    float field = smoothstep(0.075, 0.085, e);                 // tread stops short of the edge

    // lozenges, alternating direction, 45 mm pitch
    vec2 g = uv * 40.0, gi = floor(g), gf = fract(g) - 0.5;
    float flip = mod(gi.x + gi.y, 2.0) * 2.0 - 1.0;
    vec2 d = vec2(gf.x + gf.y * flip, gf.x - gf.y * flip) * 0.7071;
    float loz = 1.0 - smoothstep(0.55, 1.0, length(d / vec2(0.42, 0.13)));
    loz *= field;
    float top = smoothstep(0.55, 0.95, loz);

    // bolts along the margin, eight a side
    vec2 bf = fract(uv * 8.0) - 0.5;
    vec2 bc = vec2(m.x < m.y ? (m.x - 0.04) / 0.225 : bf.x, m.x < m.y ? bf.y : (m.y - 0.04) / 0.225);
    float bd = length(bc) * 0.225, bolt = smoothstep(0.019, 0.016, bd) * step(e, 0.08), slot = bolt * smoothstep(0.004, 0.002, abs(bc.x + bc.y) * 0.16);

    float skin = fbm(uv, 120.0, 3, 3.0), fine = fbm(uv, 200.0, 2, 5.0);
    float hollow = (1.0 - loz) * field;
    vec3 col = L(0.25, 0.25, 0.26) * (0.8 + 0.4 * skin);
    col = mix(col, L(0.5, 0.5, 0.51), top * 0.5);                                         // boots keep the tops bright
    col = mix(col, L(0.16, 0.145, 0.13), hollow * 0.35);
    col = mix(col, L(0.035, 0.03, 0.03), seam);
    col = mix(col, L(0.42, 0.41, 0.4) * (0.7 + 0.5 * fine), bolt * 0.8); col = mix(col, L(0.05, 0.05, 0.05), slot);

    float h = 0.3 + (skin - 0.5) * 0.08 + loz * 0.5 + bolt * 0.45 - slot * 0.3;
    h = mix(h * (0.9 + 0.1 * lip), 0.16, seam);
    float rough = 0.6 + (skin - 0.5) * 0.2 - top * 0.25 + hollow * 0.15;
    emit(col, 0.0, h, 1.0 - seam * 0.7 - hollow * 0.55, mix(rough, 0.9, seam), 1.0 - hollow * 0.3 - seam);
  }`,
};

export const RECIPES = { brick, stone, iron, brass, steel, plate };
