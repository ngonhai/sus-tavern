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

// ---- hard bot table talk ----
{ const mkRand = seed => { let r = seed >>> 0; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; };
  let trustCases = 0, trustMono = 0, trustUp = 0, talks = 0, bluffs = 0, accs = 0, peeked = 0, checked = 0, bad = 0, gate = 0, cool = 0, boosted = 0, mono = 0, cases = 0;
  const kinds = {};
  for (const devil of [false, true]) for (let n = 2; n <= 5; n++) for (let sd = 0; sd < 30; sd++) {
    const g = Sus.newGame(Array.from({ length: n }, (_, i) => 'P' + i), { devil, botLevel: 2 }, 6000 + sd * 17 + n); let steps = 0; const ctx = { says: [], last: {} };
    while (g.phase !== 'over' && steps++ < 500) {
      const a = Sus.actor(g);
      if (g.phase === 'play' && g.last) {
        for (let p = 0; p < n; p++) {
          if (!g.alive[p]) continue;
          const m = Sus.botTalk(g, p, { rand: mkRand(steps * 31 + p), last: ctx.last, says: ctx.says });
          if (p === a) { if (m) bad++; continue; }                                                   // the player about to decide never talks
          const lo = JSON.parse(JSON.stringify(g)); lo.opts.botLevel = 1; if (Sus.botTalk(lo, p, { rand: mkRand(1) })) gate++;   // only hard bots talk
          if (!m) continue;
          talks++; kinds[m.k] = (kinds[m.k] || 0) + 1; if (m.lie) bluffs++; if (m.k === 'acc') accs++;
          const per = Math.max(6, Math.ceil(n * 5 / 3)), GT = g.opts.joker ? per + 2 : per, mine = g.plays.filter(x => x.by === p).reduce((q, x) => q + x.ids.length, 0);
          if ((m.k === 'acc' || m.k === 'hand') && (m.n > g.hands[p].length || m.n > GT - mine || m.n < 0 || (m.n > 0 && m.n < 2))) bad++;      // a stated count of table cards must be possible
          if (m.k !== 'acc' || m.to !== g.last.by || m.p !== p || p === g.last.by) bad++;                         // only accusations, aimed at the last player
          if (!m.lie && m.k === 'acc' && m.n > 0 && m.n !== g.hands[p].filter(c => c.k === g.target || c.k === 'J').length) bad++;   // an honest count is the real one
          // never peeks: scramble what p cannot see, same random numbers -> same line
          const sc = JSON.parse(JSON.stringify(g)), ks = devil ? ['A', 'K', 'Q', 'D'] : ['A', 'K', 'Q'], mineIds = new Set(); sc.plays.forEach(x => { if (x.by === p) x.ids.forEach(id => mineIds.add(id)); });
          sc.hands.forEach((h, j) => { if (j !== p) h.forEach(c => { c.k = ks[(c.id * 7 + steps) % ks.length]; }); });
          sc.pile.forEach(c => { if (!mineIds.has(c.id)) c.k = ks[(c.id * 5 + steps) % ks.length]; }); sc.last.cards = sc.last.cards.map(c => sc.pile.find(x => x.id === c.id) || c);
          const m2 = Sus.botTalk(sc, p, { rand: mkRand(steps * 31 + p), last: ctx.last, says: ctx.says }); checked++; if (p !== g.last.by && JSON.stringify(m2) !== JSON.stringify(m)) peeked++;
          if (p === g.last.by) continue;
          ctx.last[p] = g.seq; if (Sus.botTalk(g, p, { rand: () => 0, last: ctx.last, says: [] })) cool++;                // cooldown: not again right away
          ctx.says.push({ by: p, k: m.k, to: m.to, n: m.n, round: g.round }); break;
        }
        // what the other bots hear moves them the right way (never less suspicious), and an impossible count is ignored
        const q = [...Array(n).keys()].find(j => j !== a && j !== g.last.by && g.alive[j] && g.hands[j].length >= 3);
        if (q != null && a !== g.last.by) { const s0 = Sus.suspicion2(g, a, null).lie, s1 = Sus.suspicion2(g, a, { says: [{ by: q, k: 'acc', to: g.last.by, n: 3, round: g.round }] }).lie, s2 = Sus.suspicion2(g, a, { says: [{ by: q, k: 'acc', to: g.last.by, n: 9, round: g.round }] }).lie;
          cases++; if (s1 >= s0 - 1e-9) mono++; if (s1 > s0 + 1e-6) boosted++; if (s2 !== s0) bad++;
          // credibility: a speaker whose past accusations were checked and proven right is believed more than one proven wrong
          const R0 = 900, z = [...Array(n).keys()].find(j => j !== g.last.by && j !== q), mk = right => { const h = JSON.parse(JSON.stringify(g)); for (let i = 0; i < 3; i++) { h.log.push({ t: 'play', by: z, n: 1, r: R0 + i }); h.log.push({ t: 'call', by: a, acc: z, honest: !right, devil: false, auto: false, r: R0 + i }); } return h; };   // past accusations were about z, so only the speaker's record differs
          const past = [0, 1, 2].map(i => ({ by: q, k: 'acc', to: z, n: 3, round: R0 + i, np: 1 })), cur = { by: q, k: 'acc', to: g.last.by, n: 3, round: g.round };
          const sR = Sus.suspicion2(mk(true), a, { says: past.concat(cur) }).lie, sW = Sus.suspicion2(mk(false), a, { says: past.concat(cur) }).lie; trustCases++; if (sR >= sW - 1e-9) trustMono++; if (sR > sW + 1e-6) trustUp++; }
      }
      if (!Sus.apply(g, a, Sus.bot(g, a, ctx))) { ok(false, 'bot with talk context illegal'); break; }
    }
  }
  console.log('talk lines', talks, 'kinds', JSON.stringify(kinds), 'bluffs', bluffs, '| listening: raised suspicion in', boosted, 'of', cases);
  ok(talks > 300, 'hard bots do talk, and only accuse (' + talks + ')'); ok(bad === 0, 'every line is legal: possible counts, right targets, honest counts are real (' + bad + ' bad)');
  ok(gate === 0, 'easy/normal bots never talk'); ok(peeked === 0 && checked > 300, 'talk never depends on hidden cards (' + peeked + '/' + checked + ')'); ok(cool === 0, 'a bot does not talk twice in a row');
  ok(bluffs > accs * .1 && bluffs < talks * .6, 'some of the lines are bluffs, not most (' + bluffs + ' of ' + talks + ')');
  ok(trustMono === trustCases && trustUp > trustCases * .3, 'a speaker who was proven right is believed more than one proven wrong (' + trustUp + '/' + trustCases + ')');
  ok(mono === cases && boosted > cases * .3, 'a believable claim of table cards makes the other bots more suspicious (' + boosted + '/' + cases + ')'); }
if (fails) { console.error(fails + ' failures'); process.exit(1); } else console.log('engine tests passed');
