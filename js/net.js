/* BACKROOMS — co-op. Everyone who enters the same code walks the same level (the code is the seed).
   Position, pose, flashlight, picked-up items, downed/revive state and the run clock travel through the
   page's `room` capability as presence. Each player still has their own entity hunting them.
   Without the capability the game stays solo. */
window.BR = window.BR || {};

(function (BR) {
  let savedNick = '';
  try { savedNick = localStorage.getItem('bk-nick') || ''; } catch (e) { /* storage can be blocked */ }
  const net = BR.net = {
    active: false, code: '', room: null, got: [], handlers: {}, mates: [], reviveP: 0,
    nick: savedNick || 'P' + (10 + Math.floor(Math.random() * 90))
  };
  const avatars = new Map();
  let sendT = 0, unsub = null, scene = null, lastState = -1, lastNick = '';
  let rev = { id: null, p: 0, hold: 0 };
  const seen = new Set();                                   // item indexes already applied from others

  net.available = () => !!((window.claude && typeof window.claude.use === 'function') || (BR.rtc && BR.rtc.available()));
  net.clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  net.cleanNick = (s) => String(s || '').replace(/[^\wㄱ-ㆎ가-힣 .-]/g, '').trim().slice(0, 10);
  net.setNick = function (s) {
    const n = net.cleanNick(s) || net.nick;
    net.nick = n;
    try { localStorage.setItem('bk-nick', n); } catch (e) { /* ignore */ }
    return n;
  };
  net.hueOf = (id) => [...String(id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7);
  net.randomCode = () => Math.random().toString(36).slice(2, 6);
  net.seed = () => {                                        // same code -> same level
    let h = 2166136261;
    for (const ch of 'bk' + net.code) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return ((h >>> 0) + (net.level | 0) * 104729) % 1000000000;       // every level of a run has its own layout
  };
  net.level = 0;
  net.restoreGot = (arr) => { net.got = (arr || []).slice(); if (net.room) net.room.presence({ g: net.got.slice() }).catch(() => {}); };
  net.setLevel = (n) => {                                    // moved to another map: forget this map's items, only see people on the same map
    net.level = n | 0; net.got = []; seen.clear(); rev = { id: null, p: 0, hold: 0 };
    if (net.room) net.room.presence({ lv: net.level, g: [], rv: null, rp: 0 }).catch(() => {});
  };

  net.join = async function (code) {
    net.leave();
    code = net.clean(code);
    if (!code || !net.available()) return false;
    // inside claude.ai the page's own room capability is used; anywhere else, peer-to-peer (PeerJS)
    net.room = null;
    if (window.claude && typeof window.claude.use === 'function') {
      try {
        const lobby = await window.claude.use('room');
        if (lobby) net.room = await lobby.join('bk-' + code);
      } catch (e) { net.room = null; }
    }
    if (!net.room && BR.rtc && BR.rtc.available()) net.room = await BR.rtc.join(code);
    if (!net.room) return false;
    net.joinedAt = Date.now();
    net.level = 0;
    net.code = code; net.active = true; net.got = []; seen.clear(); rev = { id: null, p: 0, hold: 0 };
    net.room.presence({ n: net.nick, x: 0, z: 0, y: 0, m: 0, f: 1, d: 0, g: [], s: Date.now(), rv: null, rp: 0, lv: 0 }).catch(() => {});
    unsub = net.room.onPeers(() => {}, () => { net.active = false; });
    return true;
  };

  function clearAvatars() {
    avatars.forEach((a) => { if (a.group.parent) a.group.parent.remove(a.group); });
    avatars.clear();
  }
  net.leave = function () {
    if (unsub) { unsub(); unsub = null; }
    if (net.room) { net.room.leave().catch(() => {}); net.room = null; }
    clearAvatars();
    net.active = false; net.got = []; net.mates = []; net.reviveP = 0; seen.clear();
  };

  // the level was rebuilt: items are fresh again
  net.reset = function (sc) {
    scene = sc; net.got = []; seen.clear(); rev = { id: null, p: 0, hold: 0 };
    clearAvatars();
    if (net.room) net.room.presence({ g: [], rv: null, rp: 0 }).catch(() => {});
  };

  // shared clock: the earliest start time among everyone in the level
  let myStart = Date.now();
  net.markStart = function () {
    myStart = Date.now();
    if (net.room) net.room.presence({ s: myStart }).catch(() => {});
  };
  net.runTime = function (fallback) {
    let s = myStart;
    if (net.room) for (const p of net.room.peers()) {
      const v = p.presence && p.presence.s;
      if (!p.sameTab && p.kind === 'viewer' && typeof v === 'number' && v > 1e12 && v < s) s = v;
    }
    const t = (Date.now() - s) / 1000;
    return t >= 0 && t < 86400 ? t : fallback;
  };

  let chatN = 0;
  net.say = function (text) {
    if (!net.room) return;
    chatN++;
    net.room.presence({ c: { i: chatN + '.' + Date.now().toString(36), t: String(text).slice(0, 120), ts: Date.now() } }).catch(() => {});
  };

  net.spec = null;
  net.entityState = null;                      // [x, z, heading, speed, hunting] of my own entity, shared so spectators can see what chases me
  net.view = (id) => { const a = avatars.get(id); return a && a.view ? a.view : null; };

  net.localPick = function (idx) {
    if (!net.active || net.got.includes(idx) || (net.itemKind && net.itemKind(idx) === 'map')) return;
    net.got.push(idx); seen.add(idx);
    if (net.room) net.room.presence({ g: net.got.slice() }).catch(() => {});
  };

  // reviving a downed teammate: progress travels in presence, the downed player's own client reads it
  net.setRevive = function (id, p) {
    if (rev.hold > 0) return;
    rev.id = id; rev.p = p;
  };
  net.finishRevive = function (id) { rev = { id, p: 1, hold: 1.6 }; };
  net.reviving = () => rev.hold > 0;

  /* ---------- avatars ---------- */
  function labelSprite(text, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = '700 32px "IBM Plex Mono", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(10, 8, 236, 48);
    x.fillStyle = color || '#fff3b8'; x.fillText(text, 128, 33);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    sp.scale.set(1.3, 0.325, 1); sp.renderOrder = 998;
    return sp;
  }

  // fabric wrinkles: push every vertex along its normal by a smooth, deterministic ripple
  function wrinkle(geo, amp, seed) {
    const p = geo.attributes.position, nn = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const w = Math.sin(y * 21 + seed + Math.sin(x * 15 + seed * 1.7) * 1.7) * 0.5 + Math.sin(x * 27 + z * 19 + seed * 2.3) * 0.5;
      const d = w * amp;
      p.setXYZ(i, x + nn.getX(i) * d, y + nn.getY(i) * d, z + nn.getZ(i) * d);
    }
    geo.computeVertexNormals();
    return geo;
  }
  // profiles may be listed top-down; LatheGeometry wants them bottom-up so the faces point outward
  const lathe = (pts, seg) => new THREE.LatheGeometry((pts[0][1] > pts[pts.length - 1][1] ? pts.slice().reverse() : pts).map(([r, y]) => new THREE.Vector2(r, y)), seg || 14);

  // a yellow hazmat explorer: bulky coverall, hood with a dark visor and goggles, black gloves, orange boots,
  // a briefcase in the left hand and the flashlight in the right. The front faces -z.
  function makeAvatar(peer) {
    const hue = net.hueOf(peer.peer) / 360;
    const tagC = new THREE.Color().setHSL(hue, 0.75, 0.52);
    const mat = (c, rough, em, metal) => new THREE.MeshStandardMaterial({ color: c, roughness: rough == null ? 0.85 : rough, metalness: metal || 0, emissive: c, emissiveIntensity: em == null ? 0.16 : em });
    const suit = mat(0xcdc95e, 0.82, 0.2), suitD = mat(0xa9a64a, 0.85, 0.14), glove = mat(0x1d211d, 0.6, 0.03), boot = mat(0xb4683a, 0.7, 0.1);
    const black = mat(0x0a0a0c, 0.35, 0.0, 0.3), metal = mat(0x6d6f70, 0.4, 0.05, 0.7), tag = mat(tagC, 0.5, 0.5);
    const lensM = new THREE.MeshStandardMaterial({ color: 0x1b3028, roughness: 0.15, metalness: 0.4, emissive: 0x0d1e16, emissiveIntensity: 0.6, transparent: true, opacity: 0.92 });
    const mesh = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; (parent || g).add(o); return o; };
    const g = new THREE.Group();
    const body = new THREE.Group(); g.add(body);                    // everything that leans or lies down

    // legs: baggy trouser legs gathered into orange boots
    const legs = [-1, 1].map((s, li) => {
      const hip = new THREE.Group(); hip.position.set(s * 0.115, 0.92, 0); body.add(hip);
      mesh(wrinkle(lathe([[0, 0.02], [0.115, 0], [0.125, -0.2], [0.105, -0.46], [0, -0.47]], 14), 0.012, 3 + li), suit, 0, 0, 0, hip);
      const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee); hip.userData.knee = knee;           // the shin bends at the knee
      mesh(wrinkle(lathe([[0, 0], [0.105, 0], [0.11, -0.16], [0.085, -0.43], [0, -0.44]], 14), 0.012, 7 + li), suit, 0, 0, 0, knee);
      mesh(new THREE.TorusGeometry(0.088, 0.016, 6, 14), suitD, 0, -0.4, 0, knee).rotation.x = Math.PI / 2;       // elasticated ankle cuff
      const bootG = new THREE.SphereGeometry(0.1, 12, 10); bootG.scale(1, 0.8, 1.9);
      mesh(bootG, boot, 0, -0.44, -0.06, knee);
      mesh(new THREE.BoxGeometry(0.2, 0.03, 0.4), black, 0, -0.505, -0.05, knee);
      return hip;
    });
    // torso: bulky coverall, tied at the waist, with dark vent slits, pockets and shoulder tabs
    const torsoG = wrinkle(lathe([[0, 0.6], [0.2, 0.62], [0.29, 0.74], [0.31, 0.98], [0.3, 1.2], [0.27, 1.38], [0.2, 1.5], [0.09, 1.56], [0, 1.57]], 22), 0.014, 1);
    torsoG.scale(1.08, 1, 0.78);
    mesh(torsoG, suit, 0, 0, 0, body);
    const belt = mesh(new THREE.TorusGeometry(0.285, 0.02, 6, 24), suitD, 0, 0.98, 0, body); belt.rotation.x = Math.PI / 2; belt.scale.set(1.08, 0.78, 1);
    [[-0.1, 1.2, -0.224, 0.18, 0.55], [0.1, 1.17, -0.226, 0.12, -0.5], [0.0, 1.0, -0.232, 0.1, 1.5], [-0.17, 0.82, -0.22, 0.08, 0.2], [0.17, 0.82, -0.22, 0.08, -0.2]].forEach(([x, y, z, l, r]) => {
      const sl = mesh(new THREE.BoxGeometry(0.016, l, 0.012), black, x, y, z, body); sl.rotation.z = r;
    });
    [-1, 1].forEach((s) => {
      mesh(new THREE.BoxGeometry(0.1, 0.03, 0.12), tag, s * 0.22, 1.5, 0, body).rotation.z = s * -0.5;       // shoulder tabs in the player colour
    });
    // hood + visor + goggles + respirator
    const head = new THREE.Group(); head.position.set(0, 1.7, 0); body.add(head);
    const hoodG = wrinkle(new THREE.SphereGeometry(0.2, 22, 16), 0.012, 11); hoodG.scale(1, 1.14, 1.08);
    mesh(hoodG, suit, 0, 0.02, 0.01, head);
    const ruff = mesh(wrinkle(new THREE.TorusGeometry(0.16, 0.05, 8, 20), 0.008, 5), suitD, 0, -0.17, 0, head); ruff.rotation.x = Math.PI / 2;   // gathered neck
    const visorG = new THREE.SphereGeometry(0.13, 18, 14); visorG.scale(0.88, 1.14, 0.62);
    mesh(visorG, black, 0, 0.0, -0.165, head);
    const rim = mesh(new THREE.TorusGeometry(0.118, 0.024, 8, 22), suit, 0, 0.0, -0.18, head); rim.scale.set(0.9, 1.16, 1);
    [-1, 1].forEach((s) => {
      const ring = mesh(new THREE.TorusGeometry(0.04, 0.009, 6, 14), metal, s * 0.055, 0.025, -0.225, head);
      const lens = mesh(new THREE.CircleGeometry(0.036, 14), lensM, s * 0.055, 0.025, -0.227, head); lens.rotation.y = Math.PI; lens.castShadow = false;
    });
    mesh(new THREE.BoxGeometry(0.03, 0.01, 0.01), metal, 0, 0.028, -0.226, head);
    const canG = new THREE.CylinderGeometry(0.038, 0.045, 0.07, 10); canG.rotateX(Math.PI / 2);
    mesh(canG, metal, 0, -0.05, -0.235, head);
    mesh(new THREE.BoxGeometry(0.1, 0.012, 0.012), black, 0, -0.05, -0.222, head);
    // arms: padded sleeves, black gloves
    const mkArm = (s, seed) => {
      const sh = new THREE.Group(); sh.position.set(s * 0.325, 1.44, 0); body.add(sh);
      mesh(new THREE.SphereGeometry(0.095, 12, 10), suit, 0, 0, 0, sh);
      mesh(wrinkle(lathe([[0, 0.0], [0.092, -0.02], [0.098, -0.15], [0.08, -0.3], [0, -0.31]], 12), 0.012, seed), suit, 0, 0, 0, sh);
      const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
      mesh(wrinkle(lathe([[0, 0.02], [0.082, 0], [0.085, -0.14], [0.062, -0.27], [0, -0.28]], 12), 0.01, seed + 4), suit, 0, 0, 0, el);
      mesh(new THREE.TorusGeometry(0.062, 0.014, 6, 12), suitD, 0, -0.26, 0, el).rotation.x = Math.PI / 2;
      const handG = new THREE.SphereGeometry(0.058, 10, 8); handG.scale(1, 1.15, 0.9);
      mesh(handG, glove, 0, -0.33, 0, el);
      mesh(new THREE.BoxGeometry(0.07, 0.07, 0.035), glove, 0, -0.39, -0.02, el);
      return { sh, el };
    };
    const armL = mkArm(-1, 21), armR = mkArm(1, 31);
    mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 14), tag, 0, -0.1, 0, armL.sh).rotation.x = Math.PI / 2;   // armband in the player colour
    // the briefcase hangs from the left hand
    const bc = new THREE.Group(); bc.position.set(0, -0.62, 0.0); armL.el.add(bc);
    mesh(new THREE.BoxGeometry(0.1, 0.36, 0.5), black, 0, 0, 0, bc);
    mesh(new THREE.BoxGeometry(0.104, 0.025, 0.5), metal, 0, 0.0, 0, bc);
    mesh(new THREE.BoxGeometry(0.03, 0.04, 0.05), metal, -0.05, 0.1, -0.12, bc);
    mesh(new THREE.BoxGeometry(0.03, 0.04, 0.05), metal, -0.05, 0.1, 0.12, bc);
    mesh(new THREE.TorusGeometry(0.07, 0.01, 6, 12, Math.PI), metal, 0, 0.18, 0, bc).rotation.set(0, Math.PI / 2, 0);
    // the flashlight in the right glove
    const torch = mesh(new THREE.CylinderGeometry(0.045, 0.034, 0.22, 8), mat(0x222222, 0.4, 0.05), 0, -0.44, 0, armR.el);
    const lens = mesh(new THREE.SphereGeometry(0.038, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2cf }), 0, -0.56, 0, armR.el);
    const beamG = new THREE.ConeGeometry(1.1, 6, 14, 1, true); beamG.rotateX(Math.PI / 2); beamG.translate(0, 0, -3);
    const beam = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ color: 0xfff2cf, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    beam.position.set(0.325, 1.26, -0.7); g.add(beam);

    return { group: g, body, legs, armL, armR, head, beam, lens, torch, label: null, labelKey: '', x: null, z: null, y: 0, ph: 0, amp: 0, down: 0, state: 0, cr: 0, air: 0, land: 0, lastAir: 0, t: 0, name: '', p: 0, view: null };
  }

  function setLabel(a, text, color) {
    const key = text + '|' + color;
    if (a.labelKey === key) return;
    a.labelKey = key;
    if (a.label) { a.group.remove(a.label); if (a.label.material.map) a.label.material.map.dispose(); a.label.material.dispose(); }
    a.label = labelSprite(text, color); a.label.position.y = 2.3; a.group.add(a.label);
  }

  function animate(a, pr, dt) {
    const st = pr.d === 2 ? 2 : pr.d === 1 ? 1 : 0;
    const ex = (r) => 1 - Math.exp(-r * dt);
    a.t = (a.t || 0) + dt;
    a.down += ((st ? 1 : 0) - a.down) * ex(6);
    const moving = st ? 0 : (pr.m || 0);
    a.amp += ((moving ? (moving === 2 ? 1 : 0.65) : 0) - a.amp) * ex(10);
    const run = Math.max(0, (a.amp - 0.65) / 0.35);                         // 0 walking .. 1 sprinting
    a.ph += dt * (moving === 2 ? 11.5 : 7.2);
    a.cr += ((pr.cr && !st ? 1 : 0) - a.cr) * ex(10);
    a.air += ((pr.a && !st ? 1 : 0) - a.air) * ex(14);
    if (pr.a !== a.lastAir) {                                                // a landing dips the knees for a moment
      if (!pr.a && a.lastAir) a.land = 0.32;
      a.lastAir = pr.a;
    }
    a.land = Math.max(0, (a.land || 0) - dt);
    const lk = Math.sin(Math.min(1, a.land / 0.32) * Math.PI);               // 0..1..0 over the landing
    const g = 1 - a.air;                                                     // ground-contact weight
    const ph = a.ph, cr = a.cr, A = a.amp * g;
    const swing = Math.sin(ph) * A, swing2 = Math.sin(ph + Math.PI) * A;
    const flex = (s) => Math.max(0, Math.cos(ph + (s ? Math.PI : 0))) * A;    // knee bends while the leg swings through
    const hip = (i) => (i ? swing2 : swing) * (0.62 + 0.38 * run);
    const crH = 1.0 * cr, crK = -1.9 * cr, lkH = 0.5 * lk, lkK = -0.9 * lk;
    for (let i = 0; i < 2; i++) {
      const leg = a.legs[i], kn = leg.userData.knee;
      const tuck = a.air * (i ? 0.7 : 1.15);                                   // jump: one knee drawn up, the other trailing
      leg.rotation.x = hip(i) * (1 - cr) + crH + lkH + tuck * 0.9;
      kn.rotation.x = -(flex(i) * (0.5 + 0.55 * run) * (1 - cr)) + crK + lkK - tuck * 1.15;
    }
    // arms swing against the legs; the right one keeps the torch up
    const sw = Math.sin(ph) * A * (0.3 + 0.5 * run);
    a.armL.sh.rotation.x = -sw - a.air * 1.1 + 0.18 * cr; a.armL.sh.rotation.z = 0.06 + a.air * 0.5; a.armL.el.rotation.x = -(0.05 + run * 0.7 * A + a.air * 0.5);
    a.armR.sh.rotation.x = 1.2 + Math.sin(ph * 2) * 0.04 * A + run * 0.18 * A - a.air * 0.35; a.armR.sh.rotation.z = -0.03 - a.air * 0.45; a.armR.el.rotation.x = 0.15 + run * 0.35 * A;
    // torso: bounce, sway, forward lean when running, twist against the hips, breathing at rest
    const rest = 1 - Math.min(1, a.amp + a.air);
    a.body.position.y = Math.abs(Math.cos(ph)) * (0.03 + 0.03 * run) * A + Math.sin(a.t * 1.9) * 0.004 * rest - 0.4 * cr - 0.07 * lk + a.air * 0.05;
    a.body.rotation.x = -a.down * 1.45 + A * (0.05 + 0.2 * run) + 0.35 * cr + 0.1 * lk - a.air * 0.12;
    a.body.rotation.y = Math.sin(ph) * (0.06 + 0.07 * run) * A;
    a.body.rotation.z = Math.cos(ph) * 0.03 * A;
    a.body.scale.y = 1;
    a.body.position.y += a.down * 0.2;
    a.body.position.z = a.down * 0.55;
    const look = typeof pr.p === 'number' ? Math.max(-0.9, Math.min(0.9, pr.p)) : 0;
    a.head.rotation.x = a.down * 0.25 + look * 0.55 - a.body.rotation.x * 0.6;  // the head keeps looking where the player looks
    a.head.rotation.y = -a.body.rotation.y * 0.8;
    a.beam.position.y = 1.28 - 0.4 * cr;
    a.beam.visible = a.lens.visible = !!pr.f && !st;
    if (st !== a.state) a.state = st;
  }

  // called every frame; returns the teammates (also kept in net.mates)
  net.tick = function (dt, P, S, world, sc) {
    if (!net.active || !net.room) return null;
    if (sc && sc !== scene) scene = sc;
    sendT += dt;
    if (rev.hold > 0) { rev.hold -= dt; if (rev.hold <= 0) rev = { id: null, p: 0, hold: 0 }; }
    const state = S.mode === 'downed' ? 1 : (S.mode === 'dying' || S.mode === 'dead' || S.mode === 'spectate') ? 2 : 0;
    if (sendT > 0.066 || state !== lastState || net.nick !== lastNick) {
      sendT = 0; lastState = state; lastNick = net.nick;
      const mv = Math.hypot(P.vx, P.vz);
      net.room.presence({
        n: net.nick, x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, y: Math.round(P.yaw * 100) / 100,
        m: mv > 0.5 ? (P.sprint ? 2 : 1) : 0, f: S.mode === 'play' && S.flashOn && S.battery > 0 ? 1 : 0, d: state,
        rv: rev.id, rp: Math.round(rev.p * 100) / 100, cr: P.cr ? 1 : 0, j: Math.round(P.jy * 100) / 100, a: P.air ? 1 : 0, p: Math.round(P.pitch * 100) / 100,
        en: net.entityState || null, lv: net.level | 0
      }).catch(() => {});
    }
    let myId = null;
    const list = [], live = new Set();
    for (const p of net.room.peers()) if (p.sameTab) myId = p.peer;
    net.reviveP = 0;
    for (const p of net.room.peers()) {
      if (p.sameTab || p.kind !== 'viewer') continue;      // your own other tabs count as players too
      const pr = p.presence || {};
      if (typeof pr.x !== 'number' || typeof pr.z !== 'number') continue;
      if ((pr.lv | 0) !== (net.level | 0)) {                // on another map: not visible, not listed
        const old = avatars.get(p.peer);
        if (old) { if (old.group.parent) old.group.parent.remove(old.group); avatars.delete(p.peer); net.handlers.moved && net.handlers.moved(old.name || 'PLAYER', pr.lv | 0); }
        continue;
      }
      live.add(p.peer);
      const name = net.cleanNick(pr.n) || 'PLAYER';
      let a = avatars.get(p.peer);
      if (!a) { a = makeAvatar(p); avatars.set(p.peer, a); if (scene) scene.add(a.group); net.handlers.joined && net.handlers.joined(name); }
      if (!a.group.parent && scene) scene.add(a.group);
      if (a.x === null) { a.x = pr.x; a.z = pr.z; }
      const k = 1 - Math.exp(-12 * dt);
      a.x += (pr.x - a.x) * k; a.z += (pr.z - a.z) * k;
      let dy = (pr.y || 0) - a.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.y += dy * k;
      a.group.position.set(a.x, 0, a.z); a.group.rotation.y = a.y;
      a.name = name;
      a.p += ((typeof pr.p === 'number' ? pr.p : 0) - a.p) * (1 - Math.exp(-14 * dt));
      a.view = { x: a.x, z: a.z, yaw: a.y, p: a.p, j: typeof pr.j === 'number' ? Math.max(0, Math.min(2, pr.j)) : 0, cr: pr.cr && pr.d !== 1 ? a.cr : 0, f: !!pr.f, en: Array.isArray(pr.en) && pr.en.length === 5 ? pr.en : null, name };
      a.group.visible = net.spec !== p.peer;
      animate(a, pr, dt);
      a.group.position.y = typeof pr.j === 'number' ? Math.max(0, Math.min(2, pr.j)) : 0;
      const c = pr.c;
      if (c && typeof c.i === 'string' && typeof c.t === 'string' && c.i !== a.lastC) {
        const first = a.lastC === undefined; a.lastC = c.i;
        if (!(first && Date.now() - (c.ts || 0) > 6000) && net.handlers.chat) net.handlers.chat(name, c.t.slice(0, 120));
      } else if (a.lastC === undefined) a.lastC = c && c.i ? c.i : null;
      const d = pr.d === 2 ? 2 : pr.d === 1 ? 1 : 0;
      setLabel(a, name.toUpperCase() + (d === 1 ? ' · DOWN' : d === 2 ? ' · LOST' : ''), d === 1 ? '#ffb15a' : d === 2 ? '#c4604e' : '#fff3b8');
      if (d !== (a.lastD || 0)) { if (d > 0 && net.handlers.died) net.handlers.died(name, d); if (d === 0 && a.lastD === 1 && net.handlers.up) net.handlers.up(name); a.lastD = d; }
      list.push({ id: p.peer, name, x: pr.x, z: pr.z, d });
      if (myId && pr.rv === myId && typeof pr.rp === 'number') net.reviveP = Math.max(net.reviveP, pr.rp);
      // items someone else picked up
      if (Array.isArray(pr.g)) for (const idx of pr.g) {
        if (typeof idx !== 'number' || seen.has(idx)) continue;
        seen.add(idx);
        if (net.itemKind && net.itemKind(idx) === 'map') continue;      // everyone gets their own map
        net.handlers.remotePick && net.handlers.remotePick(idx);
      }
    }
    avatars.forEach((a, id) => { if (!live.has(id)) { if (a.group.parent) a.group.parent.remove(a.group); avatars.delete(id); if (net.handlers.left) net.handlers.left(a.name || 'PLAYER'); } });
    net.mates = list;
    return list;
  };
})(window.BR);
