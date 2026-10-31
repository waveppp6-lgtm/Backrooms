/* BACKROOMS — set dressing: wall trim, decals, office props, ceiling ducts, floating dust.
   Called once per level from world.js; adds colliders for the larger props to world.colliders. */
window.BR = window.BR || {};

(function (BR) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const TAU = Math.PI * 2;
  const rr = (a, b) => a + Math.random() * (b - a);

  function cvTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = BR.maxAniso || 4;
    return t;
  }

  /* ---------------- decal textures ---------------- */
  function switchTex() {
    return cvTex(64, 96, (g, w, h) => {
      g.fillStyle = '#d9d0a4'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(80,70,30,0.6)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
      g.fillStyle = '#ece4bd'; g.fillRect(20, 22, 24, 52);
      g.fillStyle = 'rgba(70,60,25,0.55)'; g.fillRect(20, 46, 24, 2);
      g.fillStyle = '#8b8460'; g.beginPath(); g.arc(32, 10, 3, 0, TAU); g.arc(32, 86, 3, 0, TAU); g.fill();
    });
  }
  function pictureTex() {
    return cvTex(256, 200, (g, w, h) => {
      g.fillStyle = '#2d2010'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#4a3820'; g.fillRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#d6cfa6'; g.fillRect(16, 16, w - 32, h - 32);
      const sky = g.createLinearGradient(0, 28, 0, 130);
      sky.addColorStop(0, '#b9b690'); sky.addColorStop(1, '#e2d9a8');
      g.fillStyle = sky; g.fillRect(28, 28, w - 56, h - 56);
      g.fillStyle = '#8a8a5c'; g.beginPath();
      g.moveTo(28, 150); g.lineTo(90, 96); g.lineTo(140, 128); g.lineTo(190, 84); g.lineTo(228, 120); g.lineTo(228, 172); g.lineTo(28, 172);
      g.closePath(); g.fill();
      g.fillStyle = '#6f7048'; g.beginPath();
      g.moveTo(28, 172); g.lineTo(28, 140); g.quadraticCurveTo(120, 118, 228, 150); g.lineTo(228, 172); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,250,200,0.35)'; g.beginPath(); g.arc(70, 66, 12, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.beginPath();
      g.moveTo(28, 28); g.lineTo(120, 28); g.lineTo(60, 172); g.lineTo(28, 172); g.fill();
    });
  }
  function cautionTex() {
    return cvTex(128, 160, (g, w, h) => {
      g.fillStyle = '#d8d1ae'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#222'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
      g.fillStyle = '#e0b81c'; g.beginPath(); g.moveTo(64, 18); g.lineTo(112, 100); g.lineTo(16, 100); g.closePath(); g.fill();
      g.lineWidth = 6; g.lineJoin = 'round'; g.strokeStyle = '#1a1a14'; g.stroke();
      g.fillStyle = '#1a1a14'; g.fillRect(60, 42, 8, 32); g.beginPath(); g.arc(64, 86, 5, 0, TAU); g.fill();
      g.textAlign = 'center';
      g.font = 'bold 18px Arial, sans-serif'; g.fillText('CAUTION', 64, 134);
      g.font = 'bold 10px Arial, sans-serif'; g.fillText('SLIPPERY WHEN WET', 64, 150);
    });
  }
  function doorTex() {
    return cvTex(256, 512, (g, w, h) => {
      g.fillStyle = '#241c0a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#8c7c4c'; g.fillRect(14, 12, w - 28, h - 12);
      for (const [y, hh] of [[44, 190], [262, 200]]) {
        g.fillStyle = 'rgba(60,46,14,0.28)'; g.fillRect(40, y, w - 80, hh);
        g.strokeStyle = 'rgba(255,240,170,0.22)'; g.lineWidth = 3; g.strokeRect(40, y, w - 80, hh);
      }
      g.fillStyle = '#b9b27a'; g.beginPath(); g.arc(w - 50, 270, 11, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(w - 53, 267, 4, 0, TAU); g.fill();
      g.fillStyle = '#3c3418'; for (const y of [60, 250, 440]) g.fillRect(14, y, 8, 34);
      for (let i = 0; i < 60; i++) {
        g.strokeStyle = Math.random() < 0.5 ? 'rgba(40,30,6,0.12)' : 'rgba(240,225,150,0.08)';
        g.lineWidth = rr(1, 3); const x0 = rr(20, w - 20), y0 = rr(30, h - 30);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + rr(-14, 14), y0 + rr(10, 50)); g.stroke();
      }
      const sh = g.createLinearGradient(0, h - 26, 0, h);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.7)');
      g.fillStyle = sh; g.fillRect(0, h - 26, w, 26);
      const top = g.createLinearGradient(0, 12, 0, 40);
      top.addColorStop(0, 'rgba(0,0,0,0.45)'); top.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = top; g.fillRect(14, 12, w - 28, 28);
    });
  }
  function crackTex() {
    return cvTex(128, 512, (g, w, h) => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      function branch(x, y, len, wd, ang, depth) {
        g.strokeStyle = `rgba(30,22,4,${0.5 + wd * 0.1})`; g.lineWidth = wd;
        g.beginPath(); g.moveTo(x, y);
        const forks = [];
        let cx = x, cy = y;
        for (let i = 0; i < len; i += 10) {
          ang += rr(-0.5, 0.5);
          cx += Math.sin(ang) * 10; cy += Math.cos(ang) * 10;
          if (cx < 4 || cx > w - 4 || cy > h - 2) break;
          g.lineTo(cx, cy);
          if (depth < 2 && Math.random() < 0.1) forks.push([cx, cy, ang]);
        }
        g.stroke();
        forks.forEach((f) => branch(f[0], f[1], len * 0.45, wd * 0.6, f[2] + rr(-1, 1), depth + 1));
      }
      branch(w / 2 + rr(-14, 14), 0, 470, 3.2, rr(-0.15, 0.15), 0);
    });
  }

  BR.propGeo = (key) => merge(TYPES.find((t) => t.key === key).build());
  BR.doorTex = doorTex;      // used by rooms.js for the working doors

  /* ---------------- geometry helpers for props ---------------- */
  const Bx = (bw, bh, bd, x, y, z, c, rx, ry, rz) => {
    const g = new THREE.BoxGeometry(bw, bh, bd);
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    return { geo: g, color: new THREE.Color(c) };
  };
  const Cy = (rt, rb, ch, x, y, z, c, seg) => {
    const g = new THREE.CylinderGeometry(rt, rb, ch, seg || 12);
    g.translate(x, y, z);
    return { geo: g, color: new THREE.Color(c) };
  };
  function merge(parts) {
    const pos = [], nor = [], uv = [], col = [], idx = [];
    let off = 0;
    parts.forEach(({ geo, color }) => {
      const p = geo.attributes.position, n = geo.attributes.normal, u = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        uv.push(u.getX(i), u.getY(i));
        col.push(color.r, color.g, color.b);
      }
      if (geo.index) for (let k = 0; k < geo.index.count; k++) idx.push(geo.index.getX(k) + off);
      else for (let k = 0; k < p.count; k++) idx.push(off + k);
      off += p.count;
      geo.dispose();
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }

  /* prop catalogue. +z is the front. depth = distance from wall surface to the prop centre.
     big props are kept out of 1-tile corridors so they can never block the way. */
  const TYPES = [
    { key: 'desk', wt: 3, r: 0.8, depth: 0.55, big: true, build: () => [
      Bx(1.6, 0.05, 0.8, 0, 0.74, 0, '#6e5a34'),
      Bx(0.04, 0.72, 0.76, -0.76, 0.37, 0, '#5a4a2a'), Bx(0.04, 0.72, 0.76, 0.76, 0.37, 0, '#5a4a2a'),
      Bx(1.5, 0.4, 0.03, 0, 0.5, -0.36, '#574626'),
      Bx(0.45, 0.6, 0.7, 0.52, 0.42, 0, '#5f4e2c'),
      Bx(0.4, 0.12, 0.02, 0.52, 0.62, 0.36, '#4b3d22'), Bx(0.4, 0.12, 0.02, 0.52, 0.45, 0.36, '#4b3d22'), Bx(0.4, 0.12, 0.02, 0.52, 0.28, 0.36, '#4b3d22'),
      Bx(0.5, 0.38, 0.06, -0.3, 1.02, -0.18, '#1b1b18'), Bx(0.08, 0.2, 0.08, -0.3, 0.87, -0.18, '#222'), Bx(0.3, 0.02, 0.2, -0.3, 0.77, -0.18, '#222'),
      Bx(0.42, 0.02, 0.14, -0.3, 0.77, 0.1, '#2b2b28')
    ] },
    { key: 'chair', wt: 5, r: 0.36, free: true, push: true, build: () => [
      Bx(0.46, 0.07, 0.46, 0, 0.5, 0, '#2b2b2a'), Bx(0.44, 0.52, 0.06, 0, 0.82, -0.22, '#2b2b2a', -0.1),
      Cy(0.03, 0.03, 0.36, 0, 0.3, 0, '#444', 8),
      Bx(0.58, 0.03, 0.06, 0, 0.12, 0, '#333'), Bx(0.06, 0.03, 0.58, 0, 0.12, 0, '#333'),
      Bx(0.04, 0.04, 0.3, -0.24, 0.66, 0, '#222'), Bx(0.04, 0.04, 0.3, 0.24, 0.66, 0, '#222')
    ] },
    { key: 'cabinet', wt: 4, r: 0.5, depth: 0.4, big: true, build: () => [
      Bx(0.5, 1.3, 0.6, 0, 0.65, 0, '#7e7f78'),
      Bx(0.44, 0.28, 0.02, 0, 0.2, 0.31, '#6b6c66'), Bx(0.44, 0.28, 0.02, 0, 0.5, 0.31, '#6b6c66'),
      Bx(0.44, 0.28, 0.02, 0, 0.8, 0.31, '#6b6c66'), Bx(0.44, 0.28, 0.02, 0, 1.1, 0.31, '#6b6c66'),
      Bx(0.16, 0.03, 0.03, 0, 0.28, 0.33, '#222'), Bx(0.16, 0.03, 0.03, 0, 0.58, 0.33, '#222'),
      Bx(0.16, 0.03, 0.03, 0, 0.88, 0.33, '#222'), Bx(0.16, 0.03, 0.03, 0, 1.18, 0.33, '#222')
    ] },
    { key: 'boxes', wt: 5, r: 0.6, depth: 0.5, big: true, box: true, build: () => [
      Bx(0.6, 0.4, 0.5, 0, 0.2, 0, '#ffffff'), Bx(0.5, 0.35, 0.45, 0.04, 0.575, 0, '#ffffff', 0, 0.2),
      Bx(0.55, 0.45, 0.5, 0.72, 0.225, 0.08, '#ffffff', 0, -0.15)
    ] },
    { key: 'cooler', wt: 1.2, r: 0.35, depth: 0.35, build: () => [
      Bx(0.38, 0.95, 0.38, 0, 0.475, 0, '#c9ccc6'), Cy(0.17, 0.17, 0.45, 0, 1.2, 0, '#8fc4d8', 14),
      Cy(0.08, 0.14, 0.1, 0, 1.47, 0, '#b8d8e4', 12), Bx(0.06, 0.05, 0.08, 0, 0.9, 0.2, '#2a5aa0'), Bx(0.06, 0.05, 0.08, 0.1, 0.9, 0.2, '#b02a2a')
    ] },
    { key: 'plant', wt: 2, r: 0.3, depth: 0.35, push: true, build: () => {
      const p = [Cy(0.2, 0.15, 0.3, 0, 0.15, 0, '#6b4a30', 12), Cy(0.19, 0.19, 0.02, 0, 0.3, 0, '#2b2012', 12)];
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * TAU;
        p.push(Bx(0.025, 0.7, 0.025, Math.cos(a) * 0.1, 0.62, Math.sin(a) * 0.1, '#4a3f1e', Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4));
        p.push(Bx(0.12, 0.01, 0.07, Math.cos(a) * 0.22, 0.88, Math.sin(a) * 0.22, '#5a4c1c', 0, a, 0.3));
      }
      return p;
    } },
    { key: 'cone', wt: 3, r: 0.2, free: true, small: true, push: true, build: () => [
      Bx(0.4, 0.03, 0.4, 0, 0.015, 0, '#d96a1f'), Cy(0.02, 0.16, 0.55, 0, 0.3, 0, '#d96a1f', 14), Cy(0.09, 0.09, 0.07, 0, 0.3, 0, '#e8e4d0', 14)
    ] },
    { key: 'wetsign', wt: 2, r: 0.28, free: true, small: true, push: true, build: () => [
      Bx(0.3, 0.6, 0.02, 0, 0.3, 0.08, '#e6c21c', -0.2), Bx(0.3, 0.6, 0.02, 0, 0.3, -0.08, '#e6c21c', 0.2),
      Bx(0.2, 0.2, 0.03, 0, 0.36, 0.11, '#2a2a20', -0.2)
    ] },
    { key: 'couch', wt: 1.5, r: 0.9, depth: 0.55, big: true, build: () => [
      Bx(1.9, 0.35, 0.85, 0, 0.25, 0, '#5e4a2a'), Bx(1.9, 0.5, 0.2, 0, 0.7, -0.33, '#6a542f'),
      Bx(0.2, 0.55, 0.85, -0.85, 0.5, 0, '#5a4626'), Bx(0.2, 0.55, 0.85, 0.85, 0.5, 0, '#5a4626'),
      Bx(0.78, 0.14, 0.62, -0.4, 0.49, 0.06, '#76603a'), Bx(0.78, 0.14, 0.62, 0.4, 0.49, 0.06, '#7a643d'),
      Bx(0.06, 0.08, 0.06, -0.85, 0.04, 0.35, '#222'), Bx(0.06, 0.08, 0.06, 0.85, 0.04, 0.35, '#222'),
      Bx(0.06, 0.08, 0.06, -0.85, 0.04, -0.35, '#222'), Bx(0.06, 0.08, 0.06, 0.85, 0.04, -0.35, '#222')
    ] },
    { key: 'bin', wt: 3, r: 0.28, depth: 0.3, push: true, build: () => [
      Cy(0.22, 0.18, 0.55, 0, 0.275, 0, '#3a3a36', 14), Bx(0.16, 0.12, 0.14, 0.04, 0.58, 0, '#cfc8a6', 0.4, 0.6, 0.2)
    ] }
  ];

  /* ---------------- main entry ---------------- */
  BR.addDetails = function (scene, w, opts) {
    const { wallTiles, quality, rand } = opts;
    const N = w.N, TILE = w.TILE, H = w.H, low = quality === 'low', ex = w.exitTile;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler();
    const v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
    w.colliders = []; w.movers = [];

    const shuffle = (a) => {
      for (let k = a.length - 1; k > 0; k--) { const m = Math.floor(rand() * (k + 1)); const t = a[k]; a[k] = a[m]; a[m] = t; }
      return a;
    };

    // every exposed wall face, except the ones around the exit door
    const faces = [];
    wallTiles.forEach(([i, j]) => DIRS.forEach(([dx, dz]) => {
      const oi = i + dx, oj = j + dz;
      if (!w.solid(oi, oj) && !(oi === ex.i && oj === ex.j)) faces.push([i, j, dx, dz]);
    }));

    /* ----- baseboard + crown moulding ----- */
    const trim = (th, depth, y, color, rough) => {
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color, roughness: rough }), faces.length);
      faces.forEach(([i, j, dx, dz], k) => {
        v3.set(w.center(i) + dx * (TILE / 2 + depth / 2), y, w.center(j) + dz * (TILE / 2 + depth / 2));
        s3.set(dx !== 0 ? depth : TILE, th, dx !== 0 ? TILE : depth);
        m4.compose(v3, q.identity(), s3); mesh.setMatrixAt(k, m4);
      });
      mesh.receiveShadow = true;
      scene.add(mesh);
    };
    trim(0.17, 0.05, 0.085, 0x2b2412, 0.5);
    trim(0.1, 0.07, H - 0.05, 0xcbbd7a, 0.8);

    /* ----- wall decals (one per face) ----- */
    const pool = shuffle(faces.slice());
    const DEC = [
      { tex: () => BR.tex.outlet(), w: 0.11, h: 0.165, y: () => 0.38, n: [24, 12] },
      { tex: switchTex, w: 0.1, h: 0.15, y: () => 1.25, n: [12, 6] },
      { tex: () => BR.tex.vent(), w: 0.6, h: 0.6, y: () => 2.62, n: [12, 6] },
      { tex: pictureTex, w: 0.95, h: 0.75, y: () => 1.7, n: [8, 4] },
      { tex: cautionTex, w: 0.42, h: 0.52, y: () => 1.55, n: [4, 2] },
      { tex: crackTex, w: 0.9, h: 2.6, y: () => H - 1.45, n: [12, 6] }
    ];
    const stainTex = BR.tex.stains();
    stainTex.forEach((t) => DEC.push({ tex: () => t, w: 1.9, h: 1.9, y: () => rr(1.0, 2.5), n: [5, 3] }));
    const planeGeo = new THREE.PlaneGeometry(1, 1);
    DEC.forEach((d, di) => {
      const count = Math.min(low ? d.n[1] : d.n[0], pool.length);
      if (!count) return;
      const mesh = new THREE.InstancedMesh(planeGeo, new THREE.MeshStandardMaterial({
        map: d.tex(), transparent: true, depthWrite: false, roughness: 0.9,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
      }), count);
      for (let k = 0; k < count; k++) {
        const [i, j, dx, dz] = pool.pop();
        const off = TILE / 2 + 0.012 + di * 0.0012;
        v3.set(w.center(i) + dx * off, d.y(), w.center(j) + dz * off);
        q.setFromEuler(eu.set(0, Math.atan2(dx, dz), 0));
        s3.set(d.w, d.h, 1);
        m4.compose(v3, q, s3); mesh.setMatrixAt(k, m4);
      }
      scene.add(mesh);
    });

    /* ----- open tiles ----- */
    const open = [];
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) if (!w.solid(i, j)) open.push([i, j]);
    shuffle(open);

    /* ----- water stains on the ceiling ----- */
    const ceilGeo = new THREE.PlaneGeometry(1, 1); ceilGeo.rotateX(Math.PI / 2);
    const nCeil = low ? 6 : 12;
    const ceilStain = new THREE.InstancedMesh(ceilGeo, new THREE.MeshBasicMaterial({
      map: stainTex[0], transparent: true, depthWrite: false, color: 0x8a7a50,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    }), nCeil);
    for (let k = 0; k < nCeil; k++) {
      const [i, j] = open[k];
      v3.set(w.center(i) + rr(-0.8, 0.8), H - 0.012, w.center(j) + rr(-0.8, 0.8));
      q.setFromEuler(eu.set(0, rr(0, TAU), 0)); s3.setScalar(rr(1.6, 3.0));
      m4.compose(v3, q, s3); ceilStain.setMatrixAt(k, m4);
    }
    scene.add(ceilStain);

    /* ----- ceiling ducts along straight corridors ----- */
    const mark = new Set(), runs = [];
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      if (w.solid(i, j)) continue;
      const alongX = w.solid(i, j - 1) && w.solid(i, j + 1) && !w.solid(i - 1, j) && !w.solid(i + 1, j);
      const alongZ = w.solid(i - 1, j) && w.solid(i + 1, j) && !w.solid(i, j - 1) && !w.solid(i, j + 1);
      if (!alongX && !alongZ) continue;
      const prev = alongX ? (i - 1) + ',' + j : i + ',' + (j - 1);
      if (mark.has(prev) ? rand() < 0.93 : rand() < 0.1) { mark.add(i + ',' + j); runs.push([i, j, alongX]); }
    }
    if (runs.length) {
      const ductMat = new THREE.MeshStandardMaterial({ color: 0x77735e, metalness: 0.6, roughness: 0.45 });
      const flangeMat = new THREE.MeshStandardMaterial({ color: 0x3a382c, metalness: 0.5, roughness: 0.6 });
      const ducts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ductMat, runs.length);
      const flanges = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), flangeMat, runs.length);
      runs.forEach(([i, j, alongX], k) => {
        const side = (alongX ? j : i) % 2 ? 1 : -1, lat = 1.15 * side, y = H - 0.3;
        if (alongX) {
          v3.set(w.center(i), y, w.center(j) + lat); s3.set(TILE, 0.32, 0.5); m4.compose(v3, q.identity(), s3); ducts.setMatrixAt(k, m4);
          v3.set(w.center(i) - TILE / 2 + 0.04, y, w.center(j) + lat); s3.set(0.08, 0.38, 0.56); m4.compose(v3, q.identity(), s3); flanges.setMatrixAt(k, m4);
        } else {
          v3.set(w.center(i) + lat, y, w.center(j)); s3.set(0.5, 0.32, TILE); m4.compose(v3, q.identity(), s3); ducts.setMatrixAt(k, m4);
          v3.set(w.center(i) + lat, y, w.center(j) - TILE / 2 + 0.04); s3.set(0.56, 0.38, 0.08); m4.compose(v3, q.identity(), s3); flanges.setMatrixAt(k, m4);
        }
      });
      scene.add(ducts); scene.add(flanges);
    }

    /* ----- furniture and clutter ----- */
    const reserved = new Set(['1,1', '1,2', '2,1']);
    (w.roomDefs || []).forEach((d) => reserved.add(d.oi + ',' + d.oj));      // keep the space in front of bedroom doors clear
    w.items.forEach((it) => reserved.add(w.tile(it.x) + ',' + w.tile(it.z)));
    const cand = open.filter(([i, j]) => w.dist[j * N + i] >= 3 && !reserved.has(i + ',' + j) && Math.abs(i - ex.i) + Math.abs(j - ex.j) > 2);
    const totalWt = TYPES.reduce((a, t) => a + t.wt, 0);
    const pick = () => { let r = rand() * totalWt; for (const t of TYPES) { r -= t.wt; if (r <= 0) return t; } return TYPES[0]; };
    const usedTiles = new Set(), placed = new Map();
    const nearUsed = (i, j) => DIRS.some(([dx, dz]) => usedTiles.has((i + dx) + ',' + (j + dz)));
    const total = low ? 34 : 64;
    let count = 0;
    for (const [i, j] of cand) {
      if (count >= total) break;
      const wallDirs = DIRS.filter(([dx, dz]) => w.solid(i + dx, j + dz));
      if (!wallDirs.length) continue;
      const corridor = (w.solid(i + 1, j) && w.solid(i - 1, j)) || (w.solid(i, j + 1) && w.solid(i, j - 1));
      if (corridor && nearUsed(i, j)) continue;
      let t = null;
      for (let tries = 0; tries < 8; tries++) { const c = pick(); if (!(corridor && c.big)) { t = c; break; } }
      if (!t) continue;
      const [dx, dz] = wallDirs[Math.floor(rand() * wallDirs.length)];
      const tang = (rand() - 0.5) * 1.2;
      let x, z, ry;
      if (t.free) {
        const away = 0.9 + rand() * 0.5;
        x = w.center(i) + dx * (TILE / 2 - away) + (dz !== 0 ? tang : 0);
        z = w.center(j) + dz * (TILE / 2 - away) + (dx !== 0 ? tang : 0);
        ry = rand() * TAU;
      } else {
        x = w.center(i) + dx * (TILE / 2 - t.depth) + (dz !== 0 ? tang : 0);
        z = w.center(j) + dz * (TILE / 2 - t.depth) + (dx !== 0 ? tang : 0);
        ry = Math.atan2(-dx, -dz) + (rand() - 0.5) * 0.25;
      }
      const s = 0.95 + rand() * 0.1;
      if (!placed.has(t)) placed.set(t, []);
      placed.get(t).push({ x, z, ry, s });
      usedTiles.add(i + ',' + j);
      if (!t.small && !t.push) w.colliders.push({ x, z, r: t.r * s });
      count++;
    }
    const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.12 });
    const boxMat = new THREE.MeshStandardMaterial({ map: BR.tex.box(), roughness: 0.9 });
    placed.forEach((list, t) => {
      const mesh = new THREE.InstancedMesh(merge(t.build()), t.box ? boxMat : vcMat, list.length);
      list.forEach((p, k) => {
        v3.set(p.x, 0, p.z); q.setFromEuler(eu.set(0, p.ry, 0)); s3.setScalar(p.s);
        m4.compose(v3, q, s3); mesh.setMatrixAt(k, m4);
        const tint = rr(0.82, 1.05); mesh.setColorAt(k, col.setRGB(tint, tint, tint * 0.97));
        if (t.push) w.movers.push({ mesh, k, x: p.x, z: p.z, ry: p.ry, s: p.s, r: t.r * p.s });   // light enough to shove around
      });
      mesh.receiveShadow = true;
      scene.add(mesh);
    });
  };

  /* ---------------- drifting dust ---------------- */
  BR.makeDust = function (scene, quality) {
    const n = quality === 'low' ? 160 : 420, R = 11;
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * R; pos[i * 3 + 1] = 0.2 + Math.random() * 3.0; pos[i * 3 + 2] = (Math.random() * 2 - 1) * R;
      vel[i * 3] = (Math.random() - 0.5) * 0.12; vel[i * 3 + 1] = (Math.random() - 0.5) * 0.05 - 0.01; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.06, map: BR.tex.dust(), transparent: true, opacity: 0.55, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xffe9a8, sizeAttenuation: true, fog: false
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    return {
      update(px, pz, dt, t) {
        for (let i = 0; i < n; i++) {
          const k = i * 3;
          let x = pos[k] + (vel[k] + Math.sin(t * 0.4 + i) * 0.03) * dt;
          let y = pos[k + 1] + vel[k + 1] * dt;
          let z = pos[k + 2] + (vel[k + 2] + Math.cos(t * 0.35 + i * 1.3) * 0.03) * dt;
          if (x - px > R) x -= 2 * R; else if (x - px < -R) x += 2 * R;
          if (z - pz > R) z -= 2 * R; else if (z - pz < -R) z += 2 * R;
          if (y > 3.3) y = 0.15; else if (y < 0.1) y = 3.2;
          pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
        }
        geo.attributes.position.needsUpdate = true;
      }
    };
  };
})(window.BR);
