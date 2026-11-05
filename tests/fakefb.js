// A small in-memory Firebase Realtime Database that ENFORCES a rules file (the real database.rules.json), one client handle per signed-in user.
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const split = p => String(p || '').split('/').filter(Boolean);
class Server {
  constructor(rules) { this.root = {}; this.rules = rules; this.subs = []; this.deliveries = []; this.denied = []; this.ops = 0; this.latency = 25; }
  get(path) { let n = this.root; for (const s of split(path)) { if (n == null || typeof n !== 'object') return undefined; n = n[s]; } return n === undefined ? undefined : clone(n); }
  _set(path, val) { const segs = split(path); if (!segs.length) { this.root = val == null ? {} : clone(val); return; } let n = this.root; for (let i = 0; i < segs.length - 1; i++) { if (typeof n[segs[i]] !== 'object' || n[segs[i]] === null) n[segs[i]] = {}; n = n[segs[i]]; } if (val == null) delete n[segs[segs.length - 1]]; else n[segs[segs.length - 1]] = clone(val);
    const rec = o => { for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') { rec(o[k]); if (!Object.keys(o[k]).length) delete o[k]; } }; rec(this.root); }
  allowed(kind, path, uid) {
    const segs = split(path); let node = this.rules.rules; const vars = {}; let nodePath = '';
    const ev = (nd, np) => { const e = nd['.' + kind]; if (e === undefined) return false; if (typeof e === 'boolean') return e;
      const data = this.get(np), names = ['auth', 'data', 'root', ...Object.keys(vars)];
      const fn = new Function(...names, 'return (' + e + ');');
      return !!fn(uid ? { uid } : null, { exists: () => data !== undefined, val: () => data === undefined ? null : data }, { child: p => ({ val: () => { const v = this.get(p); return v === undefined ? null : v; } }) }, ...Object.values(vars)); };
    if (ev(node, '')) return true;
    for (const seg of segs) { let nxt = node[seg]; if (!nxt || typeof nxt !== 'object' || seg[0] === '.') { const wk = Object.keys(node).find(k => k[0] === '$'); if (!wk) return false; vars[wk] = seg; nxt = node[wk]; } node = nxt; nodePath += (nodePath ? '/' : '') + seg; if (ev(node, nodePath)) return true; }
    return false;
  }
  notify(path) {
    const P = split(path);
    for (const s of this.subs) {
      const Q = split(s.path), rel = P.length <= Q.length ? P.every((x, i) => x === Q[i]) : Q.every((x, i) => x === P[i]); if (!rel) continue;
      const now = this.get(s.path), nowJ = JSON.stringify(now === undefined ? null : now);
      if (s.type === 'value') { if (nowJ !== s.last) { s.last = nowJ; this._deliver(s, now); } }
      else { const kids = now && typeof now === 'object' ? now : {}; for (const k of Object.keys(kids)) { const j = JSON.stringify(kids[k]); if (!(k in s.kids)) { s.kids[k] = j; if (s.type === 'child_added') this._deliver(s, kids[k], k); } else if (s.kids[k] !== j) { s.kids[k] = j; if (s.type === 'child_changed') this._deliver(s, kids[k], k); } } for (const k of Object.keys(s.kids)) if (!(k in kids)) delete s.kids[k]; }
    }
  }
  _deliver(s, val, key) { const v = val === undefined ? null : clone(val); this.deliveries.push({ uid: s.uid, path: s.path + (key ? '/' + key : ''), json: JSON.stringify(v) }); setTimeout(() => { if (!this.subs.includes(s)) return; s.cb(snap(this, s.path + (key ? '/' + key : ''), v, s.uid)); }, this.latency); }
}
function snap(server, path, val, uid) { return { key: split(path).pop() || null, val: () => val === null ? null : clone(val), exists: () => val !== null && val !== undefined, ref: mkRef(server, path, uid) }; }
function mkRef(server, path, uid) {
  const self = { path, _subs: [],
    child: p => mkRef(server, [path, p].filter(Boolean).join('/'), uid),
    on(type, cb) { if (path === '.info/connected') { setTimeout(() => cb({ val: () => true }), server.latency); return; } if (!server.allowed('read', path, uid)) { server.denied.push({ uid, op: 'on', path }); return; }
      const cur = server.get(path), s = { uid, path, type, cb, last: JSON.stringify(cur === undefined ? null : cur), kids: {} }; if (type !== 'value' && cur && typeof cur === 'object') for (const k of Object.keys(cur)) s.kids[k] = JSON.stringify(cur[k]);
      server.subs.push(s); self._subs.push(s); if (type === 'value') server._deliver(s, cur); else if (type === 'child_added' && cur && typeof cur === 'object') for (const k of Object.keys(cur)) server._deliver(s, cur[k], k); },
    off() { self._subs.forEach(s => { const i = server.subs.indexOf(s); if (i >= 0) server.subs.splice(i, 1); }); self._subs = []; },
    get() { if (!server.allowed('read', path, uid)) { server.denied.push({ uid, op: 'get', path }); return Promise.reject(new Error('PERMISSION_DENIED get ' + path)); } const v = server.get(path); return Promise.resolve(snap(server, path, v === undefined ? null : v, uid)); },
    set(v) { if (!server.allowed('write', path, uid)) { server.denied.push({ uid, op: 'set', path }); return Promise.reject(new Error('PERMISSION_DENIED set ' + path)); } server._set(path, v); server.notify(path); return Promise.resolve(); },
    remove() { return self.set(null); },
    update(obj) { const paths = Object.keys(obj).map(k => [path, k].filter(Boolean).join('/')); for (const p of paths) if (!server.allowed('write', p, uid)) { server.denied.push({ uid, op: 'update', path: p }); return Promise.reject(new Error('PERMISSION_DENIED update ' + p)); }
      Object.keys(obj).forEach(k => server._set([path, k].filter(Boolean).join('/'), obj[k])); paths.forEach(p => server.notify(p)); return Promise.resolve(); },
    transaction(fn) { if (!server.allowed('write', path, uid)) { server.denied.push({ uid, op: 'transaction', path }); return Promise.reject(new Error('PERMISSION_DENIED transaction ' + path)); }
      const cur = server.get(path), next = fn(cur === undefined ? null : cur); if (next === undefined) return Promise.resolve({ committed: false, snapshot: snap(server, path, cur === undefined ? null : cur, uid) });
      server._set(path, next); server.notify(path); return Promise.resolve({ committed: true, snapshot: snap(server, path, next, uid) }); },
    onDisconnect() { return { remove() { return Promise.resolve(); }, set() { return Promise.resolve(); }, cancel() { return Promise.resolve(); } }; } };
  return self;
}
const clientDb = (server, uid) => ({ ref: p => mkRef(server, p || '', uid) });
const clientAuth = uid => { const a = { currentUser: null, onAuthStateChanged(cb) { setTimeout(() => cb(a.currentUser), 0); return () => {}; }, signInAnonymously() { a.currentUser = { uid }; return Promise.resolve({ user: { uid } }); } }; return a; };
module.exports = { Server, clientDb, clientAuth };
