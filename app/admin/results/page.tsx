"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock,
  Eye,
  Search,
  Target,
  Timer,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import type { QuizHistoryMap, QuizQuestion, QuizResponse } from "@/types/quiz";
import { STORAGE_KEYS } from "@/lib/storage";
import { useHydrated, useLocalStorage } from "@/lib/hooks";
import {
  flattenQuizResults,
  formatTotalTime,
  hardestQuestions,
  rankQuizResults,
  scorePercent,
  summarizeQuizResults,
  type QuizResultRow,
} from "@/lib/quiz";
import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Field";

type SortKey = "rank" | "score" | "accuracy" | "time" | "name" | "finished";
type StatusFilter = "all" | "completed" | "incomplete";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "rank", label: "Rank" },
  { value: "score", label: "Score" },
  { value: "accuracy", label: "Accuracy" },
  { value: "time", label: "Time" },
  { value: "name", label: "Name" },
  { value: "finished", label: "Newest" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "incomplete", label: "Not finished" },
];

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

export default function AdminResultsPage() {
  return (
    <AdminGate
      title="Admin login"
      description="Enter the admin password to review quiz results, rankings and answer analysis."
    >
      <ResultsContent />
    </AdminGate>
  );
}

function ResultsContent() {
  const hydrated = useHydrated();
  const { value: history } = useLocalStorage<QuizHistoryMap>(STORAGE_KEYS.quizHistory, {});

  const [search, setSearch] = useState("");
  const [quizFilter, setQuizFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [selected, setSelected] = useState<QuizResultRow | null>(null);

  const allRows = useMemo(() => flattenQuizResults(history), [history]);

  const quizOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of allRows) {
      if (!seen.has(row.roomCode)) seen.set(row.roomCode, row.quizTitle);
    }
    return [...seen.entries()].map(([code, title]) => ({ code, title }));
  }, [allRows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let rows = allRows;
    if (quizFilter !== "all") rows = rows.filter((r) => r.roomCode === quizFilter);
    if (statusFilter !== "all") {
      rows = rows.filter((r) => (statusFilter === "completed" ? r.completed : !r.completed));
    }
    if (query) {
      rows = rows.filter(
        (r) => r.name.toLowerCase().includes(query) || r.quizTitle.toLowerCase().includes(query),
      );
    }
    if (sortKey === "rank" || sortKey === "score") {
      rows = rankQuizResults(rows);
      if (sortKey === "score") rows = [...rows].sort((a, b) => b.points - a.points || a.rank - b.rank);
    } else if (sortKey === "accuracy") {
      rows = [...rows].sort((a, b) => b.accuracy - a.accuracy || b.points - a.points);
    } else if (sortKey === "time") {
      rows = [...rows].sort((a, b) => a.totalTimeMs - b.totalTimeMs);
    } else if (sortKey === "name") {
      rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      rows = [...rows].sort((a, b) => b.finishedAt - a.finishedAt);
    }
    return rows;
  }, [allRows, search, quizFilter, statusFilter, sortKey]);

  const summary = useMemo(() => summarizeQuizResults(filtered), [filtered]);
  const hardest = useMemo(
    () => hardestQuestions(quizFilter === "all" ? allRows : allRows.filter((r) => r.roomCode === quizFilter), 5),
    [allRows, quizFilter],
  );

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="h-24 animate-pulse rounded-2xl bg-gray-100" />
        <div className="mt-4 h-96 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Analysis"
        title="Quiz Results"
        description="Rankings, per-participant answer reviews and question difficulty for every completed run saved in this browser."
        icon={<BarChart3 className="h-6 w-6" />}
        backHref="/admin"
        backLabel="Admin dashboard"
      />

      {/* Summary */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={<Users className="h-4 w-4" />} label="Participants" value={summary.participants} />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={summary.completed} />
        <StatCard icon={<Target className="h-4 w-4" />} label="Avg score" value={summary.avgScore} />
        <StatCard icon={<Trophy className="h-4 w-4" />} label="High score" value={summary.highScore} />
        <StatCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Correct rate"
          value={`${summary.correctRate}%`}
        />
      </section>

      {/* Filters */}
      <Card className="mt-6">
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Search
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Participant or quiz name…"
                className="pl-9"
                aria-label="Search results"
              />
            </div>
          </label>
          <label className="sm:w-52">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Quiz
            </span>
            <Select value={quizFilter} onChange={(e) => setQuizFilter(e.target.value)} aria-label="Filter by quiz">
              <option value="all">All quizzes</option>
              {quizOptions.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.title || opt.code} ({opt.code})
                </option>
              ))}
            </Select>
          </label>
          <label className="sm:w-44">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Status
            </span>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="sm:w-40">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Sort by
            </span>
            <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="Sort results">
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </label>
        </CardBody>
      </Card>

      {/* Leaderboard */}
      <Card className="mt-6">
        <CardHeader
          title="Leaderboard"
          subtitle={`${filtered.length} participant${filtered.length === 1 ? "" : "s"}`}
          icon={<Trophy className="h-5 w-5" />}
        />
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Trophy className="h-7 w-7" />}
                title={allRows.length === 0 ? "No results yet" : "No matching results"}
                description={
                  allRows.length === 0
                    ? "Host a quiz to completion and its standings will be saved here automatically."
                    : "Try clearing the search or changing the filters."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-3 font-medium">Rank</th>
                    <th className="px-5 py-3 font-medium">Participant</th>
                    <th className="px-5 py-3 font-medium">Quiz</th>
                    <th className="px-5 py-3 text-right font-medium">Score</th>
                    <th className="px-5 py-3 text-right font-medium">%</th>
                    <th className="px-5 py-3 text-right font-medium">Correct</th>
                    <th className="px-5 py-3 text-right font-medium">Wrong</th>
                    <th className="px-5 py-3 text-right font-medium">Skipped</th>
                    <th className="px-5 py-3 text-right font-medium">Time</th>
                    <th className="px-5 py-3 text-right font-medium">Finished</th>
                    <th className="px-5 py-3 text-right font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const pct = scorePercent(row);
                    return (
                      <tr
                        key={`${row.runId}:${row.playerId}`}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60"
                      >
                        <td className="px-5 py-3">
                          <RankBadge rank={row.rank} />
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-medium text-ink-900">{row.name}</p>
                          {row.completed ? (
                            <Badge tone="success" className="mt-1">
                              completed
                            </Badge>
                          ) : (
                            <Badge tone="warning" className="mt-1">
                              not finished
                            </Badge>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-gray-700">{row.quizTitle}</p>
                          <p className="mt-0.5 font-mono text-xs text-gray-400">{row.roomCode}</p>
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-gold-600">{row.points}</td>
                        <td className="px-5 py-3 text-right text-gray-700">{pct === null ? "—" : `${pct}%`}</td>
                        <td className="px-5 py-3 text-right text-emerald-600">{row.correct}</td>
                        <td className="px-5 py-3 text-right text-brand-600">{row.incorrect}</td>
                        <td className="px-5 py-3 text-right text-gray-400">{row.unanswered}</td>
                        <td className="px-5 py-3 text-right text-gray-500">{formatTotalTime(row.totalTimeMs)}</td>
                        <td className="px-5 py-3 text-right text-xs text-gray-500">{formatDate(row.finishedAt)}</td>
                        <td className="px-5 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Eye className="h-4 w-4" />}
                            onClick={() => setSelected(row)}
                            aria-label={`View answers of ${row.name}`}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Hardest questions */}
      <Card className="mt-6">
        <CardHeader
          title="Hardest questions"
          subtitle="Most wrong answers across saved runs"
          icon={<Target className="h-5 w-5" />}
        />
        <CardBody>
          {hardest.length === 0 ? (
            <EmptyState
              icon={<Target className="h-7 w-7" />}
              title="No question data yet"
              description="Question-level analysis needs completed runs recorded with the current quiz version."
            />
          ) : (
            <ol className="space-y-3">
              {hardest.map((q, index) => (
                <li
                  key={q.questionId}
                  className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900">{q.text}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {q.wrongCount} of {q.timesAnswered} answered wrong ({q.wrongRate}%)
                    </p>
                  </div>
                  <Badge tone={q.wrongRate >= 50 ? "warning" : "neutral"}>{q.wrongRate}%</Badge>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      {/* Detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        size="lg"
        title={selected ? `${selected.name} — answer review` : "Answer review"}
      >
        {selected ? <AnswerReview row={selected} /> : null}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
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

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gold-100 text-sm font-bold text-gold-700">
        1
      </span>
    );
  }
  return <span className="text-sm font-semibold text-gray-400">#{rank}</span>;
}

function AnswerReview({ row }: { row: QuizResultRow }) {
  const pct = scorePercent(row);

  if (row.questions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone={row.completed ? "success" : "warning"}>
            {row.completed ? "Completed" : "Not finished"}
          </Badge>
          <Badge tone="gold">{row.points} pts</Badge>
          <Badge tone="neutral">
            {row.correct}✓ / {row.incorrect}✗ / {row.unanswered} skipped
          </Badge>
          <Badge tone="neutral">
            <Clock className="h-3 w-3" /> {formatTotalTime(row.totalTimeMs)}
          </Badge>
        </div>
        <EmptyState
          icon={<Eye className="h-6 w-6" />}
          title="No question details for this run"
          description="This run was saved before per-question snapshots were recorded. Scores above are still accurate."
        />
      </div>
    );
  }

  const responseByQuestion = new Map(row.responses.map((r) => [r.questionId, r] as const));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Badge tone={row.completed ? "success" : "warning"}>
          {row.completed ? "Completed" : "Not finished"}
        </Badge>
        <Badge tone="gold">
          {row.points} pts{pct !== null ? ` · ${pct}%` : ""}
        </Badge>
        <Badge tone="neutral">
          <CheckCircle2 className="h-3 w-3" /> {row.correct} correct
        </Badge>
        <Badge tone="neutral">
          <XCircle className="h-3 w-3" /> {row.incorrect} wrong
        </Badge>
        <Badge tone="neutral">
          <Timer className="h-3 w-3" /> {row.unanswered} skipped
        </Badge>
        <Badge tone="neutral">
          <Clock className="h-3 w-3" /> {formatTotalTime(row.totalTimeMs)}
        </Badge>
      </div>

      <ol className="space-y-4">
        {row.questions.map((question, index) => (
          <QuestionReviewCard
            key={question.id}
            index={index}
            question={question}
            response={responseByQuestion.get(question.id) ?? null}
          />
        ))}
      </ol>
    </div>
  );
}

function QuestionReviewCard({
  index,
  question,
  response,
}: {
  index: number;
  question: QuizQuestion;
  response: QuizResponse | null;
}) {
  const verdict = !response ? "skipped" : response.correct ? "correct" : "wrong";
  const tone =
    verdict === "correct"
      ? "border-emerald-200 bg-emerald-50/50"
      : verdict === "wrong"
        ? "border-brand-200 bg-brand-50/40"
        : "border-gray-200 bg-gray-50/60";
  const verdictBadge =
    verdict === "correct" ? (
      <Badge tone="success">
        <CheckCircle2 className="h-3 w-3" /> Correct
      </Badge>
    ) : verdict === "wrong" ? (
      <Badge tone="brand">
        <XCircle className="h-3 w-3" /> Wrong
      </Badge>
    ) : (
      <Badge tone="warning">
        <Timer className="h-3 w-3" /> Skipped
      </Badge>
    );

  return (
    <li className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-ink-900">
          {index + 1}. {question.text || "Untitled question"}
        </p>
        {verdictBadge}
      </div>
      <ul className="mt-3 space-y-1.5">
        {question.answers.map((answer) => {
          const picked = response?.answerId === answer.id;
          const style = answer.correct
            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
            : picked
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-gray-200 bg-white text-gray-500";
          return (
            <li
              key={answer.id}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${style}`}
            >
              <span className="min-w-0 break-words">{answer.text || "—"}</span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
                {answer.correct ? <CheckCircle2 className="h-3.5 w-3.5" aria-label="Correct answer" /> : null}
                {picked ? <span aria-label="Picked">· picked</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {response ? (
        <p className="mt-2 text-xs text-gray-500">
          +{response.points} pts · {formatTotalTime(response.elapsedMs)}
        </p>
      ) : (
        <p className="mt-2 text-xs text-gray-400">No answer recorded.</p>
      )}
    </li>
  );
}
