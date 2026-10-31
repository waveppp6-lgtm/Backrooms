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

  BR.buildWorld = function (scene, seed, quality) {
    const N = BR.N, TILE = BR.TILE, H = BR.WALL_H;
    const gen = BR.generate(seed, quality === 'low' ? 6 : 9);
    const grid = gen.grid, r = gen.rand;
    const w = { grid, N, TILE, H, rand: r, items: [], fixtures: [] };

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
    const wt = BR.tex.wall();
    const wallMat = new THREE.MeshStandardMaterial({ map: wt.map, normalMap: wt.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, metalness: 0 });
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
    const ct = BR.tex.carpet(size / 2.6);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: ct.map, normalMap: ct.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1 })
    );
    floor.receiveShadow = true;
    floor.rotation.x = -Math.PI / 2; floor.position.set(size / 2, 0, size / 2);
    scene.add(floor);
    const cl = BR.tex.ceiling(size / 1.6);
    // tile seams sit half a tile off the fixture grid, so every troffer is centred on a ceiling tile
    cl.map.offset.set(0.25, 0.25); cl.normal.offset.set(0.25, 0.25);
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: cl.map, normalMap: cl.normal, roughness: 0.95 })
    );
    ceil.rotation.x = Math.PI / 2; ceil.position.set(size / 2, H, size / 2);
    scene.add(ceil);

    /* ----- fluorescent fixtures ----- */
    const fx = [];
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      if (grid[j][i] === 1) continue;
      if (i % 2 !== 1 || j % 2 !== 1) continue;
      if (((i + j) / 2) % 2 !== 0) continue;
      const roll = r();
      fx.push({
        x: w.center(i), z: w.center(j),
        dead: roll < 0.12,
        flaky: roll >= 0.12 && roll < 0.38,
        phase: r() * 100, level: 1
      });
    }
    // each bedroom gets its own steady ceiling light
    roomDefs.forEach((d) => {
      const ruin = d.type === 'ruin';
      [d.tiles[0], d.tiles[3]].forEach(([i, j], k) => fx.push({ x: w.center(i), z: w.center(j), dead: ruin && k === 1, flaky: ruin && k === 0, phase: r() * 100, level: 1, scale: ruin ? 0.4 : d.start ? 0.65 : 0.5, rd: d }));
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
      const L = new THREE.PointLight(0xfff0b4, 1.0, 15, 1.6);
      L.position.set(0, H - 0.4, 0);
      if (k < (quality === 'low' ? 1 : 2)) {   // the nearest lights cast the player's shadow
        L.castShadow = true;
        L.shadow.mapSize.set(512, 512);
        L.shadow.camera.near = 0.3; L.shadow.camera.far = 16;
        L.shadow.bias = -0.003; L.shadow.radius = 4;
      }
      scene.add(L); w.pool.push(L);
    }
    scene.add(new THREE.AmbientLight(0x4a4222, 0.4));

    /* called every frame: flicker + reassign nearest real lights */
    w.updateLights = function (t, px, pz, chaos) {
      for (let k = 0; k < fx.length; k++) {
        const f = fx[k];
        let v = 1;
        if (f.dead) v = 0;
        else if (f.flaky) {
          const s = Math.sin(t * 31 + f.phase) * Math.sin(t * 7.3 + f.phase * 1.7);
          v = s > 0.55 ? 0.12 : 0.9 + 0.1 * Math.sin(t * 90 + f.phase);
        } else {
          v = 0.94 + 0.06 * Math.sin(t * 120 + f.phase);
        }
        if (chaos > 0) {
          const burst = Math.sin(t * 53 + f.phase * 3) > 1 - chaos * 1.4;
          if (burst) v *= 0.05;
        }
        v *= f.scale || 1;
        f.level = v;
        panels.setColorAt(k, col.setRGB(v, v, v * 0.82));
        if (cones) cones.setColorAt(k, col.setRGB(v, v, v * 0.8));
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
          L.intensity = 1.15 * near[k].f.level;
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
    w.exitTile = { i: best[0], j: best[1] };

    const fuseSpots = [];
    const shuffled = open.slice().sort(() => r() - 0.5);
    for (const o of shuffled) {
      if (fuseSpots.length >= 3) break;
      if (o[2] < 22) continue;
      if (manh(o, best) < 10) continue;
      if (fuseSpots.some((s) => manh(s, o) < 16)) continue;
      fuseSpots.push(o);
    }
    for (const o of shuffled) { // fallback if the maze was small
      if (fuseSpots.length >= 3) break;
      if (!fuseSpots.includes(o) && manh(o, best) > 6) fuseSpots.push(o);
    }
    const batSpots = [];
    for (const o of shuffled) {
      if (batSpots.length >= 7) break;
      if (o[2] < 6) continue;
      if (fuseSpots.some((s) => manh(s, o) < 3)) continue;
      if (batSpots.some((s) => manh(s, o) < 8)) continue;
      batSpots.push(o);
    }

    const medSpots = [];
    for (const o of shuffled) {
      if (medSpots.length >= 3) break;
      if (o[2] < 12) continue;
      if (fuseSpots.some((s) => manh(s, o) < 4) || batSpots.some((s) => manh(s, o) < 4)) continue;
      if (medSpots.some((s) => manh(s, o) < 14)) continue;
      medSpots.push(o);
    }

    const halo = {
      green: haloTexture('90,255,150'),
      amber: haloTexture('255,200,70'),
      red: haloTexture('255,80,70')
    };

    fuseSpots.forEach((o) => {
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
      g.position.set(w.center(o[0]), 1.0, w.center(o[1]));
      scene.add(g);
      w.items.push({ kind: 'fuse', mesh: g, x: g.position.x, z: g.position.z, taken: false, baseY: 1.0 });
    });
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
    const door = new THREE.Group();
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 2.7, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x1b2a20, metalness: 0.6, roughness: 0.55 })
    );
    slab.position.y = 1.35;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 2.95, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x0c0f0d, roughness: 0.8 })
    );
    frame.position.set(0, 1.47, -0.05);
    w.signLocked = exitSignTexture(true);
    w.signOpen = exitSignTexture(false);
    const signMat = new THREE.MeshBasicMaterial({ map: w.signLocked });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), signMat);
    sign.position.set(0, 3.05, 0.09);
    door.add(frame, slab, sign);
    const off = TILE / 2 - 0.09;
    door.position.set(w.center(ex.i) + wallDir[0] * off, 0, w.center(ex.j) + wallDir[1] * off);
    door.rotation.y = Math.atan2(-wallDir[0], -wallDir[1]);
    scene.add(door);
    const exitLight = new THREE.PointLight(0xff3a2a, 1.4, 11, 1.4);
    exitLight.position.set(w.center(ex.i), 2.4, w.center(ex.j));
    scene.add(exitLight);
    const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo.green, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }));
    beam.scale.set(7, 7, 1); beam.position.set(w.center(ex.i), 1.6, w.center(ex.j));
    scene.add(beam);

    w.exit = { x: w.center(ex.i), z: w.center(ex.j), open: false, signMat, light: exitLight, beam, door };
    w.openExit = function () {
      w.exit.open = true;
      signMat.map = w.signOpen; signMat.needsUpdate = true;
      exitLight.color.set(0x4dff8d); exitLight.intensity = 2.2;
      beam.material.opacity = 0.9;
      slab.material.emissive = new THREE.Color(0x0d5a2a);
    };

    // trim, decals, furniture, ducts (also fills w.colliders)
    BR.addDetails(scene, w, { wallTiles, quality, rand: r });
    BR.buildRooms(scene, w, roomDefs, quality, r);

    // item/exit animation
    w.animate = function (t) {
      w.updateRooms(t);
      w.items.forEach((it, k) => {
        if (it.taken) return;
        it.mesh.position.y = it.baseY + Math.sin(t * 2 + k) * 0.06;
        it.mesh.rotation.y = t * (it.kind === 'fuse' ? 1.2 : 2);
      });
      if (!w.exit.open) exitLight.intensity = 1.0 + Math.sin(t * 3) * 0.35;
      else beam.material.opacity = 0.75 + Math.sin(t * 4) * 0.15;
    };

    return w;
  };
})(window.BR);
