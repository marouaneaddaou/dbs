"use client";

import { cn } from "@/lib/cn";

export interface PodiumEntry {
  id: string;
  name: string;
  points: number;
  rank: number;
  subtitle?: string;
}

const MEDALS: Record<number, { emoji: string; label: string; block: string; text: string }> = {
  1: {
    emoji: "🥇",
    label: "1. Platz · Gold",
    block: "from-gold-200 to-gold-50 border-gold-300",
    text: "text-gold-700",
  },
  2: {
    emoji: "🥈",
    label: "2. Platz · Silber",
    block: "from-gray-200 to-gray-50 border-gray-300",
    text: "text-gray-600",
  },
  3: {
    emoji: "🥉",
    label: "3. Platz · Bronze",
    block: "from-orange-200 to-orange-50 border-orange-300",
    text: "text-orange-700",
  },
};

function medalFor(rank: number) {
  return MEDALS[rank] ?? {
    emoji: `#${rank}`,
    label: `#${rank}`,
    block: "from-gray-100 to-white border-gray-200",
    text: "text-gray-500",
  };
}

/**
 * Winners' podium.
 *
 * - First place is rendered in the centre on the tallest block.
 * - Second place sits on the left, third on the right.
 * - Medals (🥇 🥈 🥉) follow the participant's real rank, so tied players all
 *   receive the same medal and a clear "Tie" marker.
 * - Fewer than three participants simply render the available winners.
 */
export function Podium({ entries }: { entries: PodiumEntry[] }) {
  const winners = entries.slice(0, 3);
  const hasTies = winners.some((w, i) => i > 0 && w.rank === winners[i - 1].rank);

  // Visual placement: [left, centre, right] -> [1, 0, 2]
  const placements: { entry: PodiumEntry; slot: "left" | "centre" | "right" }[] = [];
  if (winners.length === 1) {
    placements.push({ entry: winners[0], slot: "centre" });
  } else if (winners.length === 2) {
    placements.push({ entry: winners[1], slot: "left" });
    placements.push({ entry: winners[0], slot: "centre" });
  } else {
    placements.push({ entry: winners[1], slot: "left" });
    placements.push({ entry: winners[0], slot: "centre" });
    placements.push({ entry: winners[2], slot: "right" });
  }

  const heights = { left: "h-28 sm:h-32", centre: "h-40 sm:h-44", right: "h-20 sm:h-24" } as const;

  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6">
      {placements.map(({ entry, slot }, index) => {
        const medal = medalFor(entry.rank);
        const tied = winners.filter((w) => w.rank === entry.rank).length > 1;
        return (
          <div
            key={entry.id}
            className="flex w-24 flex-col items-center sm:w-32 animate-slide-up"
            style={{ animationDelay: `${index * 120}ms` }}
          >
            <span className="text-3xl leading-none sm:text-4xl" aria-hidden>
              {medal.emoji}
            </span>
            <p className="mt-2 w-full truncate text-center text-sm font-semibold text-ink-900">
              {entry.name}
            </p>
            <p className={cn("text-xs font-medium", medal.text)}>{medal.label}</p>
            {tied ? (
              <span className="mt-0.5 rounded-full bg-gold-50 px-2 py-0.5 text-[10px] font-semibold text-gold-700 ring-1 ring-gold-200">
                Gleichstand
              </span>
            ) : null}
            {entry.subtitle ? (
              <p className="mt-0.5 max-w-full truncate text-[11px] text-gray-500">{entry.subtitle}</p>
            ) : null}
            <p className="mb-2 mt-1 text-sm font-bold text-ink-900">{entry.points} Pkt.</p>
            <div
              className={cn(
                "flex w-full items-start justify-center rounded-t-xl border border-b-0 bg-gradient-to-b pt-2",
                heights[slot],
                medal.block,
              )}
            >
              <span className="text-xs font-bold text-gray-500">
                {slot === "centre" ? "1." : slot === "left" ? "2." : "3."}
              </span>
            </div>
          </div>
        );
      })}
      {hasTies ? (
        <p className="sr-only">Mehrere Gewinner haben denselben Punktestand.</p>
      ) : null}
    </div>
  );
}
