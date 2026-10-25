"use client";

import { Gift, HelpCircle, Lightbulb, Sparkles, Target } from "lucide-react";
import type { BoxContent, BoxContentType } from "@/types/boxes";
import { cn } from "@/lib/cn";

export type GiftBoxState = "available" | "opening" | "opened" | "disabled";

const TYPE_META: Record<BoxContentType, { label: string; icon: typeof Gift; tone: string }> = {
  gift: { label: "Geschenk", icon: Gift, tone: "text-emerald-600" },
  question: { label: "Frage", icon: HelpCircle, tone: "text-sky-600" },
  challenge: { label: "Herausforderung", icon: Target, tone: "text-amber-600" },
  task: { label: "Aufgabe", icon: Lightbulb, tone: "text-violet-600" },
  text: { label: "Notiz", icon: Sparkles, tone: "text-gold-600" },
};

export function getTypeMeta(type: BoxContentType) {
  return TYPE_META[type] ?? TYPE_META.text;
}

export function GiftBox({
  index,
  state,
  content,
  onClick,
  disabled,
}: {
  index: number;
  state: GiftBoxState;
  content?: BoxContent;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const opened = state === "opened";
  const opening = state === "opening";
  const interactive = state === "available" && !disabled;

  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      aria-label={`Box Nummer ${index + 1}`}
      className={cn(
        "group relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-2xl border transition-all duration-300",
        interactive &&
          "cursor-pointer border-gray-200 bg-white shadow-card hover:-translate-y-1 hover:border-brand-400 hover:shadow-card-hover",
        state === "disabled" && "border-gray-200 bg-gray-50 opacity-60",
        opening && "border-brand-500 animate-box-shake",
        opened && "border-gray-200 bg-gray-50",
      )}
    >
      {!opened ? (
        <>
          <div className="absolute inset-x-3 top-3 h-4 rounded-md bg-gold-100" />
          <div className="absolute inset-x-0 top-7 h-8 bg-gold-50" />
          <div className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 bg-brand-600/80" />
          <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 bg-brand-600/80" />
          <div
            className={cn(
              "relative z-10 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-gold-600 shadow-sm ring-1 ring-gold-200",
              interactive && "transition-transform group-hover:scale-110",
            )}
          >
            <Gift className="h-6 w-6" />
          </div>
          <span className="relative z-10 mt-2 text-xs font-bold text-gray-600">#{index + 1}</span>
          {opening ? (
            <span className="absolute inset-0 animate-pulse-ring rounded-2xl border-2 border-brand-500" />
          ) : null}
        </>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center animate-scale-in">
          {content ? (
            <>
              {(() => {
                const meta = getTypeMeta(content.type);
                const Icon = meta.icon;
                return <Icon className={cn("h-5 w-5", meta.tone)} />;
              })()}
              <p className="line-clamp-3 px-1 text-[11px] font-medium leading-tight text-gray-800">
                {content.text}
              </p>
            </>
          ) : (
            <span className="text-[11px] text-gray-400">Leer</span>
          )}
          <span className="mt-1 text-[10px] font-bold text-gray-400">#{index + 1}</span>
        </div>
      )}
    </button>
  );
}
