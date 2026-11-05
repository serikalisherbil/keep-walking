// Only short-lived Google access is stored here. Firebase manages sign-in separately.
export const CALENDAR_SESSION_KEY = 'keep-walking-calendar-session';
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Session = { uid: string; token: string; until: number };

export function createCalendarSession(persistent: StorageAccess, legacy: StorageAccess, now = Date.now) {
  let memory: Session | null = null;
  const remove = (storage: StorageAccess) => { try { storage().removeItem(CALENDAR_SESSION_KEY); } catch { /* Storage may be disabled. */ } };
  const write = (storage: StorageAccess, session: Session) => {
    try { storage().setItem(CALENDAR_SESSION_KEY, JSON.stringify(session)); return true; } catch { return false; }
  };
  function read(storage: StorageAccess): Session | null {
    try {
      const value = storage().getItem(CALENDAR_SESSION_KEY);
      if (!value) return null;
      const session = JSON.parse(value);
      if (typeof session?.uid === 'string' && typeof session.token === 'string' && session.token && Number.isFinite(session.until) && session.until > now()) return session;
    } catch { /* Ignore unavailable storage or invalid records. */ }
    remove(storage);
    return null;
  }
  return {
    token(uid: string | null | undefined): string | null {
      // Auth restoration is asynchronous; do not discard a session while it is pending.
      if (!uid) return null;
      const saved = read(persistent), old = read(legacy);
      const session = [saved, old, memory].filter((item): item is Session => !!item && item.uid === uid && item.until > now()).sort((a, b) => b.until - a.until)[0];
      if (!session) { memory = null; return null; }
      if (session === old && write(persistent, session)) remove(legacy);
      return session.token;
    },
    save(uid: string, token: string, until: number) {
      this.clear();
      if (!uid || !token || !Number.isFinite(until) || until <= now()) return;
      const session = { uid, token, until };
      if (!write(persistent, session) && !write(legacy, session)) memory = session;
    },
    clear() { memory = null; remove(persistent); remove(legacy); },
  };
}
