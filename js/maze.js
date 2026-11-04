/* BACKROOMS — level layout: a maze with big open halls, plus solid 3x3 blocks reserved for bedrooms and ruined hideouts */
window.BR = window.BR || {};

(function (BR) {
  const N = 41;            // tiles per side (odd)
  const TILE = 3.2;        // metres per tile
  const WALL_H = 3.4;

  // seeded rng so a run can be reproduced
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s += 0x6D2B79F5;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 1 = wall, 0 = open. spotCount = how many 3x3 solid blocks to keep free of corridors (rooms get hollowed out of them later)
  function generate(seed, spotCount, params) {
    const P = params || {};
    const r = rng(seed);
    const g = [], res = [];
    for (let z = 0; z < N; z++) { g.push(new Array(N).fill(1)); res.push(new Array(N).fill(false)); }

    // reserve 3x3 blocks centred on odd maze cells, away from the start and from each other
    const spots = [];
    if (spotCount) {                                         // the starting room: a block in the corner, right next to the spawn cell
      spots.push({ ci: 3, cj: 3, start: true });
      for (let z = 2; z <= 4; z++) for (let x = 2; x <= 4; x++) res[z][x] = true;
    }
    const cellRange = (N - 5) / 2;
    for (let tries = 0; tries < 400 && spots.length < (spotCount || 0); tries++) {
      const ci = 3 + 2 * Math.floor(r() * cellRange), cj = 3 + 2 * Math.floor(r() * cellRange);
      if (Math.abs(ci - 1) + Math.abs(cj - 1) < 12) continue;
      if (spots.some((s) => Math.abs(s.ci - ci) + Math.abs(s.cj - cj) < 8)) continue;
      spots.push({ ci, cj });
      for (let z = cj - 1; z <= cj + 1; z++) for (let x = ci - 1; x <= ci + 1; x++) res[z][x] = true;
    }

    // recursive backtracker on odd cells (reserved cells are never visited)
    const stack = [[1, 1]];
    g[1][1] = 0;
    const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
    while (stack.length) {
      const [cx, cz] = stack[stack.length - 1];
      const opts = [];
      for (const [dx, dz] of dirs) {
        const nx = cx + dx, nz = cz + dz;
        if (nx > 0 && nz > 0 && nx < N - 1 && nz < N - 1 && g[nz][nx] === 1 && !res[nz][nx]) opts.push([dx, dz]);
      }
      if (!opts.length) { stack.pop(); continue; }
      const [dx, dz] = opts[Math.floor(r() * opts.length)];
      g[cz + dz / 2][cx + dx / 2] = 0;
      g[cz + dz][cx + dx] = 0;
      stack.push([cx + dx, cz + dz]);
    }

    // knock out walls to create loops (fewer dead ends, less of a pure maze)
    for (let z = 2; z < N - 2; z++) {
      for (let x = 2; x < N - 2; x++) {
        if (g[z][x] === 1 && !res[z][x] && r() < (P.loop == null ? 0.12 : P.loop)) {
          const horiz = g[z][x - 1] === 0 && g[z][x + 1] === 0;
          const vert = g[z - 1][x] === 0 && g[z + 1][x] === 0;
          if (horiz || vert) g[z][x] = 0;
        }
      }
    }

    // big open halls, some forested with pillars, some wide open
    const touchesReserved = (x0, z0, w, h) => {
      for (let z = z0 - 1; z <= z0 + h; z++) for (let x = x0 - 1; x <= x0 + w; x++) {
        if (z >= 0 && x >= 0 && z < N && x < N && res[z][x]) return true;
      }
      return false;
    };
    const rooms = [];
    const hallSizes = P.sizes || [7, 9, 11, 13], hallMax = P.halls || 8;
    for (let i = 0, made = 0; i < 40 && made < hallMax; i++) {
      const w = hallSizes[Math.floor(r() * hallSizes.length)], h = hallSizes[Math.floor(r() * hallSizes.length)];
      const x0 = 2 + Math.floor(r() * (N - w - 3)), z0 = 2 + Math.floor(r() * (N - h - 3));
      if (touchesReserved(x0, z0, w, h)) continue;
      for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) g[z][x] = 0;
      const pillarOdds = made % 3 === 2 ? 0 : (P.pillars == null ? 0.6 : P.pillars);                 // every third hall has no pillars at all
      for (let z = z0 + 1; z < z0 + h - 1; z += 2) {
        for (let x = x0 + 1; x < x0 + w - 1; x += 2) if (r() < pillarOdds) g[z][x] = 1;
      }
      rooms.push({ x0, z0, w, h });
      made++;
    }

    // parkour course: one big hall, far from the start, cleared of pillars (course.js fills it with platforms)
    let course = null;
    const far = P.noCourse ? [] : rooms.filter((h) => h.w >= 9 && h.h >= 9 && (h.x0 + h.w / 2) + (h.z0 + h.h / 2) >= 30);
    const far2 = P.noCourse ? [] : far.length ? far : rooms.filter((h) => h.w >= 7 && h.h >= 7 && (h.x0 + h.w / 2) + (h.z0 + h.h / 2) >= 24);
    if (far2.length) {
      const h = far2[Math.floor(r() * far2.length)];
      for (let z = h.z0; z < h.z0 + h.h; z++) for (let x = h.x0; x < h.x0 + h.w; x++) g[z][x] = 0;
      course = { x0: h.x0, z0: h.z0, w: h.w, h: h.h };
    } else if (!P.noCourse) {
      for (let tries = 0; tries < 120 && !course; tries++) {
        const sz = tries < 80 ? 9 : 7;
        const x0 = 2 + Math.floor(r() * (N - sz - 3)), z0 = 2 + Math.floor(r() * (N - sz - 3));
        if (x0 + z0 < 22 || touchesReserved(x0, z0, sz, sz)) continue;
        for (let z = z0; z < z0 + sz; z++) for (let x = x0; x < x0 + sz; x++) g[z][x] = 0;
        course = { x0, z0, w: sz, h: sz };
      }
    }

    // border always solid; reserved blocks stay solid
    for (let i = 0; i < N; i++) { g[0][i] = 1; g[N - 1][i] = 1; g[i][0] = 1; g[i][N - 1] = 1; }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (res[z][x]) g[z][x] = 1;
    g[1][1] = 0; g[1][2] = 0; g[2][1] = 0;
    return { grid: g, rooms, spots, rand: r, course };
  }

  // BFS distance field from a tile. returns Int32Array(N*N), -1 for unreachable
  function distanceField(grid, sx, sz) {
    const d = new Int32Array(N * N).fill(-1);
    const q = [[sx, sz]];
    d[sz * N + sx] = 0;
    let head = 0;
    while (head < q.length) {
      const [x, z] = q[head++];
      const base = d[z * N + x];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of nb) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        if (grid[nz][nx] === 1) continue;
        if (d[nz * N + nx] !== -1) continue;
        d[nz * N + nx] = base + 1;
        q.push([nx, nz]);
      }
    }
    return d;
  }

  BR.N = N; BR.TILE = TILE; BR.WALL_H = WALL_H;
  BR.rng = rng;
  BR.generate = generate;
  BR.distanceField = distanceField;
})(window.BR);
