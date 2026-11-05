// Room life + sharing, end to end on the REAL net script and the REAL database.rules.json (in-memory Firebase, tests/fakefb.js):
//  - bot names are picked at random from the list and never repeat a name that is already at the table
//  - while you are in an online room the address bar is <page>?room=CODE (and plain again when you leave / play offline)
//  - a room nobody has written to for 24 h is gone: its code stops working, its data is deleted, and the code can be handed out again
const fs = require('fs'), vm = require('vm'), path = require('path'); const { Server, clientDb, clientAuth } = require('./fakefb.js');
const ROOT = process.argv[2] || path.join(__dirname, '..'), RULES = JSON.parse(fs.readFileSync(ROOT + '/database.rules.json', 'utf8'));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else if (process.env.V) console.log('ok  ', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms)), settle = () => sleep(120);   // the fake database delivers snapshots a few ms later, like the real one
const H25 = 25 * 36e5, H23 = 23 * 36e5;
const SRC = ['i18n.js', 'sus-engine.js', 'sus-net.js'].map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')); const errs = [];
function client(server, uid, { queue = [], url = 'https://ngonhai.github.io/sus-tavern/' } = {}) {      // one browser tab with its own address bar
  const store = {}, loc = { href: url, get pathname() { return new URL(this.href).pathname; }, get search() { return new URL(this.href).search; }, get hash() { return new URL(this.href).hash; } };
  const history = { replaceState: (a, b, u) => { loc.href = new URL(u, loc.href).href; } }, rnd = Object.create(Math); rnd.random = () => queue.length ? queue.shift() : Math.random();
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error: (...a) => errs.push(a.join(' ')) }, setTimeout, clearTimeout, setInterval, clearInterval, Math: rnd, JSON, Date, Promise, Object, Array, Set, Map, Number, String, Error, Symbol, RegExp, URL,
    localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, navigator: { language: 'vi' }, document: { documentElement: {} }, location: loc, history,
    db: clientDb(server, uid), auth: clientAuth(uid) });
  SRC.forEach((s, i) => vm.runInContext(s, ctx, { filename: ['i18n', 'engine', 'net'][i] })); return { uid, Net: vm.runInContext('Net', ctx), Sus: vm.runInContext('Sus', ctx), ctx, loc };
}
const NAMES = ['Messi', 'Ronaldo', 'Benzema', 'Modric', 'Bale', 'Ozil', 'DoMixi'];
const age = (server, code, ms, key = 'updatedAt') => server._set('rooms/sus_' + code + '/' + key, Date.now() - ms);
(async () => {
  // ---- 1. bot names
  { const seen = new Set(), firsts = new Set(); let allUnique = true, fromList = true, avoidsHuman = true;
    for (let i = 0; i < 40; i++) { const c = client(new Server(RULES), 'u1'); c.Net.startLocal(i % 2 ? 'Messi' : 'Tester', { bots: 4 }, 'pig'); const r = c.Net.room(), bots = Object.values(r.seats).filter(s => s.bot).map(s => s.name);
      if (new Set(bots).size !== bots.length) allUnique = false; if (!bots.every(n => NAMES.includes(n))) fromList = false; if (i % 2 && bots.includes('Messi')) avoidsHuman = false; firsts.add(bots[0]); bots.forEach(n => seen.add(n)); }
    ok(allUnique, 'offline: the bots at one table never share a name'); ok(fromList, 'offline: bot names come from the list'); ok(avoidsHuman, 'offline: a bot never takes the name of the human at the table'); ok(firsts.size >= 4 && seen.size >= 6, 'offline: the names are random, not always the same ones in the same order (' + firsts.size + ' different first bots)'); }
  { const server = new Server(RULES), H = client(server, 'uH'); await H.Net.ready; const code = await H.Net.createOnline('Host', 'pig'); const added = [];
    for (let i = 0; i < 4; i++) { await H.Net.addBot(); } await settle(); const names = () => Object.values(H.Net.room().seats).filter(s => s.bot).map(s => s.name);
    ok(names().length === 4 && new Set(names()).size === 4 && names().every(n => NAMES.includes(n)), 'online lobby: 4 added bots, all different, all from the list (' + names().join(',') + ')');
    const gone = Object.keys(H.Net.room().seats).find(k => H.Net.room().seats[k].bot); const goneName = H.Net.room().seats[gone].name; await H.Net.removeBot(gone); await settle(); await H.Net.addBot(); await settle();
    ok(new Set(names()).size === 4, 'online lobby: removing a bot and adding another still never repeats a name'); }
  { const server = new Server(RULES), H = client(server, 'uH'); await H.Net.ready; await H.Net.createOnline('Host', 'pig'); vm.runInContext("const _t = t; t = (k, p) => k === 'botNames' ? ['Ann', 'Bob'] : _t(k, p);", H.ctx);
    await H.Net.addBot(); await H.Net.addBot(); await H.Net.addBot(); await settle(); const names = Object.values(H.Net.room().seats).filter(s => s.bot).map(s => s.name);
    ok(new Set(names).size === 3 && names.includes('Ann') && names.includes('Bob') && names.some(n => /^Bot \d$/.test(n)), 'when the list is used up the next bot is "Bot N", still unique (' + names.join(',') + ')'); }

  // ---- 2. the address bar
  { const server = new Server(RULES), A = client(server, 'uA', { url: 'https://ngonhai.github.io/sus-tavern/?lang=vi#top' }); await A.Net.ready; const code = await A.Net.createOnline('Anna', 'pig');
    ok(A.loc.href === 'https://ngonhai.github.io/sus-tavern/?lang=vi&room=' + code + '#top', 'creating a room puts ?room=CODE in the address bar, keeping the rest of the link (' + A.loc.href + ')');
    const B = client(server, 'uB', { url: 'https://ngonhai.github.io/sus-tavern/?room=' + code }); await B.Net.ready; const r = await B.Net.joinOnline(code, 'Ben', 'dog'); ok(r.ok && B.loc.href === 'https://ngonhai.github.io/sus-tavern/?room=' + code, 'joining keeps the same link');
    await B.Net.leave(); ok(B.loc.href === 'https://ngonhai.github.io/sus-tavern/', 'leaving the room takes ?room= out of the address bar'); await A.Net.leave(); ok(!/room=/.test(A.loc.href) && /lang=vi/.test(A.loc.href), 'other parts of the link are left alone');
    const C = client(server, 'uC'); C.Net.startLocal('Cy', { bots: 2 }, 'pig'); ok(!/room=/.test(C.loc.href), 'offline games have no room link'); }
  { // a refresh on the ?room= link: I get my table back; a stranger is NOT dropped into a running game, he gets the join form (null)
    const server = new Server(RULES), A = client(server, 'uA'); await A.Net.ready; const code = await A.Net.createOnline('Anna', 'pig'); const B = client(server, 'uB'); await B.Net.ready; await B.Net.joinOnline(code, 'Ben', 'dog'); await A.Net.addBot(); await settle(); await A.Net.startOnline(); await sleep(250);
    const B2 = client(server, 'uB', { url: 'https://ngonhai.github.io/sus-tavern/?room=' + code }); await B2.Net.ready; const rj = await B2.Net.tryRejoin(code, true); await settle(); ok(rj === code && B2.Net.mySeat() != null, 'refreshing on the link puts a seated player back at the table');
    const X = client(server, 'uX'); await X.Net.ready; ok((await X.Net.tryRejoin(code, true)) === null && X.Net.room() === null, 'a stranger opening the link of a running game is not attached behind his back (he sees the join form)'); }

  // ---- 3. 24 hours
  { const server = new Server(RULES), A = client(server, 'uA'); await A.Net.ready; const code = await A.Net.createOnline('Anna', 'pig'); const t0 = server.get('rooms/sus_' + code + '/updatedAt'); ok(typeof t0 === 'number', 'a new room carries updatedAt');
    await sleep(5); await A.Net.setSetting('devil', true); const t1 = server.get('rooms/sus_' + code + '/updatedAt'); ok(t1 > t0, 'every change to the room moves updatedAt (' + (t1 - t0) + ' ms later)');
    const B = client(server, 'uB'); await B.Net.ready; await B.Net.joinOnline(code, 'Ben', 'dog'); await settle(); await A.Net.addBot(); await settle(); await A.Net.startOnline(); await sleep(250); const t2 = server.get('rooms/sus_' + code + '/updatedAt'); await sleep(5);
    const F = A.Net.authG(), actor = A.Sus.actor(F), info = A.Net.room().seats[F.seatKeys[actor]];   // whoever's turn it is plays: the host for its bot, otherwise the human himself
    if (info.bot) await A.Net.act(A.Sus.bot(F, actor), actor); else { const cl = info.uid === 'uA' ? A : B; await cl.Net.act(cl.Sus.bot(cl.Net.getG(), actor)); } await sleep(150);
    ok(server.get('rooms/sus_' + code + '/updatedAt') > t2, 'in a sealed room each move published by the host moves updatedAt too'); ok(A.Net.room() && A.Net.room().secure === true, '(the room was sealed)'); }
  { const server = new Server(RULES), A = client(server, 'uA'); await A.Net.ready; const code = await A.Net.createOnline('Anna', 'pig'); await settle(); const key = 'sus_' + code; ok(server.get('secure/' + key + '/host') === 'uA', '(sealed room created)');
    const S = client(server, 'uS'); await S.Net.ready; const fb = S.ctx.db;
    const denied = async u => { try { await fb.ref().update(u); return false; } catch (e) { return true; } };
    age(server, code, H23); ok(await denied({ ['secure/' + key]: null }), 'a live room (23 h old) cannot be deleted by a stranger, not even its secure part');
    const B = client(server, 'uB'); await B.Net.ready; ok((await B.Net.joinOnline(code, 'Ben', 'dog')).ok, 'a room 23 h without use can still be joined');
    age(server, code, H25); const B2 = client(server, 'uB2'); await B2.Net.ready; const r = await B2.Net.joinOnline(code, 'Bea', 'hawk');
    ok(!r.ok && r.reason === 'noRoom', 'a room 25 h without use is gone: joining its code says "no room"'); ok(server.get('rooms/' + key) === undefined && server.get('secure/' + key) === undefined, 'and its data (public + secure) is deleted');
    ok(server.denied.filter(d => d.uid === 'uB2').length === 0, 'the cleanup was allowed by the published rules'); }
  { // old rooms made before updatedAt existed: createdAt decides
    const server = new Server(RULES), A = client(server, 'uA'); await A.Net.ready; const code = await A.Net.createOnline('Anna', 'pig'); server._set('rooms/sus_' + code + '/updatedAt', null);
    const B = client(server, 'uB'); await B.Net.ready; ok((await B.Net.joinOnline(code, 'Ben', 'dog')).ok, 'no updatedAt + recent createdAt = alive'); await B.Net.leave(); await settle(); server._set('rooms/sus_' + code + '/updatedAt', null); age(server, code, H25, 'createdAt'); const B2 = client(server, 'uB2'); await B2.Net.ready;
    ok(!(await B2.Net.joinOnline(code, 'Bea', 'hawk')).ok && server.get('rooms/sus_' + code) === undefined, 'no updatedAt + createdAt 25 h ago = expired'); }
  { // rejoin after expiry
    const server = new Server(RULES), A = client(server, 'uA'); await A.Net.ready; const code = await A.Net.createOnline('Anna', 'pig'); age(server, code, H25);
    const A2 = client(server, 'uA'); await A2.Net.ready; ok((await A2.Net.tryRejoin(code)) === null && server.get('rooms/sus_' + code) === undefined, 'an expired room is not resumed after a refresh either'); }
  { // the code can be handed out again; a live code is never reused
    const server = new Server(RULES), A = client(server, 'uA', { queue: [0, 0, 0, 0, 0, 0] }); await A.Net.ready; const code = await A.Net.createOnline('Anna', 'pig'); ok(code === 'AAAAA', '(forced code ' + code + ')');
    const B = client(server, 'uB', { queue: [0, 0, 0, 0, 0, 0] }); await B.Net.ready; const c2 = await B.Net.createOnline('Ben', 'dog'); ok(c2 !== 'AAAAA' && server.get('rooms/sus_AAAAA/hostUid') === 'uA', 'a live room\'s code is never handed out again (the next one got ' + c2 + ')');
    age(server, 'AAAAA', H25); const C = client(server, 'uC', { queue: [0, 0, 0, 0, 0, 0] }); await C.Net.ready; const c3 = await C.Net.createOnline('Cy', 'fox'); await settle();
    ok(c3 === 'AAAAA' && server.get('rooms/sus_AAAAA/hostUid') === 'uC' && server.get('secure/sus_AAAAA/host') === 'uC' && C.Net.room().secure === true, 'an expired code is cleared and handed out again, the new room is sealed under its new host'); }
  ok(errs.length === 0, 'no errors logged by the net code: ' + errs.slice(0, 2).join(' | '));
  console.log(fails ? fails + ' FAILED' : 'room tests passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(2); });
