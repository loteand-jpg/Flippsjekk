/** Minimalt lagringsgrensesnitt (kompatibelt med localStorage). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys?(): string[];
}

export function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

/** localStorage med try/catch – faller tilbake til minne i privat modus eller ved blokkert lagring. */
export function browserStorage(): StorageLike {
  try {
    const ls = window.localStorage;
    const probe = '__flipprom_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      getItem: (k) => {
        try {
          return ls.getItem(k);
        } catch {
          return null;
        }
      },
      setItem: (k, v) => {
        ls.setItem(k, v);
      },
      removeItem: (k) => {
        try {
          ls.removeItem(k);
        } catch {
          /* ignorer */
        }
      },
      keys: () => {
        try {
          return Object.keys(ls);
        } catch {
          return [];
        }
      },
    };
  } catch {
    return memoryStorage();
  }
}
