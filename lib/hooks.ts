"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readJSON, writeJSON } from "@/lib/storage";

/**
 * Returns false during SSR and the very first render, then true after the
 * component has mounted on the client. Use it to avoid hydration mismatches
 * when rendering localStorage-dependent UI.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}

/**
 * A localStorage-backed state hook.
 *
 * - Reads safely on mount (never during SSR).
 * - Keeps React state in sync so the UI updates immediately.
 * - Persists on every change.
 * - Re-syncs when another tab writes the same key.
 */
function valuesEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function useLocalStorage<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [hydrated, setHydrated] = useState(false);
  const keyRef = useRef(key);
  const fallbackRef = useRef(fallback);
  const valueRef = useRef<T>(fallback);
  keyRef.current = key;
  fallbackRef.current = fallback;

  useEffect(() => {
    const stored = readJSON<T>(key, fallbackRef.current);
    valueRef.current = stored;
    setValue((prev) => (valuesEqual(prev, stored) ? prev : stored));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = valueRef.current;
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      if (valuesEqual(resolved, prev)) return;
      valueRef.current = resolved;
      // Persist outside React's state updater. writeJSON dispatches storage
      // events synchronously, and doing that inside an updater can notify
      // other components while React is still rendering.
      writeJSON(keyRef.current, resolved);
      setValue(resolved);
    },
    [],
  );

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== keyRef.current) return;
      const next = readJSON<T>(keyRef.current, fallbackRef.current);
      if (valuesEqual(next, valueRef.current)) return;
      valueRef.current = next;
      setValue(next);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { value, setValue: update, hydrated } as const;
}
