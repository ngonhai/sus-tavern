// sus-ui.js — screens, the 2D table, and the event player. The UI keeps a `view` (what is on screen) plus a queue of newer states:
// each new state first plays its events (cards flying, the shout, the reveal, the trigger) on top of the old view, then becomes the view.
// Input is locked while that plays. In 3D mode the same HUD sits over the Three.js table (sus-3d.js); 2D is the full fallback.
(function () {
  'use strict';
  const $ = id => document.getElementById(id), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms)), reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const SEATCOL = ['#ff6a4d', '#5eead4', '#ffb547', '#b39bff', '#6cc4f5'];
  const U = { screen: null, view: null, queue: [], busy: false, pending: false, sel: new Set(), me: 0, spec: false, d3: false, can3d: false, cam: 'pov', camSeat: 0, botT: null, expr: [], say: [], claim: '', settings: Sus.normSettings(), lastEmote: 0, room: null, shownOver: null, myChar: (function () { try { return localStorage.getItem('sus_char'); } catch (e) { return null; } })(), gunSticky: false };
  const S3 = () => window.S3D;
  const meIdx = g => { if (Net.mode() === 'local') return g.seatKeys.indexOf('s0'); const k = Net.mySeat(); return k ? g.seatKeys.indexOf(k) : -1; };

  // ---------------------------------------------------------------- generic ----
  function show(name) { U.screen = name; setTimeout(refreshLeave, 0); document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name)); document.body.classList.toggle('ingame', name === 'game'); document.body.classList.toggle('mode3d', U.d3 && name === 'game'); if (U.d3 && name === 'game') { try { S3().start(); } catch (e) {} } }
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2600); }
  function closeModal() { $('modal').innerHTML = ''; }
  const leaveOpen = () => !!$('m-stay');                                   // the "leave or stay?" popup must survive game events (new turn, new round, rematch...)
  const closeModalSoft = () => { if (!leaveOpen()) closeModal(); };
  function modal(html, wide) { $('modal').innerHTML = '<div class="modal-back"><div class="modal-card poly' + (wide ? ' wide' : '') + '">' + html + '</div></div>'; }
  function langSelects() { document.querySelectorAll('.lang-select').forEach(s => { s.innerHTML = '<option value="vi">Tiếng Việt</option><option value="en">English</option>'; s.value = LANG; s.onchange = () => { setLang(s.value); applyLang(); }; }); }
  function applyLang() {
    document.title = t('title'); $('lobby-title').textContent = t('title'); $('lobby-sub').textContent = t('sub'); $('lbl-name').textContent = t('name'); $('input-name').placeholder = t('namePh');
    $('tab-btn-create').textContent = t('create'); $('tab-btn-join').textContent = t('join'); $('tab-btn-offline').textContent = t('offline');
    $('btn-create-room').textContent = t('createBtn'); $('lbl-code').textContent = t('code'); $('btn-join-room').textContent = t('joinBtn'); $('btn-start-offline').textContent = t('startOff'); $('offline-hint').textContent = t('offHint');
    $('online-off-note').textContent = t('onlineOff'); $('resume-title').textContent = t('resumeT'); $('resume-body').textContent = t('resumeB'); $('btn-resume').textContent = t('resume');
    $('room-code-label').textContent = t('roomCode'); $('seats-title').textContent = t('seats'); $('rules-title').textContent = t('rules'); $('btn-leave-waiting').textContent = t('leave'); $('rules-readonly-hint').textContent = t('onlyHost');
    $('game-title').textContent = t('title'); $('btn-rules').textContent = '?'; $('btn-rules').title = t('help'); $('btn-leave-game').textContent = '✕'; $('btn-leave-game').title = t('exit');
    $('btn-music').textContent = '🎵'; $('btn-sound').textContent = Snd.isMuted() ? '🔇' : '🔊'; $('btn-3d').textContent = U.d3 ? '3D ✓' : '2D'; $('btn-3d').title = t('d3');
    $('btn-liar').textContent = t('liar'); $('btn-pull').textContent = t('pull'); $('btn-music').style.opacity = Snd.musicOn() ? 1 : .5;
    $('emote-bar').innerHTML = Object.keys(t('emotes')).map(k => '<button type="button" data-e="' + k + '">' + esc(t('emotes')[k]) + '</button>').join('');
    offRules();
    if ($('off-chars')) offChars();
    if (Net.room() && U.screen === 'waiting') renderWaiting(Net.room());
    if (U.screen === 'game' && U.view) renderGame(U.view);
  }
  const seg = (key, opts, cur, edit) => '<div class="seg">' + opts.map(o => '<button type="button" class="seg-btn' + (String(cur) === String(o[0]) ? ' on' : '') + '" data-k="' + key + '" data-v="' + o[0] + '"' + (edit ? '' : ' disabled') + '>' + o[1] + '</button>').join('') + '</div>';
  // small icon per rule: the real Devil / Joker card art of the deck, inline SVG (48x48) for number of bots, shared revolver (two hands + one upright revolver), bot level, bot talk
  const IC = (body) => '<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#2a1a14" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">' + body + '</g></svg>';
  const RULE_IC = {
    devil: () => '<img class="rule-card" alt="" src="' + curl('D') + '">',        // the real cards of the deck (Art.cardURL), not a drawing
    bots: IC([3, 18, 33].map(x => '<path d="M' + (x + 6) + ' 15 V10" fill="none"/><circle cx="' + (x + 6) + '" cy="9" r="2" fill="#ffb547"/><rect x="' + x + '" y="15" width="12" height="15" rx="3.5" fill="#9ec5d0"/><circle cx="' + (x + 3.8) + '" cy="21" r="2" fill="#fff" stroke-width="1.4"/><circle cx="' + (x + 8.2) + '" cy="21" r="2" fill="#fff" stroke-width="1.4"/><path d="M' + (x + 3.5) + ' 26.5 H' + (x + 8.5) + '" fill="none" stroke-width="1.8"/>').join('') + '<path d="M6 40 H42" fill="none" stroke-width="2.6" opacity=".55"/>'),
    shared: IC('<path d="M2 27 Q2 22 7 22 L17 24 L17 33 L7 35 Q2 35 2 30 Z" fill="#f1c6a0"/><path d="M9 24.5 V33.5 M12.5 25 V33" fill="none" stroke-width="1.5"/><path d="M46 27 Q46 22 41 22 L31 24 L31 33 L41 35 Q46 35 46 30 Z" fill="#f1c6a0"/><path d="M39 24.5 V33.5 M35.5 25 V33" fill="none" stroke-width="1.5"/><rect x="22" y="3" width="4" height="17" rx="1.5" fill="#a9bcc4"/><rect x="19" y="19" width="10" height="12" rx="3" fill="#c4d3d8"/><path d="M24 20 V30" fill="none" stroke-width="1.5"/><path d="M21 31 L28 31 L30 44 Q27 46.5 22 45 Z" fill="#a0602f"/><path d="M20 32 Q19 38 25 37" fill="none" stroke-width="1.8"/>'),
    joker: () => '<img class="rule-card" alt="" src="' + curl('J') + '">',
    botLevel: IC('<rect x="7" y="30" width="9" height="12" rx="2" fill="#4ade80"/><rect x="19.5" y="21" width="9" height="21" rx="2" fill="#ffb547"/><rect x="32" y="10" width="9" height="32" rx="2" fill="#ff5d5d"/>'),
    talk: IC('<path d="M9 8 H39 Q44 8 44 13 V27 Q44 32 39 32 H25 L15 41 V32 H9 Q4 32 4 27 V13 Q4 8 9 8 Z" fill="#f6f0e2"/><circle cx="15" cy="20" r="2.6" fill="#2a1a14" stroke="none"/><circle cx="24" cy="20" r="2.6" fill="#2a1a14" stroke="none"/><circle cx="33" cy="20" r="2.6" fill="#2a1a14" stroke="none"/>')
  };
  const ruleRow = (ic, ttl, desc, ctl) => '<div class="rule-row"><div class="rule-main"><span class="rule-ic">' + (typeof RULE_IC[ic] === 'function' ? RULE_IC[ic]() : RULE_IC[ic]) + '</span><div><b>' + t(ttl) + '</b><p>' + t(desc) + '</p></div></div>' + ctl + '</div>';
  function rulesHTML(s, edit, offline) {
    const onoff = (k, v) => seg(k, [[0, t('offS')], [1, t('on')]], v ? 1 : 0, edit);
    let h = ruleRow('devil', 'rDevil', 'rDevilD', onoff('devil', s.devil));
    if (offline) h += ruleRow('bots', 'rBots', 'rBotsD', seg('bots', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], s.bots, edit));
    h += ruleRow('shared', 'rShared', 'rSharedD', onoff('shared', s.shared));
    h += ruleRow('joker', 'rJoker', 'rJokerD', onoff('joker', s.joker));
    h += ruleRow('botLevel', 'rBotLv', 'rBotLvD', seg('botLevel', [[0, t('lvEasy')], [1, t('lvNormal')], [2, t('lvHard')]], s.botLevel, edit));
    h += ruleRow('talk', 'rTalk', 'rTalkD', onoff('talk', s.talk));
    return h;
  }
  function wireRules(root, apply) { root.querySelectorAll('.seg-btn').forEach(b => { b.onclick = () => { if (b.disabled) return; Snd.play('click'); let v = b.dataset.v; v = ['devil', 'joker', 'shared', 'talk'].includes(b.dataset.k) ? v === '1' : +v; apply(b.dataset.k, v); }; }); }
  function offRules() { $('off-rules').innerHTML = rulesHTML(U.settings, true, true); wireRules($('off-rules'), (k, v) => { U.settings[k] = v; U.settings = Sus.normSettings(U.settings); offRules(); }); }

  // ---------------------------------------------------------------- lobby / waiting ----
  const myName = () => $('input-name').value.trim();
  function saveName() { try { localStorage.setItem('sus_name', myName()); } catch (e) {} }
  function needName() { const n = myName(); if (!n) { toast(t('needName')); $('input-name').focus(); return null; } saveName(); return n; }
  function showLobby() { closeModal();
    show('lobby'); $('lobby-logo').innerHTML = Art.logo(); try { $('input-name').value = localStorage.getItem('sus_name') || ''; } catch (e) {}
    $('online-off-note').style.display = Net.ONLINE_OK ? 'none' : 'block'; ['create', 'join'].forEach(k => { $('tab-btn-' + k).disabled = !Net.ONLINE_OK; $('tab-btn-' + k).style.opacity = Net.ONLINE_OK ? 1 : .4; });
    $('resume-card').style.display = Net.hasLocal() ? 'flex' : 'none'; applyLang(); offRules(); offChars();
  }
  const charRow = (cur, taken) => '<div class="char-row">' + Sus.CHARS.map(c => '<button type="button" class="char-btn' + (c === cur ? ' on' : '') + '" data-c="' + c + '"' + (taken && taken.has(c) ? ' disabled' : '') + ' title="' + esc(t('chars')[c]) + '"><span class="ca">' + Art.avatar(c, 'neutral') + '</span><small>' + esc(t('chars')[c]) + '</small></button>').join('') + '</div>';
  function wireChars(root, fn) { root.querySelectorAll('.char-btn').forEach(b => { b.onclick = () => { if (b.disabled) return; Snd.play('select'); fn(b.dataset.c); }; }); }
  function offChars() { if (!U.myChar || !Sus.CHARS.includes(U.myChar)) U.myChar = Sus.CHARS[Math.floor(Math.random() * Sus.CHARS.length)]; $('off-chars').innerHTML = '<label>' + t('pickChar') + '</label>' + charRow(U.myChar); wireChars($('off-chars'), c => { U.myChar = c; try { localStorage.setItem('sus_char', c); } catch (e) {} offChars(); }); }
  function renderWaiting(room) {
    $('room-code-display').textContent = Net.code() || '-----'; const host = Net.isHost(room), seats = Net.SEATK;
    $('seat-grid').innerHTML = seats.map((k, i) => { const s = room.seats[k]; const mine = Net.mySeat() === k;
      if (!s) return '<div class="seat free" style="--sc:' + SEATCOL[i] + '"><div class="seat-body"><div class="seat-name muted">' + t('seatFree') + '</div></div></div>';
      return '<div class="seat' + (mine ? ' mine' : '') + '" style="--sc:' + SEATCOL[i] + '"><div class="seat-av">' + Art.avatar(s.char || 'pig', 'neutral') + '</div><div class="seat-body"><div class="seat-name">' + esc(s.name) + '</div><div class="seat-tags">' +
        (mine ? '<span class="tag you">' + t('you') + '</span>' : '') + (room.hostUid === s.uid ? '<span class="tag">' + t('host') + '</span>' : '') + (s.bot ? '<span class="tag">' + t('botTag') + '</span>' : '') + (s.connected === false ? '<span class="tag off">' + t('off') + '</span>' : '') + '</div></div>' + (s.bot && host ? '<button type="button" class="mini-x" data-rm="' + k + '" title="' + t('rmBot') + '">✕</button>' : '') + '</div>'; }).join('');
    $('seat-grid').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { Snd.play('click'); Net.removeBot(b.dataset.rm); });
    $('rules-list').innerHTML = rulesHTML(room.settings, host, false); wireRules($('rules-list'), (k, v) => Net.setSetting(k, v));
    const n = Net.SEATK.filter(k => room.seats[k]).length; const ab = $('btn-add-bot'); ab.style.display = host ? '' : 'none'; ab.textContent = t('addBot'); ab.disabled = n >= 5; ab.onclick = () => { Snd.play('click'); Net.addBot(); };
    const mineSeat = Net.mySeat(), cur = mineSeat && room.seats[mineSeat] ? room.seats[mineSeat].char : null; $('wait-chars').innerHTML = (mineSeat ? '<label>' + t('pickChar') + '</label>' : '') + (mineSeat ? charRow(cur, new Set(Net.SEATK.filter(k => k !== mineSeat && room.seats[k]).map(k => room.seats[k].char))) : ''); wireChars($('wait-chars'), c => { U.myChar = c; try { localStorage.setItem('sus_char', c); } catch (e) {} Net.setChar(c); });
    $('btn-start-game').style.display = host ? '' : 'none'; $('btn-start-game').textContent = t('start'); $('btn-start-game').disabled = n < 2;
    $('waiting-hint').textContent = (host ? (n < 2 ? t('needTwo') : '') : t('waitHost')) + (Net.mode() === 'online' ? (room.secure ? ' ' + t('sealedOn') : ' ' + t('sealedOff')) : ''); $('rules-readonly-hint').style.display = host ? 'none' : '';
  }
  function onRoom(room, prev) {
    U.room = room;
    if (!room) { if (U.screen !== 'lobby') { toast(t('hostLeft')); U.view = null; showLobby(); } return; }
    if (room.status === 'lobby') { if (U.screen !== 'waiting') show('waiting'); renderWaiting(room); return; }
    if (room.status === 'play') { if (U.screen !== 'game') { show('game'); Snd.musicStart(); } const g = Net.getG(room); if (g) pushState(g, room); if (room.emote && room.emote.ts !== U.lastEmote) { U.lastEmote = room.emote.ts; if (g && room.emote.key !== Net.mySeat()) showEmote(g.seatKeys.indexOf(room.emote.key), room.emote.k); } }
  }
  function pushState(g, room) {
    if (!U.view || U.view.id !== g.id) {
      U.view = g; U.queue = []; U.busy = false; U.pending = false; U.sel.clear(); U.expr = []; U.claim = ''; closeModalSoft(); U.shownOver = null;
      U.spec = Net.mode() === 'online' && Net.isSpec(); const mi = meIdx(g); U.me = mi >= 0 ? mi : (U.camSeat || 0); U.camSeat = U.me; U.cam = U.spec ? 'side' : 'pov';
      if (U.d3) S3().setup({ g, me: U.me, view: U.spec && U.cam === 'side' ? 'side' : U.me });
      renderGame(g); afterIdle(); return;
    }
    if (g.seq > U.view.seq) {
      if (!U.busy && !U.queue.length && g.seq === U.view.seq + 1 && g.ev.length === 1 && g.ev[0].t === 'talk') { showTalk(g.ev[0], g); U.view = g; return; }
      U.queue.push(g); U.pending = false; runQueue(); return;
    }
    if (!U.busy) { U.view = g; renderGame(g); refreshLeave(); }
  }
  // a bot comment: 2D a bubble over the avatar (flips below it near the top); 3D a small board above the head. It does not block anything.
  function showTalk(e, g) {
    const arr = t('talk')[e.n ? 'acc' : 'accNo'], text = arr[e.v % arr.length].replace(/\{(\w+)\}/g, (x, w) => w === 'n' ? e.n : w === 'to' ? g.names[e.about] : w === 'c' ? t('cardShort')[g.target] : x), ms = reduce() ? 3000 : 4200 + text.length * 25;
    if (U.d3) S3().say(e.by, text, g.names[e.by], SEATCOL[e.by % SEATCOL.length], ms);
    else { const el = $('say-' + e.by); if (el) { el.classList.toggle('below', el.parentElement.getBoundingClientRect().top < 150); bubble(e.by, text, ms, 'talk'); } }
    setExpr(e.by, 'smug', 1800); Snd.play('select');
  }
  async function runQueue() {
    if (U.busy) return; U.busy = true; renderControls(U.view);
    while (U.queue.length) {
      const g = U.queue.shift(), before = U.view; if (g.seq <= before.seq) continue;
      if (g.seq === before.seq + 1 && g.ev.length === 1 && g.ev[0].t === 'talk') { showTalk(g.ev[0], g); U.view = g; continue; }
      closeModalSoft();
      try { await animate(g, before); } catch (e) { console.error(e); }
      U.view = g; renderGame(g); refreshLeave();
    }
    U.busy = false; if (U.d3 && U.view.phase !== 'trigger') S3().unfocus();      // safety net: never leave the cinematic zoom + bars up when nothing else will end it
    renderControls(U.view); afterIdle();
  }

  // ---------------------------------------------------------------- rendering ----
  const backImg = n => { let h = ''; for (let i = 0; i < Math.min(n, 5); i++) h += '<i></i>'; return h; };
  function seatHTML(g, i, pov) {
    const n = g.n, rel = (i - pov + n) % n, a = (90 + rel * 360 / n) * Math.PI / 180, x = 50 + 42 * Math.cos(a), y = 52 + 36 * Math.sin(a), alive = g.alive[i], gn = Sus.gunOf(g, i), sh = !!g.opts.shared;
    let ch = ''; for (let k = 0; k < Sus.CH; k++) ch += '<i class="' + (k < gn.pos ? 'used' : '') + (!alive && k === gn.pos ? ' dead' : '') + '"></i>';
    const ex = !alive ? 'dead' : (U.expr[i] || 'neutral');
    return '<div class="seat2d' + (g.turn === i && g.phase === 'play' || (g.phase === 'trigger' && g.shooters[g.sidx] === i) ? ' turn' : '') + (alive ? '' : ' dead') + (i === U.me && !U.spec ? ' me' : '') + '" data-i="' + i + '" style="left:' + x + '%;top:' + y + '%;--sc:' + SEATCOL[i] + '">' +
      '<div class="say" id="say-' + i + '"></div><div class="av">' + Art.avatar(g.chars[i], ex) + '</div><div class="nm">' + esc(g.names[i]) + (i === U.me && !U.spec ? ' <span class="tag you">' + t('you') + '</span>' : '') + '</div>' +
      '<div class="cards">' + (alive ? backImg(g.hands[i].length) + '<b>' + g.hands[i].length + '</b>' : '<b>☠</b>') + '</div>' + (sh ? '' : '<div class="chambers" title="' + t('chambers', { a: Math.min(gn.pos, 6) }) + '">' + ch + '</div>') + '</div>';
  }
  const curl = k => (U.curls = U.curls || {})[k] || (U.curls[k] = Art.cardURL(k));
  function renderCenter(g) {
    let pile = ''; const np = g.pile.length; for (let i = 0; i < Math.min(np, 8); i++) pile += '<i style="left:' + (14 + ((i * 37) % 22)) + 'px;top:' + (6 + ((i * 17) % 14)) + 'px;transform:rotate(' + (((i * 53) % 50) - 25) + 'deg)"></i>';
    $('center').innerHTML = '<div class="table-card"><img src="' + curl(g.target) + '" alt=""><div><small>' + t('tableCard') + '</small><b>' + esc(t('cardName')[g.target]) + '</b></div></div><div class="pile">' + pile + '</div><div class="claim-big">' + esc(U.claim) + '</div>';
  }
  function renderHand(g) {
    const box = $('hand'); if (U.spec || !g.alive[U.me]) { box.innerHTML = ''; return; }
    box.innerHTML = g.hands[U.me].map(c => '<button type="button" class="card' + (U.sel.has(c.id) ? ' sel' : '') + '" data-id="' + c.id + '"><img src="' + curl(c.k) + '" alt="' + c.k + '"></button>').join('');
  }
  function logHTML(g) {
    const w = i => '<b>' + esc(g.names[i]) + '</b>';
    return g.log.slice(-60).reverse().map(l => {
      if (l.t === 'play') return '<div class="log-line">' + w(l.by) + ' → ' + l.n + '</div>';
      if (l.t === 'call' && l.auto) return '<div class="log-line ' + (l.devil ? 'bad' : 'sys') + '">' + t('autoReveal', { n: w(l.acc) }) + ' ' + (l.devil ? '😈' : l.honest ? '✔' : '✘') + '</div>';
      if (l.t === 'call') return '<div class="log-line ' + (l.devil ? 'bad' : 'sys') + '">' + t('calls', { n: esc(g.names[l.by]) }).replace(esc(g.names[l.by]), w(l.by)) + ' ' + (l.devil ? '😈' : l.honest ? '✔' : '✘') + '</div>';
      return '<div class="log-line ' + (l.dead ? 'bad' : 'good') + '">' + (l.dead ? '☠ ' : '· ') + w(l.p) + '</div>';
    }).join('');
  }
  function statusText(g) {
    if (g.phase === 'over') return tr('winner', { n: esc(g.names[g.winner]) });
    if (g.phase === 'trigger') { const s = g.shooters[g.sidx]; return s === U.me && !U.spec ? t('pullYou') : t('pullOf', { n: esc(g.names[s]) }); }
    if (g.turn === U.me && !U.spec) return Sus.mustCall(g, U.me) ? t('mustCall') : t('turnYou') + ' — ' + t('playHint', { c: t('cardName')[g.target] });
    return t('turnOf', { n: esc(g.names[g.turn]) });
  }
  function renderControls(g) {
    if (!g) return; const me = U.me, play = !U.spec && g.alive[me] && g.phase === 'play' && g.turn === me && !U.busy && !U.pending, ids = [...U.sel];
    const bp = $('btn-play'), bl = $('btn-liar'), bu = $('btn-pull'), must = play && Sus.mustCall(g, me);
    bp.style.display = U.spec || !g.alive[me] || g.phase !== 'play' ? 'none' : ''; bp.textContent = t('play', { n: ids.length || '' }); bp.disabled = !(play && Sus.legalPlay(g, me, ids)); bp.title = t('playHint', { c: t('cardName')[g.target] });
    bl.style.display = U.spec || !g.alive[me] || g.phase !== 'play' ? 'none' : ''; bl.disabled = !(play && Sus.canCall(g, me)); bl.title = t('liarHint'); bl.classList.toggle('must', !!must);
    const sh = g.phase === 'trigger' && g.shooters[g.sidx] === me && !U.spec; bu.style.display = sh ? '' : 'none'; bu.disabled = !sh || U.busy || U.pending;
    const st = $('status'); st.innerHTML = U.busy ? '' : statusText(g); st.classList.toggle('mine', !U.busy && !U.spec && ((g.phase === 'play' && g.turn === me) || (g.phase === 'trigger' && g.shooters[g.sidx] === me)));
    document.querySelectorAll('#hand .card').forEach(el => el.classList.toggle('sel', U.sel.has(+el.dataset.id)));
    if (U.d3) S3().setSelected([...U.sel]);
  }
  function renderGame(g) {
    U.spec = Net.mode() === 'online' && Net.isSpec(); const mi = meIdx(g); if (!U.spec && mi >= 0) U.me = mi; else U.me = U.camSeat || 0; U.me = Math.min(U.me, g.n - 1);
    document.body.classList.toggle('spec', U.spec); const pov = U.me;
    [...U.sel].forEach(id => { if (!g.hands[U.me].some(c => c.id === id)) U.sel.delete(id); });
    $('seats').innerHTML = g.names.map((_, i) => seatHTML(g, i, pov)).join(''); renderCenter(g); renderHand(g);
    $('cam-bar').style.display = U.spec ? 'flex' : 'none'; if (U.spec) { $('cam-bar').innerHTML = '<button type="button" data-cam="side" class="' + (U.cam === 'side' ? 'on' : '') + '">' + t('camSide') + '</button>' + g.names.map((n, i) => '<button type="button" data-cam="' + i + '" class="' + (U.cam !== 'side' && U.camSeat === i ? 'on' : '') + '">' + esc(n) + '</button>').join(''); }
    $('game-room-code-label').textContent = Net.mode() === 'online' ? Net.code() + (U.spec ? ' · ' + t('spec') : (Net.specCount() ? ' · 👁' + Net.specCount() : '')) : ''; $('game-room-code-label').style.display = Net.mode() === 'online' ? '' : 'none';
    $('round-chip').textContent = t('round', { n: g.round }) + ' · ' + t('cardShort')[g.target]; { const sg = $('sg-chip'); if (g.opts.shared) { const gn = g.gun[0]; let d = ''; for (let k = 0; k < Sus.CH; k++) d += '<i class="' + (k < gn.pos ? 'used' : '') + '"></i>'; sg.innerHTML = '🔫 ' + t('sharedChip') + ' <span class="sg-ch">' + d + '</span>'; sg.style.display = ''; sg.onmouseenter = e => { const r = sg.getBoundingClientRect(); showGun(0, r.left, r.bottom + 40); }; sg.onmouseleave = () => hideGun(); sg.onclick = () => { const r = sg.getBoundingClientRect(); showGun(0, r.left, r.bottom + 40, true); }; } else sg.style.display = 'none'; } { const lp = $('log-panel'), st = lp.scrollTop; lp.innerHTML = logHTML(g); lp.scrollTop = st; }
    if (U.d3) { S3().setView(U.spec && U.cam === 'side' ? 'side' : U.me); S3().sync(g, { me: U.me }); }
    renderControls(g); tension(g);
  }
  function tension(g) {
    let T = .15; if (g.phase === 'trigger') { const s = g.shooters[g.sidx]; T = .4 + (Sus.gunOf(g, s).pos / 6) * .6; } else { const alive = g.alive.filter(Boolean).length; T = .15 + Math.max(0, 4 - alive) * .12 + g.gun.reduce((a, x, i) => a + (g.alive[i] ? x.pos : 0), 0) / (6 * alive) * .35; }
    Snd.setTension(T); document.body.classList.toggle('tense', g.phase === 'trigger' && Sus.gunOf(g, g.shooters[g.sidx]).pos >= 3);
  }

  // ---------------------------------------------------------------- event player ----
  function say(txt, cls, sub) { const b = $('banner'); b.className = 'banner ' + (cls || ''); b.innerHTML = txt ? '<span>' + txt + (sub ? '<small>' + sub + '</small>' : '') + '</span>' : ''; }
  function floatAt(i, txt, col) { const el = document.querySelector('.seat2d[data-i="' + i + '"]'); const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: 120, width: 0, height: 0 }; const f = document.createElement('div'); f.className = 'float'; f.textContent = txt; f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top + 10) + 'px'; if (col) f.style.color = col; $('fx').appendChild(f); setTimeout(() => f.remove(), 1300); }
  function bubble(i, txt, ms, cls) { const el = $('say-' + i); if (!el) return; el.textContent = txt; el.classList.toggle('talk', cls === 'talk'); el.classList.add('on'); clearTimeout(bubble['t' + i]); bubble['t' + i] = setTimeout(() => el.classList.remove('on'), ms || 1800); }
  function setExpr(i, ex, ms) { U.expr[i] = ex; if (U.d3) S3().setExpr(i, ex); const av = document.querySelector('.seat2d[data-i="' + i + '"] .av'); if (av) av.innerHTML = Art.avatar(U.view.chars[i], U.view.alive[i] ? ex : 'dead'); clearTimeout(setExpr['t' + i]); if (ms) setExpr['t' + i] = setTimeout(() => { U.expr[i] = 'neutral'; if (U.d3) S3().setExpr(i, U.view && U.view.alive[i] ? 'neutral' : 'dead'); const a2 = document.querySelector('.seat2d[data-i="' + i + '"] .av'); if (a2 && U.view) a2.innerHTML = Art.avatar(U.view.chars[i], U.view.alive[i] ? 'neutral' : 'dead'); }, ms); }
  function shake() { document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 520); }
  function flashScreen(col) { const f = $('flash-screen'); f.style.background = col; if (reduce()) return; f.animate([{ opacity: .75 }, { opacity: 0 }], { duration: 450 }); }
  const seatEl = i => document.querySelector('.seat2d[data-i="' + i + '"] .av');

  // ---- 2D: a revolver pressed against the shooter's temple while the trigger is pulled ----
  // The gun comes in from the table centre along the line to the avatar and its muzzle touches the head; it trembles with every beat, the hammer is cocked, then it
  // either fires (muzzle flash + recoil) or only clicks (tiny spark). 3D has its own revolver (S3D.pullStart), so this is only used in the 2D view.
  const GUN_SVG = '<svg viewBox="0 0 230 120" width="230" height="120" aria-hidden="true"><g stroke="#2a1a14" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">' +
    '<path d="M40 62 L64 62 L60 110 Q52 117 36 113 Q22 109 24 95 Z" fill="#a0602f"/><circle cx="43" cy="86" r="3.2" fill="#e8c27a" stroke="none"/>' +
    '<path d="M66 68 Q70 92 92 88 L98 68" fill="none"/>' +
    '<rect x="100" y="36" width="126" height="18" rx="5" fill="#a9bcc4"/><rect x="108" y="54" width="82" height="9" rx="3" fill="#7f949c"/><path d="M212 36 L214 28 L222 28 L222 36 Z" fill="#7f949c"/>' +
    '<rect x="40" y="30" width="76" height="38" rx="9" fill="#8aa0a8"/><rect x="60" y="25" width="42" height="46" rx="9" fill="#c4d3d8"/>' +
    '<path d="M72 30 L72 66 M82 28 L82 68 M92 30 L92 66" stroke-width="3" fill="none" opacity=".55"/>' +
    '<rect x="75" y="62" width="9" height="14" rx="2" fill="#5b6d74"/>' +
    '<path class="hammer" d="M44 30 L33 15 L50 11 L58 30 Z" fill="#6c7f87"/></g>' +
    '<circle class="spark" cx="50" cy="31" r="9" fill="#fff6c9"/>' +
    '<g class="flash"><path d="M226 45 L252 28 L242 45 L260 52 L240 55 L248 72 L230 59 L224 76 L220 57 L204 64 L216 49 L202 40 L222 42 Z" fill="#ffd166" stroke="#ff7a2e" stroke-width="4" stroke-linejoin="round"/></g></svg>';
  function gun2dClear() { document.querySelectorAll('.gun2d').forEach(el => el.remove()); }
  function gun2dAim(i) {
    gun2dClear(); const av = seatEl(i); if (!av || !av.animate) return null;
    const r = av.getBoundingClientRect(), tb = ($('table2d') || document.body).getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, mx = tb.left + tb.width / 2, my = tb.top + tb.height / 2;
    let dx = cx - mx, dy = cy - my; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;                    // from the table centre towards the avatar
    const ang = Math.atan2(dy, dx), sx = Math.max(.4, Math.min(.62, innerWidth / 1900 + .22)), flip = Math.cos(ang) < 0 ? -1 : 1;
    const tx = cx - dx * r.width * .3, ty = cy - dy * r.width * .3 - 3;                                      // muzzle on the side of the head that faces the gun
    const el = document.createElement('div'); el.className = 'gun2d'; el.style.transform = 'translate(' + tx + 'px,' + ty + 'px) rotate(' + ang + 'rad) scale(' + sx + ',' + sx * flip + ') translate(-226px,-45px)';
    el.innerHTML = '<div class="g2in">' + GUN_SVG + '</div>'; document.body.appendChild(el);
    const inn = el.querySelector('.g2in'), svg = el.querySelector('svg'), ham = el.querySelector('.hammer'), fl = el.querySelector('.flash'), sp = el.querySelector('.spark');
    inn.animate([{ transform: 'translateX(-90px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'forwards' });
    return {
      beat(k) {
        if (k === 0) ham.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-38deg)' }], { duration: 140, fill: 'forwards' });
        if (!reduce()) svg.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-1.6px,1.2px)' }, { transform: 'translate(1.4px,-1.6px)' }, { transform: 'translate(-1px,-1px)' }, { transform: 'translate(0,0)' }], { duration: 480 });
      },
      fire(dead) {
        ham.animate([{ transform: 'rotate(-38deg)' }, { transform: 'rotate(0deg)' }], { duration: 70, fill: 'forwards' });
        if (dead) {
          fl.animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.25)', offset: .35 }, { opacity: 0, transform: 'scale(1.5)' }], { duration: 260 });
          inn.animate([{ transform: 'translateX(0) rotate(0deg)' }, { transform: 'translateX(-30px) rotate(-12deg)' }, { transform: 'translateX(-14px) rotate(-5deg)' }], { duration: 420, fill: 'forwards', easing: 'ease-out' });
        } else {
          sp.animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.3)', offset: .4 }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 220 });
          inn.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(0)' }], { duration: 200, fill: 'forwards' });
        }
      },
      leave() { inn.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(-90px)' }], { duration: 300, fill: 'forwards' }); setTimeout(() => el.remove(), 330); }
    };
  }

  async function animate(g, before) { for (const e of g.ev) await playEv(e, g, before); say(''); }
  // 2D: the played cards are thrown from the player's seat onto the pile in the middle of the table
  async function flyCards(by, n) {
    const src = document.querySelector('.seat2d[data-i="' + by + '"]'), dst = $('center'); if (!src || !dst || reduce()) { await sleep(300); return; }
    const a = src.getBoundingClientRect(), b = (dst.querySelector('.pile') || dst).getBoundingClientRect(), sx = a.left + a.width / 2, sy = a.top + a.height / 2, ex = b.left + b.width / 2, ey = b.top + b.height / 2, els = [];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i'); c.className = 'flycard'; c.style.left = (sx - 18) + 'px'; c.style.top = (sy - 25) + 'px'; $('fx').appendChild(c); els.push(c);
      c.animate([{ transform: 'translate(0,0) rotate(0deg) scale(1.1)', opacity: 1 }, { transform: 'translate(' + (ex - sx) * .55 + 'px,' + ((ey - sy) * .55 - 50) + 'px) rotate(' + (200 + i * 40) + 'deg) scale(1.25)', opacity: 1, offset: .55 }, { transform: 'translate(' + (ex - sx + (i - (n - 1) / 2) * 10) + 'px,' + (ey - sy) + 'px) rotate(' + (360 + i * 25) + 'deg) scale(1)', opacity: 1 }], { duration: 520 + i * 70, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards', delay: i * 70 });
    }
    await sleep(520 + n * 70); Snd.play('card'); els.forEach(c => c.remove());
  }
  async function playEv(e, g, before) {
    const nm = i => esc(g.names[i]);
    switch (e.t) {
      case 'round': {
        U.sel.clear(); U.claim = ''; U.view = Object.assign({}, g); renderGame(g); Snd.play('load'); say(t('roundN', { n: e.n }), 'warn', t('tableCard') + ': ' + esc(t('cardName')[e.target]) + (e.devil ? ' · 😈' : ''));
        if (U.d3) await S3().deal(g); else await sleep(900); await sleep(reduce() ? 100 : 450); say(''); break;
      }
      case 'play': {
        U.claim = t('claims', { n: nm(e.by), k: e.n, c: t('cardName')[g.target] }).replace(/<[^>]+>/g, ''); Snd.play('card'); bubble(e.by, t('claims', { n: '', k: e.n, c: t('cardShort')[g.target] }).trim(), 1600); setExpr(e.by, 'smug', 900);
        if (U.d3) await S3().playCards(e.by, e.ids, e.n, !U.spec && e.by === U.me); else await flyCards(e.by, e.n); const c = $('center'); if (c) { const cl = c.querySelector('.claim-big'); if (cl) cl.textContent = U.claim; } await sleep(260); break;
      }
      case 'talk': showTalk(e, g); break;       // never waits: the buttons stay usable while a bot talks
      case 'call': {
        if (e.auto) { say(t('autoReveal', { n: nm(e.acc) }), 'warn'); setExpr(e.acc, 'scared', 2000); await sleep(900); }
        else {
        Snd.play('liar'); Snd.shout(VOICE[g.chars[e.by]] || 1); say(t('calls', { n: nm(e.by) }), 'bad'); bubble(e.by, t('liar'), 1800); setExpr(e.by, 'smug', 1500); setExpr(e.acc, 'scared', 2600); flashScreen('#ff4d6d'); shake();
        if (U.d3) await S3().shout(e.by, e.acc); else await sleep(1100); }
        say(t('reveal', { n: nm(e.acc) }), 'warn'); Snd.play('flip');
        const row = '<div class="reveal-row">' + e.cards.map(c => '<img src="' + curl(c.k) + '" alt="' + c.k + '">').join('') + '</div>';
        if (!U.d3) { $('center').innerHTML = '<div class="claim-big">' + esc(t('reveal', { n: g.names[e.acc] })) + '</div>' + row; }
        if (U.d3) await S3().reveal(e.acc, e.cards); else await sleep(1500);
        if (U.d3 && e.shooters && e.shooters.length) S3().passGun(e.shooters[0]);   // shared revolver: it only slides to the shooter once the verdict (truth / lie) is announced
        if (e.devil) { Snd.play('devil'); say(t('devilT', { n: nm(e.acc) }), 'bad'); flashScreen('#7a0a22'); shake(); setExpr(e.acc, 'hurt', 1800); await sleep(1500); }
        else { say(e.honest ? (e.auto ? t('autoSafe', { n: nm(e.acc) }) : tr('honestT', { n: nm(e.acc), m: nm(e.loser) })) : tr('liarT', { n: nm(e.acc) }), e.honest ? 'good' : 'bad'); setExpr(e.acc, e.honest ? 'smug' : 'hurt', 1600); if (e.honest && !e.auto) setExpr(e.by, 'scared', 1600); await sleep(e.auto && e.honest ? 1700 : 1300); }
        if (U.d3 && !(e.shooters && e.shooters.length)) S3().unfocus();       // nobody shoots: give the camera back now
        break;
      }
      case 'pull': {
        say(tr('pullT', { n: nm(e.p) }), 'warn'); setExpr(e.p, 'scared', 3000); Snd.play('aim'); const beats = e.dead ? 3 : 2 + (e.pos >= 3 ? 1 : 0), G2 = U.d3 ? null : gun2dAim(e.p);
        if (U.d3) await S3().pullStart(e.p, beats); else for (let i = 0; i < beats; i++) { Snd.play('beat'); if (G2) G2.beat(i); await sleep(520); }
        if (e.dead) {
          Snd.play('live'); Snd.duck(1600); flashScreen('#ff4d6d'); shake(); say(tr('bang'), 'bad', tr('dead', { n: nm(e.p) })); setExpr(e.p, 'dead'); Fx.blood(seatEl(e.p)); if (G2) G2.fire(true); setTimeout(() => Snd.play('hurt'), 140); floatAt(e.p, '☠', '#ff4d6d');
          if (U.d3) await S3().pullEnd(e.p, true); else await sleep(1500); if (G2) G2.leave();
          if (e.reload) say(t('reloaded'), 'warn');
        } else {
          Snd.play('blank'); say(tr('click'), 'good', tr('safe', { n: nm(e.p), a: e.pos + 1 })); setExpr(e.p, 'laugh', 1400); Fx.smoke(seatEl(e.p)); if (G2) G2.fire(false);
          if (U.d3) await S3().pullEnd(e.p, false); else await sleep(1000); if (G2) G2.leave();
        }
        if (U.d3 && e.next >= 0) S3().passGun(e.next);
        U.view.alive = g.alive.slice(); break;
      }
      case 'over': { Snd.play(e.w === U.me ? 'win' : 'lose'); if (e.w === U.me && !U.spec) Fx.confetti(); say(tr('winner', { n: nm(e.w) }), 'good'); await sleep(1200); break; }
    }
  }

  // ---------------------------------------------------------------- actions ----
  async function doPlay() {
    const g = U.view, ids = [...U.sel]; if (!g || U.busy || U.pending || !Sus.legalPlay(g, U.me, ids)) return; Snd.unlock(); U.pending = true; U.sel.clear(); renderControls(g);
    const ok = await Net.act({ t: 'play', ids }); if (!ok) { U.pending = false; renderControls(g); }
  }
  async function doCall() { const g = U.view; if (!g || U.busy || U.pending || !Sus.canCall(g, U.me)) return; Snd.unlock(); U.pending = true; renderControls(g); const ok = await Net.act({ t: 'call' }); if (!ok) { U.pending = false; renderControls(g); } }
  async function doPull() { const g = U.view; if (!g || U.busy || U.pending || g.phase !== 'trigger' || g.shooters[g.sidx] !== U.me) return; Snd.unlock(); U.pending = true; renderControls(g); const ok = await Net.act({ t: 'pull' }); if (!ok) { U.pending = false; renderControls(g); } }
  function toggleCard(id) {
    const g = U.view; if (!g || U.spec || U.busy || U.pending || g.phase !== 'play' || g.turn !== U.me || Sus.mustCall(g, U.me)) { if (g && g.turn !== U.me) toast(t('turnOf', { n: g.names[g.turn] })); return; }
    if (U.sel.has(id)) U.sel.delete(id); else { if (U.sel.size >= 3) return; U.sel.add(id); } Snd.play('select'); renderControls(g);
  }
  function onPick3(p) {
    const g = U.view; if (!g || U.spec) return; Snd.unlock();
    if (p.type === 'card') toggleCard(p.id);
    else if (p.type === 'table') { const now = Date.now(); if (now - (U.lastTable || 0) < 450) { U.lastTable = 0; doSlam(); } else U.lastTable = now; }
    else if (p.type === 'player') { if (p.seat !== U.me) doPoint(p.seat); }
    else if (p.type === 'gun') { if (p.touch) { showGun(p.p, p.x, p.y, true); } else if (p.p === U.me || (U.view && U.view.opts.shared)) doPull(); }
  }
  const VOICE = { pig: 1.15, fox: 1.25, dog: .95, goat: 1.35, octo: .8, penguin: 1.2, hawk: 1.1, turtle: .7 };
  async function doSlam() { if (!U.d3 || U.busy || U.pending || U.spec) return; const ok = await S3().slam(U.me); if (ok) Net.emote('slam'); }
  async function doPoint(i) { if (!U.d3 || U.busy || U.pending || U.spec) return; const ok = await S3().point(U.me, i); if (ok) Net.emote('point' + i); }
  const EM = { laugh: ['laugh', '😂'], angry: ['hurt', '😠'], sus: ['smug', '🤨'], sweat: ['scared', '😰'] };
  function showEmote(i, kind) { if (i < 0) return; if (kind === 'slam') { if (U.d3 && !U.busy) S3().slam(i); return; } if (/^point\d+$/.test(kind)) { if (U.d3 && !U.busy) S3().point(i, +kind.slice(5)); return; } if (!EM[kind]) return; bubble(i, t('emotes')[kind] || kind, 1800); setExpr(i, EM[kind][0], 1800); Snd.play('select'); }
  function doEmote(kind) { const g = U.view; if (!g || U.spec) return; showEmote(U.me, kind); Net.emote(kind); }

  // bots (local), dropped players (host), and a safety pull for a human who dithers
  function afterIdle() {
    clearTimeout(U.botT); const g = U.view; if (!g || U.busy || U.queue.length) return;
    if (g.phase === 'over') { showOver(g); return; }
    const a = Sus.actor(g); if (a < 0) return; const isMe = !U.spec && a === U.me, key = g.seatKeys[a], room = Net.room();
    chatSoon(g, a);
    if (Net.mode() === 'local' && !isMe) { U.botT = setTimeout(() => botMove(a), 900 + Math.random() * 900); return; }
    if (Net.mode() === 'online' && !isMe && room && Net.isHost(room) && room.seats[key] && room.seats[key].bot) { U.botT = setTimeout(() => botMove(a), 1000 + Math.random() * 900); return; }
    if (Net.mode() === 'online' && !isMe && room && Net.isHost(room) && room.seats[key] && room.seats[key].connected === false) { U.botT = setTimeout(() => botMove(a), 4500); return; }
    if (isMe && g.phase === 'trigger') U.botT = setTimeout(() => { if (U.view === g && !U.busy) doPull(); }, 14000);
  }
  // hard bots may comment on the play that was just made before the next player decides (host only, so every write to the table comes from one client; at most one comment per play)
  function chatSoon(g, a) {
    clearTimeout(U.talkT); const room = Net.room(), online = Net.mode() === 'online';
    if (!Sus.canTalk(g) || g.phase !== 'play' || !g.last || (g.talk || []).some(x => x.at === g.plays.length) || (online && !(room && Net.isHost(room)))) return;
    const bots = Sus.aliveList(g).filter(c => c !== g.last.by && c !== a && (online ? !!(room.seats[g.seatKeys[c]] || {}).bot : c !== U.me)); if (!bots.length) return;
    U.talkT = setTimeout(() => { const v = U.view; if (!v || U.busy || U.queue.length || v.seq !== g.seq) return; const c = bots[Math.floor(Math.random() * bots.length)], act = Sus.botTalk(Net.authG() || v, c); if (act) Net.act(act, c); }, 450 + Math.random() * 500);
  }
  function botMove(a) { if (U.busy || U.queue.length || !U.view) return; const g = Net.authG() || U.view; if (Sus.actor(g) !== a || g.seq !== U.view.seq) return; Net.act(Sus.bot(g, a), a); }       // sealed room: the host's bots play from the full state, not from the host's own view
  function showOver(g) {
    if (U.shownOver === g.id) return; U.shownOver = g.id; const win = g.winner === U.me && !U.spec; const host = Net.isHost(Net.room());
    setTimeout(() => modal('<h2 class="center">' + (U.spec ? tr('winner', { n: esc(g.names[g.winner]) }) : win ? t('youWin') : t('youLose')) + '</h2><div class="center" style="width:90px;margin:0 auto">' + Art.avatar(g.chars[g.winner], 'laugh') + '</div><p class="center">' + tr('winner', { n: esc(g.names[g.winner]) }) + '</p>' +
      (host ? '<button type="button" class="btn btn-block" id="m-again">' + t('rematch') + '</button>' : '<p class="muted center small">' + t('waitHost') + '</p>') + '<button type="button" class="btn btn-secondary btn-block" id="m-lobby">' + t('toLobby') + '</button>'), 600);
    setTimeout(() => { const a = $('m-again'), l = $('m-lobby'); if (a) a.onclick = () => { closeModal(); Net.rematch(); }; if (l) l.onclick = leaveToLobby; }, 700);
  }
  function helpModal() { modal('<h2>' + t('helpT') + '</h2><ul class="help-list">' + t('helpB').map(x => '<li>' + esc(x) + '</li>').join('') + '</ul><div class="reveal-row">' + ['A', 'K', 'Q', 'J', 'D'].map(k => '<img src="' + curl(k) + '" alt="' + k + '">').join('') + '</div><button type="button" class="btn btn-block" id="m-ok">' + t('ok') + '</button>', true); $('m-ok').onclick = closeModal; }
  // ask before leaving the room/table (skipped when the game is already over). The popup stays open while the game moves on; its text follows the situation.
  const leaveText = () => t(U.screen === 'game' && U.view && U.view.phase !== 'over' ? 'leaveQPlaying' : 'leaveQWaiting');
  function refreshLeave() { const x = $('m-leave-txt'); if (x) x.textContent = leaveText(); }
  function askLeave() {
    if (U.screen === 'game' && U.view && U.view.phase === 'over') return leaveToLobby();
    if (leaveOpen()) return;
    modal('<h3>' + t('leaveQ') + '</h3><p class="muted center" id="m-leave-txt">' + leaveText() + '</p><button type="button" class="btn btn-block" id="m-stay">' + t('leaveStay') + '</button><button type="button" class="btn btn-secondary btn-block" id="m-leave-yes">' + t('leaveYes') + '</button>');
    const st = $('m-stay'), ye = $('m-leave-yes'); if (st) { st.onclick = closeModal; st.focus(); } if (ye) ye.onclick = leaveToLobby;
  }
  async function leaveToLobby() { clearTimeout(U.botT); clearTimeout(U.talkT); U.view = null; U.queue = []; U.busy = false; closeModal(); await Net.leave(); document.body.classList.remove('tense'); Snd.setTension(0); showLobby(); }

  // ---- revolver info: hover the gun (or its seat chip); tap on touch screens ----
  function showGun(p, x, y, sticky) {
    const g = U.view; if (!g || p < 0 || p >= g.n || (!g.opts.shared && (U.spec || p !== U.me))) return; /* own revolver only (the shared one is public) */ const gn = Sus.gunOf(g, p), rem = Math.max(0, Sus.CH - gn.pos), risk = (g.opts.shared ? g.alive.some(Boolean) : g.alive[p]) ? Math.round(100 / Math.max(1, rem)) : 0;   /* the shared gun is always live, even if the seat it is filed under is dead */ let d = '';
    for (let k = 0; k < Sus.CH; k++) d += '<i class="' + (k < gn.pos ? 'used' : '') + '"></i>';
    const canPull = sticky && !U.spec && (g.opts.shared || p === U.me) && g.phase === 'trigger' && g.shooters[g.sidx] === U.me;
    const el = $('gunpanel'); el.innerHTML = '<b>' + esc((g.opts.shared ? t('gunShared') : t('gunT', { n: g.names[p] }))) + '</b><div class="gp-ch">' + d + '</div><div>' + t('gunL', { r: rem }) + '</div><div>' + t('gunUsed', { a: gn.pos }) + '</div><div class="gp-risk">' + t('gunRisk', { p: risk }) + '</div>' + (canPull ? '<button type="button" class="btn btn-pull" id="gp-pull">' + t('gunPull') + '</button>' : '') + (sticky ? '<button type="button" class="btn btn-secondary" id="gp-close">' + t('gunClose') + '</button>' : '');
    el.classList.add('on'); U.gunSticky = !!sticky; const w = 190, h = el.offsetHeight || 120; el.style.left = clampN((x == null ? innerWidth / 2 : x) + 18, 6, innerWidth - w - 6) + 'px'; el.style.top = clampN((y == null ? innerHeight / 2 : y) - h / 2, 56, innerHeight - h - 6) + 'px';
    const pb = $('gp-pull'); if (pb) pb.onclick = () => { hideGun(true); doPull(); }; const cb = $('gp-close'); if (cb) cb.onclick = () => hideGun(true);
  }
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  function hideGun(force) { if (U.gunSticky && !force) return; U.gunSticky = false; $('gunpanel').classList.remove('on'); }
  function wire() {
    langSelects(); document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => { if (b.disabled) return; document.querySelectorAll('.tab-btn').forEach(x => x.classList.toggle('active', x === b)); document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab)); });
    $('btn-start-offline').onclick = () => { const n = needName(); if (!n) return; Snd.unlock(); Net.startLocal(n, U.settings, U.myChar); };
    $('btn-resume').onclick = () => { Snd.unlock(); Net.restoreLocal(); };
    $('btn-create-room').onclick = async () => { const n = needName(); if (!n) return; try { await Net.createOnline(n, U.myChar); } catch (e) { toast(t('onlineOff')); } };
    $('btn-join-room').onclick = async () => { const n = needName(); if (!n) return; const code = $('input-room-code').value.trim(); if (code.length < 4) return; const r = await Net.joinOnline(code, n, U.myChar).catch(() => ({ ok: false, reason: 'noRoom' })); if (!r.ok) toast(tr('noRoom')); else if (r.spectator) toast(t('youAreSpec')); };
    $('btn-start-game').onclick = () => { Snd.unlock(); Net.startOnline(); }; $('btn-leave-waiting').onclick = askLeave; $('btn-leave-game').onclick = askLeave;
    $('room-code-box').onclick = () => { const u = location.origin + location.pathname + '?room=' + Net.code(); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast(t('copied'))).catch(() => {}); };
    $('seats').addEventListener('mouseover', e => { const el = e.target.closest('.seat2d'); if (!el || !U.view || e.pointerType === 'touch' || U.view.opts.shared || +el.dataset.i !== U.me) return; const r = el.getBoundingClientRect(); showGun(+el.dataset.i, r.right, r.top + r.height / 2); });
    $('seats').addEventListener('mouseleave', () => hideGun()); $('seats').addEventListener('click', e => { const el = e.target.closest('.seat2d'); if (!el || !U.view || U.view.opts.shared || +el.dataset.i !== U.me) return; const r = el.getBoundingClientRect(); showGun(+el.dataset.i, r.right, r.top + r.height / 2, true); });
    document.addEventListener('pointerdown', e => { if (U.gunSticky && !e.target.closest('#gunpanel') && !e.target.closest('.seat2d')) hideGun(true); });
    $('btn-rules').onclick = helpModal; $('btn-play').onclick = doPlay; $('btn-liar').onclick = doCall; $('btn-pull').onclick = doPull;
    $('hand').onclick = e => { const c = e.target.closest('.card'); if (c) toggleCard(+c.dataset.id); };
    $('emote-bar').onclick = e => { const b = e.target.closest('button'); if (b) doEmote(b.dataset.e); };
    $('cam-bar').onclick = e => { const b = e.target.closest('button'); if (!b || !U.view) return; const c = b.dataset.cam; U.cam = c === 'side' ? 'side' : 'pov'; if (c !== 'side') U.camSeat = +c; renderGame(U.view); };
    $('btn-music').onclick = () => { Snd.unlock(); Snd.musicToggle(); applyLang(); }; $('btn-sound').onclick = () => { Snd.toggle(); applyLang(); };
    $('btn-3d').onclick = () => { if (!U.d3 && !U.can3d) { toast(no3dReason()); return; } try { localStorage.setItem('sus_3d', U.d3 ? '0' : '1'); } catch (e) {} location.reload(); };
    document.addEventListener('keydown', e => { if ($('modal').firstChild) { if (e.key === 'Escape' && $('m-stay')) closeModal(); return; } if (U.screen !== 'game' || e.target.tagName === 'INPUT') return; if (e.key === 'Enter') doPlay(); else if (e.key.toLowerCase() === 'l') doCall(); else if (e.key.toLowerCase() === 'p' || e.key === ' ') doPull(); else if (e.key === 'Escape') { U.sel.clear(); if (U.view) renderControls(U.view); } });
    document.addEventListener('pointerdown', () => Snd.unlock(), { once: true });
  }
  const no3dReason = () => { const e = window.S3D_ERR || (window.S3D && S3D.err && S3D.err()); return t('no3d') + (e ? ' (' + e + ')' : ''); };

  async function boot() {
    Fx.init(); document.body.insertAdjacentHTML('afterbegin', Art.sprite()); $('bg').innerHTML = Art.scene();
    try { document.documentElement.style.setProperty('--back', 'url(' + Art.cardURL('back') + ')'); } catch (e) {}
    try { U.d3 = localStorage.getItem('sus_3d') !== '0' && !!window.S3D && S3D.init($('r3d-wrap')); } catch (e) { U.d3 = false; }
    U.can3d = !!window.S3D && (U.d3 || S3D.init($('r3d-wrap'))); if (U.d3) { S3().onPick(onPick3); S3().onHover(h => { if (h && h.type === 'gun') showGun(h.p, h.x, h.y); else hideGun(); }); S3().start(); }
    wire(); Net.onChange(onRoom); applyLang();
    const q = new URLSearchParams(location.search).get('room'); const last = Net.lastRoom();
    if (q) { showLobby(); $('tab-btn-join').click(); $('input-room-code').value = q.toUpperCase(); return; }
    // refresh while seated at a table / in a running game: keep the loading screen up (never flash the lobby) and go straight back to that state
    if (Net.hasLocal() && Net.restoreLocal()) return;
    if (last && Net.ONLINE_OK) {
      let c = null; try { c = await Promise.race([Net.tryRejoin(last), new Promise(res => setTimeout(() => res(null), 7000))]); } catch (e) { c = null; }
      if (c) return;                                   // onRoom() shows the waiting room / the game as soon as the room data arrives
    }
    showLobby();
  }
  // the module script (3D) loads deferred: wait for it (or its failure) before booting
  function ready() { if (window.S3D || window.S3D_ERR || document.readyState === 'complete') boot(); else setTimeout(ready, 40); }
  window.addEventListener('load', () => setTimeout(ready, 60));
})();
