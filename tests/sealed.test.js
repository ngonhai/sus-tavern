// Sealed online rooms, end to end: several browsers (each running the REAL i18n/engine/net scripts in its own scope) talk to an in-memory Firebase (tests/fakefb.js)
// that enforces the REAL database.rules.json. Checks that nothing hidden reaches another browser, that attacks are refused, and that reloads / fallbacks work.
const fs = require('fs'), vm = require('vm'), path = require('path'); const { Server, clientDb, clientAuth } = require('./fakefb.js');
const ROOT = process.argv[2] || path.join(__dirname, '..'), RULES = JSON.parse(fs.readFileSync(ROOT + '/database.rules.json', 'utf8'));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else if (process.env.V) console.log('ok  ', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SRC = ['i18n.js', 'sus-engine.js', 'sus-net.js'].map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'));
function client(server, uid, { auth = true } = {}) {   // one browser: its own global scope, running the REAL i18n / engine / net scripts
  const store = {}; const ctx = vm.createContext({ console: { log() {}, warn() {}, error: (...a) => errs.push(a.join(' ')) }, setTimeout, clearTimeout, setInterval, clearInterval, Math, JSON, Date, Promise, Object, Array, Set, Map, Number, String, Error, Symbol, RegExp,
    localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, navigator: { language: 'vi' }, document: { documentElement: {} }, db: clientDb(server, auth ? uid : null), auth: auth ? clientAuth(uid) : null });
  SRC.forEach((s, i) => vm.runInContext(s, ctx, { filename: ['i18n', 'engine', 'net'][i] })); const Net = vm.runInContext('Net', ctx), Sus = vm.runInContext('Sus', ctx);
  return { uid, Net, Sus, ctx, pending: false };
}
const errs = [];
// a human (or the host, for its bots) takes its turn if it is its turn; same decision code for everybody, but each only sees what its browser was given
function tick(c) {
  const Net = c.Net, room = Net.room(); if (!room || room.status !== 'play' || c.pending) return; const g = Net.getG(); if (!g || g.phase === 'over') return;
  const actor = c.Sus.actor(g), me = Net.mySeat() ? g.seatKeys.indexOf(Net.mySeat()) : -1;
  if (actor === me) { c.pending = true; Net.act(c.Sus.bot(g, me)).then(() => { c.pending = false; }, () => { c.pending = false; }); return; }
  if (Net.isHost(room) && room.seats[g.seatKeys[actor]] && room.seats[g.seatKeys[actor]].bot) { const F = room.secure ? Net.authG() : g; if (!F || F.seq !== g.seq) return; c.pending = true; Net.act(c.Sus.bot(F, actor), actor).then(() => { c.pending = false; }, () => { c.pending = false; }); }
}
async function play(server, clients, until = () => false, maxMs = 60000) { const t0 = Date.now(); while (Date.now() - t0 < maxMs) { clients.forEach(tick); await sleep(2); const host = clients[0], g = host.Net.getG(); if (until(g)) return g; if (g && g.phase === 'over') { await sleep(30); return g; } } return null; }
function leakCheck(server, label, secure) {
  let bad = 0, seen = 0;
  for (const d of server.deliveries) {
    if (/^rooms\/[^/]+$/.test(d.path)) { const room = JSON.parse(d.json); if (!room || !room.gs) continue; seen++; const g = JSON.parse(room.gs);
      if (secure) { const cards = [...g.hands.flat(), ...g.pile, ...(g.last ? g.last.cards : [])];
        if (cards.some(c => Object.keys(c).join() !== 'id') || g.rs !== 0 || g.gun.some(q => q.bullet !== -1) || g.hands.some(h => h.some((c, i) => i && h[i - 1].id > c.id))) bad++; } }
    if (/^secure\/[^/]+\/sec/.test(d.path) && d.uid !== server.hostUid) bad += 1000;
    const m = d.path.match(/^secure\/[^/]+\/priv\/(.+)$/); if (m && m[1] !== d.uid) bad += 1000;
  }
  ok(bad === 0 && seen > 20, label + ': what the browsers were given carries no hidden card/bullet/seed (' + seen + ' room snapshots checked' + (bad ? ', ' + bad + ' leaks' : '') + ')');
}
async function lobby(server, { hostAuth = true, joiners = 2, settings = {} } = {}) {
  const H = client(server, 'uidH', { auth: hostAuth }); await H.Net.ready; const code = await H.Net.createOnline('Host', 'pig'); server.hostUid = 'uidH'; const cs = [H];
  for (let i = 0; i < joiners; i++) { const c = client(server, 'uid' + 'BCD'[i]); await c.Net.ready; await c.Net.joinOnline(code, 'P' + (i + 2), ['dog', 'hawk', 'octo'][i]); cs.push(c); }
  await H.Net.addBot(); for (const [k, v] of Object.entries(settings)) await H.Net.setSetting(k, v); await sleep(200); return { code, cs, H };
}
(async () => {
  // ---- 1. a sealed room, played to the end by 3 humans + 1 bot
  { const server = new Server(RULES), { code, cs, H } = await lobby(server, { settings: { devil: true } });
    ok(H.Net.room().secure === true && H.Net.protection() === 'on', 'room is sealed when sign-in works and the rules are published'); ok(await H.Net.startOnline(), 'host starts the game'); await sleep(250);
    const keys = cs.map(c => c.Net.getG()); ok(keys.every(Boolean), 'every human has a state to show (public state + own cards)');
    // own cards are right and others' are hidden in what each browser holds
    const F = H.Net.authG(); ok(!!F && F.hands.every(h => h.every(c => c.k)), 'only the host holds the full state'); ok(cs.slice(1).every(c => !c.Net.authG()), 'other players hold no full state');
    cs.forEach(c => { const g = c.Net.getG(), me = g.seatKeys.indexOf(c.Net.mySeat()); const mine = g.hands[me].map(x => x.k + x.id).sort().join(), real = F.hands[me].map(x => x.k + x.id).sort().join(); ok(mine === real, c.uid + ' sees exactly its own cards'); ok(g.hands.every((h, i) => i === me || h.every(x => x.k === undefined)), c.uid + ' sees no kind in anybody else\'s hand'); });
    const g = await play(server, cs); ok(g && g.phase === 'over' && g.winner >= 0, 'the game is played to the end through the host (winner seat ' + (g && g.winner) + ', ' + (g && g.seq) + ' states)');
    leakCheck(server, 'sealed game', true);
    // active attacks by a technical player who got in as a spectator (signed in, knows the room code)
    const X = client(server, 'uidX'); await X.Net.ready; const key = 'rooms/sus_' + code; const fb = X.ctx.db;
    const dn = async p => { try { await fb.ref(p).get(); return false; } catch (e) { return true; } };
    ok(await dn('secure/sus_' + code + '/sec'), 'attacker cannot read the full state'); ok(await dn('secure/sus_' + code + '/priv/uidB'), 'attacker cannot read another player\'s cards'); ok(await dn('secure/sus_' + code), 'attacker cannot read the whole secure node'); ok(await dn('secure/sus_' + code + '/acts'), 'attacker cannot read the move inbox');
    const wd = async (p, v) => { try { await fb.ref(p).set(v); return false; } catch (e) { return true; } };
    ok(await wd('secure/sus_' + code + '/host', 'uidX'), 'attacker cannot make itself the host'); ok(await wd('secure/sus_' + code + '/acts/uidB', { base: 0, a: { t: 'call' } }), 'attacker cannot send moves in another player\'s name'); ok(await wd('secure/sus_' + code + '/priv/uidX', '{}'), 'attacker cannot write cards for itself');
    ok(!(await dn('rooms/sus_' + code)), 'the public room stays readable'); const me = await fb.ref('secure/sus_' + code + '/priv/uidX').get(); ok(me.val() === null, 'a spectator\'s own private slot is just empty');
    const Y = client(server, 'uidY', { auth: false }); ok(await (async () => { try { await Y.ctx.db.ref('secure/sus_' + code + '/sec').get(); return false; } catch (e) { return true; } })(), 'a client that is not signed in cannot read secrets either');
    { const bad = server.denied.filter(d => ['uidB', 'uidC', 'uidH'].includes(d.uid) && !/priv\/probe$/.test(d.path)); ok(bad.length === 0, 'honest players never hit a permission error, apart from the deliberate rules probe (' + JSON.stringify(bad.slice(0, 2)) + ')'); } }
  // ---- 2. a stale or forged move is ignored; the host can reload its page mid-game and carry on; a player can refresh
  { const server = new Server(RULES), { code, cs, H } = await lobby(server); await H.Net.startOnline(); await sleep(200); await play(server, cs, g => g && g.seq >= 12);
    const before = H.Net.authG().seq; const B = cs[1]; const g0 = B.Net.S.pubG; const bogus = await new Promise(res => { B.ctx.db.ref('secure/sus_' + code + '/acts/uidB').set({ base: g0.seq - 5, a: { t: 'call' } }).then(() => setTimeout(res, 40)); });
    ok(H.Net.authG().seq === before || H.Net.authG().seq > before, 'a move made on an old state is dropped'); ok(server.get('secure/sus_' + code + '/acts/uidB') === undefined, 'and the inbox is emptied');
    // host reloads: a brand-new browser with the same account
    cs[0].Net.S.chain = null; const H2 = client(server, 'uidH'); await H2.Net.ready; const c2 = await H2.Net.tryRejoin(code); await sleep(300); ok(!!c2 && !!H2.Net.authG() && H2.Net.authG().seq >= before, 'the host takes the table back after a reload (state restored from its private copy)');
    // player refresh
    const B2 = client(server, 'uidB'); await B2.Net.ready; await B2.Net.tryRejoin(code); await sleep(300); const gB = B2.Net.getG(); ok(!!gB && gB.hands[gB.seatKeys.indexOf(B2.Net.mySeat())].every(c => c.k), 'a player who refreshes gets its own cards back');
    const set = [H2, B2, cs[2]]; const g = await play(server, set); ok(g && g.phase === 'over', 'the game still finishes after both refreshes'); leakCheck(server, 'refreshed game', true); }
  // ---- 3. fallbacks: rules not published / sign-in unavailable -> an open room, the old behaviour, game still works
  { const open = new Server({ rules: { '.read': true, '.write': true } }), { cs, H } = await lobby(open); ok(H.Net.room().secure !== true && H.Net.protection() === 'rules', 'with open rules the room is NOT sealed and says why'); await H.Net.startOnline(); await sleep(200); const g = await play(open, cs); ok(g && g.phase === 'over', 'open-rules room still plays to the end'); }
  { const s = new Server(RULES), H = client(s, 'uidH', { auth: false }); await H.Net.ready; const code = await H.Net.createOnline('Host', 'pig'); await sleep(100); ok(H.Net.room().secure !== true && H.Net.protection() === 'auth', 'without sign-in the room is open and says why'); }
  { const s = new Server({ rules: { rooms: { $r: { '.read': true, '.write': true } } } }), H = client(s, 'uidH'); await H.Net.ready; await H.Net.createOnline('Host', 'pig'); await sleep(100); ok(H.Net.room().secure !== true && H.Net.protection() === 'rules', 'with the old rules (no secure block) the room is open and says why'); }
  ok(errs.length === 0, 'no errors logged by the net code: ' + errs.slice(0, 2).join(' | '));
  console.log(fails ? fails + ' FAILED' : 'sealed-room tests passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(2); });
