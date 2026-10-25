"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Copy,
  Download,
  ExternalLink,
  History,
  LayoutDashboard,
  Lock,
  LockOpen,
  LogOut,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Share2,
  Smartphone,
  Sparkles,
  Trash2,
  Trophy,
  Users,
  Vote,
} from "lucide-react";
import type { BoxConfig, BoxGame } from "@/types/boxes";
import type { VotingRoomRecord } from "@/types/voting";
import type { QuizHistoryMap, QuizRoom, QuizSessionRecord } from "@/types/quiz";
import { STORAGE_KEYS } from "@/lib/storage";
import { useLocalStorage, useHydrated } from "@/lib/hooks";
import { normalizeCode, isRoomExpired } from "@/lib/voting";
import { buildQuizShareUrl, removeQuizHistory } from "@/lib/quiz";
import { logoutAdmin } from "@/lib/admin-auth";
import { AdminGate } from "@/components/admin/AdminGate";
import { ModifierModal } from "@/components/admin/ModifierModal";
import { QuizHistoryModal } from "@/components/quiz/QuizHistoryModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { downloadJSON, copyToClipboard } from "@/lib/io";

interface PendingAction {
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  action: () => void;
}

export default function AdminPage() {
  return (
    <AdminGate
      title="Admin-Anmeldung"
      description="Gib das Admin-Passwort ein, um das Kontrollzentrum für Boxen, Quizze und Abstimmungen zu öffnen."
    >
      <AdminPageContent />
    </AdminGate>
  );
}

function AdminPageContent() {
  const router = useRouter();
  const toast = useToast();
  const hydrated = useHydrated();

  const { value: boxConfigs, setValue: setBoxConfigs } = useLocalStorage<BoxConfig[]>(
    STORAGE_KEYS.boxConfigs,
    [],
  );
  const { value: boxGames, setValue: setBoxGames } = useLocalStorage<Record<string, BoxGame>>(
    STORAGE_KEYS.boxGames,
    {},
  );
  const { value: votingRooms, setValue: setVotingRooms } = useLocalStorage<VotingRoomRecord[]>(
    STORAGE_KEYS.votingRooms,
    [],
  );
  const { value: quizRooms, setValue: setQuizRooms } = useLocalStorage<QuizRoom[]>(
    STORAGE_KEYS.quizRooms,
    [],
  );
  const { value: quizSessions, setValue: setQuizSessions } = useLocalStorage<
    Record<string, QuizSessionRecord>
  >(STORAGE_KEYS.quizSessions, {});
  const { value: quizHistory, setValue: setQuizHistory } = useLocalStorage<QuizHistoryMap>(
    STORAGE_KEYS.quizHistory,
    {},
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [modifierOpen, setModifierOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [historyFor, setHistoryFor] = useState<QuizRoom | null>(null);

  async function handleLogout() {
    await logoutAdmin();
    toast.success("Du wurdest aus dem Admin-Bereich abgemeldet.");
    router.push("/");
  }

  const totalVotes = useMemo(
    () => votingRooms.reduce((sum, r) => sum + r.votes.length, 0),
    [votingRooms],
  );

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code).then(
      () => toast.success(`Code ${code} kopiert.`),
      () => toast.error("Kopieren in die Zwischenablage ist fehlgeschlagen."),
    );
  }

  async function shareRoom(room: QuizRoom) {
    const url = buildQuizShareUrl(room.code, window.location.origin);
    const title = room.title || "Quiz";
    // Prefer the native share sheet (Web Share API) when the browser offers it.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: `Tritt dem Quiz „${title}“ bei – Raumcode ${room.code}`, url });
        return;
      } catch (err) {
        // User dismissed the share sheet — leave everything untouched.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Any other failure falls through to the clipboard fallback below.
      }
    }
    // Fallback: copy the link and confirm.
    const ok = await copyToClipboard(url);
    if (ok) toast.success(`Freigabelink kopiert – ${url}`);
    else toast.error("Der Freigabelink konnte nicht kopiert werden.");
  }

  /* ----------------------------- Voting actions ---------------------------- */

  function votingStatus(record: VotingRoomRecord): { label: string; tone: "neutral" | "success" | "warning" | "gold" } {
    const { room } = record;
    if (room.status === "draft") return { label: "Entwurf", tone: "neutral" };
    if (isRoomExpired(room)) return { label: "Abgelaufen", tone: "warning" };
    if (room.status === "open") return { label: "Offen", tone: "success" };
    return { label: "Geschlossen", tone: "neutral" };
  }

  function toggleVotingStatus(record: VotingRoomRecord) {
    const code = record.room.code;
    const reopening = record.room.status !== "open";
    setVotingRooms((prev) =>
      prev.map((r) =>
        normalizeCode(r.room.code) === normalizeCode(code)
          ? {
              ...r,
              room: {
                ...r.room,
                status: reopening ? "open" : "closed",
                closesAt: reopening ? null : r.room.closesAt,
              },
            }
          : r,
      ),
    );
    toast.success(reopening ? `Raum ${code} wieder geöffnet.` : `Raum ${code} geschlossen.`);
  }

  function resetVotes(record: VotingRoomRecord) {
    const code = record.room.code;
    setVotingRooms((prev) =>
      prev.map((r) => (normalizeCode(r.room.code) === normalizeCode(code) ? { ...r, votes: [] } : r)),
    );
    toast.success(`Stimmen für ${code} gelöscht.`);
  }

  function deleteVoting(record: VotingRoomRecord) {
    const code = record.room.code;
    setVotingRooms((prev) => prev.filter((r) => normalizeCode(r.room.code) !== normalizeCode(code)));
    toast.success("Abstimmungsraum entfernt.");
  }

  /* ------------------------------ Quiz actions ----------------------------- */

  function quizStatus(room: QuizRoom): { label: string; tone: "neutral" | "gold" | "success" } {
    if (room.status === "draft") return { label: "Entwurf", tone: "neutral" };
    const session = quizSessions[room.code];
    if (session) {
      const map: Record<string, string> = {
        lobby: "In der Lobby",
        question: "Läuft",
        reveal: "Auflösung",
        finished: "Beendet",
      };
      return { label: map[session.session.status] ?? "Veröffentlicht", tone: "success" };
    }
    return { label: "Veröffentlicht", tone: "gold" };
  }

  function toggleQuizStatus(room: QuizRoom) {
    const publishing = room.status === "draft";
    setQuizRooms((prev) =>
      prev.map((r) => (r.code === room.code ? { ...r, status: publishing ? "published" : "draft" } : r)),
    );
    toast.success(publishing ? `Quiz ${room.code} veröffentlicht.` : `Quiz ${room.code} als Entwurf gespeichert.`);
  }

  function resetQuizSession(room: QuizRoom) {
    setQuizSessions((prev) => {
      const next = { ...prev };
      delete next[room.code];
      return next;
    });
    toast.success(`Sitzung für ${room.code} zurückgesetzt.`);
  }

  function deleteQuiz(room: QuizRoom) {
    setQuizRooms((prev) => prev.filter((r) => r.code !== room.code));
    setQuizSessions((prev) => {
      const next = { ...prev };
      delete next[room.code];
      return next;
    });
    setQuizHistory((prev) => removeQuizHistory(prev, room.code));
    toast.success("Quiz und Ergebnisverlauf entfernt.");
  }

  /* ------------------------------ Box actions ------------------------------ */

  function boxStatus(config: BoxConfig): { label: string; tone: "success" | "warning" | "neutral" } {
    const status = boxGames[config.id]?.status ?? "idle";
    if (status === "running") return { label: "Läuft", tone: "success" };
    if (status === "paused") return { label: "Pausiert", tone: "warning" };
    if (status === "finished") return { label: "Beendet", tone: "neutral" };
    return { label: "Nicht gestartet", tone: "neutral" };
  }

  function resetBoxGame(config: BoxConfig) {
    setBoxGames((prev) => {
      const next = { ...prev };
      delete next[config.id];
      return next;
    });
    toast.success(`Fortschritt für „${config.name || "Ohne Titel"}“ zurückgesetzt.`);
  }

  function deleteBox(config: BoxConfig) {
    setBoxConfigs((prev) => prev.filter((c) => c.id !== config.id));
    setBoxGames((prev) => {
      const next = { ...prev };
      delete next[config.id];
      return next;
    });
    toast.success("Spiel entfernt.");
  }

  const loading = !hydrated;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Kontrollzentrum"
        title="Admin-Dashboard"
        description="Erstelle, öffne, bearbeite und verwalte alle Spiele – Boxen, Abstimmungen und Quizze – an einem Ort. Gespeicherte Inhalte werden über den gemeinsamen Speicher synchronisiert; ungespeicherte Entwürfe verfallen nach 24 Stunden."
        icon={<LayoutDashboard className="h-6 w-6" />}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="gold"
              icon={<Smartphone className="h-4 w-4" />}
              onClick={() => setModifierOpen(true)}
            >
              Synchronisierung
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              Raum erstellen
            </Button>
            <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={handleLogout}>
              Abmelden
            </Button>
          </div>
        }
      />

      {/* Summary */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<Boxes className="h-4 w-4" />} label="Box-Spiele" value={boxConfigs.length} />
        <Stat icon={<Vote className="h-4 w-4" />} label="Abstimmungen" value={votingRooms.length} />
        <Stat icon={<Trophy className="h-4 w-4" />} label="Quizze" value={quizRooms.length} />
        <Stat icon={<BarChart3 className="h-4 w-4" />} label="Abgegebene Stimmen" value={totalVotes} />
      </section>

      {/* Create cards */}
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <CreateCard
          icon={<Boxes className="h-5 w-5" />}
          title="Spiel erstellen"
          description="Zufallsboxen-Spiel mit fairen Durchläufen ohne Wiederholung. Kein Code erforderlich."
          actionLabel="Zu den Zufallsboxen"
          onClick={() => router.push("/boxes")}
        />
        <CreateCard
          icon={<Vote className="h-5 w-5" />}
          title="Abstimmung erstellen"
          description="Umfragen mit Einzel- oder Mehrfachauswahl, Fristen und Live-Ergebnissen."
          actionLabel="Neue Abstimmung"
          onClick={() => router.push("/votes/create")}
        />
        <CreateCard
          icon={<Trophy className="h-5 w-5" />}
          title="Quiz erstellen"
          description="Zeitgesteuerte Quizze mit Tempo-Bonus und animiertem Siegerpodest."
          actionLabel="Neues Quiz"
          onClick={() => router.push("/quiz/create")}
        />
      </section>

      {/* Saved rooms */}
      {loading ? (
        <div className="mt-8 h-48 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-card" />
      ) : (
        <div className="mt-8 space-y-8">
          {/* Box games */}
          <Card>
            <CardHeader title="Box-Spiele" subtitle={`${boxConfigs.length} gespeichert`} icon={<Boxes className="h-5 w-5" />} />
            <CardBody className="p-0">
              {boxConfigs.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<Boxes className="h-7 w-7" />}
                    title="Keine Box-Spiele"
                    description="Erstelle ein Zufallsboxen-Spiel, damit es hier erscheint."
                  />
                </div>
              ) : (
                <RoomTable
                  headers={["Spiel", "Status", "Details", "Aktionen"]}
                  rows={boxConfigs.map((config) => {
                    const status = boxStatus(config);
                    return {
                      key: config.id,
                      cells: [
                        <div key="name">
                          <p className="font-medium text-ink-900">{config.name || "Unbenanntes Spiel"}</p>
                          <p className="mt-0.5 font-mono text-xs text-gray-400">{config.id.slice(0, 14)}…</p>
                        </div>,
                        <Badge key="status" tone={status.tone}>
                          {status.label}
                        </Badge>,
                        <div key="meta" className="text-xs text-gray-500">
                          {config.boxCount} Boxen · {config.participants.length} Namen · {config.contents.length}{" "}
                          Inhalte
                        </div>,
                      ],
                      actions: (
                        <>
                          <IconBtn
                            label="Bearbeiten"
                            icon={<Pencil className="h-4 w-4" />}
                            onClick={() => router.push(`/boxes?config=${config.id}`)}
                          />
                          <IconBtn
                            label="Starten"
                            icon={<Play className="h-4 w-4" />}
                            onClick={() => router.push(`/boxes?config=${config.id}&play=1`)}
                          />
                          <IconBtn
                            label="Fortschritt zurücksetzen"
                            icon={<RotateCcw className="h-4 w-4" />}
                            onClick={() =>
                              setPending({
                                title: "Spielfortschritt zurücksetzen?",
                                description: `„${config.name || "Unbenanntes Spiel"}“ startet mit einem neuen Durchlauf. Inhalte und Namen bleiben erhalten.`,
                                confirmLabel: "Fortschritt zurücksetzen",
                                action: () => resetBoxGame(config),
                              })
                            }
                          />
                          <IconBtn
                            label="Exportieren"
                            icon={<Download className="h-4 w-4" />}
                            onClick={() =>
                              downloadJSON(`box-game-${config.id}.json`, {
                                type: "box-config",
                                exportedAt: Date.now(),
                                config,
                              })
                            }
                          />
                          <IconBtn
                            label="Löschen"
                            tone="danger"
                            icon={<Trash2 />}
                            onClick={() =>
                              setPending({
                                title: "Dieses Spiel löschen?",
                                description: `„${config.name || "Unbenanntes Spiel"}“ und der zugehörige Fortschritt werden dauerhaft entfernt.`,
                                confirmLabel: "Löschen",
                                action: () => deleteBox(config),
                              })
                            }
                          />
                        </>
                      ),
                    };
                  })}
                />
              )}
            </CardBody>
          </Card>

          {/* Voting rooms */}
          <Card>
            <CardHeader
              title="Abstimmungen"
              subtitle={`${votingRooms.length} gespeichert`}
              icon={<Vote className="h-5 w-5" />}
            />
            <CardBody className="p-0">
              {votingRooms.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<Vote className="h-7 w-7" />}
                    title="Keine Abstimmungen"
                    description="Erstelle eine Umfrage, damit sie hier mit ihrem Code erscheint."
                  />
                </div>
              ) : (
                <RoomTable
                  headers={["Code", "Titel", "Status", "Details", "Aktionen"]}
                  rows={votingRooms.map((record) => {
                    const status = votingStatus(record);
                    const open = record.room.status === "open";
                    return {
                      key: record.room.code,
                      cells: [
                        <span key="code" className="font-mono text-sm font-bold tracking-[0.2em] text-gold-600">
                          {record.room.code}
                        </span>,
                        <span key="title" className="text-sm text-gray-700">
                          {record.room.title || "Unbenannte Abstimmung"}
                        </span>,
                        <Badge key="status" tone={status.tone}>
                          {status.label}
                        </Badge>,
                        <div key="meta" className="text-xs text-gray-500">
                          {record.room.questions.length} Fragen · {record.votes.length} Stimmen
                        </div>,
                      ],
                      actions: (
                        <>
                          <IconBtn
                            label="Code kopieren"
                            icon={<Copy className="h-4 w-4" />}
                            onClick={() => copyCode(record.room.code)}
                          />
                          <IconBtn
                            label="Öffnen"
                            icon={<ExternalLink className="h-4 w-4" />}
                            onClick={() => router.push(`/votes/room?code=${record.room.code}&host=1`)}
                          />
                          <IconBtn
                            label="Bearbeiten"
                            icon={<Pencil className="h-4 w-4" />}
                            onClick={() => router.push(`/votes/create?edit=${record.room.code}`)}
                          />
                          <IconBtn
                            label={open ? "Umfrage schließen" : "Umfrage wieder öffnen"}
                            icon={open ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                            onClick={() => toggleVotingStatus(record)}
                          />
                          <IconBtn
                            label="Stimmen zurücksetzen"
                            icon={<RotateCcw className="h-4 w-4" />}
                            onClick={() =>
                              setPending({
                                title: "Alle Stimmen löschen?",
                                description: `Alle abgegebenen Stimmen für Raum ${record.room.code} werden dauerhaft gelöscht. Die Fragen bleiben erhalten.`,
                                confirmLabel: "Stimmen löschen",
                                action: () => resetVotes(record),
                              })
                            }
                          />
                          <IconBtn
                            label="Exportieren"
                            icon={<Download className="h-4 w-4" />}
                            onClick={() =>
                              downloadJSON(`voting-room-${record.room.code}.json`, {
                                type: "voting-room",
                                exportedAt: Date.now(),
                                record,
                              })
                            }
                          />
                          <IconBtn
                            label="Löschen"
                            tone="danger"
                            icon={<Trash2 />}
                            onClick={() =>
                              setPending({
                                title: "Diesen Raum löschen?",
                                description: `Raum ${record.room.code} und seine ${record.votes.length} Stimmen werden entfernt.`,
                                confirmLabel: "Löschen",
                                action: () => deleteVoting(record),
                              })
                            }
                          />
                        </>
                      ),
                    };
                  })}
                />
              )}
            </CardBody>
          </Card>

          {/* Quizzes */}
          <Card>
            <CardHeader
              title="Quizze"
              subtitle={`${quizRooms.length} gespeichert`}
              icon={<Trophy className="h-5 w-5" />}
              action={
                <Link href="/admin/results">
                  <Button variant="secondary" size="sm" icon={<BarChart3 className="h-4 w-4" />}>
                    Alle Ergebnisse
                  </Button>
                </Link>
              }
            />
            <CardBody className="p-0">
              {quizRooms.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<Trophy className="h-7 w-7" />}
                    title="Keine Quizze"
                    description="Erstelle ein Quiz, damit es hier mit seinem Code erscheint."
                  />
                </div>
              ) : (
                <RoomTable
                  headers={["Code", "Titel", "Status", "Details", "Aktionen"]}
                  rows={quizRooms.map((room) => {
                    const status = quizStatus(room);
                    const hasSession = Boolean(quizSessions[room.code]);
                    const runCount = quizHistory[room.code]?.length ?? 0;
                    return {
                      key: room.code,
                      cells: [
                        <span key="code" className="font-mono text-sm font-bold tracking-[0.2em] text-gold-600">
                          {room.code}
                        </span>,
                        <span key="title" className="text-sm text-gray-700">
                          {room.title || "Unbenanntes Quiz"}
                        </span>,
                        <Badge key="status" tone={status.tone}>
                          {status.label}
                        </Badge>,
                        <div key="meta" className="text-xs text-gray-500">
                          {room.questions.length} Fragen
                          {hasSession ? " · Sitzung gespeichert" : ""}
                          {runCount > 0 ? ` · ${runCount} Ergebnis${runCount === 1 ? "" : "se"}` : ""}
                        </div>,
                      ],
                      actions: (
                        <>
                          <Button
                            variant="gold"
                            size="sm"
                            icon={<Share2 className="h-4 w-4" />}
                            onClick={() => shareRoom(room)}
                            aria-label={`Raum ${room.code} teilen`}
                          >
                            Raum teilen
                          </Button>
                          <IconBtn
                            label="Code kopieren"
                            icon={<Copy className="h-4 w-4" />}
                            onClick={() => copyCode(room.code)}
                          />
                          <IconBtn
                            label="Hosten"
                            icon={<ExternalLink className="h-4 w-4" />}
                            onClick={() => router.push(`/quiz/room?code=${room.code}&host=1`)}
                          />
                          <IconBtn
                            label="Bearbeiten"
                            icon={<Pencil className="h-4 w-4" />}
                            onClick={() => router.push(`/quiz/create?edit=${room.code}`)}
                          />
                          {runCount > 0 ? (
                            <IconBtn
                              label="Ergebnisse ansehen"
                              icon={<History className="h-4 w-4" />}
                              onClick={() => setHistoryFor(room)}
                            />
                          ) : null}
                          <IconBtn
                            label={room.status === "draft" ? "Veröffentlichen" : "Zurückziehen"}
                            icon={room.status === "draft" ? <Sparkles className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            onClick={() => toggleQuizStatus(room)}
                          />
                          {hasSession ? (
                            <IconBtn
                              label="Sitzung zurücksetzen"
                              icon={<RotateCcw className="h-4 w-4" />}
                              onClick={() =>
                                setPending({
                                  title: "Sitzung zurücksetzen?",
                                  description: `Spieler und Ergebnisse des Quiz ${room.code} werden gelöscht. Das Quiz selbst bleibt erhalten.`,
                                  confirmLabel: "Sitzung zurücksetzen",
                                  action: () => resetQuizSession(room),
                                })
                              }
                            />
                          ) : null}
                          <IconBtn
                            label="Exportieren"
                            icon={<Download className="h-4 w-4" />}
                            onClick={() =>
                              downloadJSON(`quiz-${room.code}.json`, {
                                type: "quiz-room",
                                exportedAt: Date.now(),
                                room,
                              })
                            }
                          />
                          <IconBtn
                            label="Löschen"
                            tone="danger"
                            icon={<Trash2 />}
                            onClick={() =>
                              setPending({
                                title: "Dieses Quiz löschen?",
                                description: `Quiz ${room.code}, die gespeicherte Sitzung und der Ergebnisverlauf werden entfernt.`,
                                confirmLabel: "Löschen",
                                action: () => deleteQuiz(room),
                              })
                            }
                          />
                        </>
                      ),
                    };
                  })}
                />
              )}
            </CardBody>
          </Card>

          <p className="flex items-start gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-500" />
            Gespeicherte Räume werden über den gemeinsamen Speicher synchronisiert und bleiben dauerhaft
            erhalten. Ungespeicherte Entwürfe verfallen nach 24 Stunden. Backups und die Verwaltung des
            Serverspeichers findest du in den Einstellungen.
          </p>
        </div>
      )}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Etwas erstellen"
        description="Wähle, was du einrichten möchtest. Gespeicherte Inhalte werden serverseitig synchronisiert; Entwürfe verfallen nach 24 Stunden."
      >
        <div className="grid gap-3">
          <CreateOption
            icon={<Boxes className="h-5 w-5" />}
            title="Zufallsboxen-Spiel"
            description="Geschenk- und Aufgaben-Spiel – kein Code erforderlich."
            onClick={() => {
              setCreateOpen(false);
              router.push("/boxes");
            }}
          />
          <CreateOption
            icon={<Vote className="h-5 w-5" />}
            title="Abstimmung"
            description="Eine Umfrage mit teilbarem Raumcode."
            onClick={() => {
              setCreateOpen(false);
              router.push("/votes/create");
            }}
          />
          <CreateOption
            icon={<Trophy className="h-5 w-5" />}
            title="Quiz"
            description="Ein zeitgesteuertes Quiz mit Siegerpodest."
            onClick={() => {
              setCreateOpen(false);
              router.push("/quiz/create");
            }}
          />
        </div>
      </Modal>

      <ModifierModal open={modifierOpen} onClose={() => setModifierOpen(false)} />

      <QuizHistoryModal
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
        roomCode={historyFor?.code ?? ""}
        roomTitle={historyFor?.title || "Quiz-Ergebnisse"}
      />

      <ConfirmDialog
        open={!!pending}
        title={pending?.title ?? ""}
        description={pending?.description}
        confirmLabel={pending?.confirmLabel}
        tone={pending?.tone}
        onConfirm={() => {
          pending?.action();
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <p className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className="text-gold-500">{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-ink-900">{value}</p>
    </div>
  );
}

function CreateCard({
  icon,
  title,
  description,
  actionLabel,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-50 text-gold-600 ring-1 ring-gold-200">
        {icon}
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-gray-500">{description}</p>
      <Button className="mt-4" variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={onClick}>
        {actionLabel}
      </Button>
    </div>
  );
}

function CreateOption({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-gold-300 hover:bg-gold-50/60"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-600 ring-1 ring-gold-200">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-ink-900">{title}</span>
        <span className="mt-0.5 block text-xs text-gray-500">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
    </button>
  );
}

interface RoomRow {
  key: string;
  cells: React.ReactNode[];
  actions: React.ReactNode;
}

function RoomTable({ headers, rows }: { headers: string[]; rows: RoomRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
            {headers.map((header, index) => (
              <th key={header} className={`px-5 py-3 font-medium ${index === headers.length - 1 ? "text-right" : ""}`}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
              {row.cells.map((cell, index) => (
                <td key={index} className="px-5 py-4 align-middle">
                  {cell}
                </td>
              ))}
              <td className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-end gap-1.5">{row.actions}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IconBtn({
  label,
  icon,
  onClick,
  tone = "default",
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors " +
        (tone === "danger"
          ? "hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600"
          : "hover:border-gold-300 hover:text-gold-600")
      }
    >
      {icon}
    </button>
  );
}
