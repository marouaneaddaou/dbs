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
export function useLocalStorage<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [hydrated, setHydrated] = useState(false);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    setValue(readJSON<T>(key, fallback));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        writeJSON(keyRef.current, resolved);
        return resolved;
      });
    },
    [],
  );

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== keyRef.current) return;
      setValue(readJSON<T>(keyRef.current, fallback));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { value, setValue: update, hydrated } as const;
}
