import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';
import { SecureSocket, resolvePublic } from './network.mjs';

const mime = { '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.mjs':'application/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.wasm':'application/wasm', '.json':'application/json', '.woff2':'font/woff2' };
const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function createBackend(config = process.env) {
  const origin = new URL(config.PUBLIC_ORIGIN || config.RENDER_EXTERNAL_URL);
  const local = config.ALLOW_INSECURE_LOCALHOST === 'true' && ['127.0.0.1','localhost','[::1]'].includes(origin.hostname);
  if (origin.protocol !== 'https:' && !local) throw new Error('PUBLIC_ORIGIN must use HTTPS');
  if (origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash) throw new Error('PUBLIC_ORIGIN must be an origin');
  if (!config.PROXY_PASSWORD || (config.PROXY_PASSWORD.length < 20 || config.PROXY_PASSWORD.length > 256)) throw new Error('PROXY_PASSWORD must contain at least 20 characters and at most 256');
  const allowed = (config.FRONTEND_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.length || allowed.some(value => new URL(value).origin !== value)) throw new Error('FRONTEND_ORIGINS must list exact origins');
  const salt = randomBytes(16);
  const passwordHash = scryptSync(config.PROXY_PASSWORD, salt, 32);
  const sessions = new Map();
  const limits = new Map();
  const root = resolve(config.STATIC_DIRECTORY || fileURLToPath(new URL('./public', import.meta.url)));
  const cookieName = local ? 'nutub_session' : '__Host-nutub_session';
  const sessionMs = 8 * 60 * 60 * 1000;
  const take = (key, max, windowMs = 60000) => {
    const now = Date.now();
    let entry = limits.get(key);
    if (!entry && limits.size >= 10000) return false;
    if (!entry || now >= entry.until) { entry = { count:0, until:now+windowMs }; limits.set(key, entry); }
    return ++entry.count <= max;
  };
  const sessionFor = req => {
    const value = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    const session = value && sessions.get(value);
    return session && session.expires > Date.now() ? session : null;
  };
  const cookie = (token, seconds) => `${cookieName}=${token}; Path=/; HttpOnly; Max-Age=${seconds}; ${local ? 'SameSite=Lax' : 'Secure; SameSite=None; Partitioned'}`;
  const sockets = new Map();
  const send = (res, code, data, type = 'application/json') => { res.writeHead(code, {'Content-Type':type}); res.end(typeof data === 'string' ? data : JSON.stringify(data)); };
  const loginPage = (target, error = '') => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Private Browser</title><style>body{margin:0;background:#111827;color:#e5edf8;font:16px system-ui;display:grid;place-items:center;min-height:100vh}main{max-width:380px;padding:28px}input,button{box-sizing:border-box;width:100%;padding:13px;margin-top:14px;border:1px solid #587292;border-radius:9px;background:#1b2d46;color:inherit;font:inherit}p{line-height:1.6}button{cursor:pointer}small{color:#b8c6d9}</style><main><h1>Private Browser</h1><p>Enter the backend access password to open your browsing session inside nutub.</p><form method="post" action="/session/login"><input type="hidden" name="returnTo" value="${escape(target)}"><label>Access password<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><button>Open browser</button></form><p role="alert">${escape(error)}</p><small>Sessions expire after 8 hours. If this form keeps returning, your browser is blocking embedded session cookies. Allow cross-site storage for this backend.</small></main></html>`;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of limits) if (value.until <= now) limits.delete(key);
    for (const [key, value] of sessions) if (value.expires <= now) { for (const ws of sockets.get(value) || []) ws.close(1008, 'Session expired'); sessions.delete(key); }
  }, 10000);
  timer.unref();
  logging.set_level(logging.NONE);
  Object.assign(wisp.options, {
    dns_method: async host => (await resolvePublic(host)).address,
    allow_direct_ip: true, allow_private_ips:false, allow_loopback_ips:false,
    allow_udp_streams:false, allow_tcp_streams:true, port_whitelist:[80,443],
    stream_limit_total:48, stream_limit_per_host:-1, parse_real_ip:false,
  });
  const server = createServer(async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${allowed.join(' ')}; object-src 'none'`);
      if (!local) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      const requestOrigin = req.headers.origin;
      if (allowed.includes(requestOrigin)) { res.setHeader('Access-Control-Allow-Origin', requestOrigin); res.setHeader('Vary','Origin'); }
      const url = new URL(req.url, origin);
      if (url.origin !== origin.origin || req.headers.host !== origin.host) return send(res, 400, {error:'Invalid host'});
      if (req.method === 'OPTIONS') return send(res, 204, '');
      if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, {status:'ok', protocol:'wisp', auth:'required'});
      const ip = req.socket.remoteAddress;
      if (!take('http:'+ip, 2000)) return send(res, 429, {error:'Request limit reached'});
      const session = sessionFor(req);
      if (session && url.pathname === '/runtime-config') return send(res,200,{allowedParents:allowed});
      if (url.pathname === '/session/login' && req.method === 'POST') {
        if (requestOrigin !== origin.origin) return send(res,403,{error:'Invalid login origin'});
        if (!take('login:'+ip,5)) return send(res,429,{error:'Too many login attempts. Retry in one minute.'});
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body)>4096) return send(res,413,{error:'Request too large'}); }
        const form = new URLSearchParams(body);
        const password = form.get('password') || '';
        const target = form.get('returnTo') || '/search';
        if (!/^\/(?!\/)[^\r\n\\]*$/.test(target)) return send(res,400,{error:'Invalid return path'});
        if (password.length > 256 || !timingSafeEqual(scryptSync(password,salt,32), passwordHash)) return send(res,401,loginPage(target,'Incorrect access password.'),'text/html; charset=utf-8');
        if (sessions.size >= 64) return send(res,503,{error:'Session capacity reached'});
        const token = randomBytes(32).toString('base64url');
        sessions.set(token, {expires:Date.now()+sessionMs,id:randomBytes(12).toString('hex')});
        res.setHeader('Set-Cookie',cookie(token,sessionMs/1000));
        res.writeHead(303,{Location:target}); return res.end();
      }
      if (url.pathname === '/session/logout' && req.method === 'POST') {
        if (requestOrigin !== origin.origin) return send(res,403,{error:'Invalid origin'});
        for (const ws of sockets.get(session) || []) ws.close(1008,'Signed out');
        for (const [key,value] of sessions) if (value === session) sessions.delete(key);
        res.setHeader('Set-Cookie',cookie('',0)); return send(res,200,{signedOut:true});
      }
      if (!session) return req.headers.accept?.includes('text/html') && req.method === 'GET'
        ? send(res,200,loginPage(url.pathname+url.search),'text/html; charset=utf-8')
        : send(res,401,{error:'Authentication required'});
      if (!['GET','HEAD'].includes(req.method)) return send(res,405,{error:'Method not allowed'});
      let filename = resolve(root, '.'+decodeURIComponent(url.pathname));
      if (filename !== root && !filename.startsWith(root+sep)) return send(res,403,{error:'Invalid path'});
      if (url.pathname.startsWith('/ham/') || url.pathname.startsWith('/portal/k12/')) return send(res,503,{error:'Proxy service worker is not active. Reload the browser.'});
      try { if (!(await stat(filename)).isFile()) throw new Error('directory'); }
      catch { if (extname(url.pathname)) return send(res,404,{error:'Not found'}); filename = resolve(root,'index.html'); }
      const data = await readFile(filename);
      res.setHeader('Service-Worker-Allowed','/');
      res.writeHead(200,{'Content-Type':mime[extname(filename)] || 'application/octet-stream'});
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { if (!res.headersSent) send(res,500,{error:'Backend request failed'}); else res.end(); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 80;
  const wsServer = new WebSocketServer({noServer:true, maxPayload:1024*1024, perMessageDeflate:false});
  server.on('upgrade', (req, socket, head) => {
    const deny = code => socket.end(`HTTP/1.1 ${code} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    const session = sessionFor(req);
    if (req.url !== '/wisp/' || req.headers.host !== origin.host || req.headers.origin !== origin.origin) return deny(403);
    if (!session) return deny(401);
    if (!take('ws:'+req.socket.remoteAddress,20) || (sockets.get(session)?.size || 0)>=4) return deny(429);
    if (wsServer.clients.size >= 32) return deny(503);
    wsServer.handleUpgrade(req,socket,head, async ws => {
      ws.binaryType = 'arraybuffer';
      const set = sockets.get(session) || new Set(); set.add(ws); sockets.set(session,set);
      let bytes=0, messages=0, since=Date.now();
      ws.on('message', (data,isBinary) => {
        if (!isBinary) { ws.close(1003,'Binary Wisp frames required'); return; }
        if (Date.now()-since>60000) { bytes=0; messages=0; since=Date.now(); }
        bytes += data.byteLength; messages++;
        if (session.expires<Date.now() || bytes>32*1024*1024 || messages>20000) ws.close(1008,'Session or traffic limit');
      });
      ws.on('close',()=>{set.delete(ws); if (!set.size) sockets.delete(session);});
      ws.on('error',()=>ws.terminate());
      class LimitedConnection extends wisp.ServerConnection {
        create_stream(id,type,hostname,port) {
          const streams = Object.values(this.streams);
          if (!Number.isInteger(id) || id <= 0 || this.streams[id] || type !== 1 ||
              streams.length >= 48 || streams.filter(s => s.socket.hostname === hostname).length >= 12 ||
              !take('streams:'+session.id,600)) {
            ws.close(1008,'Stream limit or invalid stream'); return;
          }
          super.create_stream(id,type,hostname,port);
        }
      }
      const connection = new LimitedConnection(ws,'/wisp/',{TCPSocket:SecureSocket,ping_interval:25});
      connection.ws.send_buffer_size = 2*1024*1024;
      try { await connection.setup(); await connection.run(); } catch { ws.close(1011,'Transport failed'); }
    });
  });
  server.on('close',()=>{clearInterval(timer); for (const set of sockets.values()) for (const ws of set) ws.terminate(); wsServer.close();});
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createBackend();
  server.listen(Number(process.env.PORT || 8080),'0.0.0.0',()=>console.log('nutub browser backend ready'));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{server.close(); setTimeout(()=>process.exit(0),1000).unref();});
}
