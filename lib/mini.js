'use strict';
// A small express-style layer on Node's own http module: app.use/get/post, route params, JSON bodies, cookies,
// static files with Range support (needed for audio seeking). No dependencies, so it is fully tested here.
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

function compile(p) { const keys = []; const re = new RegExp('^' + p.replace(/\/+$/, '').replace(/:([A-Za-z0-9_]+)/g, (m, k) => { keys.push(k); return '([^/]+)'; }) + '/?$'); return { re, keys }; }

function create() {
  const layers = []; const settings = { 'trust proxy': 0 };
  const app = function (req, res) { handle(req, res); };
  app.set = (k, v) => { settings[k] = v; return app; };
  app.disable = k => { settings[k] = false; return app; };
  app.use = function (a, b) {
    if (typeof a === 'function') layers.push({ prefix: '', fn: a }); else layers.push({ prefix: a.replace(/\/+$/, ''), fn: b });
    return app;
  };
  ['get', 'post', 'put', 'delete'].forEach(m => {
    app[m] = function (p) {
      const c = compile(p), fns = Array.prototype.slice.call(arguments, 1);
      fns.forEach(fn => layers.push({ method: m.toUpperCase(), route: c, fn }));
      return app;
    };
  });

  function decorate(req, res) {
    const u = new URL(req.url, 'http://x'); req.path = u.pathname; req.query = {}; u.searchParams.forEach((v, k) => { if (!(k in req.query)) req.query[k] = v; });
    req.params = {}; req.body = undefined; req.get = h => req.headers[String(h).toLowerCase()];
    const tp = settings['trust proxy'], xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    req.ip = tp > 0 && xff.length ? xff[Math.max(0, xff.length - tp)] : (req.socket.remoteAddress || '');
    req.secure = tp > 0 ? String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' : !!req.socket.encrypted;
    req.is = t => { const ct = String(req.headers['content-type'] || '').toLowerCase(); return ct.indexOf(String(t).toLowerCase().replace('json', 'json')) > -1 ? t : false; };
    res.status = n => { res.statusCode = n; return res; };
    res.set = (k, v) => { if (typeof k === 'object') Object.keys(k).forEach(x => res.setHeader(x, k[x])); else res.setHeader(k, v); return res; };
    res.json = o => { const b = Buffer.from(JSON.stringify(o)); if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Content-Length', b.length); res.end(b); return res; };
    res.send = b => { if (typeof b === 'object' && !Buffer.isBuffer(b)) return res.json(b); const buf = Buffer.isBuffer(b) ? b : Buffer.from(String(b)); if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Content-Length', buf.length); res.end(buf); return res; };
    res.redirect = (url) => { res.statusCode = 302; res.setHeader('Location', url); res.end(); };
    res.cookie = (name, val, o) => {
      o = o || {}; let s = name + '=' + encodeURIComponent(val) + '; Path=' + (o.path || '/');
      if (o.maxAge != null) s += '; Max-Age=' + Math.floor(o.maxAge / 1000); if (o.httpOnly) s += '; HttpOnly'; if (o.secure) s += '; Secure'; if (o.sameSite) s += '; SameSite=' + o.sameSite[0].toUpperCase() + o.sameSite.slice(1);
      const prev = res.getHeader('Set-Cookie'); res.setHeader('Set-Cookie', prev ? [].concat(prev, s) : s); return res;
    };
    res.clearCookie = (name, o) => res.cookie(name, '', Object.assign({}, o, { maxAge: 0 }));
    res.sendFile = (file, cb) => sendFile(req, res, file, {}, cb);
  }

  function handle(req, res) {
    decorate(req, res); let i = 0, err = null;
    const next = e => {
      if (e) err = e;
      while (i < layers.length) {
        const L = layers[i++];
        if (L.route) {
          if (err) continue; if (L.method !== req.method && !(L.method === 'GET' && req.method === 'HEAD')) continue;
          const m = L.route.re.exec(req.path); if (!m) continue;
          req.params = {}; L.route.keys.forEach((k, n) => { try { req.params[k] = decodeURIComponent(m[n + 1]); } catch (x) { req.params[k] = m[n + 1]; } });
          return run(L.fn, false);
        }
        if (L.prefix && !(req.path === L.prefix || req.path.indexOf(L.prefix + '/') === 0)) continue;
        if (err && L.fn.length !== 4) continue; if (!err && L.fn.length === 4) continue;
        return run(L.fn, !!err);
      }
      if (res.headersSent) return;
      if (err) { console.log('HTTP ERROR', req.method, req.path, err && err.message); res.statusCode = err.status || 500; return res.end('Server error'); }
      res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('Not found');
    };
    function run(fn, isErr) {
      try { const r = isErr ? fn(err, req, res, e2 => { err = null; next(e2); }) : fn(req, res, e => next(e)); if (isErr) err = null; if (r && typeof r.then === 'function') r.catch(next); }
      catch (e) { next(e); }
    }
    next();
  }
  app.listen = function () { const s = http.createServer(app); return s.listen.apply(s, arguments); };
  return app;
}

// ---------- body parsing ----------
create.json = function (opts) {
  const limit = (opts && opts.limit) || 700 * 1024;
  return (req, res, next) => {
    if (!/^(POST|PUT|DELETE)$/.test(req.method) || !/json/i.test(req.headers['content-type'] || '')) { return next(); }
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { const e = new Error('too large'); e.status = 413; req.destroy(); return next(e); } chunks.push(c); });
    req.on('end', () => { if (size > limit) return; try { const t = Buffer.concat(chunks).toString('utf8'); req.body = t ? JSON.parse(t) : {}; next(); } catch (e) { e.status = 400; next(e); } });
    req.on('error', next);
  };
};
// raw body for signature checks (Discord interactions)
create.raw = function (limit) {
  limit = limit || 100 * 1024;
  return (req, res, next) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { req.destroy(); return next(Object.assign(new Error('too large'), { status: 413 })); } chunks.push(c); });
    req.on('end', () => { if (size > limit) return; req.rawBody = Buffer.concat(chunks); next(); });
    req.on('error', next);
  };
};

// ---------- static files ----------
function sendFile(req, res, file, o, cb) {
  o = o || {};
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { if (cb) return cb(e || new Error('not a file')); res.statusCode = 404; return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase(); const type = MIME[ext] || 'application/octet-stream';
    const etag = 'W/"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
    res.setHeader('Content-Type', type); res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Last-Modified', st.mtime.toUTCString()); res.setHeader('ETag', etag);
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', o.maxAge ? 'public, max-age=' + Math.floor(o.maxAge / 1000) : 'no-cache');
    if (req.headers['if-none-match'] === etag) { res.statusCode = 304; return res.end(); }
    let start = 0, end = st.size - 1; const rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (rg && (rg[1] || rg[2])) {
      if (rg[1] === '') { start = Math.max(0, st.size - parseInt(rg[2], 10)); } else { start = parseInt(rg[1], 10); if (rg[2]) end = Math.min(end, parseInt(rg[2], 10)); }
      if (start > end || start >= st.size) { res.statusCode = 416; res.setHeader('Content-Range', 'bytes */' + st.size); return res.end(); }
      res.statusCode = 206; res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + st.size);
    }
    res.setHeader('Content-Length', end - start + 1);
    if (req.method === 'HEAD') return res.end();
    const s = fs.createReadStream(file, { start, end });
    s.on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end(); }); s.on('close', () => cb && cb()); s.pipe(res);
  });
}
create.static = function (root, o) {
  o = o || {}; root = path.resolve(root);
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let p; try { p = decodeURIComponent(req.path); } catch (e) { return next(); }
    if (p.indexOf('\0') > -1) return next();
    let file = path.resolve(root, '.' + p);
    if (file !== root && file.indexOf(root + path.sep) !== 0) return next();
    if (path.basename(file).startsWith('.')) return next();
    fs.stat(file, (e, st) => {
      if (!e && st.isDirectory()) file = path.join(file, o.index || 'index.html');
      else if (e) return next();
      sendFile(req, res, file, o, err => { if (err && !res.headersSent) next(); });
    });
  };
};
create.sendFile = sendFile; create.MIME = MIME;
module.exports = create;
