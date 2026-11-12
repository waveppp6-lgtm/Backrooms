/* BACKROOMS — the drains, dressed up. The big halls of the underground get their own character:
   flooded cisterns (shallow water that slows you and makes noise), pipe halls (ribbed pipes along the ceiling),
   machine halls (generators you have to walk around), and blinking emergency beacons everywhere. */
window.BR = window.BR || {};

(function (BR) {
  BR.inWater = function (w, x, z) {
    const L = w && w.water;
    if (L) for (let k = 0; k < L.length; k++) { const a = L[k]; if (x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1) return true; }
    return false;
  };

  BR.buildCavern = function (scene, w, gen, theme, r) {
    const T = w.TILE, H = w.H;
    w.water = []; w.tickers = w.tickers || [];
    const halls = gen.rooms.filter((h) => h.w >= 9 && h.h >= 9);
    if (!halls.length) return;
    const types = ['cistern', 'pipes', 'machines', 'cistern', 'pipes', 'machines'];
    // shuffle which hall gets which character (but always at least one cistern)
    const order = halls.map((h, i) => [r(), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const rust = new THREE.MeshStandardMaterial({ color: 0x5a3c2a, metalness: 0.6, roughness: 0.55 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x4d5a58, metalness: 0.7, roughness: 0.42 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x151a19, roughness: 0.8 });
    const machineM = new THREE.MeshStandardMaterial({ color: 0x2c3a35, metalness: 0.5, roughness: 0.55 });
    const beaconM = new THREE.MeshBasicMaterial({ color: 0xff3a1c });
    const glowTex = BR.tex && BR.tex.dust ? BR.tex.dust() : null;
    const free = (i, j) => gen.grid[j] && gen.grid[j][i] === 0;
    const pending = [];

    halls.forEach((h, n) => {
      const type = types[order.indexOf(n) % types.length], X0 = h.x0 * T, X1 = (h.x0 + h.w) * T, Z0 = h.z0 * T, Z1 = (h.z0 + h.h) * T;
      if (type === 'cistern') {
        const x0 = X0 + T, x1 = X1 - T, z0 = Z0 + T, z1 = Z1 - T;
        const nrm = BR.tex.surface('concrete', 1).normal; nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.repeat.set((x1 - x0) / 3, (z1 - z0) / 3);
        const mat = new THREE.MeshStandardMaterial({ color: 0x0a2426, roughness: 0.06, metalness: 0.65, transparent: true, opacity: 0.9, normalMap: nrm, normalScale: new THREE.Vector2(0.35, 0.35), emissive: 0x03100f, emissiveIntensity: 0.8 });
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
        pl.rotation.x = -Math.PI / 2; pl.position.set((x0 + x1) / 2, 0.045, (z0 + z1) / 2); scene.add(pl);
        w.water.push({ x0, x1, z0, z1 });
        w.tickers.push((t) => { nrm.offset.set(t * 0.012, t * 0.008); });
      }
      if (type === 'pipes' || type === 'cistern') {
        const alongX = h.w >= h.h, len = (alongX ? X1 - X0 : Z1 - Z0) - 0.4, cnt = 3;
        for (let k = 0; k < cnt; k++) {
          const off = (k + 1) / (cnt + 1), rad = 0.1 + (k % 2) * 0.05;
          const cg = new THREE.CylinderGeometry(rad, rad, len, 10); if (alongX) cg.rotateZ(Math.PI / 2); else cg.rotateX(Math.PI / 2);
          const p = new THREE.Mesh(cg, k % 2 ? rust : steel);
          const c = [(X0 + X1) / 2, H - 0.34 - k * 0.04, (Z0 + Z1) / 2];
          if (alongX) c[2] = Z0 + off * (Z1 - Z0); else c[0] = X0 + off * (X1 - X0);
          p.position.set(c[0], c[1], c[2]); scene.add(p);
          const nF = Math.floor(len / 2.4), fg = new THREE.CylinderGeometry(rad + 0.045, rad + 0.045, 0.07, 10); if (alongX) fg.rotateZ(Math.PI / 2); else fg.rotateX(Math.PI / 2);
          const fl = new THREE.InstancedMesh(fg, dark, nF), m4 = new THREE.Matrix4();
          for (let f = 0; f < nF; f++) { m4.makeTranslation(alongX ? X0 + 0.2 + (f + 0.5) * len / nF : c[0], c[1], alongX ? c[2] : Z0 + 0.2 + (f + 0.5) * len / nF); fl.setMatrixAt(f, m4); }
          fl.instanceMatrix.needsUpdate = true; scene.add(fl);
        }
      }
      if (type === 'machines') {
        const spots = [];
        for (let tries = 0; tries < 60 && spots.length < 4; tries++) {
          const i = h.x0 + 2 + Math.floor(r() * (h.w - 4)), j = h.z0 + 2 + Math.floor(r() * (h.h - 4));
          if (!free(i, j) || spots.some((s) => Math.abs(s[0] - i) + Math.abs(s[1] - j) < 4)) continue;
          if (![[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => free(i + dx, j + dz))) continue;
          spots.push([i, j]);
        }
        spots.forEach(([i, j]) => {
          const g = new THREE.Group(); g.position.set(w.center(i), 0, w.center(j)); g.rotation.y = Math.floor(r() * 4) * Math.PI / 2; scene.add(g);
          const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
          add(new THREE.BoxGeometry(1.7, 1.5, 1.0), machineM, 0, 0.75, 0);
          add(new THREE.BoxGeometry(1.6, 0.12, 0.9), dark, 0, 1.56, 0);
          for (let v = 0; v < 6; v++) add(new THREE.BoxGeometry(1.4, 0.03, 0.06), steel, 0, 1.63, -0.35 + v * 0.14);
          add(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 10), steel, 0.5, 2.2, 0.1);
          add(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 8), rust, -0.55, 2.1, -0.1);
          const led = [0x39ff88, 0xff3a1c, 0xffb020];
          led.forEach((c, v) => add(new THREE.BoxGeometry(0.06, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: c }), -0.5 + v * 0.14, 1.1, 0.51));
          add(new THREE.BoxGeometry(0.5, 0.3, 0.02), new THREE.MeshStandardMaterial({ color: 0x0b1210, emissive: 0x153a28, emissiveIntensity: 1.0 }), 0.3, 0.95, 0.51);
          pending.push({ x: g.position.x, z: g.position.z, r: 1.05 });
        });
      }
      // emergency beacons near the corners: a lamp that blinks and a soft red glow
      [[X0 + 1, Z0 + 1], [X1 - 1, Z0 + 1], [X0 + 1, Z1 - 1], [X1 - 1, Z1 - 1]].forEach(([bx, bz], k) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 10), beaconM.clone()); b.position.set(bx, H - 0.12, bz); scene.add(b);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3a1c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
        sp.scale.set(2.2, 2.2, 1); sp.position.set(bx, H - 0.3, bz); scene.add(sp);
        const ph = k * 1.7 + n;
        w.tickers.push((t) => { const on = Math.sin(t * 2.4 + ph) > 0.35 ? 1 : 0; sp.material.opacity = on * 0.4; b.material.color.setHex(on ? 0xff3a1c : 0x3a0e08); });
      });
    });
    w.pendingColliders = pending;
  };
})(window.BR);
