import Tabs from '/src/components/loader/Tabs';
import Omnibox from '/src/components/loader/Omnibox';
import Viewer from '/src/components/loader/Viewer';
import Menu from '/src/components/loader/Menu';
import Nav from '../layouts/Nav';
import { AlertTriangle } from 'lucide-react';
import loaderStore from '/src/utils/hooks/loader/useLoaderStore';
import { process } from '/src/utils/hooks/loader/utils';
import { useOptions } from '../utils/optionsContext';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function Loader({ config = {} }) {
  return import.meta.env.VITE_SITES_HOSTED === true
    ? <HostedBrowsingNotice destination={config.url} />
    : <ProxyBrowser config={config} />;
}

function HostedBrowsingNotice({ destination }) {
  const location = useLocation();
  const { options } = useOptions();
  const input = destination || location.state?.url || '';
  const directUrl = getDirectUrl(input, options.engine);

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1 flex items-center justify-center p-6">
        <section className="max-w-xl rounded-2xl border border-white/10 bg-white/5 p-6 text-center shadow-xl">
          <AlertTriangle className="mx-auto mb-4" aria-hidden="true" />
          <h1 className="text-xl font-semibold">Private browsing needs a separate server</h1>
          <p className="mt-3 text-sm leading-6 text-gray-300">
            ChatGPT Sites can host DogeUB’s apps, games, bookmarks, and settings. Its runtime
            cannot run the persistent Node and raw TCP services used by the private browser.
            This feature stays available in self-hosted deployments. You can open a destination
            directly in a new tab, outside DogeUB’s private browser.
          </p>
          {directUrl && (
            <a
              className="mt-5 mr-2 inline-flex rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open destination directly
            </a>
          )}
          <a className="mt-5 inline-flex rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15" href="/">
            Return to DogeUB
          </a>
        </section>
      </main>
    </div>
  );
}

function getDirectUrl(input, engine) {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return null;

  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    url = null;
  }
  if (
    url &&
    (/^https?:\/\//i.test(value) || /^[\w-]+\.[\w.-]+(?:[/:?#]|$)/.test(value)) &&
    ['http:', 'https:'].includes(url.protocol)
  ) {
    return url.href;
  }

  const safeEngine = typeof engine === 'string' && /^https:\/\//i.test(engine)
    ? engine
    : 'https://www.google.com/search?q=';
  try {
    const url = new URL(`${safeEngine}${encodeURIComponent(value)}`);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function ProxyBrowser({ config = {} }) {
  const { url, ui = true, zoom, alerts = false } = config;
  const { options } = useOptions();
  const tabs = loaderStore((state) => state.tabs);
  const updateUrl = loaderStore((state) => state.updateUrl);
  const barStyle = {
    backgroundColor: options.barColor || '#09121e',
  };

  useEffect(() => {
    if (url && tabs.length > 0) {
      //only 1 tab on initial load so tabs[0]
      const tab = tabs[0];
      const processedUrl = process(url, false, options.prType || 'auto', options.engine || null);
      if (processedUrl && tab.url !== processedUrl) {
        updateUrl(tab.id, processedUrl);
      }
    }
  }, [url, tabs, updateUrl, options.prType]);

  useEffect(() => {
    loaderStore.getState().clearStore({ showTb: options.showTb ?? true });
  }, []);

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
