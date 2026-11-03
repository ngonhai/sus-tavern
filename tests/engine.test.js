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
// automatic showdown: when nobody else holds a card the last play is turned over, nobody is forced to act
g = Sus.newGame(['a', 'b'], {}, 8); g.turn = 0; g.target = 'K'; g.hands[1] = []; g.hands[0] = [{ id: 960, k: 'A' }]; Sus.apply(g, 0, { t: 'play', ids: [960] });
ok(g.phase === 'trigger' && g.shooters.length === 1 && g.shooters[0] === 0 && g.ev.some(e => e.t === 'call' && e.auto && !e.honest), 'auto showdown: a lie is punished');
g = Sus.newGame(['a', 'b'], {}, 8); g.turn = 0; g.target = 'A'; g.hands[1] = []; g.hands[0] = [{ id: 960, k: 'A' }]; const r0 = g.round; Sus.apply(g, 0, { t: 'play', ids: [960] });
ok(g.phase === 'play' && g.round === r0 + 1 && g.alive.every(Boolean) && g.gun.every(x => x.pos === 0) && g.ev.some(e => e.t === 'call' && e.auto && e.honest), 'auto showdown: an honest play costs nobody a shot, new round');
g = Sus.newGame(['a', 'b'], {}, 9); g.turn = 0; g.target = 'A'; g.hands[0] = [{ id: 961, k: 'A' }, { id: 962, k: 'K' }]; g.hands[1] = [{ id: 963, k: 'Q' }];
Sus.apply(g, 0, { t: 'play', ids: [961] }); ok(g.phase === 'play' && g.turn === 1 && !g.forced, 'with cards left on the table nothing is forced');
g = Sus.newGame(['a', 'b', 'c'], {}, 10); g.turn = 0; g.target = 'A'; g.hands[0] = [{ id: 970, k: 'K' }]; g.hands[1] = [{ id: 971, k: 'A' }]; g.hands[2] = [];
Sus.apply(g, 0, { t: 'play', ids: [970] }); ok(g.turn === 1 && g.phase === 'play', '3 players: the one without cards is skipped');
Sus.apply(g, 1, { t: 'play', ids: [971] }); ok(g.ev.some(e => e.t === 'call' && e.auto), '3 players: the last holder of cards gets the automatic showdown');
// bot levels: every level finishes games; hard bots should beat easy bots over many games
{ let win = [0, 0, 0]; for (let lv = 0; lv < 3; lv++) for (let i = 0; i < 120; i++) { const g = Sus.newGame(['a', 'b', 'c', 'd'], { devil: true, botLevel: lv }, 4000 + i); let st = 0; while (g.phase !== 'over' && st++ < 3000) { const a = Sus.actor(g); Sus.apply(g, a, Sus.bot(g, a)); } ok(g.phase === 'over', 'bot level ' + lv + ' finishes'); }
  // head to head: seat 0 plays 'hard', the others 'easy' — compare with seat 0 'easy' vs 'hard'
  function duel(l0, l1) { let w = 0; for (let i = 0; i < 300; i++) { const g = Sus.newGame(['a', 'b', 'c', 'd'], { devil: true }, 9000 + i); let st = 0; while (g.phase !== 'over' && st++ < 3000) { const a = Sus.actor(g); g.opts.botLevel = a === 0 ? l0 : l1; Sus.apply(g, a, Sus.bot(g, a)); } if (g.winner === 0) w++; } return w; }
  const wHard = duel(2, 0), wEasy = duel(0, 2); console.log('seat0 hard vs easy wins', wHard, '| seat0 easy vs hard wins', wEasy, '(of 300, fair share = 75)'); ok(wHard > wEasy, 'hard bot out-wins easy bot'); }

// joker option (off by default) + shared revolver
for (let n = 2; n <= 5; n++) for (const joker of [false, true]) for (const devil of [false, true]) {
  const g = Sus.newGame(Array.from({ length: n }, (_, i) => 'P' + i), { joker, devil }, 77 + n);
  ok(g.hands.every(h => h.length === 5), 'everyone gets 5 cards n=' + n + ' joker=' + joker);
  ok(g.hands.flat().some(c => c.k === 'J') === false || joker, 'no Joker in the deck when the option is off');
}
ok(Sus.normSettings({}).joker === false && Sus.normSettings({}).shared === false, 'defaults: joker off, shared off');
for (let n = 2; n <= 5; n++) for (let s = 0; s < 40; s++) {
  const g = Sus.newGame(Array.from({ length: n }, (_, i) => 'P' + i), { shared: true, devil: s % 2 === 0, joker: s % 3 === 0 }, 500 + s * 13 + n); let steps = 0; ok(g.gun.length === 1, 'one shared gun');
  while (g.phase !== 'over' && steps++ < 4000) { const p = Sus.actor(g); const a = Sus.bot(g, p); if (!Sus.apply(g, p, a)) { ok(false, 'shared illegal ' + JSON.stringify(a)); break; } }
  ok(g.phase === 'over' && g.alive.filter(Boolean).length === 1, 'shared game ends n=' + n);
}
{ const g = Sus.newGame(['a', 'b', 'c'], { shared: true }, 11); g.turn = 0; g.target = 'K'; g.hands[0] = [{ id: 901, k: 'A' }]; g.gun[0].pos = 2; g.gun[0].bullet = 2;
  Sus.apply(g, 0, { t: 'play', ids: [901] }); Sus.apply(g, g.turn, { t: 'call' }); const ev = (Sus.apply(g, 0, { t: 'pull' }), g.ev[0]);
  ok(ev.dead && ev.reload && g.gun[0].pos === 0, 'shared gun reloads after a death'); }
{ const g = Sus.newGame(['a', 'b', 'c'], { shared: true }, 12); g.turn = 0; g.target = 'K'; g.hands[0] = [{ id: 901, k: 'A' }]; g.gun[0].pos = 1; g.gun[0].bullet = 5;
  Sus.apply(g, 0, { t: 'play', ids: [901] }); Sus.apply(g, g.turn, { t: 'call' }); Sus.apply(g, 0, { t: 'pull' }); ok(g.gun[0].pos === 2, 'shared gun keeps advancing for everybody'); }
// shared revolver + Devil: the first death ends the sweep, nobody else pulls this round
{ const g = Sus.newGame(['a', 'b', 'c', 'd'], { shared: true, devil: true }, 21); g.turn = 0; g.target = 'K'; g.hands[0] = [{ id: 901, k: 'D' }, { id: 902, k: 'K' }]; g.hands[1] = [{ id: 911, k: 'K' }]; g.hands[2] = [{ id: 921, k: 'K' }]; g.hands[3] = [{ id: 931, k: 'K' }];
  Sus.apply(g, 0, { t: 'play', ids: [901] }); Sus.apply(g, g.turn, { t: 'call' }); ok(g.shooters.length === 3, 'devil: 3 shooters'); const first = g.shooters[0]; g.gun[0].pos = 0; g.gun[0].bullet = 0;
  Sus.apply(g, first, { t: 'pull' }); ok(!g.alive[first] && g.phase === 'play' && g.alive.filter(Boolean).length === 3, 'shared devil sweep stops at the first death'); }
// normal bot never peeks: scramble every card it cannot legitimately see (other hands, other players' pile cards) -> it must choose the exact same action
{ let same = 0, tot = 0;
  for (const devil of [false, true]) for (let n = 2; n <= 5; n++) for (let s = 0; s < 25; s++) {
    const g = Sus.newGame(Array.from({ length: n }, (_, i) => 'P' + i), { devil, botLevel: 1 }, 3000 + s * 11 + n); let steps = 0;
    while (g.phase !== 'over' && steps++ < 400) {
      const p = Sus.actor(g);
      if (g.phase === 'play') {
        const a = JSON.parse(JSON.stringify(g)), kinds = devil ? ['A', 'K', 'Q', 'D'] : ['A', 'K', 'Q'], mine = new Set(); let off = 0;
        a.log.forEach(l => { if (l.t === 'play' && l.r === a.round) { if (l.by === p) for (let i = 0; i < l.n; i++) mine.add(a.pile[off + i].id); off += l.n; } });
        a.hands.forEach((h, j) => { if (j !== p) h.forEach(c => { c.k = kinds[(c.id * 7 + steps) % kinds.length]; }); });
        a.pile.forEach(c => { if (!mine.has(c.id)) c.k = kinds[(c.id * 5 + steps) % kinds.length]; }); if (a.last) a.last.cards = a.last.cards.map(c => a.pile.find(x => x.id === c.id) || c);
        const c2 = JSON.parse(JSON.stringify(g)), x = JSON.stringify(Sus.bot(g, p)), y = JSON.stringify(Sus.bot(a, p)); tot++; if (x === y) same++; else ok(false, 'normal bot peeked: ' + x + ' vs ' + y);
        if (x !== JSON.stringify(Sus.bot(c2, p))) ok(false, 'not deterministic');
      }
      if (!Sus.apply(g, p, Sus.bot(g, p))) { ok(false, 'normal illegal'); break; }
    }
  }
  ok(tot > 200 && same === tot, 'normal bot decisions depend only on what it can see (' + same + '/' + tot + ')'); }
// old saved games without the stats object still work for the normal bot
{ const g = Sus.newGame(['a', 'b', 'c'], { botLevel: 1, devil: true }, 31); delete g.st; let st = 0; while (g.phase !== 'over' && st++ < 3000) { const a = Sus.actor(g); if (!Sus.apply(g, a, Sus.bot(g, a))) { ok(false, 'legacy state illegal'); break; } } ok(g.phase === 'over', 'normal bot copes with a state that has no stats'); }
// hard bot never peeks either
{ let same = 0, tot = 0;
  for (const devil of [false, true]) for (let n = 2; n <= 5; n++) for (let s = 0; s < 25; s++) {
    const g = Sus.newGame(Array.from({ length: n }, (_, i) => 'P' + i), { devil, botLevel: 2 }, 3000 + s * 11 + n); let steps = 0;
    while (g.phase !== 'over' && steps++ < 400) {
      const p = Sus.actor(g);
      if (g.phase === 'play') {
        const a = JSON.parse(JSON.stringify(g)), kinds = devil ? ['A', 'K', 'Q', 'D'] : ['A', 'K', 'Q'], mine = new Set(); let off = 0;
        a.log.forEach(l => { if (l.t === 'play' && l.r === a.round) { if (l.by === p) for (let i = 0; i < l.n; i++) mine.add(a.pile[off + i].id); off += l.n; } });
        a.hands.forEach((h, j) => { if (j !== p) h.forEach(c => { c.k = kinds[(c.id * 7 + steps) % kinds.length]; }); });
        a.pile.forEach(c => { if (!mine.has(c.id)) c.k = kinds[(c.id * 5 + steps) % kinds.length]; }); if (a.last) a.last.cards = a.last.cards.map(c => a.pile.find(x => x.id === c.id) || c);
        const c2 = JSON.parse(JSON.stringify(g)), x = JSON.stringify(Sus.bot(g, p)), y = JSON.stringify(Sus.bot(a, p)); tot++; if (x === y) same++; else ok(false, 'hard bot peeked: ' + x + ' vs ' + y);
        if (x !== JSON.stringify(Sus.bot(c2, p))) ok(false, 'not deterministic');
      }
      if (!Sus.apply(g, p, Sus.bot(g, p))) { ok(false, 'hard illegal'); break; }
    }
  }
  ok(tot > 200 && same === tot, 'hard bot decisions depend only on what it can see (' + same + '/' + tot + ')'); }
// duels: normal (expected-shots bot) must beat easy, hard must beat normal (cross-seat, fair share = 50%)
{ function duel(hi, lo, G) { let w = 0; for (let i = 0; i < G; i++) { const seat = i % 2, g = Sus.newGame(['a', 'b', 'c', 'd'], { devil: true }, 15000 + i); let st = 0; while (g.phase !== 'over' && st++ < 3000) { const a = Sus.actor(g); g.opts.botLevel = a % 2 === seat ? hi : lo; Sus.apply(g, a, Sus.bot(g, a)); } if (g.winner % 2 === seat) w++; } return w; }
  const n1 = duel(1, 0, 200), h1 = duel(2, 1, 200); console.log('normal vs easy (2v2):', n1, '/200 | hard vs normal (2v2):', h1, '/200 (fair = 100)'); ok(n1 > 130, 'normal beats easy'); ok(h1 > 130, 'hard beats normal'); }
// regression: 3 unchecked fake cards followed by 1 real card must not make the hard bot shout "Liar!" at the real card (earlier plays of the same player are not all true)
{ let ign = 0, called = 0; for (let i = 0; i < 300; i++) { const g = Sus.newGame(['me', 'bot'], { botLevel: 2 }, 777 + i); g.turn = 0; g.target = 'K';
    g.hands[0] = [{ id: 901, k: 'Q' }, { id: 902, k: 'Q' }, { id: 903, k: 'A' }, { id: 904, k: 'K' }, { id: 905, k: 'A' }]; g.hands[1] = g.hands[1].filter(c => c.id < 900);
    Sus.apply(g, 0, { t: 'play', ids: [901, 902, 903] }); const a = Sus.bot(g, 1); if (a.t === 'call') continue; Sus.apply(g, 1, a); if (Sus.actor(g) !== 0) continue;
    Sus.apply(g, 0, { t: 'play', ids: [904] }); if (Sus.actor(g) !== 1) continue; ign++; if (Sus.bot(g, 1).t === 'call') called++; }
  ok(ign > 100 && called <= ign * .15, 'hard bot is not baited by 3 fakes + 1 real (' + called + '/' + ign + ' calls)'); }
// table talk: a bystander may comment on the last play; it never changes whose turn it is, and a hard bot weighs what it hears
{ const mk = () => { const g = Sus.newGame(['a', 'b', 'c', 'd'], { botLevel: 2 }, 31); g.turn = 0; g.target = 'K'; g.hands = [[1, 2, 3, 4, 5].map(i => ({ id: 100 + i, k: 'K' })), [1, 2, 3, 4, 5].map(i => ({ id: 200 + i, k: 'Q' })), [1, 2, 3, 4, 5].map(i => ({ id: 300 + i, k: 'A' })), [1, 2, 3, 4, 5].map(i => ({ id: 400 + i, k: 'K' }))]; return g; };
  const g = mk(); ok(!Sus.apply(g, 2, { t: 'talk', k: 'doubt', n: 1 }), 'talk before any play is illegal');
  Sus.apply(g, 0, { t: 'play', ids: [101, 102, 103] }); const turn = g.turn, seq = g.seq;
  ok(!Sus.apply(g, 0, { t: 'talk', k: 'doubt', n: 1 }), 'the player who just played cannot talk about itself'); ok(!Sus.apply(g, g.turn, { t: 'talk', k: 'doubt', n: 1 }), 'the player who must decide cannot talk');
  ok(!Sus.apply(g, 2, { t: 'talk', k: 'bogus', n: 1 }) && !Sus.apply(g, 2, { t: 'talk', k: 'doubt', n: 9 }), 'bad talk rejected'); ok(g.seq === seq, 'rejected talk leaves the state alone');
  ok(Sus.apply(g, 2, { t: 'talk', k: 'doubt', n: 4 }) && g.turn === turn && g.phase === 'play' && g.ev[0].t === 'talk' && g.talk.length === 1, 'talk accepted, turn unchanged');
  ok(!Sus.apply(g, 2, { t: 'talk', k: 'trust', n: 1 }), 'one comment per speaker per play'); ok(Sus.apply(g, 3, { t: 'talk', k: 'trust', n: 0 }) && !Sus.apply(g, g.turn === 1 ? 0 : 1, { t: 'talk', k: 'trust', n: 1 }), 'at most two comments per play');
  Sus.apply(g, 1, { t: 'play', ids: [201] }); ok(g.talk.every(x => x.at === 1) && g.last.by === 1, 'talk is tied to the play it commented on'); }
{ // a believable "I hold lots of the table card" makes the hard bot more suspicious; an impossible one is ignored
  const mk = () => { const g = Sus.newGame(['a', 'b', 'c', 'd'], { botLevel: 2 }, 33); g.turn = 1; g.target = 'K'; g.hands = [[], [1, 2, 3, 4, 5].map(i => ({ id: 200 + i, k: 'Q' })), [1, 2, 3, 4, 5].map(i => ({ id: 300 + i, k: 'A' })), [1, 2, 3, 4, 5].map(i => ({ id: 400 + i, k: 'A' }))]; g.pile = [{ id: 901, k: 'Q' }]; g.plays = [{ by: 0, ids: [901] }]; g.last = { by: 0, n: 1, cards: g.pile.slice() }; g.talk = []; return g; };
  const none = Sus.suspicion2(mk(), 1).lie, g2 = mk(); g2.talk = [{ by: 2, about: 0, k: 'doubt', n: 5, at: 1 }]; const heard = Sus.suspicion2(g2, 1).lie;
  const g3 = mk(); g3.hands[2] = g3.hands[2].slice(0, 2); g3.talk = [{ by: 2, about: 0, k: 'doubt', n: 5, at: 1 }]; ok(heard > none, 'a believable claim raises suspicion (' + none.toFixed(2) + ' -> ' + heard.toFixed(2) + ')'); ok(Math.abs(Sus.suspicion2(g3, 1).lie - none) < 1e-9, 'a claim bigger than the speaker\'s hand is ignored'); }
{ // the round ledger: a comment is a public commitment that the speaker's own later plays are measured against
  const mk = (claims) => { const g = Sus.newGame(['a', 'b', 'c', 'd'], { botLevel: 2 }, 35); g.turn = 1; g.target = 'K'; g.hands = [[{ id: 1, k: 'A' }, { id: 2, k: 'A' }], [1, 2, 3, 4, 5].map(i => ({ id: 200 + i, k: 'Q' })), [1, 2, 3, 4, 5].map(i => ({ id: 300 + i, k: 'A' })), [1, 2, 3, 4, 5].map(i => ({ id: 400 + i, k: 'A' }))];
    g.pile = [901, 902, 903].map(id => ({ id, k: 'Q' })); g.plays = [{ by: 0, ids: [901, 902, 903] }]; g.last = { by: 0, n: 3, cards: g.pile.slice() }; g.talk = claims.map(c => Object.assign({ by: 0, about: 3, k: 'doubt', at: 0, h: 5, ci: 0 }, c)); return g; };
  const none = Sus.suspicion2(mk([]), 1).lie, weak = Sus.suspicion2(mk([{ n: 1 }]), 1).lie, strong = Sus.suspicion2(mk([{ n: 3 }]), 1).lie;
  ok(weak > strong, 'accused said "I hold 1" then plays 3: far more suspicious than if it had said "I hold 3" (' + weak.toFixed(2) + ' vs ' + strong.toFixed(2) + ', none ' + none.toFixed(2) + ')'); ok(weak > .75, 'saying 1 and then claiming 3 is very likely a lie'); ok(strong < none, 'a believable claim of a strong hand covers its 3-card play');
  const conflict = Sus.suspicion2(mk([{ n: 3, h: 5 }, { n: 5, h: 4 }]), 1).lie; ok(conflict > strong, 'a speaker whose two comments cannot both be true is believed less'); }
{ // the trap: after understating its hand a bot plays its real cards, and it never talks itself into a weak-hand confession
  const g = Sus.newGame(['a', 'b', 'c', 'd'], { botLevel: 2 }, 36); g.turn = 2; g.target = 'K'; g.hands[2] = [1, 2, 3, 4].map(i => ({ id: 60 + i, k: 'K' })).concat([{ id: 70, k: 'Q' }]); g.hands[0] = g.hands[0].slice(0, 5); g.last = null; g.talk = [{ by: 2, about: 0, k: 'trust', n: 1, at: 0, h: 5, ci: 0 }];
  const a = Sus.bot(g, 2); ok(a.t === 'play' && a.ids.length === 3 && a.ids.every(id => id >= 61 && id <= 64), 'after understating (said 1, holds 4) the bot plays 3 real cards: ' + JSON.stringify(a));
  let weakTruth = 0; for (let sd = 0; sd < 200; sd++) { const h = Sus.newGame(['a', 'b', 'c', 'd'], { botLevel: 2 }, 900 + sd); h.turn = 1; h.target = 'K'; h.hands[0] = [{ id: 1, k: 'K' }]; h.pile = [{ id: 1, k: 'K' }]; h.plays = [{ by: 0, ids: [1] }]; h.last = { by: 0, n: 1, cards: h.pile.slice() }; h.hands[3] = [{ id: 9, k: 'K' }, { id: 10, k: 'Q' }, { id: 11, k: 'Q' }, { id: 12, k: 'Q' }, { id: 13, k: 'Q' }]; Sus.HB.talk = 1; Sus.HB.talkLie = 0; const t = Sus.botTalk(h, 3); if (t && t.k === 'trust' && t.n <= 1) weakTruth++; Sus.HB.talk = .5; Sus.HB.talkLie = .3; }
  ok(weakTruth === 0, 'an honest bot never announces it holds <= 1 table card'); }
for (const devil of [false, true]) for (let sd = 0; sd < 30; sd++) { // whole games with the bots chatting between plays
  const g = Sus.newGame(['a', 'b', 'c', 'd'], { botLevel: 2, devil }, 500 + sd); let steps = 0, talks = 0;
  while (g.phase !== 'over' && steps++ < 4000) { const p = Sus.actor(g); if (g.phase === 'play' && g.last && !(g.talk || []).some(x => x.at === g.plays.length)) { const c = Sus.aliveList(g).filter(j => j !== g.last.by && j !== p)[0]; const ta = c != null && Sus.botTalk(g, c); if (ta) { ok(Sus.apply(g, c, ta), 'botTalk is always legal ' + JSON.stringify(ta)); talks++; } }
    if (!Sus.apply(g, p, Sus.bot(g, p))) { ok(false, 'bot illegal while chatting'); break; } }
  ok(g.phase === 'over', 'chatting game ends'); }
if (fails) { console.error(fails + ' failures'); process.exit(1); } else console.log('engine tests passed');
