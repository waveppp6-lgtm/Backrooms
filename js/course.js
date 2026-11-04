/* BACKROOMS — the parkour hall. A ring of solid blocks climbs and dips across a big open hall; the fuse sits on the last one.
   Falling costs nothing but time (and noise). Blocks are solid for walking, but you can jump up onto them: see game.js (groundAt). */
window.BR = window.BR || {};

(function (BR) {
  BR.buildCourse = function (scene, w, rect, theme, rand) {
    const T = w.TILE, H = w.H;
    w.platforms = [];
    if (!rect) return null;
    const cx = (rect.x0 + rect.w / 2) * T, cz = (rect.z0 + rect.h / 2) * T;
    const R = Math.min(rect.w, rect.h) * T / 2 - 3.0;
    const th0 = rand() * Math.PI * 2, dir = rand() < 0.5 ? 1 : -1;
    const heights = [0.3, 0.58, 0.86, 1.1, 0.9, 1.14, 0.96, 1.2, 1.3];
    const sizes = [1.6, 1.5, 1.35, 1.25, 1.15, 1.05, 1.0, 0.95, 2.0];
    const stone = new THREE.MeshStandardMaterial({ color: theme.id === 3 ? 0xb8d4d4 : 0x6a655a, roughness: 0.85, metalness: 0.05 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x2c2a26, roughness: 0.6, metalness: 0.3 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x3a2a08, emissive: 0xffb020, emissiveIntensity: 1.1, roughness: 0.5 });
    const green = new THREE.MeshStandardMaterial({ color: 0x1a3a22, emissive: 0x39ff88, emissiveIntensity: 1.2, roughness: 0.5 });
    const mk = (bw, bh, bd, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
    let th = th0, last = null;
    heights.forEach((h, k) => {
      const s = sizes[k];
      if (k > 0) th += dir * (((sizes[k - 1] + s) / 2 + 1.15 + 0.05 * k) / R);
      const x = cx + Math.cos(th) * R, z = cz + Math.sin(th) * R;
      mk(s, h, s, x, h / 2, z, stone);
      mk(s + 0.08, 0.07, s + 0.08, x, h - 0.035, z, capMat);
      const e = 0.04, o = s / 2 - 0.03;                          // glowing edge strips so the next block can be seen in the dark
      mk(s, e, e, x, h + 0.003, z - o, k === heights.length - 1 ? green : glow);
      mk(s, e, e, x, h + 0.003, z + o, k === heights.length - 1 ? green : glow);
      mk(e, e, s, x - o, h + 0.003, z, k === heights.length - 1 ? green : glow);
      mk(e, e, s, x + o, h + 0.003, z, k === heights.length - 1 ? green : glow);
      w.platforms.push({ x0: x - s / 2, x1: x + s / 2, z0: z - s / 2, z1: z + s / 2, top: h });
      last = { x, z, y: h };
    });
    w.course = { rect, fuse: last };
    return last;
  };

  // highest block top the player can stand on at (x,z). ref = feet height + how far a step up may reach
  BR.groundAt = function (w, x, z, ref) {
    let g = 0;
    const ps = w.platforms;
    if (!ps) return 0;
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k];
      if (p.top > g && p.top <= ref && x > p.x0 - 0.12 && x < p.x1 + 0.12 && z > p.z0 - 0.12 && z < p.z1 + 0.12) g = p.top;
    }
    return g;
  };
  // blocks too tall to step onto stop the player from walking into them
  BR.hitsPlatform = function (w, x, z, r, feet) {
    const ps = w.platforms;
    if (!ps) return false;
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k];
      if (p.top <= feet + 0.22) continue;
      const cx = Math.max(p.x0, Math.min(x, p.x1)), cz = Math.max(p.z0, Math.min(z, p.z1));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  };
})(window.BR);
