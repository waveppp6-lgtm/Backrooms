/* BACKROOMS — the exit elevator. Built into the dead-end tile that used to hold the exit door:
   a steel cabin with sliding doors; the doors open once all three fuses are in. Step inside and press the button to ride to the next map. */
window.BR = window.BR || {};

(function (BR) {
  function signTexture(open) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = open ? '#06240f' : '#2a0606'; x.fillRect(0, 0, 256, 96);
    x.strokeStyle = open ? '#5dff9a' : '#ff4a3a'; x.lineWidth = 4; x.strokeRect(4, 4, 248, 88);
    x.fillStyle = open ? '#5dff9a' : '#ff4a3a';
    x.font = 'bold 52px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(open ? '▲ OPEN' : '▲ LOCKED', 128, 50);
    return new THREE.CanvasTexture(c);
  }

  // returns { x, z, open(), update(t), ... }  (x,z = the spot in front of the doors, used by the compass and the "no power" hint)
  BR.buildElevator = function (scene, w, ex, wallDir, opts) {
    const T = w.TILE, H = w.H;
    const th = Math.atan2(-wallDir[0], -wallDir[1]), sn = Math.sin(th), cs = Math.cos(th);
    const gx = opts && opts.free ? opts.x : w.center(ex.i) + wallDir[0] * (T / 2 - 0.02), gz = opts && opts.free ? opts.z : w.center(ex.j) + wallDir[1] * (T / 2 - 0.02);
    const toW = (lx, lz) => [gx + lx * cs + lz * sn, gz - lx * sn + lz * cs];
    const G = new THREE.Group(); G.position.set(gx, 0, gz); G.rotation.y = th; scene.add(G);

    const steel = new THREE.MeshStandardMaterial({ color: 0x9a9c9c, metalness: 0.55, roughness: 0.42, emissive: 0x161818, emissiveIntensity: 0.6 });
    const steelD = new THREE.MeshStandardMaterial({ color: 0x4c4e50, metalness: 0.6, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x141515, roughness: 0.8 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1d1e1e, roughness: 0.95 });
    const lampM = new THREE.MeshStandardMaterial({ color: 0x3a3830, emissive: 0xfff0d0, emissiveIntensity: 0.1 });
    const btnIdle = new THREE.MeshStandardMaterial({ color: 0x3a2a08, emissive: 0xffb020, emissiveIntensity: 0.0 });
    const box = (x0, x1, y0, y1, z0, z1, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m || steel); o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); G.add(o); return o; };
    const aabb = (x0, x1, z0, z1, door) => {
      const a = toW(x0, z0), b = toW(x1, z1);
      const bx = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]), door: door || null };
      w.boxes.push(bx); return bx;
    };

    const FZ = 1.9, FT = 0.12, DW = 0.65, DH = 2.3, SX = 1.4;
    // shell: side walls, front pieces either side of the doorway, fascia above it (all the way to the ceiling)
    box(-SX, -SX + 0.1, 0, H, 0, FZ + FT); box(SX - 0.1, SX, 0, H, 0, FZ + FT);
    box(-SX, -DW, 0, H, FZ, FZ + FT); box(DW, SX, 0, H, FZ, FZ + FT);
    box(-DW, DW, DH, H, FZ, FZ + FT);
    aabb(-SX, -SX + 0.1, 0, FZ + FT); aabb(SX - 0.1, SX, 0, FZ + FT);
    aabb(-SX, -DW, FZ, FZ + FT); aabb(DW, SX, FZ, FZ + FT);
    if (opts && opts.free) {                                    // standing in the open: back wall + roof, so it reads as a booth on the island
      box(-SX, SX, 0, H, -0.12, 0, steel); aabb(-SX, SX, -0.12, 0);
      box(-SX, SX, H - 0.1, H, -0.12, FZ + FT, steelD);
    }
    // door frame trim
    box(-DW - 0.06, -DW, 0, DH, FZ + FT, FZ + FT + 0.04, steelD); box(DW, DW + 0.06, 0, DH, FZ + FT, FZ + FT + 0.04, steelD);
    box(-DW - 0.06, DW + 0.06, DH, DH + 0.08, FZ + FT, FZ + FT + 0.04, steelD);
    // cabin inside: ceiling slab, floor, light panel, rails
    box(-SX + 0.1, SX - 0.1, 2.7, 2.76, 0.08, FZ + FT, steelD);
    box(-SX + 0.1, SX - 0.1, 0, 0.03, 0.08, FZ + FT, rubber);
    box(-DW, DW, 0, 0.035, FZ - 0.04, FZ + FT + 0.06, new THREE.MeshStandardMaterial({ color: 0x8a7a4a, metalness: 0.8, roughness: 0.4 }));
    const lamp = box(-0.7, 0.7, 2.66, 2.7, 0.4, 1.5, lampM);
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 8), steelD);
      m.position.set((x0 + x1) / 2, 0.95, (z0 + z1) / 2); m.rotation.z = Math.PI / 2; m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); G.add(m);
    };
    rail(-SX + 0.12, 0.14, SX - 0.12, 0.14);                  // back rail
    const sideRail = (x) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.5, 8), steelD); m.rotation.x = Math.PI / 2; m.position.set(x, 0.95, 0.9); G.add(m); };
    sideRail(-SX + 0.14);
    // control panel on the right wall: a column of small buttons and the big one
    const px = SX - 0.1;
    box(px - 0.03, px, 0.7, 1.7, 0.85, 1.45, dark);
    const rows = [1.55, 1.42, 1.29, 1.16];
    rows.forEach((y, k) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 12), k === 0 ? btnIdle : steelD);
      b.rotation.z = Math.PI / 2; b.position.set(px - 0.045, y, 1.15); G.add(b);
      if (k === 0) b.material = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, emissive: 0x2a2a2a, emissiveIntensity: 0.6 });
    });
    const go = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), btnIdle);   // the button that rides to the next map
    go.rotation.z = Math.PI / 2; go.position.set(px - 0.05, 0.92, 1.15); G.add(go);
    const goRing = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.01, 6, 20), steelD);
    goRing.rotation.y = Math.PI / 2; goRing.position.set(px - 0.04, 0.92, 1.15); G.add(goRing);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.06, 3), new THREE.MeshBasicMaterial({ color: 0x0b0b0b }));
    arrow.rotation.z = -Math.PI / 2; arrow.rotation.x = 0; arrow.position.set(px - 0.078, 0.92, 1.15); G.add(arrow);

    // doors: two leaves just behind the front pieces; they slide sideways into the cabin walls
    const ds = { t: 0, target: 0 };
    const leafL = box(-DW, 0, 0, DH, FZ - 0.06, FZ, steel), leafR = box(0, DW, 0, DH, FZ - 0.06, FZ, steel);
    const seam = box(-0.01, 0.01, 0, DH, FZ - 0.065, FZ - 0.05, dark);
    leafL.geometry.translate(0, 0, 0); leafL.position.x = 0; leafR.position.x = 0;
    // (the boxes were created centred on their own centre, so shift them by the leaf offset)
    leafL.position.x = -DW / 2; leafR.position.x = DW / 2;
    const doorBox = aabb(-DW, DW, FZ - 0.1, FZ + 0.1, ds);

    // sign above the doorway + lights
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture(false) });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), signMat); sign.position.set(0, 2.82, FZ + FT + 0.045); G.add(sign);
    const lobbyLight = new THREE.PointLight(0xff3a2a, 0.6, 7, 1.6); lobbyLight.position.set(0, 2.3, FZ + 0.9); G.add(lobbyLight);
    const cabLight = new THREE.PointLight(0xfff0d0, 0, 5, 1.8); cabLight.position.set(0, 2.5, 1.0); G.add(cabLight);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: BR.tex.dust(), color: 0x6dff9a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
    glow.scale.set(2.4, 2.4, 1); glow.position.set(0, 1.4, FZ + 0.3); G.add(glow);

    const door = toW(0, FZ + 0.7), cab = toW(0, 1.0), btn = toW(px - 0.3, 1.15);
    const el = {
      x: door[0], z: door[1], cab: { x: cab[0], z: cab[1] }, btn: { x: btn[0], z: btn[1] }, ds, doorBox, group: G, signMat, lobbyLight, glow,
      isOpen: false, pressed: false, openSign: signTexture(true),
      open() {
        if (el.isOpen) return;
        el.isOpen = true; ds.target = 1;
        signMat.map = el.openSign; signMat.needsUpdate = true;
        lobbyLight.color.set(0x4dff8d); lobbyLight.intensity = 0.8;
        cabLight.intensity = 0.8; lampM.emissiveIntensity = 0.8;
        go.material = new THREE.MeshStandardMaterial({ color: 0x3a2a08, emissive: 0xffb020, emissiveIntensity: 0.8 });
      },
      press() {                                               // the ride starts: the button turns green, the doors close
        el.pressed = true; ds.target = 0;
        go.material = new THREE.MeshStandardMaterial({ color: 0x1a3a22, emissive: 0x39ff88, emissiveIntensity: 1.6 });
      },
      insideCabin(x, z) {                                      // is (x,z) between the cabin walls?
        const dx = x - gx, dz = z - gz, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        return lx > -SX + 0.15 && lx < SX - 0.15 && lz > 0.1 && lz < FZ - 0.05;
      },
      update(t, dt) {
        const rate = ds.target > ds.t ? 0.9 : 0.8;
        ds.t += Math.max(-1, Math.min(1, (ds.target - ds.t))) * Math.min(1, dt * rate * 3.2) * (ds.target > ds.t ? 1 : 1);
        if (Math.abs(ds.target - ds.t) < 0.003) ds.t = ds.target;
        const k = ds.t;
        leafL.position.x = -DW / 2 - (DW - 0.04) * k; leafR.position.x = DW / 2 + (DW - 0.04) * k;
        if (el.isOpen) { glow.material.opacity = 0.16 + Math.sin(t * 3.4) * 0.04; if (el.pressed) cabLight.intensity = 0.7 + Math.sin(t * 17) * 0.12; }
        else lobbyLight.intensity = 0.45 + Math.sin(t * 3) * 0.15;
      }
    };
    return el;
  };
})(window.BR);
