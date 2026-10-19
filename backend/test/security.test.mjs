import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { WebSocket } from 'ws';
import { createBackend } from '../server.mjs';
import { isPublicAddress, resolvePublic, SecureSocket } from '../network.mjs';

const blocked = ['127.0.0.1','0.0.0.0','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','224.0.0.1','255.255.255.255','192.0.2.1','198.18.0.1','::1','::','fc00::1','fe80::1','ff02::1','::ffff:127.0.0.1','::ffff:192.168.0.1','64:ff9b::7f00:1','2001:db8::1'];
for (const address of blocked) test(`blocks non-public destination ${address}`, () => assert.equal(isPublicAddress(address),false));
test('allows global IPv4 and IPv6 addresses', () => {
  assert.equal(isPublicAddress('1.1.1.1'),true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
});
test('DNS answers with any private address fail closed', async () => {
  await assert.rejects(resolvePublic('example.com', async () => [{address:'1.1.1.1',family:4},{address:'10.0.0.1',family:4}]),/Non-public/);
  await assert.rejects(resolvePublic('metadata.internal'),/Internal/);
  await assert.rejects(resolvePublic('example.com', async () => []),/Non-public/);
  await assert.rejects(resolvePublic('bad%00host'),/Invalid/);
});
test('new resolutions revalidate rebinding answers', async () => {
  let calls=0;
  const resolver = async () => [{address:++calls === 1 ? '1.1.1.1' : '127.0.0.1',family:4}];
  assert.equal((await resolvePublic('rebind.example',resolver)).address,'1.1.1.1');
  await assert.rejects(resolvePublic('rebind.example',resolver),/Non-public/);
});
test('socket blocks non-web ports before connecting', async () => {
  await assert.rejects(new SecureSocket('example.com',22).connect(),/port blocked/);
  await assert.rejects(new SecureSocket('::ffff:127.0.0.1',443).connect(),/Private/);
});

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(),'nutub-test-'));
  await writeFile(join(dir,'index.html'),'<h1>Actual browser runtime fixture</h1>');
  const origin='https://browser.example';
  const config={PUBLIC_ORIGIN:origin,FRONTEND_ORIGINS:'https://site.example',PROXY_PASSWORD:'local-test-password-123456789',STATIC_DIRECTORY:dir};
  const server=createBackend(config);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  t.after(async()=>{server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); await rm(dir,{recursive:true,force:true});});
  const request=(path,init={})=>new Promise((resolve,reject)=>{
    const req=httpRequest({hostname:'127.0.0.1',port,path,method:init.method || 'GET',headers:{Host:'browser.example',...(init.headers || {})}},res=>{
      let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);
      res.on('end',()=>resolve({status:res.statusCode,headers:new Headers(Object.fromEntries(Object.entries(res.headers).map(([k,v])=>[k,Array.isArray(v)?v.join(', '):v]))),text:async()=>text,json:async()=>JSON.parse(text)}));
    });
    req.on('error',reject);req.end(init.body?.toString());
  });
  const login=async()=>{
    const response=await request('/session/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:config.PROXY_PASSWORD,returnTo:'/search?url=https%3A%2F%2Fexample.com'})});
    assert.equal(response.status,303);
    return response.headers.get('set-cookie');
  };
  return {request,login,origin,port,config};
}

test('health probe is public, exact-origin CORS, and assets require authentication', async t=>{
  const {request}=await fixture(t);
  const health=await request('/healthz',{headers:{Origin:'https://site.example'}});
  assert.equal(health.status,200);
  assert.equal(health.headers.get('access-control-allow-origin'),'https://site.example');
  assert.equal((await health.json()).protocol,'wisp');
  assert.equal((await request('/runtime-config')).status,401);
  const stranger=await request('/healthz',{headers:{Origin:'https://evil.example'}});
  assert.equal(stranger.headers.get('access-control-allow-origin'),null);
  const login=await request('/search',{headers:{Accept:'text/html'}});
  assert.match(await login.text(),/Access password/);
  assert.equal((await request('/healthz',{headers:{Host:'evil.example'}})).status,400);
});

test('login enforces CSRF, password, safe redirects and secure partitioned cookies',async t=>{
  const {request,login,origin}=await fixture(t);
  const post=(body,originHeader=origin)=>request('/session/login',{method:'POST',headers:{Origin:originHeader},body:new URLSearchParams(body)});
  assert.equal((await post({password:'bad'},'https://evil.example')).status,403);
  assert.equal((await post({password:'bad'})).status,401);
  assert.equal((await post({returnTo:'//evil.example'})).status,400);
  const cookie=await login();
  assert.match(cookie,/__Host-nutub_session=.*HttpOnly.*Secure; SameSite=None; Partitioned/);
  const authenticated=await request('/search',{headers:{Cookie:cookie.split(';')[0]}});
  assert.equal(authenticated.status,200);
  assert.match(await authenticated.text(),/Actual browser runtime/);
  const config=await request('/runtime-config',{headers:{Cookie:cookie.split(';')[0]}});
  assert.deepEqual((await config.json()).allowedParents,['https://site.example']);
});

test('login attempts are rate limited',async t=>{
  const {request,origin}=await fixture(t);
  let response;
  for(let i=0;i<6;i++) response=await request('/session/login',{method:'POST',headers:{Origin:origin},body:'password=wrong'});
  assert.equal(response.status,429);
});

test('Wisp rejects unauthenticated and cross-origin upgrades',async t=>{
  const {port,origin}=await fixture(t);
  for (const [requestOrigin,expected] of [[origin,401],['https://evil.example',403]]) {
    const ws=new WebSocket(`ws://127.0.0.1:${port}/wisp/`,{headers:{Host:'browser.example',Origin:requestOrigin}});
    const status=await new Promise(resolve=>{ws.on('unexpected-response',(_,res)=>{res.resume();resolve(res.statusCode);ws.terminate();});ws.on('error',()=>{});});
    assert.equal(status,expected);
  }
});

test('authenticated Wisp handshake, private destination rejection, logout revocation',async t=>{
  const {port,origin,request,login}=await fixture(t);
  const cookie=(await login()).split(';')[0];
  const ws=new WebSocket(`ws://127.0.0.1:${port}/wisp/`,{headers:{Host:'browser.example',Origin:origin,Cookie:cookie}});
  ws.on('error',()=>{});
  const first=once(ws,'message');
  const [hello]=await first;
  assert.equal(hello[0],3); // Real Wisp CONTINUE handshake.
  const host=Buffer.from('127.0.0.1');
  const packet=Buffer.alloc(8+host.length);packet[0]=1;packet.writeUInt32LE(1,1);packet[5]=1;packet.writeUInt16LE(80,6);host.copy(packet,8);
  const reply=once(ws,'message');ws.send(packet);
  const [closed]=await reply;
  assert.equal(closed[0],4);assert.equal(closed[5],0x48);
  const disconnect=once(ws,'close');
  assert.equal((await request('/session/logout',{method:'POST',headers:{Origin:origin,Cookie:cookie}})).status,200);
  await disconnect;
  assert.equal((await request('/runtime-config',{headers:{Cookie:cookie}})).status,401);
});

test('production fails closed without HTTPS, allowed parent, or strong password',()=>{
  const base={PUBLIC_ORIGIN:'https://browser.example',FRONTEND_ORIGINS:'https://site.example',PROXY_PASSWORD:'local-test-password-123456789'};
  assert.throws(()=>createBackend({...base,PUBLIC_ORIGIN:'http://browser.example'}),/HTTPS/);
  assert.throws(()=>createBackend({...base,FRONTEND_ORIGINS:''}),/FRONTEND_ORIGINS/);
  assert.throws(()=>createBackend({...base,PROXY_PASSWORD:'weak'}),/20 characters/);
});
