/* BACKROOMS — procedural textures: colour + normal maps, decals, sprites.
   Canvases are built once and cached; three.js Texture objects are created per call. */
window.BR = window.BR || {};

(function (BR) {
  const cv = {};
  const TAU = Math.PI * 2;
  const R = (a, b) => a + Math.random() * (b - a);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };

  function grain(ctx, w, h, amt) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amt;
      d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.85;
    }
    ctx.putImageData(img, 0, 0);
  }
  function radial(ctx, x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // draw a blob at x,y and again at wrapped positions so the texture tiles without seams
  function wrapBlob(s, x, y, r, fn, wrapY) {
    const xs = [0], ys = [0];
    if (x - r < 0) xs.push(s); if (x + r > s) xs.push(-s);
    if (wrapY) { if (y - r < 0) ys.push(s); if (y + r > s) ys.push(-s); }
    for (const dx of xs) for (const dy of ys) fn(x + dx, y + dy);
  }

  // height (luminance) -> tangent-space normal map, wrapping at the edges
  function normalFromHeight(src, strength) {
    const s = src.width, data = src.getContext('2d').getImageData(0, 0, s, s).data;
    const h = new Float32Array(s * s);
    for (let i = 0; i < s * s; i++) h[i] = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) / 255;
    const out = mk(s), octx = out.getContext('2d'), img = octx.createImageData(s, s), d = img.data;
    for (let y = 0; y < s; y++) {
      const yu = ((y - 1 + s) % s) * s, yd = ((y + 1) % s) * s, yy = y * s;
      for (let x = 0; x < s; x++) {
        const xl = (x - 1 + s) % s, xr = (x + 1) % s;
        const dx = (h[yy + xr] - h[yy + xl]) * strength;
        const dy = (h[yd + x] - h[yu + x]) * strength;
        const l = Math.sqrt(dx * dx + dy * dy + 1);
        const o = (yy + x) * 4;
        d[o] = (-dx / l * 0.5 + 0.5) * 255;
        d[o + 1] = (dy / l * 0.5 + 0.5) * 255;
        d[o + 2] = (1 / l * 0.5 + 0.5) * 255;
        d[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  function tex(c, rx, ry, ox, oy) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx || 1, ry || rx || 1);
    if (ox || oy) t.offset.set(ox || 0, oy || 0);
    t.anisotropy = BR.maxAniso || 4;
    return t;
  }
  const once = (k, fn) => { if (!cv[k]) fn(); };

  /* ---------------- wallpaper ---------------- */
  function motif(g, cx, cy, col) {
    g.fillStyle = col;
    g.beginPath(); g.moveTo(cx, cy - 16);
    g.quadraticCurveTo(cx + 12, cy, cx, cy + 16);
    g.quadraticCurveTo(cx - 12, cy, cx, cy - 16); g.fill();
    g.beginPath(); g.arc(cx, cy - 21, 3, 0, TAU); g.arc(cx, cy + 21, 3, 0, TAU); g.fill();
  }
  function buildWall() {
    const s = 1024;
    const c = mk(s), x = c.getContext('2d'), hc = mk(s), hx = hc.getContext('2d');
    x.fillStyle = '#cbb75a'; x.fillRect(0, 0, s, s);
    hx.fillStyle = 'rgb(118,118,118)'; hx.fillRect(0, 0, s, s);
    for (let px = 0; px < s; px += 64) {
      x.fillStyle = 'rgba(118,96,28,0.30)'; x.fillRect(px, 0, 38, s);
      x.fillStyle = 'rgba(255,240,165,0.15)'; x.fillRect(px + 38, 0, 26, s);
      x.fillStyle = 'rgba(86,66,16,0.55)'; x.fillRect(px + 44, 0, 3, s);
      hx.fillStyle = 'rgb(150,150,150)'; hx.fillRect(px + 38, 0, 26, s);
      hx.fillStyle = 'rgb(210,210,210)'; hx.fillRect(px + 44, 0, 3, s);
    }
    for (let py = 36; py < s; py += 96) for (let k = 0; k < 16; k++) {
      const cx = k * 64 + 19, cy = py + (k % 2 ? 48 : 0);
      motif(x, cx, cy, 'rgba(92,72,18,0.34)'); motif(hx, cx, cy, 'rgb(185,185,185)');
    }
    grain(x, s, s, 18);
    // large mottling
    for (let i = 0; i < 26; i++) {
      const px = R(0, s), py = R(0, s), r = R(80, 240), dark = i % 3 !== 0;
      wrapBlob(s, px, py, r, (a, b) => radial(x, a, b, r, dark ? '92,72,14' : '255,240,160', R(0.08, 0.18)), false);
    }
    // ceiling leaks: ragged vertical streaks
    for (let k = 0; k < 10; k++) {
      const x0 = R(0, s), w0 = R(18, 70), len = R(220, 760);
      for (let i = 0; i < w0; i += 2) {
        const l = len * R(0.55, 1.0) * Math.max(0.15, 1 - Math.abs(i - w0 / 2) / (w0 * 0.9));
        const g = x.createLinearGradient(0, 0, 0, l);
        g.addColorStop(0, 'rgba(64,46,6,0.34)'); g.addColorStop(0.7, 'rgba(64,46,6,0.16)'); g.addColorStop(1, 'rgba(64,46,6,0)');
        x.fillStyle = g; x.fillRect((x0 + i) % s, 0, 2, l);
      }
    }
    // mould near the floor
    for (let i = 0; i < 170; i++) {
      const py = s - Math.pow(Math.random(), 2) * s * 0.24, r = R(3, 16);
      radial(x, R(0, s), py, r, '42,52,18', R(0.14, 0.34));
    }
    // scuffs at hip height
    x.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const px = R(0, s), py = R(s * 0.55, s * 0.93), a = R(-0.6, 0.6), l = R(20, 90);
      x.strokeStyle = Math.random() < 0.7 ? 'rgba(60,44,8,0.16)' : 'rgba(240,225,150,0.10)';
      x.lineWidth = R(2, 6);
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
    // peeling paper
    for (let k = 0; k < 3; k++) {
      const cx = R(140, s - 140), cy = R(120, s * 0.6), n = 9, rr = R(40, 90), pts = [];
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU, r = rr * R(0.6, 1.25);
        pts.push([cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 1.3]);
      }
      const path = (g) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
      path(x); x.fillStyle = 'rgba(208,196,140,0.96)'; x.fill();
      x.lineWidth = 4; x.strokeStyle = 'rgba(40,28,4,0.5)'; x.stroke();
      path(hx); hx.fillStyle = 'rgb(64,64,64)'; hx.fill();
      hx.lineWidth = 3; hx.strokeStyle = 'rgb(225,225,225)'; hx.stroke();
    }
    let g = x.createLinearGradient(0, 0, 0, 70);
    g.addColorStop(0, 'rgba(30,22,2,0.42)'); g.addColorStop(1, 'rgba(30,22,2,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, 70);
    g = x.createLinearGradient(0, s * 0.8, 0, s);
    g.addColorStop(0, 'rgba(40,30,4,0)'); g.addColorStop(1, 'rgba(40,30,4,0.6)');
    x.fillStyle = g; x.fillRect(0, s * 0.8, s, s * 0.2);
    grain(hx, s, s, 10);
    cv.wall = c; cv.wallN = normalFromHeight(hc, 2.4);
  }

  /* ---------------- carpet ---------------- */
  function buildCarpet() {
    const s = 1024, c = mk(s), x = c.getContext('2d');
    x.fillStyle = '#76642a'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 46; i++) {
      const px = R(0, s), py = R(0, s), r = R(70, 230), dark = Math.random() < 0.55;
      wrapBlob(s, px, py, r, (a, b) => radial(x, a, b, r, dark ? '38,30,6' : '170,148,70', R(0.10, 0.24)), true);
    }
    const pal = ['#5b4b1c', '#85722f', '#968340', '#4b3d14', '#6c5b25', '#a08c48'];
    x.lineCap = 'round'; x.lineWidth = 1.4;
    for (let i = 0; i < 34000; i++) {
      const px = R(0, s), py = R(0, s), a = R(0, TAU), l = R(2, 7);
      x.strokeStyle = pal[(Math.random() * pal.length) | 0];
      x.globalAlpha = R(0.25, 0.6);
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
    x.globalAlpha = 1;
    for (let i = 0; i < 9; i++) {
      const px = R(0, s), py = R(0, s), r = R(90, 260);
      wrapBlob(s, px, py, r, (a, b) => radial(x, a, b, r, '26,20,3', R(0.22, 0.4)), true);
    }
    grain(x, s, s, 24);
    cv.carpet = c; cv.carpetN = normalFromHeight(c, 1.5);
  }

  /* ---------------- drop ceiling (2x2 tiles of 0.8 m) ---------------- */
  function buildCeiling() {
    const s = 512, t = 256, c = mk(s), x = c.getContext('2d'), hc = mk(s), hx = hc.getContext('2d');
    hx.fillStyle = 'rgb(140,140,140)'; hx.fillRect(0, 0, s, s);
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const ox = tx * t, oy = ty * t, v = R(-8, 8);
      x.fillStyle = `rgb(${(186 + v) | 0},${(172 + v) | 0},${(120 + v) | 0})`; x.fillRect(ox, oy, t, t);
      for (let i = 0; i < 1100; i++) {
        const px = ox + R(0, t), py = oy + R(0, t), r = R(0.7, 1.7), pore = Math.random() < 0.75;
        x.fillStyle = pore ? 'rgba(66,56,26,0.5)' : 'rgba(236,226,176,0.35)';
        x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
        if (pore) { hx.fillStyle = 'rgb(70,70,70)'; hx.beginPath(); hx.arc(px, py, r, 0, TAU); hx.fill(); }
      }
      if (Math.random() < 0.35) radial(x, ox + R(60, t - 60), oy + R(60, t - 60), R(40, 110), '110,78,20', R(0.25, 0.5));
      const g = x.createRadialGradient(ox + t / 2, oy + t / 2, t * 0.25, ox + t / 2, oy + t / 2, t * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.2)');
      x.fillStyle = g; x.fillRect(ox, oy, t, t);
    }
    // metal T-bar grid on the tile seams (wrapped at the edges)
    const seg = (g, a, b, w, h) => g.fillRect(a, b, w, h);
    const bars = (g, col) => {
      g.fillStyle = col;
      seg(g, 0, 0, 6, s); seg(g, s - 6, 0, 6, s); seg(g, t - 6, 0, 12, s);
      seg(g, 0, 0, s, 6); seg(g, 0, s - 6, s, 6); seg(g, 0, t - 6, s, 12);
    };
    x.fillStyle = 'rgba(0,0,0,0.45)';
    [8, s - 8, t - 8, t + 8].forEach((p) => { seg(x, p - 1.5, 0, 3, s); seg(x, 0, p - 1.5, s, 3); });
    bars(x, '#c4bb94'); bars(hx, 'rgb(225,225,225)');
    cv.ceiling = c; cv.ceilingN = normalFromHeight(hc, 2.0);
  }

  /* ---------------- small textures ---------------- */
  function buildPanel() {
    const c = mk(256, 128), x = c.getContext('2d');
    x.fillStyle = '#fffbe6'; x.fillRect(0, 0, 256, 128);
    [36, 92].forEach((y) => {
      const g = x.createLinearGradient(0, y - 16, 0, y + 16);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(6, y - 16, 244, 32);
    });
    x.fillStyle = 'rgba(190,180,120,0.14)';
    for (let px = 0; px < 256; px += 4) x.fillRect(px, 0, 1, 128);
    const e = x.createLinearGradient(0, 0, 256, 0);
    e.addColorStop(0, 'rgba(120,110,60,0.35)'); e.addColorStop(0.12, 'rgba(120,110,60,0)');
    e.addColorStop(0.88, 'rgba(120,110,60,0)'); e.addColorStop(1, 'rgba(120,110,60,0.35)');
    x.fillStyle = e; x.fillRect(0, 0, 256, 128);
    cv.panel = c;
  }
  function buildVent() {
    const c = mk(128), x = c.getContext('2d');
    x.fillStyle = '#6a6650'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#25231a'; x.fillRect(8, 8, 112, 112);
    for (let y = 12; y < 120; y += 9) {
      x.fillStyle = '#4a4636'; x.fillRect(8, y, 112, 4);
      x.fillStyle = '#0d0c08'; x.fillRect(8, y + 4, 112, 3);
    }
    grain(x, 128, 128, 14);
    cv.vent = c;
  }
  function buildOutlet() {
    const c = mk(64, 96), x = c.getContext('2d');
    x.fillStyle = '#d9d0a4'; x.fillRect(0, 0, 64, 96);
    x.strokeStyle = 'rgba(80,70,30,0.6)'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, 61, 93);
    [26, 70].forEach((y) => {
      x.fillStyle = '#2a2512'; x.fillRect(14, y - 11, 36, 20);
      x.fillStyle = '#0c0a04'; x.fillRect(21, y - 6, 4, 10); x.fillRect(39, y - 6, 4, 10);
    });
    x.fillStyle = '#8b8460'; x.beginPath(); x.arc(32, 48, 3, 0, TAU); x.fill();
    cv.outlet = c;
  }
  function buildBox() {
    const c = mk(128), x = c.getContext('2d');
    x.fillStyle = '#a8814c'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(90,60,25,0.18)' : 'rgba(220,180,110,0.15)'; x.fillRect(R(0, 128), R(0, 128), R(2, 10), 1); }
    x.fillStyle = '#c9ad74'; x.fillRect(0, 56, 128, 16);
    x.fillStyle = 'rgba(70,50,20,0.5)'; x.fillRect(0, 56, 128, 1.5); x.fillRect(0, 70.5, 128, 1.5);
    x.fillStyle = '#e8e2cc'; x.fillRect(12, 84, 42, 28);
    x.fillStyle = 'rgba(40,40,40,0.7)';
    for (let i = 0; i < 4; i++) x.fillRect(16, 90 + i * 6, 34 - (i % 2) * 10, 2);
    grain(x, 128, 128, 16);
    cv.box = c;
  }
  function buildStains() {
    cv.stains = [];
    for (let k = 0; k < 4; k++) {
      const c = mk(256), x = c.getContext('2d'), n = (R(8, 16)) | 0;
      for (let i = 0; i < n; i++) {
        const a = R(0, TAU), d = R(0, 60), r = R(25, 70);
        radial(x, 128 + Math.cos(a) * d, 128 + Math.sin(a) * d, r, '58,40,10', R(0.14, 0.32));
      }
      x.strokeStyle = 'rgba(36,24,4,0.22)'; x.lineWidth = 3;
      x.beginPath(); x.ellipse(128, 128, R(40, 58), R(34, 56), R(0, 3), 0, TAU); x.stroke();
      x.globalCompositeOperation = 'destination-in';
      const g = x.createRadialGradient(128, 128, 36, 128, 128, 128);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      x.globalCompositeOperation = 'source-over';
      cv.stains.push(c);
    }
  }
  function buildDust() {
    const c = mk(64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    cv.dust = c;
  }
  function buildFigure() {
    const c = mk(256, 512), x = c.getContext('2d');
    const body = x.createLinearGradient(0, 0, 0, 512);
    body.addColorStop(0, '#070605'); body.addColorStop(1, '#000');
    x.fillStyle = body;
    x.beginPath(); x.ellipse(128, 70, 46, 58, 0, 0, TAU); x.fill();
    x.beginPath();
    x.moveTo(108, 118); x.lineTo(148, 118); x.lineTo(196, 170); x.lineTo(182, 330);
    x.lineTo(170, 500); x.lineTo(86, 500); x.lineTo(74, 330); x.lineTo(60, 170);
    x.closePath(); x.fill();
    x.lineWidth = 14; x.strokeStyle = '#030303'; x.lineCap = 'round';
    x.beginPath(); x.moveTo(62, 172); x.quadraticCurveTo(14, 300, 30, 500); x.stroke();
    x.beginPath(); x.moveTo(194, 172); x.quadraticCurveTo(242, 300, 226, 500); x.stroke();
    x.fillStyle = '#f4f0d0'; x.shadowColor = '#fff7b0'; x.shadowBlur = 16;
    x.beginPath(); x.ellipse(108, 62, 7, 10, 0, 0, TAU); x.fill();
    x.beginPath(); x.ellipse(148, 62, 7, 10, 0, 0, TAU); x.fill();
    x.shadowBlur = 10;
    x.beginPath(); x.moveTo(84, 88); x.quadraticCurveTo(128, 138, 172, 88); x.quadraticCurveTo(128, 112, 84, 88); x.fill();
    x.shadowBlur = 0; x.strokeStyle = '#000'; x.lineWidth = 2;
    for (let i = 0; i < 9; i++) { const px = 96 + i * 8.5; x.beginPath(); x.moveTo(px, 96); x.lineTo(px, 112); x.stroke(); }
    cv.figure = c;
  }

  BR.tex = {
    wall() { once('wall', buildWall); return { map: tex(cv.wall, 1, 1), normal: tex(cv.wallN, 1, 1) }; },
    carpet(rep) { once('carpet', buildCarpet); return { map: tex(cv.carpet, rep, rep), normal: tex(cv.carpetN, rep, rep) }; },
    // quarter-tile offset in v centres the light troffers on whole ceiling tiles
    ceiling(rep) { once('ceiling', buildCeiling); return { map: tex(cv.ceiling, rep, rep, 0, 0.25), normal: tex(cv.ceilingN, rep, rep, 0, 0.25) }; },
    panel() { once('panel', buildPanel); return tex(cv.panel, 1, 1); },
    vent() { once('vent', buildVent); return tex(cv.vent, 1, 1); },
    outlet() { once('outlet', buildOutlet); return tex(cv.outlet, 1, 1); },
    box() { once('box', buildBox); return tex(cv.box, 1, 1); },
    stains() { once('stains', buildStains); return cv.stains.map((c) => { const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; }); },
    dust() { once('dust', buildDust); return new THREE.CanvasTexture(cv.dust); },
    figure() { once('figure', buildFigure); return new THREE.CanvasTexture(cv.figure); }
  };
})(window.BR);
