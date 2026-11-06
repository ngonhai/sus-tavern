// sus-net.js — room storage + room-level actions. Two backends behind one interface:
//   online : Firebase Realtime Database, room at rooms/sus_<CODE>
//   local  : in-memory (you vs 1-4 bots), mirrored into localStorage so a refresh restores it
// The game state is stored as ONE JSON string (room.gs): Firebase drops empty arrays/nulls, a string keeps the state exactly as the engine made it.
// Every write is a pure function room -> room run inside a transaction online, so two clients can't clobber each other.
// SEALED ROOMS (room.secure, needs Firebase anonymous sign-in + database.rules.json): the room only carries the PUBLIC state (Sus.pub: no card kinds, no bullet, no seed).
//   secure/<room>/sec        the full state, readable by the host only (the host's browser is the table's referee)
//   secure/<room>/priv/<uid> that player's own cards, readable by that player only
//   secure/<room>/acts/<uid> a player's move waiting for the host (play / call / pull), writable by that player only
// TABLE CHAT (online only): roomChats/<room>/<time-ordered key> = { u: uid, k: seat key ('' = spectator), n: name, x: text, ts }; the path is open in database.rules.json, no sign-in needed.
// Without sign-in or without the published rules rooms stay open (the old behaviour: the whole state, hands included, is in the room).
const Net = (function () {
  let MY_UID = (function () {
    try { let id = localStorage.getItem('sus_uid'); if (!id) { id = 'u_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('sus_uid', id); } return id; }
    catch (e) { return 'u_' + Math.random().toString(36).slice(2, 10); }
  })();
  const ONLINE_OK = typeof db !== 'undefined' && db !== null;
  let AUTH_OK = false;         // MY_UID is replaced by the Firebase anonymous uid, which is what the database rules see as auth.uid
  const ready = (async function () {
    try { if (typeof auth === 'undefined' || !auth) return; const u = (await new Promise(r => { const off = auth.onAuthStateChanged(x => { off(); r(x); }); })) || (await auth.signInAnonymously()).user; MY_UID = u.uid; AUTH_OK = true; }
    catch (e) { console.warn('Anonymous sign-in failed (enable Authentication > Anonymous in Firebase): rooms are not cheat-proof.', e); }
  })();
  const S = { mode: null, code: null, room: null, onChange: null, ref: null, connRef: null, gKey: null, g: null, pubG: null, priv: null, full: null, offs: [], waiters: [], why: '' };
  const SEATK = ['s0', 's1', 's2', 's3', 's4'];
  const freeChar = (r, want) => { const used = new Set(SEATK.filter(k => r.seats[k] && r.seats[k].char).map(k => r.seats[k].char)); if (want && Sus.CHARS.includes(want) && !used.has(want)) return want; const f = Sus.CHARS.filter(c => !used.has(c)); return f[Math.floor(Math.random() * f.length)] || Sus.CHARS[0]; };
  const keyOf = c => 'sus_' + c;
  const codeGen = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };
  const LOCAL_KEY = 'sus_local_room', LAST_KEY = 'sus_last_room', TTL = 12 * 36e5, ROOM_TTL = 24 * 36e5;   // ROOM_TTL: a room nobody has written to for 24 h is gone (its code works no more and can be handed out again)

  function normalize(r) { if (!r) return r; if (r.sign == null) r.sign = Math.floor(Math.random() * 1000); r.seats = r.seats || {}; r.specs = r.specs || {}; r.settings = Sus.normSettings(r.settings); return r; }
  const byKind = (a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : a.id - b.id;
  // the state the UI works with. Local / open rooms: the whole state. Sealed rooms: the public state with MY cards put into my seat (null until they have arrived with this very state).
  function getG(room) {
    room = room || S.room; if (!room || !room.gs) return null;
    if (room.gs !== S.gKey) { try { S.pubG = JSON.parse(room.gs); S.gKey = room.gs; S.g = null; } catch (e) { return null; } }
    if (!room.secure || S.mode !== 'online') return S.pubG;
    const g = S.pubG, key = mySeatOf(room), i = key ? g.seatKeys.indexOf(key) : -1; if (i < 0) return g;          // a spectator sees the public table only
    const src = room.hostUid === MY_UID ? S.full : S.priv, hand = src && src.id === g.id && src.seq === g.seq ? (src.hands ? src.hands[i] : src.hand) : null;
    if (!hand) return null;
    return S.g || (S.g = Object.assign({}, g, { hands: g.hands.map((h, j) => j === i ? hand.map(c => ({ id: c.id, k: c.k })).sort(byKind) : h) }));
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
  function settle() { getG(S.room); const sq = S.pubG ? S.pubG.seq : -1; S.waiters = S.waiters.filter(w => { if (sq > w.base) { clearTimeout(w.t); w.res(true); return false; } return true; }); }
  function emit(prev) { saveLocal(); if (S.waiters.length) settle(); if (S.onChange) S.onChange(S.room, prev); }

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
        if (out) out.updatedAt = Date.now();
        return out ? out : undefined;
      }, undefined, false);
      return !!(res && res.committed);
    }
    return false;
  }

  function attach(code) {
    S.mode = 'online'; S.code = code; S.ref = db.ref('rooms/' + keyOf(code)); rememberRoom(code); setUrl(code);
    S.ref.on('value', snap => { const prev = S.room, v = snap.val(); S.room = v ? normalize(v) : null; wireSecure(); emit(prev); });
    S.connRef = db.ref('.info/connected');
    S.connRef.on('value', snap => { if (snap.val() === true && S.room) armPresence(); });
    wireChat(code);
  }
  // the last 60 messages arrive first (oldest first), then every new one; the UI dedupes by key
  function wireChat(code) {
    const base = db.ref('roomChats/' + keyOf(code)), q = base.limitToLast ? base.limitToLast(60) : base; S.chatRef = base; S.offs.push(q);
    q.on('child_added', snap => { const m = snap.val(); if (m && typeof m.x === 'string' && S.onChat) S.onChat(m, snap.key); });
  }
  const CHAT_MAX = 120;
  function chatSend(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX); const r = S.room, k = r && mySeat(), me = r && (k ? r.seats[k] : r.specs[MY_UID]);
    if (!text || S.mode !== 'online' || !S.chatRef || !me) return Promise.resolve(false);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);          // keys sort by time, which is the order the messages are shown in
    return S.chatRef.child(id).set({ u: MY_UID, k: k || '', n: me.name, x: text, ts: Date.now() }).then(() => true, () => false);
  }
  // The address bar always carries the room link (<this page>?room=CODE) while you are in an online room: share it, bookmark it, refresh it.
  function setUrl(code) { try { const u = new URL(location.href); if (code) u.searchParams.set('room', code); else u.searchParams.delete('room'); if (u.href !== location.href) history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) {} }
  const isStale = r => !!r && Date.now() - (r.updatedAt || r.createdAt || 0) > ROOM_TTL;
  async function purge(code) {       // delete an expired room; the 'secure' part may only go if the published rules know about expiry, so fall back to the public part alone
    const id = keyOf(code); try { await db.ref().update({ ['rooms/' + id]: null, ['secure/' + id]: null, ['roomChats/' + id]: null }); } catch (e) { try { await db.ref('rooms/' + id).remove(); await db.ref('roomChats/' + id).remove(); } catch (e2) {} }
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
    S.offs.forEach(r => r.off()); S.offs = []; S.waiters.forEach(w => { clearTimeout(w.t); w.res(false); }); S.waiters = []; S.priv = S.full = S.pubG = null; S.wPriv = S.wActs = S.loading = false; S.chain = null; S.chatRef = null;
    S.mode = null; S.code = null; S.room = null; S.g = null; S.gKey = null; setUrl(null);
  }

  const baseRoom = host => ({ game: 'sus', hostUid: host, status: 'lobby', settings: Object.assign({}, Sus.DEFAULTS), seats: {}, gs: '', createdAt: Date.now(), updatedAt: Date.now(), sign: Math.floor(Math.random() * 1000), lang: LANG });   // sign = which tavern sign hangs on the wall for the whole life of the room
  const botName = () => t('bot');
  // random name from the list that nobody at the table has (humans or bots, case-insensitive); only when the list is used up: 'Bot N'
  const pickBotName = (used, n) => { const low = new Set(used.map(x => String(x).toLowerCase())), pool = (t('botNames') || []).filter(x => !low.has(x.toLowerCase())); return pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'Bot ' + n; };

  const specName = () => { try { return localStorage.getItem('sus_name') || 'Guest'; } catch (e) { return 'Guest'; } };
  const isSpec = room => !!(room && !mySeatOf(room) && room.specs && room.specs[MY_UID]);
  const mySeatOf = room => SEATK.find(k => room.seats[k] && room.seats[k].uid === MY_UID) || null;
  async function createOnline(name, char) {
    if (!ONLINE_OK) throw new Error('offline'); await ready;
    let code = codeGen(); for (let i = 0; ; i++) { const ex = await db.ref('rooms/' + keyOf(code)).get(); if (!ex.exists()) break; if (isStale(ex.val())) { await purge(code); break; } if (i > 8) throw new Error('busy'); code = codeGen(); }
    const room = baseRoom(MY_UID);
    room.seats.s0 = { uid: MY_UID, name, connected: true, char: freeChar(room, char) };
    S.why = AUTH_OK ? '' : 'auth';
    if (AUTH_OK) {      // a sealed room only if sign-in works AND the published rules really keep other people's cards unreadable (with open rules sealing would protect nothing)
      try { await db.ref('secure/' + keyOf(code) + '/host').set(MY_UID); const open = await db.ref('secure/' + keyOf(code) + '/priv/probe').get().then(() => true, () => false); if (open) S.why = 'rules'; else room.secure = true; }
      catch (e) { S.why = 'rules'; }
    }
    await db.ref('roomChats/' + keyOf(code)).remove().catch(() => {});      // a brand new room never inherits old messages
    await db.ref('rooms/' + keyOf(code)).set(room);
    attach(code); return code;
  }
  async function joinOnline(code, name, char) {
    if (!ONLINE_OK) throw new Error('offline'); await ready;
    code = code.toUpperCase().trim();
    const snap = await db.ref('rooms/' + keyOf(code)).get();
    if (!snap.exists()) return { ok: false, reason: 'noRoom' };
    if (isStale(snap.val())) { await purge(code); return { ok: false, reason: 'noRoom' }; }
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
  async function tryRejoin(code, seatedOnly) {      // seatedOnly (a shared ?room= link): only take the table back if I already sit / watch there
    if (!ONLINE_OK || !code) return null; await ready;
    code = code.toUpperCase();
    const snap = await db.ref('rooms/' + keyOf(code)).get();
    if (!snap.exists()) return null;
    if (isStale(snap.val())) { await purge(code); return null; }
    const r = normalize(snap.val());
    if (mySeatOf(r) || (r.specs && r.specs[MY_UID]) || (!seatedOnly && r.status === 'play')) { attach(code); return code; }
    return null;
  }

  // table order is shuffled when a game starts; g.seatKeys[i] = room seat key of table position i (bots: 'b1'..)
  function makeGame(entries, settings, sign, lang) {
    const order = entries.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const g = Sus.newGame(order.map(e => e.name), settings, null, order.map(e => e.char)); g.seatKeys = order.map(e => e.key); if (sign != null) g.sign = sign; if (lang) g.lang = lang; return g;
  }
  const seatEntries = r => SEATK.filter(k => r.seats[k]).map(k => ({ key: k, name: r.seats[k].name, char: r.seats[k].char }));
  function startLocal(name, settings, char) {
    setUrl(null); S.mode = 'local'; S.code = 'LOCAL'; rememberRoom(null);
    const room = baseRoom('local'); room.settings = Sus.normSettings(settings);
    room.seats.s0 = { uid: 'local', name, local: true, connected: true, char: Sus.CHARS.includes(char) ? char : undefined }; if (!room.seats.s0.char) room.seats.s0.char = freeChar(room);
    for (let i = 1; i <= room.settings.bots; i++) room.seats['s' + i] = { uid: 'bot' + i, name: pickBotName(SEATK.filter(x => room.seats[x]).map(x => room.seats[x].name), i), bot: true, connected: true, char: freeChar(room) };
    room.status = 'play'; room.gs = JSON.stringify(makeGame(seatEntries(room), room.settings, room.sign, room.lang));
    S.room = normalize(room); emit(null); return 'LOCAL';
  }
  const isHost = room => S.mode === 'local' || (!!room && room.hostUid === MY_UID);

  const setSetting = (k, v) => mutate(r => { if (r.status !== 'lobby') return undefined; r.settings[k] = v; r.settings = Sus.normSettings(r.settings); return r; });
  const startOpen = () => mutate(r => {
    if (r.status !== 'lobby' || r.hostUid !== MY_UID || seatEntries(r).length < 2) return undefined;
    r.status = 'play'; r.gs = JSON.stringify(makeGame(seatEntries(r), r.settings, r.sign, r.lang)); return r;
  });
  // one action by me; the engine decides if it is legal. `as` = table index to act for (local bots / host acting for a dropped player).
  // lobby: host adds/removes bots; everyone picks their own animal
  const addBot = () => mutate(r => { if (r.status !== 'lobby' || r.hostUid !== MY_UID) return undefined; const k = SEATK.find(x => !r.seats[x]); if (!k) return undefined; const nm = pickBotName(SEATK.filter(x => r.seats[x]).map(x => r.seats[x].name), k[1]); r.seats[k] = { uid: 'bot_' + Math.random().toString(36).slice(2, 7), name: nm, bot: true, connected: true, char: freeChar(r) }; return r; });
  const removeBot = key => mutate(r => { if (r.status !== 'lobby' || r.hostUid !== MY_UID || !r.seats[key] || !r.seats[key].bot) return undefined; delete r.seats[key]; return r; });
  const setChar = c => mutate(r => { const k = S.mode === 'local' ? 's0' : SEATK.find(x => r.seats[x] && r.seats[x].uid === MY_UID); if (!k || r.status !== 'lobby') return undefined; if (SEATK.some(x => x !== k && r.seats[x] && r.seats[x].char === c)) return undefined; r.seats[k].char = c; return r; });
  const actOpen = (a, as) => mutate(r => {
    if (r.status !== 'play' || !r.gs) return undefined;
    const g = JSON.parse(r.gs); let seat;
    if (as != null) { if (S.mode === 'online' && r.hostUid !== MY_UID) return undefined; seat = as; }
    else { const me = S.mode === 'local' ? 's0' : SEATK.find(k => r.seats[k] && r.seats[k].uid === MY_UID); seat = g.seatKeys.indexOf(me); }
    if (seat < 0) return undefined;
    if (!Sus.apply(g, seat, a)) return undefined;
    r.gs = JSON.stringify(g); return r;
  });
  const rematchOpen = () => mutate(r => {
    if (r.status !== 'play' || (S.mode === 'online' && r.hostUid !== MY_UID)) return undefined;
    r.gs = JSON.stringify(makeGame(seatEntries(r).filter(e => S.mode === 'local' || r.seats[e.key].connected !== false), r.settings, r.sign, r.lang)); return r;
  });
  // ---- sealed rooms: the host's browser is the referee ----
  const sref = () => db.ref('secure/' + keyOf(S.code));
  const sealed = () => S.mode === 'online' && !!S.room && !!S.room.secure;
  const amHost = () => !!S.room && S.room.hostUid === MY_UID;
  const authG = () => sealed() && amHost() ? S.full : null;                       // the full state, host only: the host's bots decide on it
  const run = fn => { const p = (S.chain || Promise.resolve()).then(fn); S.chain = p.catch(() => {}); return p; };           // host work happens one step at a time
  function publish(g) {                // ONE atomic write: the public state, every other human's own cards, and the full copy for the host
    const key = keyOf(S.code), u = {}; u['rooms/' + key + '/gs'] = JSON.stringify(Sus.pub(g)); u['rooms/' + key + '/updatedAt'] = Date.now(); u['secure/' + key + '/sec'] = JSON.stringify(g);
    g.seatKeys.forEach((k, i) => { const x = S.room.seats[k]; if (x && !x.bot && x.uid && x.uid !== MY_UID) u['secure/' + key + '/priv/' + x.uid] = JSON.stringify({ id: g.id, seq: g.seq, hand: g.hands[i] }); });
    return db.ref().update(u);
  }
  async function applyNow(seat, a) { const F = S.full; if (!F) return false; const g = JSON.parse(JSON.stringify(F)); if (!Sus.apply(g, seat, a)) return false; S.full = g; await publish(g); return true; }
  function onAct(snap) {               // a player's move arrives in the host's inbox; it only counts if it was made on the current state, by the player whose turn it is
    const uid = snap.key, v = snap.val(); if (!v || !v.a) return; snap.ref.remove().catch(() => {});
    run(async () => {
      const r = S.room, F = S.full; if (!r || !F || r.status !== 'play') return false;
      const k = SEATK.find(x => r.seats[x] && r.seats[x].uid === uid), seat = k ? F.seatKeys.indexOf(k) : -1;
      if (seat < 0 || v.base !== F.seq || !['play', 'call', 'pull'].includes(v.a.t)) return false; return applyNow(seat, v.a);
    });
  }
  function wireSecure() {
    const r = S.room; if (S.mode !== 'online' || !r || !r.secure || !S.ref) return; const b = sref();
    if (!S.wPriv) { S.wPriv = true; const q = b.child('priv/' + MY_UID); S.offs.push(q); q.on('value', snap => { try { S.priv = snap.val() ? JSON.parse(snap.val()) : null; } catch (e) { S.priv = null; } if (S.room) emit(S.room); }); }
    if (r.hostUid !== MY_UID) return;
    if (!S.wActs) { S.wActs = true; const q = b.child('acts'); S.offs.push(q); q.on('child_added', onAct); q.on('child_changed', onAct); }
    if (r.status === 'play' && !S.full && !S.loading) { S.loading = true; b.child('sec').get().then(sn => { if (sn.val()) S.full = JSON.parse(sn.val()); }).catch(() => {}).then(() => { S.loading = false; if (S.room) emit(S.room); }); }   // the host reloaded the page: take the table back
  }
  async function actSealed(a, as) {
    const r = S.room; if (!r) return false;
    if (amHost()) { const F = S.full, seat = as != null ? as : F ? F.seatKeys.indexOf(mySeatOf(r)) : -1; return seat >= 0 ? run(() => applyNow(seat, a)) : false; }
    if (as != null || a.t === 'talk' || !S.pubG) return false;
    const msg = { base: S.pubG.seq, a: { t: a.t } }; if (a.ids) msg.a.ids = a.ids.slice(0, 3);
    try { await sref().child('acts/' + MY_UID).set(msg); } catch (e) { return false; }
    return new Promise(res => { const w = { base: msg.base, res, t: setTimeout(() => { S.waiters = S.waiters.filter(x => x !== w); res(false); }, 4000) }; S.waiters.push(w); settle(); });      // true as soon as the host has moved the table on
  }
  async function startSealed() {
    const r0 = S.room; if (!r0 || r0.status !== 'lobby' || r0.hostUid !== MY_UID || seatEntries(r0).length < 2) return false;
    const F = makeGame(seatEntries(r0), r0.settings, r0.sign, r0.lang), sig = F.seatKeys.slice().sort().join();
    const ok = await mutate(r => { if (r.status !== 'lobby' || r.hostUid !== MY_UID || seatEntries(r).map(e => e.key).sort().join() !== sig) return undefined; r.status = 'play'; r.gs = JSON.stringify(Sus.pub(F)); return r; });
    if (!ok) return false; S.full = F; await run(() => publish(F)); emit(S.room); return true;
  }
  async function rematchSealed() {
    const r = S.room; if (!r || r.status !== 'play' || !amHost()) return false;
    S.full = makeGame(seatEntries(r).filter(e => r.seats[e.key].connected !== false), r.settings, r.sign, r.lang); await run(() => publish(S.full)); emit(S.room); return true;
  }
  const startOnline = () => sealed() ? startSealed() : startOpen();
  const act = (a, as) => sealed() ? actSealed(a, as) : actOpen(a, as);
  const rematch = () => sealed() ? rematchSealed() : rematchOpen();
  const protection = () => S.mode !== 'online' ? null : sealed() ? 'on' : (S.why || 'off');          // 'on' | 'auth' (sign-in failed) | 'rules' (rules not published) | 'off' (room made by an older version)
  function emote(kind) { if (S.mode === 'online' && S.ref && mySeat()) S.ref.child('emote').set({ key: mySeat(), k: kind, ts: Date.now() + Math.random() }).catch(() => {}); }
  function leave() {
    if (S.mode === 'online' && S.room) {
      const k = mySeat(), hostLobby = sealed() && amHost() && S.room.status === 'lobby';
      return mutate(r => {
        if (!k) { delete r.specs[MY_UID]; return r; }
        if (r.status === 'lobby' && k) { delete r.seats[k]; const other = SEATK.find(x => r.seats[x] && !r.seats[x].bot); if (r.hostUid === MY_UID && other) r.hostUid = r.seats[other].uid; return r; }
        if (k) r.seats[k].connected = false; return r;
      }).then(async () => { const nh = S.room && S.room.hostUid; if (hostLobby && nh && nh !== MY_UID) await sref().child('host').set(nh); }).catch(() => {}).then(() => { rememberRoom(null); detach(); });
    }
    rememberRoom(null); detach(); return Promise.resolve();
  }

  return {
    get MY_UID() { return MY_UID; }, ONLINE_OK, S, ready, authG, protection, getG, mySeat, isSpec: () => isSpec(S.room), specCount: () => S.room ? Object.keys(S.room.specs || {}).length : 0, isHost, createOnline, joinOnline, tryRejoin, startLocal, addBot, removeBot, setChar, restoreLocal, hasLocal, lastRoom, setSetting, startOnline, emote, chatSend, onChat: f => { S.onChat = f; }, act, rematch, leave, SEATK, seatEntries,
    room: () => S.room, mode: () => S.mode, code: () => S.code, onChange: f => { S.onChange = f; }
  };
})();
