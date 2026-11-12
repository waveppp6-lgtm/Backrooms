/* BACKROOMS — per-level set dressing for the big halls, so each map looks and feels like its own place.
   LEVEL 0 waiting rooms (rows of chairs, plants, vending machines) · LEVEL 1 car park (parked cars, bay lines, drums)
   LEVEL 2 boiler rooms with venting steam · LEVEL 3 pools (water, caustics, lane ropes, floating rings).
   BR.buildDecor(scene, w, gen, theme, r, quality) pushes colliders into w.pendingColliders and animators into w.tickers. */
window.BR = window.BR || {};

(function (BR) {
  const M4 = () => new THREE.Matrix4();

  // a handful of InstancedMesh "parts" that share one placement: add(part, localMatrix) under a parent transform
  function instSet(scene, defs, capacity) {
    const parts = defs.map((d) => {
      const m = new THREE.InstancedMesh(d.geo, d.mat, capacity); m.count = 0; m.frustumCulled = false; scene.add(m);
      return { mesh: m, def: d };
    });
    const tmp = M4(), c = new THREE.Color();
    return {
      parts,
      place(parent, color) {
        parts.forEach((p) => {
          if (p.mesh.count >= capacity) return;
          tmp.multiplyMatrices(parent, p.def.local);
          const i = p.mesh.count++;
          p.mesh.setMatrixAt(i, tmp);
          if (p.def.tinted && color != null) { c.setHex(color); p.mesh.setColorAt(i, c); } else if (p.def.tinted) { c.setHex(0xffffff); p.mesh.setColorAt(i, c); }
        });
      },
      done() { parts.forEach((p) => { p.mesh.instanceMatrix.needsUpdate = true; if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true; }); }
    };
  }
  const box = (x, y, z, w, h, d) => ({ geo: new THREE.BoxGeometry(w, h, d), local: M4().makeTranslation(x, y, z) });
  const cyl = (x, y, z, rt, rb, h, rotZ, seg) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg || 12); const l = M4().makeTranslation(x, y, z); if (rotZ) l.multiply(M4().makeRotationZ(rotZ)); return { geo: g, local: l }; };
  const wheelRot = (x, y, z, r, w) => { const g = new THREE.CylinderGeometry(r, r, w, 14); g.rotateZ(Math.PI / 2); return { geo: g, local: M4().makeTranslation(x, y, z) }; };
  const withMat = (d, mat, tinted) => Object.assign(d, { mat, tinted: !!tinted });
  const placeM = (x, y, z, ry) => { const m = M4().makeRotationY(ry || 0); m.setPosition(x, y, z); return m; };

  BR.buildDecor = function (scene, w, gen, theme, r, quality) {
    const T = w.TILE, H = w.H, low = quality === 'low';
    w.tickers = w.tickers || []; w.water = w.water || [];
    const pending = w.pendingColliders = w.pendingColliders || [];
    const halls = gen.rooms.filter((h) => h.w >= 7 && h.h >= 7 && !(gen.course && h.x0 === gen.course.x0 && h.z0 === gen.course.z0) && !(gen.exitHall && h.x0 === gen.exitHall.x0 && h.z0 === gen.exitHall.z0));
    const free = (i, j) => gen.grid[j] && gen.grid[j][i] === 0;
    const cx = (i) => w.center(i), cz = (j) => w.center(j);
    const pick = (a) => a[Math.floor(r() * a.length)];
    // never park a car on top of a pickup, the spawn or the elevator: keep a clear radius around those
    const keep = w.items.filter((it) => typeof it.x === 'number').map((it) => [it.x, it.z]);
    if (w.spawn) keep.push([w.spawn.x, w.spawn.z]);
    if (w.exit) keep.push([w.exit.x, w.exit.z]);
    const clear = (x, z, rad) => !keep.some(([kx, kz]) => Math.hypot(kx - x, kz - z) < rad);
    if (!halls.length) return;

    /* ================= LEVEL 1: car park ================= */
    if (theme.id === 1) {
      const body = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.35 });
      const glass = new THREE.MeshStandardMaterial({ color: 0x0d1416, metalness: 0.9, roughness: 0.08 });
      const rubber = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 });
      const lampM = new THREE.MeshBasicMaterial({ color: 0x3a3226 });
      const cars = instSet(scene, [
        withMat(box(0, 0.55, 0, 1.8, 0.62, 4.3), body, true),                    // lower body
        withMat(box(0, 1.05, -0.2, 1.62, 0.52, 2.2), body, true),                // cabin
        withMat(box(0, 1.07, -0.2, 1.66, 0.4, 2.0), glass),                       // windows
        withMat(wheelRot(-0.88, 0.3, 1.35, 0.3, 0.22), rubber), withMat(wheelRot(0.88, 0.3, 1.35, 0.3, 0.22), rubber),
        withMat(wheelRot(-0.88, 0.3, -1.35, 0.3, 0.22), rubber), withMat(wheelRot(0.88, 0.3, -1.35, 0.3, 0.22), rubber),
        withMat(box(-0.6, 0.62, 2.16, 0.4, 0.14, 0.04), lampM), withMat(box(0.6, 0.62, 2.16, 0.4, 0.14, 0.04), lampM)
      ], 60);
      const lineM = new THREE.MeshStandardMaterial({ color: 0xcdbb52, roughness: 0.9, emissive: 0x2a2408, emissiveIntensity: 0.5 });
      const lines = instSet(scene, [withMat(box(0, 0.006, 0, 0.1, 0.012, 3.0), lineM)], 400);
      const drumM = new THREE.MeshStandardMaterial({ color: 0xc4521c, metalness: 0.4, roughness: 0.6 });
      const drums = instSet(scene, [withMat(cyl(0, 0.45, 0, 0.3, 0.3, 0.9, 0, 12), drumM)], 40);
      const palette = [0x6e7479, 0x3b4a5c, 0x7c2d2a, 0x2c3b2f, 0xb7b9b3, 0x1d2126, 0x8a7a4a, 0x4b3a52];
      halls.forEach((h) => {
        [h.z0 + 1, h.z0 + h.h - 2].forEach((j) => {
          for (let i = h.x0 + 1; i < h.x0 + h.w - 1; i += 2) {
            if (!free(i, j) || !free(i, j - 1) || !free(i, j + 1) || !free(i + 1, j)) continue;
            lines.place(placeM(cx(i) - 1.3, 0, cz(j), 0)); lines.place(placeM(cx(i) + 1.3, 0, cz(j), 0));
            if (r() < 0.62) {
              const ry = (j === h.z0 + 1 ? 0 : Math.PI) + (r() - 0.5) * 0.08, x = cx(i) + (r() - 0.5) * 0.25, z = cz(j) + (r() - 0.5) * 0.3;
              if (!clear(x, z, 3.2)) continue;
              cars.place(placeM(x, 0, z, ry), pick(palette));
              [-1.2, 0, 1.2].forEach((o) => pending.push({ x: x + Math.sin(ry) * o, z: z + Math.cos(ry) * o, r: 0.95 }));
            }
          }
        });
        for (let k = 0; k < 3; k++) {
          const i = h.x0 + 1 + Math.floor(r() * (h.w - 2)), j = h.z0 + 1 + Math.floor(r() * (h.h - 2));
          if (!free(i, j)) continue;
          const x = cx(i) + (r() - 0.5) * 2, z = cz(j) + (r() - 0.5) * 2;
          if (!clear(x, z, 1.6)) continue;
          drums.place(placeM(x, 0, z, 0)); pending.push({ x, z, r: 0.34 });
        }
      });
      cars.done(); lines.done(); drums.done();
    }

    /* ================= LEVEL 0: waiting rooms ================= */
    if (theme.id === 0) {
      const seatM = new THREE.MeshStandardMaterial({ color: 0x6d5a36, roughness: 0.8 });
      const frameM = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 });
      const chairs = instSet(scene, [
        withMat(box(0, 0.46, 0, 0.5, 0.07, 0.5), seatM), withMat(box(0, 0.78, -0.22, 0.5, 0.5, 0.06), seatM),
        withMat(box(-0.21, 0.22, 0.18, 0.04, 0.44, 0.04), frameM), withMat(box(0.21, 0.22, 0.18, 0.04, 0.44, 0.04), frameM),
        withMat(box(-0.21, 0.22, -0.18, 0.04, 0.44, 0.04), frameM), withMat(box(0.21, 0.22, -0.18, 0.04, 0.44, 0.04), frameM)
      ], 120);
      const potM = new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.85 });
      const leafM = new THREE.MeshStandardMaterial({ color: 0x35582a, roughness: 0.9 });
      const plants = instSet(scene, [withMat(cyl(0, 0.25, 0, 0.26, 0.2, 0.5, 0, 12), potM),
        withMat({ geo: new THREE.SphereGeometry(0.42, 10, 8), local: M4().makeTranslation(0, 0.95, 0) }, leafM),
        withMat({ geo: new THREE.SphereGeometry(0.3, 8, 6), local: M4().makeTranslation(0.18, 1.3, 0.08) }, leafM)], 40);
      const vendM = new THREE.MeshStandardMaterial({ color: 0x8c1c1c, metalness: 0.4, roughness: 0.5 });
      const vendFace = new THREE.MeshStandardMaterial({ color: 0x1a2a30, emissive: 0x9fd8ff, emissiveIntensity: 0.9, roughness: 0.3 });
      const vend = instSet(scene, [withMat(box(0, 0.95, 0, 0.95, 1.9, 0.8), vendM), withMat(box(0, 1.15, 0.405, 0.7, 1.1, 0.02), vendFace)], 20);
      const tableM = new THREE.MeshStandardMaterial({ color: 0x3a2f20, roughness: 0.6 });
      const tables = instSet(scene, [withMat(box(0, 0.38, 0, 1.1, 0.05, 0.6), tableM), withMat(box(-0.45, 0.19, 0, 0.05, 0.38, 0.5), tableM), withMat(box(0.45, 0.19, 0, 0.05, 0.38, 0.5), tableM)], 30);
      halls.forEach((h) => {
        const mid = Math.floor(h.z0 + h.h / 2);
        for (const rowZ of [mid - 1, mid + 1]) {
          const face = rowZ < mid ? 0 : Math.PI;                              // two rows facing a low table in the middle
          for (let i = h.x0 + 2; i < h.x0 + h.w - 2; i++) {
            if (!free(i, rowZ)) continue;
            for (let s = -1; s <= 1; s += 2) chairs.place(placeM(cx(i) + s * 0.55, 0, cz(rowZ) + (rowZ < mid ? -0.6 : 0.6), face));
          }
        }
        for (let i = h.x0 + 3; i < h.x0 + h.w - 3; i += 2) if (free(i, mid)) tables.place(placeM(cx(i), 0, cz(mid), 0));
        [[h.x0, h.z0], [h.x0 + h.w - 1, h.z0], [h.x0, h.z0 + h.h - 1], [h.x0 + h.w - 1, h.z0 + h.h - 1]].forEach(([i, j], k) => {
          if (!free(i, j)) return;
          const x = cx(i) + (i === h.x0 ? -0.9 : 0.9), z = cz(j) + (j === h.z0 ? -0.9 : 0.9);
          if (!clear(x, z, 2.0)) return;
          if (k % 2 === 0) { plants.place(placeM(x, 0, z, 0)); pending.push({ x, z, r: 0.35 }); }
          else { vend.place(placeM(x, 0, z, Math.atan2(h.x0 + h.w / 2 - i, h.z0 + h.h / 2 - j))); pending.push({ x, z, r: 0.6 }); }
        });
      });
      chairs.done(); plants.done(); vend.done(); tables.done();
    }

    /* ================= LEVEL 2: boiler rooms + steam ================= */
    if (theme.id === 2) {
      const tankM = new THREE.MeshStandardMaterial({ color: 0x6a4630, metalness: 0.65, roughness: 0.5 });
      const bandM = new THREE.MeshStandardMaterial({ color: 0x2a1c14, metalness: 0.5, roughness: 0.7 });
      const gaugeM = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc860, emissiveIntensity: 0.9 });
      const tankG = (() => { const g = new THREE.CylinderGeometry(1.0, 1.0, 3.4, 20); g.rotateZ(Math.PI / 2); return g; })();
      const vents = [];
      halls.forEach((h) => {
        const ci = Math.floor(h.x0 + h.w / 2), cj = Math.floor(h.z0 + h.h / 2);
        if (free(ci, cj) && free(ci - 1, cj) && free(ci + 1, cj) && clear(cx(ci), cz(cj), 3.6)) {
          const g = new THREE.Group(); g.position.set(cx(ci), 1.35, cz(cj)); scene.add(g);
          const t = new THREE.Mesh(tankG, tankM); g.add(t);
          for (let b = -1; b <= 1; b++) { const band = new THREE.Mesh(new THREE.CylinderGeometry(1.03, 1.03, 0.12, 20), bandM); band.rotation.z = Math.PI / 2; band.position.x = b * 1.1; g.add(band); }
          const ga = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), gaugeM); ga.position.set(0.4, 0.2, 1.01); g.add(ga);
          [-1.3, 1.3].forEach((x) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 1.6), bandM); leg.position.set(x, -0.8, 0); g.add(leg); });
          pending.push({ x: cx(ci) - 1.1, z: cz(cj), r: 1.05 }, { x: cx(ci), z: cz(cj), r: 1.05 }, { x: cx(ci) + 1.1, z: cz(cj), r: 1.05 });
          vents.push([cx(ci) + 2.4, cz(cj) + 1.6]);
        }
      });
      // steam vents on open floor all over the level
      const open = [];
      for (let j = 1; j < BR.N - 1; j++) for (let i = 1; i < BR.N - 1; i++) if (free(i, j) && w.dist[j * BR.N + i] > 12) open.push([i, j]);
      for (let k = 0; k < (low ? 8 : 14) && open.length; k++) { const o = open.splice(Math.floor(r() * open.length), 1)[0]; vents.push([cx(o[0]) + (r() - 0.5) * 1.4, cz(o[1]) + (r() - 0.5) * 1.4]); }
      const grate = new THREE.MeshStandardMaterial({ color: 0x1a1210, metalness: 0.7, roughness: 0.5, emissive: 0xff5a1c, emissiveIntensity: 0.55 });
      const tex = BR.tex && BR.tex.dust ? BR.tex.dust() : null;
      vents.forEach(([x, z], k) => {
        const gr = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.7), grate); gr.position.set(x, 0.016, z); scene.add(gr);
        const puffs = [];
        for (let p = 0; p < (low ? 3 : 5); p++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xd9cfc6, transparent: true, opacity: 0, depthWrite: false, fog: true }));
          sp.position.set(x, 0.2, z); scene.add(sp); puffs.push(sp);
        }
        const ph = r() * 20, period = 5 + r() * 4;
        w.tickers.push((t) => {
          const on = ((t + ph) % period) < period * 0.55 ? 1 : 0;
          puffs.forEach((sp, p) => {
            const u = (((t + ph) * 0.45 + p / puffs.length) % 1);
            sp.position.set(x + Math.sin(t * 0.7 + p) * 0.25 * u, 0.2 + u * 2.7, z + Math.cos(t * 0.6 + p * 2) * 0.25 * u);
            const s = 0.7 + u * 2.2; sp.scale.set(s, s, 1);
            sp.material.opacity = on * Math.sin(u * Math.PI) * 0.32;
          });
        });
      });
    }

    /* ================= LEVEL 3: pools ================= */
    if (theme.id === 3) {
      // caustic light web (tileable)
      const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx2 = cv.getContext('2d'), id = cx2.createImageData(128, 128);
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const a = Math.sin(2 * Math.PI * (2 * x / 128) + 1.3 * Math.sin(2 * Math.PI * y / 128)), b = Math.sin(2 * Math.PI * (3 * y / 128) + 1.3 * Math.sin(2 * Math.PI * x / 128));
        const v = Math.pow(1 - Math.abs(a * b), 9) * 255, k = (y * 128 + x) * 4; id.data[k] = v * 0.8; id.data[k + 1] = v; id.data[k + 2] = v; id.data[k + 3] = 255;
      }
      cx2.putImageData(id, 0, 0);
      const caus = new THREE.CanvasTexture(cv); caus.wrapS = caus.wrapT = THREE.RepeatWrapping;
      const nrm = BR.tex.surface('tiles', 1).normal; nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
      const ropeW = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }), ropeR = new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.5 });
      const ringM = new THREE.MeshStandardMaterial({ color: 0xff7a3c, roughness: 0.45 });
      const railM = new THREE.MeshStandardMaterial({ color: 0xcfd6d8, metalness: 0.85, roughness: 0.25 });
      halls.forEach((h, n) => {
        if (n % 3 === 2) return;                                          // some halls stay dry
        const x0 = (h.x0 + 1) * T, x1 = (h.x0 + h.w - 1) * T, z0 = (h.z0 + 1) * T, z1 = (h.z0 + h.h - 1) * T;
        const nr = nrm.clone(); nr.needsUpdate = true; nr.repeat.set((x1 - x0) / 2.5, (z1 - z0) / 2.5);
        const water = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: 0x3fb7c4, roughness: 0.05, metalness: 0.25, transparent: true, opacity: 0.6, normalMap: nr, normalScale: new THREE.Vector2(0.25, 0.25), emissive: 0x0a4a52, emissiveIntensity: 0.9 }));
        water.rotation.x = -Math.PI / 2; water.position.set((x0 + x1) / 2, 0.06, (z0 + z1) / 2); scene.add(water);
        const ct = caus.clone(); ct.needsUpdate = true; ct.repeat.set((x1 - x0) / 3, (z1 - z0) / 3);
        const cau = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xbff4ff }));
        cau.rotation.x = -Math.PI / 2; cau.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2); scene.add(cau);
        w.water.push({ x0, x1, z0, z1 });
        w.tickers.push((t) => { ct.offset.set(t * 0.03, t * 0.021); nr.offset.set(-t * 0.01, t * 0.014); });
        // lane ropes across the pool
        const lanes = Math.max(2, Math.floor((z1 - z0) / 2.6) - 1);
        for (let l = 1; l <= lanes; l++) {
          const z = z0 + l * (z1 - z0) / (lanes + 1), cnt = Math.floor((x1 - x0) / 0.5);
          const rope = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), ropeW, cnt), m4 = M4(), cc = new THREE.Color();
          for (let k = 0; k < cnt; k++) { m4.makeTranslation(x0 + 0.25 + k * 0.5, 0.1, z); rope.setMatrixAt(k, m4); rope.setColorAt(k, cc.setHex(k % 4 < 2 ? 0xf2f2f2 : 0xd8342c)); }
          rope.instanceMatrix.needsUpdate = true; if (rope.instanceColor) rope.instanceColor.needsUpdate = true; scene.add(rope);
        }
        // pool ladders at the two corners + floating rings
        [[x0 + 0.05, z0 + 0.7], [x1 - 0.05, z1 - 0.7]].forEach(([x, z], k) => {
          const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
          [-0.2, 0.2].forEach((o) => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 6, 14, Math.PI), railM); t.rotation.y = Math.PI / 2; t.position.set(0, 0.55, o); g.add(t); });
          for (let q = 0; q < 3; q++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.4), railM); st.position.set(k ? 0.2 : -0.2, 0.15 + q * 0.12, 0); g.add(st); }
        });
        for (let q = 0; q < 3; q++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.14, 8, 18), ringM); ring.rotation.x = Math.PI / 2;
          const bx = x0 + (0.2 + 0.6 * r()) * (x1 - x0), bz = z0 + (0.15 + 0.7 * r()) * (z1 - z0), ph = r() * 6;
          ring.position.set(bx, 0.12, bz); scene.add(ring);
          w.tickers.push((t) => { ring.position.y = 0.1 + Math.sin(t * 1.3 + ph) * 0.03; ring.position.x = bx + Math.sin(t * 0.2 + ph) * 0.4; ring.rotation.z = Math.sin(t * 0.9 + ph) * 0.08; });
        }
      });
    }
  };
})(window.BR);
