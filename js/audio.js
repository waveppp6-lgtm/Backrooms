/* BACKROOMS — procedural audio (no files, everything synthesised) */
window.BR = window.BR || {};

(function (BR) {
  let ctx = null, master = null, hum = null, humGain = null, dread = null, dreadGain = null;
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
    master.connect(comp); comp.connect(ctx.destination);
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
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      if (i === 4) { lp.frequency.value = 6000; }
      o.connect(lp); lp.connect(g); g.connect(humGain);
      o.start();
    });

    // room tone
    const rt = ctx.createBufferSource(); rt.buffer = noiseBuf; rt.loop = true;
    const rtf = ctx.createBiquadFilter(); rtf.type = 'lowpass'; rtf.frequency.value = 220;
    const rtg = ctx.createGain(); rtg.gain.value = 0.18;
    rt.connect(rtf); rtf.connect(rtg); rtg.connect(master); rt.start();

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
    const k = Math.floor(Math.random() * 4);
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
      envNoise(sprinting ? 260 : 190, 0.9, 0.13, sprinting ? 0.5 : 0.3, 'lowpass');
      envNoise(1200, 1.5, 0.04, 0.05);
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
    update(dt, danger, stamina, sprinting) {
      if (!ctx) return;
      const t = ctx.currentTime;
      eventT -= dt;
      if (eventT <= 0) { eventT = 14 + Math.random() * 24; ambientEvent(); }
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
