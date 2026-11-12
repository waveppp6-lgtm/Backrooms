/* BACKROOMS — peer-to-peer transport for co-op when the game is hosted outside claude.ai.
   Uses PeerJS (WebRTC data channels) with its free public signalling server.
   The first player to use a code becomes the host (registers the id "bkg-<code>"); everyone else connects to it.
   The host relays everyone's state to everyone, so the host must keep their tab open.
   Exposes BR.rtc.join(code) -> a room object shaped like the claude.ai `room` capability (presence/peers/leave). */
window.BR = window.BR || {};

(function (BR) {
  const TICK = 66;                       // ms between state sends (~15 Hz)
  const rtc = BR.rtc = {};
  rtc.available = () => typeof window.Peer === 'function';

  rtc.join = function (code) {
    return new Promise((resolve) => {
      if (!rtc.available()) { resolve(null); return; }
      const hostId = 'bkg-' + code;
      let done = false, peer = null, timer = null, conn = null;
      const mine = {};                   // my presence object
      const others = new Map();          // id -> presence
      const conns = new Map();           // host only: client id -> DataConnection
      let myId = 'me', hostMode = false, closed = false;

      const room = {
        presence(patch) {
          for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; }
          return Promise.resolve();
        },
        peers() {
          const list = [{ peer: myId, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: mine, updatedAt: Date.now() }];
          others.forEach((p, id) => list.push({ peer: id, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: p, updatedAt: Date.now() }));
          return list;
        },
        onPeers() { return () => {}; },
        leave() {
          closed = true;
          if (timer) clearInterval(timer);
          try { conns.forEach((c) => c.close()); if (conn) conn.close(); if (peer) peer.destroy(); } catch (e) { /* already gone */ }
          others.clear(); conns.clear();
          return Promise.resolve();
        },
        connected: () => !closed && (hostMode || !!(conn && conn.open))
      };

      const finish = (ok) => { if (done) return; done = true; clearTimeout(failT); resolve(ok ? room : null); if (!ok) room.leave(); };
      const failT = setTimeout(() => finish(false), 9000);

      const asHost = () => {
        hostMode = true; myId = hostId;
        peer.on('connection', (c) => {
          c.on('open', () => { conns.set(c.peer, c); });
          c.on('data', (m) => { if (m && m.t === 'p' && m.p && typeof m.p === 'object') others.set(c.peer, m.p); });
          const drop = () => { conns.delete(c.peer); others.delete(c.peer); };
          c.on('close', drop); c.on('error', drop);
        });
        timer = setInterval(() => {
          if (!conns.size) return;
          const snap = {}; snap[hostId] = mine;
          others.forEach((p, id) => { snap[id] = p; });
          conns.forEach((c) => { if (c.open) { try { c.send({ t: 's', s: snap }); } catch (e) { /* retry next tick */ } } });
        }, TICK);
        finish(true);
      };

      const asClient = () => {
        peer = new window.Peer();
        peer.on('error', () => { if (!done) finish(false); });
        peer.on('open', (id) => {
          myId = id;
          conn = peer.connect(hostId, { reliable: true });
          conn.on('open', () => {
            timer = setInterval(() => { if (conn.open) { try { conn.send({ t: 'p', p: mine }); } catch (e) { /* retry next tick */ } } }, TICK);
            finish(true);
          });
          conn.on('data', (m) => {
            if (!m || m.t !== 's' || !m.s) return;
            others.clear();
            for (const id2 in m.s) if (id2 !== myId) others.set(id2, m.s[id2]);
          });
          const gone = () => { others.clear(); };
          conn.on('close', gone); conn.on('error', gone);
        });
      };

      try {
        peer = new window.Peer(hostId);
        peer.on('open', () => asHost());
        peer.on('error', (err) => {
          if (done) return;
          if (err && err.type === 'unavailable-id') { try { peer.destroy(); } catch (e) { /* ignore */ } asClient(); }
          else finish(false);
        });
      } catch (e) { finish(false); }
    });
  };
})(window.BR);
