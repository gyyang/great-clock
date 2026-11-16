// Surface recipes. Each is a GLSL `surf(uv)` over one tile plus how that tile maps
// to the world: `tile` is metres per repeat (u, v) and `bump` is the full height
// range in millimetres. Colours are authored in sRGB through L().
//
// Tinted recipes (tint: true) build colour as  nt + tint * ta  so that the paint
// or the metal takes the material's colour while rust, dust and soot keep theirs.

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

    // the brick itself
    float pick = r.x;
    vec3 col = pick < 0.44 ? L(0.36, 0.2, 0.16) : pick < 0.72 ? L(0.3, 0.185, 0.155) : pick < 0.88 ? L(0.41, 0.26, 0.19) : L(0.2, 0.165, 0.17);
    float blue = step(0.88, pick);                             // over-fired, half vitrified
    col *= 0.78 + 0.5 * r.y;
    float mott = fbm(uv, 64.0, 4, 11.0), sand = fbm(uv, 220.0, 2, 12.0);
    col *= 0.8 + 0.4 * mott;
    col = mix(col, col * vec3(0.55, 0.5, 0.52), smoothstep(0.55, 0.8, fbm(uv + r.xy, vec2(nx, N.y) * 1.5, 2, 13.0)) * 0.6);   // kiln scorch
    vec4 pit = vor(uv, vec2(150.0), 14.0);
    float pits = smoothstep(0.28, 0.1, pit.x) * step(0.72, pit.z);
    float spall = step(r2.x, 0.035) * smoothstep(0.35, 0.6, fbm(uv, 40.0, 3, 15.0) + (0.5 - length(f - 0.5)) * 0.4);
    col = mix(col, L(0.56, 0.31, 0.2) * (0.7 + 0.6 * sand), spall * 0.8);

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

    float hBrick = 0.66 + (r.y - 0.5) * 0.16 + (mott - 0.5) * 0.07 + (sand - 0.5) * 0.03 - pits * 0.1 - spall * (0.2 + 0.1 * msand);
    hBrick *= 0.86 + 0.14 * arris;
    float hMort = 0.26 + (msand - 0.5) * 0.08 + smoothstep(0.004, 0.0, edge) * 0.02;
    float ao = 1.0 - (1.0 - body) * 0.5 - (1.0 - arris) * body * 0.15 - pits * 0.3 - spall * 0.15;
    float rough = mix(0.95, mix(0.86, 0.58, blue) + film * 0.08 + spall * 0.1, body);
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
  size: 0.5, tile: [1.3, 1.3], bump: 1.6, tint: true,
  glsl: /* glsl */`
  // Painted cast iron. Sand-cast skin under many coats; the paint has chipped where
  // things knock against it, rusted from the chips outward, and gathered dust.
  void surf(vec2 uv) {
    float skin = fbm(uv, 90.0, 3, 3.0), orange = fbm(uv, 30.0, 3, 4.0);
    float zone = smoothstep(0.52, 0.8, fbm(uv, 5.0, 4, 5.0));                 // damage comes in clusters
    vec4 fl = vor(uv, vec2(22.0, 22.0), 6.0), fs = vor(uv, vec2(70.0), 7.0);
    float er = (fbm(uv, 120.0, 2, 8.0) - 0.5) * 0.35;
    float chip = smoothstep(0.34, 0.22, fl.x + er) * step(fl.z, 0.02 + 0.22 * zone) + smoothstep(0.3, 0.16, fs.x + er) * step(fs.z, 0.015 + 0.1 * zone);
    chip = sat(chip + smoothstep(0.9 - 0.08 * zone, 0.95, fbm(uv, 5.0, 6, 9.0)));
    float sc = max(scr(uv, 6.0, 10.0, 0.012, 0.0, TAU, 0.6), scr(uv, 18.0, 11.0, 0.03, 0.0, TAU, 0.4)) * (0.4 + 0.6 * zone);
    chip = max(chip, sc * 0.75);
    float rust = sat(chip * 1.4) * smoothstep(0.25, 0.7, fbm(uv, 16.0, 4, 12.0) + zone * 0.3);
    float bright = sc * step(0.8, sc) * (1.0 - rust);                         // freshly scraped to metal
    float stain = 0.0;                                                        // rust weeping down from each chip
    for (int i = 1; i <= 4; i++) {
      vec2 up = uv + vec2(0.0, float(i) * 0.02);
      stain += smoothstep(0.34, 0.2, vor(up, vec2(22.0), 6.0).x) * step(vor(up, vec2(22.0), 6.0).z, 0.02 + 0.22 * zone) * (1.0 - float(i) / 5.0);
    }
    stain = sat(stain * 0.5) * fbm(uv, vec2(130.0, 2.0), 2, 13.0) * (1.0 - chip);
    float dust = smoothstep(0.35, 0.85, fbm(uv, 9.0, 4, 14.0) * 0.7 + skin * 0.3);

    ta = 0.82 + 0.3 * (orange - 0.5) + 0.12 * (skin - 0.5);                   // the paint
    OV(L(0.27, 0.25, 0.23), dust * 0.16);
    OV(L(0.24, 0.14, 0.08), stain * 0.45);
    OV(mix(L(0.15, 0.09, 0.065), L(0.3, 0.17, 0.1), fbm(uv, 60.0, 3, 15.0)), rust);
    OV(L(0.62, 0.6, 0.58), bright);
    float h = 0.6 + (skin - 0.5) * 0.5 + (orange - 0.5) * 0.25 - chip * 0.3 + rust * 0.12 * fbm(uv, 80.0, 2, 16.0);
    float rough = 0.44 + dust * 0.3 + (orange - 0.5) * 0.16;
    rough = mix(rough, 0.92, rust); rough = mix(rough, 0.32, bright);
    emit(nt, ta, h, 1.0 - chip * 0.2 - (1.0 - skin) * 0.12, rough, bright * 0.95 + rust * 0.1);
  }`,
};

const brass = {
  size: 0.5, tile: [1.1, 1.1], bump: 0.5, tint: true,
  glsl: /* glsl */`
  // Brass (and, tinted, bronze and copper): polished where it is handled or turns,
  // tarnished brown elsewhere, with verdigris starting in the pits. uP.x: how neglected.
  void surf(vec2 uv) {
    float neglect = uP.x;
    float t1 = fbm(uv, 8.0, 4, 3.0), t2 = fbm(uv, 24.0, 3, 4.0), fine = fbm(uv, 160.0, 2, 5.0);
    float tarnish = smoothstep(0.42 - 0.25 * neglect, 0.8 - 0.2 * neglect, t1 * 0.62 + t2 * 0.38);
    float s1 = scr(uv, 8.0, 6.0, 0.006, 0.0, TAU, 0.8), s2 = scr(uv, 26.0, 7.0, 0.014, 0.0, TAU, 0.7), s3 = scr(uv, 64.0, 8.0, 0.03, 0.0, TAU, 0.6);
    float sc = max(s1, max(s2 * 0.7, s3 * 0.45));
    vec4 pk = vor(uv, vec2(90.0), 9.0);
    float pit = smoothstep(0.3, 0.08, pk.x) * step(0.8, pk.z);
    float verd = sat(smoothstep(0.62 - 0.2 * neglect, 0.85, fbm(uv, 11.0, 4, 10.0)) * tarnish * (0.3 + neglect) + pit * tarnish * 0.6);
    float smudge = fbm(uv, 9.0, 3, 11.0);

    ta = 1.0 - 0.1 * fine + sc * 0.18 * (1.0 - tarnish * 0.5);
    ta *= 1.0 - 0.25 * tarnish;
    OV(L(0.31, 0.2, 0.1), tarnish * 0.32);                                     // brown oxide
    OV(mix(L(0.27, 0.47, 0.4), L(0.5, 0.66, 0.58), fbm(uv, 70.0, 2, 12.0)), verd * 0.85);
    float h = 0.6 + (fine - 0.5) * 0.3 - sc * 0.45 - pit * 0.4 + verd * 0.25;
    float rough = 0.26 + 0.1 * (fine - 0.5) + 0.12 * (smudge - 0.5) + tarnish * 0.3 - sc * 0.06;
    emit(nt, ta, h, 1.0 - pit * 0.4 - verd * 0.1, mix(rough, 0.9, verd), 1.0 - verd * 0.85);
  }`,
};

const steel = {
  size: 0.5, tile: [1.0, 1.0], bump: 0.6, tint: true,
  glsl: /* glsl */`
  // Bare machined steel: mill scale, working scratches, and rust where oil has not reached.
  void surf(vec2 uv) {
    float fine = fbm(uv, 140.0, 2, 3.0), scale = fbm(uv, 12.0, 4, 4.0), smudge = fbm(uv, 8.0, 4, 5.0);
    float s1 = scr(uv, 9.0, 6.0, 0.006, 0.0, TAU, 0.8), s2 = scr(uv, 30.0, 7.0, 0.012, 0.0, TAU, 0.7), s3 = scr(uv, 70.0, 8.0, 0.03, 0.0, TAU, 0.6);
    float sc = max(s1, max(s2 * 0.7, s3 * 0.4));
    float rust = rustMask(uv, 9.0, 0.74 - uP.x * 0.2, 9.0);
    float bloom = smoothstep(0.5, 0.74 - uP.x * 0.2, fbm(uv, 9.0, 5, 9.0)) * (1.0 - rust);
    ta = (0.84 + 0.2 * (fine - 0.5) + sc * 0.3) * (1.0 - 0.18 * smoothstep(0.4, 0.7, scale));
    OV(L(0.34, 0.2, 0.1), bloom * 0.3);
    OV(mix(L(0.17, 0.1, 0.07), L(0.32, 0.18, 0.1), fbm(uv, 50.0, 3, 10.0)), rust);
    float h = 0.55 + (fine - 0.5) * 0.25 - sc * 0.4 + rust * (0.2 + 0.2 * fbm(uv, 70.0, 2, 11.0));
    float rough = 0.4 + (smudge - 0.5) * 0.3 - sc * 0.14 + bloom * 0.15;
    emit(nt, ta, h, 1.0 - rust * 0.15, mix(rough, 0.92, rust), 1.0 - rust * 0.85);
  }`,
};


const plate = {
  size: 1, tile: [1.8, 1.8], bump: 5,
  glsl: /* glsl */`
  // Cast-iron floor plate, 1.8 m square: raised lozenge tread, a plain margin bolted
  // down at the edges, worn bright along the tops and packed with dirt between.
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
    vec2 b = uv * 8.0, bf = fract(b) - 0.5; float along = max(abs(bf.x), abs(bf.y));
    vec2 bc = vec2(m.x < m.y ? (m.x - 0.04) / 0.225 : bf.x, m.x < m.y ? bf.y : (m.y - 0.04) / 0.225);
    float bd = length(bc) * 0.225, bolt = smoothstep(0.019, 0.016, bd) * step(e, 0.08), slot = bolt * smoothstep(0.004, 0.002, abs(bc.x + bc.y) * 0.16);

    float skin = fbm(uv, 120.0, 3, 3.0), wear = fbm(uv, 9.0, 4, 4.0), fine = fbm(uv, 200.0, 2, 5.0);
    float sc = max(scr(uv, 7.0, 6.0, 0.008, 0.0, TAU, 0.9), scr(uv, 22.0, 7.0, 0.02, 0.0, TAU, 0.8));
    float rust = rustMask(uv, 9.0, 0.84, 8.0) * (1.0 - top * 0.8);
    float dirt = (1.0 - loz) * field * smoothstep(0.3, 0.7, wear * 0.6 + skin * 0.4);     // packed between the lozenges
    float polish = top * (0.45 + 0.55 * smoothstep(0.35, 0.65, wear)) + sc * 0.5;                        // boots keep the tops bright

    vec3 col = L(0.25, 0.25, 0.26) * (0.8 + 0.4 * skin);
    col = mix(col, L(0.5, 0.5, 0.51), sat(polish) * 0.7);
    col = mix(col, mix(L(0.16, 0.1, 0.07), L(0.3, 0.17, 0.1), fbm(uv, 60.0, 2, 9.0)), rust * 0.7);
    col = mix(col, L(0.15, 0.135, 0.12), dirt * 0.6);
    col = mix(col, L(0.035, 0.03, 0.03), seam);
    col = mix(col, L(0.42, 0.41, 0.4) * (0.7 + 0.5 * fine), bolt * 0.8); col = mix(col, L(0.05, 0.05, 0.05), slot);

    float h = 0.3 + (skin - 0.5) * 0.08 + loz * 0.5 + bolt * 0.45 - slot * 0.3 - sc * 0.05 + dirt * 0.1;
    h = mix(h * (0.9 + 0.1 * lip), 0.16, seam);
    float rough = 0.6 + (skin - 0.5) * 0.2 - sat(polish) * 0.38 + rust * 0.3 + dirt * 0.35;
    float metal = 1.0 - rust * 0.85 - dirt * 0.9 - seam;
    emit(col, 0.0, h, 1.0 - seam * 0.7 - dirt * 0.3 - (1.0 - loz) * field * 0.12, mix(rough, 0.9, seam), metal);
  }`,
};

export const RECIPES = { brick, stone, iron, brass, steel, plate };
