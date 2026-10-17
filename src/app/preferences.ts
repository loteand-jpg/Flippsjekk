import { useEffect, useState } from 'react';

/**
 * Små visningspreferanser per bruker (filter, sortering, kolonner, valgt visning).
 * Lagres i nettleseren som bekvemmelighet – aldri tilstand som må være pålitelig.
 */
export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`flipprom.pref.${key}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    if (typeof fallback === 'object' && fallback !== null && !Array.isArray(fallback)) return { ...fallback, ...parsed };
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePref<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(`flipprom.pref.${key}`, JSON.stringify(value));
  } catch {
    /* privat modus / blokkert lagring */
  }
}

export function usePref<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readPref(key, fallback));
  useEffect(() => {
    setValue(readPref(key, fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => writePref(key, value), [key, value]);
  return [value, setValue];
}
