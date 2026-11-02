// sus-engine.js — pure rules of Sus Tavern (a Liar's Bar style bluffing game). No DOM. Seeded RNG lives in the state (g.rs) so the state is plain JSON.
// Deck: Ace / King / Queen x K each + 2 Jokers (wild) [+ 1 Devil when enabled]. Every round one type is "the table card".
// On your turn play 1-3 face-down cards claiming they are the table card, OR call the previous player a liar.
// Call: reveal the last cards. All table-card/Joker => the caller was wrong and pulls the trigger; otherwise the liar pulls it.
// Devil: if a revealed set contains a Devil, EVERY living player pulls the trigger one after another (starting with the accused).
// Each player owns a revolver: 6 chambers, 1 bullet at a hidden chamber; each pull advances it (the risk only goes up). Last one alive wins.
(function (root) {
  'use strict';
  const CHARS = ['pig', 'fox', 'dog', 'goat', 'octo', 'penguin', 'hawk', 'turtle'], KINDS = ['A', 'K', 'Q'], MAXP = 5, CH = 6, HAND = 5;
  const DEFAULTS = { devil: false, bots: 3, botLevel: 1 };   // botLevel: 0 easy, 1 normal, 2 hard
  function normSettings(s) { s = Object.assign({}, DEFAULTS, s || {}); s.devil = !!s.devil; s.bots = Math.max(1, Math.min(MAXP - 1, Math.round(+s.bots || 3))); s.botLevel = Math.max(0, Math.min(2, Math.round(+s.botLevel == null || isNaN(+s.botLevel) ? 1 : +s.botLevel))); return s; }

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
    for (let i = 0; i < n; i++) g.gun.push({ pos: 0, bullet: ri(g, CH) });
    g.sign = Math.floor(Math.random() * 1000);                       // picks the tavern sign on the wall (3D); shared by everyone in the room because it lives in the game state
    g.lead = ri(g, n); startRound(g); return g;
  }
  function deckFor(g) {
    const per = g.n >= 5 ? 8 : 6, d = []; KINDS.forEach(k => { for (let i = 0; i < per; i++) d.push({ id: g.nid++, k }); });
    d.push({ id: g.nid++, k: 'J' }, { id: g.nid++, k: 'J' }); if (g.opts.devil) d.push({ id: g.nid++, k: 'D' });
    return shuffle(g, d);
  }
  function startRound(g) {
    g.round++; g.target = KINDS[ri(g, 3)]; g.pile = []; g.last = null; g.forced = false; g.phase = 'play'; g.shooters = []; g.sidx = 0; g.seen = [];
    const d = deckFor(g); g.hands = g.alive.map(a => a ? d.splice(0, HAND) : []);
    g.hands.forEach(h => h.sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : a.id - b.id));
    g.turn = g.alive[g.lead] ? g.lead : nextAlive(g, g.lead);
    g.ev.push({ t: 'round', n: g.round, target: g.target, lead: g.turn, devil: !!g.opts.devil });
  }
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

  // apply one action of player p. returns true if legal (and g mutated).
  function apply(g, p, a) {
    if (g.phase === 'over' || !a || p < 0 || p >= g.n || !g.alive[p]) return false;
    g.ev = []; g.seq++;
    if (a.t === 'play') {
      if (!legalPlay(g, p, a.ids)) { g.seq--; return false; }
      const cards = a.ids.map(id => g.hands[p].find(c => c.id === id)); g.hands[p] = g.hands[p].filter(c => !a.ids.includes(c.id));
      g.pile.push(...cards); g.last = { by: p, n: cards.length, cards };
      // next to act: next living player that still has cards. If nobody else has cards left, the next player must call.
      let nx = -1; for (let k = 1; k < g.n; k++) { const j = (p + k) % g.n; if (g.alive[j] && g.hands[j].length) { nx = j; break; } }
      if (nx < 0) { nx = nextAlive(g, p); g.forced = true; } else g.forced = false;
      g.turn = nx; g.ev.push({ t: 'play', by: p, n: cards.length, ids: a.ids.slice(), next: nx, left: g.hands[p].length });
      g.log.push({ t: 'play', by: p, n: cards.length, r: g.round }); return true;
    }
    if (a.t === 'call') {
      if (!canCall(g, p)) { g.seq--; return false; }
      const acc = g.last.by, cards = g.last.cards, ok = honest(g, cards), devil = cards.some(c => c.k === 'D');
      const loser = ok ? p : acc;
      g.shooters = devil ? (() => { const l = []; let i = acc; if (!g.alive[i]) i = nextAlive(g, i); for (let k = 0; k < g.n; k++) { const j = (i + k) % g.n; if (g.alive[j] && j !== acc) l.push(j); } /* the Devil's owner is spared */ return l; })() : [loser];
      g.sidx = 0; g.phase = 'trigger'; g.lead = loser;
      g.ev.push({ t: 'call', by: p, acc, cards: cards.map(c => ({ id: c.id, k: c.k })), honest: ok, devil, loser, shooters: g.shooters.slice() });
      g.log.push({ t: 'call', by: p, acc, honest: ok, devil, r: g.round }); return true;
    }
    if (a.t === 'pull') {
      if (g.phase !== 'trigger' || g.shooters[g.sidx] !== p) { g.seq--; return false; }
      const gn = g.gun[p], lone = g.sidx === g.shooters.length - 1 && aliveList(g).length === 1;   // the last one standing never dies to a Devil sweep
      const dead = gn.pos === gn.bullet && !lone; const pos = gn.pos; if (!dead) gn.pos++; g.shots[p]++;
      if (dead) g.alive[p] = false;
      g.ev.push({ t: 'pull', p, dead, pos, risk: dead ? 1 : 1 / (CH - gn.pos + 1) });
      g.log.push({ t: 'pull', p, dead, r: g.round });
      g.sidx++;
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
    const L = g.last; if (!L) return 0; const per = g.n >= 5 ? 8 : 6, total = per + 2;
    const mine = g.hands[p].filter(c => c.k === g.target || c.k === 'J').length;
    const claimedSoFar = g.pile.length;                            // every card played so far this round was claimed as the table card
    const room = Math.max(0, total - mine);                        // table cards (+jokers) that can be on the pile at most
    if (claimedSoFar > room) return 1;                            // mathematically impossible: at least one liar
    const dens = room / Math.max(1, room + (g.n * HAND - total) * 1.0);   // rough chance a random unseen card is a match
    return Math.min(.95, 1 - Math.pow(Math.max(.05, dens + .18), L.n) + claimedSoFar * .03);
  }
  // bot skill (hard bots only call when they are nearly sure — thr — because a wrong call costs a shot; tuned by simulation): call = how eagerly it calls a suspicious claim, lie = how often it bluffs, noise = how badly it misjudges, sloppy = chance of playing random cards
  const LVL = [{ call: .5, lie: .08, noise: .5, sloppy: .25 }, { call: .85, lie: .25, noise: 0, sloppy: 0 }, { call: 1, lie: .03, noise: 0, sloppy: 0, thr: .85, devil: true }];
  function bot(g, p) {
    if (g.phase === 'trigger') return { t: 'pull' };
    const lv = Math.max(0, Math.min(2, g.opts.botLevel == null ? 1 : g.opts.botLevel)), P = LVL[lv];
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

  root.Sus = { CHARS, KINDS, MAXP, CH, HAND, DEFAULTS, normSettings, newGame, apply, bot, actor, canCall, mustCall, legalPlay, honest, aliveList, nextAlive, suspicion };
  if (typeof module !== 'undefined') module.exports = root.Sus;
})(typeof window !== 'undefined' ? window : globalThis);
