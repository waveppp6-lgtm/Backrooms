/* BACKROOMS — first-person arms: a gloved hand holding the flashlight on the right, a free hand on the left.
   Attached to the camera; game.js calls vm.update() every frame with the player's movement state. */
window.BR = window.BR || {};

(function (BR) {
  BR.makeViewmodel = function (camera) {
    const mat = (c, rough, em, metal) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal || 0, emissive: c, emissiveIntensity: em || 0.12 });
    const suit = mat(0xcdc95e, 0.85, 0.18), suitD = mat(0xa9a64a, 0.9, 0.12), glove = mat(0x1d211d, 0.55, 0.03), steel = mat(0x3a3c3e, 0.35, 0.05, 0.7);
    const lensM = new THREE.MeshBasicMaterial({ color: 0xfff2cf });
    const root = new THREE.Group(); camera.add(root);
    const part = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.frustumCulled = false; (parent || root).add(o); return o; };
    const cylZ = (r0, r1, len) => { const g = new THREE.CylinderGeometry(r0, r1, len, 14); g.rotateX(Math.PI / 2); return g; };   // runs along z

    const arm = (side) => {
      const g = new THREE.Group(); root.add(g);
      // padded sleeve (bulky coverall), cuff, glove with a thumb and a knuckle ridge
      part(cylZ(0.062, 0.052, 0.62), suit, 0, 0, 0.0, g);
      const cuff = part(new THREE.TorusGeometry(0.05, 0.012, 6, 16), suitD, 0, 0, -0.3, g);
      const hand = new THREE.Group(); hand.position.z = -0.37; g.add(hand);
      const palm = new THREE.SphereGeometry(0.052, 12, 10); palm.scale(1, 0.85, 1.25);
      part(palm, glove, 0, 0, 0, hand);
      part(new THREE.BoxGeometry(0.075, 0.03, 0.06), glove, 0, 0.012, -0.05, hand);
      const thumb = part(new THREE.SphereGeometry(0.02, 8, 6), glove, -side * 0.048, -0.004, -0.015, hand); thumb.scale.set(1, 0.8, 1.6);
      for (let k = 0; k < 4; k++) part(new THREE.CylinderGeometry(0.0085, 0.0085, 0.05, 6), glove, -0.027 + k * 0.018, -0.016, -0.065, hand).rotation.x = 1.9;
      return { g, hand };
    };
    const R = arm(1), L = arm(-1);
    // flashlight in the right hand, lens glowing toward the front
    const torch = new THREE.Group(); R.hand.add(torch);
    part(cylZ(0.03, 0.028, 0.2), steel, 0, -0.012, -0.03, torch);
    part(cylZ(0.046, 0.034, 0.07), steel, 0, -0.012, -0.16, torch);
    part(new THREE.CircleGeometry(0.04, 14), lensM, 0, -0.012, -0.196, torch).rotation.y = Math.PI;
    for (let k = 0; k < 3; k++) part(new THREE.TorusGeometry(0.031, 0.003, 4, 12), glove, 0, -0.012, 0.03 - k * 0.025, torch);

    const base = { rx: 0.27, ry: -0.3, rz: -0.34, lx: -0.28, ly: -0.36, lz: -0.3 };
    root.visible = false;
    let lyaw = null, swayX = 0, swayY = 0, lift = 0, tt = 0;
    return {
      root, torch,
      // st: { visible, mv (0..1 pace), sprint, crouch (0..1), air, bob, yaw, pitch, flashOn, t }
      update(dt, st) {
        root.visible = !!st.visible;
        if (!st.visible) { lyaw = null; return; }
        tt += dt;
        if (lyaw === null) lyaw = st.yaw;
        let dy = st.yaw - lyaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); lyaw = st.yaw;
        const k = 1 - Math.exp(-9 * dt);
        swayX += ((-dy * 2.2) - swayX) * k;                         // arms lag behind a fast turn
        swayY += ((-(st.pitchV || 0) * 1.2) - swayY) * k;
        swayX = Math.max(-0.12, Math.min(0.12, swayX)); swayY = Math.max(-0.08, Math.min(0.08, swayY));
        const run = st.sprint ? 1 : 0, amp = st.mv * (run ? 1.7 : 1) * (st.air ? 0.2 : 1);
        lift += ((st.air ? 1 : 0) - lift) * (1 - Math.exp(-10 * dt));
        const b1 = Math.sin(st.bob * 2) * 0.014 * amp, b2 = Math.cos(st.bob) * 0.012 * amp, b3 = Math.sin(st.bob) * 0.05 * amp;
        const idle = Math.sin(tt * 1.7) * 0.003;
        const cr = st.crouch;
        // right arm (flashlight): holds steady; swings and drops lower when sprinting
        R.g.position.set(base.rx + b2 + swayX * 0.5, base.ry + b1 + idle - 0.03 * run - 0.05 * cr + 0.03 * lift + swayY * 0.5, base.rz + 0.04 * run);
        R.g.rotation.set(0.05 + 0.22 * run + b3 * 0.6 - 0.35 * lift, 0.14 + b2 * 2 + swayX * 0.6, -0.05 - b2 * 3);
        // left arm: swings with the stride, thrown up when jumping
        L.g.position.set(base.lx - b2 + swayX * 0.7, base.ly - b1 + idle * 0.7 - 0.06 * run - 0.06 * cr + 0.2 * lift, base.lz + 0.03 * run - 0.1 * lift);
        L.g.rotation.set(0.38 + 0.25 * run - b3 - 0.9 * lift, -0.2 - b2 * 2 + swayX * 0.5, 0.08 + b2 * 3);
        torch.rotation.x = 0.04;
      }
    };
  };
})(window.BR);
