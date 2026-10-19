import test from 'node:test';
import assert from 'node:assert/strict';
import { browserBackendOrigin, browserSettings } from '../src/utils/browserBackend.js';

test('backend origin only accepts HTTPS origins without credentials or paths',()=>{
  assert.equal(browserBackendOrigin(''), '');
  assert.equal(browserBackendOrigin('https://proxy.example/'),'https://proxy.example');
  for(const value of ['http://proxy.example','https://user:pass@proxy.example','https://proxy.example/path','https://proxy.example?secret=x','https://proxy.example/#hash','javascript:alert(1)']) assert.throws(()=>browserBackendOrigin(value));
});
test('settings bridge preserves bookmarks and excludes credentials and transport overrides',()=>{
  const bookmarks=[{name:'Example',url:'https://example.com'}];
  assert.deepEqual(browserSettings({bookmarks,engine:'https://www.google.com/search?q=',wServer:'wss://evil.example',PROXY_PASSWORD:'secret',token:'secret',aboutBlankAutoOpen:true}),{bookmarks,engine:'https://www.google.com/search?q='});
});
