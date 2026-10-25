"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useHydrated } from "@/lib/hooks";
import { uid } from "@/lib/storage";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, { ring: string; icon: ReactNode }> = {
  success: { ring: "border-emerald-200", icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" /> },
  error: { ring: "border-brand-200", icon: <AlertTriangle className="h-5 w-5 text-brand-600" /> },
  info: { ring: "border-sky-200", icon: <Info className="h-5 w-5 text-sky-500" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const hydrated = useHydrated();

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = uid("toast");
      setItems((prev) => [...prev, { id, tone, message }]);
      window.setTimeout(() => remove(id), 4200);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (m: string) => toast(m, "success"),
      error: (m: string) => toast(m, "error"),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {hydrated
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-4 shadow-card animate-slide-up",
                    toneStyles[item.tone].ring,
                  )}
                >
                  {toneStyles[item.tone].icon}
                  <p className="flex-1 text-sm text-gray-800">{item.message}</p>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="text-gray-400 transition-colors hover:text-gray-700"
                    aria-label="Ausblenden"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Safe fallback so components never crash outside the provider.
    return {
      toast: () => undefined,
      success: () => undefined,
      error: () => undefined,
    };
  }
  return ctx;
}
