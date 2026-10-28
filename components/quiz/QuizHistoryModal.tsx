"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Crown, Trophy, Users } from "lucide-react";
import type { QuizHistoryEntry, QuizHistoryMap } from "@/types/quiz";
import { STORAGE_KEYS } from "@/lib/storage";
import { useLocalStorage } from "@/lib/hooks";
import { formatTotalTime } from "@/lib/quiz";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Podium } from "@/components/Podium";

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString("de-DE");
  } catch {
    return "–";
  }
}

/**
 * Review every completed run saved for one quiz (German UI).
 * Runs are stored per quiz code in localStorage, so results survive refreshes.
 */
export function QuizHistoryModal({
  open,
  onClose,
  roomCode,
  roomTitle,
}: {
  open: boolean;
  onClose: () => void;
  roomCode: string;
  roomTitle: string;
}) {
  const { value: history, hydrated } = useLocalStorage<QuizHistoryMap>(STORAGE_KEYS.quizHistory, {});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open, roomCode]);

  const runs = history[roomCode] ?? [];
  const selected = runs.find((r) => r.id === selectedId) ?? null;

  return (
    <Modal open={open} onClose={onClose} title={roomTitle || "Quiz-Ergebnisse"} size="lg">
      {!hydrated ? (
        <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
      ) : selected ? (
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-ink-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Alle abgeschlossenen Durchläufe
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">
              <Trophy className="h-3 w-3" /> Abgeschlossen
            </Badge>
            <Badge tone="neutral">
              <Clock className="h-3 w-3" /> {formatDate(selected.finishedAt)}
            </Badge>
            <Badge tone="neutral">
              <Users className="h-3 w-3" /> {selected.playerCount} Spieler
            </Badge>
            <Badge tone="gold">{selected.questionCount} Fragen</Badge>
          </div>

          {selected.scores.length > 0 ? (
            <Podium
              entries={selected.scores.slice(0, 3).map((s) => ({
                id: s.playerId,
                name: s.name,
                points: s.points,
                rank: s.rank,
                subtitle: `${s.correct} richtig Â· ${s.accuracy} %`,
              }))}
            />
          ) : (
            <EmptyState icon={<Trophy className="h-6 w-6" />} title="Keine Spieler" description="An diesem Durchlauf haben keine Spieler teilgenommen." />
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Spieler</th>
                  <th className="px-3 py-2 text-right">Punkte</th>
                  <th className="px-3 py-2 text-right">Richtig</th>
                  <th className="px-3 py-2 text-right">Falsch</th>
                  <th className="px-3 py-2 text-right">Trefferquote</th>
                  <th className="px-3 py-2 text-right">Zeit</th>
                </tr>
              </thead>
              <tbody>
                {selected.scores.map((s) => (
                  <tr key={s.playerId} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-semibold text-gray-400">{s.rank}</td>
                    <td className="px-3 py-2 font-medium text-ink-900">{s.name}</td>
                    <td className="px-3 py-2 text-right font-bold text-gold-600">{s.points}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">{s.correct}</td>
                    <td className="px-3 py-2 text-right text-brand-600">{s.incorrect}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{s.accuracy} %</td>
                    <td className="px-3 py-2 text-right text-gray-500">{formatTotalTime(s.totalTimeMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-6 w-6" />}
          title="Noch keine abgeschlossenen Durchläufe"
          description="Sobald dieses Quiz endet, wird der Endstand hier automatisch gespeichert – auch nach einer Aktualisierung."
        />
      ) : (
        <ul className="space-y-2">
          {runs.map((run: QuizHistoryEntry) => {
            const winner = run.scores[0];
            return (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(run.id)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-gold-400 hover:bg-gold-50/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink-900">
                      {winner ? `${winner.name} gewinnt mit ${winner.points} Pkt.` : "Abgeschlossener Durchlauf"}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {formatDate(run.finishedAt)} Â· {run.playerCount} Spieler Â· {run.questionCount} Fragen
                    </span>
                  </span>
                  <Crown className="h-4 w-4 shrink-0 text-gold-500" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Schließen
        </Button>
      </div>
    </Modal>
  );
}
