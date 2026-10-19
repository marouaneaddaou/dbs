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
import { removeQuizHistory } from "@/lib/quiz";
import { logoutAdmin } from "@/lib/admin-auth";
import { AdminGate } from "@/components/admin/AdminGate";
import { QuizHistoryModal } from "@/components/quiz/QuizHistoryModal";
import { QuizShareModal } from "@/components/quiz/QuizShareModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { downloadJSON } from "@/lib/io";

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
      title="Admin login"
      description="Enter the admin password to open the control center for boxes, quizzes and votes."
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
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [historyFor, setHistoryFor] = useState<QuizRoom | null>(null);
  const [shareFor, setShareFor] = useState<QuizRoom | null>(null);

  function handleLogout() {
    logoutAdmin();
    toast.success("Logged out of the admin area.");
    router.push("/");
  }

  const totalVotes = useMemo(
    () => votingRooms.reduce((sum, r) => sum + r.votes.length, 0),
    [votingRooms],
  );

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code).then(
      () => toast.success(`Copied code ${code}.`),
      () => toast.error("Could not copy to clipboard."),
    );
  }

  /* ----------------------------- Voting actions ---------------------------- */

  function votingStatus(record: VotingRoomRecord): { label: string; tone: "neutral" | "success" | "warning" | "gold" } {
    const { room } = record;
    if (room.status === "draft") return { label: "draft", tone: "neutral" };
    if (isRoomExpired(room)) return { label: "expired", tone: "warning" };
    if (room.status === "open") return { label: "open", tone: "success" };
    return { label: "closed", tone: "neutral" };
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
    toast.success(reopening ? `Room ${code} reopened.` : `Room ${code} closed.`);
  }

  function resetVotes(record: VotingRoomRecord) {
    const code = record.room.code;
    setVotingRooms((prev) =>
      prev.map((r) => (normalizeCode(r.room.code) === normalizeCode(code) ? { ...r, votes: [] } : r)),
    );
    toast.success(`Votes for ${code} cleared.`);
  }

  function deleteVoting(record: VotingRoomRecord) {
    const code = record.room.code;
    setVotingRooms((prev) => prev.filter((r) => normalizeCode(r.room.code) !== normalizeCode(code)));
    toast.success("Voting room removed.");
  }

  /* ------------------------------ Quiz actions ----------------------------- */

  function quizStatus(room: QuizRoom): { label: string; tone: "neutral" | "gold" | "success" } {
    if (room.status === "draft") return { label: "draft", tone: "neutral" };
    const session = quizSessions[room.code];
    if (session) {
      const map: Record<string, string> = {
        lobby: "in lobby",
        question: "in progress",
        reveal: "revealing",
        finished: "finished",
      };
      return { label: map[session.session.status] ?? "published", tone: "success" };
    }
    return { label: "published", tone: "gold" };
  }

  function toggleQuizStatus(room: QuizRoom) {
    const publishing = room.status === "draft";
    setQuizRooms((prev) =>
      prev.map((r) => (r.code === room.code ? { ...r, status: publishing ? "published" : "draft" } : r)),
    );
    toast.success(publishing ? `Quiz ${room.code} published.` : `Quiz ${room.code} set to draft.`);
  }

  function resetQuizSession(room: QuizRoom) {
    setQuizSessions((prev) => {
      const next = { ...prev };
      delete next[room.code];
      return next;
    });
    toast.success(`Session for ${room.code} reset.`);
  }

  function deleteQuiz(room: QuizRoom) {
    setQuizRooms((prev) => prev.filter((r) => r.code !== room.code));
    setQuizSessions((prev) => {
      const next = { ...prev };
      delete next[room.code];
      return next;
    });
    setQuizHistory((prev) => removeQuizHistory(prev, room.code));
    toast.success("Quiz and its results history removed.");
  }

  /* ------------------------------ Box actions ------------------------------ */

  function boxStatus(config: BoxConfig): { label: string; tone: "success" | "warning" | "neutral" } {
    const status = boxGames[config.id]?.status ?? "idle";
    if (status === "running") return { label: "running", tone: "success" };
    if (status === "paused") return { label: "paused", tone: "warning" };
    if (status === "finished") return { label: "finished", tone: "neutral" };
    return { label: "not started", tone: "neutral" };
  }

  function resetBoxGame(config: BoxConfig) {
    setBoxGames((prev) => {
      const next = { ...prev };
      delete next[config.id];
      return next;
    });
    toast.success(`Progress for “${config.name || "Untitled"}” cleared.`);
  }

  function deleteBox(config: BoxConfig) {
    setBoxConfigs((prev) => prev.filter((c) => c.id !== config.id));
    setBoxGames((prev) => {
      const next = { ...prev };
      delete next[config.id];
      return next;
    });
    toast.success("Game removed.");
  }

  const loading = !hydrated;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Control center"
        title="Admin Dashboard"
        description="Create, open, edit and manage every game saved in this browser — box games, voting rooms and quizzes — from one place."
        icon={<LayoutDashboard className="h-6 w-6" />}
        action={
          <div className="flex items-center gap-2">
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              Create room
            </Button>
            <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={handleLogout}>
              Logout
            </Button>
          </div>
        }
      />

      {/* Summary */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<Boxes className="h-4 w-4" />} label="Box games" value={boxConfigs.length} />
        <Stat icon={<Vote className="h-4 w-4" />} label="Voting rooms" value={votingRooms.length} />
        <Stat icon={<Trophy className="h-4 w-4" />} label="Quizzes" value={quizRooms.length} />
        <Stat icon={<BarChart3 className="h-4 w-4" />} label="Ballots cast" value={totalVotes} />
      </section>

      {/* Create cards */}
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <CreateCard
          icon={<Boxes className="h-5 w-5" />}
          title="Create Game"
          description="Random box reveal game with fair no-repeat cycles. No code required."
          actionLabel="Go to Random Boxes"
          onClick={() => router.push("/boxes")}
        />
        <CreateCard
          icon={<Vote className="h-5 w-5" />}
          title="Create Voting Room"
          description="Polls with single or multiple choice, deadlines and live tallies."
          actionLabel="New voting room"
          onClick={() => router.push("/votes/create")}
        />
        <CreateCard
          icon={<Trophy className="h-5 w-5" />}
          title="Create Quiz Room"
          description="Timed quizzes with speed bonuses and an animated winners' podium."
          actionLabel="New quiz"
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
            <CardHeader title="Box games" subtitle={`${boxConfigs.length} saved`} icon={<Boxes className="h-5 w-5" />} />
            <CardBody className="p-0">
              {boxConfigs.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<Boxes className="h-7 w-7" />}
                    title="No box games"
                    description="Create a Random Boxes game to see it listed here."
                  />
                </div>
              ) : (
                <RoomTable
                  headers={["Game", "Status", "Details", "Actions"]}
                  rows={boxConfigs.map((config) => {
                    const status = boxStatus(config);
                    return {
                      key: config.id,
                      cells: [
                        <div key="name">
                          <p className="font-medium text-ink-900">{config.name || "Untitled game"}</p>
                          <p className="mt-0.5 font-mono text-xs text-gray-400">{config.id.slice(0, 14)}…</p>
                        </div>,
                        <Badge key="status" tone={status.tone}>
                          {status.label}
                        </Badge>,
                        <div key="meta" className="text-xs text-gray-500">
                          {config.boxCount} boxes · {config.participants.length} names · {config.contents.length}{" "}
                          contents
                        </div>,
                      ],
                      actions: (
                        <>
                          <IconBtn
                            label="Edit"
                            icon={<Pencil className="h-4 w-4" />}
                            onClick={() => router.push(`/boxes?config=${config.id}`)}
                          />
                          <IconBtn
                            label="Play"
                            icon={<Play className="h-4 w-4" />}
                            onClick={() => router.push(`/boxes?config=${config.id}&play=1`)}
                          />
                          <IconBtn
                            label="Reset progress"
                            icon={<RotateCcw className="h-4 w-4" />}
                            onClick={() =>
                              setPending({
                                title: "Reset game progress?",
                                description: `“${config.name || "Untitled game"}” will start again from a fresh cycle. Contents and names are kept.`,
                                confirmLabel: "Reset progress",
                                action: () => resetBoxGame(config),
                              })
                            }
                          />
                          <IconBtn
                            label="Export"
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
                            label="Delete"
                            tone="danger"
                            icon={<Trash2 />}
                            onClick={() =>
                              setPending({
                                title: "Delete this game?",
                                description: `“${config.name || "Untitled game"}” and its progress will be removed from this browser.`,
                                confirmLabel: "Delete",
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
              title="Voting rooms"
              subtitle={`${votingRooms.length} saved`}
              icon={<Vote className="h-5 w-5" />}
            />
            <CardBody className="p-0">
              {votingRooms.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<Vote className="h-7 w-7" />}
                    title="No voting rooms"
                    description="Create a poll to see it listed here with its code."
                  />
                </div>
              ) : (
                <RoomTable
                  headers={["Code", "Title", "Status", "Details", "Actions"]}
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
                          {record.room.title || "Untitled poll"}
                        </span>,
                        <Badge key="status" tone={status.tone}>
                          {status.label}
                        </Badge>,
                        <div key="meta" className="text-xs text-gray-500">
                          {record.room.questions.length} question(s) · {record.votes.length} vote(s)
                        </div>,
                      ],
                      actions: (
                        <>
                          <IconBtn
                            label="Copy code"
                            icon={<Copy className="h-4 w-4" />}
                            onClick={() => copyCode(record.room.code)}
                          />
                          <IconBtn
                            label="Open"
                            icon={<ExternalLink className="h-4 w-4" />}
                            onClick={() => router.push(`/votes/room?code=${record.room.code}&host=1`)}
                          />
                          <IconBtn
                            label="Edit"
                            icon={<Pencil className="h-4 w-4" />}
                            onClick={() => router.push(`/votes/create?edit=${record.room.code}`)}
                          />
                          <IconBtn
                            label={open ? "Close poll" : "Reopen poll"}
                            icon={open ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                            onClick={() => toggleVotingStatus(record)}
                          />
                          <IconBtn
                            label="Reset votes"
                            icon={<RotateCcw className="h-4 w-4" />}
                            onClick={() =>
                              setPending({
                                title: "Clear all votes?",
                                description: `Every ballot for room ${record.room.code} will be permanently deleted. The questions stay.`,
                                confirmLabel: "Clear votes",
                                action: () => resetVotes(record),
                              })
                            }
                          />
                          <IconBtn
                            label="Export"
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
                            label="Delete"
                            tone="danger"
                            icon={<Trash2 />}
                            onClick={() =>
                              setPending({
                                title: "Delete this room?",
                                description: `Room ${record.room.code} and its ${record.votes.length} vote(s) will be removed.`,
                                confirmLabel: "Delete",
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
              title="Quizzes"
              subtitle={`${quizRooms.length} saved`}
              icon={<Trophy className="h-5 w-5" />}
              action={
                <Link href="/admin/results">
                  <Button variant="secondary" size="sm" icon={<BarChart3 className="h-4 w-4" />}>
                    All results
                  </Button>
                </Link>
              }
            />
            <CardBody className="p-0">
              {quizRooms.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<Trophy className="h-7 w-7" />}
                    title="No quizzes"
                    description="Create a quiz to see it listed here with its code."
                  />
                </div>
              ) : (
                <RoomTable
                  headers={["Code", "Title", "Status", "Details", "Actions"]}
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
                          {room.title || "Untitled quiz"}
                        </span>,
                        <Badge key="status" tone={status.tone}>
                          {status.label}
                        </Badge>,
                        <div key="meta" className="text-xs text-gray-500">
                          {room.questions.length} question(s)
                          {hasSession ? " · session saved" : ""}
                          {runCount > 0 ? ` · ${runCount} result(s)` : ""}
                        </div>,
                      ],
                      actions: (
                        <>
                          <Button
                            variant="gold"
                            size="sm"
                            icon={<Share2 className="h-4 w-4" />}
                            onClick={() => setShareFor(room)}
                            aria-label={`Teilen / Share Room ${room.code}`}
                          >
                            Teilen / Share Room
                          </Button>
                          <IconBtn
                            label="Copy code"
                            icon={<Copy className="h-4 w-4" />}
                            onClick={() => copyCode(room.code)}
                          />
                          <IconBtn
                            label="Host"
                            icon={<ExternalLink className="h-4 w-4" />}
                            onClick={() => router.push(`/quiz/room?code=${room.code}&host=1`)}
                          />
                          <IconBtn
                            label="Edit"
                            icon={<Pencil className="h-4 w-4" />}
                            onClick={() => router.push(`/quiz/create?edit=${room.code}`)}
                          />
                          {runCount > 0 ? (
                            <IconBtn
                              label="View results"
                              icon={<History className="h-4 w-4" />}
                              onClick={() => setHistoryFor(room)}
                            />
                          ) : null}
                          <IconBtn
                            label={room.status === "draft" ? "Publish" : "Unpublish"}
                            icon={room.status === "draft" ? <Sparkles className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            onClick={() => toggleQuizStatus(room)}
                          />
                          {hasSession ? (
                            <IconBtn
                              label="Reset session"
                              icon={<RotateCcw className="h-4 w-4" />}
                              onClick={() =>
                                setPending({
                                  title: "Reset the session?",
                                  description: `Players and results for quiz ${room.code} will be cleared. The quiz itself stays.`,
                                  confirmLabel: "Reset session",
                                  action: () => resetQuizSession(room),
                                })
                              }
                            />
                          ) : null}
                          <IconBtn
                            label="Export"
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
                            label="Delete"
                            tone="danger"
                            icon={<Trash2 />}
                            onClick={() =>
                              setPending({
                                title: "Delete this quiz?",
                                description: `Quiz ${room.code}, its saved session and results history will be removed.`,
                                confirmLabel: "Delete",
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
            Room codes are local identifiers stored in this browser only. They do not sync across devices —
            share a JSON export instead, or use the Settings page for a full backup.
          </p>
        </div>
      )}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create something"
        description="Pick what you want to set up. Everything is saved locally in this browser."
      >
        <div className="grid gap-3">
          <CreateOption
            icon={<Boxes className="h-5 w-5" />}
            title="Random box game"
            description="Gift & challenge reveal game — no code needed."
            onClick={() => {
              setCreateOpen(false);
              router.push("/boxes");
            }}
          />
          <CreateOption
            icon={<Vote className="h-5 w-5" />}
            title="Voting room"
            description="A poll with a shareable local code."
            onClick={() => {
              setCreateOpen(false);
              router.push("/votes/create");
            }}
          />
          <CreateOption
            icon={<Trophy className="h-5 w-5" />}
            title="Quiz room"
            description="A timed quiz with a winners' podium."
            onClick={() => {
              setCreateOpen(false);
              router.push("/quiz/create");
            }}
          />
        </div>
      </Modal>

      <QuizHistoryModal
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
        roomCode={historyFor?.code ?? ""}
        roomTitle={historyFor?.title || "Quiz results"}
      />

      <QuizShareModal
        open={!!shareFor}
        onClose={() => setShareFor(null)}
        room={shareFor}
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
