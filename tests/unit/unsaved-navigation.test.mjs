import test from 'node:test';
import assert from 'node:assert/strict';
import { guardUnsavedNavigation } from '../../src/lib/unsaved-navigation.ts';

function fixture(answer = false) {
  const doc = new EventTarget();
  const win = new EventTarget();
  win.location = new URL('http://localhost/ac/template');
  win.navigation = new EventTarget();
  let prompts = 0;
  win.confirm = () => { prompts++; return answer; };
  const cleanup = guardUnsavedNavigation(win, doc, 'Discard unsaved template changes?');
  function link(href = '/ac/cycles', attributes = {}, modifiers = {}) {
    const anchor = { href: new URL(href, win.location).href, target: '', hasAttribute: () => false, ...attributes };
    const event = new Event('click', { cancelable: true });
    Object.defineProperties(event, {
      target: { value: { closest: () => anchor } },
      button: { value: 0 },
      ...Object.fromEntries(Object.entries(modifiers).map(([key, value]) => [key, { value }])),
    });
    doc.dispatchEvent(event);
    return event;
  }
  return { win, doc, link, cleanup, prompts: () => prompts };
}

test('Stay blocks sidebar/client links before router handlers and preserves the guard', () => {
  const f = fixture();
  let navigations = 0;
  f.doc.addEventListener('click', () => navigations++);
  assert.equal(f.link().defaultPrevented, true);
  assert.equal(f.link('/dashboard').defaultPrevented, true);
  assert.equal(navigations, 0);
  assert.equal(f.prompts(), 2);
  f.cleanup();
});

test('Discard allows navigation; cleanup after save/unmount removes every warning', () => {
  const f = fixture(true);
  assert.equal(f.link().defaultPrevented, false);
  assert.equal(f.prompts(), 1);
  f.cleanup();
  f.link();
  const unload = new Event('beforeunload', { cancelable: true });
  f.win.dispatchEvent(unload);
  assert.equal(unload.defaultPrevented, false);
  assert.equal(f.prompts(), 1);
});

test('hash, download, new-tab and modified clicks leave the current editor intact', () => {
  const f = fixture();
  f.link('#questions');
  f.link('/ac/cycles', { target: '_blank' });
  f.link('/download', { hasAttribute: name => name === 'download' });
  for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) f.link('/ac/cycles', {}, { [modifier]: true });
  f.link('https://example.com');
  assert.equal(f.prompts(), 0);
  f.cleanup();
});

test('refresh/close uses native unload protection', () => {
  const f = fixture();
  const event = new Event('beforeunload', { cancelable: true });
  f.win.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.prompts(), 0);
  f.cleanup();
});

test('cancelable Back/Forward can stay or discard without adding history entries', () => {
  for (const answer of [false, true]) {
    const f = fixture(answer);
    const event = new Event('navigate', { cancelable: true });
    Object.assign(event, { navigationType: 'traverse', destination: { url: 'http://localhost/dashboard' } });
    f.win.navigation.dispatchEvent(event);
    assert.equal(event.defaultPrevented, !answer);
    assert.equal(f.prompts(), 1);
    f.cleanup();
    f.win.navigation.dispatchEvent(event);
    assert.equal(f.prompts(), 1);
  }
});
