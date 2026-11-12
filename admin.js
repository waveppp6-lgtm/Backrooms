/* BACKROOMS — admin panel. Open it with the ` key (or tap the title 7 times on a phone) and enter the admin code.
   The code is NOT stored in this file: only a salted PBKDF2-SHA256 hash is, so reading the source does not reveal it.
   Everything the panel does only affects the player who unlocked it (it never changes what friends see or the shared map).
   Note: this is a client-side game, so someone who edits the files can always remove the check — it keeps casual players out, it is not real security. */
window.BR = window.BR || {};

(function (BR) {
  const SALT = '5c1aa297384e258e1f320eb5bd83af39', HASH = '41e7754342dbb4e5b51bda3c5312ddfcb09eef0c823703f56e2897baeba707d2', ITER = 120000;
  const A = BR.admin = { unlocked: false, flags: { god: false, fly: false, stamina: false, battery: false, noclip: false, freeze: false, speed: 1 }, api: null };
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

  A.check = async function (input) {
    const subtle = (window.crypto && window.crypto.subtle) || null;
    if (!subtle) throw new Error('nocrypto');
    const norm = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const key = await subtle.importKey('raw', new TextEncoder().encode(norm), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(SALT), iterations: ITER }, key, 256);
    const got = hex(bits);
    let diff = got.length ^ HASH.length;
    for (let i = 0; i < HASH.length; i++) diff |= (got.charCodeAt(i) || 0) ^ HASH.charCodeAt(i);
    return diff === 0;
  };

  let root = null, tries = 0, lockUntil = 0;
  const css = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:rgba(0,0,0,.72);font-family:"IBM Plex Mono",ui-monospace,monospace;color:#f3ecb8;';
  const box = 'width:min(440px,92vw);max-height:88vh;overflow:auto;padding:20px 22px;background:#0d0c06;border:1px solid rgba(236,227,180,.45);box-shadow:0 0 40px #000;';
  const btnCss = 'font:inherit;color:#f3ecb8;background:#1b190b;border:1px solid rgba(236,227,180,.4);padding:9px 12px;cursor:pointer;letter-spacing:.06em;font-size:13px;';

  function el(tag, style, text) { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text != null) e.textContent = text; return e; }
  function close() { if (root && root.parentNode) root.parentNode.removeChild(root); root = null; if (A.onClose) A.onClose(); }

  function panel() {
    root.innerHTML = '';
    const b = el('div', box); root.appendChild(b);
    b.appendChild(el('div', 'letter-spacing:.35em;font-size:12px;opacity:.7', 'ADMIN'));
    b.appendChild(el('h3', 'margin:6px 0 14px;font-weight:400;letter-spacing:.14em', 'CONTROL PANEL'));
    const row = (label, key) => {
      const r = el('label', 'display:flex;align-items:center;gap:10px;padding:7px 0;font-size:14px;cursor:pointer');
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!A.flags[key];
      c.addEventListener('change', () => { A.flags[key] = c.checked; });
      r.appendChild(c); r.appendChild(el('span', '', label)); b.appendChild(r);
    };
    row('God mode — the entity can\'t catch you', 'god');
    row('Flight — double-tap Space (JUMP on phones); Space up, C down, Shift faster', 'fly');
    row('Infinite stamina', 'stamina');
    row('Infinite flashlight battery', 'battery');
    row('Noclip — walk through walls', 'noclip');
    row('Freeze the entity', 'freeze');
    const sp = el('div', 'display:flex;align-items:center;gap:10px;padding:7px 0;font-size:14px');
    sp.appendChild(el('span', '', 'Speed'));
    const rng = document.createElement('input'); rng.type = 'range'; rng.min = '1'; rng.max = '3'; rng.step = '0.25'; rng.value = String(A.flags.speed);
    const sv = el('span', 'width:3em', '×' + A.flags.speed);
    rng.addEventListener('input', () => { A.flags.speed = +rng.value; sv.textContent = '×' + rng.value; });
    sp.appendChild(rng); sp.appendChild(sv); b.appendChild(sp);
    b.appendChild(el('div', 'margin:14px 0 6px;font-size:12px;opacity:.7;letter-spacing:.2em', 'ACTIONS'));
    const grid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px'); b.appendChild(grid);
    const note = el('div', 'margin-top:12px;min-height:1.2em;font-size:12px;opacity:.8', '');
    const act = (label, fn) => { const x = el('button', btnCss, label); x.type = 'button'; x.addEventListener('click', () => { if (A.api && A.api[fn]) { const m = A.api[fn](); if (m) note.textContent = m; } }); grid.appendChild(x); };
    act('Open the elevator (3 fuses)', 'openExit');
    act('Teleport to nearest fuse', 'tpFuse');
    act('Open the safe', 'openSafe');
    act('Build the bridge instantly', 'buildBridge');
    act('Teleport to the elevator', 'tpElevator');
    act('Teleport to the ladder (drains)', 'tpLadder');
    act('How to fly', 'toggleFly');
    act('Reveal the whole map', 'reveal');
    act('Refill everything', 'refill');
    b.appendChild(el('div', 'margin:14px 0 6px;font-size:12px;opacity:.7;letter-spacing:.2em', 'JUMP TO MAP'));
    const lv = el('div', 'display:flex;gap:8px;flex-wrap:wrap'); b.appendChild(lv);
    (BR.themes || []).forEach((t, i) => { const x = el('button', btnCss, t.name.replace('LEVEL ', 'LV ')); x.type = 'button'; x.addEventListener('click', () => { if (A.api) { close(); A.api.gotoLevel(i); } }); lv.appendChild(x); });
    b.appendChild(note);
    const done = el('button', btnCss + 'margin-top:12px;width:100%', 'CLOSE'); done.type = 'button'; done.addEventListener('click', close); b.appendChild(done);
  }

  function prompt() {
    root.innerHTML = '';
    const b = el('div', box); root.appendChild(b);
    b.appendChild(el('div', 'letter-spacing:.35em;font-size:12px;opacity:.7', 'RESTRICTED'));
    b.appendChild(el('h3', 'margin:6px 0 14px;font-weight:400;letter-spacing:.14em', 'ADMIN CODE'));
    const inp = document.createElement('input'); inp.type = 'password'; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.style.cssText = 'width:100%;box-sizing:border-box;font:inherit;font-size:16px;letter-spacing:.2em;padding:10px;background:#050503;color:#f3ecb8;border:1px solid rgba(236,227,180,.4);outline:none;';
    const msg = el('div', 'margin-top:10px;min-height:1.2em;font-size:12px;color:#ff8a7a', '');
    const go = async () => {
      const now = Date.now();
      if (now < lockUntil) { msg.textContent = 'Too many attempts. Wait ' + Math.ceil((lockUntil - now) / 1000) + 's.'; return; }
      msg.style.color = '#cfc78a'; msg.textContent = 'Checking…';
      let ok = false;
      try { ok = await A.check(inp.value); } catch (e) { msg.style.color = '#ff8a7a'; msg.textContent = e.message === 'nocrypto' ? 'This needs https (or localhost).' : 'Error.'; return; }
      if (ok) { A.unlocked = true; tries = 0; panel(); return; }
      tries++; inp.value = ''; msg.style.color = '#ff8a7a';
      if (tries >= 5) { lockUntil = Date.now() + 30000; tries = 0; msg.textContent = 'Locked for 30 seconds.'; } else msg.textContent = 'Wrong code.';
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') go(); if (e.code === 'Escape') close(); });
    inp.addEventListener('keyup', (e) => e.stopPropagation());
    b.appendChild(inp); b.appendChild(msg);
    const row = el('div', 'display:flex;gap:8px;margin-top:12px');
    const ok = el('button', btnCss + 'flex:1', 'UNLOCK'); ok.type = 'button'; ok.addEventListener('click', go);
    const no = el('button', btnCss + 'flex:1', 'CANCEL'); no.type = 'button'; no.addEventListener('click', close);
    row.appendChild(ok); row.appendChild(no); b.appendChild(row);
    setTimeout(() => inp.focus(), 30);
  }

  A.open = function () {
    if (root) return;
    root = el('div', css);
    root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Escape') close(); });
    root.addEventListener('keyup', (e) => e.stopPropagation());
    document.body.appendChild(root);
    if (A.unlocked) panel(); else prompt();
  };
})(window.BR);
