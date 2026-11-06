// Table chat, end to end on the REAL net script and the REAL database.rules.json (in-memory Firebase, tests/fakefb.js):
//  - a message from one browser reaches everybody in the room (players and spectators), oldest first, with the sender's seat key and name
//  - late joiners get the history; a spectator can talk; empty / over-long text is cleaned; offline games have no chat
//  - a brand new room never inherits old messages, and an expired room takes its chat with it
const fs = require('fs'), vm = require('vm'), path = require('path'); const { Server, clientDb, clientAuth } = require('./fakefb.js');
const ROOT = process.argv[2] || path.join(__dirname, '..'), RULES = JSON.parse(fs.readFileSync(ROOT + '/database.rules.json', 'utf8'));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else if (process.env.V) console.log('ok  ', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms)), settle = () => sleep(120);
const SRC = ['i18n.js', 'sus-engine.js', 'sus-net.js'].map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')), errs = [];
function client(server, uid, fixed) {
  const rnd = Object.create(Math); rnd.random = () => fixed != null ? fixed : Math.random();
  const store = {}, loc = { href: 'https://x.test/sus/', get pathname() { return new URL(this.href).pathname; }, get search() { return new URL(this.href).search; }, get hash() { return ''; } };
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error: (...a) => errs.push(a.join(' ')) }, setTimeout, clearTimeout, Math: rnd, JSON, Date, Promise, Object, Array, Set, Map, Number, String, Error, Symbol, RegExp, URL,
    localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, navigator: { language: 'vi' }, document: { documentElement: {} }, location: loc, history: { replaceState: (a, b, u) => { loc.href = new URL(u, loc.href).href; } },
    db: clientDb(server, uid), auth: clientAuth(uid) });
  SRC.forEach((s, i) => vm.runInContext(s, ctx, { filename: ['i18n', 'engine', 'net'][i] })); const Net = vm.runInContext('Net', ctx), got = []; Net.onChat((m, k) => got.push({ m, k })); return { Net, got };
}
(async () => {
  const server = new Server(RULES), A = client(server, 'uA'), B = client(server, 'uB'); await A.Net.ready; await B.Net.ready;
  const code = await A.Net.createOnline('Anna', 'pig'); await B.Net.joinOnline(code, 'Ben', 'dog'); await settle();
  ok(await A.Net.chatSend('  xin   chào  cả bàn '), 'sending works'); await settle();
  ok(A.got.length === 1 && B.got.length === 1, 'the sender and the other player both receive it (' + A.got.length + '/' + B.got.length + ')');
  const m = B.got[0] && B.got[0].m; ok(m && m.x === 'xin chào cả bàn' && m.n === 'Anna' && m.k === 's0' && m.u === 'uA', 'text is tidied, and carries name + seat key + uid (' + JSON.stringify(m) + ')');
  await sleep(3); await B.Net.chatSend('hi Anna'); await sleep(3); await A.Net.chatSend('x'.repeat(500)); await settle();
  ok(B.got.map(g => g.m.n).join() === 'Anna,Ben,Anna' && B.got[2].m.x.length === 120, 'messages come in order and are cut at 120 characters');
  ok(!(await A.Net.chatSend('   ')) && !(await A.Net.chatSend('')), 'empty text is not sent');
  const D = client(server, 'uD'); await D.Net.ready; await A.Net.addBot(); await settle(); await A.Net.startOnline(); await sleep(250);
  const E = client(server, 'uE'); await E.Net.ready; const r = await E.Net.joinOnline(code, 'Eve', 'fox'); await settle(); ok(r.ok && r.spectator, 'a later joiner becomes a spectator');
  ok(E.got.length === 3 && E.got[0].m.x === 'xin chào cả bàn', 'a spectator who arrives late receives the history');
  await E.Net.chatSend('đẹp quá'); await settle(); ok(A.got.length === 4 && A.got[3].m.k === '' && A.got[3].m.n === 'Eve', 'a spectator can talk (seat key is empty)');
  ok(!server.denied.some(d => /roomChats/.test(d.path)), 'the published rules allow all of it (denied: ' + JSON.stringify(server.denied.filter(d => /roomChats/.test(d.path))) + ')');
  // offline: no chat, no crash
  const L = client(server, 'uL'); L.Net.startLocal('Solo', { bots: 2 }, 'pig'); ok(!(await L.Net.chatSend('hello')), 'an offline game has no chat');
  // a leaver stops receiving; a new room on a fresh code starts empty
  await B.Net.leave(); const before = B.got.length; await A.Net.chatSend('bye Ben'); await settle(); ok(B.got.length === before, 'after leaving, no more messages arrive');
  // expiry: the chat goes with the room
  server._set('rooms/sus_' + code + '/updatedAt', Date.now() - 25 * 36e5); const F = client(server, 'uF'); await F.Net.ready; const rj = await F.Net.joinOnline(code, 'Fay', 'dog'); await settle();
  ok(!rj.ok && server.get('roomChats/sus_' + code) === undefined, 'an expired room is deleted together with its chat');
  // a new room that lands on an old chat leftover starts clean (Math.random fixed -> the code is AAAAA)
  server._set('roomChats/sus_AAAAA/a', { u: 'x', k: 's0', n: 'Old', x: 'old', ts: 1 });
  const H = client(server, 'uH', 0); await H.Net.ready; const hc = await H.Net.createOnline('Hal', 'pig'); await settle();
  ok(hc === 'AAAAA' && H.got.length === 0 && server.get('roomChats/sus_AAAAA') === undefined, 'a new room never inherits old messages');
  console.log(fails ? fails + ' FAILED' : 'chat tests passed'); if (errs.length) console.log('console.error:', errs.slice(0, 3)); process.exit(fails ? 1 : 0);
})();
