/* BACKROOMS — procedural audio (no files, everything synthesised) */
window.BR = window.BR || {};

(function (BR) {
  let ctx = null, master = null, zoneF = null, hum = null, humGain = null, dread = null, dreadGain = null;
  let noiseBuf = null, lastStep = 0, lastScrape = 0, heartT = 0, verbSend = null, eventT = 14;
  let muted = false;

  function makeNoise() {
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    // everything passes a low-pass that closes when you are inside a room: muffled, safe, closer
    zoneF = ctx.createBiquadFilter(); zoneF.type = 'lowpass'; zoneF.frequency.value = 20000; zoneF.Q.value = 0.4;
    master.connect(zoneF); zoneF.connect(comp); comp.connect(ctx.destination);
    noiseBuf = makeNoise();

    // big empty room: short convolution reverb fed by every one-shot sound
    const irLen = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    verbSend = ctx.createGain(); verbSend.gain.value = 0.4;
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.5;
    verbSend.connect(conv); conv.connect(verbOut); verbOut.connect(master);

    // fluorescent hum: 60 Hz + harmonics, slightly detuned
    humGain = ctx.createGain(); humGain.gain.value = 0.10; humGain.connect(master);
    [60, 120.4, 180.7, 240.9, 3600].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 4 ? 'sine' : 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 4 ? 0.012 : 0.22 / (i + 1);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      if (i === 4) { lp.frequency.value = 6000; }
      o.connect(lp); lp.connect(g); g.connect(humGain);
      o.start();
    });

    // room tone
    const rt = ctx.createBufferSource(); rt.buffer = noiseBuf; rt.loop = true;
    const rtf = ctx.createBiquadFilter(); rtf.type = 'lowpass'; rtf.frequency.value = 220;
    const rtg = ctx.createGain(); rtg.gain.value = 0.18;
    rt.connect(rtf); rtf.connect(rtg); rtg.connect(master); rt.start();

    // slow tonal bed: a dissonant, barely moving chord that swells and recedes like something breathing
    const lfo = (rate, depth, target) => {
      const o = ctx.createOscillator(); o.frequency.value = rate;
      const d = ctx.createGain(); d.gain.value = depth;
      o.connect(d); d.connect(target); o.start();
    };
    const padGain = ctx.createGain(); padGain.gain.value = 0.05; padGain.connect(master); if (verbSend) padGain.connect(verbSend);
    lfo(0.045, 0.03, padGain.gain);
    [[55, 0], [82.6, 4], [87.3, -5], [110.4, 3], [164.9, -3]].forEach(([f, det], i) => {
      const o = ctx.createOscillator(); o.type = i < 2 ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = det;
      const g = ctx.createGain(); g.gain.value = i < 2 ? 0.5 : 0.22;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      lfo(0.03 + i * 0.011, 0.12, g.gain);
      o.connect(lp); lp.connect(g); g.connect(padGain); o.start();
    });
    // thin high shimmer, like electricity in the walls
    const shim = ctx.createGain(); shim.gain.value = 0.0035; shim.connect(master);
    lfo(0.11, 0.003, shim.gain);
    [1318.5, 1976, 2637].forEach((f, i) => { const o = ctx.createOscillator(); o.frequency.value = f + i * 0.7; o.connect(shim); o.start(); });
    // air handling: a slow wind that wanders through the vents
    const wind = ctx.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 480; wf.Q.value = 0.8;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    lfo(0.06, 260, wf.frequency); lfo(0.04, 0.025, wg.gain);
    wind.connect(wf); wf.connect(wg); wg.connect(master); wg.connect(verbSend); wind.start();
    // old tape hiss
    const hiss = ctx.createBufferSource(); hiss.buffer = noiseBuf; hiss.loop = true;
    const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 5200;
    const hg = ctx.createGain(); hg.gain.value = 0.006;
    hiss.connect(hf); hf.connect(hg); hg.connect(master); hiss.start();

    // dread drone — grows when the thing is close
    dreadGain = ctx.createGain(); dreadGain.gain.value = 0; dreadGain.connect(master);
    [41, 43.3, 82.5].forEach((f) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      o.connect(lp); lp.connect(dreadGain); o.start();
    });
  }

  function envNoise(freq, q, dur, vol, type) {
    if (!ctx || muted) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass';
    f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); if (verbSend) g.connect(verbSend);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  function tone(freq, dur, vol, type, glide) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator(); o.type = type || 'sine';
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); if (verbSend) g.connect(verbSend);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // something far away: a thud, a groaning pipe, a breath, or slow footsteps overhead
  function ambientEvent() {
    if (!ctx || muted) return;
    const t = ctx.currentTime, out = ctx.createGain();
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1;
      out.connect(pan); pan.connect(master); if (verbSend) pan.connect(verbSend);
    } else { out.connect(master); }
    const k = Math.floor(Math.random() * 8);
    if (k === 0) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 1);
    } else if (k === 1) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(190 + Math.random() * 60, t); o.frequency.linearRampToValueAtTime(120 + Math.random() * 40, t + 1.8);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1, t + 0.5); g.gain.linearRampToValueAtTime(0.0001, t + 1.9);
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 2);
    } else if (k === 2) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 500; f.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 1.2); g.gain.linearRampToValueAtTime(0.0001, t + 2.8);
      s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 3);
    } else if (k === 4) {                                       // a music box playing in some far-off room, slightly out of tune
      const notes = [659.3, 587.3, 523.3, 493.9, 523.3, 392];
      const detune = (Math.random() - 0.5) * 60;
      notes.forEach((f, n) => {
        const tt = t + n * 0.55 + Math.random() * 0.03;
        [1, 2.76].forEach((m, j) => {
          const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * m; o.detune.value = detune;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(j ? 0.012 : 0.045, tt + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.4);
          o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 1.5);
        });
      });
    } else if (k === 5) {                                       // a metal door or shelf, far away
      [310, 523, 811, 1290].forEach((f, j) => {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * (0.97 + Math.random() * 0.06);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 18;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 / (j + 1), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6 + j * 0.3);
        o.connect(bp); bp.connect(g); g.connect(out); o.start(t); o.stop(t + 2.6);
      });
    } else if (k === 6) {                                       // dripping somewhere wet
      const drips = 2 + Math.floor(Math.random() * 4);
      let tt = t;
      for (let n = 0; n < drips; n++) {
        tt += 0.5 + Math.random() * 1.6;
        const o = ctx.createOscillator(); o.type = 'sine';
        const f0 = 900 + Math.random() * 500;
        o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f0 * 0.45, tt + 0.09);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.09, tt + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.16);
        o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.2);
      }
    } else if (k === 7) {                                       // something that is almost a voice
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(96 + Math.random() * 30, t); o.frequency.linearRampToValueAtTime(70 + Math.random() * 20, t + 3.2);
      const vib = ctx.createOscillator(); vib.frequency.value = 5; const vg = ctx.createGain(); vg.gain.value = 4; vib.connect(vg); vg.connect(o.frequency); vib.start(t); vib.stop(t + 3.6);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 7; f1.frequency.setValueAtTime(520, t); f1.frequency.linearRampToValueAtTime(330, t + 3.2);
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 9; f2.frequency.setValueAtTime(1150, t); f2.frequency.linearRampToValueAtTime(820, t + 3.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 1.0); g.gain.linearRampToValueAtTime(0.0001, t + 3.4);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(out); o.start(t); o.stop(t + 3.6);
    } else {
      for (let n = 0; n < 5; n++) {
        const tt = t + n * 0.5;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(62, tt); o.frequency.exponentialRampToValueAtTime(34, tt + 0.16);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.22, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.22);
        o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.3);
      }
    }
  }

  BR.audio = {
    start,
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; },
    isMuted() { return muted; },
    // damp carpet footstep
    step(sprinting) {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (now - lastStep < 0.05) return;
      lastStep = now;
      const v = 0.85 + Math.random() * 0.3;
      envNoise((sprinting ? 260 : 190) * v, 0.9, 0.13, sprinting ? 0.5 : 0.3, 'lowpass');
      envNoise(1200 * v, 1.5, 0.04, 0.05);
      tone((sprinting ? 78 : 64) * v, 0.09, sprinting ? 0.16 : 0.09, 'sine', 40);
    },
    click() { tone(1800, 0.04, 0.12, 'square'); envNoise(3000, 2, 0.03, 0.08); },
    // hinge groan for the bedroom doors
    creak() {
      if (!ctx || muted) return;
      const t = ctx.currentTime, o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(150 + Math.random() * 40, t); o.frequency.linearRampToValueAtTime(95 + Math.random() * 30, t + 0.8);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 10;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.13, t + 0.15); g.gain.linearRampToValueAtTime(0.0001, t + 0.9);
      o.connect(f); f.connect(g); g.connect(master); if (verbSend) g.connect(verbSend);
      o.start(t); o.stop(t + 1);
      envNoise(300, 0.8, 0.12, 0.2, 'lowpass');
    },
    drawer() { envNoise(700, 1, 0.28, 0.26, 'bandpass'); tone(120, 0.16, 0.1, 'square', 80); },
    rustle() { envNoise(2600, 0.8, 0.45, 0.2, 'highpass'); envNoise(500, 1, 0.3, 0.12, 'bandpass'); },
    // furniture dragged over carpet (throttled)
    scrape() {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (now - lastScrape < 0.2) return;
      lastScrape = now;
      envNoise(420, 1.2, 0.2, 0.22, 'bandpass');
    },
    // something pounding on the other side of a door, and the door giving way
    knock(v) { tone(95, 0.16, 0.12 + 0.35 * (v || 1), 'sine', 55); setTimeout(() => tone(90, 0.16, 0.1 + 0.3 * (v || 1), 'sine', 50), 190); },
    crash() { tone(70, 0.7, 0.55, 'sawtooth', 30); envNoise(900, 0.7, 0.8, 0.7, 'lowpass'); },
    pickup() {
      tone(523, 0.25, 0.14, 'sine'); setTimeout(() => tone(659, 0.25, 0.14, 'sine'), 90);
      setTimeout(() => tone(988, 0.5, 0.14, 'sine'), 180);
    },
    door() { tone(70, 1.4, 0.35, 'sawtooth', 38); envNoise(400, 0.8, 1.2, 0.2, 'lowpass'); },
    scare() {
      tone(180, 1.2, 0.5, 'sawtooth', 40);
      tone(266, 1.2, 0.35, 'square', 55);
      envNoise(2500, 0.6, 1.4, 0.7, 'highpass');
    },
    battery() { tone(330, 0.12, 0.1, 'triangle'); setTimeout(() => tone(440, 0.2, 0.1, 'triangle'), 90); },
    flicker() { envNoise(5000, 3, 0.05, 0.14, 'highpass'); },
    // call every frame
    update(dt, danger, stamina, sprinting, inRoom) {
      if (!ctx) return;
      const t = ctx.currentTime;
      eventT -= dt;
      if (zoneF) zoneF.frequency.setTargetAtTime(inRoom ? 1700 : 20000, t, 0.35);
      if (eventT <= 0) { eventT = 10 + Math.random() * 20; ambientEvent(); }
      dreadGain.gain.setTargetAtTime(Math.min(0.32, danger * 0.32), t, 0.25);
      humGain.gain.setTargetAtTime(0.10 - danger * 0.05, t, 0.4);
      // heartbeat when close or exhausted
      const pulse = Math.max(danger, sprinting && stamina < 0.3 ? 0.5 : 0);
      if (pulse > 0.2) {
        heartT -= dt;
        const interval = 1.0 - pulse * 0.55;
        if (heartT <= 0) {
          heartT = interval;
          tone(55, 0.14, 0.45 * pulse + 0.1, 'sine', 38);
          setTimeout(() => tone(48, 0.16, 0.35 * pulse + 0.08, 'sine', 34), 150);
        }
      }
    }
  };
})(window.BR);
