// sus-net.js — room storage + room-level actions. Two backends behind one interface:
//   online : Firebase Realtime Database, room at rooms/sus_<CODE>
//   local  : in-memory (you vs 1-4 bots), mirrored into localStorage so a refresh restores it
// The game state is stored as ONE JSON string (room.gs): Firebase drops empty arrays/nulls, a string keeps the state exactly as the engine made it.
// Every write is a pure function room -> room run inside a transaction online, so two clients can't clobber each other.
const Net = (function () {
  const MY_UID = (function () {
    try { let id = localStorage.getItem('sus_uid'); if (!id) { id = 'u_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('sus_uid', id); } return id; }
    catch (e) { return 'u_' + Math.random().toString(36).slice(2, 10); }
  })();
  const ONLINE_OK = typeof db !== 'undefined' && db !== null;
  const S = { mode: null, code: null, room: null, onChange: null, ref: null, connRef: null, gKey: null, g: null };
  const SEATK = ['s0', 's1', 's2', 's3', 's4'];
  const freeChar = (r, want) => { const used = new Set(SEATK.filter(k => r.seats[k] && r.seats[k].char).map(k => r.seats[k].char)); if (want && Sus.CHARS.includes(want) && !used.has(want)) return want; const f = Sus.CHARS.filter(c => !used.has(c)); return f[Math.floor(Math.random() * f.length)] || Sus.CHARS[0]; };
  const keyOf = c => 'sus_' + c;
  const codeGen = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };
  const LOCAL_KEY = 'sus_local_room', LAST_KEY = 'sus_last_room', TTL = 12 * 36e5;

  function normalize(r) { if (!r) return r; r.seats = r.seats || {}; r.specs = r.specs || {}; r.settings = Sus.normSettings(r.settings); return r; }
  function getG(room) {
    room = room || S.room; if (!room || !room.gs) return null;
    if (room.gs !== S.gKey) { try { S.g = JSON.parse(room.gs); S.gKey = room.gs; } catch (e) { return null; } }
    return S.g;
  }
  function saveLocal() { try { if (S.mode === 'local' && S.room) localStorage.setItem(LOCAL_KEY, JSON.stringify({ ts: Date.now(), room: S.room })); } catch (e) {} }
  const clearLocal = () => { try { localStorage.removeItem(LOCAL_KEY); } catch (e) {} };
  const rememberRoom = c => { try { if (c) localStorage.setItem(LAST_KEY, JSON.stringify({ code: c, ts: Date.now() })); else localStorage.removeItem(LAST_KEY); } catch (e) {} };
  const lastRoom = () => { try { const v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); return v && Date.now() - v.ts < TTL ? v.code : null; } catch (e) { return null; } };
  function hasLocal() { try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); return !!(v && v.room && v.room.gs && Date.now() - v.ts < TTL); } catch (e) { return false; } }
  function restoreLocal() {
    try {
      const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
      if (!v || !v.room || Date.now() - v.ts > TTL) return false;
      S.mode = 'local'; S.code = 'LOCAL'; S.room = normalize(v.room); emit(null); return true;
    } catch (e) { clearLocal(); return false; }
  }
  function emit(prev) { saveLocal(); if (S.onChange) S.onChange(S.room, prev); }

  async function mutate(fn) {
    if (S.mode === 'local') {
      const prev = S.room, next = fn(JSON.parse(JSON.stringify(S.room)));
      if (!next) return false;
      S.room = normalize(next); emit(prev); return true;
    }
    if (S.mode === 'online') {
      const res = await S.ref.transaction(cur => {
        if (cur === null) return cur;
        const out = fn(normalize(JSON.parse(JSON.stringify(cur))));
        return out ? out : undefined;
      }, undefined, false);
      return !!(res && res.committed);
    }
    return false;
  }

  function attach(code) {
    S.mode = 'online'; S.code = code; S.ref = db.ref('rooms/' + keyOf(code)); rememberRoom(code);
    S.ref.on('value', snap => { const prev = S.room, v = snap.val(); S.room = v ? normalize(v) : null; emit(prev); });
    S.connRef = db.ref('.info/connected');
    S.connRef.on('value', snap => { if (snap.val() === true && S.room) armPresence(); });
  }
  function mySeat(room) {
    room = room || S.room; if (!room) return null;
    if (S.mode === 'local') return 's0';
    return SEATK.find(k => room.seats[k] && room.seats[k].uid === MY_UID) || null;
  }
  function armPresence() {
    if (S.mode !== 'online') return; const k = mySeat();
    if (!k) { const sp = S.ref.child('specs/' + MY_UID); sp.onDisconnect().remove(); if (S.room && S.room.specs[MY_UID]) return; sp.set({ name: specName(), t: Date.now() }); return; }
    const r = S.ref.child('seats/' + k);
    r.child('connected').onDisconnect().set(false); r.child('connected').set(true);
  }
  function detach() {
    if (S.ref) { S.ref.off(); S.ref = null; }
    if (S.connRef) { S.connRef.off(); S.connRef = null; }
    if (S.mode === 'local') clearLocal();
    S.mode = null; S.code = null; S.room = null; S.g = null; S.gKey = null;
  }

  const baseRoom = host => ({ game: 'sus', hostUid: host, status: 'lobby', settings: Object.assign({}, Sus.DEFAULTS), seats: {}, gs: '', createdAt: Date.now() });
  const botName = () => t('bot');

  const specName = () => { try { return localStorage.getItem('sus_name') || 'Guest'; } catch (e) { return 'Guest'; } };
  const isSpec = room => !!(room && !mySeatOf(room) && room.specs && room.specs[MY_UID]);
  const mySeatOf = room => SEATK.find(k => room.seats[k] && room.seats[k].uid === MY_UID) || null;
  async function createOnline(name, char) {
    if (!ONLINE_OK) throw new Error('offline');
    const code = codeGen(), room = baseRoom(MY_UID);
    room.seats.s0 = { uid: MY_UID, name, connected: true, char: freeChar(room, char) };
    await db.ref('rooms/' + keyOf(code)).set(room);
    attach(code); return code;
  }
  async function joinOnline(code, name, char) {
    if (!ONLINE_OK) throw new Error('offline');
    code = code.toUpperCase().trim();
    const snap = await db.ref('rooms/' + keyOf(code)).get();
    if (!snap.exists()) return { ok: false, reason: 'noRoom' };
    attach(code);
    await new Promise(res => { const t0 = Date.now(); (function w() { if (S.room || Date.now() - t0 > 4000) res(); else setTimeout(w, 30); })(); });
    if (!S.room) { detach(); return { ok: false, reason: 'noRoom' }; }
    if (mySeat()) return { ok: true, resumed: true };
    if (S.room.specs[MY_UID]) return { ok: true, spectator: true, resumed: true };
    // a free seat in a lobby is taken; anything else (table full / game running) = spectator standing beside the table
    const ok = await mutate(r => {
      if (mySeatOf(r)) return r;
      if (r.status === 'lobby') { const k = SEATK.find(x => !r.seats[x]); if (k) { r.seats[k] = { uid: MY_UID, name, connected: true, char: freeChar(r, char) }; return r; } }
      r.specs[MY_UID] = { name, t: Date.now() }; return r;
    });
    if (!ok) { detach(); return { ok: false, reason: 'noRoom' }; }
    return { ok: true, spectator: !mySeat() };
  }
  async function tryRejoin(code) {
    if (!ONLINE_OK || !code) return null;
    code = code.toUpperCase();
    const snap = await db.ref('rooms/' + keyOf(code)).get();
    if (!snap.exists()) return null;
    const r = normalize(snap.val());
    if (mySeatOf(r) || (r.specs && r.specs[MY_UID]) || r.status === 'play') { attach(code); return code; }
    return null;
  }

  // table order is shuffled when a game starts; g.seatKeys[i] = room seat key of table position i (bots: 'b1'..)
  function makeGame(entries, settings) {
    const order = entries.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const g = Sus.newGame(order.map(e => e.name), settings, null, order.map(e => e.char)); g.seatKeys = order.map(e => e.key); return g;
  }
  const seatEntries = r => SEATK.filter(k => r.seats[k]).map(k => ({ key: k, name: r.seats[k].name, char: r.seats[k].char }));
  function startLocal(name, settings, char) {
    S.mode = 'local'; S.code = 'LOCAL'; rememberRoom(null);
    const room = baseRoom('local'); room.settings = Sus.normSettings(settings);
    room.seats.s0 = { uid: 'local', name, local: true, connected: true, char: Sus.CHARS.includes(char) ? char : undefined }; if (!room.seats.s0.char) room.seats.s0.char = freeChar(room);
    const bn = (t('botNames') || []); for (let i = 1; i <= room.settings.bots; i++) room.seats['s' + i] = { uid: 'bot' + i, name: bn[(i - 1) % bn.length] || ('Bot ' + i), bot: true, connected: true, char: freeChar(room) };
    room.status = 'play'; room.gs = JSON.stringify(makeGame(seatEntries(room), room.settings));
    S.room = normalize(room); emit(null); return 'LOCAL';
  }
  const isHost = room => S.mode === 'local' || (!!room && room.hostUid === MY_UID);

  const setSetting = (k, v) => mutate(r => { if (r.status !== 'lobby') return undefined; r.settings[k] = v; r.settings = Sus.normSettings(r.settings); return r; });
  const startOnline = () => mutate(r => {
    if (r.status !== 'lobby' || r.hostUid !== MY_UID || seatEntries(r).length < 2) return undefined;
    r.status = 'play'; r.gs = JSON.stringify(makeGame(seatEntries(r), r.settings)); return r;
  });
  // one action by me; the engine decides if it is legal. `as` = table index to act for (local bots / host acting for a dropped player).
  // lobby: host adds/removes bots; everyone picks their own animal
  const addBot = () => mutate(r => { if (r.status !== 'lobby' || r.hostUid !== MY_UID) return undefined; const k = SEATK.find(x => !r.seats[x]); if (!k) return undefined; const bn = t('botNames') || [], used = new Set(SEATK.filter(x => r.seats[x]).map(x => r.seats[x].name)); const nm = bn.find(x => !used.has(x)) || ('Bot ' + k[1]); r.seats[k] = { uid: 'bot_' + Math.random().toString(36).slice(2, 7), name: nm, bot: true, connected: true, char: freeChar(r) }; return r; });
  const removeBot = key => mutate(r => { if (r.status !== 'lobby' || r.hostUid !== MY_UID || !r.seats[key] || !r.seats[key].bot) return undefined; delete r.seats[key]; return r; });
  const setChar = c => mutate(r => { const k = S.mode === 'local' ? 's0' : SEATK.find(x => r.seats[x] && r.seats[x].uid === MY_UID); if (!k || r.status !== 'lobby') return undefined; if (SEATK.some(x => x !== k && r.seats[x] && r.seats[x].char === c)) return undefined; r.seats[k].char = c; return r; });
  const act = (a, as) => mutate(r => {
    if (r.status !== 'play' || !r.gs) return undefined;
    const g = JSON.parse(r.gs); let seat;
    if (as != null) { if (S.mode === 'online' && r.hostUid !== MY_UID) return undefined; seat = as; }
    else { const me = S.mode === 'local' ? 's0' : SEATK.find(k => r.seats[k] && r.seats[k].uid === MY_UID); seat = g.seatKeys.indexOf(me); }
    if (seat < 0) return undefined;
    if (!Sus.apply(g, seat, a)) return undefined;
    r.gs = JSON.stringify(g); return r;
  });
  const rematch = () => mutate(r => {
    if (r.status !== 'play' || (S.mode === 'online' && r.hostUid !== MY_UID)) return undefined;
    r.gs = JSON.stringify(makeGame(seatEntries(r).filter(e => S.mode === 'local' || r.seats[e.key].connected !== false), r.settings)); return r;
  });
  function emote(kind) { if (S.mode === 'online' && S.ref && mySeat()) S.ref.child('emote').set({ key: mySeat(), k: kind, ts: Date.now() + Math.random() }).catch(() => {}); }
  function leave() {
    if (S.mode === 'online' && S.room) {
      const k = mySeat();
      return mutate(r => {
        if (!k) { delete r.specs[MY_UID]; return r; }
        if (r.status === 'lobby' && k) { delete r.seats[k]; const other = SEATK.find(x => r.seats[x] && !r.seats[x].bot); if (r.hostUid === MY_UID && other) r.hostUid = r.seats[other].uid; return r; }
        if (k) r.seats[k].connected = false; return r;
      }).catch(() => {}).then(() => { rememberRoom(null); detach(); });
    }
    rememberRoom(null); detach(); return Promise.resolve();
  }

  return {
    MY_UID, ONLINE_OK, S, getG, mySeat, isSpec: () => isSpec(S.room), specCount: () => S.room ? Object.keys(S.room.specs || {}).length : 0, isHost, createOnline, joinOnline, tryRejoin, startLocal, addBot, removeBot, setChar, restoreLocal, hasLocal, lastRoom, setSetting, startOnline, emote, act, rematch, leave, SEATK, seatEntries,
    room: () => S.room, mode: () => S.mode, code: () => S.code, onChange: f => { S.onChange = f; }
  };
})();
