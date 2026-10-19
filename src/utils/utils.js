import { openAboutBlankPopup, shouldOpenAboutBlank } from './aboutBlank.js';
export { openAboutBlankPopup } from './aboutBlank.js';
import pkg from '../../package.json';
let blur, focus, panicListener;

export const resetInstance = () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => registrations.forEach((reg) => reg.unregister()));
  }
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  }
  localStorage.clear();
  sessionStorage.clear();
  location.href = '/';
};

export const ckOff = () => {
  const op = JSON.parse(localStorage.options || '{}');
  import('./config.js').then(({ meta }) => {
    const { tabName: t, tabIcon: i } = op;
    const { tabName: ogName, tabIcon: ogIcon } = meta[0].value;
    const set = (title, icon) => {
      document.title = title;
      document.querySelector("link[rel~='icon']")?.setAttribute('href', icon);
    };
    blur && window.removeEventListener('blur', blur);
    focus && window.removeEventListener('focus', focus);
    if (op.clkOff) {
      set(t, i);
      blur = () => {
        const op = JSON.parse(localStorage.options || '{}');
        set(op.tabName || ogName, op.tabIcon || ogIcon);
      };
      focus = () => set(ogName, ogIcon);
      window.addEventListener('blur', blur);
      window.addEventListener('focus', focus);
      set(ogName, ogIcon);
    } else {
      set(t || ogName, i || ogIcon);
      blur = focus = null;
    }
  });
};

export const panic = () => {
  const op = JSON.parse(localStorage.options || '{}');
  const panicConfig = op.panic;
  if (panicListener) {
    window.removeEventListener('keydown', panicListener);
    panicListener = null;
  }
  if (panicConfig?.key && panicConfig?.url && !!op.panicToggleEnabled) {
    panicListener = (e) => {
      const combo = [];
      if (e.ctrlKey) combo.push('Ctrl');
      if (e.altKey) combo.push('Alt');
      if (e.shiftKey) combo.push('Shift');
      if (e.metaKey) combo.push('Meta');
      combo.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);

      const pressed = combo.join('+');
      if (pressed === panicConfig.key) {
        e.preventDefault();
        window.location.href = panicConfig.url;
      }
    };

    window.addEventListener('keydown', panicListener);
  }
};

export const check = (() => {
  const op = JSON.parse(localStorage.options || '{}');
  !op.version && localStorage.setItem('options', JSON.stringify({ ...op, version: pkg.version }));
  if (op.beforeUnload) {
    window.addEventListener('beforeunload', (e) => {
      e.preventDefault();
      e.returnValue = '';
    });
  }
  const openOnStartup = shouldOpenAboutBlank(op);
  if (window.top === window.self && openOnStartup) {
    openAboutBlankPopup();
  }

  ckOff();
  panic();
})();