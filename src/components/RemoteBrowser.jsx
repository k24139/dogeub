import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useOptions } from '../utils/optionsContext';
import { browserBackendOrigin, browserSettings } from '../utils/browserBackend';
import Nav from '../layouts/Nav';

export default function RemoteBrowser({ destination }) {
  const location = useLocation();
  const { options, updateOption } = useOptions();
  const frame = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('connecting');
  let backend = '', configurationError = '';
  try { backend = browserBackendOrigin(import.meta.env.VITE_PROXY_BACKEND_URL); }
  catch (error) { configurationError = error.message; }
  const input = destination || location.state?.url || '';
  const source = backend ? `${backend}/search?url=${encodeURIComponent(input)}` : '';
  useEffect(() => {
    if (!backend) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    setStatus('connecting');
    fetch(`${backend}/healthz`, {signal:controller.signal, credentials:'omit', cache:'no-store'})
      .then(async response => {
        const health = await response.json();
        if (!response.ok || health.protocol !== 'wisp' || health.auth !== 'required') throw new Error('Invalid backend');
        setStatus('connected');
      })
      .catch(() => { if (!controller.signal.aborted || !cancelled) setStatus('unavailable'); })
      .finally(() => clearTimeout(timer));
    let cancelled = false;
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [backend, attempt]);
  useEffect(() => {
    const send = () => frame.current?.contentWindow?.postMessage({type:'nutub:settings', options:browserSettings(options)}, backend);
    const receive = event => {
      if (event.origin !== backend || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'nutub:ready') send();
      if (event.data?.type === 'nutub:bookmarks' && event.data.options && typeof event.data.options === 'object') {
        const changed = Object.fromEntries(['bookmarks','quickLinks'].filter(key => Array.isArray(event.data.options[key]) && JSON.stringify(options[key]) !== JSON.stringify(event.data.options[key])).map(key => [key,event.data.options[key]]));
        if (Object.keys(changed).length) updateOption(changed);
      }
    };
    if (backend) { send(); window.addEventListener('message',receive); }
    return () => window.removeEventListener('message',receive);
  }, [backend, options, updateOption, source, attempt]);
  return (
    <div className="flex h-screen flex-col">
      <Nav />
      {!backend ? (
        <section className="m-6 rounded-xl border border-white/15 p-6" role="status">
          <h1 className="text-xl font-semibold">Private Browser setup pending</h1>
          <p className="mt-3">{configurationError || 'The browser backend has not been deployed and connected yet. Set VITE_PROXY_BACKEND_URL to its HTTPS origin, then rebuild this frontend.'}</p>
        </section>
      ) : <>
        {status !== 'connected' && <section className="border-b border-white/15 p-3 text-sm" role="status">
          {status === 'connecting' ? 'Connecting to Private Browser…' : 'The configured browser backend is unavailable or has rejected this Site origin.'}
          {status === 'unavailable' && <button className="ml-3 underline" onClick={() => setAttempt(value => value+1)}>Retry connection</button>}
        </section>}
        <iframe key={`${source}:${attempt}`} ref={frame} src={source} title="nutub Private Browser" className="min-h-0 w-full flex-1 border-0" allow="fullscreen" referrerPolicy="origin" />
      </>}
    </div>
  );
}
