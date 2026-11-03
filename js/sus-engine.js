// sus-engine.js — pure rules of Sus Tavern (a Liar's Bar style bluffing game). No DOM. Seeded RNG lives in the state (g.rs) so the state is plain JSON.
// Deck: Ace / King / Queen x K each [+ 2 Jokers (wild) when enabled] [+ 1 Devil when enabled]. Every round one type is "the table card".
// On your turn play 1-3 face-down cards claiming they are the table card, OR call the previous player a liar.
// Call: reveal the last cards. All table-card/Joker => the caller was wrong and pulls the trigger; otherwise the liar pulls it.
// Devil: if a revealed set contains a Devil, EVERY living player pulls the trigger one after another (starting with the accused).
// Each player owns a revolver: 6 chambers, 1 bullet at a hidden chamber; each pull advances it (the risk only goes up). Last one alive wins.
(function (root) {
  'use strict';
  const CHARS = ['pig', 'fox', 'dog', 'goat', 'octo', 'penguin', 'hawk', 'turtle'], KINDS = ['A', 'K', 'Q'], MAXP = 5, CH = 6, HAND = 5;
  const DEFAULTS = { devil: false, joker: false, shared: false, bots: 3, botLevel: 1 };   // joker: the 2 wild star cards (off by default); shared: ONE revolver for the whole table   // botLevel: 0 easy, 1 normal, 2 hard
  function normSettings(s) { s = Object.assign({}, DEFAULTS, s || {}); s.devil = !!s.devil; s.joker = !!s.joker; s.shared = !!s.shared; s.bots = Math.max(1, Math.min(MAXP - 1, Math.round(+s.bots || 3))); s.botLevel = Math.max(0, Math.min(2, Math.round(+s.botLevel == null || isNaN(+s.botLevel) ? 1 : +s.botLevel))); return s; }

  // mulberry32, state kept in g.rs
  function rnd(g) { let a = (g.rs = (g.rs + 0x6D2B79F5) >>> 0); a = Math.imul(a ^ (a >>> 15), a | 1); a ^= a + Math.imul(a ^ (a >>> 7), a | 61); return ((a ^ (a >>> 14)) >>> 0) / 4294967296; }
  const ri = (g, n) => Math.floor(rnd(g) * n);
  function shuffle(g, a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(g, i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  const nextAlive = (g, i) => { for (let k = 1; k <= g.n; k++) { const j = (i + k) % g.n; if (g.alive[j]) return j; } return i; };
  const aliveList = g => g.alive.map((a, i) => a ? i : -1).filter(i => i >= 0);

  // names: array in TABLE ORDER (already shuffled by the caller or by `seatOrder`). chars are picked here, distinct.
  function newGame(names, opts, seed, picks) {
    opts = normSettings(opts); const n = names.length;
    const g = { v: 1, id: Math.random().toString(36).slice(2, 9), seq: 0, rs: ((seed != null ? seed : Math.random() * 4294967296) >>> 0) || 1, opts, n, names: names.slice(), chars: [], alive: names.map(() => true),
      gun: [], hands: [], pile: [], last: null, target: 'A', turn: 0, forced: false, phase: 'play', shooters: [], sidx: 0, round: 0, lead: 0, ev: [], log: [], winner: null, nid: 1, shots: names.map(() => 0), seen: [] };
    const used = new Set((picks || []).filter(c => c && CHARS.includes(c))), free = shuffle(g, CHARS.filter(c => !used.has(c)));
    g.chars = names.map((_, i) => { const c = picks && picks[i]; return c && CHARS.includes(c) ? c : free.shift(); });
    for (let i = 0; i < (opts.shared ? 1 : n); i++) g.gun.push({ pos: 0, bullet: ri(g, CH) });   // shared mode: a single revolver g.gun[0]
    g.sign = Math.floor(Math.random() * 1000);                       // picks the tavern sign on the wall (3D); shared by everyone in the room because it lives in the game state
    g.lead = ri(g, n); startRound(g); return g;
  }
  // cards per kind: with the 2 Jokers 6 (8 for 5 players); without them a little more so that everyone can still be dealt 5 cards
  const perKind = g => g.opts.joker ? (g.n >= 5 ? 8 : 6) : Math.max(6, Math.ceil(g.n * HAND / 3));
  function deckFor(g) {
    const per = perKind(g), d = []; KINDS.forEach(k => { for (let i = 0; i < per; i++) d.push({ id: g.nid++, k }); });
    if (g.opts.joker) d.push({ id: g.nid++, k: 'J' }, { id: g.nid++, k: 'J' }); if (g.opts.devil) d.push({ id: g.nid++, k: 'D' });
    return shuffle(g, d);
  }
  function startRound(g) {
    g.round++; g.target = KINDS[ri(g, 3)]; g.pile = []; g.plays = []; g.last = null; g.forced = false; g.phase = 'play'; g.shooters = []; g.sidx = 0; g.seen = [];
    const d = deckFor(g); g.hands = g.alive.map(a => a ? d.splice(0, HAND) : []);
    g.hands.forEach(h => h.sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : a.id - b.id));
    g.turn = g.alive[g.lead] ? g.lead : nextAlive(g, g.lead);
    g.ev.push({ t: 'round', n: g.round, target: g.target, lead: g.turn, devil: !!g.opts.devil });
  }
  const gunOf = (g, p) => g.opts.shared ? g.gun[0] : g.gun[p];
  const honest = (g, cards) => cards.every(c => c.k === g.target || c.k === 'J');

  // who may act right now: the player whose turn it is (play/call), or the current shooter (pull)
  const actor = g => g.phase === 'trigger' ? g.shooters[g.sidx] : g.phase === 'play' ? g.turn : -1;
  function canCall(g, p) { return g.phase === 'play' && g.turn === p && !!g.last; }
  function mustCall(g, p) { return g.phase === 'play' && g.turn === p && !!g.last && (g.hands[p].length === 0 || g.forced); }
  function legalPlay(g, p, ids) {
    if (g.phase !== 'play' || g.turn !== p || !Array.isArray(ids) || ids.length < 1 || ids.length > 3) return false;
    if (new Set(ids).size !== ids.length) return false; if (mustCall(g, p)) return false;
    return ids.every(id => g.hands[p].some(c => c.id === id));
  }

  // reveal the last play. caller = the player who shouted "Liar!", or -1 for the automatic showdown (nobody else holds a card):
  // a lie (or a Devil) is punished as usual; an honest play in an automatic showdown costs nobody a shot and a fresh round starts.
  function resolve(g, caller, by) {
    const acc = g.last.by, cards = g.last.cards, ok = honest(g, cards), devil = cards.some(c => c.k === 'D'), auto = by < 0;
    const loser = ok ? (auto ? -1 : caller) : acc;
    g.shooters = devil ? (() => { const l = []; let i = acc; if (!g.alive[i]) i = nextAlive(g, i); for (let k = 0; k < g.n; k++) { const j = (i + k) % g.n; if (g.alive[j] && j !== acc) l.push(j); } /* the Devil's owner is spared */ return l; })() : (loser < 0 ? [] : [loser]);
    g.ev.push({ t: 'call', by: auto ? -1 : caller, acc, cards: cards.map(c => ({ id: c.id, k: c.k })), honest: ok, devil, loser, shooters: g.shooters.slice(), auto });
    g.log.push({ t: 'call', by: auto ? -1 : caller, acc, honest: ok, devil, auto, r: g.round });
    if (!g.shooters.length) { g.lead = nextAlive(g, acc); startRound(g); return; }
    g.sidx = 0; g.phase = 'trigger'; g.lead = loser >= 0 ? loser : acc;
  }

  const stOf = g => { const t = g.st || (g.st = {}); ['fz', 'cz', 'sz'].forEach(k => { if (!t[k]) t[k] = g.names.map(() => [0, 0, 0]); }); return t; };   // opponent statistics for the hard bot (older saved games get them lazily)
  // apply one action of player p. returns true if legal (and g mutated).
  function apply(g, p, a) {
    if (g.phase === 'over' || !a || p < 0 || p >= g.n || !g.alive[p]) return false;
    g.ev = []; g.seq++;
    if (a.t === 'play') {
      if (!legalPlay(g, p, a.ids)) { g.seq--; return false; }
      const cards = a.ids.map(id => g.hands[p].find(c => c.id === id)); g.hands[p] = g.hands[p].filter(c => !a.ids.includes(c.id));
      g.pile.push(...cards); g.last = { by: p, n: cards.length, cards };
      (g.plays = g.plays || []).push({ by: p, ids: a.ids.slice() });
      stOf(g).sz[p][cards.length - 1]++;
      // next to act: next living player that still has cards. If nobody else has cards left, the next player must call.
      let nx = -1; for (let k = 1; k < g.n; k++) { const j = (p + k) % g.n; if (g.alive[j] && g.hands[j].length) { nx = j; break; } }
      g.forced = false; if (nx < 0) nx = nextAlive(g, p);
      g.turn = nx; g.ev.push({ t: 'play', by: p, n: cards.length, ids: a.ids.slice(), next: nx, left: g.hands[p].length });
      g.log.push({ t: 'play', by: p, n: cards.length, r: g.round });
      // nobody else holds a card any more: nobody is forced to do anything, the last play is simply turned over (auto showdown)
      if (!g.alive.some((al, j) => al && j !== p && g.hands[j].length)) resolve(g, p, -1);
      else if (nx !== p) stOf(g).fz[nx][cards.length - 1]++;                       // nx now has to decide: call or play on (used by the normal bot to learn who calls often)
      return true;
    }
    if (a.t === 'call') {
      if (!canCall(g, p)) { g.seq--; return false; }
      stOf(g).cz[p][g.last.n - 1]++; resolve(g, p, p); return true;
    }
    if (a.t === 'pull') {
      if (g.phase !== 'trigger' || g.shooters[g.sidx] !== p) { g.seq--; return false; }
      const gn = gunOf(g, p), lone = g.sidx === g.shooters.length - 1 && aliveList(g).length === 1;   // the last one standing never dies to a Devil sweep
      const dead = gn.pos === gn.bullet && !lone; const pos = gn.pos; if (!dead) gn.pos++; g.shots[p]++;
      if (dead) g.alive[p] = false;
      const risk = dead ? 1 : 1 / (CH - gn.pos + 1); if (dead && g.opts.shared) { gn.pos = 0; gn.bullet = ri(g, CH); }   // shared revolver: after a death it is reloaded and spun
      const evp = { t: 'pull', p, dead, pos, risk, reload: !!(dead && g.opts.shared), next: -1 }; g.ev.push(evp);
      g.log.push({ t: 'pull', p, dead, r: g.round });
      g.sidx++;
      if (dead && g.opts.shared) g.sidx = g.shooters.length;   // shared revolver: the first death ends a Devil sweep, nobody else has to pull this round
      if (g.sidx < g.shooters.length) evp.next = g.shooters[g.sidx];
      // everyone who is still to shoot but already dead can't happen (only the shooter itself dies); finish
      if (g.sidx >= g.shooters.length) {
        const al = aliveList(g);
        if (al.length <= 1) { g.phase = 'over'; g.winner = al.length ? al[0] : p; g.ev.push({ t: 'over', w: g.winner }); }
        else { if (!g.alive[g.lead]) g.lead = nextAlive(g, g.lead); startRound(g); }
      }
      return true;
    }
    g.seq--; return false;
  }

  // ---- bot ----
  // chance the previous claim is a lie, from what the bot can see (its own hand) and what was played this round
  function suspicion(g, p) {
    const L = g.last; if (!L) return 0; const per = perKind(g), total = per + (g.opts.joker ? 2 : 0);
    const mine = g.hands[p].filter(c => c.k === g.target || c.k === 'J').length;
    const claimedSoFar = g.pile.length;                            // every card played so far this round was claimed as the table card
    const room = Math.max(0, total - mine);                        // table cards (+jokers) that can be on the pile at most
    if (claimedSoFar > room) return 1;                            // mathematically impossible: at least one liar
    const dens = room / Math.max(1, room + (g.n * HAND - total) * 1.0);   // rough chance a random unseen card is a match
    return Math.min(.95, 1 - Math.pow(Math.max(.05, dens + .18), L.n) + claimedSoFar * .03);
  }
  // bot skill (hard bots only call when they are nearly sure — thr — because a wrong call costs a shot; tuned by simulation): call = how eagerly it calls a suspicious claim, lie = how often it bluffs, noise = how badly it misjudges, sloppy = chance of playing random cards
  const LVL = [{ call: .5, lie: .08, noise: .5, sloppy: .25 }, { call: .85, lie: .25, noise: 0, sloppy: 0 }, { call: 1, lie: .03, noise: 0, sloppy: 0, thr: .85, devil: true }];

  // ---- normal bot (level 1): expected-shots bot ----
  // Plays by the numbers, never peeks: it only uses its own hand, the cards it played itself, public counts and the public history of the game.
  //  * infer(): P(last claim is a lie) from a hypergeometric model of the unseen cards (+ how often that player has been caught bluffing)
  //  * every decision (call / each way of playing) is scored by expected "shots": my death risk vs. the risk I put on the others, from where the bullets are
  //  * it learns how often each opponent calls (g.st) and bluffs more against players who rarely call
  const comb = (n, k) => { if (k < 0 || k > n) return 0; k = Math.min(k, n - k); let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
  const hyper = (N, K, n, k) => comb(K, k) * comb(N - K, n - k) / comb(N, n);                  // P(exactly k matches in n cards drawn from N cards holding K matches)
  const pAtLeast = (N, K, n, k) => { let s = 0; for (let i = k; i <= Math.min(n, K); i++) s += hyper(N, K, n, i); return Math.max(0, Math.min(1, s)); };
  const pullCost = (g, j) => { const left = CH - gunOf(g, j).pos, r1 = left <= 1 ? 1 : 1 / left, r2 = left <= 2 ? 1 : 1 / (left - 1); return r1 + (1 - r1) * .3 * r2; };   // death chance now + a share of the chance of having to pull again
  function lieRate(g, j) { let a = 0, c = 0; for (const l of g.log) if (l.t === 'call' && l.acc === j) { a++; if (!l.honest) c++; } return Math.max(.04, (c + 1.2) / (a + 5) - .08); }   // voluntary bluff rate (the lies they are forced into are subtracted roughly)
  function roundSegs(g) { const segs = []; let off = 0; for (const l of g.log) if (l.t === 'play' && l.r === g.round) { segs.push({ by: l.by, cards: g.pile.slice(off, off + l.n) }); off += l.n; } return off === g.pile.length ? segs : null; }
  // P(the LAST play of one player is a lie), given every play that player made this round (sizes in order). A call only turns the last play over, while the earlier plays
  // may well have been lies that were never checked — so we must NOT add up all their claims as if they were true. Exact DP: X real cards dealt (hypergeometric); each
  // earlier/last play is honest (needs enough real cards left) or a lie (uses fake cards); hw/lw give the likelihood of an honest / lying play of size s.
  function lastLie(N, K, H0, sizes, hw, lw) {
    N = Math.max(1, Math.round(N)); K = Math.max(0, Math.min(N, Math.round(K))); H0 = Math.max(1, Math.min(H0, N)); let hon = 0, lie = 0;
    const go = (i, r, f, w) => {
      const s = sizes[i], last = i === sizes.length - 1;
      if (r >= s) { const x = hw(s, r); if (x > 0) { if (last) hon += w * x; else go(i + 1, r - s, f, w * x); } }
      if (f >= 1 && r + f >= s) { const x = lw(s, r, f); if (x > 0) { const uf = Math.min(f, s), ur = s - uf; if (last) lie += w * x; else go(i + 1, r - ur, f - uf, w * x); } }
    };
    for (let X = 0; X <= Math.min(H0, K); X++) { const px = hyper(N, K, H0, X); if (px > 0) go(0, X, H0 - X, px); }
    return hon + lie > 0 ? lie / (hon + lie) : .9;
  }
  function infer(g, p) {
    const L = g.last, q = L.by, n = L.n, segs = roundSegs(g); if (!segs || !segs.length || segs[segs.length - 1].by !== q) return { q, n, pLie: suspicion(g, p), pD: 0 };
    const isM = c => c.k === g.target || c.k === 'J', per = perKind(g), jk = g.opts.joker ? 2 : 0, dvN = g.opts.devil ? 1 : 0, h = g.hands[p];
    let myPlayed = 0, myMatch = 0, myDev = 0; segs.forEach(s => { if (s.by === p) s.cards.forEach(c => { myPlayed++; if (isM(c)) myMatch++; if (c.k === 'D') myDev++; }); });
    const M = Math.max(0, per + jk - h.filter(isM).length - myMatch), N = Math.max(1, per * 3 + jk + dvN - h.length - myPlayed), dens = M / N;
    let E = 0, Em = 0; for (let i = 0; i < segs.length - 1; i++) { const s = segs[i]; if (s.by === p || s.by === q) continue; const m = s.cards.length, lr = lieRate(g, s.by); E += m; Em += m * ((1 - lr) + lr * dens * .5); }   // earlier claims by others: expected matches already gone
    const M2 = Math.max(0, Math.round(M - Em)), N2 = Math.max(n, N - E), qSizes = segs.filter(x => x.by === q).map(x => x.cards.length), H0 = g.hands[q].length + qSizes.reduce((a, b) => a + b, 0);   // q's hand at the deal, drawn from what is unseen
    // q's plays this round (earlier ones may have been unchecked lies): exact DP over which of them were honest, the claim sizes are evidence too
    const lam = lieRate(g, q), sz = stOf(g).sz[q], wt = [2.5 + sz[0], 1.5 + sz[1], 1 + sz[2]], K = Math.min(M2, N2);
    const szp = (m, cap) => { if (m > cap) return 0; let t = 0; for (let i = 1; i <= Math.min(3, cap); i++) t += wt[i - 1]; return t ? wt[m - 1] / t : 0; };
    const pLie = Math.max(0, Math.min(.98, lastLie(N2, K, H0, qSizes, (m, r) => (r >= 1 ? 1 - lam : 0) * szp(m, r), (m, r, f) => (r >= 1 ? lam : 1) * szp(m, f))));
    const dvUnknown = dvN && !h.some(c => c.k === 'D') && !myDev, pD = dvUnknown ? Math.min(pLie, n / N2 * 1.6) : 0;
    return { q, n, pLie, pD };
  }
  function pCall(g, j, n) { const st = stOf(g), pri = [.2, .38, .62][n - 1], f = st.fz[j][n - 1], c = st.cz[j][n - 1]; return Math.max(.03, Math.min(.95, ((c + pri * 3) / (f + 3)) * (1 + .04 * Math.min(8, g.pile.length)))); }   // how likely j is to call a claim of n cards: learned per size, with a generic prior
  function botNormal(g, p) {
    const h = g.hands[p], al = aliveList(g), A = al.length, w = 1 / Math.max(1, A - 1), me = pullCost(g, p), others = al.filter(j => j !== p), shr = g.opts.shared ? .4 : 1;
    const isM = c => c.k === g.target || c.k === 'J', good = h.filter(isM), bad = h.filter(c => !isM(c) && c.k !== 'D'), dv = h.filter(c => c.k === 'D');
    const sweep = ex => others.filter(j => j !== ex).reduce((s, j) => s + pullCost(g, j), 0) * w * shr;                    // everyone but the Devil's owner pulls
    const opts = [];
    if (canCall(g, p)) {
      const I = infer(g, p), cq = pullCost(g, I.q), pHon = 1 - I.pLie, pLn = Math.max(0, I.pLie - I.pD);
      opts.push({ ev: -.05 * me - pHon * me + pLn * w * cq + I.pD * (-me + sweep(I.q)), a: { t: 'call' } });
    }
    if (h.length) {
      let nq = -1; for (let k = 1; k < g.n; k++) { const j = (p + k) % g.n; if (g.alive[j] && g.hands[j].length) { nq = j; break; } }
      for (let x = 0; x <= Math.min(3, bad.length); x++) for (let y = 0; x + y <= 3 && y <= good.length; y++) for (let d = 0; d <= dv.length && x + y + d <= 3; d++) {
        const n = x + y + d; if (n < 1) continue; const lie = x > 0 || d > 0, bl = bad.length - x; let ev;
        if (nq < 0) ev = d ? sweep(-1) : lie ? -me : 0;                                                                     // nobody else holds cards: automatic showdown
        else {
          const pc = pCall(g, nq, n);
          ev = (d ? pc * sweep(-1) : lie ? -pc * me : pc * w * pullCost(g, nq)) - (1 - pc) * bl * .04 * me;                  // bad cards still in hand are future risk
        }
        const ids = []; bad.slice(0, x).forEach(c => ids.push(c.id)); good.slice(0, y).forEach(c => ids.push(c.id)); if (d) ids.push(dv[0].id);
        opts.push({ ev: ev + (rnd(g) - .5) * .02, a: { t: 'play', ids } });
      }
    }
    if (!opts.length) return { t: 'call' };
    return opts.reduce((b, o) => o.ev > b.ev ? o : b).a;
  }

  // ---- hard bot (level 2) ----
  // It plays like a careful human: it only uses what a seated player can see (its own cards, the sizes of the hands, who put how many cards on the pile,
  // the revealed history of every opponent) and weighs the real danger of the guns before it shouts "Liar!".
  const C2 = (n, k) => { if (k < 0 || k > n) return 0; k = Math.min(k, n - k); let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
  function hgAtLeast(N, K, d, need) {          // P(X >= need), X ~ hypergeometric: d draws from N cards of which K are "good"
    if (need <= 0) return 1; N = Math.max(1, Math.round(N)); K = Math.max(0, Math.min(N, Math.round(K))); d = Math.min(d, N); const hi = Math.min(K, d); if (need > hi) return 0;
    let q = 0; const den = C2(N, d); for (let x = need; x <= hi; x++) q += C2(K, x) * C2(N - K, d - x) / den; return q;
  }
  const HB = { W: 16, V: .7, eps: .05, pc: .4, margin: -.1, bluff: .12, q: .8, devilBoost: 1.6, trust: .3 };
  function facts(g, p) {                         // what seat p knows about the deck: its own initial hand (cards in hand + cards it already put on the pile)
    const h = g.hands[p], per = perKind(g), jk = g.opts.joker ? 2 : 0, mine = new Set(); (g.plays || []).forEach(x => { if (x.by === p) x.ids.forEach(id => mine.add(id)); });
    const played = g.pile.filter(c => mine.has(c.id)), all = h.concat(played);
    return { T: 3 * per + jk + (g.opts.devil ? 1 : 0), GT: per + jk, init: all.length, myGood: all.filter(c => c.k === g.target || c.k === 'J').length, hasD: all.some(c => c.k === 'D'), played: played.length };
  }
  function bluffRate(g, j) {                     // how often this opponent's revealed plays were lies (with a prior), learned over the whole game
    let lies = 0, tot = 0; for (const e of g.log) if (e.t === 'call' && e.acc === j) { tot++; if (!e.honest) lies++; }
    return Math.max(.05, Math.min(.6, (lies + .8) / (tot + 4)));
  }
  // probability that the last play is a lie (lie) and that it hides the Devil (pD)
  function suspicionRaw(g, p, ex) {
    const L = g.last, f = facts(g, p), acc = L.by, n = L.n, U = Math.max(1, f.T - f.init), Gu = Math.max(0, f.GT - f.myGood - (ex || 0));
    const plays = g.plays || [], tot = plays.length ? plays.filter(x => x.by === acc).reduce((a, x) => a + x.ids.length, 0) : n;
    const m = Math.max(0, g.pile.length - f.played - tot);                    // cards other players already put down (claimed good, mostly true)
    const lam = bluffRate(g, acc), wnf = s => s === 1 ? 1 : s === 2 ? .75 : .55;
    const sizes = plays.filter(x => x.by === acc).map(x => x.ids.length); if (!sizes.length || sizes[sizes.length - 1] !== n) sizes.push(n);
    // only the LAST play gets turned over; earlier plays of acc may have been unchecked lies, so don't add all its claims up (that was exploitable: 3 fakes, then 1 real card = "impossible" = Liar!)
    const lie = lastLie(U - m, Gu - HB.q * m, HAND, sizes, () => 1 - lam, (s, r) => (r >= s ? lam : 1) * wnf(s));
    const pD = g.opts.devil && !f.hasD ? Math.min(.5, HB.devilBoost * n / U) : 0;
    return { lie: Math.max(lie, pD), pD };
  }
  // Table talk is cheap talk, so a bot only half-believes it: a statement "I hold n table cards" (said this round, about the player it would hit, and possible given that
  // speaker's hand size) is blended in with weight HB.trust — it shrinks the table cards that are still unseen, which makes the last claim look more suspicious.
  function suspicion2(g, p, ctx) {
    const s = suspicionRaw(g, p, 0), L = g.last;
    const says = ctx && ctx.says ? ctx.says.filter(x => x.round === g.round && x.by !== p && x.n > 0 && (x.to === L.by || x.to === -1) && x.by !== L.by && g.alive[x.by] && x.n <= g.hands[x.by].length) : [];
    if (!says.length) return s;
    const best = says.reduce((a, b) => b.n > a.n ? b : a), tru = suspicionRaw(g, p, best.n);
    return { lie: Math.max(s.pD, s.lie + HB.trust * (tru.lie - s.lie)), pD: s.pD };
  }
  function botHard(g, p, ctx) {
    const h = g.hands[p], tgt = g.target, isGood = c => c.k === tgt || c.k === 'J', good = h.filter(isGood), bad = h.filter(c => !isGood(c) && c.k !== 'D'), dv = h.find(c => c.k === 'D');
    if (mustCall(g, p)) return { t: 'call' };
    const al = aliveList(g), a = al.length, R = j => 1 / (CH - gunOf(g, j).pos), V = a === 2 ? 1.5 : HB.V, myCost = R(p) * HB.W + HB.eps;
    const sweep = (skip) => { const o = al.filter(j => j !== skip && j !== p); return g.opts.shared ? Math.min(o.length, CH - gunOf(g, p).pos - 1) * R(p) * V : o.reduce((x, j) => x + R(j) * V, 0); };   // value of a Devil sweep for me: everybody but the Devil's owner (and me) shoots
    // next player to act after me: if nobody else holds a card the play is turned over at once; otherwise it is called about HB.pc of the time
    const nx = (() => { for (let k = 1; k < g.n; k++) { const j = (p + k) % g.n; if (g.alive[j] && g.hands[j].length) return j; } return -1; })();
    const pc = nx < 0 ? 1 : HB.pc;
    if (canCall(g, p)) {
      const s = suspicion2(g, p, ctx), acc = g.last.by, pL = s.lie, pD = Math.min(s.pD, pL);
      const evCall = -(1 - pL) * myCost + (pL - pD) * R(acc) * V + pD * (sweep(acc) - myCost);
      let evPlay = good.length ? 0 : -pc * myCost; if (dv) evPlay = Math.max(evPlay, pc * sweep(p));
      if (evCall > evPlay + HB.margin) return { t: 'call' };
    }
    if (!h.length) return { t: 'call' };
    const out = ids => ({ t: 'play', ids: ids.slice(0, 3) });
    // the Devil: if somebody calls it everyone else shoots and its owner is spared; if nobody does, it is a free card. Best used as the lie, and it can carry junk along.
    if (dv && (!good.length || g.pile.length >= 3 || h.length <= 2 || rnd(g) < .25)) { const ids = [dv.id]; bad.slice(0, rnd(g) < .5 ? 2 : 1).forEach(c => ids.push(c.id)); return out(ids); }
    const lie = !good.length || (bad.length > good.length + 1 && rnd(g) < HB.bluff);
    if (lie) { const ids = []; bad.slice(0, bad.length >= 2 && rnd(g) < .2 ? 2 : 1).forEach(c => ids.push(c.id)); if (!ids.length) ids.push(h[0].id); return out(ids); }
    const want = bad.length === 0 && good.length >= 3 ? 2 : 1;               // honest cards one at a time keeps them lasting; a fat truthful play also baits wrong calls
    return out(good.slice(0, want).map(c => c.id));
  }

  // ---- table talk (hard bots only) ----
  // A bot may say something after a play: the last player reassures / dares the table, any other bot (not the one about to decide) accuses him or announces its hand.
  // The point is to work on the next player: when it believes the claim is a lie the tip is honest (with its real count of table cards if that impresses),
  // otherwise it may bluff — a made-up count that is still possible (never more than it holds / the deck has) — hoping the next player calls wrongly and pays for it.
  // Returns { k: 'acc' | 'hand' | 'sure' | 'dare', p, to, n, v } or null. `lie` (it said something it does not believe / a count it does not have) is for tests only and must never be sent to the other players. ctx.rand / ctx.last (seat -> g.seq of its last line).
  const hash01 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const persona = (g, p) => ({ chatty: .3 + .45 * hash01(g.id + 'c' + p), deceit: .15 + .5 * hash01(g.id + 'd' + p) });   // stable per bot for the whole game, no state needed
  function botTalk(g, p, ctx) {
    ctx = ctx || {}; const R = ctx.rand || Math.random;
    if (g.opts.botLevel !== 2 || g.phase !== 'play' || !g.last || !g.alive[p] || p === actor(g)) return null;
    if (ctx.last && ctx.last[p] != null && g.seq - ctx.last[p] < 3) return null;                         // not twice in a row
    const L = g.last, A = L.by, h = g.hands[p], isGood = c => c.k === g.target || c.k === 'J', pr = persona(g, p), v = Math.floor(R() * 3);
    if (p === A) {                                                                                     // I just played: a liar reassures, an honest player likes to dare
      if (R() > pr.chatty * .45) return null;
      const lied = L.cards.some(c => !isGood(c)), k = (lied ? R() < .75 : R() < .45) ? 'sure' : 'dare';
      return { k, p, to: A, n: L.n, v };
    }
    if (R() > pr.chatty * .7) return null;
    const f = facts(g, p), goodNow = h.filter(isGood).length, mineOnPile = (g.plays || []).filter(x => x.by === p).reduce((a, x) => a + x.ids.length, 0);
    const cap = Math.max(0, Math.min(h.length, f.GT - mineOnPile));                                    // most table cards I could believably say I hold
    const pL = suspicion2(g, p, ctx).lie; let k, n = 0, bluff = false;
    if (pL >= .5) { k = 'acc'; n = goodNow >= 2 ? goodNow : 0; }                                       // honest tip
    else if (R() < pr.deceit * .8) {
      bluff = true; const big = Math.min(cap, goodNow + 2);
      if (big >= 3 && R() < .3) { k = 'hand'; n = big; }                                              // "I'm sitting on lots of them": every later claim looks thinner
      else { k = 'acc'; n = cap >= 2 ? Math.min(cap, Math.max(goodNow + 1, 2) + (R() < .3 ? 1 : 0)) : 0; }
    }   // bluff: I don't believe it, but a wrong call hurts the next player
    else if (goodNow >= 3 && R() < .5) { k = 'hand'; n = goodNow; }
    else return null;
    return { k, p, to: k === 'acc' ? A : -1, n, v, lie: bluff || n > goodNow };
  }

  function bot(g, p, ctx) {
    if (g.phase === 'trigger') return { t: 'pull' };
    const lv = Math.max(0, Math.min(2, g.opts.botLevel == null ? 1 : g.opts.botLevel)), P = LVL[lv];
    if (lv === 2) return botHard(g, p, ctx);
    if (lv === 1) return botNormal(g, p);
    const h = g.hands[p], good = h.filter(c => c.k === g.target || c.k === 'J'), bad = h.filter(c => !(c.k === g.target || c.k === 'J'));
    if (mustCall(g, p)) return { t: 'call' };
    if (canCall(g, p)) { let s = suspicion(g, p); if (P.noise) s = Math.max(0, Math.min(1, s + (rnd(g) - .5) * P.noise)); const r = rnd(g); if ((s >= 1 && (lv > 0 || r < .7)) || (P.thr != null ? s >= P.thr : r < s * P.call) || (!h.length)) return { t: 'call' }; }
    if (!h.length) return { t: 'call' };
    const want = 1 + ri(g, Math.min(3, h.length)); const ids = [];
    // easy bots sometimes just throw random cards
    if (P.sloppy && rnd(g) < P.sloppy) { h.slice().sort(() => rnd(g) - .5).slice(0, want).forEach(c => ids.push(c.id)); return { t: 'play', ids }; }
    // the Devil is safe for whoever played it (everybody else shoots when it is revealed), so hard bots play it as soon as they hold it
    const dv = h.find(c => c.k === 'D');
    if (P.devil && dv) { ids.push(dv.id); if (good.length && rnd(g) < .4) ids.push(good[0].id); return { t: 'play', ids }; }
    const lie = good.length === 0 || (rnd(g) < P.lie && bad.length);
    if (!lie) good.slice(0, want).forEach(c => ids.push(c.id));
    else { bad.slice(0, lv === 2 ? Math.min(want, rnd(g) < .7 ? 1 : 2) : want).forEach(c => ids.push(c.id)); if (rnd(g) < .3 && good.length && ids.length < 3) ids.push(good[0].id); }
    if (!ids.length) ids.push(h[0].id);
    return { t: 'play', ids: ids.slice(0, 3) };
  }

  root.Sus = { CHARS, KINDS, MAXP, CH, HAND, DEFAULTS, normSettings, gunOf, newGame, apply, bot, actor, canCall, mustCall, legalPlay, honest, aliveList, nextAlive, suspicion, HB, botTalk, suspicion2 };
  if (typeof module !== 'undefined') module.exports = root.Sus;
})(typeof window !== 'undefined' ? window : globalThis);
