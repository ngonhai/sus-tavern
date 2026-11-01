// sus-3d.js — first-person 3D round table for Sus Tavern (Three.js, vendored). Exposes window.S3D; without WebGL the 2D UI is used.
// Style: toon-shaded low-poly animals with a painted look (brush-streak texture + ink outline hull), custom scratchy card glyphs from sus-art.js.
// The UI (sus-ui.js) owns rules/timing; this file only draws and animates:
//   setup({g,me,view}) / sync(g)      static scene for a game state (seats, hands, pile, table card, dead players)
//   deal(g) playCards(by,ids,n) shout(by,acc) reveal(acc,cards) pullStart(p,beats) pullEnd(p,dead)   the animated moments
//   setView(seat|'side'), setSelected(ids), onPick(fn), setExpr(seat,expr)
import * as THREE from 'three';

const R = 1.4, TR = .95, TY = .78, CW = .09, CH = .126, CT = .004;      // seat radius, table radius, table top height, card size
const UP = new THREE.Vector3(0, 1, 0), V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const eio = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, eo = u => 1 - Math.pow(1 - u, 3), lin = u => u;
const ebo = u => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };

const S3D = (function () {
  let renderer, scene, cam, wrap, canvas, running = false, ok = false, lastT = 0, raf = 0, hidT = 0, lastErr = '';
  const SEAT = [];       // { phi, pos, dir, right, q }
  let n = 0, game = null, me = 0;
  const view = { mode: 'pov', seat: 0, parX: 0, parY: 0 }, camPos = V(0, 1.3, 1.2), camLook = V(0, .8, 0), cine = { dolly: 0, fov: 0, shake: 0, pitch: 0, roll: 0, k: 0, focus: V(0, 1, 0) };
  const players = [], cards = new Map(), guns = [], selIds = new Set(); let tcard, tcardTex, hoverId = null, glow, glowA = 0, lampSpot, flashLight, tableMesh, fxs = [];
  const cb = { pick: () => {}, hover: () => {} }; let hoverGun = -1;

  // ---------------------------------------------------------------- tweens ----
  const tws = [];
  const tween = (ms, fn, ease) => new Promise(res => { tws.push({ t: 0, ms: Math.max(1, ms), fn, ease: ease || eio, res }); });
  const wait = ms => tween(ms, () => {});
  function stepTweens(dt) { for (let i = tws.length - 1; i >= 0; i--) { const w = tws[i]; w.t += dt * 1000; const u = Math.min(1, w.t / w.ms); w.fn(w.ease(u)); if (u >= 1) { tws.splice(i, 1); w.res(); } } }
  const cineTo = (prop, val, ms) => { const a = cine[prop]; return tween(ms, u => { cine[prop] = a + (val - a) * u; }); };

  // ---------------------------------------------------------------- painted materials ----
  const brushTex = (() => { let tx; return () => { if (tx) return tx; const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 160; i++) { const v = 200 + Math.random() * 55 | 0; g.fillStyle = 'rgba(' + (v - 60) + ',' + (v - 60) + ',' + (v - 60) + ',' + (.12 + Math.random() * .25) + ')'; g.fillRect(Math.random() * 128, Math.random() * 128, 20 + Math.random() * 70, 1 + Math.random() * 3); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,' + (.2 + Math.random() * .3) + ')'; g.fillRect(Math.random() * 128, Math.random() * 128, 20 + Math.random() * 60, 1 + Math.random() * 2); }
    tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace; return tx; }; })();
  const gradMap = (() => { let t; return () => { if (t) return t; const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]); t = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; }; })();
  const mats = {}; const M = (c, o) => { const k = c + JSON.stringify(o || {}); return mats[k] || (mats[k] = new THREE.MeshToonMaterial(Object.assign({ color: c, gradientMap: gradMap(), map: brushTex() }, o || {}))); };
  const inkM = new THREE.MeshBasicMaterial({ color: 0x1a0f0a, side: THREE.BackSide });
  const inked = (m, k) => { const o = new THREE.Mesh(m.geometry, inkM); o.scale.setScalar(k || 1.07); o.userData.ink = true; m.add(o); return m; };
  const mk = (geo, mat, x, y, z, parent, ink) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; if (ink !== false) inked(m); if (parent) parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, p, ink) => mk(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p, ink);
  const cyl = (rt, rb, h, seg, mat, x, y, z, p, ink) => mk(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, p, ink);
  const sph = (r, mat, x, y, z, p, sx, sy, sz) => { const m = mk(new THREE.SphereGeometry(r, 9, 7), mat, x, y, z, p); m.scale.set(sx || 1, sy || 1, sz || 1); return m; };
  const cone = (r, h, seg, mat, x, y, z, p) => mk(new THREE.ConeGeometry(r, h, seg), mat, x, y, z, p);

  // ---------------------------------------------------------------- seats ----
  function layout(count) {
    n = count; SEAT.length = 0;
    for (let i = 0; i < n; i++) { const phi = i * Math.PI * 2 / n; SEAT.push({ phi, pos: V(-Math.sin(phi) * R, 0, Math.cos(phi) * R), dir: V(Math.sin(phi), 0, -Math.cos(phi)), right: V(Math.cos(phi), 0, Math.sin(phi)), q: new THREE.Quaternion().setFromAxisAngle(UP, -phi) }); }
  }
  const sw = (s, r, y, f) => { const S = SEAT[s]; return V(S.pos.x + S.dir.x * f + S.right.x * r, y, S.pos.z + S.dir.z * f + S.right.z * r); };
  const poseQ = (s, rx, ry, rz) => SEAT[s].q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)));

  // ---------------------------------------------------------------- room ----
  const LABEL = (txt, w, h, col, bg) => { const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const g = c.getContext('2d'); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
    g.font = '800 ' + (c.height * .62 | 0) + 'px "Sedgwick Ave Display","Permanent Marker",Impact,sans-serif'; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, c.width / 2, c.height / 2);
    g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 70; i++) { g.lineWidth = .6 + Math.random() * 2; g.strokeStyle = 'rgba(0,0,0,' + (.4 + Math.random() * .6) + ')'; const x = Math.random() * c.width, y = Math.random() * c.height, l = 30 + Math.random() * 160; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (Math.random() - .5) * 6); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  function buildRoom() {
    scene.background = new THREE.Color('#0a2530'); scene.fog = new THREE.Fog('#0a2530', 5, 12);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 32), M('#6b3a1f')); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 4, 28, 1, true), new THREE.MeshToonMaterial({ color: '#12495a', gradientMap: gradMap(), map: brushTex(), side: THREE.BackSide })); wall.position.y = 2; scene.add(wall);
    // shelves of bottles around the wall
    const COL = ['#ffb547', '#5eead4', '#ff8a6a', '#6cc4f5', '#f6f0e2', '#b39bff', '#7bd88f'];
    for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 44; k++) { const a = k / 44 * Math.PI * 2, rr = 5.9, h = .22 + Math.random() * .16, b = cyl(.04, .05, h, 6, M(COL[(k * 3 + ring) % COL.length]), Math.sin(a) * rr, 1.55 + ring * .85 + h / 2, Math.cos(a) * rr, scene, false); b.rotation.y = a; }
    for (let ring = 0; ring < 2; ring++) { const sh = new THREE.Mesh(new THREE.TorusGeometry(5.9, .04, 4, 40), M('#7e4526')); sh.rotation.x = Math.PI / 2; sh.position.y = 1.53 + ring * .85; scene.add(sh); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .7), new THREE.MeshBasicMaterial({ map: LABEL('SUS TAVERN', 2.6, .7, '#ff8a6a'), transparent: true })); sign.position.set(0, 3.1, -5.9); scene.add(sign);
    const sign2 = sign.clone(); sign2.position.set(0, 3.1, 5.9); sign2.rotation.y = Math.PI; scene.add(sign2);
    // lights
    scene.add(new THREE.HemisphereLight(0x5b8fa0, 0x2a1a10, .5)); scene.add(new THREE.AmbientLight(0x40606a, .35));
    lampSpot = new THREE.SpotLight(0xffc27a, 20, 8, .95, .7, 1.4); lampSpot.position.set(0, 2.6, 0); lampSpot.target.position.set(0, TY, 0); lampSpot.castShadow = true; lampSpot.shadow.mapSize.set(1024, 1024); scene.add(lampSpot, lampSpot.target);
    flashLight = new THREE.PointLight(0xffd27a, 0, 4, 2); scene.add(flashLight);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + .7, l = new THREE.PointLight(0xffa860, 1.2, 6, 2); l.position.set(Math.sin(a) * 3.2, 1.8, Math.cos(a) * 3.2); scene.add(l); }
    const lamp = new THREE.Group(); cyl(.012, .012, 1.2, 4, M('#2a4350'), 0, .7, 0, lamp, false); cyl(.1, .42, .26, 9, M('#ffb547', { emissive: '#ffb547', emissiveIntensity: .8 }), 0, 0, 0, lamp, false); lamp.position.set(0, 2.55, 0); scene.add(lamp);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.3, 1.2, 1.8, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: .05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); shaft.position.set(0, 1.65, 0); scene.add(shaft);
    // table
    tableMesh = new THREE.Group(); scene.add(tableMesh); const top = cyl(TR, TR, .07, 24, M('#85502d'), 0, TY - .035, 0, tableMesh); top.userData.table = true;
    const felt = cyl(TR - .08, TR - .08, .006, 24, M('#1c6a56', { map: null }), 0, TY + .002, 0, tableMesh, false); felt.userData.table = true; cyl(.12, .2, TY - .07, 8, M('#5c311a'), 0, (TY - .07) / 2, 0, tableMesh);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(TR - .1, .006, 4, 36), new THREE.MeshBasicMaterial({ color: 0xe0b04a, transparent: true, opacity: .5 })); ring.rotation.x = Math.PI / 2; ring.position.y = TY + .006; tableMesh.add(ring);
    // target card billboard + glow
    tcard = new THREE.Mesh(new THREE.PlaneGeometry(.13, .182), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); tcard.position.set(0, TY + .32, 0); scene.add(tcard);
    const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gg = gc.getContext('2d'), gr = gg.createRadialGradient(64, 64, 8, 64, 64, 62); gr.addColorStop(0, 'rgba(255,244,170,0)'); gr.addColorStop(.6, 'rgba(255,240,150,.5)'); gr.addColorStop(1, 'rgba(255,236,140,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128);
    glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(.22, .22, 1); glow.renderOrder = 6; glow.visible = false; scene.add(glow);
  }

  // ---------------------------------------------------------------- animals ----
  const SKIN = { pig: '#f4a6b8', fox: '#f08a3c', dog: '#c99a62', goat: '#efe8d8', octo: '#9a6bd6', penguin: '#34415c', hawk: '#8a5a32', turtle: '#6fbf73' }, DARK = { pig: '#d9788f', fox: '#b85a1c', dog: '#7b4b26', goat: '#b9ab86', octo: '#6a3fa8', penguin: '#1f2a40', hawk: '#5c3a1e', turtle: '#3f8a4a' };
  // body silhouettes: width / height / depth of the torso, head scale (heads are big and cartoony)
  const SP = { pig: { tw: .8, th: .6, td: .46, head: 1.4 }, fox: { tw: .5, th: .68, td: .28, head: 1.45 }, dog: { tw: .64, th: .64, td: .34, head: 1.4 }, goat: { tw: .48, th: .78, td: .26, head: 1.35 }, octo: { tw: .6, th: .6, td: .4, head: 1.2 }, penguin: { tw: .66, th: .78, td: .5, head: 1.35 }, hawk: { tw: .56, th: .72, td: .3, head: 1.35 }, turtle: { tw: .68, th: .58, td: .42, head: 1.3 } };
  const faceCache = {}, headR = { pig: .2, fox: .18, dog: .19, goat: .17, octo: .24, penguin: .19, hawk: .18, turtle: .18 };
  function setFaceTex(p, expr) {
    const key = p.char + (expr || 'neutral'); p.expr = expr || 'neutral';
    const draw = img => { const g = p.fctx; g.clearRect(0, 0, 256, 256); g.drawImage(img, 0, 0, 256, 256); p.ftex.needsUpdate = true; };
    if (faceCache[key] && faceCache[key].complete && faceCache[key].naturalWidth) { draw(faceCache[key]); return; }
    const img = faceCache[key] || new Image(); faceCache[key] = img; img.onload = () => { if (p.expr === (expr || 'neutral')) draw(img); };
    if (!img.src) img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(Art.faceOnly(p.char, expr).replace('<svg ', '<svg width="256" height="256" '));
  }
  function makeHead(char, S, D) {
    const h = new THREE.Group(), sk = M(S), dk = M(D), R0 = headR[char], white = M('#fff3e0'), ink = M('#2a1a14');
    switch (char) {
      case 'pig': sph(R0, sk, 0, 0, 0, h); cyl(.075, .08, .06, 9, dk, 0, -.05, -R0 - .03, h).rotation.x = Math.PI / 2; [[-1], [1]].forEach(([s]) => { const e = cone(.075, .13, 4, dk, s * .15, .16, -.02, h); e.rotation.z = -s * .9; e.rotation.x = .5; }); break;
      case 'fox': sph(R0, sk, 0, 0, 0, h, 1.08, .92, 1); cone(.075, .2, 6, white, 0, -.05, -R0 - .06, h).rotation.x = -Math.PI / 2; [-1, 1].forEach(s => { cone(.075, .22, 4, sk, s * .12, .2, 0, h).rotation.z = -s * .15; cone(.04, .1, 4, ink, s * .12, .27, 0, h); box(.07, .08, .06, white, s * .16, -.06, -.1, h); }); break;
      case 'dog': sph(R0, sk, 0, 0, 0, h); box(.11, .08, .13, M('#f1dcb8'), 0, -.06, -R0 - .02, h); sph(.03, ink, 0, -.03, -R0 - .09, h); [-1, 1].forEach(s => box(.06, .19, .09, dk, s * .19, .0, 0, h).rotation.z = s * .25); break;
      case 'goat': cyl(.14, .1, .34, 8, sk, 0, 0, 0, h); sph(.12, sk, 0, .12, 0, h); cone(.05, .12, 4, M('#d8cba8'), 0, -.14, -.07, h); [-1, 1].forEach(s => { const hr = cone(.04, .24, 5, M('#c9b27a'), s * .09, .27, .02, h); hr.rotation.z = -s * .45; hr.rotation.x = -.45; box(.12, .05, .05, sk, s * .17, .06, 0, h).rotation.z = s * .4; }); break;
      case 'penguin': sph(R0, sk, 0, 0, 0, h); sph(.15, white, 0, -.03, -.06, h, 1, 1.05, .8); cone(.045, .11, 5, M('#ff9a2e'), 0, -.05, -R0 - .05, h).rotation.x = -Math.PI / 2; break;
      case 'hawk': sph(R0, sk, 0, 0, 0, h); sph(.14, M('#efe0c0'), 0, -.02, -.05, h, 1, 1, .8); const bk = cone(.05, .13, 5, M('#f2c23a'), 0, -.06, -R0 - .05, h); bk.rotation.x = -Math.PI / 2 - .35; [-1, 1].forEach(s => box(.1, .03, .05, dk, s * .07, .07, -R0 + .02, h).rotation.z = -s * .35); [-1, 1].forEach(s => cone(.04, .12, 4, dk, s * .1, .19, .02, h)); break;
      case 'turtle': sph(R0, sk, 0, 0, 0, h, .95, 1, 1.1); box(.08, .02, .03, dk, 0, -.08, -R0 - .02, h); break;
      case 'octo': sph(R0, sk, 0, .02, 0, h, 1, 1.15, 1); [[0, .22, -.1], [-.1, .16, .1], [.11, .12, .08]].forEach(p => sph(.035, M('#c3a1f0'), p[0], p[1], p[2], h)); break;
    }
    return h;
  }
  function makePerson(s, char, col) {
    const root = new THREE.Group(), S = SKIN[char], D = DARK[char], fur = M(S), cloth = M('#f6f0e2'), vest = M(col);
    root.position.copy(SEAT[s].pos); root.quaternion.copy(SEAT[s].q);
    const chair = new THREE.Group(); box(.52, .05, .48, M('#7e4526'), 0, .45, .02, chair); box(.52, .6, .05, M('#7e4526'), 0, .78, .27, chair); [[-.2, -.2], [.2, -.2], [-.2, .24], [.2, .24]].forEach(p => box(.05, .45, .05, M('#7e4526'), p[0], .22, p[1], chair, false)); root.add(chair);
    const body = new THREE.Group(); body.position.y = .7; root.add(body);     // pivot for falling over
    const torso = new THREE.Group(); body.add(torso);
    const sp = SP[char], vestM = vest, dk = M(D);
    if (char === 'octo') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, t = cyl(.055, .03, .6, 6, dk, Math.sin(a) * .22, .1, Math.cos(a) * .15 - .1, torso); t.rotation.z = Math.sin(a) * .35; } sph(.3, fur, 0, .5, 0, torso, 1.1, 1, .85); }
    else {
      const tw = sp.tw, th = sp.th, td = sp.td;
      if (char === 'penguin') { sph(.5, fur, 0, th / 2, 0, torso, tw, th, td); sph(.5, M('#f6f0e2'), 0, th / 2 - .02, -.05, torso, tw * .78, th * .86, td * .85); }
      else if (char === 'pig') { sph(.5, cloth, 0, th / 2, 0, torso, tw, th, td); sph(.5, vestM, 0, th / 2 - .02, -.04, torso, tw * .96, th * .82, td * .9); }
      else { sph(.5, cloth, 0, th / 2, 0, torso, tw, th, td); sph(.5, vestM, 0, th / 2 - .02, -.04, torso, tw * .93, th * .8, td * .9); box(.07, th * .7, .03, cloth, 0, th / 2 - .02, -td / 2 - .02, torso); }
      if (char === 'hawk') [1, -1].forEach(sd => { const w = cone(.1, .5, 4, dk, sd * (tw / 2 + .07), th * .45, .05, torso); w.rotation.z = sd * .12; w.scale.z = .4; w.rotation.x = Math.PI; });
      if (char === 'turtle') { const sh = sph(.5, M('#4f9a55'), 0, th / 2 + .04, td / 2 - .02, torso, tw * .95, th * 1.0, .55); [[-.15, .2], [.15, .2], [0, .0], [-.2, -.12], [.2, -.12]].forEach(q => sph(.12, M('#3f8a4a'), q[0], th / 2 + q[1] * .6, td / 2 + .2, torso, 1.3, 1, .35)); }
      if (char === 'fox') { const tl = cone(.1, .5, 6, fur, 0, .1, td / 2 + .22, torso); tl.rotation.x = Math.PI / 2 + .5; cone(.06, .15, 6, M('#fff3e0'), 0, .0, td / 2 + .45, torso).rotation.x = Math.PI / 2 + .5; }
      box(.2, .08, .2, fur, 0, th - .01, 0, torso);
      [1, -1].forEach(sd => sph(.13, char === 'penguin' ? M(D) : fur, sd * (tw / 2 + .02), th * .82, 0, torso, 1.1, .9, 1.1));
    }
    const head = makeHead(char, S, D); head.scale.setScalar(sp.head); head.position.set(0, char === 'octo' ? 1.0 : sp.th + headR[char] * sp.head * .78, 0); body.add(head);
    const c = document.createElement('canvas'); c.width = c.height = 256; const ftex = new THREE.CanvasTexture(c); ftex.colorSpace = THREE.SRGBColorSpace; const fs = headR[char] * 2.1;
    const snout = { pig: .1, fox: .22, dog: .13, goat: .04, octo: 0, penguin: .1, hawk: .1, turtle: .02 }[char];
    const face = new THREE.Mesh(new THREE.PlaneGeometry(fs, fs), new THREE.MeshBasicMaterial({ map: ftex, transparent: true, depthWrite: false })); face.position.set(0, -.01, -(headR[char] * .98 + snout * .5 + .004)); face.rotation.y = Math.PI; head.add(face);
    const p = { s, char, root, body, torso, head, face, ftex, fctx: c.getContext('2d'), expr: 'neutral', hit: 0, dead: false, fall: 0, lean: 0, look: null, arms: [], col, chair };
    scene.add(root); [1, -1].forEach(side => { const a = makeArm(s, side, char === 'penguin' ? M(D) : fur, char === 'penguin' ? D : S, (char === 'octo' ? .6 : sp.tw) / 2 + .04, sp.th); p.arms.push(a); scene.add(a.root); });
    setFaceTex(p, 'neutral'); return p;
  }

  // ---------------------------------------------------------------- arms (2-bone IK, long cartoon arms) ----
  function makeHand(S) { const g = new THREE.Group(), m = M(S); box(.1, .04, .1, m, 0, 0, 0, g); const f = []; for (let i = 0; i < 3; i++) { const q = new THREE.Group(); q.position.set(-.035 + i * .035, 0, -.05); box(.026, .026, .06, m, 0, 0, -.03, q, false); g.add(q); f.push(q); } const th = new THREE.Group(); th.position.set(.05, 0, -.01); box(.026, .026, .05, m, 0, 0, -.025, th, false); th.rotation.y = .5; g.add(th); g.userData = { fingers: f, thumb: th }; return g; }
  const setGrip = (h, v) => { h.userData.fingers.forEach(f => { f.rotation.x = -1.3 * v; }); h.userData.thumb.rotation.y = .5 - .6 * v; };
  function makeArm(s, side, fur, S, sx, th) {
    const root = new THREE.Group(), hand = makeHand(S); hand.scale.setScalar(1.5);
    const up = cyl(.06, .054, 1, 7, fur, 0, 0, 0, root), fo = cyl(.054, .045, 1, 7, fur, 0, 0, 0, root); root.add(hand);
    const a = { root, up, fo, hand, s, side, pos: V(0, 0, 0), grip: 0, rest: sw(s, side * .24, TY + .07, .5), lockQ: null, shoulder: sw(s, side * (sx || .37), .7 + (th || .6) * .82, 0) };
    a.pos.copy(a.rest); a.pole = SEAT[s].right.clone().multiplyScalar(side * .8).add(V(0, -.9, 0)); return a;
  }
  function seg(mesh, A, B) { const d = B.clone().sub(A), l = d.length(); mesh.position.copy(A).addScaledVector(d, .5); mesh.quaternion.setFromUnitVectors(UP, d.normalize()); mesh.scale.set(1, Math.max(.001, l), 1); }
  function solveArm(a) {
    const L1 = .6, L2 = .6, Sh = a.shoulder, T = a.pos, dv = T.clone().sub(Sh), d = clamp(dv.length(), .05, L1 + L2 - .01), dir = dv.normalize();
    const al = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - al * al)), perp = a.pole.clone().sub(dir.clone().multiplyScalar(a.pole.dot(dir))).normalize();
    const E = Sh.clone().addScaledVector(dir, al).addScaledVector(perp, h), Tc = Sh.clone().addScaledVector(dir, d); seg(a.up, Sh, E); seg(a.fo, E, Tc); a.hand.position.copy(Tc);
    if (a.lockQ) a.hand.quaternion.copy(a.lockQ); else a.hand.quaternion.setFromUnitVectors(V(0, 0, -1), Tc.clone().sub(E).normalize()); setGrip(a.hand, a.grip);
  }
  const moveHand = (arm, dest, ms, ease) => { const a = arm.pos.clone(), b = dest.clone(); return tween(ms, u => arm.pos.lerpVectors(a, b, u), ease); };
  const gripTo = (arm, v, ms) => { const a = arm.grip; return tween(ms, u => { arm.grip = a + (v - a) * u; }, lin); };

  // ---------------------------------------------------------------- guns ----
  function makeGun(s) {
    const g = new THREE.Group(), steel = M('#aebfc6'), dark = M('#4a5f6a');
    box(.034, .06, .17, steel, 0, -.01, -.01, g); const bar = cyl(.014, .014, .22, 8, steel, 0, .03, .12, g); bar.rotation.x = Math.PI / 2; box(.01, .016, .012, M('#ff6a4d'), 0, .05, .22, g, false);
    const dr = cyl(.047, .047, .075, 10, dark, 0, 0, 0, g); dr.rotation.x = Math.PI / 2; const gp = box(.03, .095, .045, M('#7e4526'), 0, -.075, -.085, g); gp.rotation.x = -.35;
    const flash = new THREE.Mesh(new THREE.ConeGeometry(.05, .16, 7), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: .95, depthWrite: false })); flash.rotation.x = Math.PI / 2; flash.position.z = .32; flash.visible = false; g.add(flash);
    g.userData = { seat: s, flash, grip: V(0, -.07, -.085), held: null, kick: 0 }; g.traverse(o => { o.userData.gunSeat = s; }); g.scale.setScalar(1.0); return g;
  }
  function gunRest(s) { const g = guns[s]; g.position.copy(sw(s, .38, TY + .03, .62)); g.quaternion.copy(poseQ(s, 0, Math.PI, 0)); g.userData.held = null; }
  function placeGun(s) {
    const g = guns[s], h = g.userData.held; if (!h) return; g.position.copy(h.hand.pos); g.lookAt(h.aim); g.position.copy(h.hand.pos).sub(g.userData.grip.clone().multiplyScalar(1.3).applyQuaternion(g.quaternion));
    if (h.kick) { g.position.y += h.kick * .05; g.rotateX(-h.kick * .4); } h.hand.lockQ = g.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI));
  }

  // ---------------------------------------------------------------- cards ----
  const texCache = {}; const cardTex = k => texCache[k] || (texCache[k] = (() => { const t = new THREE.CanvasTexture(k === 'back' ? Art.backCanvas() : Art.cardCanvas(k)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })());
  const edgeM = new THREE.MeshToonMaterial({ color: '#eadfc4', gradientMap: gradMap() });
  const faceMats = {}; const cardMat = k => faceMats[k] || (faceMats[k] = [edgeM, edgeM, new THREE.MeshBasicMaterial({ map: cardTex(k) }), new THREE.MeshBasicMaterial({ map: cardTex('back') }), edgeM, edgeM]);
  function makeCard(c) { const m = new THREE.Mesh(new THREE.BoxGeometry(CW, CT, CH), cardMat(c.k === 'D' ? 'J' : c.k)); m.castShadow = true; m.userData.cardId = c.id; scene.add(m); return { id: c.id, k: c.k, real: c.k, mesh: m, owner: -1, inPile: false, faceUp: false, busy: false }; }
  const pilePose = (idx, faceUp) => ({ pos: V((((idx * 37) % 11) - 5) * .005, TY + .004 + idx * .0045, (((idx * 53) % 11) - 5) * .005), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(faceUp ? 0 : Math.PI, ((idx * 71) % 360) * Math.PI / 180, 0)) });
  function handPose(i, j, cnt, mineHere) {
    const spread = mineHere ? .105 : .06, r = (j - (cnt - 1) / 2) * spread;
    if (mineHere) return { pos: sw(i, r, TY + .17 + Math.abs(r) * -.04, .5 + Math.abs(r) * .12), q: poseQ(i, .95, 0, -r * .5) };
    return { pos: sw(i, r, TY + .006 + j * .0008, .42), q: poseQ(i, Math.PI, 0, (j % 2 ? .04 : -.04)) };
  }
  function placeHands(g, instant) {
    const mine = viewSeat(); for (let i = 0; i < g.n; i++) g.hands[i].forEach((c, j) => { let r = cards.get(c.id); if (!r) { r = makeCard(c); cards.set(c.id, r); } r.owner = i; r.inPile = false; r.faceUp = false; const hp = handPose(i, j, g.hands[i].length, i === mine && view.mode === 'pov');
      r.home = hp; if (r.busy) return; r.mesh.visible = true; const up = selIds.has(c.id) && i === mine ? .06 : 0; r.mesh.position.copy(hp.pos); r.mesh.position.y += up; r.mesh.quaternion.copy(hp.q); });
  }
  function viewSeat() { return view.mode === 'pov' ? view.seat : -1; }
  function placePile(g) { g.pile.forEach((c, idx) => { let r = cards.get(c.id); if (!r) { r = makeCard(c); cards.set(c.id, r); } r.inPile = true; r.owner = -1; if (r.busy) return; const pp = pilePose(idx, r.faceUp); r.mesh.position.copy(pp.pos); r.mesh.quaternion.copy(pp.q); r.mesh.visible = true; }); }
  function pruneCards(g) { const keep = new Set(); g.hands.forEach(h => h.forEach(c => keep.add(c.id))); g.pile.forEach(c => keep.add(c.id)); [...cards.keys()].forEach(id => { if (!keep.has(id) && !cards.get(id).busy) { scene.remove(cards.get(id).mesh); cards.delete(id); } }); }

  // ---------------------------------------------------------------- sync + setup ----
  function setup(o) {
    if (!ok) return; game = o.g; me = o.me; layout(o.g.n);
    players.forEach(p => { if (p) { scene.remove(p.root); p.arms.forEach(a => scene.remove(a.root)); } }); players.length = 0; guns.forEach(g => scene.remove(g)); guns.length = 0; cards.forEach(r => scene.remove(r.mesh)); cards.clear(); fxs.forEach(f => scene.remove(f.m)); fxs = []; tws.length = 0;
    const COLS = ['#ff6a4d', '#5eead4', '#ffb547', '#b39bff', '#6cc4f5'];
    for (let i = 0; i < o.g.n; i++) { players.push(makePerson(i, o.g.chars[i], COLS[i])); const gn = makeGun(i); scene.add(gn); guns.push(gn); gunRest(i); }
    cine.dolly = cine.fov = cine.shake = cine.pitch = cine.roll = cine.k = 0; document.body.classList.remove('cine'); camPos.copy(camTarget().pos); setView(o.view);
  }
  function sync(g, opt) {
    if (!ok || !players.length) return; game = g; if (opt && opt.me != null) me = opt.me;
    pruneCards(g); placeHands(g); placePile(g);
    tcard.material.map = cardTex(g.target); tcard.material.needsUpdate = true;
    players.forEach((p, i) => { const dead = !g.alive[i]; if (dead !== p.dead && !p.busy) { p.dead = dead; p.fall = dead ? 1 : 0; } p.arms.forEach(a => { a.root.visible = !dead && !(view.mode === 'pov' && view.seat === i ? false : false); }); setFaceTex(p, dead ? 'dead' : (p.expr === 'dead' ? 'neutral' : p.expr)); });
  }
  function setView(v) { if (v === 'side') view.mode = 'side'; else { view.mode = 'pov'; view.seat = v; } players.forEach((p, i) => { if (p) p.body.visible = !(view.mode === 'pov' && i === view.seat); }); if (game) { placeHands(game); } }
  function setSelected(ids) { selIds.clear(); (ids || []).forEach(i => selIds.add(i)); if (game) placeHands(game); }
  const setExpr = (s, e) => { if (ok && players[s]) { players[s].expr = e; setFaceTex(players[s], e); } };

  // ---------------------------------------------------------------- the moments ----
  async function deal(g) {
    if (!ok) return; const jobs = []; let k = 0;
    cards.forEach(r => { if (r.owner < 0 || r.busy) return; const home = r.home, m = r.mesh; const from = V(0, TY + .03, 0), to = home.pos.clone(), qf = m.quaternion.clone(), qt = home.q.clone(), d = k++ * 55;
      m.position.copy(from); m.visible = false; jobs.push(wait(d).then(() => { m.visible = true; Snd.play('card'); return tween(380, u => { m.position.lerpVectors(from, to, u); m.position.y += Math.sin(u * Math.PI) * .12; m.quaternion.slerpQuaternions(poseQ(0, Math.PI, 0), qt, u); }, eo); })); });
    await Promise.all(jobs); placeHands(g);
  }
  async function playCards(by, ids, count) {
    if (!ok || !players[by]) return; const P = players[by], arm = P.arms[0], recs = ids.map(id => cards.get(id)).filter(Boolean); const base = game ? game.pile.length : 0;
    recs.forEach(r => { r.busy = true; });
    // reach to the hand, grab, push the cards onto the table centre
    const c0 = recs.length ? recs[0].mesh.position.clone() : sw(by, 0, TY + .1, .42);
    await moveHand(arm, c0.clone().add(V(0, .1, 0)), 320); await moveHand(arm, c0.clone().add(V(0, .035, 0)), 120); await gripTo(arm, .8, 90);
    const from = recs.map(r => r.mesh.position.clone()), qf = recs.map(r => r.mesh.quaternion.clone()), mid = sw(by, 0, TY + .16, .85);
    await Promise.all([moveHand(arm, mid, 380), tween(380, u => recs.forEach((r, i) => { r.mesh.position.lerpVectors(from[i], mid.clone().add(V(0, -.03 + i * .006, 0)), u); r.mesh.quaternion.slerpQuaternions(qf[i], poseQ(by, Math.PI, 0, 0), u); }))]);
    await gripTo(arm, 0, 80); Snd.play('card');
    await tween(300, u => recs.forEach((r, i) => { const pp = pilePose(base + i, false); r.mesh.position.lerpVectors(mid.clone().add(V(0, -.03, 0)), pp.pos, u); r.mesh.quaternion.slerpQuaternions(poseQ(by, Math.PI, 0, 0), pp.q, u); }), eo);
    recs.forEach(r => { r.busy = false; r.inPile = true; r.owner = -1; }); await moveHand(arm, arm.rest, 360);
  }
  async function shout(by, acc) {
    if (!ok || !players[by]) return; const P = players[by], arm = P.arms[1], target = SEAT[acc] ? sw(acc, 0, 1.3, 0) : V(0, 1.2, 0), from = sw(by, 0, 1.3, 0), d = target.clone().sub(from).normalize();
    focusOn(sw(acc, 0, 1.45, 0), .5, 7, 0); cine.shake = 1; cineTo('shake', 0, 500); document.body.classList.add('cine');
    const dest = from.clone().addScaledVector(d, .85).add(V(0, .05, 0)); await moveHand(arm, dest, 360, eo); await wait(520); await moveHand(arm, arm.rest, 360);
  }
  async function reveal(acc, cs) {
    if (!ok) return; const recs = cs.map(c => cards.get(c.id)).filter(Boolean), campos = cam.position.clone(), H = V(0, TY + .34, 0); recs.forEach(r => { r.busy = true; r.faceUp = true; if (r.real === 'D') r.mesh.material = cardMat('D'); });
    tcard.visible = false; focusOn(V(0, TY + .3, 0), .55, 10, 0); const tgt = recs.map((r, i) => { const o = new THREE.Object3D(); o.position.copy(H).add(V((i - (recs.length - 1) / 2) * .14, 0, 0)); o.lookAt(campos); o.rotateX(Math.PI / 2); return o; });
    const from = recs.map(r => r.mesh.position.clone()), qf = recs.map(r => r.mesh.quaternion.clone()); Snd.play('flip');
    await tween(700, u => recs.forEach((r, i) => { r.mesh.position.lerpVectors(from[i], tgt[i].position, u); r.mesh.position.y += Math.sin(u * Math.PI) * .1; r.mesh.quaternion.slerpQuaternions(qf[i], tgt[i].quaternion, u); }), eo);
    await wait(1300); recs.forEach(r => { r.busy = false; }); tcard.visible = true;
  }
  function focusOn(pt, k, fov, dolly) { cine.focus.copy(pt); cineTo('k', k, 500); cineTo('fov', -fov, 600); cineTo('dolly', dolly || 0, 600); document.body.classList.add('cine'); }
  function unfocus() { cineTo('k', 0, 700); cineTo('fov', 0, 700); cineTo('dolly', 0, 700); document.body.classList.remove('cine'); }
  async function pullStart(p, beats) {
    if (!ok || !players[p]) return; const P = players[p], arm = P.arms[0], g = guns[p], u = g.userData; const head = () => P.head.getWorldPosition(V(0, 0, 0));
    await moveHand(arm, g.position.clone().add(V(0, .12, 0)), 360); await moveHand(arm, g.position.clone().add(V(0, .04, 0)), 120); await gripTo(arm, .9, 100);
    u.held = { hand: arm, aim: head(), kick: 0 }; const temple = sw(p, .12, 1.5, .16), a0 = arm.pos.clone();
    focusOn(head().add(V(0, .05, 0)), view.mode === 'pov' && view.seat === p ? .35 : .6, 12, .25); Snd.play('select');
    await tween(700, uu => { arm.pos.lerpVectors(a0, temple, uu); u.held.aim.copy(head()); });
    for (let i = 0; i < beats; i++) { Snd.play('beat'); cine.shake = .25 + i * .1; cineTo('shake', 0, 420); await wait(520); }
  }
  async function pullEnd(p, dead) {
    if (!ok || !players[p]) return; const P = players[p], g = guns[p], u = g.userData, h = u.held; if (!h) { unfocus(); return; }
    if (dead) {
      u.flash.visible = true; flashLight.position.copy(g.position); flashLight.intensity = 60; cine.shake = 1.4; cineTo('shake', 0, 700); P.busy = true;
      tween(120, e => { h.kick = e; }, eo).then(() => tween(300, e => { h.kick = 1 - e; }, eo)); tween(160, e => { flashLight.intensity = 60 * (1 - e); }, lin).then(() => { u.flash.visible = false; flashLight.intensity = 0; });
      bloodTable(p); setExpr(p, 'dead'); await wait(160); await tween(900, e => { P.fall = e; P.body.rotation.x = -1.25 * e; P.body.position.y = .7 - .25 * e; }, eio); P.dead = true; P.busy = false;
      u.held = null; h.hand.lockQ = null; const gp = g.position.clone(); await Promise.all([gripTo(h.hand, 0, 150), tween(450, e => { g.position.lerpVectors(gp, sw(p, .38, TY + .03, .62), e); g.quaternion.slerp(poseQ(p, 0, Math.PI, 0), e); }, eo)]); h.hand.pos.copy(h.hand.rest); P.arms.forEach(a => { a.root.visible = false; });
    } else {
      tween(90, e => { h.kick = e * .15; }, lin).then(() => tween(200, e => { h.kick = .15 * (1 - e); }, eo)); await wait(450);
      const a0 = h.hand.pos.clone(), gr = sw(p, .38, TY + .1, .62); await tween(520, e => { h.hand.pos.lerpVectors(a0, gr, e); h.aim.lerp(V(g.position.x + SEAT[p].dir.x, TY, g.position.z + SEAT[p].dir.z), e * .2); });
      u.held = null; h.hand.lockQ = null; await gripTo(h.hand, 0, 120); gunRest(p); await moveHand(h.hand, h.hand.rest, 420);
    }
    unfocus(); await wait(250);
  }
  // blood: droplets spray from the head onto the felt and linger as stains
  const splatTex = (() => { let tx; return () => { if (tx) return tx; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#9b1530'; for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28, d = 6 + Math.random() * 14, r = 3 + Math.random() * 7; g.beginPath(); g.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, r, 0, 6.28); g.fill(); } g.beginPath(); g.arc(32, 32, 11, 0, 6.28); g.fill(); tx = new THREE.CanvasTexture(c); return tx; }; })();
  function bloodTable(p) {
    const head = players[p].head.getWorldPosition(V(0, 0, 0)), S = SEAT[p];
    for (let i = 0; i < 18; i++) { const r = (Math.random() - .5) * 1.4, up = .4 + Math.random() * 1.1, f = .9 + Math.random() * 1.5; const d = new THREE.Mesh(new THREE.BoxGeometry(.012, .012, .012), new THREE.MeshBasicMaterial({ color: 0xa01632 })); d.position.copy(head); scene.add(d); fxs.push({ k: 'drop', m: d, v: S.right.clone().multiplyScalar(r).addScaledVector(S.dir, f).add(V(0, up, 0)), big: Math.random() }); }
  }
  function stainAt(x, z, big) { const sz = .05 + big * .12, m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshBasicMaterial({ map: splatTex(), transparent: true, depthWrite: false, opacity: .92, polygonOffset: true, polygonOffsetFactor: -2 })); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; m.position.set(x, TY + .006 + Math.random() * .002, z); m.scale.setScalar(.3); scene.add(m); fxs.push({ k: 'stain', m, t: 0, life: 6 + Math.random() * 3 }); }
  function stepFx(dt) {
    for (let i = fxs.length - 1; i >= 0; i--) { const f = fxs[i];
      if (f.k === 'drop') { f.v.y -= 6.5 * dt; f.m.position.addScaledVector(f.v, dt); const p = f.m.position; if (p.y <= TY + .008) { scene.remove(f.m); if (Math.hypot(p.x, p.z) < TR - .08) stainAt(p.x, p.z, f.big); fxs.splice(i, 1); } else if (p.y < 0) { scene.remove(f.m); fxs.splice(i, 1); } }
      else { f.t += dt; const m = f.m; m.scale.setScalar(f.t < .15 ? .3 + f.t / .15 * .7 : 1); const fade = f.life - 2.5; if (f.t > fade) m.material.opacity = Math.max(0, .92 * (1 - (f.t - fade) / 2.5)); if (f.t >= f.life) { scene.remove(m); fxs.splice(i, 1); } } }
  }

  // ---------------------------------------------------------------- camera ----
  function camTarget() {
    if (view.mode === 'side' || !SEAT.length) { const t = performance.now() / 1000, a = t * .08; return { pos: V(Math.sin(a) * 2.7, 1.9, Math.cos(a) * 2.7), look: V(0, TY + .15, 0), fov: 50 }; }
    const s = view.seat; return { pos: sw(s, 0, 1.31, .08), look: V(0, TY + .1, 0), fov: n > 4 ? 78 : 72 };
  }
  function updateCamera(dt, t) {
    const T = camTarget(), k = 1 - Math.exp(-dt * 3.2); const pos = T.pos.clone(), look = T.look.clone();
    if (view.mode === 'pov' && SEAT.length) {
      const S = SEAT[view.seat], fw = look.clone().sub(pos).normalize(); pos.addScaledVector(fw, cine.dolly); pos.y += Math.sin(t * 1.3) * .004 - cine.pitch * .1;
      const dir = look.clone().sub(pos); dir.applyAxisAngle(UP, -view.parX * .9); look.copy(pos).add(dir); look.y += view.parY * .35 + Math.sin(t * .9) * .004;
    }
    if (cine.k > .001) look.lerp(cine.focus, cine.k);
    camPos.lerp(pos, k); camLook.lerp(look, k); cam.position.copy(camPos);
    if (cine.shake > .001) { const a = cine.shake * .035; cam.position.add(V((Math.random() - .5) * a, (Math.random() - .5) * a, (Math.random() - .5) * a)); }
    cam.lookAt(camLook); if (cine.roll) cam.rotateZ(cine.roll); const f = T.fov + cine.fov; if (Math.abs(cam.fov - f) > .01) { cam.fov += (f - cam.fov) * k; cam.updateProjectionMatrix(); }
  }

  // ---------------------------------------------------------------- picking ----
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  function pickAt(ev) {
    const r = canvas.getBoundingClientRect(); ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, cam);
    const targets = []; cards.forEach(c => { if (c.owner === viewSeat() && !c.inPile) targets.push(c.mesh); }); guns.forEach(g => targets.push(g)); targets.push(tableMesh);
    const hits = ray.intersectObjects(targets, true); if (!hits.length) return { type: 'none' };
    let o = hits[0].object; while (o) { if (o.userData.cardId != null) return { type: 'card', id: o.userData.cardId }; if (o.userData.gunSeat != null) return { type: 'gun', p: o.userData.gunSeat, x: ev.clientX, y: ev.clientY, touch: ev.pointerType === 'touch' }; if (o.userData.table) return { type: 'table' }; o = o.parent; }
    return { type: 'none' };
  }
  function onMove(ev) { const r = canvas.getBoundingClientRect(); view.parX = ((ev.clientX - r.left) / r.width - .5) * 2; view.parY = -((ev.clientY - r.top) / r.height - .5) * 2; const p = pickAt(ev); canvas.style.cursor = p.type === 'card' || p.type === 'gun' ? 'pointer' : 'default'; hoverId = p.type === 'card' ? p.id : null; const gs = p.type === 'gun' && ev.pointerType !== 'touch' ? p.p : -1; if (gs >= 0) cb.hover({ type: 'gun', p: gs, x: ev.clientX, y: ev.clientY }); else if (hoverGun >= 0) cb.hover(null); hoverGun = gs; }

  // ---------------------------------------------------------------- frame loop ----
  function frame(now) {
    raf = requestAnimationFrame(frame); const dt = Math.min(.05, (now - lastT) / 1000 || .016); lastT = now; const t = now / 1000; stepTweens(dt); stepFx(dt);
    players.forEach((p, s) => { if (!p) return; const idle = Math.sin(t * 1.2 + s) * .004;
      if (!p.dead && !p.busy) { p.body.position.y = .7 + idle; p.body.rotation.x = 0; } else if (p.dead && !p.busy) { p.body.position.y = .45; p.body.rotation.x = -1.25; }
      p.head.rotation.x = Math.sin(t * .7 + s) * .02; const lk = (game && game.alive && n > 1) ? (SEAT[(s + 1) % n] ? sw((s + 1) % n, 0, 1.4, 0) : V(0, 1.4, 0)) : V(0, 1.4, 0);
      if (!p.dead) { const lp = p.head.getWorldPosition(V(0, 0, 0)), dir = lk.clone().sub(lp).applyAxisAngle(UP, SEAT[s].phi); p.head.rotation.y += (clamp(Math.atan2(-dir.x, -dir.z) * .5, -.7, .7) - p.head.rotation.y) * .04; }
      p.arms.forEach((a, i) => { if (a.pos.equals(a.rest) && !a.lockQ) a.pos.y = a.rest.y + Math.sin(t * 1.2 + i) * .002; solveArm(a); });
    });
    guns.forEach((g, s) => { if (g.userData.held) placeGun(s); });
    // hovered / selected cards lift smoothly; the target card faces the camera
    cards.forEach(r => { if (r.busy || r.owner !== viewSeat() || r.inPile || !r.home) return; const want = (selIds.has(r.id) ? .06 : 0) + (hoverId === r.id ? .025 : 0); r.mesh.position.y += (r.home.pos.y + want - r.mesh.position.y) * Math.min(1, dt * 14); });
    tcard.position.y = TY + .32 + Math.sin(t * 1.6) * .012; tcard.rotation.y = Math.atan2(cam.position.x - tcard.position.x, cam.position.z - tcard.position.z);
    { const hr = hoverId != null ? cards.get(hoverId) : null; if (hr) { glow.position.copy(hr.mesh.position).add(V(0, .02, 0)); glow.visible = true; } glowA += ((hr ? .35 : 0) - glowA) * Math.min(1, dt * 10); glow.material.opacity = glowA; if (glowA < .01 && !hr) glow.visible = false; }
    updateCamera(dt, t); renderer.render(scene, cam);
  }
  function resize() { if (!renderer) return; const w = wrap.clientWidth || innerWidth, h = wrap.clientHeight || innerHeight; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  function init(container) {
    try {
      wrap = container; canvas = document.createElement('canvas'); canvas.id = 'r3d-canvas'; wrap.appendChild(canvas);
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
      scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(70, 1, .05, 30); buildRoom();
      canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerleave', () => { hoverId = null; if (hoverGun >= 0) { hoverGun = -1; cb.hover(null); } }); canvas.addEventListener('pointerdown', ev => { if (ev.button !== 0) return; cb.pick(pickAt(ev)); });
      addEventListener('resize', resize); resize();
      document.addEventListener('visibilitychange', () => { clearInterval(hidT); if (document.hidden && running) { let l = performance.now(); hidT = setInterval(() => { const nn = performance.now(); stepTweens(Math.min(.1, (nn - l) / 1000)); l = nn; }, 50); } });
      ok = true;
    } catch (e) { console.warn('3D unavailable, using 2D', e); ok = false; lastErr = String(e && e.message || e); }
    return ok;
  }
  function start() { if (!ok || running) return; running = true; resize(); lastT = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); clearInterval(hidT); }
  return { err: () => lastErr, init, setup, sync, start, stop, setView, setSelected, setExpr, deal, playCards, shout, reveal, pullStart, pullEnd, onPick: f => { cb.pick = f; }, onHover: f => { cb.hover = f; }, isOk: () => ok };
})();
window.S3D = S3D;
