import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import store from '../src/utils/hooks/loader/useLoaderStore.js';
import { mango, makecodec } from '../src/utils/hooks/loader/of.js';

test('Ultraviolet, Scramjet, and address-bar codecs agree and survive different origins',()=>{
  const target='https://example.com/a?q=hello%20world#section';
  const codec=makecodec();
  const encode=vm.runInNewContext(`(${codec.encode})`,{TextEncoder});
  const decode=vm.runInNewContext(`(${codec.decode})`,{TextEncoder,TextDecoder});
  const context={TextEncoder,TextDecoder,location:{host:'another.example',pathname:'/sw.js',href:'https://another.example/sw.js'},self:{}};
  vm.runInNewContext(readFileSync(new URL('../public/portal/uv.config.js',import.meta.url),'utf8'),context);
  const encoded=mango.enc(target);
  assert.equal(encode(target),encoded);
  assert.equal(context.self.__uv$config.encodeUrl(target),encoded);
  assert.equal(decode(encoded),target);
  assert.equal(context.self.__uv$config.decodeUrl(encoded),target);
  assert.equal(mango.dnc(encoded),target);
});

test('browser history supports back, forward, and replacing a forward branch',()=>{
  store.getState().clearStore({showTb:true});
  const id=store.getState().tabs[0].id;
  store.getState().updateUrl(id,'https://proxy.example/one');
  store.getState().updateUrl(id,'https://proxy.example/two');
  store.getState().goBack(id);
  assert.equal(store.getState().tabs[0].url,'https://proxy.example/one');
  store.getState().goForward(id);
  assert.equal(store.getState().tabs[0].url,'https://proxy.example/two');
  store.getState().goBack(id);
  store.getState().updateUrl(id,'https://proxy.example/three');
  assert.equal(store.getState().tabs[0].history.includes('https://proxy.example/two'),false);
});

test('tabs switch independently and refresh uses the active frame',()=>{
  store.getState().clearStore({showTb:true});
  const first=store.getState().tabs[0].id;
  store.getState().addTab({id:'second',url:'tabs://new',active:false,title:'New Tab'});
  store.getState().setActive('second');
  assert.equal(store.getState().tabs.filter(tab=>tab.active).length,1);
  assert.equal(store.getState().tabs.find(tab=>tab.id===first).active,false);
  let refreshed=0;
  store.getState().setFrameRefs({current:{second:{contentWindow:{location:{reload:()=>refreshed++}}}}});
  store.getState().refreshTab('second');
  assert.equal(refreshed,1);
  store.getState().setLastActive('second');
  store.getState().removeTab('second');
  assert.equal(store.getState().tabs[0].active,true);
});
