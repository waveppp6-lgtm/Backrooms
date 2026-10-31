/* BACKROOMS — player, entity AI, input, HUD, main loop */
(function (BR) {
  const $ = (id) => document.getElementById(id);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const touchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0 && matchMedia('(pointer:coarse)').matches);

  let renderer, scene, camera, world, flash, entity, playerBody = null, playerField = null, lastPT = '';
  let post = null, dust = null;
  let quality = touchDevice ? 'low' : 'high';
  let hadLock = false, dragLook = false, lastFrame = performance.now(), tAll = 0;

  const S = { mode: 'title', fuses: 0, battery: 100, stamina: 100, flashOn: true, tired: false, run: 0, alert: 0, hintT: 0, deadT: 0, danger: 0, bat0: 0 };
  const P = { x: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, bob: 0, bobPrev: 0, sprint: false, noise: 0, cr: false, crouch: 0, jy: 0, jv: 0, air: false, wantJump: false };
  const keys = {};
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

  function buildLevel() {
    disposeScene(scene);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120f04);
    scene.fog = new THREE.FogExp2(0x1a1505, 0.058);
    scene.add(camera);

    const seed = BR.net && BR.net.active ? BR.net.seed() : Math.floor(Math.random() * 1e9);
    world = BR.buildWorld(scene, seed, quality);

    flash = new THREE.SpotLight(0xfff2cf, 1.45, 24, 0.46, 0.65, 1.4);
    flash.position.set(0.12, -0.08, 0.1);
    const target = new THREE.Object3D(); target.position.set(0, 0, -6);
    camera.add(flash); camera.add(target); flash.target = target;

    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: BR.tex.figure(), transparent: true }));
    sp.center.set(0.5, 0); sp.scale.set(1.9, 3.9, 1);
    scene.add(sp);
    entity = { sprite: sp, x: 0, z: 0, mode: 'wander', lose: 0, ni: null, nj: null, wfield: null, idle: 0, hasTarget: false };
    placeEntityFar();
    sp.position.set(entity.x, 0, entity.z);

    // invisible body: draws nothing, but casts the player's shadow in the ceiling lights
    const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    playerBody = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 1.35, 14), ghost);
    torso.position.y = 0.68;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), ghost);
    head.position.y = 1.56;
    [torso, head].forEach((m) => { m.castShadow = true; m.frustumCulled = false; });
    playerBody.add(torso, head);
    scene.add(playerBody);

    P.x = world.center(1); P.z = world.center(1);
    const spawn = world.spawn;
    if (spawn) { P.x = spawn.x + (BR.net && BR.net.active ? (Math.random() - 0.5) * 0.9 : 0); P.z = spawn.z + (BR.net && BR.net.active ? (Math.random() - 0.5) * 0.9 : 0); }
    // start out looking down the longest open line instead of into the corner
    let bestRun = -1, bestDir = [0, 1];
    for (const [dx, dz] of DIRS) {
      let n = 0;
      while (n < 40 && !world.solid(1 + dx * (n + 1), 1 + dz * (n + 1))) n++;
      if (n > bestRun) { bestRun = n; bestDir = [dx, dz]; }
    }
    P.yaw = spawn ? spawn.yaw : Math.atan2(-bestDir[0], -bestDir[1]); P.pitch = 0; P.vx = P.vz = 0;
    dust = BR.makeDust(scene, quality);
    if (post) post.setScene(scene);
    playerField = null; lastPT = '';
    if (BR.net) BR.net.reset(scene);
  }

  function placeEntityFar() {
    const N = BR.N, cand = [];
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      if (world.grid[j][i] === 0 && world.dist[j * N + i] >= 30) cand.push([i, j]);
    }
    const c = cand.length ? cand[Math.floor(Math.random() * cand.length)] : [N - 2, N - 2];
    entity.x = world.center(c[0]); entity.z = world.center(c[1]);
    entity.ni = null; entity.hasTarget = false; entity.mode = 'wander'; entity.idle = 0;
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
  function blocked(x, z) { return hitsWall(x, z, PR) || hitsBoxes(x, z, PR) || hitsStatic(x, z, PR); }
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
    if (world.exit.open) {
      const d = Math.hypot(world.exit.x - P.x, world.exit.z - P.z);
      ob.textContent = `REACH THE EXIT  ·  ${Math.round(d)} M`;
      const ang = Math.atan2(world.exit.x - P.x, world.exit.z - P.z) + P.yaw + Math.PI;
      $('arrow').style.transform = `rotate(${(-ang * 180 / Math.PI).toFixed(1)}deg)`;
      $('compass').classList.add('on');
    } else {
      let nd = Infinity;
      world.items.forEach((it) => { if (it.kind === 'fuse' && !it.taken) nd = Math.min(nd, Math.hypot(it.x - P.x, it.z - P.z)); });
      ob.textContent = `FIND FUSES  ${S.fuses} / 3` + (isFinite(nd) ? `  ·  NEAREST ${Math.round(nd)} M` : '');
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

  function startRun(fresh) {
    BR.audio.start();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // typing in the menu must not eat game keys
    if (fresh) buildLevel();
    if (BR.net) BR.net.markStart();
    Object.assign(S, { mode: 'play', fuses: 0, battery: 100, stamina: 100, flashOn: true, tired: false, run: 0, alert: 0, deadT: 0, danger: 0, boost: 0, noiseT: 0, target: null, promptText: '', med: 0, invuln: 0, downT: 0, revP: 0, reviveLabel: '', typing: false });
    $('scare').classList.remove('on');
    showPanel(null);
    $('hud').classList.add('on');
    hint(touchDevice ? 'Find 3 fuses. Open the exit.' : 'WASD move · SHIFT run · F light · E use · find 3 fuses', 5200);
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
    entity.sprite.material.depthTest = false;
    entity.sprite.renderOrder = 999;
    document.exitPointerLock && document.exitPointerLock();
  }

  function win() {
    S.mode = 'won';
    document.exitPointerLock && document.exitPointerLock();
    $('winTime').textContent = fmtTime(S.run).slice(0, 8);
    $('winBat').textContent = Math.round(S.battery) + '%';
    showPanel('pWin');
    $('hud').classList.remove('on');
  }

  /* ---------- update ---------- */
  function updatePlayer(dt) {
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
      if (!P.air && !P.cr && S.stamina > 6 && !S.tired) { P.air = true; P.jv = 4.3; S.stamina -= 7; S.noiseT = Math.max(S.noiseT, 0.25); }
    }
    if (P.air) {
      P.jv -= 14 * dt; P.jy += P.jv * dt;
      if (P.jy <= 0) { P.jy = 0; P.jv = 0; P.air = false; S.noiseT = Math.max(S.noiseT, 0.3); BR.audio.step(false); }
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
      if (Math.hypot(it.x - P.x, it.z - P.z) < 1.25) {
        it.taken = true; it.mesh.visible = false; if (BR.net) BR.net.localPick(idx);
        if (it.kind === 'fuse') {
          S.fuses++; BR.audio.pickup(); S.alert = 7;
          if (S.fuses >= 3) { world.openExit(); BR.audio.door(); hint('THE EXIT HAS POWER. FOLLOW THE ARROW.', 5200); }
          else hint(`FUSE ${S.fuses} / 3 — THE LIGHTS SURGE. IT KNOWS.`, 4200);
        } else if (it.kind === 'medkit') {
          S.med++; BR.audio.pickup();
          hint(BR.net && BR.net.active ? 'MEDKIT — HOLD E NEXT TO A DOWNED TEAMMATE' : 'MEDKIT — IT WILL SAVE YOU ONCE', 3600);
        } else {
          S.battery = Math.min(100, S.battery + 40); BR.audio.battery(); hint('BATTERY +40%', 1800);
        }
      }
    });
    if (world.exit.open && Math.hypot(world.exit.x - P.x, world.exit.z - P.z) < 1.5) win();
    else if (!world.exit.open && Math.hypot(world.exit.x - P.x, world.exit.z - P.z) < 1.6 && S.hintT <= 0) hint('NO POWER. THE DOOR WON\'T MOVE.', 2200);

    if (S.invuln > 0) S.invuln -= dt;
    updateRevive(dt);
    // what can be used right now (door, bed, drawer)?
    S.target = world.interactAt(P.x, P.z, -Math.sin(P.yaw), -Math.cos(P.yaw));
    const label = S.reviveLabel ? S.reviveLabel : S.target ? (touchDevice ? 'USE · ' : '[E] ') + world.promptFor(S.target) : '';
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
  function updateDowned(dt) {
    S.downT -= dt;
    const alive = BR.net && BR.net.active && BR.net.mates.some((m) => m.d === 0);
    if (BR.net && BR.net.reviveP >= 1) { stand(); return; }
    if (S.downT <= 0 || !alive) { die(); return; }
    camera.position.set(P.x, 0.42, P.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(0.35 + Math.sin(tAll * 0.9) * 0.03, P.yaw, 0.5);
    const pr = BR.net.reviveP;
    $('objective').textContent = `DOWN · ${Math.ceil(S.downT)} S` + (pr > 0 ? `  ·  BEING REVIVED ${Math.round(pr * 100)}%` : '');
  }

  function applyLoot(kind) {
    if (kind === 'battery') { S.battery = Math.min(100, S.battery + 35); BR.audio.battery(); hint('FOUND A BATTERY  +35%', 2400); }
    else if (kind === 'water') { S.stamina = 100; S.tired = false; BR.audio.pickup(); hint('ALMOND WATER  ·  STAMINA RESTORED', 2800); }
    else if (kind === 'drink') { S.boost = 18; BR.audio.pickup(); hint('ENERGY DRINK  ·  RUN FASTER, NEVER TIRE', 2800); }
    else hint('NOTHING BUT DUST.', 1800);
  }
  function useTarget() {
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
      if (e.mode !== 'hunt') { BR.audio.flicker(); }
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
      const speed = 3.0 + 0.38 * S.fuses + (sees ? 0.35 : 0);
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
            e.x = world.center(ti); e.z = world.center(tj); e.ni = null; e.hasTarget = false; e.idle = 0;
          }
        }
      }
    }

    e.sprite.position.set(e.x, 0, e.z);
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
    camera.position.set(P.x + Math.cos(P.yaw) * bobX, 1.65 - 0.68 * P.crouch + P.jy + bobY, P.z - Math.sin(P.yaw) * bobX);
    camera.rotation.order = 'YXZ';
    const shake = S.danger * S.danger * 0.012;
    const nod = Math.sin(P.bob * 2 + 0.6) * 0.014 * amp;      // head nods with each step
    const roll = Math.cos(P.bob) * 0.018 * amp;               // body lean left/right
    const jitter = P.sprint ? (Math.random() - 0.5) * 0.004 : 0;
    camera.rotation.set(P.pitch + nod + (Math.random() - 0.5) * shake + jitter,
      P.yaw + Math.cos(P.bob) * 0.008 * amp + (Math.random() - 0.5) * shake,
      Math.sin(t * 0.6) * 0.004 + roll + S.danger * Math.sin(t * 11) * 0.008);
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
    e.sprite.position.set(P.x + fwdX * (1.4 - k * 0.95), 0, P.z + fwdZ * (1.4 - k * 0.95));
    e.sprite.scale.set(1.9 + k * 1.6, 3.9 + k * 3.2, 1);
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
    joined(name) { hint(name.toUpperCase() + ' ENTERED THE LEVEL', 2600); },
    died(name, d) { hint(d === 1 ? name.toUpperCase() + ' IS DOWN — BRING A MEDKIT' : name.toUpperCase() + ' WAS TAKEN.', 3800); },
    up(name) { hint(name.toUpperCase() + ' IS BACK UP', 2400); }
  };

  /* ---------- main loop ---------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now; tAll += dt;

    if (S.mode === 'play') {
      S.run = BR.net && BR.net.active ? BR.net.runTime(S.run + dt) : S.run + dt;
      updatePlayer(dt);
      if (S.mode === 'play') updateEntity(dt);
      if (S.mode === 'play') updateCamera(dt, tAll);
      world.updateLights(lightT(), P.x, P.z, S.danger * 0.85);
      BR.audio.update(dt, S.danger, S.stamina / 100, P.sprint);
      updateHUD();
      if (S.hintT > 0) { S.hintT -= dt; if (S.hintT <= 0) $('hint').classList.remove('on'); }
    } else if (S.mode === 'downed') {
      S.run = BR.net && BR.net.active ? BR.net.runTime(S.run + dt) : S.run + dt;
      updateDowned(dt);
      world.updateLights(lightT(), P.x, P.z, 0.5);
      BR.audio.update(dt, 0.3, S.stamina / 100, false);
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
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && S.mode === 'play') { e.preventDefault(); openChat(); }
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

    $('btnStart').addEventListener('click', () => { applyNick(); if (BR.net) BR.net.leave(); netSig = ''; buildLevel(); startRun(false); });
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
      S.mode = 'title'; buildLevel(); showPanel('pTitle');
    });
    $('btnRetry').addEventListener('click', () => startRun(true));
    $('btnAgain').addEventListener('click', () => startRun(true));
    $('muteBtn').addEventListener('click', () => { BR.audio.setMuted(!BR.audio.isMuted()); $('muteBtn').textContent = BR.audio.isMuted() ? 'SOUND OFF' : 'SOUND ON'; });
    document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      quality = b.dataset.q;
      document.querySelectorAll('[data-q]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderer.setPixelRatio(quality === 'low' ? 0.7 : Math.min(devicePixelRatio || 1, 1.5));
      ensurePost();
      resize();
      buildLevel();
    }));

    // touch
    if (touchDevice) {
      $('touch').hidden = false;
      const half = () => innerWidth / 2;
      addEventListener('touchstart', (e) => {
        if (S.mode !== 'play') return;
        for (const t of e.changedTouches) {
          if (t.target.closest && t.target.closest('.tbtn')) continue;
          if (t.clientX < half() && touch.moveId == null) { touch.moveId = t.identifier; touch.sx = t.clientX; touch.sy = t.clientY; }
          else if (touch.lookId == null) { touch.lookId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; }
        }
      }, { passive: true });
      addEventListener('touchmove', (e) => {
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
    ensurePost();

    const g = $('grain'); g.width = 192; g.height = 108;
    gctx = g.getContext('2d'); gimg = gctx.createImageData(192, 108);

    document.querySelectorAll('[data-q]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === quality)));
    buildLevel();
    bindInput();
    addEventListener('resize', resize); resize();
    showPanel('pTitle');
    $('hud').classList.remove('on');
    $('boot').classList.add('done');
    requestAnimationFrame((t) => { lastFrame = t; frame(t); });
  }

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
