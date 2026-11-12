/* BACKROOMS — builds the level: walls, lights, items, exit door, graffiti */
window.BR = window.BR || {};

(function (BR) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function haloTexture(rgb) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, `rgba(${rgb},0.95)`);
    g.addColorStop(0.3, `rgba(${rgb},0.35)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function textTexture(text, opts) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 512, 256);
    x.save();
    x.translate(256, 128);
    x.rotate((opts.tilt || 0));
    x.font = opts.font || 'bold 92px "Permanent Marker", Impact, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = opts.color || '#3a0c07';
    x.globalAlpha = opts.alpha == null ? 0.85 : opts.alpha;
    const lines = text.split('\n');
    lines.forEach((ln, i) => x.fillText(ln, 0, (i - (lines.length - 1) / 2) * 90, 480));
    x.restore();
    return new THREE.CanvasTexture(c);
  }

  function exitSignTexture(locked) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = locked ? '#2a0606' : '#06240f'; x.fillRect(0, 0, 256, 96);
    x.strokeStyle = locked ? '#ff4a3a' : '#5dff9a'; x.lineWidth = 4; x.strokeRect(4, 4, 248, 88);
    x.fillStyle = locked ? '#ff4a3a' : '#5dff9a';
    x.font = 'bold 60px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('EXIT', 128, 52);
    return new THREE.CanvasTexture(c);
  }

  BR.buildWorld = function (scene, seed, quality, theme) {
    const N = BR.N, TILE = BR.TILE, H = BR.WALL_H;
    theme = theme || BR.themes[0];
    const TC = (c) => new THREE.Color(c);
    const gen = BR.generate(seed, theme.under ? 0 : quality === 'low' ? 6 : 9, theme.maze);
    const grid = gen.grid, r = gen.rand;
    const w = { grid, N, TILE, H, rand: r, items: [], fixtures: [], theme, platforms: [] };

    w.solid = (i, j) => i < 0 || j < 0 || i >= N || j >= N || grid[j][i] === 1;
    w.tile = (v) => Math.floor(v / TILE);
    w.center = (i) => (i + 0.5) * TILE;
    w.start = { i: 1, j: 1 };
    w.dist = BR.distanceField(grid, 1, 1);

    /* ----- walls ----- */
    let wallTiles = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (grid[j][i] !== 1) continue;
      if (DIRS.some(([dx, dz]) => !w.solid(i + dx, j + dz))) wallTiles.push([i, j]);
    }
    // reserved 3x3 blocks get a hollow 2x2 room (bedroom or ruin) (built by rooms.js); they are not drawn as solid blocks
    const roomDefs = BR.pickRooms(w, gen.spots, r, quality);
    const roomKey = new Set();
    roomDefs.forEach((d) => d.tiles.forEach(([i, j]) => roomKey.add(i + ',' + j)));
    wallTiles = wallTiles.filter(([i, j]) => !roomKey.has(i + ',' + j));
    w.roomDefs = roomDefs;
    w.roomMap = new Map();
    w.roomAt = (i, j) => w.roomMap.get(i + ',' + j) || null;
    w.pSolid = (i, j) => w.solid(i, j) && !w.roomAt(i, j);                       // what stops the player
    w.losSolid = (i, j) => {                                                      // what blocks sight
      if (!w.solid(i, j)) return false;
      const rm = w.roomAt(i, j);
      return !(rm && rm.door.target === 1);
    };
    const wt = theme.wall === 'wall' ? BR.tex.wall() : BR.tex.surface(theme.wall, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: wt.map, normalMap: wt.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: theme.id === 3 ? 0.3 : 0.92, metalness: theme.id === 2 ? 0.2 : 0, color: theme.wallTint });
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, H, TILE), wallMat, wallTiles.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    wallTiles.forEach(([i, j], k) => {
      m4.makeTranslation(w.center(i), H / 2, w.center(j));
      walls.setMatrixAt(k, m4);
      const v = 0.82 + r() * 0.22;
      walls.setColorAt(k, col.setRGB(v, v * (0.97 + r() * 0.05), v * 0.92));
    });
    walls.instanceMatrix.needsUpdate = true;
    walls.receiveShadow = true;
    scene.add(walls);

    /* ----- floor + ceiling ----- */
    const size = N * TILE;
    const halls = [gen.course, gen.exitHall].filter(Boolean);
    const ct = theme.floor === 'carpet' ? BR.tex.carpet(size / 2.6) : BR.tex.surface(theme.floor, size / 4);
    let floorGeo;
    if (halls.length) {
      // the chasm halls: the floor has a rectangular hole per hall; UVs are in metres so the pattern keeps its scale
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(size, 0); sh.lineTo(size, -size); sh.lineTo(0, -size); sh.lineTo(0, 0);
      halls.forEach((hr) => {
        const pf = BR.pitSpec(hr, TILE), hole = new THREE.Path();
        hole.moveTo(pf.x0, -pf.z0); hole.lineTo(pf.x0, -pf.z1); hole.lineTo(pf.x1, -pf.z1); hole.lineTo(pf.x1, -pf.z0); hole.lineTo(pf.x0, -pf.z0);
        sh.holes.push(hole);
      });
      floorGeo = new THREE.ShapeGeometry(sh);
      floorGeo.rotateX(-Math.PI / 2);
      const k = theme.floor === 'carpet' ? 1 / 2.6 : 1 / 4;
      ct.map.repeat.set(k, k); ct.normal.repeat.set(k, k);
    } else floorGeo = new THREE.PlaneGeometry(size, size);
    const floor = new THREE.Mesh(
      floorGeo,
      new THREE.MeshStandardMaterial({ map: ct.map, normalMap: ct.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: theme.floorRough, metalness: theme.floorMetal, color: theme.floorTint })
    );
    floor.receiveShadow = true;
    if (halls.length) floor.position.set(0, 0, 0); else { floor.rotation.x = -Math.PI / 2; floor.position.set(size / 2, 0, size / 2); }
    scene.add(floor);
    const cl = theme.ceil === 'ceiling' ? BR.tex.ceiling(size / 1.6) : BR.tex.surface(theme.ceil, size / 4);
    // tile seams sit half a tile off the fixture grid, so every troffer is centred on a ceiling tile
    cl.map.offset.set(0.25, 0.25); cl.normal.offset.set(0.25, 0.25);
    let ceilGeo;
    if (halls.length) {                                    // the chasm halls have their own, much taller ceiling
      const sh2 = new THREE.Shape();
      sh2.moveTo(0, 0); sh2.lineTo(size, 0); sh2.lineTo(size, size); sh2.lineTo(0, size); sh2.lineTo(0, 0);
      halls.forEach((hr) => {
        const hp = BR.pitSpec(hr, TILE).hall, hole2 = new THREE.Path();
        hole2.moveTo(hp.x0, hp.z0); hole2.lineTo(hp.x0, hp.z1); hole2.lineTo(hp.x1, hp.z1); hole2.lineTo(hp.x1, hp.z0); hole2.lineTo(hp.x0, hp.z0);
        sh2.holes.push(hole2);
      });
      ceilGeo = new THREE.ShapeGeometry(sh2); ceilGeo.rotateX(Math.PI / 2);
    } else ceilGeo = new THREE.PlaneGeometry(size, size);
    const ceil = new THREE.Mesh(
      ceilGeo,
      new THREE.MeshStandardMaterial({ map: cl.map, normalMap: cl.normal, roughness: 0.95, color: theme.ceilTint })
    );
    if (halls.length) { ceil.position.set(0, H, 0); cl.map.repeat.set(1 / 1.6, 1 / 1.6); cl.normal.repeat.set(1 / 1.6, 1 / 1.6); } else { ceil.rotation.x = Math.PI / 2; ceil.position.set(size / 2, H, size / 2); }
    scene.add(ceil);

    /* ----- fluorescent fixtures ----- */
    const fx = [];
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      if (grid[j][i] === 1) continue;
      if (i % 2 !== 1 || j % 2 !== 1) continue;
      if (((i + j) / 2) % 2 !== 0) continue;
      if (halls.some((hc) => i >= hc.x0 && i < hc.x0 + hc.w && j >= hc.z0 && j < hc.z0 + hc.h)) continue;        // the tall hall has its own lamps
      const roll = r();
      fx.push({
        x: w.center(i), z: w.center(j),
        dead: roll < theme.fx.dead,
        flaky: roll >= theme.fx.dead && roll < theme.fx.dead + theme.fx.flaky,
        phase: r() * 100, level: 1
      });
    }
    // each bedroom gets its own steady ceiling light
    roomDefs.forEach((d) => {
      const ruin = d.type === 'ruin';
      [d.tiles[0], d.tiles[3]].forEach(([i, j], k) => fx.push({ x: w.center(i), z: w.center(j), dead: ruin && k === 1, flaky: ruin && k === 0, phase: r() * 100, level: 1, scale: ruin ? 0.4 : d.type === 'vault' ? 0.3 : d.start ? 0.65 : 0.5, rd: d }));
    });
    w.fixtures = fx;
    const panelGeo = new THREE.PlaneGeometry(1.5, 0.6); panelGeo.rotateX(Math.PI / 2);
    const panels = new THREE.InstancedMesh(panelGeo, new THREE.MeshBasicMaterial({ map: BR.tex.panel(), color: 0xffffff }), fx.length);
    // shallow metal tray around each diffuser, so the light sits recessed in the ceiling
    const frames = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.8, 0.1, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x3c382a, roughness: 0.6, metalness: 0.5 }), fx.length);
    // soft haze cone under each working fixture (high quality only)
    let cones = null;
    if (quality !== 'low') {
      const hh = H - 0.1, coneGeo = new THREE.CylinderGeometry(0.5, 1.7, hh, 20, 1, true), cc = [];
      const pa = coneGeo.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const tt = (pa.getY(i) + hh / 2) / hh, b = Math.pow(tt, 1.7);
        cc.push(b, b, b * 0.8);
      }
      coneGeo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false
      }), fx.length);
    }
    fx.forEach((f, k) => {
      m4.makeTranslation(f.x, H - 0.101, f.z); panels.setMatrixAt(k, m4);
      m4.makeTranslation(f.x, H - 0.05, f.z); frames.setMatrixAt(k, m4);
      panels.setColorAt(k, col.setRGB(1, 1, 0.85));
      if (cones) { m4.makeTranslation(f.x, (H - 0.1) / 2, f.z); cones.setMatrixAt(k, m4); cones.setColorAt(k, col.setRGB(1, 1, 0.85)); }
    });
    scene.add(frames); scene.add(panels);
    if (cones) scene.add(cones);

    const poolSize = quality === 'low' ? 4 : 7;
    w.pool = [];
    for (let k = 0; k < poolSize; k++) {
      const L = new THREE.PointLight(theme.light.pool, 1.0, 15, 1.6);
      L.position.set(0, H - 0.4, 0);
      if (k < (quality === 'low' ? 1 : 2)) {   // the nearest lights cast the player's shadow
        L.castShadow = true;
        L.shadow.mapSize.set(512, 512);
        L.shadow.camera.near = 0.3; L.shadow.camera.far = 16;
        L.shadow.bias = -0.003; L.shadow.radius = 4;
      }
      scene.add(L); w.pool.push(L);
    }
    scene.add(new THREE.AmbientLight(theme.ambient[0], theme.ambient[1]));

    const LM = theme.light.mul;
    /* called every frame: flicker + reassign nearest real lights */
    w.updateLights = function (t, px, pz, chaos) {
      for (let k = 0; k < fx.length; k++) {
        const f = fx[k];
        let v = 1;
        if (f.dead) v = 0;
        else if (f.flaky) {
          const s = Math.sin(t * 31 + f.phase) * Math.sin(t * 7.3 + f.phase * 1.7);
          v = s > 0.72 ? 0.4 : 0.92 + 0.08 * Math.sin(t * 90 + f.phase);
        } else {
          v = 0.94 + 0.06 * Math.sin(t * 120 + f.phase);
        }
        if (chaos > 0) {
          const burst = Math.sin(t * 53 + f.phase * 3) > 1 - chaos * 1.4;
          if (burst) v *= 0.3;
        }
        v *= f.scale || 1;
        f.level = v;
        panels.setColorAt(k, col.setRGB(v * LM[0], v * LM[1], v * LM[2]));
        if (cones) cones.setColorAt(k, col.setRGB(v * LM[0], v * LM[1], v * LM[2] * 0.97));
      }
      panels.instanceColor.needsUpdate = true;
      if (cones) cones.instanceColor.needsUpdate = true;

      // nearest fixtures that are actually emitting
      const near = [], pr = w.roomAt && w.roomAt(w.tile(px), w.tile(pz));
      for (let k = 0; k < fx.length; k++) {
        const f = fx[k];
        if (f.level < 0.03) continue;
        if (pr ? f.rd !== pr.def : f.rd) continue;     // room lights stay inside their room; corridor lights stay out of it
        const dx = f.x - px, dz = f.z - pz;
        near.push({ f, d: dx * dx + dz * dz });
      }
      near.sort((a, b) => a.d - b.d);
      for (let k = 0; k < w.pool.length; k++) {
        const L = w.pool[k];
        if (near[k]) {
          L.position.set(near[k].f.x, H - 0.45, near[k].f.z);
          L.intensity = 1.15 * theme.light.int * near[k].f.level;
        } else L.intensity = 0;
      }
    };

    /* ----- graffiti ----- */
    const scribbles = ['HELLO?', 'DON\'T RUN', 'IT HEARS\nYOU', 'LEFT.\nALWAYS LEFT', 'NO\nWAY\nOUT', 'I WAS\nHERE', 'STOP\nLISTENING', 'FOUND 2\nFUSES', 'THE HUM\nIS A VOICE', 'DAY 41', 'IT SMILES', 'DON\'T\nLOOK BACK'];
    const decalCandidates = [];
    wallTiles.forEach(([i, j]) => {
      DIRS.forEach(([dx, dz]) => { if (!w.solid(i + dx, j + dz)) decalCandidates.push([i, j, dx, dz]); });
    });
    for (let k = 0; k < 16 && decalCandidates.length; k++) {
      const idx = Math.floor(r() * decalCandidates.length);
      const [i, j, dx, dz] = decalCandidates.splice(idx, 1)[0];
      const text = scribbles[k % scribbles.length];
      const mat = new THREE.MeshStandardMaterial({
        map: textTexture(text, { tilt: (r() - 0.5) * 0.18 }),
        transparent: true, depthWrite: false, roughness: 1,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
      });
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), mat);
      const off = TILE / 2 + 0.015;
      d.position.set(w.center(i) + dx * off, 1.3 + r() * 0.7, w.center(j) + dz * off);
      d.rotation.y = Math.atan2(dx, dz);
      scene.add(d);
    }

    /* ----- choose item spots ----- */
    const open = [];
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      if (halls.some((cr) => i >= cr.x0 - 1 && i <= cr.x0 + cr.w && j >= cr.z0 - 1 && j <= cr.z0 + cr.h)) continue;      // the parkour hall keeps its own fuse
      if (grid[j][i] === 0 && w.dist[j * N + i] > 0) open.push([i, j, w.dist[j * N + i]]);
    }
    const manh = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

    // exit: farthest dead-endish tile
    let best = open[0];
    open.forEach((o) => {
      const walls4 = DIRS.filter(([dx, dz]) => w.solid(o[0] + dx, o[1] + dz)).length;
      if (walls4 >= 3 && o[2] > best[2]) best = o;
    });
    if (DIRS.filter(([dx, dz]) => w.solid(best[0] + dx, best[1] + dz)).length < 3) {
      best = open.reduce((a, b) => (b[2] > a[2] ? b : a), open[0]);
    }
    if (theme.under) {                                      // the ladder: a dead end a good walk away, not the farthest one
      const dead = open.filter((o) => DIRS.filter(([dx, dz]) => w.solid(o[0] + dx, o[1] + dz)).length >= 3 && o[2] >= 30);
      const pool = dead.length ? dead : open;
      best = pool.reduce((a, b) => (Math.abs(b[2] - 48) < Math.abs(a[2] - 48) ? b : a), pool[0]);
    }
    if (gen.exitHall && !theme.under) {                     // the elevator lives on the island in the middle of the exit hall
      const eh = gen.exitHall;
      best = [eh.x0 + (eh.w >> 1), eh.z0 + (eh.h >> 1), 0];
    }
    w.exitTile = { i: best[0], j: best[1] };

    const fuseSpots = [];
    const nNormal = theme.under ? 0 : 3 - (gen.course ? 1 : 0) - (roomDefs.some((d) => d.type === 'vault') ? 1 : 0);
    const shuffled = open.slice().sort(() => r() - 0.5);
    for (const o of shuffled) {
      if (fuseSpots.length >= nNormal) break;
      if (o[2] < 22) continue;
      if (manh(o, best) < 10) continue;
      if (fuseSpots.some((s) => manh(s, o) < 16)) continue;
      fuseSpots.push(o);
    }
    for (const o of shuffled) { // fallback if the maze was small
      if (fuseSpots.length >= nNormal) break;
      if (!fuseSpots.includes(o) && manh(o, best) > 6) fuseSpots.push(o);
    }
    const batSpots = [];
    for (const o of shuffled) {
      if (batSpots.length >= 7) break;
      if (o === best || o[2] < 6) continue;
      if (fuseSpots.some((s) => manh(s, o) < 3)) continue;
      if (batSpots.some((s) => manh(s, o) < 8)) continue;
      batSpots.push(o);
    }

    const medSpots = [];
    for (const o of shuffled) {
      if (medSpots.length >= 3) break;
      if (o === best || o[2] < 12) continue;
      if (fuseSpots.some((s) => manh(s, o) < 4) || batSpots.some((s) => manh(s, o) < 4)) continue;
      if (medSpots.some((s) => manh(s, o) < 14)) continue;
      medSpots.push(o);
    }

    const halo = {
      green: haloTexture('90,255,150'),
      amber: haloTexture('255,200,70'),
      red: haloTexture('255,80,70')
    };

    w.makeFuse = function (x, y, z) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.5, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x2a3a2d, emissive: 0x39ff88, emissiveIntensity: 1.3, roughness: 0.4 })
      );
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.08, 0.28),
        new THREE.MeshStandardMaterial({ color: 0x8a8f90, metalness: 0.8, roughness: 0.3 })
      );
      cap.position.y = 0.29;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo.green, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      sp.scale.set(2.4, 2.4, 1);
      g.add(body, cap, sp);
      g.position.set(x, y, z);
      scene.add(g);
      w.items.push({ kind: 'fuse', mesh: g, x, z, taken: false, baseY: y });
      return g;
    };
    // the last ordinary fuse is locked in a safe: a 3-digit code, one digit on each of three scattered notes
    let safeSpot = null;
    if (!theme.under && fuseSpots.length) safeSpot = fuseSpots.pop();
    fuseSpots.forEach((o) => w.makeFuse(w.center(o[0]), 1.0, w.center(o[1])));
    const safeInfo = { notes: [] };
    if (safeSpot) {
      safeInfo.code = [0, 0, 0].map(() => Math.floor(r() * 10));
      const taken2 = [].concat(fuseSpots, batSpots, medSpots, [safeSpot]);
      for (const gap of [16, 10, 6, 3]) {
        for (const o of shuffled) {
          if (safeInfo.notes.length >= 3) break;
          if (safeInfo.notes.includes(o) || o[2] < 10 || taken2.some((sp) => manh(sp, o) < 3) || safeInfo.notes.some((sp) => manh(sp, o) < gap) || manh(safeSpot, o) < Math.min(gap, 12)) continue;
          safeInfo.notes.push(o);
        }
      }
    }
    if (gen.course) {                                          // parkour hall: the fuse waits on the last block
      const f = BR.buildCourse(scene, w, gen.course, theme, r, wt);
      if (f) w.makeFuse(f.x, f.y + 1.0, f.z);
    }
    if (gen.exitHall && !theme.under) {                        // exit hall: elevator island + bridge slots, and the planks to lay them
      const br = BR.buildBridgeHall(scene, w, gen.exitHall, theme, r, wt);
      br.slots.forEach((it) => w.items.push(it));
      const taken = [].concat(fuseSpots, batSpots, medSpots), ps = [];
      for (const gap of [9, 5, 2]) {
        for (const o of shuffled) {
          if (ps.length >= br.N + 1) break;
          if (ps.includes(o) || o[2] < 8 || taken.some((sp) => manh(sp, o) < 3) || ps.some((sp) => manh(sp, o) < gap)) continue;
          ps.push(o);
        }
      }
      const boardM = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, emissive: 0x3a2610, emissiveIntensity: 0.5, roughness: 0.8 });
      ps.forEach((o) => {
        const g = new THREE.Group();
        for (let q = 0; q < 3; q++) { const bd = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.045, 0.2), boardM); bd.position.set(0, q * 0.05, (q - 1) * 0.05); bd.rotation.y = (q - 1) * 0.14; g.add(bd); }
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo.amber, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.5 }));
        sp.scale.set(1.5, 1.5, 1); g.add(sp);
        g.position.set(w.center(o[0]), 0.5, w.center(o[1]));
        scene.add(g);
        w.items.push({ kind: 'plank', mesh: g, x: g.position.x, z: g.position.z, taken: false, baseY: 0.5 });
      });
    }
    if (safeSpot) {
      const sx = w.center(safeSpot[0]), sz = w.center(safeSpot[1]);
      const fdir = DIRS.find(([dx, dz]) => !w.solid(safeSpot[0] + dx, safeSpot[1] + dz)) || [0, 1];
      const G = new THREE.Group(); G.position.set(sx, 0, sz); G.rotation.y = Math.atan2(fdir[0], fdir[1]); scene.add(G);
      const steel = new THREE.MeshStandardMaterial({ color: 0x3d4448, metalness: 0.7, roughness: 0.4, emissive: 0x0c0f10, emissiveIntensity: 0.6 });
      const steelL = new THREE.MeshStandardMaterial({ color: 0x59626a, metalness: 0.8, roughness: 0.35 });
      const inner = new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.8 });
      const bx = (x0, x1, y0, y1, z0, z1, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m); o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); G.add(o); return o; };
      const W2 = 0.48, D2 = 0.4, HT = 1.25;
      bx(-W2, W2, 0, 0.08, -D2, D2, steel); bx(-W2, W2, HT - 0.08, HT, -D2, D2, steel);                 // base + top
      bx(-W2, -W2 + 0.07, 0, HT, -D2, D2, steel); bx(W2 - 0.07, W2, 0, HT, -D2, D2, steel);              // sides
      bx(-W2, W2, 0, HT, -D2, -D2 + 0.06, inner);                                                         // back
      bx(-W2 + 0.07, W2 - 0.07, 0.62, 0.66, -D2 + 0.06, D2 - 0.02, steelL);                               // shelf
      // door on a left hinge, with a wheel handle; keypad and LED beside it
      const hinge = new THREE.Group(); hinge.position.set(-W2 + 0.02, 0, D2); G.add(hinge);
      const doorM = new THREE.Mesh(new THREE.BoxGeometry(W2 * 2 - 0.04, HT - 0.1, 0.07), steel); doorM.position.set(W2 - 0.02, HT / 2, 0.02); hinge.add(doorM);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 18), steelL); wheel.position.set(0.25, HT / 2 + 0.02, 0.07); hinge.add(wheel);
      for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.2, 0.018), steelL); sp.position.set(0.25, HT / 2 + 0.02, 0.07); sp.rotation.z = k * Math.PI / 4; hinge.add(sp); }
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.03), inner); pad.position.set(0.72, 0.72, 0.07); hinge.add(pad);
      for (let a = 0; a < 3; a++) for (let b2 = 0; b2 < 3; b2++) { const kb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.012), steelL); kb.position.set(0.655 + b2 * 0.065, 0.8 - a * 0.055, 0.092); hinge.add(kb); }
      const ledM = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.012), ledM); led.position.set(0.72, 0.94, 0.092); hinge.add(led);
      const sl = new THREE.PointLight(0xff2a1a, 0.8, 4.5, 1.6); sl.position.set(0, 1.0, 0.6); G.add(sl);
      const fz = w.makeFuse(sx, 0.9, sz); const fItem = w.items[w.items.length - 1];
      fItem.locked = true; fz.visible = false;
      w.safe = {
        x: sx, z: sz, code: safeInfo.code, open: false, fails: 0, item: fItem, ang: 0,
        openIt() {
          if (w.safe.open) return; w.safe.open = true; fItem.locked = false; fz.visible = true;
          ledM.color.set(0x39ff88); sl.color.set(0x39ff88); sl.intensity = 1.2;
        },
        update(t, dt) { const tgt = w.safe.open ? -1.95 : 0; w.safe.ang += (tgt - w.safe.ang) * Math.min(1, dt * 4); hinge.rotation.y = w.safe.ang; if (!w.safe.open) sl.intensity = 0.55 + 0.35 * Math.sin(t * 5); }
      };
      w.items.push({ kind: 'safe', static: true, mesh: new THREE.Group(), x: sx, z: sz, taken: false, baseY: 0 });
      // the notes (paper with one big digit)
      const paperTex = (digit, k) => {
        const c = document.createElement('canvas'); c.width = 128; c.height = 160; const x = c.getContext('2d');
        x.fillStyle = '#e6dcb8'; x.fillRect(0, 0, 128, 160);
        x.strokeStyle = 'rgba(80,60,30,0.25)'; x.lineWidth = 1; for (let y = 18; y < 160; y += 14) { x.beginPath(); x.moveTo(8, y); x.lineTo(120, y + (k - 1) * 1.5); x.stroke(); }
        x.fillStyle = '#8a1410'; x.font = 'bold 104px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.save(); x.translate(64, 88); x.rotate((k - 1) * 0.12); x.fillText(String(digit), 0, 0); x.restore();
        x.fillStyle = 'rgba(60,40,20,0.7)'; x.font = '14px monospace'; x.fillText('SAFE · ' + (k + 1) + '/3', 64, 20);
        return new THREE.CanvasTexture(c);
      };
      safeInfo.notes.forEach((o, k) => {
        const g = new THREE.Group();
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.375), new THREE.MeshBasicMaterial({ map: paperTex(safeInfo.code[k], k), side: THREE.DoubleSide }));
        g.add(paper);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo.amber, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.55 }));
        sp.scale.set(1.4, 1.4, 1); g.add(sp);
        g.position.set(w.center(o[0]), 0.75, w.center(o[1])); scene.add(g);
        w.items.push({ kind: 'note', digit: safeInfo.code[k], k, mesh: g, x: g.position.x, z: g.position.z, taken: false, baseY: 0.75 });
      });
    }
    batSpots.forEach((o) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.24, 14),
        new THREE.MeshStandardMaterial({ color: 0xd8a21c, emissive: 0x6a4800, emissiveIntensity: 0.9, roughness: 0.4 })
      );
      body.rotation.z = Math.PI / 2;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo.amber, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.6 }));
      sp.scale.set(1.2, 1.2, 1);
      g.add(body, sp);
      g.position.set(w.center(o[0]), 0.45, w.center(o[1]));
      scene.add(g);
      w.items.push({ kind: 'battery', mesh: g, x: g.position.x, z: g.position.z, taken: false, baseY: 0.45 });
    });
    medSpots.forEach((o) => {                                  // medkits: revive a downed teammate (or a second chance when solo)
      const g = new THREE.Group();
      const kit = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.12), new THREE.MeshStandardMaterial({ color: 0xe9e6dc, emissive: 0x3a3a34, emissiveIntensity: 0.6, roughness: 0.5 }));
      const red = new THREE.MeshStandardMaterial({ color: 0xc42a22, emissive: 0x6a0e0a, emissiveIntensity: 0.9, roughness: 0.5 });
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.02), red); c1.position.z = -0.065;
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.02), red); c2.position.z = -0.065;
      const c1b = c1.clone(), c2b = c2.clone(); c1b.position.z = 0.065; c2b.position.z = 0.065;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo.red, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.7 }));
      sp.scale.set(1.6, 1.6, 1);
      g.add(kit, c1, c2, c1b, c2b, sp);
      g.position.set(w.center(o[0]), 0.7, w.center(o[1]));
      scene.add(g);
      w.items.push({ kind: 'medkit', mesh: g, x: g.position.x, z: g.position.z, taken: false, baseY: 0.7 });
    });

    /* ----- exit door, set into a wall ----- */
    const ex = w.exitTile;
    let wallDir = DIRS.find(([dx, dz]) => w.solid(ex.i + dx, ex.j + dz) && !roomKey.has((ex.i + dx) + ',' + (ex.j + dz))) ||
      DIRS.find(([dx, dz]) => w.solid(ex.i + dx, ex.j + dz)) || [0, -1];
    let door, slab, signMat, exitLight, beam;
    let exitX = w.center(ex.i), exitZ = w.center(ex.j);
    if (theme.under) {
      /* ladder bolted to the wall, a hole in the ceiling above it and a cold shaft of light coming down */
      door = new THREE.Group();
      const rail = new THREE.MeshStandardMaterial({ color: 0x77695a, metalness: 0.7, roughness: 0.45 });
      [-0.23, 0.23].forEach((x) => { const rl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, H, 8), rail); rl.position.set(x, H / 2, 0); door.add(rl); });
      for (let y = 0.3; y < H - 0.1; y += 0.3) { const rg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 6), rail); rg.rotation.z = Math.PI / 2; rg.position.set(0, y, 0); door.add(rg); }
      [0.5, 1.7, 2.9].forEach((y) => [-0.23, 0.23].forEach((x) => { const br = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), rail); br.position.set(x, y, -0.08); door.add(br); }));
      const loff = TILE / 2 - 0.16;
      door.position.set(w.center(ex.i) + wallDir[0] * loff, 0, w.center(ex.j) + wallDir[1] * loff);
      door.rotation.y = Math.atan2(-wallDir[0], -wallDir[1]);
      scene.add(door);
      exitX = w.center(ex.i) + wallDir[0] * (TILE / 2 - 0.7); exitZ = w.center(ex.j) + wallDir[1] * (TILE / 2 - 0.7);
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      hole.rotation.x = Math.PI / 2; hole.position.set(exitX, H - 0.012, exitZ); scene.add(hole);
      const shaftG = new THREE.CylinderGeometry(0.55, 1.05, H - 0.05, 14, 1, true);
      const shaft = new THREE.Mesh(shaftG, new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      shaft.position.set(exitX, (H - 0.05) / 2, exitZ); scene.add(shaft);
      slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      signMat = new THREE.MeshBasicMaterial();
      exitLight = new THREE.PointLight(0xbfe4ff, 1.5, 11, 1.4);
      exitLight.position.set(exitX, 2.9, exitZ); scene.add(exitLight);
      beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: BR.tex.dust(), color: 0xbfe4ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.55 }));
      beam.scale.set(4.5, 4.5, 1); beam.position.set(exitX, 2.6, exitZ); scene.add(beam);
    } else {
      // the elevator itself is built after the rooms (it adds collision boxes); these stand in until then
      door = new THREE.Group();
      slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      signMat = new THREE.MeshBasicMaterial();
      exitLight = new THREE.PointLight(0x000000, 0, 1);
      beam = { material: { opacity: 0 } };
    }

    w.exit = { x: exitX, z: exitZ, open: false, signMat, light: exitLight, beam, door, ladder: !!theme.under };
    w.isUnder = !!theme.under; w.theme = theme;
    w.openExit = function () {
      w.exit.open = true;
      if (w.elev) w.elev.open();
    };

    // trim, decals, furniture, ducts (also fills w.colliders)
    BR.addDetails(scene, w, { wallTiles, quality, rand: r, theme });
    BR.buildRooms(scene, w, roomDefs, quality, r);
    if (!theme.under && BR.buildDecor) { BR.buildDecor(scene, w, gen, theme, r, quality); (w.pendingColliders || []).forEach((c) => w.colliders.push(c)); w.pendingColliders = []; }
    if (theme.under && BR.buildCavern) { BR.buildCavern(scene, w, gen, theme, r); (w.pendingColliders || []).forEach((c) => w.colliders.push(c)); }
    if (w.safe) w.colliders.push({ x: w.safe.x, z: w.safe.z, r: 0.5 });
    if (!theme.under) {
      w.elev = w.bridge ? BR.buildElevator(scene, w, ex, [1, 0], { free: true, x: w.bridge.elev.x, z: w.bridge.elev.z }) : BR.buildElevator(scene, w, ex, wallDir);
      w.exit.x = w.elev.x; w.exit.z = w.elev.z;
    }

    // item/exit animation
    w.animate = function (t) {
      w.updateRooms(t);
      const edt = Math.min(0.1, Math.max(0, t - (w._lt == null ? t : w._lt))); w._lt = t;
      if (w.elev) w.elev.update(t, edt);
      if (w.safe) w.safe.update(t, edt);
      if (w.tickers) for (let k = 0; k < w.tickers.length; k++) w.tickers[k](t, edt);
      w.items.forEach((it, k) => {
        if (it.taken || it.static) return;
        it.mesh.position.y = it.baseY + Math.sin(t * 2 + k) * 0.06;
        it.mesh.rotation.y = t * (it.kind === 'fuse' ? 1.2 : 2);
      });
      if (!w.exit.open) exitLight.intensity = 1.0 + Math.sin(t * 3) * 0.35;
      else beam.material.opacity = 0.75 + Math.sin(t * 4) * 0.15;
    };

    return w;
  };
})(window.BR);
