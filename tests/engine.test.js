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
// devil: everyone except its owner shoots
g = Sus.newGame(['a', 'b', 'c', 'd'], { devil: true }, 7); g.turn = 1; g.target = 'A'; g.hands[1] = [{ id: 950, k: 'D' }, { id: 951, k: 'A' }]; g.gun.forEach(x => x.bullet = 5);
Sus.apply(g, 1, { t: 'play', ids: [950] }); const c = g.turn; Sus.apply(g, c, { t: 'call' }); ok(g.shooters.length === 3 && !g.shooters.includes(1), 'devil: everyone but the owner shoots');
g.shooters.forEach(s => ok(Sus.apply(g, s, { t: 'pull' }), 'pull ' + s)); ok(g.gun.every((x, i) => x.pos === (i === 1 ? 0 : 1)) && g.phase === 'play', 'everyone but the owner advanced, new round');
// forced call when others have no cards
g = Sus.newGame(['a', 'b'], {}, 8); g.turn = 0; g.hands[1] = []; g.hands[0] = [{ id: 960, k: 'A' }]; Sus.apply(g, 0, { t: 'play', ids: [960] }); ok(g.turn === 1 && Sus.mustCall(g, 1), 'forced call');
ok(!Sus.apply(g, 1, { t: 'play', ids: [1] }), 'forced player cannot play');
// bot levels: every level finishes games; hard bots should beat easy bots over many games
{ let win = [0, 0, 0]; for (let lv = 0; lv < 3; lv++) for (let i = 0; i < 120; i++) { const g = Sus.newGame(['a', 'b', 'c', 'd'], { devil: true, botLevel: lv }, 4000 + i); let st = 0; while (g.phase !== 'over' && st++ < 3000) { const a = Sus.actor(g); Sus.apply(g, a, Sus.bot(g, a)); } ok(g.phase === 'over', 'bot level ' + lv + ' finishes'); }
  // head to head: seat 0 plays 'hard', the others 'easy' — compare with seat 0 'easy' vs 'hard'
  function duel(l0, l1) { let w = 0; for (let i = 0; i < 300; i++) { const g = Sus.newGame(['a', 'b', 'c', 'd'], { devil: true }, 9000 + i); let st = 0; while (g.phase !== 'over' && st++ < 3000) { const a = Sus.actor(g); g.opts.botLevel = a === 0 ? l0 : l1; Sus.apply(g, a, Sus.bot(g, a)); } if (g.winner === 0) w++; } return w; }
  const wHard = duel(2, 0), wEasy = duel(0, 2); console.log('seat0 hard vs easy wins', wHard, '| seat0 easy vs hard wins', wEasy, '(of 300, fair share = 75)'); ok(wHard > wEasy, 'hard bot out-wins easy bot'); }
console.log(fails ? fails + ' failures' : 'engine tests passed'); process.exit(fails ? 1 : 0);

