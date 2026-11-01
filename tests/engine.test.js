const Sus = require('../js/sus-engine.js'); let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } };
// random full games
for (const devil of [false, true]) for (let n = 2; n <= 5; n++) for (let s = 0; s < 40; s++) {
  const g = Sus.newGame(Array.from({ length: n }, (_, i) => 'P' + i), { devil }, 1000 + s * 7 + n); let steps = 0;
  while (g.phase !== 'over' && steps++ < 3000) { const p = Sus.actor(g); const a = Sus.bot(g, p); if (!Sus.apply(g, p, a)) { ok(false, 'bot illegal ' + JSON.stringify(a) + ' ph=' + g.phase + ' p=' + p); break; } }
  ok(g.phase === 'over' && g.winner != null && g.alive.filter(Boolean).length === 1, 'game ends n=' + n + ' devil=' + devil + ' steps=' + steps);
  ok(new Set(g.chars).size === n, 'distinct chars');
}
ok(Sus.newGame(['a','b','c'], {}, 3, ['hawk', null, 'turtle']).chars.slice(0,3).join() .startsWith('hawk,'), 'picked chars kept');
// rules
let g = Sus.newGame(['a', 'b', 'c'], { devil: true }, 5); g.turn = 0; g.target = 'K'; g.hands[0] = [{ id: 901, k: 'K' }, { id: 902, k: 'J' }, { id: 903, k: 'Q' }, { id: 904, k: 'D' }]; g.hands[1] = [{ id: 905, k: 'A' }];
ok(!Sus.apply(g, 1, { t: 'play', ids: [905] }), 'not your turn');
ok(!Sus.apply(g, 0, { t: 'call' }), 'cannot call with nothing played');
ok(!Sus.apply(g, 0, { t: 'play', ids: [901, 902, 903, 904] }), 'max 3');
ok(Sus.apply(g, 0, { t: 'play', ids: [901, 902] }) && g.turn === 1, 'play two');
g.gun[0].bullet = 5; g.gun[1].bullet = 5;
ok(Sus.apply(g, 1, { t: 'call' }) && g.phase === 'trigger' && g.shooters.length === 1 && g.shooters[0] === 1, 'honest play: caller shoots');
ok(!Sus.apply(g, 0, { t: 'pull' }), 'only the shooter pulls'); ok(Sus.apply(g, 1, { t: 'pull' }) && g.phase === 'play' && g.gun[1].pos === 1, 'survive advances chamber');
// liar caught
g = Sus.newGame(['a', 'b', 'c'], {}, 6); g.turn = 0; g.target = 'K'; g.hands[0] = [{ id: 901, k: 'A' }, { id: 902, k: 'K' }]; g.gun.forEach(x => x.bullet = 0);
Sus.apply(g, 0, { t: 'play', ids: [901] }); Sus.apply(g, g.turn, { t: 'call' }); ok(g.shooters[0] === 0, 'liar shoots');
Sus.apply(g, 0, { t: 'pull' }); ok(!g.alive[0] && g.phase === 'play' && g.turn !== 0, 'dead liar, next round leads alive');
// devil: everyone shoots
g = Sus.newGame(['a', 'b', 'c', 'd'], { devil: true }, 7); g.turn = 1; g.target = 'A'; g.hands[1] = [{ id: 950, k: 'D' }, { id: 951, k: 'A' }]; g.gun.forEach(x => x.bullet = 5);
Sus.apply(g, 1, { t: 'play', ids: [950] }); const c = g.turn; Sus.apply(g, c, { t: 'call' }); ok(g.shooters.length === 4 && g.shooters[0] === 1, 'devil: all shoot, accused first');
g.shooters.forEach(s => ok(Sus.apply(g, s, { t: 'pull' }), 'pull ' + s)); ok(g.gun.every(x => x.pos === 1) && g.phase === 'play', 'all advanced, new round');
// forced call when others have no cards
g = Sus.newGame(['a', 'b'], {}, 8); g.turn = 0; g.hands[1] = []; g.hands[0] = [{ id: 960, k: 'A' }]; Sus.apply(g, 0, { t: 'play', ids: [960] }); ok(g.turn === 1 && Sus.mustCall(g, 1), 'forced call');
ok(!Sus.apply(g, 1, { t: 'play', ids: [1] }), 'forced player cannot play');
console.log(fails ? fails + ' failures' : 'engine tests passed'); process.exit(fails ? 1 : 0);
