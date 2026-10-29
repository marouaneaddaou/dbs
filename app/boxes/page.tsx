"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Info, Plus, Settings2, Trophy } from "lucide-react";
import type { BoxConfig, BoxGame } from "@/types/boxes";
import type { BoxGroupMemberships, BoxParticipant } from "@/types/participants";
import { STORAGE_KEYS } from "@/lib/storage";
import { uid } from "@/lib/storage";
import { createEmptyConfig, createGame, emptyBoxNumbers } from "@/lib/boxes";
import { markSaved } from "@/lib/shared/retention";
import {
  BOX_GROUPS,
  BOX_GROUP_IDS,
  createGroupConfig,
  withGroupParticipants,
  type BoxGroup,
} from "@/lib/box-groups";
import {
  membershipIdsForNames,
  membershipNamesForIds,
  registerParticipantNames,
  stringArraysEqual,
  syncParticipantDataForConfig,
} from "@/lib/participants";
import { useLocalStorage } from "@/lib/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { AdminGate } from "@/components/admin/AdminGate";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BoxGroups } from "@/components/boxes/BoxGroups";
import { BoxesList } from "@/components/boxes/BoxesList";
import { BoxSetup } from "@/components/boxes/BoxSetup";
import { BoxPlay } from "@/components/boxes/BoxPlay";
import { cn } from "@/lib/cn";

type Stage = "list" | "setup" | "play";

export default function BoxesPage() {
  return (
    <AdminGate
      title="Admin-Anmeldung"
      description="Gib das Admin-Passwort ein, um Boxspiele zu erstellen und zu spielen."
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
  const { value: participants, setValue: setParticipants } = useLocalStorage<BoxParticipant[]>(
    STORAGE_KEYS.boxParticipants,
    [],
  );
  const { value: memberships, setValue: setMemberships } = useLocalStorage<BoxGroupMemberships>(
    STORAGE_KEYS.boxGroupMembers,
    {},
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("list");
  const [confirmDelete, setConfirmDelete] = useState<BoxConfig | null>(null);

  const config = useMemo(
    () => configs.find((c) => c.id === selectedId) ?? null,
    [configs, selectedId],
  );

  const manualConfigs = useMemo(
    () => configs.filter((c) => !BOX_GROUP_IDS.has(c.id)),
    [configs],
  );

  const displayGroups = useMemo(
    () =>
      BOX_GROUPS.map((group) => {
        const ids = memberships[group.id];
        if (ids) return { ...group, names: membershipNamesForIds(participants, ids) };
        const existing = configs.find((config) => config.id === group.id);
        return existing ? { ...group, names: [...existing.participants] } : group;
      }),
    [configs, memberships, participants],
  );

  const setGame = useCallback(
    (next: BoxGame | ((prev: BoxGame) => BoxGame)) => {
      if (!config) return;
      setGames((prev) => {
        const current = prev[config.id] ?? createGame(config);
        const resolved = typeof next === "function" ? (next as (p: BoxGame) => BoxGame)(current) : next;
        if (resolved === prev[config.id]) return prev;
        return { ...prev, [config.id]: resolved };
      });
    },
    [config, setGames],
  );

  function updateConfig(next: BoxConfig) {
    const previous = configs.find((c) => c.id === next.id);
    setConfigs((prev) => prev.map((c) => (c.id === next.id ? next : c)));

    if (previous && stringArraysEqual(previous.participants, next.participants)) return;
    const synced = syncParticipantDataForConfig(
      next.id,
      next.participants,
      participants,
      memberships,
    );
    if (synced.participants !== participants) setParticipants(synced.participants);
    if (!stringArraysEqual(memberships[next.id] ?? [], synced.memberships[next.id])) {
      setMemberships(synced.memberships);
    }
  }

  function savedVersion(target: BoxConfig): BoxConfig {
    if (target.saveState !== "draft") return target;
    const next = markSaved(target);
    setConfigs((prev) => prev.map((c) => (c.id === next.id ? next : c)));
    return next;
  }

  function handleOpenGroup(group: BoxGroup) {
    const existing = configs.find((c) => c.id === group.id);
    const savedIds = memberships[group.id];
    const names =
      savedIds !== undefined
        ? membershipNamesForIds(participants, savedIds)
        : existing
          ? [...existing.participants]
          : [...group.names];
    const next = existing
      ? withGroupParticipants(existing, group, names)
      : createGroupConfig(group, Date.now(), names);

    const registry = registerParticipantNames(participants, names);
    if (registry !== participants) setParticipants(registry);
    if (savedIds === undefined) {
      setMemberships((prev) => ({
        ...prev,
        [group.id]: membershipIdsForNames(registry, names),
      }));
    }

    if (next !== existing) {
      setConfigs((prev) => {
        if (!existing) return [next, ...prev];
        return prev.map((c) => (c.id === group.id ? next : c));
      });
      setGames((prev) => {
        if (!(group.id in prev)) return prev;
        const updated = { ...prev };
        delete updated[group.id];
        return updated;
      });
    }

    setSelectedId(group.id);
    setStage("setup");
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
      const playable = savedVersion(target);
      setGames((prev) => {
        const existing = prev[id];
        // Editing the setup invalidates old progress, so start fresh.
        if (!existing || existing.updatedAt < playable.updatedAt || existing.configId !== id) {
          return { ...prev, [id]: { ...createGame(playable), status: "running" } };
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
      name: `${source.name} (Kopie)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConfigs((prev) => [copy, ...prev]);
    const registry = registerParticipantNames(participants, copy.participants);
    if (registry !== participants) setParticipants(registry);
    setMemberships((prev) => ({
      ...prev,
      [copy.id]: membershipIdsForNames(registry, copy.participants),
    }));
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
          eyebrow="Eigenständiges Spiel"
          title="Zufallsboxen"
          description="Erstelle Boxspiele, ziehe Teilnehmende fair und enthülle verborgene Inhalte. Keine Raumcodes nötig."
          icon={<Boxes className="h-6 w-6" />}
          action={
            <Button icon={<Plus className="h-4 w-4" />} onClick={handleNew}>
              Neues Spiel
            </Button>
          }
        />

        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-gold-200 bg-gold-50 p-4 text-sm text-gray-700">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
          <p>
            Jede Person ist pro Runde genau einmal an der Reihe – bei 40 Namen und 30 Boxen kommen die letzten 10 Namen automatisch in der nächsten Runde dran. „Runde wiederholen“ mischt nur die Boxinhalte neu und ändert nie die Reihenfolge der Teilnehmenden.
          </p>
        </div>

        <BoxGroups groups={displayGroups} onOpen={handleOpenGroup} />

        <BoxesList
          configs={manualConfigs}
          games={games}
          onNew={handleNew}
          onOpen={handleOpen}
          onDuplicate={handleDuplicate}
          onDelete={(id) => setConfirmDelete(configs.find((c) => c.id === id) ?? null)}
        />

        <ConfirmDialog
          open={!!confirmDelete}
          title="Dieses Spiel löschen?"
          description={confirmDelete ? `„${confirmDelete.name}„ und der gespeicherte Spielstand werden dauerhaft gelöscht.` : undefined}
          confirmLabel="Löschen"
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
        title={config.name || "Unbenanntes Spiel"}
        description="Bearbeite die Einrichtung und spiele dann. Entwürfe werden automatisch zwischengespeichert."
        icon={<Boxes className="h-6 w-6" />}
        action={
          <Button variant="ghost" onClick={() => setStage("list")}>
            Alle Spiele
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
          <Settings2 className="h-4 w-4" /> Einrichtung
        </button>
        <button
          type="button"
          onClick={() => {
            if (config.participants.length === 0) return;
            const playable = savedVersion(config);
            if (!game) {
              setGames((prev) => ({ ...prev, [config.id]: { ...createGame(playable), status: "running" } }));
            }
            setStage("play");
          }}
          disabled={config.participants.length === 0 || (config.boxCount > 0 && hasEmptyBox)}
          title={config.boxCount > 0 && hasEmptyBox ? "Bitte fülle zuerst jede Box mit Inhalt" : undefined}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            stage === "play" ? "bg-brand-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-900",
          )}
        >
          <Trophy className="h-4 w-4" /> Spielen
        </button>
      </div>

      {stage === "setup" ? (
        <BoxSetup
          config={config}
          onChange={updateConfig}
          onPlay={() => {
            const playable = savedVersion(config);
            setGames((prev) => ({ ...prev, [config.id]: { ...createGame(playable), status: "running" } }));
            setStage("play");
          }}
        />
      ) : game ? (
        <BoxPlay
          config={config}
          game={game}
          setGame={setGame}
          onExit={() => setStage("setup")}
        />
      ) : (
        <p className="text-sm text-gray-500">Füge in der Einrichtung Teilnehmende hinzu, um zu spielen.</p>
      )}
    </div>
  );
}
