import { InjectionToken } from '@angular/core';

export interface GameTabLease {
  isOwner(): boolean;
  release(): void;
}

/** Browser effects are a small injectable seam for deterministic gameplay tests. */
export interface GameBrowserPort {
  now(): number;
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
  randomBytes(size: number): Uint8Array;
  randomUUID(): string;
  visible(): boolean;
  every(callback: () => void, milliseconds: number): () => void;
  onActivity(callback: () => void): () => void;
  onStorage(callback: (key: string | null) => void): () => void;
  acquireLock(): Promise<GameTabLease | null>;
}

const LOCK_NAME = 'math24.game.editor';
const LEASE_KEY = 'math24.game.editorLease';
const LEASE_MS = 12_000;

function browserPort(): GameBrowserPort {
  return {
    now: () => Date.now(),
    read: (key) => localStorage.getItem(key),
    write: (key, value) => localStorage.setItem(key, value),
    remove: (key) => localStorage.removeItem(key),
    randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
    randomUUID: () => crypto.randomUUID(),
    visible: () => document.visibilityState === 'visible',
    every(callback, milliseconds) {
      const handle = window.setInterval(callback, milliseconds);
      return () => window.clearInterval(handle);
    },
    onActivity(callback) {
      document.addEventListener('visibilitychange', callback);
      window.addEventListener('focus', callback);
      return () => {
        document.removeEventListener('visibilitychange', callback);
        window.removeEventListener('focus', callback);
      };
    },
    onStorage(callback) {
      const handler = (event: StorageEvent) => callback(event.key);
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
    acquireLock() {
      if (navigator.locks) {
        return new Promise<GameTabLease | null>((resolve, reject) => {
          navigator.locks
            .request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
              if (!lock) {
                resolve(null);
                return;
              }
              let owned = true;
              await new Promise<void>((releaseLock) => {
                resolve({
                  isOwner: () => owned,
                  release: () => {
                    owned = false;
                    releaseLock();
                  },
                });
              });
            })
            .catch(reject);
        });
      }
      return Promise.resolve(acquireStorageLease());
    },
  };
}

/** Best-effort older-browser fallback. Loss or expiry blocks the previous editor. */
function acquireStorageLease(): GameTabLease | null {
  const owner = crypto.randomUUID();
  const read = (): { owner: string; expiresAt: number } | null => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(LEASE_KEY) ?? 'null');
      if (
        value &&
        typeof value === 'object' &&
        'owner' in value &&
        'expiresAt' in value &&
        typeof value.owner === 'string' &&
        typeof value.expiresAt === 'number'
      ) {
        return { owner: value.owner, expiresAt: value.expiresAt };
      }
    } catch {
      // A malformed lease can be replaced; game state uses separate keys.
    }
    return null;
  };
  const previous = read();
  if (previous && previous.expiresAt > Date.now()) {
    return null;
  }
  const write = () =>
    localStorage.setItem(LEASE_KEY, JSON.stringify({ owner, expiresAt: Date.now() + LEASE_MS }));
  write();
  let released = false;
  const isOwner = () => {
    const lease = read();
    return !released && lease?.owner === owner && lease.expiresAt > Date.now();
  };
  if (!isOwner()) {
    return null;
  }
  const heartbeat = window.setInterval(() => {
    if (!isOwner()) {
      released = true;
      window.clearInterval(heartbeat);
      return;
    }
    try {
      write();
    } catch {
      released = true;
      window.clearInterval(heartbeat);
    }
  }, 3000);
  return {
    isOwner,
    release() {
      window.clearInterval(heartbeat);
      try {
        if (read()?.owner === owner) {
          localStorage.removeItem(LEASE_KEY);
        }
      } catch {
        // The lease still expires if storage was disabled before closing.
      } finally {
        released = true;
      }
    },
  };
}

export const GAME_BROWSER = new InjectionToken<GameBrowserPort>('GAME_BROWSER', {
  providedIn: 'root',
  factory: browserPort,
});
