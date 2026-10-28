import type {
  QuizAnswer,
  QuizHistoryEntry,
  QuizHistoryMap,
  QuizPlayer,
  QuizPlayerScore,
  QuizQuestion,
  QuizResponse,
  QuizRoom,
} from "@/types/quiz";
import { generateRoomCode, uid } from "@/lib/storage";
import { normalizeCode } from "@/lib/voting";

export { normalizeCode } from "@/lib/voting";

export function findQuizByCode(rooms: QuizRoom[], code: string): QuizRoom | undefined {
  const target = code.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (!target) return undefined;
  return rooms.find((r) => r.code.toUpperCase() === target);
}

export function createEmptyAnswer(): QuizAnswer {
  return { id: uid("ans"), text: "", correct: false };
}

export function createEmptyQuestion(): QuizQuestion {
  const answers = [createEmptyAnswer(), createEmptyAnswer(), createEmptyAnswer(), createEmptyAnswer()];
  answers[0].correct = true;
  return {
    id: uid("q"),
    text: "",
    points: 100,
    timeLimitSec: 20,
    speedBonus: true,
    answers,
  };
}

export function createEmptyRoom(): QuizRoom {
  return {
    code: generateRoomCode(),
    title: "",
    description: "",
    questions: [createEmptyQuestion()],
    correctVisibility: "afterEach",
    status: "draft",
    createdAt: Date.now(),
    saveState: "saved",
    savedAt: Date.now(),
  };
}

export interface QuestionValidation {
  ok: boolean;
  error?: string;
}

/** Validate a question before it can be used in a live quiz. */
export function validateQuestion(question: QuizQuestion): QuestionValidation {
  if (!question.text.trim()) return { ok: false, error: "Ein Fragetext ist erforderlich." };
  const filled = question.answers.filter((a) => a.text.trim().length > 0);
  if (filled.length < 2) return { ok: false, error: "Jede Frage benötigt mindestens zwei Antworten." };
  const correct = filled.filter((a) => a.correct);
  if (correct.length !== 1) {
    return { ok: false, error: "Jede Frage muss genau eine richtige Antwort haben." };
  }
  if (question.points <= 0) return { ok: false, error: "Die Punkte müssen eine positive Zahl sein." };
  if (question.timeLimitSec !== null && question.timeLimitSec < 5) {
    return { ok: false, error: "Der Timer muss mindestens 5 Sekunden betragen." };
  }
  return { ok: true };
}

export function validateRoom(room: QuizRoom): QuestionValidation {
  if (!room.title.trim()) return { ok: false, error: "Ein Quiz-Titel ist erforderlich." };
  if (room.questions.length === 0) return { ok: false, error: "Füge mindestens eine Frage hinzu." };
  for (let i = 0; i < room.questions.length; i += 1) {
    const check = validateQuestion(room.questions[i]);
    if (!check.ok) {
      return { ok: false, error: `Frage ${i + 1}: ${check.error}` };
    }
  }
  return { ok: true };
}

/**
 * Maximum speed bonus as a share of a question's base points. A correct answer
 * submitted instantly earns base + 50%; one submitted at the deadline earns the
 * base alone. The 100-point base itself is never reduced.
 */
export const SPEED_BONUS_RATE = 0.5;

/** Maximum points for one question: base points plus the full speed bonus. */
export function maxPointsFor(question: QuizQuestion): number {
  const base = Math.max(0, question.points);
  return base + Math.round(base * SPEED_BONUS_RATE);
}

/**
 * Points for a single answer: the question's base points for a correct answer
 * plus a speed bonus scaled by the time actually left when it is submitted.
 *
 * `elapsedMs` is the participant's own response time, recorded on their
 * device at submission (not when results are inspected). Wrong answers always
 * score 0. Without a timer there is no time pressure, so a correct answer
 * scores the base points alone. The result stays within
 * [base, base + 50%] and never increases as `elapsedMs` grows — faster
 * correct answers always earn at least as much as slower ones.
 */
export function pointsForAnswer(question: QuizQuestion, answerId: string, elapsedMs: number): number {
  const answer = question.answers.find((a) => a.id === answerId);
  if (!answer || !answer.correct) return 0;
  const base = Math.max(0, question.points);
  const limitMs = question.timeLimitSec && question.timeLimitSec > 0 ? question.timeLimitSec * 1000 : null;
  if (limitMs === null) return base;
  const elapsed = Number.isFinite(elapsedMs) ? Math.min(Math.max(0, elapsedMs), limitMs) : limitMs;
  const remaining = limitMs - elapsed;
  return base + Math.round(base * SPEED_BONUS_RATE * (remaining / limitMs));
}

/** Total response time spent on correct answers only (the ranking tiebreaker). */
function correctAnswerTimeMs(responses: QuizResponse[]): number {
  return responses.reduce((sum, r) => (r.correct ? sum + Math.max(0, r.elapsedMs || 0) : sum), 0);
}

/**
 * Rank players: highest total points first; ties break on correct answers,
 * then on total response time across correct answers (faster ranks higher).
 * Players still identical after all tiebreakers share the same rank.
 */
export function computeScores(
  room: QuizRoom,
  players: QuizPlayer[],
  responses: QuizResponse[],
): QuizPlayerScore[] {
  const totalQuestions = room.questions.length;
  const byPlayer = new Map<string, QuizResponse[]>();
  for (const player of players) byPlayer.set(player.id, []);
  for (const response of responses) {
    const list = byPlayer.get(response.playerId);
    if (list) list.push(response);
  }

  const rows = players.map((player) => {
    const list = byPlayer.get(player.id) ?? [];
    const correct = list.filter((r) => r.correct).length;
    const incorrect = list.filter((r) => !r.correct).length;
    const answered = correct + incorrect;
    const unanswered = Math.max(0, totalQuestions - answered);
    const points = list.reduce((sum, r) => sum + r.points, 0);
    const accuracy = answered > 0 ? Math.round((correct / answered) * 1000) / 10 : 0;
    // Total time comes only from valid recorded answer times.
    const totalTimeMs = list.reduce((sum, r) => sum + Math.max(0, r.elapsedMs || 0), 0);
    const correctTimeMs = correctAnswerTimeMs(list);
    const score: QuizPlayerScore = {
      playerId: player.id,
      name: player.name,
      points,
      correct,
      incorrect,
      unanswered,
      accuracy,
      totalTimeMs,
      rank: 0,
    };
    return { score, correctTimeMs };
  });

  rows.sort((a, b) => {
    if (b.score.points !== a.score.points) return b.score.points - a.score.points;
    if (b.score.correct !== a.score.correct) return b.score.correct - a.score.correct;
    if (a.correctTimeMs !== b.correctTimeMs) return a.correctTimeMs - b.correctTimeMs;
    return a.score.name.localeCompare(b.score.name);
  });

  let rank = 0;
  let prevKey = "";
  return rows.map(({ score, correctTimeMs }, index) => {
    const key = `${score.points}|${score.correct}|${correctTimeMs}`;
    if (key !== prevKey) {
      rank = index + 1;
      prevKey = key;
    }
    return { ...score, rank };
  });
}

/** How many completed runs we keep per quiz. */
export const QUIZ_HISTORY_LIMIT = 20;

/** Snapshot a finished run so it can be reviewed after refresh or restart. */
export function buildHistoryEntry(
  room: QuizRoom,
  players: QuizPlayer[],
  responses: QuizResponse[],
  finishedAt: number = Date.now(),
): QuizHistoryEntry {
  return {
    id: uid("run"),
    roomCode: room.code,
    title: room.title || "Untitled quiz",
    finishedAt,
    questionCount: room.questions.length,
    playerCount: players.length,
    players: players.map((p) => ({ ...p })),
    scores: computeScores(room, players, responses),
    responses: responses.map((r) => ({ ...r })),
    // Copy the questions so later edits to the room never rewrite history.
    questions: room.questions.map((q) => ({ ...q, answers: q.answers.map((a) => ({ ...a })) })),
    scoring: "speed",
  };
}

/** Append a run to a quiz's history (newest first), keeping the map separate per quiz code. */
export function addHistoryEntry(map: QuizHistoryMap, entry: QuizHistoryEntry): QuizHistoryMap {
  const existing = Array.isArray(map[entry.roomCode]) ? map[entry.roomCode] : [];
  return {
    ...map,
    [entry.roomCode]: [entry, ...existing].slice(0, QUIZ_HISTORY_LIMIT),
  };
}

/** Remove every saved run for one quiz code. */
export function removeQuizHistory(map: QuizHistoryMap, roomCode: string): QuizHistoryMap {
  if (!(roomCode in map)) return map;
  const next = { ...map };
  delete next[roomCode];
  return next;
}

/** Human-readable duration, e.g. "1m 05s". Returns "—" when no time was recorded. */
export function formatTotalTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/* ------------------------------------------------------------------ */
/* Admin results analysis                                              */
/* ------------------------------------------------------------------ */

/** One leaderboard row: a single participant's result inside one saved run. */
export interface QuizResultRow {
  runId: string;
  roomCode: string;
  quizTitle: string;
  finishedAt: number;
  playerId: string;
  name: string;
  points: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  accuracy: number;
  totalTimeMs: number;
  /** Rank inside the original run (shared ranks for ties, from computeScores). */
  rank: number;
  /** True when the participant reached the end of the quiz. */
  completed: boolean;
  completedAt: number | null;
  questionCount: number;
  /** Question snapshot for this run (empty for legacy history entries). */
  questions: QuizQuestion[];
  /** This participant's recorded responses. */
  responses: QuizResponse[];
  /** Maximum points available for this run (base + speed bonus per question when speed-scored). */
  maxPoints: number;
}

/** Flatten every saved run into one row per participant per run. */
export function flattenQuizResults(history: QuizHistoryMap): QuizResultRow[] {
  const rows: QuizResultRow[] = [];
  for (const runs of Object.values(history)) {
    if (!Array.isArray(runs)) continue;
    for (const run of runs) {
      const questions = Array.isArray(run.questions) ? run.questions : [];
      // Speed-scored runs can reach base points + the speed bonus per question;
      // legacy runs (saved before speed scoring) used the sum of base points.
      const maxPoints =
        run.scoring === "speed"
          ? questions.reduce((sum, q) => sum + maxPointsFor(q), 0)
          : questions.reduce((sum, q) => sum + Math.max(0, q.points || 0), 0);
      const byPlayer = new Map<string, QuizResponse[]>();
      for (const response of run.responses ?? []) {
        const list = byPlayer.get(response.playerId) ?? [];
        list.push(response);
        byPlayer.set(response.playerId, list);
      }
      for (const score of run.scores ?? []) {
        const player = run.players.find((p) => p.id === score.playerId);
        rows.push({
          runId: run.id,
          roomCode: run.roomCode,
          quizTitle: run.title || run.roomCode,
          finishedAt: run.finishedAt,
          playerId: score.playerId,
          name: score.name || player?.name || "Unknown",
          points: score.points,
          correct: score.correct,
          incorrect: score.incorrect,
          unanswered: score.unanswered,
          accuracy: score.accuracy,
          totalTimeMs: score.totalTimeMs,
          rank: score.rank,
          completed:
            typeof player?.completedAt === "number" ||
            score.unanswered === 0 ||
            run.questionCount === score.correct + score.incorrect,
          completedAt: typeof player?.completedAt === "number" ? player.completedAt : null,
          questionCount: run.questionCount,
          questions,
          responses: byPlayer.get(score.playerId) ?? [],
          maxPoints,
        });
      }
    }
  }
  return rows;
}

/** Final score as a percentage of the run's available points; null when unknown. */
export function scorePercent(row: Pick<QuizResultRow, "points" | "maxPoints">): number | null {
  if (!row.maxPoints || row.maxPoints <= 0) return null;
  return Math.round((row.points / row.maxPoints) * 1000) / 10;
}

/**
 * Cross-run leaderboard ordering: points â†’ correct answers â†’ total response
 * time on correct answers (faster first). Ties after all three share a rank.
 */
export function rankQuizResults(rows: QuizResultRow[]): QuizResultRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.correct !== a.correct) return b.correct - a.correct;
    const timeA = correctAnswerTimeMs(a.responses);
    const timeB = correctAnswerTimeMs(b.responses);
    if (timeA !== timeB) return timeA - timeB;
    // Fallback only for display order among fully tied rows: faster first, then name.
    return a.name.localeCompare(b.name);
  });
  let rank = 0;
  let prevKey = "";
  return sorted.map((row, index) => {
    const key = `${row.points}|${row.correct}|${correctAnswerTimeMs(row.responses)}`;
    if (key !== prevKey) {
      rank = index + 1;
      prevKey = key;
    }
    return { ...row, rank };
  });
}

export interface QuizResultsSummary {
  /** One row per participant per run. */
  participants: number;
  completed: number;
  avgScore: number;
  highScore: number;
  /** Percent of all answered questions that were correct. */
  correctRate: number;
}

/** Aggregate statistics across a (usually filtered) set of result rows. */
export function summarizeQuizResults(rows: QuizResultRow[]): QuizResultsSummary {
  if (rows.length === 0) {
    return { participants: 0, completed: 0, avgScore: 0, highScore: 0, correctRate: 0 };
  }
  const points = rows.reduce((sum, r) => sum + r.points, 0);
  const correct = rows.reduce((sum, r) => sum + r.correct, 0);
  const answered = rows.reduce((sum, r) => sum + r.correct + r.incorrect, 0);
  return {
    participants: rows.length,
    completed: rows.filter((r) => r.completed).length,
    avgScore: Math.round(points / rows.length),
    highScore: Math.max(...rows.map((r) => r.points)),
    correctRate: answered > 0 ? Math.round((correct / answered) * 1000) / 10 : 0,
  };
}

export interface QuestionDifficulty {
  questionId: string;
  text: string;
  timesAnswered: number;
  wrongCount: number;
  /** Percent of answered attempts that were wrong. */
  wrongRate: number;
}

/** Hardest questions across the given rows (wrong count desc, then wrong rate). */
export function hardestQuestions(rows: QuizResultRow[], limit = 5): QuestionDifficulty[] {
  const stats = new Map<string, { text: string; timesAnswered: number; wrongCount: number }>();
  for (const row of rows) {
    const byId = new Map(row.questions.map((q) => [q.id, q] as const));
    const seen = new Set<string>();
    for (const response of row.responses) {
      const question = byId.get(response.questionId);
      if (!question || seen.has(response.questionId)) continue;
      seen.add(response.questionId);
      const entry = stats.get(response.questionId) ?? {
        text: question.text || "Unbenannte Frage",
        timesAnswered: 0,
        wrongCount: 0,
      };
      entry.timesAnswered += 1;
      if (!response.correct) entry.wrongCount += 1;
      stats.set(response.questionId, entry);
    }
  }
  return [...stats.entries()]
    .map(([questionId, s]) => ({
      questionId,
      text: s.text,
      timesAnswered: s.timesAnswered,
      wrongCount: s.wrongCount,
      wrongRate: s.timesAnswered > 0 ? Math.round((s.wrongCount / s.timesAnswered) * 1000) / 10 : 0,
    }))
    .filter((q) => q.timesAnswered > 0)
    .sort((a, b) => {
      if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
      if (b.wrongRate !== a.wrongRate) return b.wrongRate - a.wrongRate;
      return a.text.localeCompare(b.text);
    })
    .slice(0, Math.max(0, limit));
}

/* ------------------------------------------------------------------ */
/* Room sharing                                                        */
/* ------------------------------------------------------------------ */

/**
 * Direct join link for one specific room: `<origin>/quiz/join?room=CODE`.
 * The origin is passed in explicitly (normally `window.location.origin`) so
 * the link works on localhost, a classroom LAN and any deployed domain — and
 * so this stays a pure function tests can assert on. `/quiz/join` is a thin
 * route that forwards to the existing `/quiz` join page with the code filled in.
 */
export function buildQuizShareUrl(code: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/quiz/join?room=${encodeURIComponent(normalizeCode(code))}`;
}

/**
 * Direct room link in the exact `<origin>/quiz/room/?code=CODE&host=1` shape.
 * The origin is passed in explicitly (normally `window.location.origin`) so
 * the link works on localhost, a classroom LAN and any deployed domain — and
 * so this stays a pure function tests can assert on. The code is normalized
 * and URL-encoded. Admin sessions open the host controls for that room;
 * everyone else (students) lands on the room's username + join screen.
 */
export function buildRoomShareUrl(code: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/quiz/room/?code=${encodeURIComponent(normalizeCode(code))}&host=1`;
}

/**
 * WhatsApp share URL. Omitting the phone number opens WhatsApp's share
 * picker with the message pre-filled; the message is URL-encoded as required
 * by the wa.me scheme.
 */
export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * True when a shared link's room is missing from a browser that *stores*
 * quiz rooms (`roomsKeyPresent` — the admin's own device, where the room
 * was deleted). Participants' devices never write the quiz-rooms key, so
 * their links never error out here: without local data the app cannot know
 * whether the room exists (it lives on the teacher's device), and the
 * existing "teacher isn't hosting" connection screen covers that case.
 */
export function isSharedRoomMissing(
  code: string,
  roomsKeyPresent: boolean,
  rooms: QuizRoom[],
): boolean {
  if (!code || !roomsKeyPresent) return false;
  return !findQuizByCode(rooms, code);
}
