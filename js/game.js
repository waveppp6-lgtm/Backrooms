/* BACKROOMS — player, entity AI, input, HUD, main loop */
(function (BR) {
  const $ = (id) => document.getElementById(id);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const autoTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0 && matchMedia('(pointer:coarse)').matches);

  let renderer, scene, camera, world, flash, entity, playerBody = null, playerField = null, lastPT = '';
  let post = null, dust = null;
  let viewmodel = null, lastPitch = 0;
  let level = 0;                                       // which map of BR.themes the run is on
  let touchDevice = autoTouch;                         // control scheme: the player picks PC or mobile on the title screen
  let quality = touchDevice ? 'low' : 'high';
  let hadLock = false, dragLook = false, lastFrame = performance.now(), tAll = 0;

  const S = { mode: 'title', fuses: 0, battery: 100, stamina: 100, flashOn: true, tired: false, run: 0, alert: 0, hintT: 0, deadT: 0, danger: 0, bat0: 0 };
  const P = { x: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, bob: 0, bobPrev: 0, sprint: false, noise: 0, cr: false, crouch: 0, jy: 0, jv: 0, air: false, wantJump: false, camY: 0, landT: 0, takeH: 0 };
  const keys = {};
  let visited = new Uint8Array(BR.N * BR.N), mapT = 0, lastVisKey = '';
  const touch = { mx: 0, mz: 0, lookId: null, moveId: null, lx: 0, ly: 0, sx: 0, sy: 0, run: false };

  /* ---------- scene lifecycle ---------- */
  function disposeScene(sc) {
    if (!sc) return;
    sc.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }

  function makeEntity() {
    const model = BR.makeMonster();
    const sp = model.group;
    scene.add(sp);
    entity = { sprite: sp, model, hd: 0, px: null, pz: null, spd: 0, x: 0, z: 0, mode: 'wander', lose: 0, ni: null, nj: null, wfield: null, idle: 0, hasTarget: false };
  }
  // invisible body: draws nothing, but casts the player's shadow in the ceiling lights
  function makeBody(sc) {
    const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 1.35, 14), ghost);
    torso.position.y = 0.68;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), ghost);
    head.position.y = 1.56;
    [torso, head].forEach((m) => { m.castShadow = true; m.frustumCulled = false; });
    body.add(torso, head);
    sc.add(body);
    return body;
  }
  function placePlayer(spawn) {
    P.x = world.center(1); P.z = world.center(1);
    if (spawn) { P.x = spawn.x + (BR.net && BR.net.active ? (Math.random() - 0.5) * 0.9 : 0); P.z = spawn.z + (BR.net && BR.net.active ? (Math.random() - 0.5) * 0.9 : 0); }
    // start out looking down the longest open line instead of into the corner
    let bestRun = -1, bestDir = [0, 1];
    for (const [dx, dz] of DIRS) {
      let n = 0;
      while (n < 40 && !world.solid(1 + dx * (n + 1), 1 + dz * (n + 1))) n++;
      if (n > bestRun) { bestRun = n; bestDir = [dx, dz]; }
    }
    P.yaw = spawn ? spawn.yaw : Math.atan2(-bestDir[0], -bestDir[1]); P.pitch = 0; P.vx = P.vz = 0; P.jy = P.camY = P.jv = 0; P.air = false; P.landT = 0; P.takeH = 0;
  }

  function buildLevel() {
    if (surf) { disposeScene(surf.scene); surf = null; }
    disposeScene(scene);
    scene = new THREE.Scene();
    const theme = BR.themes[level] || BR.themes[0];
    scene.background = new THREE.Color(theme.bg);
    scene.fog = new THREE.FogExp2(theme.fog[0], theme.fog[1]);
    scene.add(camera);

    if (BR.net) BR.net.level = level;
    const seed = BR.net && BR.net.active ? BR.net.seed() : Math.floor(Math.random() * 1e9);
    world = BR.buildWorld(scene, seed, quality, theme);

    if (flash) { camera.remove(flash); if (flash.target) camera.remove(flash.target); }
    flash = new THREE.SpotLight(0xfff2cf, 0, 24, 0.46, 0.65, 1.4);
    flash.position.set(0.12, -0.08, 0.1);
    const target = new THREE.Object3D(); target.position.set(0, 0, -6);
    camera.add(flash); camera.add(target); flash.target = target;

    makeEntity();
    placeEntityFar();
    entity.sprite.position.set(entity.x, 0, entity.z);
    playerBody = makeBody(scene);
    placePlayer(world.spawn);
    dust = BR.makeDust(scene, quality);
    if (post) post.setScene(scene);
    playerField = null; lastPT = '';
    if (BR.net) BR.net.reset(scene);
    visited = new Uint8Array(BR.N * BR.N);
  }

  /* ---------- the drains: falling off the parkour course drops you underground; a ladder leads back up ---------- */
  let surf = null;
  const fadeTo = (v, ms) => { const f = $('fade'); f.style.transitionDuration = ms + 'ms'; f.style.opacity = v; };
  function inCourse() {
    const c = world.course && world.course.rect;
    if (!c) return false;
    const i = world.tile(P.x), j = world.tile(P.z);
    return i >= c.x0 - 1 && i <= c.x0 + c.w && j >= c.z0 - 1 && j <= c.z0 + c.h;
  }
  function startFall() {
    if (S.under || S.transition) return;
    S.transition = true;
    BR.audio.step(true); S.noiseT = Math.max(S.noiseT, 0.8);
    fadeTo(1, 350);
    setTimeout(() => { if (S.mode === 'play' || S.mode === 'pause') enterUnder(); else { S.transition = false; fadeTo(0, 200); } }, 400);
  }
  function enterUnder() {
    const th = BR.underTheme;
    surf = { scene, world, entity, playerBody, dust, visited, got: BR.net && BR.net.active ? BR.net.got.slice() : null };
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(th.bg); sc.fog = new THREE.FogExp2(th.fog[0], th.fog[1]);
    scene = sc; sc.add(camera);
    if (BR.net) BR.net.level = 100 + level;
    const seed = BR.net && BR.net.active ? BR.net.seed() : Math.floor(Math.random() * 1e9);
    world = BR.buildWorld(sc, seed, quality, th);
    makeEntity(); placeEntityFar(); entity.sprite.position.set(entity.x, 0, entity.z);
    playerBody = makeBody(sc);
    placePlayer(null);
    dust = BR.makeDust(sc, quality);
    if (post) post.setScene(sc);
    playerField = null; lastPT = ''; visited = new Uint8Array(BR.N * BR.N);
    if (BR.net && BR.net.active) BR.net.setLevel(100 + level);
    Object.assign(S, { under: true, transition: false, climbing: 0, alert: 0, danger: 0, invuln: 2.5, hasMap: S.hasMap });
    levelCard(th); hint('YOU FELL. FIND THE LADDER AND CLIMB BACK UP.', 6000);
    fadeTo(0, 1500);
  }
  function leaveUnder() {
    const b = surf; if (!b) { S.transition = false; fadeTo(0, 300); return; }
    surf = null;
    disposeScene(scene);
    scene = b.scene; world = b.world; entity = b.entity; playerBody = b.playerBody; dust = b.dust; visited = b.visited;
    scene.add(camera);
    if (post) post.setScene(scene);
    const p0 = world.platforms && world.platforms[0];
    if (p0) { P.x = p0.x0 - 1.3; P.z = (p0.z0 + p0.z1) / 2; P.yaw = -Math.PI / 2; } else { P.x = world.center(1); P.z = world.center(1); }
    P.pitch = 0; P.vx = P.vz = 0; P.jy = P.camY = P.jv = 0; P.air = false; P.landT = 0; P.takeH = 0;
    playerField = null; lastPT = '';
    placeEntityFar();
    if (BR.net) { BR.net.level = level; if (BR.net.active) { BR.net.setLevel(level); BR.net.restoreGot(b.got); } }
    Object.assign(S, { under: false, transition: false, climbing: 0, alert: 0, danger: 0, invuln: 2.5 });
    hint('BACK ON THE SURFACE.', 3000);
    fadeTo(0, 1100);
  }
  function nearLadder() { return world.isUnder && world.exit && Math.hypot(world.exit.x - P.x, world.exit.z - P.z) < 1.6; }
  function startClimb() {
    if (S.climbing || S.transition) return;
    S.climbing = 0.001; S.noiseT = Math.max(S.noiseT, 0.6); BR.audio.creak && BR.audio.creak();
  }

  function placeEntityFar() {
    const N = BR.N, cand = [];
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      if (world.grid[j][i] === 0 && world.dist[j * N + i] >= 30) cand.push([i, j]);
    }
    const c = cand.length ? cand[Math.floor(Math.random() * cand.length)] : [N - 2, N - 2];
    entity.x = world.center(c[0]); entity.z = world.center(c[1]);
    entity.ni = null; entity.hasTarget = false; entity.mode = 'wander'; entity.idle = 0; entity.px = null;
  }

  /* ---------- helpers ---------- */
  const PR = 0.33;                                    // player radius
  function hitsWall(x, z, r) {                        // circle vs wall blocks (bedroom blocks are walkable)
    const T = BR.TILE, i0 = Math.floor((x - r) / T), i1 = Math.floor((x + r) / T), j0 = Math.floor((z - r) / T), j1 = Math.floor((z + r) / T);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!world.pSolid(i, j)) continue;
      const cx = Math.max(i * T, Math.min(x, (i + 1) * T)), cz = Math.max(j * T, Math.min(z, (j + 1) * T));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
  function hitsBoxes(x, z, r) {                       // room partitions, beds, dressers, closed doors
    const bs = world.boxes;
    for (let k = 0; k < bs.length; k++) {
      const b = bs[k];
      if (b.door && b.door.t >= 0.05) continue;
      if (b.low && P.crouch > 0.55) continue;                // crawl holes: only a crouching player fits
      const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
  function hitsStatic(x, z, r) {                      // heavy furniture
    const cs = world.colliders;
    for (let k = 0; k < cs.length; k++) {
      const c = cs[k], dx = x - c.x, dz = z - c.z, rad = c.r + r;
      if (dx * dx + dz * dz < rad * rad) return true;
    }
    return false;
  }
  function blocked(x, z) { return hitsWall(x, z, PR) || hitsBoxes(x, z, PR) || hitsStatic(x, z, PR) || BR.hitsPlatform(world, x, z, PR, P.jy); }
  function unstick() {                                // never leave the player wedged inside something
    if (!blocked(P.x, P.z)) return;
    for (let r = 0.25; r <= 1.6; r += 0.25) for (let a = 0; a < 8; a++) {
      const x = P.x + Math.cos(a * Math.PI / 4) * r, z = P.z + Math.sin(a * Math.PI / 4) * r;
      if (!blocked(x, z)) { P.x = x; P.z = z; return; }
    }
  }
  function los(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), n = Math.ceil(d / 0.6);
    for (let i = 1; i < n; i++) {
      if (world.losSolid(world.tile(ax + dx * i / n), world.tile(az + dz * i / n))) return false;
    }
    return true;
  }

  /* chairs, cones, bins and plants slide when the player walks into them */
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  function moverFree(m, x, z) {
    if (hitsWall(x, z, m.r) || hitsBoxes(x, z, m.r) || hitsStatic(x, z, m.r)) return false;
    const ms = world.movers;
    for (let k = 0; k < ms.length; k++) {
      const o = ms[k]; if (o === m) continue;
      const dx = x - o.x, dz = z - o.z, rad = m.r + o.r;
      if (dx * dx + dz * dz < rad * rad) return false;
    }
    return true;
  }
  function pushMovers(dt) {
    const ms = world.movers;
    if (!ms || !ms.length) return;
    let pushed = false;
    for (let k = 0; k < ms.length; k++) {
      const m = ms[k], dx = m.x - P.x, dz = m.z - P.z, rad = m.r + PR;
      if (dx * dx + dz * dz >= rad * rad) continue;
      const dist = Math.sqrt(dx * dx + dz * dz) || 0.001, nx = dx / dist, nz = dz / dist, ov = rad - dist;
      const stuck = !moverFree(m, m.x, m.z);
      let tx = m.x + nx * ov, tz = m.z + nz * ov;
      if (!stuck && !moverFree(m, tx, tz)) {
        if (moverFree(m, m.x + nx * ov, m.z)) tz = m.z;                 // slide along a wall
        else if (moverFree(m, m.x, m.z + nz * ov)) tx = m.x;
        else { P.x -= nx * ov; P.z -= nz * ov; P.vx *= 0.5; P.vz *= 0.5; continue; }   // jammed: it pushes back
      }
      m.x = tx; m.z = tz;
      m.ry += (nx * P.vz - nz * P.vx) * dt * 0.8;                       // a little spin from the shove
      m.mesh.setMatrixAt(m.k, _m4.compose(_v.set(m.x, 0, m.z), _q.setFromEuler(_e.set(0, m.ry, 0)), _s.setScalar(m.s)));
      m.mesh.instanceMatrix.needsUpdate = true;
      pushed = true;
    }
    if (pushed) { P.noise = Math.max(P.noise, 8); BR.audio.scrape(); }
  }
  function nextFromField(f, i, j) {
    const N = BR.N; let bd = f[j * N + i], best = null;
    for (const [dx, dz] of DIRS) {
      const ni = i + dx, nj = j + dz;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const d = f[nj * N + ni];
      if (d >= 0 && d < bd) { bd = d; best = [ni, nj]; }
    }
    return best;
  }
  function moveToward(e, tx, tz, step) {
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d < 1e-4) return;
    const k = Math.min(step, d) / d;
    e.x += dx * k; e.z += dz * k;
  }
  function stepAlong(e, field, speed, dt) {
    const ci = world.tile(e.x), cj = world.tile(e.z);
    if (e.ni == null || Math.hypot(world.center(e.ni) - e.x, world.center(e.nj) - e.z) < 0.15) {
      const n = nextFromField(field, ci, cj);
      if (!n) { e.ni = null; return false; }
      if (world.roomAt(n[0], n[1])) { e.ni = null; return false; }   // rooms are off limits
      e.ni = n[0]; e.nj = n[1];
    }
    moveToward(e, world.center(e.ni), world.center(e.nj), speed * dt);
    return true;
  }

  /* ---------- HUD ---------- */
  function hint(text, ms) {
    const h = $('hint'); h.textContent = text; h.classList.add('on'); S.hintT = (ms || 3200) / 1000;
  }
  function fmtTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t % 1) * 30);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(Math.floor(m / 60))}:${p(m % 60)}:${p(s)}:${p(f)}`;
  }
  function updateHUD() {
    $('fuseN').textContent = S.fuses;
    $('stamFill').style.transform = `scaleX(${Math.max(0, S.stamina / 100)})`;
    $('stamFill').classList.toggle('low', S.tired || S.stamina < 25);
    $('batFill').style.transform = `scaleX(${Math.max(0, S.battery / 100)})`;
    $('batFill').classList.toggle('low', S.battery < 20);
    $('lightState').textContent = S.flashOn && S.battery > 0 ? 'LIGHT ON' : 'LIGHT OFF';
    $('tc').textContent = fmtTime(S.run);
    document.documentElement.style.setProperty('--danger', S.danger.toFixed(3));

    const ob = $('objective');
    if (world.isUnder) {
      ob.textContent = 'THE DRAINS  ·  FIND THE LADDER UP';
      $('compass').classList.remove('on');
    } else if (world.exit.open) {
      const d = Math.hypot(world.exit.x - P.x, world.exit.z - P.z);
      ob.textContent = `REACH THE EXIT  ·  ${Math.round(d)} M`;
      const ang = Math.atan2(world.exit.x - P.x, world.exit.z - P.z) + P.yaw + Math.PI;
      $('arrow').style.transform = `rotate(${(-ang * 180 / Math.PI).toFixed(1)}deg)`;
      $('compass').classList.add('on');
    } else {
      let nd = Infinity;
      world.items.forEach((it) => { if (it.kind === 'fuse' && !it.taken) nd = Math.min(nd, Math.hypot(it.x - P.x, it.z - P.z)); });
      ob.textContent = `${(world.theme || BR.themes[0]).name} · FUSES  ${S.fuses} / 3` + (isFinite(nd) ? `  ·  NEAREST ${Math.round(nd)} M` : '');
      $('compass').classList.remove('on');
    }
    if (S.med > 0) ob.textContent += `  ·  MEDKIT ×${S.med}`;
  }

  /* ---------- game flow ---------- */
  function showPanel(id) {
    if (id) { $('prompt').classList.remove('on'); S.promptText = ''; }
    ['pTitle', 'pPause', 'pDead', 'pWin'].forEach((p) => $(p).hidden = p !== id);
    $('overlay').classList.toggle('show', !!id);
  }

  let cardT = 0;
  function levelCard(over) {
    const th = over || BR.themes[level] || BR.themes[0], el = $('lvCard');
    $('lvName').textContent = th.name; $('lvTitle').textContent = th.title; $('lvSub').textContent = th.sub;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(cardT); cardT = setTimeout(() => el.classList.remove('on'), 4200);
  }

  function startRun(fresh) {
    BR.audio.start();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // typing in the menu must not eat game keys
    if (fresh) buildLevel();
    if (BR.net) { BR.net.markStart(); if (fresh && BR.net.active) BR.net.setLevel(level); }
    levelCard();
    if (fresh && surf) { disposeScene(surf.scene); surf = null; }
    fadeTo(0, 200);
    Object.assign(S, { under: false, transition: false, climbing: 0, mode: 'play', fuses: 0, battery: 100, stamina: 100, flashOn: true, tired: false, run: 0, alert: 0, deadT: 0, danger: 0, boost: 0, noiseT: 0, target: null, promptText: '', med: 0, invuln: 0, downT: 0, revP: 0, reviveLabel: '', typing: false, hasMap: false, mapOpen: false });
    $('scare').classList.remove('on');
    $('minimap').classList.remove('on'); $('slotMap').classList.remove('active'); specBanner(false); S.spec = null;
    showPanel(null);
    $('hud').classList.add('on');
    hint(touchDevice ? 'Find 3 fuses — one on a jump course, one behind a crawl hole (DUCK).' : 'WASD · SHIFT run · SPACE jump · C crouch · 3 fuses: one needs parkour, one is behind a crawl hole', 7000);
    if (!touchDevice) lockPointer();
  }

  function lockPointer() {
    const c = renderer.domElement;
    try {
      const p = c.requestPointerLock && c.requestPointerLock();
      if (p && p.catch) p.catch(() => { dragLook = true; });
    } catch (e) { dragLook = true; }
  }

  function pause() {
    if (S.mode !== 'play') return;
    S.mode = 'pause'; showPanel('pPause');
  }
  function resume() {
    if (S.mode !== 'pause') return;
    S.mode = 'play'; showPanel(null); if (!touchDevice) lockPointer();
  }

  function die() {
    S.mode = 'dying'; S.deadT = 0;
    $('prompt').classList.remove('on');
    BR.audio.scare();
    $('scare').classList.add('on');
    entity.model.front();
    document.exitPointerLock && document.exitPointerLock();
  }

  function win() {
    S.mode = 'won';
    document.exitPointerLock && document.exitPointerLock();
    $('winTime').textContent = fmtTime(S.run).slice(0, 8);
    $('winBat').textContent = Math.round(S.battery) + '%';
    const last = level >= BR.themes.length - 1, nx = BR.themes[level + 1];
    $('winH').textContent = last ? 'You noclipped out' : 'You found a way down';
    $('winLede').textContent = last ? 'The door opens onto daylight. Behind you the hum stops, then starts again for someone else.' : 'The exit opens onto ' + nx.name + ' — ' + nx.title + '. ' + nx.sub + '.';
    $('winKick').textContent = last ? 'Signal restored' : BR.themes[level].name + ' cleared';
    $('btnNext').hidden = last; $('btnAgain').hidden = !last;
    $('btnNext').textContent = last ? '' : 'Descend to ' + nx.name;
    showPanel('pWin');
    $('hud').classList.remove('on');
  }

  /* ---------- update ---------- */
  function updatePlayer(dt) {
    if (S.climbing) {                                   // climbing the ladder: locked in place, rising toward the hole
      S.climbing += dt; S.invuln = Math.max(S.invuln, 0.5);
      const k = Math.min(1, S.climbing / 2.4), ex = world.exit;
      P.x += (ex.x - P.x) * Math.min(1, dt * 4); P.z += (ex.z - P.z) * Math.min(1, dt * 4);
      P.vx = P.vz = 0; P.jy = k * 2.7; P.air = false; P.jv = 0; P.crouch = 0;
      P.bob += dt * 7;
      if (Math.floor(S.climbing / 0.32) !== Math.floor((S.climbing - dt) / 0.32)) BR.audio.step(false);
      if (k > 0.6 && !S.transition) { S.transition = true; fadeTo(1, 800); }
      if (k >= 1) { S.climbing = 0; leaveUnder(); }
      return;
    }
    let fx = 0, fz = 0;
    if (keys.KeyW || keys.ArrowUp) fz -= 1;
    if (keys.KeyS || keys.ArrowDown) fz += 1;
    if (keys.KeyA) fx -= 1;
    if (keys.KeyD) fx += 1;
    fx += touch.mx; fz += touch.mz;
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }

    const wantRun = (keys.ShiftLeft || keys.ShiftRight || touch.run) && len > 0.1;
    if (S.tired && S.stamina > 30) S.tired = false;
    P.cr = !!keys.KeyC && !P.air;
    P.crouch += ((P.cr ? 1 : 0) - P.crouch) * (1 - Math.exp(-10 * dt));
    if (P.wantJump) {
      P.wantJump = false;
      if (!P.air && !P.cr && S.stamina > 6 && !S.tired) { P.air = true; P.takeH = P.jy; P.jv = 4.3; S.stamina -= 7; S.noiseT = Math.max(S.noiseT, 0.25); }
    }
    {
      // vertical: floor, or the top of a parkour block under the feet (walking off an edge = falling)
      const g0 = BR.groundAt(world, P.x, P.z, P.jy + (P.air ? 0.05 : 0.24));
      if (!P.air && P.jy > g0 + 0.002) { P.air = true; P.takeH = P.jy; P.jv = 0; }
      if (P.air) {
        const before = P.jy;
        P.jv -= 14 * dt; P.jy += P.jv * dt;
        const g1 = BR.groundAt(world, P.x, P.z, before + 0.05);
        if (P.jv <= 0 && P.jy <= g1) {
          const hard = P.jv < -4;
          if (g1 === 0 && P.takeH > 0.25 && !S.under && inCourse()) startFall();
          P.jy = g1; P.jv = 0; P.air = false; P.landT = 0.28 + (hard ? 0.12 : 0);
          S.noiseT = Math.max(S.noiseT, hard ? 0.7 : 0.3); BR.audio.step(false);
        }
        if (P.jy > 1.55) { P.jy = 1.55; if (P.jv > 0) P.jv = 0; }       // the ceiling is 3.4 m up
      } else P.jy = g0;
    }
    P.sprint = wantRun && !S.tired && S.stamina > 0 && !P.cr;
    if (S.boost > 0) S.boost -= dt;
    if (P.sprint) {
      if (!(S.boost > 0)) { S.stamina -= 20 * dt; if (S.stamina <= 0) { S.stamina = 0; S.tired = true; } }
    } else S.stamina = Math.min(100, S.stamina + (len > 0.1 ? 11 : 18) * dt);

    const speed = (P.sprint ? (S.boost > 0 ? 6.1 : 5.4) : (S.tired ? 2.2 : 3.2)) * (1 - 0.5 * P.crouch);
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    const wx = (fx * cy + fz * sy) * speed;
    const wz = (-fx * sy + fz * cy) * speed;
    const a = 1 - Math.exp(-12 * dt);
    P.vx += (wx - P.vx) * a; P.vz += (wz - P.vz) * a;

    let nx = P.x + P.vx * dt;
    if (!blocked(nx, P.z)) P.x = nx; else P.vx = 0;
    let nz = P.z + P.vz * dt;
    if (!blocked(P.x, nz)) P.z = nz; else P.vz = 0;

    const sp = Math.hypot(P.vx, P.vz);
    P.noise = P.sprint ? 18 : (sp > 0.5 ? (P.cr ? 2 : 5) : 0);
    if (S.noiseT > 0) { S.noiseT -= dt; P.noise = Math.max(P.noise, 12); }       // doors and drawers are loud
    unstick();
    pushMovers(dt);
    P.bob += sp * dt * 2.1;
    if (Math.floor(P.bob / Math.PI) !== Math.floor(P.bobPrev / Math.PI) && sp > 0.5) BR.audio.step(P.sprint);
    P.bobPrev = P.bob;

    // flashlight
    if (S.flashOn && S.battery > 0) S.battery = Math.max(0, S.battery - 0.75 * dt);
    let fi = S.flashOn && S.battery > 0 ? 1.45 : 0;
    if (S.battery > 0 && S.battery < 18 && S.flashOn) fi *= (Math.random() < 0.25 ? 0.1 : 0.7);
    flash.intensity = fi;

    // pickups + exit
    world.items.forEach((it, idx) => {
      if (it.taken) return;
      if (Math.hypot(it.x - P.x, it.z - P.z) < 1.25 && P.jy >= (it.minY || 0)) {
        it.taken = true; it.mesh.visible = false; if (BR.net) BR.net.localPick(idx);
        if (it.kind === 'fuse') {
          S.fuses++; BR.audio.pickup(); S.alert = 7;
          if (S.fuses >= 3) { world.openExit(); BR.audio.door(); hint('THE EXIT HAS POWER. FOLLOW THE ARROW.', 5200); }
          else hint(`FUSE ${S.fuses} / 3 — THE LIGHTS SURGE. IT KNOWS.`, 4200);
        } else if (it.kind === 'map') {
          S.hasMap = true; BR.audio.pickup(); toggleMap(true);
          hint(touchDevice ? 'MAP — TAP THE MAP SLOT TO HIDE OR SHOW IT' : 'MAP — PRESS 1 TO TAKE IT OUT OR PUT IT AWAY', 5000);
        } else if (it.kind === 'medkit') {
          S.med++; BR.audio.pickup();
          hint(BR.net && BR.net.active ? 'MEDKIT — HOLD E NEXT TO A DOWNED TEAMMATE' : 'MEDKIT — IT WILL SAVE YOU ONCE', 3600);
        } else {
          S.battery = Math.min(100, S.battery + 40); BR.audio.battery(); hint('BATTERY +40%', 1800);
        }
      }
    });
    if (world.exit.open && Math.hypot(world.exit.x - P.x, world.exit.z - P.z) < 1.5) win();
    else if (!world.isUnder && !world.exit.open && Math.hypot(world.exit.x - P.x, world.exit.z - P.z) < 1.6 && S.hintT <= 0) hint('NO POWER. THE DOOR WON\'T MOVE.', 2200);

    if (S.invuln > 0) S.invuln -= dt;
    updateRevive(dt);
    // what can be used right now (door, bed, drawer)?
    S.target = world.interactAt(P.x, P.z, -Math.sin(P.yaw), -Math.cos(P.yaw));
    const label = S.reviveLabel ? S.reviveLabel : S.target ? (touchDevice ? 'USE · ' : '[E] ') + world.promptFor(S.target) : nearLadder() ? (touchDevice ? 'USE · ' : '[E] ') + 'CLIMB THE LADDER' : '';
    if (label !== S.promptText) {
      S.promptText = label;
      const pr = $('prompt'); pr.textContent = label; pr.classList.toggle('on', !!label);
    }
  }

  function updateRevive(dt) {
    S.reviveLabel = '';
    const net = BR.net;
    if (!net || !net.active || net.reviving()) return;
    let tgt = null, bd = 2.3;
    for (const m of net.mates) if (m.d === 1) { const dd = Math.hypot(m.x - P.x, m.z - P.z); if (dd < bd) { bd = dd; tgt = m; } }
    if (!tgt) { S.revP = 0; net.setRevive(null, 0); return; }
    if (S.med <= 0) { S.revP = 0; net.setRevive(null, 0); S.reviveLabel = tgt.name.toUpperCase() + ' IS DOWN — FIND A MEDKIT'; return; }
    if (keys.KeyE) S.revP = Math.min(1, S.revP + dt / 3); else S.revP = Math.max(0, S.revP - dt * 2);
    net.setRevive(tgt.id, S.revP);
    if (S.revP >= 1) {
      S.med--; S.revP = 0; net.finishRevive(tgt.id); BR.audio.pickup();
      hint('REVIVED ' + tgt.name.toUpperCase(), 2800);
      return;
    }
    S.reviveLabel = (touchDevice ? 'HOLD USE · ' : 'HOLD [E] · ') + 'REVIVE ' + tgt.name.toUpperCase() + (S.revP > 0 ? '  ' + Math.round(S.revP * 100) + '%' : '');
  }

  // caught by the entity: solo players burn a medkit if they have one, co-op players go down while someone else is still standing
  function caught() {
    if (S.invuln > 0) return;
    if (BR.net && BR.net.active) {
      if (BR.net.mates.some((m) => m.d === 0)) goDown(); else die();
      return;
    }
    if (S.med > 0) {
      S.med--; S.invuln = 4; placeEntityFar(); BR.audio.pickup();
      hint('MEDKIT USED — IT LET GO.', 3600);
      return;
    }
    die();
  }
  function goDown() {
    S.mode = 'downed'; S.downT = 90; S.target = null; S.reviveLabel = '';
    P.vx = P.vz = 0; placeEntityFar(); entity.mode = 'wander';
    $('prompt').classList.remove('on'); S.promptText = '';
    BR.audio.scare();
    hint('YOU ARE DOWN — A TEAMMATE WITH A MEDKIT CAN GET YOU UP', 6500);
  }
  function stand() {
    S.mode = 'play'; S.invuln = 5; S.downT = 0;
    hint('BACK ON YOUR FEET. RUN.', 3200);
  }
  /* ---------- spectating teammates ---------- */
  const specTargets = () => (BR.net && BR.net.active ? BR.net.mates.filter((m) => m.d === 0) : []);
  function specCycle(dir) {
    const l = specTargets(); if (!l.length) return;
    let i = l.findIndex((m) => m.id === S.spec);
    i = i < 0 ? 0 : (i + dir + l.length) % l.length;
    S.spec = l[i].id; S.specOwn = false;
  }
  // put the camera where the followed teammate's eyes are; null if nobody can be followed
  function specCamera() {
    const l = specTargets();
    if (!l.some((m) => m.id === S.spec)) S.spec = l[0] ? l[0].id : null;
    const v = S.spec ? BR.net.view(S.spec) : null;
    if (!v) return null;
    camera.position.set(v.x, 1.65 - 0.68 * v.cr + v.j, v.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(v.p, v.yaw, 0);
    S.specLight = v.f ? 1.45 : 0;
    specMonster(v);
    return v;
  }
  // while watching a teammate, show the thing that is chasing THEM (their own entity, sent through presence)
  let specMon = null, specMonScene = null, curDt = 0.016, specMonPh = 0;
  function specMonster(v) {
    if (!specMon || specMonScene !== scene) { specMon = BR.makeMonster(); specMonScene = scene; scene.add(specMon.group); }
    const en = v && v.en;
    specMon.group.visible = !!en;
    if (!en) return;
    specMon.group.position.set(en[0], 0, en[1]);
    let da = en[2] - (specMon.hd || 0); da = Math.atan2(Math.sin(da), Math.cos(da));
    specMon.hd = (specMon.hd || 0) + da * Math.min(1, curDt * 12);
    specMon.group.rotation.y = specMon.hd;
    specMon.update(curDt, { speed: en[3], hunting: !!en[4] });
  }
  function specMonsterOff() { if (specMon) specMon.group.visible = false; }
  function specBanner(on, text, help) {
    $('spec').classList.toggle('on', on);
    if (on) { $('specName').textContent = text; $('specHelp').textContent = help; }
  }
  function endNow() {                                  // give up: straight to the end screen, no lunge
    if (S.mode !== 'downed' && S.mode !== 'spectate') return;
    specBanner(false);
    $('deadTime').textContent = fmtTime(S.run).slice(0, 8);
    $('deadFuse').textContent = S.fuses + ' / 3';
    document.exitPointerLock && document.exitPointerLock();
    showPanel('pDead'); $('hud').classList.remove('on'); S.mode = 'dead';
  }
  function lose() {                                    // bled out, but the team is still alive: keep watching
    S.mode = 'spectate'; S.specOwn = false;
    hint('YOU WERE LOST — WATCH YOUR TEAM. R TO GIVE UP', 5000);
    BR.audio.scare();
  }

  function updateDowned(dt) {
    S.downT -= dt;
    const alive = specTargets().length > 0;
    if (BR.net && BR.net.reviveP >= 1) { specBanner(false); stand(); return; }
    if (!alive) { specBanner(false); die(); return; }
    if (S.downT <= 0) { specBanner(false); lose(); return; }
    const pr = BR.net.reviveP;
    let v = null;
    if (!S.specOwn) v = specCamera();
    if (!v) {
      S.specLight = 0;
      camera.position.set(P.x, 0.42, P.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(0.35 + Math.sin(tAll * 0.9) * 0.03, P.yaw, 0.5);
    }
    const who = v ? (specTargets().find((m) => m.id === S.spec) || {}).name || '' : '';
    $('objective').textContent = `DOWN · ${Math.ceil(S.downT)} S` + (pr > 0 ? `  ·  BEING REVIVED ${Math.round(pr * 100)}%` : '');
    specBanner(true, v ? 'WATCHING ' + who.toUpperCase() : 'YOUR VIEW', 'A / D switch · V your view · R give up');
  }
  function updateSpectate(dt) {
    const l = specTargets();
    if (!l.length) { specBanner(false); endNow(); return; }
    const v = specCamera();
    const who = (l.find((m) => m.id === S.spec) || {}).name || '';
    $('objective').textContent = 'LOST · SPECTATING';
    specBanner(true, v ? 'WATCHING ' + who.toUpperCase() : '…', 'A / D switch · R give up');
  }

  function applyLoot(kind) {
    if (kind === 'battery') { S.battery = Math.min(100, S.battery + 35); BR.audio.battery(); hint('FOUND A BATTERY  +35%', 2400); }
    else if (kind === 'water') { S.stamina = 100; S.tired = false; BR.audio.pickup(); hint('ALMOND WATER  ·  STAMINA RESTORED', 2800); }
    else if (kind === 'drink') { S.boost = 18; BR.audio.pickup(); hint('ENERGY DRINK  ·  RUN FASTER, NEVER TIRE', 2800); }
    else hint('NOTHING BUT DUST.', 1800);
  }
  function useTarget() {
    if (S.mode === 'play' && !S.target && nearLadder()) { startClimb(); return; }
    if (S.mode !== 'play' || !S.target) return;
    const res = world.use(S.target, P.x, P.z);
    if (!res) return;
    if (res.sound === 'door') BR.audio.creak();
    else if (res.sound === 'drawer') BR.audio.drawer();
    else if (res.sound === 'rustle') BR.audio.rustle();
    if (res.noise) S.noiseT = res.noise;
    if (res.msg) hint(res.msg, 1800);
    if (res.sound === 'drawer' || res.sound === 'rustle') applyLoot(res.loot);
  }

  function updateEntity(dt) {
    const e = entity, dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz);
    const pRoom = world.roomAt(world.tile(P.x), world.tile(P.z));   // inside a room the entity can neither sense nor reach the player
    const sees = !pRoom && d < 16 && los(e.x, e.z, P.x, P.z);
    const hears = !pRoom && P.noise > 0 && d < P.noise;
    if (S.alert > 0) S.alert -= dt;

    if (!pRoom && ((sees && (d < 9 || S.flashOn)) || hears || d < 3 || S.alert > 0)) {
      if (e.mode !== 'hunt') { BR.audio.flicker(); if (sees) BR.audio.roar(Math.max(0.15, 1 - d / 24)); }
      e.mode = 'hunt'; e.lose = 6;
    } else if (e.mode === 'hunt') {
      e.lose -= dt;
      if (e.lose <= 0) { e.mode = 'wander'; e.hasTarget = false; e.ni = null; }
    }

    const fi = pRoom ? pRoom.def.oi : world.tile(P.x), fj = pRoom ? pRoom.def.oj : world.tile(P.z);
    const pt = fi + ',' + fj;
    if (pt !== lastPT) { lastPT = pt; playerField = BR.distanceField(world.grid, fi, fj); }

    if (e.mode === 'hunt') {
      e.idle = 0;
      const speed = (3.0 + 0.38 * S.fuses + (sees ? 0.35 : 0)) * (world.theme ? world.theme.entity : 1);
      if (sees && d < 7 && !pRoom) moveToward(e, P.x, P.z, speed * dt);
      else if (!stepAlong(e, playerField, speed, dt) && !pRoom) moveToward(e, P.x, P.z, speed * dt);
    } else {
      e.idle += dt;
      if (!e.hasTarget || !stepAlong(e, e.wfield, 1.5, dt)) {
        const N = BR.N, ci = world.tile(e.x), cj = world.tile(e.z);
        let tries = 0, pick = null;
        while (tries++ < 60) {
          const i = 1 + Math.floor(Math.random() * (N - 2)), j = 1 + Math.floor(Math.random() * (N - 2));
          if (world.grid[j][i] === 0 && Math.abs(i - ci) + Math.abs(j - cj) > 12) { pick = [i, j]; break; }
        }
        if (pick) { e.wfield = BR.distanceField(world.grid, pick[0], pick[1]); e.hasTarget = true; e.ni = null; }
      }
      // too far for too long: slip back in somewhere nearer, out of sight
      if (e.idle > 28 && d > 32 && !sees && playerField) {
        const N = BR.N, c = [];
        for (let k = 0; k < N * N; k++) { const v = playerField[k]; if (v >= 16 && v <= 26) c.push(k); }
        if (c.length) {
          const k = c[Math.floor(Math.random() * c.length)];
          const ti = k % N, tj = Math.floor(k / N);
          if (!los(world.center(ti), world.center(tj), P.x, P.z)) {
            e.x = world.center(ti); e.z = world.center(tj); e.ni = null; e.hasTarget = false; e.idle = 0; e.px = null;
          }
        }
      }
    }

    // heading + animation: it faces where it is going, or at you when it has you in sight
    if (e.px === null) { e.px = e.x; e.pz = e.z; }
    const mvx = e.x - e.px, mvz = e.z - e.pz, mv = Math.hypot(mvx, mvz);
    e.px = e.x; e.pz = e.z;
    e.spd += (Math.min(9, mv / Math.max(dt, 1e-3)) - e.spd) * Math.min(1, dt * 8);
    let want = e.hd;
    if (sees && !pRoom && d < 12) want = Math.atan2(dx, dz); else if (mv > 0.002) want = Math.atan2(mvx, mvz);
    let da = want - e.hd; da = Math.atan2(Math.sin(da), Math.cos(da));
    e.hd += da * Math.min(1, dt * (e.mode === 'hunt' ? 12 : 5));
    e.sprite.position.set(e.x, 0, e.z);
    e.sprite.rotation.y = e.hd;
    e.model.update(dt, { speed: e.spd, hunting: e.mode === 'hunt', onStep: (v) => BR.audio.mstep(v * Math.max(0, 1 - d / 26)) });
    S.danger = Math.max(0, Math.min(1, 1 - d / 22)) * (e.mode === 'hunt' ? 1 : 0.55);

    if (!pRoom && d < 1.05) caught();
  }

  function updateCamera(dt, t) {
    const sp = Math.hypot(P.vx, P.vz);
    const mv = Math.min(1, sp / 3);                 // 0 when still, 1 at walking pace
    const amp = mv * (P.sprint ? 2.3 : 1) * (1 - 0.4 * P.crouch) * (P.air ? 0.2 : 1);          // running shakes much harder
    // one vertical bounce per footstep (bob advances PI per step), side sway every two steps
    const bobY = Math.sin(P.bob * 2) * 0.05 * amp;
    const bobX = Math.cos(P.bob) * 0.035 * amp;
    P.camY += (P.jy - P.camY) * (P.air ? 1 : 1 - Math.exp(-16 * dt));                // stepping onto a block glides instead of popping
    P.landT = Math.max(0, (P.landT || 0) - dt);
    const dip = Math.sin(Math.min(1, P.landT / 0.4) * Math.PI) * 0.085;                // knees bend on landing
    camera.position.set(P.x + Math.cos(P.yaw) * bobX, 1.65 - 0.68 * P.crouch + P.camY + bobY - dip, P.z - Math.sin(P.yaw) * bobX);
    camera.rotation.order = 'YXZ';
    const shake = S.danger * S.danger * 0.012;
    const nod = Math.sin(P.bob * 2 + 0.6) * 0.014 * amp;      // head nods with each step
    const roll = Math.cos(P.bob) * 0.018 * amp;               // body lean left/right
    const jitter = P.sprint ? (Math.random() - 0.5) * 0.004 : 0;
    camera.rotation.set(P.pitch + nod + (Math.random() - 0.5) * shake + jitter,
      P.yaw + Math.cos(P.bob) * 0.008 * amp + (Math.random() - 0.5) * shake,
      Math.sin(t * 0.6) * 0.004 + roll + S.danger * Math.sin(t * 11) * 0.008);
    viewmodel.update(dt, { visible: S.mode === 'play' && !S.mapOpen, mv, sprint: P.sprint, crouch: P.crouch, air: P.air, bob: P.bob, yaw: P.yaw, pitchV: (P.pitch - lastPitch) / Math.max(dt, 1e-3) * 0.05 });
    lastPitch = P.pitch;
    const fov = 72 + (P.sprint ? 7 : 0) + S.danger * 4;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-6 * dt)); camera.updateProjectionMatrix(); }
  }

  function dyingCam(dt, t) {
    S.deadT += dt;
    const e = entity;
    const yawTo = Math.atan2(-(e.x - P.x), -(e.z - P.z));
    let dy = yawTo - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    P.yaw += dy * Math.min(1, dt * 14);
    P.pitch += (0.12 - P.pitch) * Math.min(1, dt * 10);
    // lunge into the lens
    const k = Math.min(1, S.deadT / 0.35);
    const fwdX = -Math.sin(P.yaw), fwdZ = -Math.cos(P.yaw);
    e.sprite.position.set(P.x + fwdX * (1.9 - k * 1.25), 0, P.z + fwdZ * (1.9 - k * 1.25));
    e.sprite.rotation.y = Math.atan2(P.x - e.sprite.position.x, P.z - e.sprite.position.z);
    e.model.update(dt, { speed: 4 * (1 - k), hunting: true, lunge: k });
    camera.position.set(P.x, 1.65 + Math.sin(t * 60) * 0.03, P.z);
    camera.rotation.set(P.pitch, P.yaw, Math.sin(t * 45) * 0.05);
    if (S.deadT > 1.6 && $('pDead').hidden) {
      $('deadTime').textContent = fmtTime(S.run).slice(0, 8);
      $('deadFuse').textContent = S.fuses + ' / 3';
      showPanel('pDead'); $('hud').classList.remove('on'); S.mode = 'dead';
    }
  }

  /* ---------- grain overlay ---------- */
  let gctx, gimg, gframe = 0;
  function grain() {
    if ((gframe++ & 1) || !gctx) return;
    const d = gimg.data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    gctx.putImageData(gimg, 0, 0);
  }

  /* ---------- inventory + map ---------- */
  function toggleMap(force) {
    if (!S.hasMap) { hint('FIND THE MAP IN THE STARTING ROOM', 2400); return; }
    S.mapOpen = typeof force === 'boolean' ? force : !S.mapOpen;
    $('minimap').classList.toggle('on', S.mapOpen);
    $('slotMap').classList.toggle('active', S.mapOpen);
    if (S.mapOpen) drawMap();
  }
  function useSlot(n) {
    if (n === 1) toggleMap();
    else if (n === 2) {
      if (S.med <= 0) hint('NO MEDKIT', 1600);
      else hint(BR.net && BR.net.active ? 'HOLD E NEXT TO A DOWNED TEAMMATE TO USE IT' : 'IT IS USED AUTOMATICALLY WHEN IT CATCHES YOU', 3200);
    }
  }
  function updateHotbar() {
    $('slotMap').classList.toggle('have', S.hasMap);
    $('slotMed').classList.toggle('have', S.med > 0);
    const m = $('medN'); if (m.textContent !== String(S.med)) m.textContent = S.med;
  }
  function revealAround(x, z, r) {
    const N = BR.N, ci = world.tile(x), cj = world.tile(z);
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      if ((i - ci) * (i - ci) + (j - cj) * (j - cj) <= r * r + 1) visited[j * N + i] = 1;
    }
  }
  function drawMap() {
    const cv = $('minimap'), c = cv.getContext('2d'), N = BR.N, T = BR.TILE, px = cv.width / N;
    c.fillStyle = '#0b0a05'; c.fillRect(0, 0, cv.width, cv.height);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!visited[j * N + i]) continue;
      const room = world.roomAt(i, j), solid = world.grid[j][i] === 1;
      c.fillStyle = room ? '#5b5a3a' : solid ? '#2a2614' : '#8d8454';
      c.fillRect(i * px, j * px, px + 0.5, px + 0.5);
    }
    // the exit, once it has power and has been seen
    if (world.exit && world.exit.open) {
      const ei = world.tile(world.exit.x), ej = world.tile(world.exit.z);
      c.fillStyle = '#5dff9a'; c.fillRect(ei * px - 1, ej * px - 1, px + 2, px + 2);
    }
    // teammates
    if (BR.net && BR.net.active) BR.net.mates.forEach((m) => {
      const x = m.x / T * px, y = m.z / T * px;
      c.fillStyle = `hsl(${BR.net.hueOf(m.id)},75%,58%)`;
      c.beginPath(); c.arc(x, y, 4, 0, 6.283); c.fill();
      c.strokeStyle = m.d ? '#ff8040' : '#000'; c.lineWidth = 1.5; c.stroke();
      c.font = '600 9px "IBM Plex Mono", monospace'; c.textAlign = 'center'; c.fillStyle = '#fff3b8';
      c.fillText(m.name.slice(0, 6).toUpperCase(), x, y - 7);
    });
    // you: an arrow pointing the way you face
    const mx = P.x / T * px, my = P.z / T * px, a = Math.atan2(-Math.cos(P.yaw), -Math.sin(P.yaw));
    c.save(); c.translate(mx, my); c.rotate(a);
    c.fillStyle = '#ffffff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(7, 0); c.lineTo(-5, 4.5); c.lineTo(-2.5, 0); c.lineTo(-5, -4.5); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.fillStyle = '#d8c452'; c.font = '600 9px "IBM Plex Mono", monospace'; c.textAlign = 'left';
    c.fillText('YOU', 5, cv.height - 6);
  }
  function updateMap(dt) {
    revealAround(P.x, P.z, 3);
    if (BR.net && BR.net.active) BR.net.mates.forEach((m) => revealAround(m.x, m.z, 2));      // the team shares what it has seen
    mapT -= dt;
    if (S.mapOpen && mapT <= 0) { mapT = 0.12; drawMap(); }
  }

  /* ---------- fullscreen ---------- */
  function toggleFullscreen() {
    const el = document.documentElement;
    const on = document.fullscreenElement || document.webkitFullscreenElement;
    const btns = [$('btnFs'), $('btnFs2')];
    const label = (t) => btns.forEach((b) => { if (b) b.textContent = t; });
    try {
      const p = on ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
        : (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      if (p && p.catch) p.catch(() => { label('Fullscreen blocked · F11'); });
    } catch (e) { label('Fullscreen blocked · F11'); }
  }
  function fsChanged() {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    [$('btnFs'), $('btnFs2')].forEach((b) => { if (b) b.textContent = on ? 'Exit fullscreen' : 'Fullscreen'; });
    setTimeout(resize, 60);
  }

  /* ---------- chat (co-op) ---------- */
  function addSys(text, color) {
    const log = $('chatLog');
    const line = document.createElement('div'); line.className = 'line sys';
    line.textContent = text; if (color) line.style.color = color;
    log.appendChild(line);
    while (log.children.length > 8) log.removeChild(log.firstChild);
    setTimeout(() => line.classList.add('old'), 9000);
  }
  function addChat(name, text, self) {
    const log = $('chatLog');
    const line = document.createElement('div'); line.className = 'line' + (self ? ' me' : '');
    const b = document.createElement('b'); b.textContent = name.toUpperCase() + ' '; line.appendChild(b);
    line.appendChild(document.createTextNode(text));
    log.appendChild(line);
    while (log.children.length > 8) log.removeChild(log.firstChild);
    setTimeout(() => line.classList.add('old'), 9000);
  }
  function openChat() {
    if (S.typing) return;
    if (!BR.net || !BR.net.active) { hint('CHAT IS FOR CO-OP — JOIN A CODE FROM THE MENU', 2600); return; }
    S.typing = true;
    for (const k in keys) keys[k] = false;
    $('chat').classList.add('open');
    const inp = $('chatIn'); inp.hidden = false; inp.value = ''; inp.focus();
  }
  function closeChat(send) {
    const inp = $('chatIn');
    const text = inp.value.trim().slice(0, 120);
    if (send && text && BR.net && BR.net.active) { BR.net.say(text); addChat(BR.net.nick, text, true); }
    inp.value = ''; inp.hidden = true; inp.blur();
    $('chat').classList.remove('open');
    S.typing = false; S.chatClosedAt = performance.now();
  }

  /* ---------- co-op ---------- */
  const lightT = () => (BR.net && BR.net.active ? (Date.now() / 1000) % 4000 : tAll);   // same flicker for everyone in a co-op level
  let netSig = '';
  function netUpdate(dt) {
    const list = BR.net && BR.net.active ? BR.net.tick(dt, P, S, world, scene) : null;
    const sig = list ? list.map((p) => p.name + (p.d ? 'x' + p.d : '')).join('|') : '';
    if (sig === netSig) return;
    netSig = sig;
    const el = $('netList');
    el.textContent = '';
    if (!list) return;
    const head = document.createElement('div'); head.textContent = 'CO-OP · ' + BR.net.code.toUpperCase() + ' · ' + (list.length + 1) + ' IN LEVEL'; el.appendChild(head);
    list.forEach((p) => { const d = document.createElement('div'); d.innerHTML = '<b></b>'; d.firstChild.textContent = p.name; if (p.d) d.firstChild.className = 'dead'; if (p.d === 1) d.firstChild.textContent += ' (DOWN)'; el.appendChild(d); });
  }
  if (BR.net) BR.net.handlers = {
    remotePick(idx) {
      const it = world && world.items[idx];
      if (!it || it.taken) return;
      it.taken = true; it.mesh.visible = false;
      if (it.kind === 'fuse') {
        S.fuses++; BR.audio.pickup();
        if (S.fuses >= 3) { world.openExit(); BR.audio.door(); hint('A TEAMMATE FOUND THE LAST FUSE. THE EXIT HAS POWER.', 5200); }
        else hint(`A TEAMMATE FOUND A FUSE — ${S.fuses} / 3`, 3600);
      }
    },
    chat(name, text) { addChat(name, text, false); BR.audio.click && BR.audio.click(); },
    joined(name) {
      const early = BR.net.joinedAt && Date.now() - BR.net.joinedAt < 3000;
      addSys('● ' + name + (early ? ' is already here' : ' joined the game'), '#ffe27a');
      BR.audio.click && BR.audio.click();
    },
    left(name) { addSys('● ' + name + ' left the game', '#ff9a7a'); },
    died(name, d) { hint(d === 1 ? name.toUpperCase() + ' IS DOWN — BRING A MEDKIT' : name.toUpperCase() + ' WAS TAKEN.', 3800); },
    up(name) { hint(name.toUpperCase() + ' IS BACK UP', 2400); }
  };

  if (BR.net) BR.net.itemKind = (i) => (world && world.items[i] ? world.items[i].kind : null);

  /* ---------- main loop ---------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now; tAll += dt;
    if (S.mode !== 'play' && viewmodel) viewmodel.root.visible = false;

    if (S.mode === 'play') {
      S.run = BR.net && BR.net.active ? BR.net.runTime(S.run + dt) : S.run + dt;
      updatePlayer(dt);
      if (S.mode === 'play') updateEntity(dt);
      if (S.mode === 'play') updateCamera(dt, tAll);
      world.updateLights(lightT(), P.x, P.z, S.danger * 0.85);
      BR.audio.update(dt, S.danger, S.stamina / 100, P.sprint, !!world.roomAt(world.tile(P.x), world.tile(P.z)));
      updateHUD(); updateHotbar(); updateMap(dt);
      if (S.hintT > 0) { S.hintT -= dt; if (S.hintT <= 0) $('hint').classList.remove('on'); }
    } else if (S.mode === 'downed') {
      S.run = BR.net && BR.net.active ? BR.net.runTime(S.run + dt) : S.run + dt;
      updateDowned(dt); updateMap(dt);
      world.updateLights(lightT(), camera.position.x, camera.position.z, 0.5);
      BR.audio.update(dt, 0.3, S.stamina / 100, false);
      if (S.hintT > 0) { S.hintT -= dt; if (S.hintT <= 0) $('hint').classList.remove('on'); }
    } else if (S.mode === 'spectate') {
      S.run = BR.net && BR.net.active ? BR.net.runTime(S.run + dt) : S.run + dt;
      updateSpectate(dt);
      world.updateLights(lightT(), camera.position.x, camera.position.z, 0.3);
      BR.audio.update(dt, 0, 1, false, false);
      if (S.hintT > 0) { S.hintT -= dt; if (S.hintT <= 0) $('hint').classList.remove('on'); }
    } else if (S.mode === 'dying') {
      dyingCam(dt, tAll);
      world.updateLights(lightT(), P.x, P.z, 1);
    } else if (S.mode === 'title' || S.mode === 'pause' || S.mode === 'dead' || S.mode === 'won') {
      // slow drift behind the menu
      const t = tAll * 0.12;
      camera.position.set(P.x, 1.65, P.z);
      camera.rotation.set(0, P.yaw + Math.sin(t) * 0.5, 0);
      world.updateLights(lightT(), P.x, P.z, 0.1);
    }
    curDt = dt;
    const watching = S.mode === 'spectate' || (S.mode === 'downed' && !S.specOwn && S.spec);
    if (!watching) specMonsterOff();
    if (entity) entity.sprite.visible = !(watching && S.mode !== 'dying');
    if (BR.net) BR.net.entityState = entity ? [Math.round(entity.x * 10) / 10, Math.round(entity.z * 10) / 10, Math.round((entity.hd || 0) * 100) / 100, Math.round(entity.spd * 10) / 10, entity.mode === 'hunt' ? 1 : 0] : null;
    if (BR.net) BR.net.spec = (S.mode === 'spectate' || (S.mode === 'downed' && !S.specOwn)) ? S.spec : null;
    if (flash && S.mode !== 'play') flash.intensity = (S.mode === 'downed' || S.mode === 'spectate') ? (S.specLight || 0) : 0;
    world.animate(lightT());
    netUpdate(dt);
    if (playerBody) playerBody.position.set(P.x, 0, P.z);
    if (dust) dust.update(P.x, P.z, dt, tAll);
    grain();
    if (post && quality === 'high') {
      try { post.render(tAll, S.danger); } catch (err) { post = null; renderer.render(scene, camera); }
    } else renderer.render(scene, camera);
  }

  /* ---------- input ---------- */
  function bindInput() {
    addEventListener('keydown', (e) => {
      keys[e.code] = true;
      if (e.code === 'KeyF' && !e.repeat && S.mode === 'play') { S.flashOn = !S.flashOn; BR.audio.click(); }
      if (e.code === 'KeyE' && !e.repeat && !S.reviveLabel) useTarget();
      if (e.code === 'Space' && !e.repeat && S.mode === 'play') P.wantJump = true;
      if (e.code === 'KeyG' && !e.repeat) toggleFullscreen();
      if (e.code === 'Digit1' && !e.repeat && S.mode === 'play') useSlot(1);
      if (e.code === 'Digit2' && !e.repeat && S.mode === 'play') useSlot(2);
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && (S.mode === 'play' || S.mode === 'downed' || S.mode === 'spectate')) { e.preventDefault(); openChat(); }
      if ((S.mode === 'downed' || S.mode === 'spectate') && !S.typing) {
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') specCycle(-1);
        if (e.code === 'KeyD' || e.code === 'ArrowRight') specCycle(1);
        if (e.code === 'KeyV' && S.mode === 'downed') S.specOwn = !S.specOwn;
        if (e.code === 'KeyR' && !e.repeat) endNow();
      }
      if (e.code === 'KeyM') { BR.audio.setMuted(!BR.audio.isMuted()); $('muteBtn').textContent = BR.audio.isMuted() ? 'SOUND OFF' : 'SOUND ON'; }
      if (e.code === 'Escape' && S.mode === 'play') pause();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ShiftLeft'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { keys[e.code] = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (S.mode === 'play') pause(); });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === renderer.domElement;
      if (locked) { hadLock = true; dragLook = false; }
      else if (hadLock && S.mode === 'play' && !S.typing && performance.now() - (S.chatClosedAt || 0) > 500) pause();
    });
    document.addEventListener('pointerlockerror', () => { dragLook = true; });

    document.addEventListener('mousemove', (e) => {
      if (S.mode !== 'play') return;
      const locked = document.pointerLockElement === renderer.domElement;
      if (!locked && !(dragLook && e.buttons & 1)) return;
      const mx = Math.max(-70, Math.min(70, e.movementX)), my = Math.max(-70, Math.min(70, e.movementY));
      P.yaw -= mx * 0.0013;
      P.pitch = Math.max(-1.25, Math.min(1.25, P.pitch - my * 0.0013));
    });
    renderer.domElement.addEventListener('mousedown', () => {
      if (S.mode === 'play' && !dragLook && document.pointerLockElement !== renderer.domElement) lockPointer();
    });

    $('btnStart').addEventListener('click', () => { applyNick(); if (BR.net) BR.net.leave(); netSig = ''; level = 0; buildLevel(); startRun(false); });
    $('specPrev').addEventListener('click', (e) => { e.currentTarget.blur(); specCycle(-1); });
    $('specNext').addEventListener('click', (e) => { e.currentTarget.blur(); specCycle(1); });
    $('specQuit').addEventListener('click', (e) => { e.currentTarget.blur(); endNow(); });
    $('slotMap').addEventListener('click', (e) => { e.currentTarget.blur(); if (S.mode === 'play') useSlot(1); });
    $('slotMed').addEventListener('click', (e) => { e.currentTarget.blur(); if (S.mode === 'play') useSlot(2); });
    const cin = $('chatIn');
    cin.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); closeChat(true); }
      else if (e.code === 'Escape') { e.preventDefault(); closeChat(false); }
    });
    cin.addEventListener('blur', () => { if (S.typing) closeChat(false); });
    ['btnFs', 'btnFs2'].forEach((id) => $(id).addEventListener('click', toggleFullscreen));
    document.addEventListener('fullscreenchange', fsChanged); document.addEventListener('webkitfullscreenchange', fsChanged);
    const nick = $('nick');
    nick.value = BR.net ? BR.net.nick : '';
    nick.addEventListener('keydown', (e) => e.stopPropagation());
    const applyNick = () => { if (BR.net) nick.value = BR.net.setNick(nick.value); };
    nick.addEventListener('change', applyNick);
    const code = $('coopCode'), msg = $('coopMsg');
    code.value = BR.net ? BR.net.randomCode() : '';
    if (!BR.net || !BR.net.available()) { $('coopRow').style.opacity = 0.5; }
    code.addEventListener('keydown', (e) => e.stopPropagation());
    $('btnCoop').addEventListener('click', async () => {
      applyNick();
      const c = BR.net.clean(code.value);
      if (!c) { msg.textContent = 'type a short code (letters/numbers)'; return; }
      msg.textContent = 'connecting…';
      const ok = await BR.net.join(c);
      if (!ok) { msg.textContent = 'could not connect — check your internet and try again (the first player with a code is the host and must stay in the game)'; return; }
      msg.textContent = 'joined ' + c.toUpperCase();
      netSig = ''; buildLevel(); startRun(false);
    });
    $('btnResume').addEventListener('click', resume);
    $('btnMenu').addEventListener('click', () => {
      if (S.mode !== 'pause') return;
      if (BR.net) BR.net.leave();
      netSig = ''; $('netList').textContent = ''; $('coopMsg').textContent = 'same code = same level, play together';
      $('hint').classList.remove('on'); $('hud').classList.remove('on');
      level = 0; S.mode = 'title'; buildLevel(); showPanel('pTitle');
    });
    $('btnRetry').addEventListener('click', () => startRun(true));
    $('btnAgain').addEventListener('click', () => { level = 0; startRun(true); });
    $('btnNext').addEventListener('click', () => { level = Math.min(level + 1, BR.themes.length - 1); startRun(true); });
    $('muteBtn').addEventListener('click', () => { BR.audio.setMuted(!BR.audio.isMuted()); $('muteBtn').textContent = BR.audio.isMuted() ? 'SOUND OFF' : 'SOUND ON'; });
    document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => applyQuality(b.dataset.q)));
    document.querySelectorAll('[data-dev]').forEach((b) => b.addEventListener('click', () => setDevice(b.dataset.dev)));

    // touch
    {
      const half = () => innerWidth / 2;
      addEventListener('touchstart', (e) => {
        if (!touchDevice || S.mode !== 'play') return;
        for (const t of e.changedTouches) {
          if (t.target.closest && t.target.closest('.tbtn')) continue;
          if (t.clientX < half() && touch.moveId == null) { touch.moveId = t.identifier; touch.sx = t.clientX; touch.sy = t.clientY; }
          else if (touch.lookId == null) { touch.lookId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; }
        }
      }, { passive: true });
      addEventListener('touchmove', (e) => {
        if (!touchDevice) return;
        for (const t of e.changedTouches) {
          if (t.identifier === touch.moveId) {
            touch.mx = Math.max(-1, Math.min(1, (t.clientX - touch.sx) / 50));
            touch.mz = Math.max(-1, Math.min(1, (t.clientY - touch.sy) / 50));
          } else if (t.identifier === touch.lookId) {
            P.yaw -= (t.clientX - touch.lx) * 0.0034;
            P.pitch = Math.max(-1.25, Math.min(1.25, P.pitch - (t.clientY - touch.ly) * 0.0034));
            touch.lx = t.clientX; touch.ly = t.clientY;
          }
        }
        if (S.mode === 'play') e.preventDefault();
      }, { passive: false });
      const end = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === touch.moveId) { touch.moveId = null; touch.mx = touch.mz = 0; }
          if (t.identifier === touch.lookId) touch.lookId = null;
        }
      };
      addEventListener('touchend', end); addEventListener('touchcancel', end);
      const run = $('tRun'), lt = $('tLight');
      $('tJump').addEventListener('touchstart', (e) => { if (S.mode === 'play') P.wantJump = true; e.preventDefault(); }, { passive: false });
      $('tCrouch').addEventListener('touchstart', (e) => { keys.KeyC = !keys.KeyC; $('tCrouch').setAttribute('aria-pressed', String(!!keys.KeyC)); e.preventDefault(); }, { passive: false });
      $('tUse').addEventListener('touchstart', (e) => { keys.KeyE = true; if (!S.reviveLabel) useTarget(); e.preventDefault(); }, { passive: false });
      $('tUse').addEventListener('touchend', () => { keys.KeyE = false; });
      run.addEventListener('touchstart', (e) => { touch.run = true; e.preventDefault(); }, { passive: false });
      run.addEventListener('touchend', () => { touch.run = false; });
      lt.addEventListener('touchstart', (e) => { if (S.mode === 'play') { S.flashOn = !S.flashOn; BR.audio.click(); } e.preventDefault(); }, { passive: false });
      const tap = (id, fn) => $(id).addEventListener('touchstart', (e) => { fn(); e.preventDefault(); }, { passive: false });
      tap('tMap', () => { if (S.mode === 'play') useSlot(1); });
      tap('tChat', () => { if (S.mode === 'play') openChat(); });
      tap('tPause', () => { if (S.mode === 'play') pause(); });
    }
  }

  function applyQuality(q) {
    quality = q;
    document.querySelectorAll('[data-q]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.q === q)));
    renderer.setPixelRatio(quality === 'low' ? 0.7 : Math.min(devicePixelRatio || 1, 1.5));
    ensurePost();
    resize();
    buildLevel();
  }
  // PC: keyboard + mouse. Mobile: touch controls, lighter graphics.
  function setDevice(mode, silent) {
    touchDevice = mode === 'mobile';
    document.querySelectorAll('[data-dev]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.dev === mode)));
    $('touch').hidden = !touchDevice;
    $('keysDesk').hidden = touchDevice; $('keysTouch').hidden = !touchDevice;
    document.documentElement.classList.toggle('mobile', touchDevice);
    for (const k in keys) keys[k] = false;
    touch.mx = touch.mz = 0; touch.moveId = touch.lookId = null; touch.run = false;
    if (!silent && renderer) {
      const want = touchDevice ? 'low' : 'high';
      if (quality !== want) applyQuality(want);
    }
  }

  function resize() {
    const w = $('stage').clientWidth || innerWidth, h = $('stage').clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (post) post.setSize(w, h);
  }

  function ensurePost() {
    if (quality !== 'high' || post || !BR.makePost) return;
    try { post = BR.makePost(renderer, camera); } catch (err) { post = null; }
  }

  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: quality === 'high', powerPreference: 'high-performance' });
    renderer.setPixelRatio(quality === 'low' ? 0.7 : Math.min(devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.id = 'view';
    $('stage').appendChild(renderer.domElement);
    BR.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    camera = new THREE.PerspectiveCamera(72, 1, 0.05, 90);
    viewmodel = BR.makeViewmodel(camera);
    ensurePost();

    const g = $('grain'); g.width = 192; g.height = 108;
    gctx = g.getContext('2d'); gimg = gctx.createImageData(192, 108);

    document.querySelectorAll('[data-q]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === quality)));
    buildLevel();
    bindInput();
    setDevice(autoTouch ? 'mobile' : 'pc', true);
    addEventListener('resize', resize); resize();
    showPanel('pTitle');
    $('hud').classList.remove('on');
    $('boot').classList.add('done');
    requestAnimationFrame((t) => { lastFrame = t; frame(t); });
  }

  BR.dbg = () => ({ P, S, world, scene, entity, level, startFall, enterUnder, leaveUnder, startClimb, surf: !!surf });
  BR.boot = function () {
    let started = false;
    const go = () => { if (started) return; started = true; init(); };
    try {
      if (document.fonts && document.fonts.load) {
        Promise.race([
          Promise.all([document.fonts.load('90px "Permanent Marker"'), document.fonts.load('16px "IBM Plex Mono"')]),
          new Promise((r) => setTimeout(r, 1500))
        ]).then(go, go);
      } else go();
    } catch (e) { go(); }
  };
})(window.BR);
