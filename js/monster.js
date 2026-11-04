/* BACKROOMS — the entity as a real 3D creature.
   Tall and starved, long arms that nearly reach the floor, legs that bend backwards, a stretched pale head
   with no eyes and a wide grin of small, glowing teeth. It runs in a hunched sprint when it hunts.
   The model faces +z; game.js turns it with rotation.y.
   BR.makeMonster() -> { group, update(dt, { speed, hunting, lunge, onStep }), front() } */
window.BR = window.BR || {};

(function (BR) {
  function wrinkle(geo, amp, seed) {
    const p = geo.attributes.position, nn = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const w = Math.sin(y * 17 + seed + Math.sin(x * 13 + seed * 1.3) * 1.8) * 0.5 + Math.sin(x * 23 + z * 17 + seed * 2.1) * 0.5;
      p.setXYZ(i, x + nn.getX(i) * w * amp, y + nn.getY(i) * w * amp, z + nn.getZ(i) * w * amp);
    }
    geo.computeVertexNormals();
    return geo;
  }
  // profiles may be listed top-down; LatheGeometry wants them bottom-up so faces point outward
  const lathe = (pts, seg) => new THREE.LatheGeometry((pts[0][1] > pts[pts.length - 1][1] ? pts.slice().reverse() : pts).map(([r, y]) => new THREE.Vector2(r, y)), seg || 10);

  BR.makeMonster = function () {
    const skin = new THREE.MeshStandardMaterial({ color: 0x23211f, roughness: 0.62, metalness: 0.05, emissive: 0x181614, emissiveIntensity: 0.9 });
    const skinD = new THREE.MeshStandardMaterial({ color: 0x141312, roughness: 0.8, emissive: 0x0b0a09, emissiveIntensity: 0.8 });
    const bone = new THREE.MeshStandardMaterial({ color: 0x9a9585, roughness: 0.55, emissive: 0x3a372e, emissiveIntensity: 0.7 });
    const pale = new THREE.MeshStandardMaterial({ color: 0xbdb9a6, roughness: 0.5, emissive: 0x4a4638, emissiveIntensity: 0.8 });
    const teethM = new THREE.MeshBasicMaterial({ color: 0xfff0c2 });
    const mouthM = new THREE.MeshBasicMaterial({ color: 0x050303 });
    const mesh = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };

    const g = new THREE.Group();
    const hips = new THREE.Group(); hips.position.y = 1.3; g.add(hips);
    mesh(wrinkle(new THREE.SphereGeometry(0.16, 12, 10), 0.01, 2), skin, 0, 0, 0, hips);

    // spine group: leans forward when it runs
    const spine = new THREE.Group(); hips.add(spine);
    mesh(wrinkle(lathe([[0, 0], [0.13, 0.02], [0.15, 0.2], [0.17, 0.5], [0.2, 0.78], [0.12, 0.92], [0, 0.95]], 14), 0.012, 5), skin, 0, 0, 0, spine).scale.set(1, 1, 0.72);
    for (let k = 0; k < 6; k++) {                                       // ribs pressing through the skin
      const rib = mesh(new THREE.TorusGeometry(0.15 + k * 0.006, 0.008, 5, 16), bone, 0, 0.3 + k * 0.085, 0, spine);
      rib.rotation.x = Math.PI / 2 + 0.2; rib.scale.set(1, 0.74, 1);
    }
    mesh(new THREE.BoxGeometry(0.02, 0.5, 0.02), bone, 0, 0.5, 0.14, spine);                 // spine ridge along the back
    for (let k = 0; k < 7; k++) mesh(new THREE.SphereGeometry(0.022, 5, 4), bone, 0, 0.22 + k * 0.1, -0.145, spine);

    // neck + head (hangs forward, tilts, twitches)
    const neck = new THREE.Group(); neck.position.set(0, 0.92, 0.02); spine.add(neck);
    mesh(wrinkle(lathe([[0.05, 0], [0.06, 0.2], [0.05, 0.42], [0, 0.44]], 8), 0.006, 9), skin, 0, 0, 0, neck);
    const head = new THREE.Group(); head.position.set(0, 0.5, 0.05); neck.add(head);
    const skullG = new THREE.SphereGeometry(0.13, 18, 14); skullG.scale(0.82, 1.55, 0.95);
    mesh(wrinkle(skullG, 0.004, 4), pale, 0, 0.12, 0, head);
    const faceZ = (x, y) => 0.12 * Math.sqrt(Math.max(0.04, 1 - (x / 0.108) * (x / 0.108) - ((y - 0.12) / 0.2) * ((y - 0.12) / 0.2)));   // skull surface in front
    [-1, 1].forEach((s) => mesh(new THREE.SphereGeometry(0.02, 6, 6), skinD, s * 0.055, 0.2, faceZ(0.055, 0.2) - 0.004, head).scale.set(1, 1.5, 0.5));   // empty sockets
    // the grin: a dark slit with a curve of small teeth, up and down
    for (let k = 0; k < 15; k++) {
      const u = k / 14 * 2 - 1, x = u * 0.088, y = 0.03 + u * u * 0.05, z = faceZ(x, y) + 0.006;
      mesh(new THREE.BoxGeometry(0.016, 0.05, 0.008), mouthM, x, y - 0.012, z - 0.002, head).rotation.z = -u * 0.3;
      const up = mesh(new THREE.ConeGeometry(0.0075, 0.028, 4), teethM, x, y + 0.004, z + 0.004, head); up.rotation.x = Math.PI; up.rotation.z = -u * 0.3;
      const dn = mesh(new THREE.ConeGeometry(0.0075, 0.024, 4), teethM, x, y - 0.03, z + 0.002, head); dn.rotation.z = -u * 0.3;
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: BR.tex && BR.tex.dust ? BR.tex.dust() : null, color: 0xfff0c2, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.35, fog: false }));
    glow.scale.set(0.55, 0.35, 1); glow.position.set(0, 0.02, 0.15); head.add(glow);

    // arms: very long, thin, with hooked fingers
    const mkArm = (s, seed) => {
      const sh = new THREE.Group(); sh.position.set(s * 0.22, 0.78, 0); spine.add(sh);
      mesh(new THREE.SphereGeometry(0.06, 8, 6), skin, 0, 0, 0, sh);
      mesh(wrinkle(lathe([[0, 0.02], [0.05, 0], [0.042, -0.3], [0.035, -0.62], [0, -0.63]], 8), 0.006, seed), skin, 0, 0, 0, sh);
      const el = new THREE.Group(); el.position.y = -0.62; sh.add(el);
      mesh(new THREE.SphereGeometry(0.04, 8, 6), bone, 0, 0, 0, el);
      mesh(wrinkle(lathe([[0, 0.02], [0.036, 0], [0.03, -0.35], [0.024, -0.68], [0, -0.7]], 8), 0.005, seed + 3), skin, 0, 0, 0, el);
      const hand = new THREE.Group(); hand.position.y = -0.7; el.add(hand);
      mesh(new THREE.BoxGeometry(0.07, 0.1, 0.03), skin, 0, -0.04, 0, hand);
      for (let f = 0; f < 4; f++) {
        const fg = new THREE.CylinderGeometry(0.006, 0.011, 0.26, 5); fg.translate(0, -0.13, 0);
        const fi = mesh(fg, bone, (f - 1.5) * 0.02, -0.09, 0, hand); fi.rotation.x = 0.35 + (f % 2) * 0.15; fi.rotation.z = (f - 1.5) * 0.07;
      }
      return { sh, el };
    };
    const armL = mkArm(-1, 11), armR = mkArm(1, 17);

    // legs bend backwards (digitigrade): thigh, shin, long foot
    const mkLeg = (s, seed) => {
      const th = new THREE.Group(); th.position.set(s * 0.11, -0.02, 0); hips.add(th);
      mesh(wrinkle(lathe([[0, 0.02], [0.085, 0], [0.075, -0.36], [0.05, -0.72], [0, -0.73]], 10), 0.008, seed), skin, 0, 0, 0, th);
      const kn = new THREE.Group(); kn.position.y = -0.72; th.add(kn);
      mesh(new THREE.SphereGeometry(0.052, 8, 6), bone, 0, 0, 0, kn);
      mesh(wrinkle(lathe([[0, 0.02], [0.048, 0], [0.04, -0.4], [0.026, -0.76], [0, -0.77]], 8), 0.006, seed + 2), skin, 0, 0, 0, kn);
      const ft = new THREE.Group(); ft.position.y = -0.76; kn.add(ft);
      const footG = new THREE.BoxGeometry(0.08, 0.04, 0.34); footG.translate(0, -0.02, 0.12);
      mesh(footG, skinD, 0, 0, 0, ft);
      for (let k = 0; k < 3; k++) mesh(new THREE.ConeGeometry(0.01, 0.07, 4), bone, (k - 1) * 0.026, -0.03, 0.31, ft).rotation.x = Math.PI / 2;
      return { th, kn, ft };
    };
    const legL = mkLeg(-1, 23), legR = mkLeg(1, 29);

    let ph = 0, amp = 0, lean = 0, tw = 0, twT = 1, stepSide = 0, tAll = 0, lastS = 0;
    const api = {
      group: g,
      update(dt, o) {
        tAll += dt;
        const speed = o.speed || 0, hunting = !!o.hunting, lunge = o.lunge || 0;
        const targetAmp = Math.min(1, speed / 3.4);
        amp += (targetAmp - amp) * Math.min(1, dt * 6);
        ph += dt * (1.2 + speed * 2.6) * (hunting ? 1 : 0.8);
        const sw = Math.sin(ph), sw2 = Math.sin(ph + Math.PI);
        const run = amp;
        // legs: big strides, knees snap back
        [[legL, sw], [legR, sw2]].forEach(([L, v]) => {
          L.th.rotation.x = -0.4 + v * (0.35 + 0.75 * run);
          L.kn.rotation.x = 0.95 + Math.max(0, -v) * (0.3 + 1.0 * run) - v * 0.1;
          L.ft.rotation.x = -0.55 - Math.max(0, v) * 0.3 * run;
        });
        // arms swing wide opposite the legs; at a sprint they trail behind
        armL.sh.rotation.x = -0.12 + sw2 * (0.25 + 0.95 * run) - run * 0.25; armL.el.rotation.x = -0.2 - run * 0.7 - Math.max(0, sw2) * 0.5 * run;
        armR.sh.rotation.x = -0.12 + sw * (0.25 + 0.95 * run) - run * 0.25; armR.el.rotation.x = -0.2 - run * 0.7 - Math.max(0, sw) * 0.5 * run;
        armL.sh.rotation.z = 0.12; armR.sh.rotation.z = -0.12;
        // torso: hunched, leaning into the run, rolling with the stride
        const leanT = (hunting ? 0.18 : 0.06) + run * (hunting ? 0.5 : 0.18) + lunge * 0.9;
        lean += (leanT - lean) * Math.min(1, dt * 8);
        spine.rotation.x = lean; spine.rotation.z = sw * 0.08 * run; spine.rotation.y = sw * 0.14 * run;
        hips.position.y = 1.3 - lunge * 0.25 - run * 0.1 + Math.abs(Math.cos(ph)) * 0.09 * run;
        hips.rotation.y = -sw * 0.1 * run;
        // head: counter-rotates, hangs forward, twitches in jerks
        twT -= dt;
        if (twT <= 0) { twT = 0.4 + Math.random() * 2.2; tw = (Math.random() - 0.5) * (hunting ? 0.5 : 1.1); }
        neck.rotation.x = 0.35 + lunge * 0.5 - lean * 0.5 + (hunting ? 0.15 : 0);
        head.rotation.x = 0.1 + Math.sin(tAll * 23) * (hunting ? 0.04 : 0.012) + lunge * 0.3;
        head.rotation.y += (tw - head.rotation.y) * Math.min(1, dt * 14);
        head.rotation.z = Math.sin(tAll * 1.3) * 0.12 + tw * 0.25 + (lunge ? Math.sin(tAll * 60) * 0.1 * lunge : 0);
        glow.material.opacity = 0.28 + 0.12 * Math.sin(tAll * 3) + (hunting ? 0.2 : 0);
        // footfalls
        const side = sw > 0 ? 1 : -1;
        if (side !== stepSide) { stepSide = side; if (o.onStep && run > 0.1) o.onStep(run); }
      },
      // for the death lunge: draw on top of the world
      front() {
        g.traverse((m) => { if (m.material) { const ms = Array.isArray(m.material) ? m.material : [m.material]; ms.forEach((x) => { x.depthTest = false; }); m.renderOrder = 999; } });
      }
    };
    api.update(0, { speed: 0 });
    return api;
  };
})(window.BR);
