"use client";

import { Boxes, Copy, Gift, Play, Plus, Settings2, Trash2, Users } from "lucide-react";
import type { BoxConfig, BoxGame } from "@/types/boxes";
import { emptyBoxNumbers } from "@/lib/boxes";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export function BoxesList({
  configs,
  games,
  onNew,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  configs: BoxConfig[];
  games: Record<string, BoxGame>;
  onNew: () => void;
  onOpen: (id: string, play?: boolean) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (configs.length === 0) {
    return (
      <EmptyState
        icon={<Boxes className="h-7 w-7" />}
        title="No box games yet"
        description="Create your first game: set the number of boxes, add participants, and fill the boxes with questions, challenges or gifts."
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={onNew}>
            Create your first game
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {configs.map((config) => {
        const game = games[config.id];
        const status = game?.status ?? "idle";
        const hasEmptyBox = emptyBoxNumbers(config).length > 0;
        return (
          <div
            key={config.id}
            className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-50 text-gold-600 ring-1 ring-gold-200">
                <Gift className="h-5 w-5" />
              </span>
              <Badge
                tone={status === "running" ? "success" : status === "paused" ? "warning" : "neutral"}
              >
                {status === "idle" ? "not started" : status}
              </Badge>
            </div>
            <h3 className="mt-4 truncate text-lg font-semibold text-ink-900">{config.name || "Untitled game"}</h3>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <Boxes className="h-3.5 w-3.5" /> {config.boxCount} boxes
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> {config.participants.length} names
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5" /> {config.contents.length} contents
              </span>
            </div>

            <div className="mt-5 flex flex-1 items-end gap-2">
              <Button
                size="sm"
                className="flex-1"
                icon={<Play className="h-4 w-4" />}
                onClick={() => onOpen(config.id, true)}
                disabled={hasEmptyBox}
                title={hasEmptyBox ? "Fill every box with content first" : undefined}
              >
                Play
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<Settings2 className="h-4 w-4" />}
                onClick={() => onOpen(config.id, false)}
                aria-label="Edit"
              />
              <Button
                size="sm"
                variant="secondary"
                icon={<Copy className="h-4 w-4" />}
                onClick={() => onDuplicate(config.id)}
                aria-label="Duplicate"
              />
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => onDelete(config.id)}
                aria-label="Delete"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
