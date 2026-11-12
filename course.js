/* BACKROOMS — the chasm hall. A tall room with no floor: a walkway runs around the edge, and below it the shaft drops away into the dark.
   Floating blocks climb in a spiral over the abyss; the fuse waits on the highest one. Fall and you drop (and keep dropping) into the drains.
   BR.pitSpec() is shared by the floor/ceiling holes (world.js), the builder and the physics (groundAt). */
window.BR = window.BR || {};

(function (BR) {
  const MARGIN = 1.7, DEPTH = 70, ROOM_H = 12;

  BR.pitSpec = function (rect, T) {
    const X0 = rect.x0 * T, X1 = (rect.x0 + rect.w) * T, Z0 = rect.z0 * T, Z1 = (rect.z0 + rect.h) * T;
    return { x0: X0 + MARGIN, x1: X1 - MARGIN, z0: Z0 + MARGIN, z1: Z1 - MARGIN, depth: DEPTH, roomH: ROOM_H, hall: { x0: X0, x1: X1, z0: Z0, z1: Z1 } };
  };
  // over the abyss? (everything inside the walkway ring)
  BR.inPit = function (p, x, z) { return !!p && x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1; };
  BR.inHall = function (p, x, z) { return !!p && x > p.hall.x0 && x < p.hall.x1 && z > p.hall.z0 && z < p.hall.z1; };
  BR.pitOf = function (w, x, z) { const L = w && w.pits; if (L) for (let k = 0; k < L.length; k++) if (BR.inPit(L[k], x, z)) return L[k]; return null; };
  BR.hallOf = function (w, x, z) { const L = w && w.pits; if (L) for (let k = 0; k < L.length; k++) if (BR.inHall(L[k], x, z)) return L[k]; return null; };

  // axis-aligned boxes merged into one geometry; UVs follow world position, brightness fades to black with depth
  function mergeBoxes(list, uvScale) {
    const pos = [], nor = [], uv = [], col = [], idx = [];
    const shade = (y) => (y >= 0 ? 1 : Math.max(0.012, Math.exp(y / 9)));
    list.forEach(([x0, x1, y0, y1, z0, z1]) => {
      const faces = [
        [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
        [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
        [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
        [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
        [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
        [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]]
      ];
      faces.forEach(([n, vs]) => {
        const base = pos.length / 3;
        vs.forEach(([x, y, z]) => {
          pos.push(x, y, z); nor.push(n[0], n[1], n[2]);
          uv.push((n[1] ? x : n[0] ? z : x) / uvScale, (n[1] ? z : y) / uvScale);
          const s = shade(y); col.push(s, s, s);
        });
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }

  // the tall chasm room itself: shaft walls, raised walls + ceiling, lamps. extra = more wall boxes (e.g. an island pillar)
  function buildShell(scene, w, rect, theme, wallTex, extra, lampY) {
    const T = w.TILE, H = w.H, p = BR.pitSpec(rect, T), hl = p.hall, CH = p.roomH;
    (w.pits = w.pits || []).push(p); if (!w.pit) w.pit = p;
    w.platforms = w.platforms || [];
    const wt = wallTex || BR.tex.wall();
    wt.map.wrapS = wt.map.wrapT = THREE.RepeatWrapping; wt.normal.wrapS = wt.normal.wrapT = THREE.RepeatWrapping;
    const wallMat = new THREE.MeshStandardMaterial({ map: wt.map, normalMap: wt.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, vertexColors: true, color: theme.roomTint });

    // the shaft: four walls dropping from the walkway edge into the dark, plus the raised walls and ceiling of the tall room
    const th = 0.6;
    const boxes = [
      [p.x0 - th, p.x1 + th, -DEPTH, 0, p.z0 - th, p.z0], [p.x0 - th, p.x1 + th, -DEPTH, 0, p.z1, p.z1 + th],
      [p.x0 - th, p.x0, -DEPTH, 0, p.z0, p.z1], [p.x1, p.x1 + th, -DEPTH, 0, p.z0, p.z1],
      [hl.x0, hl.x1, H, CH, hl.z0, hl.z0 + 0.3], [hl.x0, hl.x1, H, CH, hl.z1 - 0.3, hl.z1],
      [hl.x0, hl.x0 + 0.3, H, CH, hl.z0, hl.z1], [hl.x1 - 0.3, hl.x1, H, CH, hl.z0, hl.z1]
    ];
    (extra || []).forEach((b) => boxes.push(b));
    const mesh = new THREE.Mesh(mergeBoxes(boxes, 3.2), wallMat);
    mesh.frustumCulled = false; scene.add(mesh);
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(p.x1 - p.x0 + 2, p.z1 - p.z0 + 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    bottom.rotation.x = -Math.PI / 2; bottom.position.set((p.x0 + p.x1) / 2, -DEPTH, (p.z0 + p.z1) / 2); scene.add(bottom);

    // tall ceiling with rows of light panels, and a few strong lamps so the platforms read in the dark
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(hl.x1 - hl.x0, hl.z1 - hl.z0), new THREE.MeshStandardMaterial({ color: 0x2b2a22, roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set((hl.x0 + hl.x1) / 2, CH, (hl.z0 + hl.z1) / 2); scene.add(ceil);
    const panelGeo = new THREE.PlaneGeometry(1.5, 0.6); panelGeo.rotateX(Math.PI / 2);
    const pos = [];
    for (let x = hl.x0 + 3; x < hl.x1 - 1.5; x += 6) for (let z = hl.z0 + 3; z < hl.z1 - 1.5; z += 6) pos.push([x, z]);
    const panels = new THREE.InstancedMesh(panelGeo, new THREE.MeshBasicMaterial({ map: BR.tex.panel(), color: 0xffffff }), pos.length);
    const m4 = new THREE.Matrix4();
    pos.forEach(([x, z], k) => { m4.makeTranslation(x, CH - 0.02, z); panels.setMatrixAt(k, m4); });
    panels.instanceMatrix.needsUpdate = true; scene.add(panels);
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    [[cx, lampY || CH - 2.5, cz, 1.7, 52], [p.x0 + 3, 4.0, p.z0 + 3, 0.9, 26], [p.x1 - 3, 4.0, p.z1 - 3, 0.9, 26]].forEach(([x, y, z, I, D]) => {
      const L = new THREE.PointLight(theme.light.pool, I, D, 1.3); L.position.set(x, y, z); scene.add(L);
    });
    return p;
  }

  BR.buildCourse = function (scene, w, rect, theme, rand, wallTex) {
    if (!rect) return null;
    const p = buildShell(scene, w, rect, theme, wallTex);
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;

    // platforms: a spiral staircase of floating blocks, starting 2 m out from the walkway and spiralling in toward the middle
    const fw = p.x1 - p.x0, fh = p.z1 - p.z0;
    const N = 12, step = 0.4, base = 0.32, dir = rand() < 0.5 ? 1 : -1;
    const stone = new THREE.MeshStandardMaterial({ color: theme.id === 3 ? 0xb8d4d4 : 0x6a655a, roughness: 0.85, metalness: 0.05 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x2c2a26, roughness: 0.6, metalness: 0.3 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x3a2a08, emissive: 0xffb020, emissiveIntensity: 1.1, roughness: 0.5 });
    const green = new THREE.MeshStandardMaterial({ color: 0x1a3a22, emissive: 0x39ff88, emissiveIntensity: 1.2, roughness: 0.5 });
    const mk = (bw, bh, bd, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat); m.position.set(x, y, z); scene.add(m); return m; };
    let ang = -Math.PI / 2, last = null;
    for (let k = 0; k < N; k++) {
      const f = 1 - 0.55 * (k / (N - 1));                                   // spiral shrinks toward the middle
      const rx = (fw / 2 - 2.0) * f, rz = (fh / 2 - 2.0) * f;
      const s = k === N - 1 ? 2.3 : 1.75 - 0.4 * (k / (N - 1));
      let x = cx + Math.cos(ang) * rx, z = cz + Math.sin(ang) * rz;
      if (k > 0) {                                                            // advance along the spiral until the edge gap to the previous block is ~1.1 m
        const sPrev = last.s;
        for (let it = 0; it < 400; it++) {
          ang += dir * 0.01;
          x = cx + Math.cos(ang) * rx; z = cz + Math.sin(ang) * rz;
          const gx = Math.max(Math.abs(x - last.x) - (sPrev + s) / 2, 0), gz = Math.max(Math.abs(z - last.z) - (sPrev + s) / 2, 0);
          if (Math.hypot(gx, gz) >= 1.1) break;
        }
      }
      const top = base + step * k, thick = 0.4;
      mk(s, thick, s, x, top - thick / 2, z, stone);
      mk(s + 0.06, 0.06, s + 0.06, x, top - 0.03, z, capMat);
      const e = 0.05, o = s / 2 - 0.04, strip = k === N - 1 ? green : glow;
      mk(s, e, e, x, top + 0.005, z - o, strip); mk(s, e, e, x, top + 0.005, z + o, strip);
      mk(e, e, s, x - o, top + 0.005, z, strip); mk(e, e, s, x + o, top + 0.005, z, strip);
      w.platforms.push({ x0: x - s / 2, x1: x + s / 2, z0: z - s / 2, z1: z + s / 2, top, bottom: top - thick });
      last = { x, z, y: top, s };
    }
    w.course = { rect, fuse: last, pit: p };
    return last;
  };

  /* The exit room: the same tall chasm, but a square island in the middle holds the elevator. The only way over is a bridge:
     N planks (found around the maze) are laid one by one from the west walkway edge. Returns the slots + where the elevator goes. */
  BR.buildBridgeHall = function (scene, w, rect, theme, rand, wallTex) {
    const T = w.TILE, p0 = BR.pitSpec(rect, T);
    const cx = (p0.x0 + p0.x1) / 2, cz = (p0.z0 + p0.z1) / 2, hw = (p0.x1 - p0.x0) / 2, hh = (p0.z1 - p0.z0) / 2;
    const s = Math.max(3.2, hw - 8), sz = Math.max(3.2, Math.min(s, hh - 3));
    const ix0 = cx - s, ix1 = cx + s, iz0 = cz - sz, iz1 = cz + sz;
    const p = buildShell(scene, w, rect, theme, wallTex, [[ix0, ix1, -DEPTH, 0, iz0, iz1]], 7.5);
    const mk = (bw, bh, bd, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat); m.position.set(x, y, z); scene.add(m); return m; };
    // island top + hazard edge
    const top = new THREE.Mesh(new THREE.PlaneGeometry(ix1 - ix0, iz1 - iz0), new THREE.MeshStandardMaterial({ color: 0x5b564a, roughness: 0.9 }));
    top.rotation.x = -Math.PI / 2; top.position.set(cx, 0.004, cz); scene.add(top);
    const haz = new THREE.MeshStandardMaterial({ color: 0x6a5410, emissive: 0xd8a810, emissiveIntensity: 0.55, roughness: 0.6 });
    const E = 0.14;
    mk(ix1 - ix0, 0.012, E, cx, 0.008, iz0 + E / 2, haz); mk(ix1 - ix0, 0.012, E, cx, 0.008, iz1 - E / 2, haz);
    mk(E, 0.012, iz1 - iz0, ix0 + E / 2, 0.008, cz, haz); mk(E, 0.012, iz1 - iz0, ix1 - E / 2, 0.008, cz, haz);
    w.platforms.push({ x0: ix0, x1: ix1, z0: iz0, z1: iz1, top: 0, bottom: -DEPTH });

    // bridge slots from the west walkway edge (x = p.x0) to the island
    const G = ix0 - p.x0, N = Math.max(3, Math.round(G / 2.0)), L = G / N, BW = 1.4;
    const wood = new THREE.MeshStandardMaterial({ color: 0x7c5a34, roughness: 0.85 });
    const woodD = new THREE.MeshStandardMaterial({ color: 0x3f2c18, roughness: 0.9 });
    const ghostM = new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.2, depthWrite: false, fog: false });
    const slots = [];
    for (let k = 0; k < N; k++) {
      const x0 = p.x0 + k * L, x1 = x0 + L, xc = (x0 + x1) / 2;
      const plank = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(L, 0.09, BW), wood); plank.add(body);
      for (let g = 1; g < 5; g++) { const gap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.094, BW + 0.01), woodD); gap.position.x = -L / 2 + g * L / 5; plank.add(gap); }
      [-BW / 2 + 0.1, BW / 2 - 0.1].forEach((zz) => { const nl = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.08), woodD); nl.position.set(0, -0.06, zz); plank.add(nl); });
      plank.position.set(xc, -0.045, cz); plank.visible = false; scene.add(plank);
      const ghost = new THREE.Mesh(new THREE.BoxGeometry(L - 0.06, 0.02, BW - 0.06), ghostM); ghost.position.set(xc, 0.012, cz); scene.add(ghost);
      slots.push({ kind: 'slot', static: true, mesh: plank, ghost, x: xc, z: cz, taken: false, k, x0, x1, z0: cz - BW / 2, z1: cz + BW / 2 });
    }
    w.bridge = { slots, N, L, island: { x0: ix0, x1: ix1, z0: iz0, z1: iz1 }, elev: { x: cx + 1.0, z: cz } };
    return w.bridge;
  };
  // lay one bridge slot (local or from a teammate): the plank appears and becomes walkable
  BR.placeSlot = function (w, it) {
    if (!it || it.placed) return;
    it.placed = true; it.taken = true; it.mesh.visible = true; if (it.ghost) it.ghost.visible = false;
    w.platforms.push({ x0: it.x0, x1: it.x1, z0: it.z0, z1: it.z1, top: 0, bottom: -0.09 });
  };
  BR.nextSlot = function (w) {
    const b = w && w.bridge; if (!b) return null;
    for (let k = 0; k < b.slots.length; k++) if (!b.slots[k].placed) return b.slots[k];
    return null;
  };

  // height of the ground under (x,z): the bottom of the shaft over the abyss, else 0, or a block top the feet can reach (ref)
  BR.groundAt = function (w, x, z, ref) {
    let g = 0;
    if (w.pits && BR.pitOf(w, x, z)) g = -BR.pitOf(w, x, z).depth;
    const ps = w.platforms;
    if (!ps) return g;
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k];
      if (p.top > g && p.top <= ref && x > p.x0 - 0.12 && x < p.x1 + 0.12 && z > p.z0 - 0.12 && z < p.z1 + 0.12) g = p.top;
    }
    return g;
  };
  // blocks too tall to step onto stop the player from walking into them (but you can pass under a floating one, or drop past its side)
  BR.hitsPlatform = function (w, x, z, r, feet) {
    const ps = w.platforms;
    if (!ps) return false;
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k];
      if (p.top <= feet + 0.22 || feet + 1.8 <= p.bottom) continue;
      const cx = Math.max(p.x0, Math.min(x, p.x1)), cz = Math.max(p.z0, Math.min(z, p.z1));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  };
})(window.BR);
