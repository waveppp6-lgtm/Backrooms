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
  net.randomCode = () => Math.random().toString(36).slice(2, 6);
  net.seed = () => {                                        // same code -> same level
    let h = 2166136261;
    for (const ch of 'bk' + net.code) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 1000000000;
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
    net.code = code; net.active = true; net.got = []; seen.clear(); rev = { id: null, p: 0, hold: 0 };
    net.room.presence({ n: net.nick, x: 0, z: 0, y: 0, m: 0, f: 1, d: 0, g: [], s: Date.now(), rv: null, rp: 0 }).catch(() => {});
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

  net.localPick = function (idx) {
    if (!net.active || net.got.includes(idx)) return;
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

  function makeAvatar(peer) {
    const hue = [...peer.peer].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7) / 360;
    const jacket = new THREE.Color().setHSL(hue, 0.5, 0.42);
    const mat = (c, rough, em) => new THREE.MeshStandardMaterial({ color: c, roughness: rough == null ? 0.85 : rough, emissive: c, emissiveIntensity: em == null ? 0.16 : em });
    const jM = mat(jacket), jD = mat(jacket.clone().multiplyScalar(0.7)), pants = mat(0x2b3040), shoe = mat(0x1a1a18, 0.7, 0.05);
    const skin = mat(0xd9a982, 0.7, 0.2), hair = mat([0x2a1c12, 0x6a4a2a, 0x151515, 0x8a6a3a][Math.floor(hue * 97) % 4], 0.9, 0.05);
    const pack = mat(0x39402e, 0.9, 0.08), strap = mat(0x1d1d1a, 0.9, 0.02);
    const mesh = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; (parent || g).add(o); return o; };
    const g = new THREE.Group();
    const body = new THREE.Group(); g.add(body);                    // everything that leans or lies down

    // legs: pivot at the hip, swing for walking
    const legs = [-1, 1].map((s) => {
      const hip = new THREE.Group(); hip.position.set(s * 0.1, 0.92, 0); body.add(hip);
      const thighG = new THREE.CylinderGeometry(0.095, 0.075, 0.46, 10); thighG.translate(0, -0.23, 0);
      const shinG = new THREE.CylinderGeometry(0.07, 0.06, 0.44, 10); shinG.translate(0, -0.22, 0);
      mesh(thighG, pants, 0, 0, 0, hip);
      mesh(shinG, pants, 0, -0.46, 0, hip);
      mesh(new THREE.BoxGeometry(0.14, 0.09, 0.27), shoe, 0, -0.9, -0.05, hip);
      return hip;
    });
    // torso: jacket, belt, collar, backpack (the back faces +z, the front -z)
    const torsoG = new THREE.CylinderGeometry(0.2, 0.17, 0.62, 14); torsoG.scale(1.1, 1, 0.72);
    mesh(torsoG, jM, 0, 1.22, 0, body);
    mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 14).scale(1.1, 1, 0.74), jD, 0, 0.93, 0, body);
    mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 14), jD, 0, 1.54, 0, body).rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.3, 0.4, 0.14), pack, 0, 1.25, 0.19, body);
    mesh(new THREE.BoxGeometry(0.26, 0.12, 0.05), strap, 0, 1.12, 0.27, body);
    [-1, 1].forEach((s) => mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), strap, s * 0.12, 1.3, -0.12, body));
    // neck + head
    mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8), skin, 0, 1.58, 0, body);
    const head = new THREE.Group(); head.position.set(0, 1.7, 0); body.add(head);
    const headG = new THREE.SphereGeometry(0.115, 16, 12); headG.scale(0.92, 1.12, 1);
    mesh(headG, skin, 0, 0, 0, head);
    const capG = new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62); capG.scale(0.95, 1.12, 1.04);
    mesh(capG, hair, 0, 0.01, 0.012, head);
    [-1, 1].forEach((s) => mesh(new THREE.SphereGeometry(0.014, 6, 6), mat(0x111111, 0.4, 0), s * 0.045, 0.01, -0.108, head));
    mesh(new THREE.BoxGeometry(0.024, 0.03, 0.02), skin, 0, -0.02, -0.12, head);
    // arms: left swings, right holds the flashlight out in front
    const mkArm = (s) => {
      const sh = new THREE.Group(); sh.position.set(s * 0.275, 1.46, 0); body.add(sh);
      const upG = new THREE.CylinderGeometry(0.058, 0.05, 0.3, 8); upG.translate(0, -0.15, 0);
      const loG = new THREE.CylinderGeometry(0.05, 0.042, 0.28, 8); loG.translate(0, -0.14, 0);
      mesh(upG, jM, 0, 0, 0, sh);
      const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
      mesh(loG, jD, 0, 0, 0, el);
      mesh(new THREE.SphereGeometry(0.045, 8, 6), skin, 0, -0.3, 0, el);
      return { sh, el };
    };
    const armL = mkArm(-1), armR = mkArm(1);
    const torch = mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.2, 8), mat(0x222222, 0.4, 0.05), 0, -0.36, 0, armR.el);
    const lens = mesh(new THREE.SphereGeometry(0.034, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2cf }), 0, -0.47, 0, armR.el);
    const beamG = new THREE.ConeGeometry(1.1, 6, 14, 1, true); beamG.rotateX(Math.PI / 2); beamG.translate(0, 0, -3);
    const beam = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ color: 0xfff2cf, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    beam.position.set(0.275, 1.28, -0.62); g.add(beam);

    const a = { group: g, body, legs, armL, armR, head, beam, lens, torch, label: null, labelKey: '', x: null, z: null, y: 0, ph: 0, amp: 0, down: 0, state: 0, cr: 0 };
    return a;
  }

  function setLabel(a, text, color) {
    const key = text + '|' + color;
    if (a.labelKey === key) return;
    a.labelKey = key;
    if (a.label) { a.group.remove(a.label); if (a.label.material.map) a.label.material.map.dispose(); a.label.material.dispose(); }
    a.label = labelSprite(text, color); a.label.position.y = 2.15; a.group.add(a.label);
  }

  function animate(a, pr, dt) {
    const st = pr.d === 2 ? 2 : pr.d === 1 ? 1 : 0;
    a.down += ((st ? 1 : 0) - a.down) * (1 - Math.exp(-6 * dt));
    const moving = st ? 0 : (pr.m || 0);
    a.amp += ((moving ? (moving === 2 ? 1 : 0.65) : 0) - a.amp) * (1 - Math.exp(-10 * dt));
    a.ph += dt * (moving === 2 ? 11 : 7);
    const sw = Math.sin(a.ph) * a.amp;
    a.legs[0].rotation.x = sw * 0.75; a.legs[1].rotation.x = -sw * 0.75;
    a.armL.sh.rotation.x = -sw * 0.7; a.armL.el.rotation.x = -0.2 - Math.max(0, sw) * 0.4;
    // right arm holds the light forward
    a.armR.sh.rotation.x = 1.25 + Math.sin(a.ph * 2) * 0.04 * a.amp; a.armR.el.rotation.x = 0.15;
    a.cr += ((pr.cr && !st ? 1 : 0) - a.cr) * (1 - Math.exp(-10 * dt));
    a.body.scale.y = 1 - 0.3 * a.cr;
    a.beam.position.y = 1.28 - 0.4 * a.cr;
    a.body.position.y = Math.abs(Math.cos(a.ph)) * 0.035 * a.amp;
    a.body.rotation.x = -a.down * 1.45 + a.amp * 0.07;               // topple backwards when downed
    a.body.position.y += a.down * 0.2;
    a.body.position.z = a.down * 0.55;
    a.head.rotation.x = a.down * 0.25;
    a.beam.visible = a.lens.visible = !!pr.f && !st;
    if (st !== a.state) a.state = st;
  }

  // called every frame; returns the teammates (also kept in net.mates)
  net.tick = function (dt, P, S, world, sc) {
    if (!net.active || !net.room) return null;
    if (sc && sc !== scene) scene = sc;
    sendT += dt;
    if (rev.hold > 0) { rev.hold -= dt; if (rev.hold <= 0) rev = { id: null, p: 0, hold: 0 }; }
    const state = S.mode === 'downed' ? 1 : (S.mode === 'dying' || S.mode === 'dead') ? 2 : 0;
    if (sendT > 0.066 || state !== lastState || net.nick !== lastNick) {
      sendT = 0; lastState = state; lastNick = net.nick;
      const mv = Math.hypot(P.vx, P.vz);
      net.room.presence({
        n: net.nick, x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, y: Math.round(P.yaw * 100) / 100,
        m: mv > 0.5 ? (P.sprint ? 2 : 1) : 0, f: S.flashOn && S.battery > 0 ? 1 : 0, d: state,
        rv: rev.id, rp: Math.round(rev.p * 100) / 100, cr: P.cr ? 1 : 0, j: Math.round(P.jy * 100) / 100
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
      animate(a, pr, dt);
      a.group.position.y = typeof pr.j === 'number' ? Math.max(0, Math.min(1, pr.j)) : 0;
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
        net.handlers.remotePick && net.handlers.remotePick(idx);
      }
    }
    avatars.forEach((a, id) => { if (!live.has(id)) { if (a.group.parent) a.group.parent.remove(a.group); avatars.delete(id); } });
    net.mates = list;
    return list;
  };
})(window.BR);
