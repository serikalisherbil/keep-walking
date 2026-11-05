import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALENDAR_SESSION_KEY, createCalendarSession } from './calendar-session';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
test('Calendar access survives closing a tab and remains bound to its signed-in user', () => {
  const local = storage();
  createCalendarSession(() => local, storage, () => 100).save('owner', 'example-access', 1000);
  const reopened = createCalendarSession(() => local, storage, () => 200);
  assert.equal(reopened.token(null), null);
  assert.equal(reopened.token('different-user'), null);
  assert.equal(reopened.token('owner'), 'example-access');
});
test('Expired Calendar access is removed and never returned', () => {
  const local = storage(), tab = storage(); let now = 100;
  const session = createCalendarSession(() => local, () => tab, () => now);
  session.save('owner', 'example-access', 1000);
  now = 1000;
  assert.equal(session.token('owner'), null);
  assert.equal(local.getItem(CALENDAR_SESSION_KEY), null);
});
test('A previous tab session migrates without extending its expiry', () => {
  const local = storage(), tab = storage(); let now = 100;
  tab.setItem(CALENDAR_SESSION_KEY, JSON.stringify({ uid: 'owner', token: 'legacy-access', until: 500 }));
  const session = createCalendarSession(() => local, () => tab, () => now);
  assert.equal(session.token(null), null);
  assert.equal(session.token('owner'), 'legacy-access');
  assert.equal(tab.getItem(CALENDAR_SESSION_KEY), null);
  now = 500;
  assert.equal(session.token('owner'), null);
});
test('Disconnect clears persistent and legacy access for other open tabs too', () => {
  const local = storage(), tab = storage();
  const first = createCalendarSession(() => local, () => tab, () => 100);
  const second = createCalendarSession(() => local, storage, () => 100);
  first.save('owner', 'example-access', 1000);
  assert.equal(second.token('owner'), 'example-access');
  tab.setItem(CALENDAR_SESSION_KEY, local.getItem(CALENDAR_SESSION_KEY)!);
  first.clear();
  assert.equal(second.token('owner'), null);
  assert.equal(tab.getItem(CALENDAR_SESSION_KEY), null);
});
test('Unavailable storage falls back to the current session without crashing', () => {
  const unavailable = () => { throw new Error('Storage unavailable'); };
  const tab = storage();
  const session = createCalendarSession(unavailable, () => tab, () => 100);
  session.save('owner', 'example-access', 1000);
  assert.equal(session.token('owner'), 'example-access');
  const memory = createCalendarSession(unavailable, unavailable, () => 100);
  memory.save('owner', 'example-access', 1000);
  assert.equal(memory.token('owner'), 'example-access');
  memory.clear();
  assert.equal(memory.token('owner'), null);
});
test('Invalid saved data does not prevent a fresh connection', () => {
  const local = storage();
  local.setItem(CALENDAR_SESSION_KEY, '{broken');
  const session = createCalendarSession(() => local, storage, () => 100);
  assert.equal(session.token('owner'), null);
  session.save('owner', 'new-access', 1000);
  assert.equal(session.token('owner'), 'new-access');
});
