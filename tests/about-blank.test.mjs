import test from 'node:test';
import assert from 'node:assert/strict';
import { openAboutBlankPopup, shouldOpenAboutBlank } from '../src/utils/aboutBlank.js';

class Element {
  constructor(tag) { this.tag = tag; this.style = {}; this.children = []; this.events = {}; }
  setAttribute(name, value) { this[name] = value; }
  append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
  addEventListener(name, handler) { this.events[name] = handler; }
  focus() { globalThis.document.activeElement = this; }
  remove() { this.parent.children = this.parent.children.filter(item => item !== this); }
}
const makeDocument = () => {
  const doc = {
    title: 'Google Classroom', documentElement: new Element('html'),
    head: new Element('head'), body: new Element('body'),
    createElement: tag => new Element(tag),
    getElementById(id) {
      const find = node => node.id === id ? node : node.children.map(find).find(Boolean);
      return find(doc.body);
    },
  };
  return doc;
};
function setup(blocked) {
  const doc = makeDocument();
  const popup = {
    document: makeDocument(), events: {}, closed: false,
    setInterval(fn) { this.tick = fn; return 1; },
    clearInterval() {}, addEventListener(name, fn) { this.events[name] = fn; },
  };
  const calls = [];
  const win = {
    location: { href: 'https://example.test/settings?view=tab' },
    open(...args) { calls.push(args); return blocked ? null : popup; },
  };
  globalThis.window = win;
  globalThis.document = doc;
  return { doc, popup, win, calls };
}

test('startup defaults on and respects an explicit off choice', () => {
  assert.equal(shouldOpenAboutBlank(), true);
  assert.equal(shouldOpenAboutBlank({aboutBlank: false}), true);
  assert.equal(shouldOpenAboutBlank({aboutBlankAutoOpen: true}), true);
  assert.equal(shouldOpenAboutBlank({aboutBlankAutoOpen: false}), false);
});

test('allowed popup embeds the exact route and keeps the original tab', () => {
  const {popup, win, calls} = setup(false);
  assert.equal(openAboutBlankPopup(), true);
  assert.deepEqual(calls, [['about:blank', '_blank']]);
  assert.equal(popup.document.body.children[0].src, win.location.href);
  assert.equal(popup.document.body.children[0].title, 'nutub');
  assert.equal(popup.document.title, 'Google Classroom');
  assert.equal(popup.document.head.children[0].href, 'https://example.test/classroom.png');
  assert.equal(win.location.href, 'https://example.test/settings?view=tab');
});

test('blocked automatic popup offers one dialog and a working gesture retry', () => {
  const {doc, popup, win} = setup(true);
  assert.equal(openAboutBlankPopup(), false);
  assert.equal(openAboutBlankPopup(), false);
  assert.equal(doc.body.children.length, 1);
  const panel = doc.body.children[0].children[0];
  assert.equal(panel.role, 'dialog');
  const open = panel.children[2];
  assert.equal(doc.activeElement, open);
  win.open = () => popup;
  open.onclick();
  assert.equal(doc.body.children.length, 0);
  assert.equal(popup.document.body.children[0].src, win.location.href);
});

test('blocked retry stays in the dialog and Continue here dismisses it', () => {
  const {doc} = setup(true);
  openAboutBlankPopup();
  const panel = doc.body.children[0].children[0];
  panel.children[2].onclick();
  assert.match(panel.children[1].textContent, /still blocked/);
  assert.equal(doc.body.children.length, 1);
  panel.children[3].onclick();
  assert.equal(doc.body.children.length, 0);
});

test('about:blank follows embedded tab metadata using absolute icon URLs', () => {
  const {popup} = setup(false);
  openAboutBlankPopup();
  const frame = popup.document.body.children[0];
  frame.contentDocument = {
    title: 'Saved custom tab',
    querySelector: () => ({getAttribute: () => '/custom-icon.png'}),
  };
  popup.tick();
  assert.equal(popup.document.title, 'Saved custom tab');
  assert.equal(popup.document.head.children[0].href, 'https://example.test/custom-icon.png');
});
