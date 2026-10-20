"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, Info, Plus, Settings2, Trophy } from "lucide-react";
import type { BoxConfig, BoxGame } from "@/types/boxes";
import { STORAGE_KEYS } from "@/lib/storage";
import { uid } from "@/lib/storage";
import { createEmptyConfig, createGame, emptyBoxNumbers } from "@/lib/boxes";
import { useLocalStorage } from "@/lib/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { AdminGate } from "@/components/admin/AdminGate";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BoxesList } from "@/components/boxes/BoxesList";
import { BoxSetup } from "@/components/boxes/BoxSetup";
import { BoxPlay } from "@/components/boxes/BoxPlay";
import { cn } from "@/lib/cn";

type Stage = "list" | "setup" | "play";

export default function BoxesPage() {
  return (
    <AdminGate
      title="Admin login"
      description="Enter the admin password to create and play Random Boxes games."
    >
      <BoxesPageContent />
    </AdminGate>
  );
}

function BoxesPageContent() {
  const { value: configs, setValue: setConfigs, hydrated } = useLocalStorage<BoxConfig[]>(
    STORAGE_KEYS.boxConfigs,
    [],
  );
  const { value: games, setValue: setGames } = useLocalStorage<Record<string, BoxGame>>(
    STORAGE_KEYS.boxGames,
    {},
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("list");
  const [confirmDelete, setConfirmDelete] = useState<BoxConfig | null>(null);

  const config = useMemo(
    () => configs.find((c) => c.id === selectedId) ?? null,
    [configs, selectedId],
  );

  function updateConfig(next: BoxConfig) {
    setConfigs((prev) => prev.map((c) => (c.id === next.id ? next : c)));
  }

  function handleNew() {
    const config = createEmptyConfig();
    setConfigs((prev) => [config, ...prev]);
    setSelectedId(config.id);
    setStage("setup");
  }

  function handleOpen(id: string, play?: boolean) {
    setSelectedId(id);
    setStage(play ? "play" : "setup");
    if (play) {
      const target = configs.find((c) => c.id === id);
      if (!target) return;
      setGames((prev) => {
        const existing = prev[id];
        // Editing the setup invalidates old progress, so start fresh.
        if (!existing || existing.updatedAt < target.updatedAt || existing.configId !== id) {
          return { ...prev, [id]: { ...createGame(target), status: "running" } };
        }
        return prev;
      });
    }
  }

  function handleDuplicate(id: string) {
    const source = configs.find((c) => c.id === id);
    if (!source) return;
    const copy: BoxConfig = {
      ...source,
      id: uid("cfg"),
      name: `${source.name} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConfigs((prev) => [copy, ...prev]);
    setSelectedId(copy.id);
    setStage("setup");
  }

  function handleDelete() {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setConfigs((prev) => prev.filter((c) => c.id !== id));
    setGames((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (selectedId === id) {
      setSelectedId(null);
      setStage("list");
    }
    setConfirmDelete(null);
  }

  // Deep-link support:
  //   /boxes?config=ID&play=1  opens a saved game directly
  //   /boxes?new=1             creates a new game and opens the setup form
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      handleNew();
      window.history.replaceState(null, "", "/boxes");
      return;
    }
    const configId = params.get("config");
    if (!configId || !configs.some((c) => c.id === configId)) return;
    handleOpen(configId, params.get("play") === "1");
    window.history.replaceState(null, "", "/boxes");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="h-24 animate-pulse rounded-2xl border border-gray-200 bg-gray-50" />
      </div>
    );
  }

  // List view
  if (stage === "list" || !config) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <PageHeader
          eyebrow="Standalone game"
          title="Random Boxes"
          description="Create box games, draw participants fairly and reveal hidden contents. No room codes needed."
          icon={<Boxes className="h-6 w-6" />}
          action={
            <Button icon={<Plus className="h-4 w-4" />} onClick={handleNew}>
              New game
            </Button>
          }
        />

        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-gold-200 bg-gold-50 p-4 text-sm text-gray-700">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
          <p>
            Each participant gets exactly one turn per cycle — with 40 names and 30 boxes the last 10 names
            continue automatically into the next round. “Repeat round” only reshuffles box contents and never
            disrupts the participant order.
          </p>
        </div>

        <BoxesList
          configs={configs}
          games={games}
          onNew={handleNew}
          onOpen={handleOpen}
          onDuplicate={handleDuplicate}
          onDelete={(id) => setConfirmDelete(configs.find((c) => c.id === id) ?? null)}
        />

        <ConfirmDialog
          open={!!confirmDelete}
          title="Delete this game?"
          description={confirmDelete ? `“${confirmDelete.name}” and its saved progress will be removed from this browser.` : undefined}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      </div>
    );
  }

  const game = games[config.id];
  const hasEmptyBox = emptyBoxNumbers(config).length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        backHref={undefined}
        title={config.name || "Untitled game"}
        description="Edit the setup, then play. Everything saves automatically."
        icon={<Boxes className="h-6 w-6" />}
        action={
          <Button variant="ghost" onClick={() => setStage("list")}>
            All games
          </Button>
        }
      />

      <div className="mb-6 inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
        <button
          type="button"
          onClick={() => setStage("setup")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            stage === "setup" ? "bg-white text-ink-900 shadow-sm" : "text-gray-500 hover:text-gray-900",
          )}
        >
          <Settings2 className="h-4 w-4" /> Setup
        </button>
        <button
          type="button"
          onClick={() => {
            if (config.participants.length === 0) return;
            if (!game) {
              setGames((prev) => ({ ...prev, [config.id]: { ...createGame(config), status: "running" } }));
            }
            setStage("play");
          }}
          disabled={config.participants.length === 0 || hasEmptyBox}
          title={hasEmptyBox ? "Fill every box with content first" : undefined}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            stage === "play" ? "bg-brand-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-900",
          )}
        >
          <Trophy className="h-4 w-4" /> Play
        </button>
      </div>

      {stage === "setup" ? (
        <BoxSetup
          config={config}
          onChange={updateConfig}
          onPlay={() => {
            setGames((prev) => ({ ...prev, [config.id]: { ...createGame(config), status: "running" } }));
            setStage("play");
          }}
        />
      ) : game ? (
        <BoxPlay
          config={config}
          game={game}
          setGame={(next) =>
            setGames((prev) => {
              const current = prev[config.id] ?? createGame(config);
              const resolved = typeof next === "function" ? (next as (p: BoxGame) => BoxGame)(current) : next;
              return { ...prev, [config.id]: resolved };
            })
          }
          onExit={() => setStage("setup")}
        />
      ) : (
        <p className="text-sm text-gray-500">Add participants in Setup to begin playing.</p>
      )}
    </div>
  );
}
