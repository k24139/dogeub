import Tabs from '/src/components/loader/Tabs';
import Omnibox from '/src/components/loader/Omnibox';
import Viewer from '/src/components/loader/Viewer';
import Menu from '/src/components/loader/Menu';
import RemoteBrowser from '../components/RemoteBrowser';
import useReg from '../utils/hooks/loader/useReg';
import loaderStore from '/src/utils/hooks/loader/useLoaderStore';
import { process } from '/src/utils/hooks/loader/utils';
import { useOptions } from '../utils/optionsContext';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { browserSettings } from '../utils/browserBackend';

export default function Loader({ config = {} }) {
  return import.meta.env.VITE_SITES_HOSTED === true
    ? <RemoteBrowser destination={config.url} />
    : <ProxyBrowser config={config} />;
}

function ProxyBrowser({ config = {} }) {
  const location = useLocation();
  const url = config.url || location.state?.url || new URLSearchParams(location.search).get('url');
  const { ui = true, zoom, alerts = false } = config;
  const { ready, error } = useReg();
  const { options, updateOption } = useOptions();
  const tabs = loaderStore((state) => state.tabs);
  const updateUrl = loaderStore((state) => state.updateUrl);
  useEffect(() => {
    if (import.meta.env.VITE_PROXY_RUNTIME !== true || window.parent === window) return;
    let allowed = [];
    let settingsReceived = false;
    const receive = event => {
      if (event.source === window.parent && allowed.includes(event.origin) && event.data?.type === 'nutub:settings' && event.data.options && typeof event.data.options === 'object') {
        const next = browserSettings(event.data.options);
        const current = JSON.parse(localStorage.getItem('options') || '{}');
        if (Object.keys(next).some(key => JSON.stringify(current[key]) !== JSON.stringify(next[key]))) updateOption(next);
        settingsReceived = true;
      }
    };
    const publish = event => {
      if (!settingsReceived) return;
      const changed = Object.fromEntries(['bookmarks','quickLinks'].filter(key => key in event.detail).map(key => [key,event.detail[key]]));
      if (Object.keys(changed).length) for (const origin of allowed) window.parent.postMessage({type:'nutub:bookmarks',options:changed},origin);
    };
    window.addEventListener('nutub:options',publish);
    window.addEventListener('message',receive);
    fetch('/runtime-config').then(response => response.json()).then(config => {
      allowed = config.allowedParents || [];
      for (const origin of allowed) window.parent.postMessage({type:'nutub:ready'},origin);
    }).catch(() => {});
    return () => { window.removeEventListener('message',receive); window.removeEventListener('nutub:options',publish); };
  }, [updateOption]);
  const barStyle = {
    backgroundColor: options.barColor || '#09121e',
  };

  useEffect(() => {
    if (ready && url && tabs.length > 0) {
      //only 1 tab on initial load so tabs[0]
      const tab = tabs[0];
      const processedUrl = process(url, false, options.prType || 'auto', options.engine || undefined);
      if (processedUrl && tab.url !== processedUrl) {
        updateUrl(tab.id, processedUrl);
      }
    }
  }, [ready, url, updateUrl, options.prType, options.engine]);

  useEffect(() => {
    loaderStore.getState().clearStore({ showTb: options.showTb ?? true });
  }, []);

  if (error) return <div role="alert" className="p-6">Private Browser could not initialize: {error.message}. <button onClick={() => window.location.reload()} className="underline">Reload</button></div>;
  if (!ready) return <div role="status" className="p-6">Starting Private Browser…</div>;

  return (
    <div className="flex flex-col w-full h-screen">
      {ui && (
        <>
          <div 
            className="flex flex-col w-full" 
            style={barStyle}
            onClick={() => loaderStore.getState().showMenu && loaderStore.getState().toggleMenu()}
          >
            <Tabs />
            <Omnibox />
          </div>
          <Menu />
          {import.meta.env.VITE_PROXY_RUNTIME === true && <button className="self-end px-3 py-1 text-xs underline" onClick={async () => {
            const response = await fetch('/session/logout',{method:'POST'});
            if (response.ok) window.location.reload();
          }}>End browser session</button>}
          {import.meta.env.VITE_PROXY_RUNTIME === true && <a className="self-end px-3 text-xs underline" href="https://github.com/k24139/dogeub/tree/cleanup/sites-deployment" target="_blank" rel="noopener noreferrer">Source and license</a>}
        </>
      )}
      <div 
        className="flex-1 w-full"
        onClick={() => loaderStore.getState().showMenu && loaderStore.getState().toggleMenu()}
      >
        <Viewer conf={{ zoom: zoom, alerts: alerts }} />
      </div>
    </div>
  );
}
