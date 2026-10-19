export const shouldOpenAboutBlank = (options = {}) => options.aboutBlankAutoOpen !== false;

const showPopupFallback = () => {
  if (document.getElementById('about-blank-startup')) return;
  const overlay = document.createElement('div');
  overlay.id = 'about-blank-startup';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '10000', display: 'grid',
    placeItems: 'center', padding: '20px', background: '#080d18cc',
  });
  const panel = document.createElement('section');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'about-blank-heading');
  Object.assign(panel.style, {
    width: 'min(100%, 380px)', padding: '26px', borderRadius: '18px',
    background: '#18283e', color: '#edf3fc', boxShadow: '0 20px 70px #0006',
    fontFamily: 'system-ui, sans-serif',
  });
  const heading = document.createElement('h2');
  heading.id = 'about-blank-heading';
  heading.textContent = 'Open nutub in about:blank';
  Object.assign(heading.style, { fontSize: '20px', fontWeight: '700', margin: '0 0 12px' });
  const message = document.createElement('p');
  message.textContent = 'Your browser blocked the automatic tab. Open it below, or allow popups for this site on future visits.';
  Object.assign(message.style, { fontSize: '14px', lineHeight: '1.6', margin: '0 0 20px' });
  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.textContent = 'Open about:blank';
  const continueButton = document.createElement('button');
  continueButton.type = 'button';
  continueButton.textContent = 'Continue here';
  for (const button of [openButton, continueButton]) {
    Object.assign(button.style, {
      width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #667d9c',
      background: '#30496c', color: '#fff', fontSize: '14px', cursor: 'pointer', marginTop: '8px',
    });
  }
  continueButton.style.background = 'transparent';
  openButton.onclick = () => {
    if (openAboutBlankPopup(false)) overlay.remove();
    else message.textContent = 'The tab is still blocked. Allow popups for this site, then try again, or continue here.';
  };
  continueButton.onclick = () => overlay.remove();
  panel.append(heading, message, openButton, continueButton);
  panel.onkeydown = (event) => {
    if (event.key === 'Escape') overlay.remove();
    if (event.key === 'Tab') {
      event.preventDefault();
      (document.activeElement === openButton ? continueButton : openButton).focus();
    }
  };
  overlay.append(panel);
  document.body.append(overlay);
  openButton.focus();
};

export const openAboutBlankPopup = (showFallback = true) => {
  const win = window.open('about:blank', '_blank');
  if (!win || win.closed) {
    if (showFallback) showPopupFallback();
    return false;
  }
  const doc = win.document;
  doc.documentElement.style.height = '100%';
  Object.assign(doc.body.style, { margin: '0', height: '100vh', overflow: 'hidden' });
  doc.title = document.title || 'Google Classroom';
  const icon = doc.createElement('link');
  icon.rel = 'icon';
  icon.href = new URL('/classroom.png', window.location.href).href;
  const frame = doc.createElement('iframe');
  frame.src = window.location.href;
  frame.title = 'nutub';
  frame.allowFullscreen = true;
  Object.assign(frame.style, { width: '100%', height: '100%', border: 'none', display: 'block' });
  doc.head.append(icon);
  doc.body.append(frame);
  const syncTab = () => {
    try {
      const source = frame.contentDocument;
      if (!source) return;
      doc.title = source.title || 'Google Classroom';
      const sourceIcon = source.querySelector("link[rel~='icon']");
      if (sourceIcon) icon.href = new URL(sourceIcon.getAttribute('href'), frame.src).href;
    } catch { /* Keep the default tab metadata if an external page is opened. */ }
  };
  frame.addEventListener('load', syncTab);
  const timer = win.setInterval(syncTab, 800);
  win.addEventListener('pagehide', () => win.clearInterval(timer), { once: true });
  return true;
};
