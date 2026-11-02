// sus-art.js — every picture is code. Brushy style: flat polygons pushed through an SVG displacement filter (wobbly edges) plus a "scratch" filter
// that eats dry-brush streaks out of fills and lettering. Animal faces (SVG, also used as 3D face textures), card faces (canvas, hand-drawn glyphs
// with scratches — a custom letter set, no font needed), the tavern sign and the bar scene behind the game.
const Art = (function () {
  'use strict';
  const ng = (cx, cy, r, n, rot, sx) => Array.from({ length: n }, (_, i) => { const a = ((rot || 0) + i * 360 / n - 90) * Math.PI / 180; return (cx + r * (sx || 1) * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1); }).join(' ');
  const P = (pts, fill, ex) => '<polygon points="' + pts + '" fill="' + fill + '"' + (ex ? ' ' + ex : '') + '/>';
  const INK = '#2a1a14';
  const FILTERS = '<filter id="rough" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4"/></filter>' +
    '<filter id="scratch" x="-6%" y="-12%" width="112%" height="124%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.75" numOctaves="2" seed="3" result="s"/><feColorMatrix in="s" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -10 7.1" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in" result="c"/><feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" seed="8" result="d"/><feDisplacementMap in="c" in2="d" scale="3"/></filter>';
  const defs = () => '<defs>' + FILTERS + '</defs>';
  function sprite() { return '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">' + defs() + '</svg>'; }

  // ---------------------------------------------------------------- animals ----
  const CH = {
    pig:  { name: 'pig',  skin: '#f4a6b8', dark: '#d9788f', ey: 48, ex: 15, my: 87, col: '#f4a6b8' },
    fox:  { name: 'fox',  skin: '#f08a3c', dark: '#b85a1c', ey: 46, ex: 16, my: 84, col: '#f08a3c' },
    dog:  { name: 'dog',  skin: '#c99a62', dark: '#7b4b26', ey: 46, ex: 16, my: 84, col: '#c99a62' },
    goat: { name: 'goat', skin: '#efe8d8', dark: '#b9ab86', ey: 44, ex: 17, my: 88, col: '#efe8d8' },
    octo: { name: 'octo', skin: '#9a6bd6', dark: '#6a3fa8', ey: 50, ex: 17, my: 68, col: '#9a6bd6' },
    penguin: { name: 'penguin', skin: '#34415c', dark: '#1f2a40', ey: 44, ex: 14, my: 86, col: '#34415c' },
    hawk: { name: 'hawk', skin: '#8a5a32', dark: '#5c3a1e', ey: 44, ex: 15, my: 86, col: '#8a5a32' },
    turtle: { name: 'turtle', skin: '#6fbf73', dark: '#3f8a4a', ey: 52, ex: 15, my: 82, col: '#6fbf73' }
  };
  function body(c) {
    const k = CH[c] || CH.pig, S = k.skin, D = k.dark;
    switch (c) {
      case 'fox': return P('10,6 38,30 16,46', S) + P('90,6 62,30 84,46', S) + P('14,12 32,30 20,40', D) + P('86,12 68,30 80,40', D) + P('12,40 50,26 88,40 80,72 50,92 20,72', S) + P('12,40 34,60 20,72', '#fff3e0') + P('88,40 66,60 80,72', '#fff3e0') + P('34,62 50,54 66,62 58,86 50,92 42,86', '#fff3e0') + P('44,78 56,78 50,86', INK);
      case 'dog': return P('6,24 30,22 34,66 12,70', D) + P('94,24 70,22 66,66 88,70', D) + P(ng(50, 52, 34, 10), S) + P('22,36 40,38 34,52 20,52', D, 'opacity=".7"') + P('36,58 64,58 68,76 50,86 32,76', '#f1dcb8') + P('43,64 57,64 50,73', INK);
      case 'goat': return P('28,28 14,4 30,8 42,26', '#c9b27a') + P('72,28 86,4 70,8 58,26', '#c9b27a') + P('4,40 28,36 26,50', S) + P('96,40 72,36 74,50', S) + P('28,24 72,24 78,62 64,90 36,90 22,62', S) + P('44,88 56,88 50,102', D) + P('36,66 64,66 62,86 38,86', '#d8cba8') + P('44,72 48,72 48,76 44,76', INK) + P('52,72 56,72 56,76 52,76', INK);
      case 'octo': return [14, 30, 46, 62, 78].map((x, i) => P(x + ',70 ' + (x + 14) + ',70 ' + (x + 16 + (i % 2 ? 6 : -4)) + ',96 ' + (x + 8) + ',100 ' + (x + (i % 2 ? -4 : 6)) + ',88', D)).join('') + P('10,58 18,26 50,8 82,26 90,58 80,78 20,78', S) + P(ng(34, 26, 5, 7), '#c3a1f0') + P(ng(66, 20, 4, 7), '#c3a1f0') + P(ng(52, 34, 3, 6), '#c3a1f0');
      case 'penguin': return P(ng(50, 52, 36, 10), S) + P('26,46 50,38 74,46 70,74 50,86 30,74', '#f6f0e2') + P('42,60 58,60 50,74', '#ff9a2e') + P('10,60 22,50 22,70', D) + P('90,60 78,50 78,70', D);
      case 'hawk': return P('18,26 40,40 20,52', D) + P('82,26 60,40 80,52', D) + P(ng(50, 52, 34, 10), S) + P('24,40 76,40 72,60 28,60', '#efe0c0') + P('18,30 48,42 46,47 22,38', D) + P('82,30 52,42 54,47 78,38', D) + P('42,58 58,58 56,72 50,82 46,72', '#f2c23a') + P('50,82 46,72 56,72', '#b88a10');
      case 'turtle': return P('10,44 18,12 50,2 82,12 90,44', D) + P('26,14 50,8 40,30', 'rgba(255,255,255,.18)') + P('60,10 74,18 62,34', 'rgba(255,255,255,.18)') + P(ng(50, 56, 32, 10), S) + P('30,74 70,74 66,86 34,86', D) + P(ng(30, 66, 4, 6), D) + P(ng(70, 66, 4, 6), D);
      default: return P('12,22 38,18 34,42', D) + P('88,22 62,18 66,42', D) + P(ng(50, 52, 35, 9), S) + P('34,58 66,58 70,70 62,80 38,80 30,70', D) + P(ng(42, 69, 4, 6), INK) + P(ng(58, 69, 4, 6), INK);
    }
  }
  const L = (pts, w) => '<polyline points="' + pts + '" fill="none" stroke="' + INK + '" stroke-width="' + (w || 3.6) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  const eyeAt = (c, x, y, e, sg) => {
    const k = CH[c] || CH.pig, wr = c === 'octo' ? 9 : 7.6, pup = c === 'goat' ? P(x - 5 + ',' + (y - 1.5) + ' ' + (x + 5) + ',' + (y - 1.5) + ' ' + (x + 5) + ',' + (y + 1.5) + ' ' + (x - 5) + ',' + (y + 1.5), INK) : P(ng(x, y + 1, c === 'octo' ? 4.6 : 3.8, 8), INK);
    const wh = c === 'goat' ? '#f3e08a' : '#fffdf5';
    switch (e) {
      case 'scared': return P(ng(x, y, wr + 2.6, 10), '#fffdf5') + P(ng(x, y, 2.4, 6), INK);
      case 'hurt': return L((x - 6) + ',' + (y - 5) + ' ' + (x + 5) + ',' + y + ' ' + (x - 6) + ',' + (y + 5), 4);
      case 'laugh': return L((x - 7) + ',' + (y + 3) + ' ' + x + ',' + (y - 5) + ' ' + (x + 7) + ',' + (y + 3), 4);
      case 'dead': return L((x - 6) + ',' + (y - 6) + ' ' + (x + 6) + ',' + (y + 6), 4) + L((x + 6) + ',' + (y - 6) + ' ' + (x - 6) + ',' + (y + 6), 4);
      case 'smug': return P(ng(x, y, wr, 10), wh) + pup + P((x - wr - 1) + ',' + (y - wr - 1) + ' ' + (x + wr + 1) + ',' + (y - wr - 1) + ' ' + (x + wr + 1) + ',' + (y - 1) + ' ' + (x - wr - 1) + ',' + (y - 1), k.skin) + L((x - 8) + ',' + (y - 1) + ' ' + (x + 8) + ',' + (y - 1), 3);
      default: return P(ng(x, y, wr, 10), wh) + pup;
    }
  }
  // eyes + brows + mouth only (transparent) — the 3D heads wear this as a texture on their front plane
  function faceParts(c, e) {
    const k = CH[c] || CH.pig, ey = k.ey, ex = k.ex, my = k.my; e = e || 'neutral'; let o = '';
    o += eyeAt(c, 50 - ex, ey, e) + eyeAt(c, 50 + ex, ey, e);
    const by = ey - 12; // brows
    if (e === 'smug') o += L((50 - ex - 8) + ',' + (by + 1) + ' ' + (50 - ex + 7) + ',' + (by - 3)) + L((50 + ex - 7) + ',' + (by - 3) + ' ' + (50 + ex + 8) + ',' + (by + 1));
    else if (e === 'scared' || e === 'hurt') o += L((50 - ex - 7) + ',' + (by + 2) + ' ' + (50 - ex + 7) + ',' + (by - 3)) + L((50 + ex - 7) + ',' + (by - 3) + ' ' + (50 + ex + 7) + ',' + (by + 2));
    else o += L((50 - ex - 7) + ',' + by + ' ' + (50 - ex + 7) + ',' + (by - 1.5), 3) + L((50 + ex - 7) + ',' + (by - 1.5) + ' ' + (50 + ex + 7) + ',' + by, 3);
    if (e === 'laugh') o += P((50 - 9) + ',' + my + ' ' + (50 + 9) + ',' + my + ' ' + (50 + 6) + ',' + (my + 9) + ' ' + (50 - 6) + ',' + (my + 9), '#5a1220') + P(ng(50, my + 8, 3.4, 6), '#ff6a7d');
    else if (e === 'scared') o += P(ng(50, my + 3, 5, 8), '#5a1220');
    else if (e === 'hurt') o += L((50 - 8) + ',' + (my + 4) + ' ' + (50 - 3) + ',' + my + ' ' + (50 + 3) + ',' + (my + 4) + ' ' + (50 + 8) + ',' + my);
    else if (e === 'dead') o += L((50 - 8) + ',' + my + ' ' + (50 + 8) + ',' + my) + P((50 + 2) + ',' + my + ' ' + (50 + 9) + ',' + my + ' ' + (50 + 6) + ',' + (my + 10), '#ff6a7d');
    else if (e === 'smug') o += L((50 - 9) + ',' + (my + 2) + ' ' + (50 + 6) + ',' + (my + 2) + ' ' + (50 + 11) + ',' + (my - 3));
    else o += L((50 - 7) + ',' + my + ' ' + (50 + 7) + ',' + my);
    return o;
  }
  // brush strokes laid over a flat shape: a few translucent streaks following the same direction
  function strokes(seed, n) { let s = seed || 3; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; let o = ''; for (let i = 0; i < n; i++) { const x = 8 + r() * 70, y = 10 + r() * 80, l = 14 + r() * 30; o += '<polygon points="' + x + ',' + y + ' ' + (x + l) + ',' + (y - 3 - r() * 4) + ' ' + (x + l) + ',' + (y - 1) + ' ' + x + ',' + (y + 2.5) + '" fill="' + (r() > .5 ? 'rgba(255,255,255,.22)' : 'rgba(40,10,0,.14)') + '"/>'; } return o; }
  const face = (c, e) => '<svg viewBox="0 0 100 104" xmlns="http://www.w3.org/2000/svg">' + defs() + '<g filter="url(#rough)">' + body(c) + strokes((CH[c] || CH.pig).skin.length * 7 + c.length, 9) + '</g>' + faceParts(c, e) + '</svg>';
  const faceOnly = (c, e) => '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + defs() + faceParts(c, e) + '</svg>';
  const avatar = (c, e, ring) => '<svg viewBox="0 0 100 104" xmlns="http://www.w3.org/2000/svg">' + defs() + (ring ? '<polygon points="' + ng(50, 52, 50, 10) + '" fill="' + ring + '" opacity=".35"/>' : '') + '<g filter="url(#rough)">' + body(c) + strokes((CH[c] || CH.pig).skin.length * 7 + c.length, 9) + '</g>' + faceParts(c, e) + '</svg>';

  // ---------------------------------------------------------------- cards: custom hand-drawn glyphs + scratches (canvas) ----
  const KCOL = { A: '#c9432b', K: '#1f6f86', Q: '#8a3fa8', J: '#d99a1c', D: '#b1122f' };
  const cardCache = {}; let sr = 11; const rr = () => { sr = (sr * 16807) % 2147483647; return sr / 2147483647; };
  function glyph(g, k, cx, cy, s) {            // drawn with fat round strokes (units: s = half height)
    g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = s * .26; g.strokeStyle = KCOL[k]; g.fillStyle = KCOL[k]; g.beginPath();
    if (k === 'A') { g.moveTo(cx - s * .62, cy + s); g.lineTo(cx, cy - s); g.lineTo(cx + s * .62, cy + s); g.moveTo(cx - s * .3, cy + s * .35); g.lineTo(cx + s * .3, cy + s * .35); g.stroke(); }
    else if (k === 'K') { g.moveTo(cx - s * .55, cy - s); g.lineTo(cx - s * .55, cy + s); g.moveTo(cx + s * .6, cy - s); g.lineTo(cx - s * .5, cy + s * .05); g.lineTo(cx + s * .65, cy + s); g.stroke(); }
    else if (k === 'Q') { g.ellipse(cx, cy - s * .08, s * .62, s * .85, 0, 0, 7); g.moveTo(cx + s * .1, cy + s * .35); g.lineTo(cx + s * .7, cy + s * 1.05); g.stroke(); }
    else if (k === 'J') {                      // a jester: three-pointed cap with bells, grinning face, zigzag ruff
      const C = KCOL.J, bell = (x, y) => { g.beginPath(); g.arc(x, y, s * .15, 0, 7); g.fill(); };
      g.lineWidth = s * .15; g.beginPath(); g.moveTo(cx - s * .5, cy - s * .12);
      g.quadraticCurveTo(cx - s * .95, cy - s * .15, cx - s * .98, cy - s * .78); g.quadraticCurveTo(cx - s * .55, cy - s * .62, cx - s * .2, cy - s * .5);
      g.quadraticCurveTo(cx - s * .28, cy - s * 1.0, cx, cy - s * 1.08); g.quadraticCurveTo(cx + s * .28, cy - s * 1.0, cx + s * .2, cy - s * .5);
      g.quadraticCurveTo(cx + s * .55, cy - s * .62, cx + s * .98, cy - s * .78); g.quadraticCurveTo(cx + s * .95, cy - s * .15, cx + s * .5, cy - s * .12); g.stroke();
      bell(cx - s * .98, cy - s * .8); bell(cx, cy - s * 1.1); bell(cx + s * .98, cy - s * .8);
      g.beginPath(); g.moveTo(cx - s * .55, cy - s * .08); g.lineTo(cx + s * .55, cy - s * .08); g.stroke();                       // brim
      g.beginPath(); g.ellipse(cx, cy + s * .3, s * .48, s * .46, 0, 0, 7); g.stroke();                                          // face
      g.beginPath(); g.arc(cx - s * .18, cy + s * .2, s * .05, 0, 7); g.arc(cx + s * .18, cy + s * .2, s * .05, 0, 7); g.fill();  // eyes
      g.lineWidth = s * .1; g.beginPath(); g.arc(cx, cy + s * .34, s * .24, .15 * Math.PI, .85 * Math.PI); g.stroke();             // grin
      g.lineWidth = s * .13; g.beginPath(); g.moveTo(cx - s * .7, cy + s * .98); for (let i = 1; i <= 6; i++) g.lineTo(cx - s * .7 + i * s * .233, cy + s * (i % 2 ? .72 : .98)); g.stroke();   // ruff
    }
    else { g.moveTo(cx - s * .7, cy - s * .2); g.lineTo(cx - s * .55, cy - s * 1.05); g.lineTo(cx - s * .2, cy - s * .5); g.lineTo(cx + s * .2, cy - s * .5); g.lineTo(cx + s * .55, cy - s * 1.05); g.lineTo(cx + s * .7, cy - s * .2); g.lineTo(cx + s * .4, cy + s * .8); g.lineTo(cx, cy + s); g.lineTo(cx - s * .4, cy + s * .8); g.closePath(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(cx - s * .26, cy, s * .1, 0, 7); g.arc(cx + s * .26, cy, s * .1, 0, 7); g.fill(); }
  }
  function scratchLayer(g, W, H, n) { g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < n; i++) { const y = rr() * H, x = rr() * W, l = 20 + rr() * W * .5, a = (rr() - .5) * .18; g.lineWidth = .6 + rr() * 2.4; g.strokeStyle = 'rgba(0,0,0,' + (.4 + rr() * .6) + ')'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + Math.sin(a) * l); g.stroke(); } g.globalCompositeOperation = 'source-over'; }
  function cardCanvas(k) {
    if (cardCache[k]) return cardCache[k]; const W = 256, H = 358, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = k === 'D' ? '#f0d6cf' : '#f6f0e2'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(120,90,50,' + rr() * .07 + ')'; g.fillRect(rr() * W, rr() * H, 10 + rr() * 90, 1 + rr() * 2); }   // paper grain
    const ink = document.createElement('canvas'); ink.width = W; ink.height = H; const ig = ink.getContext('2d');
    ig.lineWidth = 9; ig.strokeStyle = KCOL[k]; ig.lineJoin = 'round'; ig.strokeRect(16, 16, W - 32, H - 32);
    glyph(ig, k, W / 2, H / 2 + 6, 82); const sm = ig; sm.save(); glyph(sm, k, 52, 56, 22); glyph(sm, k, W - 52, H - 56, 22); sm.restore();
    scratchLayer(ig, W, H, 90); g.drawImage(ink, 0, 0);
    const lab = { A: 'ACE', K: 'KING', Q: 'QUEEN', J: 'JOKER', D: 'DEVIL' }[k]; g.fillStyle = KCOL[k]; g.globalAlpha = .75; g.font = '700 22px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText(lab, W / 2, H - 30); g.globalAlpha = 1;
    return (cardCache[k] = c);
  }
  function backCanvas() {
    if (cardCache.back) return cardCache.back; const W = 256, H = 358, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#0f4252'; g.fillRect(0, 0, W, H); g.strokeStyle = '#e0b04a'; g.lineWidth = 8; g.strokeRect(14, 14, W - 28, H - 28); g.lineWidth = 3; g.strokeRect(28, 28, W - 56, H - 56);
    g.fillStyle = '#e0b04a'; g.beginPath(); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r = i % 2 ? 36 : 70; g.lineTo(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r); } g.closePath(); g.fill();
    g.fillStyle = '#ff6a4d'; g.beginPath(); g.arc(W / 2, H / 2, 20, 0, 7); g.fill(); g.fillStyle = '#0f4252'; g.font = '800 30px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('?', W / 2, H / 2 + 10);
    scratchLayer(g, W, H, 40); return (cardCache.back = c);
  }
  const cardURL = k => (k === 'back' ? backCanvas() : cardCanvas(k)).toDataURL('image/png');
  const cardImg = (k, cls) => '<img class="card-img ' + (cls || '') + '" alt="' + k + '" src="' + cardURL(k) + '">';

  // ---------------------------------------------------------------- logo + icons ----
  function logo() {
    return '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">' + defs() + '<g filter="url(#rough)">' + P(ng(60, 62, 52, 10), '#0f4252') + P(ng(60, 62, 44, 10), '#17596b', 'stroke="#e0b04a" stroke-width="4"') + '</g>' + face('fox', 'smug').replace(/<svg[^>]*>/, '<svg x="26" y="24" width="68" height="70" viewBox="0 0 100 104">') + '</svg>';
  }
  const ICON = { skull: '<polygon points="32,6 54,16 56,38 46,46 46,58 18,58 18,46 8,38 10,16" fill="#f6f0e2"/><polygon points="20,26 28,26 28,36 20,36" fill="#2a1a14"/><polygon points="36,26 44,26 44,36 36,36" fill="#2a1a14"/>', gun: '<polygon points="6,22 50,22 50,32 22,32 18,52 8,52 10,32 6,32" fill="#aebfc6"/><polygon points="46,18 58,18 58,36 46,36" fill="#4a5f6a"/>', crown: '<polygon points="6,44 10,16 24,30 32,10 40,30 54,16 58,44" fill="#ffb547"/>' };
  const icon = (k, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 64 64">' + ICON[k] + '</svg>';

  // ---------------------------------------------------------------- bar scene (background) ----
  function scene() {
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const COL = ['#ffb547', '#5eead4', '#ff8a6a', '#6cc4f5', '#f6f0e2', '#b39bff', '#7bd88f'];
    let o = '<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">';
    o += P('0,0 1600,0 1600,620 0,620', '#0a2c38');
    o += P('0,0 700,0 420,620 0,620', 'rgba(255,255,255,.035)') + P('900,0 1600,0 1600,620 1180,620', 'rgba(94,234,212,.05)') + P('560,0 900,0 1060,620 640,620', 'rgba(0,0,0,.12)') + P('0,320 1600,180 1600,260 0,420', 'rgba(255,106,77,.045)');
    [[110, 320], [930, 320]].forEach(([x0, y0]) => {
      for (const row of [0, 1]) {
        const y = y0 + row * 150; let x = x0 + 14;
        while (x < x0 + 560) {
          const h = 46 + rnd() * 50, w = 20 + rnd() * 8, c = COL[Math.floor(rnd() * COL.length)], top = y - h, nk = w * .3, cx = x + w / 2;
          o += P(x + ',' + y + ' ' + x + ',' + (top + 20) + ' ' + (cx - nk) + ',' + (top + 8) + ' ' + (cx - nk) + ',' + top + ' ' + (cx + nk) + ',' + top + ' ' + (cx + nk) + ',' + (top + 8) + ' ' + (x + w) + ',' + (top + 20) + ' ' + (x + w) + ',' + y, c, 'opacity=".78"');
          o += P(x + ',' + y + ' ' + x + ',' + (top + 20) + ' ' + (cx - nk) + ',' + (top + 8) + ' ' + (cx - nk) + ',' + y, 'rgba(255,255,255,.22)');
          x += w + 8 + rnd() * 10;
        }
        o += P(x0 + ',' + y + ' ' + (x0 + 580) + ',' + y + ' ' + (x0 + 580) + ',' + (y + 14) + ' ' + x0 + ',' + (y + 14), '#7e4526') + P(x0 + ',' + (y + 14) + ' ' + (x0 + 580) + ',' + (y + 14) + ' ' + (x0 + 560) + ',' + (y + 26) + ' ' + (x0 + 20) + ',' + (y + 26), '#5c311a');
      }
    });
    [400, 800, 1200].forEach((x, i) => {
      o += '<g class="lamp l' + i + '">' + P((x - 3) + ',0 ' + (x + 3) + ',0 ' + (x + 3) + ',150 ' + (x - 3) + ',150', '#2a4350') +
        P((x - 56) + ',210 ' + (x - 24) + ',148 ' + (x + 24) + ',148 ' + (x + 56) + ',210', '#ffb547') + P((x - 56) + ',210 ' + (x - 24) + ',148 ' + x + ',148 ' + (x - 12) + ',210', 'rgba(255,255,255,.3)') +
        P((x - 56) + ',210 ' + (x + 56) + ',210 ' + (x + 40) + ',222 ' + (x - 40) + ',222', '#fff2c0') +
        P((x - 40) + ',222 ' + (x + 40) + ',222 ' + (x + 330) + ',900 ' + (x - 330) + ',900', 'rgba(255,200,90,.07)') + '</g>';
    });
    o += '<g>' + P('640,52 960,52 940,112 660,112', 'none', 'stroke="#ff6a4d" stroke-width="5" stroke-linejoin="round"') +
      '<text x="800" y="98" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="44" letter-spacing="6" filter="url(#scratch)" fill="#ff8a6a">SUS TAVERN</text></g>';
    o += P('0,620 1600,620 1600,900 0,900', '#8a4b2a') + P('0,620 1600,620 1600,646 0,646', '#c98250') + P('0,646 1600,646 1600,660 0,660', '#5c311a');
    for (let x = -100; x < 1700; x += 230) o += P(x + ',660 ' + (x + 8) + ',660 ' + (x - 70) + ',900 ' + (x - 78) + ',900', 'rgba(0,0,0,.18)');
    o += P('0,660 700,660 400,900 0,900', 'rgba(255,255,255,.04)') + '</svg>';
    return o;
  }


  return { CH, ng, P, sprite, defs, face, faceOnly, faceParts, avatar, cardCanvas, backCanvas, cardURL, cardImg, logo, icon, scene, KCOL };
})();
