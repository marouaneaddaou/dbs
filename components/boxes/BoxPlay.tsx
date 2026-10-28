"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Dices,
  Gift,
  History,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  SkipForward,
  Trophy,
  Users,
} from "lucide-react";
import type { BoxConfig, BoxGame, BoxSelection } from "@/types/boxes";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { GiftBox } from "@/components/GiftBox";
import { useToast } from "@/components/ui/Toast";
import {
  allBoxesOpened,
  drawParticipant,
  openBox,
  pauseGame,
  remainingThisCycle,
  repeatRound,
  resetGame,
  resumeGame,
  startGame,
} from "@/lib/boxes";

function contentLabel(type: string): string {
  const labels: Record<string, string> = {
    gift: "Geschenk",
    question: "Frage",
    challenge: "Herausforderung",
    task: "Aufgabe",
    text: "Text",
  };
  return labels[type] ?? type;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    idle: "Nicht gestartet",
    running: "Läuft",
    paused: "Pausiert",
    finished: "Beendet",
  };
  return labels[status] ?? status;
}

export function BoxPlay({
  config,
  game,
  setGame,
  onExit,
}: {
  config: BoxConfig;
  game: BoxGame;
  setGame: (next: BoxGame | ((prev: BoxGame) => BoxGame)) => void;
  onExit: () => void;
}) {
  const toast = useToast();
  const [drawing, setDrawing] = useState(false);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [openingIndex, setOpeningIndex] = useState<number | null>(null);
  const [reveal, setReveal] = useState<BoxSelection | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => window.clearTimeout(t));
      pending.forEach((t) => window.clearInterval(t));
    };
  }, []);

  useEffect(() => {
    if (config.boxCount === 0) {
      setGame((prev) => {
        if (prev.zeroBoxDrawn === undefined || prev.zeroBoxRound === undefined) {
          return {
            ...prev,
            zeroBoxDrawn: prev.zeroBoxDrawn || [],
            zeroBoxRound: prev.zeroBoxRound || 1,
            updatedAt: Date.now(),
          };
        }
        return prev;
      });
    }
  }, [config.boxCount, setGame]);

  const openedCount = config.boxCount - game.availableBoxes.length;
  const remaining = remainingThisCycle(game);
  const exhausted = allBoxesOpened(game);

  const historyByLatest = useMemo(() => game.history.slice().reverse(), [game.history]);

  function handleStart() {
    if (config.participants.length === 0) {
      toast.error("Füge zuerst in der Einrichtung Teilnehmende hinzu.");
      return;
    }
    setGame((prev) => startGame(prev, config));
    toast.success("Spiel gestartet. Ziehe die erste teilnehmende Person.");
  }

  function handleDraw() {
    if (config.participants.length === 0) {
      toast.error("Es sind keine Teilnehmenden zum Ziehen vorhanden.");
      return;
    }

    if (config.boxCount === 0) {
      setDrawing(true);
      const names = config.participants;
      const interval = window.setInterval(() => {
        const drawn = (game.zeroBoxDrawn || []);
        const available = names.filter((n) => !drawn.includes(n));
        const pool = available.length > 0 ? available : names;
        setPreviewName(pool[Math.floor(Math.random() * pool.length)] ?? "");
      }, 70);
      const timeout = window.setTimeout(() => {
        window.clearInterval(interval);
        setGame((prev) => {
          const drawn = prev.zeroBoxDrawn || [];
          const available = names.filter((n) => !drawn.includes(n));
          if (available.length === 0) {
            const shuffledPool = [...names].sort(() => Math.random() - 0.5);
            const chosen = shuffledPool[0] ?? null;
            const newDrawn = chosen ? [chosen] : [];
            const newRound = (prev.zeroBoxRound || 0) + 1;
            setPreviewName(null);
            setDrawing(false);
            toast.toast("Neuer Durchlauf gestartet – alle kommen wieder dran.", "info");
            return {
              ...prev,
              currentParticipant: chosen,
              phase: chosen ? "selecting" : prev.phase,
              status: prev.status === "idle" ? "running" : prev.status,
              zeroBoxDrawn: newDrawn,
              zeroBoxRound: newRound,
              updatedAt: Date.now(),
            };
          }
          const shuffledPool = [...available].sort(() => Math.random() - 0.5);
          const chosen = shuffledPool[0] ?? null;
          const newDrawn = chosen ? [...drawn, chosen] : drawn;
          setPreviewName(null);
          setDrawing(false);
          return {
            ...prev,
            currentParticipant: chosen,
            phase: chosen ? "selecting" : prev.phase,
            status: prev.status === "idle" ? "running" : prev.status,
            zeroBoxDrawn: newDrawn,
            zeroBoxRound: prev.zeroBoxRound || 1,
            updatedAt: Date.now(),
          };
        });
      }, 950);
      timers.current.push(interval, timeout);
      return;
    }

    if (game.status !== "running") {
      toast.error("Starte oder setze das Spiel zuerst fort.");
      return;
    }
    if (exhausted) {
      toast.error("Alle Boxen sind offen. Nutze „Runde wiederholen“, um sie neu zu füllen.");
      return;
    }
    const result = drawParticipant(game, config);
    if (!result.participant) {
      toast.error("Es sind keine Teilnehmenden zum Ziehen vorhanden.");
      return;
    }

    setDrawing(true);
    const names = config.participants;
    const interval = window.setInterval(() => {
      setPreviewName(names[Math.floor(Math.random() * names.length)] ?? "");
    }, 70);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      setPreviewName(null);
      setDrawing(false);
      setGame(result.game);
      if (result.newCycle) {
        toast.toast("Neuer Durchlauf gestartet – alle kommen wieder der Reihe nach dran.", "info");
      }
    }, 950);
    timers.current.push(interval, timeout);
  }

  function handleBoxClick(index: number) {
    if (game.status !== "running" || game.phase !== "selecting" || !game.currentParticipant) return;
    if (openingIndex !== null) return;
    const result = openBox(game, config, index);
    if (result.error || !result.selection) {
      toast.error(result.error ?? "Diese Box konnte nicht geöffnet werden.");
      return;
    }
    setOpeningIndex(index);
    const timeout = window.setTimeout(() => {
      setGame(result.game);
      setOpeningIndex(null);
      setReveal(result.selection);
    }, 550);
    timers.current.push(timeout);
  }

  function handleRepeatRound() {
    setGame((prev) => repeatRound(prev, config));
    toast.success("Die Boxen wurden mit neuen Inhalten gefüllt. Die Reihenfolge der Teilnehmenden bleibt gleich.");
  }

  function handleReset() {
    if (config.boxCount === 0) {
      setGame((prev) => ({
        ...resetGame(config),
        zeroBoxDrawn: [],
        zeroBoxRound: 1,
      }));
      setConfirmReset(false);
      setReveal(null);
      setPreviewName(null);
      toast.success("Spiel zurA�ckgesetzt.");
      return;
    }
    setGame(resetGame(config));
    setConfirmReset(false);
    setReveal(null);
    setPreviewName(null);
    toast.success("Spiel zurA�ckgesetzt.");
  }

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          {config.boxCount === 0 ? (
            <>
              <Badge tone="brand">Namenslotterie</Badge>
              <Badge tone="neutral">
                <Users className="h-3 w-3" /> {config.participants.length} Teilnehmende
              </Badge>
            </>
          ) : (
            <>
              <Badge tone={game.status === "running" ? "success" : game.status === "paused" ? "warning" : "neutral"}>
                {statusLabel(game.status)}
              </Badge>
              <Badge tone="brand">Runde {game.round}</Badge>
              <Badge tone="info">Durchlauf {game.cycle}</Badge>
              <Badge tone="neutral">
                <Users className="h-3 w-3" /> {remaining} in diesem Durchlauf übrig
              </Badge>
              <Badge tone="neutral">
                <Gift className="h-3 w-3" /> {game.availableBoxes.length} von {config.boxCount} Boxen übrig
              </Badge>
            </>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            {config.boxCount === 0 ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<RotateCcw className="h-4 w-4" />}
                  onClick={() => setConfirmReset(true)}
                >
                  Neue Runde
                </Button>
                <Button size="sm" variant="ghost" onClick={onExit}>
                  Einrichtung
                </Button>
              </>
            ) : (
              <>
                {game.status === "idle" ? (
                  <Button size="sm" icon={<Play className="h-4 w-4" />} onClick={handleStart}>
                    Spiel starten
                  </Button>
                ) : null}
                {game.status === "running" ? (
                  <Button size="sm" variant="secondary" icon={<Pause className="h-4 w-4" />} onClick={() => setGame(pauseGame(game))}>
                    Pausieren
                  </Button>
                ) : null}
                {game.status === "paused" ? (
                  <Button size="sm" icon={<Play className="h-4 w-4" />} onClick={() => setGame(resumeGame(game))}>
                    Fortsetzen
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Repeat className="h-4 w-4" />}
                  onClick={handleRepeatRound}
                  disabled={openedCount === 0}
                >
                  Runde wiederholen
                </Button>
                <Button size="sm" variant="danger" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirmReset(true)}>
                  Zurücksetzen
                </Button>
                <Button size="sm" variant="ghost" onClick={onExit}>
                  Einrichtung
                </Button>
              </>
            )}
          </div>
        </CardBody>
      </Card>

      <div className={config.boxCount === 0 ? "" : "grid gap-6 lg:grid-cols-[1.6fr_1fr]"}>
        {/* Board */}
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardBody className="space-y-5">
              {/* Turn / draw area */}
              {config.boxCount === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center">
                  <div className="space-y-4">
                    {drawing ? (
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Los wird gezogen…</p>
                        <p className="mt-2 text-3xl font-extrabold text-gold-600 sm:text-4xl">{previewName}</p>
                      </div>
                    ) : game.currentParticipant ? (
                      <div className="animate-scale-in">
                        <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Gezogen</p>
                        <p className="mt-2 text-3xl font-extrabold text-ink-900 sm:text-4xl">{game.currentParticipant}</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Namenslotterie</p>
                        <p className="mt-2 text-2xl font-bold text-ink-900">Ziehe einen Namen aus der Liste</p>
                      </div>
                    )}

                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        icon={<Dices className="h-4 w-4" />}
                        onClick={handleDraw}
                        disabled={drawing || config.participants.length === 0}
                      >
                        Random
                      </Button>
                    </div>
                    {config.participants.length === 0 ? (
                      <p className="text-xs text-gray-500">Keine Teilnehmenden vorhanden.</p>
                    ) : null}
                  </div>
                </div>
              ) : (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-center">
                {game.status === "idle" ? (
                  <p className="py-4 text-sm text-gray-500">
                    Drücke <span className="font-semibold text-ink-900">Spiel starten</span>, um das Spielfeld zu aktivieren.
                  </p>
                ) : game.phase === "selecting" && game.currentParticipant ? (
                  <div className="animate-scale-in">
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Jetzt wählt</p>
                    <p className="mt-2 text-3xl font-extrabold text-ink-900 sm:text-4xl">{game.currentParticipant}</p>
                    <p className="mt-2 text-sm text-gold-700">
                      Wähle unten eine noch geschlossene Box, um ihren Inhalt zu enthüllen.
                    </p>
                  </div>
                ) : drawing ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Teilnehmende Person wird gezogen…</p>
                    <p className="mt-2 text-3xl font-extrabold text-gold-600 sm:text-4xl">{previewName}</p>
                  </div>
                ) : game.phase === "revealed" ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Zug abgeschlossen</p>
                    <p className="mt-2 text-2xl font-bold text-ink-900">Bereit für die nächste Person</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Als Nächstes</p>
                    <p className="mt-2 text-2xl font-bold text-ink-900">Ziehe eine zufällige Person</p>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button
                    icon={<Dices className="h-4 w-4" />}
                    onClick={handleDraw}
                    disabled={
                      game.status !== "running" ||
                      !!game.currentParticipant ||
                      drawing ||
                      exhausted ||
                      config.participants.length === 0
                    }
                  >
                    Person ziehen
                  </Button>
                  {game.phase === "revealed" && !exhausted ? (
                    <Button variant="secondary" icon={<SkipForward className="h-4 w-4" />} onClick={handleDraw}>
                      Nächste Person
                    </Button>
                  ) : null}
                  {exhausted && !game.currentParticipant ? (
                    <Button variant="primary" icon={<Repeat className="h-4 w-4" />} onClick={handleRepeatRound}>
                      Alle Boxen offen – Runde wiederholen
                    </Button>
                  ) : null}
                </div>
              </div>
              )}

              {/* Box grid */}
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {Array.from({ length: config.boxCount }).map((_, index) => {
                  const isAvailable = game.availableBoxes.includes(index);
                  const isOpening = openingIndex === index;
                  const state = isOpening
                    ? "opening"
                    : isAvailable
                      ? game.phase === "selecting" && game.status === "running"
                        ? "available"
                        : "disabled"
                      : "opened";
                  return (
                    <GiftBox
                      key={index}
                      index={index}
                      state={state}
                      content={game.contentsOrder[index]}
                      onClick={() => handleBoxClick(index)}
                    />
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Sidebar */}
        {config.boxCount === 0 ? null : (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Live-Statistik" icon={<Trophy className="h-5 w-5" />} />
            <CardBody className="grid grid-cols-2 gap-4 text-center">
              <Stat label="Teilnehmende" value={config.participants.length} />
              <Stat label="Boxen" value={config.boxCount} />
              <Stat label="Auswahlen" value={game.history.length} />
              <Stat label="Runde" value={game.round} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Verlauf" subtitle="Neueste zuerst." icon={<History className="h-5 w-5" />} />
            <CardBody>
              {historyByLatest.length === 0 ? (
                <EmptyState
                  icon={<History className="h-6 w-6" />}
                  title="Noch keine Auswahlen"
                  description="Geöffnete Boxen und ihre Ergebnisse erscheinen hier."
                />
              ) : (
                <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {historyByLatest.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-50 text-xs font-bold text-gold-600 ring-1 ring-gold-200">
                        #{item.boxIndex + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">{item.participant}</p>
                        <p className="truncate text-xs text-gray-500">{item.content.text}</p>
                      </div>
                      <Badge tone="neutral">{contentLabel(item.content.type)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
        )}
      </div>

      {/* Reveal modal */}
      <Modal
        open={!!reveal}
        onClose={() => setReveal(null)}
        size="sm"
      >
        {reveal ? (
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-2">
              <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-gold-400" />
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-50 text-gold-600 animate-scale-in">
                <Gift className="h-8 w-8" />
              </span>
            </div>
            <p className="text-xs uppercase tracking-[0.25em] text-gray-400">
              Box Nr. {reveal.boxIndex + 1} · {contentLabel(reveal.content.type)}
            </p>
            <p className="mt-1 text-lg font-semibold text-ink-900">{reveal.participant}</p>
            <p className="mt-4 rounded-xl border border-gold-200 bg-gold-50 p-4 text-base font-medium text-ink-900 animate-slide-up">
              {reveal.content.text}
            </p>
            <div className="mt-6 flex w-full gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setReveal(null)}>
                Schließen
              </Button>
              <Button
                className="flex-1"
                icon={<ArrowRight className="h-4 w-4" />}
                disabled={exhausted}
                onClick={() => {
                  setReveal(null);
                  handleDraw();
                }}
              >
                Nächster Zug
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={confirmReset}
        title={config.boxCount === 0 ? "Neue Runde starten?" : "Das gesamte Spiel zurA�cksetzen?"}
        description={
          config.boxCount === 0
            ? "Alle bereits gezogenen Namen werden zurA�ckgesetzt. Alle Teilnehmenden werden wieder zum Ziehen freigegeben."
            : "Alle Auswahlen werden gelAscht, der Durchlauf startet neu und alle Boxen werden neu gefA�llt. Einrichtung und Namen bleiben erhalten."
        }
        confirmLabel={config.boxCount === 0 ? "Neue Runde starten" : "Spiel zurA�cksetzen"}
        onConfirm={handleReset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <p className="text-2xl font-bold text-ink-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
