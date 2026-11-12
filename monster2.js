/* BACKROOMS — the second entity: THE SKITTER.
   A low, six-limbed crawler: a long wet-looking body slung between spidery legs, a whipping tail of bone segments,
   and a faceless head whose jaw splits open VERTICALLY into rows of needle teeth, with a cluster of ember eyes.
   Nothing like the tall black walker — this one scuttles, freezes, and lunges.
   The model faces +z. BR.makeCrawler() -> { group, update(dt, { speed, hunting, lunge, onStep }), front() } */
window.BR = window.BR || {};

(function (BR) {
  function wrinkle(geo, amp, seed) {
    const p = geo.attributes.position, nn = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const w = Math.sin(y * 19 + seed + Math.sin(x * 11 + seed * 1.7) * 2.1) * 0.5 + Math.sin(z * 21 + x * 15 + seed * 2.3) * 0.5;
      p.setXYZ(i, x + nn.getX(i) * w * amp, y + nn.getY(i) * w * amp, z + nn.getZ(i) * w * amp);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const lathe = (pts, seg) => new THREE.LatheGeometry((pts[0][1] > pts[pts.length - 1][1] ? pts.slice().reverse() : pts).map(([r, y]) => new THREE.Vector2(r, y)), seg || 12);

  BR.makeCrawler = function () {
    const flesh = new THREE.MeshStandardMaterial({ color: 0x5a2a26, roughness: 0.38, metalness: 0.08, emissive: 0x2a0d0b, emissiveIntensity: 0.9 });
    const fleshD = new THREE.MeshStandardMaterial({ color: 0x2e1513, roughness: 0.5, emissive: 0x160706, emissiveIntensity: 0.8 });
    const chitin = new THREE.MeshStandardMaterial({ color: 0x1b1716, roughness: 0.3, metalness: 0.45, emissive: 0x0e0b0a, emissiveIntensity: 0.9 });
    const boneM = new THREE.MeshStandardMaterial({ color: 0xcfc3a4, roughness: 0.5, emissive: 0x4a4230, emissiveIntensity: 0.7 });
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xff7a1c });
    const throat = new THREE.MeshBasicMaterial({ color: 0x1a0204, side: THREE.DoubleSide });
    const mesh = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };

    const g = new THREE.Group();
    const body = new THREE.Group(); body.position.y = 0.52; g.add(body);

    // torso: a long lathe laid along z (abdomen at the back, narrow thorax, then the neck)
    const torsoG = lathe([[0, -0.9], [0.1, -0.85], [0.26, -0.6], [0.3, -0.3], [0.22, 0], [0.17, 0.25], [0.12, 0.5], [0.08, 0.62], [0, 0.66]], 18);
    torsoG.rotateX(Math.PI / 2);
    const torso = mesh(wrinkle(torsoG, 0.014, 3), flesh, 0, 0, 0, body); torso.scale.set(1, 0.82, 1);
    // pale belly plates and dark back plates
    for (let k = 0; k < 9; k++) {
      const z = -0.7 + k * 0.17, r = 0.2 + 0.09 * Math.sin((k / 8) * Math.PI) * 1.0;
      const plate = mesh(new THREE.TorusGeometry(r, 0.012, 5, 18, Math.PI), chitin, 0, 0.01, z, body);
      plate.rotation.z = 0; plate.scale.set(1, 0.85, 1);
      const belly = mesh(new THREE.TorusGeometry(r * 0.96, 0.008, 4, 14, Math.PI), boneM, 0, -0.01, z, body);
      belly.rotation.z = Math.PI; belly.scale.set(1, 0.7, 1);
    }
    // back spikes
    for (let k = 0; k < 8; k++) {
      const h = 0.05 + 0.07 * Math.sin((k / 7) * Math.PI), z = -0.72 + k * 0.17;
      const sp = mesh(new THREE.ConeGeometry(0.018, h, 5), boneM, 0, 0.27 * (1 - Math.abs(z + 0.3) * 0.5) + 0.02, z, body);
      sp.rotation.x = -0.35;
    }
    // pulsing sacs on the abdomen
    const sacs = [];
    for (let k = 0; k < 4; k++) {
      const s = mesh(new THREE.SphereGeometry(0.05 + (k % 2) * 0.02, 8, 6), new THREE.MeshStandardMaterial({ color: 0x8a3a2a, emissive: 0x5a1408, emissiveIntensity: 0.9, roughness: 0.3 }), (k % 2 ? 0.14 : -0.14), 0.2, -0.6 + k * 0.08, body);
      sacs.push(s);
    }

    // tail: a whip of bone segments
    const tail = []; let tp = body; let tz = -0.86;
    for (let k = 0; k < 7; k++) {
      const seg = new THREE.Group(); seg.position.set(0, 0, tz); tp.add(seg);
      const len = 0.2 - k * 0.012, r = 0.05 - k * 0.0055;
      const cg = new THREE.CylinderGeometry(r * 0.75, r, len, 6); cg.rotateX(Math.PI / 2); cg.translate(0, 0, -len / 2);
      mesh(cg, k % 2 ? chitin : boneM, 0, 0, 0, seg);
      tail.push(seg); tp = seg; tz = -len;
    }
    const stinger = new THREE.ConeGeometry(0.03, 0.2, 6); stinger.rotateX(-Math.PI / 2); stinger.translate(0, 0, -0.1);
    mesh(stinger, boneM, 0, 0, tz, tp);

    // neck + head
    const neck = new THREE.Group(); neck.position.set(0, 0.02, 0.6); body.add(neck);
    mesh((() => { const c = new THREE.CylinderGeometry(0.055, 0.075, 0.3, 8); c.rotateX(Math.PI / 2); c.translate(0, 0, 0.14); return wrinkle(c, 0.006, 8); })(), fleshD, 0, 0, 0, neck);
    for (let k = 0; k < 4; k++) mesh(new THREE.TorusGeometry(0.07 - k * 0.002, 0.008, 5, 12), boneM, 0, 0, 0.05 + k * 0.07, neck);
    const head = new THREE.Group(); head.position.set(0, 0, 0.3); neck.add(head);
    const skullG = new THREE.SphereGeometry(0.15, 18, 14); skullG.scale(0.72, 0.8, 1.35);
    mesh(wrinkle(skullG, 0.004, 5), chitin, 0, 0.01, 0.1, head);
    // eyes: six embers in two columns, set along the sides of the skull
    const eyes = [];
    [-1, 1].forEach((s) => {
      [[0.095, 0.07, 0.02], [0.105, 0.035, 0.1], [0.09, 0.0, 0.17]].forEach(([x, y, z], k) => {
        const e = mesh(new THREE.SphereGeometry(0.018 - k * 0.002, 8, 6), eyeM, s * x, y, z, head); eyes.push(e);
      });
    });
    const glowSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: BR.tex && BR.tex.dust ? BR.tex.dust() : null, color: 0xff7a1c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.35 }));
    glowSp.scale.set(0.7, 0.4, 1); glowSp.position.set(0, 0.04, 0.18); head.add(glowSp);

    // the vertical jaw: two halves hinged at the sides that swing apart left/right, lined with needle teeth
    const mkJaw = (s) => {
      const hinge = new THREE.Group(); hinge.position.set(s * 0.02, -0.01, 0.2); head.add(hinge);
      const shell = new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI, 0, Math.PI); shell.scale(0.6, 0.85, 1.1);
      const half = mesh(shell, fleshD, 0, 0, 0.07, hinge); half.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      for (let k = 0; k < 9; k++) {
        const u = k / 8, y = -0.075 + u * 0.15, z = 0.1 + Math.sin(u * Math.PI) * 0.045;
        const t = mesh(new THREE.ConeGeometry(0.006, 0.04 + 0.02 * Math.sin(u * Math.PI), 4), boneM, 0, y, z, hinge);
        t.rotation.x = Math.PI / 2; t.rotation.z = (u - 0.5) * 0.4;
        const t2 = mesh(new THREE.ConeGeometry(0.0045, 0.03, 4), boneM, s * 0.012, y + 0.008, z - 0.01, hinge); t2.rotation.x = Math.PI / 2;
      }
      return hinge;
    };
    const jawL = mkJaw(-1), jawR = mkJaw(1);
    // dark throat between the halves
    mesh(new THREE.PlaneGeometry(0.1, 0.18), throat, 0, 0, 0.19, head);
    // feelers
    const feelers = [-1, 1].map((s) => {
      const f = new THREE.Group(); f.position.set(s * 0.06, 0.09, 0.18); head.add(f);
      const cg = new THREE.CylinderGeometry(0.004, 0.012, 0.45, 5); cg.rotateX(Math.PI / 2); cg.translate(0, 0, 0.22);
      mesh(cg, boneM, 0, 0, 0, f); f.rotation.x = -0.4; f.rotation.y = s * 0.35;
      return { f, s };
    });

    // six legs (three pairs): hip -> long upper segment up and out -> knee -> lower segment down to a claw
    const legs = [];
    const mkLeg = (s, zOff, seed, phase) => {
      const hip = new THREE.Group(); hip.position.set(s * 0.2, 0.02, zOff); body.add(hip);
      const swing = new THREE.Group(); hip.add(swing);
      const up = new THREE.Group(); up.rotation.z = s * 2.15; swing.add(up);
      const ug = lathe([[0, 0], [0.042, -0.02], [0.034, -0.35], [0.024, -0.72], [0, -0.74]], 7);
      mesh(wrinkle(ug, 0.004, seed), chitin, 0, 0, 0, up);
      mesh(new THREE.SphereGeometry(0.045, 8, 6), fleshD, 0, 0, 0, up);
      const kn = new THREE.Group(); kn.position.y = -0.72; up.add(kn);
      mesh(new THREE.SphereGeometry(0.036, 8, 6), boneM, 0, 0, 0, kn);
      const lg = lathe([[0, 0], [0.03, -0.02], [0.022, -0.45], [0.012, -0.92], [0, -0.96]], 6);
      mesh(wrinkle(lg, 0.003, seed + 2), chitin, 0, 0, 0, kn);
      mesh(new THREE.ConeGeometry(0.014, 0.12, 5), boneM, 0, -0.97, 0.01, kn).rotation.x = 0.3;
      legs.push({ hip, swing, up, kn, s, phase, zOff });
    };
    mkLeg(-1, 0.3, 31, 0); mkLeg(1, 0.3, 37, Math.PI);
    mkLeg(-1, 0.02, 41, Math.PI); mkLeg(1, 0.02, 43, 0);
    mkLeg(-1, -0.3, 47, 0); mkLeg(1, -0.3, 53, Math.PI);

    let ph = 0, amp = 0, tAll = 0, lastSide = 0, twitchT = 1, tw = 0, freeze = 0, jaw = 0, crouchK = 0;
    const api = {
      group: g,
      update(dt, o) {
        tAll += dt;
        const speed = o.speed || 0, hunting = !!o.hunting, lunge = o.lunge || 0;
        amp += (Math.min(1, speed / 4) - amp) * Math.min(1, dt * 7);
        const run = amp, A = 0.28 + 0.34 * run;
        ph += dt * Math.min(18, speed * Math.PI / (1.3 * A)) * (speed > 0.05 ? 1 : 0.0);   // stride length matches ground speed: no skating
        // legs: tripod gait; the lower joint folds on the lift
        legs.forEach((L) => {
          const v = Math.sin(ph + L.phase), lift = Math.max(0, v);
          L.swing.rotation.y = L.s * (v * (0.28 + 0.34 * run)) * (L.zOff > 0 ? -1 : L.zOff < 0 ? 1 : 0.4) * 1;
          L.up.rotation.z = L.s * (2.15 - lift * (0.35 + 0.35 * run) - (lunge ? 0.4 * lunge : 0));
          L.kn.rotation.z = -L.s * (2.15 - 0.2) + L.s * lift * (0.6 + 0.5 * run) - L.s * 0.08 * Math.sin(tAll * 40 * (run > 0.05 ? 0 : 1));
        });
        // body: low scuttle, rolls with the gait, rears up and lunges at the end
        crouchK += ((hunting ? 0.08 : 0.0) - crouchK) * Math.min(1, dt * 6);
        body.position.y = 0.52 - crouchK - run * 0.04 + Math.abs(Math.sin(ph)) * 0.025 * run + lunge * 0.28;
        body.rotation.z = Math.sin(ph) * 0.05 * run;
        body.rotation.y = Math.sin(ph * 0.5) * 0.09 * run;
        body.rotation.x = -lunge * 0.5 + (hunting ? 0.04 : 0);
        sacs.forEach((s, k) => { const b = 1 + Math.sin(tAll * (3 + k) + k) * 0.12; s.scale.set(b, b, b); });
        // tail whips side to side, curling up when idle
        tail.forEach((s, k) => {
          s.rotation.y = Math.sin(tAll * (hunting ? 7 : 2.4) - k * 0.7) * (0.1 + 0.05 * k) * (0.6 + run);
          s.rotation.x = 0.22 + (hunting ? -0.05 : 0.08) * k * 0.4 + Math.sin(tAll * 1.3 + k * 0.5) * 0.04;
        });
        // head: freezes, twitches, snaps toward things
        twitchT -= dt;
        if (twitchT <= 0) { twitchT = 0.25 + Math.random() * 1.6; tw = (Math.random() - 0.5) * (hunting ? 0.5 : 1.0); freeze = Math.random() < 0.25 ? 0.2 : 0; }
        neck.rotation.x = 0.1 - lunge * 0.35 + (hunting ? -0.1 : 0.05);
        head.rotation.y += (tw - head.rotation.y) * Math.min(1, dt * 16);
        head.rotation.z = Math.sin(tAll * 1.7) * 0.1 + tw * 0.2 + (lunge ? Math.sin(tAll * 70) * 0.08 * lunge : 0);
        head.rotation.x = Math.sin(tAll * 27) * (hunting ? 0.03 : 0.008);
        // jaws: closed while it prowls, flaring open when it hunts, wide for the lunge
        const jawT = lunge ? 0.5 + lunge * 0.7 : hunting ? 0.45 + Math.sin(tAll * 14) * 0.08 : 0.06 + Math.sin(tAll * 2) * 0.03;
        jaw += (jawT - jaw) * Math.min(1, dt * 12);
        jawL.rotation.y = jaw; jawR.rotation.y = -jaw;
        feelers.forEach((F) => { F.f.rotation.x = -0.4 + Math.sin(tAll * (hunting ? 9 : 3) + F.s) * 0.18; F.f.rotation.y = F.s * (0.35 + Math.sin(tAll * 4 + F.s * 2) * 0.2); });
        const flick = hunting ? 1 : 0.55 + 0.25 * Math.sin(tAll * 2);
        glowSp.material.opacity = 0.2 + 0.2 * flick + (lunge ? 0.2 : 0);
        eyes.forEach((e, k) => { const s = 1 + 0.18 * Math.sin(tAll * 5 + k * 1.3) * (hunting ? 1.5 : 0.7); e.scale.set(s, s, s); });
        const side = Math.sin(ph) > 0 ? 1 : -1;
        if (side !== lastSide) { lastSide = side; if (o.onStep && run > 0.1) o.onStep(run * 0.7); }
      },
      front() {
        g.traverse((m) => { if (m.material) { const ms = Array.isArray(m.material) ? m.material : [m.material]; ms.forEach((x) => { x.depthTest = false; }); m.renderOrder = 999; } });
      }
    };
    api.update(0, { speed: 0 });
    return api;
  };
})(window.BR);
