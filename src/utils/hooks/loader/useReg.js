import { useEffect, useState } from 'react';
import { useOptions } from '/src/utils/optionsContext';

let initialization;
let transportUrl;
async function initialize(wisp) {
  const [{ BareMuxConnection }, { makecodec }] = await Promise.all([
    import('bare-mux-fork'), import('./of'),
  ]);
  if (!window.scr) {
    if (!window.$scramjetLoadController) {
      const script = document.createElement('script');
      script.src = '/eggs/scramjet.all.js';
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error('Could not load the Scramjet runtime'));
        document.head.appendChild(script);
      });
    }
    const { ScramjetController } = window.$scramjetLoadController();
    window.scr = new ScramjetController({
      prefix:'/ham/', files:{wasm:'/eggs/scramjet.wasm.wasm',all:'/eggs/scramjet.all.js',sync:'/eggs/scramjet.sync.js'},
      flags:{rewriterLogs:false,scramitize:false,cleanErrors:true,sourcemaps:false}, codec:makecodec(),
    });
    await window.scr.init();
  }
  if (!navigator.serviceWorker) throw new Error('Service workers are unavailable in this browser context');
  for (const [path, scope] of [['/sw.js','/portal/k12/'],['/s_sw.js','/ham/']]) {
    const registration = await navigator.serviceWorker.register(path,{scope});
    const worker = registration.installing || registration.waiting || registration.active;
    if (worker?.state !== 'activated') await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(new Error('Proxy service worker activation timed out')),15000);
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') { clearTimeout(timer); resolve(); }
        else if (worker.state === 'redundant') { clearTimeout(timer); reject(new Error('Proxy service worker failed')); }
      });
    });
  }
  const connection = new BareMuxConnection(new URL('/baremux/worker.js',location.origin).href);
  await connection.setTransport('/libcurl/index.mjs',[{websocket:wisp,connections:[36,24,6]}]);
}
export default function useReg() {
  const { options } = useOptions();
  const hosted = import.meta.env.VITE_SITES_HOSTED === true;
  const runtime = import.meta.env.VITE_PROXY_RUNTIME === true;
  const wisp = (!runtime && options.wServer) || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/`;
  const [state,setState] = useState({ready:false,error:null});
  useEffect(() => {
    if (hosted) return;
    let active = true;
    setState({ready:false,error:null});
    if (!initialization || transportUrl !== wisp) {
      transportUrl = wisp;
      initialization = initialize(wisp);
    }
    initialization.then(() => { if (active) setState({ready:true,error:null}); })
      .catch(error => { if (active) setState({ready:false,error}); });
    return () => { active = false; };
  }, [hosted,wisp]);
  return state;
}
