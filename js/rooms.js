/* BACKROOMS — safe rooms. Each one is a 2x2-tile hollow cut out of a solid 3x3 block reserved by maze.js.
     bedroom: hinged door, bed, nightstand, wardrobe, desk with a pushable chair, sideboard with drawers
     ruin:    collapsed wall, rubble, a mattress and crates, a toolbox to search
   The entity can neither enter these rooms nor sense the player inside (see game.js).
   Local room frame: +z points out through the entrance, x is to the right when facing it. */
window.BR = window.BR || {};

(function (BR) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // spots = solid 3x3 blocks centred on odd cells; the entrance faces a neighbouring open maze cell
  BR.pickRooms = function (w, spots, rand, quality) {
    const N = w.N, nBed = quality === 'low' ? 4 : 6, defs = [];
    spots.forEach((s) => {
      const dirs = DIRS.filter(([dx, dz]) => {
        const oi = s.ci + 2 * dx, oj = s.cj + 2 * dz;
        return oi >= 1 && oj >= 1 && oi <= N - 2 && oj <= N - 2 && !w.solid(oi, oj);
      });
      if (!dirs.length) return;
      const pref = s.start ? dirs.filter(([a, b]) => a < 0 || b < 0) : dirs;      // the start room faces back toward the corner
      const pool = pref.length ? pref : dirs;
      const [dx, dz] = pool[Math.floor(rand() * pool.length)];
      const perp = dx !== 0 ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      const [sx, sz] = perp[Math.floor(rand() * 2)];
      defs.push({
        type: s.start || defs.length < nBed ? 'bedroom' : 'ruin', start: !!s.start,
        ci: s.ci, cj: s.cj, dx, dz, sx, sz,
        tiles: [[s.ci, s.cj], [s.ci + dx, s.cj + dz], [s.ci + sx, s.cj + sz], [s.ci + dx + sx, s.cj + dz + sz]],
        oi: s.ci + 2 * dx, oj: s.cj + 2 * dz
      });
    });
    return defs;
  };

  BR.buildRooms = function (scene, w, defs, quality, rand) {
    const T = w.TILE, H = w.H, TH = 0.2, IN = T - TH;
    w.rooms = []; w.boxes = []; w.interact = [];

    const wt = BR.tex.wall();
    const wallMat = new THREE.MeshStandardMaterial({ map: wt.map, normalMap: wt.normal, normalScale: new THREE.Vector2(0.8, 0.8), color: 0xdcd0b4, roughness: 0.92 });
    const ruinMat = new THREE.MeshStandardMaterial({ map: wt.map, normalMap: wt.normal, normalScale: new THREE.Vector2(1, 1), color: 0x8f8a78, roughness: 0.98 });
    const doorMat = new THREE.MeshStandardMaterial({ map: BR.doorTex(), roughness: 0.8 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 0.8, roughness: 0.6 });
    const mats = {};
    const M = (c, rough, metal) => {
      const key = c + '|' + rough + '|' + metal;
      return mats[key] || (mats[key] = new THREE.MeshStandardMaterial({ color: c, roughness: rough == null ? 0.8 : rough, metalness: metal || 0 }));
    };
    const box = (g, bw, bh, bd, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
      m.position.set(x, y, z); g.add(m); return m;
    };
    const rr = (a, b) => a + Math.random() * (b - a);
    const rollLoot = () => { const r = Math.random(); return r < 0.28 ? 'battery' : r < 0.46 ? 'water' : r < 0.56 ? 'drink' : null; };
    const rollGood = () => { const r = Math.random(); return r < 0.5 ? 'battery' : r < 0.8 ? 'water' : 'drink'; };

    const wood = M(0x5f4e2c, 0.75), woodD = M(0x4a3c22, 0.75), tray = M(0x2b2314, 0.9), metal = M(0x2a2a24, 0.4, 0.6);
    const trim = M(0x2b2412, 0.55), plaster = M(0x8c8672, 0.95), plasterD = M(0x6f6a5a, 0.95), crate = M(0x8d6b3a, 0.9);
    const chairSpots = [];

    defs.forEach((d) => {
      const ruin = d.type === 'ruin';
      const cx = w.center(d.ci) + (d.dx + d.sx) * T / 2, cz = w.center(d.cj) + (d.dz + d.sz) * T / 2;
      const th = Math.atan2(d.dx, d.dz), cs = Math.cos(th), sn = Math.sin(th);
      const toW = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
      // the entrance lines up with the open maze cell in front of the block, which is off-centre in the 2x2 hollow
      const vx = (d.dx - d.sx) / 2 * T, vz = (d.dz - d.sz) / 2 * T;
      const gx = vx * cs - vz * sn;
      const aabb = (lx, lz, bw, bd, door) => {
        const a = toW(lx - bw / 2, lz - bd / 2), b = toW(lx + bw / 2, lz + bd / 2);
        const bx = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]), door: door || null };
        w.boxes.push(bx); return bx;
      };
      const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = th; scene.add(g);
      const room = { def: d, type: d.type, cx, cz, cs, sn, door: null, containers: [] };
      const shell = ruin ? ruinMat : wallMat;
      const pz = T - TH / 2;                                       // z of the entrance wall's centre line

      /* shell: back and side walls sit fully inside the hollow so they never poke into corridors */
      box(g, 2 * T, H, TH, 0, H / 2, -pz, shell);
      box(g, TH, H, 2 * T - 2 * TH, -pz, H / 2, 0, shell);
      box(g, TH, H, 2 * T - 2 * TH, pz, H / 2, 0, shell);
      aabb(0, -pz, 2 * T, TH); aabb(-pz, 0, TH, 2 * T - 2 * TH); aabb(pz, 0, TH, 2 * T - 2 * TH);
      box(g, 2 * T - 2 * TH, 0.14, 0.03, 0, 0.07, -(IN - 0.015), trim);
      box(g, 0.03, 0.14, 2 * IN, -(IN - 0.015), 0.07, 0, trim);
      box(g, 0.03, 0.14, 2 * IN, IN - 0.015, 0.07, 0, trim);

      if (!ruin) {
        /* ---------- entrance wall with a hinged door ---------- */
        const gw = 0.55, wl = gx - gw + T, wr = T - gx - gw;
        box(g, wl, H, TH, (-T + gx - gw) / 2, H / 2, pz, wallMat);
        box(g, wr, H, TH, (gx + gw + T) / 2, H / 2, pz, wallMat);
        box(g, 2 * gw, H - 2.2, TH, gx, 2.2 + (H - 2.2) / 2, pz, wallMat);
        box(g, 0.07, 2.2, TH + 0.04, gx - gw - 0.035, 1.1, pz, trim);
        box(g, 0.07, 2.2, TH + 0.04, gx + gw + 0.035, 1.1, pz, trim);
        box(g, 2 * gw + 0.14, 0.07, TH + 0.04, gx, 2.235, pz, trim);
        aabb((-T + gx - gw) / 2, pz, wl, TH); aabb((gx + gw + T) / 2, pz, wr, TH);
        const pivot = new THREE.Group(); pivot.position.set(gx + 0.55, 0, pz); g.add(pivot);
        box(pivot, 1.06, 2.15, 0.05, -0.54, 1.075, 0, doorMat);
        const knobMat = M(0xb9b27a, 0.35, 0.7);
        [-0.045, 0.045].forEach((zz) => {
          const k = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), knobMat);
          k.position.set(-0.98, 1.0, zz); pivot.add(k);
        });
        const door = { pivot, t: 0, target: 0, box: null };
        door.box = aabb(gx, pz, 2 * gw + 0.02, 0.14, door);
        room.door = door;
        if (d.start) { door.t = door.target = 1; pivot.rotation.y = -1.75; }     // the start room begins with its door open
        const dw = toW(gx, pz);
        w.interact.push({ kind: 'door', room, x: dw[0], z: dw[1], reach: 2.4 });
      } else {
        /* ---------- collapsed entrance: jagged stumps either side of a wide gap, rubble on the floor ---------- */
        room.door = { pivot: null, t: 1, target: 1, box: null, ruin: true };
        const gw = 1.1;
        const seg = (from, to, dirToGap) => {                           // wall run with stepped, broken end next to the gap
          const L = to - from; if (L < 0.05) return;
          const stepL = Math.min(1.2, L), fullL = L - stepL;
          const gapEnd = dirToGap > 0 ? to : from;
          if (fullL > 0.02) {
            const fx0 = dirToGap > 0 ? from : to - fullL;
            box(g, fullL, H, TH, fx0 + fullL / 2, H / 2, pz, ruinMat); aabb(fx0 + fullL / 2, pz, fullL, TH);
          }
          for (let k = 0; k < 3; k++) {
            const wd = stepL / 3, hl = Math.max(0.5, H * (0.8 - k * 0.27) + rr(-0.12, 0.12));
            const xk = dirToGap > 0 ? gapEnd - stepL + wd * (k + 0.5) : gapEnd + stepL - wd * (k + 0.5);
            box(g, wd, hl, TH, xk, hl / 2, pz, k ? plaster : ruinMat); aabb(xk, pz, wd, TH);
          }
        };
        seg(-T, gx - gw, 1); seg(gx + gw, T, -1);
        box(g, 1.3, 0.9, TH, gx + 0.4, H - 0.45, pz, plaster);           // slabs hanging from the ceiling
        box(g, 0.7, 0.5, TH, gx - 0.8, H - 0.25, pz, plasterD);
        for (let k = 0; k < 16; k++) {                                   // rubble, kept off the middle of the opening
          const s = rr(0.1, 0.42), side = Math.random() < 0.5 ? -1 : 1;
          const off = gw + 0.1 + Math.random() * 1.2, front = Math.random() < 0.5 ? 1 : -1;
          let rx = gx + side * off; rx = Math.max(-T + 0.3, Math.min(T - 0.3, rx));
          const m = box(g, s, s * rr(0.4, 0.9), s * rr(0.6, 1.1), rx, s * 0.3, pz + front * rr(0.25, 1.0), Math.random() < 0.5 ? plaster : plasterD);
          m.rotation.set(rr(-0.4, 0.4), rr(0, 6.28), rr(-0.4, 0.4));
        }
        for (let k = 0; k < 4; k++) {                                    // bent rebar
          const rb = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, rr(0.5, 1.0), 6), M(0x4a3426, 0.7, 0.5));
          rb.position.set(Math.max(-T + 0.2, Math.min(T - 0.2, gx + (Math.random() < 0.5 ? -1 : 1) * (gw + 0.05 + Math.random() * 0.4))), rr(0.4, 0.9), pz);
          rb.rotation.set(rr(-0.6, 0.6), 0, rr(-0.5, 0.5)); g.add(rb);
        }
      }

      /* ---------- containers ---------- */
      const addContainer = (kind, lx, lz, reach, apply, loot) => {
        const p = toW(lx, lz);
        const c = { kind, room, x: p[0], z: p[1], reach, searched: false, opened: false, t: 0, loot: loot === undefined ? rollLoot() : loot, apply };
        room.containers.push(c); w.interact.push(c); return c;
      };
      const drawer = (parent, fx, fy, fz, fw, axis, sign) => {   // axis 'z' faces +z, axis 'x' faces -x
        const dg = new THREE.Group(); dg.position.set(fx, fy, fz); parent.add(dg);
        const base = dg.position.clone();
        if (axis === 'z') {
          box(dg, fw, 0.2, 0.03, 0, 0, 0, woodD);
          box(dg, 0.1, 0.025, 0.03, 0, 0, 0.025, metal);
          box(dg, fw - 0.04, 0.02, 0.36, 0, -0.07, -0.2, tray);
          box(dg, 0.02, 0.1, 0.36, -(fw - 0.04) / 2, -0.03, -0.2, tray);
          box(dg, 0.02, 0.1, 0.36, (fw - 0.04) / 2, -0.03, -0.2, tray);
          box(dg, fw - 0.04, 0.1, 0.02, 0, -0.03, -0.37, tray);
        } else {
          box(dg, 0.03, 0.34, fw, 0, 0, 0, woodD);
          box(dg, 0.03, 0.03, 0.12, -0.025, 0, 0, metal);
          box(dg, 0.36, 0.02, fw - 0.04, 0.2, -0.13, 0, tray);
          box(dg, 0.36, 0.1, 0.02, 0.2, -0.09, -(fw - 0.04) / 2, tray);
          box(dg, 0.36, 0.1, 0.02, 0.2, -0.09, (fw - 0.04) / 2, tray);
          box(dg, 0.02, 0.1, fw - 0.04, 0.38, -0.09, 0, tray);
        }
        return (e) => { dg.position[axis] = base[axis] + sign * 0.3 * e; };
      };
      const glowSprite = (x, y, z, s) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: BR.tex.dust(), color: 0xffd27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7, fog: false }));
        sp.scale.set(s, s, 1); sp.position.set(x, y, z); g.add(sp);
      };

      if (!ruin) {
        /* ---------- bedroom ---------- */
        const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), M(0x5e3a2e, 1));
        rug.rotation.x = -Math.PI / 2; rug.position.set(0.2, 0.006, 0.1); g.add(rug);

        // bed, head against the back wall
        box(g, 1.1, 0.36, 2.05, -2.2, 0.18, -1.95, wood);
        box(g, 1.1, 0.8, 0.08, -2.2, 0.62, -2.96, woodD);
        box(g, 1.0, 0.2, 1.95, -2.2, 0.46, -1.93, M(0xcfc7a2, 0.95));
        box(g, 1.02, 0.06, 1.2, -2.2, 0.58, -1.45, M(0x67724f, 0.95));
        const pillow = box(g, 0.7, 0.12, 0.38, -2.2, 0.62, -2.72, M(0xe4ddb8, 0.95));
        const pBase = pillow.position.clone();
        aabb(-2.2, -1.95, 1.1, 2.05);
        addContainer('bed', -2.2, -1.45, 2.2, (e) => { pillow.position.y = pBase.y + 0.25 * e; pillow.rotation.z = 0.5 * e; });

        // nightstand + lamp
        box(g, 0.5, 0.55, 0.45, -1.2, 0.275, -2.75, wood);
        box(g, 0.56, 0.04, 0.5, -1.2, 0.57, -2.75, woodD);
        const nsApply = drawer(g, -1.2, 0.38, -2.525, 0.42, 'z', 1);
        aabb(-1.2, -2.75, 0.5, 0.45);
        addContainer('drawer', -1.2, -2.525, 1.8, nsApply);
        const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 10), M(0x3a2e18, 0.7));
        lampBase.position.set(-1.2, 0.69, -2.8); g.add(lampBase);
        const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.17, 14), lampMat);
        shade.position.set(-1.2, 0.87, -2.8); g.add(shade);
        glowSprite(-1.2, 0.9, -2.76, 1.3);

        // wardrobe: hollow shell, hanging clothes, a door that swings open
        const wx = 1.6, wz = -2.7;
        box(g, 1.4, 2.1, 0.04, wx, 1.05, wz - 0.28, woodD);
        box(g, 0.04, 2.1, 0.6, wx - 0.68, 1.05, wz, wood);
        box(g, 0.04, 2.1, 0.6, wx + 0.68, 1.05, wz, wood);
        box(g, 1.4, 0.04, 0.6, wx, 2.08, wz, wood);
        box(g, 1.4, 0.04, 0.6, wx, 0.1, wz, wood);
        box(g, 1.32, 0.03, 0.56, wx, 1.6, wz, woodD);
        [-0.45, -0.2, 0.05, 0.3, 0.5].forEach((ox, k) => box(g, 0.05, 1.1, 0.3, wx + ox, 1.0, wz, M(k % 2 ? 0x3a3a30 : 0x4a3a2a, 0.95)));
        const wPivot = new THREE.Group(); wPivot.position.set(wx - 0.68, 1.05, wz + 0.32); g.add(wPivot);
        box(wPivot, 1.36, 2.0, 0.04, 0.68, 0, 0.02, wood);
        box(wPivot, 0.04, 0.2, 0.04, 1.25, 0, 0.06, metal);
        aabb(wx, wz, 1.4, 0.6);
        addContainer('wardrobe', wx, wz + 0.8, 2.1, (e) => { wPivot.rotation.y = -1.9 * e; });

        // sideboard along the right wall with three drawers, a framed photo and a vase
        box(g, 0.5, 0.95, 1.5, 2.75, 0.475, -0.4, wood);
        box(g, 0.56, 0.04, 1.56, 2.72, 0.97, -0.4, woodD);
        aabb(2.75, -0.4, 0.5, 1.5);
        [-0.9, -0.4, 0.1].forEach((zz) => addContainer('drawer', 2.5, zz, 1.8, drawer(g, 2.5, 0.5, zz, 0.44, 'x', -1)));
        box(g, 0.04, 0.3, 0.22, 2.85, 1.14, -0.85, M(0x2b2010, 0.7));
        box(g, 0.05, 0.22, 0.16, 2.84, 1.14, -0.85, M(0xb4ab80, 0.8));
        const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.26, 10), M(0x6c7a6a, 0.5));
        vase.position.set(2.8, 1.12, -0.05); g.add(vase);

        // desk on the left wall; its chair can be shoved around
        box(g, 0.7, 0.05, 1.3, -2.65, 0.74, 0.9, M(0x6e5a34, 0.75));
        box(g, 0.66, 0.7, 0.04, -2.65, 0.37, 0.27, woodD);
        box(g, 0.66, 0.7, 0.04, -2.65, 0.37, 1.53, woodD);
        box(g, 0.06, 0.38, 0.5, -2.9, 1.02, 0.9, M(0x1b1b18, 0.5));
        box(g, 0.08, 0.2, 0.08, -2.9, 0.87, 0.9, M(0x222222, 0.5));
        box(g, 0.14, 0.02, 0.42, -2.5, 0.77, 0.9, M(0x2b2b28, 0.6));
        aabb(-2.65, 0.9, 0.7, 1.3);
        const cp = toW(-1.75, 0.95);
        chairSpots.push({ x: cp[0], z: cp[1], ry: Math.atan2(-1, 0) + th });
        if (d.start) {                                       // a folded map lies on the desk of the starting room
          const mp = toW(-2.6, 0.6);
          const mg = new THREE.Group();
          const paper = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.012, 0.27), new THREE.MeshStandardMaterial({ color: 0xe6dcb4, emissive: 0x6a5c30, emissiveIntensity: 0.55, roughness: 0.9 }));
          const ink = new THREE.MeshBasicMaterial({ color: 0x5a4a2a });
          [[-0.08, 0.05, 0.2, 0.01], [0.06, -0.03, 0.01, 0.16], [0.0, 0.08, 0.18, 0.01]].forEach(([x, z, bw, bd]) => { const l = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.004, bd), ink); l.position.set(x, 0.008, z); mg.add(l); });
          const mark = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.005, 0.012), new THREE.MeshBasicMaterial({ color: 0xc42a22 })); mark.position.set(0.1, 0.01, -0.07); mark.rotation.y = 0.8;
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: BR.tex.dust(), color: 0xffd27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55, fog: false }));
          glow.scale.set(0.9, 0.9, 1); glow.position.y = 0.05;
          mg.add(paper, mark, glow); mg.rotation.y = th + 0.5;
          mg.position.set(mp[0], 0.83, mp[1]);
          scene.add(mg);
          w.items.push({ kind: 'map', mesh: mg, x: mp[0], z: mp[1], taken: false, baseY: 0.83 });
        }
      } else {
        /* ---------- hideout ---------- */
        const mat = box(g, 1.0, 0.12, 1.9, -1.9, 0.06, -1.9, M(0x8a8468, 0.98)); mat.rotation.y = 0.25;
        const pil = box(g, 0.5, 0.1, 0.3, -2.1, 0.17, -2.7, M(0xb8b090, 0.95)); pil.rotation.y = 0.25;
        const bl = box(g, 0.95, 0.07, 0.9, -1.8, 0.15, -1.6, M(0x57614a, 0.98)); bl.rotation.y = 0.3;
        box(g, 0.7, 0.55, 0.7, 1.9, 0.275, -2.5, crate);
        const c2 = box(g, 0.6, 0.45, 0.6, 1.85, 0.775, -2.45, crate); c2.rotation.y = 0.3;
        const c3 = box(g, 0.65, 0.5, 0.65, 1.0, 0.25, -2.65, crate); c3.rotation.y = -0.2;
        aabb(1.9, -2.5, 0.85, 0.85); aabb(1.0, -2.65, 0.75, 0.75);
        const shelf = box(g, 1.6, 0.06, 0.4, -1.0, 0.25, 1.9, woodD); shelf.rotation.z = 0.35;
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 10), lampMat);
        lamp.position.set(0.9, 0.13, 1.4); g.add(lamp);
        glowSprite(0.9, 0.35, 1.4, 1.8);
        // toolbox with a lid that flips open
        box(g, 0.55, 0.22, 0.3, 0, 0.11, -2.8, M(0x7a2a22, 0.6, 0.3));
        const lidP = new THREE.Group(); lidP.position.set(0, 0.22, -2.95); g.add(lidP);
        box(lidP, 0.55, 0.05, 0.3, 0, 0.025, 0.15, M(0x8a3228, 0.6, 0.3));
        addContainer('toolbox', 0, -2.35, 1.9, (e) => { lidP.rotation.x = -1.3 * e; }, rollGood());
      }

      if (d.start) {                                       // spawn point: middle of the rug, facing the doorway
        const sp = toW(0.5, 0.1);
        w.spawn = { x: sp[0], z: sp[1], yaw: Math.atan2(-d.dx, -d.dz) };
      }
      if (!room.containers.some((c) => c.loot)) room.containers[0].loot = 'battery';
      w.rooms.push(room);
      d.tiles.forEach(([i, j]) => w.roomMap.set(i + ',' + j, room));
    });

    /* chairs from the shared prop catalogue, registered as pushable */
    if (chairSpots.length && BR.propGeo) {
      const chairs = new THREE.InstancedMesh(BR.propGeo('chair'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.12 }), chairSpots.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
      chairSpots.forEach((c, k) => {
        m4.compose(v3.set(c.x, 0, c.z), q.setFromEuler(eu.set(0, c.ry, 0)), s3.set(1, 1, 1)); chairs.setMatrixAt(k, m4);
        w.movers.push({ mesh: chairs, k, x: c.x, z: c.z, ry: c.ry, s: 1, r: 0.36 });
      });
      chairs.receiveShadow = true;
      scene.add(chairs);
    }

    /* ----- per-frame animation ----- */
    let lastT = 0;
    w.updateRooms = function (t) {
      const dt = Math.min(0.05, Math.max(0, t - lastT)); lastT = t;
      w.rooms.forEach((rm) => {
        const dr = rm.door;
        if (dr.pivot && dr.t !== dr.target) {
          const s = dt * 3.0;
          dr.t = dr.t < dr.target ? Math.min(dr.target, dr.t + s) : Math.max(dr.target, dr.t - s);
          dr.pivot.rotation.y = -1.75 * (dr.t * dr.t * (3 - 2 * dr.t));
        }
        rm.containers.forEach((c) => {
          if (c.opened && c.t < 1) { c.t = Math.min(1, c.t + dt * 3.2); c.apply(1 - Math.pow(1 - c.t, 3)); }
        });
      });
    };

    /* ----- interaction ----- */
    const inside = (rm, px, pz) => {
      const lx = (px - rm.cx) * rm.cs - (pz - rm.cz) * rm.sn, lz = (px - rm.cx) * rm.sn + (pz - rm.cz) * rm.cs;
      return Math.abs(lx) < T + 0.05 && lz > -T - 0.05 && lz < IN;
    };
    // best thing the player could use right now: close enough and roughly in front of them
    w.interactAt = function (px, pz, vx, vz) {
      let best = null, bs = Infinity;
      for (const it of w.interact) {
        if (it.kind !== 'door' && (it.searched || !inside(it.room, px, pz))) continue;
        const dx = it.x - px, dz = it.z - pz, dd = Math.hypot(dx, dz);
        if (dd > it.reach) continue;
        const dot = dd > 1e-3 ? (dx * vx + dz * vz) / dd : 1;
        if (dd > 0.9 && dot < 0.55) continue;
        const s = dd * (2.2 - dot);
        if (s < bs) { bs = s; best = it; }
      }
      return best;
    };
    const LABEL = { bed: 'SEARCH BED', wardrobe: 'SEARCH WARDROBE', toolbox: 'OPEN TOOLBOX', drawer: 'SEARCH DRAWER' };
    w.promptFor = (it) => (it.kind === 'door' ? (it.room.door.target === 1 ? 'CLOSE DOOR' : 'OPEN DOOR') : (LABEL[it.kind] || 'SEARCH'));
    w.use = function (it, px, pz) {
      if (it.kind === 'door') {
        const dr = it.room.door;
        if (dr.target === 1) {
          if (Math.hypot(px - it.x, pz - it.z) < 1.1) return { msg: 'SOMETHING IS IN THE WAY.' };
          dr.target = 0;
        } else dr.target = 1;
        return { sound: 'door', noise: 0.9 };
      }
      if (it.searched) return null;
      it.searched = true; it.opened = true;
      return { sound: it.kind === 'bed' ? 'rustle' : 'drawer', loot: it.loot, noise: 0.5 };
    };
  };
})(window.BR);
